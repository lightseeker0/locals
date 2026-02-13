import { useEffect, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import { useAuthStore } from '../stores/authStore';
import { ApiService } from '../services/api';

export const useAppData = () => {
    const { setServers, setChannels, selectedServerId } = useAppStore();
    const { user } = useAuthStore();

    const fetchSpaces = useCallback(async () => {
        if (!user) return;
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
    }, [user, setServers]);

    const fetchRoomsOrDMs = useCallback(async () => {
        if (!user) return;
        try {
            if (selectedServerId) {
                // Fetch rooms for space
                const rooms = await ApiService.fetchRooms(selectedServerId, user.id);
                setChannels(rooms.map((r: any) => ({
                    id: r.id,
                    title: r.name,
                    type: r.type || 'text'
                })));
            } else {
                // Fetch DMs (Home view)
                const dms = await ApiService.fetchDMs(user.id);
                setChannels(dms.map((d: any) => ({
                    id: d.id,
                    title: d.other_display_name || d.other_username,
                    type: 'dm',
                    avatar: d.other_avatar
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
