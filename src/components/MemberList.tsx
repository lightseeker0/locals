import React, { useEffect, useState } from 'react';
import { ApiService } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { useAppStore } from '../stores/appStore';
import { UserMinus, Ban } from 'lucide-react';

export const MemberList: React.FC = () => {
    const [members, setMembers] = useState<any[]>([]);
    const { user } = useAuthStore();
    const { selectedServerId, servers } = useAppStore(); // Added

    const currentServer = servers.find(s => s.id === selectedServerId);
    const adminUsername = import.meta.env.VITE_ADMIN_USERNAME || 'ds4d';
    const isAdmin = user?.username?.toLowerCase() === adminUsername.toLowerCase();
    const isOwner = currentServer?.owner_id === user?.id;

    useEffect(() => {
        if (!user) return;

        const fetchUsers = async () => {
            try {
                // If no server selected (Home), maybe fetch friends or hide list?
                // For now, attempting to fetch list even if global (might need backend support)
                const data = await ApiService.fetchUserList(user.id, selectedServerId);
                // Ensure data is array
                if (Array.isArray(data)) {
                    setMembers(data);
                } else {
                    console.error("User list is not an array:", data);
                    setMembers([]);
                }
            } catch (err) {
                console.error('Failed to fetch users:', err);
            }
        };

        fetchUsers();
        const interval = setInterval(fetchUsers, 10000);
        return () => clearInterval(interval);
    }, [user, selectedServerId]);

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

    const onlineMembers = members.filter(m => isOnline(m.last_seen) && !m.is_banned);
    const offlineMembers = members.filter(m => !isOnline(m.last_seen) && !m.is_banned);
    const bannedMembers = members.filter(m => m.is_banned);

    const renderMemberParams = (m: any, status: string) => (
        <div key={m.id} className="group flex items-center gap-3 p-1.5 hover:bg-white/5 rounded-lg cursor-pointer transition-colors relative">
            <div className="relative">
                {m.avatar_url ? (
                    <img src={m.avatar_url} className={`w-8 h-8 rounded-full border border-white/10 ${status === 'offline' ? 'grayscale opacity-70' : ''}`} alt="" />
                ) : (
                    <div className={`w-8 h-8 rounded-full bg-matrix-green/10 border border-matrix-green/20 flex items-center justify-center ${status === 'offline' ? 'grayscale opacity-70' : ''}`}>
                        <span className="text-[10px] font-bold text-matrix-green">
                            {(m.display_name || m.username).substring(0, 1).toUpperCase()}
                        </span>
                    </div>
                )}
                {status === 'online' && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-matrix-green rounded-full border-2 border-matrix-darker"></div>
                )}
                {m.is_banned && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-matrix-darker"></div>
                )}
            </div>
            <div className="flex-1 min-w-0">
                <div className={`font-medium text-[14px] truncate ${status === 'offline' ? 'text-matrix-muted' : 'text-gray-200'} group-hover:text-white`}>
                    {m.display_name || m.username}
                    {m.is_banned && <span className="ml-2 text-[10px] text-red-500 font-bold uppercase">(BANNED)</span>}
                </div>
                {/* Custom status or presence */}
                <div className="text-[10px] text-matrix-muted truncate opacity-50 group-hover:opacity-100 transition-opacity">
                    {m.custom_status || (status === 'online' ? 'Online' : 'Offline')}
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

    return (
        <div className="w-[var(--member-list-width)] bg-matrix-dark flex flex-col shrink-0 border-l border-white/5 members members-3WRCEx members_c8ffbb container_c8ffbb bg-transparent">
            <div className="p-4 border-b border-white/5 font-black text-xs text-matrix-muted uppercase tracking-widest flex items-center gap-2">
                Members
            </div>
            <div className="p-4 flex-1 overflow-y-auto no-scrollbar">

                {/* Online */}
                <h3 className="text-[11px] font-bold text-matrix-muted uppercase mb-4 tracking-wider flex items-center gap-2">
                    Online <span className="text-matrix-green">— {onlineMembers.length}</span>
                </h3>
                <div className="space-y-1 mb-6">
                    {onlineMembers.map(m => renderMemberParams(m, 'online'))}
                </div>

                {/* Offline */}
                <h3 className="text-[11px] font-bold text-matrix-muted uppercase mb-4 tracking-wider flex items-center gap-2">
                    Offline <span className="opacity-50">— {offlineMembers.length}</span>
                </h3>
                <div className="space-y-1 mb-6">
                    {offlineMembers.map(m => renderMemberParams(m, 'offline'))}
                    {offlineMembers.length === 0 && (
                        <div className="text-[10px] text-matrix-muted opacity-30 italic px-2">No offline members</div>
                    )}
                </div>

                {/* Banned (Admin Only?) - Or just list them */}
                {/* For now let's list them if they are still returned (which they are) */}
                {bannedMembers.length > 0 && (
                    <>
                        <h3 className="text-[11px] font-bold text-red-500/50 uppercase mb-4 tracking-wider flex items-center gap-2">
                            Banned <span className="opacity-50">— {bannedMembers.length}</span>
                        </h3>
                        <div className="space-y-1 mb-6">
                            {bannedMembers.map(m => renderMemberParams(m, 'banned'))}
                        </div>
                    </>
                )}

                {members.length === 0 && (
                    <div className="text-xs text-matrix-muted text-center py-4 opacity-30 italic">No ones here...</div>
                )}
            </div>
        </div>
    )
}
