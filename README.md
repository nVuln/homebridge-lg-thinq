
<p align="center">
<img src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150">
</p>


# Homebridge LG ThinQ

[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm](https://img.shields.io/npm/v/homebridge-lg-thinq/latest?label=latest)](https://www.npmjs.com/package/homebridge-lg-thinq)
[![npm](https://img.shields.io/npm/dt/homebridge-lg-thinq)](https://www.npmjs.com/package/homebridge-lg-thinq)
[![join-discord](https://badgen.net/badge/icon/discord?icon=discord&label=homebridge-lg-thinq)](https://discord.gg/wEfQpCDtS7)

## Overview

A Homebridge plugin for controlling/monitoring LG ThinQ device via their ThinQ platform.

⚠️ This library works with v2 of the LG ThinQ API. But some v1 device may backward compatible, please check table [Implementation Status](#implementation-status) below.

A plugin for interacting with the "LG ThinQ" system, which can control new LG smart device. API used in this plugin is not official, I reversed from their "LG ThinQ" mobile app.

## Installation

```
npm i -g homebridge-lg-thinq
```

# Configuration

> ✔️ I highly recommend using [homebridge-config-ui-x](https://github.com/oznu/homebridge-config-ui-x#readme) to make these changes.

1. Navigate to the Plugins page in [homebridge-config-ui-x](https://github.com/oznu/homebridge-config-ui-x).
2. Click the **Settings** button for the LG ThinQ plugin.
3. Login to your LG account
4. Add or remove which devices you want
5. Restart Homebridge for the changes to take effect.

> ⚠️ Or you can manual edit it, add json below to config.json (not recommend)
```json
{
  "auth_mode": "token",
  "refresh_token": "**refresh*token**",
  "username": "lg username",
  "password": "lg password",
  "country": "US",
  "language": "en-US",
  "thinq1": false,
  "devices": [
	{
	  "id": "device id"
	}
  ],
  "platform": "LGThinQ"
}
```
- `auth_mode` Required. You can choose between `token` and `account`
- `refresh_token` Required if `auth_mode` = `token`. The `refresh_token` of your account.
- `username` Required if `auth_mode` = `account`. LG thinQ account
- `password` Required if `auth_mode` = `account`. LG thinQ password
- `country` Required. Your account [country alpha-2 code](https://www.countrycode.org/), e.g., US for the USA.
- `language` Required. Your account language code, e.g., en-US, vi-VN.
- `devices` List devices you want add to homebridge, leave it empty if you want add all devices.
- `thinq1` Optional. Enable thinq1 device support
- `platform` value always `LGThinQ`

## Implementation Status

| *Device* | *Implementation* | *Status* | *Control* | *Thinq2* | *Thinq1* |
| --- | --- | --- | --- | --- | --- |
| Refrigerator | ✔️ | ✔️ | ✔️ | ✔️ | 🚫 |
| Air Purifier | ✔️ | ✔️ | ✔️ | ✔️ | 🚫 |
| Washer & Dryer | ✔️ | ✔️ | 🚫 | ✔️ | ✔️ |
| Dishwasher | ✔️ | ✔️ | ✔️ | ✔️ | 🚫 |
| Dehumidifier | ✔️ | ✔️ | ⚠️ | ✔️ | 🚫 |
| AC | ✔️ | ✔️ | ✔️ | ✔️ | ✔️ |

for more device support please open issue request.

## Support

If you have a question, please [start a discussion](https://github.com/nVuln/homebridge-lg-thinq/discussions/new).  
If you would like to report a bug, please [open an issue](https://github.com/nVuln/homebridge-lg-thinq/issues/new/choose).
