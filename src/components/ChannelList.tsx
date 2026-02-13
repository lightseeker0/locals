import React, { useState, useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import { useAuthStore } from '../stores/authStore';
import { Hash, ChevronDown, Plus, Users, Search, AtSign, Volume2, Mic, MicOff, Headphones, PhoneOff, Settings, Trash2, Bell } from 'lucide-react';
import { clsx } from 'clsx';
import { DirectMessageModal } from './modals/DirectMessageModal';
import { useVoiceStore } from '../stores/useVoiceStore';
import { CreateRoomModal } from './modals/CreateRoomModal';
import { InviteModal } from './modals/InviteModal';
import { useAppData } from '../hooks/useAppData';
import { ApiService } from '../services/api';

import { useI18nStore } from '../stores/i18nStore';
import { ShieldAlert } from 'lucide-react';
import { NotificationList } from './NotificationList';
import { AdminPanel } from './modals/AdminPanel';

export const ChannelList: React.FC = () => {
    const { selectedServerId, servers, channels, selectedChannelId, setSelectedChannel, setSettingsOpen, setSelectedServer } = useAppStore();
    const { user } = useAuthStore();
    const { activeCall, startCall, endCall, isMuted, toggleMute } = useVoiceStore();
    const { refreshRooms, refreshSpaces } = useAppData();
    const { t } = useI18nStore();
    const [isDMOpen, setIsDMOpen] = useState(false);
    const [isCreateRoomOpen, setIsCreateRoomOpen] = useState(false);
    const [isInviteOpen, setIsInviteOpen] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);

    const currentServer = servers.find(s => s.id === selectedServerId);

    const { roomParticipants, speakingUsers, fetchParticipants } = useVoiceStore();
    const prevParticipantsCount = React.useRef<Record<string, number>>({});

    useEffect(() => {
        if (!user) return;

        // Check for new participants in all rooms
        Object.entries(roomParticipants).forEach(([roomId, p]) => {
            const currentCount = p?.length || 0;
            const prevCount = prevParticipantsCount.current[roomId];

            // Only play if someone NEW joined (count increased)
            if (prevCount !== undefined && currentCount > prevCount) {
                const audio = new Audio('/assets/sounds/join.webm');
                audio.volume = 0.5;
                audio.play().catch(e => console.error("Join audio play failed:", e));
            }
            prevParticipantsCount.current[roomId] = currentCount;
        });
    }, [roomParticipants, user?.id]);

    useEffect(() => {
        if (!user || !selectedServerId) return;

        // Poll participants for all voice channels in the current server
        const voiceChannels = channels.filter(c => c.type === 'voice');

        const poll = () => {
            voiceChannels.forEach(channel => {
                // If we are in the call, we might already have data, but good to refresh
                // Especially updates "roomParticipants"
                fetchParticipants(channel.id, user.id);
            });
        };

        poll();
        const interval = setInterval(poll, 5000); // Check every 5 seconds
        return () => clearInterval(interval);
    }, [selectedServerId, channels, user?.id]);

    // ... (rest of the file) ...



    const renderVoiceControlBar = () => {
        if (!activeCall) return null;
        const activeChannel = channels.find(c => c.id === activeCall.roomId);

        return (
            <div className="bg-matrix-darker/80 backdrop-blur-md border-t border-white/5 px-3 py-2 animate-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5 text-matrix-green">
                            <div className="w-2 h-2 bg-matrix-green rounded-full animate-pulse" />
                            <span className="text-[10px] font-black uppercase tracking-widest">Voice Connected</span>
                        </div>
                        <span className="text-xs text-matrix-muted truncate font-bold">{activeChannel?.title || 'Voice Channel'}</span>
                    </div>
                </div>
                <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1">
                        <button
                            onClick={toggleMute}
                            className={clsx(
                                "p-2 rounded-lg transition-all",
                                isMuted ? "bg-red-500/20 text-red-500 hover:bg-red-500/30" : "bg-white/5 text-matrix-muted hover:bg-white/10 hover:text-white"
                            )}
                            title={isMuted ? "Unmute" : "Mute"}
                        >
                            {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
                        </button>
                        <button className="p-2 rounded-lg bg-white/5 text-matrix-muted hover:bg-white/10 hover:text-white transition-all">
                            <Headphones size={16} />
                        </button>
                    </div>
                    <button
                        onClick={() => endCall(user?.id)}
                        className="p-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all flex items-center gap-2"
                        title="Disconnect"
                    >
                        <PhoneOff size={16} />
                    </button>
                </div>
            </div >
        );
    };

    const renderUserControls = () => (
        <div className="flex flex-col shrink-0 relative">
            {renderVoiceControlBar()}
            {/* Popups */}
            {showNotifications && <NotificationList onClose={() => setShowNotifications(false)} />}

            <div className="h-[56px] bg-matrix-darker/50 backdrop-blur-md border-t border-white/5 flex items-center px-3 justify-between">
                <div
                    className="flex items-center gap-3 hover:bg-white/5 p-1.5 pr-3 rounded-xl cursor-pointer transition-colors flex-1 min-w-0"
                    onClick={() => setSettingsOpen(true)}
                >
                    <div className="relative">
                        {user?.avatar_url ? (
                            <img src={user.avatar_url} className="w-8 h-8 rounded-xl border border-white/10" alt="" />
                        ) : (
                            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-matrix-green to-blue-500 flex items-center justify-center shrink-0">
                                <span className="text-[10px] font-black text-white">{(user?.display_name || user?.username || '?').substring(0, 1).toUpperCase()}</span>
                            </div>
                        )}
                        <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-matrix-green rounded-full border-2 border-matrix-darker"></div>
                    </div>
                    <div className="text-xs truncate">
                        <div className="font-black text-white truncate text-[13px]">{user?.display_name || user?.username}</div>
                        <div className="text-matrix-muted truncate text-[10px] font-bold opacity-40 uppercase tracking-widest">
                            {t('online')}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-1 text-matrix-muted">
                    {/* Admin Panel Trigger */}
                    {(user as any)?.is_admin && (
                        <button
                            onClick={() => setIsAdminPanelOpen(true)}
                            className="p-1.5 hover:bg-white/5 rounded-lg hover:text-white transition-all"
                            title={t('admin_panel')}
                        >
                            <ShieldAlert size={18} />
                        </button>
                    )}

                    {/* Notification Trigger */}
                    <button
                        onClick={() => setShowNotifications(!showNotifications)}
                        className="p-1.5 hover:bg-white/5 rounded-lg hover:text-white transition-all relative"
                        title={t('notifications')}
                    >
                        <Bell size={18} />
                        {/* Red Dot (mock logic, ideally check unread count) */}
                        <div className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-matrix-dark hidden"></div>
                    </button>

                    <button
                        onClick={() => setSettingsOpen(true)}
                        className="p-1.5 hover:bg-white/5 rounded-lg hover:text-white transition-all"
                    >
                        <Settings size={18} />
                    </button>
                </div>
            </div>
        </div>
    );

    const renderHomeView = () => (
        <div className="w-60 bg-matrix-dark flex flex-col shrink-0 border-r border-white/5 sidebar">
            <div className="h-12 flex items-center justify-center p-4 border-b border-white/5">
                <button
                    onClick={() => setIsDMOpen(true)}
                    className="w-full bg-matrix-darker text-xs p-2 px-3 rounded-lg text-matrix-muted hover:text-white border border-white/5 flex items-center gap-2 transition-all hover:border-matrix-green/30"
                >
                    <Search size={14} />
                    <span>{t('find_conversation')}</span>
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 no-scrollbar">
                <div className="space-y-0.5 mb-6">
                    <div className="flex items-center px-3 py-2 text-matrix-muted hover:bg-white/5 hover:text-gray-200 rounded-lg cursor-pointer transition-colors gap-3">
                        <Users size={18} />
                        <span className="font-bold text-[14px]">{t('friends')}</span>
                    </div>
                </div>

                <div className="py-2 flex items-center justify-between group px-3">
                    <div className="flex items-center text-[10px] font-bold text-matrix-muted uppercase tracking-[0.2em]">
                        {t('direct_messages')}
                    </div>
                    <Plus
                        size={14}
                        onClick={() => setIsDMOpen(true)}
                        className="text-matrix-muted cursor-pointer hover:text-matrix-green transition-colors opacity-0 group-hover:opacity-100"
                    />
                </div>

                <div className="space-y-0.5 mt-2">
                    {channels.filter(c => c.type === 'dm').map((dm) => {
                        const isOnline = dm.last_seen && (new Date().getTime() - new Date(dm.last_seen).getTime() < 5 * 60 * 1000); // 5 mins
                        return (
                            <div
                                key={dm.id}
                                className={clsx(
                                    "flex items-center px-2 py-2 rounded-xl cursor-pointer group transition-all",
                                    selectedChannelId === dm.id ? "bg-matrix-green/10 text-matrix-green border border-matrix-green/20" : "text-matrix-muted hover:bg-white/5 hover:text-gray-200 border border-transparent"
                                )}
                                onClick={() => setSelectedChannel(dm.id)}
                            >
                                <div className="relative mr-3 shrink-0">
                                    {dm.avatar ? (
                                        <img src={dm.avatar} className="w-8 h-8 rounded-xl object-cover" alt="" />
                                    ) : (
                                        <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center">
                                            <AtSign size={14} className="opacity-40" />
                                        </div>
                                    )}
                                    <div className={clsx(
                                        "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-matrix-dark",
                                        isOnline ? "bg-matrix-green" : "bg-matrix-muted opacity-50"
                                    )}></div>
                                </div>
                                <span className="font-bold truncate text-[13px]">{dm.title}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
            {renderUserControls()}
            <DirectMessageModal isOpen={isDMOpen} onClose={() => setIsDMOpen(false)} />
        </div>
    );

    if (!selectedServerId) return renderHomeView();

    return (
        <div className="w-60 bg-matrix-dark flex flex-col shrink-0 border-r border-white/5 sidebar">
            {/* Space Header */}
            <div className="h-12 flex items-center justify-between p-4 border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors group">
                <h1 className="font-bold text-white truncate max-w-[140px] group-hover:text-matrix-green">{currentServer?.title || 'Space'}</h1>
                <div className="flex items-center gap-1">
                    {(() => {
                        const adminUsername = import.meta.env.VITE_ADMIN_USERNAME || 'ds4d';
                        const canDelete = currentServer?.is_private
                            ? currentServer.owner_id === user?.id
                            : user?.username?.toLowerCase() === adminUsername.toLowerCase();

                        if (!canDelete) return null;

                        return (
                            <button
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    if (user && selectedServerId && confirm('Delete this server and all its channels?')) {
                                        try {
                                            await ApiService.deleteSpace(selectedServerId, user.id);
                                            setSelectedServer(null);
                                            refreshSpaces();
                                        } catch (err) {
                                            console.error('Delete space failed:', err);
                                        }
                                    }
                                }}
                                className="p-1 px-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-matrix-muted hover:text-red-500 rounded transition-all"
                                title="Delete Space"
                                aria-label="Delete Space"
                            >
                                <Trash2 size={14} />
                            </button>
                        );
                    })()}
                    <ChevronDown size={16} className="text-matrix-muted group-hover:text-white" />
                </div>
            </div>

            <div className="px-2 mb-4">
                <button
                    onClick={() => setIsInviteOpen(true)}
                    className="w-full h-9 bg-matrix-green/10 text-matrix-green text-xs font-black uppercase tracking-widest rounded-xl border border-matrix-green/20 hover:bg-matrix-green hover:text-matrix-darker transition-all flex items-center justify-center gap-2"
                >
                    <Plus size={14} />
                    Invite
                </button>
            </div>

            {/* Channels / Rooms */}
            <div className="flex-1 overflow-y-auto p-2 no-scrollbar">
                <div className="py-2 mt-2 flex items-center justify-between group px-2">
                    <div className="flex items-center text-[10px] font-bold text-matrix-muted uppercase tracking-[0.2em] hover:text-white cursor-pointer" onClick={() => { }}>
                        <ChevronDown size={12} className="mr-1" />
                        <span>{t('rooms')}</span>
                    </div>
                    <Plus
                        size={14}
                        onClick={() => setIsCreateRoomOpen(true)}
                        className="text-matrix-muted cursor-pointer hover:text-matrix-green transition-colors opacity-0 group-hover:opacity-100"
                    />
                </div>

                <div className="space-y-0.5">
                    {channels.filter(c => c.type !== 'dm').map((channel) => (
                        <div key={channel.id}>
                            <div
                                className={clsx(
                                    "flex items-center px-3 py-1.5 rounded-xl cursor-pointer group transition-all relative overflow-hidden",
                                    selectedChannelId === channel.id ? "bg-matrix-green/10 text-matrix-green border border-matrix-green/20" : "text-matrix-muted hover:bg-white/5 hover:text-gray-200 border border-transparent",
                                    activeCall?.roomId === channel.id && "bg-matrix-green/5"
                                )}
                                onClick={() => {
                                    setSelectedChannel(channel.id);
                                    if (channel.type === 'voice') {
                                        if (activeCall?.roomId !== channel.id) {
                                            if (activeCall) endCall();
                                            startCall(channel.id, user!.id);
                                        }
                                    }
                                }}
                                onTouchEnd={(e) => {
                                    // Prevent ghost clicks if necessary, but mainly ensure touch triggers join
                                    e.preventDefault();
                                    setSelectedChannel(channel.id);
                                    if (channel.type === 'voice') {
                                        if (activeCall?.roomId !== channel.id) {
                                            if (activeCall) endCall();
                                            startCall(channel.id, user!.id);
                                        }
                                    }
                                }}
                            >
                                {channel.type === 'voice' ? (
                                    <Volume2 size={18} className={clsx("mr-2 shrink-0 transition-colors", activeCall?.roomId === channel.id ? "text-matrix-green" : "text-matrix-muted group-hover:text-gray-300")} />
                                ) : (
                                    <Hash size={18} className={clsx("mr-2 shrink-0 transition-colors", selectedChannelId === channel.id ? "text-matrix-green" : "text-matrix-muted group-hover:text-gray-300")} />
                                )}
                                <span className="font-bold truncate text-[13px]">{channel.title}</span>

                                {activeCall?.roomId === channel.id && (
                                    <div className="absolute right-3 flex gap-0.5 items-end h-3">
                                        {[1, 2, 3].map((h, i) => (
                                            <div key={i} className="w-1 bg-matrix-green animate-bounce" style={{ height: `${h * 4}px`, animationDelay: `${i * 0.1}s` }} />
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Participants List - Visible to everyone */}
                            {channel.type === 'voice' && (roomParticipants[channel.id]?.length > 0 || activeCall?.roomId === channel.id) && (
                                <div className="ml-8 mt-1 space-y-1 mb-2">
                                    {(roomParticipants[channel.id] || []).map((p: any) => (
                                        <div key={p.id} className="flex items-center gap-2 group/user px-2 py-1 rounded-lg hover:bg-white/5 transition-all cursor-pointer">
                                            <div className="relative">
                                                {p.avatar_url ? (
                                                    <img
                                                        src={p.avatar_url}
                                                        className={clsx(
                                                            "w-6 h-6 rounded-lg object-cover transition-all duration-150",
                                                            speakingUsers[p.id] ? "ring-2 ring-matrix-green shadow-[0_0_8px_rgba(0,255,100,0.6)]" : ""
                                                        )}
                                                    />
                                                ) : (
                                                    <div className={clsx(
                                                        "w-6 h-6 rounded-lg bg-matrix-green/20 flex items-center justify-center text-[10px] font-black text-matrix-green transition-all duration-150",
                                                        speakingUsers[p.id] ? "ring-2 ring-matrix-green shadow-[0_0_8px_rgba(0,255,100,0.6)]" : ""
                                                    )}>
                                                        {(p.display_name || p.username || '?')[0].toUpperCase()}
                                                    </div>
                                                )}
                                                <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-matrix-green rounded-full border border-matrix-dark" />
                                            </div>
                                            <span className={clsx(
                                                "text-[13px] font-bold truncate transition-colors",
                                                speakingUsers[p.id] ? "text-matrix-green" : "text-matrix-muted group-hover/user:text-white"
                                            )}>
                                                {p.display_name || p.username}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}

                    {channels.filter(c => c.type !== 'dm').length === 0 && (
                        <div className="text-[10px] text-matrix-muted text-center py-8 opacity-20 uppercase font-black tracking-widest leading-relaxed">
                            Searching rooms...
                        </div>
                    )}
                </div>
            </div>
            {renderUserControls()}
            <DirectMessageModal isOpen={isDMOpen} onClose={() => setIsDMOpen(false)} />
            <CreateRoomModal isOpen={isCreateRoomOpen} onClose={() => setIsCreateRoomOpen(false)} spaceId={selectedServerId!} onSuccess={() => refreshRooms()} />
            <InviteModal isOpen={isInviteOpen} onClose={() => setIsInviteOpen(false)} spaceId={selectedServerId!} />
            <AdminPanel isOpen={isAdminPanelOpen} onClose={() => setIsAdminPanelOpen(false)} />

            {/* Hidden audio element for voice chat */}
            <VoiceAudioPlayer />
        </div>
    );
};

const VoiceAudioPlayer = () => {
    const { remoteStream, audioOutputDeviceId } = useVoiceStore();
    const audioRef = React.useRef<HTMLAudioElement>(null);

    React.useEffect(() => {
        if (audioRef.current && remoteStream) {
            audioRef.current.srcObject = remoteStream;

            // Set output device if supported (Chromium/Electron)
            if (audioOutputDeviceId && (audioRef.current as any).setSinkId) {
                (audioRef.current as any).setSinkId(audioOutputDeviceId)
                    .catch((err: any) => console.error("Failed to set output device:", err));
            }
        }
    }, [remoteStream, audioOutputDeviceId]);

    return (
        <audio
            ref={audioRef}
            autoPlay
            style={{ display: 'none' }}
        />
    );
};
