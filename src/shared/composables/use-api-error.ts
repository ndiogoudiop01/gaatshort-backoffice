import { useI18n } from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import { ApiError, toApiError } from '@core/http';
import { config } from '@core/config';

/**
 * Traduction et signalement d'une erreur d'API.
 *
 * Un seul endroit décide comment une erreur se présente à l'utilisateur. Sans
 * cela, chaque écran réinvente sa formulation, et les cas rares — 429, panne
 * réseau, conflit de version — finissent affichés en anglais brut ou pas du
 * tout.
 */
export function useApiError() {
  const { t, te } = useI18n();
  const toast = useToast();

  /** Message affichable pour un code donné, avec repli explicite. */
  function messageFor(error: unknown): string {
    const apiError = toApiError(error);
    const key = `errors.codes.${apiError.code}`;
    if (te(key)) return t(key);

    // Code hors catalogue : un `BusinessRuleViolationError` peut en porter un
    // (par exemple `ACCOUNT_SUSPENDED`). On ne montre pas le message brut du
    // serveur — il n'est pas écrit pour l'utilisateur final.
    return t('errors.codes.UNKNOWN');
  }

  /**
   * Détail secondaire : les messages de validation quand il y en a.
   * `class-validator` produit des phrases libres, non contractuelles — on les
   * affiche telles quelles faute de mieux, mais on ne les analyse jamais.
   */
  function detailFor(error: unknown): string | undefined {
    const apiError = toApiError(error);
    const issues = apiError.validationIssues;
    if (issues.length > 0) return issues.join(' · ');

    if (config.ui.showErrorDetails && apiError.requestId) {
      return t('errors.requestId', { id: apiError.requestId });
    }
    return undefined;
  }

  /** Affiche l'erreur. À appeler depuis le `catch` d'une action d'écran. */
  function notify(error: unknown): ApiError {
    const apiError = toApiError(error);

    // Une session morte est déjà traitée par le client HTTP (purge + garde de
    // route) : un toast « vous n'êtes pas connecté » par-dessus la redirection
    // ne fait qu'ajouter du bruit au moment où l'écran change déjà.
    if (!apiError.isSessionDead) {
      toast.add({
        severity: apiError.status >= 500 || apiError.status === 0 ? 'error' : 'warn',
        summary: messageFor(apiError),
        detail: detailFor(apiError),
        life: 6000,
      });
    }

    return apiError;
  }

  return { messageFor, detailFor, notify };
}
