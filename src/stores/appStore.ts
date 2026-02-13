import { create } from 'zustand';

interface Server {
    id: string;
    title: string;
    type: 'group' | 'dm';
    avatar?: string;
    owner_id?: string;
    is_private?: boolean;
}

interface Channel {
    id: string;
    title: string;
    type: 'text' | 'voice' | 'dm';
    avatar?: string;
}

interface AppState {
    selectedServerId: string | null; // null = DM (Home)
    selectedChannelId: string | null;

    servers: Server[];
    channels: Channel[]; // Channels for current server

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
}

export const useAppStore = create<AppState>((set) => ({
    selectedServerId: null,
    selectedChannelId: null,
    servers: [],
    channels: [],
    isUserListOpen: true,
    isSettingsOpen: false,
    isMobileMenuOpen: false,

    setSelectedServer: (id) => {
        set({ selectedServerId: id, selectedChannelId: null, isMobileMenuOpen: false });
    },
    setSelectedChannel: (id) => {
        set({ selectedChannelId: id, isMobileMenuOpen: false });
    },
    setServers: (servers) => set({ servers }),
    setChannels: (channels) => set({ channels }),
    toggleUserList: () => set((state) => ({ isUserListOpen: !state.isUserListOpen })),
    setSettingsOpen: (isOpen) => set({ isSettingsOpen: isOpen }),
    setMobileMenuOpen: (isOpen) => set({ isMobileMenuOpen: isOpen }),
}));
