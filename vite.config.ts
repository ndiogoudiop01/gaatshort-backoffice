import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  return {
    plugins: [vue()],

    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@app': fileURLToPath(new URL('./src/app', import.meta.url)),
        '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
        '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
        '@modules': fileURLToPath(new URL('./src/modules', import.meta.url)),
      },
    },

    server: {
      port: 5173,
      /**
       * En développement, on passe par le proxy Vite plutôt que d'appeler
       * directement `http://localhost:3000`. Deux raisons, et la seconde est la
       * vraie :
       *
       *  1. plus de préflight CORS à chaque requête ;
       *  2. surtout, le front et l'API partagent la même origine, donc le
       *     résolveur de tenant par sous-domaine se comporte comme en
       *     production. En tapant l'API en direct, l'hôte serait `localhost` —
       *     un hôte sans point, que le backend rejette volontairement comme
       *     sous-domaine (cf. docs/01-multi-tenancy.md). On retomberait alors
       *     silencieusement sur l'en-tête `x-tenant-id`, et on ne testerait pas
       *     le même chemin qu'en production.
       */
      proxy: {
        '/api': {
          target: env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000',
          changeOrigin: false,
        },
      },
    },

    build: {
      // Le back-office est servi par nginx derrière CapRover : les sourcemaps
      // sont produites mais NON servies (cf. docker/nginx.conf) — elles servent
      // au dépouillement d'une pile d'erreur remontée par un utilisateur.
      sourcemap: true,
      /**
       * Pas de `manualChunks` pour PrimeVue.
       *
       * Regrouper `primevue/config` (chargé au démarrage) avec
       * `primevue/datatable` (chargé par un seul écran) force les 500 ko du
       * tableau dans le lot initial : chaque utilisateur paie le CRM candidats
       * même pour ouvrir l'écran de connexion. Le découpage automatique de
       * Rollup suit les imports réels et fait mieux.
       *
       * `vendor` reste explicite : vue, le routeur et Pinia sont nécessaires à
       * TOUTES les routes et changent rarement — les isoler donne un lot que
       * le navigateur garde en cache d'un déploiement à l'autre.
       */
      rollupOptions: {
        output: {
          manualChunks: { vendor: ['vue', 'vue-router', 'pinia'] },
        },
      },
    },
  };
});
