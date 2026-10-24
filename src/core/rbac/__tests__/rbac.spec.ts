import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { useCan, useCanRef, vCan, PERMISSIONS } from '..';
import { useAuthStore } from '@core/auth/auth.store';
import type { Role } from '@core/auth/types';

function signIn(roles: Role[], permissions: string[]): void {
  const auth = useAuthStore();
  auth.user = {
    id: 'u1',
    tenantId: 't1',
    email: 'a@b.c',
    roles,
    permissions,
    sessionId: 's1',
  };
  auth.bootstrapped = true;
}

describe('useCan', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('exige TOUTES les permissions, comme PermissionsGuard', () => {
    signIn(['CONTENT_MANAGER'], ['catalog:read', 'catalog:write']);
    const { can } = useCan();

    expect(can('catalog:read')).toBe(true);
    expect(can('catalog:read', 'catalog:write')).toBe(true);
    expect(can('catalog:read', 'catalog:publish')).toBe(false);
  });

  it('considère qu’aucune exigence vaut autorisation', () => {
    // Cohérent avec le backend : une route sans `@RequirePermissions` n'exige
    // rien de plus que d'être authentifié.
    signIn(['CONTENT_MANAGER'], []);
    expect(useCan().can()).toBe(true);
    expect(useCan().hasRole()).toBe(true);
  });

  it('n’exige qu’UN SEUL des rôles listés', () => {
    signIn(['ADMIN'], []);
    const { hasRole } = useCan();

    expect(hasRole('SUPER_ADMIN', 'ADMIN')).toBe(true);
    expect(hasRole('SUPER_ADMIN')).toBe(false);
  });

  it('ne donne rien à un VIEWER, qui n’a aucune permission back-office', () => {
    signIn(['VIEWER'], []);
    const { can, isPlatformAdmin } = useCan();

    expect(can('catalog:read')).toBe(false);
    expect(isPlatformAdmin.value).toBe(false);
  });

  it('ne prête pas tenant:manage à un ADMIN de marque', () => {
    // Le backend ne la lui donne pas : l'administration des marques est réservée
    // au SUPER_ADMIN. Ce test existe pour qu'on ne « corrige » pas la surprise.
    signIn(['ADMIN'], ['catalog:read', 'metrics:read', 'user:manage']);
    expect(useCan().can(PERMISSIONS.TENANT_MANAGE)).toBe(false);
    expect(useCan().isPlatformAdmin.value).toBe(true);
  });
});

describe('useCanRef', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('suit un changement de session', () => {
    const auth = useAuthStore();
    const allowed = useCanRef('wallet:adjust');

    expect(allowed.value).toBe(false);
    signIn(['ADMIN'], ['wallet:adjust']);
    expect(allowed.value).toBe(true);

    auth.clearSession();
    expect(allowed.value).toBe(false);
  });
});

describe('v-can', () => {
  beforeEach(() => setActivePinia(createPinia()));

  const host = defineComponent({
    directives: { can: vCan },
    props: { need: { type: [String, Array], required: true } },
    template: '<div><button v-can="need" id="cible">Exporter</button></div>',
  });

  it('retire l’élément — il ne le masque pas', () => {
    signIn(['CONTENT_MANAGER'], []);
    const wrapper = mount(host, { props: { need: 'wallet:adjust' } });

    // Masquer laisserait le bouton atteignable au clavier et annoncé par un
    // lecteur d'écran : une promesse d'action que l'API refuserait.
    expect(wrapper.find('#cible').exists()).toBe(false);
    expect(wrapper.html()).not.toContain('Exporter');
  });

  it('laisse l’élément quand toutes les permissions sont là', () => {
    signIn(['ADMIN'], ['pool:read', 'pool:export']);
    const wrapper = mount(host, { props: { need: ['pool:read', 'pool:export'] } });

    expect(wrapper.find('#cible').exists()).toBe(true);
  });

  it('retire l’élément s’il manque une seule permission d’une liste', () => {
    signIn(['ADMIN'], ['pool:read']);
    const wrapper = mount(host, { props: { need: ['pool:read', 'pool:export'] } });

    expect(wrapper.find('#cible').exists()).toBe(false);
  });
});
