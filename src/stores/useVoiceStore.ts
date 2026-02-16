import { create } from 'zustand';
import { Room, RoomEvent, Track, createLocalAudioTrack, type LocalAudioTrack } from 'livekit-client';
import { ApiService } from '../services/api';
import { useAuthStore } from './authStore';

interface VoiceState {
    activeCall: { id: string; roomId: string } | null;
    callStatus: 'idle' | 'joining' | 'calling' | 'connected' | 'ended';
    localStream: MediaStream | null;
    remoteStreams: Record<string, MediaStream>;
    roomParticipants: Record<string, any[]>;
    speakingUsers: Record<string, boolean>;
    isMuted: boolean;
    isDeafened: boolean;
    audioInputDeviceId: string | null;
    audioOutputDeviceId: string | null;
    micSensitivityThreshold: number;
    autoMicSensitivity: boolean;
    ws: WebSocket | null;
    wsStatus: 'disconnected' | 'connecting' | 'connected';
    sfuRoom: Room | null;
    localAudioTrack: LocalAudioTrack | null;
    analyserIntervals: Record<string, ReturnType<typeof setInterval>>;
    audioContexts: Record<string, AudioContext>;
    lastSpeakingUpdate: number;
    messageListeners: ((msg: any) => void)[];
    presenceListeners: ((update: any) => void)[];
    typingListeners: ((update: any) => void)[];
    voiceRoomUpdateListeners: ((update: any) => void)[];
    startCall: (roomId: string, user: any) => Promise<void>;
    joinCall: (callId: string, user: any) => Promise<void>;
    endCall: (userId?: string) => Promise<void>;
    toggleMute: () => void;
    toggleDeafen: () => void;
    fetchParticipants: (roomId: string, userId: string) => Promise<void>;
    setAudioInputDevice: (deviceId: string) => void;
    setAudioOutputDevice: (deviceId: string) => void;
    setMicSensitivityThreshold: (threshold: number) => void;
    setAutoMicSensitivity: (enabled: boolean) => void;
    connectSfu: (roomId: string, user: any) => Promise<void>;
    disconnectSfu: () => Promise<void>;
    connectWS: (userId: string) => void;
    disconnectWS: () => void;
    addMessageListener: (cb: (msg: any) => void) => () => void;
    addPresenceListener: (cb: (update: any) => void) => () => void;
    addTypingListener: (cb: (update: any) => void) => () => void;
    addVoiceRoomUpdateListener: (cb: (update: any) => void) => () => void;
    sendTyping: (roomId: string, isTyping: boolean) => void;
    sendVoiceRoomUpdate: (roomId: string) => void;
    sendVoiceSpeakingState: (roomId: string, isSpeaking: boolean) => void;
    setupAudioAnalyser: (stream: MediaStream, targetUserId: string) => void;
    playJoinSound: () => void;
}

const DEFAULT_MIC_THRESHOLD = 15;
const clampThreshold = (value: number) => Math.min(80, Math.max(5, Math.round(value)));

export const useVoiceStore = create<VoiceState>((set, get) => ({
    activeCall: null,
    callStatus: 'idle',
    localStream: null,
    remoteStreams: {},
    roomParticipants: {},
    speakingUsers: {},
    isMuted: false,
    isDeafened: false,
    audioInputDeviceId: localStorage.getItem('audioInputDeviceId'),
    audioOutputDeviceId: localStorage.getItem('audioOutputDeviceId'),
    micSensitivityThreshold: (() => {
        const saved = Number(localStorage.getItem('micSensitivityThreshold') || String(DEFAULT_MIC_THRESHOLD));
        return Number.isFinite(saved) ? clampThreshold(saved) : DEFAULT_MIC_THRESHOLD;
    })(),
    autoMicSensitivity: localStorage.getItem('autoMicSensitivity') !== '0',
    ws: null,
    wsStatus: 'disconnected',
    sfuRoom: null,
    localAudioTrack: null,
    analyserIntervals: {},
    audioContexts: {},
    lastSpeakingUpdate: 0,
    messageListeners: [],
    presenceListeners: [],
    typingListeners: [],
    voiceRoomUpdateListeners: [],

    addMessageListener: (cb) => {
        set((state) => ({ messageListeners: [...state.messageListeners, cb] }));
        return () => set((state) => ({ messageListeners: state.messageListeners.filter((l) => l !== cb) }));
    },
    addPresenceListener: (cb) => {
        set((state) => ({ presenceListeners: [...state.presenceListeners, cb] }));
        return () => set((state) => ({ presenceListeners: state.presenceListeners.filter((l) => l !== cb) }));
    },
    addTypingListener: (cb) => {
        set((state) => ({ typingListeners: [...state.typingListeners, cb] }));
        return () => set((state) => ({ typingListeners: state.typingListeners.filter((l) => l !== cb) }));
    },
    addVoiceRoomUpdateListener: (cb) => {
        set((state) => ({ voiceRoomUpdateListeners: [...state.voiceRoomUpdateListeners, cb] }));
        return () => set((state) => ({ voiceRoomUpdateListeners: state.voiceRoomUpdateListeners.filter((l) => l !== cb) }));
    },

    connectWS: (userId: string) => {
        const { ws, wsStatus } = get();
        if (ws || wsStatus === 'connecting') return;

        set({ wsStatus: 'connecting' });
        const token = useAuthStore.getState().user?.session_token;
        const socket = new WebSocket(`${ApiService.getWsUrl()}?userId=${userId}&token=${token}`);
        let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

        socket.onopen = () => {
            set({ ws: socket, wsStatus: 'connected' });
            heartbeatInterval = setInterval(() => {
                if (socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({ type: 'heartbeat' }));
                } else if (heartbeatInterval) {
                    clearInterval(heartbeatInterval);
                }
            }, 20000);
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                if (data.type === 'message') {
                    get().messageListeners.forEach((l) => l(data.message));
                } else if (data.type === 'presence') {
                    get().presenceListeners.forEach((l) => l(data));
                } else if (data.type === 'typing') {
                    get().typingListeners.forEach((l) => l(data));
                } else if (data.type === 'voice_room_update') {
                    get().voiceRoomUpdateListeners.forEach((l) => l(data));
                    const authUser = useAuthStore.getState().user;
                    if (authUser && data.room_id) {
                        get().fetchParticipants(data.room_id, authUser.id);
                    }
                } else if (data.type === 'voice_speaking') {
                    if (!data.user_id) return;
                    set((state) => ({
                        speakingUsers: { ...state.speakingUsers, [data.user_id]: !!data.is_speaking }
                    }));
                }
            } catch (err) {
                console.error('[Voice] WS message error:', err);
            }
        };

        socket.onclose = () => {
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            set({ ws: null, wsStatus: 'disconnected' });
            if (get().activeCall) {
                setTimeout(() => get().connectWS(userId), 3000);
            }
        };

        socket.onerror = (err) => {
            console.error('[Voice] WS error:', err);
        };
    },

    disconnectWS: () => {
        const { ws } = get();
        if (ws) {
            ws.onclose = null;
            ws.close();
        }
        set({ ws: null, wsStatus: 'disconnected' });
    },

    sendTyping: (room_id: string, is_typing: boolean) => {
        const { ws } = get();
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'typing', room_id, is_typing }));
        }
    },

    sendVoiceRoomUpdate: (room_id: string) => {
        const { ws } = get();
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'voice_room_update', room_id }));
        }
    },

    sendVoiceSpeakingState: (room_id: string, is_speaking: boolean) => {
        const { ws } = get();
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'voice_speaking', room_id, is_speaking }));
        }
    },

    connectSfu: async (roomId: string, user: any) => {
        await get().disconnectSfu();

        const tokenResponse = await ApiService.getVoiceToken(
            roomId,
            user.id,
            user.display_name || user.username || user.id
        );

        const room = new Room({
            adaptiveStream: true,
            dynacast: true
        });

        room.on(RoomEvent.TrackSubscribed, (track: any, _pub: any, participant: any) => {
            if (track.kind !== Track.Kind.Audio || !track.mediaStreamTrack) return;
            const remoteStream = new MediaStream([track.mediaStreamTrack]);
            set((state) => ({
                remoteStreams: { ...state.remoteStreams, [participant.identity]: remoteStream }
            }));
            get().setupAudioAnalyser(remoteStream, participant.identity);
        });

        const removeParticipant = (identity: string) => {
            set((state) => {
                const nextStreams = { ...state.remoteStreams };
                const nextSpeaking = { ...state.speakingUsers };
                const interval = state.analyserIntervals[identity];
                if (interval) clearInterval(interval);
                const nextIntervals = { ...state.analyserIntervals };
                delete nextIntervals[identity];
                delete nextStreams[identity];
                delete nextSpeaking[identity];
                return {
                    remoteStreams: nextStreams,
                    speakingUsers: nextSpeaking,
                    analyserIntervals: nextIntervals
                };
            });
        };

        room.on(RoomEvent.TrackUnsubscribed, (_track: any, _pub: any, participant: any) => {
            removeParticipant(participant.identity);
        });

        room.on(RoomEvent.ParticipantDisconnected, (participant: any) => {
            removeParticipant(participant.identity);
        });

        room.on(RoomEvent.ActiveSpeakersChanged, (participants: any[]) => {
            set((state) => {
                const nextSpeaking: Record<string, boolean> = { ...state.speakingUsers };
                Object.keys(nextSpeaking).forEach((id) => {
                    nextSpeaking[id] = false;
                });
                participants.forEach((p) => {
                    if (p?.identity) nextSpeaking[p.identity] = true;
                });
                return { speakingUsers: nextSpeaking };
            });
        });

        await room.connect(tokenResponse.url, tokenResponse.token);

        const localAudioTrackInstance = await createLocalAudioTrack({
            deviceId: get().audioInputDeviceId || undefined,
            channelCount: 1,
            sampleRate: 48000,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
        });

        await room.localParticipant.publishTrack(localAudioTrackInstance);
        const localStream = new MediaStream([localAudioTrackInstance.mediaStreamTrack]);
        get().setupAudioAnalyser(localStream, user.id);

        set({
            sfuRoom: room,
            localAudioTrack: localAudioTrackInstance,
            localStream,
            callStatus: 'connected'
        });
    },

    disconnectSfu: async () => {
        const { sfuRoom, localAudioTrack } = get();

        if (localAudioTrack) {
            try { localAudioTrack.stop(); } catch { }
        }
        if (sfuRoom) {
            try { sfuRoom.disconnect(); } catch { }
        }

        set({ sfuRoom: null, localAudioTrack: null });
    },

    startCall: async (roomId: string, user: any) => {
        const userId = user.id;
        const { activeCall } = get();
        if (activeCall?.roomId === roomId || get().callStatus === 'joining') return;
        if (activeCall) await get().endCall(userId);

        set((state) => ({
            callStatus: 'joining',
            activeCall: { id: `pending-${Date.now()}`, roomId },
            roomParticipants: {
                ...state.roomParticipants,
                [roomId]: state.roomParticipants[roomId]?.length
                    ? state.roomParticipants[roomId]
                    : [{
                        id: user.id,
                        username: user.username,
                        display_name: user.display_name,
                        avatar_url: user.avatar_url
                    }]
            }
        }));
        get().playJoinSound();

        try {
            const response = await ApiService.createCall(roomId, userId);
            set({
                activeCall: { id: response.id, roomId },
                callStatus: 'calling'
            });
            await get().connectSfu(roomId, user);
            await get().fetchParticipants(roomId, userId);
            get().sendVoiceRoomUpdate(roomId);
        } catch (err) {
            console.error('[Voice] Failed to start call:', err);
            await get().endCall(userId);
        }
    },

    joinCall: async (callId: string, user: any) => {
        const userId = user.id;
        const roomId = Object.keys(get().roomParticipants).find((rid) =>
            get().roomParticipants[rid]?.some((p) => p.id === userId)
        ) || '';

        set((state) => ({
            callStatus: 'calling',
            activeCall: { id: callId, roomId },
            roomParticipants: roomId ? {
                ...state.roomParticipants,
                [roomId]: state.roomParticipants[roomId]?.length
                    ? state.roomParticipants[roomId]
                    : [{
                        id: user.id,
                        username: user.username,
                        display_name: user.display_name,
                        avatar_url: user.avatar_url
                    }]
            } : state.roomParticipants
        }));
        get().playJoinSound();

        try {
            if (!roomId) throw new Error('Room ID could not be resolved for SFU join');
            set({ activeCall: { id: callId, roomId } });
            await get().connectSfu(roomId, user);
            await get().fetchParticipants(roomId, userId);
        } catch (err) {
            console.error('[Voice] joinCall failed:', err);
            await get().endCall(userId);
        }
    },

    endCall: async (userId?: string) => {
        const { localStream, remoteStreams, activeCall } = get();
        const roomId = activeCall?.roomId;
        const intervals = { ...get().analyserIntervals };

        set({
            activeCall: null,
            callStatus: 'idle',
            localStream: null,
            remoteStreams: {},
            roomParticipants: {},
            speakingUsers: {},
            analyserIntervals: {},
            audioContexts: {}
        });

        Object.values(intervals).forEach((interval) => clearInterval(interval));
        Object.values(get().audioContexts).forEach((ctx) => ctx.close().catch(() => { }));

        try {
            await get().disconnectSfu();

            if (roomId) {
                get().sendVoiceRoomUpdate(roomId);
                get().sendVoiceSpeakingState(roomId, false);
            }
            if (userId) ApiService.endCall(userId).catch(() => { });

            if (localStream) {
                localStream.getTracks().forEach((t) => t.stop());
            }

            Object.values(remoteStreams).forEach((stream) => {
                stream.getTracks().forEach((t) => t.stop());
            });
        } catch (err) {
            console.error('[Voice] endCall cleanup error:', err);
        }
    },

    fetchParticipants: async (roomId: string, userId: string) => {
        try {
            const participants = await ApiService.fetchVoiceParticipants(roomId, userId);
            set((state) => ({
                roomParticipants: { ...state.roomParticipants, [roomId]: participants ?? [] }
            }));
        } catch (err) {
            console.error('[Voice] Participant fetch failed:', err);
        }
    },

    toggleMute: () => {
        const { localStream, localAudioTrack, isMuted } = get();
        if (!localStream) return;

        const nextMuted = !isMuted;
        localStream.getAudioTracks().forEach((track) => {
            track.enabled = !nextMuted;
        });

        if (localAudioTrack) {
            if (nextMuted) localAudioTrack.mute();
            else localAudioTrack.unmute();
        }

        set({ isMuted: nextMuted });

        if (nextMuted) {
            const me = useAuthStore.getState().user;
            const roomId = get().activeCall?.roomId;
            if (me?.id) {
                set((state) => ({
                    speakingUsers: { ...state.speakingUsers, [me.id]: false }
                }));
            }
            if (roomId) {
                get().sendVoiceSpeakingState(roomId, false);
            }
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

    setMicSensitivityThreshold: (threshold: number) => {
        const clamped = clampThreshold(threshold);
        localStorage.setItem('micSensitivityThreshold', String(clamped));
        set({ micSensitivityThreshold: clamped });
    },

    setAutoMicSensitivity: (enabled: boolean) => {
        localStorage.setItem('autoMicSensitivity', enabled ? '1' : '0');
        set({ autoMicSensitivity: enabled });
    },

    setupAudioAnalyser: (stream: MediaStream, targetUserId: string) => {
        try {
            const { analyserIntervals, audioContexts } = get();
            if (analyserIntervals[targetUserId]) clearInterval(analyserIntervals[targetUserId]);
            if (audioContexts[targetUserId]) audioContexts[targetUserId].close().catch(() => { });

            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            const audioContext = new AudioContextClass();
            const analyser = audioContext.createAnalyser();
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
            analyser.fftSize = 512;

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            const localUserId = useAuthStore.getState().user?.id;
            const isLocalUserAnalyser = !!localUserId && targetUserId === localUserId;
            let noiseFloor = 8;
            let lastSpeaking = false;

            const interval = setInterval(() => {
                if (audioContext.state === 'suspended') audioContext.resume();

                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
                const average = sum / dataArray.length;

                const { micSensitivityThreshold, autoMicSensitivity, lastSpeakingUpdate } = get();
                const baseThreshold = micSensitivityThreshold;
                const dynamicThreshold = isLocalUserAnalyser && autoMicSensitivity
                    ? (() => {
                        if (!lastSpeaking) noiseFloor = (noiseFloor * 0.92) + (average * 0.08);
                        return Math.min(80, Math.max(5, Math.max(baseThreshold, noiseFloor + 6)));
                    })()
                    : baseThreshold;

                const onThreshold = dynamicThreshold;
                const offThreshold = Math.max(3, dynamicThreshold * 0.75);
                const isSpeaking = lastSpeaking ? average > offThreshold : average > onThreshold;
                lastSpeaking = isSpeaking;

                let changed = false;
                set((state) => {
                    if (state.speakingUsers[targetUserId] === isSpeaking) return {};
                    changed = true;
                    return {
                        speakingUsers: { ...state.speakingUsers, [targetUserId]: isSpeaking }
                    };
                });

                if (isLocalUserAnalyser && changed) {
                    const now = Date.now();
                    if (now - lastSpeakingUpdate > 200) {
                        const roomId = get().activeCall?.roomId;
                        if (roomId) {
                            get().sendVoiceSpeakingState(roomId, isSpeaking);
                            set({ lastSpeakingUpdate: now });
                        }
                    }
                }
            }, 100);

            set((state) => ({
                analyserIntervals: { ...state.analyserIntervals, [targetUserId]: interval },
                audioContexts: { ...state.audioContexts, [targetUserId]: audioContext }
            }));
        } catch (err) {
            console.error(`[Voice] Analyser setup failed for ${targetUserId}:`, err);
        }
    },

    playJoinSound: () => {
        try {
            const audio = new Audio('assets/sounds/join.webm');
            audio.volume = 0.5;
            audio.play().catch(() => { });
        } catch { }
    }
}));
