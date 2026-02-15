import { useEffect } from 'react';
import { useVoiceStore } from '../stores/useVoiceStore';
import { useAuthStore } from '../stores/authStore';

/**
 * Global hook to handle WebRTC signaling polling whenever a voice call is active.
 * This fixes the issue where handshakes weren't happening because the poll was inside
 * an unrendered component.
 */
export const useVoiceSignaling = () => {
    const { activeCall, pollSignals } = useVoiceStore();
    const { user } = useAuthStore();

    useEffect(() => {
        let interval: any;

        if (activeCall && user?.id) {
            console.log(`[WebRTC] Global signaling poll started for call: ${activeCall.id}`);

            // Initial poll
            pollSignals(user.id);

            // Poll every 333ms for fast handshake
            interval = setInterval(() => {
                const currentUser = useAuthStore.getState().user;
                if (currentUser?.id) {
                    pollSignals(currentUser.id);
                }
            }, 333);
        }

        return () => {
            if (interval) {
                console.log("[WebRTC] Global signaling poll stopped.");
                clearInterval(interval);
            }
        };
    }, [activeCall?.id, user?.id, pollSignals]);
};
