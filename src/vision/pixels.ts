/** RGBA pixels, row major: the shape of canvas ImageData, so tests can build it without a canvas. */
export interface Pixels { readonly data: Uint8ClampedArray | Uint8Array; readonly width: number; readonly height: number }

/** A detection in a frame of size fw x fh that was examined downscaled by `scale`. */
export interface Scaled { px: Pixels; scale: number; fw: number; fh: number }
