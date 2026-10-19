import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from '../auth.store';
import { authApi } from '../auth.api';
import { tokenStorage } from '../token-storage';
import type { AuthenticatedUser } from '../types';

function jwt(expSeconds: number): string {
  const body = btoa(JSON.stringify({ exp: expSeconds }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `h.${body}.s`;
}

const user: AuthenticatedUser = {
  id: 'u1',
  tenantId: 't1',
  email: 'a@b.c',
  roles: ['ADMIN'],
  permissions: ['metrics:read'],
  sessionId: 's1',
};

describe('auth.store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    tokenStorage.clear();
    localStorage.clear();
  });

  afterEach(() => vi.restoreAllMocks());

  it('lit l’échéance dans le jeton, pas dans expiresIn', async () => {
    const exp = Math.floor(Date.now() / 1000) + 1800;
    vi.spyOn(authApi, 'login').mockResolvedValue({
      accessToken: jwt(exp),
      refreshToken: 'opaque',
      // Le backend renvoie 900 en dur, quelle que soit la durée réelle.
      expiresIn: 900,
    });
    vi.spyOn(authApi, 'me').mockResolvedValue(user);

    const auth = useAuthStore();
    await auth.login({ email: 'a@b.c', password: 'mot-de-passe' });

    expect(auth.accessExpiresAt).toBe(exp * 1000);
    expect(auth.isAuthenticated).toBe(true);
    expect(auth.permissions.has('metrics:read')).toBe(true);
  });

  it('signale l’échéance proche avant le 401, pas après', async () => {
    const auth = useAuthStore();
    const now = Date.now();

    auth.accessExpiresAt = now + 120_000;
    expect(auth.needsRefreshSoon(now)).toBe(false);

    // Marge de 60 s : on rafraîchit un peu en avance plutôt que de faire payer
    // le coût à l'action de l'utilisateur.
    auth.accessExpiresAt = now + 30_000;
    expect(auth.needsRefreshSoon(now)).toBe(true);
  });

  it('ne tente rien au démarrage sans jeton de rafraîchissement', async () => {
    const refresh = vi.spyOn(authApi, 'refresh');

    const auth = useAuthStore();
    await auth.bootstrap();

    expect(refresh).not.toHaveBeenCalled();
    expect(auth.isAuthenticated).toBe(false);
  });

  it('restaure la session au rechargement de page', async () => {
    tokenStorage.setRefreshToken('opaque');
    vi.spyOn(authApi, 'refresh').mockResolvedValue({
      accessToken: jwt(Math.floor(Date.now() / 1000) + 900),
      refreshToken: 'opaque-2',
      expiresIn: 900,
    });
    vi.spyOn(authApi, 'me').mockResolvedValue(user);

    const auth = useAuthStore();
    await auth.bootstrap();

    expect(auth.isAuthenticated).toBe(true);
    // Le jeton a TOURNÉ : garder l'ancien ferait révoquer la famille au
    // prochain rafraîchissement.
    expect(tokenStorage.getRefreshToken()).toBe('opaque-2');
  });

  it('purge la session quand la restauration échoue', async () => {
    tokenStorage.setRefreshToken('périmé');
    vi.spyOn(authApi, 'refresh').mockRejectedValue(new Error('401'));

    const auth = useAuthStore();
    await auth.bootstrap();

    expect(auth.isAuthenticated).toBe(false);
    expect(tokenStorage.getRefreshToken()).toBeNull();
  });

  it('n’exécute bootstrap qu’une fois', async () => {
    tokenStorage.setRefreshToken('opaque');
    const refresh = vi.spyOn(authApi, 'refresh').mockRejectedValue(new Error('401'));

    const auth = useAuthStore();
    await auth.bootstrap();
    await auth.bootstrap();

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('déconnecte localement même si le serveur refuse la déconnexion', async () => {
    tokenStorage.setAccessToken('jeton');
    tokenStorage.setRefreshToken('opaque');
    vi.spyOn(authApi, 'logout').mockRejectedValue(new Error('500'));

    const auth = useAuthStore();
    auth.user = user;
    await auth.logout();

    // L'utilisateur a demandé à partir : une panne côté serveur ne doit pas
    // le laisser connecté sur son poste.
    expect(auth.isAuthenticated).toBe(false);
    expect(tokenStorage.getAccessToken()).toBeNull();
    expect(tokenStorage.getRefreshToken()).toBeNull();
  });

  it('rejette un rafraîchissement sans jeton, plutôt que d’appeler l’API', async () => {
    const refresh = vi.spyOn(authApi, 'refresh');
    await expect(useAuthStore().refresh()).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
    expect(refresh).not.toHaveBeenCalled();
  });
});
