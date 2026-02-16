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
const messageCacheTs = new Map<string, number>();
const CACHE_REVALIDATE_MS = 15000;

const normalizeMessages = (data: any): ChatMessage[] => (Array.isArray(data) ? data : []);

const fetchMessagesShared = async (roomId: string, userId?: string): Promise<ChatMessage[]> => {
    const key = `${roomId}:${userId || ''}`;
    const existing = inflightFetches.get(key);
    if (existing) return existing;

    const request = ApiService.fetchMessages(roomId, userId)
        .then((data) => {
            const messages = normalizeMessages(data);
            messageCache.set(roomId, messages);
            messageCacheTs.set(roomId, Date.now());
            return messages;
        })
        .finally(() => {
            inflightFetches.delete(key);
        });

    inflightFetches.set(key, request);
    return request;
};

export const hasRoomMessageCache = (roomId: string) => messageCache.has(roomId);

export const prefetchRoomMessages = (roomId: string, userId?: string) => {
    if (!roomId || hasRoomMessageCache(roomId)) return;
    void fetchMessagesShared(roomId, userId);
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
            const lastFetchAt = messageCacheTs.get(roomId) || 0;
            if (Date.now() - lastFetchAt < CACHE_REVALIDATE_MS) {
                return;
            }
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

                    // Reconcile optimistic local message with server-confirmed message
                    // so the UI doesn't temporarily show duplicates.
                    const optimisticIdx = prev.findIndex(m => {
                        if (!m.id.startsWith('tmp-')) return false;
                        if (m.user_id !== msg.user_id) return false;
                        if ((m.content || '') !== (msg.content || '')) return false;
                        const localTs = new Date(m.created_at || 0).getTime();
                        const serverTs = new Date(msg.created_at || 0).getTime();
                        return Math.abs(localTs - serverTs) < 15000;
                    });

                    let next: ChatMessage[];
                    if (optimisticIdx >= 0) {
                        next = [...prev];
                        next[optimisticIdx] = msg;
                    } else {
                        next = [...prev, msg];
                    }
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
        const optimisticId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const optimisticMessage: ChatMessage = {
            id: optimisticId,
            user_id: user.id,
            content,
            created_at: new Date().toISOString(),
            username: user.username,
            display_name: user.display_name,
            avatar_url: user.avatar_url,
            reply_to_id: replyToId
        };

        setMessages((prev) => {
            const next = [...prev, optimisticMessage];
            messageCache.set(roomId, next);
            return next;
        });

        try {
            await ApiService.sendMessage(roomId, user.id, content, replyToId);
            // Revalidate in background; do not block UI.
            setTimeout(() => {
                void fetchMessages();
            }, 2500);
        } catch (error) {
            console.error("Failed to send message", error);
            setMessages((prev) => {
                const next = prev.filter((m) => m.id !== optimisticId);
                messageCache.set(roomId, next);
                return next;
            });
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
