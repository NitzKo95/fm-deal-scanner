import type { MarketIndex } from './market/marketIndex';
import type { PriceBook, Settings } from './lib/types';

/** Everything the pricing logic reads. Passed explicitly so it can be tested without a browser. */
export interface Engine {
  market: MarketIndex;
  book: PriceBook;
  settings: Settings;
  now: () => number;
}
