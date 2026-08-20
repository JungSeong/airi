import { describe, expect, it } from 'vitest'

import {
  DAILY_BRIEFING_WINDOW_HEIGHT,
  DAILY_BRIEFING_WINDOW_WIDTH,
  resolveDailyBriefingWindowPosition,
} from './daily-briefing-window'

describe('resolveDailyBriefingWindowPosition', () => {
  const workArea = { x: 0, y: 0, width: 1920, height: 1080 }

  it('places the mailbox above the cursor', () => {
    const position = resolveDailyBriefingWindowPosition({
      cursor: { x: 1200, y: 900 },
      mainWindow: { x: 100, y: 100, width: 450, height: 600 },
      workArea,
    })

    expect(position).toEqual({
      x: 1200 - DAILY_BRIEFING_WINDOW_WIDTH / 2,
      y: 900 - DAILY_BRIEFING_WINDOW_HEIGHT - 12,
    })
  })

  it('moves the mailbox beside the tamagotchi when they overlap', () => {
    const position = resolveDailyBriefingWindowPosition({
      cursor: { x: 500, y: 650 },
      mainWindow: { x: 100, y: 100, width: 450, height: 600 },
      workArea,
    })

    expect(position.x).toBe(562)
    expect(position.y).toBe(218)
  })
})
