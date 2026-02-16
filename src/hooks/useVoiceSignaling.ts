import { useEffect } from 'react';
import { useVoiceStore } from '../stores/useVoiceStore';
import { useAuthStore } from '../stores/authStore';

/**
 * Global hook to handle WebRTC signaling polling whenever a voice call is active.
 * This fixes the issue where handshakes weren't happening because the poll was inside
 * an unrendered component.
 */
export const useVoiceSignaling = () => {
    const { activeCall, connectWS, disconnectWS, fetchParticipants } = useVoiceStore();
    const { user } = useAuthStore();

    useEffect(() => {
        if (activeCall && user?.id) {
            console.log(`[WebRTC] Starting WebSocket signaling for call: ${activeCall.id}`);
            connectWS(user.id);

            // Periodically fetch participants to keep the list fresh
            // (even if WS is working, this is a good safety measure for UI)
            const interval = setInterval(() => {
                fetchParticipants(activeCall.roomId, user.id);
            }, 10000);

            return () => {
                console.log("[WebRTC] Stopping WebSocket signaling.");
                clearInterval(interval);
                disconnectWS();
            };
        }
    }, [activeCall?.id, user?.id, connectWS, disconnectWS, fetchParticipants]);

};
