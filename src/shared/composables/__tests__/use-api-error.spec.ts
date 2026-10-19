import { afterEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';
import { ApiError } from '@core/http';
import fr from '@core/i18n/locales/fr';
import { useApiError } from '../use-api-error';

const toastAdd = vi.fn();
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: toastAdd }) }));

/** Monte le composable dans un composant, seul endroit où `useI18n` fonctionne. */
function withComposable(): ReturnType<typeof useApiError> {
  let api!: ReturnType<typeof useApiError>;

  const host = defineComponent({
    setup() {
      api = useApiError();
      return () => null;
    },
  });

  mount(host, {
    global: {
      plugins: [createI18n({ legacy: false, locale: 'fr', messages: { fr } })],
    },
  });

  return api;
}

afterEach(() => toastAdd.mockClear());

describe('useApiError', () => {
  it('traduit par CODE, jamais par le message du serveur', () => {
    const { messageFor } = withComposable();

    const error = new ApiError({
      code: 'CONCURRENCY_CONFLICT',
      // Ce message est une aide au développeur, pas une phrase pour
      // l'utilisateur final. Il ne doit jamais atteindre l'écran.
      message: 'Optimistic lock failure on Application(42)',
      status: 409,
    });

    expect(messageFor(error)).toBe(fr.errors.codes.CONCURRENCY_CONFLICT);
  });

  it('retombe sur un message générique pour un code hors catalogue', () => {
    // `BusinessRuleViolationError` peut en porter un — ACCOUNT_SUSPENDED, par
    // exemple. Afficher la clé brute serait pire que de rester générique.
    const { messageFor } = withComposable();
    const error = new ApiError({ code: 'ACCOUNT_SUSPENDED', message: 'suspended', status: 403 });

    expect(messageFor(error)).toBe(fr.errors.codes.UNKNOWN);
  });

  it('affiche les messages de validation, qui vivent dans details.issues', () => {
    const { detailFor } = withComposable();
    const error = new ApiError({
      code: 'VALIDATION_FAILED',
      message: 'Requête invalide',
      status: 400,
      details: { issues: ['email must be an email', 'phone is too short'] },
    });

    expect(detailFor(error)).toBe('email must be an email · phone is too short');
  });

  it('ne double pas la redirection d’une session morte par un toast', () => {
    // Le client HTTP a déjà purgé la session et le garde de route change
    // d'écran : un toast « vous n'êtes pas connecté » par-dessus n'ajoute
    // que du bruit au pire moment.
    const { notify } = withComposable();
    notify(new ApiError({ code: 'SESSION_REVOKED', message: '', status: 401 }));

    expect(toastAdd).not.toHaveBeenCalled();
  });

  it('distingue une panne serveur d’un refus métier', () => {
    const { notify } = withComposable();

    notify(new ApiError({ code: 'INTERNAL_ERROR', message: '', status: 500 }));
    expect(toastAdd).toHaveBeenLastCalledWith(expect.objectContaining({ severity: 'error' }));

    notify(new ApiError({ code: 'FORBIDDEN_ACTION', message: '', status: 403 }));
    expect(toastAdd).toHaveBeenLastCalledWith(expect.objectContaining({ severity: 'warn' }));

    // Réseau injoignable : statut 0, mais c'est bien une panne.
    notify(new ApiError({ code: 'NETWORK_UNAVAILABLE', message: '', status: 0 }));
    expect(toastAdd).toHaveBeenLastCalledWith(expect.objectContaining({ severity: 'error' }));
  });

  it('normalise une erreur quelconque avant de l’afficher', () => {
    const { notify } = withComposable();
    const normalized = notify({ message: 'Network Error' });

    expect(normalized).toBeInstanceOf(ApiError);
    expect(normalized.code).toBe('NETWORK_UNAVAILABLE');
    expect(toastAdd).toHaveBeenCalledTimes(1);
  });
});
