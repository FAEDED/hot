import { NOTE_STRINGS, A4_FREQ } from '../constants';

// Helper to convert Frequency to MIDI Note Number
export const getMidiFromFreq = (frequency: number): number => {
  const noteNum = 12 * (Math.log(frequency / A4_FREQ) / Math.log(2));
  return Math.round(noteNum) + 69;
};

// Helper to convert MIDI Note Number to Note Name (e.g., "C#4")
export const getNoteNameFromMidi = (midi: number): string => {
  const noteIndex = midi % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_STRINGS[noteIndex]}${octave}`;
};

// Calculate cents off from the nearest semitone
export const getCentsOff = (frequency: number, midi: number): number => {
  const targetFreq = A4_FREQ * Math.pow(2, (midi - 69) / 12);
  return 1200 * Math.log2(frequency / targetFreq);
};

// Autocorrelation algorithm for pitch detection (McLeod Pitch Method simplified)
// Good for monophonic instruments like guitar
export const autoCorrelate = (buf: Float32Array, sampleRate: number, minFreq?: number, maxFreq?: number): number => {
  // Implements the ACF2+ algorithm
  const SIZE = buf.length;
  let rms = 0;

  for (let i = 0; i < SIZE; i++) {
    const val = buf[i];
    rms += val * val;
  }
  rms = Math.sqrt(rms / SIZE);

  // Noise gate
  if (rms < 0.01) {
    return -1;
  }

  let r1 = 0;
  let r2 = SIZE - 1;
  const thres = 0.2;

  // Simple autocorrelation
  for (let i = 0; i < SIZE / 2; i++) {
    if (Math.abs(buf[i]) < thres) {
      r1 = i;
      break;
    }
  }
  for (let i = 1; i < SIZE / 2; i++) {
    if (Math.abs(buf[SIZE - i]) < thres) {
      r2 = SIZE - i;
      break;
    }
  }

  const buf2 = buf.slice(r1, r2);
  const c = new Float32Array(buf2.length).fill(0);
  
  for (let i = 0; i < buf2.length; i++) {
    for (let j = 0; j < buf2.length - i; j++) {
      c[i] = c[i] + buf2[j] * buf2[j + i];
    }
  }

  let d = 0;
  while (c[d] > c[d + 1]) d++;
  let maxval = -1;
  let maxpos = -1;
  
  const minPeriod = maxFreq ? Math.floor(sampleRate / maxFreq) : d;
  const maxPeriod = minFreq ? Math.ceil(sampleRate / minFreq) : buf2.length;

  const startIdx = Math.max(d, minPeriod);
  const endIdx = Math.min(buf2.length, maxPeriod);

  for (let i = startIdx; i < endIdx; i++) {
    if (c[i] > maxval) {
      maxval = c[i];
      maxpos = i;
    }
  }
  
  if (maxpos === -1) return -1;
  let T0 = maxpos;

  // Parabolic interpolation for better precision
  const x1 = c[T0 - 1] || c[T0];
  const x2 = c[T0];
  const x3 = c[T0 + 1] || c[T0];
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  
  if (a) T0 = T0 - b / (2 * a);
  
  const frequency = sampleRate / T0;

  // Strict structural filtering for instrument selected limits
  if (minFreq && frequency < minFreq) return -1;
  if (maxFreq && frequency > maxFreq) return -1;

  return frequency;
};

// Base64 encoding helpers for audio streaming
export function floatTo16BitPCM(output: DataView, offset: number, input: Float32Array) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
}

export function base64EncodeAudio(float32Array: Float32Array): string {
  const arrayBuffer = new ArrayBuffer(float32Array.length * 2);
  const dataView = new DataView(arrayBuffer);
  floatTo16BitPCM(dataView, 0, float32Array);
  let binary = '';
  const bytes = new Uint8Array(arrayBuffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Very basic chord detection based on active MIDI pitches
export const detectChord = (activePitches: number[]): string | null => {
  if (activePitches.length < 3) return null;

  // Reduce to pitch classes (0-11) and remove duplicates
  let pitchClasses = Array.from(new Set(activePitches.map(p => p % 12))).sort((a, b) => a - b);
  
  if (pitchClasses.length < 3) return null;

  // Function to create intervals from a root note
  const getIntervals = (root: number, classes: number[]) => {
    return classes.map(c => (c - root + 12) % 12).sort((a, b) => a - b);
  };

  const matchesIntervals = (a: number[], b: number[]) => {
      if(a.length !== b.length) return false;
      for(let i=0; i<a.length; i++) if(a[i] !== b[i]) return false;
      return true;
  };

  // Common chord intervals
  const CHORD_TYPES = [
    { name: 'Maj', intervals: [0, 4, 7] },
    { name: 'm', intervals: [0, 3, 7] },
    { name: 'dim', intervals: [0, 3, 6] },
    { name: 'aug', intervals: [0, 4, 8] },
    { name: 'sus4', intervals: [0, 5, 7] },
    { name: 'sus2', intervals: [0, 2, 7] },
    { name: 'Maj7', intervals: [0, 4, 7, 11] },
    { name: 'm7', intervals: [0, 3, 7, 10] },
    { name: '7', intervals: [0, 4, 7, 10] },
    { name: 'm7b5', intervals: [0, 3, 6, 10] },
    { name: 'dim7', intervals: [0, 3, 6, 9] },
  ];

  // Try each note as a root
  for (let i = 0; i < pitchClasses.length; i++) {
    const root = pitchClasses[i];
    const rootIntervals = getIntervals(root, pitchClasses);

    // Look for a match in our chord types
    for (const type of CHORD_TYPES) {
      // Check if intervals match exactly (or contains the core triad for larger chords)
       if (matchesIntervals(rootIntervals, type.intervals)) {
           return `${NOTE_STRINGS[root]}${type.name}`;
       }
    }
  }

  return null;
};