import { useState, useEffect, useCallback } from 'react';
import { ApiService } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { useVoiceStore } from '../stores/useVoiceStore';

export interface ChatMessage {
    id: string;
    user_id: string;
    content: string;
    created_at: string;
    username?: string;
    display_name?: string;
    avatar_url?: string;
    reply_to_id?: string;
    reply_to_content?: string;
    reply_to_author?: string;
}

export const useChatMessages = (roomId: string) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const { user } = useAuthStore();
    const { addMessageListener } = useVoiceStore();

    const fetchMessages = useCallback(async () => {
        if (!roomId) return;
        try {
            const data = await ApiService.fetchMessages(roomId, user?.id);
            setMessages(data);
        } catch (error) {
            console.error("Failed to fetch messages", error);
        }
    }, [roomId, user?.id]);

    useEffect(() => {
        fetchMessages();

        // Subscribe to real-time message updates via WebSocket
        const unsubscribe = addMessageListener((msg: any) => {
            if (msg.room_id === roomId) {
                setMessages(prev => {
                    // Avoid duplicates
                    if (prev.some(m => m.id === msg.id)) return prev;
                    return [...prev, msg];
                });
            }
        });

        return () => unsubscribe();
    }, [roomId, fetchMessages, addMessageListener]);

    const sendMessage = useCallback(async (content: string, replyToId?: string) => {
        if (!roomId || !user) return;
        try {
            await ApiService.sendMessage(roomId, user.id, content, replyToId);
            // We don't need to fetchMessages here anymore because the server 
            // will broadcast the message back to us via WS, and our listener handles it.
            // But for immediate UI feedback, we can leave it or trust the WS.
        } catch (error) {
            console.error("Failed to send message", error);
            throw error;
        }
    }, [roomId, user]);

    const deleteMessage = useCallback(async (messageId: string) => {
        if (!user) return;
        try {
            setMessages(prev => prev.filter(msg => msg.id !== messageId));
            await ApiService.deleteMessage(messageId, user.id);
        } catch (error) {
            console.error("Failed to delete message", error);
            fetchMessages();
            throw error;
        }
    }, [user, fetchMessages]);

    return { messages, sendMessage, deleteMessage };
};
