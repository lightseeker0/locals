export interface ElectronAPI {
    onThemeUpdate: (callback: (theme: string[]) => void) => void;
    onUpdateAvailable: (callback: (info: any) => void) => void;
    onUpdateProgress: (callback: (progress: any) => void) => void;
    onUpdateDownloaded: (callback: (info: any) => void) => void;
    onCheckingForUpdate: (callback: () => void) => void;
    onUpdateNotAvailable: (callback: (info: any) => void) => void;
    installUpdate: () => void;
    checkForUpdates: () => Promise<{ ok: boolean; reason?: string; updateInfo?: any }>;
    getAppVersion: () => Promise<string>;
    // Window Controls
    minimize: () => void;
    maximize: () => void;
    close: () => void;
    startResize: (edge: ResizeEdge, screenX: number, screenY: number) => Promise<boolean>;
    moveResize: (screenX: number, screenY: number) => void;
    endResize: () => void;
    // Error Handling
    onUpdateError: (callback: (message: string) => void) => void;
}

export type ResizeEdge =
    | 'top'
    | 'right'
    | 'bottom'
    | 'left'
    | 'top-left'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-right';

declare global {
    interface Window {
        electron: ElectronAPI;
    }
}
