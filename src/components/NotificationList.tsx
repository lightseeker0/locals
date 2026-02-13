import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { ApiService } from '../services/api';
import { useI18nStore } from '../stores/i18nStore';
import { X, Check } from 'lucide-react';
import { clsx } from 'clsx';

interface Notification {
    id: string;
    actor_username: string;
    actor_display_name: string;
    actor_avatar: string;
    type: string;
    resource_id: string;
    is_read: boolean;
    created_at: string;
}

interface NotificationListProps {
    onClose: () => void;
}

export const NotificationList: React.FC<NotificationListProps> = ({ onClose }) => {
    const { user } = useAuthStore();
    const { t } = useI18nStore();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user) {
            loadNotifications();
        }
    }, [user]);

    const loadNotifications = async () => {
        try {
            const data = await ApiService.fetchNotifications(user!.id);
            setNotifications(data);
        } catch (error) {
            console.error('Failed to load notifications', error);
        } finally {
            setLoading(false);
        }
    };

    const markAsRead = async (id: string) => {
        try {
            await ApiService.markNotificationAsRead(user!.id, id);
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
        } catch (error) {
            console.error('Failed to mark as read', error);
        }
    };

    const markAllAsRead = async () => {
        try {
            await ApiService.markAllNotificationsAsRead(user!.id);
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        } catch (error) {
            console.error('Failed to mark all as read', error);
        }
    };

    return (
        <div className="fixed left-[280px] bottom-16 w-80 bg-matrix-darker/95 backdrop-blur-xl shadow-2xl rounded-2xl border border-white/10 z-[100] flex flex-col max-h-[500px] animate-in slide-in-from-left-4 duration-200">
            <div className="p-4 border-b border-white/5 flex justify-between items-center text-white">
                <h3 className="font-black text-sm uppercase tracking-wider">{t('notifications')}</h3>
                <div className="flex gap-2">
                    <button onClick={markAllAsRead} className="p-1.5 hover:bg-white/5 rounded-lg text-matrix-muted hover:text-white transition-colors" title="Mark all as read">
                        <Check size={16} />
                    </button>
                    <button onClick={onClose} className="p-1.5 hover:bg-white/5 rounded-lg text-matrix-muted hover:text-white transition-colors">
                        <X size={16} />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                {loading ? (
                    <div className="text-center p-8 text-matrix-muted text-xs animate-pulse">Loading...</div>
                ) : notifications.length === 0 ? (
                    <div className="text-center p-8 text-matrix-muted opacity-50 text-xs font-bold uppercase tracking-widest">
                        No notifications
                    </div>
                ) : (
                    notifications.map(notif => (
                        <div key={notif.id}
                            className={clsx(
                                "p-3 rounded-xl flex gap-3 transition-all cursor-pointer border border-transparent",
                                notif.is_read ? "opacity-50 hover:opacity-100 hover:bg-white/5" : "bg-white/5 border-white/5 hover:border-matrix-green/30"
                            )}
                            onClick={() => !notif.is_read && markAsRead(notif.id)}
                        >
                            <img src={notif.actor_avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}
                                alt="Avatar" className="w-8 h-8 rounded-full border border-white/10" />
                            <div>
                                <p className="text-xs text-white leading-relaxed">
                                    <span className="font-bold text-matrix-green">{notif.actor_display_name || notif.actor_username}</span> mentioned you.
                                </p>
                                <span className="text-[10px] text-matrix-muted font-mono mt-1 block">
                                    {new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
