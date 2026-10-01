# homebridge-zonetouch3

A Homebridge plugin for the Polyaire **ZoneTouch 3**. Each configured zone
shows up in HomeKit as a Switch.

## Status: real, working protocol

ZoneTouch 3 talks over a **raw TCP socket** on your local network (default
port `7030`) — plain binary frames with a CRC16 (Modbus) checksum, no
auth token required. This was reverse-engineered and confirmed working by
the Home Assistant community (see the "ZoneTouch 3 by Polyaire" thread on
community.home-assistant.io); this plugin ports that protocol directly.

Supported:
- Turning a zone on (to a configurable open %, default 100) or off
- Polling zone state and temperature every `pollIntervalSeconds` (default 30s)

Not implemented yet (the protocol has no obvious blocker, just not wired
up): exposing zone open-percentage as a HomeKit dimmer instead of a plain
switch, and exposing the temperature sensor as a HomeKit accessory.

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
        { "id": 0, "name": "Living Room", "onPercent": 100 },
        { "id": 1, "name": "Bedroom", "onPercent": 80 }
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
- `zones[].onPercent`: how far open the zone damper goes when switched on
  in HomeKit (the app calls this separately from "on/off").

## A couple of protocol quirks worth knowing

- The message ID byte in each frame is randomized on every send. The
  community found that certain fixed ID values caused some units to
  intermittently reject commands — randomizing sidesteps this.
- There's a small (250ms) gap enforced between outgoing messages, since
  rapid-fire sends were reported as unreliable on some firmware.

## What each file does

- `index.js` — registers the platform with Homebridge.
- `lib/platform.js` — reads config, creates one accessory per zone.
- `lib/zoneAccessory.js` — exposes a zone as a HomeKit Switch.
- `lib/zonetouchClient.js` — the TCP connection and the actual ZoneTouch
  3 binary protocol (message building, CRC16, response parsing).
