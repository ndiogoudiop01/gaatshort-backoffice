<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Password from 'primevue/password';
import { useAuthStore } from '@core/auth/auth.store';
import { toApiError } from '@core/http';
import { config } from '@core/config';

/**
 * Connexion au back-office par e-mail et mot de passe, en un seul temps :
 * `POST /auth/login` renvoie directement la paire de jetons. Les canaux OTP /
 * lien magique ne sont plus proposés ici.
 */

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const email = ref('');
const password = ref('');
const pending = ref(false);
const errorMessage = ref<string | null>(null);

const canSubmit = computed(() => email.value.trim().length >= 5 && password.value.length > 0);

function fail(error: unknown): void {
  const apiError = toApiError(error);
  // Un 401 sur la route de connexion signifie « identifiants refusés », pas
  // « session expirée » : on ne réutilise pas le libellé UNAUTHENTICATED.
  const code = apiError.status === 401 ? 'INVALID_CREDENTIALS' : apiError.code;
  // Les codes d'authentification ont des libellés dédiés ; tout le reste
  // retombe sur un message générique plutôt que d'afficher l'anglais brut
  // du plafonnement de débit.
  errorMessage.value = t(`errors.codes.${code}`, t('errors.codes.UNKNOWN'));
}

async function submit(): Promise<void> {
  if (!canSubmit.value || pending.value) return;
  pending.value = true;
  errorMessage.value = null;
  try {
    await auth.login({ email: email.value.trim(), password: password.value });

    // On ne rejoue que le CHEMIN transmis par le garde de route. Rediriger
    // vers une URL absolue fournie en paramètre serait une redirection ouverte.
    const redirect = route.query['redirect'];
    const target = typeof redirect === 'string' && redirect.startsWith('/') ? redirect : null;
    await router.push(target ?? { name: 'home' });
  } catch (error) {
    // Le mot de passe ne reste pas dans le champ après un refus.
    password.value = '';
    fail(error);
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-full items-center justify-center p-6">
    <div
      class="w-full max-w-md rounded-xl border border-surface-200 bg-surface-0 p-8 shadow-sm dark:border-surface-800 dark:bg-surface-900"
    >
      <div class="mb-6 flex items-center gap-2">
        <i class="pi pi-bolt text-xl text-primary" />
        <span class="font-semibold">{{ t('app.name') }}</span>
        <span
          v-if="!config.app.isProduction"
          class="ml-auto rounded bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800"
        >
          {{ config.app.env }}
        </span>
      </div>

      <h1 class="text-lg font-semibold">{{ t('auth.signIn') }}</h1>
      <p class="mb-6 text-sm text-surface-500">{{ t('auth.subtitle') }}</p>

      <Message v-if="errorMessage" severity="error" :closable="false" class="mb-4">
        {{ errorMessage }}
      </Message>

      <form class="flex flex-col gap-4" novalidate @submit.prevent="submit">
        <div class="flex flex-col gap-2">
          <label for="email" class="text-sm font-medium">{{ t('auth.email') }}</label>
          <InputText
            id="email"
            v-model="email"
            type="email"
            autocomplete="username"
            inputmode="email"
            placeholder="prenom.nom@exemple.org"
            autofocus
            required
            :invalid="errorMessage !== null"
          />
        </div>

        <div class="flex flex-col gap-2">
          <label for="password" class="text-sm font-medium">{{ t('auth.password') }}</label>
          <Password
            v-model="password"
            input-id="password"
            :feedback="false"
            toggle-mask
            fluid
            required
            :invalid="errorMessage !== null"
            :input-props="{ autocomplete: 'current-password' }"
            :aria-label="t('auth.password')"
          />
        </div>

        <Button
          type="submit"
          :label="t('auth.submit')"
          icon="pi pi-sign-in"
          :loading="pending"
          :disabled="!canSubmit"
        />
      </form>
    </div>
  </div>
</template>
