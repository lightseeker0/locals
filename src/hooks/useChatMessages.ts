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
        if (!roomId) {
            setMessages([]);
            return;
        }
        try {
            const data = await ApiService.fetchMessages(roomId, user?.id);
            setMessages(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error("Failed to fetch messages", error);
            setMessages([]);
        }
    }, [roomId, user?.id]);

    useEffect(() => {
        // Prevent showing stale history while switching channels.
        setMessages([]);
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
            // WS can lag or drop; refresh once to guarantee the sender sees the message.
            await fetchMessages();
        } catch (error) {
            console.error("Failed to send message", error);
            throw error;
        }
    }, [roomId, user, fetchMessages]);

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
