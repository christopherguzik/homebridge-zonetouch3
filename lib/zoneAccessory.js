class ZoneAccessory {
  constructor(platform, accessory, zoneConfig) {
    this.platform = platform;
    this.accessory = accessory;
    this.zoneConfig = zoneConfig;
    this.targetPosition = null;
    const { Service, Characteristic } = platform.api.hap;

    const oldSwitchService = accessory.getService(Service.Switch);
    if (oldSwitchService) accessory.removeService(oldSwitchService);

    accessory.displayName = zoneConfig.name;
    this.service =
      accessory.getService(Service.WindowCovering) || accessory.addService(Service.WindowCovering);

    this.service.setCharacteristic(Characteristic.Name, zoneConfig.name);

    this.service
      .getCharacteristic(Characteristic.CurrentPosition)
      .onGet(() => this._getPosition());

    this.service
      .getCharacteristic(Characteristic.TargetPosition)
      .onGet(() => this._getTargetPosition())
      .onSet((value) => this._setPosition(value));

    this.service
      .getCharacteristic(Characteristic.PositionState)
      .onGet(() => Characteristic.PositionState.STOPPED);

    platform.client.on('zoneUpdate', (update) => {
      if (update.zoneId === zoneConfig.id) {
        const position = update.isOn ? update.percent : 0;
        this.service.updateCharacteristic(Characteristic.CurrentPosition, position);
      }
    });
  }

  _getPosition() {
    const state = this.platform.client.getZoneState(this.zoneConfig.id);
    return state.isOn ? state.percent : 0;
  }

  _getTargetPosition() {
    return this.targetPosition ?? this._getPosition();
  }

  _setPosition(value) {
    this.targetPosition = value;
    this.platform.client.setZoneOn(this.zoneConfig.id, value > 0, value);
  }
}

module.exports = { ZoneAccessory };
