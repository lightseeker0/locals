import React, { useState } from 'react';
import { X, LogIn } from 'lucide-react';
import { ApiService } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { useAppData } from '../../hooks/useAppData';

interface JoinSpaceModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const JoinSpaceModal: React.FC<JoinSpaceModalProps> = ({ isOpen, onClose }) => {
    const { user } = useAuthStore();
    const { refreshSpaces } = useAppData();
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleJoin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !code.trim()) return;

        setLoading(true);
        setError('');
        try {
            await ApiService.post('/invites/join', { code: code.trim().toUpperCase() }, user.id);
            await refreshSpaces();
            onClose();
            setCode('');
        } catch (err: any) {
            setError(err.message || 'Invalid or expired code.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm bg-matrix-dark border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
                <div className="p-6 flex items-center justify-between border-b border-white/5">
                    <h2 className="text-xl font-bold text-white">Join a Space</h2>
                    <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-matrix-muted">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleJoin} className="p-8 space-y-6">
                    <div className="space-y-4">
                        <label className="block text-[11px] font-bold text-matrix-muted uppercase tracking-wider">Invitation Code</label>
                        <input
                            type="text"
                            autoFocus
                            placeholder="ABCDEF"
                            className="w-full bg-matrix-darker border border-white/10 rounded-xl px-4 py-4 text-white text-center font-mono text-2xl font-black uppercase tracking-widest focus:border-matrix-green/50 outline-none"
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                        />
                        {error && <p className="text-red-400 text-[10px] text-center font-bold uppercase tracking-tight">{error}</p>}
                    </div>

                    <button
                        type="submit"
                        disabled={loading || code.length < 4}
                        className="w-full bg-matrix-green hover:bg-matrix-green/90 disabled:opacity-50 text-matrix-darker font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                        {loading ? 'Joining...' : (
                            <>
                                <span>Join Community</span>
                                <LogIn size={18} />
                            </>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
};
