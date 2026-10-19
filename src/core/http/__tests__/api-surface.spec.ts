import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, rawClient } from '../client';
import { ApiError } from '../api-error';

/**
 * La surface publique du client : ce que voit le reste de l'application.
 *
 * Le contrat tient en une phrase — un appel rend la charge utile, jamais
 * l'enveloppe — et c'est exactement ce qui doit rester vrai quand quelqu'un
 * ajoutera un verbe ou changera la gestion d'erreur.
 */

function envelope<T>(data: T, meta?: unknown) {
  return {
    data: {
      success: true,
      data,
      ...(meta === undefined ? {} : { meta }),
      requestId: 'req-1',
      timestamp: '2026-01-01T00:00:00.000Z',
    },
    status: 200,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('api', () => {
  it('déballe l’enveloppe sur tous les verbes', async () => {
    const payload = { id: '1' };
    vi.spyOn(rawClient, 'get').mockResolvedValue(envelope(payload));
    vi.spyOn(rawClient, 'post').mockResolvedValue(envelope(payload));
    vi.spyOn(rawClient, 'put').mockResolvedValue(envelope(payload));
    vi.spyOn(rawClient, 'patch').mockResolvedValue(envelope(payload));
    vi.spyOn(rawClient, 'delete').mockResolvedValue(envelope(payload));

    await expect(api.get('/x')).resolves.toEqual(payload);
    await expect(api.post('/x', {})).resolves.toEqual(payload);
    await expect(api.put('/x', {})).resolves.toEqual(payload);
    await expect(api.patch('/x', {})).resolves.toEqual(payload);
    await expect(api.delete('/x')).resolves.toEqual(payload);
  });

  it('ne tente pas de déballer un 204', async () => {
    // `POST /auth/logout` ne renvoie pas de corps : `post()` échouerait en
    // essayant de lire une enveloppe dans une chaîne vide.
    const spy = vi.spyOn(rawClient, 'post').mockResolvedValue({ data: '', status: 204 });

    await expect(api.postVoid('/auth/logout')).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('remonte meta À CÔTÉ de data pour une liste paginée', async () => {
    const meta = { total: 42, page: 2, perPage: 20, totalPages: 3, hasMore: true };
    vi.spyOn(rawClient, 'get').mockResolvedValue(envelope([{ id: '1' }], meta));

    const page = await api.getPaginated<{ id: string }>('/admin/applications');

    // `get()` perdrait `meta` : c'est pour cela qu'il existe une seconde porte
    // plutôt qu'un drapeau qui obligerait à deviner le type de retour.
    expect(page.items).toEqual([{ id: '1' }]);
    expect(page.meta).toEqual(meta);
  });

  it('refuse une liste paginée sans métadonnées', async () => {
    vi.spyOn(rawClient, 'get').mockResolvedValue(envelope([{ id: '1' }]));

    // Sans `meta`, un tableau afficherait « 0 résultats » sur une page pleine.
    // Mieux vaut échouer que mentir sur le total.
    await expect(api.getPaginated('/admin/applications')).rejects.toBeInstanceOf(ApiError);
  });

  it('getCursorPage : rend items et meta curseur, sans toucher au curseur', async () => {
    const meta = { nextCursor: 'eyJvcGFxdWUiOnRydWV9', hasMore: true };
    vi.spyOn(rawClient, 'get').mockResolvedValue(envelope([{ id: '1' }], meta));

    const page = await api.getCursorPage<{ id: string }>('/admin/news');

    expect(page).toEqual({ items: [{ id: '1' }], meta });
  });

  it('getCursorPage : accepte la dernière page (nextCursor null)', async () => {
    const meta = { nextCursor: null, hasMore: false };
    vi.spyOn(rawClient, 'get').mockResolvedValue(envelope([], meta));

    await expect(api.getCursorPage('/admin/news')).resolves.toEqual({ items: [], meta });
  });

  it.each([
    ['sans meta', undefined],
    ['meta offset', { total: 3, page: 1, perPage: 20, totalPages: 1, hasMore: false }],
    ['hasMore absent', { nextCursor: null }],
    ['curseur non textuel', { nextCursor: 42, hasMore: true }],
  ])('getCursorPage : refuse une réponse %s', async (_label, meta) => {
    vi.spyOn(rawClient, 'get').mockResolvedValue(envelope([], meta));

    await expect(api.getCursorPage('/admin/news')).rejects.toMatchObject({
      code: 'UPSTREAM_UNAVAILABLE',
    });
  });

  it('signale une réponse hors enveloppe comme ne venant pas de l’API', async () => {
    // Page d'erreur nginx, passerelle CapRover, portail captif.
    vi.spyOn(rawClient, 'get').mockResolvedValue({ data: '<html>502</html>', status: 200 });

    await expect(api.get('/x')).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
  });

  it('lève une ApiError quand l’enveloppe porte une erreur malgré un 200', async () => {
    vi.spyOn(rawClient, 'get').mockResolvedValue({
      status: 200,
      data: {
        success: false,
        error: { code: 'CONSENT_REQUIRED', message: 'Consentement requis' },
        requestId: 'req-2',
        timestamp: '2026-01-01T00:00:00.000Z',
      },
    });

    await expect(api.get('/x')).rejects.toMatchObject({
      code: 'CONSENT_REQUIRED',
      requestId: 'req-2',
    });
  });
});
