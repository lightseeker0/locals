import React, { useEffect, useState } from 'react';
import { ApiService } from '../services/api';
import { useI18nStore } from '../stores/i18nStore';
import { X, Pin } from 'lucide-react';

interface PinnedMessage {
    id: string;
    content: string;
    username: string;
    display_name: string;
    avatar_url: string;
    created_at: string;
}

interface PinnedMessagesProps {
    roomId: string;
    onClose: () => void;
}

export const PinnedMessages: React.FC<PinnedMessagesProps> = ({ roomId, onClose }) => {
    const { t } = useI18nStore();
    const [messages, setMessages] = useState<PinnedMessage[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadPinnedMessages();
    }, [roomId]);

    const loadPinnedMessages = async () => {
        try {
            const data = await ApiService.fetchPinnedMessages(roomId);
            setMessages(data);
        } catch (error) {
            console.error('Failed to load pinned messages', error);
        } finally {
            setLoading(false);
        }
    };

    const unpinMessage = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await ApiService.pinMessage(id, false);
            setMessages(prev => prev.filter(m => m.id !== id));
        } catch (error) {
            console.error('Failed to unpin message', error);
        }
    };

    return (
        <div className="absolute right-0 top-12 w-96 bg-[#2b2d31] dark:bg-[#2b2d31] shadow-lg rounded-bl-lg border-l border-b border-[#1e1f22] z-50 flex flex-col max-h-[600px]">
            <div className="p-4 border-b border-[#1e1f22] flex justify-between items-center text-[#dbdee1]">
                <h3 className="font-semibold flex items-center gap-2">
                    <Pin size={16} /> {t('pins')}
                </h3>
                <button onClick={onClose} className="p-1 hover:bg-[#3f4147] rounded">
                    <X size={16} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {loading ? (
                    <div className="text-center text-[#949ba4]">Loading...</div>
                ) : messages.length === 0 ? (
                    <div className="text-center text-[#949ba4]">No pinned messages</div>
                ) : (
                    messages.map(msg => (
                        <div key={msg.id} className="bg-[#313338] p-3 rounded border border-[#26272d] group relative">
                            <div className="flex items-center gap-2 mb-1">
                                <img src={msg.avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png'}
                                    alt="Avatar" className="w-6 h-6 rounded-full" />
                                <span className="font-semibold text-[#dbdee1] text-sm">{msg.display_name || msg.username}</span>
                                <span className="text-xs text-[#949ba4]">
                                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                            <p className="text-[#dbdee1] text-sm whitespace-pre-wrap pl-8">{msg.content}</p>
                            <button
                                onClick={(e) => unpinMessage(msg.id, e)}
                                className="absolute top-2 right-2 text-[#949ba4] hover:text-[#f23f42] opacity-0 group-hover:opacity-100 transition-opacity"
                                title={t('unpin_message')}
                            >
                                <X size={14} />
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
