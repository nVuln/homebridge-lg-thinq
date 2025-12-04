import NodePersist from 'node-persist';
import Fs from 'fs/promises';
import Path from 'path';
import Crypto from 'crypto';

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
  protected persist: any | null = null;
  protected dir: string;

  /**
   * Creates a new `Persist` instance.
   *
   * @param dir - The directory where the persistent storage files will be stored.
   */
  constructor(dir: string) {
    this.dir = Path.resolve(dir || '.');
  }

  /**
   * Generates a SHA-256 hash of the given input string.
   *
   * @param input - The input string to hash.
   * @returns The SHA-256 hash of the input string.
   */
  protected sha256(input: string) {
    return Crypto.createHash('sha256').update(input).digest('hex');
  }

  /**
   * Detect and migrate legacy plain JSON files in the storage directory.
   * Legacy files are assumed to be named by the original key (not sha256(key))
   * and contain raw JSON for the value. Migrated files are written as
   * JSON datum { key, value, ttl } into filename sha256(key).
   */
  protected async migrateLegacyFiles() {
    try {
      await Fs.mkdir(this.dir, { recursive: true });
      const backupDir = Path.resolve(this.dir, '..', '_backups');
      await Fs.mkdir(backupDir, { recursive: true });
      const files = await Fs.readdir(this.dir).catch(() => [] as string[]);
      for (const f of files) {
        if (!f || f.startsWith('.')) {
          continue;
        }
        const p = Path.join(this.dir, f);
        const stat = await Fs.stat(p).catch(() => null);
        if (!stat || !stat.isFile()) {
          continue;
        }
        if (/^[a-f0-9]{64}$/.test(f)) {
          continue;
        }
        try {
          const raw = await Fs.readFile(p, { encoding: 'utf8' });
          const parsed = JSON.parse(raw);
          const key = parsed && typeof parsed === 'object' && parsed.key ? parsed.key : f;
          const datum = { key, value: parsed && parsed.key ? parsed.value ?? parsed : parsed, ttl: undefined };
          const target = Path.join(this.dir, this.sha256(key));
          await Fs.writeFile(target, JSON.stringify(datum), { encoding: 'utf8' }).catch(() => {});
          const dest = Path.join(backupDir, `${f}.migrated.${Date.now()}`);
          await Fs.rename(p, dest).catch(async () => {
            await Fs.copyFile(p, dest).catch(() => {});
            await Fs.unlink(p).catch(() => {});
          });
        } catch (e) {
          const dest = Path.join(backupDir, `${f}.corrupt.${Date.now()}`);
          await Fs.rename(p, dest).catch(async () => {
            await Fs.copyFile(p, dest).catch(() => {});
            await Fs.unlink(p).catch(() => {});
          });
        }
      }
    } catch (err) {
      // ignore migration errors
    }
  }

  /**
   * Initializes the persistent storage.
   *
   * @returns A promise that resolves when the storage is initialized.
   */
  async init() {
    await this.migrateLegacyFiles();
    this.persist = this.persist || NodePersist.create({ dir: this.dir });
    const backupDir = Path.resolve(this.dir, '..', '_backups');
    try {
      const res = await this.persist.init();
      await Fs.rm(backupDir, { recursive: true, force: true }).catch(() => {});
      return res;
    } catch (err) {
      try {
        await this.migrateLegacyFiles();
      } catch {
        // ignore migration errors
      }
      const res2 = await this.persist.init();
      await Fs.rm(backupDir, { recursive: true, force: true }).catch(() => {});
      return res2;
    }
  }

  /**
   * Retrieves an item from storage by its key.
   *
   * @param key - The key of the item to retrieve.
   * @returns A promise that resolves with the value of the item, or `null` if the item does not exist.
   */
  async getItem(key: string) {
    if (!this.persist) {
      await this.init();
    }
    try {
      return await this.persist.getItem(key);
    } catch (err) {
      try {
        const p = Path.join(this.dir, key);
        const raw = await Fs.readFile(p, { encoding: 'utf8' });
        const parsed = JSON.parse(raw);
        await this.persist.setItem(key, parsed).catch(() => {});
        await Fs.rename(p, p + '.migrated.' + Date.now()).catch(() => {});
        return parsed;
      } catch (e) {
        return null;
      }
    }
  }

  /**
   * Stores an item in storage with the specified key and value.
   *
   * @param key - The key to associate with the item.
   * @param value - The value to store.
   * @returns A promise that resolves when the item is stored.
   */
  async setItem(key: string, value: any) {
    if (!this.persist) {
      await this.init();
    }
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
    const item = {
      value: value,
      expiry: Date.now() + ttl,
    };
    await this.setItem(key, JSON.stringify(item));
  }

  /**
   * Retrieves an item from storage by its key, considering its expiration time.
   *
   * @param key - The key of the item to retrieve.
   * @returns A promise that resolves with the value of the item, or `null` if the item does not exist or is expired.
   */
  async getWithExpiry(key: string) {
    const itemStr = await this.getItem(key);
    if (!itemStr) {
      return null;
    }
    try {
      const item = JSON.parse(itemStr);
      if (Date.now() > item.expiry) {
        await this.removeItem(key);
        return null;
      }
      return item.value;
    } catch (e) {
      return null;
    }
  }

  /**
   * Removes an item from storage by its key.
   *
   * @param key - The key of the item to remove.
   * @returns A promise that resolves when the item is removed.
   */
  async removeItem(key: string) {
    if (!this.persist) {
      await this.init();
    }
    try {
      return await this.persist.removeItem(key);
    } catch (err) {
      const p = Path.join(this.dir, key);
      await Fs.unlink(p).catch(() => {});
    }
  }
}
