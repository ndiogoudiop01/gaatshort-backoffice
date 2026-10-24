// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import PrimeVue from 'primevue/config';
import { rawClient } from '@core/http/client';
import { useAuthStore } from '@core/auth/auth.store';
import fr from '@core/i18n/locales/fr';
import { moduleRoutes } from '../../routes';
import SeriesEditView from '../views/SeriesEditView.vue';
import StorefrontView from '../views/StorefrontView.vue';
import type { SeriesDetail, StorefrontRow } from '../types';

window.matchMedia ??= ((q: string) => ({ matches: false, media: q, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false })) as typeof window.matchMedia;

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }));
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: vi.fn() }) }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const envelope = <T>(data: T) => ({ data: { success: true, data, requestId: 'r', timestamp: 't' }, status: 200 });
const global = {
  plugins: [createI18n({ legacy: false, locale: 'fr', messages: { fr }, datetimeFormats: { fr: { short: { dateStyle: 'short' }, long: { dateStyle: 'medium' } } } }), [PrimeVue, { unstyled: true }]] as never,
  stubs: { teleport: true, RouterLink: RouterLinkStub, transition: true },
};
const settle = async () => { for (let i = 0; i < 5; i += 1) await flushPromises(); };

function signIn(permissions: string[]): void {
  const auth = useAuthStore();
  auth.user = { id: 'u1', tenantId: 't', email: 'a@b.c', roles: ['ADMIN'], permissions, sessionId: 's' };
  auth.bootstrapped = true;
}

const SERIES: SeriesDetail = {
  id: 's-1', slug: 'le-pacte', status: 'DRAFT', originalLocale: 'fr', titleFr: 'Le Pacte', titleEn: null, synopsisFr: '', synopsisEn: null,
  posterUrl: null, bannerUrl: null, maturityRating: '13+', releaseYear: null, tags: [], freeEpisodes: 5, episodePriceCoins: 15, publishedAt: null,
  genres: [], licenses: [], tenantSeries: null,
  episodes: [{ id: 'e-1', seriesId: 's-1', number: 6, status: 'DRAFT', titleFr: null, titleEn: null, durationSeconds: 95, priceCoinsOverride: null, thumbnailUrl: null, video: { id: 'm', provider: 'FAKE', providerRef: 'r', status: 'READY', durationSeconds: 95, thumbnailUrl: null, failureReason: null }, subtitles: [] }],
};

beforeEach(() => setActivePinia(createPinia()));
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; });

describe('Navigation et droits', () => {
  it('chaque écran du menu Gaatshort déclare sa section et sa permission', () => {
    const nav = moduleRoutes.filter((r) => r.meta?.nav && ['catalogue', 'monetisation', 'audience', 'pilotage'].includes(String(r.meta.section)));
    expect(nav.map((r) => r.name)).toEqual(['dashboard', 'series', 'genres', 'licenses', 'storefront', 'packs', 'orders', 'viewers']);
    for (const r of nav) expect(r.meta?.permissions?.length).toBeGreaterThan(0);
  });
});

describe('SeriesEditView', () => {
  it('affiche épisodes, prix et absence de licence ; un opérateur sans droit de publier ne voit pas « Publier »', async () => {
    signIn(['catalog:read', 'catalog:write', 'media:upload']);
    vi.spyOn(rawClient, 'get').mockImplementation(async (url: string) => (url === '/admin/genres' ? envelope([]) : envelope(SERIES)));
    const wrapper = mount(SeriesEditView, { props: { id: 's-1' }, global });
    await settle();
    expect(wrapper.text()).toContain('Le Pacte');
    expect(wrapper.text()).toContain('15 crédits');
    expect(wrapper.text()).toContain('Aucune licence');
    expect(wrapper.find('[data-testid="series-publish"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="series-save"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('enregistre les modifications de la fiche', async () => {
    signIn(['catalog:read', 'catalog:write', 'catalog:publish']);
    vi.spyOn(rawClient, 'get').mockImplementation(async (url: string) => (url === '/admin/genres' ? envelope([]) : envelope(SERIES)));
    const patch = vi.spyOn(rawClient, 'patch').mockResolvedValue(envelope({ ...SERIES, titleFr: 'Nouveau' }));
    const wrapper = mount(SeriesEditView, { props: { id: 's-1' }, global });
    await settle();
    expect(wrapper.find('[data-testid="series-publish"]').exists()).toBe(true);
    await wrapper.find('[data-testid="field-titleFr"]').setValue('Nouveau');
    await wrapper.find('form').trigger('submit');
    await settle();
    expect(patch.mock.calls[0]?.[0]).toBe('/admin/series/s-1');
    expect(patch.mock.calls[0]?.[1]).toMatchObject({ titleFr: 'Nouveau', freeEpisodes: 5, episodePriceCoins: 15 });
    wrapper.unmount();
  });
});

describe('StorefrontView', () => {
  it('liste les séries et signale celles qu’aucune licence n’autorise', async () => {
    signIn(['catalog:read', 'storefront:write']);
    const rows: StorefrontRow[] = [
      { seriesId: 's-1', slug: 'a', titleFr: 'Série A', posterUrl: null, episodeCount: 12, freeEpisodes: 5, episodePriceCoins: 15, licensedForTenant: true, status: 'LIVE', featured: true, position: 0, freeEpisodesOverride: null, episodePriceCoinsOverride: null },
      { seriesId: 's-2', slug: 'b', titleFr: 'Série B', posterUrl: null, episodeCount: 3, freeEpisodes: 5, episodePriceCoins: 15, licensedForTenant: false, status: 'HIDDEN', featured: false, position: 1, freeEpisodesOverride: null, episodePriceCoinsOverride: null },
    ];
    vi.spyOn(rawClient, 'get').mockResolvedValue(envelope(rows));
    const wrapper = mount(StorefrontView, { global });
    await settle();
    expect(wrapper.text()).toContain('Série A');
    expect(wrapper.text()).toContain('Aucune licence n’autorise cette marque');
  });
});
