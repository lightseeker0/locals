import React from 'react';
import { Settings, LogOut, ShieldAlert, Circle, Clock, MinusCircle } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useAppStore } from '../stores/appStore';
import { useI18nStore } from '../stores/i18nStore';
import { clsx } from 'clsx';

export const UserControlPanel: React.FC = () => {
    const { user, logout, userStatus, setUserStatus } = useAuthStore();
    const { setSettingsOpen } = useAppStore();
    const { t } = useI18nStore();


    return (
        <div className="w-full bg-matrix-dark flex flex-col shrink-0 border-t border-white/5 relative">
            {/* Main Profile Bar */}
            <div className="flex items-center gap-3 px-4 py-3">
                {/* Avatar & Status */}
                <div className="relative shrink-0">
                    {user?.avatar_url ? (
                        <img src={user.avatar_url} className="w-12 h-12 rounded-full border border-white/10" alt="" />
                    ) : (
                        <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-matrix-green to-blue-500 flex items-center justify-center">
                            <span className="text-sm font-black text-white">
                                {(user?.display_name || user?.username || '?').substring(0, 1).toUpperCase()}
                            </span>
                        </div>
                    )}
                    <div className={clsx(
                        "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-matrix-dark transition-colors",
                        userStatus === 'online' ? "bg-matrix-green" :
                            userStatus === 'idle' ? "bg-yellow-500" :
                                userStatus === 'dnd' ? "bg-red-500" :
                                    "bg-gray-500"
                    )}>
                        {userStatus === 'dnd' && <div className="w-1.5 h-0.5 bg-matrix-dark absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full" />}
                        {userStatus === 'idle' && <div className="w-1.5 h-1.5 bg-matrix-dark absolute -top-0.5 -left-0.5 rounded-full" />}
                    </div>
                </div>

                {/* User Info */}
                <div className="flex-1 min-w-0">
                    <div className="font-bold text-white truncate text-sm">
                        {user?.display_name || user?.username}
                    </div>
                    <div className="text-matrix-muted truncate text-[11px] opacity-60">
                        {user?.username}
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-1.5 shrink-0">
                    <button
                        onClick={() => setSettingsOpen(true)}
                        className="p-1.5 hover:bg-white/5 rounded-lg transition-all text-matrix-muted hover:text-white"
                        title={t('settings')}
                    >
                        <Settings size={16} />
                    </button>
                    <button
                        onClick={() => {
                            if (confirm(t('logout_confirm') || 'Are you sure you want to log out?')) {
                                logout();
                            }
                        }}
                        className="p-1.5 hover:bg-red-500/20 rounded-lg transition-all text-matrix-muted hover:text-red-500"
                        title={t('logout')}
                    >
                        <LogOut size={16} />
                    </button>
                </div>
            </div>

            {/* Expanded Menu - Status & More */}
            <div className="px-3 py-2 border-b border-white/5 space-y-1.5 max-h-0 overflow-y-auto group hover:max-h-96 transition-all duration-300 absolute -top-96 left-0 right-0 bg-matrix-dark rounded-t-lg shadow-2xl border-t border-white/5">
                {/* Status Selector */}
                <div className="bg-matrix-darker/50 rounded-lg p-2 border border-white/5">
                    <div className="text-[10px] font-black text-matrix-muted uppercase tracking-widest mb-1.5">
                        {t('status') || 'Status'}
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                        {[
                            { id: 'online', label: t('online'), color: 'text-matrix-green', icon: <Circle size={10} fill="currentColor" /> },
                            { id: 'idle', label: t('idle'), color: 'text-yellow-500', icon: <Clock size={10} fill="currentColor" /> },
                            { id: 'dnd', label: t('dnd'), color: 'text-red-500', icon: <MinusCircle size={10} fill="currentColor" /> },
                            { id: 'invisible', label: t('offline'), color: 'text-gray-400', icon: <Circle size={10} /> },
                        ].map((s) => (
                            <button
                                key={s.id}
                                onClick={() => setUserStatus(s.id as any)}
                                className={clsx(
                                    "flex items-center gap-1.5 p-1.5 rounded-lg transition-all text-xs font-bold border",
                                    userStatus === s.id
                                        ? "bg-white/10 border-matrix-green/50 text-white"
                                        : "bg-matrix-darker/30 border-white/5 text-matrix-muted hover:bg-white/5"
                                )}
                            >
                                <div className={clsx("flex items-center justify-center shrink-0", s.color)}>
                                    {s.icon}
                                </div>
                                <span>{s.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Quick Actions */}
                {(user as any)?.is_admin && (
                    <button
                        onClick={() => {/* Admin panel logic */ }}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 bg-matrix-darker/30 hover:bg-white/5 rounded-lg transition-all border border-white/5 hover:border-matrix-green/30 text-xs font-bold text-white"
                    >
                        <ShieldAlert size={14} className="text-matrix-green" />
                        {t('admin_panel')}
                    </button>
                )}
            </div>

        </div>
    );
};
