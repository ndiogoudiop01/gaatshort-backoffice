import { isErrorEnvelope } from './envelope';

/**
 * Catalogue d'erreurs du backend (`src/shared/kernel/errors/error-catalog.ts`),
 * recopié ici parce que c'est un CONTRAT : ces chaînes servent de clés de
 * traduction et d'aiguillage. Un code inconnu n'est pas une anomalie — un
 * `BusinessRuleViolationError` peut en porter un hors catalogue (par exemple
 * `ACCOUNT_SUSPENDED`, émis par le service d'authentification) — d'où le
 * `(string & {})` qui garde l'autocomplétion sans fermer le type.
 */
export const API_ERROR_CODES = [
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'TOKEN_EXPIRED',
  'CHALLENGE_INVALID',
  'CHALLENGE_EXPIRED',
  'CHALLENGE_LOCKED',
  'CHALLENGE_ALREADY_USED',
  'INVALID_CREDENTIALS',
  'SESSION_REVOKED',
  'FORBIDDEN_ACTION',
  'RESOURCE_NOT_FOUND',
  'TENANT_NOT_RESOLVED',
  'TENANT_SUSPENDED',
  'TENANT_MISMATCH',
  'INVALID_STATE_TRANSITION',
  'CONCURRENCY_CONFLICT',
  'DUPLICATE_RESOURCE',
  'IDEMPOTENCY_IN_PROGRESS',
  'IDEMPOTENCY_PAYLOAD_MISMATCH',
  'RATE_LIMIT_EXCEEDED',
  'FILE_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'MALWARE_DETECTED',
  'CONSENT_REQUIRED',
  'UPSTREAM_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;

export type KnownApiErrorCode = (typeof API_ERROR_CODES)[number];
export type ApiErrorCode = KnownApiErrorCode | (string & {});

/** Codes pour lesquels la session est morte : seule la reconnexion aide. */
const SESSION_DEAD_CODES: ReadonlySet<string> = new Set([
  'UNAUTHENTICATED',
  'TOKEN_EXPIRED',
  'SESSION_REVOKED',
]);

/**
 * Erreur normalisée. Tout ce qui sort du client HTTP en échec est une
 * `ApiError` — y compris une panne réseau ou un délai dépassé, qui reçoivent
 * un code synthétique. Le reste de l'application n'a donc jamais à distinguer
 * « le serveur a répondu 422 » de « le serveur n'a pas répondu » : les deux
 * s'affichent, se journalisent et se testent de la même façon.
 */
export class ApiError extends Error {
  public readonly code: ApiErrorCode;
  public readonly status: number;
  public readonly details?: Record<string, unknown>;
  public readonly requestId: string | null;

  constructor(params: {
    code: ApiErrorCode;
    message: string;
    status: number;
    details?: Record<string, unknown>;
    requestId?: string | null;
  }) {
    super(params.message);
    this.name = 'ApiError';
    this.code = params.code;
    this.status = params.status;
    this.details = params.details;
    this.requestId = params.requestId ?? null;
  }

  /**
   * Messages de `class-validator`, quand le backend a refusé le corps.
   *
   * Ils vivent dans `error.details.issues` et NON dans `error.message`, qui
   * vaut alors la chaîne fixe « Requête invalide ». Ce sont des phrases
   * libres, non contractuelles : on les affiche, on ne les analyse pas.
   */
  public get validationIssues(): readonly string[] {
    const issues = this.details?.['issues'];
    return Array.isArray(issues) ? issues.filter((i): i is string => typeof i === 'string') : [];
  }

  /** La session ne peut pas être réparée par un rafraîchissement. */
  public get isSessionDead(): boolean {
    return SESSION_DEAD_CODES.has(this.code);
  }

  /**
   * Un 404 signifie « n'existe pas » OU « appartient à un autre tenant » : le
   * backend les rend indistinguables À DESSEIN (une 403 confirmerait
   * l'existence de la ressource). Ne cherchez pas à les séparer côté front,
   * et n'écrivez pas de message qui suppose l'un des deux.
   */
  public get isNotFoundOrForeignTenant(): boolean {
    return this.status === 404;
  }
}

const NETWORK_MESSAGE = "L'API est injoignable.";

/**
 * Traduit n'importe quel rejet axios en `ApiError`.
 *
 * L'ordre compte : on privilégie TOUJOURS le corps enveloppé du backend, qui
 * porte le vrai code métier, avant de se rabattre sur le statut HTTP.
 */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  const axiosLike = error as {
    response?: { status?: number; data?: unknown };
    code?: string;
    message?: string;
  };

  const body = axiosLike.response?.data;
  if (isErrorEnvelope(body)) {
    return new ApiError({
      code: body.error.code,
      message: body.error.message,
      status: axiosLike.response?.status ?? 0,
      details: body.error.details,
      requestId: body.requestId,
    });
  }

  // Pas de réponse du tout : réseau coupé, DNS, CORS, délai dépassé.
  if (!axiosLike.response) {
    const timedOut = axiosLike.code === 'ECONNABORTED' || axiosLike.code === 'ETIMEDOUT';
    return new ApiError({
      code: timedOut ? 'NETWORK_TIMEOUT' : 'NETWORK_UNAVAILABLE',
      message: axiosLike.message ?? NETWORK_MESSAGE,
      status: 0,
    });
  }

  // Réponse non enveloppée : passerelle, proxy, page d'erreur nginx.
  return new ApiError({
    code: 'UPSTREAM_UNAVAILABLE',
    message: axiosLike.message ?? 'Réponse inattendue du serveur.',
    status: axiosLike.response.status ?? 0,
  });
}
