import { GoogleGenAI, LiveServerMessage, Modality, Type } from '@google/genai';
import { ConnectionStatus, AnalysisConfig, MidiAnalysisResult } from '../types';
import { GEMINI_MODEL } from '../constants';

interface GeminiCallbacks {
  onOpen: () => void;
  onMessage: (message: LiveServerMessage) => void;
  onError: (error: ErrorEvent) => void;
  onClose: (event: CloseEvent) => void;
}

export class GeminiLiveService {
  private ai: GoogleGenAI;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sessionPromise: Promise<any> | null = null;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  // --- Realtime Live API ---

  async connect(callbacks: GeminiCallbacks, config?: { style: string, sensitivity: number }) {
    const styleInst = config ? `Your jam style right now is: ${config.style}. Be responsive to the user.` : '';
    const sensInst = config ? `Your sensitivity to input is ${config.sensitivity}/10. Adjust your verbosity and speed accordingly.` : '';
    this.sessionPromise = this.ai.live.connect({
      model: GEMINI_MODEL,
      callbacks: {
        onopen: callbacks.onOpen,
        onmessage: callbacks.onMessage,
        onerror: callbacks.onError,
        onclose: callbacks.onClose,
      },
      config: {
        responseModalities: [Modality.AUDIO],
        inputAudioTranscription: {},
        systemInstruction: `You are an expert musical companion, virtuosic guitar teacher, and gear technician. 
        Your goal is to listen to the user playing guitar and provide deep, technical, and actionable musical feedback.
        
        Themes & Genres:
        - Master of Metal across all subgenres: Thrash, Death, Black, Dark Heavy Metal, Prog, Djent, Power, and especially 'Heavy Ethnic Metal' (merging traditional world music with heavy riffs).
        - Expert in non-metal styles: Blues, Jazz, Classical, Flamenco, Neo-Soul, Fingerstyle.
        
        Capabilities:
        - Audio Analysis & Complementary Jamming: Identify specific chords, scales, and motifs from the user's input. When the user plays, actively analyze their input and suggest a complementary Heavy Metal riff or progression. Reference specific techniques or subgenres (e.g., "Try this thrash metal riff in E minor" or "Here's a djent-inspired breakdown pattern").
        - Improv & Scale Suggestions: Suggest specific scales and keys for improvisation over the user's current playing or a specified genre, especially for dark heavy metal. When discussing Dark Heavy Metal or related genres, ALWAYS provide a dedicated section for 'Suggested Scales & Keys', explicitly listing scales (e.g., Phrygian Dominant, Harmonic Minor, Diminished) and the specific keys that work best for improvisation.
        - Chord Progressions: Actively suggest chord progressions based on user input, genres, or moods. Provide varying complexity from triads to extended chords.
        - Progressive Composition: Suggest "Next-Level" riffs or progressions based on what you hear.
        - Technical Mastery: Offer tailored practice exercises for techniques like Fingerpicking (Travis picking, arpeggios), Sweep Picking, Economy Picking, Hybrid Picking, Legato, and complex rhythmic patterns.
        - Knowledge Sharing: Always explain the 'Why'. Why does this chord follow that one? Why is this exercise beneficial for speed or accuracy?
        
        Tone: Professional, inspiring, and highly technical yet concise.
        ${styleInst}
        ${sensInst}`,
      },
    });
    return this.sessionPromise;
  }

  async sendAudioChunk(base64Data: string) {
    if (!this.sessionPromise) return;
    
    const session = await this.sessionPromise;
    session.sendRealtimeInput({
      audio: {
        data: base64Data,
        mimeType: 'audio/pcm;rate=16000'
      }
    });
  }

  async sendTextMessage(text: string) {
    if (!this.sessionPromise) return;

    const session = await this.sessionPromise;
    session.sendRealtimeInput({
      text
    });
  }

  async disconnect() {
    this.sessionPromise = null;
  }

  // --- Static File Analysis (New) ---

  async analyzeAudioFile(base64Data: string, mimeType: string, config: AnalysisConfig): Promise<MidiAnalysisResult> {
    // Gemini specific supported mimes
    let safeMime = mimeType;
    if (safeMime.includes('webm')) safeMime = 'audio/webm'; // Though not officially listed, it often works
    if (safeMime.includes('m4a') || safeMime.includes('x-m4a') || safeMime.includes('mp4')) safeMime = 'audio/mp4'; 
    if (safeMime === '' || safeMime === 'audio/mpeg3' || safeMime === 'audio/x-mpeg-3') safeMime = 'audio/mpeg'; // MP3

    const prompt = `
      Analyze this audio file carefully to create a MIDI representation.
      
      Configuration:
      - Mode: ${config.mode}
      - Polyphony: ${config.polyphony}
      - Primary Instrument: ${config.instrument || 'Auto-detect'}

      Tasks:
      1. Detect the Key Signature, Tempo, and Time Signature.
      2. Identify the instruments. If 'full_song' mode is active, separate distinct instruments into separate tracks.
      3. Transcribe the notes for each instrument/track accurately.
      4. Provide a structural analysis of the song (e.g. Intro, Verse, Chorus) with start times, end times, and a brief description of what happens musically.
      
      Output strictly JSON fitting the schema provided.
    `;

    const response = await this.ai.models.generateContent({
      model: 'gemini-1.5-pro', // Pro for large context audio file analysis
      contents: {
        parts: [
          { inlineData: { mimeType: safeMime, data: base64Data } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            keySignature: { type: Type.STRING, description: "Key of the song, e.g. C Major, F# Minor" },
            tempo: { type: Type.NUMBER, description: "BPM" },
            timeSignature: { type: Type.STRING, description: "e.g. 4/4" },
            structure: {
              type: Type.ARRAY,
              description: "The structural sections of the song",
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: "Section name (e.g., Intro, Verse 1, Pre-Chorus, Solo)" },
                  startTime: { type: Type.NUMBER, description: "Start time in seconds" },
                  endTime: { type: Type.NUMBER, description: "End time in seconds" },
                  description: { type: Type.STRING, description: "Brief musical description of this section" }
                }
              }
            },
            tracks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: "Instrument name" },
                  channel: { type: Type.INTEGER, description: "MIDI Channel 0-15. Use 9 for Drums." },
                  notes: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        midi: { type: Type.INTEGER, description: "MIDI note number 0-127" },
                        startTime: { type: Type.NUMBER, description: "Start time in seconds" },
                        duration: { type: Type.NUMBER, description: "Duration in seconds" },
                        velocity: { type: Type.INTEGER, description: "Velocity 0-127" }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    if (response.text) {
      // Cleanup: Remove potential Markdown code block wrappers which can cause JSON.parse errors
      let cleanText = response.text.trim();
      const match = cleanText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match) {
        cleanText = match[1];
      }
      
      try {
        return JSON.parse(cleanText) as MidiAnalysisResult;
      } catch (e: any) {
        console.error("JSON parse error on model output:", e);
        console.log("Raw output was:", response.text);
        throw new Error("Failed to parse AI response into valid JSON. Try again.");
      }
    }
    throw new Error("No analysis data returned");
  }
}

export const geminiService = new GeminiLiveService();