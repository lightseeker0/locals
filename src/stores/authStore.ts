import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ApiService } from '../services/api';

interface AuthState {
    isAuthenticated: boolean;
    user: any | null;
    isLoading: boolean;
    login: (username: string, password?: string) => Promise<void>;
    register: (username: string, password?: string) => Promise<void>;
    updateProfile: (data: { display_name: string, avatar_url: string }) => Promise<void>;
    validateSession: () => Promise<void>;
    userStatus: 'online' | 'idle' | 'dnd' | 'invisible';
    setUserStatus: (status: 'online' | 'idle' | 'dnd' | 'invisible') => void;
    logout: () => void;
    hasHydrated: boolean;
    setHasHydrated: (val: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            isAuthenticated: false,
            user: null,
            isLoading: true,
            userStatus: 'online',
            hasHydrated: false,

            setHasHydrated: (val) => set({ hasHydrated: val }),

            setUserStatus: async (status) => {
                const { user } = useAuthStore.getState();
                set({ userStatus: status });
                if (user) {
                    try {
                        await ApiService.updateProfile(user.id, {
                            display_name: user.display_name,
                            avatar_url: user.avatar_url,
                            custom_status: status
                        } as any);
                    } catch (err) {
                        console.error('Failed to update status on server:', err);
                    }
                }
            },

            login: async (username: string, password?: string) => {
                const user = await ApiService.login({ username, password });
                set({ user, isAuthenticated: true });
            },
            register: async (username: string, password?: string) => {
                const user = await ApiService.register({ username, password });
                set({ user, isAuthenticated: true });
            },
            updateProfile: async (data: { display_name: string, avatar_url: string, bio?: string }) => {
                const { user } = (useAuthStore.getState() as any);
                if (!user) return;
                await ApiService.updateProfile(user.id, data);
                set({ user: { ...user, ...data } });
            },
            validateSession: async () => {
                const { user } = (useAuthStore.getState() as any);
                console.log('Validating session...', { user });
                if (!user) {
                    console.log('No user found, stopping loading.');
                    set({ isLoading: false });
                    return;
                }
                try {
                    console.log('Fetching fresh user data...');
                    const freshUser = await ApiService.getMe(user.id);
                    console.log('User refreshed:', freshUser);

                    // CRITICAL: Merge the session_token back because /api/auth/me doesn't return it
                    const updatedUser = {
                        ...freshUser,
                        session_token: user.session_token
                    };

                    set({ user: updatedUser, isAuthenticated: true, isLoading: false });
                } catch (err) {
                    console.error('Session validation failed:', err);
                    set({ user: null, isAuthenticated: false, isLoading: false });
                }
            },
            logout: () => {
                set({ isAuthenticated: false, user: null });
            },
        }),
        {
            name: 'locals-auth-storage',
            partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
            onRehydrateStorage: () => (state) => {
                state?.setHasHydrated(true);
            }
        }
    )
);
