import { api } from '@core/http';
import {
  countriesSchema,
  createRoleSchema,
  createUserSchema,
  updateUserSchema,
  type CountriesPayload,
  type CreateRolePayload,
  type CreateUserPayload,
  type PermissionView,
  type RoleView,
  type TenantCountry,
  type UpdateUserPayload,
  type UserDetail,
} from './types';

/**
 * Seul point du module qui connaît des URL.
 *
 * Routes (backend BSG-12), TOUTES sous `user:manage` :
 *  • `GET    /admin/users`                     — comptes, OFFSET (via `useOffsetQuery`) ;
 *  • `GET    /admin/users/countries`           — pays du tenant ;
 *  • `GET    /admin/users/:id`                 — compte + permissions effectives (calculées par l'API) ;
 *  • `POST   /admin/users`                     — création SANS mot de passe ;
 *  • `PATCH  /admin/users/:id`                 — profil ;
 *  • `PUT    /admin/users/:id/roles`           — rôles (effet au prochain jeton) ;
 *  • `PATCH  /admin/users/:id/status`          — activer / suspendre ;
 *  • `PUT    /admin/users/:id/countries`       — périmètre pays (SUPER_ADMIN) ;
 *  • `POST   /admin/users/:id/sessions/revoke` — déconnecter partout ;
 *  • `GET    /admin/roles`, `GET /admin/permissions` — profils et catalogue ;
 *  • `POST   /admin/roles`, `PATCH|DELETE /admin/roles/:id`, `PUT /admin/roles/:id/permissions`.
 *
 * Il n'y a PAS de route « réinitialiser le mot de passe » : l'authentification
 * est sans mot de passe (`POST /auth/challenge` puis `/auth/verify`).
 */
export const USERS_URL = '/admin/users';
export const ROLES_URL = '/admin/roles';
export const PERMISSIONS_URL = '/admin/permissions';

const userUrl = (id: string) => `${USERS_URL}/${encodeURIComponent(id)}`;
const roleUrl = (id: string) => `${ROLES_URL}/${encodeURIComponent(id)}`;

export const usersApi = {
  detail(id: string): Promise<UserDetail> {
    return api.get<UserDetail>(userUrl(id));
  },

  countries(): Promise<TenantCountry[]> {
    return api.get<TenantCountry[]>(`${USERS_URL}/countries`);
  },

  async create(payload: CreateUserPayload): Promise<UserDetail> {
    return api.post<UserDetail>(USERS_URL, createUserSchema.parse(payload));
  },

  async update(id: string, payload: UpdateUserPayload): Promise<UserDetail> {
    return api.patch<UserDetail>(userUrl(id), updateUserSchema.parse(payload));
  },

  setRoles(id: string, roleKeys: readonly string[]): Promise<UserDetail> {
    return api.put<UserDetail>(`${userUrl(id)}/roles`, { roleKeys: [...roleKeys] });
  },

  setStatus(id: string, status: 'ACTIVE' | 'SUSPENDED'): Promise<UserDetail> {
    return api.patch<UserDetail>(`${userUrl(id)}/status`, { status });
  },

  async setCountries(id: string, payload: CountriesPayload): Promise<UserDetail> {
    return api.put<UserDetail>(`${userUrl(id)}/countries`, countriesSchema.parse(payload));
  },

  revokeSessions(id: string): Promise<{ revoked: number }> {
    return api.post(`${userUrl(id)}/sessions/revoke`);
  },

  roles(): Promise<RoleView[]> {
    return api.get<RoleView[]>(ROLES_URL);
  },

  permissions(): Promise<PermissionView[]> {
    return api.get<PermissionView[]>(PERMISSIONS_URL);
  },

  async createRole(payload: CreateRolePayload): Promise<RoleView> {
    return api.post<RoleView>(ROLES_URL, createRoleSchema.parse(payload));
  },

  updateRole(id: string, payload: { name: string; description: string | null }): Promise<RoleView> {
    return api.patch<RoleView>(roleUrl(id), payload);
  },

  setRolePermissions(id: string, permissionKeys: readonly string[]): Promise<RoleView> {
    return api.put<RoleView>(`${roleUrl(id)}/permissions`, { permissionKeys: [...permissionKeys] });
  },

  deleteRole(id: string): Promise<{ id: string; deleted: true }> {
    return api.delete(roleUrl(id));
  },
};
