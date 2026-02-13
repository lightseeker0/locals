export interface ElectronAPI {
    onThemeUpdate: (callback: (theme: string[]) => void) => void;
    onUpdateAvailable: (callback: (info: any) => void) => void;
    onUpdateProgress: (callback: (progress: any) => void) => void;
    onUpdateDownloaded: (callback: (info: any) => void) => void;
    onCheckingForUpdate: (callback: () => void) => void;
    onUpdateNotAvailable: (callback: (info: any) => void) => void;
    installUpdate: () => void;
    checkForUpdates: () => void;
    getAppVersion: () => Promise<string>;
}

declare global {
    interface Window {
        electron: ElectronAPI;
    }
}
