import { MidiAnalysisResult, JsonNote } from '../types';

/**
 * A simple MIDI file writer.
 * Converts the JSON analysis result into a standard MIDI (Type 1) binary file.
 */
export const generateMidiFile = (data: MidiAnalysisResult): Uint8Array => {
  const tracksBytes: number[][] = [];
  const TICKS_PER_BEAT = 480; // Standard PPQ

  // Helper: Write Variable Length Quantity
  const writeVLQ = (value: number): number[] => {
    let buffer = value & 0x7F;
    const bytes = [];
    while ((value >>= 7)) {
      buffer <<= 8;
      buffer |= ((value & 0x7F) | 0x80);
    }
    while (true) {
      bytes.push(buffer & 0xFF);
      if (buffer & 0x80) buffer >>= 8;
      else break;
    }
    return bytes;
  };

  // Helper: Convert seconds to ticks
  const secToTicks = (sec: number, tempo: number) => {
    // tempo is BPM. Seconds per beat = 60/BPM.
    // Ticks per second = (BPM * PPQ) / 60
    return Math.round(sec * (tempo * TICKS_PER_BEAT) / 60);
  };

  // 1. Create Track Chunks
  data.tracks.forEach((track) => {
    let currentTick = 0;
    const events: { tick: number; type: number; note: number; velocity: number }[] = [];

    // Convert notes to On/Off events
    track.notes.forEach((n) => {
      const startTick = secToTicks(n.startTime, data.tempo);
      const endTick = startTick + secToTicks(n.duration, data.tempo);
      
      events.push({ tick: startTick, type: 0x90, note: n.midi, velocity: n.velocity }); // Note On
      events.push({ tick: endTick, type: 0x80, note: n.midi, velocity: 0 }); // Note Off
    });

    // Sort events by time
    events.sort((a, b) => a.tick - b.tick);

    const trackData: number[] = [];
    
    // Track Name Meta Event
    // Meta Event: 00 FF 03 <length> <text>
    const nameBytes = track.name.split('').map(c => c.charCodeAt(0));
    trackData.push(0x00, 0xFF, 0x03, ...writeVLQ(nameBytes.length), ...nameBytes);
    
    // Write Events
    events.forEach(evt => {
      const delta = evt.tick - currentTick;
      currentTick = evt.tick;
      
      const deltaBytes = writeVLQ(delta);
      trackData.push(...deltaBytes);
      
      // Status byte: Type | Channel
      trackData.push(evt.type | (track.channel & 0x0F));
      trackData.push(evt.note);
      trackData.push(evt.velocity);
    });

    // End of Track Meta Event: FF 2F 00
    trackData.push(0x00, 0xFF, 0x2F, 0x00);
    tracksBytes.push(trackData);
  });

  // 2. Create Header Chunk
  // MThd, Length(6), Format(1), Tracks(N), Division(PPQ)
  const header: number[] = [
    0x4D, 0x54, 0x68, 0x64, // "MThd"
    0x00, 0x00, 0x00, 0x06, // Chunk size
    0x00, 0x01, // Format 1 (Multi-track)
    (data.tracks.length >> 8) & 0xFF, data.tracks.length & 0xFF, // Number of tracks
    (TICKS_PER_BEAT >> 8) & 0xFF, TICKS_PER_BEAT & 0xFF // Time division
  ];

  // 3. Assemble File
  const fileBytes: number[] = [...header];
  
  tracksBytes.forEach(trackData => {
    // MTrk
    fileBytes.push(0x4D, 0x54, 0x72, 0x6B);
    // Length (4 bytes)
    fileBytes.push((trackData.length >> 24) & 0xFF);
    fileBytes.push((trackData.length >> 16) & 0xFF);
    fileBytes.push((trackData.length >> 8) & 0xFF);
    fileBytes.push(trackData.length & 0xFF);
    // Data
    fileBytes.push(...trackData);
  });

  return new Uint8Array(fileBytes);
};