import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { RouteLocationNormalized } from 'vue-router';
import { permissionsGuard, sessionGuard } from '../guards';
import { useAuthStore } from '@core/auth/auth.store';
import type { AuthenticatedUser, Role } from '@core/auth/types';

/**
 * Les gardes reproduisent la sémantique de `PermissionsGuard` côté backend :
 * TOUTES les permissions exigées, AU MOINS UN des rôles exigés. Un écart
 * entre les deux ne casse rien visiblement — il affiche juste un écran que
 * l'API refusera, ou en cache un qu'elle aurait servi.
 */

function route(partial: Partial<RouteLocationNormalized>): RouteLocationNormalized {
  const record = {
    meta: partial.meta ?? {},
    path: partial.path ?? '/x',
  } as RouteLocationNormalized['matched'][number];

  return {
    name: partial.name,
    path: partial.path ?? '/x',
    fullPath: partial.fullPath ?? partial.path ?? '/x',
    meta: partial.meta ?? {},
    matched: partial.matched ?? [record],
    query: {},
    params: {},
    hash: '',
    redirectedFrom: undefined,
  } as RouteLocationNormalized;
}

function signIn(roles: Role[], permissions: string[]): void {
  const auth = useAuthStore();
  auth.user = {
    id: 'u1',
    tenantId: 't1',
    email: 'a@b.c',
    roles,
    permissions,
    sessionId: 's1',
  } satisfies AuthenticatedUser;
  // La session est déjà restaurée : `bootstrap()` ne doit pas retenter un
  // rafraîchissement, qui partirait appeler le réseau dans un test.
  auth.bootstrapped = true;
}

describe('sessionGuard', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renvoie vers la connexion en conservant le chemin demandé', async () => {
    useAuthStore().bootstrapped = true;

    const result = await sessionGuard.call(
      undefined,
      route({ path: '/candidatures/42', fullPath: '/candidatures/42' }),
      route({}),
      () => undefined,
    );

    expect(result).toEqual({ name: 'login', query: { redirect: '/candidatures/42' } });
  });

  it('ne met pas « / » dans redirect : ce serait une redirection vide', async () => {
    useAuthStore().bootstrapped = true;

    const result = await sessionGuard.call(
      undefined,
      route({ path: '/', fullPath: '/' }),
      route({}),
      () => undefined,
    );

    expect(result).toEqual({ name: 'login', query: {} });
  });

  it('détourne un utilisateur connecté qui rouvre l’écran de connexion', async () => {
    signIn(['ADMIN'], []);

    const result = await sessionGuard.call(
      undefined,
      route({ name: 'login', path: '/connexion', meta: { public: true } }),
      route({}),
      () => undefined,
    );

    expect(result).toEqual({ name: 'home' });
  });

  it('laisse passer une route publique à un visiteur', async () => {
    useAuthStore().bootstrapped = true;

    const result = await sessionGuard.call(
      undefined,
      route({ name: 'not-found', meta: { public: true } }),
      route({}),
      () => undefined,
    );

    expect(result).toBe(true);
  });
});

describe('permissionsGuard', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  function check(meta: Record<string, unknown>) {
    return permissionsGuard.call(
      undefined,
      route({ meta, path: '/x' }),
      route({}),
      () => undefined,
    );
  }

  it('exige TOUTES les permissions, comme le backend', () => {
    signIn(['MANAGER'], ['application:read']);

    expect(check({ permissions: ['application:read'] })).toBe(true);
    expect(check({ permissions: ['application:read', 'application:transition'] })).toEqual({
      name: 'forbidden',
      query: { from: '/x' },
    });
  });

  it('n’exige qu’UN SEUL des rôles listés', () => {
    signIn(['ADMIN'], []);

    expect(check({ roles: ['SUPER_ADMIN', 'ADMIN'] })).toBe(true);
    expect(check({ roles: ['SUPER_ADMIN'] })).toEqual({ name: 'forbidden', query: { from: '/x' } });
  });

  it('renvoie vers « accès refusé », jamais vers la connexion', () => {
    // La confusion coûterait cher : une session valide mais sans droit
    // rebondirait indéfiniment sur l'écran de connexion, qui la renverrait
    // aussitôt vers l'écran refusé.
    signIn(['MANAGER'], []);
    expect(check({ permissions: ['user:manage'] })).toEqual({
      name: 'forbidden',
      query: { from: '/x' },
    });
  });

  it('ferme tout à un PARTNER, qui n’a aucune permission au catalogue', () => {
    signIn(['PARTNER'], []);
    expect(check({ permissions: ['partner:read'] })).toEqual({
      name: 'forbidden',
      query: { from: '/x' },
    });
  });
});
