import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetRefreshState, rawClient } from '../client';
import { ApiError } from '../api-error';
import { resetSessionPort, setSessionPort } from '../session-port';

/**
 * LE test du socle HTTP.
 *
 * Le backend fait tourner la famille de jetons à chaque rafraîchissement et
 * RÉVOQUE TOUTE LA FAMILLE si un jeton déjà consommé est représenté. Un écran
 * qui lance quatre requêtes au montage reçoit donc quatre 401 simultanés à
 * l'expiration — et sans sérialisation, trois d'entre elles rejoueraient un
 * jeton périmé et déconnecteraient l'utilisateur.
 *
 * Ce comportement est invisible en développement (où l'on recharge souvent) et
 * se manifeste en production sous forme de déconnexions « aléatoires ». D'où
 * ce test, qui le fige.
 */
describe('client HTTP — rafraîchissement en vol unique', () => {
  beforeEach(() => {
    __resetRefreshState();
    resetSessionPort();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetSessionPort();
  });

  function unauthorized(): unknown {
    return {
      config: { headers: {}, url: '/admin/applications' },
      response: {
        status: 401,
        data: {
          success: false,
          error: { code: 'TOKEN_EXPIRED', message: 'expiré' },
          requestId: null,
          timestamp: '2026-01-01T00:00:00.000Z',
        },
      },
    };
  }

  /** Rejoue le seul intercepteur d'erreur monté sur l'instance axios. */
  async function triggerRejection(error: unknown): Promise<unknown> {
    const handlers = (
      rawClient.interceptors.response as unknown as {
        handlers: { rejected?: (error: unknown) => Promise<unknown> }[];
      }
    ).handlers.filter((handler) => handler.rejected);

    const rejected = handlers[0]?.rejected;
    if (!rejected) throw new Error("Aucun intercepteur d'erreur monté");
    return rejected(error);
  }

  it('n’appelle /auth/refresh qu’une fois pour plusieurs 401 concurrents', async () => {
    let resolveRefresh: (() => void) | undefined;
    const refresh = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    setSessionPort({ getAccessToken: () => 'expiré', refresh, onSessionLost: vi.fn() });
    vi.spyOn(rawClient, 'request').mockResolvedValue({ data: { success: true, data: null } });

    const inFlight = [
      triggerRejection(unauthorized()),
      triggerRejection(unauthorized()),
      triggerRejection(unauthorized()),
    ];

    resolveRefresh?.();
    await Promise.all(inFlight);

    expect(refresh).toHaveBeenCalledTimes(1);
    // Les trois requêtes sont bien rejouées — mutualiser le rafraîchissement
    // ne doit pas en sacrifier deux.
    expect(rawClient.request).toHaveBeenCalledTimes(3);
  });

  it('ne rafraîchit pas sur SESSION_REVOKED : la famille est déjà morte', async () => {
    const refresh = vi.fn(() => Promise.resolve());
    const onSessionLost = vi.fn();
    setSessionPort({ getAccessToken: () => 'x', refresh, onSessionLost });

    await expect(
      triggerRejection({
        config: { headers: {} },
        response: {
          status: 401,
          data: {
            success: false,
            error: { code: 'SESSION_REVOKED', message: 'révoquée' },
            requestId: null,
            timestamp: '2026-01-01T00:00:00.000Z',
          },
        },
      }),
    ).rejects.toBeInstanceOf(ApiError);

    expect(refresh).not.toHaveBeenCalled();
    expect(onSessionLost).toHaveBeenCalledTimes(1);
  });

  it('ne rafraîchit pas une requête marquée skipAuthRefresh', async () => {
    // Sans ce garde-fou, l'échec de `/auth/refresh` relancerait un
    // rafraîchissement, qui échouerait, et ainsi de suite.
    const refresh = vi.fn(() => Promise.resolve());
    setSessionPort({ getAccessToken: () => 'x', refresh, onSessionLost: vi.fn() });

    const error = unauthorized() as { config: Record<string, unknown> };
    error.config['skipAuthRefresh'] = true;

    await expect(triggerRejection(error)).rejects.toBeInstanceOf(ApiError);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('ne rejoue qu’une seule fois : un 401 après rafraîchissement est définitif', async () => {
    const refresh = vi.fn(() => Promise.resolve());
    setSessionPort({ getAccessToken: () => 'x', refresh, onSessionLost: vi.fn() });

    const error = unauthorized() as { config: Record<string, unknown> };
    error.config['retried'] = true;

    await expect(triggerRejection(error)).rejects.toBeInstanceOf(ApiError);
    expect(refresh).not.toHaveBeenCalled();
  });
});
