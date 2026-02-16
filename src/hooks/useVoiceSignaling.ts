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
        if (activeCall && user?.id) {
            console.log(`[WebRTC] Voice call active: ${activeCall.id}. Signal relay active via global WS + polling fallback.`);
            let cancelled = false;
            let timeout: any = null;

            const tick = async () => {
                if (cancelled) return;
                await pollSignals(user.id);
                const backoff = useVoiceStore.getState().pollingBackoff || 0;
                timeout = setTimeout(tick, 1200 + backoff);
            };

            tick();

            return () => {
                cancelled = true;
                if (timeout) clearTimeout(timeout);
            };
        }
    }, [activeCall?.id, user?.id]);
};
