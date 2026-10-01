const net = require('net');
const EventEmitter = require('events');

/**
 * Talks to a ZoneTouch 3 unit over its real local protocol: a raw TCP
 * socket (default port 7030), exchanging fixed binary frames with a
 * CRC16 (Modbus) checksum. No authentication token is required — that
 * was only needed in earlier drafts of this plugin, which mistakenly
 * targeted Home Assistant's own WebSocket API instead of the device.
 *
 * Protocol reverse-engineered and confirmed working by the Home
 * Assistant community (community.home-assistant.io, "ZoneTouch 3 by
 * Polyaire" thread). Ported here from their working Node-RED flow.
 *
 * Frame layout (all messages):
 *   [0x55 0x55 0x55 0xAA]  Fixed header
 *   [0x80 0xB0]            Address
 *   [id]                   Message ID — any byte; some values are
 *                           flaky per the community's testing, so a
 *                           random ID is used per message, as they did.
 *   [0xC0]                 Type
 *   [len_hi len_lo]        Length of what follows up to (not including) CRC
 *   [sub_hi sub_lo]        Sub-type (0x2000 = set zone, 0x2100 = zone
 *                           query, 0x2B00 = temperature query)
 *   ...payload...
 *   [crc_hi crc_lo]        CRC16 Modbus over everything after the header
 */

const HEADER = Buffer.from([0x55, 0x55, 0x55, 0xaa]);

function crc16Modbus(bytes) {
  let crc = 0xffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x0001 ? (crc >> 1) ^ 0xa001 : crc >> 1;
    }
  }
  return crc;
}

function buildMessage(payloadBytes) {
  const crc = crc16Modbus(Buffer.from(payloadBytes));
  const crcHi = (crc >> 8) & 0xff;
  const crcLo = crc & 0xff;
  return Buffer.concat([HEADER, Buffer.from(payloadBytes), Buffer.from([crcHi, crcLo])]);
}

function randomId() {
  return Math.floor(Math.random() * 255);
}

class ZoneTouchClient extends EventEmitter {
  constructor(log, ip, port, pollIntervalSeconds) {
    super();
    this.log = log;
    this.ip = ip;
    this.port = port || 7030;
    this.pollIntervalSeconds = pollIntervalSeconds || 30;
    this.socket = null;
    this.connected = false;
    this.buffer = Buffer.alloc(0);
    this.zoneState = new Map(); // zoneId -> { isOn, percent }
    this.sendQueue = [];
    this._sending = false;
    this._connect();
  }

  _connect() {
    this.log.info(`ZoneTouch3: connecting to ${this.ip}:${this.port}`);
    this.socket = new net.Socket();

    this.socket.connect(this.port, this.ip, () => {
      this.connected = true;
      this.log.info('ZoneTouch3: TCP connected');
      this.emit('ready');
      this.queryZones();
      this.queryTemperature();
      this._pollTimer = setInterval(() => {
        this.queryZones();
        this.queryTemperature();
      }, this.pollIntervalSeconds * 1000);
    });

    this.socket.on('data', (chunk) => this._handleData(chunk));

    this.socket.on('close', () => {
      this.connected = false;
      if (this._pollTimer) clearInterval(this._pollTimer);
      this.log.warn('ZoneTouch3: connection closed, retrying in 5s');
      setTimeout(() => this._connect(), 5000);
    });

    this.socket.on('error', (err) => {
      this.log.error(`ZoneTouch3: socket error: ${err.message}`);
    });
  }

  _handleData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const headerIdx = this.buffer.indexOf(HEADER);
      if (headerIdx === -1) {
        this.buffer = Buffer.alloc(0);
        return;
      }
      if (headerIdx > 0) this.buffer = this.buffer.slice(headerIdx);

      // Zone status reply: sub-type byte at offset 10, fixed 60-byte length.
      if (this.buffer.length >= 60 && this.buffer[10] === 0x21) {
        this._parseZoneStatus(this.buffer.slice(0, 60));
        this.buffer = this.buffer.slice(60);
        continue;
      }

      // Temperature reply: marker byte at offset 18, fixed 24-byte length.
      if (this.buffer.length >= 24 && this.buffer[18] === 0x9f) {
        this._parseTemperature(this.buffer.slice(0, 24));
        this.buffer = this.buffer.slice(24);
        continue;
      }

      // Not enough bytes yet for either known reply shape — wait for more.
      break;
    }
  }

  _parseZoneStatus(msg) {
    const zoneCount = msg[17];
    for (let i = 0; i < zoneCount; i++) {
      const byteIdx = 18 + i * 8;
      const rawStatus = msg[byteIdx] - i;
      let percent = msg[byteIdx + 1];
      const isOn = rawStatus !== 0;
      if (!isOn) percent = 0;

      this.zoneState.set(i, { isOn, percent });
      this.emit('zoneUpdate', { zoneId: i, isOn, percent });
    }
  }

  _parseTemperature(msg) {
    const raw = ((msg[20] & 0xff) << 8) | (msg[21] & 0xff);
    const celsius = (raw - 500) / 10;
    this.emit('temperature', celsius);
  }

  _queueSend(buffer) {
    this.sendQueue.push(buffer);
    this._drainQueue();
  }

  _drainQueue() {
    if (this._sending || this.sendQueue.length === 0) return;
    if (!this.connected) return;
    this._sending = true;
    const buf = this.sendQueue.shift();
    this.socket.write(buf, () => {
      // Small gap between sends — the real app doesn't fire messages
      // back-to-back either, and the community reported flakiness
      // under rapid-fire sends.
      setTimeout(() => {
        this._sending = false;
        this._drainQueue();
      }, 250);
    });
  }

  /**
   * Turns a zone on (optionally to a given open percentage) or off.
   * Matches the app's own behaviour: ON is sent as two messages —
   * an ON flag, then a percentage — OFF is sent as a single message.
   */
  setZoneOn(zoneId, isOn, percent = 100) {
    if (isOn) {
      this._queueSend(buildMessage(this._setZonePayload(zoneId, 0x03, 0x00)));
      this._queueSend(buildMessage(this._setZonePayload(zoneId, 0x80, percent)));
    } else {
      this._queueSend(buildMessage(this._setZonePayload(zoneId, 0x02, 0x00)));
    }
  }

  _setZonePayload(zoneId, state, value) {
    return [
      0x80, 0xb0, // Address
      randomId(), // Message ID
      0xc0, // Type
      0x00, 0x0c, // Length
      0x20, 0x00, // Sub-type: set zone
      0x00, 0x00, // Common data length
      0x00, 0x04, // Repeat data count
      0x00, 0x01, // Repeat data length
      zoneId,
      state, // 0x03 = on, 0x02 = off, 0x80 = percentage
      value,
      0x00,
    ];
  }

  queryZones() {
    this._queueSend(
      buildMessage([
        0x80, 0xb0, 0x01, 0xc0, 0x00, 0x08, 0x21, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      ])
    );
  }

  queryTemperature() {
    this._queueSend(
      buildMessage([
        0x80, 0xb0, 0x01, 0xc0, 0x00, 0x08, 0x2b, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      ])
    );
  }

  getZoneState(zoneId) {
    return this.zoneState.get(zoneId) || { isOn: false, percent: 0 };
  }
}

module.exports = { ZoneTouchClient };
