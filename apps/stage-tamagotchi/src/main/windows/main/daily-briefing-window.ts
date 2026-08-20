import type { Point, Rectangle } from 'electron'

export const DAILY_BRIEFING_WINDOW_WIDTH = 380
export const DAILY_BRIEFING_WINDOW_HEIGHT = 420

const GAP = 12

function overlaps(left: Rectangle, right: Rectangle) {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y
}

function within(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function resolveDailyBriefingWindowPosition(params: {
  cursor: Point
  mainWindow: Rectangle
  workArea: Rectangle
}): Point {
  const { cursor, mainWindow, workArea } = params
  const maxX = workArea.x + workArea.width - DAILY_BRIEFING_WINDOW_WIDTH
  const maxY = workArea.y + workArea.height - DAILY_BRIEFING_WINDOW_HEIGHT
  const position = {
    x: Math.round(within(cursor.x - DAILY_BRIEFING_WINDOW_WIDTH / 2, workArea.x, maxX)),
    y: Math.round(within(cursor.y - DAILY_BRIEFING_WINDOW_HEIGHT - GAP, workArea.y, maxY)),
  }
  const bounds = { ...position, width: DAILY_BRIEFING_WINDOW_WIDTH, height: DAILY_BRIEFING_WINDOW_HEIGHT }

  if (!overlaps(bounds, mainWindow))
    return position

  const sidePositions = [
    mainWindow.x - DAILY_BRIEFING_WINDOW_WIDTH - GAP,
    mainWindow.x + mainWindow.width + GAP,
  ].filter(x => x >= workArea.x && x <= maxX)

  if (sidePositions.length > 0) {
    position.x = sidePositions.sort((left, right) =>
      Math.abs(left + DAILY_BRIEFING_WINDOW_WIDTH / 2 - cursor.x)
      - Math.abs(right + DAILY_BRIEFING_WINDOW_WIDTH / 2 - cursor.x))[0]
    return position
  }

  const verticalPositions = [mainWindow.y - DAILY_BRIEFING_WINDOW_HEIGHT - GAP, mainWindow.y + mainWindow.height + GAP]
  position.y = verticalPositions.find(y => y >= workArea.y && y <= maxY) ?? position.y
  return position
}
