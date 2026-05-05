import { describe, expect, jest, test } from '@jest/globals';
import {
  MQTT_OFFLINE_RECONNECT_DELAY_MS,
  MqttRuntimeDevice,
  wireMqttDeviceEvents,
} from './mqttConnection.js';

type HandlerMap = {
  error?: (err: unknown) => void;
  connect?: () => void;
  message?: (topic: string, payload: Buffer) => void;
  offline?: () => void;
};

class FakeMqttDevice implements MqttRuntimeDevice {
  public handlers: HandlerMap = {};
  public subscribe = jest.fn();
  public end = jest.fn();

  on(event: keyof HandlerMap, handler: any): unknown {
    this.handlers[event] = handler;
    return this;
  }
}

function fakeLogger() {
  return {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  };
}

describe('MQTT runtime event wiring', () => {
  test('subscribes to all topics on connect', () => {
    const device = new FakeMqttDevice();
    const logger = fakeLogger();

    wireMqttDeviceEvents({
      device,
      logger,
      mqttServer: 'mqtt://server',
      subscriptions: ['topic-a', 'topic-b'],
      onMessage: jest.fn(),
      reconnect: jest.fn(async () => undefined),
    });

    device.handlers.connect?.();

    expect(logger.info).toHaveBeenCalledWith('Successfully connected to the MQTT server.');
    expect(logger.debug).toHaveBeenCalledWith('mqtt connected:', 'mqtt://server');
    expect(device.subscribe).toHaveBeenNthCalledWith(1, 'topic-a');
    expect(device.subscribe).toHaveBeenNthCalledWith(2, 'topic-b');
  });

  test('logs MQTT runtime errors', () => {
    const device = new FakeMqttDevice();
    const logger = fakeLogger();
    const error = new Error('mqtt down');

    wireMqttDeviceEvents({
      device,
      logger,
      mqttServer: 'mqtt://server',
      subscriptions: [],
      onMessage: jest.fn(),
      reconnect: jest.fn(async () => undefined),
    });

    device.handlers.error?.(error);

    expect(logger.error).toHaveBeenCalledWith('mqtt err:', error);
  });

  test('parses JSON messages and logs the raw payload', () => {
    const device = new FakeMqttDevice();
    const logger = fakeLogger();
    const onMessage = jest.fn();

    wireMqttDeviceEvents({
      device,
      logger,
      mqttServer: 'mqtt://server',
      subscriptions: [],
      onMessage,
      reconnect: jest.fn(async () => undefined),
    });

    device.handlers.message?.('topic-a', Buffer.from('{"state":"on"}'));

    expect(onMessage).toHaveBeenCalledWith({ state: 'on' });
    expect(logger.debug).toHaveBeenCalledWith('mqtt message received:', '{"state":"on"}');
  });

  test('logs invalid JSON messages without emitting an update', () => {
    const device = new FakeMqttDevice();
    const logger = fakeLogger();
    const onMessage = jest.fn();

    wireMqttDeviceEvents({
      device,
      logger,
      mqttServer: 'mqtt://server',
      subscriptions: [],
      onMessage,
      reconnect: jest.fn(async () => undefined),
    });

    device.handlers.message?.('topic-a', Buffer.from('not-json'));

    expect(onMessage).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith('mqtt message parse error:', expect.any(SyntaxError));
    expect(logger.debug).toHaveBeenCalledWith('mqtt invalid message received:', 'not-json');
  });

  test('ends offline devices and schedules reconnect', () => {
    const device = new FakeMqttDevice();
    const logger = fakeLogger();
    const reconnect = jest.fn(async () => undefined);
    const scheduleReconnect = jest.fn((handler: () => void | Promise<void>, delayMs: number) => {
      void handler;
      void delayMs;
    });

    wireMqttDeviceEvents({
      device,
      logger,
      mqttServer: 'mqtt://server',
      subscriptions: [],
      onMessage: jest.fn(),
      reconnect,
      scheduleReconnect,
    });

    device.handlers.offline?.();

    expect(device.end).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith('MQTT disconnected, retrying in 60 seconds!');
    expect(scheduleReconnect).toHaveBeenCalledWith(expect.any(Function), MQTT_OFFLINE_RECONNECT_DELAY_MS);
  });

  test('scheduled offline reconnect calls the supplied reconnect function', async () => {
    const device = new FakeMqttDevice();
    const logger = fakeLogger();
    const reconnect = jest.fn(async () => undefined);
    let scheduledHandler: (() => void | Promise<void>) | undefined;
    const scheduleReconnect = jest.fn((handler: () => void | Promise<void>) => {
      scheduledHandler = handler;
    });

    wireMqttDeviceEvents({
      device,
      logger,
      mqttServer: 'mqtt://server',
      subscriptions: [],
      onMessage: jest.fn(),
      reconnect,
      scheduleReconnect,
    });

    device.handlers.offline?.();
    await scheduledHandler?.();

    expect(reconnect).toHaveBeenCalledTimes(1);
  });

  test('logs scheduled offline reconnect failures', async () => {
    const device = new FakeMqttDevice();
    const logger = fakeLogger();
    const reconnectError = new Error('still offline');
    const reconnect = jest.fn(async () => {
      throw reconnectError;
    });
    let scheduledHandler: (() => void | Promise<void>) | undefined;
    const scheduleReconnect = jest.fn((handler: () => void | Promise<void>) => {
      scheduledHandler = handler;
    });

    wireMqttDeviceEvents({
      device,
      logger,
      mqttServer: 'mqtt://server',
      subscriptions: [],
      onMessage: jest.fn(),
      reconnect,
      scheduleReconnect,
    });

    device.handlers.offline?.();
    await scheduledHandler?.();
    await Promise.resolve();

    expect(logger.error).toHaveBeenCalledWith('mqtt reconnect failed:', reconnectError);
  });
});
