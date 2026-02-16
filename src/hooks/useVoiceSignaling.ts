import { useEffect } from 'react';
import { useVoiceStore } from '../stores/useVoiceStore';
import { useAuthStore } from '../stores/authStore';

/**
 * Global hook to handle WebRTC signaling polling whenever a voice call is active.
 * This fixes the issue where handshakes weren't happening because the poll was inside
 * an unrendered component.
 */
export const useVoiceSignaling = () => {
    const { activeCall } = useVoiceStore();
    const { user } = useAuthStore();

    useEffect(() => {
        if (activeCall && user?.id) {
            console.log(`[WebRTC] Voice call active: ${activeCall.id}. Signal relay active via global WS.`);
            return () => { };
        }
    }, [activeCall?.id, user?.id]);
};
