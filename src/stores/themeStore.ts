import { create } from 'zustand';
import '../index.css';
import '../styles/frosted-glass.css'; // Native integration
import '../styles/dark-matter.css'; // Native integration
import { persist } from 'zustand/middleware';
import { ApiService } from '../services/api';

export interface Theme {
    id: string;
    name: string;
    css_content: string;
    is_active: boolean;
    is_url: boolean;
}

interface ThemeState {
    themes: Theme[];
    localThemes: string[];
    currentBuiltInTheme: 'dark' | 'light-mode' | 'frosted-glass' | 'dark-matter';
    builtInThemes: { id: string; name: string; class: string }[];
    fetchThemes: (userId: string) => Promise<void>;
    saveTheme: (userId: string, theme: Omit<Theme, 'id'> & { id?: string }) => Promise<void>;
    deleteTheme: (userId: string, id: string) => Promise<void>;
    toggleTheme: (userId: string, id: string) => Promise<void>;
    setBuiltInTheme: (theme: 'dark' | 'light-mode' | 'frosted-glass' | 'dark-matter') => void;
    applyThemes: () => void;
    initElectronListener: () => void;
}

export const useThemeStore = create<ThemeState>()(
    persist(
        (set, get) => ({
            themes: [],
            localThemes: [],
            currentBuiltInTheme: 'dark',
            builtInThemes: [
                { id: 'matrix-dark', name: 'Matrix Dark', class: 'matrix-dark' },
                { id: 'light-mode', name: 'Light Mode', class: 'light-mode' },
                { id: 'frosted-glass', name: 'Frosted Glass', class: 'frosted-glass' },
                { id: 'dark-matter', name: 'Dark Matter', class: 'dark-matter' }
            ],
            fetchThemes: async (userId: string) => {
                const themes = await ApiService.fetchThemes(userId);
                set({ themes });
                get().applyThemes();
            },
            saveTheme: async (userId: string, theme: Omit<Theme, 'id'> & { id?: string }) => {
                await ApiService.saveTheme(userId, theme);
                await get().fetchThemes(userId);
            },
            deleteTheme: async (userId: string, id: string) => {
                await ApiService.deleteTheme(userId, id);
                await get().fetchThemes(userId);
            },
            toggleTheme: async (userId: string, id: string) => {
                const theme = get().themes.find(t => t.id === id);
                if (!theme) return;
                await ApiService.saveTheme(userId, { ...theme, is_active: !theme.is_active });
                await get().fetchThemes(userId);
            },
            setBuiltInTheme: (theme) => {
                set({ currentBuiltInTheme: theme });
                get().applyThemes();
            },
            applyThemes: () => {
                const { themes, localThemes, currentBuiltInTheme } = get();

                // Clear existing custom themes
                document.querySelectorAll('link[data-custom-theme], style[data-custom-theme]').forEach(el => el.remove());

                // Apply active custom themes from DB
                themes.forEach(theme => {
                    if (theme.is_active) {
                        if (theme.is_url) {
                            const link = document.createElement('link');
                            link.rel = 'stylesheet';
                            link.href = theme.css_content;
                            link.setAttribute('data-custom-theme', 'true');
                            document.head.appendChild(link);
                        } else {
                            const style = document.createElement('style');
                            style.textContent = theme.css_content;
                            style.setAttribute('data-custom-theme', 'true');
                            document.head.appendChild(style);
                        }
                    }
                });

                // Apply local themes from Electron
                localThemes.forEach((css, index) => {
                    const style = document.createElement('style');
                    style.textContent = css;
                    style.setAttribute('data-custom-theme', 'true');
                    style.setAttribute('data-local-theme', index.toString());
                    document.head.appendChild(style);
                });

                // Apply built-in theme
                document.documentElement.classList.remove('dark', 'light-mode');
                document.documentElement.classList.add(currentBuiltInTheme);
            },
            initElectronListener: () => {
                if (typeof window !== 'undefined' && (window as any).electron?.onThemeUpdate) {
                    (window as any).electron.onThemeUpdate((themes: string[]) => {
                        set({ localThemes: themes });
                        get().applyThemes();
                    });
                }
            }
        }),
        {
            name: 'locals-theme-storage',
            partialize: (state) => ({ currentBuiltInTheme: state.currentBuiltInTheme }),
        }
    )
);
