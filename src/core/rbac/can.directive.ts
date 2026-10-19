import type { Directive, DirectiveBinding } from 'vue';
import { useAuthStore } from '@core/auth/auth.store';
import type { Permission } from './permissions';

type CanValue = Permission | readonly Permission[];

/**
 * `v-can="PERMISSIONS.POOL_EXPORT"` retire l'élément du DOM si la permission
 * manque.
 *
 * On RETIRE plutôt qu'on ne masque (`display: none`) : un bouton masqué reste
 * atteignable au clavier et lisible par un lecteur d'écran, ce qui promet une
 * action que l'API refusera.
 *
 * Volontairement non réactif : les permissions ne changent qu'au
 * rafraîchissement du jeton, lequel s'accompagne d'un remontage des écrans
 * concernés. Une directive réactive coûterait un observateur par bouton pour
 * un cas qui ne se produit pas.
 */
function resolve(binding: DirectiveBinding<CanValue>): boolean {
  const auth = useAuthStore();
  const required = Array.isArray(binding.value) ? binding.value : [binding.value as Permission];
  return required.every((permission) => auth.permissions.has(permission));
}

export const vCan: Directive<HTMLElement, CanValue> = {
  mounted(el, binding) {
    if (!resolve(binding)) el.remove();
  },
};
