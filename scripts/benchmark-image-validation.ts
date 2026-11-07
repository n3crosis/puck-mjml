// Run: bun scripts/benchmark-image-validation.ts
// This measures synchronous validation, not browser rendering or image decoding.
// Deterministic, genuinely decodable PNGs keep the work representative. Timings
// are descriptive and deliberately not CI thresholds.
import { deepEqual, equal } from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { isLocalImageSource } from "../src/image-upload.ts";

function chunk(type: string, data: Buffer) {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, body, checksum]);
}

function png(side: number) {
  const pixels = Buffer.alloc((1 + side * 3) * side);
  let seed = 17;
  for (let y = 0; y < side; y++) {
    for (let x = 1; x <= side * 3; x++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      pixels[y * (1 + side * 3) + x] = seed >>> 24;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(side);
  header.writeUInt32BE(side, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function medianMs(run: () => unknown) {
  const samples: number[] = [];
  for (let attempt = 0; attempt < 11; attempt++) {
    const start = performance.now();
    run();
    if (attempt >= 2) samples.push(performance.now() - start);
  }
  samples.sort((left, right) => left - right);
  return Number(samples[4].toFixed(2));
}

for (const side of [256, 512, 1024]) {
  const image = png(side);
  const encoded = image.toString("base64");
  const source = `data:image/png;base64,${encoded}`;
  const binary = atob(encoded);
  const previousCopy = () => Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const indexedCopy = () => {
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
  };
  deepEqual(indexedCopy(), previousCopy());
  deepEqual(indexedCopy(), new Uint8Array(image));
  equal(isLocalImageSource(source), true);
  equal(isLocalImageSource(`${source.slice(0, -1)}!`), false);
  console.log({
    side,
    imageBytes: image.length,
    fullValidationMs: medianMs(() => isLocalImageSource(source)),
    previousByteCopyMs: medianMs(previousCopy),
    indexedByteCopyMs: medianMs(indexedCopy),
  });
}
