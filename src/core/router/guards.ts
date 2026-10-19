import type { NavigationGuardWithThis, RouteLocationNormalized } from 'vue-router';
import { useAuthStore } from '@core/auth/auth.store';
import { config } from '@core/config';

/**
 * Les gardes sont enchaînés dans le MÊME ordre que les gardes globaux du
 * backend (`TenantThrottlerGuard → JwtAuthGuard → TenantMemberGuard →
 * PermissionsGuard`), moins le plafonnement de débit, qui n'a pas de sens ici :
 *
 *   1. session  — qui es-tu ?
 *   2. droits   — as-tu le droit d'ouvrir cet écran ?
 *
 * Garder l'ordre du backend n'est pas une coquetterie : c'est ce qui fait
 * qu'un écran refusé côté front l'est pour la même raison que côté API, et
 * qu'un message d'erreur n'a pas à être réinventé.
 */

function requiresSession(to: RouteLocationNormalized): boolean {
  return !to.matched.some((record) => record.meta.public === true);
}

/** 1. Session — restaure au besoin, puis renvoie vers la connexion. */
export const sessionGuard: NavigationGuardWithThis<undefined> = async (to) => {
  const auth = useAuthStore();

  // Sur un rechargement de page, le jeton d'accès (en mémoire) a disparu mais
  // le jeton de rafraîchissement, lui, est toujours là. Sans cette étape, le
  // garde conclurait à tort que l'utilisateur n'est pas connecté.
  await auth.bootstrap();

  if (!requiresSession(to)) {
    // Déjà connecté et on demande l'écran de connexion : on renvoie à l'accueil.
    return auth.isAuthenticated && to.name === 'login' ? { name: 'home' } : true;
  }

  if (auth.isAuthenticated) return true;

  return {
    name: 'login',
    // `redirect` permet de revenir là où l'utilisateur voulait aller. On ne
    // conserve que le chemin : rejouer une URL absolue fournie par un tiers
    // serait une redirection ouverte.
    query: to.fullPath === '/' ? {} : { redirect: to.fullPath },
  };
};

/** 2. Droits — permissions (toutes) et rôles (au moins un). */
export const permissionsGuard: NavigationGuardWithThis<undefined> = (to) => {
  const auth = useAuthStore();
  if (!requiresSession(to)) return true;

  const required = to.matched.flatMap((record) => record.meta.permissions ?? []);
  const requiredRoles = to.matched.flatMap((record) => record.meta.roles ?? []);

  const hasPermissions = required.every((permission) => auth.permissions.has(permission));
  const hasRole = requiredRoles.length === 0 || requiredRoles.some((role) => auth.roles.has(role));

  if (hasPermissions && hasRole) return true;

  // On ne renvoie PAS vers la connexion : l'utilisateur est bien authentifié,
  // il lui manque un droit. Confondre les deux ferait boucler une session
  // valide sur l'écran de connexion sans jamais expliquer pourquoi.
  return { name: 'forbidden', query: { from: to.fullPath } };
};

/** 3. Titre de l'onglet — pas un garde de sécurité, mais le bon endroit. */
export const titleGuard = (
  to: RouteLocationNormalized,
  translate: (key: string) => string,
): void => {
  const key = [...to.matched].reverse().find((record) => record.meta.titleKey)?.meta.titleKey;
  document.title = key ? `${translate(key)} · ${config.app.name}` : config.app.name;
};
