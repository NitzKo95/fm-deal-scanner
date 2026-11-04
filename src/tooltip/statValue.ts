import type { StatValue, TooltipRead } from '../lib/types';

/** Upgrade slots an item starts with, by its type. The most ever seen for that item wins if higher. */
const SLOT_TYPES: readonly [RegExp, number][] = [
  [/overall/i, 10],
  [/glove|shoe|cape|earring/i, 5],
  [/sword|axe|blunt|mace|polearm|spear|bow|claw|dagger|wand|staff|knuckle|gun|shield|hat|helm|top|bottom/i, 7],
];

export const slotsForType = (type: string): number => SLOT_TYPES.find(([re]) => re.test(type))?.[1] ?? 0;

/** A copy is known by its stats: hovering the same copy again reads the same. */
export const statSig = (t: TooltipRead): string => t.stats.map((x) => `${x.label}:${x.total}/${x.base}`).join(';') + `|${t.remaining ?? ''}`;

/**
 * What the stats do to the value: each point above or below base moves it by `statPct` %, and each
 * used upgrade slot costs `slotWorth` points, since a clean item can still be scrolled.
 * The tracker has no prices by stats, so this is a rule of thumb the settings tune.
 */
export function statValue(t: TooltipRead, opts: { statPct: number; slotWorth: number; maxSlotsSeen?: number }): StatValue {
  const maxSlots = Math.max(slotsForType(t.type), opts.maxSlotsSeen ?? 0, t.remaining ?? 0);
  const used = t.remaining != null && maxSlots ? Math.max(0, maxSlots - t.remaining) : 0;
  const points = t.stats.reduce((a, x) => a + x.delta * x.weight, 0);
  const eff = points - used * opts.slotWorth;
  const mult = Math.max(0.25, Math.min(3, 1 + (eff * opts.statPct) / 100));
  const moved = t.stats.filter((x) => x.delta).sort((a, b) => b.weight - a.weight);
  const parts = moved.slice(0, 3).map((x) => `${x.delta > 0 ? '+' : '−'}${Math.abs(x.delta)} ${x.label}`);
  const slots = t.remaining == null ? '' : used ? `${used} of ${maxSlots} slots used` : `${t.remaining} slots left`;
  const summary = [parts.length ? parts.join(', ') : 'average stats', slots].filter(Boolean).join(', ');
  return { mult, summary, points, used };
}
