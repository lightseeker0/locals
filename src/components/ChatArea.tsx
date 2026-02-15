import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import { useAuthStore } from '../stores/authStore';
import { useChatMessages } from '../hooks/useChatMessages';
import type { ChatMessage } from '../hooks/useChatMessages';
import { useTypingIndicator } from '../hooks/useTypingIndicator';
import { useReactions } from '../hooks/useReactions';
import { Hash, Pin, Search, Plus, Gift, Smile, Reply, AtSign, X, Menu, Trash2, Maximize2 } from 'lucide-react';
import { format } from 'date-fns';
import { clsx } from 'clsx';
import { ApiService } from '../services/api';
import { useI18nStore } from '../stores/i18nStore';
import { useVoiceStore } from '../stores/useVoiceStore';
import { Phone } from 'lucide-react';
import { PinnedMessages } from './PinnedMessages';

export const ChatArea: React.FC = () => {
    const { selectedChannelId, channels, setMobileMenuOpen } = useAppStore();
    const { user } = useAuthStore();
    const { t } = useI18nStore();
    const { startCall, activeCall } = useVoiceStore();
    const currentChannel = channels.find(c => c.id === selectedChannelId);
    const { messages, sendMessage, deleteMessage } = useChatMessages(selectedChannelId || '');
    const { typingUsers, setTyping } = useTypingIndicator(selectedChannelId || '');
    const [showPinned, setShowPinned] = useState(false);

    const [inputValue, setInputValue] = useState('');
    const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
    const [showGifPicker, setShowGifPicker] = useState(false);
    const [gifs, setGifs] = useState<any[]>([]);
    const [pendingImage, setPendingImage] = useState<string | null>(null);
    const [lightboxImage, setLightboxImage] = useState<string | null>(null);
    const typingTimeoutRef = useRef<any>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    const searchGifs = async (query: string) => {
        if (!query) return;
        try {
            // Using a public Tenor API key for demo purposes (usually would be env var)
            const res = await fetch(`https://tenor.googleapis.com/v2/search?q=${query}&key=LIVDTRZRE76E&limit=9`);
            const data = await res.json();
            setGifs(data.results || []);
        } catch (error) {
            console.error('GIF search failed:', error);
        }
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const dataUrl = event.target?.result as string;
            sendMessage(`[img]${dataUrl}[/img]`);
        };
        reader.readAsDataURL(file);
    };

    // Read Receipt logic
    useEffect(() => {
        if (selectedChannelId && user && messages.length > 0) {
            const lastMsg = messages[messages.length - 1];
            ApiService.updateReadReceipt(selectedChannelId, user.id, lastMsg.id);
        }
    }, [selectedChannelId, user, messages]);

    const handleSendMessage = () => {
        if (inputValue.trim()) {
            sendMessage(inputValue, replyingTo?.id);
            setInputValue('');
            setReplyingTo(null);
            setTyping(false);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInputValue(e.target.value);
        if (!typingTimeoutRef.current) {
            setTyping(true);
        } else {
            clearTimeout(typingTimeoutRef.current);
        }
        typingTimeoutRef.current = setTimeout(() => {
            setTyping(false);
            typingTimeoutRef.current = null;
        }, 3000);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const file = items[i].getAsFile();
                if (!file) continue;

                const reader = new FileReader();
                reader.onload = (event) => {
                    setPendingImage(event.target?.result as string);
                };
                reader.readAsDataURL(file);
            }
        }
    };

    const confirmSendImage = () => {
        if (pendingImage) {
            sendMessage(`[img]${pendingImage}[/img]`);
            setPendingImage(null);
        }
    };

    // Read Receipt logic
    useEffect(() => {
        if (selectedChannelId && user && messages.length > 0) {
            const lastMsg = messages[messages.length - 1];
            ApiService.updateReadReceipt(selectedChannelId, user.id, lastMsg.id);
        }
    }, [selectedChannelId, user, messages]);

    if (!selectedChannelId) {
        return (
            <div className="flex-1 flex flex-col bg-transparent text-matrix-muted relative overflow-hidden">
                {/* Mobile Header for Landing */}
                <div className="md:hidden h-12 border-b border-white/5 flex items-center px-4 shrink-0 bg-matrix-dark/30 backdrop-blur-xl z-20">
                    <button
                        onClick={() => setMobileMenuOpen(true)}
                        className="p-2 -ml-2 hover:bg-white/5 rounded-xl text-matrix-green transition-colors"
                    >
                        <Menu size={24} />
                    </button>
                    <h3 className="ml-2 font-black text-white text-[15px] tracking-tight">{t('welcome_hub')}</h3>
                </div>

                <div className="flex-1 flex items-center justify-center relative">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-matrix-green/5 blur-[100px] rounded-full pointer-events-none" />
                    <div className="max-w-md w-full bg-[#101317]/60 backdrop-blur-2xl border border-white/5 p-12 rounded-[3.5rem] text-center shadow-2xl relative overflow-hidden group z-10 m-4">
                        <div className="absolute inset-0 bg-matrix-green/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                        <div className="relative z-10">
                            <div className="w-24 h-24 bg-matrix-green/10 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 border border-matrix-green/20 group-hover:scale-110 transition-transform duration-500">
                                <Hash size={48} className="text-matrix-green" />
                            </div>
                            <h1 className="text-4xl font-black text-white mb-8 tracking-tighter leading-tight">{t('welcome_hub')}</h1>
                            <p className="text-matrix-muted font-bold text-lg leading-relaxed opacity-40 uppercase tracking-widest">
                                {t('welcome_desc')}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const isDM = currentChannel?.type === 'dm';

    return (
        <div className="flex flex-col h-full chat-content da-chat chatContent_f75fb0 content_f75fb0 bg-transparent">
            {/* Header */}
            <div className="h-12 border-b border-white/5 flex items-center px-4 md:px-6 justify-between shrink-0 bg-transparent backdrop-blur-xl z-20 header relative">
                <div className="flex items-center gap-2 md:gap-4">
                    <button
                        onClick={() => setMobileMenuOpen(true)}
                        className="md:hidden p-2 -ml-2 hover:bg-white/5 rounded-xl text-matrix-green transition-colors"
                    >
                        <Menu size={24} />
                    </button>
                    {isDM ? <AtSign size={18} className="text-matrix-green" /> : <Hash size={18} className="text-matrix-green" />}
                    <h3 className="font-black text-[var(--text-normal)] text-[14px] md:text-[15px] tracking-tight truncate max-w-[120px] md:max-w-none">{currentChannel?.title}</h3>
                    <div className="h-4 w-[1px] bg-white/10 mx-1 md:block hidden" />
                    <div className="text-matrix-muted text-[11px] font-bold uppercase tracking-widest opacity-40 truncate md:block hidden">
                        {isDM ? 'Private Conversation' : 'General Room'}
                    </div>
                </div>

                <div className="flex items-center gap-6 text-matrix-muted">
                    <div className="relative group lg:block hidden">
                        <input className="bg-matrix-darker border border-white/5 text-[12px] font-bold rounded-xl px-4 py-2 text-white w-48 transition-all focus:w-72 focus:border-matrix-green/30 outline-none placeholder:text-white/10" placeholder="Search message..." />
                        <Search size={14} className="absolute right-4 top-2.5 opacity-20 group-focus-within:opacity-100 group-focus-within:text-matrix-green" />
                    </div>
                    <div className="flex items-center gap-3 md:gap-4">
                        {isDM && (
                            <button
                                onClick={() => user && startCall(selectedChannelId || '', user.id)}
                                className="text-matrix-green hover:text-white cursor-pointer transition-all hover:scale-110 p-2 hover:bg-matrix-green/10 rounded-full"
                                title="Start Voice Call"
                            >
                                <Phone size={20} />
                            </button>
                        )}
                        <button
                            onClick={() => setShowPinned(!showPinned)}
                            className={clsx("transition-all hover:scale-110 p-2 rounded-full hover:bg-white/5", showPinned ? "text-matrix-green bg-matrix-green/10" : "hover:text-white")}
                            title={t('pins')}
                        >
                            <Pin size={20} />
                        </button>
                    </div>
                </div>
                {showPinned && selectedChannelId && <PinnedMessages roomId={selectedChannelId} onClose={() => setShowPinned(false)} />}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 md:px-8 py-8 space-y-8 custom-scrollbar flex flex-col-reverse relative z-10" ref={scrollRef}>
                <div className="h-2" />

                {messages.slice().reverse().map((msg: ChatMessage) => (
                    <MessageItem
                        key={msg.id}
                        message={msg}
                        onReply={() => setReplyingTo(msg)}
                        onImageClick={(url) => setLightboxImage(url)}
                        onDelete={() => deleteMessage(msg.id)}
                    />
                ))}

                {/* Welcome Banner */}
                {messages.length < 50 && (
                    <div className="mb-16 pt-12 border-b border-white/5 pb-16 animate-in slide-in-from-bottom-8 duration-700">
                        <div className="w-16 h-16 md:w-20 md:h-20 bg-matrix-green/10 rounded-2xl md:rounded-3xl flex items-center justify-center mb-8 border border-matrix-green/20">
                            {isDM ? <AtSign size={32} className="text-matrix-green" /> : <Hash size={32} className="text-matrix-green" />}
                        </div>
                        <h1 className="text-3xl md:text-5xl font-black text-[var(--text-normal)] mb-4 tracking-tighter">
                            {isDM ? `Chatting with ${currentChannel?.title}` : `Welcome to #${currentChannel?.title}`}
                        </h1>
                        <p className="text-matrix-muted text-base md:text-lg font-medium max-w-xl leading-relaxed opacity-70">
                            {isDM
                                ? `This is the private workspace between you and ${currentChannel?.title}.`
                                : `This is the start of the #${currentChannel?.title} room.`}
                        </p>
                    </div>
                )}
            </div>

            {/* Voice Join Prompt */}
            {currentChannel?.type === 'voice' && activeCall?.roomId !== selectedChannelId && (
                <div className="mx-4 md:mx-8 mb-4 p-6 bg-matrix-green/10 border border-matrix-green/20 rounded-3xl flex flex-col items-center gap-4 animate-in slide-in-from-bottom-4 duration-500">
                    <div className="w-16 h-16 bg-matrix-green/20 rounded-2xl flex items-center justify-center">
                        <Phone size={32} className="text-matrix-green" />
                    </div>
                    <div className="text-center">
                        <h4 className="text-lg font-black text-white mb-1">Voice Channel Selected</h4>
                        <p className="text-sm text-matrix-muted font-bold uppercase tracking-widest opacity-60">You are viewing the chat for this channel.</p>
                    </div>
                    <button
                        onClick={() => user && startCall(selectedChannelId || '', user)}
                        className="bg-matrix-green text-matrix-darker px-8 py-3 rounded-2xl font-black hover:shadow-[0_0_20px_rgba(0,255,102,0.4)] transition-all active:scale-95"
                    >
                        Join Voice Call
                    </button>
                </div>
            )}

            {/* Input Area */}
            <div className="px-4 md:px-8 pb-4 md:pb-8 pb-safe-lg shrink-0 relative z-20">
                {/* Typing Indicator */}
                {typingUsers.length > 0 && (
                    <div className="flex items-center gap-2 mb-2 ml-4 animate-in fade-in slide-in-from-left-2 duration-300">
                        <div className="flex gap-1">
                            <div className="w-1 h-1 bg-matrix-green rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
                            <div className="w-1 h-1 bg-matrix-green rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                            <div className="w-1 h-1 bg-matrix-green rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                        </div>
                        <span className="text-[10px] font-bold text-matrix-muted uppercase tracking-widest">
                            {typingUsers.length === 1
                                ? `${typingUsers[0]} is typing...`
                                : 'Several people are typing...'}
                        </span>
                    </div>
                )}

                {replyingTo && (
                    <div className="bg-matrix-dark border-x border-t border-white/10 p-3 rounded-t-2xl flex items-center justify-between animate-in slide-in-from-bottom-2 duration-200">
                        <div className="flex items-center gap-2 overflow-hidden">
                            <Reply size={14} className="text-matrix-green shrink-0" />
                            <span className="text-xs text-matrix-muted truncate">
                                Replying to <span className="font-bold text-white">{replyingTo.display_name || replyingTo.username}</span>
                            </span>
                        </div>
                        <button onClick={() => setReplyingTo(null)} className="p-1 hover:bg-white/5 rounded-lg text-matrix-muted hover:text-white">
                            <X size={14} />
                        </button>
                    </div>
                )}

                <div className={clsx(
                    "bg-matrix-darker/40 backdrop-blur-xl border border-white/10 p-2 md:p-3 flex flex-col shadow-2xl focus-within:border-matrix-green/30 transition-all",
                    replyingTo ? "rounded-b-2xl" : "rounded-3xl"
                )}>
                    {showGifPicker && (
                        <div className="p-4 border-b border-white/5 bg-matrix-darker max-h-60 overflow-y-auto custom-scrollbar">
                            <input
                                type="text"
                                placeholder="Search GIFs..."
                                className="w-full bg-matrix-dark border border-white/10 rounded-lg p-2 text-sm mb-4 outline-none focus:border-matrix-green/50"
                                onChange={(e) => searchGifs(e.target.value)}
                            />
                            <div className="grid grid-cols-3 gap-2">
                                {gifs.map((gif: any) => (
                                    <img
                                        key={gif.id}
                                        src={gif.media_formats.tinygif.url}
                                        className="w-full h-20 object-cover rounded-lg cursor-pointer hover:scale-105 transition-all"
                                        onClick={() => {
                                            sendMessage(`[img]${gif.media_formats.gif.url}[/img]`);
                                            setShowGifPicker(false);
                                        }}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                    <div className="flex items-center gap-4 px-3">
                        <input
                            type="file"
                            id="image-upload"
                            hidden
                            accept="image/*"
                            onChange={handleImageUpload}
                        />
                        <label htmlFor="image-upload" className="h-10 w-10 bg-white/5 hover:bg-matrix-green hover:text-matrix-darker rounded-2xl flex items-center justify-center transition-all shrink-0 cursor-pointer">
                            <Plus size={24} />
                        </label>
                        <textarea
                            rows={1}
                            className="flex-1 bg-transparent border-none outline-none text-white placeholder-white/20 text-[16px] md:text-[15px] py-3 md:py-4 resize-none font-medium min-h-[48px] flex items-center"
                            placeholder={isDM ? `Send a private message...` : `Message #${currentChannel?.title}`}
                            value={inputValue}
                            onChange={handleInputChange}
                            onKeyDown={handleKeyDown}
                            onPaste={handlePaste}
                        />
                        <div className="flex items-center gap-4 md:gap-3 text-matrix-muted shrink-0">
                            <Smile size={24} className="cursor-pointer hover:text-white transition-colors p-1" />
                            <Gift
                                size={24}
                                className={clsx("cursor-pointer hover:text-white transition-colors p-1", showGifPicker && "text-matrix-green")}
                                onClick={() => setShowGifPicker(!showGifPicker)}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Image Paste Confirmation Modal */}
            {pendingImage && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-matrix-dark border border-white/10 rounded-3xl p-6 max-w-lg w-full shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-black text-white tracking-tight">Upload Image</h3>
                            <button onClick={() => setPendingImage(null)} className="p-2 hover:bg-white/5 rounded-xl text-matrix-muted hover:text-white transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="rounded-2xl overflow-hidden border border-white/5 bg-black/20 mb-6">
                            <img src={pendingImage} className="w-full max-h-[400px] object-contain" alt="Paste preview" />
                        </div>
                        <div className="flex gap-4">
                            <button
                                onClick={() => setPendingImage(null)}
                                className="flex-1 py-3 rounded-2xl bg-white/5 text-white font-bold hover:bg-white/10 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmSendImage}
                                className="flex-1 py-3 rounded-2xl bg-matrix-green text-matrix-darker font-black hover:shadow-[0_0_20px_rgba(0,255,102,0.3)] transition-all"
                            >
                                Send
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Image Lightbox */}
            {lightboxImage && (
                <div
                    className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[200] flex items-center justify-center p-4 md:p-12 cursor-zoom-out animate-in fade-in duration-300"
                    onClick={() => setLightboxImage(null)}
                >
                    <div className="absolute top-8 right-8 flex gap-4">
                        <button className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl text-white transition-all backdrop-blur-md">
                            <X size={24} />
                        </button>
                    </div>
                    <img
                        src={lightboxImage}
                        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl animate-in zoom-in-95 duration-300"
                        alt="Lightbox View"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}
        </div>
    );
};
const MessageItem = ({ message, onReply, onImageClick, onDelete }: { message: ChatMessage, onReply: () => void, onImageClick: (url: string) => void, onDelete: () => void }) => {
    const { user } = useAuthStore();
    const { t } = useI18nStore();
    const { reactions, toggleReaction } = useReactions(message.id);

    // Triple-check for ownership to ensure the user always has control
    const isMe = (user && message) && (
        String(message.user_id).toLowerCase() === String(user.id).toLowerCase() ||
        (message.username && user.username && String(message.username).toLowerCase() === String(user.username).toLowerCase()) ||
        (message.display_name && user.display_name && String(message.display_name).toLowerCase() === String(user.display_name).toLowerCase())
    );

    const adminUsername = import.meta.env.VITE_ADMIN_USERNAME || 'ds4d';
    const normalizedName = user?.username?.toLowerCase() || '';
    const normalizedDisplay = user?.display_name?.toLowerCase() || '';
    const isAdmin = normalizedName === adminUsername.toLowerCase() ||
        normalizedName === 'asuna' ||
        normalizedDisplay === 'asuna';

    const handleDelete = async () => {
        if (confirm(t('delete_message_confirm') || 'Delete this message?')) {
            try {
                onDelete();
            } catch (err) {
                console.error('Delete failed:', err);
            }
        }
    };

    const renderContent = (content: string) => {
        const imgMatch = content.match(/\[img\](.*?)\[\/img\]/);
        if (imgMatch) {
            const url = imgMatch[1];
            return (
                <div
                    className="mt-2 rounded-2xl overflow-hidden border border-white/5 shadow-xl bg-black/20 cursor-zoom-in group/img relative"
                    onClick={() => onImageClick(url)}
                >
                    <img src={url} alt="Shared media" className="max-w-full max-h-[300px] object-contain transition-transform duration-500 group-hover/img:scale-[1.02]" />
                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                        <Maximize2 size={24} className="text-white drop-shadow-lg" />
                    </div>
                </div>
            );
        }
        return <p className={clsx("text-[15px] leading-relaxed whitespace-pre-wrap break-words font-medium text-white/90")}>{content}</p>;
    };

    return (
        <div className="group flex flex-col mb-4 animate-in slide-in-from-bottom-2 duration-300 items-start hover:bg-white/[0.02] -mx-4 px-4 py-1 transition-colors">
            <div className="flex w-full gap-4 flex-row items-start">
                {/* Avatar */}
                <div className={clsx(
                    "w-11 h-11 rounded-full flex items-center justify-center shrink-0 border border-white/5 shadow-lg font-black text-base bg-matrix-green/10 text-matrix-green"
                )}>
                    {message.avatar_url ? (
                        <img src={message.avatar_url} className="w-full h-full rounded-full object-cover" />
                    ) : (
                        (message.display_name || message.username || '?')[0].toUpperCase()
                    )}
                </div>

                <div className="flex-1 flex flex-col min-w-0">
                    {/* Username & Time - Header Style Line */}
                    <div className="flex items-baseline gap-2 mb-0.5 px-0 flex-row">
                        <span className={clsx("text-[15px] font-black tracking-tight", isMe ? "text-matrix-green" : "text-white")}>
                            {message.display_name || message.username}
                        </span>
                        <span className="text-[11px] font-bold opacity-30 uppercase tracking-widest text-matrix-muted">
                            {format(new Date(message.created_at || Date.now()), 'HH:mm')}
                        </span>
                    </div>

                    {/* Content - No Bubble, just text */}
                    <div className="relative group/content">
                        <div className="text-white/90">
                            {renderContent(message.content)}
                        </div>

                        {/* Actions Overlay - Discord style floating right */}
                        <div className="absolute transition-all duration-200 flex items-center gap-1 z-10 -top-8 right-0 opacity-0 group-hover:opacity-100">
                            <div className="flex bg-matrix-dark border border-white/20 rounded-xl p-0.5 shadow-2xl backdrop-blur-md scale-90 origin-right">
                                <button onClick={onReply} className="p-1.5 hover:bg-white/5 rounded-lg text-matrix-muted hover:text-white transition-all"><Reply size={14} /></button>
                                <button onClick={() => toggleReaction('❤️')} className="p-1.5 hover:bg-white/5 rounded-lg text-matrix-muted hover:text-white transition-all"><Smile size={14} /></button>
                                {(isMe || isAdmin) && (
                                    <button
                                        onClick={handleDelete}
                                        className="p-1.5 bg-red-600 hover:bg-red-500 rounded-lg text-white transition-all shadow-lg ml-1"
                                        title="Delete Message"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Reactions Display */}
                    {reactions.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5 justify-start">
                            {reactions.map(r => (
                                <div key={r.emoji} className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/5 border border-white/10 text-[10px] font-bold text-matrix-muted hover:bg-white/10 transition-colors">
                                    <span>{r.emoji}</span>
                                    <span>{r.count}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
