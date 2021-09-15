const {API} = require('../dist/lib/API');
const {Auth} = require('../dist/lib/Auth');
const { HomebridgePluginUiServer } = require('@homebridge/plugin-ui-utils');
const constants = require('../dist/lib/constants');

class UiServer extends HomebridgePluginUiServer {
  constructor () {
    // super must be called first
    super();

    this.onRequest('/get-login-url', this.getLoginUrl.bind(this));
    this.onRequest('/login-by-user-pass', this.loginByUserPass.bind(this));
    this.onRequest('/get-all-devices', this.getAllDevices.bind(this));
    this.onRequest('/extract-token-from-url', this.extractToken.bind(this));

    // this.ready() must be called to let the UI know you are ready to accept api calls
    this.ready();
  }

  async extractToken(params) {
    const url = new URL(params.url);

    const refresh_token = url.searchParams.get('refresh_token');
    if (refresh_token) {
      return {
        success: true,
        token: refresh_token,
      };
    }

    const country = url.searchParams.get('country'),
      language = url.searchParams.get('language'),
      username = url.searchParams.get('user_id'),
      thirdparty_token = url.searchParams.get('user_thirdparty_token'),
      id_type = url.searchParams.get('user_id_type');

    const thirdparty = {
      APPL: 'apple',
      FBK: 'facebook',
      GGL: 'google',
      AMZ: 'amazon',
    };
    if (!username || !thirdparty_token || typeof thirdparty[id_type] === 'undefined') {
      return {
        success: false,
        error: 'this url not valid, please try again or use LG account method',
      }
    }

    const api = new API(country, language);
    const gateway = await api.gateway();
    const auth = new Auth(gateway);
    try {
      const session = await auth.loginStep2(username, thirdparty_token, {
        third_party: thirdparty[id_type]
      })

      return {
        success: true,
        token: session.refreshToken,
      };
    } catch (err) {
      return {
        success: false,
        error: err.message,
      }
    }
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

  async getLoginUrl(params) {
    const api = new API(params.country, params.language);
    const gateway = await api.gateway();
    const auth = new Auth(gateway);

    const url = new URL(await auth.getLoginUrl());
    const origin = url.origin;
    url.host = 'us.m.lgaccount.com';
    url.searchParams.set('division', 'ha'); // enable Apple ID
    url.searchParams.set('redirect_uri', origin + '/login/iabClose');
    url.searchParams.set('callback_url', origin + '/login/iabClose');
    // google login only accept us.m.lgaccount.com
    return url.href;
  }
}

// start the instance of the class
(() => {
  return new UiServer;
})();
