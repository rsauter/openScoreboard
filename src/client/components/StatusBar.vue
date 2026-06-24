<template>
  <div class="fixed bottom-0 left-0 right-0 z-50 bg-base-200 border-t border-base-300 py-1 px-4 text-xs text-center text-base-content/60">
    {{ statusText }}<span v-if="appVersion"> · v{{ appVersion }}</span>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { checkServerHealth, statusText, appVersion } from '../shared';

const { t } = useI18n();

const POLL_INTERVAL_MS = 5000;
let healthTimer: ReturnType<typeof setInterval> | null = null;

async function refreshServerHealth(): Promise<void> {
  const ok = await checkServerHealth();
  statusText.value = ok ? t('common.serverOnline') : t('common.serverOffline');
}

onMounted(async () => {
  await refreshServerHealth();
  healthTimer = setInterval(refreshServerHealth, POLL_INTERVAL_MS);
});

onUnmounted(() => {
  if (healthTimer) clearInterval(healthTimer);
});
</script>