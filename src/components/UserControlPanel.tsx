import React, { useState } from 'react';
import { Settings, LogOut, Bell, ShieldAlert, Circle, Clock, MinusCircle } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useAppStore } from '../stores/appStore';
import { useI18nStore } from '../stores/i18nStore';
import { clsx } from 'clsx';
import { NotificationList } from './NotificationList';

export const UserControlPanel: React.FC = () => {
    const { user, logout, userStatus, setUserStatus } = useAuthStore();
    const { setSettingsOpen } = useAppStore();
    const { t } = useI18nStore();

    const [showNotifications, setShowNotifications] = useState(false);
    const [isStatusPickerOpen, setIsStatusPickerOpen] = useState(false);

    return (
        <div className="w-[280px] bg-matrix-dark flex flex-col shrink-0 border-r border-white/5 h-full">
            {/* Header */}
            <div className="h-12 flex items-center justify-center px-4 border-b border-white/5 shrink-0">
                <h2 className="font-bold text-white text-sm uppercase tracking-wider">
                    {t('user_panel') || 'User Panel'}
                </h2>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {/* User Profile Card */}
                <div className="bg-matrix-darker/50 rounded-2xl p-4 border border-white/5">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="relative shrink-0">
                            {user?.avatar_url ? (
                                <img src={user.avatar_url} className="w-12 h-12 rounded-xl border border-white/10" alt="" />
                            ) : (
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-matrix-green to-blue-500 flex items-center justify-center">
                                    <span className="text-lg font-black text-white">
                                        {(user?.display_name || user?.username || '?').substring(0, 1).toUpperCase()}
                                    </span>
                                </div>
                            )}
                            <div className={clsx(
                                "absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-matrix-dark transition-colors",
                                userStatus === 'online' ? "bg-matrix-green" :
                                    userStatus === 'idle' ? "bg-yellow-500" :
                                        userStatus === 'dnd' ? "bg-red-500" :
                                            "bg-gray-500"
                            )}>
                                {userStatus === 'dnd' && <div className="w-2 h-0.5 bg-matrix-dark absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full" />}
                                {userStatus === 'idle' && <div className="w-2 h-2 bg-matrix-dark absolute -top-0.5 -left-0.5 rounded-full" />}
                            </div>
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="font-black text-white truncate text-sm">
                                {user?.display_name || user?.username}
                            </div>
                            <div className="text-matrix-muted truncate text-xs font-bold opacity-60">
                                {user?.username}
                            </div>
                        </div>
                    </div>

                    {/* Status Selector */}
                    <div className="relative">
                        <button
                            onClick={() => setIsStatusPickerOpen(!isStatusPickerOpen)}
                            className="w-full bg-matrix-darker border border-white/10 rounded-xl px-3 py-2 text-left hover:border-matrix-green/30 transition-all"
                        >
                            <div className="text-[10px] font-black text-matrix-muted uppercase tracking-widest mb-1">
                                {t('status') || 'Status'}
                            </div>
                            <div className="flex items-center gap-2">
                                <div className={clsx(
                                    "w-2 h-2 rounded-full",
                                    userStatus === 'online' ? "bg-matrix-green" :
                                        userStatus === 'idle' ? "bg-yellow-500" :
                                            userStatus === 'dnd' ? "bg-red-500" :
                                                "bg-gray-500"
                                )} />
                                <span className="text-xs font-bold text-white">
                                    {t(userStatus === 'invisible' ? 'offline' : userStatus)}
                                </span>
                            </div>
                        </button>

                        {/* Status Picker Dropdown */}
                        {isStatusPickerOpen && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setIsStatusPickerOpen(false)} />
                                <div className="absolute top-full left-0 right-0 mt-2 bg-matrix-darker/95 border border-white/10 rounded-xl shadow-2xl p-1.5 z-50 backdrop-blur-xl">
                                    {[
                                        { id: 'online', label: t('online'), color: 'text-matrix-green', icon: <Circle size={12} fill="currentColor" /> },
                                        { id: 'idle', label: t('idle'), color: 'text-yellow-500', icon: <Clock size={12} fill="currentColor" /> },
                                        { id: 'dnd', label: t('dnd'), color: 'text-red-500', icon: <MinusCircle size={12} fill="currentColor" /> },
                                        { id: 'invisible', label: t('offline'), color: 'text-gray-400', icon: <Circle size={12} /> },
                                    ].map((s) => (
                                        <div
                                            key={s.id}
                                            onClick={() => {
                                                setUserStatus(s.id as any);
                                                setIsStatusPickerOpen(false);
                                            }}
                                            className="flex items-center gap-3 p-2.5 hover:bg-white/5 rounded-lg cursor-pointer transition-all group"
                                        >
                                            <div className={clsx("w-5 h-5 flex items-center justify-center shrink-0", s.color)}>
                                                {s.icon}
                                            </div>
                                            <span className="text-xs font-bold text-matrix-muted group-hover:text-white transition-colors">
                                                {s.label}
                                            </span>
                                            {userStatus === s.id && (
                                                <div className="ml-auto w-1.5 h-1.5 bg-matrix-green rounded-full shadow-[0_0_8px_rgba(0,255,100,0.6)]" />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="space-y-2">
                    <div className="text-[10px] font-black text-matrix-muted uppercase tracking-widest px-2 mb-2">
                        {t('quick_actions') || 'Quick Actions'}
                    </div>

                    {(user as any)?.is_admin && (
                        <button
                            onClick={() => {/* Admin panel logic */ }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 bg-matrix-darker/50 hover:bg-white/5 rounded-xl transition-all border border-white/5 hover:border-matrix-green/30"
                        >
                            <ShieldAlert size={18} className="text-matrix-green" />
                            <span className="text-sm font-bold text-white">{t('admin_panel')}</span>
                        </button>
                    )}

                    <button
                        onClick={() => setShowNotifications(!showNotifications)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 bg-matrix-darker/50 hover:bg-white/5 rounded-xl transition-all border border-white/5 hover:border-matrix-green/30"
                    >
                        <Bell size={18} className="text-matrix-muted" />
                        <span className="text-sm font-bold text-white">{t('notifications')}</span>
                    </button>

                    <button
                        onClick={() => setSettingsOpen(true)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 bg-matrix-darker/50 hover:bg-white/5 rounded-xl transition-all border border-white/5 hover:border-matrix-green/30"
                    >
                        <Settings size={18} className="text-matrix-muted" />
                        <span className="text-sm font-bold text-white">{t('settings')}</span>
                    </button>

                    <button
                        onClick={() => {
                            if (confirm(t('logout_confirm') || 'Are you sure you want to log out?')) {
                                logout();
                            }
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 bg-red-500/10 hover:bg-red-500/20 rounded-xl transition-all border border-red-500/20 hover:border-red-500/40"
                    >
                        <LogOut size={18} className="text-red-500" />
                        <span className="text-sm font-bold text-red-500">{t('logout')}</span>
                    </button>
                </div>
            </div>

            {/* Notifications Popup */}
            {showNotifications && <NotificationList onClose={() => setShowNotifications(false)} />}
        </div>
    );
};
