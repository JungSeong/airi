import { Buffer } from 'node:buffer'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const appMock = vi.hoisted(() => ({ getPath: vi.fn() }))
const handlers = vi.hoisted(() => ({
  list: vi.fn(),
  play: vi.fn(),
}))

vi.mock('electron', () => ({ app: appMock }))

vi.mock('@moeru/eventa', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@moeru/eventa')>()
  return {
    ...actual,
    defineInvokeHandler: (_context: unknown, eventa: { sendEvent: { id: string } }, handler: (...args: never[]) => unknown) => {
      if (eventa.sendEvent.id.includes('daily-briefing:list'))
        handlers.list.mockImplementation(handler)
      if (eventa.sendEvent.id.includes('daily-briefing:play'))
        handlers.play.mockImplementation(handler)
    },
  }
})

describe('setupDailyBriefingService', () => {
  let root: string
  let briefingDir: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'airi-daily-briefing-'))
    briefingDir = join(root, 'daily-briefing', 'silverwolf_lv999')
    await mkdir(briefingDir, { recursive: true })
    appMock.getPath.mockReturnValue(root)
    handlers.list.mockReset()
    handlers.play.mockReset()
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('lists unread briefings and removes the selected briefing from the list', async () => {
    await writeFile(join(briefingDir, '100.json'), JSON.stringify({
      id: '100',
      date: '2026-08-19',
      text: 'First briefing',
      createdAt: 100,
      readAt: 150,
    }))
    await writeFile(join(briefingDir, '200.json'), JSON.stringify({
      id: '200',
      date: '2026-08-20',
      text: 'Second briefing',
      createdAt: 200,
    }))
    await writeFile(join(briefingDir, '200.wav'), Buffer.from('audio'))

    const { setupDailyBriefingService } = await import('./daily-briefing')
    setupDailyBriefingService({ context: {} as never })

    const listed = await handlers.list()
    expect(listed.briefings.map((briefing: { id: string }) => briefing.id)).toEqual(['200'])

    const played = await handlers.play({ id: '200' })
    expect(played.briefing.readAt).toEqual(expect.any(Number))
    expect(played.audioBase64).toBe(Buffer.from('audio').toString('base64'))

    const stored = JSON.parse(await readFile(join(briefingDir, '200.json'), 'utf8'))
    expect(stored.readAt).toBe(played.briefing.readAt)

    const afterPlay = await handlers.list()
    expect(afterPlay.briefings).toEqual([])
    expect(await handlers.play({ id: '../100' })).toEqual({})
  })
})
