<template>
  <header class="bg-base-200 border-b border-base-300 shadow-sm">
    <!-- Default-PIN-Warning -->
    <div v-if="defaultPinActive" class="bg-warning text-warning-content text-xs text-center px-4 py-1">
      ⚠️ {{ t('auth.defaultPinWarning') }}
    </div>
    <div class="mx-auto flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between max-w-7xl">
      <div class="flex flex-wrap items-center gap-2">
        <RouterLink to="/" class="flex items-center gap-2 no-underline">
          <img src="../assets/logo_color_onlyhalo.svg" alt="Logo" class="h-6 w-auto self-center align-middle" />
          <span class="text-lg font-bold text-primary">{{ t('nav.title') }}</span>
        </RouterLink>
        <nav class="flex flex-wrap gap-2">
          <RouterLink to="/operator" class="btn btn-ghost btn-sm" :class="{ 'btn-active': route.name === 'Operator' }">
            {{ isPregame ? t('nav.gamestart') : t('nav.operator') }}
          </RouterLink>
          <div class="w-px h-5 bg-base-content/20 mx-1 self-center"></div>
          <a href="/display.html" target="_blank" class="btn btn-outline btn-sm">{{ t('nav.display') }}</a>
        </nav>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <RouterLink
          to="/settings"
          class="btn btn-ghost btn-sm"
          :class="{ 'btn-active': route.name === 'Settings' }"
          :title="t('nav.settings')"
        >⚙️</RouterLink>
        <RouterLink
          to="/help"
          class="btn btn-ghost btn-sm"
          :class="{ 'btn-active': route.name === 'Help' }"
          :title="t('nav.help')"
        >❓</RouterLink>
        <button class="btn btn-ghost btn-sm" :title="t('nav.logout')" @click="logout">🚪</button>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { defaultPinActive, authHeaders, clearToken, currentPhase } from '../shared';

const { t } = useI18n();
const route  = useRoute();
const router = useRouter();

const isPregame = computed(() => currentPhase.value === null || currentPhase.value === 'pregame');

async function logout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST', headers: authHeaders() });
  } catch { /* ignore */ }
  clearToken();
  await router.push('/login');
}

// TopNav itself never opens a WebSocket — it relies on Operator.vue to keep
// `currentPhase` up to date while mounted. But TopNav renders on every page
// (Settings, Help, ...), so on first load — before Operator.vue has ever
// mounted — fetch the phase once via REST so the nav label is correct
// immediately, e.g. when a tester opens /help directly while a game is live.
onMounted(async () => {
  if (currentPhase.value !== null) return;
  try {
    const res = await fetch('/api/state', { headers: authHeaders() });
    if (res.ok) {
      const state = await res.json();
      currentPhase.value = state.phase ?? null;
    }
  } catch { /* leave as unknown — defaults to "GameStart" label */ }
});
</script>