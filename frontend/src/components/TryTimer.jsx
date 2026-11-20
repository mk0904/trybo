import { useState, useEffect } from 'react';
import { Timer } from 'lucide-react';

export default function TryTimer({ startedAt, durationSeconds = 900 }) {
  const [secondsLeft, setSecondsLeft] = useState(durationSeconds);

  useEffect(() => {
    if (!startedAt) return;

    function calculateRemaining() {
      const startMs = new Date(startedAt).getTime();
      const elapsedSec = Math.floor((Date.now() - startMs) / 1000);
      return Math.max(0, durationSeconds - elapsedSec);
    }

    setSecondsLeft(calculateRemaining());
    const interval = setInterval(() => {
      setSecondsLeft(calculateRemaining());
    }, 1000);

    return () => clearInterval(interval);
  }, [startedAt, durationSeconds]);

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const isUrgent = secondsLeft <= 120;

  return (
    <div
      className={`flex items-center justify-between px-4 py-3 rounded-2xl border ${
        isUrgent
          ? 'bg-rose-50 border-rose-200 text-rose-700'
          : 'bg-gradient-to-r from-[#FF3F6C] to-[#FF6B35] border-transparent text-white shadow-sm'
      }`}
    >
      <div className="flex items-center gap-2">
        <Timer size={18} className={isUrgent ? 'animate-pulse' : ''} />
        <div>
          <p className="text-xs font-semibold">15-Min Try Window</p>
          <p className={`text-[10px] ${isUrgent ? 'text-rose-500' : 'text-white/80'}`}>
            Rider is waiting at your doorstep
          </p>
        </div>
      </div>
      <span className="text-xl font-mono font-bold tabular-nums">
        {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
      </span>
    </div>
  );
}
