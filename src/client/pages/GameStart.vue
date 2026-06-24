<template>
  <div class="min-h-screen bg-base-300 flex flex-col items-center justify-center p-6">

    <h1 class="text-3xl font-bold text-primary text-center mb-1">{{ t('gamestart.title') }}</h1>
    <p class="text-base-content/60 text-sm text-center mb-8">{{ t('gamestart.subtitle') }}</p>

    <!-- Teams -->
    <div class="card bg-base-100 shadow-md w-full max-w-2xl mb-4">
      <div class="card-body">
        <h2 class="card-title text-xs text-base-content/50 uppercase tracking-widest mb-3">{{ t('gamestart.teams') }}</h2>
        <div class="grid grid-cols-[1fr_40px_1fr] gap-3 items-end">

          <!-- Home -->
          <div>
            <label class="label"><span class="label-text text-xs text-base-content/60">{{ t('gamestart.homeTeam') }}</span></label>
            <div class="flex gap-2 items-center">
              <input type="text" v-model="cfgHome" :placeholder="t('gamestart.teamPlaceholder')"
                autocomplete="off" maxlength="3"
                class="input input-bordered input-sm w-full uppercase" />
              <input type="color" v-model="cfgHomeColor"
                class="w-9 h-9 rounded cursor-pointer border border-base-content/20 p-0.5 bg-base-100"
                :title="t('gamestart.homeColor')" />
            </div>
          </div>

          <div class="text-center text-base-content/40 font-bold pb-2">vs</div>

          <!-- Away -->
          <div>
            <label class="label"><span class="label-text text-xs text-base-content/60">{{ t('gamestart.awayTeam') }}</span></label>
            <div class="flex gap-2 items-center">
              <input type="text" v-model="cfgAway" :placeholder="t('gamestart.teamPlaceholder')"
                autocomplete="off" maxlength="3"
                class="input input-bordered input-sm w-full uppercase" />
              <input type="color" v-model="cfgAwayColor"
                class="w-9 h-9 rounded cursor-pointer border border-base-content/20 p-0.5 bg-base-100"
                :title="t('gamestart.awayColor')" />
            </div>
          </div>
        </div>

        <!-- Color preview -->
        <div class="flex gap-3 mt-3">
          <div class="flex items-center gap-2 text-xs text-base-content/50">
            <span class="inline-block w-3 h-3 rounded-full" :style="{ background: cfgHomeColor }"></span>
            {{ cfgHome || t('common.home') }}
          </div>
          <span class="text-base-content/20">vs</span>
          <div class="flex items-center gap-2 text-xs text-base-content/50">
            <span class="inline-block w-3 h-3 rounded-full" :style="{ background: cfgAwayColor }"></span>
            {{ cfgAway || t('common.away') }}
          </div>
        </div>
      </div>
    </div>

    <!-- Sports template -->
    <div class="card bg-base-100 shadow-md w-full max-w-2xl mb-4">
      <div class="card-body">
        <h2 class="card-title text-xs text-base-content/50 uppercase tracking-widest mb-3">{{ t('gamestart.template') }}</h2>
        <select v-model.number="cfgTemplateId" class="select select-bordered select-sm w-full">
          <option value="0">{{ t('gamestart.selectTemplate') }}</option>
          <option v-for="tmpl in templates" :key="tmpl.id" :value="tmpl.id">{{ tmpl.name }}</option>
        </select>

        <!-- Config overview for the selected template -->
        <div v-if="selectedTemplate"
          class="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-base-content/70 bg-base-200 rounded-lg px-4 py-3">
          <div>
            <span class="text-base-content/40">{{ t('gamestart.periods') }}</span><span class="ml-2 font-medium">{{ selectedTemplate.numPeriods }} × {{ selectedTemplate.periodDuration }} {{ t('common.min') }}</span>
            <span class="badge badge-ghost badge-xs ml-1" :title="t('gamestart.countDirection')">
              {{ selectedTemplate.countUp ? '↑ ' + t('gamestart.countUp') : '↓ ' + t('gamestart.countDown') }}
            </span>
          </div>
          <div><span class="text-base-content/40">{{ t('gamestart.break') }}</span><span class="ml-2 font-medium">{{ selectedTemplate.breakDuration }} {{ t('common.min') }}</span></div>
          <template v-if="selectedTemplate.hasOvertime">
            <div>
              <span class="text-base-content/40">{{ t('gamestart.overtime') }}</span>
              <span class="ml-2 font-medium">
                {{ selectedTemplate.numOtPeriods === null ? '∞' : selectedTemplate.numOtPeriods }} × {{ selectedTemplate.otDuration }} {{ t('common.min') }}
              </span>
              <span v-if="selectedTemplate.otSuddenDeath" class="badge badge-warning badge-soft badge-xs ml-1">SD</span>
            </div>
            <div><span class="text-base-content/40">{{ t('gamestart.otBreak') }}</span><span class="ml-2 font-medium">{{ selectedTemplate.otBreakDuration }} {{ t('common.min') }}</span></div>
          </template>
          <template v-else>
            <div><span class="text-base-content/40">{{ t('gamestart.overtime') }}</span><span class="ml-2 text-base-content/30">–</span></div>
            <div></div>
          </template>
          <div>
            <span class="text-base-content/40">{{ t('gamestart.shootout') }}</span>
            <span v-if="selectedTemplate.hasShootout" class="ml-2 font-medium">✓ ({{ t('gamestart.shootoutPause', { n: selectedTemplate.soBreakDuration }) }})</span>
            <span v-else class="ml-2 text-base-content/30">–</span>
          </div>
          <!-- Penalty types -->
          <div class="col-span-2 mt-1 pt-2 border-t border-base-content/10">
            <span class="text-base-content/40">{{ t('gamestart.penalties') }}</span>
            <span v-if="!selectedTemplate.penaltyTypes?.length" class="ml-2 text-base-content/30">–</span>
            <span v-else class="ml-2 inline-flex flex-wrap gap-1">
              <span v-for="pt in selectedTemplate.penaltyTypes" :key="pt.id"
                class="badge badge-xs"
                :class="pt.displayMode === 'slot' ? 'badge-primary badge-outline' : 'badge-warning badge-outline'">
                {{ pt.label }}
              </span>
            </span>
          </div>
        </div>

        <p v-if="templates.length === 0" class="text-xs text-warning mt-2">
          {{ t('gamestart.noTemplates') }}
        </p>
      </div>
    </div>

    <div class="w-full max-w-2xl">
      <button @click="startGame" class="btn btn-success btn-lg w-full">{{ t('gamestart.startBtn') }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
// This component has no own route anymore — it's embedded inside Operator.vue
// and shown automatically whenever no game is currently running
// (phase === 'pregame'). It no longer owns a WebSocket connection itself —
// the parent (Operator.vue) holds the single persistent connection and is
// responsible for actually sending SET_CONFIG, so that starting a game and
// watching it live happen on the same socket without a reconnect round-trip.
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import type { SportsTemplate } from '../../shared/types';
import { authHeaders, clearToken } from '../shared';
import { useRouter } from 'vue-router';

const { t } = useI18n();
const router = useRouter();

const emit = defineEmits<{
  start: [payload: {
    homeTeam: string; awayTeam: string; homeColor: string; awayColor: string; templateSlug: string;
    config: {
      numPeriods: number; periodDuration: number; breakDuration: number;
      hasOvertime: boolean; numOtPeriods: number | null; otDuration: number;
      otSuddenDeath: boolean; otBreakDuration: number; hasShootout: boolean; soBreakDuration: number;
    };
  }];
}>();

const templates     = ref<SportsTemplate[]>([]);
const cfgHome       = ref('');
const cfgAway       = ref('');
const cfgHomeColor  = ref('#00d4ff');
const cfgAwayColor  = ref('#ff6b6b');
const cfgTemplateId = ref(0);

const selectedTemplate = computed(() =>
  templates.value.find(tmpl => tmpl.id === cfgTemplateId.value) ?? null
);

async function loadTemplates() {
  try {
    const res = await fetch('/api/sport-templates', { headers: authHeaders() });
    if (res.status === 401) {
      clearToken();
      await router.push({ name: 'Login', query: { redirect: '/' } });
      return;
    }
    if (res.ok) {
      templates.value = await res.json();
      if (!cfgTemplateId.value) {
        const def = templates.value.find(tmpl => tmpl.isDefault);
        if (def) cfgTemplateId.value = def.id;
      }
    }
  } catch { templates.value = []; }
}

function startGame() {
  const tmpl = selectedTemplate.value;
  if (!tmpl) {
    alert(t('gamestart.alertSelectTemplate'));
    return;
  }

  emit('start', {
    homeTeam:  cfgHome.value.trim().toUpperCase() || t('common.home'),
    awayTeam:  cfgAway.value.trim().toUpperCase() || t('common.away'),
    homeColor: cfgHomeColor.value,
    awayColor: cfgAwayColor.value,
    templateSlug: tmpl.slug,
    config: {
      numPeriods:      tmpl.numPeriods,
      periodDuration:  tmpl.periodDuration,
      breakDuration:   tmpl.breakDuration,
      hasOvertime:     tmpl.hasOvertime,
      numOtPeriods:    tmpl.numOtPeriods,
      otDuration:      tmpl.otDuration,
      otSuddenDeath:   tmpl.otSuddenDeath,
      otBreakDuration: tmpl.otBreakDuration,
      hasShootout:     tmpl.hasShootout,
      soBreakDuration: tmpl.soBreakDuration,
    },
  });
}

onMounted(async () => {
  await loadTemplates();
});
</script>