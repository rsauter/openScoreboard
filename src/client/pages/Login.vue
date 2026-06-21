<template>
  <div class="min-h-screen flex items-center justify-center px-4">
    <div class="card bg-base-200 shadow-xl w-full max-w-sm">
      <div class="card-body gap-5">

        <div class="text-center">
          <h1 class="text-2xl font-bold">{{ t('auth.title') }}</h1>
          <p class="text-base-content/60 text-sm mt-1">{{ t('auth.subtitle') }}</p>
        </div>

        <div>
          <label class="label py-0">
            <span class="label-text text-xs">{{ t('auth.pinLabel') }}</span>
          </label>
          <input
            ref="pinInputEl"
            v-model="pin"
            type="password"
            inputmode="numeric"
            :placeholder="t('auth.pinPlaceholder')"
            class="input input-bordered w-full"
            @keydown.enter="login"
          />
        </div>

        <div v-if="error" class="alert alert-error text-sm py-2">
          {{ error }}
        </div>

        <button class="btn btn-primary w-full" :class="{ loading: busy }" @click="login">
          {{ t('auth.loginBtn') }}
        </button>

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter, useRoute } from 'vue-router';
import { setToken } from '../shared';

const { t } = useI18n();
const router = useRouter();
const route  = useRoute();

const pin        = ref('');
const error      = ref('');
const busy       = ref(false);
const pinInputEl = ref<HTMLInputElement | null>(null);

onMounted(() => pinInputEl.value?.focus());

async function login(): Promise<void> {
  if (busy.value || !pin.value) return;
  busy.value  = true;
  error.value = '';
  try {
    const res = await fetch('/api/auth/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ pin: pin.value }),
    });
    if (res.status === 401) {
      error.value = t('auth.wrongPin');
      pin.value   = '';
      pinInputEl.value?.focus();
      return;
    }
    if (!res.ok) throw new Error('Server error');
    const { token } = await res.json() as { token: string };
    setToken(token);
    const redirect = (route.query.redirect as string | undefined) ?? '/';
    await router.push(redirect);
  } catch {
    error.value = t('auth.wrongPin');
  } finally {
    busy.value = false;
  }
}
</script>