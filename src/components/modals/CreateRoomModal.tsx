import React, { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { ApiService } from '../../services/api';
import { X, Hash, Volume2 } from 'lucide-react';
import { clsx } from 'clsx';
import { useI18nStore } from '../../stores/i18nStore';

interface CreateRoomModalProps {
    isOpen: boolean;
    onClose: () => void;
    spaceId: string;
    onSuccess: () => void;
}

export const CreateRoomModal: React.FC<CreateRoomModalProps> = ({ isOpen, onClose, spaceId, onSuccess }) => {
    const { user } = useAuthStore();
    const { t } = useI18nStore();
    const [name, setName] = useState('');
    const [type, setType] = useState<'text' | 'voice'>('text');
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !name.trim()) return;

        setLoading(true);
        try {
            await ApiService.createRoom(user.id, spaceId, name.trim(), type);
            onSuccess();
            onClose();
            setName('');
            setType('text');
        } catch (error) {
            console.error('Failed to create room:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-matrix-dark border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 flex items-center justify-between border-b border-white/5">
                    <h2 className="text-xl font-bold text-white">{t('create_room')}</h2>
                    <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-matrix-muted hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-8 space-y-6">
                    <div className="space-y-4">
                        <label className="block text-[11px] font-bold text-matrix-muted uppercase tracking-wider mb-2">Channel Type</label>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => setType('text')}
                                className={clsx(
                                    "p-4 rounded-xl border flex flex-col gap-2 transition-all text-left",
                                    type === 'text'
                                        ? "bg-matrix-green/10 border-matrix-green text-matrix-green shadow-lg shadow-matrix-green/5"
                                        : "bg-matrix-darker border-white/5 text-matrix-muted hover:border-white/20 hover:text-white"
                                )}
                            >
                                <Hash size={24} />
                                <div>
                                    <div className="font-bold text-sm">Text</div>
                                    <div className="text-[10px] opacity-60">Send messages, images, and GIFs.</div>
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => setType('voice')}
                                className={clsx(
                                    "p-4 rounded-xl border flex flex-col gap-2 transition-all text-left",
                                    type === 'voice'
                                        ? "bg-matrix-green/10 border-matrix-green text-matrix-green shadow-lg shadow-matrix-green/5"
                                        : "bg-matrix-darker border-white/5 text-matrix-muted hover:border-white/20 hover:text-white"
                                )}
                            >
                                <Volume2 size={24} />
                                <div>
                                    <div className="font-bold text-sm">Voice</div>
                                    <div className="text-[10px] opacity-60">Hang out with voice and video.</div>
                                </div>
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-[11px] font-bold text-matrix-muted uppercase tracking-wider mb-2">Room Name</label>
                        <input
                            type="text"
                            autoFocus
                            className="w-full bg-matrix-darker border border-white/10 rounded-xl px-4 py-4 text-white placeholder-white/20 focus:border-matrix-green/50 outline-none transition-all text-lg font-medium"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="new-room"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading || !name.trim()}
                        className="w-full bg-matrix-green hover:bg-matrix-green/90 disabled:opacity-50 text-matrix-darker font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-matrix-green/20"
                    >
                        {loading ? 'Creating...' : 'Create Room'}
                    </button>
                </form>
            </div>
        </div>
    );
};
