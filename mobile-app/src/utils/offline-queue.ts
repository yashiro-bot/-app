import { storage } from './storage';
import { uuid } from './uuid';

export interface PendingRecord {
  clientUuid: string;
  customerId: number;
  gpsLat: number;
  gpsLng: number;
  gpsAccuracy: number;
  photoUrls: string[];
  collectedAt: string;
  details: Array<{
    cigarSpecId: number;
    salesQty: number;
    actualStockLoose: number;
    countedStockLoose: number;
    actualStockBoxed: number;
    countedStockBoxed: number;
  }>;
  enqueuedAt: string;
}

const PREFIX = 'pending:';

function key(clientUuid: string): string {
  return PREFIX + clientUuid;
}

export const OfflineQueue = {
  enqueue(record: Omit<PendingRecord, 'clientUuid' | 'enqueuedAt'>): string {
    const clientUuid = uuid();
    const full: PendingRecord = { ...record, clientUuid, enqueuedAt: new Date().toISOString() };
    storage.set(key(clientUuid), full);
    return clientUuid;
  },

  getAll(): PendingRecord[] {
    const info = storage.info();
    const fullPrefix = 'cigar:' + PREFIX;
    return info.keys
      .filter((k) => k.startsWith(fullPrefix))
      .map((k) => storage.get<PendingRecord>(k.replace('cigar:', '')))
      .filter((r): r is PendingRecord => r !== null);
  },

  remove(clientUuid: string): void {
    storage.remove(key(clientUuid));
  },

  size(): number {
    return this.getAll().length;
  },

  info(): { count: number; bytes: number; limit: number } {
    const info = storage.info();
    const fullPrefix = 'cigar:' + PREFIX;
    const count = info.keys.filter((k) => k.startsWith(fullPrefix)).length;
    return { count, bytes: info.currentSize, limit: info.limitSize };
  },
};
