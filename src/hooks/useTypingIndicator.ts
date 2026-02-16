import { useState, useEffect, useCallback } from 'react';
import { useVoiceStore } from '../stores/useVoiceStore';
import { useAuthStore } from '../stores/authStore';

export const useTypingIndicator = (roomId: string) => {
    const { user } = useAuthStore();
    const { sendTyping, addTypingListener } = useVoiceStore();
    const [typingUsers, setTypingUsers] = useState<any[]>([]);

    const setTyping = useCallback((isTyping: boolean) => {
        if (!roomId || !user) return;
        sendTyping(roomId, isTyping);
    }, [roomId, user, sendTyping]);

    useEffect(() => {
        if (!roomId) return;

        const unsubscribe = addTypingListener((update: any) => {
            if (update.room_id === roomId) {
                setTypingUsers(prev => {
                    if (update.is_typing) {
                        return prev.some(u => u.id === update.user_id) ? prev : [...prev, update];
                    } else {
                        return prev.filter(u => u.user_id !== update.user_id);
                    }
                });
            }
        });

        return () => unsubscribe();
    }, [roomId, addTypingListener]);

    return { typingUsers, setTyping };
};
