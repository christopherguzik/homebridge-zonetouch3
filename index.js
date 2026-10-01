const { ZoneTouch3Platform } = require('./lib/platform');

module.exports = (api) => {
  api.registerPlatform('homebridge-zonetouch3', 'ZoneTouch3', ZoneTouch3Platform);
};
