import { API } from 'homebridge';

import { PLATFORM_NAME } from './settings';
import { LGThinQHomebridgePlatform } from './platform';

/**
 * This method registers the platform with Homebridge
 */
export default (api: API) => {
  api.registerPlatform(PLATFORM_NAME, LGThinQHomebridgePlatform);
};
