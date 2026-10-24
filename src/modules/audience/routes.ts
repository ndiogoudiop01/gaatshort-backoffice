import type { RouteRecordRaw } from 'vue-router';

export const dashboardRoutes: RouteRecordRaw[] = [
  {
    path: 'tableau-de-bord',
    name: 'dashboard',
    component: () => import('./views/DashboardView.vue'),
    meta: { titleKey: 'nav.dashboard', icon: 'pi pi-chart-bar', section: 'pilotage', nav: true, permissions: ['metrics:read'] },
  },
];

export const audienceRoutes: RouteRecordRaw[] = [
  {
    path: 'spectateurs',
    name: 'viewers',
    component: () => import('./views/ViewersView.vue'),
    meta: { titleKey: 'nav.viewers', icon: 'pi pi-users', section: 'audience', nav: true, permissions: ['viewer:read'] },
  },
  {
    path: 'spectateurs/:accountId',
    name: 'viewer-detail',
    component: () => import('./views/ViewerDetailView.vue'),
    props: true,
    meta: { titleKey: 'audience.viewer.title', permissions: ['viewer:read'] },
  },
];
