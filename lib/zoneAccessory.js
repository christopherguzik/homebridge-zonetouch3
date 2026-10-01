class ZoneAccessory {
  constructor(platform, accessory, zoneConfig) {
    this.platform = platform;
    this.accessory = accessory;
    this.zoneConfig = zoneConfig;
    const initialState = platform.client.getZoneState(zoneConfig.id);
    this.lastNonZeroSpeed = initialState.isOn && initialState.percent > 0
      ? initialState.percent
      : 100;
    const { Service, Characteristic } = platform.api.hap;

    const oldSwitchService = accessory.getService(Service.Switch);
    if (oldSwitchService) accessory.removeService(oldSwitchService);
    const oldWindowCovering = accessory.getService(Service.WindowCovering);
    if (oldWindowCovering) accessory.removeService(oldWindowCovering);

    accessory.displayName = zoneConfig.name;
    this.service =
      accessory.getService(Service.Fanv2) || accessory.addService(Service.Fanv2);

    this.service.setCharacteristic(Characteristic.Name, zoneConfig.name);

    this.service
      .getCharacteristic(Characteristic.Active)
      .onGet(() => this._getActive())
      .onSet((value) => this._setActive(value));

    this.service
      .getCharacteristic(Characteristic.RotationSpeed)
      .onGet(() => this._getSpeed())
      .onSet((value) => this._setSpeed(value));

    this.service
      .getCharacteristic(Characteristic.CurrentFanState)
      .onGet(() => this._getFanState());

    platform.client.on('zoneUpdate', (update) => {
      if (update.zoneId === zoneConfig.id) {
        if (update.isOn && update.percent > 0) this.lastNonZeroSpeed = update.percent;
        this.service.updateCharacteristic(Characteristic.Active, update.isOn
          ? Characteristic.Active.ACTIVE
          : Characteristic.Active.INACTIVE);
        this.service.updateCharacteristic(Characteristic.RotationSpeed, update.isOn ? update.percent : 0);
        this.service.updateCharacteristic(Characteristic.CurrentFanState, this._getFanState());
      }
    });
  }

  _getActive() {
    const state = this.platform.client.getZoneState(this.zoneConfig.id);
    return state.isOn
      ? this.platform.api.hap.Characteristic.Active.ACTIVE
      : this.platform.api.hap.Characteristic.Active.INACTIVE;
  }

  _getSpeed() {
    const state = this.platform.client.getZoneState(this.zoneConfig.id);
    return state.isOn ? state.percent : 0;
  }

  _getFanState() {
    const { Characteristic } = this.platform.api.hap;
    const state = this.platform.client.getZoneState(this.zoneConfig.id);
    return state.isOn
      ? Characteristic.CurrentFanState.BLOWING_AIR
      : Characteristic.CurrentFanState.INACTIVE;
  }

  _setActive(value) {
    const { Characteristic } = this.platform.api.hap;
    const isActive = value === Characteristic.Active.ACTIVE;
    const state = this.platform.client.getZoneState(this.zoneConfig.id);
    const speed = state.isOn && state.percent > 0 ? state.percent : this.lastNonZeroSpeed;
    this.platform.client.setZoneOn(this.zoneConfig.id, isActive, speed);
  }

  _setSpeed(value) {
    const speed = Math.max(0, Math.min(100, Math.round(value)));
    if (speed > 0) this.lastNonZeroSpeed = speed;
    this.platform.client.setZoneOn(this.zoneConfig.id, speed > 0, speed);
  }
}

module.exports = { ZoneAccessory };
