import React, { useState, useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import { useAuthStore } from '../stores/authStore';
import { Hash, ChevronDown, Plus, Users, Search, AtSign, Volume2, Mic, MicOff, Headphones, HeadphoneOff, PhoneOff, Settings, Bell, Circle, Clock, MinusCircle, LogOut, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import { DirectMessageModal } from './modals/DirectMessageModal';
import { useVoiceStore } from '../stores/useVoiceStore';
import { CreateRoomModal } from './modals/CreateRoomModal';
import { InviteModal } from './modals/InviteModal';
import { useAppData } from '../hooks/useAppData';

import { useI18nStore } from '../stores/i18nStore';
import { ShieldAlert } from 'lucide-react';
import { NotificationList } from './NotificationList';
import { AdminPanel } from './modals/AdminPanel';
import { ApiService } from '../services/api';

export const ChannelList: React.FC = () => {
    const { selectedServerId, servers, channels, selectedChannelId, setSelectedChannel, setSelectedServer, setSettingsOpen, setMobileMenuOpen, clearUnread } = useAppStore();
    const { user, userStatus, setUserStatus, logout } = useAuthStore();
    const { refreshRooms } = useAppData();
    const { t } = useI18nStore();
    const [isDMOpen, setIsDMOpen] = useState(false);
    const [isCreateRoomOpen, setIsCreateRoomOpen] = useState(false);
    const [isInviteOpen, setIsInviteOpen] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
    const [appVersion, setAppVersion] = useState<string>('');
    const [updateStatus, setUpdateStatus] = useState<string>('idle'); // 'idle', 'checking', 'available', 'not-available', 'downloading', 'ready'
    const [isStatusPickerOpen, setIsStatusPickerOpen] = useState(false);

    // Auto-idle logic: Online -> Idle after 1 hour of inactivity
    useEffect(() => {
        let idleTimeout: any;
        const ONE_HOUR = 60 * 60 * 1000;

        const handleActivity = () => {
            // Only track and reset if we are currently online
            // If we are already idle, dnd, or invisible, we don't auto-change
            if (userStatus === 'online') {
                if (idleTimeout) clearTimeout(idleTimeout);
                idleTimeout = setTimeout(() => {
                    setUserStatus('idle');
                }, ONE_HOUR);
            }
        };

        const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
        events.forEach(event => document.addEventListener(event, handleActivity));

        // Start the timer initially if online
        handleActivity();

        return () => {
            if (idleTimeout) clearTimeout(idleTimeout);
            events.forEach(event => document.removeEventListener(event, handleActivity));
        };
    }, [userStatus, setUserStatus]);

    useEffect(() => {
        if (!window.electron) return;

        window.electron.getAppVersion().then(v => setAppVersion(v));

        window.electron.onCheckingForUpdate(() => setUpdateStatus('checking'));
        window.electron.onUpdateAvailable(() => setUpdateStatus('available'));
        window.electron.onUpdateNotAvailable(() => {
            setUpdateStatus('not-available');
            setTimeout(() => setUpdateStatus('idle'), 3000);
        });
        window.electron.onUpdateProgress(() => setUpdateStatus('downloading'));
        window.electron.onUpdateDownloaded(() => setUpdateStatus('ready'));
        window.electron.onUpdateError?.((err: string) => {
            console.error('Update failed:', err);
            setUpdateStatus('idle');
            alert('Update check failed: ' + err);
        });
    }, []);

    const checkForUpdates = () => {
        if (window.electron && updateStatus === 'idle') {
            setUpdateStatus('checking');
            window.electron.checkForUpdates();
        }
    };

    const currentServer = servers.find(s => s.id === selectedServerId);
    const isOwner = currentServer?.owner_id === user?.id;
    const globalAdmins = ['ds4d', 'ilke', 'i̇lke'];
    const isGlobalAdmin = user && globalAdmins.includes(user.username.toLowerCase());

    const handleDeleteSpace = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!selectedServerId || !user) return;
        if (confirm(`Are you sure you want to permanently delete the server "${currentServer?.title}"? This cannot be undone.`)) {
            try {
                await ApiService.deleteSpace(selectedServerId, user.id);
                setSelectedServer(null); // Go home
                // Spaces will re-poll automatically
            } catch (err: any) {
                alert(`Failed to delete server: ${err.message}`);
            }
        }
    };

    const {
        activeCall,
        startCall,
        isMuted,
        isDeafened,
        roomParticipants,
        speakingUsers,
        toggleMute,
        toggleDeafen,
        endCall,
        fetchParticipants,
        remoteStreams,
        audioOutputDeviceId
    } = useVoiceStore();
    const prevParticipants = React.useRef<Record<string, any[]>>({});

    // Poll voice participants periodically
    useEffect(() => {
        if (!user || !selectedServerId) return;

        const poll = async () => {
            const voiceRooms = channels.filter(c => c.type === 'voice');
            for (const room of voiceRooms) {
                if (user?.id) await fetchParticipants(room.id, user.id);
            }
        };

        const interval = setInterval(poll, 2000); // 2s poll
        poll();

        return () => clearInterval(interval);
    }, [user, selectedServerId, channels, fetchParticipants]);

    useEffect(() => {
        if (!user) return;

        // Check for new participants in all rooms
        Object.entries(roomParticipants).forEach(([roomId, p]) => {
            const currentList = p || [];
            const prevList = prevParticipants.current[roomId] || [];

            // Only play if someone NEW joined (count increased)
            if (currentList.length > prevList.length) {
                // Determine if the joined user is someone ELSE
                const joinedUser = currentList.find(u => !prevList.some(pu => pu.id === u.id));

                // If someone else joined (or we joined but we handle our own sound in the store)
                // We specifically only play for OTHERS here to avoid double sound
                if (joinedUser && joinedUser.id !== user.id && activeCall?.roomId === roomId) {
                    const audio = new Audio('/assets/sounds/join.webm');
                    audio.volume = 0.5;
                    audio.play().catch(e => console.error("Join audio play failed:", e));
                }
            }
            prevParticipants.current[roomId] = currentList;
        });
    }, [roomParticipants, user?.id, activeCall?.roomId]);

    useEffect(() => {
        if (!user || !selectedServerId) return;

        // Poll participants for all voice channels in the current server
        const voiceChannels = channels.filter(c => c.type === 'voice');

        const poll = () => {
            voiceChannels.forEach(channel => {
                if (user?.id) fetchParticipants(channel.id, user.id);
            });
        };

        poll();
        poll();
        const interval = setInterval(poll, 2000); // Check every 2 seconds for mesh health
        return () => clearInterval(interval);
    }, [selectedServerId, channels, user?.id, fetchParticipants]);

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
                        <button
                            onClick={toggleDeafen}
                            className={clsx(
                                "p-2 rounded-lg transition-all",
                                isDeafened ? "bg-red-500/20 text-red-500 hover:bg-red-500/30" : "bg-white/5 text-matrix-muted hover:bg-white/10 hover:text-white"
                            )}
                            title={isDeafened ? "Undeafen" : "Deafen"}
                        >
                            {isDeafened ? <HeadphoneOff size={16} /> : <Headphones size={16} />}
                        </button>
                    </div>
                    <button
                        onClick={() => { if (user?.id) endCall(user.id); }}
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
            {!!appVersion && (
                <div
                    className={clsx(
                        "absolute -top-4 right-2 text-[9px] font-mono pointer-events-auto z-10 cursor-pointer transition-colors flex items-center gap-1",
                        updateStatus === 'checking' ? "text-blue-400 animate-pulse" :
                            updateStatus === 'ready' ? "text-matrix-green animate-bounce" :
                                updateStatus === 'downloading' ? "text-blue-500" :
                                    "text-matrix-muted opacity-20 hover:opacity-100 hover:text-white"
                    )}
                    onClick={checkForUpdates}
                    title="Click to check for updates"
                >
                    {updateStatus === 'checking' ? 'Checking...' :
                        updateStatus === 'ready' ? 'Update Ready!' :
                            updateStatus === 'downloading' ? 'Downloading...' :
                                `v${appVersion}`}
                </div>
            )}
            {renderVoiceControlBar()}
            {/* Popups */}
            {showNotifications && <NotificationList onClose={() => setShowNotifications(false)} />}

            {/* Status Picker Popup */}
            {isStatusPickerOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsStatusPickerOpen(false)} />
                    <div className="absolute bottom-[60px] left-2 right-2 bg-matrix-darker/95 border border-white/10 rounded-2xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] p-1.5 z-50 animate-in fade-in slide-in-from-bottom-3 duration-300 backdrop-blur-2xl">
                        <div className="text-[10px] font-black text-matrix-muted uppercase tracking-[0.25em] p-3 pb-2 opacity-60 select-none">{t('set_status')}</div>

                        {[
                            { id: 'online', label: t('online'), color: 'text-matrix-green', icon: <Circle size={12} fill="currentColor" /> },
                            { id: 'idle', label: t('idle'), color: 'text-yellow-500', icon: <Clock size={12} fill="currentColor" /> },
                            { id: 'dnd', label: t('dnd'), color: 'text-red-500', icon: <MinusCircle size={12} fill="currentColor" /> },
                            { id: 'invisible', label: t('offline'), color: 'text-gray-400', icon: <Circle size={12} /> },
                        ].map((s) => (
                            <div
                                key={s.id}
                                onClick={() => {
                                    setUserStatus(s.id as any);
                                    setIsStatusPickerOpen(false);
                                }}
                                className="flex items-center gap-3 p-2.5 hover:bg-white/5 rounded-xl cursor-pointer transition-all group active:scale-[0.98]"
                            >
                                <div className={clsx("w-5 h-5 flex items-center justify-center shrink-0", s.color)}>
                                    {s.icon}
                                </div>
                                <span className="text-xs font-bold text-matrix-muted group-hover:text-white transition-colors">{s.label}</span>
                                {userStatus === s.id && (
                                    <div className="ml-auto mr-1 w-1.5 h-1.5 bg-matrix-green rounded-full shadow-[0_0_8px_rgba(0,255,100,0.6)] animate-pulse" />
                                )}
                            </div>
                        ))}
                    </div>
                </>
            )}

            <div className="h-[56px] bg-matrix-darker/50 backdrop-blur-md border-t border-white/5 flex items-center px-2 justify-between">
                <div
                    className="flex items-center gap-2 hover:bg-white/5 p-1.5 rounded-xl cursor-pointer transition-colors flex-1 min-w-0"
                    onClick={() => setIsStatusPickerOpen(!isStatusPickerOpen)}
                >
                    <div className="relative shrink-0">
                        {user?.avatar_url ? (
                            <img src={user.avatar_url} className="w-8 h-8 rounded-xl border border-white/10" alt="" />
                        ) : (
                            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-matrix-green to-blue-500 flex items-center justify-center shrink-0">
                                <span className="text-[10px] font-black text-white">{(user?.display_name || user?.username || '?').substring(0, 1).toUpperCase()}</span>
                            </div>
                        )}
                        <div className={clsx(
                            "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-matrix-darker transition-colors",
                            userStatus === 'online' ? "bg-matrix-green" :
                                userStatus === 'idle' ? "bg-yellow-500" :
                                    userStatus === 'dnd' ? "bg-red-500" :
                                        "bg-gray-500"
                        )}>
                            {userStatus === 'dnd' && <div className="w-1.5 h-0.5 bg-matrix-darker absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full" />}
                            {userStatus === 'idle' && <div className="w-1.5 h-1.5 bg-matrix-darker absolute -top-0.5 -left-0.5 rounded-full" />}
                        </div>
                    </div>
                    <div className="text-xs flex-1 min-w-0">
                        <div className="font-black text-white truncate text-[12px] leading-tight">{user?.display_name || user?.username}</div>
                        <div className="text-matrix-muted truncate text-[9px] font-bold opacity-40 uppercase tracking-widest leading-none">
                            {t(userStatus === 'invisible' ? 'offline' : userStatus)}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-0.5 text-matrix-muted shrink-0">
                    {/* Admin Panel Trigger */}
                    {(user as any)?.is_admin && (
                        <button
                            onClick={() => setIsAdminPanelOpen(true)}
                            className="p-1 px-1.5 hover:bg-white/5 rounded-lg hover:text-white transition-all"
                            title={t('admin_panel')}
                        >
                            <ShieldAlert size={16} />
                        </button>
                    )}

                    {/* Notification Trigger */}
                    <button
                        onClick={() => setShowNotifications(!showNotifications)}
                        className="p-1 px-1.5 hover:bg-white/5 rounded-lg hover:text-white transition-all relative"
                        title={t('notifications')}
                    >
                        <Bell size={16} />
                        <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full border border-matrix-dark hidden"></div>
                    </button>

                    <button
                        onClick={() => setSettingsOpen(true)}
                        className="p-1 px-1.5 hover:bg-white/5 rounded-lg hover:text-white transition-all"
                    >
                        <Settings size={16} />
                    </button>
                    <button
                        onClick={() => {
                            if (confirm(t('logout_confirm') || 'Are you sure you want to log out?')) {
                                logout();
                            }
                        }}
                        className="p-1 px-1.5 hover:bg-red-500/10 rounded-lg text-matrix-muted hover:text-red-500 transition-all"
                        title={t('logout') || 'Log Out'}
                    >
                        <LogOut size={16} />
                    </button>
                </div>
            </div>
        </div>
    );

    const renderHomeView = () => (
        <div className="w-[var(--channel-list-width)] bg-matrix-dark flex flex-col shrink-0 border-r border-white/5 sidebar da-channels sidebar_ded4b5 privateChannels_e6b769 h-full sidebar-1tnOww container-1NXoYp">
            <div className="h-12 flex items-center justify-center px-4 border-b border-white/5 shrink-0">
                <button
                    onClick={() => setIsDMOpen(true)}
                    className="w-full bg-matrix-darker text-xs p-2 px-3 rounded-lg text-matrix-muted hover:text-white border border-white/5 flex items-center gap-2 transition-all hover:border-matrix-green/30"
                >
                    <Search size={14} />
                    <span>{t('find_conversation')}</span>
                </button>
            </div>

            <div className="flex-1 overflow-y-auto px-2 py-2 no-scrollbar">
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
                                    "flex items-center px-2 py-2 rounded-xl cursor-pointer group transition-all relative overflow-hidden",
                                    selectedChannelId === dm.id ? "bg-matrix-green/10 text-matrix-green border border-matrix-green/20" : "text-matrix-muted hover:bg-white/5 hover:text-gray-200 border border-transparent",
                                    dm.unread_count && dm.unread_count > 0 && "unread-marker"
                                )}
                                onClick={() => {
                                    clearUnread(dm.id);
                                    setSelectedChannel(dm.id);
                                }}
                            >
                                {/* Unread Pill */}
                                {dm.unread_count && dm.unread_count > 0 && selectedChannelId !== dm.id && (
                                    <div className="absolute left-0 w-1 h-2 bg-white rounded-r-full" />
                                )}
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
                                <span className={clsx(
                                    "font-bold truncate text-[13px] flex-1",
                                    (dm.unread_count && dm.unread_count > 0 && selectedChannelId !== dm.id) ? "text-white" : "text-inherit"
                                )}>
                                    {dm.title}
                                </span>

                                {/* Mention Badge */}
                                {dm.mention_count && dm.mention_count > 0 && selectedChannelId !== dm.id && (
                                    <div className="bg-red-500 text-white text-[10px] font-black h-4 min-w-[16px] px-1 flex items-center justify-center rounded-full mr-1">
                                        {dm.mention_count}
                                    </div>
                                )}
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
        <div className="w-[var(--channel-list-width)] bg-transparent flex flex-col shrink-0 border-r border-white/5 channel-list da-channels h-full relative sidebar-1tnOww container-1NXoYp">
            {/* Space Header */}
            <div className="h-12 flex items-center justify-between px-4 hover:bg-white/5 cursor-pointer transition-colors group shrink-0">
                <h1 className="font-bold text-white truncate max-w-[140px] group-hover:text-matrix-green">{currentServer?.title || 'Space'}</h1>
                <div className="flex items-center gap-1.5">
                    {(isOwner || isGlobalAdmin) && (
                        <button
                            onClick={handleDeleteSpace}
                            className="p-1 px-1.5 hover:bg-red-500/20 text-matrix-muted hover:text-red-500 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                            title="Delete Server"
                        >
                            <Trash2 size={16} />
                        </button>
                    )}
                    <ChevronDown size={16} className="text-matrix-muted group-hover:text-white" />
                </div>
            </div>

            {/* v0.0.25 Invite Button */}
            <div className="px-3 py-1 mb-4 flex-none">
                <button
                    onClick={() => setIsInviteOpen(true)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-matrix-green/30 bg-matrix-green/10 text-matrix-green hover:bg-matrix-green hover:text-white transition-all group active:scale-[0.98] shadow-[0_0_15px_rgba(13,189,139,0.1)]"
                >
                    <Plus size={18} className="group-hover:rotate-90 transition-transform duration-300" />
                    <span className="text-[12px] font-black uppercase tracking-[0.2em]">Invite</span>
                </button>
            </div>

            <div className="flex-1 overflow-y-auto px-2 py-2 no-scrollbar">
                <div className="flex items-center justify-between group px-2 mb-2">
                    <div className="flex items-center text-[10px] font-black text-matrix-muted uppercase tracking-[0.3em] hover:text-white cursor-pointer transition-colors">
                        <ChevronDown size={12} className="mr-2 opacity-50" />
                        <span>{t('rooms') || 'ODALAR'}</span>
                    </div>
                    <Plus
                        size={14}
                        onClick={() => setIsCreateRoomOpen(true)}
                        className="text-matrix-muted cursor-pointer hover:text-matrix-green transition-colors opacity-0 group-hover:opacity-100"
                    />
                </div>

                <div className="space-y-1 list-36_9v7 container-2gi_v5">
                    {channels.filter(c => c.type !== 'dm').map((channel) => (
                        <div key={channel.id} className="containerDefault-39SOT5 container-1oeRFJ">
                            <div
                                className={clsx(
                                    "flex items-center px-4 py-2 rounded-xl cursor-pointer group transition-all relative overflow-hidden active:scale-[0.98]",
                                    selectedChannelId === channel.id
                                        ? "bg-matrix-green/15 text-matrix-green border border-matrix-green/20"
                                        : "text-matrix-muted hover:bg-white/5 hover:text-gray-200 border border-transparent",
                                    activeCall?.roomId === channel.id && "bg-matrix-green/5",
                                    channel.unread_count && channel.unread_count > 0 && "unread-marker"
                                )}
                                onClick={() => {
                                    clearUnread(channel.id);
                                    if (channel.type === 'voice') {
                                        if (activeCall?.roomId !== channel.id) {
                                            if (user) startCall(channel.id, user);
                                        }
                                        setSelectedChannel(channel.id);
                                    } else {
                                        setSelectedChannel(channel.id);
                                    }
                                    setMobileMenuOpen(false);
                                }}
                            >
                                {/* Unread Pill */}
                                {channel.unread_count && channel.unread_count > 0 && selectedChannelId !== channel.id && (
                                    <div className="absolute left-0 w-1 h-2 bg-white rounded-r-xl" />
                                )}

                                {channel.type === 'voice' ? (
                                    <Volume2 size={18} className={clsx("mr-3 shrink-0 transition-colors", activeCall?.roomId === channel.id ? "text-matrix-green" : (channel.unread_count && channel.unread_count > 0 ? "text-white" : "text-matrix-muted group-hover:text-gray-300"))} />
                                ) : (
                                    <Hash size={18} className={clsx("mr-3 shrink-0 transition-colors", selectedChannelId === channel.id ? "text-matrix-green" : (channel.unread_count && channel.unread_count > 0 ? "text-white" : "text-matrix-muted group-hover:text-gray-300"))} />
                                )}
                                <span className={clsx(
                                    "font-bold truncate text-[14px] leading-tight flex-1",
                                    (channel.unread_count && channel.unread_count > 0 && selectedChannelId !== channel.id) ? "text-white" : "text-inherit"
                                )}>
                                    {channel.title}
                                </span>

                                {/* Mention Badge */}
                                {channel.mention_count && channel.mention_count > 0 && selectedChannelId !== channel.id && (
                                    <div className="bg-red-500 text-white text-[10px] font-black h-4 min-w-[16px] px-1 flex items-center justify-center rounded-full">
                                        {channel.mention_count}
                                    </div>
                                )}

                                {activeCall?.roomId === channel.id && (
                                    <div className="absolute right-4 flex gap-1 items-end h-3">
                                        {[1, 2, 3].map((h, i) => (
                                            <div key={i} className="w-1 bg-matrix-green animate-bounce" style={{ height: `${h * 4}px`, animationDelay: `${i * 0.1}s` }} />
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Participants List */}
                            {channel.type === 'voice' && (roomParticipants[channel.id]?.length > 0 || activeCall?.roomId === channel.id) && (
                                <div className="ml-10 mt-1 space-y-1 mb-2">
                                    {(roomParticipants[channel.id] || []).map((p: any) => (
                                        <div key={p.id} className="flex items-center gap-3 group/user px-2 py-1.5 rounded-lg hover:bg-white/5 transition-all cursor-pointer">
                                            <div className="relative">
                                                {p.avatar_url ? (
                                                    <img
                                                        src={p.avatar_url}
                                                        className={clsx(
                                                            "w-7 h-7 rounded-lg object-cover transition-all duration-150",
                                                            speakingUsers[p.id] ? "ring-2 ring-matrix-green shadow-[0_0_8px_rgba(0,255,100,0.6)]" : "border border-white/10"
                                                        )}
                                                    />
                                                ) : (
                                                    <div className={clsx(
                                                        "w-7 h-7 rounded-lg bg-matrix-green/20 flex items-center justify-center text-[10px] font-black text-matrix-green transition-all duration-150",
                                                        speakingUsers[p.id] ? "ring-2 ring-matrix-green shadow-[0_0_8px_rgba(0,255,100,0.6)]" : "border border-white/10"
                                                    )}>
                                                        {(p.display_name || p.username || '?')[0].toUpperCase()}
                                                    </div>
                                                )}
                                                <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-matrix-green rounded-full border-2 border-matrix-dark" />
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
                </div>
            </div>

            {/* v0.0.25 Version Tag */}
            <div className="absolute bottom-[64px] right-4 pointer-events-none select-none">
                <span className="text-[9px] font-black text-matrix-muted/20 uppercase tracking-[0.2em]">v0.0.25</span>
            </div>

            {renderUserControls()}
            <DirectMessageModal isOpen={isDMOpen} onClose={() => setIsDMOpen(false)} />
            <CreateRoomModal isOpen={isCreateRoomOpen} onClose={() => setIsCreateRoomOpen(false)} spaceId={selectedServerId!} onSuccess={() => refreshRooms()} />
            <InviteModal isOpen={isInviteOpen} onClose={() => setIsInviteOpen(false)} spaceId={selectedServerId!} />
            <AdminPanel isOpen={isAdminPanelOpen} onClose={() => setIsAdminPanelOpen(false)} />

            {/* Hidden audio element for voice chat */}
            <div style={{ display: 'none' }}>
                {Object.entries(remoteStreams).map(([userId, stream]) => (
                    <audio
                        key={userId}
                        ref={(el) => {
                            if (el && stream) {
                                el.srcObject = stream;
                                if (audioOutputDeviceId && (el as any).setSinkId) {
                                    (el as any).setSinkId(audioOutputDeviceId)
                                        .catch((err: any) => console.error("Failed to set output device:", err));
                                }
                            }
                        }}
                        autoPlay
                        muted={isDeafened}
                    />
                ))}
            </div>
        </div>
    );
};

