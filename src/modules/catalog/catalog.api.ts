import { api } from '@core/http';
import type {
  Episode,
  Genre,
  ImportReport,
  License,
  LicenseInput,
  MediaAsset,
  SeriesDetail,
  SeriesInput,
  SeriesRow,
  SeriesStatus,
  StorefrontRow,
  TenantSeriesStatus,
  UploadTicket,
} from './types';

/** Seul point du module qui connaît des URL (API `/admin/*` du catalogue). */
const enc = encodeURIComponent;

/** Retire les champs vides : une chaîne vide n'est pas une URL valide côté API. */
export function compact<T extends object>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(
      ([, v]) => v !== undefined && v !== '' && !(typeof v === 'number' && Number.isNaN(v)),
    ),
  ) as Partial<T>;
}

export const catalogApi = {
  // Genres
  genres: () => api.get<Genre[]>('/admin/genres'),
  createGenre: (g: { slug: string; nameFr: string; nameEn: string; position?: number }) =>
    api.post<Genre>('/admin/genres', g),
  updateGenre: (id: string, g: { nameFr?: string; nameEn?: string; position?: number }) =>
    api.patch<Genre>(`/admin/genres/${enc(id)}`, g),
  deleteGenre: (id: string) => api.delete<void>(`/admin/genres/${enc(id)}`),

  // Séries
  listSeries: (q: { page: number; perPage: number; status?: SeriesStatus; q?: string }) =>
    api.getPaginated<SeriesRow>('/admin/series', { params: compact(q) }),
  series: (id: string) => api.get<SeriesDetail>(`/admin/series/${enc(id)}`),
  createSeries: (input: SeriesInput & { titleFr: string }) =>
    api.post<SeriesDetail>('/admin/series', compact(input)),
  updateSeries: (id: string, input: SeriesInput) =>
    api.patch<SeriesDetail>(`/admin/series/${enc(id)}`, compact(input)),
  publishSeries: (id: string) => api.post<SeriesDetail>(`/admin/series/${enc(id)}/publish`),
  unpublishSeries: (id: string) => api.post<SeriesDetail>(`/admin/series/${enc(id)}/unpublish`),
  archiveSeries: (id: string) => api.delete<void>(`/admin/series/${enc(id)}`),

  // Épisodes
  createEpisode: (
    seriesId: string,
    e: { number?: number; titleFr?: string; titleEn?: string; priceCoinsOverride?: number },
  ) => api.post<Episode>(`/admin/series/${enc(seriesId)}/episodes`, compact(e)),
  createEpisodesBulk: (seriesId: string, count: number) =>
    api.post<{ created: number; fromNumber: number; toNumber: number }>(
      `/admin/series/${enc(seriesId)}/episodes/bulk`,
      { count },
    ),
  publishReady: (seriesId: string) =>
    api.post<{ published: number }>(`/admin/series/${enc(seriesId)}/episodes/publish-ready`),
  updateEpisode: (
    id: string,
    e: { titleFr?: string | null; titleEn?: string | null; priceCoinsOverride?: number | null },
  ) => api.patch<Episode>(`/admin/episodes/${enc(id)}`, e),
  publishEpisode: (id: string) => api.post<Episode>(`/admin/episodes/${enc(id)}/publish`),
  withdrawEpisode: (id: string) => api.post<Episode>(`/admin/episodes/${enc(id)}/withdraw`),
  deleteEpisode: (id: string) => api.delete<void>(`/admin/episodes/${enc(id)}`),
  createUpload: (episodeId: string) =>
    api.post<UploadTicket>(`/admin/episodes/${enc(episodeId)}/video/upload`),
  ingest: (episodeId: string, sourceUrl: string) =>
    api.post<MediaAsset>(`/admin/episodes/${enc(episodeId)}/video/ingest`, { sourceUrl }),
  refreshMedia: (assetId: string) => api.post<MediaAsset>(`/admin/media/${enc(assetId)}/refresh`),
  setSubtitle: (episodeId: string, locale: 'fr' | 'en', url: string) =>
    api.put<Episode>(`/admin/episodes/${enc(episodeId)}/subtitles/${locale}`, { url }),
  removeSubtitle: (episodeId: string, locale: 'fr' | 'en') =>
    api.delete<Episode>(`/admin/episodes/${enc(episodeId)}/subtitles/${locale}`),

  // Licences
  licenses: () => api.get<License[]>('/admin/licenses'),
  createLicense: (l: LicenseInput) => api.post<License>('/admin/licenses', compact(l)),
  updateLicense: (id: string, l: Partial<LicenseInput>) =>
    api.patch<License>(`/admin/licenses/${enc(id)}`, compact(l)),
  deleteLicense: (id: string) => api.delete<void>(`/admin/licenses/${enc(id)}`),

  // Import en lot (BO-17) : essai à blanc par défaut
  importCatalog: (csv: string, dryRun: boolean) =>
    api.post<ImportReport>('/admin/catalog/import', { csv, dryRun }),

  // Vitrine de la marque courante
  storefront: (q: { q?: string; status?: TenantSeriesStatus } = {}) =>
    api.get<StorefrontRow[]>('/admin/storefront/series', { params: compact(q) }),
  setStorefront: (
    seriesId: string,
    body: {
      status: TenantSeriesStatus;
      featured?: boolean;
      position?: number;
      freeEpisodesOverride?: number | null;
      episodePriceCoinsOverride?: number | null;
    },
  ) => api.put<StorefrontRow>(`/admin/storefront/series/${enc(seriesId)}`, body),
};
