import { create } from 'zustand';
import { ApiService } from '../services/api';
// @ts-ignore
import SimplePeer from 'simple-peer/simplepeer.min.js';

interface VoiceState {
    activeCall: { id: string, roomId: string } | null;
    callStatus: 'idle' | 'joining' | 'calling' | 'connected' | 'ended';
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
        if (activeCall?.roomId === roomId || get().callStatus === 'joining') return;
        if (activeCall) await get().endCall(userId);

        set({ callStatus: 'joining' });
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

            set({ activeCall: { id: callId, roomId } });

            // Mesh initiation is now handled exclusively by fetchParticipants
            // to prevent double-initiation race conditions.
            await get().fetchParticipants(roomId, userId);

        } catch (err) {
            console.error('[WebRTC] Failed to start call/join logic:', err);
            get().endCall(userId);
        }
    },

    joinCall: async (callId: string, user: any) => {
        const userId = user.id;
        set({ callStatus: 'calling' });
        (get() as any).playJoinSound();

        try {
            const { audioInputDeviceId } = get();
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: audioInputDeviceId ? { deviceId: { exact: audioInputDeviceId } } : true,
                video: false
            });
            (get() as any).setupAudioAnalyser(stream, userId);

            set({
                localStream: stream,
                activeCall: { id: callId, roomId: '' }
            });

            // Let fetchParticipants handle mesh connections
            const roomId = get().activeCall?.roomId;
            if (roomId) get().fetchParticipants(roomId, userId);
        } catch (err) {
            console.error('[WebRTC] joinCall failed:', err);
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
                        { urls: 'stun:global.stun.twilio.com:3478' },
                        // Adding Relay (TURN) servers for network resilience
                        {
                            urls: 'turn:openrelay.metered.ca:80',
                            username: 'openrelayproject',
                            credential: 'openrelayproject'
                        },
                        {
                            urls: 'turn:openrelay.metered.ca:443',
                            username: 'openrelayproject',
                            credential: 'openrelayproject'
                        }
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

        // Critical: always fetch the absolutely freshest state to avoid processing the same signal twice
        const { peers, pendingPeers } = get();
        let peer = peers[fromId];

        if (!peer && !pendingPeers.has(fromId)) {
            console.log(`[WebRTC] Discovered joiner signal from ${fromId}. Handshaking...`);
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
                            { urls: 'stun:global.stun.twilio.com:3478' },
                            // Adding Relay (TURN) servers for network resilience
                            {
                                urls: 'turn:openrelay.metered.ca:80',
                                username: 'openrelayproject',
                                credential: 'openrelayproject'
                            },
                            {
                                urls: 'turn:openrelay.metered.ca:443',
                                username: 'openrelayproject',
                                credential: 'openrelayproject'
                            }
                        ]
                    }
                });

                peer.on('signal', async (data: any) => {
                    console.log(`[WebRTC] Outgoing (joiner) signal to ${fromId}: ${data.type || 'ice'}`);
                    await ApiService.sendSignal(callId, userId, data.type || 'signal', {
                        signal: data,
                        to: fromId,
                        from: userId
                    });
                });

                peer.on('connect', () => {
                    console.log(`[WebRTC] Peer Connection ESTABLISHED with ${fromId}`);
                    set(state => {
                        const nextP = new Set(state.pendingPeers);
                        nextP.delete(fromId);
                        return { pendingPeers: nextP };
                    });
                });

                peer.on('stream', (remoteStream: MediaStream) => {
                    console.log(`[WebRTC] Remote stream received from ${fromId}.`);
                    set(state => ({
                        remoteStreams: { ...state.remoteStreams, [fromId]: remoteStream }
                    }));
                    (get() as any).setupAudioAnalyser(remoteStream, fromId);
                });

                peer.on('error', (err: any) => {
                    console.error(`[WebRTC] Peer ${fromId} error:`, err);
                    get().removePeer(fromId);
                });

                peer.on('close', () => {
                    console.log(`[WebRTC] Peer ${fromId} closed.`);
                    get().removePeer(fromId);
                });

                set(state => ({
                    peers: { ...state.peers, [fromId]: peer }
                }));
            } catch (e) {
                console.error(`[WebRTC] Failed to create joiner peer:`, e);
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
                if (payload.type === 'answer' || payload.type === 'offer') {
                    if (peer.connected) return;
                }
                peer.signal(payload);
            } catch (e) {
                console.error(`[WebRTC] Signal application failed:`, e);
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
        const { localStream, peers, remoteStreams } = get();

        // 1. IMMEDIATE UI CLEANUP (Fixes the "long leave time" symptom)
        set({
            activeCall: null,
            callStatus: 'idle',
            localStream: null,
            remoteStreams: {},
            peers: {},
            pendingPeers: new Set(),
            lastSignalId: 0,
            roomParticipants: {},
            speakingUsers: {},
            analyserIntervals: {}
        } as any);

        // 2. BACKGROUND RESOURCE CLEANUP
        try {
            // Stop analysers
            const intervals = (get() as any).analyserIntervals || {};
            Object.values(intervals).forEach((int: any) => clearInterval(int));

            // Inform server
            if (userId) ApiService.endCall(userId).catch(() => { });

            // Stop local tracks
            if (localStream) {
                localStream.getTracks().forEach((t: any) => t.stop());
            }

            // Stop remote tracks
            Object.values(remoteStreams).forEach(stream => {
                stream.getTracks().forEach(t => t.stop());
            });

            // Destroy peers
            Object.values(peers).forEach((p: any) => {
                try { p.destroy(); } catch (e) { }
            });
        } catch (e) {
            console.error('[WebRTC] endCall cleanup error:', e);
        }
    },

    fetchParticipants: async (roomId: string, userId: string) => {
        const { activeCall, localStream } = get();
        if (!activeCall) return;

        try {
            const participants = await ApiService.fetchVoiceParticipants(roomId, userId);

            // Update UI list
            set(state => ({
                roomParticipants: { ...state.roomParticipants, [roomId]: participants ?? [] }
            }));

            // MESH LOGIC: Ensure every participant has a P2P connection
            if (localStream) {
                for (const p of participants) {
                    if (p.id === userId) continue;

                    // ALWAYS use get() to check latest state during the loop
                    const currentPeers = get().peers;
                    const currentPending = get().pendingPeers;

                    if (!currentPeers[p.id] && !currentPending.has(p.id)) {
                        // Deterministic rule: smaller ID initiates connection to avoid double-initiation
                        if (userId < p.id) {
                            console.log(`[WebRTC] Mesh: Discovered ${p.id}, I am the initiator (${userId} < ${p.id})`);
                            (get() as any).initiatePeerConnection(activeCall.id, userId, p.id, localStream);
                        } else {
                            // Larger ID waits, but if it's been too long, we could have a fallback
                            // For now, sticking to strict rules for stability.
                        }
                    }
                }
            }
        } catch (err) {
            console.error('[WebRTC] Participant poll failed:', err);
        }
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
