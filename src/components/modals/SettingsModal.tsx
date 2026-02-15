import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useThemeStore } from '../../stores/themeStore';
import { useI18nStore } from '../../stores/i18nStore';
import {
    X, User, Palette, Sparkles, Plus,
    Trash2,
    Save, Globe, Code, Upload, Download, Mic, Circle
} from 'lucide-react';
import { useVoiceStore } from '../../stores/useVoiceStore';
import { clsx } from 'clsx';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
    const { user, updateProfile } = useAuthStore();
    const { themes, fetchThemes, saveTheme, deleteTheme, toggleTheme } = useThemeStore();
    const { t, lang, setLanguage } = useI18nStore();

    const [activeTab, setActiveTab] = useState<'profile' | 'appearance' | 'themes' | 'voice'>('profile');

    // Profile state
    const [displayName, setDisplayName] = useState(user?.display_name || '');
    const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
    const [profileError, setProfileError] = useState<string | null>(null);
    const [profileLoading, setProfileLoading] = useState(false);

    // Theme import state
    const [showImport, setShowImport] = useState(false);
    const [newThemeName, setNewThemeName] = useState('');
    const [newThemeContent, setNewThemeContent] = useState('');
    const [isUrl, setIsUrl] = useState(false);

    // Voice settings
    const { audioInputDeviceId, setAudioInputDevice, audioOutputDeviceId, setAudioOutputDevice } = useVoiceStore();
    const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
    const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
    const [isTestingMic, setIsTestingMic] = useState(false);
    const [micLevel, setMicLevel] = useState(0);
    const micIntervalRef = React.useRef<any>(null);
    const micStreamRef = React.useRef<MediaStream | null>(null);

    useEffect(() => {
        if (isOpen && user) {
            fetchThemes(user.id);
        }

        // Fetch devices
        if (isOpen) {
            navigator.mediaDevices.enumerateDevices().then(devices => {
                setInputDevices(devices.filter(d => d.kind === 'audioinput'));
                setOutputDevices(devices.filter(d => d.kind === 'audiooutput'));
            });
        }
    }, [isOpen, user, fetchThemes]);

    const handleSaveProfile = async () => {
        if (!user) return;
        setProfileLoading(true);
        setProfileError(null);
        try {
            await updateProfile({ display_name: displayName, avatar_url: avatarUrl });
            console.log('Profile updated successfully');
            // Don't close modal - let user see the success. You can add a toast notification here
        } catch (error: any) {
            const errorMsg = error?.message || 'Failed to update profile';
            console.error('Failed to update profile:', error);
            setProfileError(errorMsg);
        } finally {
            setProfileLoading(false);
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            setNewThemeContent(content);
            if (!newThemeName) {
                setNewThemeName(file.name.replace('.css', '').replace('.theme', ''));
            }
            setIsUrl(false);
        };
        reader.readAsText(file);
    };

    const handleImportTheme = async () => {
        if (!user || !newThemeName || !newThemeContent) return;
        try {
            await saveTheme(user.id, {
                name: newThemeName,
                css_content: newThemeContent,
                is_url: isUrl,
                is_active: true
            });
            setNewThemeName('');
            setNewThemeContent('');
            setShowImport(false);
        } catch (error) {
            alert('Failed to import theme');
        }
    };

    const stopMicTest = () => {
        setIsTestingMic(false);
        setMicLevel(0);
        if (micIntervalRef.current) clearInterval(micIntervalRef.current);
        if (micStreamRef.current) {
            micStreamRef.current.getTracks().forEach(t => t.stop());
            micStreamRef.current = null;
        }
    };

    const startMicTest = async () => {
        if (isTestingMic) {
            stopMicTest();
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: audioInputDeviceId ? { deviceId: { exact: audioInputDeviceId } } : true
            });
            micStreamRef.current = stream;

            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const analyser = audioContext.createAnalyser();
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
            analyser.fftSize = 256;

            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            setIsTestingMic(true);

            micIntervalRef.current = setInterval(() => {
                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < bufferLength; i++) {
                    sum += dataArray[i];
                }
                const average = sum / bufferLength;
                // Scale 0-255 to 0-100 for percentage bar
                setMicLevel(Math.min(100, Math.round((average / 128) * 100)));
            }, 50);

            // Audio Loopback via hidden element
            if (audioOutputDeviceId || true) {
                const testAudio = document.getElementById('mic-test-audio') as HTMLAudioElement;
                if (testAudio) {
                    testAudio.srcObject = stream;
                    if (audioOutputDeviceId && (testAudio as any).setSinkId) {
                        (testAudio as any).setSinkId(audioOutputDeviceId).catch(console.error);
                    }
                    testAudio.play().catch(console.error);
                }
            }

        } catch (err) {
            console.error('Mic test failed:', err);
            alert('Could not access microphone for testing.');
            stopMicTest();
        }
    };

    useEffect(() => {
        return () => stopMicTest();
    }, [activeTab, isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-[#15191E] w-full max-w-5xl h-[80vh] rounded-[2rem] border border-white/5 flex overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                {/* Sidebar */}
                <div className="w-64 bg-[#101317] border-r border-white/5 p-6 flex flex-col gap-2">
                    <h2 className="text-white/20 text-[11px] font-black uppercase tracking-widest mb-4 px-3">Settings</h2>

                    <button
                        onClick={() => setActiveTab('profile')}
                        className={clsx(
                            "flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-[14px]",
                            activeTab === 'profile' ? "bg-matrix-green/10 text-matrix-green" : "text-matrix-muted hover:bg-white/5"
                        )}
                    >
                        <User size={18} /> {t('profile')}
                    </button>

                    <button
                        onClick={() => setActiveTab('appearance')}
                        className={clsx(
                            "flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-[14px]",
                            activeTab === 'appearance' ? "bg-matrix-green/10 text-matrix-green" : "text-matrix-muted hover:bg-white/5"
                        )}
                    >
                        <Palette size={18} /> {t('appearance')}
                    </button>

                    <button
                        onClick={() => setActiveTab('themes')}
                        className={clsx(
                            "flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-[14px]",
                            activeTab === 'themes' ? "bg-matrix-green/10 text-matrix-green" : "text-matrix-muted hover:bg-white/5"
                        )}
                    >
                        <Sparkles size={18} /> {t('themes')}
                    </button>

                    <button
                        onClick={() => setActiveTab('voice')}
                        className={clsx(
                            "flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-[14px]",
                            activeTab === 'voice' ? "bg-matrix-green/10 text-matrix-green" : "text-matrix-muted hover:bg-white/5"
                        )}
                    >
                        <Mic size={18} /> {t('voice_video')}
                    </button>

                    <div className="mt-auto pt-6 border-t border-white/5 text-center">
                        <p className="text-[10px] text-matrix-muted font-bold tracking-widest uppercase opacity-30">Locals v2.0 - Element Edition</p>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 flex flex-col min-w-0 bg-matrix-darker/50">
                    <div className="h-16 flex items-center justify-between px-8 border-b border-white/5">
                        <h1 className="text-xl font-black text-white capitalize">{activeTab}</h1>
                        <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-matrix-muted transition-colors">
                            <X size={24} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                        <div className="max-w-2xl mx-auto space-y-10">

                            {activeTab === 'profile' && (
                                <div className="space-y-8">
                                    <div className="flex items-center gap-8">
                                        <div className="relative group">
                                            <label className="cursor-pointer block">
                                                <div className="w-24 h-24 rounded-[2rem] bg-matrix-green/10 border-2 border-dashed border-matrix-green/30 flex items-center justify-center overflow-hidden hover:border-matrix-green/60 transition-colors relative">
                                                    {avatarUrl ? <img src={avatarUrl} className="w-full h-full object-cover" alt="" /> : <User size={40} className="text-matrix-green" />}

                                                    {/* Hover Overlay */}
                                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-1 transition-opacity">
                                                        <Upload size={20} className="text-white" />
                                                        <span className="text-[10px] font-bold text-white uppercase tracking-wider">{t('change')}</span>
                                                    </div>
                                                </div>
                                                <input type="file" accept="image/*" onChange={(e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file) {
                                                        // Check file size first
                                                        if (file.size > 5000000) {
                                                            setProfileError('Selected file is too large (>5MB). Use a smaller image.');
                                                            return;
                                                        }

                                                        const reader = new FileReader();
                                                        reader.onload = (ev) => {
                                                            const img = new Image();
                                                            img.onload = () => {
                                                                // Use raw data URL from result to preserve original quality
                                                                const dataUrl = ev.target?.result as string;

                                                                if (dataUrl.length > 5 * 1024 * 1024) { // 5MB limit for DataURL
                                                                    setProfileError('Image file is too large (>5MB)');
                                                                    return;
                                                                }

                                                                setProfileError(null);
                                                                setAvatarUrl(dataUrl);
                                                            };
                                                            img.src = ev.target?.result as string;
                                                        };
                                                        reader.readAsDataURL(file);
                                                    }
                                                }} className="hidden" />
                                            </label>
                                        </div>
                                        <div className="flex-1 space-y-4">
                                            <div>
                                                <label className="block text-[11px] font-black text-matrix-muted uppercase tracking-widest mb-1.5 ml-1">{t('display_name')}</label>
                                                <input
                                                    value={displayName}
                                                    onChange={e => setDisplayName(e.target.value)}
                                                    className="w-full bg-[#101317] border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-matrix-green/30 transition-all font-medium"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {profileError && (
                                        <div className="bg-red-500/20 border border-red-500/50 text-red-300 rounded-lg px-4 py-3 text-sm font-medium">
                                            {profileError}
                                        </div>
                                    )}

                                    <button
                                        onClick={handleSaveProfile}
                                        disabled={profileLoading}
                                        className="bg-matrix-green text-matrix-darker px-8 py-3 rounded-xl font-black text-[14px] hover:scale-105 disabled:opacity-50 transition-all shadow-lg flex items-center gap-2"
                                    >
                                        <Save size={18} /> {profileLoading ? 'Saving...' : t('save')}
                                    </button>

                                    {/* Language Switcher */}
                                    <div className="pt-8 border-t border-white/5">
                                        <h3 className="text-lg font-bold text-white mb-4">{t('language')}</h3>
                                        <div className="flex gap-4">
                                            <button
                                                onClick={() => setLanguage('en')}
                                                className={clsx(
                                                    "px-6 py-3 rounded-xl font-bold text-sm transition-all border",
                                                    lang === 'en' ? "bg-matrix-green/10 border-matrix-green text-matrix-green" : "bg-white/5 border-white/10 text-matrix-muted hover:text-white"
                                                )}
                                            >
                                                English
                                            </button>
                                            <button
                                                onClick={() => setLanguage('tr')}
                                                className={clsx(
                                                    "px-6 py-3 rounded-xl font-bold text-sm transition-all border",
                                                    lang === 'tr' ? "bg-matrix-green/10 border-matrix-green text-matrix-green" : "bg-white/5 border-white/10 text-matrix-muted hover:text-white"
                                                )}
                                            >
                                                Türkçe
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'appearance' && (
                                <div className="space-y-8">
                                    <h3 className="text-lg font-bold text-white mb-2">{t('built_in_themes')}</h3>
                                    <div className="flex justify-center">
                                        {useThemeStore.getState().builtInThemes.map(theme => (
                                            <div
                                                key={theme.id}
                                                className="p-8 rounded-2xl flex flex-col items-center gap-4 bg-matrix-green/10 border border-matrix-green/30 max-w-sm"
                                            >
                                                <Circle size={48} className="text-blue-400" />
                                                <span className="font-black text-xl text-blue-400">
                                                    {theme.name}
                                                </span>
                                                <p className="text-xs text-matrix-muted text-center">
                                                    {t('current_theme') || 'Active Theme'}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {activeTab === 'themes' && (
                                <div className="space-y-6">
                                    {/* (Theme content kept as is) */}
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-lg font-bold text-white">{t('custom_themes')}</h3>
                                        <button
                                            onClick={() => setShowImport(true)}
                                            className="bg-white/5 hover:bg-white/10 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all"
                                        >
                                            <Plus size={16} /> {t('import_theme')}
                                        </button>
                                    </div>

                                    {showImport && (
                                        // ... (Theme import modal logic - same as before) ...
                                        <div className="bg-[#101317] border border-matrix-green/30 p-6 rounded-2xl space-y-4 animate-in slide-in-from-top-4 duration-200">
                                            <div className="flex items-center justify-between mb-2">
                                                <h4 className="font-black text-matrix-green uppercase text-xs tracking-widest">New Custom Theme</h4>
                                                <button onClick={() => setShowImport(false)} className="text-matrix-muted p-1"><X size={16} /></button>
                                            </div>

                                            <input
                                                placeholder="Theme Name (e.g. Frosted Glass)"
                                                value={newThemeName}
                                                onChange={e => setNewThemeName(e.target.value)}
                                                className="w-full bg-matrix-darker border border-white/5 rounded-xl px-4 py-3 text-white outline-none focus:border-matrix-green/30 font-medium"
                                            />

                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => setIsUrl(true)}
                                                    className={clsx(
                                                        "flex-1 py-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-2 transition-all",
                                                        isUrl ? "bg-matrix-green/10 border-matrix-green/30 text-matrix-green" : "border-white/5 text-matrix-muted opacity-50"
                                                    )}
                                                >
                                                    <Globe size={16} /> CSS URL
                                                </button>
                                                <button
                                                    onClick={() => setIsUrl(false)}
                                                    className={clsx(
                                                        "flex-1 py-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-2 transition-all",
                                                        !isUrl ? "bg-matrix-green/10 border-matrix-green/30 text-matrix-green" : "border-white/5 text-matrix-muted opacity-50"
                                                    )}
                                                >
                                                    <Code size={16} /> Raw CSS
                                                </button>
                                                <label className="flex-1 py-3 rounded-xl border border-white/5 text-matrix-muted opacity-50 hover:opacity-100 hover:bg-white/5 hover:border-white/10 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer">
                                                    <Upload size={16} /> Upload File
                                                    <input type="file" accept=".css" onChange={handleFileUpload} className="hidden" />
                                                </label>
                                            </div>

                                            <textarea
                                                placeholder={isUrl ? "https://betterdiscord.app/theme/Example.css" : ".app-mount { background: red; }"}
                                                value={newThemeContent}
                                                onChange={e => setNewThemeContent(e.target.value)}
                                                rows={4}
                                                className="w-full bg-matrix-darker border border-white/5 rounded-xl px-4 py-3 text-white outline-none focus:border-matrix-green/30 font-mono text-xs resize-none"
                                            />

                                            <button
                                                onClick={handleImportTheme}
                                                className="w-full bg-matrix-green text-matrix-darker py-3 rounded-xl font-black text-[14px] hover:scale-[1.02] transition-all shadow-xl flex items-center justify-center gap-2"
                                            >
                                                <Download size={18} />
                                                {t('install_apply')}
                                            </button>
                                        </div>
                                    )}

                                    {/* ... rest of theme list ... */}
                                    <div className="space-y-3">
                                        {/* ... (Existing theme mapping logic) ... */}
                                        {themes.map(theme => (
                                            <div key={theme.id} className="bg-white/5 border border-white/5 p-5 rounded-2xl flex items-center justify-between group hover:border-white/10 transition-all">
                                                <div className="flex items-center gap-4">
                                                    <div className={clsx(
                                                        "w-12 h-12 rounded-xl flex items-center justify-center border",
                                                        theme.is_active ? "bg-matrix-green/10 border-matrix-green/30 text-matrix-green" : "bg-white/5 border-white/5 text-matrix-muted"
                                                    )}>
                                                        {theme.is_url ? <Globe size={20} /> : <Code size={20} />}
                                                    </div>
                                                    <div>
                                                        <h4 className="font-bold text-white">{theme.name}</h4>
                                                        <p className="text-[10px] text-matrix-muted font-black uppercase tracking-widest opacity-40">
                                                            {theme.is_url ? 'External CSS' : 'Custom Block'}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <button
                                                        onClick={() => toggleTheme(user!.id, theme.id)}
                                                        className={clsx(
                                                            "px-4 py-2 rounded-lg font-bold text-xs transition-all",
                                                            theme.is_active ? "bg-matrix-green text-matrix-darker shadow-lg shadow-matrix-green/20" : "bg-white/5 text-matrix-muted hover:bg-white/10"
                                                        )}
                                                    >
                                                        {theme.is_active ? t('enabled') : t('enable')}
                                                    </button>
                                                    <button
                                                        onClick={() => deleteTheme(user!.id, theme.id)}
                                                        className="p-2 text-matrix-muted hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Built-in Defaults & Disclaimer */}
                                    {/* ... (Kept as is) ... */}
                                </div>
                            )}

                            {activeTab === 'voice' && (
                                <div className="space-y-8">
                                    <div className="bg-white/5 border border-white/5 p-6 rounded-2xl space-y-4">
                                        <h3 className="text-lg font-bold text-white mb-4">{t('input_output')}</h3>

                                        {/* Input Device */}
                                        <div>
                                            <label className="block text-[11px] font-black text-matrix-muted uppercase tracking-widest mb-1.5 ml-1">{t('input_device')}</label>
                                            <select
                                                onChange={(e) => setAudioInputDevice(e.target.value)}
                                                value={audioInputDeviceId || ''}
                                                className="w-full bg-[#101317] border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-matrix-green/30 transition-all font-medium appearance-none"
                                            >
                                                <option value="">{t('default')}</option>
                                                {inputDevices.map(device => (
                                                    <option key={device.deviceId} value={device.deviceId}>
                                                        {device.label || `Microphone ${device.deviceId.slice(0, 5)}...`}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Output Device */}
                                        <div>
                                            <label className="block text-[11px] font-black text-matrix-muted uppercase tracking-widest mb-1.5 ml-1">{t('output_device')}</label>
                                            <select
                                                onChange={(e) => setAudioOutputDevice(e.target.value)}
                                                value={audioOutputDeviceId || ''}
                                                className="w-full bg-[#101317] border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-matrix-green/30 transition-all font-medium appearance-none"
                                            >
                                                <option value="">{t('default')}</option>
                                                {outputDevices.map(device => (
                                                    <option key={device.deviceId} value={device.deviceId}>
                                                        {device.label || `Speaker ${device.deviceId.slice(0, 5)}...`}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    {/* Mic Test Section */}
                                    <div className="bg-white/5 border border-white/5 p-6 rounded-2xl space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h3 className="text-white font-bold">{t('mic_test') || 'Giriş Cihazı Testi'}</h3>
                                                <p className="text-[11px] text-matrix-muted uppercase tracking-widest mt-1">Check if your microphone is working.</p>
                                            </div>
                                            <button
                                                onClick={startMicTest}
                                                className={clsx(
                                                    "px-6 py-2.5 rounded-xl font-black text-xs transition-all uppercase tracking-widest",
                                                    isTestingMic
                                                        ? "bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.3)]"
                                                        : "bg-matrix-green text-matrix-darker shadow-[0_0_20px_rgba(13,189,139,0.2)] hover:scale-105"
                                                )}
                                            >
                                                {isTestingMic ? (t('stop_test') || 'TESTİ DURDUR') : (t('start_test') || 'MİKROFONU TEST ET')}
                                            </button>
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center px-1">
                                                <span className="text-[10px] font-black text-matrix-muted uppercase tracking-widest">{t('mic_level') || 'Mikrofon Seviyesi'}</span>
                                                <span className={clsx("text-xs font-mono font-bold transition-colors", micLevel > 70 ? "text-yellow-400" : micLevel > 0 ? "text-matrix-green" : "text-matrix-muted")}>
                                                    {micLevel}%
                                                </span>
                                            </div>
                                            <div className="h-2 bg-matrix-darker border border-white/5 rounded-full overflow-hidden p-0.5">
                                                <div
                                                    className={clsx(
                                                        "h-full rounded-full transition-all duration-75 shadow-[0_0_10px_rgba(13,189,139,0.3)]",
                                                        micLevel > 80 ? "bg-red-500" : micLevel > 50 ? "bg-yellow-400" : "bg-matrix-green"
                                                    )}
                                                    style={{ width: `${micLevel}%` }}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="text-center p-8 opacity-50">
                                        <p className="text-xs text-matrix-muted">Video settings coming soon.</p>
                                    </div>
                                </div>
                            )}

                        </div>
                    </div>
                </div>
            </div>
            {/* Hidden audio element for mic test loopback */}
            <audio id="mic-test-audio" style={{ display: 'none' }} />
        </div>
    );
};

