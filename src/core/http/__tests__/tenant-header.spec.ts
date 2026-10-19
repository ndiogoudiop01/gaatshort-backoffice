import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { rawClient } from '../client';
import { resetSessionPort, setSessionPort } from '../session-port';
import { config } from '@core/config';

/**
 * `x-tenant-id` n'est envoyé QUE tant que personne n'est authentifié.
 *
 * Ce n'est pas une optimisation : le backend compare la revendication `tid` du
 * jeton au tenant résolu par l'en-tête, refuse la requête en cas de divergence
 * et journalise une TENTATIVE D'INTRUSION. Un jour où quelqu'un « simplifiera »
 * en envoyant l'en-tête tout le temps, le back-office se mettra à produire des
 * alertes de sécurité sur des utilisateurs parfaitement légitimes.
 */
function runRequestInterceptor(): InternalAxiosRequestConfig {
  const handlers = (
    rawClient.interceptors.request as unknown as {
      handlers: { fulfilled?: (c: InternalAxiosRequestConfig) => InternalAxiosRequestConfig }[];
    }
  ).handlers.filter((handler) => handler.fulfilled);

  const fulfilled = handlers[0]?.fulfilled;
  if (!fulfilled) throw new Error('Aucun intercepteur de requête monté');

  return fulfilled({ headers: new AxiosHeaders() } as InternalAxiosRequestConfig);
}

describe('intercepteur de requête', () => {
  beforeEach(() => resetSessionPort());
  afterEach(() => {
    vi.restoreAllMocks();
    resetSessionPort();
  });

  it('pose le jeton porteur et retire l’en-tête de tenant', () => {
    setSessionPort({
      getAccessToken: () => 'jeton',
      refresh: vi.fn(),
      onSessionLost: vi.fn(),
    });

    const request = runRequestInterceptor();

    expect(request.headers.get('Authorization')).toBe('Bearer jeton');
    // Une fois connecté, le jeton fait autorité : l'en-tête ne peut que nuire.
    expect(request.headers.get(config.tenancy.headerName)).toBeUndefined();
  });

  it('envoie l’en-tête de tenant tant que personne n’est connecté', () => {
    setSessionPort({ getAccessToken: () => null, refresh: vi.fn(), onSessionLost: vi.fn() });

    const request = runRequestInterceptor();

    expect(request.headers.get('Authorization')).toBeUndefined();
    // Nécessaire sur `localhost` : le résolveur par sous-domaine y rend `null`
    // à dessein (un hôte sans point n'est pas un sous-domaine).
    expect(request.headers.get(config.tenancy.headerName)).toBe(config.tenancy.devSlug);
  });

  it('n’ajoute aucun en-tête sans session enregistrée', () => {
    const request = runRequestInterceptor();
    expect(request.headers.get('Authorization')).toBeUndefined();
  });
});
