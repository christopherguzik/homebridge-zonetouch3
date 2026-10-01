class ZoneAccessory {
  constructor(platform, accessory, zoneConfig) {
    this.platform = platform;
    this.accessory = accessory;
    this.zoneConfig = zoneConfig;
    const { Service, Characteristic } = platform.api.hap;

    this.service =
      accessory.getService(Service.Switch) || accessory.addService(Service.Switch);

    this.service.setCharacteristic(Characteristic.Name, zoneConfig.name);

    this.service
      .getCharacteristic(Characteristic.On)
      .onGet(() => this._getOn())
      .onSet((value) => this._setOn(value));

    // Once client.js emits real zone updates, push them into HomeKit:
    platform.client.on('zoneUpdate', (update) => {
      if (update.zoneId === zoneConfig.id) {
        this.service.updateCharacteristic(Characteristic.On, update.isOn);
      }
    });
  }

  _getOn() {
    return this.platform.client.getZoneState(this.zoneConfig.id).isOn;
  }

  _setOn(value) {
    this.platform.client.setZoneOn(this.zoneConfig.id, value, this.zoneConfig.onPercent || 100);
  }
}

module.exports = { ZoneAccessory };
