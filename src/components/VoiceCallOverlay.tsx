import React, { useEffect } from 'react';
import { useVoiceStore } from '../stores/useVoiceStore';
import { useAuthStore } from '../stores/authStore';
import { PhoneOff, Mic, MicOff } from 'lucide-react';
import { clsx } from 'clsx';

export const VoiceCallOverlay: React.FC = () => {
    const { activeCall, callStatus, localStream, remoteStream, isMuted, toggleMute, endCall, pollSignals } = useVoiceStore();
    const { user } = useAuthStore();

    useEffect(() => {
        let interval: any;
        if (activeCall && user) {
            interval = setInterval(() => {
                pollSignals(user.id);
            }, 500); // Poll every 500ms for faster connection
        }
        return () => clearInterval(interval);
    }, [activeCall, user, pollSignals]);

    if (callStatus === 'idle' || !activeCall) return null;

    return (
        <div className="fixed bottom-4 right-4 w-72 bg-matrix-darker border border-matrix-green/30 rounded-2xl shadow-2xl p-4 z-50 animate-fade-in-up">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-matrix-green animate-pulse" />
                    <span className="font-bold text-white text-sm">
                        {callStatus === 'connected' ? 'Connected' : 'Calling...'}
                    </span>
                </div>
                {/* Visualizer placeholder */}
                <div className="h-4 flex gap-0.5 items-end">
                    {[1, 2, 3, 4, 3, 2].map((h, i) => (
                        <div key={i} className="w-1 bg-matrix-green/50 rounded-full animate-bounce" style={{ height: `${h * 4}px`, animationDelay: `${i * 0.1}s` }} />
                    ))}
                </div>
            </div>

            {/* Audio Elements (Hidden) */}
            {localStream && <audio ref={(el) => { if (el) el.srcObject = localStream }} muted autoPlay />}
            {remoteStream && <audio ref={(el) => { if (el) el.srcObject = remoteStream }} autoPlay />}

            <div className="flex justify-center gap-4 mt-2">
                <button
                    onClick={toggleMute}
                    className={clsx(
                        "p-3 rounded-full transition-all",
                        isMuted ? "bg-red-500/20 text-red-500 hover:bg-red-500/30" : "bg-white/5 text-gray-300 hover:bg-white/10"
                    )}
                >
                    {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                </button>
                <button
                    onClick={() => endCall(user?.id)}
                    className="p-3 rounded-full bg-red-500 text-white hover:bg-red-600 transition-all shadow-lg hover:shadow-red-500/20"
                >
                    <PhoneOff size={20} />
                </button>
            </div>
        </div>
    );
};
