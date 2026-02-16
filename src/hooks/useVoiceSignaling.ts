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
        if ((import.meta.env.VITE_VOICE_MODE || 'mesh').toLowerCase() === 'sfu') {
            return;
        }
        if (activeCall && user?.id) {
            console.log(`[WebRTC] Voice call active: ${activeCall.id}. Signal relay active via global WS + polling fallback.`);
            let cancelled = false;
            let timeout: any = null;

            const tick = async () => {
                if (cancelled) return;
                const keepPolling = await pollSignals(user.id);
                if (!keepPolling) return;
                const state = useVoiceStore.getState();
                const backoff = state.pollingBackoff || 0;
                const baseInterval = state.wsStatus === 'connected' ? 4000 : 300;
                timeout = setTimeout(tick, baseInterval + backoff);
            };

            tick();

            return () => {
                cancelled = true;
                if (timeout) clearTimeout(timeout);
            };
        }
    }, [activeCall?.id, user?.id]);
};
