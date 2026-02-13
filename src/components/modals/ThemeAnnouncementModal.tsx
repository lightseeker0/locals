import React from 'react';
import { Sparkles, CheckCircle, Smartphone, Monitor, Palette, X } from 'lucide-react';
import { useI18nStore } from '../../stores/i18nStore';

interface ThemeAnnouncementModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const ThemeAnnouncementModal: React.FC<ThemeAnnouncementModalProps> = ({ isOpen, onClose }) => {
    const { t } = useI18nStore();

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/90 backdrop-blur-md animate-in fade-in duration-300 px-safe py-safe">
            <div className="bg-[#0D1217] border-2 border-matrix-green/30 shadow-[0_0_50px_rgba(13,189,139,0.2)] rounded-[2.5rem] p-8 md:p-12 max-w-2xl w-full text-center relative overflow-hidden animate-in zoom-in-95 duration-300">
                {/* Background Patterns */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-matrix-green/50 to-transparent" />
                <div className="absolute -top-24 -left-24 w-48 h-48 bg-matrix-green/5 rounded-full blur-3xl" />
                <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-matrix-green/5 rounded-full blur-3xl" />

                <div className="relative z-10 flex flex-col items-center">
                    <button
                        onClick={onClose}
                        className="absolute -top-4 -right-4 p-2 text-matrix-muted hover:text-white transition-colors"
                    >
                        <X size={24} />
                    </button>

                    <div className="mb-8 p-6 rounded-3xl bg-matrix-green/10 border border-matrix-green/20 text-matrix-green">
                        <Sparkles size={48} className="animate-pulse" />
                    </div>

                    <h2 className="text-3xl md:text-5xl font-black text-white mb-6 tracking-tighter leading-tight">
                        {t('new_themes_title')}
                    </h2>

                    <p className="text-matrix-muted text-lg mb-10 leading-relaxed font-medium">
                        {t('new_themes_desc')}
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full mb-10 text-left">
                        <div className="bg-white/5 p-5 rounded-2xl border border-white/5 group hover:border-matrix-green/20 transition-all">
                            <Monitor className="text-matrix-green mb-3" size={24} />
                            <h4 className="text-white font-bold text-sm mb-1 uppercase tracking-wide">Dark Matter</h4>
                            <p className="text-[10px] text-matrix-muted font-bold leading-tight opacity-60">
                                Now with full translucency support.
                            </p>
                        </div>
                        <div className="bg-white/5 p-5 rounded-2xl border border-white/5 group hover:border-matrix-green/20 transition-all">
                            <Smartphone className="text-matrix-green mb-3" size={24} />
                            <h4 className="text-white font-bold text-sm mb-1 uppercase tracking-wide">Web Optimization</h4>
                            <p className="text-[10px] text-matrix-muted font-bold leading-tight opacity-60">
                                Cleaner experience on mobile web.
                            </p>
                        </div>
                        <div className="bg-white/5 p-5 rounded-2xl border border-white/5 group hover:border-matrix-green/20 transition-all">
                            <Palette className="text-matrix-green mb-3" size={24} />
                            <h4 className="text-white font-bold text-sm mb-1 uppercase tracking-wide">BD Parity</h4>
                            <p className="text-[10px] text-matrix-muted font-bold leading-tight opacity-60">
                                Better BetterDiscord theme support.
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="w-full md:w-auto px-12 py-4 bg-matrix-green text-matrix-darker rounded-2xl font-black text-lg hover:scale-105 transition-all shadow-xl shadow-matrix-green/10 flex items-center justify-center gap-3 uppercase tracking-widest"
                    >
                        <CheckCircle size={24} />
                        {t('got_it')}
                    </button>

                    <p className="mt-8 text-[11px] font-black text-matrix-muted uppercase tracking-[0.2em] opacity-30">
                        Locals v0.0.19 - THEME ENGINE UPDATE
                    </p>
                </div>
            </div>
        </div>
    );
};
