import type { RouteRecordRaw } from 'vue-router';

/** Catalogue global (séries, genres, licences) et vitrine de la marque courante. */
export const catalogRoutes: RouteRecordRaw[] = [
  {
    path: 'series',
    name: 'series',
    component: () => import('./views/SeriesListView.vue'),
    meta: { titleKey: 'nav.series', icon: 'pi pi-video', section: 'catalogue', nav: true, permissions: ['catalog:read'] },
  },
  {
    path: 'series/:id',
    name: 'series-edit',
    component: () => import('./views/SeriesEditView.vue'),
    props: true,
    meta: { titleKey: 'catalog.series.editTitle', permissions: ['catalog:read'] },
  },
  {
    path: 'genres',
    name: 'genres',
    component: () => import('./views/GenresView.vue'),
    meta: { titleKey: 'nav.genres', icon: 'pi pi-tags', section: 'catalogue', nav: true, permissions: ['catalog:read'] },
  },
  {
    path: 'licences',
    name: 'licenses',
    component: () => import('./views/LicensesView.vue'),
    meta: { titleKey: 'nav.licenses', icon: 'pi pi-file-check', section: 'catalogue', nav: true, permissions: ['license:read'] },
  },
  {
    path: 'vitrine',
    name: 'storefront',
    component: () => import('./views/StorefrontView.vue'),
    meta: { titleKey: 'nav.storefront', icon: 'pi pi-shop', section: 'catalogue', nav: true, permissions: ['catalog:read'] },
  },
];
