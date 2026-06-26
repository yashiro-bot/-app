const PREFIX = 'cigar:';

export const storage = {
  set<T>(key: string, value: T): void {
    uni.setStorageSync(PREFIX + key, value);
  },
  get<T>(key: string): T | null {
    const v = uni.getStorageSync(PREFIX + key);
    return (v === '' || v === null || v === undefined) ? null : (v as T);
  },
  remove(key: string): void {
    uni.removeStorageSync(PREFIX + key);
  },
  info(): { keys: string[]; currentSize: number; limitSize: number } {
    return uni.getStorageInfoSync();
  },
};
