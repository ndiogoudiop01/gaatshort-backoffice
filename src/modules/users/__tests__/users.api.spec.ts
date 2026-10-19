import { afterEach, describe, expect, it, vi } from 'vitest';
import { rawClient } from '@core/http/client';
import { PERMISSIONS_URL, ROLES_URL, USERS_URL, usersApi } from '../users.api';
import type { CreateUserPayload } from '../types';

function envelope<T>(data: T) {
  return { data: { success: true, data, requestId: 'r', timestamp: 't' }, status: 200 };
}

const USER: CreateUserPayload = {
  email: 'awa@impact.test',
  firstName: 'Awa',
  lastName: null,
  phoneE164: null,
  countryCode: 'SN',
  roleKeys: ['MANAGER'],
};

afterEach(() => vi.restoreAllMocks());

describe('usersApi', () => {
  it('lit profils et catalogue depuis l’API (source de vérité du mapping)', async () => {
    const get = vi.spyOn(rawClient, 'get').mockResolvedValue(envelope([]));
    await usersApi.roles();
    await usersApi.permissions();
    expect(get).toHaveBeenNthCalledWith(1, ROLES_URL, undefined);
    expect(get).toHaveBeenNthCalledWith(2, PERMISSIONS_URL, undefined);
  });

  it('création : ni mot de passe ni périmètre dans le corps, refusés avant le réseau', async () => {
    const post = vi.spyOn(rawClient, 'post').mockResolvedValue(envelope({ id: 'u1' }));
    await expect(
      usersApi.create({ ...USER, password: 'x' } as CreateUserPayload),
    ).rejects.toThrow();
    await expect(
      usersApi.create({ ...USER, allCountries: true } as CreateUserPayload),
    ).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
    await usersApi.create(USER);
    expect(post).toHaveBeenCalledWith(USERS_URL, USER, undefined);
  });

  it('rôles, statut, périmètre, sessions, permissions d’un profil', async () => {
    const put = vi.spyOn(rawClient, 'put').mockResolvedValue(envelope({}));
    const patch = vi.spyOn(rawClient, 'patch').mockResolvedValue(envelope({}));
    const post = vi.spyOn(rawClient, 'post').mockResolvedValue(envelope({ revoked: 2 }));
    await usersApi.setRoles('u 1', ['ADMIN']);
    await usersApi.setStatus('u1', 'SUSPENDED');
    await usersApi.setCountries('u1', { allCountries: false, countryScope: ['MA'] });
    await usersApi.revokeSessions('u1');
    await usersApi.setRolePermissions('r1', ['pool:read']);
    expect(put).toHaveBeenNthCalledWith(
      1,
      `${USERS_URL}/u%201/roles`,
      { roleKeys: ['ADMIN'] },
      undefined,
    );
    expect(patch).toHaveBeenCalledWith(
      `${USERS_URL}/u1/status`,
      { status: 'SUSPENDED' },
      undefined,
    );
    expect(put).toHaveBeenNthCalledWith(
      2,
      `${USERS_URL}/u1/countries`,
      { allCountries: false, countryScope: ['MA'] },
      undefined,
    );
    expect(post).toHaveBeenCalledWith(`${USERS_URL}/u1/sessions/revoke`, undefined, undefined);
    expect(put).toHaveBeenNthCalledWith(
      3,
      `${ROLES_URL}/r1/permissions`,
      { permissionKeys: ['pool:read'] },
      undefined,
    );
  });

  it('pays du périmètre : format ISO en majuscules exigé', async () => {
    const put = vi.spyOn(rawClient, 'put');
    await expect(
      usersApi.setCountries('u1', { allCountries: false, countryScope: ['maroc'] }),
    ).rejects.toThrow();
    expect(put).not.toHaveBeenCalled();
  });
});

/**
 * Critère d'acceptation : « le mapping rôle → permissions affiché provient de
 * l'API, pas d'une table codée en dur dans le module ». Garde-fou statique :
 * hors tests, le module ne cite aucune clé de permission — sauf `user:manage`
 * (la règle d'anti-verrouillage) et `tenant:manage` (un CONSTAT affiché).
 */
describe('aucun mapping codé en dur', () => {
  const sources = import.meta.glob(
    ['/src/modules/users/**/*.{ts,vue}', '!/src/modules/users/__tests__/**'],
    {
      query: '?raw',
      import: 'default',
      eager: true,
    },
  ) as Record<string, string>;

  it('le module ne cite pas de clés de permission', () => {
    const allowed = new Set(['user:manage', 'tenant:manage', 'application:read:own']);
    const offenders = Object.entries(sources).flatMap(([path, code]) =>
      [...code.matchAll(/'([a-z]+:[a-z]+(?::[a-z]+)?)'/g)]
        .map((m) => m[1]!)
        .filter((key) => !allowed.has(key))
        .map((key) => `${path} → ${key}`),
    );
    expect(offenders).toEqual([]);
    expect(Object.keys(sources).length).toBeGreaterThan(8);
  });
});
