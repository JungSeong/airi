import type { BrowserWindow } from 'electron'

import type { I18n } from '../../../libs/i18n'
import type { ServerChannel } from '../../../services/airi/channel-server'
import type { GodotStageManager } from '../../../services/airi/godot-stage'
import type { McpStdioManager } from '../../../services/airi/mcp-servers'
import type { AutoUpdater } from '../../../services/electron/auto-updater'
import type { EditorWindowManager } from '../../editor'
import type { NoticeWindowManager } from '../../notice'
import type { OnboardingWindowManager } from '../../onboarding'
import type { SettingsWindowManager } from '../../settings'
import type { WidgetsWindowManager } from '../../widgets'

import { join, resolve } from 'node:path'

import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { BrowserWindow as ElectronBrowserWindow, ipcMain, screen } from 'electron'

import { electronCenterMainWindow, electronOpenChat, electronOpenDailyBriefing, electronOpenEditor, electronOpenMainDevtools, electronOpenSettings, noticeWindowEventa } from '../../../../shared/eventa'
import { baseUrl, getElectronMainDirname, load, withHashRoute } from '../../../libs/electron/location'
import { createAuthService } from '../../../services/airi/auth'
import { createGodotStageService } from '../../../services/airi/godot-stage'
import { createMcpServersService } from '../../../services/airi/mcp-servers'
import { createOnboardingService } from '../../../services/airi/onboarding'
import { createWidgetsService } from '../../../services/airi/widgets'
import { createAutoUpdaterService } from '../../../services/electron'
import { toggleWindowShow } from '../../shared'
import { centerWindowOnDisplay } from '../../shared/display'
import { protectPrivilegedWindowNavigation, setupBaseWindowElectronInvokes } from '../../shared/window'
import {
  DAILY_BRIEFING_WINDOW_HEIGHT,
  DAILY_BRIEFING_WINDOW_WIDTH,
  resolveDailyBriefingWindowPosition,
} from '../daily-briefing-window'

export async function setupMainWindowElectronInvokes(params: {
  window: BrowserWindow
  editorWindow: EditorWindowManager
  settingsWindow: SettingsWindowManager
  chatWindow: () => Promise<BrowserWindow>
  widgetsManager: WidgetsWindowManager
  noticeWindow: NoticeWindowManager
  autoUpdater: AutoUpdater
  serverChannel: ServerChannel
  godotStageManager: GodotStageManager
  mcpStdioManager: McpStdioManager
  i18n: I18n
  onboardingWindowManager: OnboardingWindowManager
}) {
  // TODO: once we refactored eventa to support window-namespaced contexts,
  // we can remove the setMaxListeners call below since eventa will be able to dispatch and
  // manage events within eventa's context system.
  ipcMain.setMaxListeners(0)

  const { context } = createContext(ipcMain, params.window)

  await setupBaseWindowElectronInvokes({ context, window: params.window, serverChannel: params.serverChannel, i18n: params.i18n })
  createWidgetsService({ context, widgetsManager: params.widgetsManager, window: params.window })
  createAutoUpdaterService({ context, window: params.window, service: params.autoUpdater })
  createMcpServersService({ context, manager: params.mcpStdioManager })
  createGodotStageService({ context, manager: params.godotStageManager, window: params.window })
  createOnboardingService({ context, onboardingWindowManager: params.onboardingWindowManager, mainWindow: params.window })
  createAuthService({ context, window: params.window })

  let dailyBriefingWindow: BrowserWindow | undefined

  async function openDailyBriefingWindow() {
    if (!dailyBriefingWindow || dailyBriefingWindow.isDestroyed()) {
      dailyBriefingWindow = new ElectronBrowserWindow({
        title: 'Daily briefings',
        width: DAILY_BRIEFING_WINDOW_WIDTH,
        height: DAILY_BRIEFING_WINDOW_HEIGHT,
        show: false,
        frame: false,
        transparent: true,
        resizable: false,
        maximizable: false,
        minimizable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        type: 'panel',
        webPreferences: {
          preload: join(getElectronMainDirname(), '../preload/index.mjs'),
          sandbox: false,
        },
      })
      dailyBriefingWindow.on('closed', () => dailyBriefingWindow = undefined)
      protectPrivilegedWindowNavigation(dailyBriefingWindow)

      await load(dailyBriefingWindow, withHashRoute(baseUrl(resolve(getElectronMainDirname(), '..', 'renderer')), '/daily-briefing', {
        query: { 'synced-leader': 'false' },
      }))
    }

    const cursor = screen.getCursorScreenPoint()
    const position = resolveDailyBriefingWindowPosition({
      cursor,
      mainWindow: params.window.getBounds(),
      workArea: screen.getDisplayNearestPoint(cursor).workArea,
    })
    dailyBriefingWindow.setPosition(position.x, position.y)
    dailyBriefingWindow.show()
    dailyBriefingWindow.focus()
  }

  defineInvokeHandler(context, electronCenterMainWindow, () => centerWindowOnDisplay(params.window))
  defineInvokeHandler(context, electronOpenDailyBriefing, openDailyBriefingWindow)
  defineInvokeHandler(context, electronOpenMainDevtools, () => params.window.webContents.openDevTools({ mode: 'detach' }))
  defineInvokeHandler(context, electronOpenEditor, () => params.editorWindow.openWindow())
  defineInvokeHandler(context, electronOpenSettings, payload => params.settingsWindow.openWindow(payload?.route))
  defineInvokeHandler(context, electronOpenChat, async () => toggleWindowShow(await params.chatWindow()))
  defineInvokeHandler(context, noticeWindowEventa.openWindow, payload => params.noticeWindow.open(payload))
}
