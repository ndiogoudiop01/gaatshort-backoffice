import 'vue-router';
import type { Permission } from '@core/rbac';
import type { Role } from '@core/auth/types';

declare module 'vue-router' {
  interface RouteMeta {
    /** Accessible sans session (écran de connexion uniquement). */
    public?: boolean;
    /** Toutes exigées, comme `PermissionsGuard` côté backend. */
    permissions?: readonly Permission[];
    /** Au moins un exigé. Réservé aux routes que le backend protège par rôle. */
    roles?: readonly Role[];
    /** Clé i18n du titre — jamais le libellé en dur. */
    titleKey?: string;
    /** Classe PrimeIcons pour la navigation latérale. */
    icon?: string;
    /** Apparaît dans la navigation latérale. */
    nav?: boolean;
    /** Regroupement dans la navigation. */
    section?: 'pilotage' | 'catalogue' | 'monetisation' | 'audience' | 'plateforme';
  }
}
