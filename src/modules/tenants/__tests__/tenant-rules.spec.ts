import { describe, expect, it } from 'vitest';
import {
  buildTenantPatch,
  confirmationMatches,
  cutsAccess,
  describeChanges,
  isEmptyPatch,
  toForm,
  type TenantForm,
} from '../tenant-rules';
import { TENANT_EDITABLE_FIELDS, tenantPatchSchema, type TenantView } from '../types';

const TENANT: TenantView = {
  id: 't-1',
  slug: 'impact-sn',
  name: 'Impact Sénégal',
  legalName: null,
  status: 'ACTIVE',
  isolation: 'SHARED_RLS',
  defaultLocale: 'fr',
  defaultCountry: 'SN',
  defaultCurrency: 'XOF',
  timezone: 'Africa/Dakar',
  branding: { primaryColor: '#0F5132', logoUrl: null },
  featureFlags: { simulator: true, academy: false },
  domains: [{ domain: 'sn.impact.test', isPrimary: true, verifiedAt: null }],
  userCount: 12,
  isCurrent: false,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

describe('buildTenantPatch — champ par champ, seulement ce qui change', () => {
  it('formulaire intact : patch vide', () => {
    expect(isEmptyPatch(buildTenantPatch(TENANT, toForm(TENANT)))).toBe(true);
  });

  it('ne garde que les champs modifiés, branding et options compris', () => {
    const form: TenantForm = {
      ...toForm(TENANT),
      name: '  Impact SN ',
      legalName: 'Impact SN SARL',
      primaryColor: '#111111',
      featureFlags: { simulator: true, academy: true },
    };
    expect(buildTenantPatch(TENANT, form)).toEqual({
      name: 'Impact SN',
      legalName: 'Impact SN SARL',
      branding: { primaryColor: '#111111' },
      featureFlags: { academy: true },
    });
  });

  it('un champ HORS liste glissé dans le formulaire n’est jamais transmis', () => {
    // Le GET entier réinjecté comme formulaire, avec des champs dangereux modifiés.
    const hostile = {
      ...toForm(TENANT),
      name: 'Nouveau nom',
      slug: 'pirate',
      isolation: 'SCHEMA',
      schemaName: 'public',
      status: 'SUSPENDED',
      domains: [{ domain: 'evil.test' }],
      id: 'autre',
    } as unknown as TenantForm;
    const patch = buildTenantPatch(TENANT, hostile);
    expect(patch).toEqual({ name: 'Nouveau nom' });
    for (const key of Object.keys(patch)) expect(TENANT_EDITABLE_FIELDS).toContain(key);
  });

  it('une option absente de l’organisation n’est pas créée', () => {
    const form = {
      ...toForm(TENANT),
      featureFlags: { simulator: true, academy: false, inventee: true },
    };
    expect(buildTenantPatch(TENANT, form)).toEqual({});
  });
});

describe('schéma strict', () => {
  it('refuse tout champ hors liste, à la racine comme dans branding', () => {
    expect(tenantPatchSchema.safeParse({ name: 'Ok' }).success).toBe(true);
    expect(tenantPatchSchema.safeParse({ slug: 'x' }).success).toBe(false);
    expect(tenantPatchSchema.safeParse({ name: 'Ok', schemaName: 'public' }).success).toBe(false);
    expect(
      tenantPatchSchema.safeParse({ branding: { primaryColor: '#000000', css: 'x' } }).success,
    ).toBe(false);
    expect(
      tenantPatchSchema.safeParse({ branding: { logoUrl: 'http://x.test/l.png' } }).success,
    ).toBe(false);
    expect(tenantPatchSchema.safeParse({ status: 'DELETED' }).success).toBe(false);
    expect(tenantPatchSchema.safeParse({}).success).toBe(false);
  });
});

describe('confirmation', () => {
  it('décrit chaque changement « avant → après »', () => {
    expect(describeChanges(TENANT, { name: 'Impact SN', featureFlags: { academy: true } })).toEqual(
      [
        { field: 'name', before: 'Impact Sénégal', after: 'Impact SN' },
        { field: 'flag:academy', before: 'false', after: 'true' },
      ],
    );
  });

  it('couper l’accès exige de retaper l’identifiant exact', () => {
    expect(cutsAccess('SUSPENDED')).toBe(true);
    expect(cutsAccess('ARCHIVED')).toBe(true);
    expect(cutsAccess('ACTIVE')).toBe(false);
    expect(cutsAccess(undefined)).toBe(false);
    expect(confirmationMatches(' impact-sn ', 'impact-sn')).toBe(true);
    expect(confirmationMatches('Impact-SN', 'impact-sn')).toBe(false);
    expect(confirmationMatches('Impact Sénégal', 'impact-sn')).toBe(false);
  });
});
