export type SeriesStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type EpisodeStatus = 'DRAFT' | 'PUBLISHED' | 'WITHDRAWN';
export type MediaStatus = 'PENDING_UPLOAD' | 'PROCESSING' | 'READY' | 'FAILED';
export type TenantSeriesStatus = 'HIDDEN' | 'LIVE';

export interface Genre {
  id: string;
  slug: string;
  nameFr: string;
  nameEn: string;
  position: number;
  _count?: { series: number };
}

export interface License {
  id: string;
  licensorName: string;
  contractRef: string;
  documentUrl: string | null;
  startsAt: string;
  endsAt: string;
  territories: string[];
  sublicensingAllowed: boolean;
  notes: string | null;
  series?: { id: string; slug: string; titleFr: string }[];
}

export interface SeriesRow {
  id: string;
  slug: string;
  status: SeriesStatus;
  titleFr: string;
  titleEn: string | null;
  posterUrl: string | null;
  genres: { id: string; slug: string; nameFr: string }[];
  episodeCount: number;
  publishedEpisodeCount: number;
  licensed: boolean;
  tenantStatus: TenantSeriesStatus;
  updatedAt: string;
}

export interface MediaAsset {
  id: string;
  provider: 'BUNNY_STREAM' | 'FAKE';
  providerRef: string;
  status: MediaStatus;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  failureReason: string | null;
}

export interface Episode {
  id: string;
  seriesId: string;
  number: number;
  status: EpisodeStatus;
  titleFr: string | null;
  titleEn: string | null;
  durationSeconds: number | null;
  priceCoinsOverride: number | null;
  thumbnailUrl: string | null;
  video: MediaAsset | null;
  subtitles: { locale: string; url: string }[];
  unlockCount?: number;
}

export interface SeriesDetail {
  id: string;
  slug: string;
  status: SeriesStatus;
  originalLocale: 'fr' | 'en';
  titleFr: string;
  titleEn: string | null;
  synopsisFr: string;
  synopsisEn: string | null;
  posterUrl: string | null;
  bannerUrl: string | null;
  maturityRating: string;
  releaseYear: number | null;
  tags: string[];
  freeEpisodes: number;
  episodePriceCoins: number;
  publishedAt: string | null;
  genres: Genre[];
  licenses: License[];
  episodes: Episode[];
  tenantSeries: {
    status: TenantSeriesStatus;
    featured: boolean;
    freeEpisodesOverride?: number | null;
    episodePriceCoinsOverride?: number | null;
  } | null;
}

export interface SeriesInput {
  slug?: string;
  titleFr?: string;
  titleEn?: string;
  synopsisFr?: string;
  synopsisEn?: string;
  originalLocale?: 'fr' | 'en';
  posterUrl?: string;
  bannerUrl?: string;
  maturityRating?: string;
  releaseYear?: number;
  tags?: string[];
  freeEpisodes?: number;
  episodePriceCoins?: number;
  genreIds?: string[];
}

export interface LicenseInput {
  licensorName: string;
  contractRef: string;
  documentUrl?: string;
  startsAt: string;
  endsAt: string;
  territories: string[];
  sublicensingAllowed?: boolean;
  notes?: string;
  seriesIds?: string[];
}

export interface StorefrontRow {
  seriesId: string;
  slug: string;
  titleFr: string;
  posterUrl: string | null;
  episodeCount: number;
  freeEpisodes: number;
  episodePriceCoins: number;
  licensedForTenant: boolean;
  status: TenantSeriesStatus;
  featured: boolean;
  position: number;
  freeEpisodesOverride: number | null;
  episodePriceCoinsOverride: number | null;
}

export interface UploadTicket {
  asset: MediaAsset;
  upload: { endpoint: string; headers: Record<string, string> } | null;
}

export type ImportRowAction = 'CREATED' | 'UPDATED' | 'UNCHANGED' | 'ERROR';
export type ImportVideoAction = 'QUEUED' | 'ALREADY_PRESENT' | 'NONE' | 'ERROR';

export interface ImportReport {
  dryRun: boolean;
  totals: {
    rows: number;
    seriesCreated: number;
    seriesUpdated: number;
    episodesCreated: number;
    episodesUpdated: number;
    videosQueued: number;
    videosAlreadyPresent: number;
    errors: number;
  };
  series: { slug: string; action: ImportRowAction; id?: string; message?: string }[];
  rows: {
    line: number;
    seriesSlug: string;
    episodeNumber: number;
    episode: ImportRowAction;
    video: ImportVideoAction;
    message?: string;
  }[];
  errors: { line: number; message: string }[];
  warnings: { line: number; message: string }[];
}
