/**
 * @fileoverview Generates the multi-size Windows application icon (assets/build/icon.ico)
 * from the shared stars-stack artwork. Sizes up to 64 px are embedded as 32 bpp BMP
 * device-independent bitmaps; larger sizes are embedded as PNG entries.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { renderStarsPng, renderStarsRgba } from './icon_artwork.js';

const ICON_SIZES = [16, 24, 32, 48, 64, 128, 256];
const BMP_ENTRY_MAX_SIZE = 64;

/**
 * Encodes a 32 bpp BMP device-independent bitmap (BITMAPINFOHEADER + bottom-up BGRA
 * pixel rows + 1 bpp AND mask) suitable for embedding in an .ico file.
 */
function encodeBmpEntry(rgba, size) {
  const andMaskRowSize = Math.ceil(size / 8 / 4) * 4;
  const xorSize = size * size * 4;
  const andSize = andMaskRowSize * size;

  const dib = Buffer.alloc(40 + xorSize + andSize);
  dib.writeUInt32LE(40, 0);
  dib.writeInt32LE(size, 4);
  dib.writeInt32LE(size * 2, 8);
  dib.writeUInt16LE(1, 12);
  dib.writeUInt16LE(32, 14);
  dib.writeUInt32LE(0, 16);
  dib.writeUInt32LE(xorSize + andSize, 20);

  const xorOffset = 40;
  const andOffset = xorOffset + xorSize;

  for (let y = 0; y < size; y++) {
    const targetRow = size - 1 - y;
    for (let x = 0; x < size; x++) {
      const sourceIndex = (y * size + x) * 4;
      const targetIndex = xorOffset + (targetRow * size + x) * 4;
      dib[targetIndex] = rgba[sourceIndex + 2];
      dib[targetIndex + 1] = rgba[sourceIndex + 1];
      dib[targetIndex + 2] = rgba[sourceIndex];
      dib[targetIndex + 3] = rgba[sourceIndex + 3];
    }
  }

  return dib;
}

function generateIco() {
  const entries = ICON_SIZES.map((size) => {
    const rgba = renderStarsRgba(size);
    const pngBuffer = renderStarsPng(size);
    return {
      size,
      data: size <= BMP_ENTRY_MAX_SIZE ? encodeBmpEntry(rgba, size) : pngBuffer,
      bitCount: size <= BMP_ENTRY_MAX_SIZE ? 32 : 32,
    };
  });

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  let imageOffset = 6 + entries.length * 16;
  const directory = Buffer.alloc(entries.length * 16);
  entries.forEach((entry, index) => {
    const entryOffset = index * 16;
    directory.writeUInt8(entry.size === 256 ? 0 : entry.size, entryOffset);
    directory.writeUInt8(entry.size === 256 ? 0 : entry.size, entryOffset + 1);
    directory.writeUInt8(0, entryOffset + 2);
    directory.writeUInt8(0, entryOffset + 3);
    directory.writeUInt16LE(1, entryOffset + 4);
    directory.writeUInt16LE(entry.bitCount, entryOffset + 6);
    directory.writeUInt32LE(entry.data.length, entryOffset + 8);
    directory.writeUInt32LE(imageOffset, entryOffset + 12);
    imageOffset += entry.data.length;
  });

  const icoBuffer = Buffer.concat([header, directory, ...entries.map((entry) => entry.data)]);
  const outputPath = path.join(process.cwd(), 'assets', 'build', 'icon.ico');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, icoBuffer);
  console.log(`Application icon generated at: ${outputPath} (${ICON_SIZES.join(', ')} px)`);
}

generateIco();
