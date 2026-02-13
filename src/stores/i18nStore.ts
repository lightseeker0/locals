import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Language = 'en' | 'tr';

interface Translations {
    [key: string]: {
        en: string;
        tr: string;
    };
}

export const translations: Translations = {
    // --- Common ---
    'ok': { en: 'OK', tr: 'Tamam' },
    'cancel': { en: 'Cancel', tr: 'İptal' },
    'save': { en: 'Save', tr: 'Kaydet' },
    'delete': { en: 'Delete', tr: 'Sil' },
    'settings': { en: 'Settings', tr: 'Ayarlar' },
    'home': { en: 'Home', tr: 'Ana Sayfa' },
    'online': { en: 'Online', tr: 'Çevrimiçi' },
    'offline': { en: 'Offline', tr: 'Çevrimdışı' },
    'search': { en: 'Search', tr: 'Ara' },
    'loading': { en: 'Loading...', tr: 'Yükleniyor...' },

    // --- Sidebar & ChannelList ---
    'friends': { en: 'Friends', tr: 'Arkadaşlar' },
    'direct_messages': { en: 'Direct Messages', tr: 'Özel Mesajlar' },
    'find_conversation': { en: 'Find a conversation', tr: 'Konuşma bul...' },
    'rooms': { en: 'Rooms', tr: 'Odalar' },
    'no_conversations': { en: 'No conversations yet', tr: 'Henüz konuşma yok' },
    'start_conversation': { en: 'Start one above', tr: 'Yukarıdan birini başlat' },
    'create_room': { en: 'Create Room', tr: 'Kanal Oluştur' },

    // --- ChatArea ---
    'message_placeholder': { en: 'Message #', tr: 'Mesaj gönder: #' },
    'welcome_hub': { en: 'Welcome', tr: 'Hoş Geldiniz' },
    'welcome_desc': { en: 'Select a conversation to begin.', tr: 'Başlamak için bir konuşma seçin.' },
    'is_typing': { en: 'is typing...', tr: 'yazıyor...' },
    'are_typing': { en: 'are typing...', tr: 'yazıyorlar...' },
    'reply_to': { en: 'Replying to', tr: 'Yanıtla:' },
    'no_messages': { en: 'No messages yet. Say hello!', tr: 'Henüz mesaj yok. Merhaba de!' },

    // --- Settings Modal ---
    'profile': { en: 'Profile', tr: 'Profil' },
    'appearance': { en: 'Appearance', tr: 'Görünüm' },
    'themes': { en: 'Themes', tr: 'Temalar' },
    'language': { en: 'Language', tr: 'Dil' },
    'display_name': { en: 'Display Name', tr: 'Görünen İsim' },
    'bio': { en: 'Bio', tr: 'Hakkında' },
    'avatar_url': { en: 'Avatar URL', tr: 'Profil Resmi URL' },
    'update_profile': { en: 'Update Profile', tr: 'Profili Güncelle' },
    'built_in_themes': { en: 'Built-in Themes', tr: 'Yerleşik Temalar' },
    'featured_themes': { en: 'Featured Themes', tr: 'Öne Çıkan Temalar' },
    'import_theme': { en: 'Import Theme', tr: 'Tema İçe Aktar' },
    'theme_name': { en: 'Theme Name', tr: 'Tema Adı' },
    'css_url_or_raw': { en: 'CSS URL or Raw CSS', tr: 'CSS Linki veya Ham CSS' },
    'upload_css_file': { en: 'Upload CSS File', tr: 'CSS Dosyası Yükle' },
    'install_apply': { en: 'Install & Apply', tr: 'Kur ve Uygula' },
    'dark_mode': { en: 'Dark', tr: 'Koyu' },
    'light_mode': { en: 'Light', tr: 'Aydınlık' },

    // --- Auth ---
    'login': { en: 'Login', tr: 'Giriş Yap' },
    'register': { en: 'Register', tr: 'Kayıt Ol' },
    'username': { en: 'Username', tr: 'Kullanıcı Adı' },
    'password': { en: 'Password', tr: 'Şifre' },
    'no_account': { en: "Don't have an account?", tr: 'Hesabın yok mu?' },
    'have_account': { en: 'Already have an account?', tr: 'Zaten hesabın var mı?' },
    'signing_in': { en: 'Signing in...', tr: 'Giriş yapılıyor...' },
    'creating_account': { en: 'Creating account...', tr: 'Hesap oluşturuluyor...' },
};

interface I18nState {
    lang: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string) => string;
}

export const useI18nStore = create<I18nState>()(
    persist(
        (set, get) => ({
            lang: navigator.language.startsWith('tr') ? 'tr' : 'en',
            setLanguage: (lang) => set({ lang }),
            t: (key) => {
                const { lang } = get();
                const entry = translations[key];
                if (!entry) return key;
                return entry[lang] || key;
            }
        }),
        {
            name: 'locals-i18n'
        }
    )
);
