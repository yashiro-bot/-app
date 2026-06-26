import { describe, it, expect } from 'vitest';
import { haversineDistance } from '../../src/lib/geo';

describe('haversineDistance', () => {
  it('same point returns 0', () => {
    expect(haversineDistance(31.2304, 121.4737, 31.2304, 121.4737)).toBe(0);
  });
  it('Beijing to Shanghai ~1067km', () => {
    const d = haversineDistance(39.9042, 116.4074, 31.2304, 121.4737);
    expect(d).toBeGreaterThan(1050000);
    expect(d).toBeLessThan(1080000);
  });
  it('NaN input returns NaN', () => {
    expect(Number.isNaN(haversineDistance(NaN, 0, 0, 0))).toBe(true);
  });
});
