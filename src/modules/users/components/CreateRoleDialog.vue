<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import Textarea from 'primevue/textarea';
import { useApiError } from '@shared/composables/use-api-error';
import { usersApi } from '../users.api';
import { roleKeyFrom } from '../users-rules';
import { createRoleSchema, type RoleView } from '../types';

/**
 * Nouveau profil personnalisé (BSG-12), vide ou copié d'un profil existant.
 * La copie est soumise à l'anti-escalade côté serveur : on ne copie que des
 * permissions que l'on possède soi-même.
 */
const props = defineProps<{ roles: readonly RoleView[] }>();
const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ created: [role: RoleView] }>();

const { t } = useI18n();
const { notify } = useApiError();

const form = reactive({ name: '', key: '', description: '', copyFrom: null as string | null });
const keyTouched = ref(false);
const submitted = ref(false);
const saving = ref(false);

watch(visible, (open) => {
  if (!open) return;
  Object.assign(form, { name: '', key: '', description: '', copyFrom: null });
  keyTouched.value = false;
  submitted.value = false;
});
watch(
  () => form.name,
  (name) => {
    if (!keyTouched.value) form.key = roleKeyFrom(name);
  },
);

const copyOptions = computed(() => [
  { value: null, label: t('users.roleCreate.empty') },
  ...props.roles
    .filter((r) => r.assignable)
    .map((r) => ({ value: r.key, label: `${r.name} (${r.permissions.length})` })),
]);

const parsed = computed(() =>
  createRoleSchema.safeParse({
    key: form.key,
    name: form.name,
    description: form.description.trim() || null,
    ...(form.copyFrom ? { copyFrom: form.copyFrom } : {}),
  }),
);

async function submit(): Promise<void> {
  submitted.value = true;
  if (saving.value || !parsed.value.success) return;
  saving.value = true;
  try {
    const role = await usersApi.createRole(parsed.value.data);
    visible.value = false;
    emit('created', role);
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
    :header="t('users.roleCreate.title')"
    :closable="!saving"
    :style="{ width: '32rem' }"
    :breakpoints="{ '640px': '95vw' }"
    data-testid="create-role-dialog"
  >
    <form class="flex flex-col gap-4" novalidate @submit.prevent="submit">
      <div class="field">
        <label for="role-name">{{ t('users.roleCreate.name') }} *</label>
        <InputText
          id="role-name"
          v-model="form.name"
          maxlength="80"
          :invalid="submitted && form.name.trim().length < 2"
          fluid
          data-testid="role-name"
        />
      </div>
      <div class="field">
        <label for="role-key">{{ t('users.roleCreate.key') }} *</label>
        <InputText
          id="role-key"
          v-model="form.key"
          class="font-mono"
          maxlength="40"
          :invalid="submitted && !createRoleSchema.shape.key.safeParse(form.key).success"
          fluid
          @input="keyTouched = true"
        />
        <small class="text-xs text-surface-500">{{ t('users.roleCreate.keyHelp') }}</small>
      </div>
      <div class="field">
        <label for="role-desc">{{ t('users.roleCreate.description') }}</label>
        <Textarea
          id="role-desc"
          v-model="form.description"
          rows="2"
          maxlength="300"
          auto-resize
          fluid
        />
      </div>
      <div class="field">
        <label for="role-copy">{{ t('users.roleCreate.copyFrom') }}</label>
        <Select
          v-model="form.copyFrom"
          input-id="role-copy"
          :options="copyOptions"
          option-label="label"
          option-value="value"
          fluid
        />
      </div>
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
          :label="t('users.roleCreate.submit')"
          icon="pi pi-plus"
          :loading="saving"
          data-testid="create-role-submit"
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
</style>
