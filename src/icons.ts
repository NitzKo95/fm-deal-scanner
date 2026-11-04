import type { MarketItem } from './lib/types';

/**
 * Item icons come from maplestory.io's MapleStory Classic World data (region "MCW"), by item id.
 * Its ids and names match the tracker's: 1302012 is Traus there too, while the usual GMS data calls
 * it Red Katana. Nothing is bundled; the browser caches each image.
 */
export const ICON_REGION = 'MCW';
export const ICON_VERSION = '1';

/** "basil:02040803" -> 2040803 */
export function itemNumber(id: string): number | null {
  const n = parseInt(id.split(':').pop() ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function iconUrl(mk: MarketItem | null): string | null {
  const n = mk ? itemNumber(mk.id) : null;
  return n == null ? null : `https://maplestory.io/api/${ICON_REGION}/${ICON_VERSION}/item/${n}/icon`;
}
