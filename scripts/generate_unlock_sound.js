/**
 * @fileoverview Utility script to synthesize the achievement unlock chime
 * (a short, bright "blim") as a 16-bit mono WAV asset.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const SAMPLE_RATE = 44100;
const DURATION_SECONDS = 0.28;
const TOTAL_SAMPLES = Math.floor(SAMPLE_RATE * DURATION_SECONDS);

function synthesizeUnlockChime() {
  const samples = new Int16Array(TOTAL_SAMPLES);

  for (let i = 0; i < TOTAL_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    const slideProgress = Math.min(1, t / 0.045);
    const frequency = 1350 + 550 * slideProgress;

    const attack = Math.min(1, t / 0.004);
    const decay = Math.exp(-t * 18);
    const envelope = attack * decay;

    const wave = Math.sin(2 * Math.PI * frequency * t)
      + 0.35 * Math.sin(4 * Math.PI * frequency * t)
      + 0.12 * Math.sin(6 * Math.PI * frequency * t);

    const amplitude = 0.55 * envelope * wave;
    samples[i] = Math.max(-1, Math.min(1, amplitude)) * 32767;
  }

  return samples;
}

function createWavFile(samples) {
  const dataBuffer = Buffer.from(samples.buffer);
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataBuffer.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataBuffer.length, 40);

  return Buffer.concat([header, dataBuffer]);
}

const wavBuffer = createWavFile(synthesizeUnlockChime());
const outputPath = path.join(process.cwd(), 'public', 'sounds', 'unlock.wav');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, wavBuffer);
console.log('Unlock chime generated at:', outputPath);
