import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import { ApiError, setSessionPort } from '@core/http';
import { authApi } from './auth.api';
import { decodeJwtExpiry, tokenStorage } from './token-storage';
import type { AuthenticatedUser, LoginRequest, TokenPair } from './types';

/**
 * Marge avant expiration : on rafraîchit un peu en avance plutôt que d'attendre
 * le 401. Cela évite qu'une action de l'utilisateur (soumettre un formulaire)
 * soit celle qui paie le coût du rafraîchissement.
 */
const REFRESH_MARGIN_MS = 60_000;

export const useAuthStore = defineStore('auth', () => {
  const user = shallowRef<AuthenticatedUser | null>(null);
  const accessExpiresAt = ref<number | null>(null);
  const bootstrapped = ref(false);

  const isAuthenticated = computed(() => user.value !== null);

  /**
   * Les rôles et permissions sont FIGÉS à l'émission du jeton : le backend les
   * recopie dans la charge utile JWT. Un changement de rôle en base ne devient
   * visible qu'après un rafraîchissement. À dire à l'utilisateur plutôt qu'à
   * masquer : « reconnectez-vous pour que vos nouveaux droits s'appliquent ».
   */
  const permissions = computed<ReadonlySet<string>>(() => new Set(user.value?.permissions ?? []));
  const roles = computed<ReadonlySet<string>>(() => new Set(user.value?.roles ?? []));

  function applyTokens(pair: TokenPair): void {
    tokenStorage.setAccessToken(pair.accessToken);
    tokenStorage.setRefreshToken(pair.refreshToken);
    // On lit l'échéance DANS le jeton : `pair.expiresIn` vaut 900 en dur.
    accessExpiresAt.value = decodeJwtExpiry(pair.accessToken);
  }

  function clearSession(): void {
    tokenStorage.clear();
    user.value = null;
    accessExpiresAt.value = null;
  }

  // ──────────────────────────── Actions ───────────────────────────

  async function login(body: LoginRequest): Promise<void> {
    applyTokens(await authApi.login(body));
    user.value = await authApi.me();
  }

  /**
   * Échange le jeton de rafraîchissement. Rejette — c'est le contrat attendu
   * par le client HTTP, qui distingue « rafraîchi » de « session morte ».
   */
  async function refresh(): Promise<void> {
    const refreshToken = tokenStorage.getRefreshToken();
    if (!refreshToken)
      throw new ApiError({ code: 'SESSION_REVOKED', message: 'Aucune session.', status: 401 });

    applyTokens(await authApi.refresh(refreshToken));
    user.value ??= await authApi.me();
  }

  async function logout(): Promise<void> {
    try {
      if (tokenStorage.getAccessToken()) await authApi.logout();
    } catch {
      // Une déconnexion qui échoue côté serveur ne doit pas empêcher la
      // déconnexion côté client : l'utilisateur a demandé à partir.
    } finally {
      clearSession();
    }
  }

  /**
   * Restaure la session au démarrage de l'application.
   *
   * Appelé une seule fois, avant le premier rendu du routeur : sans cela, le
   * garde de route verrait `isAuthenticated === false` sur un rechargement de
   * page et renverrait vers l'écran de connexion un utilisateur pourtant
   * légitime. `bootstrapped` garantit l'idempotence.
   */
  async function bootstrap(): Promise<void> {
    if (bootstrapped.value) return;
    bootstrapped.value = true;

    if (!tokenStorage.getRefreshToken()) return;

    try {
      await refresh();
    } catch {
      clearSession();
    }
  }

  /** Le jeton d'accès arrive-t-il à échéance (ou est-il déjà expiré) ? */
  function needsRefreshSoon(now = Date.now()): boolean {
    if (accessExpiresAt.value === null) return false;
    return accessExpiresAt.value - now <= REFRESH_MARGIN_MS;
  }

  /**
   * Enregistrement de la couture consommée par le client HTTP. Fait à la
   * création du magasin, donc avant toute requête — Pinia instancie un
   * magasin à son premier usage, et le premier usage précède forcément le
   * premier appel d'API.
   */
  setSessionPort({
    getAccessToken: () => tokenStorage.getAccessToken(),
    refresh,
    onSessionLost: clearSession,
  });

  return {
    user,
    isAuthenticated,
    permissions,
    roles,
    bootstrapped,
    accessExpiresAt,
    login,
    refresh,
    logout,
    bootstrap,
    needsRefreshSoon,
    clearSession,
  };
});
