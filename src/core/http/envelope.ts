/**
 * Enveloppe de réponse de l'API.
 *
 * Le backend enveloppe TOUT via un intercepteur global
 * (`response-envelope.interceptor.ts`). Aucune route n'y échappe aujourd'hui :
 * le décorateur `@RawResponse()` existe mais n'est posé nulle part. On peut
 * donc déballer sans condition — et c'est ce que fait `client.ts`, pour que
 * le reste de l'application ne voie jamais cette structure.
 */

export interface OffsetMeta {
  readonly total: number;
  readonly page: number;
  readonly perPage: number;
  readonly totalPages: number;
  readonly hasMore: boolean;
}

export interface CursorMeta {
  /** `null` quand il n'y a plus rien à charger. */
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

/**
 * Les deux formes s'excluent : en mode offset, `nextCursor` est ABSENT (pas
 * `null`) ; en mode curseur, `total`/`page`/`perPage`/`totalPages` sont
 * absents. D'où l'union plutôt qu'un type unique aux champs optionnels — le
 * compilateur force alors à choisir un mode avant de lire un champ.
 */
export type PaginationMeta = OffsetMeta | CursorMeta;

export const isOffsetMeta = (meta: PaginationMeta): meta is OffsetMeta =>
  typeof (meta as OffsetMeta).total === 'number';

/**
 * Garde du mode curseur (BSG-10). On vérifie la FORME, pas la valeur :
 * `nextCursor` est opaque — une chaîne ou `null`, rien de plus à en dire.
 */
export const isCursorMeta = (meta: unknown): meta is CursorMeta => {
  if (typeof meta !== 'object' || meta === null) return false;
  const { nextCursor, hasMore } = meta as Partial<CursorMeta>;
  return (
    typeof hasMore === 'boolean' &&
    (nextCursor === null || typeof nextCursor === 'string') &&
    !('total' in meta)
  );
};

export interface ApiSuccessEnvelope<T> {
  readonly success: true;
  readonly data: T;
  readonly meta?: PaginationMeta;
  /** Peut valoir `null` : le backend renvoie `request.id ?? null`. */
  readonly requestId: string | null;
  readonly timestamp: string;
}

export interface ApiErrorEnvelope {
  readonly success: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    /** Absent (et non `null`) quand il n'y a rien à dire. */
    readonly details?: Record<string, unknown>;
  };
  readonly requestId: string | null;
  readonly timestamp: string;
}

export type ApiEnvelope<T> = ApiSuccessEnvelope<T> | ApiErrorEnvelope;

/** Résultat paginé, tel que le reste de l'application le manipule. */
export interface Paginated<T> {
  readonly items: readonly T[];
  readonly meta: PaginationMeta;
}

/** Page d'une liste paginée par curseur : pas de total, par construction. */
export interface CursorPage<T> {
  readonly items: readonly T[];
  readonly meta: CursorMeta;
}

export function isApiEnvelope(body: unknown): body is ApiEnvelope<unknown> {
  return (
    typeof body === 'object' &&
    body !== null &&
    'success' in body &&
    typeof (body as { success: unknown }).success === 'boolean'
  );
}

/**
 * On exige `error.code`, pas seulement `success: false`.
 *
 * `toApiError()` lit `body.error.code` juste après cette vérification : une
 * enveloppe d'erreur tronquée — proxy qui réécrit le corps, réponse partielle —
 * produirait alors `code: undefined`, donc une clé de traduction
 * `errors.codes.undefined` et un message vide. Mieux vaut la traiter pour ce
 * qu'elle est : une réponse qu'on ne sait pas lire.
 */
export function isErrorEnvelope(body: unknown): body is ApiErrorEnvelope {
  if (!isApiEnvelope(body) || body.success !== false) return false;

  const { error } = body as ApiErrorEnvelope;
  return typeof error === 'object' && error !== null && typeof error.code === 'string';
}
