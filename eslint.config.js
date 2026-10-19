import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript';
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting';

/**
 * Le backend fait respecter ses frontières de modules par ESLint et
 * dependency-cruiser, et les deux sont bloquants en CI. On applique ici la
 * même discipline, avec les règles qui comptent le plus pour un front
 * modulaire :
 *
 *   1. un module métier ne connaît jamais un autre module métier ;
 *   2. le socle ne connaît aucun module métier ;
 *   3. les briques partagées ne connaissent ni modules, ni racine de composition.
 *
 * Sans ces barrières, `applications` finit par importer un composant de
 * `partners` « juste pour un badge », et les deux ne peuvent plus évoluer
 * séparément. La communication passe par `core` (état partagé, contrats) ou
 * `shared` (briques sans métier).
 *
 * Sens autorisé : app → modules → shared → core. Jamais l'inverse.
 */
export default defineConfigWithVueTs(
  { name: 'app/files', files: ['**/*.{ts,mts,vue}'] },
  {
    name: 'app/ignores',
    ignores: ['dist/**', 'coverage/**', 'reports/**', 'node_modules/**'],
  },

  js.configs.recommended,
  pluginVue.configs['flat/recommended'],
  vueTsConfigs.recommended,
  skipFormatting,

  {
    name: 'app/rules',
    rules: {
      'vue/multi-word-component-names': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Un `any` explicite est parfois la réponse honnête ; un `any` implicite
      // ne l'est jamais. On interdit le premier en avertissement pour qu'il
      // reste visible en revue sans bloquer une intégration urgente.
      '@typescript-eslint/no-explicit-any': 'warn',
      // BSG-9 — `v-html` injecte du HTML tel quel : sur une donnée d'API, c'est
      // une faille XSS. Interdit partout ; la seule exception est
      // `shared/components/rich-text/SanitizedHtml.vue`, qui assainit d'abord
      // (DOMPurify + politique de balises explicite).
      'vue/no-v-html': 'error',
    },
  },

  {
    name: 'app/boundaries-modules',
    files: ['src/modules/**/*.{ts,vue}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@modules/*/**'],
              message:
                "Frontière de module : un module ne peut pas importer les entrailles d'un autre. Passez par @core (état, contrats) ou @shared (briques sans métier).",
            },
            {
              group: ['@app/**'],
              message:
                'Un module ne connaît pas la racine de composition : ce serait un cycle (app assemble les modules).',
            },
            {
              group: ['../../*/**'],
              message:
                'Remontée hors du module par chemin relatif. Utilisez un alias (@core, @shared) pour que la frontière reste lisible.',
            },
          ],
        },
      ],
    },
  },

  {
    name: 'app/boundaries-core',
    files: ['src/core/**/*.{ts,vue}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@modules/**', '@/modules/**', '@app/**', '@shared/**'],
              message:
                "Inversion de dépendance : le socle ne connaît ni les modules métier, ni les briques partagées, ni l'assemblage. Si core en a besoin, c'est que la chose appartient à core.",
            },
          ],
        },
      ],
    },
  },

  {
    name: 'app/boundaries-shared',
    files: ['src/shared/**/*.{ts,vue}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@modules/**', '@/modules/**', '@app/**'],
              message:
                'Une brique partagée ne connaît aucun module ni la racine de composition — sinon elle n’est pas partagée, elle appartient à ce module.',
            },
          ],
        },
      ],
    },
  },
);
