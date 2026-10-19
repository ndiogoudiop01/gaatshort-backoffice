import { definePreset, palette } from '@primevue/themes';
import Aura from '@primevue/themes/aura';

/**
 * Thème clair du back-office Gaatshort — 04-UI-UX-Design §2.1 (colonne « claire »).
 *
 * Accent « bissap » : `#B81E47` en clair (contraste ≥ 4,5:1 avec le blanc, WCAG AA),
 * dérivé de l'accent de l'application `#E0325E`. `palette()` génère les nuances 50 → 950
 * à partir d'un seul hexadécimal ; les rôles sémantiques (couleur, survol, actif) sont
 * ensuite fixés explicitement pour garantir les contrastes vérifiés dans le design system.
 *
 * Le back-office garde l'identité de la PLATEFORME : il n'applique pas le branding des
 * marques, qui ne concerne que les écrans utilisateurs (§2.1, dernier paragraphe).
 */
const bissap = palette('#E0325E');

export const GaatshortPreset = definePreset(Aura, {
  semantic: {
    primary: bissap,
    colorScheme: {
      light: {
        primary: {
          color: '#B81E47',
          contrastColor: '#ffffff',
          hoverColor: '#8E1636',
          activeColor: '#741129',
        },
        surface: {
          0: '#ffffff',
          50: '#F7F5FA',
          100: '#EFEAF4',
          200: '#DCD3E5',
          300: '#C4B8D1',
          400: '#9C8FAA',
          500: '#7A6D88',
          600: '#5E5369',
          700: '#463D50',
          800: '#2F2639',
          900: '#1A1422',
          950: '#0F0B14',
        },
      },
      dark: {
        primary: {
          color: '#E0325E',
          contrastColor: '#ffffff',
          hoverColor: '#E8597C',
          activeColor: '#EF7F99',
        },
      },
    },
  },
});
