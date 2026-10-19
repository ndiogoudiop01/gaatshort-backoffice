import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeJwtExpiry, tokenStorage } from '../token-storage';

function jwt(payload: Record<string, unknown>): string {
  // base64url, comme un vrai jeton : les `+` et `/` y sont remplacés par
  // `-` et `_`. Un décodeur qui l'ignore marche « la plupart du temps » —
  // puis échoue sur un jeton au hasard, ce qui est pire.
  const body = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_');
  return `header.${body}.signature`;
}

describe('tokenStorage', () => {
  beforeEach(() => {
    tokenStorage.clear();
    localStorage.clear();
  });

  it('garde le jeton d’accès en mémoire, hors de localStorage', () => {
    tokenStorage.setAccessToken('secret');

    expect(tokenStorage.getAccessToken()).toBe('secret');
    // La garantie qui compte : un XSS qui balaye `localStorage` ne le trouve pas.
    expect(JSON.stringify(localStorage)).not.toContain('secret');
  });

  it('survit à un localStorage indisponible', () => {
    // Navigation privée, stockage bloqué par la politique du navigateur.
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(() => tokenStorage.getRefreshToken()).not.toThrow();
    expect(tokenStorage.getRefreshToken()).toBeNull();

    spy.mockRestore();
  });
});

describe('decodeJwtExpiry', () => {
  it('lit `exp` dans le jeton plutôt que de croire `expiresIn`', () => {
    // `expiresIn` vaut 900 en dur côté backend. Ici le jeton dit 1800 s :
    // c'est cette valeur-là que le serveur vérifiera.
    const expiresAt = Math.floor(Date.now() / 1000) + 1800;
    expect(decodeJwtExpiry(jwt({ exp: expiresAt }))).toBe(expiresAt * 1000);
  });

  it('rend null plutôt que de lever sur un jeton illisible', () => {
    // Un magasin corrompu ne doit pas empêcher le démarrage de l'application :
    // on retombe alors sur le 401 et le rafraîchissement normal.
    expect(decodeJwtExpiry('pas-un-jeton')).toBeNull();
    expect(decodeJwtExpiry('a.!!!.c')).toBeNull();
    expect(decodeJwtExpiry(jwt({ sub: 'sans-exp' }))).toBeNull();
  });
});
