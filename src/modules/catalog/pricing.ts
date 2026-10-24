import type { Episode, SeriesDetail } from './types';

/**
 * Prix et gratuité EFFECTIFS pour la marque courante — même règle que l'API
 * (05-BACKEND-SCHEMA §10, règle 3) : surcharge de la vitrine > prix de l'épisode > prix de la série.
 * Le back-office affiche ce que le spectateur paiera réellement.
 */
export interface EffectivePrice {
  isFree: boolean;
  priceCoins: number;
  /** D'où vient le prix : la vitrine de la marque l'emporte sur l'épisode. */
  source: 'free' | 'brand' | 'episode' | 'series';
}

export function effectiveFreeEpisodes(
  s: Pick<SeriesDetail, 'freeEpisodes' | 'tenantSeries'>,
): number {
  return Math.max(0, s.tenantSeries?.freeEpisodesOverride ?? s.freeEpisodes);
}

export function effectivePrice(
  s: Pick<SeriesDetail, 'freeEpisodes' | 'episodePriceCoins' | 'tenantSeries'>,
  e: Pick<Episode, 'number' | 'priceCoinsOverride'>,
): EffectivePrice {
  if (e.number <= effectiveFreeEpisodes(s)) return { isFree: true, priceCoins: 0, source: 'free' };
  const brand = s.tenantSeries?.episodePriceCoinsOverride ?? null;
  const [price, source]: [number, EffectivePrice['source']] =
    brand !== null
      ? [brand, 'brand']
      : e.priceCoinsOverride !== null
        ? [e.priceCoinsOverride, 'episode']
        : [s.episodePriceCoins, 'series'];
  return price <= 0
    ? { isFree: true, priceCoins: 0, source: 'free' }
    : { isFree: false, priceCoins: price, source };
}
