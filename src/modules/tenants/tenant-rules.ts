import type { TenantPatch, TenantStatus, TenantView } from './types';

/**
 * Règles d'écran du module Organisations (BSG-13) — fonctions pures.
 *
 * LE point de ce ticket : le PATCH est construit CHAMP PAR CHAMP, en ne
 * gardant que ce qui a changé. Jamais `{ ...form }`, jamais l'objet reçu en
 * GET renvoyé tel quel (il contient `slug`, `isolation`, `domains`… que le
 * serveur écrirait en `$privileged()` si son DTO venait à régresser).
 */

/** État du formulaire : uniquement des champs modifiables, en valeurs d'édition. */
export interface TenantForm {
  name: string;
  legalName: string;
  defaultLocale: string;
  defaultCountry: string;
  defaultCurrency: string;
  timezone: string;
  primaryColor: string;
  logoUrl: string;
  featureFlags: Record<string, boolean>;
}

export function toForm(tenant: TenantView): TenantForm {
  return {
    name: tenant.name,
    legalName: tenant.legalName ?? '',
    defaultLocale: tenant.defaultLocale,
    defaultCountry: tenant.defaultCountry,
    defaultCurrency: tenant.defaultCurrency,
    timezone: tenant.timezone,
    primaryColor: tenant.branding.primaryColor ?? '',
    logoUrl: tenant.branding.logoUrl ?? '',
    featureFlags: { ...tenant.featureFlags },
  };
}

/**
 * PATCH minimal : chaque champ est lu nommément dans `form` puis comparé à
 * l'original. Un champ que `form` porterait en plus (par erreur ou par
 * malveillance : `slug`, `isolation`…) n'est JAMAIS lu, donc jamais transmis.
 */
export function buildTenantPatch(original: TenantView, form: TenantForm): TenantPatch {
  const patch: TenantPatch = {};
  const name = form.name.trim();
  if (name !== original.name) patch.name = name;
  const legalName = form.legalName.trim() || null;
  if (legalName !== original.legalName) patch.legalName = legalName;
  if (form.defaultLocale !== original.defaultLocale) patch.defaultLocale = form.defaultLocale;
  if (form.defaultCountry !== original.defaultCountry) patch.defaultCountry = form.defaultCountry;
  if (form.defaultCurrency !== original.defaultCurrency)
    patch.defaultCurrency = form.defaultCurrency;
  if (form.timezone !== original.timezone) patch.timezone = form.timezone;

  const primaryColor = form.primaryColor.trim() || null;
  const logoUrl = form.logoUrl.trim() || null;
  const branding: NonNullable<TenantPatch['branding']> = {};
  if (primaryColor !== original.branding.primaryColor) branding.primaryColor = primaryColor;
  if (logoUrl !== original.branding.logoUrl) branding.logoUrl = logoUrl;
  if (Object.keys(branding).length) patch.branding = branding;

  const flags: Record<string, boolean> = {};
  for (const key of Object.keys(original.featureFlags)) {
    const next = form.featureFlags[key] === true;
    if (next !== original.featureFlags[key]) flags[key] = next;
  }
  if (Object.keys(flags).length) patch.featureFlags = flags;
  return patch;
}

export const isEmptyPatch = (patch: TenantPatch): boolean => Object.keys(patch).length === 0;

/** Une ligne par changement, pour la confirmation (« avant → après »). */
export interface ChangeLine {
  readonly field: string;
  readonly before: string;
  readonly after: string;
}

export function describeChanges(original: TenantView, patch: TenantPatch): ChangeLine[] {
  const show = (value: unknown) =>
    value === null || value === undefined || value === '' ? '—' : String(value);
  const lines: ChangeLine[] = [];
  const simple = [
    'name',
    'legalName',
    'status',
    'defaultLocale',
    'defaultCountry',
    'defaultCurrency',
    'timezone',
  ] as const;
  for (const field of simple) {
    if (patch[field] !== undefined)
      lines.push({ field, before: show(original[field]), after: show(patch[field]) });
  }
  if (patch.branding?.primaryColor !== undefined) {
    lines.push({
      field: 'primaryColor',
      before: show(original.branding.primaryColor),
      after: show(patch.branding.primaryColor),
    });
  }
  if (patch.branding?.logoUrl !== undefined) {
    lines.push({
      field: 'logoUrl',
      before: show(original.branding.logoUrl),
      after: show(patch.branding.logoUrl),
    });
  }
  for (const [key, value] of Object.entries(patch.featureFlags ?? {})) {
    lines.push({
      field: `flag:${key}`,
      before: show(original.featureFlags[key]),
      after: show(value),
    });
  }
  return lines;
}

/** Suspendre ou archiver coupe l'accès de TOUS les comptes, immédiatement. */
export const cutsAccess = (status: TenantStatus | undefined): boolean =>
  status === 'SUSPENDED' || status === 'ARCHIVED';

/**
 * Saisie délibérée pour couper l'accès : retaper l'identifiant (slug) de
 * l'organisation. Insensible aux espaces autour, sensible au reste.
 */
export const confirmationMatches = (typed: string, slug: string): boolean => typed.trim() === slug;

export function timezones(current: string): string[] {
  const list =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return [...new Set([current, 'UTC', ...list])].sort((a, b) => a.localeCompare(b));
}
