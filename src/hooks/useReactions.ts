import { useState, useEffect, useCallback } from 'react';
import { ApiService } from '../services/api';
import { useAuthStore } from '../stores/authStore';

export interface Reaction {
    emoji: string;
    count: number;
    users: string[]; // List of user IDs
}

export const useReactions = (messageId: string) => {
    const { user } = useAuthStore();
    const [reactions, setReactions] = useState<Reaction[]>([]);

    const fetchReactions = useCallback(async () => {
        if (!messageId) return;
        try {
            const data = await ApiService.get(`/reactions/${messageId}`);
            setReactions(data.map((r: any) => ({
                ...r,
                users: r.users ? r.users.split(',') : []
            })));
        } catch (error) {
            console.error('Failed to fetch reactions:', error);
        }
    }, [messageId]);

    const toggleReaction = async (emoji: string) => {
        if (!user || !messageId) return;
        try {
            await ApiService.toggleReaction(messageId, user.id, emoji);
            fetchReactions();
        } catch (error) {
            console.error('Failed to toggle reaction:', error);
        }
    };

    useEffect(() => {
        fetchReactions();
    }, [fetchReactions]);

    return { reactions, toggleReaction };
};
