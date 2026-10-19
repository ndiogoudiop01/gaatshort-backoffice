import { createRouter, createWebHistory, type Router } from 'vue-router';
import { permissionsGuard, sessionGuard, titleGuard } from '@core/router';
import { i18n } from '@core/i18n';
import { routes } from './routes';

/**
 * Racine de composition du routeur.
 *
 * L'ordre d'enregistrement des gardes reproduit celui des gardes globaux du
 * backend : session d'abord, droits ensuite. Un écran refusé ici l'est donc
 * pour la même raison que l'API le refuserait, et le message n'a pas à être
 * réinventé de deux façons différentes.
 */
export function createAppRouter(): Router {
  const router = createRouter({
    history: createWebHistory(),
    routes,
    scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
  });

  router.beforeEach(sessionGuard);
  router.beforeEach(permissionsGuard);
  router.afterEach((to) => {
    titleGuard(to, (key) => i18n.global.t(key));
  });

  return router;
}
