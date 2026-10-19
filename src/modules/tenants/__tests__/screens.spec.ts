// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { shallowRef } from 'vue';
import PrimeVue from 'primevue/config';
import type { RouteLocationNormalized, RouteRecordRaw } from 'vue-router';
import { rawClient } from '@core/http/client';
import { useAuthStore } from '@core/auth/auth.store';
import type { Role } from '@core/auth/types';
import { permissionsGuard } from '@core/router/guards';
import fr from '@core/i18n/locales/fr';
import { moduleRoutes } from '../../routes';
import TenantDetailView from '../views/TenantDetailView.vue';
import TenantsView from '../views/TenantsView.vue';
import { TENANTS_URL } from '../tenants.api';
import type { TenantView } from '../types';

window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  addListener: () => undefined,
  removeListener: () => undefined,
  dispatchEvent: () => false,
})) as typeof window.matchMedia;

const toastAdd = vi.fn();
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: toastAdd }) }));
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: vi.fn() }) }));
const currentRoute = shallowRef<{ query: Record<string, unknown> }>({ query: {} });
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), currentRoute }),
  onBeforeRouteLeave: vi.fn(),
}));

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

function envelope<T>(data: T, meta?: unknown) {
  return {
    data: { success: true, data, ...(meta ? { meta } : {}), requestId: 'r', timestamp: 't' },
    status: 200,
  };
}

function mockApi(tenant: TenantView = TENANT) {
  const get = vi.spyOn(rawClient, 'get').mockImplementation(async (url: string) => {
    if (url === `${TENANTS_URL}/reference`) {
      return envelope({
        countries: [{ code: 'SN', name: 'Sénégal', flag: '🇸🇳', currencyCode: 'XOF' }],
        currencies: [{ code: 'XOF', name: 'Franc CFA', symbol: 'F' }],
      });
    }
    if (url === `${TENANTS_URL}/${tenant.id}`) return envelope(tenant);
    if (url === TENANTS_URL)
      return envelope([tenant], { total: 1, page: 1, perPage: 20, totalPages: 1, hasMore: false });
    throw new Error(`URL inattendue : ${url}`);
  });
  const patch = vi
    .spyOn(rawClient, 'patch')
    .mockImplementation(async (_url: string, body: unknown) =>
      envelope({ ...tenant, ...(body as object) }),
    );
  return { get, patch };
}

const global = {
  plugins: [
    createI18n({
      legacy: false,
      locale: 'fr',
      messages: { fr },
      datetimeFormats: { fr: { short: { dateStyle: 'short' }, long: { dateStyle: 'medium' } } },
    }),
    [PrimeVue, { unstyled: true }],
  ] as never,
  stubs: { teleport: true, RouterLink: RouterLinkStub, transition: true },
};

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await flushPromises();
}

function signIn(roles: Role[], permissions: string[]): void {
  const auth = useAuthStore();
  auth.user = { id: 'u1', tenantId: 'autre', email: 'a@b.c', roles, permissions, sessionId: 's1' };
  auth.bootstrapped = true;
}

beforeEach(() => {
  setActivePinia(createPinia());
  signIn(['SUPER_ADMIN'], []);
});
afterEach(() => {
  vi.restoreAllMocks();
  toastAdd.mockClear();
  document.body.innerHTML = '';
});

// ─────────────────────────── Accès : RÔLE, jamais tenant:manage ───────────────────────────

describe('accès gardé par le rôle SUPER_ADMIN', () => {
  const tenantRoutes = moduleRoutes.filter((r) => String(r.name).startsWith('tenants'));

  function check(route: RouteRecordRaw) {
    const record = {
      meta: route.meta ?? {},
      path: route.path,
    } as RouteLocationNormalized['matched'][number];
    return permissionsGuard.call(
      undefined,
      {
        name: route.name,
        path: '/x',
        fullPath: '/x',
        meta: route.meta ?? {},
        matched: [record],
        query: {},
        params: {},
        hash: '',
        redirectedFrom: undefined,
      } as RouteLocationNormalized,
      {} as RouteLocationNormalized,
      () => undefined,
    );
  }

  it('/organisations : section plateforme, icône pi-sitemap, roles SUPER_ADMIN, AUCUNE permission', () => {
    const list = moduleRoutes.find((r) => r.name === 'tenants')!;
    expect(list.path).toBe('organisations');
    expect(list.meta).toMatchObject({
      section: 'plateforme',
      icon: 'pi pi-sitemap',
      roles: ['SUPER_ADMIN'],
    });
    expect(String(list.component)).not.toContain('PlaceholderView');
    for (const route of tenantRoutes) {
      expect(route.meta?.roles).toEqual(['SUPER_ADMIN']);
      expect(route.meta?.permissions).toBeUndefined();
    }
  });

  it('un ADMIN qui POSSÈDE tenant:manage est refusé ; un SUPER_ADMIN sans elle passe', () => {
    for (const route of tenantRoutes) {
      signIn(['ADMIN'], ['tenant:manage', 'user:manage']);
      expect(check(route)).toEqual({ name: 'forbidden', query: { from: '/x' } });
      signIn(['SUPER_ADMIN'], []);
      expect(check(route)).toBe(true);
    }
  });

  it('PLACEHOLDERS ne contient plus aucun écran à construire', () => {
    expect(moduleRoutes.some((r) => String(r.component).includes('PlaceholderView'))).toBe(false);
  });
});

// ─────────────────────────── Écrans ───────────────────────────

describe('TenantsView', () => {
  it('liste en offset avec tri whitelisté', async () => {
    const { get } = mockApi();
    const wrapper = mount(TenantsView, { global });
    await settle();
    const call = get.mock.calls.find(([url]) => url === TENANTS_URL);
    expect((call?.[1] as { params: Record<string, unknown> }).params).toEqual({
      page: 1,
      perPage: 20,
      sortBy: 'name',
      sortDir: 'asc',
    });
    expect(wrapper.text()).toContain('Impact Sénégal');
  });
});

describe('TenantDetailView — confirmation nommant l’organisation', () => {
  it('Enregistrer ouvre une confirmation qui NOMME l’organisation ; le PATCH ne part qu’après accord', async () => {
    const { patch } = mockApi();
    const wrapper = mount(TenantDetailView, { props: { id: 't-1' }, global });
    await settle();

    await wrapper.find('[data-testid="tenant-name"]').setValue('Impact SN');
    await wrapper.find('[data-testid="tenant-save"]').trigger('click');
    await settle();

    expect(patch).not.toHaveBeenCalled();
    const dialog = wrapper.find('[data-testid="tenant-confirm"]');
    expect(dialog.text()).toContain('Modifier « Impact Sénégal »');
    expect(wrapper.find('[data-testid="tenant-confirm-name"]').text()).toContain('impact-sn');
    expect(dialog.text()).toContain('Impact SN');

    await wrapper.find('[data-testid="tenant-confirm-accept"]').trigger('click');
    await settle();
    // Uniquement le champ modifié — jamais le formulaire ni l'objet du GET.
    expect(patch).toHaveBeenCalledWith(`${TENANTS_URL}/t-1`, { name: 'Impact SN' }, undefined);
  });

  it('suspendre : il faut retaper l’identifiant, sinon rien ne part', async () => {
    const { patch } = mockApi();
    const wrapper = mount(TenantDetailView, { props: { id: 't-1' }, global });
    await settle();

    await wrapper.find('[data-testid="status-SUSPENDED"]').trigger('click');
    await settle();
    expect(wrapper.find('[data-testid="tenant-confirm-danger"]').text()).toContain('12');
    const accept = () => wrapper.find('[data-testid="tenant-confirm-accept"]');
    expect(accept().attributes('disabled')).toBeDefined();

    await wrapper.find('[data-testid="tenant-confirm-slug"]').setValue('Impact Sénégal'); // le nom ne suffit pas
    expect(accept().attributes('disabled')).toBeDefined();
    await wrapper.find('[data-testid="tenant-confirm-slug"]').setValue('impact-sn');
    await accept().trigger('click');
    await settle();
    expect(patch).toHaveBeenCalledWith(`${TENANTS_URL}/t-1`, { status: 'SUSPENDED' }, undefined);
  });

  it('l’organisation de la session ne peut pas être suspendue d’ici', async () => {
    mockApi({ ...TENANT, isCurrent: true });
    const wrapper = mount(TenantDetailView, { props: { id: 't-1' }, global });
    await settle();
    expect(wrapper.find('[data-testid="tenant-self-note"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="status-SUSPENDED"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="status-ARCHIVED"]').attributes('disabled')).toBeDefined();
  });

  it('identifiant et isolation affichés en lecture seule, jamais éditables', async () => {
    mockApi();
    const wrapper = mount(TenantDetailView, { props: { id: 't-1' }, global });
    await settle();
    const inputs = wrapper.findAll('input').map((i) => (i.element as HTMLInputElement).value);
    expect(inputs).not.toContain('impact-sn');
    expect(wrapper.text()).toContain('impact-sn');
  });
});
