import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Activity, Zap, Play, Square, Settings2, Github, Sparkles, FileAudio, Radio, Music } from 'lucide-react';
import Visualizer from './components/Visualizer';
import Tuner from './components/Tuner';
import MidiLog from './components/MidiLog';
import FileAnalyzer from './components/FileAnalyzer';
import Fretboard from './components/Fretboard';
import ScaleTheoryLab from './components/ScaleTheoryLab';
import { autoCorrelate, getMidiFromFreq, getNoteNameFromMidi, getCentsOff, base64EncodeAudio, detectChord } from './services/audioUtils';
import { geminiService } from './services/geminiService';
import { generateMidiFile } from './services/midiGeneration';
import { AudioState, NoteEvent, ConnectionStatus, AiMessage, JsonTrack, JsonNote, MidiAnalysisResult } from './types';
import { FFT_SIZE, MIC_SAMPLE_RATE } from './constants';

const App: React.FC = () => {
  // App Mode
  const [appMode, setAppMode] = useState<'realtime' | 'analysis' | 'theory'>('realtime');

  // Audio State
  const [isListening, setIsListening] = useState(false);
  const [audioState, setAudioState] = useState<AudioState>({
    isListening: false,
    volume: 0,
    frequency: 0,
    note: null,
    cents: 0,
  });
  const [midiEvents, setMidiEvents] = useState<NoteEvent[]>([]);
  const [sessionMidiEvents, setSessionMidiEvents] = useState<NoteEvent[]>([]);
  const [currentChord, setCurrentChord] = useState<string | null>(null);
  const [instrument, setInstrument] = useState<'guitar' | 'bass' | 'ukulele'>('guitar');
  const instrumentRef = useRef(instrument);
  
  // Fretboard Explorer State
  const [fretboardAuto, setFretboardAuto] = useState(true);
  const [fretboardRoot, setFretboardRoot] = useState('E');
  const [fretboardScale, setFretboardScale] = useState('minor');
  
  // MIDI Out State
  const [midiOutputs, setMidiOutputs] = useState<any[]>([]);
  const [selectedMidiOutputId, setSelectedMidiOutputId] = useState<string>('');
  const [midiError, setMidiError] = useState<string | null>(null);
  
  // Ref to hold the selected output port for immediate access in loop
  const selectedMidiOutputRef = useRef<any>(null);
  const activeMidiNotesRef = useRef<Set<number>>(new Set());

  const sendNoteOff = (midi: number) => {
    if (selectedMidiOutputRef.current) {
        selectedMidiOutputRef.current.send([0x80, midi, 0]);
    }
  };

  const sendNoteOn = (midi: number, velocity: number) => {
    if (selectedMidiOutputRef.current) {
        selectedMidiOutputRef.current.send([0x90, midi, velocity]);
    }
  };

  const initMIDI = useCallback(async () => {
    setMidiError(null);

    const setupVirtualPort = (reason: string) => {
      console.warn(`[Virtual MIDI Setup] ${reason}`);
      const virtualPort = {
        id: 'virtual-midi-out',
        name: 'Virtual Port (Console Debug)',
        send: (data: number[]) => {
           if (data[0] === 144) console.log(`🎵 MIDI Note ON: ${data[1]} (Vel ${data[2]})`);
           else if (data[0] === 128) console.log(`🔇 MIDI Note OFF: ${data[1]}`);
        }
      };
      setMidiOutputs([virtualPort]);
      setSelectedMidiOutputId(virtualPort.id);
      selectedMidiOutputRef.current = virtualPort;
      setMidiError(null); // Clear errors since we gracefully degraded
    };

    const nav = navigator as any;
    if (!nav.requestMIDIAccess) {
      setupVirtualPort("Web MIDI not supported in browser.");
      return;
    }

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const tryInit = async (options?: any) => {
      try {
        const access = await nav.requestMIDIAccess(options);
        
        const updateOutputs = (acc: any) => {
          const outputs = Array.from(acc.outputs.values());
          if (outputs.length > 0) {
            setMidiOutputs(outputs);
            if (!selectedMidiOutputRef.current || selectedMidiOutputRef.current.id === 'virtual-midi-out') {
              const first = outputs[0] as any;
              setSelectedMidiOutputId(first.id);
              selectedMidiOutputRef.current = first;
            }
          } else {
            setupVirtualPort("No hardware outputs detected.");
          }
        };

        updateOutputs(access);
        access.onstatechange = (e: any) => updateOutputs(e.currentTarget);
        return true;
      } catch (err: any) {
        if (err.message?.includes('Platform dependent')) {
           return false;
        }
        throw err;
      }
    };

    try {
      await delay(200);

      // Attempt 1: Standard (No SysEx)
      let success = await tryInit({ sysex: false });
      
      // Attempt 2: Fallback with SysEx enabled (Targeting specific driver locks)
      if (!success) {
        await delay(500);
        success = await tryInit({ sysex: true });
      }

      // Attempt 3: No options fallback
      if (!success) {
        await delay(500);
        success = await tryInit();
      }

      if (!success) {
        setupVirtualPort("Platform dependent initialization failed (driver locked out).");
      }
    } catch (err: any) {
      console.error("Hardware MIDI init failed:", err);
      setupVirtualPort(err.message || "MIDI access denied.");
    }
  }, []);

  useEffect(() => {
     instrumentRef.current = instrument;
  }, [instrument]);

  useEffect(() => {
    initMIDI();
  }, [initMIDI]);

  const handleMidiOutputChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedMidiOutputId(id);
    const port = midiOutputs.find(out => out.id === id);
    selectedMidiOutputRef.current = port || null;
  };

  const getInstrumentBounds = (inst: string) => {
     switch (inst) {
       case 'bass': return { min: 40, max: 400 };
       case 'ukulele': return { min: 250, max: 1000 };
       case 'guitar': 
       default: return { min: 80, max: 1200 };
     }
  };
  
  // Gemini State
  const [aiStatus, setAiStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [aiThinking, setAiThinking] = useState(false);
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  
  // AI Settings
  const [aiStyle, setAiStyle] = useState<'follow' | 'lead' | 'rhythm' | 'metal' | 'ethnic_metal'>('metal');
  const [aiSensitivity, setAiSensitivity] = useState<number>(8);

  const sendQuickAction = async (text: string) => {
    if (aiStatus !== ConnectionStatus.CONNECTED) {
      alert("Connect to AI Jam first!");
      return;
    }
    setAiMessages(prev => [...prev, { role: 'user', text, timestamp: Date.now() }]);
    await geminiService.sendTextMessage(text);
  };

  // Refs for Audio Processing
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number>();
  
  // Refs for Gemini streaming
  const workletNodeRef = useRef<ScriptProcessorNode | null>(null); // Using ScriptProcessor for simplicity in single file, AudioWorklet is better for prod
  const lastNoteTimeRef = useRef<number>(0);
  const currentNoteRef = useRef<string | null>(null);

  // Initialize Audio
  const startListening = async () => {
    // Try to re-init MIDI on user interaction if it failed on boot
    if (!selectedMidiOutputRef.current) {
      initMIDI();
    }

    try {
      if (audioContextRef.current?.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          echoCancellation: false, 
          autoGainControl: false, 
          noiseSuppression: false
        } 
      });

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      sourceRef.current = source;

      // Setup Pitch Detection Loop
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Float32Array(bufferLength);

      const updatePitch = () => {
        analyser.getFloatTimeDomainData(dataArray);
        
        const bounds = getInstrumentBounds(instrumentRef.current);
        const frequency = autoCorrelate(dataArray, audioCtx.sampleRate, bounds.min, bounds.max);

        if (frequency > -1) {
          const midi = getMidiFromFreq(frequency);
          const note = getNoteNameFromMidi(midi);
          const cents = getCentsOff(frequency, midi);
          
          setAudioState(prev => ({
            ...prev,
            frequency,
            note,
            cents,
            volume: 1 // Simplified volume presence
          }));

          // Simple Note On Logic for MIDI Log
          // Debounce to avoid flooding
          const now = Date.now();
          if (note !== currentNoteRef.current && now - lastNoteTimeRef.current > 50) {
             // Send Note Off for all currently active notes
             activeMidiNotesRef.current.forEach(activeNote => {
                 sendNoteOff(activeNote);
             });
             activeMidiNotesRef.current.clear();
             
             // Send Note On for new Note
             sendNoteOn(midi, 100); // Fixed velocity
             activeMidiNotesRef.current.add(midi);

             const newEvent: NoteEvent = {
               id: Math.random().toString(36).substr(2, 9),
               note,
               midi,
               frequency,
               velocity: 100, // Fixed velocity for now
               timestamp: now
             };
             setMidiEvents(prev => [...prev.slice(-19), newEvent]); // Keep last 20
             setSessionMidiEvents(prev => [...prev, newEvent]); // Keep all
             currentNoteRef.current = note;
             lastNoteTimeRef.current = now;
          }

        } else {
          // No pitch detected
           setAudioState(prev => ({ ...prev, frequency: 0, note: null, volume: 0 }));
           currentNoteRef.current = null;
           
           // Turn off all active notes silently if we've lost pitch
           if (activeMidiNotesRef.current.size > 0) {
              activeMidiNotesRef.current.forEach(activeNote => {
                 sendNoteOff(activeNote);
              });
              activeMidiNotesRef.current.clear();
           }
        }
        
        rafRef.current = requestAnimationFrame(updatePitch);
      };
      
      updatePitch();
      setIsListening(true);
      
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Microphone access denied or not available.");
    }
  };

  const stopListening = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (sourceRef.current) sourceRef.current.disconnect();
    if (analyserRef.current) analyserRef.current.disconnect();
    if (audioContextRef.current) audioContextRef.current.close();
    
    // Send final all notes off
    if (activeMidiNotesRef.current.size > 0) {
      activeMidiNotesRef.current.forEach(activeNote => {
         sendNoteOff(activeNote);
      });
      activeMidiNotesRef.current.clear();
    }
    
    // Stop Gemini stream if active
    if (workletNodeRef.current) {
        workletNodeRef.current.disconnect();
        workletNodeRef.current = null;
    }

    setIsListening(false);
    setAudioState({ isListening: false, volume: 0, frequency: 0, note: null, cents: 0 });
    audioContextRef.current = null;
  };

  // Gemini Integration
  const toggleGemini = async () => {
    if (aiStatus === ConnectionStatus.CONNECTED) {
      await geminiService.disconnect();
      if (workletNodeRef.current) {
         workletNodeRef.current.disconnect();
         workletNodeRef.current = null;
      }
      setAiStatus(ConnectionStatus.DISCONNECTED);
      return;
    }

    if (!isListening) {
      alert("Please start the guitar input first!");
      return;
    }

    setAiStatus(ConnectionStatus.CONNECTING);

    try {
      // Connect to Gemini
      await geminiService.connect({
        onOpen: () => {
            setAiStatus(ConnectionStatus.CONNECTED);
            setAiMessages(prev => [...prev, { role: 'model', text: 'Connected! Ready to jam.', timestamp: Date.now() }]);
            startGeminiStream();
        },
        onMessage: (message) => {
           // Handle Text output
           if (message.serverContent?.modelTurn?.parts) {
              const textPart = message.serverContent.modelTurn.parts.find(p => p.text);
              if (textPart && textPart.text) {
                  setAiMessages(prev => [...prev, { role: 'model', text: textPart.text, timestamp: Date.now() }]);
                  setAiThinking(false);
              }
           }
        },
        onError: (e) => {
            console.error(e);
            setAiStatus(ConnectionStatus.ERROR);
            setAiThinking(false);
        },
        onClose: () => {
            setAiStatus(ConnectionStatus.DISCONNECTED);
        }
      }, { style: aiStyle, sensitivity: aiSensitivity });
    } catch (e) {
      console.error(e);
      setAiStatus(ConnectionStatus.ERROR);
    }
  };

  const startGeminiStream = () => {
    if (!audioContextRef.current || !sourceRef.current) return;

    // We need to downsample to 16kHz for Gemini usually, but the API handles PCM.
    // Creating a separate processor for the stream to avoid blocking the UI pitch detector
    const audioCtx = audioContextRef.current;
    
    // Create a script processor to grab raw audio data
    // Buffer size 4096 = ~250ms latency chunk, good enough for conversation/analysis
    const processor = audioCtx.createScriptProcessor(4096, 1, 1);
    
    processor.onaudioprocess = (e) => {
       const inputData = e.inputBuffer.getChannelData(0);
       const b64 = base64EncodeAudio(inputData);
       geminiService.sendAudioChunk(b64);
    };

    sourceRef.current.connect(processor);
    processor.connect(audioCtx.destination); // Connect to dest to keep it alive (usually muted)
    workletNodeRef.current = processor;
  };

  // Auto-scroll AI chat
  const chatRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (chatRef.current) {
        chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [aiMessages]);

  // Real-time chord detection
  useEffect(() => {
    if (sessionMidiEvents.length === 0) return;
    const now = Date.now();
    // Use last 2 seconds of notes
    const recentEvents = sessionMidiEvents.filter(evt => now - evt.timestamp < 2000);
    const activePitches = recentEvents.map(evt => evt.midi);
    const chord = detectChord(activePitches);
    setCurrentChord(chord);
  }, [sessionMidiEvents]);

  // Export MIDI Logic
  const handleExportMidi = () => {
    if (sessionMidiEvents.length === 0) {
      alert("No MIDI events to export yet. Play some notes!");
      return;
    }

    const firstTime = sessionMidiEvents[0].timestamp;
    
    const notes: JsonNote[] = sessionMidiEvents.map(evt => ({
        midi: evt.midi,
        startTime: (evt.timestamp - firstTime) / 1000,
        duration: 0.2, // Arbitrary short duration since we only have start events here
        velocity: evt.velocity,
    }));

    const track: JsonTrack = {
        name: "Live Guitar",
        channel: 0,
        notes
    };

    const analysisResult: MidiAnalysisResult = {
        keySignature: "C Major",
        tempo: 120, 
        timeSignature: "4/4",
        tracks: [track]
    };

    const midiBytes = generateMidiFile(analysisResult);
    const blob = new Blob([midiBytes], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FretWiz_Jam_${new Date().toISOString().replace(/[:.]/g, '-')}.mid`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };


  return (
    <div className="min-h-screen bg-black text-zinc-100 p-4 md:p-8 flex flex-col gap-6">
      
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-center gap-4 mb-4 border-b border-zinc-900 pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tighter bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            FretWiz
          </h1>
          <p className="text-zinc-500 text-sm font-mono mt-1">REAL-TIME AUDIO TO MIDI & AI JAM STATION</p>
        </div>
        
        {/* Main Nav Toggle */}
        <div className="bg-zinc-900 p-1 rounded-lg border border-zinc-800 flex gap-1">
            <button 
              onClick={() => setAppMode('realtime')}
              className={`px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-all ${appMode === 'realtime' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <Mic size={14} /> Real-time
            </button>
            <button 
              onClick={() => setAppMode('analysis')}
              className={`px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-all ${appMode === 'analysis' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <FileAudio size={14} /> File Analysis
            </button>
        </div>
      </header>

      {appMode === 'analysis' ? (
        <main className="flex-1">
           <FileAnalyzer />
        </main>
      ) : (
        /* Realtime View */
        <main className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
          
          {/* Left Col: Visualizer & Tuner */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            
             <div className="flex justify-between items-center bg-zinc-900/50 p-4 rounded-xl border border-zinc-800">
               <div className="flex items-center gap-3">
                 <div className={`w-3 h-3 rounded-full ${isListening ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                 <span className="text-sm font-medium text-zinc-300">{isListening ? 'Engine Active' : 'Engine Stopped'}</span>
               </div>
               <button 
                  onClick={isListening ? stopListening : startListening}
                  className={`flex items-center gap-2 px-6 py-2 rounded-full font-semibold transition-all shadow-lg text-sm ${isListening ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/50' : 'bg-zinc-100 text-zinc-900 hover:bg-white'}`}
              >
                  {isListening ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                  {isListening ? "Stop" : "Start"}
              </button>
             </div>

            {/* Main Instrument Dashboard */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                {/* Visualizer Area */}
                <div className="md:col-span-7 bg-zinc-900 rounded-2xl border border-zinc-800 p-4 shadow-xl flex flex-col">
                    <div className="flex justify-between items-center mb-4">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Live Waveform</span>
                        <Activity size={12} className="text-zinc-700" />
                    </div>
                    <div className="flex-1 flex items-center">
                       <Visualizer analyser={analyserRef.current} isListening={isListening} />
                    </div>
                </div>

                {/* Tuner Area - Prominent alongside Visualizer */}
                <div className="md:col-span-5 h-[320px] md:h-auto">
                    <Tuner note={audioState.note} cents={audioState.cents} frequency={audioState.frequency} />
                </div>
            </div>

            {/* Stats & Chord Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Detected Chord */}
              <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 shadow-xl flex flex-col items-center justify-center relative overflow-hidden h-40">
                  <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none text-9xl">🎸</div>
                  <h3 className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mb-2 z-10">Detected Chord</h3>
                  <div className={`text-5xl font-black tracking-tighter z-10 transition-colors ${currentChord ? 'text-blue-400' : 'text-zinc-700'}`}>
                      {currentChord || "---"}
                  </div>
              </div>

              {/* Dark Metal Improv Scales */}
              <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 shadow-xl flex flex-col justify-between h-40">
                  <div>
                      <h3 className="text-red-500/80 text-[10px] font-bold uppercase tracking-widest mb-3 flex items-center justify-between">
                         Suggested Scales <Sparkles size={10} className="text-red-500" />
                      </h3>
                      <div className="space-y-2 h-[88px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-zinc-700 [&::-webkit-scrollbar-thumb]:rounded-full">
                        {(() => {
                           const root = currentChord ? currentChord.replace(/[^A-G#b]/g, '') : (audioState.note ? audioState.note.replace(/[0-9]/g, '') : 'E');
                           return (
                             <>
                                <div className="text-xs bg-zinc-950 p-1.5 rounded border border-zinc-800 flex justify-between items-center">
                                  <span className="text-zinc-400">Phrygian Dominant</span>
                                  <span className="font-mono text-red-400 font-bold">{root} Phrygian</span>
                                </div>
                                <div className="text-xs bg-zinc-950 p-1.5 rounded border border-zinc-800 flex justify-between items-center">
                                  <span className="text-zinc-400">Harmonic Minor</span>
                                  <span className="font-mono text-indigo-400 font-bold">{root} Minor</span>
                                </div>
                                <div className="text-xs bg-zinc-950 p-1.5 rounded border border-zinc-800 flex justify-between items-center">
                                  <span className="text-zinc-400">Diminished (Half-Whole)</span>
                                  <span className="font-mono text-orange-400 font-bold">{root} Dim</span>
                                </div>
                                <div className="text-xs bg-zinc-950 p-1.5 rounded border border-zinc-800 flex justify-between items-center">
                                  <span className="text-zinc-400">Locrian</span>
                                  <span className="font-mono text-blue-400 font-bold">{root} Locrian</span>
                                </div>
                                <div className="text-xs bg-zinc-950 p-1.5 rounded border border-zinc-800 flex justify-between items-center">
                                  <span className="text-zinc-400">Hungarian Minor</span>
                                  <span className="font-mono text-purple-400 font-bold">{root} Hungarian</span>
                                </div>
                                <div className="text-xs bg-zinc-950 p-1.5 rounded border border-zinc-800 flex justify-between items-center">
                                  <span className="text-zinc-400">Byzantine</span>
                                  <span className="font-mono text-emerald-400 font-bold">{root} byz</span>
                                </div>
                             </>
                           );
                        })()}
                      </div>
                  </div>
              </div>

              {/* Quick Stats / Info */}
              <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 shadow-xl flex flex-col justify-between h-40">
                  <div>
                      <h3 className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest mb-4">Signal Path</h3>
                      <div className="space-y-3">
                          <div className="flex justify-between items-center border-b border-zinc-800 pb-1.5">
                              <span className="text-zinc-500 text-xs">Input</span>
                              <span className="font-mono text-zinc-300 text-xs">{isListening ? 'Mic Active' : 'Off'}</span>
                          </div>
                          <div className="flex justify-between items-center border-b border-zinc-800 pb-1.5">
                              <span className="text-zinc-500 text-xs">Instr.</span>
                              <select 
                                value={instrument}
                                onChange={(e) => setInstrument(e.target.value as any)}
                                className="bg-transparent border-none text-blue-400 font-mono text-xs outline-none text-right cursor-pointer"
                              >
                                <option value="guitar">Guitar</option>
                                <option value="bass">Bass</option>
                                <option value="ukulele">Ukulele</option>
                              </select>
                          </div>
                          <div className="flex justify-between items-center border-zinc-800 pt-0.5">
                              <span className="text-zinc-500 text-xs text-nowrap mr-2">MIDI Out</span>
                              <select 
                                value={selectedMidiOutputId}
                                onChange={handleMidiOutputChange}
                                className="bg-transparent border-none text-purple-400 font-mono text-xs outline-none text-right max-w-[140px] truncate cursor-pointer"
                              >
                                {midiOutputs.length === 0 && <option value="">None Available</option>}
                                {midiOutputs.map((out: any) => (
                                  <option key={out.id} value={out.id}>{out.name || "MIDI Port"}</option>
                                ))}
                              </select>
                          </div>
                      </div>
                  </div>
              </div>
            </div>

            {/* AI Heavy Metal Coach Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                {/* Complementary Riff Ideas */}
                <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800 shadow-xl flex flex-col h-48">
                    <h3 className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest mb-3 flex items-center gap-2">
                       <Zap size={12} className="text-yellow-500" /> Complementary Riffs & Progressions
                    </h3>
                    <div className="flex-1 bg-black/40 rounded-lg border border-zinc-800 p-3 text-xs leading-relaxed text-zinc-300 overflow-y-auto">
                       {aiMessages.filter(m => m.role === 'model').slice(-1)[0]?.text ? (
                          <div dangerouslySetInnerHTML={{ __html: aiMessages.filter(m => m.role === 'model').slice(-1)[0].text.replace(/\n/g, '<br/>') }} />
                       ) : (
                          "Play your instrument! Gemini will analyze your input and dynamically suggest complementary heavy metal riffs, chord progressions, and djent patterns to counter your playing here."
                       )}
                    </div>
                </div>

                {/* Technique & Drills */}
                <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800 shadow-xl flex flex-col h-48">
                    <h3 className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest mb-3 flex items-center gap-2">
                       <Activity size={12} className="text-green-500" /> Dynamic Technique & Drills
                    </h3>
                    <div className="flex-1 bg-black/40 rounded-lg border border-zinc-800 p-3 text-xs text-zinc-300 overflow-y-auto space-y-2">
                       <p className="text-zinc-500 mb-2">Tailored drills for your current key:</p>
                       <ul className="list-disc pl-4 space-y-2 text-zinc-400">
                          {(() => {
                             const root = currentChord ? currentChord.replace(/[^A-G#b]/g, '') : (audioState.note ? audioState.note.replace(/[0-9]/g, '') : 'E');
                             return (
                               <>
                                 <li><span className="text-indigo-400 font-bold">Sweep Picking:</span> 3-string triad arpeggios over <span className="font-mono text-zinc-300">{root} minor</span></li>
                                 <li><span className="text-orange-400 font-bold">Rhythm:</span> Djent syncopated zeroes in <span className="font-mono text-zinc-300">{root}</span></li>
                                 <li><span className="text-blue-400 font-bold">Fingerpicking:</span> Travis picking pattern bridging <span className="font-mono text-zinc-300">{root}</span> and its relative minor</li>
                               </>
                             );
                          })()}
                       </ul>
                    </div>
                </div>
            </div>

            {/* Guitar Fretboard Explorer */}
            <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800 shadow-xl flex flex-col gap-4 mt-6">
               <div className="flex justify-between items-center">
                  <h3 className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
                     🎸 Interactive Fretboard Explorer
                  </h3>
                  <div className="flex items-center gap-3">
                     <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                        <input type="checkbox" checked={fretboardAuto} onChange={(e) => setFretboardAuto(e.target.checked)} className="accent-indigo-500" />
                        Auto-follow Audio Profile
                     </label>
                  </div>
               </div>
               
               <div className="flex gap-4 mb-2">
                  <div className="flex flex-col gap-1 w-1/4">
                     <label className="text-[10px] text-zinc-500 uppercase font-bold">Root Note</label>
                     <select 
                       disabled={fretboardAuto}
                       value={fretboardAuto ? (currentChord ? currentChord.replace(/[^A-G#b]/g, '') : (audioState.note ? audioState.note.replace(/[0-9]/g, '') : 'E')) : fretboardRoot}
                       onChange={(e) => setFretboardRoot(e.target.value)}
                       className="bg-zinc-950 border border-zinc-800 rounded p-1.5 text-xs text-white outline-none focus:border-indigo-500 disabled:opacity-50"
                     >
                       {['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].map(note => <option key={note} value={note}>{note}</option>)}
                     </select>
                  </div>
                  <div className="flex flex-col gap-1 w-1/3">
                     <label className="text-[10px] text-zinc-500 uppercase font-bold">Scale / Pattern</label>
                     <select 
                       value={fretboardScale}
                       onChange={(e) => setFretboardScale(e.target.value)}
                       className="bg-zinc-950 border border-zinc-800 rounded p-1.5 text-xs text-white outline-none focus:border-indigo-500"
                     >
                       <optgroup label="Scales">
                         <option value="major">Major Scale</option>
                         <option value="minor">Natural Minor (Aeolian)</option>
                         <option value="harmonic minor">Harmonic Minor</option>
                         <option value="phrygian dominant">Phrygian Dominant</option>
                         <option value="diminished">Diminished</option>
                         <option value="minor pentatonic">Minor Pentatonic</option>
                         <option value="major pentatonic">Major Pentatonic</option>
                       </optgroup>
                       <optgroup label="Arpeggios">
                         <option value="major arpeggio">Major Arpeggio</option>
                         <option value="minor arpeggio">Minor Arpeggio</option>
                         <option value="diminished arpeggio">Diminished Arpeggio</option>
                         <option value="power chord">Power Chord (1-5)</option>
                       </optgroup>
                     </select>
                  </div>
               </div>

               <Fretboard 
                 rootNote={fretboardAuto ? (currentChord ? currentChord.replace(/[^A-G#b]/g, '') : (audioState.note ? audioState.note.replace(/[0-9]/g, '') : 'E')) : fretboardRoot} 
                 scaleType={fretboardScale} 
               />
               
            </div>

          </div>

          {/* Right Col: MIDI Log & AI Panel */}
          <div className="lg:col-span-4 flex flex-col gap-6 h-[600px] lg:h-auto">
            
            {/* Tab Switcher / Mode */}
            <div className="flex gap-2 p-1 bg-zinc-900 rounded-lg border border-zinc-800">
               <div className="flex-1 py-2 text-sm font-medium rounded-md bg-zinc-800 text-white shadow text-center flex items-center justify-center gap-2">
                 <Music size={14} className="text-purple-400" />
                 MIDI Log
               </div>
               <button 
                  onClick={toggleGemini}
                  className={`flex-1 py-2 text-sm font-medium rounded-md flex items-center justify-center gap-2 transition-colors lg:relative group ${aiStatus === ConnectionStatus.CONNECTED ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'}`}
               >
                  <Sparkles size={14} />
                  {aiStatus === ConnectionStatus.CONNECTED ? "Stop Jam" : "AI Jam"}
               </button>
            </div>
            
            {/* AI Jam Controls (visible when connecting/connected or expanded) */}
            <div className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-800 flex flex-col gap-3">
               <div className="flex justify-between items-center text-xs text-zinc-400">
                  <span>AI Jam Settings</span>
                  <Settings2 size={14} />
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="text-xs text-zinc-500 mb-1 block">Jam Style</label>
                   <select 
                     value={aiStyle}
                     onChange={(e) => setAiStyle(e.target.value as any)}
                     disabled={aiStatus === ConnectionStatus.CONNECTED}
                     className="w-full bg-zinc-800 border border-zinc-700 rounded p-1.5 text-sm text-zinc-200 outline-none disabled:opacity-50"
                   >
                      <option value="follow">Follow me</option>
                      <option value="lead">Play Lead</option>
                      <option value="rhythm">Play Rhythm</option>
                      <option value="metal">Pure Metal</option>
                      <option value="ethnic_metal">Ethnic Metal</option>
                   </select>
                 </div>
                 <div>
                   <label className="text-xs text-zinc-500 mb-1 block flex justify-between">
                     Sensitivity <span>{aiSensitivity}/10</span>
                   </label>
                   <input 
                     type="range" min="1" max="10" 
                     value={aiSensitivity}
                     onChange={(e) => setAiSensitivity(Number(e.target.value))}
                     disabled={aiStatus === ConnectionStatus.CONNECTED}
                     className="w-full mt-1 accent-indigo-500" 
                   />
                 </div>
               </div>
            </div>

            {/* Conditional View */}
            <div className="flex-1 relative overflow-hidden flex flex-col">
                
                {/* MIDI Log View */}
                <div className={`absolute inset-0 transition-opacity duration-300 ${aiStatus === ConnectionStatus.CONNECTED ? 'opacity-0 pointer-events-none' : 'opacity-100 z-10'}`}>
                    <MidiLog events={midiEvents} onExport={handleExportMidi} />
                </div>

                {/* AI Chat View */}
                <div className={`absolute inset-0 flex flex-col bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden transition-opacity duration-300 ${aiStatus === ConnectionStatus.CONNECTED ? 'opacity-100 z-10' : 'opacity-0 pointer-events-none'}`}>
                   <div className="p-4 border-b border-zinc-800 bg-indigo-900/10 flex justify-between items-center">
                      <span className="flex items-center gap-2 text-indigo-400 font-semibold">
                          <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></div>
                          Gemini Live Jam
                      </span>
                   </div>
                   
                   <div ref={chatRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                      {aiMessages.length === 0 && (
                          <div className="text-center text-zinc-600 mt-10">
                              <p className="text-sm">Start playing...</p>
                              <p className="text-xs mt-1">I'm listening to your guitar.</p>
                          </div>
                      )}
                      {aiMessages.map((msg, i) => (
                          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                              <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${msg.role === 'user' ? 'bg-zinc-800 text-white' : 'bg-indigo-600 text-white'}`}>
                                  {msg.text}
                              </div>
                          </div>
                      ))}
                   </div>
                   
                    <div className="p-3 border-t border-zinc-800 bg-zinc-900/50">
                       <div className="text-[10px] text-zinc-500 uppercase font-bold mb-2 tracking-tight">Theory & Progressions</div>
                       <div className="flex flex-wrap gap-2 mb-3">
                          <button 
                             onClick={() => sendQuickAction("Suggest a classic heavy metal riff progression in E minor.")}
                             className="px-2 py-1 bg-zinc-850 hover:bg-zinc-800 rounded border border-zinc-700 text-zinc-400 text-[10px] transition-colors"
                          >
                            Metal Riff (Em)
                          </button>
                          <button 
                             onClick={() => sendQuickAction("Listen to what I just played. Suggest a complementary heavy metal riff or progression.")}
                             className="px-2 py-1 bg-zinc-850 hover:bg-zinc-800 rounded border border-zinc-700 text-zinc-400 text-[10px] transition-colors"
                          >
                            Complement Riff
                          </button>
                          <button 
                             onClick={() => sendQuickAction("Suggest scales and keys for improvising over Dark Heavy Metal.")}
                             className="px-2 py-1 bg-zinc-850 hover:bg-zinc-800 rounded border border-zinc-700 text-zinc-400 text-[10px] transition-colors"
                          >
                            Dark Metal Scales
                          </button>
                          <button 
                             onClick={() => sendQuickAction("Suggest a syncopated Djent breakdown pattern.")}
                             className="px-2 py-1 bg-zinc-850 hover:bg-zinc-800 rounded border border-zinc-700 text-zinc-400 text-[10px] transition-colors"
                          >
                            Djent Breakdown
                          </button>
                          <button 
                             onClick={() => sendQuickAction("Provide a jazzy ii-V-I progression and explain the theory.")}
                             className="px-2 py-1 bg-zinc-850 hover:bg-zinc-800 rounded border border-zinc-700 text-zinc-400 text-[10px] transition-colors"
                          >
                            Jazz Theory
                          </button>
                          <button 
                             onClick={() => sendQuickAction("Suggest a bluesy chord progression in A major and explain its theoretical basis.")}
                             className="px-2 py-1 bg-zinc-850 hover:bg-zinc-800 rounded border border-zinc-700 text-zinc-400 text-[10px] transition-colors"
                          >
                            Blues Jam (A)
                          </button>
                          <button 
                             onClick={() => sendQuickAction("Analyze my current riff and suggest a bridge section.")}
                             className="px-2 py-1 bg-zinc-850 hover:bg-zinc-800 rounded border border-zinc-700 text-zinc-400 text-[10px] transition-colors"
                          >
                            Suggest Bridge
                          </button>
                       </div>

                       <div className="text-[10px] text-zinc-500 uppercase font-bold mb-2 tracking-tight">Technique & Drills</div>
                       <div className="flex flex-wrap gap-2">
                          <button 
                             onClick={() => sendQuickAction("Give me a 3-string sweep picking drill in A minor.")}
                             className="px-2 py-1 bg-indigo-900/20 hover:bg-indigo-900/40 rounded border border-indigo-500/30 text-indigo-400 text-[10px] transition-colors"
                          >
                            Sweep Picking
                          </button>
                          <button 
                             onClick={() => sendQuickAction("Suggest an economy picking exercise for speed.")}
                             className="px-2 py-1 bg-indigo-900/20 hover:bg-indigo-900/40 rounded border border-indigo-500/30 text-indigo-400 text-[10px] transition-colors"
                          >
                            Economy Picking
                          </button>
                          <button 
                             onClick={() => sendQuickAction("Give me a shred exercise for speed building.")}
                             className="px-2 py-1 bg-indigo-900/20 hover:bg-indigo-900/40 rounded border border-indigo-500/30 text-indigo-400 text-[10px] transition-colors"
                          >
                            Speed Drill
                          </button>
                       </div>
                    </div>
                    <div className="p-2 border-t border-zinc-800 text-[10px] text-center text-zinc-600">
                       Microphone is streaming to Gemini...
                    </div>
                </div>

            </div>

          </div>

        </main>
      )}
    </div>
  );
};

export default App;