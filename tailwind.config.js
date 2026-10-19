import primeui from 'tailwindcss-primeui';

/**
 * Tailwind pilote la MISE EN PAGE (grilles, espacements, états) ; PrimeVue
 * pilote les COMPOSANTS. Les deux partagent la même palette grâce au plugin
 * `tailwindcss-primeui`, qui expose les jetons du thème PrimeVue
 * (`--p-primary-500`…) en classes Tailwind (`bg-primary-500`).
 *
 * Conséquence pratique : on ne redéfinit JAMAIS une couleur en dur ici. Changer
 * le thème d'un tenant (branding renvoyé par `GET /admin/tenants/current`) doit
 * suffire à retinter toute l'application.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [primeui],
};
