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
    startCall: (roomId: string, userId: string) => Promise<void>;
    joinCall: (callId: string, userId: string) => Promise<void>;
    endCall: (userId?: string) => Promise<void>;
    toggleMute: () => void;
    pollSignals: (userId: string) => Promise<void>;
    fetchParticipants: (roomId: string, userId: string) => Promise<void>;
    setAudioInputDevice: (deviceId: string) => void;
    setAudioOutputDevice: (deviceId: string) => void;
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
    participants: [], // Kept for backward compatibility if needed, but we'll prefer roomParticipants
    roomParticipants: {},
    speakingUsers: {},
    audioInputDeviceId: localStorage.getItem('audioInputDeviceId'),
    audioOutputDeviceId: localStorage.getItem('audioOutputDeviceId'),

    startCall: async (roomId: string, userId: string) => {
        try {
            const { audioInputDeviceId } = get();
            const constraints = {
                audio: audioInputDeviceId ? { deviceId: { exact: audioInputDeviceId } } : true,
                video: false
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);

            // setup analyser
            (get() as any).setupAudioAnalyser(stream, userId);

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
                // Setup remote analyser if we want to detect remote speaking locally (optional, usually we trust server or peer metadata, but for now purely client side volume check is eaisest)
                // Note: detecting *who* is speaking from a mixed remote stream in a mesh/SFU is hard without separate streams. 
                // If SimplePeer is 1:1, we know it's the other person. If mesh, we need separate peers.
                // Assuming 1:1 for now or handled via separate peers (current logic seems 1:1ish or simple mesh).
                // For now, we'll just visualise "someone is speaking" or if we have multiple peers we'd attach to each.
                // Current implementation seems to assume single peer connection for now?
            });

            (get() as any).peer = peer;

        } catch (err) {
            console.error('Failed to start call:', err);
            get().endCall(userId);
        }
    },

    joinCall: async (callId: string, userId: string) => {
        try {
            const { audioInputDeviceId } = get();
            const constraints = {
                audio: audioInputDeviceId ? { deviceId: { exact: audioInputDeviceId } } : true,
                video: false
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);

            // setup analyser
            (get() as any).setupAudioAnalyser(stream, userId);

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
                    }
                }
            }
        } catch (err) {
            console.error('Polling error:', err);
        }
    },

    endCall: async (userId?: string) => {
        const { localStream, peer } = get() as any;

        // Stop analyser
        const analyserInterval = (get() as any).analyserInterval;
        if (analyserInterval) clearInterval(analyserInterval);

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
            participants: [], // clear
            speakingUsers: {}
        });
    },

    fetchParticipants: async (roomId: string, userId: string) => {
        try {
            // We want to fetch participants for a specific room and UPDATE the roomParticipants map
            // BUT, the original API might just return a list.
            const participants = await ApiService.fetchVoiceParticipants(roomId, userId);

            set(state => ({
                participants: roomId === state.activeCall?.roomId ? participants : state.participants, // generic fallback
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

    setAudioInputDevice: (deviceId: string) => {
        localStorage.setItem('audioInputDeviceId', deviceId);
        set({ audioInputDeviceId: deviceId });
    },

    setAudioOutputDevice: (deviceId: string) => {
        // Note: setSinkId is not supported in all browsers/elements, mainly for HTMLMediaElement
        localStorage.setItem('audioOutputDeviceId', deviceId);
        set({ audioOutputDeviceId: deviceId });
    },

    // Internal helper to setup analyser
    setupAudioAnalyser: (stream: MediaStream, userId: string) => {
        try {
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const analyser = audioContext.createAnalyser();
            const microphone = audioContext.createMediaStreamSource(stream);
            microphone.connect(analyser);
            analyser.fftSize = 256;
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            const checkVolume = () => {
                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < bufferLength; i++) {
                    sum += dataArray[i];
                }
                const average = sum / bufferLength;

                // Threshold for speaking
                const isSpeaking = average > 10;

                set(state => {
                    if (state.speakingUsers[userId] !== isSpeaking) {
                        return {
                            speakingUsers: {
                                ...state.speakingUsers,
                                [userId]: isSpeaking
                            }
                        };
                    }
                    return {};
                });
            };

            const interval = setInterval(checkVolume, 100);
            set({ analyserInterval: interval } as any);
        } catch (e) {
            console.error("Audio analyser setup failed", e);
        }
    }
}));
