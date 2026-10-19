import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InternalAxiosRequestConfig } from 'axios';
import { rawClient } from '@core/http/client';
import { resetSessionPort, setSessionPort } from '@core/http/session-port';
import { config } from '@core/config';
import { TENANTS_URL, tenantsApi } from '../tenants.api';
import type { TenantPatch } from '../types';

function envelope<T>(data: T) {
  return { data: { success: true, data, requestId: 'r', timestamp: 't' }, status: 200 };
}

afterEach(() => {
  vi.restoreAllMocks();
  resetSessionPort();
});

describe('tenantsApi.update — liste blanche', () => {
  it('envoie exactement le patch, rien d’autre', async () => {
    const patch = vi.spyOn(rawClient, 'patch').mockResolvedValue(envelope({ id: 't1' }));
    await tenantsApi.update('t 1', { name: 'Impact SN', branding: { primaryColor: '#111111' } });
    expect(patch).toHaveBeenCalledWith(
      `${TENANTS_URL}/t%201`,
      { name: 'Impact SN', branding: { primaryColor: '#111111' } },
      undefined,
    );
  });

  it('un champ hors liste : rejet AVANT le réseau', async () => {
    const patch = vi.spyOn(rawClient, 'patch');
    for (const hostile of [
      { slug: 'pirate' },
      { name: 'x', isolation: 'SCHEMA' },
      { name: 'Ok', schemaName: 'public' },
      { settings: {} },
      { branding: { primaryColor: '#000000', script: 'x' } },
      {},
    ]) {
      await expect(tenantsApi.update('t1', hostile as TenantPatch)).rejects.toThrow();
    }
    expect(patch).not.toHaveBeenCalled();
  });
});

describe('aucun x-tenant-id divergent du jeton', () => {
  let seen: InternalAxiosRequestConfig[] = [];
  const original = rawClient.defaults.adapter;

  beforeEach(() => {
    seen = [];
    rawClient.defaults.adapter = async (request) => {
      seen.push(request);
      return {
        data: envelope({}).data,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: request,
      };
    };
  });
  afterEach(() => {
    rawClient.defaults.adapter = original;
  });

  it('connecté : ni la lecture ni l’écriture d’une AUTRE organisation n’envoient l’en-tête', async () => {
    setSessionPort({
      getAccessToken: () => 'jeton-super-admin',
      refresh: vi.fn(),
      onSessionLost: vi.fn(),
    });
    await tenantsApi.detail('autre-organisation');
    await tenantsApi.reference();
    await tenantsApi.update('autre-organisation', { name: 'Renommée' });
    expect(seen).toHaveLength(3);
    for (const request of seen) {
      expect(request.headers.get(config.tenancy.headerName)).toBeUndefined();
      expect(request.headers.get('Authorization')).toBe('Bearer jeton-super-admin');
      // L'organisation ciblée passe par l'URL, jamais par un en-tête.
    }
    expect(seen[2]!.url).toBe(`${TENANTS_URL}/autre-organisation`);
  });
});

/** Le module ne s'appuie jamais sur la permission leurre. */
describe('pas de tenant:manage dans le module', () => {
  const sources = import.meta.glob(
    ['/src/modules/tenants/**/*.{ts,vue}', '!/src/modules/tenants/__tests__/**'],
    {
      query: '?raw',
      import: 'default',
      eager: true,
    },
  ) as Record<string, string>;

  it('aucun code ne cite tenant:manage (hors commentaires)', () => {
    const offenders = Object.entries(sources)
      .filter(([, code]) =>
        code
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\/\/.*$/gm, '')
          .replace(/<!--[\s\S]*?-->/g, '')
          .includes('tenant:manage'),
      )
      .map(([path]) => path);
    expect(offenders).toEqual([]);
    expect(Object.keys(sources).length).toBeGreaterThan(6);
  });
});
