import { computed, type ComputedRef } from 'vue';
import { useAuthStore } from '@core/auth/auth.store';
import type { Role } from '@core/auth/types';
import type { Permission } from './permissions';

/**
 * Autorisation côté interface.
 *
 * À lire avant d'en dépendre : **ceci n'est pas une sécurité**. C'est du
 * confort — on n'affiche pas un bouton qui produirait un 403. La seule
 * autorisation qui compte est celle du backend (`PermissionsGuard`), et elle
 * s'applique de toute façon. Un front compromis ne doit rien pouvoir obtenir
 * de plus qu'un `curl`.
 *
 * Sémantique alignée sur `PermissionsGuard` : TOUTES les permissions exigées
 * (`every`), AU MOINS UN des rôles exigés (`some`).
 */
export function useCan() {
  const auth = useAuthStore();

  function can(...required: readonly Permission[]): boolean {
    if (required.length === 0) return true;
    return required.every((permission) => auth.permissions.has(permission));
  }

  function hasRole(...required: readonly Role[]): boolean {
    if (required.length === 0) return true;
    return required.some((role) => auth.roles.has(role));
  }

  /**
   * Un ADMIN n'a PAS `application:read:own` — les routes candidat lui sont
   * fermées, et c'est voulu. Ce raccourci évite qu'on « corrige » cette
   * surprise en ajoutant la permission au rôle côté backend.
   */
  const isPlatformAdmin = computed(() => hasRole('ADMIN', 'SUPER_ADMIN'));

  return { can, hasRole, isPlatformAdmin };
}

/** Variante réactive, pour un `v-if` qui doit suivre un changement de session. */
export function useCanRef(...required: readonly Permission[]): ComputedRef<boolean> {
  const auth = useAuthStore();
  return computed(() => required.every((permission) => auth.permissions.has(permission)));
}
