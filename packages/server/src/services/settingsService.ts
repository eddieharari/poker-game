import { redis } from '../redis.js';

const SETTINGS_KEY = 'settings:house';

export interface HouseSettings {
  feePercent: number;   // default 5
  feeCap: number;       // 0 = no cap
  housePlayerId: string; // Supabase player ID to receive fees
}

const DEFAULTS: HouseSettings = { feePercent: 5, feeCap: 0, housePlayerId: '' };

export const settingsService = {
  async get(): Promise<HouseSettings> {
    const raw = await redis.get(SETTINGS_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  },
  async save(s: Partial<HouseSettings>): Promise<void> {
    const current = await this.get();
    await redis.set(SETTINGS_KEY, JSON.stringify({ ...current, ...s }));
  },
};

export function calculateHouseFee(pot: number, settings: HouseSettings): number {
  if (settings.feePercent <= 0) return 0;
  const fee = Math.floor(pot * settings.feePercent / 100);
  return settings.feeCap > 0 ? Math.min(fee, settings.feeCap) : fee;
}
