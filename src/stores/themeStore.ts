import { create } from 'zustand';
import '../index.css';
import '../styles/frosted-glass.css'; // Native integration
import '../styles/dark-matter.css'; // Native integration
import '../styles/roundmoled.css'; // Native integration
import { persist } from 'zustand/middleware';
import { ApiService } from '../services/api';

let themeApplyRevision = 0;

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
    hasActiveCustomTheme: boolean;
    currentBuiltInTheme: 'roundmoled';
    builtInThemes: { id: string; name: string; class: string }[];
    fetchThemes: (userId: string) => Promise<void>;
    saveTheme: (userId: string, theme: Omit<Theme, 'id'> & { id?: string }) => Promise<void>;
    deleteTheme: (userId: string, id: string) => Promise<void>;
    toggleTheme: (userId: string, id: string) => Promise<void>;
    setBuiltInTheme: (theme: 'roundmoled') => void;
    applyThemes: () => Promise<void>;
    initElectronListener: () => void;
}

export const useThemeStore = create<ThemeState>()(
    persist(
        (set, get) => ({
            themes: [],
            localThemes: [],
            hasActiveCustomTheme: false,
            currentBuiltInTheme: 'roundmoled',
            builtInThemes: [
                { id: 'roundmoled', name: 'Roundmoled V2', class: 'roundmoled' }
            ],
            fetchThemes: async (userId: string) => {
                const themes = await ApiService.fetchThemes(userId);
                set({ themes });
                await get().applyThemes();
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
                void get().applyThemes();
            },
            applyThemes: async () => {
                const revision = ++themeApplyRevision;
                const { themes, localThemes, currentBuiltInTheme } = get();
                const hasActiveCustomTheme = themes.some(t => !!t.is_active) || localThemes.length > 0;
                set({ hasActiveCustomTheme });

                // Clear existing custom themes
                document.querySelectorAll('link[data-custom-theme], style[data-custom-theme]').forEach(el => el.remove());

                // Apply active custom themes from DB
                for (const theme of themes) {
                    if (!theme.is_active) continue;
                    if (revision !== themeApplyRevision) return;

                    if (theme.is_url) {
                        try {
                            const resolved = await ApiService.resolveThemeUrl(theme.css_content);
                            if (revision !== themeApplyRevision) return;

                            const style = document.createElement('style');
                            style.textContent = resolved.css_content;
                            style.setAttribute('data-custom-theme', 'true');
                            style.setAttribute('data-theme-id', theme.id);
                            style.setAttribute('data-source-url', resolved.resolved_url);
                            document.head.appendChild(style);
                        } catch (err) {
                            console.error('[Theme] Failed to resolve URL theme, falling back to link:', err);
                            const link = document.createElement('link');
                            link.rel = 'stylesheet';
                            link.href = theme.css_content;
                            link.setAttribute('data-custom-theme', 'true');
                            link.setAttribute('data-theme-id', theme.id);
                            document.head.appendChild(link);
                        }
                    } else {
                        const style = document.createElement('style');
                        style.textContent = theme.css_content;
                        style.setAttribute('data-custom-theme', 'true');
                        style.setAttribute('data-theme-id', theme.id);
                        document.head.appendChild(style);
                    }
                }

                // Apply local themes from Electron
                localThemes.forEach((css, index) => {
                    const style = document.createElement('style');
                    style.textContent = css;
                    style.setAttribute('data-custom-theme', 'true');
                    style.setAttribute('data-local-theme', index.toString());
                    document.head.appendChild(style);
                });

                // Apply built-in theme only when no custom theme is active.
                document.documentElement.classList.remove('dark', 'light-mode', currentBuiltInTheme);
                if (!hasActiveCustomTheme) {
                    document.documentElement.classList.add(currentBuiltInTheme);
                }
            },
            initElectronListener: () => {
                if (typeof window !== 'undefined' && (window as any).electron?.onThemeUpdate) {
                    (window as any).electron.onThemeUpdate((themes: string[]) => {
                        set({ localThemes: themes });
                        void get().applyThemes();
                    });
                }
            }
        }),
        {
            name: 'fiskos-theme-storage',
            partialize: (state) => ({ currentBuiltInTheme: state.currentBuiltInTheme }),
        }
    )
);
