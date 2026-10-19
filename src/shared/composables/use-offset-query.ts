import { computed, reactive, ref, watch } from 'vue';
import { api, type OffsetMeta, type Paginated } from '@core/http';
import { config } from '@core/config';
import { isOffsetMeta } from '@core/http';

export interface OffsetQueryState {
  page: number;
  perPage: number;
  sortBy?: string;
  sortDir: 'asc' | 'desc';
}

/**
 * Liste paginée côté SERVEUR.
 *
 * Le back-office manipule des volumes qui interdisent de tout charger : le
 * CRM candidats, le vivier et les leads partenaires paginent tous côté API.
 * Ce composable tient l'état de la requête (page, tri, filtres), déclenche le
 * rechargement au bon moment, et expose ce dont une `DataTable` en mode
 * `lazy` a besoin.
 *
 * Contraintes reprises du backend, pour ne pas provoquer de 400 évitable :
 *  • `perPage` est plafonné à 100 ;
 *  • `sortBy` est validé par une liste blanche PAR ROUTE — une valeur hors
 *    liste est refusée. D'où `allowedSortFields`, fourni par l'appelant.
 */
export function useOffsetQuery<TItem, TFilters extends Record<string, unknown>>(options: {
  url: string;
  filters: TFilters;
  allowedSortFields: readonly string[];
  defaultSortBy?: string;
  immediate?: boolean;
}) {
  const items = ref<TItem[]>([]) as { value: TItem[] };
  const meta = ref<OffsetMeta | null>(null);
  const loading = ref(false);
  const error = ref<unknown>(null);

  const state = reactive<OffsetQueryState>({
    page: 1,
    perPage: config.ui.defaultPageSize,
    sortBy: options.defaultSortBy,
    sortDir: 'desc',
  });

  const filters = reactive({ ...options.filters }) as TFilters;

  const total = computed(() => meta.value?.total ?? 0);
  const isEmpty = computed(() => !loading.value && items.value.length === 0);

  function buildParams(): Record<string, unknown> {
    const params: Record<string, unknown> = {
      page: state.page,
      perPage: Math.min(state.perPage, 100),
      sortDir: state.sortDir,
    };

    // Un `sortBy` hors liste blanche ferait répondre 400 au backend. On
    // préfère l'omettre : la route retombe alors sur son tri par défaut.
    if (state.sortBy && options.allowedSortFields.includes(state.sortBy)) {
      params['sortBy'] = state.sortBy;
    }

    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined || value === null || value === '') continue;
      // Les tableaux sont acceptés sous les deux formes par le backend
      // (`?x=A,B` et `?x=A&x=B`). On choisit la forme répétée, qui supporte
      // les valeurs contenant une virgule — `rawClient` est configuré pour la
      // produire (`paramsSerializer`, cf. `@core/http/client.ts`).
      if (Array.isArray(value) && value.length === 0) continue;
      params[key] = value;
    }

    return params;
  }

  async function fetch(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const page: Paginated<TItem> = await api.getPaginated<TItem>(options.url, {
        params: buildParams(),
      });
      items.value = [...page.items];
      meta.value = isOffsetMeta(page.meta) ? page.meta : null;
    } catch (caught) {
      error.value = caught;
      items.value = [];
      meta.value = null;
      throw caught;
    } finally {
      loading.value = false;
    }
  }

  /** Un changement de filtre ramène à la page 1 : rester page 7 sur un jeu
   *  de résultats réduit afficherait une page vide, ce qui se lit comme
   *  « aucun résultat » alors qu'il y en a. */
  watch(
    () => ({ ...filters }),
    () => {
      state.page = 1;
      void fetch().catch(() => undefined);
    },
    { deep: true },
  );

  if (options.immediate !== false) void fetch().catch(() => undefined);

  return { items, meta, total, loading, error, state, filters, isEmpty, fetch };
}
