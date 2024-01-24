const {API} = require('../dist/lib/API');
const {Auth} = require('../dist/lib/Auth');
const { HomebridgePluginUiServer } = require('@homebridge/plugin-ui-utils');
const constants = require('../dist/lib/constants');

class UiServer extends HomebridgePluginUiServer {
  constructor () {
    // super must be called first
    super();

    this.onRequest('/login-by-user-pass', this.loginByUserPass.bind(this));
    this.onRequest('/get-all-devices', this.getAllDevices.bind(this));

    // this.ready() must be called to let the UI know you are ready to accept api calls
    this.ready();
  }

  async getAllDevices(params) {
    try {
      const api = new API(params.country, params.language);
      api.setRefreshToken(params.refresh_token);
      await api.ready();

      return {
        success: true,
        devices: (await api.getListDevices()).map(device => {
          return {
            id: device.deviceId,
            name: device.alias,
            type: constants.DeviceType[device.deviceType],
            serial_number: device.manufacture?.salesModel,
          };
        }),
      };
    } catch (err) {
      return {
        success: false,
        error: err.message,
      };
    }
  }

  async loginByUserPass(params) {
    try {
      const api = new API(params.country, params.language);
      const gateway = await api.gateway();
      const auth = new Auth(gateway);
      const session = await auth.login(params.username, params.password);

      return {
        success: true,
        token: session.refreshToken,
      };
    } catch (err) {
      return {
        success: false,
        error: err.message,
      };
    }
  }
}

// start the instance of the class
(() => {
  return new UiServer;
})();
