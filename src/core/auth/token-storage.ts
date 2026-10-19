/**
 * Où vivent les jetons.
 *
 *  • Jeton d'ACCÈS : en mémoire uniquement. Il vit 15 minutes ; le perdre au
 *    rechargement de l'onglet ne coûte qu'un rafraîchissement silencieux.
 *  • Jeton de RAFRAÎCHISSEMENT : `localStorage`. C'est un compromis assumé,
 *    documenté dans `docs/adr/0003-stockage-des-jetons.md`.
 *
 * Pourquoi pas un cookie `HttpOnly`, qui serait à l'abri d'un XSS ? Parce que
 * le backend n'en pose aucun : `/auth/verify` renvoie les jetons dans le corps
 * de la réponse et `JwtStrategy` ne lit que l'en-tête `Authorization`. Les
 * mettre en cookie demanderait un changement côté API — c'est la bonne
 * direction, et l'ADR la note comme suite à donner.
 *
 * La conséquence à connaître : en cas de XSS, le jeton de rafraîchissement est
 * lisible. Ce qui limite les dégâts, c'est la rotation côté backend — rejouer
 * un jeton déjà utilisé révoque TOUTE la famille, donc un vol se solde par une
 * déconnexion visible plutôt qu'un accès durable et discret.
 */

const REFRESH_TOKEN_KEY = 'ig.bo.refreshToken';

/** En mémoire : jamais écrit sur le disque, jamais lisible par un autre onglet. */
let accessToken: string | null = null;

export const tokenStorage = {
  getAccessToken(): string | null {
    return accessToken;
  },

  setAccessToken(token: string | null): void {
    accessToken = token;
  },

  getRefreshToken(): string | null {
    try {
      return localStorage.getItem(REFRESH_TOKEN_KEY);
    } catch {
      // Navigation privée, stockage désactivé, quota plein : on dégrade en
      // session non persistante plutôt que de faire planter le démarrage.
      return null;
    }
  },

  setRefreshToken(token: string | null): void {
    try {
      if (token === null) localStorage.removeItem(REFRESH_TOKEN_KEY);
      else localStorage.setItem(REFRESH_TOKEN_KEY, token);
    } catch {
      /* même raisonnement : l'échec de stockage ne doit pas casser la session courante */
    }
  },

  clear(): void {
    accessToken = null;
    this.setRefreshToken(null);
  },
};

/**
 * Lit l'échéance réelle du jeton d'accès, en millisecondes epoch.
 *
 * On ne fait PAS confiance à `expiresIn` renvoyé par l'API : il est codé en
 * dur à 900 côté backend et ne suit pas `JWT_ACCESS_TTL`. La revendication
 * `exp` du jeton, elle, est celle que le serveur vérifiera vraiment.
 *
 * Décodage sans vérification de signature — c'est volontaire et sans risque :
 * le front ne fait qu'y lire une date pour planifier un rafraîchissement.
 * C'est le backend qui valide la signature, à chaque requête.
 */
export function decodeJwtExpiry(token: string): number | null {
  const payload = token.split('.')[1];
  if (payload === undefined) return null;

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(normalized)) as { exp?: unknown };
    return typeof decoded.exp === 'number' ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
}
