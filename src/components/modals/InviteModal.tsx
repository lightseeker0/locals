import React, { useState } from 'react';
import { X, Copy, Check } from 'lucide-react';
import { ApiService } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';

interface InviteModalProps {
    isOpen: boolean;
    onClose: () => void;
    spaceId: string;
}

export const InviteModal: React.FC<InviteModalProps> = ({ isOpen, onClose, spaceId }) => {
    const { user } = useAuthStore();
    const [code, setCode] = useState('');
    const [copied, setCopied] = useState(false);
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const generateInvite = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const res = await ApiService.post('/invites/create', { space_id: spaceId }, user.id);
            setCode(res.code);
        } catch (error) {
            console.error('Failed to generate invite:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm bg-matrix-dark border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
                <div className="p-6 flex items-center justify-between border-b border-white/5">
                    <h2 className="text-xl font-bold text-white">Invite People</h2>
                    <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-matrix-muted">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-8 space-y-6">
                    {!code ? (
                        <div className="text-center space-y-4">
                            <p className="text-matrix-muted text-sm">Generate a code to invite users to this private space.</p>
                            <button
                                onClick={generateInvite}
                                disabled={loading}
                                className="w-full bg-matrix-green hover:bg-matrix-green/90 text-matrix-darker font-bold py-3 rounded-xl transition-all"
                            >
                                {loading ? 'Generating...' : 'Generate Code'}
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <label className="block text-[11px] font-bold text-matrix-muted uppercase tracking-wider">Invite Code</label>
                            <div className="flex gap-2">
                                <div className="flex-1 bg-matrix-darker border border-matrix-green/30 p-4 rounded-xl text-center font-mono font-black text-2xl text-matrix-green tracking-widest uppercase">
                                    {code}
                                </div>
                                <button
                                    onClick={handleCopy}
                                    className="p-4 bg-matrix-green/10 border border-matrix-green/20 rounded-xl text-matrix-green hover:bg-matrix-green hover:text-matrix-darker transition-all"
                                >
                                    {copied ? <Check size={24} /> : <Copy size={24} />}
                                </button>
                            </div>
                            <p className="text-[10px] text-matrix-muted text-center italic">This code allows anyone to join this space.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
