import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { useOffsetQuery } from '../use-offset-query';
import { api } from '@core/http';

interface Row {
  id: string;
}

type PaginatedSpy = ReturnType<typeof stubApi>;

function stubApi() {
  return vi.spyOn(api, 'getPaginated').mockResolvedValue({
    items: [{ id: '1' }] as Row[],
    meta: { total: 1, page: 1, perPage: 20, totalPages: 1, hasMore: false },
  });
}

function lastParams(spy: PaginatedSpy): Record<string, unknown> {
  const call = spy.mock.calls.at(-1);
  return (call?.[1]?.params as Record<string, unknown> | undefined) ?? {};
}

afterEach(() => vi.restoreAllMocks());

describe('useOffsetQuery', () => {
  it('omet un sortBy hors liste blanche plutôt que de provoquer un 400', async () => {
    const spy = stubApi();

    const query = useOffsetQuery<Row, Record<string, unknown>>({
      url: '/admin/applications',
      filters: {},
      allowedSortFields: ['createdAt', 'score'],
      defaultSortBy: 'createdAt',
    });
    await query.fetch();
    expect(lastParams(spy)['sortBy']).toBe('createdAt');

    // `candidateName` n'est pas dans le `@IsIn()` du DTO : le backend
    // répondrait 400 avec le message fixe « Requête invalide », que
    // l'utilisateur ne pourrait pas relier à un clic sur un en-tête.
    query.state.sortBy = 'candidateName';
    await query.fetch();
    expect(lastParams(spy)).not.toHaveProperty('sortBy');
  });

  it('plafonne perPage à 100, la limite du backend', async () => {
    const spy = stubApi();

    const query = useOffsetQuery<Row, Record<string, unknown>>({
      url: '/admin/applications',
      filters: {},
      allowedSortFields: [],
    });
    query.state.perPage = 500;
    await query.fetch();

    expect(lastParams(spy)['perPage']).toBe(100);
  });

  it('revient à la page 1 quand un filtre change', async () => {
    const spy = stubApi();

    const query = useOffsetQuery<Row, { search?: string }>({
      url: '/admin/applications',
      filters: { search: '' },
      allowedSortFields: [],
    });
    query.state.page = 7;
    query.filters.search = 'dupont';
    await nextTick();
    await Promise.resolve();

    // Rester page 7 sur un jeu de résultats réduit afficherait une page vide,
    // qui se lit comme « aucun résultat » alors qu'il y en a.
    expect(query.state.page).toBe(1);
    expect(lastParams(spy)['page']).toBe(1);
  });

  it('écarte les filtres vides au lieu de les transmettre', async () => {
    const spy = stubApi();

    const query = useOffsetQuery<Row, { search?: string; statuses?: string[] }>({
      url: '/admin/applications',
      filters: { search: '', statuses: [] },
      allowedSortFields: [],
    });
    await query.fetch();

    const params = lastParams(spy);
    expect(params).not.toHaveProperty('search');
    expect(params).not.toHaveProperty('statuses');
  });

  it('vide la liste en cas d’erreur plutôt que d’afficher des données périmées', async () => {
    vi.spyOn(api, 'getPaginated').mockRejectedValue(new Error('boom'));

    const query = useOffsetQuery<Row, Record<string, unknown>>({
      url: '/admin/applications',
      filters: {},
      allowedSortFields: [],
      immediate: false,
    });

    await expect(query.fetch()).rejects.toThrow();
    expect(query.items.value).toEqual([]);
    expect(query.meta.value).toBeNull();
    expect(query.loading.value).toBe(false);
  });
});
