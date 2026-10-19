import { z } from 'zod';

/**
 * Contrats du module Utilisateurs (BSG-12), recopiés depuis le backend
 * `gaatshort-backend` — branche `feature/bsg-12-utilisateurs-comptes-roles-permissions` :
 *  • `src/modules/iam/presentation/http/admin-access.controller.ts` → routes ;
 *  • `src/modules/iam/presentation/http/dto/admin-access.dto.ts`    → corps et filtres ;
 *  • `src/modules/iam/application/queries/admin-access.query.ts`    → réponses.
 *
 * ⚠ Aucune table rôle → permissions ici. Le mapping vit en base, côté
 * backend : on le LIT (`GET /admin/roles`), on ne le recalcule jamais.
 * `@core/rbac/permissions.ts` ne sert qu'à typer les gardes d'affichage.
 */

export const USER_SORT_FIELDS = ['createdAt', 'lastLoginAt', 'email', 'lastName'] as const;
export const USER_STATUSES = ['PENDING', 'ACTIVE', 'SUSPENDED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number] | 'DELETED';

/** Raison pour laquelle l'appelant ne peut pas administrer ce compte (calculée par l'API). */
export type ManageBlocker = 'OUTRANKS' | 'OUT_OF_SCOPE' | null;

export interface UserRoleRef {
  readonly key: string;
  readonly name: string;
  readonly grantedAt: string;
}

export interface UserListItem {
  readonly id: string;
  readonly email: string | null;
  readonly phoneE164: string | null;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly status: UserStatus;
  readonly countryCode: string | null;
  readonly allCountries: boolean;
  readonly countryScope: readonly string[];
  /** Pays visibles au PROCHAIN jeton ; `null` = tous. */
  readonly effectiveCountries: readonly string[] | null;
  readonly lastLoginAt: string | null;
  readonly createdAt: string;
  readonly isSelf: boolean;
  readonly roles: readonly UserRoleRef[];
  readonly manageable: {
    readonly canManage: boolean;
    readonly reason: ManageBlocker;
    readonly canEditCountries: boolean;
  };
}

export interface UserDetail extends UserListItem {
  /** Permissions effectives, calculées PAR L'API à partir des rôles en base. */
  readonly effectivePermissions: readonly string[];
  readonly activeSessions: number;
}

export interface RoleView {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly isSystem: boolean;
  /** Liste de permissions non modifiable (SUPER_ADMIN). */
  readonly locked: boolean;
  readonly userCount: number;
  readonly permissions: readonly string[];
  /** L'appelant peut-il attribuer ce rôle ? (anti-escalade, calculé par l'API) */
  readonly assignable: boolean;
  readonly updatedAt: string;
}

export interface PermissionView {
  readonly key: string;
  readonly resource: string;
  readonly action: string;
  readonly description: string | null;
  /** L'appelant la possède, donc peut la cocher ou la décocher. */
  readonly grantable: boolean;
}

export interface TenantCountry {
  readonly countryCode: string;
  readonly isDefault: boolean;
}

export interface UserFilters extends Record<string, unknown> {
  roles?: string[];
  statuses?: string[];
  search?: string;
  countryCode?: string;
}

// ─────────────────────────── Schémas Zod ───────────────────────────

const ROLE_KEY = /^[A-Z][A-Z0-9_]{2,39}$/;
const COUNTRY = /^[A-Z]{2}$/;
const E164 = /^\+[1-9]\d{6,14}$/;

const profile = {
  firstName: z.string().trim().max(80).nullable(),
  lastName: z.string().trim().max(80).nullable(),
  phoneE164: z.string().regex(E164).nullable(),
  countryCode: z.string().regex(COUNTRY).nullable(),
};

/** `.strict()` : ni mot de passe, ni périmètre, ni tenant ne passent par là. */
export const createUserSchema = z
  .object({
    email: z.string().trim().email().max(254),
    roleKeys: z.array(z.string().regex(ROLE_KEY)).max(10),
    ...profile,
  })
  .strict();
export type CreateUserPayload = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object(profile).strict();
export type UpdateUserPayload = z.infer<typeof updateUserSchema>;

export const createRoleSchema = z
  .object({
    key: z.string().regex(ROLE_KEY),
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(300).nullable(),
    copyFrom: z.string().regex(ROLE_KEY).optional(),
  })
  .strict();
export type CreateRolePayload = z.infer<typeof createRoleSchema>;

export const countriesSchema = z
  .object({ allCountries: z.boolean(), countryScope: z.array(z.string().regex(COUNTRY)).max(50) })
  .strict();
export type CountriesPayload = z.infer<typeof countriesSchema>;
