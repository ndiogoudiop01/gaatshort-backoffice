import { createApp } from 'vue';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import ToastService from 'primevue/toastservice';
import ConfirmationService from 'primevue/confirmationservice';

import App from './App.vue';
import { createAppRouter } from '@app/router';
import { i18n } from '@core/i18n';
import { vCan } from '@core/rbac';
import { config } from '@core/config';
import { GaatshortPreset } from '@core/theme/preset';

import 'primeicons/primeicons.css';
import './style.css';

const app = createApp(App);

app.use(createPinia());
app.use(i18n);

app.use(PrimeVue, {
  theme: {
    preset: GaatshortPreset,
    options: {
      /**
       * `darkModeSelector` doit viser le même sélecteur que Tailwind
       * (`tailwind.config.js` → `darkMode: ['selector', '[data-theme="dark"]']`).
       * S'ils divergent, la moitié de l'interface bascule en sombre et l'autre
       * non — un défaut visuel difficile à rattacher à sa cause.
       */
      darkModeSelector: '[data-theme="dark"]',
      /**
       * Les couches CSS garantissent que Tailwind l'emporte sur PrimeVue en
       * cas de conflit. Sans cela, une classe utilitaire (`p-2`, `text-sm`)
       * peut perdre contre le style d'un composant et l'on se retrouve à
       * écrire des `!important`.
       */
      cssLayer: { name: 'primevue', order: 'tailwind-base, primevue, tailwind-utilities' },
    },
  },
  ripple: false,
});

app.use(ToastService);
app.use(ConfirmationService);
app.directive('can', vCan);

// Le routeur est monté en dernier, et créé ici seulement : ses gardes
// appellent le magasin d'authentification, qui a besoin de Pinia, et
// traduisent des titres, qui ont besoin d'i18n. L'instancier plus haut dans
// le fichier marcherait par chance, pas par construction.
app.use(createAppRouter());

app.mount('#app');

if (!config.app.isProduction) {
  console.info(
    `[${config.app.name}] environnement : ${config.app.env}, API : ${config.api.baseUrl}`,
  );
}
