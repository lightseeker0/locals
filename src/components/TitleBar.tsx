import React from 'react';
import { Minus, Square, X } from 'lucide-react';

export const TitleBar: React.FC = () => {
    const handleMinimize = () => window.electron?.minimize();
    const handleMaximize = () => window.electron?.maximize();
    const handleClose = () => window.electron?.close();

    return (

        <div className="h-8 bg-transparent flex items-center justify-between select-none fixed top-0 left-0 right-0 z-50 drag-region">
            <div className="px-3 flex items-center gap-2">
                {/* Version text removed */}
            </div>
            <div className="flex bg-black/20 h-full no-drag">
                <button
                    onClick={handleMinimize}
                    className="w-10 flex items-center justify-center hover:bg-white/10 text-matrix-muted hover:text-white transition-colors"
                >
                    <Minus size={14} />
                </button>
                <button
                    onClick={handleMaximize}
                    className="w-10 flex items-center justify-center hover:bg-white/10 text-matrix-muted hover:text-white transition-colors"
                >
                    <Square size={12} />
                </button>
                <button
                    onClick={handleClose}
                    className="w-10 flex items-center justify-center hover:bg-red-500 text-matrix-muted hover:text-white transition-colors"
                >
                    <X size={14} />
                </button>
            </div>
        </div>
    );
};
