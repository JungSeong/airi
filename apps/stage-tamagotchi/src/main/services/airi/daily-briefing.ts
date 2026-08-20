import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type { ElectronDailyBriefing, ElectronDailyBriefingListResult, ElectronDailyBriefingPlayResult } from '../../../shared/eventa'

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { defineInvokeHandler } from '@moeru/eventa'
import { app } from 'electron'

import {

  electronDailyBriefingList,

  electronDailyBriefingPlay,

} from '../../../shared/eventa'

type MainContext = ReturnType<typeof createContext>['context']

function briefingDir() {
  return join(app.getPath('userData'), 'daily-briefing')
}

function characterBriefingDir(character = 'silverwolf_lv999') {
  return join(briefingDir(), character)
}

async function readOptionalText(path: string) {
  try {
    return await readFile(path, 'utf8')
  }
  catch {
    return undefined
  }
}

async function readOptionalBinary(path: string) {
  try {
    return await readFile(path)
  }
  catch {
    return undefined
  }
}

async function listBriefings(dir: string): Promise<ElectronDailyBriefing[]> {
  let names: string[]
  try {
    names = await readdir(dir)
  }
  catch {
    return []
  }

  const briefings = await Promise.all(names
    .filter(name => /^\d+\.json$/.test(name))
    .map(async (name) => {
      const raw = await readOptionalText(join(dir, name))
      return raw ? JSON.parse(raw) as ElectronDailyBriefing : undefined
    }))

  return briefings
    .filter((briefing): briefing is ElectronDailyBriefing => briefing !== undefined)
    .filter(briefing => !briefing.readAt)
    .sort((left, right) => right.createdAt - left.createdAt)
}

export function setupDailyBriefingService(params: { context: MainContext }): void {
  defineInvokeHandler(params.context, electronDailyBriefingList, async (): Promise<ElectronDailyBriefingListResult> => {
    return { briefings: await listBriefings(characterBriefingDir()) }
  })

  defineInvokeHandler(params.context, electronDailyBriefingPlay, async (payload): Promise<ElectronDailyBriefingPlayResult> => {
    if (!/^\d+$/.test(payload.id))
      return {}

    const dir = characterBriefingDir()
    const jsonPath = join(dir, `${payload.id}.json`)
    const raw = await readOptionalText(jsonPath)
    if (!raw)
      return {}

    const briefing = JSON.parse(raw) as ElectronDailyBriefing
    if (!briefing.readAt) {
      briefing.readAt = Date.now()
      await writeFile(jsonPath, `${JSON.stringify(briefing, null, 2)}\n`)
    }

    const audio = await readOptionalBinary(briefing.audioPath ?? join(dir, `${payload.id}.wav`))
    return { briefing, audioBase64: audio?.toString('base64') }
  })
}
