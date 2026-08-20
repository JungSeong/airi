import fs from 'node:fs'
import os from 'node:os'

const home = process.env.AIRI_HOME || os.homedir()
const serverConfigPath = process.env.AIRI_CONFIG_PATH || `${home}/.config/ai.moeru.airi/server-channel-config.json`

const config = {
  wsUrl: process.env.AIRI_WS_URL || 'ws://localhost:6121/ws',
  spontaneousMinSec: Number(process.env.AIRI_SPONTANEOUS_MIN_S ?? 60),
  spontaneousMaxSec: Number(process.env.AIRI_SPONTANEOUS_MAX_S ?? 300),
  spokenLogPath: process.env.AIRI_SPOKEN_LOG || `${home}/airi_spoken.log`,
  ttsHealthUrl: process.env.AIRI_TTS_HEALTH_URL || 'http://127.0.0.1:8000/health',
}

const spontaneousPrompts = [
  { headline: '은랑 레이드 초대', line: '새 레이드 열렸어. 들어올래?' },
  { headline: '은랑 패치 점검', line: '오늘 패치 봤어? 노잼이면 내가 뜯어고칠 거야.' },
  { headline: '은랑 파티 체크', line: '파티원 대기 중인데, 너 자리 비었어.' },
  { headline: '은랑 버스 출발', line: '원버튼 클리어 준비됐어. 버스 타.' },
  { headline: '은랑 공략 제안', line: '보스 패턴 두 개쯤 보이네. 공략 줄까?' },
  { headline: '은랑 스테이지 제안', line: '심심한데 새 스테이지나 돌자.' },
  { headline: '은랑 버그 판정', line: '이 버그, 사양이라 치고 넘어갈래?' },
  { headline: '은랑 DLC 예고', line: '다음 DLC 예고 봤어? 기대는 안 돼.' },
]

let lastPromptIndex = -1

function randomPrompt() {
  let index
  do {
    index = Math.floor(Math.random() * spontaneousPrompts.length)
  } while (index === lastPromptIndex)

  lastPromptIndex = index
  return spontaneousPrompts[index]
}

function readToken() {
  try {
    return JSON.parse(fs.readFileSync(serverConfigPath, 'utf8')).authToken || ''
  }
  catch {
    return ''
  }
}

function nanoid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min)) + min
}

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`)
}

async function isTtsReady() {
  try {
    const response = await fetch(config.ttsHealthUrl, { signal: AbortSignal.timeout(1_500) })
    return response.ok
  }
  catch {
    return false
  }
}

function parseServerMessage(text) {
  const raw = JSON.parse(text)
  return raw?.json ?? raw
}

function sendHeartbeat(ws, kind, message) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'transport:connection:heartbeat',
      data: {
        kind,
        message,
        at: Date.now(),
      },
    }))
  }
}

class AiriBridge {
  constructor({ url, token }) {
    this.url = url
    this.token = token
    this.name = 'codex-waifu-bridge'
    this.instanceId = nanoid()
    this.ws = undefined
    this.ready = false
    this.authenticated = false
    this.connect()
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN))
      return

    const ws = new WebSocket(this.url)
    this.ws = ws
    this.ready = false
    this.authenticated = false
    let heartbeatTimer

    ws.onopen = () => {
      log('ws open, authenticating')
      heartbeatTimer = setInterval(() => {
        sendHeartbeat(ws, 'ping', '🩵')
      }, 20_000)
      this.sendRaw({
        type: 'module:authenticate',
        data: { token: this.token },
      })
    }

    ws.onmessage = (event) => {
      let message
      try {
        message = parseServerMessage(event.data)
      }
      catch {
        return
      }

      if (message.type === 'transport:connection:heartbeat' && message.data?.kind === 'ping') {
        sendHeartbeat(this.ws, 'pong', '💛')
      }

      if (message.type === 'module:authenticated' && message.data?.authenticated) {
        this.authenticated = true
        log('ws authenticated, announcing module')
        this.sendRaw({
          type: 'extension:module:announce',
          data: {
            name: this.name,
            identity: {
              id: this.instanceId,
              extension: { id: this.name },
            },
            possibleEvents: ['spark:notify'],
            permissions: [],
            dependencies: [],
          },
        })
      }

      const announced = message.type === 'extension:module:announced' && message.data?.identity?.id === this.instanceId
      const synced = message.type === 'registry:modules:sync' && message.data?.modules?.some(module => module.identity?.id === this.instanceId)

      if (announced || synced) {
        this.ready = true
        log('ws ready')
      }
    }

    ws.onclose = () => {
      clearInterval(heartbeatTimer)
      this.ready = false
      this.authenticated = false
      log('ws closed, reconnect in 5s')
      setTimeout(() => this.connect(), 5_000)
    }

    ws.onerror = () => {
      // onclose handles reconnect
    }
  }

  sendRaw(payload) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload))
      return true
    }

    return false
  }

  sendSparkNotify() {
    if (!this.ready)
      return false

    const eventId = nanoid()
    const prompt = randomPrompt()
    log(`spontaneous template: ${prompt.line}`)

    return this.sendRaw({
      type: 'spark:notify',
      data: {
        id: nanoid(),
        eventId,
        lane: 'codex',
        kind: 'reminder',
        urgency: 'immediate',
        headline: prompt.line,
        note: `이번 자발 발화 주제: ${prompt.line} 예문을 그대로 말하지 말고, 같은 뜻을 은랑 LV.999가 직접 말하는 한국어 반말 1~2문장으로 바꿔. 이 주제 밖 내용은 말하지 마.`,
        ttlMs: 30_000,
        requiresAck: false,
        destinations: ['*'],
      },
      metadata: {
        source: {
          kind: 'plugin',
          id: this.instanceId,
          extension: { id: this.name },
          plugin: { id: this.name },
        },
        event: { id: eventId },
      },
    })
  }

}

const bridge = new AiriBridge({ url: config.wsUrl, token: readToken() })

async function scheduleSpontaneous() {
  const delay = randomBetween(config.spontaneousMinSec, config.spontaneousMaxSec) * 1_000
  setTimeout(async () => {
    if (await isTtsReady()) {
      if (bridge.sendSparkNotify()) {
        log('sent spontaneous spark')
      }
    }
    else {
      log('TTS not ready; skipping spontaneous spark. Run ./airi --silver_wolf start')
    }
    scheduleSpontaneous()
  }, delay)
}

let spokenOffset = (() => {
  try {
    return fs.readFileSync(config.spokenLogPath, 'utf8').length
  }
  catch {
    return 0
  }
})()

function syncSpokenLog() {
  let data
  try {
    data = fs.readFileSync(config.spokenLogPath, 'utf8')
  }
  catch {
    return
  }

  if (data.length < spokenOffset)
    spokenOffset = 0

  if (data.length <= spokenOffset)
    return

  const chunk = data.slice(spokenOffset)
  spokenOffset = data.length

  for (const line of chunk.split(/\r?\n/)) {
    const text = line.trim()
    if (text)
      log(`AIRI SAID: ${text}`)
  }
}

scheduleSpontaneous()
syncSpokenLog()
setInterval(syncSpokenLog, 1_000)

log(`bridge started: url=${config.wsUrl}`)
