import React, { useEffect, useState } from 'react';
import { ApiService } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { useAppStore } from '../stores/appStore';
import { UserMinus, Ban } from 'lucide-react';
import { useI18nStore } from '../stores/i18nStore';
import { useChatMessages } from '../hooks/useChatMessages';
import { useVoiceStore } from '../stores/useVoiceStore';
import { clsx } from 'clsx';

export const MemberList: React.FC = () => {
    const [members, setMembers] = useState<any[]>([]);
    const { user, userStatus } = useAuthStore();
    const { t } = useI18nStore();
    const { selectedServerId, servers, selectedChannelId } = useAppStore();
    const { messages } = useChatMessages(selectedChannelId || '');

    const currentServer = servers.find(s => s.id === selectedServerId);
    const adminUsername = import.meta.env.VITE_ADMIN_USERNAME || 'ds4d';
    const isAdmin = user?.username?.toLowerCase() === adminUsername.toLowerCase();
    const isOwner = currentServer?.owner_id === user?.id;

    const { addPresenceListener } = useVoiceStore();

    useEffect(() => {
        if (!user) return;

        const fetchUsers = async () => {
            try {
                const data = await ApiService.fetchUserList(user.id, selectedServerId);
                if (Array.isArray(data)) setMembers(data);
            } catch (err) { console.error('Failed to fetch users:', err); }
        };

        fetchUsers();

        // Real-time presence updates
        const unsubscribe = addPresenceListener((update: any) => {
            setMembers(prev => prev.map(m => {
                if (m.id === update.userId) {
                    return { ...m, last_seen: update.status === 'online' ? new Date().toISOString() : '2000-01-01' }; // Simple online/offline toggle
                }
                return m;
            }));
        });

        const interval = setInterval(fetchUsers, 60000 * 5); // 5 minute fallback
        return () => {
            clearInterval(interval);
            unsubscribe();
        };
    }, [user, selectedServerId, addPresenceListener]);

    const handleKick = async (targetId: string) => {
        if (!selectedServerId || !user || !confirm('Kick this user?')) return;
        try {
            await ApiService.kickUser(selectedServerId, user.id, targetId);
            setMembers(prev => prev.filter(m => m.id !== targetId)); // Optimistic update
        } catch (err) {
            console.error('Kick failed:', err);
            alert('Failed to kick user');
        }
    };

    const handleBan = async (targetId: string) => {
        if (!user || !confirm('Ban this user globally? They will be unable to login.')) return;
        try {
            await ApiService.banUser(user.id, targetId, true);
            setMembers(prev => prev.map(m => m.id === targetId ? { ...m, is_banned: true } : m));
        } catch (err) {
            console.error('Ban failed:', err);
            alert('Failed to ban user');
        }
    };

    // Filter and sort
    const now = Date.now();
    const isOnline = (lastSeen: string) => {
        if (!lastSeen) return false;
        // DB stores UTC "YYYY-MM-DD HH:MM:SS", append Z to treat as UTC (or replace space with T and append Z)
        const utcDate = new Date(lastSeen.replace(' ', 'T') + 'Z');
        return (now - utcDate.getTime()) < 60000 * 5; // Increased to 5 minutes for stability
    };

    const allMembers = React.useMemo(() => {
        const merged = [...members];
        messages.forEach(msg => {
            if (!merged.find(m => m.id === msg.user_id)) {
                merged.push({
                    id: msg.user_id,
                    username: msg.username || 'Unknown',
                    display_name: msg.display_name,
                    avatar_url: msg.avatar_url,
                    last_seen: msg.created_at, // Use message date as fallback
                });
            }
        });
        return merged;
    }, [members, messages]);

    const categorizeMembers = (members: any[]) => {
        const result: { [key: string]: any[] } = {
            'online': [],
            'idle': [],
            'dnd': [],
            'offline': [],
            'banned': []
        };

        members.forEach(m => {
            const status = m.id === user?.id ? userStatus : (m.custom_status || (isOnline(m.last_seen) ? 'online' : 'offline'));

            if (m.is_banned) {
                result['banned'].push(m);
            } else if (status === 'online') {
                result['online'].push(m);
            } else if (status === 'idle') {
                result['idle'].push(m);
            } else if (status === 'dnd') {
                result['dnd'].push(m);
            } else {
                result['offline'].push(m);
            }
        });

        return result;
    };

    const categorizedMembers = categorizeMembers(allMembers);
    const onlineMembers = categorizedMembers['online'];
    const idleMembers = categorizedMembers['idle'];
    const dndMembers = categorizedMembers['dnd'];
    const offlineMembers = categorizedMembers['offline'];
    const bannedMembers = categorizedMembers['banned'];

    const renderMemberParams = (m: any, section: string) => {
        const status = m.id === user?.id ? userStatus : (m.custom_status || (isOnline(m.last_seen) ? 'online' : 'invisible'));
        const statusColor = status === 'online' ? 'bg-matrix-green' :
            status === 'idle' ? 'bg-yellow-500' :
                status === 'dnd' ? 'bg-red-500' : 'bg-gray-500';

        return (
            <div key={m.id} className="group flex items-center gap-3 p-2 hover:bg-white/5 rounded-lg cursor-pointer transition-colors relative">
                <div className="relative">
                    {m.avatar_url ? (
                        <img src={m.avatar_url} className={clsx("w-12 h-12 rounded-full border border-white/10", section === 'offline' && 'grayscale opacity-70')} alt="" />
                    ) : (
                        <div className={clsx("w-12 h-12 rounded-full bg-matrix-green/10 border border-matrix-green/20 flex items-center justify-center", section === 'offline' && 'grayscale opacity-70')}>
                            <span className="text-xs font-bold text-matrix-green">
                                {(m.display_name || m.username).substring(0, 1).toUpperCase()}
                            </span>
                        </div>
                    )}

                    {!m.is_banned && (
                        <div className={clsx("absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-matrix-darker transition-colors", statusColor)}>
                            {status === 'dnd' && <div className="w-2 h-0.5 bg-matrix-darker absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full" />}
                            {status === 'idle' && <div className="w-2 h-2 bg-matrix-darker absolute -top-0.5 -left-0.5 rounded-full" />}
                        </div>
                    )}

                    {!!m.is_banned && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-matrix-darker"></div>
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <div className={clsx("font-medium text-[16px] truncate group-hover:text-white", section === 'offline' ? 'text-matrix-muted' : 'text-gray-200')}>
                        {m.display_name || m.username}
                        {!!m.is_banned && <span className="ml-2 text-[10px] text-red-500 font-bold uppercase">(BANNED)</span>}
                    </div>
                    <div className="text-[11px] text-matrix-muted truncate opacity-50 group-hover:opacity-100 transition-opacity">
                        {['online', 'idle', 'dnd', 'invisible'].includes(status) ? t(status === 'invisible' ? 'offline' : status) : (m.custom_status || (section === 'online' ? t('online') : t('offline')))}
                    </div>
                </div>

                {/* Moderation Actions (Hover) */}
                <div className="absolute right-2 opacity-0 group-hover:opacity-100 flex items-center gap-1 bg-matrix-darker/80 rounded p-0.5 shadow-sm backdrop-blur-sm">
                    {isOwner && selectedServerId && m.id !== user?.id && (
                        <button onClick={(e) => { e.stopPropagation(); handleKick(m.id); }} title="Kick from Server" className="p-1 hover:text-red-400 text-matrix-muted transition-colors">
                            <UserMinus size={14} />
                        </button>
                    )}
                    {isAdmin && m.id !== user?.id && !m.is_banned && (
                        <button onClick={(e) => { e.stopPropagation(); handleBan(m.id); }} title="Ban Globally" className="p-1 hover:text-red-500 text-matrix-muted transition-colors">
                            <Ban size={14} />
                        </button>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="w-[var(--member-list-width)] bg-transparent flex flex-col shrink-0 border-l border-white/5 members da-members members-3WRCEx members_c8ffbb container_c8ffbb">
            <div className="p-4 border-b border-white/5 font-black text-xs text-matrix-muted uppercase tracking-widest flex items-center gap-2">
                Members
            </div>
            <div className="p-4 flex-1 overflow-y-auto no-scrollbar">

                {/* Online */}
                {onlineMembers.length > 0 && (
                    <>
                        <h3 className="text-[11px] font-bold text-matrix-muted uppercase mb-4 tracking-wider flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-matrix-green" />
                            Online
                        </h3>
                        <div className="space-y-1 mb-6">
                            {onlineMembers.map(m => renderMemberParams(m, 'online'))}
                        </div>
                    </>
                )}

                {/* Idle */}
                {idleMembers.length > 0 && (
                    <>
                        <h3 className="text-[11px] font-bold text-matrix-muted uppercase mb-4 tracking-wider flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-yellow-500" />
                            Idle
                        </h3>
                        <div className="space-y-1 mb-6">
                            {idleMembers.map(m => renderMemberParams(m, 'idle'))}
                        </div>
                    </>
                )}

                {/* Do Not Disturb */}
                {dndMembers.length > 0 && (
                    <>
                        <h3 className="text-[11px] font-bold text-matrix-muted uppercase mb-4 tracking-wider flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-red-500" />
                            Do Not Disturb
                        </h3>
                        <div className="space-y-1 mb-6">
                            {dndMembers.map(m => renderMemberParams(m, 'dnd'))}
                        </div>
                    </>
                )}

                {/* Offline */}
                {offlineMembers.length > 0 && (
                    <>
                        <h3 className="text-[11px] font-bold text-matrix-muted uppercase mb-4 tracking-wider flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-gray-500" />
                            Offline
                        </h3>
                        <div className="space-y-1 mb-6">
                            {offlineMembers.map(m => renderMemberParams(m, 'offline'))}
                        </div>
                    </>
                )}

                {/* Banned (Admin Only?) - Or just list them */}
                {/* For now let's list them if they are still returned (which they are) */}
                {bannedMembers.length > 0 && (
                    <>
                        <h3 className="text-[11px] font-bold text-red-500/50 uppercase mb-4 tracking-wider flex items-center gap-2">
                            Banned
                        </h3>
                        <div className="space-y-1 mb-6">
                            {bannedMembers.map(m => renderMemberParams(m, 'banned'))}
                        </div>
                    </>
                )}

                {allMembers.length === 0 && (
                    <div className="text-xs text-matrix-muted text-center py-4 opacity-30 italic">No ones here...</div>
                )}
            </div>
        </div>
    )
}
