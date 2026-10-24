// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import PrimeVue from 'primevue/config';
import { rawClient } from '@core/http/client';
import fr from '@core/i18n/locales/fr';
import ImportView from '../views/ImportView.vue';
import { IMPORT_TEMPLATE } from '../import-template';
import type { ImportReport } from '../types';

window.matchMedia ??= ((q: string) => ({
  matches: false,
  media: q,
  onchange: null,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  addListener: () => undefined,
  removeListener: () => undefined,
  dispatchEvent: () => false,
})) as typeof window.matchMedia;

vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }));
// La confirmation est acceptée d'office : on teste ce qui suit.
vi.mock('primevue/useconfirm', () => ({
  useConfirm: () => ({ require: (o: { accept: () => void }) => o.accept() }),
}));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const envelope = <T>(data: T) => ({
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

const report = (dryRun: boolean, over: Partial<ImportReport> = {}): ImportReport => ({
  dryRun,
  totals: {
    rows: 2,
    seriesCreated: 1,
    seriesUpdated: 0,
    episodesCreated: 2,
    episodesUpdated: 0,
    videosQueued: 2,
    videosAlreadyPresent: 0,
    errors: 0,
  },
  series: [{ slug: 'ma-nouvelle-serie', action: 'CREATED' }],
  rows: [
    {
      line: 2,
      seriesSlug: 'ma-nouvelle-serie',
      episodeNumber: 1,
      episode: 'CREATED',
      video: 'QUEUED',
    },
    {
      line: 3,
      seriesSlug: 'ma-nouvelle-serie',
      episodeNumber: 2,
      episode: 'ERROR',
      video: 'NONE',
      message: 'Boom',
    },
  ],
  errors: [],
  warnings: [{ line: 1, message: 'Genres inconnus ignorés : romance' }],
  ...over,
});

beforeEach(() => setActivePinia(createPinia()));
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('ImportView', () => {
  it('analyse à blanc, puis importe exactement le contenu analysé', async () => {
    const post = vi
      .spyOn(rawClient, 'post')
      .mockResolvedValueOnce(envelope(report(true)))
      .mockResolvedValueOnce(envelope(report(false)));
    const w = mount(ImportView, { global });
    const run = () => w.find('[data-testid="import-run"]');
    expect(run().attributes('disabled')).toBeDefined();

    await w.find('[data-testid="import-csv"]').setValue(IMPORT_TEMPLATE);
    await w.find('[data-testid="import-analyse"]').trigger('click');
    await settle();
    expect(post.mock.calls[0]?.slice(0, 2)).toEqual([
      '/admin/catalog/import',
      { csv: IMPORT_TEMPLATE.replace(/\r\n/g, '\n'), dryRun: true },
    ]);
    expect(w.text()).toContain('Essai à blanc');
    expect(w.text()).toContain('Genres inconnus ignorés');
    expect(w.find('[data-testid="import-totals"]').text()).toContain('Séries créées');
    expect(run().attributes('disabled')).toBeUndefined();

    await run().trigger('click');
    await settle();
    expect(post.mock.calls[1]?.[1]).toEqual({
      csv: IMPORT_TEMPLATE.replace(/\r\n/g, '\n'),
      dryRun: false,
    });
    expect(w.text()).toContain('Import terminé');
    expect(run().attributes('disabled')).toBeDefined();
    w.unmount();
  });

  it('modifier le texte après l’analyse bloque l’import ; filtre « erreurs seulement »', async () => {
    vi.spyOn(rawClient, 'post').mockResolvedValue(envelope(report(true)));
    const w = mount(ImportView, { global });
    await w.find('[data-testid="import-csv"]').setValue('series_title,episode_number\nA,1');
    await w.find('[data-testid="import-analyse"]').trigger('click');
    await settle();
    expect(w.find('[data-testid="import-rows"]').text()).toContain('Créé');
    await w.find('input[type="checkbox"]').setValue(true);
    expect(w.find('[data-testid="import-rows"]').text()).not.toContain('Créé');
    expect(w.find('[data-testid="import-rows"]').text()).toContain('Boom');

    await w.find('[data-testid="import-csv"]').setValue('series_title,episode_number\nB,1');
    expect(w.text()).toContain('a changé depuis l’analyse');
    expect(w.find('[data-testid="import-run"]').attributes('disabled')).toBeDefined();
    w.unmount();
  });

  it('le modèle porte exactement les colonnes attendues par l’API', () => {
    expect(IMPORT_TEMPLATE.split('\r\n')[0]?.split(';')).toEqual([
      'series_slug',
      'series_title',
      'synopsis',
      'genres',
      'maturity_rating',
      'release_year',
      'free_episodes',
      'episode_price_coins',
      'poster_url',
      'banner_url',
      'episode_number',
      'episode_title',
      'episode_price_override',
      'video_url',
    ]);
  });
});
