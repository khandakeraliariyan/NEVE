import sharp from "sharp";

// Perceptual hash (pHash) of a photo: a 64-bit summary of its overall
// structure that survives resizing, recompression, small crops, colour
// changes and format conversion, unlike a byte hash. Two photos are
// near-duplicates when their hashes differ in few bits.

const SIZE = 32;
const LOW = 8;
// At or below this many differing bits (out of 64), photos are treated as
// the same picture.
export const DUPLICATE_DISTANCE = 10;

// cos((2x + 1) u pi / 2N), computed once.
const COSINES = Array.from({ length: LOW }, (_, u) =>
    Array.from({ length: SIZE }, (_, x) => Math.cos(((2 * x + 1) * u * Math.PI) / (2 * SIZE)))
);

// 2D DCT of a SIZE x SIZE grey image, keeping only the LOW x LOW lowest frequencies.
function lowFrequencyDct(pixels) {
    const rows = Array.from({ length: SIZE }, (_, y) =>
        COSINES.map((cosines) => {
            let sum = 0;
            for (let x = 0; x < SIZE; x += 1) sum += pixels[y * SIZE + x] * cosines[x];
            return sum;
        })
    );
    const result = [];
    for (let v = 0; v < LOW; v += 1) {
        for (let u = 0; u < LOW; u += 1) {
            let sum = 0;
            for (let y = 0; y < SIZE; y += 1) sum += rows[y][u] * COSINES[v][y];
            result.push(sum);
        }
    }
    return result;
}

// 64 bits from grey pixels: each low frequency above or below the median.
export function hashFromPixels(pixels) {
    const coefficients = lowFrequencyDct(pixels);
    // The first value is the average brightness; leave it out of the median.
    const sorted = coefficients.slice(1).sort((a, b) => a - b);
    const median = (sorted[31] + sorted[32]) / 2;
    let hex = "";
    for (let index = 0; index < 64; index += 4) {
        let nibble = 0;
        for (let bit = 0; bit < 4; bit += 1) {
            nibble = (nibble << 1) | (coefficients[index + bit] > median ? 1 : 0);
        }
        hex += nibble.toString(16);
    }
    return hex;
}

// 16 hex characters for an image file's bytes.
export async function computePerceptualHash(bytes) {
    const { data } = await sharp(bytes, { failOn: "error", limitInputPixels: 50_000_000 })
        .rotate()
        .resize(SIZE, SIZE, { fit: "fill" })
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
    return hashFromPixels(data);
}

const POPCOUNT = Array.from({ length: 16 }, (_, value) =>
    value.toString(2).split("").filter((bit) => bit === "1").length
);

export function hammingDistance(a, b) {
    if (typeof a !== "string" || typeof b !== "string" || a.length !== 16 || b.length !== 16) {
        return Infinity;
    }
    let distance = 0;
    for (let index = 0; index < 16; index += 1) {
        distance += POPCOUNT[parseInt(a[index], 16) ^ parseInt(b[index], 16)];
    }
    return distance;
}
