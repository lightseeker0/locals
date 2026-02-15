import React, { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { X, Camera, User } from 'lucide-react';

interface ProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose }) => {
    const { user, updateProfile } = useAuthStore();
    const [displayName, setDisplayName] = useState(user?.display_name || user?.username || '');
    const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    if (!isOpen) return null;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Check file size before processing
        if (file.size > 5000000) { // 5MB max input
            setError('Selected file is too large. Please choose an image less than 5MB.');
            return;
        }

        // Resize and convert to Base64
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 64;   // Even smaller (efficient for avatars)
                const MAX_HEIGHT = 64;  // Square avatars
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);
                
                // Try WebP first (better compression), fallback to JPEG
                let dataUrl = canvas.toDataURL('image/webp', 0.2);
                
                // If WebP not supported or still too large, try JPEG
                if (!dataUrl.includes('webp') || dataUrl.length > 200000) {
                    dataUrl = canvas.toDataURL('image/jpeg', 0.2);
                }
                
                // Final size check (200KB limit with improved backend)
                if (dataUrl.length > 200000) {
                    setError('Image compression failed - try a simpler image.');
                    return;
                }
                
                setError(null);
                setAvatarUrl(dataUrl);
            };
            img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            await updateProfile({ display_name: displayName, avatar_url: avatarUrl });
            onClose();
        } catch (error: any) {
            const errorMsg = error?.message || 'Failed to update profile';
            console.error('Failed to update profile:', error);
            setError(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-matrix-dark border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 flex items-center justify-between border-b border-white/5">
                    <h2 className="text-xl font-bold text-white">Profile Settings</h2>
                    <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-matrix-muted hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSave} className="p-8 space-y-6">
                    <div className="flex flex-col items-center gap-4">
                        <div className="relative group" onClick={() => fileInputRef.current?.click()}>
                            {avatarUrl ? (
                                <img src={avatarUrl} className="w-24 h-24 rounded-full border-4 border-matrix-green/20 object-cover" alt="Profile" />
                            ) : (
                                <div className="w-24 h-24 rounded-full bg-matrix-green/10 border-4 border-matrix-green/5 flex items-center justify-center">
                                    <User size={40} className="text-matrix-green opacity-50" />
                                </div>
                            )}
                            <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                                <Camera size={24} className="text-white" />
                            </div>
                        </div>
                        <input
                            type="file"
                            ref={fileInputRef}
                            style={{ display: 'none' }}
                            accept="image/*"
                            onChange={handleFileChange}
                        />
                        <p className="text-[10px] text-matrix-muted uppercase font-bold tracking-widest">Click photo to change</p>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-[11px] font-bold text-matrix-muted uppercase tracking-wider mb-2">Display Name</label>
                            <input
                                type="text"
                                className="w-full bg-matrix-darker border border-white/10 rounded-xl px-4 py-3 text-white focus:border-matrix-green/50 outline-none transition-all"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                placeholder="Choose a name..."
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="bg-red-500/20 border border-red-500/50 text-red-300 rounded-lg px-4 py-3 text-sm font-medium">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-matrix-green hover:bg-matrix-green/90 disabled:opacity-50 text-matrix-darker font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 mt-4 shadow-lg shadow-matrix-green/20"
                    >
                        {loading ? 'Saving Changes...' : 'Update Profile'}
                    </button>
                </form>
            </div>
        </div>
    );
};
