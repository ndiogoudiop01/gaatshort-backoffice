import type { RouteRecordRaw } from 'vue-router';
import { moduleRoutes } from '@/modules/routes';
import { landingRoute } from './landing';

/**
 * Carte des écrans.
 *
 * Tout ce qui exige une session vit sous la coquille `AppLayout` : la
 * navigation latérale, l'en-tête et le bandeau d'environnement ne sont donc
 * pas à rebrancher écran par écran, et un module qui oublie de les inclure
 * n'existe pas.
 */
export const routes: RouteRecordRaw[] = [
  {
    path: '/connexion',
    name: 'login',
    component: () => import('@core/auth/views/LoginView.vue'),
    meta: { public: true, titleKey: 'auth.signIn' },
  },

  {
    path: '/',
    component: () => import('@shared/layouts/AppLayout.vue'),
    children: [
      {
        /**
         * L'accueil est résolu dans `beforeEnter`, PAS dans `redirect`.
         *
         * Vue Router résout `redirect` pendant la mise en correspondance de
         * l'URL, c'est-à-dire AVANT les gardes — donc avant que `sessionGuard`
         * ait restauré la session sur un rechargement de page. Les permissions
         * seraient alors vides et tout le monde atterrirait sur « accès
         * refusé ». `beforeEnter`, lui, s'exécute après les `beforeEach`
         * globaux : les droits y sont connus.
         *
         * Le composant n'est donc jamais rendu — la garde redirige toujours.
         * Il reste déclaré parce qu'une route doit en avoir un, et parce qu'un
         * jour où la garde échouerait, un écran de chargement vaut mieux
         * qu'une page blanche.
         */
        path: '',
        name: 'home',
        component: () => import('@shared/views/LoadingView.vue'),
        beforeEnter: () => landingRoute(),
      },
      ...moduleRoutes,
    ],
  },

  {
    path: '/acces-refuse',
    name: 'forbidden',
    component: () => import('@shared/views/ForbiddenView.vue'),
    meta: { titleKey: 'errors.forbiddenTitle' },
  },

  {
    /**
     * Publique à dessein : une URL erronée doit dire « cette page n'existe
     * pas », pas rediriger vers la connexion. Renvoyer un visiteur non
     * authentifié vers l'écran de connexion pour une faute de frappe lui
     * ferait croire que la page existe et qu'il n'y a pas droit.
     */
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@shared/views/NotFoundView.vue'),
    meta: { public: true, titleKey: 'errors.notFoundTitle' },
  },
];
