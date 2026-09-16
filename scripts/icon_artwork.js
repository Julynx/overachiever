/**
 * @fileoverview Shared star-stack artwork renderer and PNG encoder used by the
 * tray icon and Windows application icon generation scripts.
 */

import * as zlib from 'node:zlib';

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i];
    crc ^= byte;
    for (let j = 0; j < 8; j++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const combined = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(combined), 0);
  return Buffer.concat([length, typeBuf, data, crcBuf]);
}

function starRadiusAt(angle, outerRadius, innerRadius) {
  const step = Math.PI / 5;
  const piece = angle % (2 * step);
  if (piece < step) {
    return innerRadius + (outerRadius - innerRadius) * (1 - piece / step);
  }
  return innerRadius + (outerRadius - innerRadius) * ((piece - step) / step);
}

function drawStar(rgba, size, centerX, centerY, outerRadius, innerRadius) {
  const rowStride = size * 4;
  const minY = Math.max(0, Math.floor(centerY - outerRadius - 1));
  const maxY = Math.min(size - 1, Math.ceil(centerY + outerRadius + 1));
  const minX = Math.max(0, Math.floor(centerX - outerRadius - 1));
  const maxX = Math.min(size - 1, Math.ceil(centerX + outerRadius + 1));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - centerX;
      const dy = y - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      let angle = Math.atan2(dy, dx) + Math.PI / 2;
      if (angle < 0) angle += 2 * Math.PI;

      const radius = starRadiusAt(angle, outerRadius, innerRadius);
      const pixelIndex = y * rowStride + x * 4;
      const gradientT = Math.min(1, Math.max(0, (y - (centerY - outerRadius)) / (2 * outerRadius)));
      const red = Math.floor(250 - gradientT * 10);
      const green = Math.floor(200 - gradientT * 30);
      const blue = Math.floor(75 - gradientT * 20);

      if (distance <= radius) {
        rgba[pixelIndex] = red;
        rgba[pixelIndex + 1] = green;
        rgba[pixelIndex + 2] = blue;
        rgba[pixelIndex + 3] = 255;
      } else if (distance <= radius + 0.7) {
        rgba[pixelIndex] = red;
        rgba[pixelIndex + 1] = green;
        rgba[pixelIndex + 2] = blue;
        rgba[pixelIndex + 3] = 160;
      }
    }
  }
}

/**
 * Renders the stars-stack artwork (one large star above two small stars) at the
 * requested square size into a tightly packed RGBA pixel buffer.
 */
export function renderStarsRgba(size) {
  const rgba = Buffer.alloc(size * size * 4, 0);
  const scale = size / 32;

  drawStar(rgba, size, 7 * scale, 25 * scale, 5.7 * scale, 2.6 * scale);
  drawStar(rgba, size, 25 * scale, 25 * scale, 5.7 * scale, 2.6 * scale);
  drawStar(rgba, size, 16 * scale, 13 * scale, 10.6 * scale, 4.9 * scale);

  return rgba;
}

/**
 * Renders the stars-stack artwork (one large star above two small stars) at the
 * requested square size and encodes it as a PNG buffer.
 */
export function renderStarsPng(size) {
  const rowStride = size * 4 + 1;
  const pixels = Buffer.alloc(size * rowStride, 0);
  const rgba = renderStarsRgba(size);

  for (let y = 0; y < size; y++) {
    rgba.copy(pixels, y * rowStride + 1, y * size * 4, (y + 1) * size * 4);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.writeUInt8(8, 8);
  header.writeUInt8(6, 9);
  header.writeUInt8(0, 10);
  header.writeUInt8(0, 11);
  header.writeUInt8(0, 12);

  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrChunk = createChunk('IHDR', header);
  const idatChunk = createChunk('IDAT', zlib.deflateSync(pixels));
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([pngSignature, ihdrChunk, idatChunk, iendChunk]);
}
