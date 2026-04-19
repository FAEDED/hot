import React, { useState } from 'react';
import Fretboard from './Fretboard';
import { BookOpen, Activity, Crosshair } from 'lucide-react';

interface ScaleTheoryLabProps {
  initialRoot?: string;
}

const SCALE_LIBRARY = [
  { name: 'Natural Minor (Aeolian)', value: 'minor' },
  { name: 'Major (Ionian)', value: 'major' },
  { name: 'Harmonic Minor', value: 'harmonic minor' },
  { name: 'Phrygian Dominant', value: 'phrygian dominant' },
  { name: 'Diminished', value: 'diminished' },
  { name: 'Minor Pentatonic', value: 'minor pentatonic' },
  { name: 'Major Pentatonic', value: 'major pentatonic' },
  { name: 'Locrian', value: 'locrian' },
  { name: 'Dorian', value: 'dorian' },
  { name: 'Blues', value: 'blues' },
  { name: 'Hungarian Minor', value: 'hungarian minor' },
  { name: 'Byzantine', value: 'byzantine' },
  { name: 'Hirajoshi', value: 'hirajoshi' }
];

const ROOT_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const ScaleTheoryLab: React.FC<ScaleTheoryLabProps> = ({ initialRoot = 'E' }) => {
  const [rootNote, setRootNote] = useState(initialRoot);
  const [scaleType, setScaleType] = useState('phrygian dominant');
  const [technique, setTechnique] = useState('Sweep Picking');

  return (
    <div className="flex flex-col gap-6">
      
      {/* Top Controls */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row gap-6 items-end">
         
         <div className="flex-1 w-full flex flex-col gap-2">
            <h2 className="text-xl font-bold flex items-center gap-2 text-white">
               <BookOpen className="w-5 h-5 text-indigo-400" /> Theory & Scale Library
            </h2>
            <p className="text-zinc-500 text-sm">Explore exotic scales, fretboard patters, and targeted technical exercises.</p>
         </div>

         <div className="flex items-center gap-4 w-full md:w-auto">
            <div className="flex flex-col gap-1 w-24">
               <label className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Root</label>
               <select 
                 className="bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-sm text-white outline-none focus:border-indigo-500"
                 value={rootNote}
                 onChange={e => setRootNote(e.target.value)}
               >
                 {ROOT_NOTES.map(n => <option key={n} value={n}>{n}</option>)}
               </select>
            </div>
            
            <div className="flex flex-col gap-1 w-56">
               <label className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Scale / Mode</label>
               <select 
                 className="bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-sm text-white outline-none focus:border-indigo-500"
                 value={scaleType}
                 onChange={e => setScaleType(e.target.value)}
               >
                 {SCALE_LIBRARY.map(s => <option key={s.value} value={s.value}>{s.name}</option>)}
               </select>
            </div>
         </div>
      </div>

      {/* Fretboard Visualizer */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl flex flex-col gap-4">
         <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Master Fretboard (24 Frets)</h3>
         <Fretboard rootNote={rootNote} scaleType={scaleType} frets={24} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
         {/* Common Shapes / Patterns */}
         <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl flex flex-col gap-6">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
               <Crosshair className="w-4 h-4 text-purple-400" /> Scale Patterns & Sequences
            </h3>
            <p className="text-sm text-zinc-400">Common fingerings for <span className="font-bold text-white">{rootNote} {scaleType.replace(/\b\w/g, l => l.toUpperCase())}</span>.</p>
            
            <div className="space-y-4">
               <div>
                 <span className="text-xs font-bold text-purple-300">Position 1 (Root specific)</span>
                 <div className="mt-1"><Fretboard rootNote={rootNote} scaleType={scaleType} fretStart={0} fretEnd={5} /></div>
               </div>
               <div>
                 <span className="text-xs font-bold text-purple-300">Position 2 (Mid Neck)</span>
                 <div className="mt-1"><Fretboard rootNote={rootNote} scaleType={scaleType} fretStart={5} fretEnd={10} /></div>
               </div>
               <div>
                 <span className="text-xs font-bold text-purple-300">Position 3 (High Register)</span>
                 <div className="mt-1"><Fretboard rootNote={rootNote} scaleType={scaleType} fretStart={10} fretEnd={15} /></div>
               </div>
            </div>
         </div>

         {/* Practice Exercises */}
         <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl flex flex-col gap-4">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
               <Activity className="w-4 h-4 text-green-400" /> Technique Practice Lab
            </h3>
            
            <div className="flex gap-4">
               {['Sweep Picking', 'Alternate Picking', 'Legato', 'Djent Rhythm'].map(tech => (
                  <button 
                    key={tech}
                    onClick={() => setTechnique(tech)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${technique === tech ? 'bg-green-600/20 text-green-400 border border-green-500/50' : 'bg-zinc-950 text-zinc-500 border border-zinc-800 hover:text-zinc-300'}`}
                  >
                     {tech}
                  </button>
               ))}
            </div>

            <div className="bg-black/50 border border-zinc-800 rounded-xl p-5 mt-2 flex-1">
               <h4 className="font-bold text-white mb-2">{technique} Drill in {rootNote} {scaleType}</h4>
               
               {technique === 'Sweep Picking' && (
                 <div className="space-y-4">
                   <p className="text-zinc-400 text-sm leading-relaxed mb-4">
                     Practice 3-string and 5-string triad ascents and descents targeting the root, 3rd, and 5th intervals of the <strong className="text-white">{rootNote} {scaleType.replace(/\b\w/g, l => l.toUpperCase())}</strong> scale. Make sure your pick slants correctly so you glide across the strings in a single continuous motion. Mute the strings behind your fretting hand.
                   </p>
                   <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                     <h5 className="font-bold text-xs text-purple-400 mb-2">3-String Triad Arpeggios (Top Strings)</h5>
                     <Fretboard rootNote={rootNote} scaleType={scaleType} fretStart={5} fretEnd={12} />
                   </div>
                 </div>
               )}
               {technique === 'Alternate Picking' && (
                 <div className="space-y-4">
                   <p className="text-zinc-400 text-sm leading-relaxed mb-4">
                     Strict down-up-down-up mechanics sequence playing 3 notes per string traversing the <strong className="text-white">{rootNote} {scaleType.replace(/\b\w/g, l => l.toUpperCase())}</strong> scale vertically. Keep wrist movement minimal and rely on precise synchronization between hands. Use a metronome starting at 80 BPM!
                   </p>
                   <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                     <h5 className="font-bold text-xs text-green-400 mb-2">3-Note-Per-String Run (Mid Neck)</h5>
                     <Fretboard rootNote={rootNote} scaleType={scaleType} fretStart={4} fretEnd={9} />
                   </div>
                 </div>
               )}
               {technique === 'Legato' && (
                 <div className="space-y-4">
                   <p className="text-zinc-400 text-sm leading-relaxed mb-4">
                     Focus on hammer-ons and pull-offs within the <strong className="text-white">{rootNote} {scaleType.replace(/\b\w/g, l => l.toUpperCase())}</strong> scale to generate sound without picking. Target sequences of 4-6 notes per string block. Ensure the volume of your fretted notes matches the volume of picked notes.
                   </p>
                   <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                     <h5 className="font-bold text-xs text-blue-400 mb-2">Legato Trill Box (Upper Register)</h5>
                     <Fretboard rootNote={rootNote} scaleType={scaleType} fretStart={9} fretEnd={15} />
                   </div>
                 </div>
               )}
               {technique === 'Djent Rhythm' && (
                 <div className="space-y-4">
                   <p className="text-zinc-400 text-sm leading-relaxed mb-4">
                     Palm-mute the lowest string aggressively to chug the root note `<strong>{rootNote}</strong>`. Map the syncopated rhythm `0-0-0-0  0-0` against a 4/4 or odd-meter backing track. Let the higher dissonant intervals from the {scaleType} scale ring out to create tension.
                   </p>
                   <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                     <h5 className="font-bold text-xs text-red-500 mb-2">Dissonant Chord Intervals</h5>
                     <Fretboard rootNote={rootNote} scaleType={scaleType} fretStart={0} fretEnd={5} />
                   </div>
                 </div>
               )}

               <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-300 animate-pulse font-mono flex items-center justify-center min-h-[100px]">
                  Use the 'Master Fretboard' layout above to map these exercises up the neck.
               </div>
            </div>
         </div>
      </div>
    </div>
  );
};

export default ScaleTheoryLab;
