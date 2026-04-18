import React, { useState, useRef, useEffect } from 'react';
import { Upload, Music, Check, Loader2, Download, FileAudio, Settings, Play, Pause, Volume2 } from 'lucide-react';
import { AnalysisConfig, MidiAnalysisResult } from '../types';
import { geminiService } from '../services/geminiService';
import { generateMidiFile } from '../services/midiGeneration';

const analysisSteps = [
  "Uploading audio to Gemini...",
  "Analyzing spectral frequency patterns...",
  "Identifying key signature and scale...",
  "Detecting percussion and tempo...",
  "Transcribing polyphonic notes...",
  "Isolating tracks and channels...",
  "Generating MIDI event log...",
  "Finalizing analysis results..."
];

const FileAnalyzer: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [config, setConfig] = useState<AnalysisConfig>({
    mode: 'single',
    polyphony: 'monophonic',
    instrument: 'Guitar'
  });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [result, setResult] = useState<MidiAnalysisResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Custom Audio UI State
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [audioUrl, setAudioUrl] = useState<string>('');

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setAudioUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setAudioUrl('');
    }
  }, [file]);

  useEffect(() => {
    let interval: any;
    if (isAnalyzing) {
      interval = setInterval(() => {
        setAnalysisStep(prev => (prev + 1) % analysisSteps.length);
      }, 5000);
    } else {
      setAnalysisStep(0);
    }
    return () => clearInterval(interval);
  }, [isAnalyzing]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
      setIsPlaying(false);
      setCurrentTime(0);
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(err => {
        console.error("Playback failed:", err);
        setIsPlaying(false);
      });
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = Number(e.target.value);
    if (audioRef.current) {
      audioRef.current.volume = vol;
      setVolume(vol);
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const m = Math.floor(time / 60);
    const s = Math.floor(time % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleAnalyze = async () => {
    if (!file) return;

    setIsAnalyzing(true);
    setResult(null);

    try {
      const base64String = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const analysis = await geminiService.analyzeAudioFile(
        base64String,
        file.type,
        config
      );
      setResult(analysis);
    } catch (err: any) {
      console.error(err);
      alert("Analysis failed: " + (err.message || "Please try a different file format."));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const downloadMidi = () => {
    if (!result) return;
    const midiBytes = generateMidiFile(result);
    const blob = new Blob([midiBytes], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fretwiz_analysis_${Date.now()}.mid`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden shadow-lg p-6 gap-6 relative">
      <div className="flex items-center gap-3 border-b border-zinc-800 pb-4">
         <div className="p-2 bg-purple-500/20 rounded-lg">
           <Upload className="w-6 h-6 text-purple-400" />
         </div>
         <div>
           <h2 className="text-xl font-bold text-white">Audio to MIDI Analysis</h2>
           <p className="text-zinc-500 text-xs">Analyze uploaded audio files to extract key, tempo, and MIDI tracks.</p>
         </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left: Configuration */}
        <div className="space-y-6">
          
          {/* File Input */}
          <div 
             onClick={() => fileInputRef.current?.click()}
             className={`border-2 border-dashed rounded-xl h-32 flex flex-col items-center justify-center cursor-pointer transition-colors ${file ? 'border-green-500/50 bg-green-900/10' : 'border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800'}`}
          >
             <input ref={fileInputRef} type="file" accept="audio/mpeg, audio/wav, audio/aac, audio/x-m4a, audio/ogg, audio/flac, audio/webm, .mp3, .wav, .aac, .m4a, .ogg, .flac, .webm" className="hidden" onChange={handleFileChange} />
             {file ? (
               <>
                 <FileAudio className="w-8 h-8 text-green-400 mb-2" />
                 <span className="text-sm font-semibold text-green-300 text-center px-4 truncate w-full">{file.name}</span>
                 <span className="text-xs text-green-500/70">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
               </>
             ) : (
               <>
                 <Upload className="w-8 h-8 text-zinc-500 mb-2" />
                 <span className="text-sm text-zinc-400">Click to upload Audio</span>
                 <span className="text-xs text-zinc-600">MP3, WAV, AAC, M4A, OGG, FLAC supported</span>
               </>
             )}
          </div>
          
          {file && (
            <div className="bg-zinc-900/80 p-4 rounded-xl border border-zinc-700/80 flex flex-col gap-3 shadow-inner">
               <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                     <Music className="w-3 h-3" /> Audio Playback
                  </span>
                  {isPlaying && <span className="text-[10px] text-green-400 font-bold uppercase tracking-widest animate-pulse">Playing</span>}
               </div>
               
               <audio 
                 ref={audioRef} 
                 src={audioUrl || undefined} 
                 onTimeUpdate={handleTimeUpdate}
                 onLoadedMetadata={handleLoadedMetadata}
                 onEnded={() => setIsPlaying(false)}
                 className="hidden" 
               />
               
               <div className="flex items-center gap-4">
                  <button
                     onClick={togglePlay}
                     className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 rounded-full text-white transition-colors shadow-lg"
                  >
                     {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-1" />}
                  </button>
                  
                  <div className="flex-1 flex flex-col gap-1.5">
                     <div className="flex justify-between text-[10px] text-zinc-400 font-mono">
                       <span>{formatTime(currentTime)}</span>
                       <span>{formatTime(duration)}</span>
                     </div>
                     <input
                       type="range"
                       min="0"
                       max={duration || 100}
                       step="0.1"
                       value={currentTime}
                       onChange={handleSeek}
                       className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                     />
                  </div>

                  <div className="flex items-center gap-2 hidden sm:flex group relative">
                     <Volume2 className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
                     <input
                       type="range"
                       min="0"
                       max="1"
                       step="0.05"
                       value={volume}
                       onChange={handleVolumeChange}
                       className="w-16 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                     />
                  </div>
               </div>
            </div>
          )}

          {/* Settings */}
          <div className="space-y-4">
             <div className="flex items-center gap-2 text-zinc-300 font-semibold text-sm">
                <Settings className="w-4 h-4" /> Analysis Configuration
             </div>
             
             <div className="space-y-3">
               <label className="block">
                 <span className="text-xs text-zinc-500 uppercase tracking-wider block mb-1">Source Type</span>
                 <select 
                    value={config.mode}
                    onChange={(e) => setConfig({...config, mode: e.target.value as any})}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-white focus:outline-none focus:border-purple-500"
                 >
                   <option value="single">Single Instrument</option>
                   <option value="full_song">Full Song (Split Tracks)</option>
                 </select>
               </label>

               {config.mode === 'single' && (
                  <div className="grid grid-cols-2 gap-3">
                     <label className="block">
                       <span className="text-xs text-zinc-500 uppercase tracking-wider block mb-1">Instrument</span>
                       <select 
                          value={config.instrument}
                          onChange={(e) => setConfig({...config, instrument: e.target.value})}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-white focus:outline-none focus:border-purple-500"
                       >
                         <option value="Guitar">Guitar</option>
                         <option value="Piano">Piano</option>
                         <option value="Bass">Bass</option>
                         <option value="Violin">Violin</option>
                         <option value="Vocals">Vocals</option>
                       </select>
                     </label>

                     <label className="block">
                       <span className="text-xs text-zinc-500 uppercase tracking-wider block mb-1">Polyphony</span>
                       <select 
                          value={config.polyphony}
                          onChange={(e) => setConfig({...config, polyphony: e.target.value as any})}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-white focus:outline-none focus:border-purple-500"
                       >
                         <option value="monophonic">Monophonic</option>
                         <option value="polyphonic">Polyphonic</option>
                       </select>
                     </label>
                  </div>
               )}
             </div>
          </div>

          <button
             onClick={handleAnalyze}
             disabled={!file || isAnalyzing}
             className={`w-full py-3 rounded-lg font-bold text-sm shadow-lg flex items-center justify-center gap-2 transition-all ${!file || isAnalyzing ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' : 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-500 hover:to-indigo-500'}`}
          >
             {isAnalyzing ? <Loader2 className="animate-spin w-4 h-4" /> : <Music className="w-4 h-4" />}
             {isAnalyzing ? "Analyzing via Gemini..." : "Generate MIDI"}
          </button>
        </div>

        {/* Right: Results */}
        <div className="bg-zinc-950/50 rounded-xl border border-zinc-800/50 p-4 relative min-h-[300px] flex flex-col">
           {!result && !isAnalyzing && (
             <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-700 opacity-50">
               <Music className="w-12 h-12 mb-2" />
               <p className="text-sm">Results will appear here</p>
             </div>
           )}

           {isAnalyzing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-zinc-950/80 backdrop-blur-sm">
                 <Loader2 className="w-10 h-10 text-purple-500 animate-spin mb-4" />
                 
                 {/* Progress Bar Container */}
                 <div className="w-64 h-2 bg-zinc-800 rounded-full mb-4 overflow-hidden relative shadow-inner">
                    <div 
                      className="absolute top-0 left-0 bottom-0 bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-1000 ease-out" 
                      style={{ width: `${Math.max(10, ((analysisStep + 1) / analysisSteps.length) * 100)}%` }}
                    ></div>
                 </div>

                 <p className="text-sm font-medium text-purple-300 animate-pulse">{analysisSteps[analysisStep]}</p>
                 <p className="text-xs text-zinc-500 mt-1">
                    Step {analysisStep + 1} of {analysisSteps.length}
                 </p>
              </div>
           )}

           {result && (
             <div className="flex-1 flex flex-col animate-in fade-in zoom-in duration-300">
                <div className="grid grid-cols-2 gap-4 mb-6">
                   <div className="bg-zinc-900 rounded-lg p-3 border border-zinc-800">
                      <div className="text-xs text-zinc-500 uppercase flex justify-between">Key Signature</div>
                      <input 
                         type="text" 
                         className="text-2xl font-bold text-purple-400 bg-transparent border-none outline-none w-full border-b border-transparent hover:border-purple-500/50 focus:border-purple-500 transition-colors"
                         value={result.keySignature}
                         onChange={(e) => setResult({...result, keySignature: e.target.value})}
                      />
                   </div>
                   <div className="bg-zinc-900 rounded-lg p-3 border border-zinc-800">
                      <div className="text-xs text-zinc-500 uppercase flex justify-between">Tempo <span className="lowercase">({result.timeSignature})</span></div>
                      <div className="flex items-center gap-1 text-xl font-mono text-white">
                         <input 
                           type="number" 
                           className="w-16 bg-transparent border-none outline-none border-b border-transparent hover:border-indigo-500/50 focus:border-indigo-500 transition-colors"
                           value={result.tempo}
                           onChange={(e) => setResult({...result, tempo: Number(e.target.value) || 120})}
                         />
                         <span>BPM</span>
                      </div>
                   </div>
                </div>

                <div className="flex-1 overflow-y-auto mb-4 space-y-6">
                  <div>
                    <h3 className="text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wide">Identified Tracks ({result.tracks.length})</h3>
                    <div className="space-y-2">
                      {result.tracks.map((track, i) => (
                        <div key={i} className="flex items-center justify-between p-2 bg-zinc-800/50 rounded border border-zinc-700/50">
                           <div className="flex items-center gap-2">
                             <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                             <span className="text-sm font-medium text-white">{track.name}</span>
                             <span className="text-xs text-zinc-500 bg-zinc-800 px-1 rounded">Ch {track.channel + 1}</span>
                           </div>
                           <div className="text-xs text-zinc-400 font-mono">
                              {track.notes.length} notes
                           </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {result.structure && result.structure.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wide">Song Structure</h3>
                      <div className="space-y-2 border-l-2 border-zinc-800 ml-2 pl-4">
                        {result.structure.map((section, i) => (
                          <div key={i} className="relative">
                             <div className="absolute -left-[21px] top-1.5 w-2 h-2 rounded-full bg-purple-500 ring-4 ring-zinc-950"></div>
                             <div className="flex items-baseline justify-between mb-1">
                               <span className="text-sm font-semibold text-purple-300">{section.name}</span>
                               <span className="text-xs font-mono text-zinc-500">{Math.floor(section.startTime / 60)}:{(section.startTime % 60).toString().padStart(2, '0')} - {Math.floor(section.endTime / 60)}:{(section.endTime % 60).toString().padStart(2, '0')}</span>
                             </div>
                             <p className="text-xs text-zinc-400 leading-relaxed">{section.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <button 
                  onClick={downloadMidi}
                  className="w-full py-2 bg-zinc-100 hover:bg-white text-black font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download .MID File
                </button>
             </div>
           )}
        </div>
      </div>
    </div>
  );
};

export default FileAnalyzer;