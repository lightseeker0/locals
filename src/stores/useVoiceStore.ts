import { create } from 'zustand';
import { ApiService } from '../services/api';
// @ts-ignore
import SimplePeer from 'simple-peer/simplepeer.min.js';

interface VoiceState {
    activeCall: { id: string, roomId: string } | null;
    callStatus: 'idle' | 'calling' | 'connected' | 'ended';
    localStream: MediaStream | null;
    remoteStreams: Record<string, MediaStream>; // userId -> stream
    isMuted: boolean;
    peers: Record<string, any>; // userId -> SimplePeer
    lastSignalId: number;
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
    remoteStreams: {},
    isMuted: false,
    isDeafened: false,
    peers: {},
    lastSignalId: 0,
    roomParticipants: {},
    speakingUsers: {},
    audioInputDeviceId: localStorage.getItem('audioInputDeviceId'),
    audioOutputDeviceId: localStorage.getItem('audioOutputDeviceId'),

    startCall: async (roomId: string, user: any) => {
        const userId = user.id;
        (get() as any).playJoinSound();

        try {
            const { audioInputDeviceId } = get();
            const constraints = {
                audio: audioInputDeviceId ? { deviceId: { exact: audioInputDeviceId } } : true,
                video: false
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            (get() as any).setupAudioAnalyser(stream, userId);

            set({ localStream: stream, callStatus: 'calling' });

            const response = await ApiService.createCall(roomId, userId);
            const callId = response.id;
            const status = response.status;

            set({ activeCall: { id: callId, roomId } });

            if (status === 'joined') {
                console.log("[WebRTC] Joined existing call, initiating mesh connections...");
                const participants = await ApiService.fetchVoiceParticipants(roomId, userId);
                for (const p of participants) {
                    if (p.id !== userId) {
                        (get() as any).initiatePeerConnection(callId, userId, p.id, stream);
                    }
                }
            }

            await get().fetchParticipants(roomId, userId);

        } catch (err) {
            console.error('Failed to start call/join logic:', err);
            get().endCall(userId);
        }
    },

    joinCall: async (callId: string, user: any) => {
        const userId = user.id;
        const { activeCall } = get();
        const roomId = activeCall?.roomId || '';

        try {
            const { audioInputDeviceId } = get();
            const constraints = {
                audio: audioInputDeviceId ? { deviceId: { exact: audioInputDeviceId } } : true,
                video: false
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            (get() as any).setupAudioAnalyser(stream, userId);
            (get() as any).playJoinSound();

            set({ localStream: stream, callStatus: 'calling', activeCall: { id: callId, roomId } });

            // Fetch current participants to initiate connections with them
            const participants = await ApiService.fetchVoiceParticipants(roomId, userId);
            for (const p of participants) {
                if (p.id !== userId) {
                    (get() as any).initiatePeerConnection(callId, userId, p.id, stream);
                }
            }

        } catch (err) {
            console.error('Failed to join call:', err);
            get().endCall(userId);
        }
    },

    initiatePeerConnection: (callId: string, userId: string, targetId: string, stream: MediaStream) => {
        console.log(`[WebRTC] Initiating P2P with ${targetId}`);
        const peer = new SimplePeer({
            initiator: true,
            trickle: true,
            stream: stream,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:global.stun.twilio.com:3478' }
                ]
            }
        });

        peer.on('signal', async (data: any) => {
            // Signal payload includes target info
            await ApiService.sendSignal(callId, userId, data.type || 'signal', {
                signal: data,
                to: targetId,
                from: userId
            });
        });

        peer.on('connect', () => {
            console.log(`[WebRTC] Connected with ${targetId}`);
            set({ callStatus: 'connected' });
        });

        peer.on('stream', (remoteStream: MediaStream) => {
            console.log(`[WebRTC] Stream from ${targetId} received`);
            set(state => ({
                remoteStreams: { ...state.remoteStreams, [targetId]: remoteStream }
            }));
            (get() as any).setupAudioAnalyser(remoteStream, targetId);
        });

        set(state => ({
            peers: { ...state.peers, [targetId]: peer }
        }));
    },

    handleIncomingSignal: async (callId: string, userId: string, signalData: any, stream: MediaStream) => {
        const fromId = signalData.from;
        const payload = signalData.signal;
        let peer = get().peers[fromId];

        if (!peer) {
            console.log(`[WebRTC] Creating peer for incoming signal from ${fromId}`);
            peer = new SimplePeer({
                initiator: false,
                trickle: true,
                stream: stream,
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:global.stun.twilio.com:3478' }
                    ]
                }
            });

            peer.on('signal', async (data: any) => {
                await ApiService.sendSignal(callId, userId, data.type || 'signal', {
                    signal: data,
                    to: fromId,
                    from: userId
                });
            });

            peer.on('stream', (remoteStream: MediaStream) => {
                set(state => ({
                    remoteStreams: { ...state.remoteStreams, [fromId]: remoteStream }
                }));
                (get() as any).setupAudioAnalyser(remoteStream, fromId);
            });

            set(state => ({
                peers: { ...state.peers, [fromId]: peer }
            }));
        }

        peer.signal(payload);
    },

    pollSignals: async (userId: string) => {
        const { activeCall, localStream } = get();
        if (!activeCall || !localStream) return;

        try {
            const lastSignalId = get().lastSignalId || 0;
            const signals: any[] = await ApiService.pollSignals(activeCall.id, userId, lastSignalId);

            if (signals.length > 0) {
                set({ lastSignalId: signals[signals.length - 1].id });

                for (const signal of signals) {
                    const data = typeof signal.payload === 'string' ? JSON.parse(signal.payload) : signal.payload;

                    // Filter: Only process signals meant for US
                    if (data.to === userId) {
                        await (get() as any).handleIncomingSignal(activeCall.id, userId, data, localStream);
                    }
                }
            }
        } catch (err) {
            console.error('Polling error:', err);
        }
    },

    endCall: async (userId?: string) => {
        const { localStream, peers } = get();

        // Stop all analysers
        const intervals = (get() as any).analyserIntervals || {};
        Object.values(intervals).forEach((int: any) => clearInterval(int));

        if (userId) {
            try {
                await ApiService.endCall(userId);
            } catch (e) { }
        }

        if (localStream) {
            localStream.getTracks().forEach((t: any) => t.stop());
        }

        Object.values(peers).forEach((p: any) => {
            try { p.destroy(); } catch (e) { }
        });

        set({
            activeCall: null,
            callStatus: 'idle',
            localStream: null,
            remoteStreams: {},
            peers: {},
            lastSignalId: 0,
            roomParticipants: {},
            speakingUsers: {},
            analyserIntervals: {}
        } as any);
    },

    fetchParticipants: async (roomId: string, userId: string) => {
        try {
            const participants = await ApiService.fetchVoiceParticipants(roomId, userId);
            set(state => ({
                roomParticipants: {
                    ...state.roomParticipants,
                    [roomId]: participants
                }
            }));
        } catch (err) { }
    },

    toggleMute: () => {
        const { localStream, isMuted } = get();
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
        if (nextDeafened && !isMuted) toggleMute();
    },

    setAudioInputDevice: (deviceId: string) => {
        localStorage.setItem('audioInputDeviceId', deviceId);
        set({ audioInputDeviceId: deviceId });
    },

    setAudioOutputDevice: (deviceId: string) => {
        localStorage.setItem('audioOutputDeviceId', deviceId);
        set({ audioOutputDeviceId: deviceId });
    },

    setupAudioAnalyser: (stream: MediaStream, targetUserId: string) => {
        try {
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const analyser = audioContext.createAnalyser();
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
            analyser.fftSize = 512;
            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            const interval = setInterval(() => {
                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
                const average = sum / dataArray.length;
                const isSpeaking = average > 25;

                set(state => {
                    if (state.speakingUsers[targetUserId] !== isSpeaking) {
                        return { speakingUsers: { ...state.speakingUsers, [targetUserId]: isSpeaking } };
                    }
                    return {};
                });
            }, 100);

            set(state => ({
                analyserIntervals: { ...((state as any).analyserIntervals || {}), [targetUserId]: interval }
            } as any));
        } catch (e) { }
    },

    playJoinSound: () => {
        try {
            const audio = new Audio('assets/sounds/join.webm');
            audio.volume = 0.5;
            audio.play().catch(() => { });
        } catch (e) { }
    }
}));
