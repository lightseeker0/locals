import { create } from 'zustand';
import { ApiService } from '../services/api';
// @ts-ignore
import SimplePeer from 'simple-peer/simplepeer.min.js';

interface VoiceState {
    activeCall: { id: string, roomId: string } | null;
    callStatus: 'idle' | 'calling' | 'connected' | 'ended';
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
    isMuted: boolean;
    initiator: boolean;
    peer: SimplePeer.Instance | null;
    lastSignalId: number;
    participants: any[];
    startCall: (roomId: string, userId: string) => Promise<void>;
    joinCall: (callId: string, userId: string) => Promise<void>;
    endCall: (userId?: string) => Promise<void>;
    toggleMute: () => void;
    pollSignals: (userId: string) => Promise<void>;
    fetchParticipants: (roomId: string, userId: string) => Promise<void>;
}

export const useVoiceStore = create<VoiceState>((set, get) => ({
    activeCall: null,
    callStatus: 'idle',
    localStream: null,
    remoteStream: null,
    isMuted: false,
    initiator: false,
    peer: null,
    lastSignalId: 0,
    participants: [],

    startCall: async (roomId: string, userId: string) => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            set({ localStream: stream, callStatus: 'calling', initiator: true });

            const { id: callId } = await ApiService.createCall(roomId, userId);
            set({ activeCall: { id: callId, roomId } });

            const peer = new SimplePeer({
                initiator: true,
                trickle: false,
                stream: stream
            });

            peer.on('signal', async (data: any) => {
                await ApiService.sendSignal(callId, userId, 'offer', data);
            });

            peer.on('stream', (remoteStream: MediaStream) => {
                set({ remoteStream, callStatus: 'connected' });
            });

            // Store peer instance logic would go here (needs modification to store non-serializable object)
            (get() as any).peer = peer;

        } catch (err) {
            console.error('Failed to start call:', err);
            get().endCall(userId);
        }
    },

    joinCall: async (callId: string, userId: string) => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            set({ localStream: stream, callStatus: 'calling', activeCall: { id: callId, roomId: '' }, initiator: false });

            const peer = new SimplePeer({
                initiator: false,
                trickle: false,
                stream: stream
            });

            peer.on('signal', async (data: any) => {
                await ApiService.sendSignal(callId, userId, 'answer', data);
            });

            peer.on('stream', (remoteStream: MediaStream) => {
                set({ remoteStream, callStatus: 'connected' });
            });

            (get() as any).peer = peer;

        } catch (err) {
            console.error('Failed to join call:', err);
            get().endCall(userId);
        }
    },

    pollSignals: async (userId: string) => {
        const { activeCall, initiator, peer } = get() as any;
        if (!activeCall || !peer) return;

        try {
            // In a real app, storing lastSignalId in state is better
            const lastSignalId = (get() as any).lastSignalId || 0;
            const signals: any[] = await ApiService.pollSignals(activeCall.id, userId, lastSignalId);

            if (signals.length > 0) {
                set({ lastSignalId: signals[signals.length - 1].id });

                for (const signal of signals) {
                    const data = JSON.parse(signal.payload);
                    if (signal.type === 'offer' && !initiator) {
                        peer.signal(data);
                    } else if (signal.type === 'answer' && initiator) {
                        peer.signal(data);
                    } else if (signal.type === 'candidate') {
                        // peer.signal(data); // Simple-peer handles candidates within offer/answer mostly, but explicit candidates can be signaled
                    }
                }
            }
        } catch (err) {
            console.error('Polling error:', err);
        }
    },

    endCall: async (userId?: string) => {
        const { localStream, peer } = get() as any;

        if (userId) {
            try {
                await ApiService.endCall(userId);
            } catch (err) {
                console.error('Failed to notify backend about ending call:', err);
            }
        }

        if (localStream) {
            localStream.getTracks().forEach((t: any) => t.stop());
        }
        if (peer) {
            try {
                peer.destroy();
            } catch (e) {
                console.error('Peer destroy error:', e);
            }
        }
        set({
            activeCall: null,
            callStatus: 'idle',
            localStream: null,
            remoteStream: null,
            peer: null,
            lastSignalId: 0,
            initiator: false,
            isMuted: false,
            participants: []
        });
    },

    fetchParticipants: async (roomId: string, userId: string) => {
        try {
            const participants = await ApiService.fetchVoiceParticipants(roomId, userId);
            set({ participants });
        } catch (err) {
            console.error('Failed to fetch voice participants:', err);
        }
    },

    toggleMute: () => {
        const { localStream, isMuted } = get() as any;
        if (localStream) {
            localStream.getAudioTracks().forEach((track: any) => {
                track.enabled = isMuted; // If currently muted, we want to enable (unmute)
            });
            set({ isMuted: !isMuted });
        }
    }
}));
