import { useState, useEffect, useCallback } from 'react';
import { ApiService } from '../services/api';
import { useAuthStore } from '../stores/authStore';

export const useTypingIndicator = (roomId: string) => {
    const { user } = useAuthStore();
    const [typingUsers, setTypingUsers] = useState<string[]>([]);

    const setTyping = useCallback(async (isTyping: boolean) => {
        if (!roomId || !user) return;
        try {
            await ApiService.post('/typing', { room_id: roomId, user_id: user.id, is_typing: isTyping });
        } catch (error) {
            console.error('Failed to set typing status:', error);
        }
    }, [roomId, user]);

    const fetchTyping = useCallback(async () => {
        if (!roomId) return;
        try {
            const results = await ApiService.get(`/typing?room_id=${roomId}`);
            setTypingUsers(results.map((r: any) => r.name).filter((name: string) => name !== (user?.display_name || user?.username)));
        } catch (error) {
            console.error('Failed to fetch typing status:', error);
        }
    }, [roomId, user]);

    useEffect(() => {
        if (!roomId) return;
        fetchTyping();
        const interval = setInterval(fetchTyping, 3000);
        return () => clearInterval(interval);
    }, [roomId, fetchTyping]);

    return { typingUsers, setTyping };
};
