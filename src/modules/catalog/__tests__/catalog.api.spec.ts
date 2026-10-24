import { afterEach, describe, expect, it, vi } from 'vitest';
import { rawClient } from '@core/http/client';
import { catalogApi, compact } from '../catalog.api';
import { formatDuration, uploadVideo } from '../video-upload';

const envelope = <T>(data: T, meta?: unknown) => ({ data: { success: true, data, ...(meta ? { meta } : {}), requestId: 'r', timestamp: 't' }, status: 200 });

afterEach(() => vi.restoreAllMocks());

describe('catalogApi', () => {
  it('retire les champs vides avant l’envoi (une chaîne vide n’est pas une URL)', async () => {
    expect(compact({ a: '', b: undefined, c: 0, d: 'x', e: Number.NaN })).toEqual({ c: 0, d: 'x' });
    const post = vi.spyOn(rawClient, 'post').mockResolvedValue(envelope({ id: 's-1' }));
    await catalogApi.createSeries({ titleFr: 'Titre', posterUrl: '', genreIds: ['g'] });
    expect(post).toHaveBeenCalledWith('/admin/series', { titleFr: 'Titre', genreIds: ['g'] }, undefined);
  });

  it('encode les identifiants et cible les bonnes routes', async () => {
    const post = vi.spyOn(rawClient, 'post').mockResolvedValue(envelope({}));
    const put = vi.spyOn(rawClient, 'put').mockResolvedValue(envelope({}));
    const get = vi.spyOn(rawClient, 'get').mockResolvedValue(envelope([], { total: 0, page: 1, perPage: 20, totalPages: 0, hasMore: false }));
    await catalogApi.publishSeries('a/b');
    await catalogApi.createEpisodesBulk('s', 60);
    await catalogApi.createUpload('e');
    await catalogApi.ingest('e', 'https://src/x.mp4');
    await catalogApi.setSubtitle('e', 'en', 'https://x/en.vtt');
    await catalogApi.setStorefront('s', { status: 'LIVE', featured: true });
    await catalogApi.listSeries({ page: 1, perPage: 20, q: '' });
    expect(post.mock.calls.map((c) => c[0])).toEqual([
      '/admin/series/a%2Fb/publish', '/admin/series/s/episodes/bulk', '/admin/episodes/e/video/upload', '/admin/episodes/e/video/ingest',
    ]);
    expect(put.mock.calls.map((c) => c[0])).toEqual(['/admin/episodes/e/subtitles/en', '/admin/storefront/series/s']);
    expect(get).toHaveBeenCalledWith('/admin/series', { params: { page: 1, perPage: 20 } });
  });
});

describe('Téléversement vidéo', () => {
  it('pilote factice : rien à envoyer, 100 % tout de suite', async () => {
    const progress = vi.fn();
    const job = uploadVideo(new File(['x'], 'e.mp4'), { asset: {} as never, upload: null }, progress);
    await job.promise;
    expect(progress).toHaveBeenCalledWith(100);
    job.abort();
  });

  it('durées lisibles', () => {
    expect(formatDuration(125)).toBe('2 min 05');
    expect(formatDuration(42)).toBe('42 s');
    expect(formatDuration(null)).toBe('—');
  });
});

