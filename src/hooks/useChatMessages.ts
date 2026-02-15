import { useState, useEffect, useCallback } from 'react';
import { ApiService } from '../services/api';
import { useAuthStore } from '../stores/authStore';

export interface ChatMessage {
    id: string;
    user_id: string;
    content: string;
    created_at: string;
    username?: string;
    display_name?: string;
    avatar_url?: string;
    reply_to_id?: string;
    reply_to_content?: string; // Optional for UI convenience
    reply_to_author?: string;
}

export const useChatMessages = (roomId: string) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const { user } = useAuthStore();

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
        const interval = setInterval(fetchMessages, 5000);
        return () => clearInterval(interval);
    }, [roomId, fetchMessages]);

    const sendMessage = useCallback(async (content: string, replyToId?: string) => {
        if (!roomId || !user) return;
        try {
            await ApiService.sendMessage(roomId, user.id, content, replyToId);
            await fetchMessages();
        } catch (error) {
            console.error("Failed to send message", error);
            throw error;
        }
    }, [roomId, user, fetchMessages]);

    const deleteMessage = useCallback(async (messageId: string) => {
        if (!user) return;
        try {
            // Optimistic update
            setMessages(prev => prev.filter(msg => msg.id !== messageId));
            await ApiService.deleteMessage(messageId, user.id);
        } catch (error) {
            console.error("Failed to delete message", error);
            // On failure, re-fetch to restore state
            fetchMessages();
            throw error;
        }
    }, [user, fetchMessages]);

    return { messages, sendMessage, deleteMessage };
};
