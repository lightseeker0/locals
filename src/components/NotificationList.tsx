import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { ApiService } from '../services/api';
import { useI18nStore } from '../stores/i18nStore';
import { X, Check } from 'lucide-react';

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
        <div className="absolute left-72 top-12 w-80 bg-[#2b2d31] dark:bg-[#2b2d31] shadow-lg rounded-lg border border-[#1e1f22] z-50 flex flex-col max-h-[500px]">
            <div className="p-4 border-b border-[#1e1f22] flex justify-between items-center text-[#dbdee1]">
                <h3 className="font-semibold">{t('notifications')}</h3>
                <div className="flex gap-2">
                    <button onClick={markAllAsRead} className="p-1 hover:bg-[#3f4147] rounded text-xs" title="Mark all as read">
                        <Check size={16} />
                    </button>
                    <button onClick={onClose} className="p-1 hover:bg-[#3f4147] rounded">
                        <X size={16} />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {loading ? (
                    <div className="text-center p-4 text-[#949ba4]">Loading...</div>
                ) : notifications.length === 0 ? (
                    <div className="text-center p-4 text-[#949ba4]">No notifications</div>
                ) : (
                    notifications.map(notif => (
                        <div key={notif.id}
                            className={`p-3 rounded-md flex gap-3 ${notif.is_read ? 'opacity-50' : 'bg-[#313338]'}`}
                            onClick={() => !notif.is_read && markAsRead(notif.id)}
                        >
                            <img src={notif.actor_avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}
                                alt="Avatar" className="w-8 h-8 rounded-full" />
                            <div>
                                <p className="text-sm text-[#dbdee1]">
                                    <span className="font-semibold">{notif.actor_display_name || notif.actor_username}</span> mentioned you.
                                </p>
                                <span className="text-xs text-[#949ba4]">
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
