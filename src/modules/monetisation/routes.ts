import type { RouteRecordRaw } from 'vue-router';

export const monetisationRoutes: RouteRecordRaw[] = [
  {
    path: 'packs',
    name: 'packs',
    component: () => import('./views/PacksView.vue'),
    meta: { titleKey: 'nav.packs', icon: 'pi pi-wallet', section: 'monetisation', nav: true, permissions: ['pack:write'] },
  },
  {
    path: 'commandes',
    name: 'orders',
    component: () => import('./views/OrdersView.vue'),
    meta: { titleKey: 'nav.orders', icon: 'pi pi-receipt', section: 'monetisation', nav: true, permissions: ['order:read'] },
  },
];
