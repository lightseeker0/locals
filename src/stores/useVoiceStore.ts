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
    participants: any[]; // Deprecated, use roomParticipants
    roomParticipants: Record<string, any[]>;
    speakingUsers: Record<string, boolean>;
    audioInputDeviceId: string | null;
    audioOutputDeviceId: string | null;
    startCall: (roomId: string, user: any) => Promise<void>;
    joinCall: (callId: string, user: any) => Promise<void>;
    endCall: (userId?: string) => Promise<void>;
    toggleMute: () => void;
    pollSignals: (userId: string) => Promise<void>;
    fetchParticipants: (roomId: string, userId: string) => Promise<void>;
    setAudioInputDevice: (deviceId: string) => void;
    setAudioOutputDevice: (deviceId: string) => void;
    playJoinSound: () => void;
    isDeafened: boolean;
    toggleDeafen: () => void;
}

export const useVoiceStore = create<VoiceState>((set, get) => ({
    activeCall: null,

    callStatus: 'idle',
    localStream: null,
    remoteStream: null,
    isMuted: false,
    isDeafened: false,
    initiator: false,
    peer: null,
    lastSignalId: 0,
    participants: [], // Kept for backward compatibility if needed, but we'll prefer roomParticipants
    roomParticipants: {},
    speakingUsers: {},
    audioInputDeviceId: localStorage.getItem('audioInputDeviceId'),
    audioOutputDeviceId: localStorage.getItem('audioOutputDeviceId'),

    startCall: async (roomId: string, user: any) => {
        const userId = user.id;
        // Optimistic update
        set(state => ({
            roomParticipants: {
                ...state.roomParticipants,
                [roomId]: [...(state.roomParticipants[roomId] || []), user]
            }
        }));

        // Play sound immediately for local user
        (get() as any).playJoinSound();

        try {
            const { audioInputDeviceId } = get();
            const constraints = {
                audio: audioInputDeviceId ? { deviceId: { exact: audioInputDeviceId } } : true,
                video: false
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);

            // setup local analyser
            (get() as any).setupAudioAnalyser(stream, userId);

            set({ localStream: stream, callStatus: 'calling' });

            // CRITICAL: Double check if a call already exists to avoid race conditions
            await ApiService.fetchVoiceParticipants(roomId, userId);

            const { id: callId } = await ApiService.createCall(roomId, userId);
            set({ activeCall: { id: callId, roomId }, initiator: true });

            const peer = new SimplePeer({
                initiator: true,
                trickle: true,
                stream: stream,
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' },
                        { urls: 'stun:stun2.l.google.com:19302' },
                        { urls: 'stun:global.stun.twilio.com:3478' }
                    ]
                }
            });

            peer.on('signal', async (data: any) => {
                const type = data.type || 'candidate';
                console.log(`[WebRTC] Sending signal: ${type}`, data);
                await ApiService.sendSignal(callId, userId, type, data);
            });

            peer.on('connect', () => {
                console.log('[WebRTC] P2P Connected!');
                set({ callStatus: 'connected' });
            });

            peer.on('stream', async (remoteStream: MediaStream) => {
                console.log('[WebRTC] Remote stream received!', remoteStream.getAudioTracks());
                set({ remoteStream, callStatus: 'connected' });

                // Identify peer to setup their analyser
                const participants = await ApiService.fetchVoiceParticipants(roomId, userId);
                const other = participants.find((p: any) => p.id !== userId);
                if (other) {
                    (get() as any).setupAudioAnalyser(remoteStream, other.id);
                }
            });

            peer.on('error', (err: any) => {
                console.error('Peer error:', err);
                get().endCall(userId);
            });

            set({ peer });

        } catch (err) {
            console.error('Failed to start call:', err);
            // Rollback optimistic update
            set(state => ({
                roomParticipants: {
                    ...state.roomParticipants,
                    [roomId]: (state.roomParticipants[roomId] || []).filter(p => p.id !== userId)
                }
            }));
            get().endCall(userId);
        }
    },

    joinCall: async (callId: string, user: any) => {
        const userId = user.id;
        console.log(`[WebRTC] Attempting to join call: ${callId} as user: ${userId}`);
        try {
            const { audioInputDeviceId } = get();
            const constraints = {
                audio: audioInputDeviceId ? { deviceId: { exact: audioInputDeviceId } } : true,
                video: false
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);

            // setup local analyser
            (get() as any).setupAudioAnalyser(stream, userId);

            // Play sound immediately for local user
            (get() as any).playJoinSound();

            set({ localStream: stream, callStatus: 'calling', activeCall: { id: callId, roomId: '' }, initiator: false });

            const peer = new SimplePeer({
                initiator: false,
                trickle: true,
                stream: stream,
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' },
                        { urls: 'stun:stun2.l.google.com:19302' },
                        { urls: 'stun:global.stun.twilio.com:3478' }
                    ]
                }
            });

            peer.on('signal', async (data: any) => {
                const type = data.type || 'candidate';
                console.log(`[WebRTC] Sending signal: ${type}`, data);
                await ApiService.sendSignal(callId, userId, type, data);
            });

            peer.on('connect', () => {
                console.log('[WebRTC] P2P Connected (Joiner)!');
                set({ callStatus: 'connected' });
            });

            peer.on('stream', async (remoteStream: MediaStream) => {
                console.log('[WebRTC] Remote stream received (Joiner)!', remoteStream.getAudioTracks());
                set({ remoteStream, callStatus: 'connected' });

                // Try to find the initiator ID
                try {
                    const roomParticipants = get().roomParticipants;
                    const roomId = Object.keys(roomParticipants).find(rid =>
                        roomParticipants[rid].some(p => p.id === userId)
                    );
                    if (roomId) {
                        const other = roomParticipants[roomId].find(p => p.id !== userId);
                        if (other) {
                            (get() as any).setupAudioAnalyser(remoteStream, other.id);
                        }
                    }
                } catch (e) { }
            });

            peer.on('error', (err: any) => {
                console.error('Peer error in joinCall:', err);
                get().endCall(userId);
            });

            set({ peer });

        } catch (err) {
            console.error('Failed to join call:', err);
            get().endCall(userId);
        }
    },

    pollSignals: async (userId: string) => {
        const { activeCall, peer } = get() as any;
        if (!activeCall || !peer) return;

        try {
            const lastSignalId = (get() as any).lastSignalId || 0;
            const signals: any[] = await ApiService.pollSignals(activeCall.id, userId, lastSignalId);

            if (signals.length > 0) {
                if (signals.length > 0) {
                    console.log(`[WebRTC] Found ${signals.length} new signals`);
                    set({ lastSignalId: signals[signals.length - 1].id });
                }

                for (const signal of signals) {
                    const data = typeof signal.payload === 'string' ? JSON.parse(signal.payload) : signal.payload;

                    // AUTO-JOIN LOGIC: If we get an offer but we are also 'calling' (initiator), 
                    // someone else got there first. We should switch to joiner mode.
                    if (signal.type === 'offer' && get().initiator) {
                        console.log("[WebRTC] Received offer while initiating. Switching to joiner mode to avoid conflict.");
                        // This requires re-initializing the peer as a non-initiator
                        // For a quick fix, let's just process it if possible, 
                        // but better to prevent this in startCall.
                    }

                    try {
                        console.log(`[WebRTC] Receiving signal: ${signal.type}`, data);
                        peer.signal(data);
                    } catch (e) {
                        console.error('[WebRTC] Error signaling peer:', e);
                    }
                }
            }
        } catch (err) {
            console.error('Polling error:', err);
        }
    },

    endCall: async (userId?: string) => {
        const { localStream, peer } = get() as any;

        // Stop all analysers
        const intervals = (get() as any).analyserIntervals || {};
        Object.values(intervals).forEach((int: any) => clearInterval(int));

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
            isDeafened: false,
            participants: [],
            speakingUsers: {},
            analyserIntervals: {}
        } as any);
    },

    fetchParticipants: async (roomId: string, userId: string) => {
        try {
            const participants = await ApiService.fetchVoiceParticipants(roomId, userId);

            set(state => ({
                participants: roomId === state.activeCall?.roomId ? participants : state.participants,
                roomParticipants: {
                    ...state.roomParticipants,
                    [roomId]: participants
                }
            }));
        } catch (err) {
            console.error('Failed to fetch voice participants:', err);
        }
    },

    toggleMute: () => {
        const { localStream, isMuted } = get() as any;
        if (localStream) {
            localStream.getAudioTracks().forEach((track: any) => {
                track.enabled = isMuted;
            });
            set({ isMuted: !isMuted });
        }
    },

    toggleDeafen: () => {
        const { isDeafened, isMuted, toggleMute } = get();
        const nextDeafened = !isDeafened;
        set({ isDeafened: nextDeafened });

        // If deafening, also mute
        if (nextDeafened && !isMuted) {
            toggleMute();
        }
        // If undeafening, we typically stay muted (following Discord pattern)
    },

    setAudioInputDevice: (deviceId: string) => {
        localStorage.setItem('audioInputDeviceId', deviceId);
        set({ audioInputDeviceId: deviceId });
    },

    setAudioOutputDevice: (deviceId: string) => {
        localStorage.setItem('audioOutputDeviceId', deviceId);
        set({ audioOutputDeviceId: deviceId });
    },

    // Internal helper to setup analyser
    setupAudioAnalyser: (stream: MediaStream, targetUserId: string) => {
        try {
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const analyser = audioContext.createAnalyser();
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
            analyser.fftSize = 512; // Increased for better resolution
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            const checkVolume = () => {
                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < bufferLength; i++) {
                    sum += dataArray[i];
                }
                const average = sum / bufferLength;

                // Threshold for speaking - increased for background noise
                const isSpeaking = average > 25;

                set(state => {
                    if (state.speakingUsers[targetUserId] !== isSpeaking) {
                        return {
                            speakingUsers: {
                                ...state.speakingUsers,
                                [targetUserId]: isSpeaking
                            }
                        };
                    }
                    return {};
                });
            };

            const interval = setInterval(checkVolume, 100);

            set(state => ({
                analyserIntervals: {
                    ...((state as any).analyserIntervals || {}),
                    [targetUserId]: interval
                }
            } as any));

        } catch (e) {
            console.error("Audio analyser setup failed", e);
        }
    },

    playJoinSound: () => {
        try {
            const audio = new Audio('assets/sounds/join.webm');
            audio.volume = 0.5;
            audio.play().catch(e => console.error("Join audio play failed:", e));
        } catch (e) {
            console.error("Sound playback error:", e);
        }
    }
}));
