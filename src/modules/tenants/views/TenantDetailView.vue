<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useEventListener } from '@vueuse/core';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import ProgressSpinner from 'primevue/progressspinner';
import Select from 'primevue/select';
import ToggleSwitch from 'primevue/toggleswitch';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import { useApiError } from '@shared/composables/use-api-error';
import BrandPreview from '../components/BrandPreview.vue';
import ConfirmTenantDialog from '../components/ConfirmTenantDialog.vue';
import TenantStatusTag from '../components/TenantStatusTag.vue';
import { tenantsApi } from '../tenants.api';
import {
  buildTenantPatch,
  cutsAccess,
  describeChanges,
  isEmptyPatch,
  timezones,
  toForm,
  type TenantForm,
} from '../tenant-rules';
import {
  tenantPatchSchema,
  type TenantPatch,
  type TenantReference,
  type TenantStatus,
  type TenantView,
} from '../types';

/**
 * Une organisation (BSG-13) — SUPER_ADMIN.
 *
 * Toute écriture :
 *  1. part d'un PATCH construit champ par champ, limité à ce qui a changé
 *     (`buildTenantPatch`) — jamais le formulaire ni l'objet reçu en GET ;
 *  2. est validée par le schéma Zod `.strict()` (liste blanche) ;
 *  3. passe par une confirmation qui NOMME l'organisation et liste les
 *     changements ; couper l'accès exige de retaper son identifiant.
 *
 * Non modifiables ici : identifiant (`slug`), isolation, domaines.
 */
const props = defineProps<{ id: string }>();

const { t, te, d, n } = useI18n();
const toast = useToast();
const confirmService = useConfirm();
const { notify, messageFor } = useApiError();

const tenant = ref<TenantView | null>(null);
const reference = ref<TenantReference>({ countries: [], currencies: [] });
const loading = ref(false);
const loadError = ref<unknown>(null);

const form = reactive<TenantForm>({
  name: '',
  legalName: '',
  defaultLocale: 'fr',
  defaultCountry: '',
  defaultCurrency: '',
  timezone: '',
  primaryColor: '',
  logoUrl: '',
  featureFlags: {},
});

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    const [detail, ref_] = await Promise.all([tenantsApi.detail(props.id), tenantsApi.reference()]);
    reference.value = ref_;
    apply(detail);
  } catch (error) {
    // 404 : inexistante ou supprimée — message neutre du catalogue d'erreurs.
    tenant.value = null;
    loadError.value = error;
  } finally {
    loading.value = false;
  }
}
function apply(detail: TenantView): void {
  tenant.value = detail;
  Object.assign(form, toForm(detail));
}
watch(() => props.id, load, { immediate: true });

const patch = computed<TenantPatch>(() =>
  tenant.value ? buildTenantPatch(tenant.value, form) : {},
);
const dirty = computed(() => !isEmptyPatch(patch.value));
const validation = computed(() => (dirty.value ? tenantPatchSchema.safeParse(patch.value) : null));
const invalidFields = computed(() =>
  validation.value && !validation.value.success
    ? new Set(
        validation.value.error.issues.map((issue) =>
          String(issue.path[0] === 'branding' ? issue.path[1] : issue.path[0]),
        ),
      )
    : new Set<string>(),
);

// ─────────────────────────── Confirmation et écriture ───────────────────────────

const confirmOpen = ref(false);
const pendingPatch = ref<TenantPatch>({});
const saving = ref(false);
const changes = computed(() =>
  tenant.value ? describeChanges(tenant.value, pendingPatch.value) : [],
);

function askSave(): void {
  if (!dirty.value || saving.value || invalidFields.value.size) return;
  // Reconstruit champ par champ au moment de confirmer : aucune copie d'objet.
  pendingPatch.value = buildTenantPatch(tenant.value!, form);
  confirmOpen.value = true;
}

function askStatus(status: TenantStatus): void {
  if (!tenant.value || saving.value || dirty.value) return;
  pendingPatch.value = { status };
  confirmOpen.value = true;
}

/** Seul chemin d'écriture : appelé par la confirmation, jamais directement. */
async function write(): Promise<void> {
  const current = tenant.value;
  if (!current || saving.value) return;
  saving.value = true;
  try {
    apply(await tenantsApi.update(current.id, pendingPatch.value));
    confirmOpen.value = false;
    toast.add({
      severity: 'success',
      summary: t('tenants.saved', { name: current.name }),
      life: 4000,
    });
  } catch (error) {
    // 400 champ refusé, 422 `TENANT_*` (`details.issues`), 404…
    notify(error);
  } finally {
    saving.value = false;
  }
}

function reset(): void {
  if (tenant.value) Object.assign(form, toForm(tenant.value));
}

// Ctrl+S ouvre la CONFIRMATION (jamais une écriture directe).
useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    askSave();
  }
});

onBeforeRouteLeave(() => {
  if (!dirty.value || saving.value) return true;
  return new Promise<boolean>((resolve) => {
    confirmService.require({
      header: t('tenants.leave.title'),
      message: t('tenants.leave.message'),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: t('tenants.leave.accept'),
      rejectLabel: t('tenants.leave.stay'),
      acceptClass: 'p-button-danger',
      accept: () => resolve(true),
      reject: () => resolve(false),
      onHide: () => resolve(false),
    });
  });
});
useEventListener(window, 'beforeunload', (event: BeforeUnloadEvent) => {
  if (dirty.value) event.preventDefault();
});

// ─────────────────────────── Options de saisie ───────────────────────────

const countryOptions = computed(() =>
  reference.value.countries.map((c) => ({ value: c.code, label: `${c.flag} ${c.name}` })),
);
const currencyOptions = computed(() =>
  reference.value.currencies.map((c) => ({
    value: c.code,
    label: `${c.code} — ${c.name} (${c.symbol})`,
  })),
);
const localeOptions = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'English' },
];
const timezoneOptions = computed(() =>
  timezones(tenant.value?.timezone ?? 'UTC').map((z) => ({ value: z, label: z })),
);
const flagKeys = computed(() => Object.keys(tenant.value?.featureFlags ?? {}).sort());

/** Une devise suggérée quand le pays change (sans l'imposer). */
const suggestedCurrency = computed(
  () => reference.value.countries.find((c) => c.code === form.defaultCountry)?.currencyCode ?? null,
);

const colorPicker = computed({
  get: () => (/^#[0-9A-Fa-f]{6}$/.test(form.primaryColor) ? form.primaryColor : '#64748b'),
  set: (value: string) => (form.primaryColor = value.toUpperCase()),
});
</script>

<template>
  <div>
    <RouterLink
      :to="{ name: 'tenants' }"
      class="mb-3 inline-flex items-center gap-2 text-sm text-surface-500 hover:text-primary"
    >
      <i class="pi pi-arrow-left" aria-hidden="true" />
      {{ t('tenants.back') }}
    </RouterLink>

    <div v-if="loading && !tenant" class="flex min-h-64 items-center justify-center">
      <ProgressSpinner style="width: 2.5rem; height: 2.5rem" stroke-width="4" />
    </div>

    <Message
      v-else-if="loadError"
      severity="error"
      :closable="false"
      data-testid="tenant-load-error"
    >
      {{ messageFor(loadError) }}
    </Message>

    <template v-else-if="tenant">
      <!-- Barre collante : état + enregistrement (via confirmation). -->
      <header class="action-bar">
        <div class="flex min-w-0 items-center gap-3">
          <TenantStatusTag :status="tenant.status" />
          <span class="save-state" :class="{ 'save-state--dirty': dirty }" aria-live="polite">
            <span class="save-dot" aria-hidden="true" />
            {{ dirty ? t('tenants.unsaved', Object.keys(patch).length) : t('tenants.allSaved') }}
          </span>
        </div>
        <div class="flex items-center gap-2">
          <Button
            :label="t('tenants.reset')"
            icon="pi pi-undo"
            text
            size="small"
            :disabled="!dirty || saving"
            @click="reset"
          />
          <Button
            :label="t('tenants.save')"
            icon="pi pi-check"
            :disabled="!dirty || invalidFields.size > 0"
            :loading="saving"
            :title="`${t('tenants.save')} (Ctrl+S)`"
            data-testid="tenant-save"
            @click="askSave"
          />
        </div>
      </header>

      <div class="hero">
        <span
          class="hero-mark"
          :style="{ backgroundColor: tenant.branding.primaryColor ?? undefined }"
          aria-hidden="true"
        >
          <i class="pi pi-sitemap" />
        </span>
        <div class="min-w-0 flex-1">
          <h1 class="flex flex-wrap items-center gap-2 text-xl font-semibold">
            {{ tenant.name }}
            <span v-if="tenant.isCurrent" class="here" data-testid="tenant-current">{{
              t('tenants.current')
            }}</span>
          </h1>
          <p class="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-surface-500">
            <span class="font-mono">{{ tenant.slug }}</span>
            <span
              ><i class="pi pi-users mr-1" aria-hidden="true" />{{
                t('tenants.userCount', tenant.userCount)
              }}</span
            >
            <span
              ><i class="pi pi-calendar mr-1" aria-hidden="true" />{{
                t('tenants.createdAt', { date: d(new Date(tenant.createdAt), 'long') })
              }}</span
            >
          </p>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <main class="flex min-w-0 flex-col gap-5">
          <!-- Identité -->
          <section class="card">
            <h2 class="card-title">
              <i class="pi pi-id-card" aria-hidden="true" />{{ t('tenants.sections.identity') }}
            </h2>
            <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div class="field">
                <label for="t-name">{{ t('tenants.fields.name') }} *</label>
                <InputText
                  id="t-name"
                  v-model="form.name"
                  maxlength="120"
                  :invalid="invalidFields.has('name')"
                  fluid
                  data-testid="tenant-name"
                />
              </div>
              <div class="field">
                <label for="t-legal">{{ t('tenants.fields.legalName') }}</label>
                <InputText id="t-legal" v-model="form.legalName" maxlength="200" fluid />
              </div>
              <div class="field">
                <span class="field-label">{{ t('tenants.fields.slug') }}</span>
                <p class="readonly-value">
                  <i class="pi pi-lock text-[0.7rem]" aria-hidden="true" /><span
                    class="font-mono"
                    >{{ tenant.slug }}</span
                  >
                </p>
                <small class="hint">{{ t('tenants.hints.slug') }}</small>
              </div>
              <div class="field">
                <span class="field-label">{{ t('tenants.fields.isolation') }}</span>
                <p class="readonly-value">
                  <i class="pi pi-lock text-[0.7rem]" aria-hidden="true" />{{
                    t(`tenants.isolation.${tenant.isolation}`)
                  }}
                </p>
                <small class="hint">{{ t('tenants.hints.isolation') }}</small>
              </div>
            </div>
          </section>

          <!-- Localisation -->
          <section class="card">
            <h2 class="card-title">
              <i class="pi pi-globe" aria-hidden="true" />{{ t('tenants.sections.locale') }}
            </h2>
            <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div class="field">
                <label for="t-country">{{ t('tenants.fields.defaultCountry') }}</label>
                <Select
                  v-model="form.defaultCountry"
                  input-id="t-country"
                  :options="countryOptions"
                  option-label="label"
                  option-value="value"
                  filter
                  fluid
                />
              </div>
              <div class="field">
                <label for="t-currency">{{ t('tenants.fields.defaultCurrency') }}</label>
                <Select
                  v-model="form.defaultCurrency"
                  input-id="t-currency"
                  :options="currencyOptions"
                  option-label="label"
                  option-value="value"
                  filter
                  fluid
                />
                <button
                  v-if="suggestedCurrency && suggestedCurrency !== form.defaultCurrency"
                  type="button"
                  class="suggest"
                  @click="form.defaultCurrency = suggestedCurrency"
                >
                  <i class="pi pi-lightbulb text-[0.7rem]" aria-hidden="true" />
                  {{ t('tenants.hints.currency', { code: suggestedCurrency }) }}
                </button>
              </div>
              <div class="field">
                <label for="t-locale">{{ t('tenants.fields.defaultLocale') }}</label>
                <Select
                  v-model="form.defaultLocale"
                  input-id="t-locale"
                  :options="localeOptions"
                  option-label="label"
                  option-value="value"
                  fluid
                />
              </div>
              <div class="field">
                <label for="t-tz">{{ t('tenants.fields.timezone') }}</label>
                <Select
                  v-model="form.timezone"
                  input-id="t-tz"
                  :options="timezoneOptions"
                  option-label="label"
                  option-value="value"
                  filter
                  fluid
                />
              </div>
            </div>
          </section>

          <!-- Options -->
          <section v-if="flagKeys.length" class="card">
            <h2 class="card-title">
              <i class="pi pi-sliders-h" aria-hidden="true" />{{ t('tenants.sections.flags') }}
            </h2>
            <p class="hint mb-3">{{ t('tenants.hints.flags') }}</p>
            <ul class="flex flex-col divide-y divide-surface-100 dark:divide-surface-800">
              <li
                v-for="key in flagKeys"
                :key="key"
                class="flex items-center justify-between gap-3 py-2.5"
              >
                <span>
                  <span class="block text-sm font-medium">{{
                    te(`tenants.flags.${key}`) ? t(`tenants.flags.${key}`) : key
                  }}</span>
                  <span class="font-mono text-xs text-surface-500">{{ key }}</span>
                </span>
                <ToggleSwitch v-model="form.featureFlags[key]" :data-testid="`flag-${key}`" />
              </li>
            </ul>
          </section>

          <!-- Zone de danger : statut -->
          <section class="card card--danger" data-testid="tenant-danger-zone">
            <h2 class="card-title">
              <i class="pi pi-exclamation-triangle" aria-hidden="true" />{{
                t('tenants.sections.status')
              }}
            </h2>
            <p class="mb-3 text-sm text-surface-600 dark:text-surface-300">
              {{ t('tenants.hints.status') }}
            </p>
            <Message
              v-if="tenant.isCurrent"
              severity="info"
              :closable="false"
              class="mb-3"
              data-testid="tenant-self-note"
            >
              {{ t('tenants.hints.self') }}
            </Message>
            <p v-else-if="dirty" class="mb-3 text-xs text-surface-500">
              {{ t('tenants.hints.saveFirst') }}
            </p>
            <div class="flex flex-wrap gap-2">
              <Button
                v-if="tenant.status !== 'ACTIVE'"
                :label="t('tenants.actions.ACTIVE')"
                icon="pi pi-play"
                severity="success"
                outlined
                :disabled="dirty || saving"
                data-testid="status-ACTIVE"
                @click="askStatus('ACTIVE')"
              />
              <Button
                v-if="tenant.status !== 'SUSPENDED'"
                :label="t('tenants.actions.SUSPENDED')"
                icon="pi pi-pause"
                severity="danger"
                outlined
                :disabled="tenant.isCurrent || dirty || saving"
                data-testid="status-SUSPENDED"
                @click="askStatus('SUSPENDED')"
              />
              <Button
                v-if="tenant.status !== 'ARCHIVED'"
                :label="t('tenants.actions.ARCHIVED')"
                icon="pi pi-inbox"
                severity="danger"
                text
                :disabled="tenant.isCurrent || dirty || saving"
                data-testid="status-ARCHIVED"
                @click="askStatus('ARCHIVED')"
              />
            </div>
          </section>
        </main>

        <aside class="flex flex-col gap-5 xl:sticky xl:top-20 xl:self-start">
          <!-- Image de marque, avec aperçu en direct -->
          <section class="card">
            <h2 class="card-title">
              <i class="pi pi-palette" aria-hidden="true" />{{ t('tenants.sections.brand') }}
            </h2>
            <BrandPreview
              :name="form.name"
              :primary-color="form.primaryColor"
              :logo-url="form.logoUrl"
              class="mb-4"
            />
            <div class="field mb-3">
              <label for="t-color">{{ t('tenants.fields.primaryColor') }}</label>
              <div class="flex items-center gap-2">
                <input
                  v-model="colorPicker"
                  type="color"
                  class="color-input"
                  :aria-label="t('tenants.fields.primaryColor')"
                />
                <InputText
                  id="t-color"
                  v-model="form.primaryColor"
                  placeholder="#0F5132"
                  maxlength="7"
                  class="font-mono"
                  :invalid="invalidFields.has('primaryColor')"
                  fluid
                />
              </div>
            </div>
            <div class="field">
              <label for="t-logo">{{ t('tenants.fields.logoUrl') }}</label>
              <InputText
                id="t-logo"
                v-model="form.logoUrl"
                inputmode="url"
                placeholder="https://…/logo.svg"
                :invalid="invalidFields.has('logoUrl')"
                fluid
              />
              <small class="hint">{{ t('tenants.hints.logo') }}</small>
            </div>
          </section>

          <!-- Domaines (lecture seule) -->
          <section class="card">
            <h2 class="card-title">
              <i class="pi pi-link" aria-hidden="true" />{{ t('tenants.sections.domains') }}
            </h2>
            <ul v-if="tenant.domains.length" class="flex flex-col gap-2 text-sm">
              <li
                v-for="domain in tenant.domains"
                :key="domain.domain"
                class="flex items-center justify-between gap-2"
              >
                <span class="truncate font-mono text-xs">{{ domain.domain }}</span>
                <span class="flex shrink-0 gap-1">
                  <span v-if="domain.isPrimary" class="mini">{{
                    t('tenants.domains.primary')
                  }}</span>
                  <span class="mini" :class="domain.verifiedAt ? 'mini--ok' : 'mini--warn'">
                    {{
                      domain.verifiedAt
                        ? t('tenants.domains.verified')
                        : t('tenants.domains.unverified')
                    }}
                  </span>
                </span>
              </li>
            </ul>
            <p v-else class="text-sm text-surface-500">{{ t('tenants.domains.none') }}</p>
            <p class="hint mt-3">{{ t('tenants.hints.domains') }}</p>
          </section>

          <p class="text-xs text-surface-500">
            {{ t('tenants.updatedAt', { date: d(new Date(tenant.updatedAt), 'long') }) }} ·
            {{ n(tenant.userCount) }}
            {{ t('tenants.accounts') }}
          </p>
        </aside>
      </div>

      <ConfirmTenantDialog
        v-model:visible="confirmOpen"
        :tenant="tenant"
        :changes="changes"
        :cuts-access="cutsAccess(pendingPatch.status)"
        :pending="saving"
        @confirm="write"
      />
    </template>
  </div>
</template>

<style scoped>
.action-bar {
  @apply sticky top-0 z-20 -mx-1 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-200 bg-surface-0/90 px-4 py-2.5 shadow-sm backdrop-blur dark:border-surface-800 dark:bg-surface-900/90;
}
.save-state {
  @apply inline-flex items-center gap-1.5 text-xs text-surface-500;
}
.save-dot {
  @apply h-2 w-2 rounded-full bg-emerald-500;
  transition: background-color var(--duration-panel) ease;
}
.save-state--dirty {
  @apply text-amber-700 dark:text-amber-400;
}
.save-state--dirty .save-dot {
  @apply bg-amber-500 motion-safe:animate-pulse;
}
.hero {
  @apply mb-5 flex flex-wrap items-center gap-4 rounded-2xl border border-surface-200 bg-surface-0 p-5 dark:border-surface-800 dark:bg-surface-900;
}
.hero-mark {
  @apply inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-surface-400 text-xl text-white shadow-sm;
  transition: background-color var(--duration-panel) var(--ease-out);
}
.here {
  @apply rounded-full bg-primary-100 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-primary-800 dark:bg-primary-900/50 dark:text-primary-200;
}
.card {
  @apply rounded-xl border border-surface-200 bg-surface-0 p-4 dark:border-surface-800 dark:bg-surface-900;
}
.card--danger {
  @apply border-red-200 dark:border-red-900/60;
}
.card-title {
  @apply mb-3 flex items-center gap-2 text-sm font-semibold;
}
.card-title > i {
  @apply text-surface-400;
}
.field {
  @apply flex flex-col gap-1;
}
.field label,
.field-label {
  @apply text-sm font-medium;
}
.readonly-value {
  @apply flex h-10 items-center gap-2 rounded-md border border-dashed border-surface-300 px-3 text-sm text-surface-600 dark:border-surface-600 dark:text-surface-300;
}
.hint {
  @apply text-xs text-surface-500;
}
.suggest {
  @apply inline-flex items-center gap-1 self-start text-xs font-medium text-primary-600 hover:underline dark:text-primary-400;
}
.color-input {
  @apply h-10 w-12 shrink-0 cursor-pointer rounded-md border border-surface-300 bg-transparent p-1 dark:border-surface-600;
}
.mini {
  @apply rounded-full bg-surface-100 px-2 py-0.5 text-[0.65rem] font-medium dark:bg-surface-800;
}
.mini--ok {
  @apply bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300;
}
.mini--warn {
  @apply bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300;
}
</style>
