import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
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
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['src/**/__tests__/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'cobertura'],
      reportsDirectory: './coverage',
      // Le socle est ce qui casse en silence quand il casse : on l'exige couvert.
      // Les vues sont volontairement hors seuil — leur valeur se mesure à l'œil,
      // pas au pourcentage, et un seuil sur les `.vue` pousse à écrire des tests
      // de rendu sans intention.
      include: ['src/core/**/*.ts', 'src/shared/**/*.ts'],
      /**
       * Exclus du SEUIL, pas du dépôt : ces fichiers n'ont aucune logique à
       * exercer. Les couvrir demanderait des tests qui affirment qu'une
       * constante vaut ce qu'elle vaut — du chiffre, pas de la confiance.
       *  • `locales/` et `permissions.ts` : des données ;
       *  • `index.ts` : des ré-exports ;
       *  • `i18n/index.ts` : du câblage de greffon, exercé par le build.
       */
      exclude: [
        'src/**/*.d.ts',
        'src/core/i18n/**',
        'src/core/rbac/permissions.ts',
        'src/**/index.ts',
        'src/**/types.ts',
      ],
      thresholds: { statements: 80, branches: 75, functions: 80, lines: 80 },
    },
  },
});
