import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { api, ApiError, type CursorPage } from '@core/http';
import { CURSOR_QUERY_KEY, useCursorQuery } from '../use-cursor-query';

interface Row {
  id: string;
}

const page = (ids: string[], nextCursor: string | null): CursorPage<Row> => ({
  items: ids.map((id) => ({ id })),
  meta: { nextCursor, hasMore: nextCursor !== null },
});

function stubPages(...pages: (CursorPage<Row> | Error)[]) {
  const spy = vi.spyOn(api, 'getCursorPage');
  for (const next of pages) {
    if (next instanceof Error) spy.mockRejectedValueOnce(next);
    else spy.mockResolvedValueOnce(next);
  }
  return spy;
}

type Spy = ReturnType<typeof stubPages>;

function paramsOf(spy: Spy, call = -1): Record<string, unknown> {
  return (spy.mock.calls.at(call)?.[1]?.params as Record<string, unknown> | undefined) ?? {};
}

/** Laisse filer les promesses et les observateurs. */
async function settle(): Promise<void> {
  // Une navigation du routeur enchaîne plusieurs micro-tâches.
  for (let i = 0; i < 5; i += 1) await flushPromises();
}

async function makeRouter(path = '/'): Promise<Router> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  });
  await router.push(path);
  await router.isReady();
  return router;
}

const staleCursor = () =>
  new ApiError({ code: 'CURSOR_INVALID', message: 'Curseur invalide', status: 422 });

afterEach(() => vi.restoreAllMocks());

describe('useCursorQuery', () => {
  it('première page : cursor absent, limit envoyé, ni page ni perPage', async () => {
    const spy = stubPages(page(['a', 'b'], 'c1'));

    const query = useCursorQuery<Row, Record<string, unknown>>({ url: '/admin/news', filters: {} });
    await settle();

    expect(spy).toHaveBeenCalledWith('/admin/news', { params: { limit: 20 } });
    expect(paramsOf(spy)).not.toHaveProperty('page');
    expect(paramsOf(spy)).not.toHaveProperty('perPage');
    expect(query.items.value).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(query.hasMore.value).toBe(true);
    expect(query.loading.value).toBe(false);
    expect(query.resumed.value).toBe(false);
  });

  it('page suivante : renvoie le curseur TEL QUEL et ajoute à la liste', async () => {
    const spy = stubPages(page(['a'], 'opaque/+=='), page(['b'], null));
    const query = useCursorQuery<Row, Record<string, unknown>>({ url: '/x', filters: {} });
    await settle();

    await query.loadMore();

    expect(paramsOf(spy)[CURSOR_QUERY_KEY]).toBe('opaque/+==');
    expect(query.items.value.map((row) => row.id)).toEqual(['a', 'b']);
  });

  it('hasMore === false : loadMore ne fait plus aucun appel', async () => {
    const spy = stubPages(page(['a'], null));
    const query = useCursorQuery<Row, Record<string, unknown>>({ url: '/x', filters: {} });
    await settle();

    expect(query.hasMore.value).toBe(false);
    await query.loadMore();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('ne se fie pas à hasMore seul : sans curseur suivant, il n’y a pas de suite', async () => {
    stubPages({ items: [{ id: 'a' }], meta: { nextCursor: null, hasMore: true } });
    const query = useCursorQuery<Row, Record<string, unknown>>({ url: '/x', filters: {} });
    await settle();
    expect(query.hasMore.value).toBe(false);
  });

  it('curseur invalide dans l’adresse : retombe sur la première page, sans erreur', async () => {
    const router = await makeRouter('/?cursor=perime&tab=x');
    const spy = stubPages(staleCursor(), page(['a'], null));

    const query = useCursorQuery<Row, Record<string, unknown>>({ url: '/x', filters: {}, router });
    await settle();

    expect(paramsOf(spy, 0)[CURSOR_QUERY_KEY]).toBe('perime');
    expect(paramsOf(spy, 1)).not.toHaveProperty(CURSOR_QUERY_KEY);
    expect(query.error.value).toBeNull();
    expect(query.items.value).toEqual([{ id: 'a' }]);
    expect(query.cursorReset.value).toBe(true);
    expect(query.resumed.value).toBe(false);
    // Le curseur quitte l'adresse ; les autres paramètres restent.
    expect(router.currentRoute.value.query).toEqual({ tab: 'x' });
  });

  it('curseur qui ne mène à rien : traité comme périmé', async () => {
    const router = await makeRouter('/?cursor=vide');
    const spy = stubPages(page([], null), page(['a'], null));

    const query = useCursorQuery<Row, Record<string, unknown>>({ url: '/x', filters: {}, router });
    await settle();

    expect(spy).toHaveBeenCalledTimes(2);
    expect(query.items.value).toEqual([{ id: 'a' }]);
    expect(query.cursorReset.value).toBe(true);
  });

  it('une panne serveur n’est PAS prise pour un curseur périmé', async () => {
    const router = await makeRouter('/?cursor=ok');
    const failure = new ApiError({ code: 'INTERNAL_ERROR', message: 'x', status: 500 });
    const spy = stubPages(failure);

    const query = useCursorQuery<Row, Record<string, unknown>>({ url: '/x', filters: {}, router });
    await settle();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(query.error.value).toBe(failure);
    expect(query.items.value).toEqual([]);
    expect(query.isEmpty.value).toBe(false);
  });

  it('reprend depuis le curseur de l’adresse, et l’y écrit après « charger la suite »', async () => {
    const router = await makeRouter('/?cursor=c1');
    const spy = stubPages(page(['b'], 'c2'), page(['c'], null));

    const query = useCursorQuery<Row, Record<string, unknown>>({ url: '/x', filters: {}, router });
    await settle();
    expect(paramsOf(spy)[CURSOR_QUERY_KEY]).toBe('c1');
    expect(query.resumed.value).toBe(true);

    await query.loadMore();
    expect(router.currentRoute.value.query[CURSOR_QUERY_KEY]).toBe('c2');
  });

  it('reset : revient au début et retire le curseur de l’adresse', async () => {
    const router = await makeRouter('/?cursor=c1');
    const spy = stubPages(page(['b'], null), page(['a'], 'c1'));
    const query = useCursorQuery<Row, Record<string, unknown>>({ url: '/x', filters: {}, router });
    await settle();

    await query.reset();

    expect(paramsOf(spy)).not.toHaveProperty(CURSOR_QUERY_KEY);
    expect(router.currentRoute.value.query).toEqual({});
    expect(query.resumed.value).toBe(false);
    expect(query.items.value).toEqual([{ id: 'a' }]);
  });

  it('filtres : relus depuis l’adresse (liste et chaîne), vides écartés de la requête', async () => {
    const router = await makeRouter('/?statuses=DRAFT&statuses=ARCHIVED&search=cohorte');
    const spy = stubPages(page([], null));

    const query = useCursorQuery<Row, { statuses: string[]; search?: string; locale?: string }>({
      url: '/x',
      filters: { statuses: [], search: undefined, locale: '' },
      router,
    });
    await settle();

    expect(query.filters.statuses).toEqual(['DRAFT', 'ARCHIVED']);
    expect(paramsOf(spy)).toEqual({
      limit: 20,
      statuses: ['DRAFT', 'ARCHIVED'],
      search: 'cohorte',
    });
  });

  it('un filtre modifié repart de la première page et met l’adresse à jour', async () => {
    const router = await makeRouter('/?cursor=c1');
    const spy = stubPages(page(['b'], null), page(['z'], null));
    const query = useCursorQuery<Row, { statuses: string[] }>({
      url: '/x',
      filters: { statuses: [] },
      router,
    });
    await settle();

    query.filters.statuses = ['PUBLISHED'];
    await settle();

    expect(paramsOf(spy)).toEqual({ limit: 20, statuses: ['PUBLISHED'] });
    expect(router.currentRoute.value.query).toEqual({ statuses: ['PUBLISHED'] });
    expect(query.items.value).toEqual([{ id: 'z' }]);
  });

  it('ignore la réponse d’une requête dépassée par un changement de filtre', async () => {
    let release!: (value: CursorPage<Row>) => void;
    const slow = new Promise<CursorPage<Row>>((resolve) => (release = resolve));
    const spy = vi
      .spyOn(api, 'getCursorPage')
      .mockReturnValueOnce(slow as Promise<CursorPage<unknown>>)
      .mockResolvedValueOnce(page(['récent'], null));

    const query = useCursorQuery<Row, { search: string }>({ url: '/x', filters: { search: '' } });
    query.filters.search = 'x';
    await settle();
    release(page(['ancien'], 'c'));
    await settle();

    expect(spy).toHaveBeenCalledTimes(2);
    expect(query.items.value).toEqual([{ id: 'récent' }]);
    expect(query.hasMore.value).toBe(false);
  });

  it('échec de « charger la suite » : la liste reste, l’erreur est séparée', async () => {
    const failure = new ApiError({ code: 'NETWORK_UNAVAILABLE', message: 'x', status: 0 });
    stubPages(page(['a'], 'c1'), failure);
    const query = useCursorQuery<Row, Record<string, unknown>>({ url: '/x', filters: {} });
    await settle();

    await expect(query.loadMore()).rejects.toBe(failure);

    expect(query.items.value).toEqual([{ id: 'a' }]);
    expect(query.loadMoreError.value).toBe(failure);
    expect(query.error.value).toBeNull();
    expect(query.hasMore.value).toBe(true);
    expect(query.loadingMore.value).toBe(false);
  });

  it('plafonne limit à 100 et n’appelle rien si immediate === false', async () => {
    const spy = stubPages(page([], null));
    const query = useCursorQuery<Row, Record<string, unknown>>({
      url: '/x',
      filters: {},
      limit: 500,
      immediate: false,
    });
    await settle();
    expect(spy).not.toHaveBeenCalled();

    await query.fetch();
    expect(paramsOf(spy)['limit']).toBe(100);
    expect(query.isEmpty.value).toBe(true);
  });
});
