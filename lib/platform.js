const { ZoneTouchClient } = require('./zonetouchClient');
const { ZoneAccessory } = require('./zoneAccessory');

class ZoneTouch3Platform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    this.api = api;
    this.accessories = [];

    if (!config.ip) {
      this.log.error('ZoneTouch3: "ip" is required in config.json');
      return;
    }

    this.client = new ZoneTouchClient(
      log,
      config.ip,
      config.port || 7030,
      config.pollIntervalSeconds || 30
    );

    this.api.on('didFinishLaunching', () => this._setupZones());
  }

  // Homebridge calls this to restore cached accessories on startup.
  configureAccessory(accessory) {
    this.accessories.push(accessory);
  }

  _setupZones() {
    const zones = this.config.zones || [];
    if (zones.length === 0) {
      this.log.warn('ZoneTouch3: no zones configured — add them to config.json under "zones"');
      return;
    }

    for (const zoneConfig of zones) {
      const uuid = this.api.hap.uuid.generate(`zonetouch3-zone-${zoneConfig.id}`);
      let accessory = this.accessories.find((a) => a.UUID === uuid);

      if (!accessory) {
        accessory = new this.api.platformAccessory(zoneConfig.name, uuid);
        this.api.registerPlatformAccessories('homebridge-zonetouch3', 'ZoneTouch3', [accessory]);
      }

      new ZoneAccessory(this, accessory, zoneConfig);
    }
  }
}

module.exports = { ZoneTouch3Platform };
