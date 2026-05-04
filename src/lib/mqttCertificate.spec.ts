import * as FS from 'fs';
import * as OS from 'os';
import * as Path from 'path';
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import {
  ATS_ROOT_CA_URL,
  certificateRequestBody,
  LEGACY_ROOT_CA_URL,
  loadMqttConnectionSetup,
  LG_ROOT_CA_URL,
  MQTT_CERTIFICATE_PATH,
  MQTT_CLIENT_PATH,
  MQTT_RETRY_ATTEMPTS,
  MQTT_RETRY_DELAY_MS,
  MQTT_ROUTE_URL,
  prepareMqttConnection,
  requestMqttCertificate,
  retryMqttRegistration,
  mqttCertificatePaths,
  rootCaUrlForMqttHost,
  writeIfChanged,
  writeMqttCertificateFiles,
  MqttConnectionSetup,
} from './mqttCertificate.js';

let tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const tempDir = await FS.promises.mkdtemp(Path.join(OS.tmpdir(), 'lg-thinq-mqtt-'));
  tempDirs.push(tempDir);
  return tempDir;
}

afterEach(async () => {
  for (const tempDir of tempDirs) {
    await FS.promises.rm(tempDir, { recursive: true, force: true });
  }
  tempDirs = [];
});

describe('MQTT certificate helpers', () => {
  test('selects a root CA URL from the MQTT hostname', () => {
    expect(rootCaUrlForMqttHost('abc-ats.iot.us-east-1.amazonaws.com')).toBe(ATS_ROOT_CA_URL);
    expect(rootCaUrlForMqttHost('abc.iot.ruic.lgthinq.com')).toBe(LG_ROOT_CA_URL);
    expect(rootCaUrlForMqttHost('legacy.example.com')).toBe(LEGACY_ROOT_CA_URL);
  });

  test('strips CSR PEM envelope and line breaks for the LG certificate request body', () => {
    const csr = [
      '-----BEGIN CERTIFICATE REQUEST-----',
      'abc',
      'def',
      '-----END CERTIFICATE REQUEST-----',
    ].join('\n');

    expect(certificateRequestBody(csr)).toBe('abcdef');
  });

  test('builds stable MQTT certificate file paths', () => {
    expect(mqttCertificatePaths('mqtt-dir')).toEqual({
      caPath: Path.join('mqtt-dir', 'ca.pem'),
      keyPath: Path.join('mqtt-dir', 'key.pem'),
      certPath: Path.join('mqtt-dir', 'cert.pem'),
    });
  });

  test('writes files only when content changes', async () => {
    const tempDir = await makeTempDir();
    const filePath = Path.join(tempDir, 'file.pem');

    await writeIfChanged(filePath, 'first');
    const firstStat = await FS.promises.stat(filePath);

    await new Promise(resolve => setTimeout(resolve, 20));
    await writeIfChanged(filePath, 'first');
    const unchangedStat = await FS.promises.stat(filePath);

    await new Promise(resolve => setTimeout(resolve, 20));
    await writeIfChanged(filePath, 'second');

    expect(unchangedStat.mtimeMs).toBe(firstStat.mtimeMs);
    expect(await FS.promises.readFile(filePath, 'utf8')).toBe('second');
  });

  test('writes MQTT certificate files and returns their paths', async () => {
    const mqttDir = await makeTempDir();

    const paths = await writeMqttCertificateFiles({
      mqttDir,
      rootCA: 'root-ca',
      privateKey: 'private-key',
      certificatePem: 'certificate',
    });

    expect(paths).toEqual(mqttCertificatePaths(mqttDir));
    await expect(FS.promises.readFile(paths.caPath, 'utf8')).resolves.toBe('root-ca');
    await expect(FS.promises.readFile(paths.keyPath, 'utf8')).resolves.toBe('private-key');
    await expect(FS.promises.readFile(paths.certPath, 'utf8')).resolves.toBe('certificate');
  });

  test('requests an MQTT certificate with the formatted CSR body', async () => {
    const api = {
      getRequest: jest.fn(async (uri: string) => {
        void uri;
        return undefined;
      }),
      postRequest: jest.fn(async (uri: string, data: any) => {
        void data;
        if (uri === MQTT_CERTIFICATE_PATH) {
          return {
            result: {
              certificatePem: 'certificate',
              subscriptions: ['subscription-a'],
            },
          };
        }

        return { result: {} };
      }),
    };

    const certificate = await requestMqttCertificate(api, [
      '-----BEGIN CERTIFICATE REQUEST-----',
      'abc',
      '-----END CERTIFICATE REQUEST-----',
    ].join('\n'));

    expect(certificate).toEqual({
      certificatePem: 'certificate',
      subscriptions: ['subscription-a'],
    });
    expect(api.postRequest).toHaveBeenNthCalledWith(1, MQTT_CLIENT_PATH, {});
    expect(api.postRequest).toHaveBeenNthCalledWith(2, MQTT_CERTIFICATE_PATH, { csr: 'abc' });
  });

  test('loads MQTT connection setup without opening an MQTT connection', async () => {
    const api = {
      getRequest: jest.fn(async (uri: string) => {
        if (uri === MQTT_ROUTE_URL) {
          return {
            result: {
              mqttServer: 'ssl://abc-ats.iot.us-east-1.amazonaws.com:8883',
            },
          };
        }

        return 'root-ca';
      }),
      postRequest: jest.fn(async (uri: string, data: any) => {
        void uri;
        void data;
        return undefined;
      }),
    };
    const persist = {
      cacheForever: jest.fn(async <T,>(_key: string, producer: () => Promise<T> | T): Promise<T> => {
        return await producer();
      }),
    };
    const logger = {
      debug: jest.fn(),
    };

    const setup = await loadMqttConnectionSetup({
      api,
      persist: persist as any,
      logger,
      createKeys: () => ({ privateKey: 'private-key', publicKey: 'public-key' }),
      createCsr: keys => 'csr-for-' + keys.publicKey,
    });

    expect(setup).toEqual({
      route: {
        mqttServer: 'ssl://abc-ats.iot.us-east-1.amazonaws.com:8883',
      },
      mqttServer: 'ssl://abc-ats.iot.us-east-1.amazonaws.com:8883',
      hostname: 'abc-ats.iot.us-east-1.amazonaws.com',
      keys: {
        privateKey: 'private-key',
        publicKey: 'public-key',
      },
      csr: 'csr-for-public-key',
      rootCA: 'root-ca',
    });
    expect(api.getRequest).toHaveBeenNthCalledWith(1, MQTT_ROUTE_URL);
    expect(api.getRequest).toHaveBeenNthCalledWith(2, ATS_ROOT_CA_URL);
    expect(persist.cacheForever).toHaveBeenCalledWith('keys', expect.any(Function));
    expect(persist.cacheForever).toHaveBeenCalledWith('csr', expect.any(Function));
    expect(logger.debug).toHaveBeenCalledWith('Generating 2048-bit key-pair...');
    expect(logger.debug).toHaveBeenCalledWith('Creating certification request (CSR)...');
  });

  test('prepares MQTT connection data from setup and a fresh certificate request', async () => {
    const mqttDir = await makeTempDir();
    const api = {
      getRequest: jest.fn(async (uri: string) => {
        void uri;
        return undefined;
      }),
      postRequest: jest.fn(async (uri: string, data: any) => {
        void data;
        if (uri === MQTT_CERTIFICATE_PATH) {
          return {
            result: {
              certificatePem: 'certificate',
              subscriptions: ['subscription-a', 'subscription-b'],
            },
          };
        }

        return { result: {} };
      }),
    };
    const setup: MqttConnectionSetup = {
      route: {
        mqttServer: 'ssl://mqtt.example.com:8883',
      },
      mqttServer: 'ssl://mqtt.example.com:8883',
      hostname: 'mqtt.example.com',
      keys: {
        privateKey: 'private-key',
        publicKey: 'public-key',
      },
      csr: 'csr-body',
      rootCA: 'root-ca',
    };

    const connection = await prepareMqttConnection({
      api,
      setup,
      mqttDir,
      clientId: 'client-id',
    });

    expect(connection).toEqual({
      connectData: {
        ...mqttCertificatePaths(mqttDir),
        clientId: 'client-id',
        host: 'mqtt.example.com',
      },
      subscriptions: ['subscription-a', 'subscription-b'],
    });
    await expect(FS.promises.readFile(connection.connectData.caPath, 'utf8')).resolves.toBe('root-ca');
    await expect(FS.promises.readFile(connection.connectData.keyPath, 'utf8')).resolves.toBe('private-key');
    await expect(FS.promises.readFile(connection.connectData.certPath, 'utf8')).resolves.toBe('certificate');
    expect(api.postRequest).toHaveBeenNthCalledWith(1, MQTT_CLIENT_PATH, {});
    expect(api.postRequest).toHaveBeenNthCalledWith(2, MQTT_CERTIFICATE_PATH, { csr: 'csr-body' });
  });

  test('uses the existing MQTT retry defaults', () => {
    expect(MQTT_RETRY_ATTEMPTS).toBe(5);
    expect(MQTT_RETRY_DELAY_MS).toBe(5000);
  });

  test('stops MQTT retry after a successful registration', async () => {
    const register = jest.fn(async () => undefined);
    const logger = {
      debug: jest.fn(),
      error: jest.fn(),
    };
    const delay = jest.fn(async (ms: number) => {
      void ms;
    });

    const result = await retryMqttRegistration({
      register,
      logger,
      delay,
    });

    expect(result).toBe(true);
    expect(register).toHaveBeenCalledTimes(1);
    expect(delay).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  test('retries MQTT registration failures before succeeding', async () => {
    const register = jest.fn(async () => {
      if (register.mock.calls.length < 3) {
        throw new Error('not yet');
      }
    });
    const logger = {
      debug: jest.fn(),
      error: jest.fn(),
    };
    const delay = jest.fn(async (ms: number) => {
      expect(ms).toBe(MQTT_RETRY_DELAY_MS);
    });

    const result = await retryMqttRegistration({
      register,
      logger,
      delay,
    });

    expect(result).toBe(true);
    expect(register).toHaveBeenCalledTimes(3);
    expect(delay).toHaveBeenCalledTimes(2);
    expect(logger.debug).toHaveBeenCalledWith('mqtt err:', expect.any(Error));
    expect(logger.debug).toHaveBeenCalledWith('Cannot start MQTT, retrying in 5s.');
    expect(logger.error).not.toHaveBeenCalled();
  });

  test('logs final MQTT failure after all retry attempts', async () => {
    const register = jest.fn(async () => {
      throw new Error('still down');
    });
    const logger = {
      debug: jest.fn(),
      error: jest.fn(),
    };
    const delay = jest.fn(async (ms: number) => {
      void ms;
    });

    const result = await retryMqttRegistration({
      register,
      logger,
      delay,
      attempts: 2,
    });

    expect(result).toBe(false);
    expect(register).toHaveBeenCalledTimes(2);
    expect(delay).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith('Cannot start MQTT!');
  });
});
