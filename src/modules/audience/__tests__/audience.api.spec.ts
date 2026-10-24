import { afterEach, describe, expect, it, vi } from 'vitest';
import { rawClient } from '@core/http/client';
import { audienceApi, barHeights } from '../audience.api';

const envelope = <T>(data: T) => ({
  data: { success: true, data, requestId: 'r', timestamp: 't' },
  status: 200,
});

afterEach(() => vi.restoreAllMocks());

describe('audienceApi', () => {
  it('ajustement : delta et motif', async () => {
    const post = vi.spyOn(rawClient, 'post').mockResolvedValue(envelope({ total: 1 }));
    await audienceApi.adjust('acc', 10, 'geste commercial');
    expect(post).toHaveBeenCalledWith(
      '/admin/viewers/acc/wallet/adjust',
      { delta: 10, reason: 'geste commercial' },
      undefined,
    );
  });

  it('hauteurs de barres proportionnelles, jamais invisibles si non nulles', () => {
    expect(barHeights([0, 50, 100])).toEqual([2, 50, 100]);
    expect(barHeights([0, 0])).toEqual([0, 0]);
  });
});
