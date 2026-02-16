import { useEffect, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import { useAuthStore } from '../stores/authStore';
import { ApiService } from '../services/api';
import { useVoiceStore } from '../stores/useVoiceStore';

export const useAppData = () => {
    const { setServers, setChannels, selectedServerId } = useAppStore();
    const { user, isLoading } = useAuthStore();
    const { addPresenceListener } = useVoiceStore();

    const fetchSpaces = useCallback(async () => {
        if (!user || isLoading) return;
        try {
            const spaces = await ApiService.fetchSpaces(user.id);
            setServers(spaces.map((s: any) => ({
                id: s.id,
                title: s.name,
                type: 'group',
                avatar: s.icon_url,
                owner_id: s.owner_id,
                is_private: !!s.is_private
            })));
        } catch (error) {
            console.error('Failed to fetch spaces:', error);
        }
    }, [user, isLoading, setServers]);

    const fetchRoomsOrDMs = useCallback(async () => {
        if (!user) return;
        const currentIdAtStart = selectedServerId;
        try {
            if (currentIdAtStart) {
                const rooms = await ApiService.fetchRooms(currentIdAtStart, user.id);
                const { selectedServerId: latestServerId } = useAppStore.getState();
                if (latestServerId !== currentIdAtStart) return;

                const mappedChannels = rooms.map((r: any) => ({
                    id: r.id,
                    title: r.name,
                    type: r.type || 'text',
                    unread_count: r.unread_count || 0,
                    mention_count: r.mention_count || 0
                }));
                setChannels(mappedChannels);

                const { selectedChannelId, setSelectedChannel } = useAppStore.getState();
                if (mappedChannels.length > 0 && !selectedChannelId) {
                    const firstTextChannel = mappedChannels.find((c: any) => c.type === 'text') || mappedChannels[0];
                    setSelectedChannel(firstTextChannel.id);
                }
            } else {
                const dms = await ApiService.fetchDMs(user.id);
                const { selectedServerId: latestServerId } = useAppStore.getState();
                if (latestServerId !== null) return;

                setChannels(dms.map((d: any) => ({
                    id: d.id,
                    title: d.other_display_name || d.other_username,
                    type: 'dm',
                    avatar: d.other_avatar,
                    last_seen: d.last_seen,
                    unread_count: d.unread_count || 0,
                    mention_count: d.mention_count || 0
                })));
            }
        } catch (error) {
            console.error('Failed to fetch rooms/dms:', error);
        }
    }, [selectedServerId, user, setChannels]);

    useEffect(() => {
        if (!user) return;
        const unsubscribe = addPresenceListener((update: any) => {
            setChannels(useAppStore.getState().channels.map(c => {
                if (c.type === 'dm' && c.id.includes(update.userId)) {
                    return { ...c, last_seen: update.status === 'online' ? new Date().toISOString() : '2000-01-01' };
                }
                return c;
            }));
        });
        return () => unsubscribe();
    }, [user, addPresenceListener, setChannels]);

    useEffect(() => {
        fetchSpaces();
        const interval = setInterval(fetchSpaces, 120000);
        return () => clearInterval(interval);
    }, [fetchSpaces]);

    useEffect(() => {
        fetchRoomsOrDMs();
        const interval = setInterval(fetchRoomsOrDMs, 60000);
        return () => clearInterval(interval);
    }, [fetchRoomsOrDMs]);

    return { refreshSpaces: fetchSpaces, refreshRooms: fetchRoomsOrDMs };
};
