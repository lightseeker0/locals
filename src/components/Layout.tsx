import React from 'react';
import { Sidebar } from './Sidebar';
import { ChannelList } from './ChannelList';
import { ChatArea } from './ChatArea';
import { MemberList } from './MemberList';
import { useAppStore } from '../stores/appStore';
import { SettingsModal } from './modals/SettingsModal';
import { clsx } from 'clsx';

export const Layout: React.FC = () => {
    const { isUserListOpen, isSettingsOpen, setSettingsOpen, isMobileMenuOpen, setMobileMenuOpen } = useAppStore();

    return (
        <div className="flex h-screen w-full overflow-hidden bg-matrix-darker text-matrix-text font-sans relative app-mount app-inner">
            {/* Mobile Sidebar & ChannelList Wrapper */}
            <div className={clsx(
                "fixed inset-0 z-[100] transition-all duration-300 md:relative md:flex md:z-auto",
                isMobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
            )}>
                {/* Backdrop (Mobile Only) */}
                <div
                    className={clsx(
                        "absolute inset-0 bg-black/60 backdrop-blur-sm md:hidden transition-opacity duration-300",
                        isMobileMenuOpen ? "opacity-100" : "opacity-0 pointer-events-none"
                    )}
                    onClick={() => setMobileMenuOpen(false)}
                />

                {/* Navigation Panels */}
                <div className="relative flex h-full shadow-2xl md:shadow-none bg-matrix-darker border-r border-white/5">
                    <Sidebar />
                    <ChannelList />
                </div>
            </div>

            {/* Main Chat Area */}
            <div className="flex flex-1 flex-col min-w-0 bg-matrix-darker relative z-10">
                <ChatArea />
            </div>

            {/* Member List Panel (Rightmost - Hidden on Mobile for now) */}
            {isUserListOpen && (
                <div className="hidden lg:flex shrink-0">
                    <MemberList />
                </div>
            )}

            {/* Global Modals */}
            <SettingsModal isOpen={isSettingsOpen} onClose={() => setSettingsOpen(false)} />
        </div>
    );
};
