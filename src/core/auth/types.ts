export const ROLES = ['CANDIDATE', 'PARTNER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'] as const;
export type Role = (typeof ROLES)[number];

/**
 * Corps de `POST /auth/login`. Le back-office se connecte par e-mail et mot
 * de passe — les canaux OTP / lien magique restent réservés au parcours
 * public des candidats et ne sont plus proposés ici.
 */
export interface LoginRequest {
  readonly email: string;
  readonly password: string;
}

export interface TokenPair {
  readonly accessToken: string;
  /** Chaîne opaque de 48 octets — ce n'est PAS un JWT, ne tentez pas de le décoder. */
  readonly refreshToken: string;
  /**
   * ⚠ Le backend renvoie `900` EN DUR, sans le dériver de `JWT_ACCESS_TTL`.
   * Si la durée réelle est modifiée côté serveur, ce champ ment. On ne s'en
   * sert donc pas pour planifier le rafraîchissement : `decodeJwtExpiry()`
   * lit l'échéance dans le jeton lui-même, qui, lui, ne peut pas mentir.
   */
  readonly expiresIn: number;
}

/**
 * Ce que renvoie `GET /auth/me` : la charge utile du JWT recopiée, rien de
 * plus. Pas de nom, pas de téléphone, pas d'avatar — si l'interface en a
 * besoin un jour, il faudra une route dédiée côté backend.
 */
export interface AuthenticatedUser {
  readonly id: string;
  readonly tenantId: string;
  /** `null` pour un compte créé par OTP téléphonique. */
  readonly email: string | null;
  readonly roles: readonly Role[];
  readonly permissions: readonly string[];
  readonly sessionId: string;
}
