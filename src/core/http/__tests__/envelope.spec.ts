import { describe, expect, it } from 'vitest';
import { isApiEnvelope, isCursorMeta, isErrorEnvelope, isOffsetMeta } from '../envelope';

describe('enveloppe', () => {
  const success = {
    success: true,
    data: [],
    requestId: null,
    timestamp: '2026-01-01T00:00:00.000Z',
  };

  it('reconnaît les deux formes de l’enveloppe', () => {
    expect(isApiEnvelope(success)).toBe(true);
    expect(
      isApiEnvelope({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'x' },
        requestId: null,
        timestamp: '2026-01-01T00:00:00.000Z',
      }),
    ).toBe(true);
  });

  it('rejette ce qui n’en est pas une', () => {
    // `requestId` vaut `null` quand l'intergiciel de corrélation n'a pas
    // tourné : c'est valide. Une réponse SANS la clé `success`, elle, ne
    // vient pas de l'API — proxy, cache, page d'erreur.
    expect(isApiEnvelope({ data: [] })).toBe(false);
    expect(isApiEnvelope('<html>')).toBe(false);
    expect(isApiEnvelope(null)).toBe(false);
  });

  it('n’appelle « erreur » qu’une enveloppe qui porte un code', () => {
    expect(isErrorEnvelope(success)).toBe(false);
    expect(isErrorEnvelope({ success: false, error: {} })).toBe(false);
  });

  it('distingue la pagination par décalage de la pagination par curseur', () => {
    expect(isOffsetMeta({ total: 0, page: 1, perPage: 20, totalPages: 0, hasMore: false })).toBe(
      true,
    );
    // Seule `GET /api/v1/news` répond ainsi : lire `total` dessus donnerait
    // `undefined`, et un tableau afficherait « 0 résultats » sur une page pleine.
    expect(isOffsetMeta({ nextCursor: 'abc', hasMore: true })).toBe(false);
  });

  it('reconnaît une meta curseur à sa forme, sans lire le curseur (BSG-10)', () => {
    expect(isCursorMeta({ nextCursor: 'abc', hasMore: true })).toBe(true);
    expect(isCursorMeta({ nextCursor: null, hasMore: false })).toBe(true);
    expect(isCursorMeta({ total: 0, page: 1, perPage: 20, totalPages: 0, hasMore: false })).toBe(
      false,
    );
    expect(isCursorMeta({ nextCursor: 'abc' })).toBe(false);
    expect(isCursorMeta(null)).toBe(false);
  });
});
