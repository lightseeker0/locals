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
    pendingPeers: Set<string>; // IDs we are currently connecting to
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
    removePeer: (targetId: string) => void;
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
    pendingPeers: new Set(),
    lastSignalId: 0,
    roomParticipants: {},
    speakingUsers: {},
    audioInputDeviceId: localStorage.getItem('audioInputDeviceId'),
    audioOutputDeviceId: localStorage.getItem('audioOutputDeviceId'),

    startCall: async (roomId: string, user: any) => {
        const userId = user.id;
        const { activeCall } = get();
        if (activeCall?.roomId === roomId) return;
        if (activeCall) await get().endCall(userId);

        (get() as any).playJoinSound();

        try {
            const { audioInputDeviceId } = get();
            console.log(`[WebRTC] Starting call in room ${roomId} (Device: ${audioInputDeviceId || 'default'})`);

            const constraints = {
                audio: {
                    deviceId: audioInputDeviceId ? { exact: audioInputDeviceId } : undefined,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 48000,
                    channelCount: 1
                },
                video: false
            };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            console.log("[WebRTC] Local stream acquired, tracks:", stream.getAudioTracks().map(t => `${t.label} (enabled: ${t.enabled})`));

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
                        if (userId < p.id) {
                            console.log(`[WebRTC] Mesh (Start): Initiating with ${p.id} (${userId} < ${p.id})`);
                            (get() as any).initiatePeerConnection(callId, userId, p.id, stream);
                        } else {
                            console.log(`[WebRTC] Mesh (Start): Waiting for ${p.id} to initiate (${userId} > ${p.id})`);
                        }
                    }
                }
            }

            await get().fetchParticipants(roomId, userId);

        } catch (err) {
            console.error('[WebRTC] Failed to start call/join logic:', err);
            get().endCall(userId);
        }
    },

    joinCall: async (callId: string, user: any) => {
        const userId = user.id;
        const { activeCall } = get();
        const roomId = activeCall?.roomId || '';

        try {
            const { audioInputDeviceId } = get();
            console.log(`[WebRTC] Joining call ${callId} (Device: ${audioInputDeviceId || 'default'})`);

            const constraints = {
                audio: {
                    deviceId: audioInputDeviceId ? { exact: audioInputDeviceId } : undefined,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
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
                    if (userId < p.id) {
                        console.log(`[WebRTC] Mesh (Join): Initiating with ${p.id} (${userId} < ${p.id})`);
                        (get() as any).initiatePeerConnection(callId, userId, p.id, stream);
                    } else {
                        console.log(`[WebRTC] Mesh (Join): Waiting for ${p.id} to initiate (${userId} > ${p.id})`);
                    }
                }
            }

        } catch (err) {
            console.error('[WebRTC] Failed to join call:', err);
            get().endCall(userId);
        }
    },

    initiatePeerConnection: (callId: string, userId: string, targetId: string, stream: MediaStream) => {
        const { peers, pendingPeers } = get();
        if (peers[targetId] || pendingPeers.has(targetId)) return;

        console.log(`[WebRTC] Initiating P2P with ${targetId}`);
        const newPending = new Set(pendingPeers);
        newPending.add(targetId);
        set({ pendingPeers: newPending });

        try {
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
                console.log(`[WebRTC] Outgoing signal to ${targetId}: ${data.type || 'ice'}`);
                await ApiService.sendSignal(callId, userId, data.type || 'signal', {
                    signal: data,
                    to: targetId,
                    from: userId
                });
            });

            peer.on('connect', () => {
                console.log(`[WebRTC] Connected with ${targetId}. Signaling state stable.`);
                set(state => {
                    const nextPending = new Set(state.pendingPeers);
                    nextPending.delete(targetId);
                    return { callStatus: 'connected', pendingPeers: nextPending };
                });
                const roomId = get().activeCall?.roomId;
                if (roomId) get().fetchParticipants(roomId, userId);
            });

            peer.on('stream', (remoteStream: MediaStream) => {
                console.log(`[WebRTC] Remote stream FROM ${targetId} received. Tracks:`, remoteStream.getAudioTracks().length);
                set(state => ({
                    remoteStreams: { ...state.remoteStreams, [targetId]: remoteStream }
                }));
                (get() as any).setupAudioAnalyser(remoteStream, targetId);
            });

            peer.on('error', (err: any) => {
                console.error(`[WebRTC] Peer error with ${targetId}:`, err);
                get().removePeer(targetId);
            });

            peer.on('close', () => {
                console.log(`[WebRTC] Peer closed with ${targetId}`);
                get().removePeer(targetId);
            });

            set(state => ({
                peers: { ...state.peers, [targetId]: peer }
            }));
        } catch (e) {
            console.error(`[WebRTC] Failed to create peer for ${targetId}:`, e);
            set(state => {
                const nextPending = new Set(state.pendingPeers);
                nextPending.delete(targetId);
                return { pendingPeers: nextPending };
            });
        }
    },

    removePeer: (targetId: string) => {
        set(state => {
            const newPeers = { ...state.peers };
            const newStreams = { ...state.remoteStreams };
            if (newPeers[targetId]) {
                try { newPeers[targetId].destroy(); } catch (e) { }
                delete newPeers[targetId];
            }
            delete newStreams[targetId];

            const pending = new Set(state.pendingPeers);
            pending.delete(targetId);

            return {
                peers: newPeers,
                remoteStreams: newStreams,
                pendingPeers: pending
            };
        });
    },

    handleIncomingSignal: async (callId: string, userId: string, signalData: any, stream: MediaStream) => {
        const fromId = signalData.from;
        const payload = signalData.signal;
        const { peers, pendingPeers } = get();

        let peer = peers[fromId];

        if (!peer && !pendingPeers.has(fromId)) {
            console.log(`[WebRTC] Creating peer for incoming signal from ${fromId}`);
            const nextPending = new Set(pendingPeers);
            nextPending.add(fromId);
            set({ pendingPeers: nextPending });

            try {
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
                    console.log(`[WebRTC] Outgoing (joiner) signal back to ${fromId}:`, data.type || 'ice');
                    await ApiService.sendSignal(callId, userId, data.type || 'signal', {
                        signal: data,
                        to: fromId,
                        from: userId
                    });
                });

                peer.on('connect', () => {
                    set(state => {
                        const nextP = new Set(state.pendingPeers);
                        nextP.delete(fromId);
                        return { pendingPeers: nextP };
                    });
                    const roomId = get().activeCall?.roomId;
                    if (roomId) get().fetchParticipants(roomId, userId);
                });

                peer.on('stream', (remoteStream: MediaStream) => {
                    set(state => ({
                        remoteStreams: { ...state.remoteStreams, [fromId]: remoteStream }
                    }));
                    (get() as any).setupAudioAnalyser(remoteStream, fromId);
                });

                peer.on('error', () => get().removePeer(fromId));
                peer.on('close', () => get().removePeer(fromId));

                set(state => ({
                    peers: { ...state.peers, [fromId]: peer }
                }));
            } catch (e) {
                console.error(`[WebRTC] Failed to create joiner peer for ${fromId}:`, e);
                set(state => {
                    const nextP = new Set(state.pendingPeers);
                    nextP.delete(fromId);
                    return { pendingPeers: nextP };
                });
                return;
            }
        }

        if (peer) {
            try {
                // GUARD: Don't signal if we are already stable and this is an answer/offer
                // Simple-peer doesn't expose state easily, but we can check internal PC state if needed
                // For now, check if the signal was already processed or if it's an ICE candidate (always allowed)
                if (payload.type === 'answer' || payload.type === 'offer') {
                    if (peer.connected) {
                        console.log(`[WebRTC] Peer ${fromId} already connected, ignoring ${payload.type}`);
                        return;
                    }
                }

                console.log(`[WebRTC] Processing incoming signal from ${fromId}:`, payload.type || 'ice');
                peer.signal(payload);
            } catch (e) {
                console.error(`[WebRTC] Error signaling peer ${fromId}:`, e);
            }
        }
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

        // Forced cleanup of all remote streams
        Object.values(get().remoteStreams).forEach(stream => {
            stream.getTracks().forEach(t => t.stop());
        });

        set({
            activeCall: null,
            callStatus: 'idle',
            localStream: null,
            remoteStreams: {},
            peers: {},
            pendingPeers: new Set(), // Ensure pending is cleared
            lastSignalId: 0,
            roomParticipants: {},
            speakingUsers: {},
            analyserIntervals: {}
        } as any);
    },

    fetchParticipants: async (roomId: string, userId: string) => {
        const { peers, pendingPeers, localStream, activeCall } = get();
        try {
            const participants = await ApiService.fetchVoiceParticipants(roomId, userId);
            set(state => ({
                roomParticipants: { ...state.roomParticipants, [roomId]: participants ?? [] }
            }));

            // MESH FIX: If in call, check for missing peers deterministically
            if (activeCall && localStream) {
                for (const p of participants) {
                    if (p.id !== userId && !peers[p.id] && !pendingPeers.has(p.id)) {
                        // Deterministic rule: smaller ID initiates connection
                        // This ensures that even if two users join simultaneously and don't see each other initially,
                        // one will eventually initiate a connection to the other via this poll.
                        if (userId < p.id) {
                            console.log(`[WebRTC] Mesh: Discovered ${p.id}, I am the initiator (${userId} < ${p.id})`);
                            (get() as any).initiatePeerConnection(activeCall.id, userId, p.id, localStream);
                        }
                    }
                }
            }
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
            // Guard: AudioContext must be resumed after user gesture for some browsers,
            // though Electron is usually more lenient.
            const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
            const audioContext = new AudioContextClass();

            const analyser = audioContext.createAnalyser();
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
            analyser.fftSize = 512;
            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            console.log(`[WebRTC] AudioAnalyser setup for ${targetUserId}`);

            const interval = setInterval(() => {
                if (audioContext.state === 'suspended') audioContext.resume();

                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
                const average = sum / dataArray.length;

                // Threshold adjustment for sensitivity
                const isSpeaking = average > 15;

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
        } catch (e) {
            console.error(`[WebRTC] Analyser setup failed for ${targetUserId}:`, e);
        }
    },

    playJoinSound: () => {
        try {
            const audio = new Audio('assets/sounds/join.webm');
            audio.volume = 0.5;
            audio.play().catch(() => { });
        } catch (e) { }
    }
}));
