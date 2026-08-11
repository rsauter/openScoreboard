<template>
  <TopNav />
  <main class="min-h-screen bg-base-300 pb-8">
    <router-view />
  </main>

  <!-- ─── Global Status Bar ──────────────────────────────────────────────── -->
  <StatusBar />

  <!-- ─── Global Toast Container ─────────────────────────────────────────── -->
  <Teleport to="body">
    <div class="toast toast-top toast-end z-[9999] pointer-events-none">
      <TransitionGroup name="toast">
        <div v-for="toast in toasts" :key="toast.id"
          :class="['alert pointer-events-auto shadow-lg max-w-sm', toastAlertClass(toast.type)]">
          <span class="text-sm">{{ toast.message }}</span>
          <button class="btn btn-ghost btn-xs ml-auto" @click="removeToast(toast.id)">✕</button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>

  <!-- ─── Global Confirm Dialog ──────────────────────────────────────────── -->
  <Teleport to="body">
    <dialog class="modal" :open="confirmState.open">
      <div class="modal-box max-w-sm">
        <h3 v-if="confirmState.options.title" class="font-bold text-base mb-2">
          {{ confirmState.options.title }}
        </h3>
        <p class="text-sm text-base-content/80">{{ confirmState.options.message }}</p>
        <div class="modal-action mt-4">
          <button class="btn btn-ghost btn-sm" @click="resolveConfirm(false)">
            {{ confirmState.options.cancelText ?? t('common.cancel') }}
          </button>
          <button :class="['btn btn-sm', confirmState.options.danger ? 'btn-error' : 'btn-primary']"
            @click="resolveConfirm(true)">
            {{ confirmState.options.confirmText ?? t('common.ok') }}
          </button>
        </div>
      </div>
      <div class="modal-backdrop bg-black/40" @click="resolveConfirm(false)"></div>
    </dialog>
  </Teleport>
</template>

<script setup lang="ts">
import TopNav from './components/TopNav.vue';
import StatusBar from './components/StatusBar.vue';
import { onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { toasts, removeToast, confirmState, resolveConfirm } from './shared';

const { t } = useI18n();

function toastAlertClass(type: 'success' | 'error' | 'warning' | 'info') {
  return {
    success: 'alert-success',
    error:   'alert-error',
    warning: 'alert-warning',
    info:    'alert-info',
  }[type];
}

onMounted(() => {
  // Reads the same 'osb.theme' key that Settings.vue writes to (and migrates
  // the legacy unprefixed 'theme' key from, if present) — keeps both in sync
  // so the right theme applies immediately on every load, not just after a
  // visit to Settings.
  const saved = localStorage.getItem('osb.theme') ?? localStorage.getItem('theme') ?? 'corporate';
  document.documentElement.setAttribute('data-theme', saved);
});
</script>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(2rem);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(2rem);
}
</style>