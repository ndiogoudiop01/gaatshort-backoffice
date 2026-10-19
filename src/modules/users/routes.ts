import type { RouteRecordRaw } from 'vue-router';

/**
 * Le module déclare SES routes — mêmes règles que `content/routes.ts`.
 *
 * `user:manage` ouvre le menu ET toutes les routes `/admin/users`, `/admin/roles`.
 * Ce garde est un confort d'affichage : les droits sont figés dans le jeton et
 * c'est le backend qui refuse (anti-escalade, verrouillage de soi, pays).
 *
 * Seul l'onglet actif (`?onglet=profils`) va dans l'adresse : la recherche,
 * qui peut contenir une adresse e-mail, reste en mémoire.
 */
export const userRoutes: RouteRecordRaw[] = [
  {
    path: 'utilisateurs',
    name: 'users',
    component: () => import('./views/UsersView.vue'),
    meta: {
      titleKey: 'nav.users',
      icon: 'pi pi-users',
      section: 'plateforme',
      nav: true,
      permissions: ['user:manage'],
    },
  },
  {
    path: 'utilisateurs/profils/:id',
    name: 'users-role',
    component: () => import('./views/RolePermissionsView.vue'),
    props: true,
    meta: { titleKey: 'users.role.title', permissions: ['user:manage'] },
  },
  {
    path: 'utilisateurs/:id',
    name: 'users-detail',
    component: () => import('./views/UserDetailView.vue'),
    props: true,
    meta: { titleKey: 'users.detail.title', permissions: ['user:manage'] },
  },
];
