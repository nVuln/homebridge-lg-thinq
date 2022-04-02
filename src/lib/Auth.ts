import {Gateway} from './Gateway';
import {Session} from './Session';
import {requestClient} from './request';
import * as constants from './constants';
import * as qs from 'qs';
import crypto from 'crypto';
import {DateTime} from 'luxon';
import {AuthenticationError, TokenError} from '../errors';
import {URL} from 'url';

export class Auth {
  public lgeapi_url: string;

  public constructor(
    protected gateway: Gateway,
  ) {
    this.lgeapi_url = `https://${this.gateway.country_code.toLowerCase()}.lgeapi.com/`;
  }

  public async login(username: string, password: string) {
    // get signature and timestamp in login form
    const hash = crypto.createHash('sha512');

    return this.loginStep2(username, hash.update(password).digest('hex'));
  }

  public async loginStep2(username, encrypted_password, extra_headers?: any) {
    const headers = this.defaultEmpHeaders;

    const preLoginData = {
      'user_auth2': encrypted_password,
      'log_param': 'login request / user_id : '+ username +' / third_party : null / svc_list : SVC202,SVC710 / 3rd_service : ',
    };
    const preLogin = await requestClient.post(this.gateway.login_base_url + 'preLogin', qs.stringify(preLoginData), { headers })
      .then(res => res.data);

    headers['X-Signature'] = preLogin.signature;
    headers['X-Timestamp'] = preLogin.tStamp;

    const data = {
      'user_auth2': preLogin.encrypted_pw,
      'password_hash_prameter_flag': 'Y',
      'svc_list': 'SVC202,SVC710', // SVC202=LG SmartHome, SVC710=EMP OAuth
      ...extra_headers,
    };

    // try login with username and hashed password
    const loginUrl = this.gateway.emp_base_url + 'emp/v2.0/account/session/' + encodeURIComponent(username);
    const account = await requestClient.post(loginUrl, qs.stringify(data), { headers }).then(res => res.data.account).catch(err => {
      if (!err.response) {
        throw err;
      }

      const {code, message} = err.response.data.error;
      if (code === 'MS.001.03') {
        throw new AuthenticationError('Your account was already used to registered in '+ message +'.');
      }

      throw new AuthenticationError(message);
    });

    // dynamic get secret key for emp signature
    const empSearchKeyUrl = this.gateway.login_base_url + 'searchKey?key_name=OAUTH_SECRETKEY&sever_type=OP';
    const secretKey = await requestClient.get(empSearchKeyUrl).then(res => res.data).then(data => data.returnData);

    const timestamp = DateTime.utc().toRFC2822();
    const empData = {
      account_type: account.userIDType,
      client_id: constants.CLIENT_ID,
      country_code: account.country,
      redirect_uri: 'lgaccount.lgsmartthinq:/',
      response_type: 'code',
      state: '12345',
      username: account.userID,
    };
    const empUrl = new URL('https://emp-oauth.lgecloud.com/emp/oauth2/authorize/empsession'+qs.stringify(empData, {addQueryPrefix: true}));
    const signature = this.signature(`${empUrl.pathname}${empUrl.search}\n${timestamp}`, secretKey);
    const empHeaders = {
      'lgemp-x-app-key': constants.OAUTH_CLIENT_KEY,
      'lgemp-x-date': timestamp,
      'lgemp-x-session-key': account.loginSessionID,
      'lgemp-x-signature': signature,
      'Accept': 'application/json',
      'X-Device-Type': 'M01',
      'X-Device-Platform': 'ADR',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Access-Control-Allow-Origin': '*',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept-Language': 'en-US,en;q=0.9',
      // eslint-disable-next-line max-len
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.63 Safari/537.36 Edg/93.0.961.44',
    };
    // create emp session and get access token
    const authorize = await requestClient.get(empUrl.href, {
      headers: empHeaders,
    }).then(res => res.data).catch(err => {
      throw new AuthenticationError(err.response.data.error.message);
    });
    if (authorize.status !== 1) {
      throw new TokenError(authorize.message || authorize);
    }

    const redirect_uri = new URL(authorize.redirect_uri);

    const tokenData = {
      code: redirect_uri.searchParams.get('code'),
      grant_type: 'authorization_code',
      redirect_uri: empData.redirect_uri,
    };

    const requestUrl = '/oauth/1.0/oauth2/token' + qs.stringify(tokenData, { addQueryPrefix: true });

    const token = await requestClient.post(redirect_uri.searchParams.get('oauth2_backend_url') + 'oauth/1.0/oauth2/token',
      qs.stringify(tokenData),
      {
        headers: {
          'x-lge-app-os': 'ADR',
          'x-lge-appkey': constants.CLIENT_ID,
          'x-lge-oauth-signature': this.signature(`${requestUrl}\n${timestamp}`, constants.OAUTH_SECRET_KEY),
          'x-lge-oauth-date': timestamp,
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }).then(res => res.data);

    this.lgeapi_url = token.oauth2_backend_url || this.lgeapi_url;

    return new Session(token.access_token, token.refresh_token, token.expires_in);
  }

  public get defaultEmpHeaders() {
    return {
      'Accept': 'application/json',
      'X-Application-Key': constants.APPLICATION_KEY,
      'X-Client-App-Key': constants.CLIENT_ID,
      'X-Lge-Svccode': 'SVC709',
      'X-Device-Type': 'M01',
      'X-Device-Platform': 'ADR',
      'X-Device-Language-Type': 'IETF',
      'X-Device-Publish-Flag': 'Y',
      'X-Device-Country': this.gateway.country_code,
      'X-Device-Language': this.gateway.language_code,
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'Access-Control-Allow-Origin': '*',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept-Language': 'en-US,en;q=0.9',
    };
  }

  public async handleNewTerm(accessToken) {
    const showTermUrl = 'common/showTerms?callback_url=lgaccount.lgsmartthinq:/updateTerms'
      +'&country=VN&language=en-VN&division=ha:T20&terms_display_type=3&svc_list=SVC202';
    const showTermHtml = await requestClient.get(this.gateway.login_base_url + showTermUrl, {
      headers: {
        'X-Login-Session': accessToken,
      },
    }).then(res => res.data);

    const headers = {
      ...this.defaultEmpHeaders,
      'X-Login-Session': accessToken,
      'X-Signature': showTermHtml.match(/signature[\s]+:[\s]+"([^"]+)"/)[1],
      'X-Timestamp': showTermHtml.match(/tStamp[\s]+:[\s]+"([^"]+)"/)[1],
    };

    const accountTermUrl = 'emp/v2.0/account/user/terms?opt_term_cond=001&term_data=SVC202&itg_terms_use_flag=Y&dummy_terms_use_flag=Y';
    const accountTerms = (await requestClient.get(this.gateway.emp_base_url + accountTermUrl, { headers }).then((res) => {
      return res.data.account?.terms;
    })).map((term) => {
      return term.termsID;
    });

    const termInfoUrl = 'emp/v2.0/info/terms?opt_term_cond=001&only_service_terms_flag=&itg_terms_use_flag=Y&term_data=SVC202';
    const infoTerms = await requestClient.get(this.gateway.emp_base_url + termInfoUrl, { headers }).then(res => {
      return res.data.info.terms;
    });

    const newTermAgreeNeeded = infoTerms.filter((term) => {
      return accountTerms.indexOf(term.termsID) === -1;
    }).map(term => {
      return [term.termsType, term.termsID, term.defaultLang].join(':');
    }).join(',');

    if (newTermAgreeNeeded) {
      const updateAccountTermUrl = 'emp/v2.0/account/user/terms';
      await requestClient.post(this.gateway.emp_base_url + updateAccountTermUrl, qs.stringify({terms: newTermAgreeNeeded}), {
        headers,
      });
    }
  }

  public async getJSessionId(accessToken: string) {
    // login to old gateway also - thinq v1
    const memberLoginUrl = this.gateway.thinq1_url + 'member/login';
    const memberLoginHeaders = {
      'x-thinq-application-key': 'wideq',
      'x-thinq-security-key': 'nuts_securitykey',
      'Accept': 'application/json',
      'x-thinq-token': accessToken,
    };
    const memberLoginData = {
      countryCode: this.gateway.country_code,
      langCode: this.gateway.language_code,
      loginType: 'EMP',
      token: accessToken,
    };

    return await requestClient.post(memberLoginUrl, { lgedmRoot: memberLoginData }, {
      headers: memberLoginHeaders,
    }).then(res => res.data).then(data => data.lgedmRoot.jsessionId);
  }

  public async refreshNewToken(session: Session) {
    try {
      const gateway = await requestClient.post('https://kic.lgthinq.com:46030/api/common/gatewayUriList', {
        lgedmRoot: {
          countryCode: this.gateway.country_code,
          langCode: this.gateway.language_code,
        },
      }, {
        headers: {
          'Accept': 'application/json',
          'x-thinq-application-key': 'wideq',
          'x-thinq-security-key': 'nuts_securitykey',
        },
      }).then(res => res.data.lgedmRoot);

      this.lgeapi_url = gateway.oauthUri + '/';
    } catch (err) {
      // ignore this error
    }

    const tokenUrl = this.lgeapi_url + 'oauth/1.0/oauth2/token';
    const data = {
      grant_type: 'refresh_token',
      refresh_token: session.refreshToken,
    };

    const timestamp = DateTime.utc().toRFC2822();

    const requestUrl = '/oauth/1.0/oauth2/token' + qs.stringify(data, { addQueryPrefix: true });
    const signature = this.signature(`${requestUrl}\n${timestamp}`, constants.OAUTH_SECRET_KEY);

    const headers = {
      'x-lge-app-os': 'ADR',
      'x-lge-appkey': constants.CLIENT_ID,
      'x-lge-oauth-signature': signature,
      'x-lge-oauth-date': timestamp,
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    const resp = await requestClient.post(tokenUrl, qs.stringify(data), { headers }).then(resp => resp.data);

    session.newToken(resp.access_token, parseInt(resp.expires_in));

    return session;
  }

  public async getUserNumber(accessToken: string) {
    const profileUrl = this.lgeapi_url + 'users/profile';
    const timestamp = DateTime.utc().toRFC2822();
    const signature = this.signature(`/users/profile\n${timestamp}`, constants.OAUTH_SECRET_KEY);

    const headers = {
      'Accept': 'application/json',
      'Authorization': 'Bearer ' + accessToken,
      'X-Lge-Svccode': 'SVC202',
      'X-Application-Key': constants.APPLICATION_KEY,
      'lgemp-x-app-key': constants.CLIENT_ID,
      'X-Device-Type': 'M01',
      'X-Device-Platform': 'ADR',
      'x-lge-oauth-date': timestamp,
      'x-lge-oauth-signature': signature,
    };

    const resp = await requestClient.get(profileUrl, { headers }).then(resp => resp.data);
    if (resp.status === 2) {
      throw new AuthenticationError(resp.message);
    }

    return resp.account.userNo as string;
  }

  public async getLoginUrl() {
    const params = {
      country: this.gateway.country_code,
      language: this.gateway.language_code,
      client_id: constants.CLIENT_ID,
      svc_list: constants.SVC_CODE,
      svc_integrated: 'Y',
      redirect_uri: 'lgaccount.lgsmartthinq:/',
      show_thirdparty_login: 'LGE,MYLG,GGL,AMZ,FBK,APPL',
      division: 'ha:T20',
      callback_url: 'lgaccount.lgsmartthinq:/',
      oauth2State: '12345',
      show_select_country: 'N',
    };

    return this.gateway.login_base_url + 'login/signIn' + qs.stringify(params, { addQueryPrefix: true });
  }

  protected signature(message, secret) {
    return crypto.createHmac('sha1', Buffer.from(secret)).update(message).digest('base64');
  }
}
