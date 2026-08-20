<script setup lang="ts">
import type { ElectronDailyBriefing } from '../../shared/eventa'

import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { createAudioManager, disposeAudioManager, playAudio } from '@proj-airi/stage-ui/libs/audio/manager'
import { useCharacterStore } from '@proj-airi/stage-ui/stores/character'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import { electronDailyBriefingList, electronDailyBriefingPlay } from '../../shared/eventa'

const { t } = useI18n()
const characterStore = useCharacterStore()
const listDailyBriefings = useElectronEventaInvoke(electronDailyBriefingList)
const playSelectedDailyBriefing = useElectronEventaInvoke(electronDailyBriefingPlay)
const briefings = ref<ElectronDailyBriefing[]>([])
const playingId = ref<string>()
const audioManager = createAudioManager()

async function refreshBriefings() {
  try {
    const result = await listDailyBriefings()
    briefings.value = result?.briefings ?? []
  }
  catch (error) {
    console.error('[DailyBriefing] failed to list briefings', error)
  }
}

function closeWindow() {
  window.close()
}

async function playBriefing(id: string) {
  if (playingId.value)
    return

  playingId.value = id
  try {
    const result = await playSelectedDailyBriefing({ id })
    if (!result?.briefing?.text) {
      toast.error(t('tamagotchi.stage.controls-island.daily-briefing-unavailable'))
      return
    }

    briefings.value = briefings.value.filter(briefing => briefing.id !== id)

    if (result.audioBase64) {
      const bytes = Uint8Array.from(atob(result.audioBase64), char => char.charCodeAt(0))
      await audioManager.audioContext.resume()
      await playAudio(audioManager, bytes.buffer)
      return
    }

    await characterStore.emitTextOutput(result.briefing.text)
  }
  catch (error) {
    console.error('[DailyBriefing] failed to play briefing', error)
    toast.error(t('tamagotchi.stage.controls-island.daily-briefing-failed'))
  }
  finally {
    playingId.value = undefined
  }
}

onMounted(refreshBriefings)
onBeforeUnmount(() => disposeAudioManager(audioManager))
</script>

<template>
  <main class="h-screen w-screen overflow-hidden bg-transparent p-2">
    <section class="h-full flex flex-col overflow-hidden border border-neutral-200 rounded-2xl bg-neutral-50/95 p-3 text-neutral-900 shadow-2xl backdrop-blur-xl dark:border-neutral-700 dark:bg-neutral-900/95 dark:text-neutral-100">
      <header class="mb-2 flex shrink-0 cursor-move select-none items-center justify-between gap-2 px-1 drag-region">
        <div class="min-w-0 flex items-center gap-2 font-semibold">
          <div class="i-solar:inbox-bold-duotone size-5 shrink-0 text-primary-500" />
          <span class="truncate">
            {{ t('tamagotchi.stage.controls-island.daily-briefing') }}
          </span>
          <span class="shrink-0 text-xs text-neutral-500 dark:text-neutral-400">
            {{ t('tamagotchi.stage.controls-island.daily-briefing-unread', { count: briefings.length }) }}
          </span>
        </div>
        <button
          type="button"
          class="[-webkit-app-region:no-drag] size-8 flex shrink-0 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-200/70 dark:text-neutral-400 hover:text-neutral-900 dark:hover:bg-neutral-700/70 dark:hover:text-neutral-100"
          :aria-label="t('tamagotchi.stage.controls-island.close')"
          @click="closeWindow"
        >
          <div class="i-solar:close-circle-bold size-5" />
        </button>
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto space-y-1">
        <div v-if="briefings.length === 0" class="h-full flex items-center justify-center px-3 text-center text-sm text-neutral-500 dark:text-neutral-400">
          {{ t('tamagotchi.stage.controls-island.daily-briefing-empty') }}
        </div>

        <button
          v-for="briefing in briefings"
          :key="briefing.id"
          type="button"
          class="w-full flex items-start gap-3 rounded-xl bg-primary-50 px-3 py-3 text-left transition disabled:cursor-not-allowed dark:bg-primary-950/40 hover:bg-primary-100 disabled:opacity-50 dark:hover:bg-primary-900/50"
          :disabled="Boolean(playingId)"
          :aria-label="`${briefing.date}: ${briefing.text}`"
          @click="playBriefing(briefing.id)"
        >
          <div class="i-solar:play-circle-bold-duotone mt-0.5 size-5 shrink-0 text-primary-500" />
          <div class="min-w-0 flex-1">
            <div class="text-xs text-neutral-500 dark:text-neutral-400">
              {{ briefing.date }}
            </div>
            <p class="mt-1 text-sm text-neutral-800 dark:text-neutral-200">
              {{ briefing.text }}
            </p>
          </div>
        </button>
      </div>
    </section>
  </main>
</template>

<route lang="yaml">
meta:
  layout: plain
</route>
