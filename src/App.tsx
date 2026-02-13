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

  useAppData();

  useEffect(() => {
    const init = async () => {
      try {
        setDebugStatus('Starting session validation...');
        await validateSession();
        setDebugStatus('Session validation complete.');
      } catch (e: any) {
        setDebugStatus(`Error: ${e.message}`);
      }
    };
    init();
  }, []);

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
        <div className="flex h-screen bg-black text-gray-100 font-sans overflow-hidden selection:bg-matrix-green selection:text-black">
          <Sidebar />
          <ChannelList />
          <div className="flex-1 flex flex-col min-w-0 bg-matrix-darker relative z-10">
            <Routes>
              <Route path="/" element={<ChatArea />} />
              <Route path="/channels/:spaceId/:roomId" element={<ChatArea />} />
              <Route path="/dm/:roomId" element={<ChatArea />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
          {isUserListOpen && (
            <div className="hidden lg:flex shrink-0">
              <MemberList />
            </div>
          )}
          <SettingsModal isOpen={isSettingsOpen} onClose={() => setSettingsOpen(false)} />
        </div>
      )}
    </Router>
  );
}

export default App;
