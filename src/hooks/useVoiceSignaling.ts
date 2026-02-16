import { useEffect } from 'react';
import { useVoiceStore } from '../stores/useVoiceStore';
import { useAuthStore } from '../stores/authStore';

/**
 * Global hook to handle WebRTC signaling polling whenever a voice call is active.
 * This fixes the issue where handshakes weren't happening because the poll was inside
 * an unrendered component.
 */
export const useVoiceSignaling = () => {
    const { activeCall, fetchParticipants } = useVoiceStore();
    const { user } = useAuthStore();

    useEffect(() => {
        if (activeCall && user?.id) {
            console.log(`[WebRTC] Voice call active: ${activeCall.id}. Signal relay active via global WS.`);

            // Reduce polling frequency as WebSockets handle the actual signaling
            // This is kept just to ensure we know who is in the room for Mesh initiation
            const interval = setInterval(() => {
                fetchParticipants(activeCall.roomId, user.id);
            }, 30000);

            return () => clearInterval(interval);
        }
    }, [activeCall?.id, user?.id, fetchParticipants]);
};
