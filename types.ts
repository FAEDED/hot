export interface NoteEvent {
  note: string;
  midi: number;
  frequency: number;
  velocity: number;
  timestamp: number;
  id: string;
}

export interface AudioState {
  isListening: boolean;
  volume: number;
  frequency: number;
  note: string | null;
  cents: number;
}

export enum ConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}

export interface AiMessage {
  role: 'user' | 'model';
  text?: string;
  timestamp: number;
}

// --- New Analysis Types ---

export type AnalysisMode = 'single' | 'full_song';
export type PolyphonyMode = 'monophonic' | 'polyphonic';

export interface AnalysisConfig {
  mode: AnalysisMode;
  polyphony: PolyphonyMode;
  instrument?: string; // e.g. "Guitar", "Piano"
}

export interface JsonNote {
  midi: number;
  startTime: number; // seconds
  duration: number; // seconds
  velocity: number;
}

export interface JsonTrack {
  name: string;
  channel: number; // 0-15
  notes: JsonNote[];
}

export interface SongSection {
  name: string;
  startTime: number;
  endTime: number;
  description: string;
}

export interface MidiAnalysisResult {
  keySignature: string;
  tempo: number;
  timeSignature: string;
  tracks: JsonTrack[];
  structure?: SongSection[];
}