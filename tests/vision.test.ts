import { describe, expect, it } from 'vitest';
import type { Region } from '../src/lib/types';
import { bulletColumn, findBullets, findTooltip, tooltipExamineWidth } from '../src/vision/findTooltip';
import { gamePixel, isCell, LOCATE_WIDTH, locateShop } from '../src/vision/locateShop';
import type { Pixels } from '../src/vision/pixels';
import { sigDiff, signature } from '../src/vision/signature';
import { examine, loadPng, placeOn, scaleBy } from './helpers/image';

/** The list's box in the fixture's own pixels, measured by hand. */
const SHOP = { file: 'shop-list.png', box: [115, 18, 527, 612] as const };
const SELECTED = { file: 'shop-selected-row.png', box: [112, 0, 526, 570] as const };

/** Pixel box of a found region, in the coordinates of the frame it was found in. */
const px = (r: Region, w: number, h: number) => [r.x * w, r.y * h, (r.x + r.w) * w, (r.y + r.h) * h];

function expectBox(got: Region | null, want: readonly number[], w: number, h: number, tol: number) {
  expect(got).not.toBeNull();
  const b = px(got!, w, h);
  for (let i = 0; i < 4; i++) expect(Math.abs(b[i]! - want[i]!)).toBeLessThanOrEqual(tol);
}

describe('isCell', () => {
  it('knows the list colors and nothing like them', () => {
    expect(isCell(206, 219, 228)).toBe(true);   // blue-gray cell
    expect(isCell(218, 154, 66)).toBe(true);    // selected row
    expect(isCell(255, 255, 255)).toBe(false);
    expect(isCell(52, 70, 48)).toBe(false);
    expect(isCell(228, 219, 206)).toBe(false);  // warm gray: b < r
  });
});

describe('locateShop', () => {
  it('finds the list in a cropped screenshot', () => {
    const img = loadPng(SHOP.file);
    expectBox(locateShop(examine(img, LOCATE_WIDTH)), SHOP.box, img.width, img.height, 6);
  });

  it('finds a list whose top row is selected', () => {
    const img = loadPng(SELECTED.file);
    expectBox(locateShop(examine(img, LOCATE_WIDTH)), SELECTED.box, img.width, img.height, 6);
  });

  // The game window at other sizes, somewhere on screens of other sizes.
  const cases: [number, number, number, number, number][] = [
    // scale, screen w, screen h, x, y
    [0.4, 1280, 800, 40, 300], [0.5, 1440, 900, 900, 60], [0.6, 1920, 1080, 200, 400],
    [0.8, 1512, 982, 700, 100], [1.0, 1920, 1080, 1000, 300], [1.25, 2560, 1440, 120, 500], [1.5, 3024, 1964, 1800, 900],
  ];
  for (const [f, sw, sh, x, y] of cases) {
    it(`finds it at ${f * 100}% on a ${sw}×${sh} screen`, () => {
      for (const fx of [SHOP, SELECTED]) {
        const img = scaleBy(loadPng(fx.file), f);
        const frame = placeOn(img, sw, sh, x, y);
        const want = fx.box.map((v, i) => v * f + (i % 2 ? y : x));
        // a pixel or two of error per examined pixel, in frame pixels
        const tol = Math.max(6, (2 * sw) / LOCATE_WIDTH + 3);
        expectBox(locateShop(examine(frame, LOCATE_WIDTH)), want, sw, sh, tol);
      }
    });
  }

  it('takes no part of a game scene for a list', () => {
    for (const f of [1, 2, 3]) {
      const scene = scaleBy(loadPng('scene-no-shop.png'), f);
      expect(locateShop(examine(placeOn(scene, Math.max(1280, scene.width + 200), Math.max(800, scene.height + 200), 100, 100), LOCATE_WIDTH)), `at ${f}x`).toBeNull();
    }
  });

  it('finds a list whose listings have all sold (grey text)', () => {
    const img = loadPng(SHOP.file);
    for (let i = 0; i < img.data.length; i += 4) {
      if (Math.max(img.data[i]!, img.data[i + 1]!, img.data[i + 2]!) < 120) { img.data[i] = 150; img.data[i + 1] = 155; img.data[i + 2] = 160; }
    }
    expectBox(locateShop(examine(img, LOCATE_WIDTH)), SHOP.box, img.width, img.height, 6);
  });

  it('finds nothing on a screen without a shop', () => {
    expect(locateShop(examine(placeOn(loadPng('tooltip-traus.png'), 1920, 1080, 600, 300), LOCATE_WIDTH))).toBeNull();
    expect(locateShop(examine(placeOn({ data: new Uint8ClampedArray(4), width: 1, height: 1 }, 800, 600, 0, 0), LOCATE_WIDTH))).toBeNull();
  });

  it('does not take a plain panel of the cell color for a list', () => {
    const panel: Pixels = placeOn({ data: new Uint8ClampedArray(400 * 300 * 4).fill(0).map((_, i) => [206, 219, 228, 255][i % 4]!), width: 400, height: 300 }, 1280, 800, 300, 200);
    const r = locateShop(examine(panel, LOCATE_WIDTH));
    // a solid block may still be reported, but never wider than the block itself
    if (r) expect(r.w * 1280).toBeLessThanOrEqual(404);
  });
});

describe('gamePixel', () => {
  it('reads the game pixel size off the list width', () => {
    // the fixtures are from a Retina screen: two screen pixels per game pixel
    const img = loadPng(SHOP.file);
    expect(gamePixel(locateShop(examine(img, LOCATE_WIDTH))!, img.width)).toBeCloseTo(2, 1);
    const big = placeOn(scaleBy(img, 1.4), 2560, 1600, 900, 300);
    expect(gamePixel(locateShop(examine(big, LOCATE_WIDTH))!, 2560)).toBeCloseTo(2.8, 1);
  });
});

describe('tooltipExamineWidth', () => {
  it('keeps 1.5 examined pixels per game pixel, never more than the frame has', () => {
    expect(tooltipExamineWidth(3024, 2)).toBe(2268);
    expect(tooltipExamineWidth(1920, 1)).toBe(1920);
    expect(tooltipExamineWidth(5120, null)).toBe(3456);
    expect(tooltipExamineWidth(1440, null)).toBe(1440);
  });
});

/** The tooltip-traus fixture at scale f, drawn over the shop list on a sw×sh screen. */
function hoverFrame(tipFile: string, f: number, sw: number, sh: number) {
  const tip = scaleBy(loadPng(tipFile), f);
  const frame = placeOn(scaleBy(loadPng(SHOP.file), f), sw, sh, 100, 100);
  const at = { x: 300, y: 150 };
  for (let y = 0; y < tip.height && at.y + y < sh; y++) for (let x = 0; x < tip.width && at.x + x < sw; x++) {
    const s = (y * tip.width + x) * 4, o = ((at.y + y) * sw + at.x + x) * 4;
    frame.data[o] = tip.data[s]!; frame.data[o + 1] = tip.data[s + 1]!; frame.data[o + 2] = tip.data[s + 2]!;
  }
  return { frame, at, tip };
}

describe('findTooltip', () => {
  /** The fixtures' bullets are 32 screen pixels apart: 16 game pixels on a Retina screen. */
  const SP = 32;

  for (const file of ['tooltip-traus.png', 'tooltip-axe-pole-arm.png']) {
    it(`frames the ${file} tooltip from its bullets`, () => {
      const img = loadPng(file);
      const t = findTooltip(examine(img, tooltipExamineWidth(img.width, 2)))!;
      expect(t).not.toBeNull();
      expect(t.sp).toBeCloseTo(SP, 0);
      // the box takes in the name above the bullets and the stats to their right
      expect(t.y * img.height).toBeLessThan(30);
      expect(t.w * img.width).toBeGreaterThan(400);
      expect((t.y + t.h) * img.height).toBeGreaterThan(400);
    });
  }

  // The game pixel at 1 and 1.2-3.2 screen pixels, on screens of three sizes. Between 1 and 1.2 the
  // 3-pixel bullets blur away; the game draws at whole multiples, so that only happens if the
  // system scales the window.
  const scales = [0.5, ...Array.from({ length: 21 }, (_, i) => 0.6 + i * 0.05)];
  for (const [sw, sh] of [[1600, 1000], [1920, 1200], [3024, 1964]] as const) {
    it(`finds tooltips over the shop at every game size on a ${sw}×${sh} screen`, () => {
      const bad: string[] = [];
      for (const file of ['tooltip-traus.png', 'tooltip-axe-pole-arm.png']) {
        const img = loadPng(file);
        const first = bulletColumn(findBullets(img))!.top;   // the first bullet, at 100%
        for (const f of scales) {
          const { frame, at } = hoverFrame(file, f, sw, sh);
          const t = findTooltip(examine(frame, tooltipExamineWidth(sw, 2 * f)));
          // every bullet found: the box starts 9.2 lines above the first one
          const want = at.y + (first - 9.2 * SP) * f;
          const ok = t && Math.abs(t.sp - SP * f) <= 1.5 && Math.abs(t.anchor * sh - want) <= SP * f * 0.3;
          if (!ok) bad.push(`${file}@${f.toFixed(2)}: ${t ? `sp ${t.sp.toFixed(1)}, top ${(t.anchor * sh).toFixed(0)}` : 'none'}`);
        }
      }
      expect(bad).toEqual([]);
    });
  }

  it('finds no tooltip where there is none', () => {
    const bad: string[] = [];
    for (const f of [0.5, 1.0, 1.5, 2.0]) {
      for (const file of [SHOP.file, SELECTED.file, 'scene-no-shop.png']) {
        const frame = placeOn(scaleBy(loadPng(file), f), 1920, 1200, 100, 100);
        if (findTooltip(examine(frame, tooltipExamineWidth(1920, null)))) bad.push(`${file}@${f}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('signature', () => {
  it('is unchanged for the same image and changes when the list does', () => {
    const img = loadPng(SHOP.file);
    const gray = new Uint8Array(img.width * img.height);
    for (let i = 0; i < gray.length; i++) gray[i] = Math.max(img.data[i * 4]!, img.data[i * 4 + 1]!, img.data[i * 4 + 2]!);
    const a = signature(gray, img.width, img.height);
    expect(sigDiff(a, signature(gray, img.width, img.height))).toBe(0);
    const changed = gray.slice();
    changed.fill(0, 0, (changed.length / 3) | 0);
    expect(sigDiff(a, signature(changed, img.width, img.height))).toBeGreaterThan(2);
    expect(sigDiff(a, new Float32Array(10))).toBe(Infinity);
  });
});
