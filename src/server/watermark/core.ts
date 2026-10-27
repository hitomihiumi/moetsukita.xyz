/**
 * Invisible watermark: a 48-bit id hidden in the luminance of an image.
 *
 * Each 8×8 block carries one bit in its two lowest AC DCT coefficients,
 * set by quantisation index modulation (QIM). Only blocks with texture of
 * their own are marked (flat colour would show the change); texture is the
 * block's energy outside those two coefficients, which marking leaves alone,
 * so extraction can find the same blocks again. Blocks are grouped into cells by
 * their position modulo a TILE×TILE tile; each cell repeats one payload bit,
 * XORed with a key bit derived from the secret, so a large image repeats every
 * bit hundreds of times. A CRC-32 tells a real payload from noise: the search
 * below makes ~16k attempts, so a 16-bit check would hit noise far too often.
 *
 * Extraction sums soft decisions per cell for every pixel offset (0..7, 0..7)
 * and every tile phase, which undoes crops; the caller undoes scaling by
 * resizing the suspect image back to the original size first.
 */
import { createHmac } from "node:crypto";
import { crc32 } from "node:zlib";

const BLOCK = 8;
const TILE = 16; // cells per tile side: 256 cells for 64 payload bits
const PAYLOAD_BITS = 80; // 48-bit id + 32-bit CRC
const ID_BITS = 48;
/**
 * Quantisation step, with the texture threshold below. Tuned on real art at
 * 3000 px: PSNR ≈ 50 dB, no visible change at 2× zoom, and the id survives
 * JPEG 70, WebP 85, a 50% downscale and crops. Small images (≈1000 px) lose
 * it under a 50% downscale: too few textured blocks.
 */
const STEP = 36;
/** Blocks below this energy (sum of squares, outside the marked coefficients) stay untouched. */
const TEXTURE_MIN = 64 * 3 * 3; // a standard deviation of 3 levels
/** Extraction is laxer: recompression smooths texture, and extra blocks only add noise. */
const TEXTURE_MIN_EXTRACT = TEXTURE_MIN / 2;
const COEFFICIENTS: [number, number][] = [
  [0, 1],
  [1, 0],
];

// Orthonormal 8×8 DCT basis for the chosen coefficients, as 64-entry tables.
const basis = COEFFICIENTS.map(([u, v]) => {
  const table = new Float64Array(BLOCK * BLOCK);
  const cu = u === 0 ? Math.SQRT1_2 : 1;
  const cv = v === 0 ? Math.SQRT1_2 : 1;
  for (let y = 0; y < BLOCK; y++) {
    for (let x = 0; x < BLOCK; x++) {
      table[y * BLOCK + x] =
        (2 / BLOCK) *
        cu *
        cv *
        Math.cos(((2 * x + 1) * u * Math.PI) / (2 * BLOCK)) *
        Math.cos(((2 * y + 1) * v * Math.PI) / (2 * BLOCK));
    }
  }
  return table;
});

export type RawImage = {
  data: Uint8Array | Buffer;
  width: number;
  height: number;
  channels: number;
};

function checksum(id: bigint) {
  const bytes = Buffer.alloc(6);
  bytes.writeUIntBE(Number(id), 0, 6);
  return crc32(bytes);
}

function payloadBits(id: bigint) {
  const bits: number[] = [];
  for (let i = ID_BITS - 1; i >= 0; i--) bits.push(Number((id >> BigInt(i)) & 1n));
  const crc = checksum(id);
  for (let i = 31; i >= 0; i--) bits.push((crc >>> i) & 1);
  return bits;
}

function bitsToId(bits: number[]) {
  const id = bits.slice(0, ID_BITS).reduce((value, bit) => (value << 1n) | BigInt(bit), 0n);
  const crc = bits.slice(ID_BITS).reduce((value, bit) => value * 2 + bit, 0);
  return checksum(id) === crc ? id : null;
}

/** Which payload bit each cell carries, and the key bit it is XORed with. */
function cellLayout(secret: string) {
  const stream = createHmac("sha256", secret).update("watermark-layout-v1").digest();
  const random = (() => {
    let counter = 0;
    let pool = stream;
    let offset = 0;
    return () => {
      if (offset + 4 > pool.length) {
        pool = createHmac("sha256", secret).update(`watermark-layout-v1:${++counter}`).digest();
        offset = 0;
      }
      const value = pool.readUInt32BE(offset);
      offset += 4;
      return value;
    };
  })();
  // Every bit gets the same number of cells, shuffled.
  const cells = TILE * TILE;
  const bitOf = Array.from({ length: cells }, (_, index) => index % PAYLOAD_BITS);
  for (let i = cells - 1; i > 0; i--) {
    const j = random() % (i + 1);
    [bitOf[i], bitOf[j]] = [bitOf[j], bitOf[i]];
  }
  const keyOf = Array.from({ length: cells }, () => random() & 1);
  return { bitOf, keyOf };
}

const luminance = (data: Uint8Array | Buffer, index: number) =>
  0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];

function dot(table: Float64Array, samples: Float64Array | Float32Array) {
  let sum = 0;
  for (let i = 0; i < table.length; i++) sum += table[i] * samples[i];
  return sum;
}

/** Texture energy of a block, given its luminance samples and marked coefficient values. */
function texture(samples: Float64Array, coefficients: number[]) {
  let mean = 0;
  for (const value of samples) mean += value;
  mean /= samples.length;
  let energy = 0;
  for (const value of samples) energy += (value - mean) ** 2;
  // Parseval: the AC energy of an orthonormal DCT equals the pixel variance sum.
  for (const coefficient of coefficients) energy -= coefficient * coefficient;
  return energy;
}

const quantise = (value: number, bit: number) => {
  const shift = bit ? STEP / 2 : 0;
  return Math.round((value - shift) / STEP) * STEP + shift;
};

/** Writes the id into a copy of the RGB(A) pixels. Images below 64×64 are returned as is. */
export function embed(image: RawImage, id: bigint, secret: string): Uint8Array {
  if (id < 0n || id >= 1n << BigInt(ID_BITS)) throw new Error("Watermark id must fit in 48 bits");
  const out = new Uint8Array(image.data);
  const { width, height, channels } = image;
  const blocksX = Math.floor(width / BLOCK);
  const blocksY = Math.floor(height / BLOCK);
  if (blocksX < BLOCK || blocksY < BLOCK || channels < 3) return out;

  const bits = payloadBits(id);
  const { bitOf, keyOf } = cellLayout(secret);
  const delta = new Float64Array(BLOCK * BLOCK);
  const samples = new Float64Array(BLOCK * BLOCK);

  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      for (let y = 0; y < BLOCK; y++) {
        const row = (by * BLOCK + y) * width + bx * BLOCK;
        for (let x = 0; x < BLOCK; x++)
          samples[y * BLOCK + x] = luminance(out, (row + x) * channels);
      }
      const values = basis.map((table) => dot(table, samples));
      if (texture(samples, values) < TEXTURE_MIN) continue;

      const cell = (by % TILE) * TILE + (bx % TILE);
      const bit = bits[bitOf[cell]] ^ keyOf[cell];
      delta.fill(0);
      basis.forEach((table, index) => {
        const change = quantise(values[index], bit) - values[index];
        for (let i = 0; i < delta.length; i++) delta[i] += change * table[i];
      });
      // The same change on R, G and B moves luminance and leaves colour alone.
      for (let y = 0; y < BLOCK; y++) {
        const row = (by * BLOCK + y) * width;
        for (let x = 0; x < BLOCK; x++) {
          const index = (row + bx * BLOCK + x) * channels;
          const d = delta[y * BLOCK + x];
          for (let c = 0; c < 3; c++)
            out[index + c] = Math.max(0, Math.min(255, Math.round(out[index + c] + d)));
        }
      }
    }
  }
  return out;
}

/** The embedded id, or null when no valid watermark is found at any offset or phase. */
export function extract(image: RawImage, secret: string): bigint | null {
  const { width, height, channels, data } = image;
  if (channels < 3) return null;
  const { bitOf, keyOf } = cellLayout(secret);
  const cells = TILE * TILE;
  // Luminance once, reused by every offset.
  const luma = new Float32Array(width * height);
  for (let i = 0; i < luma.length; i++) luma[i] = luminance(data, i * channels);
  const samples = new Float64Array(BLOCK * BLOCK);

  for (let oy = 0; oy < BLOCK; oy++) {
    for (let ox = 0; ox < BLOCK; ox++) {
      const blocksX = Math.floor((width - ox) / BLOCK);
      const blocksY = Math.floor((height - oy) / BLOCK);
      if (blocksX < BLOCK || blocksY < BLOCK) continue;

      // Soft votes per tile position: positive leans to 0, negative to 1.
      const votes = new Float64Array(cells);
      for (let by = 0; by < blocksY; by++) {
        for (let bx = 0; bx < blocksX; bx++) {
          for (let y = 0; y < BLOCK; y++) {
            const row = (oy + by * BLOCK + y) * width + ox + bx * BLOCK;
            for (let x = 0; x < BLOCK; x++) samples[y * BLOCK + x] = luma[row + x];
          }
          const values = basis.map((table) => dot(table, samples));
          if (texture(samples, values) < TEXTURE_MIN_EXTRACT) continue;
          let soft = 0;
          for (const value of values) {
            soft += Math.abs(value - quantise(value, 1)) - Math.abs(value - quantise(value, 0));
          }
          votes[(by % TILE) * TILE + (bx % TILE)] += soft;
        }
      }

      for (let py = 0; py < TILE; py++) {
        for (let px = 0; px < TILE; px++) {
          const sums = new Float64Array(PAYLOAD_BITS);
          for (let ty = 0; ty < TILE; ty++) {
            for (let tx = 0; tx < TILE; tx++) {
              // Block (tx, ty) of the crop sat at tile position (tx + px, ty + py) originally.
              const cell = ((ty + py) % TILE) * TILE + ((tx + px) % TILE);
              const vote = votes[ty * TILE + tx];
              sums[bitOf[cell]] += keyOf[cell] ? -vote : vote;
            }
          }
          const id = bitsToId(Array.from(sums, (sum) => (sum < 0 ? 1 : 0)));
          if (id !== null) return id;
        }
      }
    }
  }
  return null;
}

/** A random id for a new download. */
export function randomWatermarkId() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return bytes.reduce((value, byte) => (value << 8n) | BigInt(byte), 0n);
}
