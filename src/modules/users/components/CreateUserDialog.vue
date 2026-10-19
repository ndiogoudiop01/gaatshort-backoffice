<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import { useApiError } from '@shared/composables/use-api-error';
import { usersApi } from '../users.api';
import { countryName, flagOf } from '../users-rules';
import { createUserSchema, type RoleView, type TenantCountry, type UserDetail } from '../types';

/**
 * Nouveau compte (BSG-12). PAS de mot de passe : la personne se connectera
 * par un lien ou un code envoyé à son adresse (`POST /auth/challenge`).
 * Seuls les rôles `assignable` (calculé par l'API) sont proposés.
 */
const props = defineProps<{ roles: readonly RoleView[]; countries: readonly TenantCountry[] }>();
const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ created: [user: UserDetail] }>();

const { t } = useI18n();
const { notify } = useApiError();

const form = reactive({
  email: '',
  firstName: '',
  lastName: '',
  phoneE164: '',
  countryCode: null as string | null,
  roleKeys: [] as string[],
});
const submitted = ref(false);
const saving = ref(false);

watch(visible, (open) => {
  if (!open) return;
  Object.assign(form, { email: '', firstName: '', lastName: '', phoneE164: '', roleKeys: [] });
  form.countryCode = props.countries.find((c) => c.isDefault)?.countryCode ?? null;
  submitted.value = false;
});

const countryOptions = computed(() =>
  props.countries.map((c) => ({
    value: c.countryCode,
    label: `${flagOf(c.countryCode)} ${countryName(c.countryCode)}`,
  })),
);

const parsed = computed(() =>
  createUserSchema.safeParse({
    email: form.email,
    firstName: form.firstName.trim() || null,
    lastName: form.lastName.trim() || null,
    phoneE164: form.phoneE164.trim() || null,
    countryCode: form.countryCode,
    roleKeys: form.roleKeys,
  }),
);
const emailInvalid = computed(
  () => submitted.value && !createUserSchema.shape.email.safeParse(form.email).success,
);
const phoneInvalid = computed(
  () =>
    submitted.value &&
    !!form.phoneE164.trim() &&
    !createUserSchema.shape.phoneE164.safeParse(form.phoneE164.trim()).success,
);

function toggleRole(role: RoleView): void {
  if (!role.assignable) return;
  form.roleKeys = form.roleKeys.includes(role.key)
    ? form.roleKeys.filter((k) => k !== role.key)
    : [...form.roleKeys, role.key];
}

async function submit(): Promise<void> {
  submitted.value = true;
  if (saving.value || !parsed.value.success) return;
  saving.value = true;
  try {
    const user = await usersApi.create(parsed.value.data);
    visible.value = false;
    emit('created', user);
  } catch (error) {
    notify(error);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    :header="t('users.create.title')"
    :closable="!saving"
    :style="{ width: '40rem' }"
    :breakpoints="{ '720px': '95vw' }"
    data-testid="create-user-dialog"
  >
    <form class="flex flex-col gap-4" novalidate @submit.prevent="submit">
      <p class="hint-box">
        <i class="pi pi-envelope" aria-hidden="true" />
        {{ t('users.create.passwordless') }}
      </p>

      <div class="field">
        <label for="new-email">{{ t('users.fields.email') }} *</label>
        <InputText
          id="new-email"
          v-model="form.email"
          type="email"
          autocomplete="off"
          :invalid="emailInvalid"
          data-testid="new-email"
          fluid
        />
        <small v-if="emailInvalid" class="error">{{ t('users.errors.email') }}</small>
      </div>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div class="field">
          <label for="new-first">{{ t('users.fields.firstName') }}</label>
          <InputText id="new-first" v-model="form.firstName" maxlength="80" fluid />
        </div>
        <div class="field">
          <label for="new-last">{{ t('users.fields.lastName') }}</label>
          <InputText id="new-last" v-model="form.lastName" maxlength="80" fluid />
        </div>
        <div class="field">
          <label for="new-phone">{{ t('users.fields.phone') }}</label>
          <InputText
            id="new-phone"
            v-model="form.phoneE164"
            inputmode="tel"
            placeholder="+221771234567"
            :invalid="phoneInvalid"
            fluid
          />
          <small v-if="phoneInvalid" class="error">{{ t('users.errors.phone') }}</small>
        </div>
        <div class="field">
          <label for="new-country">{{ t('users.fields.homeCountry') }}</label>
          <Select
            v-model="form.countryCode"
            input-id="new-country"
            :options="countryOptions"
            option-label="label"
            option-value="value"
            fluid
          />
        </div>
      </div>

      <fieldset class="flex flex-col gap-2">
        <legend class="mb-1 text-sm font-medium">{{ t('users.fields.roles') }}</legend>
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            v-for="role in roles"
            :key="role.key"
            type="button"
            class="role-pick"
            :class="{ 'role-pick--on': form.roleKeys.includes(role.key) }"
            :aria-pressed="form.roleKeys.includes(role.key)"
            :disabled="!role.assignable"
            :title="role.assignable ? undefined : t('users.roles.notAssignable')"
            :data-testid="`new-role-${role.key}`"
            @click="toggleRole(role)"
          >
            <span class="flex min-w-0 flex-col items-start">
              <span class="truncate font-medium">{{ role.name }}</span>
              <span class="font-mono text-[0.7rem] text-surface-500">{{ role.key }}</span>
            </span>
            <i
              :class="
                !role.assignable
                  ? 'pi pi-lock'
                  : form.roleKeys.includes(role.key)
                    ? 'pi pi-check-circle'
                    : 'pi pi-circle'
              "
              aria-hidden="true"
            />
          </button>
        </div>
      </fieldset>

      <div class="mt-2 flex justify-end gap-2">
        <Button
          type="button"
          :label="t('common.cancel')"
          text
          :disabled="saving"
          @click="visible = false"
        />
        <Button
          type="submit"
          :label="t('users.create.submit')"
          icon="pi pi-user-plus"
          :loading="saving"
          data-testid="create-user-submit"
        />
      </div>
    </form>
  </Dialog>
</template>

<style scoped>
.field {
  @apply flex flex-col gap-1;
}
.field label {
  @apply text-sm font-medium;
}
.error {
  @apply text-xs text-red-600;
}
.hint-box {
  @apply flex items-start gap-2 rounded-lg bg-surface-50 p-3 text-sm text-surface-600 dark:bg-surface-800/60 dark:text-surface-300;
}
.role-pick {
  @apply flex items-center justify-between gap-3 rounded-lg border border-surface-200 px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50 dark:border-surface-700;
  transition:
    border-color var(--duration-popover) ease,
    background-color var(--duration-popover) ease;
}
.role-pick--on {
  @apply border-primary-400 bg-primary-50/70 text-primary-800 dark:border-primary-700 dark:bg-primary-950/40 dark:text-primary-100;
}
</style>
