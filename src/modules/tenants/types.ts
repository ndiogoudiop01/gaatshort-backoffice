import { z } from 'zod';

/**
 * Contrats du module Organisations (BSG-13), recopiés depuis le backend
 * `gaatshort-backend` — branche `feature/bsg-13-organisations-administration-tenants` :
 *  • `src/modules/tenancy/presentation/http/tenants.controller.ts`   → routes ;
 *  • `src/modules/tenancy/presentation/http/dto/admin-tenant.dto.ts` → corps et filtres ;
 *  • `src/modules/tenancy/domain/services/tenant-admin-rules.ts`     → liste blanche.
 *
 * ⚠ `PATCH /admin/tenants/:id` s'exécute en `$privileged()` (il franchit
 * l'isolation multi-tenant). Le backend valide désormais son corps (BSG-13),
 * mais le front reste un filtre à part entière : schéma `.strict()`, liste
 * blanche explicite, payload construit champ par champ.
 */

export const TENANT_STATUSES = ['ACTIVE', 'SUSPENDED', 'ARCHIVED'] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const TENANT_SORT_FIELDS = ['name', 'slug', 'status', 'createdAt', 'updatedAt'] as const;

/**
 * SEULS champs que l'écran peut modifier. Absents à dessein : `slug`
 * (sous-domaine et clés de cache), `isolation`, `schemaName`, `settings`,
 * les domaines, `id`, `createdAt`.
 */
export const TENANT_EDITABLE_FIELDS = [
  'name',
  'legalName',
  'status',
  'defaultLocale',
  'defaultCountry',
  'defaultCurrency',
  'timezone',
  'branding',
  'featureFlags',
] as const;
export type TenantEditableField = (typeof TENANT_EDITABLE_FIELDS)[number];

export interface TenantDomain {
  readonly domain: string;
  readonly isPrimary: boolean;
  readonly verifiedAt: string | null;
}

export interface TenantView {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly legalName: string | null;
  readonly status: TenantStatus;
  readonly isolation: 'SHARED_RLS' | 'SCHEMA';
  readonly defaultLocale: string;
  readonly defaultCountry: string;
  readonly defaultCurrency: string;
  readonly timezone: string;
  readonly branding: { readonly primaryColor: string | null; readonly logoUrl: string | null };
  readonly featureFlags: Readonly<Record<string, boolean>>;
  readonly domains: readonly TenantDomain[];
  readonly userCount: number;
  /** Organisation de la session courante : ne peut pas être suspendue d'ici (API : 422). */
  readonly isCurrent: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TenantReference {
  readonly countries: readonly { code: string; name: string; flag: string; currencyCode: string }[];
  readonly currencies: readonly { code: string; name: string; symbol: string }[];
}

export interface TenantFilters extends Record<string, unknown> {
  statuses?: TenantStatus[];
  search?: string;
}

// ─────────────────────────── Schéma Zod ───────────────────────────

const HEX = /^#[0-9A-Fa-f]{6}$/;
const HTTPS = /^https:\/\/[^\s]+$/;
const FLAG_KEY = /^[a-zA-Z][a-zA-Z0-9]{1,40}$/;

/**
 * Corps de `PATCH /admin/tenants/:id`. `.strict()` à TOUS les niveaux : un
 * champ hors liste (à la racine ou dans `branding`) fait échouer l'appel
 * AVANT le réseau.
 */
export const tenantPatchSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    legalName: z.string().trim().max(200).nullable().optional(),
    status: z.enum(TENANT_STATUSES).optional(),
    defaultLocale: z
      .string()
      .regex(/^[a-z]{2}(-[A-Z]{2})?$/)
      .optional(),
    defaultCountry: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
    defaultCurrency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    timezone: z.string().min(1).max(64).optional(),
    branding: z
      .object({
        primaryColor: z.string().regex(HEX).nullable().optional(),
        logoUrl: z.string().max(2048).regex(HTTPS).nullable().optional(),
      })
      .strict()
      .optional(),
    featureFlags: z
      .record(z.string().regex(FLAG_KEY), z.boolean())
      .refine((flags) => Object.keys(flags).length <= 30)
      .optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Aucune modification' });

export type TenantPatch = z.infer<typeof tenantPatchSchema>;
