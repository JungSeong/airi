import fs from 'node:fs'
import os from 'node:os'

const home = process.env.AIRI_HOME || os.homedir()
const serverConfigPath = process.env.AIRI_CONFIG_PATH || `${home}/.config/ai.moeru.airi/server-channel-config.json`

const config = {
  wsUrl: process.env.AIRI_WS_URL || 'ws://localhost:6121/ws',
  spontaneousMinSec: Number(process.env.AIRI_SPONTANEOUS_MIN_S ?? 60),
  spontaneousMaxSec: Number(process.env.AIRI_SPONTANEOUS_MAX_S ?? 300),
  spokenLogPath: process.env.AIRI_SPOKEN_LOG || `${home}/airi_spoken.log`,
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

    return this.sendRaw({
      type: 'spark:notify',
      data: {
        id: nanoid(),
        eventId,
        lane: 'codex',
        kind: 'reminder',
        urgency: 'immediate',
        headline: '은랑 자발 발화',
        note: '사용자가 조용한 상태야. 지금 바로 사용자에게 은랑 LV.999 말투로 짧게 한 마디 말해줘. 반드시 텍스트로 답변해.',
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

function scheduleSpontaneous() {
  const delay = randomBetween(config.spontaneousMinSec, config.spontaneousMaxSec) * 1_000
  setTimeout(() => {
    if (bridge.sendSparkNotify()) {
      log('sent spontaneous spark')
    }
    scheduleSpontaneous()
  }, delay)
}

let spokenOffset = 0

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
