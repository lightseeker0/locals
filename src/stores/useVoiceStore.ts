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
    isPolling: boolean;
    processedSignalIds: Set<number>;
    processedSignalHashes: Set<string>;
    pollingBackoff: number;
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
    isPolling: false,
    processedSignalIds: new Set(),
    processedSignalHashes: new Set(),
    pollingBackoff: 0,
    audioInputDeviceId: localStorage.getItem('audioInputDeviceId'),
    audioOutputDeviceId: localStorage.getItem('audioOutputDeviceId'),

    // Helper for sending signals with retries
    sendSignalWithRetry: async (callId: string, userId: string, type: string, payload: any, attempts = 5) => {
        for (let i = 0; i < attempts; i++) {
            try {
                await ApiService.sendSignal(callId, userId, type, payload);
                return;
            } catch (err: any) {
                console.warn(`[WebRTC] Signal send failed (Attempt ${i + 1}/${attempts}):`, err.message);
                if (i === attempts - 1) throw err;
                // Exponential backoff: 200ms, 400ms, 800ms...
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 200));
            }
        }
    },

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
                audio: audioInputDeviceId ? { deviceId: { exact: audioInputDeviceId } } : true,
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

            // REGRESSION FIX: Eager initiation for the initiator (from commit 114f282)
            // This reduces delay on slow networks by starting the mesh before the next poll.
            if (status === 'joined') {
                const participants = await ApiService.fetchVoiceParticipants(roomId, userId);
                for (const p of participants) {
                    if (p.id !== userId && userId < p.id) {
                        (get() as any).initiatePeerConnection(callId, userId, p.id, stream);
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
        // Search available room data for this user to find the roomId
        const roomId = Object.keys(get().roomParticipants).find(rid =>
            get().roomParticipants[rid]?.some(p => p.id === userId)
        ) || '';

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
                activeCall: { id: callId, roomId: roomId }
            });

            // Mesh initiation
            if (roomId) await get().fetchParticipants(roomId, userId);
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
                        { urls: 'stun:stun.services.mozilla.com' },
                        { urls: 'stun:stun.stunprotocol.org' },
                        { urls: 'stun:stun.ekiga.net' }
                    ]
                }
            });

            peer.on('signal', async (data: any) => {
                console.log(`[WebRTC] Outgoing signal to ${targetId}: ${data.type || 'ice'}`);
                try {
                    await (get() as any).sendSignalWithRetry(callId, userId, data.type || 'signal', {
                        signal: data,
                        to: targetId,
                        from: userId
                    });
                } catch (err) {
                    console.error(`[WebRTC] Critical: Failed to send signal to ${targetId} after retries:`, err);
                }
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

            const hasConnectedPeers = Object.values(newPeers).some((p: any) => p.connected);

            return {
                peers: newPeers,
                remoteStreams: newStreams,
                pendingPeers: pending,
                callStatus: hasConnectedPeers ? 'connected' : 'calling'
            };
        });
    },

    handleIncomingSignal: async (callId: string, userId: string, signalData: any, stream: MediaStream, signalId?: number) => {
        // 1. Database ID based deduplication (Level 1)
        if (signalId && get().processedSignalIds.has(signalId)) {
            return;
        }

        const fromId = signalData.from;
        const payload = signalData.signal;

        // 2. Content based deduplication (Level 2)
        // This prevents the same SDP/ICE candidate from being processed twice even if it has a new ID
        const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
        const signalKey = `${fromId}:${payload.type || 'ice'}:${payloadString}`;

        if (get().processedSignalHashes.has(signalKey)) {
            console.log(`[WebRTC] Skipping duplicate signal by content from ${fromId}`);
            return;
        }

        if (signalId) {
            set(state => {
                const nextProcessed = new Set(state.processedSignalIds);
                nextProcessed.add(signalId);
                return { processedSignalIds: nextProcessed };
            });
        }

        set(state => {
            const nextHashes = new Set(state.processedSignalHashes);
            nextHashes.add(signalKey);
            // Limit size to prevent memory leak
            if (nextHashes.size > 200) {
                const first = nextHashes.values().next().value;
                if (first !== undefined) nextHashes.delete(first);
            }
            return { processedSignalHashes: nextHashes };
        });

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
                            { urls: 'stun:stun.services.mozilla.com' },
                            { urls: 'stun:stun.stunprotocol.org' },
                            { urls: 'stun:stun.ekiga.net' }
                        ]
                    }
                });

                peer.on('signal', async (data: any) => {
                    console.log(`[WebRTC] Outgoing (joiner) signal to ${fromId}: ${data.type || 'ice'}`);
                    try {
                        await (get() as any).sendSignalWithRetry(callId, userId, data.type || 'signal', {
                            signal: data,
                            to: fromId,
                            from: userId
                        });
                    } catch (err) {
                        console.error(`[WebRTC] Critical: Failed to send joiner signal to ${fromId} after retries:`, err);
                    }
                });

                peer.on('connect', () => {
                    console.log(`[WebRTC] Peer Connection ESTABLISHED with ${fromId}`);
                    set(state => {
                        const nextP = new Set(state.pendingPeers);
                        nextP.delete(fromId);
                        return { callStatus: 'connected', pendingPeers: nextP };
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
                // If it's an offer/answer, check if we're already connected or stable to avoid InvalidStateError
                if (payload.type === 'answer' || payload.type === 'offer') {
                    if (peer.connected) return;
                    // @ts-ignore - internal _pc check for signaling state
                    if (peer._pc?.signalingState === 'stable' && payload.type === 'answer') return;
                }
                peer.signal(payload);
            } catch (e: any) {
                if (e.message?.includes('stable')) {
                    console.warn(`[WebRTC] Signal ignored: Peer ${fromId} is already stable.`);
                } else {
                    console.error(`[WebRTC] Signal application failed for ${fromId}:`, e);
                }
            }
        }
    },

    pollSignals: async (userId: string) => {
        const { activeCall, localStream, isPolling } = get();
        if (!activeCall || !localStream || isPolling) return;

        set({ isPolling: true });
        try {
            const lastSignalId = get().lastSignalId || 0;
            const signals: any[] = await ApiService.pollSignals(activeCall.id, userId, lastSignalId);

            if (signals && Array.isArray(signals) && signals.length > 0) {
                set({ pollingBackoff: 0 }); // Reset backoff on success
                const highestId = Math.max(...signals.map(s => s.id));
                set({ lastSignalId: highestId });

                for (const signal of signals) {
                    try {
                        const data = typeof signal.payload === 'string' ? JSON.parse(signal.payload) : signal.payload;
                        if (data.to === userId) {
                            await (get() as any).handleIncomingSignal(activeCall.id, userId, data, localStream, signal.id);
                        }
                    } catch (parseErr) {
                        console.error('[WebRTC] Signal parse error:', parseErr, signal);
                    }
                }
            }
        } catch (err: any) {
            // Log 502/504 as warnings and increment backoff
            if (err.status === 502 || err.status === 504 || err.message?.includes('502') || err.message?.includes('504')) {
                const currentBackoff = get().pollingBackoff;
                const nextBackoff = Math.min(currentBackoff + 1000, 5000); // Caps at 5s extra
                console.warn(`[WebRTC] Server temporarily unavailable. Increasing backoff to ${nextBackoff}ms.`);
                set({ pollingBackoff: nextBackoff });
            } else {
                console.error('[WebRTC] Polling error:', err);
            }
        } finally {
            set({ isPolling: false });
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
            processedSignalIds: new Set(),
            processedSignalHashes: new Set(),
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
        // We want to fetch to see who is in rooms even if we aren't, 
        // but we only proceed to mesh logic if we have a local stream and active call.

        try {
            const participants = await ApiService.fetchVoiceParticipants(roomId, userId);

            // Update UI list
            set(state => ({
                roomParticipants: { ...state.roomParticipants, [roomId]: participants ?? [] }
            }));

            // MESH LOGIC: Ensure every participant has a P2P connection
            // CRITICAL FIX: Only initiate mesh if this is our ACTIVE call room.
            // Prevents cross-room signaling artifacts from background polls.
            if (localStream && activeCall && activeCall.roomId === roomId) {
                for (const p of participants) {
                    if (p.id === userId) continue;

                    // ALWAYS use get() to check latest state during the loop
                    const currentPeers = get().peers;
                    const currentPending = get().pendingPeers;

                    if (!currentPeers[p.id] && !currentPending.has(p.id)) {
                        // Deterministic rule: smaller ID initiates connection to avoid double-initiation
                        if (userId < p.id) {
                            console.log(`[WebRTC] Mesh: Discovered ${p.id} in room ${roomId}. Initiating P2P...`);
                            (get() as any).initiatePeerConnection(activeCall.id, userId, p.id, localStream);
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
