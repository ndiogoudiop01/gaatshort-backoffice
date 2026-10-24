// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import PrimeVue from 'primevue/config';
import { rawClient } from '@core/http/client';
import fr from '@core/i18n/locales/fr';
import EpisodeDialog from '../components/EpisodeDialog.vue';
import VideoDialog from '../components/VideoDialog.vue';
import { effectivePrice } from '../pricing';
import type { Episode, SeriesDetail } from '../types';

vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }));

const ok = <T>(data: T) => ({
  data: { success: true, data, requestId: 'r', timestamp: 't' },
  status: 200,
});
const global = {
  plugins: [
    createI18n({ legacy: false, locale: 'fr', messages: { fr } }),
    [PrimeVue, { unstyled: true }],
  ] as never,
  stubs: { teleport: true, transition: true },
};
const settle = async () => {
  for (let i = 0; i < 5; i += 1) await flushPromises();
};
const EP = (over: Partial<Episode> = {}): Episode => ({
  id: 'e-1',
  seriesId: 's-1',
  number: 7,
  status: 'PUBLISHED',
  titleFr: 'Ancien',
  titleEn: null,
  durationSeconds: 90,
  priceCoinsOverride: null,
  thumbnailUrl: null,
  video: null,
  subtitles: [],
  ...over,
});

beforeEach(() => setActivePinia(createPinia()));
afterEach(() => vi.restoreAllMocks());

describe('EpisodeDialog', () => {
  it('envoie les valeurs saisies (titre et prix)', async () => {
    const patch = vi.spyOn(rawClient, 'patch').mockResolvedValue(ok(EP()));
    const w = mount(EpisodeDialog, { props: { episode: EP(), visible: true }, global });
    await settle();
    const inputs = w.findAll('input');
    await inputs[0]!.setValue('Nouveau titre');
    const price = inputs[2]!;
    await price.setValue('25');
    await price.trigger('input');
    await price.trigger('blur');
    await w.find('form').trigger('submit');
    await settle();
    expect(patch.mock.calls[0]?.[1]).toMatchObject({
      titleFr: 'Nouveau titre',
      priceCoinsOverride: 25,
    });
  });

  it('rouvrir après « Annuler » montre les vraies valeurs, pas la saisie abandonnée', async () => {
    const w = mount(EpisodeDialog, { props: { episode: EP(), visible: true }, global });
    await settle();
    await w.findAll('input')[0]!.setValue('Saisie abandonnée');
    await w.setProps({ visible: false });
    await w.setProps({ visible: true });
    await settle();
    expect((w.findAll('input')[0]!.element as HTMLInputElement).value).toBe('Ancien');
  });

  it('explique pourquoi un prix ne s’applique pas (épisode gratuit, prix imposé par la vitrine)', async () => {
    const series = {
      freeEpisodes: 5,
      episodePriceCoins: 15,
      tenantSeries: null,
    } as unknown as SeriesDetail;
    let w = mount(EpisodeDialog, {
      props: { episode: EP({ number: 3 }), series, visible: true },
      global,
    });
    await settle();
    expect(w.find('[data-testid="price-notice"]').text()).toContain('5 épisodes gratuits');
    const branded = {
      ...series,
      tenantSeries: { status: 'LIVE', featured: false, episodePriceCoinsOverride: 12 },
    } as unknown as SeriesDetail;
    w = mount(EpisodeDialog, {
      props: { episode: EP({ number: 9 }), series: branded, visible: true },
      global,
    });
    await settle();
    expect(w.find('[data-testid="price-notice"]').text()).toContain('12 crédits');
    w = mount(EpisodeDialog, {
      props: { episode: EP({ number: 9 }), series, visible: true },
      global,
    });
    await settle();
    expect(w.find('[data-testid="price-notice"]').exists()).toBe(false);
  });
});

describe('Prix effectif (même règle que l’API)', () => {
  const S = {
    freeEpisodes: 5,
    episodePriceCoins: 15,
    tenantSeries: null,
  } as unknown as SeriesDetail;
  it('vitrine > épisode > série ; gratuité ; prix nul = gratuit', () => {
    expect(effectivePrice(S, { number: 5, priceCoinsOverride: 40 })).toEqual({
      isFree: true,
      priceCoins: 0,
      source: 'free',
    });
    expect(effectivePrice(S, { number: 6, priceCoinsOverride: null })).toMatchObject({
      priceCoins: 15,
      source: 'series',
    });
    expect(effectivePrice(S, { number: 6, priceCoinsOverride: 25 })).toMatchObject({
      priceCoins: 25,
      source: 'episode',
    });
    const B = {
      ...S,
      tenantSeries: {
        status: 'LIVE',
        featured: false,
        freeEpisodesOverride: 8,
        episodePriceCoinsOverride: 10,
      },
    } as unknown as SeriesDetail;
    expect(effectivePrice(B, { number: 7, priceCoinsOverride: 25 }).isFree).toBe(true);
    expect(effectivePrice(B, { number: 9, priceCoinsOverride: 25 })).toMatchObject({
      priceCoins: 10,
      source: 'brand',
    });
    const Z = {
      ...S,
      tenantSeries: { status: 'LIVE', featured: false, episodePriceCoinsOverride: 0 },
    } as unknown as SeriesDetail;
    expect(effectivePrice(Z, { number: 9, priceCoinsOverride: null }).isFree).toBe(true);
  });
});

describe('VideoDialog', () => {
  it('chaque ouverture repart de zéro (pas de fichier d’un autre épisode)', async () => {
    const w = mount(VideoDialog, { props: { episode: EP(), visible: true }, global });
    await settle();
    const input = w.find('[data-testid="video-file"]');
    const file = new File(['x'], 'ep7.mp4', { type: 'video/mp4' });
    Object.defineProperty(input.element, 'files', { value: [file] });
    await input.trigger('change');
    const submit = () => w.findAll('button').find((b) => b.text() === 'Envoyer')!;
    expect(submit().attributes('disabled')).toBeUndefined();
    await w.setProps({ visible: false });
    await w.setProps({ episode: EP({ id: 'e-2', number: 8 }), visible: true });
    await settle();
    expect(submit().attributes('disabled')).toBeDefined();
  });
});
