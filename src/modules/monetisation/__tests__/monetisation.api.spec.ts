import { afterEach, describe, expect, it, vi } from 'vitest';
import { rawClient } from '@core/http/client';
import { monetisationApi } from '../monetisation.api';

const envelope = <T>(data: T) => ({
  data: { success: true, data, requestId: 'r', timestamp: 't' },
  status: 200,
});

afterEach(() => vi.restoreAllMocks());

describe('monetisationApi', () => {
  it('ne renvoie jamais le code ni la devise en modification', async () => {
    const patch = vi.spyOn(rawClient, 'patch').mockResolvedValue(envelope({}));
    await monetisationApi.updatePack('p', { code: 'x', currencyCode: 'XOF', coins: 10 });
    expect(patch).toHaveBeenCalledWith('/admin/packs/p', { coins: 10 }, undefined);
  });
});
