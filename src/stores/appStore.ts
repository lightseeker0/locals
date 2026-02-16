import { create } from 'zustand';

interface Server {
    id: string;
    title: string;
    type: 'group' | 'dm';
    avatar?: string;
    owner_id?: string;
    is_private?: boolean;
    unread_count?: number;
    mention_count?: number;
}

interface Channel {
    id: string;
    title: string;
    type: 'text' | 'voice' | 'dm';
    avatar?: string;
    last_seen?: string;
    unread_count?: number;
    mention_count?: number;
}

interface AppState {
    selectedServerId: string | null; // null = DM (Home)
    selectedChannelId: string | null;

    servers: Server[];
    channels: Channel[]; // Channels for current server
    channelsByServer: Record<string, Channel[]>;
    lastChannelByServer: Record<string, string | null>;

    isUserListOpen: boolean;
    isSettingsOpen: boolean;
    isMobileMenuOpen: boolean;

    setSelectedServer: (id: string | null) => void;
    setSelectedChannel: (id: string | null) => void;
    setServers: (servers: Server[]) => void;
    setChannels: (channels: Channel[]) => void;
    toggleUserList: () => void;
    setSettingsOpen: (isOpen: boolean) => void;
    setMobileMenuOpen: (isOpen: boolean) => void;
    clearUnread: (channelId: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
    selectedServerId: null,
    selectedChannelId: null,
    servers: [],
    channels: [],
    channelsByServer: {},
    lastChannelByServer: {},
    isUserListOpen: true,
    isSettingsOpen: false,
    isMobileMenuOpen: false,

    setSelectedServer: (id) => set((state) => {
        const prevKey = state.selectedServerId ?? '__dm__';
        const nextKey = id ?? '__dm__';
        const nextLast = { ...state.lastChannelByServer };

        if (state.selectedChannelId) {
            nextLast[prevKey] = state.selectedChannelId;
        }

        const cachedChannels = state.channelsByServer[nextKey] || [];
        let nextSelected = nextLast[nextKey] ?? null;

        if (nextSelected && !cachedChannels.some(c => c.id === nextSelected)) {
            nextSelected = null;
        }
        if (!nextSelected && cachedChannels.length > 0) {
            const firstTextChannel = cachedChannels.find(c => c.type === 'text') || cachedChannels[0];
            nextSelected = firstTextChannel.id;
        }

        return {
            selectedServerId: id,
            selectedChannelId: nextSelected,
            channels: cachedChannels,
            lastChannelByServer: nextLast,
            isMobileMenuOpen: false
        };
    }),
    setSelectedChannel: (id) => set((state) => {
        const key = state.selectedServerId ?? '__dm__';
        return {
            selectedChannelId: id,
            lastChannelByServer: { ...state.lastChannelByServer, [key]: id },
            isMobileMenuOpen: false
        };
    }),
    setServers: (servers) => set({ servers }),
    setChannels: (channels) => set((state) => {
        const key = state.selectedServerId ?? '__dm__';
        const channelsByServer = { ...state.channelsByServer, [key]: channels };
        let selectedChannelId = state.selectedChannelId;

        if (selectedChannelId && !channels.some(c => c.id === selectedChannelId)) {
            selectedChannelId = null;
        }

        if (!selectedChannelId && channels.length > 0) {
            const remembered = state.lastChannelByServer[key];
            if (remembered && channels.some(c => c.id === remembered)) {
                selectedChannelId = remembered;
            } else {
                const firstTextChannel = channels.find(c => c.type === 'text') || channels[0];
                selectedChannelId = firstTextChannel.id;
            }
        }

        const lastChannelByServer = { ...state.lastChannelByServer };
        if (selectedChannelId) {
            lastChannelByServer[key] = selectedChannelId;
        }

        return { channels, channelsByServer, selectedChannelId, lastChannelByServer };
    }),
    toggleUserList: () => set((state) => ({ isUserListOpen: !state.isUserListOpen })),
    setSettingsOpen: (isOpen) => set({ isSettingsOpen: isOpen }),
    setMobileMenuOpen: (isOpen) => set({ isMobileMenuOpen: isOpen }),
    clearUnread: (channelId) => set((state) => ({
        channels: state.channels.map(c =>
            c.id === channelId ? { ...c, unread_count: 0, mention_count: 0 } : c
        )
    })),
}));
