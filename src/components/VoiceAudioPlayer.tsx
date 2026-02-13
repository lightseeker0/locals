import React from 'react';
import { useVoiceStore } from '../stores/useVoiceStore';

export const VoiceAudioPlayer: React.FC = () => {
    const { remoteStream, audioOutputDeviceId, isDeafened } = useVoiceStore();
    const audioRef = React.useRef<HTMLAudioElement>(null);

    React.useEffect(() => {
        if (audioRef.current && remoteStream) {
            console.log("Setting remote stream to audio element", remoteStream.getAudioTracks());
            audioRef.current.srcObject = remoteStream;

            // Set output device if supported (Chromium/Electron)
            if (audioOutputDeviceId && (audioRef.current as any).setSinkId) {
                (audioRef.current as any).setSinkId(audioOutputDeviceId)
                    .catch((err: any) => console.error("Failed to set output device:", err));
            }

            // Force play
            audioRef.current.play().catch(e => console.error("Auto-play failed:", e));
        }
    }, [remoteStream, audioOutputDeviceId]);

    return (
        <audio
            ref={audioRef}
            autoPlay
            muted={isDeafened}
            style={{ display: 'none' }}
        />
    );
};
