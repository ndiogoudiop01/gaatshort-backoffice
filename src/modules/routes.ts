import type { RouteRecordRaw } from 'vue-router';
import type { Permission } from '@core/rbac';
import type { Role } from '@core/auth/types';
import { tenantRoutes } from './tenants/routes';
import { userRoutes } from './users/routes';

/**
 * Catalogue des modules du back-office.
 *
 * `users` et `tenants` sont repris du socle et servent de patron. Les écrans Gaatshort
 * (04-UI-UX-Design §11 : BO-02 à BO-17) arrivent phase par phase. Pour un nouveau module, on le
 * DÉCLARE d'abord ici dans `PLACEHOLDERS` — route,
 * permissions, place dans le menu — avant d'écrire son écran. Ce n'est pas un raccourci : la matrice de
 * droits est la partie qu'on se trompe le plus facilement, et la déclarer maintenant permet
 * de la vérifier rôle par rôle avant qu'un seul tableau ne soit dessiné.
 *
 * Écrire un module, c'est donc retirer une ligne de `PLACEHOLDERS` et ajouter
 * un `routes.ts` à côté du sien — pas réorganiser ce fichier.
 */

interface PlaceholderModule {
  readonly path: string;
  readonly name: string;
  readonly titleKey: string;
  readonly icon: string;
  readonly section: NonNullable<RouteRecordRaw['meta']>['section'];
  readonly permissions?: readonly Permission[];
  readonly roles?: readonly Role[];
}

const PLACEHOLDERS: readonly PlaceholderModule[] = [];

function toPlaceholderRoute(module: PlaceholderModule): RouteRecordRaw {
  return {
    path: module.path,
    name: module.name,
    component: () => import('@shared/views/PlaceholderView.vue'),
    meta: {
      titleKey: module.titleKey,
      icon: module.icon,
      section: module.section,
      nav: true,
      permissions: module.permissions,
      roles: module.roles,
    },
  };
}

/**
 * L'ordre de ce tableau est celui du menu ET celui qu'emprunte la redirection
 * d'accueil.
 */
export const moduleRoutes: RouteRecordRaw[] = [
  ...userRoutes,
  ...tenantRoutes,
  ...PLACEHOLDERS.map(toPlaceholderRoute),
];
