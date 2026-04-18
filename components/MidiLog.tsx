import React, { useEffect, useRef } from 'react';
import { NoteEvent } from '../types';
import { Music, Download } from 'lucide-react';

interface MidiLogProps {
  events: NoteEvent[];
  onExport: () => void;
}

const MidiLog: React.FC<MidiLogProps> = ({ events, onExport }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  return (
    <div className="flex flex-col h-full bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden shadow-lg">
      <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur flex justify-between items-center">
        <h3 className="font-semibold text-zinc-200 flex items-center gap-2">
          <Music className="w-4 h-4 text-purple-400" />
          MIDI Stream
        </h3>
        <div className="flex items-center gap-2">
          <button 
            onClick={onExport}
            className="flex items-center gap-1 text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 rounded transition-colors"
          >
            <Download size={12} />
            Export
          </button>
          <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-1 rounded">Ch. 1</span>
        </div>
      </div>
      
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 space-y-1 scroll-smooth">
        {events.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-600 gap-2 opacity-50">
            <div className="w-2 h-2 rounded-full bg-zinc-700 animate-pulse"></div>
            <p className="text-sm">Listening for notes...</p>
          </div>
        ) : (
          events.map((evt) => (
            <div key={evt.id} className="flex items-center justify-between p-2 rounded hover:bg-zinc-800/50 group transition-colors border-l-2 border-transparent hover:border-purple-500">
               <div className="flex items-center gap-3">
                 <span className="text-zinc-500 font-mono text-xs">{new Date(evt.timestamp).toLocaleTimeString([], { second: '2-digit', fractionalSecondDigits: 1 } as any)}</span>
                 <span className="font-bold text-white w-8">{evt.note}</span>
               </div>
               <div className="flex items-center gap-4 text-xs font-mono text-zinc-400">
                 <span className="flex items-center gap-1">
                   FREQ <span className="text-zinc-300">{evt.frequency.toFixed(0)}</span>
                 </span>
                 <span className="flex items-center gap-1 text-purple-300">
                   MIDI <span className="text-white">{evt.midi}</span>
                 </span>
                 <span className="w-12 text-right text-zinc-600 group-hover:text-zinc-400">vel:{evt.velocity}</span>
               </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default MidiLog;