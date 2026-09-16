/**
 * @fileoverview Utility script to generate a crisp 32x32 PNG tray icon
 * matching the project's stars-stack.svg artwork (one large star above two small stars).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { renderStarsPng } from './icon_artwork.js';

const outputPath = path.join(process.cwd(), 'public', 'tray_icon.png');
fs.writeFileSync(outputPath, renderStarsPng(32));
console.log('Tray icon generated at:', outputPath);
