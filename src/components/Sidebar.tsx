import React from 'react';
import { useAppStore } from '../stores/appStore';
import { Plus, LogIn } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { CreateSpaceModal } from './modals/CreateSpaceModal';
import { JoinSpaceModal } from './modals/JoinSpaceModal';

import { useI18nStore } from '../stores/i18nStore';

export const Sidebar: React.FC = () => {
    const { servers, selectedServerId, setSelectedServer } = useAppStore();
    const { t } = useI18nStore();
    const [isCreateSpaceOpen, setIsCreateSpaceOpen] = React.useState(false);
    const [isJoinSpaceOpen, setIsJoinSpaceOpen] = React.useState(false);

    const handleServerClick = (id: string | null) => {
        setSelectedServer(id);
    };

    return (
        <nav className="w-[var(--sidebar-width)] bg-matrix-darker flex flex-col items-center py-2 gap-2 overflow-y-auto no-scrollbar shrink-0 border-r border-white/5 sidebar da-sidebar sidebar__5e434 scroller__99e7c bg-transparent h-full sidebar-1tnOww scroller-3X7q_6">
            {/* ... Home ... */}
            <SidebarItem
                active={selectedServerId === null}
                onClick={() => handleServerClick(null)}
                tooltip={t('home')}
            >
                <div className="w-6 h-6 border-2 border-matrix-green rounded-sm flex items-center justify-center">
                    <div className="w-2 h-2 bg-matrix-green rounded-full" />
                </div>
            </SidebarItem>

            <div className="w-8 h-[1px] bg-white/10 mx-auto my-1" />

            {/* Spaces List */}
            {servers.map((server) => (
                <SidebarItem
                    key={server.id}
                    active={selectedServerId === server.id}
                    onClick={() => handleServerClick(server.id)}
                    tooltip={server.title}
                    unreadCount={server.unread_count}
                    mentionCount={server.mention_count}
                >
                    {server.avatar ? (
                        <img src={server.avatar} alt={server.title} className="w-full h-full object-cover" />
                    ) : (
                        <div className="flex items-center justify-center w-full h-full bg-matrix-green/5">
                            <span className="text-xs font-bold text-matrix-muted group-hover:text-white transition-colors">
                                {server.title.substring(0, 1).toUpperCase()}
                            </span>
                        </div>
                    )}
                </SidebarItem>
            ))}

            <SidebarItem onClick={() => setIsCreateSpaceOpen(true)} className="text-matrix-green bg-matrix-dark hover:bg-matrix-green hover:text-white border border-matrix-green/20">
                <Plus size={24} />
            </SidebarItem>

            <SidebarItem onClick={() => setIsJoinSpaceOpen(true)} className="text-matrix-green bg-matrix-dark hover:bg-matrix-green hover:text-white border border-matrix-green/20" tooltip="Join Space">
                <LogIn size={20} />
            </SidebarItem>


            <CreateSpaceModal isOpen={isCreateSpaceOpen} onClose={() => setIsCreateSpaceOpen(false)} />
            <JoinSpaceModal isOpen={isJoinSpaceOpen} onClose={() => setIsJoinSpaceOpen(false)} />
        </nav>
    );
};

interface SidebarItemProps extends React.HTMLAttributes<HTMLDivElement> {
    active?: boolean;
    tooltip?: string;
    unreadCount?: number;
    mentionCount?: number;
    children: React.ReactNode;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ active, children, className, onClick, tooltip, unreadCount, mentionCount }) => {
    return (
        <div className="relative group flex items-center justify-center w-12 h-12 cursor-pointer mb-2 wrapper-3t9DeA" onClick={onClick}>
            {/* Hover Pill - Discord style */}
            <div className={twMerge(
                "absolute left-0 bg-white rounded-r-lg w-1 transition-all duration-300",
                active ? "h-10 opacity-100" : (unreadCount && unreadCount > 0) ? "h-2 opacity-100" : "h-2 opacity-0 group-hover:opacity-100 group-hover:h-5"
            )} />

            <div className={twMerge(
                "w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 overflow-hidden border border-transparent select-none",
                active ? "bg-matrix-green/20 border-matrix-green/30 rounded-[16px] shadow-[0_0_20px_rgba(13,189,139,0.2)]" : "bg-white/5 group-hover:bg-matrix-green/20 group-hover:rounded-[16px] group-hover:border-matrix-green/20",
                className
            )}>
                {children}
            </div>

            {/* Mention Badge */}
            {mentionCount && mentionCount > 0 && (
                <div className="absolute -bottom-1 -right-1 bg-red-500 text-white text-[10px] font-black min-w-[20px] h-[20px] px-1.5 flex items-center justify-center rounded-full border-4 border-matrix-darker z-[20] shadow-lg animate-in zoom-in-50 duration-300">
                    {mentionCount > 99 ? '99+' : mentionCount}
                </div>
            )}

            {/* Tooltip */}
            {tooltip && (
                <div className="absolute left-[65px] bg-matrix-darker/90 backdrop-blur-md border border-white/10 text-white text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-lg hidden group-hover:block whitespace-nowrap z-[100] shadow-2xl">
                    {tooltip}
                </div>
            )}
        </div>
    )
}
