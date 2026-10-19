/**
 * Couture entre le client HTTP et la session.
 *
 * Le client a besoin du jeton d'accès et doit pouvoir demander un
 * rafraîchissement ; le magasin d'authentification a besoin du client pour
 * appeler l'API. Importer l'un depuis l'autre crée un cycle — et, plus
 * insidieux, un ordre d'initialisation qui dépend de l'ordre des imports.
 *
 * On casse le cycle par une inversion : le magasin ENREGISTRE ses fonctions
 * ici au moment de sa création, le client les CONSOMME. Aucun des deux
 * fichiers n'importe l'autre.
 */

export interface SessionPort {
  /** `null` tant que personne n'est connecté. */
  getAccessToken(): string | null;
  /** Échange le jeton de rafraîchissement. Rejette si la session est morte. */
  refresh(): Promise<void>;
  /** Appelé quand la session est définitivement perdue (purge + redirection). */
  onSessionLost(): void;
}

let port: SessionPort | null = null;

export function setSessionPort(next: SessionPort): void {
  port = next;
}

export function getSessionPort(): SessionPort | null {
  return port;
}

/** Réservé aux tests : remet la couture à zéro entre deux cas. */
export function resetSessionPort(): void {
  port = null;
}
