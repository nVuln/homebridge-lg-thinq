#!/usr/bin/env node

import { Command } from 'commander';
import { API } from './lib/API.js';
import { Auth } from './lib/Auth.js';
import { URL } from 'url';
import * as readline from 'readline';
import type { Logger } from 'homebridge';

const makeLogger = (): Logger => (console as unknown as Logger);

const input = (question: string) => new Promise<string>((resolve) => {
  const rl = readline.createInterface(process.stdin, process.stdout);
  rl.question(question, (answer) => resolve(answer));
});

const program = new Command();

const options = {
  country: 'US',
  language: 'en-US',
};

program
  .option('-c, --country <type>', 'Country code for account', options.country)
  .on('option:country', (value) => options.country = value)
  .option('-l, --language <type>', 'Language code for account', options.language)
  .on('option:language', (value) => options.language = value);

program
  .command('login')
  .description('Obtain refresh_token from LG account')
  .argument('<username>', 'LG username')
  .argument('<password>', 'LG password')
  .action(async (username, password) => {

    console.info('Start login: username =', username, ', password =', password, ', country =', options.country, ', language =', options.language);
    const logger = makeLogger();
    try {
      const api = new API(options.country, options.language, logger);
      const gateway = await api.gateway();
      const auth = new Auth(gateway, logger);
      const session = await auth.login(username, password);


      console.info('Your refresh_token:', session.refreshToken);
    } catch (err) {

      console.error(err);
    }

    process.exit(0);
  });

program
  .command('auth')
  .description('Obtain refresh_token from account logged by Google Account, Apple ID')
  .action(async () => {
    const logger = makeLogger();
    const api = new API(options.country, options.language, logger);
    const gateway = await api.gateway();
    const auth = new Auth(gateway, logger);

    const loginUrl = new URL(await auth.getLoginUrl());
    const origin = loginUrl.origin;
    loginUrl.host = 'us.m.lgaccount.com';
    loginUrl.searchParams.set('division', 'ha'); // enable Apple ID
    loginUrl.searchParams.set('redirect_uri', origin + '/login/iabClose');
    loginUrl.searchParams.set('callback_url', origin + '/login/iabClose');


    console.info('Log in here:', loginUrl.href);

    const callbackUrl = await input('Then paste the URL where the browser is redirected: ');

    const url = new URL(callbackUrl);
    const refresh_token = url.searchParams.get('refresh_token');

    if (refresh_token) {

      console.info('Your refresh_token:', refresh_token);
      process.exit(0);
      return;
    }

    const username = url.searchParams.get('user_id'),
      thirdparty_token = url.searchParams.get('user_thirdparty_token'),
      id_type = url.searchParams.get('user_id_type') || '';

    const thirdparty: Record<string, string | undefined> = {
      APPL: 'apple',
      FBK: 'facebook',
      GGL: 'google',
      AMZ: 'amazon',
    };

    if (!username || !thirdparty_token || typeof thirdparty[id_type] === 'undefined') {

      console.error('redirected url not valid, please try again or use LG account method');
      process.exit(0);
      return;
    }

    try {
      const session = await auth.loginStep2(username, thirdparty_token, {
        third_party: thirdparty[id_type],
      });


      console.info('Your refresh_token:', session.refreshToken);
    } catch (err) {

      console.error(err);
    }

    process.exit(0);
  });

program.parse(process.argv);
