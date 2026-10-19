import { createI18n } from 'vue-i18n';
import fr from './locales/fr';

/**
 * Français seul pour l'instant, mais l'infrastructure est posée : le backend
 * est multilingue (`locale` sur les gabarits de notification, les activités,
 * le contenu CMS) et le produit vise plusieurs pays. Ajouter une langue ne
 * doit pas demander de retoucher les écrans — d'où l'interdiction, dès
 * maintenant, d'écrire un libellé en dur dans un composant.
 */
export const i18n = createI18n({
  legacy: false,
  locale: 'fr',
  fallbackLocale: 'fr',
  messages: { fr },

  /**
   * Dates et montants passent par `$d` / `$n`, jamais par `toLocaleString()`
   * appelé au hasard dans un composant : un back-office qui affiche
   * `01/02/2026` dans un tableau et `2026-02-01` dans une fiche fait douter
   * l'utilisateur de la donnée elle-même.
   */
  datetimeFormats: {
    fr: {
      short: { dateStyle: 'short' },
      long: { dateStyle: 'medium', timeStyle: 'short' },
      time: { timeStyle: 'short' },
    },
  },
  numberFormats: {
    fr: {
      decimal: { style: 'decimal', maximumFractionDigits: 2 },
      percent: { style: 'percent', maximumFractionDigits: 1 },
    },
  },

  // Les clés manquantes doivent se voir en développement, pas se fondre dans
  // le décor en affichant la clé brute à l'utilisateur final.
  missingWarn: import.meta.env.DEV,
  fallbackWarn: import.meta.env.DEV,
});

export type MessageSchema = typeof fr;
