import type { RouteRecordRaw } from 'vue-router';

/**
 * Le module déclare SES routes — mêmes règles que `content/routes.ts`.
 *
 * RÔLE, PAS PERMISSION. C'est le seul module du menu gardé par `roles` :
 * `tenant:manage` existe au catalogue des 28 droits mais n'est vérifiée par
 * AUCUN contrôleur (les routes `/admin/tenants` portent
 * `@RequireRoles('SUPER_ADMIN')`). Garder cet écran par la permission
 * l'afficherait à des personnes que l'API refuserait ensuite.
 */
export const tenantRoutes: RouteRecordRaw[] = [
  {
    path: 'organisations',
    name: 'tenants',
    component: () => import('./views/TenantsView.vue'),
    meta: {
      titleKey: 'nav.tenants',
      icon: 'pi pi-sitemap',
      section: 'plateforme',
      nav: true,
      roles: ['SUPER_ADMIN'],
    },
  },
  {
    path: 'organisations/:id',
    name: 'tenants-detail',
    component: () => import('./views/TenantDetailView.vue'),
    props: true,
    meta: { titleKey: 'tenants.detail.title', roles: ['SUPER_ADMIN'] },
  },
];
