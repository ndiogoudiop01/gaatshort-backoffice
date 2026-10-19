import type { RouteLocationRaw } from 'vue-router';
import { useAuthStore } from '@core/auth/auth.store';
import { moduleRoutes } from '@/modules/routes';

/**
 * Où atterrit « / » ?
 *
 * Pas forcément sur le pilotage : celui-ci exige `metrics:read`, que tous les
 * rôles n'ont pas. Un gestionnaire qui se connecte tomberait alors sur
 * « Accès refusé » — un écran d'erreur en guise d'accueil, pour un compte
 * pourtant parfaitement valide.
 *
 * On choisit donc la première entrée de navigation que l'utilisateur peut
 * réellement ouvrir. C'est la même lecture de `meta` que le garde de droits
 * et que la barre latérale : les trois ne peuvent pas se contredire.
 */
export function landingRoute(): RouteLocationRaw {
  const auth = useAuthStore();

  const reachable = moduleRoutes.find((route) => {
    if (route.meta?.nav !== true || !route.name) return false;

    const permissions = route.meta.permissions ?? [];
    const roles = route.meta.roles ?? [];

    return (
      permissions.every((permission) => auth.permissions.has(permission)) &&
      (roles.length === 0 || roles.some((role) => auth.roles.has(role)))
    );
  });

  // Aucune entrée accessible : c'est le cas du rôle PARTNER, qui n'a AUCUNE
  // permission au catalogue du backend. Mieux vaut l'écran « accès refusé »,
  // qui explique, qu'une boucle de redirection qui n'explique rien.
  return reachable?.name ? { name: reachable.name } : { name: 'forbidden' };
}
