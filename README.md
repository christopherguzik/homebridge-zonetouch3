# homebridge-zonetouch3

A Homebridge plugin for the Polyaire **ZoneTouch 3**. Each configured zone
shows up in HomeKit as a Fan with an adjustable speed percentage mapped to the
zone damper opening.

## Status: real, working protocol

ZoneTouch 3 talks over a **raw TCP socket** on your local network (default
port `7030`) — plain binary frames with a CRC16 (Modbus) checksum, no
auth token required. This was reverse-engineered and confirmed working by
the Home Assistant community (see the "ZoneTouch 3 by Polyaire" thread on
community.home-assistant.io); this plugin ports that protocol directly.

Supported:
- Turning each zone on or off from its HomeKit fan control
- Setting each zone damper from 0% (closed) to 100% (fully open) using fan speed
- Polling zone state and temperature every `pollIntervalSeconds` (default 30s)

The temperature sensor is not exposed as a HomeKit accessory.

## Install

Copy this folder to your Homebridge plugins directory and run `npm install`
inside it (there are no external dependencies — it only uses Node's
built-in `net` module).

## Config (config.json)

```json
{
  "platforms": [
    {
      "platform": "ZoneTouch3",
      "name": "ZoneTouch AC",
      "ip": "192.168.1.50",
      "port": 7030,
      "pollIntervalSeconds": 30,
      "zones": [
        { "id": 0, "name": "Living Room" },
        { "id": 1, "name": "Bedroom" }
      ]
    }
  ]
}
```

- `ip`: your ZoneTouch 3's local IP (check your router/UniFi client list,
  or the ZoneTouch app's network settings).
- `port`: 7030 is what's confirmed in the community thread. If your unit
  doesn't respond, this is the first thing worth double-checking.
- `zones[].id`: zone index starting at 0, in the same order they appear in
  the ZoneTouch app.
- Each zone's HomeKit fan speed sets the damper opening percentage. Turning a
  zone off closes its damper; turning it on restores the last non-zero speed.

## A couple of protocol quirks worth knowing

- The message ID byte in each frame is randomized on every send. The
  community found that certain fixed ID values caused some units to
  intermittently reject commands — randomizing sidesteps this.
- There's a small (250ms) gap enforced between outgoing messages, since
  rapid-fire sends were reported as unreliable on some firmware.

## What each file does

- `index.js` — registers the platform with Homebridge.
- `lib/platform.js` — reads config, creates one accessory per zone.
- `lib/zoneAccessory.js` — exposes a zone as a HomeKit Fan with percentage speed.
- `lib/zonetouchClient.js` — the TCP connection and the actual ZoneTouch
  3 binary protocol (message building, CRC16, response parsing).
