import Persist from './Persist';
import { describe, test, beforeEach, expect, jest } from '@jest/globals';

describe('Persist', () => {
  let persist: Persist;
  const mockDir = './mock-storage';

  beforeEach(async () => {
    persist = new Persist(mockDir);
    await persist.init();
    jest.spyOn(persist['persist'], 'getItem').mockResolvedValue(null);
    jest.spyOn(persist['persist'], 'setItem').mockResolvedValue({file: "",content: {}});
    jest.spyOn(persist['persist'], 'removeItem').mockResolvedValue({file: "", removed: true, existed: true});
  });

  test('should initialize storage', async () => {
    const initSpy = jest.spyOn(persist['persist'], 'init').mockResolvedValue({});
    await persist.init();
    expect(initSpy).toHaveBeenCalled();
  });

  test('should store and retrieve an item', async () => {
    const key = 'testKey';
    const value = 'testValue';

    await persist.setItem(key, value);
    expect(persist['persist'].setItem).toHaveBeenCalledWith(key, value);

    jest.spyOn(persist['persist'], 'getItem').mockResolvedValue(value);
    const retrievedValue = await persist.getItem(key);
    expect(retrievedValue).toBe(value);
  });

  test('should cache a value indefinitely', async () => {
    const key = 'cacheKey';
    const value = 'cachedValue';
    const callable = jest.fn<() => Promise<any>>().mockResolvedValue(value);

    const cachedValue = await persist.cacheForever(key, callable);
    expect(callable).toHaveBeenCalled();
    expect(persist['persist'].setItem).toHaveBeenCalledWith(key, value);
    expect(cachedValue).toBe(value);

    jest.spyOn(persist['persist'], 'getItem').mockResolvedValue(value);
    const retrievedValue = await persist.cacheForever(key, callable);
    expect(callable).toHaveBeenCalledTimes(1); // Callable should not be called again
    expect(retrievedValue).toBe(value);
  });

  test('should cache a value with TTL', async () => {
    const key = 'ttlKey';
    const value = 'ttlValue';
    const ttl = 1000; // 1 second
    const callable = jest.fn<() => Promise<any>>().mockResolvedValue(value);

    const now = Date.now();
    jest.spyOn(global.Date, 'now').mockImplementation(() => now);

    const cachedValue = await persist.cache(key, ttl, callable);
    expect(callable).toHaveBeenCalled();
    expect(persist['persist'].setItem).toHaveBeenCalledWith(
      key,
      JSON.stringify({ value, expiry: now + ttl }),
    );
    expect(cachedValue).toBe(value);

    jest.spyOn(persist['persist'], 'getItem').mockResolvedValue(
      JSON.stringify({ value, expiry: now + ttl }),
    );
    const retrievedValue = await persist.cache(key, ttl, callable);
    expect(callable).toHaveBeenCalledTimes(1); // Callable should not be called again
    expect(retrievedValue).toBe(value);
  });

  test('should return null for expired cached value', async () => {
    const key = 'expiredKey';
    const value = 'expiredValue';
    const ttl = 1000; // 1 second
    const now = Date.now();

    jest.spyOn(global.Date, 'now').mockImplementation(() => now + ttl + 1);
    jest.spyOn(persist['persist'], 'getItem').mockResolvedValue(
      JSON.stringify({ value, expiry: now + ttl }),
    );

    const retrievedValue = await persist.getWithExpiry(key);
    expect(retrievedValue).toBeNull();
    expect(persist['persist'].removeItem).toHaveBeenCalledWith(key);
  });

  test('should store and retrieve an item with expiry', async () => {
    const key = 'expiryKey';
    const value = 'expiryValue';
    const ttl = 1000; // 1 second
    const now = Date.now();

    jest.spyOn(global.Date, 'now').mockImplementation(() => now);
    await persist.setWithExpiry(key, value, ttl);
    expect(persist['persist'].setItem).toHaveBeenCalledWith(
      key,
      JSON.stringify({ value, expiry: now + ttl }),
    );

    jest.spyOn(persist['persist'], 'getItem').mockResolvedValue(
      JSON.stringify({ value, expiry: now + ttl }),
    );
    const retrievedValue = await persist.getWithExpiry(key);
    expect(retrievedValue).toBe(value);
  });
});
