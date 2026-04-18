import React from 'react';

interface TunerProps {
  note: string | null;
  cents: number;
  frequency: number;
}

const Tuner: React.FC<TunerProps> = ({ note, cents, frequency }) => {
  // Calculate needle position (-45deg to 45deg)
  const rotation = Math.max(-100, Math.min(100, cents));
  const isInTune = Math.abs(cents) < 5 && note;

  return (
    <div className="flex flex-col items-center justify-center p-8 bg-zinc-900 rounded-2xl border border-zinc-800 shadow-xl relative overflow-hidden group h-full">
      {/* Background glow effect */}
      <div className={`absolute inset-0 opacity-10 transition-colors duration-500 ${isInTune ? 'bg-green-500' : 'bg-transparent'}`}></div>

      <div className="relative z-10 text-center w-full">
        <div className="text-zinc-500 text-xs font-bold mb-4 uppercase tracking-[0.2em]">Pitch Accuracy</div>
        
        {/* Main Display Container */}
        <div className="relative flex flex-col items-center">
            
            {/* Note Display - Massive and Centered */}
            <div className={`text-9xl font-black font-mono leading-none transition-all duration-200 ${isInTune ? 'text-green-400 scale-110' : 'text-white'}`}>
              {note || "--"}
            </div>

            {/* Cents Offset Display */}
            <div className={`mt-2 font-mono text-xl font-bold ${cents > 0 ? 'text-blue-400' : cents < 0 ? 'text-purple-400' : 'text-zinc-500'}`}>
              {note ? (cents > 0 ? `+${cents}` : cents) : "0"} <span className="text-xs uppercase opacity-50">cents</span>
            </div>
            
            {/* Frequency Display */}
            <div className="text-zinc-500 font-mono mt-4 text-sm bg-zinc-950 px-3 py-1 rounded-full border border-zinc-800">
              {frequency > 0 ? `${frequency.toFixed(2)} Hz` : "SILENT"}
            </div>
        </div>

        {/* Improved Digital Meter Overlay */}
        <div className="mt-8 relative h-12 w-full flex items-center justify-center">
           {/* Scale Background */}
           <div className="absolute inset-x-0 h-1 bg-zinc-800 rounded-full"></div>
           
           {/* Marker Lines */}
           <div className="absolute inset-x-0 flex justify-between px-2 h-4 pointer-events-none">
              {[-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50].map(m => (
                <div key={m} className={`w-0.5 ${m === 0 ? 'h-6 bg-zinc-500' : 'h-3 bg-zinc-700'} self-center`}></div>
              ))}
           </div>

           {/* Dynamic Needle/Shadow */}
           <div 
             className="absolute h-10 w-1 bg-gradient-to-b from-blue-400 to-purple-500 shadow-[0_0_15px_rgba(59,130,246,0.8)] transition-all duration-75 ease-out z-20"
             style={{ 
                left: `calc(50% + ${rotation}% )`,
                transform: 'translateX(-50%)'
             }}
           >
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-4 h-4 bg-blue-500/20 rounded-full blur-md"></div>
           </div>

           {/* "In Tune" Target Zone */}
           <div className="absolute left-1/2 -translate-x-1/2 w-[10%] h-2 bg-green-500/10 border-x border-green-500/20 rounded-sm"></div>
        </div>
        
        <div className="flex justify-between w-full text-[10px] text-zinc-600 mt-4 font-bold uppercase tracking-widest px-1">
           <span className={cents < -20 ? 'text-purple-500' : ''}>Flat</span>
           <span className={isInTune ? 'text-green-500' : ''}>Perfect</span>
           <span className={cents > 20 ? 'text-blue-500' : ''}>Sharp</span>
        </div>
      </div>
    </div>
  );
};

export default Tuner;