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
    document.documentElement.setAttribute('data-theme', currentBuiltInTheme);
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

          {/* Update Notification - Forced Overlay */}
          {updateInfo && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6 bg-black/90 backdrop-blur-md animate-fade-in">
              <div className="bg-matrix-darker border-2 border-matrix-green shadow-[0_0_50px_rgba(13,189,139,0.3)] rounded-2xl p-8 max-w-md w-full text-center relative overflow-hidden group">
                {/* Background pulse effect */}
                <div className="absolute inset-0 bg-matrix-green/5 animate-pulse" />

                <div className="relative z-10">
                  <div className="mb-6 inline-flex p-4 rounded-full bg-matrix-green/10 border border-matrix-green/20">
                    <div className="w-12 h-12 border-4 border-matrix-green/30 border-t-matrix-green rounded-full animate-spin" />
                  </div>

                  <h2 className="text-2xl font-black text-white mb-2 tracking-tight">
                    {updateInfo.status === 'available' && 'SİSTEM GÜNCELLEMESİ'}
                    {updateInfo.status === 'downloading' && 'VERİ AKTARILIYOR'}
                    {updateInfo.status === 'ready' && 'GÜNCELLEME HAZIR'}
                  </h2>

                  <p className="text-matrix-muted text-sm mb-8 leading-relaxed">
                    {updateInfo.status === 'available' && 'Yeni bir sürüm tespit edildi. Devam etmek için güncelleme zorunludur.'}
                    {updateInfo.status === 'downloading' && 'Kritik sistem dosyaları indiriliyor. Lütfen bekleyin...'}
                    {updateInfo.status === 'ready' && 'Tüm dosyalar doğrulandı. Değişikliklerin uygulanması için yeniden başlatın.'}
                  </p>

                  {updateInfo.status === 'downloading' && (
                    <div className="mb-8">
                      <div className="flex justify-between text-[10px] font-bold text-matrix-green uppercase mb-2">
                        <span>İlerleme</span>
                        <span>{Math.round(updateInfo.progress || 0)}%</span>
                      </div>
                      <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden border border-white/10">
                        <div
                          className="bg-matrix-green h-full transition-all duration-300 shadow-[0_0_15px_rgba(13,189,139,0.5)]"
                          style={{ width: `${updateInfo.progress || 0}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-3">
                    {updateInfo.status === 'ready' ? (
                      <button
                        onClick={() => (window as any).electron?.installUpdate()}
                        className="w-full bg-matrix-green text-black py-4 rounded-xl font-black text-sm hover:bg-white transition-all shadow-[0_0_30px_rgba(13,189,139,0.4)] active:scale-[0.98] uppercase tracking-widest"
                      >
                        Sistemi Güncelle ve Başlat
                      </button>
                    ) : (
                      <div className="text-[10px] font-bold text-matrix-green/40 uppercase tracking-[0.2em] animate-pulse">
                        Giriş Engellendi
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </Router>
  );
}

export default App;
