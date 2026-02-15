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
        let timeoutId: any;
        let isActive = true;

        const pollLoop = async () => {
            if (!isActive || !activeCall || !user?.id) return;

            const { callStatus, pollingBackoff } = useVoiceStore.getState();

            // Fast polling (333ms) during handshake, slow polling (2000ms) once connected
            // Add extra backoff if server is currently failing (502/504)
            const interval = (callStatus === 'connected' ? 2000 : 333) + pollingBackoff;

            try {
                await pollSignals(user.id);
            } catch (err) {
                // Handled in pollSignals
            }

            if (isActive) {
                timeoutId = setTimeout(pollLoop, interval);
            }
        };

        if (activeCall && user?.id) {
            console.log(`[WebRTC] Global adaptive signaling poll started for call: ${activeCall.id}`);
            pollLoop();
        }

        return () => {
            isActive = false;
            if (timeoutId) {
                console.log("[WebRTC] Global signaling poll stopped.");
                clearTimeout(timeoutId);
            }
        };
    }, [activeCall?.id, user?.id, pollSignals]);

};
