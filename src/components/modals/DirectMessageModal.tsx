import React, { useState, useEffect } from 'react';
import { X, Search, User, MessageSquare, ArrowRight, Loader2 } from 'lucide-react';
import { ApiService } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { useAppStore } from '../../stores/appStore';
import { clsx } from 'clsx';

interface DirectMessageModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const DirectMessageModal: React.FC<DirectMessageModalProps> = ({ isOpen, onClose }) => {
    const { user } = useAuthStore();
    const { setSelectedServer, setSelectedChannel } = useAppStore();
    const [searchQuery, setSearchQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        if (!isOpen) return;

        const delayDebounceSize = setTimeout(() => {
            if (searchQuery.trim().length > 1) {
                handleSearch();
            } else {
                setResults([]);
            }
        }, 300);

        return () => clearTimeout(delayDebounceSize);
    }, [searchQuery, isOpen]);

    const handleSearch = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const data = await ApiService.searchUsers(searchQuery, user.id);
            setResults(data.filter((u: any) => u.id !== user.id));
        } catch (error) {
            console.error('Search failed:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleStartDM = async (targetUserId: string) => {
        if (!user) return;
        setCreating(true);
        try {
            const room = await ApiService.createDM(user.id, targetUserId);
            setSelectedServer(null); // DM's are outside servers for now or in a special state
            setSelectedChannel(room.id);
            onClose();
        } catch (error) {
            console.error('Failed to create DM:', error);
        } finally {
            setCreating(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
            <div className="w-full max-w-lg bg-matrix-dark border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
                <div className="p-8 pb-4 flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-black text-white mb-1">Direct Message</h2>
                        <p className="text-matrix-muted text-xs font-bold uppercase tracking-widest opacity-60">Find someone to talk to</p>
                    </div>
                    <button onClick={onClose} className="p-3 hover:bg-white/5 rounded-2xl text-matrix-muted hover:text-white transition-all transform hover:rotate-90">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-8 pt-4 space-y-6">
                    <div className="relative group">
                        <Search size={20} className="absolute left-5 top-4.5 text-matrix-muted group-focus-within:text-matrix-green transition-colors" />
                        <input
                            autoFocus
                            type="text"
                            placeholder="Search by username..."
                            className="w-full bg-matrix-darker p-4.5 pl-14 rounded-2xl border border-white/5 focus:border-matrix-green/30 focus:bg-matrix-dark focus:outline-none transition-all text-sm placeholder:text-white/10"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        {loading && (
                            <div className="absolute right-5 top-5">
                                <Loader2 size={18} className="text-matrix-green animate-spin" />
                            </div>
                        )}
                    </div>

                    <div className="max-h-[350px] overflow-y-auto space-y-2 custom-scrollbar pr-2">
                        {results.map(target => (
                            <div
                                key={target.id}
                                onClick={() => !creating && handleStartDM(target.id)}
                                className={clsx(
                                    "group flex items-center gap-4 p-4 rounded-2xl bg-white/[0.02] border border-transparent hover:border-matrix-green/20 hover:bg-matrix-green/5 cursor-pointer transition-all duration-300",
                                    creating && "opacity-50 pointer-events-none"
                                )}
                            >
                                {target.avatar_url ? (
                                    <img src={target.avatar_url} className="w-12 h-12 rounded-full object-cover border border-white/5" alt="" />
                                ) : (
                                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-matrix-green/20 to-blue-500/20 flex items-center justify-center border border-white/5 group-hover:bg-matrix-green group-hover:from-matrix-green group-hover:to-matrix-green transition-all duration-500">
                                        <span className="text-sm font-black text-white group-hover:text-matrix-darker">
                                            {(target.display_name || target.username).substring(0, 1).toUpperCase()}
                                        </span>
                                    </div>
                                )}
                                <div className="flex-1">
                                    <div className="font-black text-white group-hover:text-matrix-green transition-colors">{target.display_name || target.username}</div>
                                    <div className="text-[11px] text-matrix-muted font-bold uppercase tracking-widest opacity-40">@{target.username}</div>
                                </div>
                                <div className="p-2 bg-white/5 rounded-xl opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                                    <ArrowRight size={18} className="text-matrix-green" />
                                </div>
                            </div>
                        ))}

                        {searchQuery.trim().length > 1 && results.length === 0 && !loading && (
                            <div className="text-center py-12">
                                <div className="w-16 h-16 bg-white/5 rounded-3xl flex items-center justify-center mx-auto mb-4">
                                    <User size={32} className="text-matrix-muted opacity-20" />
                                </div>
                                <p className="text-matrix-muted text-sm font-bold uppercase tracking-widest">No users found</p>
                            </div>
                        )}

                        {searchQuery.trim().length <= 1 && (
                            <div className="text-center py-12">
                                <div className="w-16 h-16 bg-white/5 rounded-3xl flex items-center justify-center mx-auto mb-4">
                                    <MessageSquare size={32} className="text-matrix-muted opacity-20" />
                                </div>
                                <p className="text-matrix-muted text-sm font-bold uppercase tracking-widest leading-relaxed">
                                    Type at least 2 characters<br />to start searching
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
