import React, { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useAppData } from '../../hooks/useAppData';
import { ApiService } from '../../services/api';
import { X, Globe, Lock } from 'lucide-react';
import { clsx } from 'clsx';

interface CreateSpaceModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const CreateSpaceModal: React.FC<CreateSpaceModalProps> = ({ isOpen, onClose }) => {
    const { user } = useAuthStore();
    const { refreshSpaces } = useAppData();
    const [name, setName] = useState('');
    const [isPrivate, setIsPrivate] = useState(false);
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !name.trim()) return;

        setLoading(true);
        try {
            await ApiService.createSpace(user.id, name.trim(), isPrivate);
            await refreshSpaces();
            onClose();
        } catch (error) {
            console.error('Failed to create space:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-matrix-dark border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 flex items-center justify-between border-b border-white/5">
                    <h2 className="text-xl font-bold text-white">Create a Space</h2>
                    <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-matrix-muted hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-8 space-y-6">
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            type="button"
                            onClick={() => setIsPrivate(false)}
                            className={clsx(
                                "p-4 rounded-xl border flex flex-col gap-2 transition-all text-left",
                                !isPrivate
                                    ? "bg-matrix-green/10 border-matrix-green text-matrix-green shadow-lg shadow-matrix-green/5"
                                    : "bg-matrix-darker border-white/5 text-matrix-muted hover:border-white/20 hover:text-white"
                            )}
                        >
                            <Globe size={20} />
                            <div>
                                <div className="font-bold text-sm">Public</div>
                                <div className="text-[10px] opacity-60">Visible to everyone.</div>
                            </div>
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsPrivate(true)}
                            className={clsx(
                                "p-4 rounded-xl border flex flex-col gap-2 transition-all text-left",
                                isPrivate
                                    ? "bg-matrix-green/10 border-matrix-green text-matrix-green shadow-lg shadow-matrix-green/5"
                                    : "bg-matrix-darker border-white/5 text-matrix-muted hover:border-white/20 hover:text-white"
                            )}
                        >
                            <Lock size={20} />
                            <div>
                                <div className="font-bold text-sm">Private</div>
                                <div className="text-[10px] opacity-60">Invite-only access.</div>
                            </div>
                        </button>
                    </div>

                    <div>
                        <label className="block text-[11px] font-bold text-matrix-muted uppercase tracking-wider mb-2">Space Name</label>
                        <input
                            type="text"
                            autoFocus
                            className="w-full bg-matrix-darker border border-white/10 rounded-xl px-4 py-4 text-white placeholder-white/20 focus:border-matrix-green/50 outline-none transition-all text-lg font-medium"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. My Awesome Community"
                        />
                    </div>

                    <div className="flex items-center gap-3 p-4 bg-white/[0.02] border border-white/5 rounded-xl">
                        <Lock size={16} className="text-yellow-500/50" />
                        <p className="text-[10px] text-matrix-muted leading-tight">
                            By creating a space, you agree to follow the community guidelines.
                        </p>
                    </div>

                    <button
                        type="submit"
                        disabled={loading || !name.trim()}
                        className="w-full bg-matrix-green hover:bg-matrix-green/90 disabled:opacity-50 text-matrix-darker font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-matrix-green/20"
                    >
                        {loading ? 'Creating...' : 'Create Space'}
                    </button>
                </form>
            </div>
        </div>
    );
};
