import { api } from '@core/http';
import type { AuthenticatedUser, LoginRequest, TokenPair } from './types';

/**
 * Appels bruts aux routes d'authentification. Aucune logique d'état ici :
 * le magasin décide quoi faire des jetons, ce fichier ne fait que parler HTTP.
 */
export const authApi = {
  login(body: LoginRequest): Promise<TokenPair> {
    // `skipAuthRefresh` : un 401 (identifiants invalides) sur une route
    // publique ne doit jamais déclencher la mécanique de rafraîchissement.
    return api.post<TokenPair>('/auth/login', body, { skipAuthRefresh: true });
  },

  /**
   * ⚠ Cette route n'a PAS de DTO validé côté backend (`@Body() dto: { refreshToken: string }`
   * sans classe) : `whitelist` et `forbidNonWhitelisted` ne s'y appliquent pas.
   * Un jeton manquant n'y produit donc pas un 400 lisible mais une erreur en
   * aval. On envoie toujours la clé, même vide, et on traite l'échec comme une
   * session morte.
   *
   * `skipAuthRefresh` est ici VITAL : sans lui, un échec de rafraîchissement
   * relancerait un rafraîchissement, à l'infini.
   */
  refresh(refreshToken: string): Promise<TokenPair> {
    return api.post<TokenPair>('/auth/refresh', { refreshToken }, { skipAuthRefresh: true });
  },

  /** Répond `204 No Content` : pas de corps, donc pas d'enveloppe à déballer. */
  logout(): Promise<void> {
    return api.postVoid('/auth/logout', undefined, { skipAuthRefresh: true });
  },

  me(): Promise<AuthenticatedUser> {
    return api.get<AuthenticatedUser>('/auth/me');
  },
};
