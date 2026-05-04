import { API } from '../dist/lib/API.js';
import { Auth } from '../dist/lib/Auth.js';
import { HomebridgePluginUiServer } from '@homebridge/plugin-ui-utils';
import { DeviceType } from '../dist/lib/constants.js';

function createUiLogger(scope) {
  const prefix = scope;
  const write = method => (...args) => globalThis.console[method](prefix, ...args);

  return {
    debug: write('debug'),
    error: write('error'),
    info: write('info'),
    log: write('log'),
    success: write('log'),
    warn: write('warn'),
  };
}

function errorMessage(err, fallback) {
  return err?.response?.data?.error?.message
    || err?.response?.data?.message
    || err?.response?.data?.error_description
    || err?.message
    || err?.cause?.message
    || fallback;
}

function errorDetails(err) {
  const details = {
    name: err?.name,
    status: err?.response?.status,
    code: err?.response?.data?.error?.code || err?.response?.data?.resultCode || err?.code,
    message: errorMessage(err, 'Unknown error'),
  };

  if (err?.cause) {
    details.cause = errorDetails(err.cause);
  }

  return details;
}

function logRequestError(logger, path, err) {
  logger.error(`${path} failed: ${errorMessage(err, 'Request failed')}`);
  logger.error(`${path} details: ${JSON.stringify(errorDetails(err))}`);

  if (err?.stack) {
    logger.debug(err.stack);
  }
}

function firstString(...values) {
  return values.find(value => typeof value === 'string' && value.trim()) || '';
}

function mapDeviceForConfig(device) {
  return {
    id: device.deviceId,
    name: firstString(device.alias, device.name, device.deviceId),
    type: DeviceType[device.deviceType] || '',
    serial_number: firstString(
      device.manufacture?.serialNo,
      device.serialNo,
      device.serialNumber,
      device.modemInfo?.serialNo,
    ),
  };
}

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
    const logger = createUiLogger('UI devices');

    try {
      logger.info(`/get-all-devices starting for ${params.country}/${params.language}`);

      const api = new API(params.country, params.language, logger);
      api.setRefreshToken(params.refresh_token);
      await api.ready();
      const devices = (await api.getListDevices()).map(mapDeviceForConfig);

      logger.info(`/get-all-devices found ${devices.length} device(s): `
        + devices.map(device => `${device.name || device.id} (${device.type || 'UNKNOWN'})`).join(', '));

      return {
        success: true,
        devices,
      };
    } catch (err) {
      logRequestError(logger, '/get-all-devices', err);

      return {
        success: false,
        error: errorMessage(err, 'Unable to load ThinQ devices.'),
      };
    }
  }

  async loginByUserPass(params) {
    const logger = createUiLogger('UI login');

    try {
      logger.info(`/login-by-user-pass starting for ${params.country}/${params.language}`);

      const api = new API(params.country, params.language, logger);
      const gateway = await api.gateway();
      const auth = new Auth(gateway, logger);
      const session = await auth.login(params.username, params.password);

      logger.info('/login-by-user-pass succeeded');

      return {
        success: true,
        token: session.refreshToken,
      };
    } catch (err) {
      logRequestError(logger, '/login-by-user-pass', err);

      return {
        success: false,
        error: errorMessage(err, 'Unable to log in to LG ThinQ.'),
      };
    }
  }
}

// start the instance of the class
(() => {
  return new UiServer;
})();
