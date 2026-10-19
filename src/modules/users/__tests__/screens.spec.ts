// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { shallowRef } from 'vue';
import PrimeVue from 'primevue/config';
import { rawClient } from '@core/http/client';
import { useAuthStore } from '@core/auth/auth.store';
import fr from '@core/i18n/locales/fr';
import { moduleRoutes } from '../../routes';
import UserDetailView from '../views/UserDetailView.vue';
import RolePermissionsView from '../views/RolePermissionsView.vue';
import UsersView from '../views/UsersView.vue';
import { PERMISSIONS_URL, ROLES_URL, USERS_URL } from '../users.api';
import type { PermissionView, RoleView, UserDetail } from '../types';

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
/** Confirmation NON acceptée d'office : chaque test décide. */
const confirmRequire = vi.fn();
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: confirmRequire }) }));

const currentRoute = shallowRef<{ query: Record<string, unknown> }>({ query: {} });
const routerPush = vi.fn();
const routerReplace = vi.fn(async (to: { query?: Record<string, unknown> }) => {
  if (to.query) currentRoute.value = { query: to.query };
});
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush, replace: routerReplace, currentRoute }),
  onBeforeRouteLeave: vi.fn(),
}));

// ── Données « API » : le module n'en contient aucune. ─────────────────────
const perm = (key: string, grantable = true, description: string | null = null): PermissionView => {
  const [resource = '', ...rest] = key.split(':');
  return { key, resource, action: rest.join(':'), description, grantable };
};
const CATALOG: PermissionView[] = [
  perm('user:manage', true, 'Gérer les comptes'),
  perm('pool:read', true, 'Consulter le vivier'),
  perm('pool:export', true, 'Exporter le vivier'),
  perm('tenant:manage', false, 'Administrer l’organisation'),
];
const role = (key: string, permissions: string[], extra: Partial<RoleView> = {}): RoleView => ({
  id: `r-${key}`,
  key,
  name: `Profil ${key}`,
  description: null,
  isSystem: true,
  locked: false,
  userCount: 2,
  permissions,
  assignable: true,
  updatedAt: '2026-09-01T00:00:00.000Z',
  ...extra,
});
let ROLES: RoleView[] = [];

const SELF: UserDetail = {
  id: 'me',
  email: 'moi@impact.test',
  phoneE164: null,
  firstName: 'Moi',
  lastName: 'Admin',
  status: 'ACTIVE',
  countryCode: 'SN',
  allCountries: false,
  countryScope: [],
  effectiveCountries: ['SN'],
  lastLoginAt: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  isSelf: true,
  roles: [{ key: 'ADMIN', name: 'Profil ADMIN', grantedAt: '2026-09-01T00:00:00.000Z' }],
  manageable: { canManage: true, reason: null, canEditCountries: false },
  effectivePermissions: ['pool:export', 'pool:read', 'user:manage'],
  activeSessions: 1,
};

function envelope<T>(data: T, meta?: unknown) {
  return {
    data: { success: true, data, ...(meta ? { meta } : {}), requestId: 'r', timestamp: 't' },
    status: 200,
  };
}

function mockApi(user: UserDetail = SELF) {
  vi.spyOn(rawClient, 'get').mockImplementation(async (url: string) => {
    if (url === ROLES_URL) return envelope(ROLES);
    if (url === PERMISSIONS_URL) return envelope(CATALOG);
    if (url === `${USERS_URL}/countries`)
      return envelope([
        { countryCode: 'SN', isDefault: true },
        { countryCode: 'MA', isDefault: false },
      ]);
    if (url === `${USERS_URL}/${user.id}`) return envelope(user);
    if (url === USERS_URL)
      return envelope([user], { total: 1, page: 1, perPage: 20, totalPages: 1, hasMore: false });
    throw new Error(`URL inattendue : ${url}`);
  });
  return {
    put: vi.spyOn(rawClient, 'put').mockImplementation(async (url: string, body: unknown) => {
      if (url.startsWith(ROLES_URL)) {
        const id = url.split('/')[3];
        const found = ROLES.find((r) => r.id === id)!;
        return envelope({
          ...found,
          permissions: (body as { permissionKeys: string[] }).permissionKeys,
        });
      }
      return envelope({
        ...user,
        roles: (body as { roleKeys: string[] }).roleKeys.map((key) => ({
          key,
          name: key,
          grantedAt: '',
        })),
      });
    }),
  };
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

beforeEach(() => {
  setActivePinia(createPinia());
  useAuthStore().user = {
    id: 'me',
    tenantId: 't1',
    email: 'moi@impact.test',
    roles: ['ADMIN'],
    permissions: ['user:manage', 'pool:read', 'pool:export'],
    sessionId: 's1',
  };
  ROLES = [
    role('ADMIN', ['user:manage', 'pool:read', 'pool:export']),
    role('MANAGER', ['pool:read']),
    role('AUDITOR', ['user:manage']),
    role('SUPER_ADMIN', ['user:manage', 'pool:read', 'pool:export', 'tenant:manage'], {
      locked: true,
      assignable: false,
    }),
  ];
  currentRoute.value = { query: {} };
});
afterEach(() => {
  vi.restoreAllMocks();
  toastAdd.mockClear();
  confirmRequire.mockClear();
  document.body.innerHTML = '';
});

describe('routes', () => {
  it('/utilisateurs est un vrai module sous user:manage, section plateforme', () => {
    const route = moduleRoutes.find((r) => r.name === 'users');
    expect(route?.path).toBe('utilisateurs');
    expect(route?.meta).toMatchObject({
      section: 'plateforme',
      icon: 'pi pi-users',
      permissions: ['user:manage'],
    });
    expect(String(route?.component)).not.toContain('PlaceholderView');
    expect(moduleRoutes.filter((r) => r.name === 'users')).toHaveLength(1);
  });
});

describe('UserDetailView — garde-fou sur son propre rôle', () => {
  it('se retirer user:manage : bloqué à l’écran, aucune requête', async () => {
    const { put } = mockApi();
    const wrapper = mount(UserDetailView, { props: { id: 'me' }, global });
    await settle();

    await wrapper.find('[data-testid="role-ADMIN"]').trigger('click'); // retire ADMIN
    await wrapper.find('[data-testid="role-MANAGER"]').trigger('click'); // ajoute MANAGER (sans user:manage)

    expect(wrapper.find('[data-testid="self-blocked"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="save-roles"]').attributes('disabled')).toBeDefined();
    await wrapper.find('[data-testid="save-roles"]').trigger('click');
    await settle();
    expect(put).not.toHaveBeenCalled();
    expect(confirmRequire).not.toHaveBeenCalled();
  });

  it('autre changement sur soi : confirmation qui NOMME la perte, requête seulement après accord', async () => {
    const { put } = mockApi();
    const wrapper = mount(UserDetailView, { props: { id: 'me' }, global });
    await settle();

    await wrapper.find('[data-testid="role-ADMIN"]').trigger('click');
    await wrapper.find('[data-testid="role-AUDITOR"]').trigger('click'); // garde user:manage, perd le vivier
    await wrapper.find('[data-testid="save-roles"]').trigger('click');
    await settle();

    expect(put).not.toHaveBeenCalled();
    expect(confirmRequire).toHaveBeenCalledTimes(1);
    const options = confirmRequire.mock.calls[0]![0] as { message: string; accept: () => void };
    expect(options.message).toContain('Consulter le vivier');
    expect(options.message).toContain('Exporter le vivier');

    options.accept();
    await settle();
    expect(put).toHaveBeenCalledWith(`${USERS_URL}/me/roles`, { roleKeys: ['AUDITOR'] }, undefined);
  });

  it('message explicite : effet au prochain jeton, puis avertissement après enregistrement', async () => {
    mockApi({ ...SELF, isSelf: false, id: 'u2' });
    const wrapper = mount(UserDetailView, { props: { id: 'u2' }, global });
    await settle();
    const notice = () => wrapper.find('[data-testid="token-effect-notice"]');
    expect(notice().text()).toContain('prochaine connexion');
    expect(notice().attributes('data-pending')).toBe('false');
    expect(wrapper.find('[data-testid="revoke-sessions"]').exists()).toBe(true);

    await wrapper.find('[data-testid="role-MANAGER"]').trigger('click');
    await wrapper.find('[data-testid="save-roles"]').trigger('click');
    await settle();
    expect(notice().attributes('data-pending')).toBe('true');
    expect(notice().text()).toContain('prendra effet à la prochaine connexion');
  });

  it('rôle non attribuable (API : assignable=false) : carte désactivée ; périmètre pays en lecture seule', async () => {
    mockApi();
    const wrapper = mount(UserDetailView, { props: { id: 'me' }, global });
    await settle();
    expect(wrapper.find('[data-testid="role-SUPER_ADMIN"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="countries-readonly"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="save-countries"]').exists()).toBe(false);
    expect(wrapper.text()).not.toMatch(/mot de passe oublié|réinitialiser le mot de passe/i);
  });
});

describe('RolePermissionsView — matrice lue depuis l’API', () => {
  it('affiche EXACTEMENT le mapping renvoyé par l’API', async () => {
    ROLES = [role('MANAGER', ['pool:read', 'tenant:manage']), ...ROLES.slice(0, 1)];
    mockApi();
    const wrapper = mount(RolePermissionsView, { props: { id: 'r-MANAGER' }, global });
    await settle();
    const state = (key: string) =>
      wrapper.find(`[data-testid="perm-${key}"]`).attributes('data-state');
    expect(state('pool:read')).toBe('on');
    expect(state('tenant:manage')).toBe('on');
    expect(state('pool:export')).toBe('off');
    // Permission que je n'ai pas : non modifiable (anti-escalade).
    expect(wrapper.find('[data-testid="perm-tenant:manage"]').attributes('disabled')).toBeDefined();
    // Aucune permission « supprimer » n'existe côté serveur : case vide.
    expect(wrapper.find('[data-testid="cell-pool-delete"]').text()).toBe('—');
  });

  it('clic = bascule marquée « ajout », puis PUT de la nouvelle liste', async () => {
    ROLES = [role('MANAGER', ['pool:read']), ...ROLES.slice(0, 1)];
    const { put } = mockApi();
    const wrapper = mount(RolePermissionsView, { props: { id: 'r-MANAGER' }, global });
    await settle();

    await wrapper.find('[data-testid="perm-pool:export"]').trigger('click');
    expect(wrapper.find('[data-testid="perm-pool:export"]').attributes('data-state')).toBe('added');
    await wrapper.find('[data-testid="role-save"]').trigger('click');
    await settle();
    expect(put).toHaveBeenCalledWith(
      `${ROLES_URL}/r-MANAGER/permissions`,
      { permissionKeys: ['pool:export', 'pool:read'] },
      undefined,
    );
    expect(wrapper.find('[data-testid="token-effect-notice"]').attributes('data-pending')).toBe(
      'true',
    );
  });

  it('clic droit sur une ligne → « Lecture seule » : ne garde que la colonne Lire', async () => {
    ROLES = [role('MANAGER', ['pool:export']), ...ROLES.slice(0, 1)];
    mockApi();
    const wrapper = mount(RolePermissionsView, {
      props: { id: 'r-MANAGER' },
      global,
      attachTo: document.body,
    });
    await settle();

    await wrapper
      .find('[data-testid="row-pool"] th')
      .trigger('contextmenu', { clientX: 10, clientY: 10 });
    await settle();
    const item = [
      ...document.querySelectorAll(
        '[data-testid="permission-menu"] a, [data-testid="permission-menu"] [data-pc-section="itemlink"]',
      ),
    ].find((el) => el.textContent?.includes('Lecture seule')) as HTMLElement | undefined;
    expect(item).toBeDefined();
    item!.click();
    await settle();

    const state = (key: string) =>
      wrapper.find(`[data-testid="perm-${key}"]`).attributes('data-state');
    expect(state('pool:read')).toBe('added');
    expect(state('pool:export')).toBe('removed');
  });

  it('SUPER_ADMIN verrouillé : lecture seule, pas de barre d’enregistrement', async () => {
    mockApi();
    const wrapper = mount(RolePermissionsView, { props: { id: 'r-SUPER_ADMIN' }, global });
    await settle();
    expect(wrapper.find('[data-testid="role-locked"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="role-save-bar"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="perm-pool:read"]').attributes('disabled')).toBeDefined();
  });

  it('retirer user:manage de mon seul profil d’administration : enregistrement bloqué', async () => {
    const { put } = mockApi();
    const wrapper = mount(RolePermissionsView, { props: { id: 'r-ADMIN' }, global });
    await settle();
    await wrapper.find('[data-testid="perm-user:manage"]').trigger('click');
    expect(wrapper.find('[data-testid="role-self-lockout"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="role-save"]').attributes('disabled')).toBeDefined();
    expect(put).not.toHaveBeenCalled();
  });
});

describe('UsersView', () => {
  it('liste les comptes en offset, recherche jamais dans l’adresse', async () => {
    mockApi({ ...SELF, isSelf: false, id: 'u2' });
    const get = rawClient.get as unknown as ReturnType<typeof vi.fn>;
    const wrapper = mount(UsersView, { global });
    await settle();
    const listCall = get.mock.calls.find(([url]) => url === USERS_URL);
    expect((listCall?.[1] as { params: Record<string, unknown> }).params).toMatchObject({
      page: 1,
      sortBy: 'createdAt',
    });
    await wrapper.find('[data-testid="user-search"]').setValue('moi@impact.test');
    await settle();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it('onglet profils : cartes des profils et constats du modèle de droits', async () => {
    currentRoute.value = { query: { onglet: 'profils' } };
    ROLES = [...ROLES, role('PARTNER', [])];
    mockApi();
    const wrapper = mount(UsersView, { global });
    await settle();
    expect(wrapper.find('[data-testid="role-card-ADMIN"]').exists()).toBe(true);
    const findings = wrapper.find('[data-testid="rbac-findings"]').text();
    expect(findings).toContain('Profil PARTNER');
    expect(findings).toContain('tenant:manage');
  });
});
