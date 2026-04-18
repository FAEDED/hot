import React, { useMemo } from 'react';

interface FretboardProps {
  rootNote: string; // e.g., 'E', 'A#'
  scaleType: string; // e.g., 'minor', 'major', 'phrygian dominant', 'minor pentatonic', 'minor arpeggio'
  frets?: number;
  highlightPattern?: { stringIdx: number, fretIdx: number }[];
  fretStart?: number;
  fretEnd?: number;
}

const STRINGS = ['E4', 'B3', 'G3', 'D3', 'A2', 'E2'];

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const SCALE_INTERVALS: Record<string, number[]> = {
  'major': [0, 2, 4, 5, 7, 9, 11],
  'minor': [0, 2, 3, 5, 7, 8, 10],
  'harmonic minor': [0, 2, 3, 5, 7, 8, 11],
  'phrygian dominant': [0, 1, 4, 5, 7, 8, 10],
  'diminished': [0, 2, 3, 5, 6, 8, 9, 11],
  'minor pentatonic': [0, 3, 5, 7, 10],
  'major pentatonic': [0, 2, 4, 7, 9],
  'major arpeggio': [0, 4, 7],
  'minor arpeggio': [0, 3, 7],
  'diminished arpeggio': [0, 3, 6],
  'power chord': [0, 7],
  'locrian': [0, 1, 3, 5, 6, 8, 10],
  'dorian': [0, 2, 3, 5, 7, 9, 10],
  'blues': [0, 3, 5, 6, 7, 10],
  'hungarian minor': [0, 2, 3, 6, 7, 8, 11],
  'byzantine': [0, 1, 4, 5, 7, 8, 11],
  'hirajoshi': [0, 2, 3, 7, 8]
};

const getNoteIndex = (note: string) => {
  // Normalize flat to sharp for simpler logic if needed
  const normalized = note.replace('Db', 'C#').replace('Eb', 'D#').replace('Gb', 'F#').replace('Ab', 'G#').replace('Bb', 'A#');
  return NOTES.indexOf(normalized.replace(/\d+$/, ''));
};

const Fretboard: React.FC<FretboardProps> = ({ rootNote, scaleType, frets = 24, highlightPattern, fretStart = 0, fretEnd = frets }) => {
  
  const activeNotes = useMemo(() => {
    if (!rootNote || !scaleType) return new Set<number>();
    const rootIndex = getNoteIndex(rootNote);
    if (rootIndex === -1) return new Set<number>();
    
    const intervals = SCALE_INTERVALS[scaleType.toLowerCase()] || SCALE_INTERVALS['minor'];
    return new Set(intervals.map(interval => (rootIndex + interval) % 12));
  }, [rootNote, scaleType]);

  const rootIndex = useMemo(() => getNoteIndex(rootNote), [rootNote]);

  const markers = [3, 5, 7, 9, 15, 17, 19, 21];
  const doubleMarkers = [12, 24];

  // Adjust display frets based on fretStart and fretEnd constraints
  const displayFrets = Array.from({ length: fretEnd - fretStart + 1 }).map((_, i) => fretStart + i);

  return (
    <div className="w-full overflow-x-auto bg-zinc-900 rounded-xl border border-zinc-800 p-4 shadow-inner">
       <div className="min-w-[max-content] relative">
          
          {/* Fret Markers */}
          <div className="flex pl-8 mb-2">
            {displayFrets.map((fret) => (
              <div key={`marker-${fret}`} className="flex-1 min-w-[40px] flex flex-col justify-center items-center text-[10px] text-zinc-500 font-bold">
                 {markers.includes(fret) && <div className="w-2 h-2 rounded-full bg-zinc-700"></div>}
                 {doubleMarkers.includes(fret) && <div className="flex gap-1"><div className="w-2 h-2 rounded-full bg-zinc-700"></div><div className="w-2 h-2 rounded-full bg-zinc-700"></div></div>}
                 <span className={markers.includes(fret) || doubleMarkers.includes(fret) ? "mt-1" : "opacity-0"}>{fret}</span>
              </div>
            ))}
          </div>

          {/* Strings */}
          <div className="relative">
            {STRINGS.map((openString, stringIdx) => {
              const openNoteIndex = getNoteIndex(openString);
              return (
                <div key={stringIdx} className="flex relative items-center h-8">
                  {/* String Line */}
                  <div className="absolute left-6 right-0 h-[2px] bg-zinc-400 shadow-sm z-0" style={{ opacity: 1 - (stringIdx * 0.1) }}></div>
                  
                  {/* Open String Label */}
                  <div className="w-8 font-mono text-xs font-bold text-zinc-500 z-10 bg-zinc-900 absolute left-0 text-center">
                    {openString.replace(/\d/, '')}
                  </div>

                  {/* Frets for this string */}
                  <div className="flex-1 flex pl-8 relative z-10">
                    {displayFrets.map((fretIdx) => {
                      const noteIndex = (openNoteIndex + fretIdx) % 12;
                      const isActive = activeNotes.has(noteIndex);
                      const isRoot = noteIndex === rootIndex;
                      const isPatternTarget = highlightPattern ? highlightPattern.some(p => p.stringIdx === stringIdx && p.fretIdx === fretIdx) : true;
                      const showNote = isActive && isPatternTarget;
                      
                      return (
                        <div key={`${stringIdx}-${fretIdx}`} className="flex-1 min-w-[40px] border-r border-zinc-700/50 flex items-center justify-center relative h-8">
                           {/* Nut */}
                           {fretIdx === 0 && <div className="absolute right-0 w-1 h-full bg-zinc-300 z-0"></div>}
                           
                           {/* Note Dot */}
                           {showNote && fretIdx > 0 && (
                             <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold z-20 shadow border ${isRoot ? 'bg-indigo-500 text-white border-indigo-400 scale-110' : 'bg-zinc-700 text-zinc-200 border-zinc-600'}`}>
                               {NOTES[noteIndex]}
                             </div>
                           )}
                           {showNote && fretIdx === 0 && (
                             <div className={`absolute -left-5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold z-20 ${isRoot ? 'bg-indigo-500 text-white' : 'bg-transparent text-zinc-300 border border-zinc-600'}`}>
                               {NOTES[noteIndex]}
                             </div>
                           )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
       </div>
    </div>
  );
};

export default Fretboard;
