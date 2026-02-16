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

const messageCache = new Map<string, ChatMessage[]>();
const inflightFetches = new Map<string, Promise<ChatMessage[]>>();

const normalizeMessages = (data: any): ChatMessage[] => (Array.isArray(data) ? data : []);

const fetchMessagesShared = async (roomId: string, userId?: string): Promise<ChatMessage[]> => {
    const key = `${roomId}:${userId || ''}`;
    const existing = inflightFetches.get(key);
    if (existing) return existing;

    const request = ApiService.fetchMessages(roomId, userId)
        .then((data) => {
            const messages = normalizeMessages(data);
            messageCache.set(roomId, messages);
            return messages;
        })
        .finally(() => {
            inflightFetches.delete(key);
        });

    inflightFetches.set(key, request);
    return request;
};

export const useChatMessages = (roomId: string) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const { user } = useAuthStore();
    const { addMessageListener } = useVoiceStore();

    const fetchMessages = useCallback(async () => {
        if (!roomId) {
            setMessages([]);
            return;
        }

        const cached = messageCache.get(roomId);
        if (cached) {
            // Show cached room history immediately while revalidating in background.
            setMessages(cached);
        }

        try {
            const fresh = await fetchMessagesShared(roomId, user?.id);
            setMessages(fresh);
        } catch (error) {
            console.error("Failed to fetch messages", error);
            if (!cached) {
                setMessages([]);
            }
        }
    }, [roomId, user?.id]);

    useEffect(() => {
        if (!roomId) {
            setMessages([]);
            return;
        }

        const cached = messageCache.get(roomId);
        setMessages(cached || []);

        fetchMessages();

        // Subscribe to real-time message updates via WebSocket
        const unsubscribe = addMessageListener((msg: any) => {
            if (msg.room_id === roomId) {
                setMessages(prev => {
                    // Avoid duplicates
                    if (prev.some(m => m.id === msg.id)) return prev;
                    const next = [...prev, msg];
                    messageCache.set(roomId, next);
                    return next;
                });
            }
        });

        return () => {
            unsubscribe();
        };
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
            setMessages(prev => {
                const next = prev.filter(msg => msg.id !== messageId);
                if (roomId) {
                    messageCache.set(roomId, next);
                }
                return next;
            });
            await ApiService.deleteMessage(messageId, user.id);
        } catch (error) {
            console.error("Failed to delete message", error);
            fetchMessages();
            throw error;
        }
    }, [user, fetchMessages, roomId]);

    return { messages, sendMessage, deleteMessage };
};
