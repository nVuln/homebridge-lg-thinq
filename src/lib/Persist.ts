import NodePersist from 'node-persist';

/**
 * A utility class for managing persistent storage using `node-persist`.
 * This class provides methods for storing, retrieving, and caching data with optional expiration.
 *
 * @example
 * ```typescript
 * const persist = new Persist('./storage');
 * await persist.init();
 * await persist.setItem('key', 'value');
 * const value = await persist.getItem('key');
 * console.log(value); // Output: 'value'
 * ```
 */
export default class Persist {
  /**
   * The `node-persist` instance used for managing storage.
   */
  protected persist;

  /**
   * Creates a new `Persist` instance.
   *
   * @param dir - The directory where the persistent storage files will be stored.
   */
  constructor(dir: string) {
    this.persist = NodePersist.create({
      dir,
    });
  }

  /**
   * Initializes the persistent storage.
   *
   * @returns A promise that resolves when the storage is initialized.
   */
  async init() {
    return await this.persist.init();
  }

  /**
   * Retrieves an item from storage by its key.
   *
   * @param key - The key of the item to retrieve.
   * @returns A promise that resolves with the value of the item, or `null` if the item does not exist.
   */
  async getItem(key: string) {
    return await this.persist.getItem(key);
  }

  /**
   * Stores an item in storage with the specified key and value.
   *
   * @param key - The key to associate with the item.
   * @param value - The value to store.
   * @returns A promise that resolves when the item is stored.
   */
  async setItem(key: string, value: any) {
    return await this.persist.setItem(key, value);
  }

  /**
   * Caches a value indefinitely. If the value does not exist in storage, it is retrieved using the provided callable function.
   *
   * @param key - The key to associate with the cached value.
   * @param callable - A function that returns a promise resolving to the value to cache.
   * @returns A promise that resolves with the cached value.
   */
  async cacheForever(key: string, callable: () => Promise<any>) {
    let value = await this.getItem(key);
    if (!value) {
      value = await callable();
      await this.setItem(key, value);
    }

    return value;
  }

  /**
   * Caches a value with a time-to-live (TTL). If the value does not exist or is expired, it is retrieved using the provided callable function.
   *
   * @param key - The key to associate with the cached value.
   * @param ttl - The time-to-live for the cached value, in milliseconds.
   * @param callable - A function that returns a promise resolving to the value to cache.
   * @returns A promise that resolves with the cached value.
   */
  async cache(key: string, ttl: number, callable: () => Promise<any>) {
    let value = await this.getWithExpiry(key);
    if (!value) {
      value = await callable();
      await this.setWithExpiry(key, value, ttl);
    }

    return value;
  }

  /**
   * Stores an item in storage with an expiration time.
   *
   * @param key - The key to associate with the item.
   * @param value - The value to store.
   * @param ttl - The time-to-live for the item, in milliseconds.
   * @returns A promise that resolves when the item is stored.
   */
  async setWithExpiry(key: string, value: any, ttl: number) {

    // `item` is an object which contains the original value
    // as well as the time when it's supposed to expire
    const item = {
      value: value,
      expiry: Date.now() + ttl,
    };

    await this.persist.setItem(key, JSON.stringify(item));
  }

  /**
   * Retrieves an item from storage by its key, considering its expiration time.
   *
   * @param key - The key of the item to retrieve.
   * @returns A promise that resolves with the value of the item, or `null` if the item does not exist or is expired.
   */
  async getWithExpiry(key: string) {
    const itemStr = await this.persist.getItem(key);

    // if the item doesn't exist, return null
    if (!itemStr) {
      return null;
    }

    const item = JSON.parse(itemStr);

    // compare the expiry time of the item with the current time
    if (Date.now() > item.expiry) {
      // If the item is expired, delete the item from storage
      // and return null
      await this.persist.removeItem(key);
      return null;
    }

    return item.value;
  }
}
