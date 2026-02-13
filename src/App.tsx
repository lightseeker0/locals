import { useEffect, useState } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { Sidebar } from './components/Sidebar';
import { ChannelList } from './components/ChannelList';
import { ChatArea } from './components/ChatArea';
import { SettingsModal } from './components/modals/SettingsModal';
import { MemberList } from './components/MemberList';
import { useAuthStore } from './stores/authStore';
import { useAppData } from './hooks/useAppData';
import { useThemeStore } from './stores/themeStore';
import { useAppStore } from './stores/appStore';

function App() {
  const { user, isLoading, validateSession } = useAuthStore();
  const { currentBuiltInTheme } = useThemeStore();
  const { isSettingsOpen, setSettingsOpen, isUserListOpen } = useAppStore();
  const [debugStatus, setDebugStatus] = useState('Initializing...');
  const [updateInfo, setUpdateInfo] = useState<{ status: 'available' | 'downloading' | 'ready', progress?: number } | null>(null);

  const { initElectronListener } = useThemeStore();
  useAppData();

  useEffect(() => {
    initElectronListener();

    // Auto-update listeners
    const el = (window as any).electron;
    if (el) {
      el.onUpdateAvailable?.(() => {
        setUpdateInfo({ status: 'available' });
      });

      el.onUpdateProgress?.((progress: any) => {
        setUpdateInfo({ status: 'downloading', progress: progress.percent });
      });

      el.onUpdateDownloaded?.(() => {
        setUpdateInfo({ status: 'ready' });
      });
    }

    const init = async () => {
      try {
        console.log('App starting...');
        setDebugStatus('Starting session validation...');
        await validateSession();
        setDebugStatus('Session validation complete.');
      } catch (e: any) {
        console.error('App init failed:', e);
        setDebugStatus(`Error: ${e.message}`);
      }
    };
    init();
  }, [initElectronListener, validateSession]);

  useEffect(() => {
    // Apply theme
    document.documentElement.className = currentBuiltInTheme;
  }, [currentBuiltInTheme]);

  return (
    <Router>
      {isLoading ? (
        <div className="flex flex-col items-center justify-center h-screen bg-black text-matrix-green font-mono p-4">
          <div className="animate-pulse mb-4">Loading System...</div>
          <div className="text-xs opacity-70 border border-matrix-green/30 p-2 rounded bg-black/50 max-w-md w-full">
            <div className="font-bold border-b border-matrix-green/30 mb-1 pb-1">Debug Status:</div>
            <div>{debugStatus}</div>
            <div className="mt-2 text-[10px] opacity-50">API: {import.meta.env.VITE_API_URL || 'https://locals-1ni.pages.dev/api'}</div>
          </div>
        </div>
      ) : !user ? (
        <Login />
      ) : (
        <div id="app-mount" className="da-app appMount-3stXN7">
          <div className="flex h-screen bg-black text-gray-100 font-sans overflow-hidden selection:bg-matrix-green selection:text-black app-323596 da-app">
            <Sidebar />
            <ChannelList />
            <div className="flex-1 flex flex-col min-w-0 bg-matrix-darker relative z-10 box-399657 da-chat">
              <Routes>
                <Route path="/" element={<ChatArea />} />
                <Route path="/channels/:spaceId/:roomId" element={<ChatArea />} />
                <Route path="/dm/:roomId" element={<ChatArea />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
            {isUserListOpen && (
              <div className="hidden lg:flex shrink-0 da-membersGroup">
                <MemberList />
              </div>
            )}
            <SettingsModal isOpen={isSettingsOpen} onClose={() => setSettingsOpen(false)} />
          </div>

          {/* Update Notification */}
          {updateInfo && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] animate-fade-in-up">
              <div className="bg-matrix-darker border border-matrix-green/50 rounded-xl shadow-2xl p-4 flex items-center gap-4 min-w-[300px]">
                <div className="flex-1">
                  <div className="text-sm font-bold text-white mb-1">
                    {updateInfo.status === 'available' && 'Yeni güncelleme bulundu...'}
                    {updateInfo.status === 'downloading' && 'Güncelleme indiriliyor...'}
                    {updateInfo.status === 'ready' && 'Güncelleme hazır!'}
                  </div>
                  {updateInfo.status === 'downloading' && (
                    <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-matrix-green h-full transition-all duration-300"
                        style={{ width: `${updateInfo.progress || 0}%` }}
                      />
                    </div>
                  )}
                  {updateInfo.status === 'ready' && (
                    <div className="text-xs text-matrix-muted uppercase tracking-wider font-bold">
                      Yüklemek için yeniden başlatın
                    </div>
                  )}
                </div>
                {updateInfo.status === 'ready' && (
                  <button
                    onClick={() => (window as any).electron?.installUpdate()}
                    className="bg-matrix-green text-black px-4 py-2 rounded-lg text-sm font-bold hover:bg-white transition-all shadow-lg active:scale-95"
                  >
                    Hemen Başlat
                  </button>
                )}
                {updateInfo.status !== 'ready' && (
                  <div className="w-5 h-5 border-2 border-matrix-green/30 border-t-matrix-green rounded-full animate-spin" />
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Router>
  );
}

export default App;
