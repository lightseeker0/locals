import React, { useEffect, useState } from 'react';
import { ApiService } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { X, User, Ban, Shield, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';

interface AdminPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ isOpen, onClose }) => {
    const { user } = useAuthStore();
    const [activeTab, setActiveTab] = useState<'users' | 'banned'>('users');
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchUsers = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const data = activeTab === 'users'
                ? await ApiService.fetchAdminUsers(user.id)
                : await ApiService.fetchBannedUsers(user.id);
            setUsers(data?.results || data || []);
        } catch (err) {
            console.error('Failed to fetch users:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchUsers();
        }
    }, [isOpen, activeTab]);

    const handleBan = async (targetId: string, shouldBan: boolean) => {
        if (!user || !confirm(`${shouldBan ? 'Ban' : 'Unban'} this user?`)) return;
        try {
            if (shouldBan) {
                await ApiService.banUser(user.id, targetId, true);
            } else {
                await ApiService.unbanUser(user.id, targetId);
            }
            // Refresh list
            fetchUsers();
        } catch (err) {
            alert('Action failed');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-[#101317] w-full max-w-4xl h-[80vh] rounded-[2rem] border border-red-500/20 flex flex-col overflow-hidden shadow-2xl shadow-red-900/10 animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="h-16 flex items-center justify-between px-8 border-b border-white/5 bg-red-500/5">
                    <div className="flex items-center gap-3">
                        <Shield className="text-red-500" />
                        <h1 className="text-xl font-black text-white tracking-wide">ADMIN PANEL</h1>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-matrix-muted transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-white/5 px-8 pt-4 gap-4">
                    <button
                        onClick={() => setActiveTab('users')}
                        className={clsx(
                            "pb-4 border-b-2 font-bold text-sm transition-all flex items-center gap-2",
                            activeTab === 'users' ? "border-red-500 text-red-500" : "border-transparent text-matrix-muted hover:text-white"
                        )}
                    >
                        <User size={16} /> Recent Users
                    </button>
                    <button
                        onClick={() => setActiveTab('banned')}
                        className={clsx(
                            "pb-4 border-b-2 font-bold text-sm transition-all flex items-center gap-2",
                            activeTab === 'banned' ? "border-red-500 text-red-500" : "border-transparent text-matrix-muted hover:text-white"
                        )}
                    >
                        <Ban size={16} /> Banned Users
                    </button>

                    <div className="ml-auto">
                        <button onClick={fetchUsers} className="p-2 hover:bg-white/5 rounded-lg text-matrix-muted hover:text-white transition-colors">
                            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-matrix-darker/50">
                    <div className="space-y-2">
                        {users.map((u: any) => (
                            <div key={u.id} className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-all">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-white/10 overflow-hidden">
                                        {u.avatar_url ? (
                                            <img src={u.avatar_url} className="w-full h-full object-cover" alt="" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-xs font-bold">
                                                {u.username[0].toUpperCase()}
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <div className="font-bold text-white flex items-center gap-2">
                                            {u.display_name || u.username}
                                            <span className="text-xs text-matrix-muted font-normal">@{u.username}</span>
                                            {u.is_banned && <span className="text-[10px] bg-red-500/20 text-red-500 px-1.5 py-0.5 rounded uppercase font-black">BANNED</span>}
                                        </div>
                                        <div className="text-xs text-matrix-muted opacity-50">
                                            ID: {u.id} • Created: {new Date(u.created_at).toLocaleDateString()}
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    {u.id !== user!.id && (
                                        u.is_banned ? (
                                            <button
                                                onClick={() => handleBan(u.id, false)}
                                                className="px-4 py-2 bg-green-500/10 text-green-500 hover:bg-green-500/20 rounded-lg text-xs font-bold transition-colors"
                                            >
                                                Unban User
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => handleBan(u.id, true)}
                                                className="px-4 py-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg text-xs font-bold transition-colors"
                                            >
                                                Ban User
                                            </button>
                                        )
                                    )}
                                </div>
                            </div>
                        ))}

                        {!loading && users.length === 0 && (
                            <div className="text-center py-12 text-matrix-muted opacity-30 italic">
                                No users found in this list.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
