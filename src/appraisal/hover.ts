import type { TooltipRead } from '../lib/types';
import type { FrameAdapter, Ocr } from '../scan/scanner';
import { parseTooltip, type ResolveName } from '../tooltip/parseTooltip';
import { thumbSignature, tooltipGray, tooltipScale, toRect } from '../vision/preprocess';
import { findTooltipBoxes, hoveredBox, TOOLTIP_BOX_WIDTH, type TipBox } from '../vision/tooltipBox';
import { textSpacing } from '../vision/tooltipText';

/** What is taken from one frame of a hover: the tooltip of the item the mouse is on, ready to read. */
export interface HoverCrop<I> { image: I; sig: Float32Array; box: TipBox }

/**
 * The quick part, like the shop's: finds the hovered tooltip and copies it, enlarged to suit the reader.
 * Synchronous, so the frame can be let go before the slow reading starts. Null when no tooltip is showing.
 */
export function prepareHover<F, I>(adapter: FrameAdapter<F, I>, frame: F): HoverCrop<I> | null {
  const { w: fw, h: fh } = adapter.size(frame);
  const box = hoveredBox(findTooltipBoxes(adapter.examine(frame, TOOLTIP_BOX_WIDTH)));
  if (!box) return null;
  const rect = toRect(box, fw, fh);
  if (rect.sw < 40 || rect.sh < 40) return null;
  const spacing = textSpacing(adapter.crop(frame, rect, 1));
  const px = adapter.crop(frame, rect, tooltipScale(spacing ?? 21));
  tooltipGray(px);
  return { image: adapter.toImage(px), sig: thumbSignature(px), box };
}

/** The slow part: reads the copy and makes sense of it. Null when it isn't an item tooltip. */
export async function readHover<I>(ocr: Ocr<I>, crop: HoverCrop<I>, resolve: ResolveName): Promise<{ tip: TooltipRead | null; lines: string[] }> {
  const lines = await ocr.recognize(crop.image);
  return { tip: parseTooltip(lines, resolve, { bare: true }), lines: lines.map((l) => l.text.trim()).filter(Boolean) };
}
