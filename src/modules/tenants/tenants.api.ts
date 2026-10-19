import { api } from '@core/http';
import {
  tenantPatchSchema,
  type TenantPatch,
  type TenantReference,
  type TenantView,
} from './types';

/**
 * Seul point du module qui connaît des URL.
 *
 * Routes (backend BSG-13), toutes sous le RÔLE `SUPER_ADMIN` (`@RequireRoles`),
 * jamais sous la permission `tenant:manage` — qui n'est vérifiée nulle part :
 *  • `GET   /admin/tenants`           — liste, OFFSET (via `useOffsetQuery`) ;
 *  • `GET   /admin/tenants/reference` — pays actifs et devises ;
 *  • `GET   /admin/tenants/:id`       — une organisation ;
 *  • `PATCH /admin/tenants/:id`       — modification (liste blanche).
 *
 * AUCUN en-tête `x-tenant-id` ici : une fois connecté, le jeton fait foi, et
 * un en-tête qui diverge du jeton est refusé par le backend ET journalisé
 * comme tentative d'intrusion. Administrer une autre organisation passe par
 * son identifiant dans l'URL, sous `$privileged()` côté serveur — jamais par
 * un changement de tenant de la requête.
 */
export const TENANTS_URL = '/admin/tenants';

const byId = (id: string) => `${TENANTS_URL}/${encodeURIComponent(id)}`;

export const tenantsApi = {
  detail(id: string): Promise<TenantView> {
    return api.get<TenantView>(byId(id));
  },

  reference(): Promise<TenantReference> {
    return api.get<TenantReference>(`${TENANTS_URL}/reference`);
  },

  /**
   * Revalidé ICI par le schéma strict : dernière porte avant le réseau. Un
   * champ hors liste blanche rejette la promesse, sans requête.
   */
  async update(id: string, patch: TenantPatch): Promise<TenantView> {
    return api.patch<TenantView>(byId(id), tenantPatchSchema.parse(patch));
  },
};
