import { computed, reactive, ref, watch } from 'vue';
import type { LocationQuery, LocationQueryRaw, Router } from 'vue-router';
import { api, toApiError, type CursorPage } from '@core/http';
import { config } from '@core/config';

/** Clé du curseur dans l'adresse. */
export const CURSOR_QUERY_KEY = 'cursor';

/**
 * Liste paginée par CURSEUR côté serveur — le pendant de `useOffsetQuery`.
 *
 * Une route « curseur » répond `meta { nextCursor, hasMore }` : il n'y a
 * NI total, NI numéro de page. Ce composable n'en invente donc pas, et
 * l'écran qui l'utilise non plus : il affiche « charger la suite », pas une
 * pagination. Recomposer un total en enchaînant les pages est un
 * anti-pattern — on paierait N requêtes pour un chiffre déjà faux à la
 * prochaine publication.
 *
 * Trois règles sur le curseur :
 *  • il est OPAQUE : jamais décodé, construit ni comparé — on renvoie tel
 *    quel celui que le serveur a donné ;
 *  • il ne se stocke pas durablement : il vit dans l'adresse (partage,
 *    rechargement), jamais en `localStorage` ;
 *  • il peut être périmé ou illisible au rechargement. On retombe alors
 *    PROPREMENT sur la première page (`cursorReset` passe à `true`) au lieu
 *    d'afficher une erreur.
 *
 * État dans l'URL (si `router` est fourni) : les filtres déclarés et le
 * curseur de la dernière page chargée, écrits en `replace` — l'historique ne
 * se remplit pas d'une entrée par clic sur « charger la suite ».
 *
 * Chaque filtre doit être DÉCLARÉ dans `filters`, même vide : c'est sa
 * valeur initiale qui dit s'il se relit comme une liste (`[]`) ou comme une
 * chaîne.
 */
export function useCursorQuery<TItem, TFilters extends Record<string, unknown>>(options: {
  url: string;
  filters: TFilters;
  /** Taille de page, plafonnée à 100 comme côté backend. */
  limit?: number;
  router?: Router;
  immediate?: boolean;
}) {
  const limit = Math.min(Math.max(options.limit ?? config.ui.defaultPageSize, 1), 100);
  const filterKeys = Object.keys(options.filters);
  const initialQuery = options.router?.currentRoute.value.query ?? {};

  const items = ref<TItem[]>([]) as { value: TItem[] };
  const loading = ref(false);
  const loadingMore = ref(false);
  const error = ref<unknown>(null);
  const loadMoreError = ref<unknown>(null);
  const hasMore = ref(false);
  /** Le curseur à renvoyer pour la page suivante — opaque, jamais lu. */
  const nextCursor = ref<string | null>(null);
  /** Curseur de départ de la liste affichée (`undefined` = première page). */
  const startCursor = ref<string | undefined>(readString(initialQuery[CURSOR_QUERY_KEY]));
  /** Un curseur périmé a été écarté : l'écran peut le signaler discrètement. */
  const cursorReset = ref(false);

  const filters = reactive(readFilters(options.filters, initialQuery)) as TFilters;

  /** La liste ne commence pas au début : un « revenir au début » a du sens. */
  const resumed = computed(() => startCursor.value !== undefined);
  const isEmpty = computed(() => !loading.value && !error.value && items.value.length === 0);

  /**
   * Jeton de requête : un filtre modifié pendant un chargement lance une
   * nouvelle requête ; la réponse de l'ancienne, arrivée après, est ignorée.
   */
  let generation = 0;

  function buildParams(cursor: string | undefined): Record<string, unknown> {
    const params: Record<string, unknown> = { limit };
    if (cursor) params[CURSOR_QUERY_KEY] = cursor;
    for (const [key, value] of Object.entries(filters)) {
      if (isBlank(value)) continue;
      params[key] = value;
    }
    return params;
  }

  function request(cursor: string | undefined): Promise<CursorPage<TItem>> {
    return api.getCursorPage<TItem>(options.url, { params: buildParams(cursor) });
  }

  /** (Re)charge la liste depuis `startCursor` — la première page s'il est absent. */
  async function fetch(): Promise<void> {
    const token = ++generation;
    loading.value = true;
    error.value = null;
    loadMoreError.value = null;
    try {
      let page: CursorPage<TItem>;
      try {
        page = await request(startCursor.value);
      } catch (caught) {
        if (!startCursor.value || !isStaleCursorError(caught)) throw caught;
        page = await restartFromFirstPage();
      }
      // Un curseur de départ qui ne mène à rien est traité comme périmé.
      if (startCursor.value && page.items.length === 0 && !page.meta.hasMore) {
        page = await restartFromFirstPage();
      }
      if (token !== generation) return;
      items.value = [...page.items];
      applyMeta(page);
    } catch (caught) {
      if (token !== generation) return;
      error.value = caught;
      items.value = [];
      applyMeta(null);
      throw caught;
    } finally {
      if (token === generation) loading.value = false;
    }
  }

  async function restartFromFirstPage(): Promise<CursorPage<TItem>> {
    startCursor.value = undefined;
    cursorReset.value = true;
    await syncUrl();
    return request(undefined);
  }

  /** Charge la page suivante et l'ajoute à la liste. Sans effet s'il n'y en a pas. */
  async function loadMore(): Promise<void> {
    const cursor = nextCursor.value;
    if (!cursor || !hasMore.value || loading.value || loadingMore.value) return;
    const token = generation;
    loadingMore.value = true;
    loadMoreError.value = null;
    try {
      const page = await request(cursor);
      if (token !== generation) return;
      items.value = [...items.value, ...page.items];
      applyMeta(page);
      // L'adresse retient le DÉBUT de la dernière page chargée : un
      // rechargement reprend là, sans rejouer toutes les pages précédentes.
      startCursor.value = cursor;
      await syncUrl();
    } catch (caught) {
      if (token !== generation) return;
      loadMoreError.value = caught;
      throw caught;
    } finally {
      if (token === generation) loadingMore.value = false;
    }
  }

  /** Repart du début de la liste (bouton « revenir au début », actualiser). */
  async function reset(): Promise<void> {
    startCursor.value = undefined;
    cursorReset.value = false;
    await syncUrl();
    await fetch();
  }

  function applyMeta(page: CursorPage<TItem> | null): void {
    nextCursor.value = page?.meta.nextCursor ?? null;
    hasMore.value = !!page?.meta.hasMore && page.meta.nextCursor !== null;
  }

  async function syncUrl(): Promise<void> {
    const router = options.router;
    if (!router) return;
    const current = router.currentRoute.value;
    const query: LocationQueryRaw = { ...current.query };
    for (const key of [...filterKeys, CURSOR_QUERY_KEY]) delete query[key];
    for (const key of filterKeys) {
      const value = filters[key];
      if (!isBlank(value)) query[key] = Array.isArray(value) ? value.map(String) : String(value);
    }
    if (startCursor.value) query[CURSOR_QUERY_KEY] = startCursor.value;
    await router.replace({ query }).catch(() => undefined);
  }

  /** Un filtre modifié repart de la PREMIÈRE page : l'ancien curseur ne vaut plus rien. */
  watch(
    () => JSON.stringify(filters),
    () => {
      startCursor.value = undefined;
      cursorReset.value = false;
      void syncUrl();
      void fetch().catch(() => undefined);
    },
  );

  if (options.immediate !== false) void fetch().catch(() => undefined);

  return {
    items,
    filters,
    loading,
    loadingMore,
    error,
    loadMoreError,
    hasMore,
    resumed,
    cursorReset,
    isEmpty,
    fetch,
    loadMore,
    reset,
  };
}

/**
 * Curseur refusé par le serveur : 400 (validation), 404, 410 ou 422
 * (`CURSOR_INVALID`). Une panne réseau ou une 500, elles, restent des erreurs :
 * repartir de zéro masquerait un vrai problème.
 */
function isStaleCursorError(error: unknown): boolean {
  return [400, 404, 410, 422].includes(toApiError(error).status);
}

function isBlank(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

function readString(value: LocationQuery[string] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first ? first : undefined;
}

function readFilters<TFilters extends Record<string, unknown>>(
  initial: TFilters,
  query: LocationQuery,
): TFilters {
  const result: Record<string, unknown> = { ...initial };
  for (const [key, fallback] of Object.entries(initial)) {
    const raw = query[key];
    if (raw === undefined) continue;
    if (Array.isArray(fallback)) {
      result[key] = (Array.isArray(raw) ? raw : [raw]).filter((v): v is string => !!v);
    } else {
      result[key] = readString(raw) ?? fallback;
    }
  }
  return result as TFilters;
}
