
<p align="center">
<img src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150">
</p>


# Homebridge LG ThinQ

[![npm](https://img.shields.io/npm/v/homebridge-lg-thinq/latest?label=latest)](https://www.npmjs.com/package/homebridge-lg-thinq)
[![npm](https://img.shields.io/npm/dt/homebridge-lg-thinq)](https://www.npmjs.com/package/homebridge-lg-thinq)

## Overview

A Homebridge plugin for controlling/monitoring LG ThinQ device via their ThinQ platform.

⚠️ This library only works with v2 of the LG ThinQ API. If your device not showing up even debug mode, try using v1 plugin [homebridge-wideq](https://github.com/NorDroN/homebridge-wideq)

A plugin for interacting with the "LG ThinQ" system, which can control new LG smart device. API used in this plugin is not official, I reversed from their "LG ThinQ" mobile app.

## Installation

```
npm i -g homebridge-lg-thinq
```

# Configuration

> ✔️ The preferred and always up-to-date way to configure this plugin is through the config UI.  
> For details check [their documentation](https://github.com/oznu/homebridge-config-ui-x#readme).

```json
{
  "username": "**lg*thinq*account**",
  "password": "*************",
  "country": "US",
  "language": "en-US",
  "thinq1": false,
  "platform": "LGThinQ"
}
```

- `username` Required. The username for the account that is registered in the LG ThinQ Mobile App.
- `password` Required. The password for the account that is registered in the LG ThinQ Mobile App.
- `country` Required. Your account [country alpha-2 code](https://www.countrycode.org/), e.g., US for the USA.
- `language` Required. Your account language code, e.g., en-US, vi-VN.
- `thinq` Optional. Enable thinq1 device support
## Implementation Status

| *Device* | *Implementation* | *Status* | *Control* | *Thinq2* | *Thinq1* |
| --- | --- | --- | --- | --- | --- |
| Refrigerator | ✔️ | ✔️ | ✔️ | ✔️ | 🚫 |
| Air Purifier | ✔️ | ✔️ | ✔️ | ✔️ | 🚫 |
| Washer & Dryer | ✔️ | ⚠️ needs testing | ⚠️ | ✔️ | ⚠️ need testing |
| Dishwasher | ✔️ | ✔️ | ✔️ | ✔️ | 🚫 |
| Dehumidifier | ✔️ | ⚠️ needs testing | ⚠️ | ✔️ | 🚫 |

## Support

If you have a question, please [start a discussion](https://github.com/nVuln/homebridge-lg-thinq/discussions/new).  
If you would like to report a bug, please [open an issue](https://github.com/nVuln/homebridge-lg-thinq/issues/new/choose).
