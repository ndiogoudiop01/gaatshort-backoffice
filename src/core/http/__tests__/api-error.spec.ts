import { describe, expect, it } from 'vitest';
import { ApiError, toApiError } from '../api-error';

/**
 * Ces cas encodent le CONTRAT du backend, pas le comportement d'axios. Si l'un
 * d'eux tombe après une montée de version, c'est le contrat qu'il faut
 * revérifier — pas le test qu'il faut assouplir.
 */
describe('toApiError', () => {
  it("privilégie le code de l'enveloppe sur le statut HTTP", () => {
    const error = toApiError({
      response: {
        status: 400,
        data: {
          success: false,
          error: { code: 'INVALID_STATE_TRANSITION', message: 'Transition refusée' },
          requestId: 'req-1',
          timestamp: '2026-01-01T00:00:00.000Z',
        },
      },
    });

    // Un 400 générique aurait donné VALIDATION_FAILED : c'est précisément
    // l'approximation que l'on refuse.
    expect(error.code).toBe('INVALID_STATE_TRANSITION');
    expect(error.status).toBe(400);
    expect(error.requestId).toBe('req-1');
  });

  it('distingue une coupure réseau d’un délai dépassé', () => {
    expect(toApiError({ message: 'Network Error' }).code).toBe('NETWORK_UNAVAILABLE');
    expect(toApiError({ code: 'ECONNABORTED', message: 'timeout' }).code).toBe('NETWORK_TIMEOUT');
  });

  it('signale une réponse non enveloppée comme venant d’ailleurs que de l’API', () => {
    // Page d'erreur nginx, passerelle CapRover : le corps n'est pas du JSON
    // enveloppé. Le confondre avec une erreur métier enverrait le lecteur
    // chercher un bogue applicatif qui n'existe pas.
    const error = toApiError({ response: { status: 502, data: '<html>502</html>' } });
    expect(error.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(error.status).toBe(502);
  });

  it('laisse passer un code hors catalogue', () => {
    // `BusinessRuleViolationError` peut en porter un (ACCOUNT_SUSPENDED).
    const error = toApiError({
      response: {
        status: 403,
        data: {
          success: false,
          error: { code: 'ACCOUNT_SUSPENDED', message: 'Compte suspendu' },
          requestId: null,
          timestamp: '2026-01-01T00:00:00.000Z',
        },
      },
    });
    expect(error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('renvoie telle quelle une ApiError déjà normalisée', () => {
    const original = new ApiError({ code: 'INTERNAL_ERROR', message: 'x', status: 500 });
    expect(toApiError(original)).toBe(original);
  });
});

describe('ApiError', () => {
  it('lit les messages de validation dans details.issues, pas dans message', () => {
    const error = new ApiError({
      code: 'VALIDATION_FAILED',
      // Le backend met ici une chaîne fixe : s'y fier pour afficher le détail
      // donnerait toujours le même message, quel que soit le champ fautif.
      message: 'Requête invalide',
      status: 400,
      details: { issues: ['email must be an email', 42, 'phone is too short'] },
    });

    expect(error.validationIssues).toEqual(['email must be an email', 'phone is too short']);
  });

  it('ne considère morte que la session qu’un rafraîchissement ne sauvera pas', () => {
    const dead = (code: string) => new ApiError({ code, message: '', status: 401 }).isSessionDead;

    expect(dead('SESSION_REVOKED')).toBe(true);
    expect(dead('TOKEN_EXPIRED')).toBe(true);
    expect(dead('UNAUTHENTICATED')).toBe(true);
    expect(dead('FORBIDDEN_ACTION')).toBe(false);
  });

  it('ne tranche pas entre « inexistant » et « autre tenant » sur un 404', () => {
    const error = new ApiError({ code: 'RESOURCE_NOT_FOUND', message: '', status: 404 });
    expect(error.isNotFoundOrForeignTenant).toBe(true);
  });
});
