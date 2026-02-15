import { useEffect, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import { useAuthStore } from '../stores/authStore';
import { ApiService } from '../services/api';

export const useAppData = () => {
    const { setServers, setChannels, selectedServerId } = useAppStore();
    const { user, isLoading } = useAuthStore();

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
                // Fetch rooms for space
                const rooms = await ApiService.fetchRooms(currentIdAtStart, user.id);

                // CRITICAL: Only update if we are still on the same server
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

                // Auto-select first channel if none selected for this space
                const { selectedChannelId, setSelectedChannel } = useAppStore.getState();
                if (mappedChannels.length > 0 && !selectedChannelId) {
                    const firstTextChannel = mappedChannels.find((c: any) => c.type === 'text') || mappedChannels[0];
                    setSelectedChannel(firstTextChannel.id);
                }
            } else {
                // Fetch DMs (Home view)
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
        fetchSpaces();
        const interval = setInterval(fetchSpaces, 30000);
        return () => clearInterval(interval);
    }, [fetchSpaces]);

    useEffect(() => {
        fetchRoomsOrDMs();
        const interval = setInterval(fetchRoomsOrDMs, 10000); // Polling for DMs/Rooms
        return () => clearInterval(interval);
    }, [fetchRoomsOrDMs]);

    return { refreshSpaces: fetchSpaces, refreshRooms: fetchRoomsOrDMs };
};
