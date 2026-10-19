import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import { config } from '@core/config';
import { ApiError, toApiError } from './api-error';
import {
  isApiEnvelope,
  isCursorMeta,
  type ApiSuccessEnvelope,
  type CursorPage,
  type Paginated,
  type PaginationMeta,
} from './envelope';
import { getSessionPort } from './session-port';

/** Marqueurs internes posés sur la configuration d'une requête. */
interface RequestFlags {
  /** Cette requête ne doit jamais déclencher de rafraîchissement (évite la boucle). */
  skipAuthRefresh?: boolean;
  /** Une tentative de rejeu après rafraîchissement a déjà eu lieu. */
  retried?: boolean;
}

type Config = InternalAxiosRequestConfig & RequestFlags;

export const rawClient: AxiosInstance = axios.create({
  baseURL: config.api.baseUrl,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
  /**
   * Tableaux en forme RÉPÉTÉE : `?tiers=A&tiers=B`.
   *
   * Par défaut, axios écrit `?tiers[]=A&tiers[]=B`. Or le backend tourne sur
   * Express 5, dont l'analyseur de query par défaut (« simple ») ne connaît
   * pas les crochets : il livre une clé nommée littéralement `tiers[]`. Selon
   * la configuration du `ValidationPipe`, cela donne un 400 — ou, si
   * `forbidNonWhitelisted` venait à être retiré, un filtre IGNORÉ en silence :
   * une liste ou un export non filtré qui a l'air correct (cf.
   * `docs/tickets/BSG-3-vivier-recherche-export.md`).
   */
  paramsSerializer: { indexes: null },
});

// ──────────────────────────── Requête ────────────────────────────

rawClient.interceptors.request.use((request: Config) => {
  const session = getSessionPort();
  const token = session?.getAccessToken() ?? null;

  if (token) {
    request.headers.set('Authorization', `Bearer ${token}`);
  }

  /**
   * `x-tenant-id` n'est envoyé QUE tant que personne n'est authentifié.
   *
   * Ce n'est pas une optimisation : le backend compare la revendication `tid`
   * du jeton au tenant résolu par l'en-tête, refuse la requête en cas de
   * divergence et journalise une tentative d'intrusion. Une fois connecté, le
   * jeton fait autorité — l'en-tête ne peut que nuire.
   *
   * En production il n'est de toute façon pas défini : le sous-domaine suffit.
   * Il n'existe que pour `localhost`, où le résolveur par sous-domaine rend
   * `null` à dessein (un hôte sans point n'est pas un sous-domaine).
   */
  if (!token && config.tenancy.devSlug) {
    request.headers.set(config.tenancy.headerName, config.tenancy.devSlug);
  }

  return request;
});

// ──────────────────────────── Réponse ────────────────────────────

/**
 * Rafraîchissement en vol unique.
 *
 * Un écran de back-office déclenche volontiers quatre requêtes en parallèle au
 * montage. Si le jeton vient d'expirer, les quatre reçoivent un 401 en même
 * temps. Sans cette promesse partagée, les quatre appelleraient `/auth/refresh`
 * — et comme le backend fait tourner la famille de jetons à chaque appel et
 * RÉVOQUE TOUTE LA FAMILLE quand un jeton déjà utilisé est représenté, les
 * trois requêtes en retard déconnecteraient l'utilisateur. La rotation est une
 * protection contre le rejeu ; en concurrence, elle se retourne contre nous si
 * on ne sérialise pas.
 */
let refreshInFlight: Promise<void> | null = null;

function refreshOnce(session: NonNullable<ReturnType<typeof getSessionPort>>): Promise<void> {
  refreshInFlight ??= session.refresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

rawClient.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    const apiError = toApiError(error);
    const request = (error as { config?: Config }).config;
    const session = getSessionPort();

    const canRetry =
      request !== undefined &&
      session !== null &&
      apiError.status === 401 &&
      !request.skipAuthRefresh &&
      !request.retried &&
      // `SESSION_REVOKED` veut dire que la famille entière est morte : un
      // rafraîchissement ne peut que confirmer l'échec.
      apiError.code !== 'SESSION_REVOKED';

    if (!canRetry) {
      if (apiError.isSessionDead) session?.onSessionLost();
      return Promise.reject(apiError);
    }

    try {
      await refreshOnce(session);
    } catch {
      session.onSessionLost();
      return Promise.reject(apiError);
    }

    request.retried = true;
    return rawClient.request(request);
  },
);

// ──────────────────────── Surface publique ───────────────────────

/**
 * Déballe l'enveloppe. Le reste de l'application ne voit jamais
 * `{ success, data, meta, requestId }` — seulement la charge utile.
 */
function unwrap<T>(body: unknown): T {
  if (!isApiEnvelope(body)) {
    // Ne devrait pas arriver : l'intercepteur backend est global et aucune
    // route ne porte `@RawResponse()`. Si cela se produit, c'est qu'une
    // réponse ne vient pas de l'API (proxy, page d'erreur) — on le dit.
    throw new ApiError({
      code: 'UPSTREAM_UNAVAILABLE',
      message: "Réponse hors enveloppe : elle ne vient probablement pas de l'API.",
      status: 0,
    });
  }
  if (!body.success) throw toApiError({ response: { status: 0, data: body } });
  return (body as ApiSuccessEnvelope<T>).data;
}

export interface RequestOptions extends AxiosRequestConfig {
  skipAuthRefresh?: boolean;
}

export const api = {
  async get<T>(url: string, options?: RequestOptions): Promise<T> {
    const response = await rawClient.get(url, options);
    return unwrap<T>(response.data);
  },

  async post<T>(url: string, body?: unknown, options?: RequestOptions): Promise<T> {
    const response = await rawClient.post(url, body, options);
    return unwrap<T>(response.data);
  },

  async put<T>(url: string, body?: unknown, options?: RequestOptions): Promise<T> {
    const response = await rawClient.put(url, body, options);
    return unwrap<T>(response.data);
  },

  async patch<T>(url: string, body?: unknown, options?: RequestOptions): Promise<T> {
    const response = await rawClient.patch(url, body, options);
    return unwrap<T>(response.data);
  },

  async delete<T>(url: string, options?: RequestOptions): Promise<T> {
    const response = await rawClient.delete(url, options);
    return unwrap<T>(response.data);
  },

  /**
   * Pour les routes qui répondent `204 No Content` — `POST /auth/logout` est
   * la seule aujourd'hui. Un 204 n'a pas de corps, donc pas d'enveloppe :
   * `post()` échouerait en tentant de déballer une chaîne vide.
   */
  async postVoid(url: string, body?: unknown, options?: RequestOptions): Promise<void> {
    await rawClient.post(url, body, options);
  },

  /**
   * Variante paginée : `meta` vit à CÔTÉ de `data` dans l'enveloppe, pas
   * dedans. `get()` le perdrait — d'où cette seconde porte plutôt qu'un
   * paramètre optionnel qui obligerait à deviner le type de retour.
   */
  async getPaginated<T>(url: string, options?: RequestOptions): Promise<Paginated<T>> {
    const response = await rawClient.get(url, options);
    const body = response.data;
    const items = unwrap<T[]>(body);
    const meta = (body as { meta?: PaginationMeta }).meta;

    if (!meta) {
      throw new ApiError({
        code: 'UPSTREAM_UNAVAILABLE',
        message: `Réponse sans métadonnées de pagination : ${url}`,
        status: response.status,
      });
    }

    return { items, meta };
  },

  /**
   * Variante CURSEUR (BSG-10) — `GET /admin/news` est aujourd'hui la seule
   * route concernée. `getPaginated()` rendrait l'union `OffsetMeta |
   * CursorMeta` et laisserait chaque appelant la trancher ; ici, une réponse
   * qui n'a pas la forme `{ nextCursor, hasMore }` est refusée à la porte.
   * Le curseur n'est ni lu ni transformé : il est opaque.
   */
  async getCursorPage<T>(url: string, options?: RequestOptions): Promise<CursorPage<T>> {
    const response = await rawClient.get(url, options);
    const body = response.data;
    const items = unwrap<T[]>(body);
    const meta = (body as { meta?: unknown }).meta;

    if (!isCursorMeta(meta)) {
      throw new ApiError({
        code: 'UPSTREAM_UNAVAILABLE',
        message: `Réponse sans métadonnées de curseur : ${url}`,
        status: response.status,
      });
    }

    return { items, meta };
  },
};

/**
 * Réservé aux tests : le rafraîchissement en vol est un état de module, il
 * survivrait d'un cas à l'autre.
 */
export function __resetRefreshState(): void {
  refreshInFlight = null;
}
