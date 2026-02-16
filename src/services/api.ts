import { useAuthStore } from '../stores/authStore';

export class ApiService {
    private static baseUrl = ApiService.resolveApiBaseUrl();

    private static resolveApiBaseUrl() {
        const configured = import.meta.env.VITE_API_URL?.trim();
        if (configured) {
            return configured.replace(/\/$/, '');
        }

        // Electron production uses file://, so relative /api would fail there.
        if (window.location.protocol === 'file:') {
            return 'https://fiskos.xyz/api';
        }

        return '/api';
    }

    static getWsUrl() {
        const configured = import.meta.env.VITE_API_URL?.trim();

        if (configured) {
            try {
                const apiUrl = new URL(configured);
                apiUrl.protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
                apiUrl.pathname = '/ws';
                apiUrl.search = '';
                apiUrl.hash = '';
                return apiUrl.toString();
            } catch {
                // Ignore malformed env and fallback below.
            }
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${window.location.host}/ws`;
    }

    private static getHeaders(userId?: string) {
        const headers: any = { 'Content-Type': 'application/json' };

        // Add Bearer token and User ID from auth store
        const user = useAuthStore.getState().user;
        const token = user?.session_token;
        const resolvedUserId = userId || user?.id;

        if (resolvedUserId && token) {
            headers['X-User-ID'] = resolvedUserId;
            headers['Authorization'] = `Bearer ${token}`;
        } else if (userId) {
            // Warn if we are sending a userId but have no token
            console.warn('[API] Sending request with UserId but no Session Token! This will likely cause a 401.', { userId });
            headers['X-User-ID'] = userId;
        }

        return headers;
    }

    static async get(path: string, userId?: string) {
        const response = await fetch(`${this.baseUrl}${path}`, {
            headers: this.getHeaders(userId)
        });
        const contentType = response.headers.get('content-type');
        if (!response.ok) {
            const status = response.status;
            let message = response.statusText;
            if (contentType && contentType.includes('application/json')) {
                const err = await response.json().catch(() => ({}));
                message = err.error || message;
            }
            const error: any = new Error(message);
            error.status = status;
            throw error;
        }
        if (contentType && contentType.includes('application/json')) {
            return response.json();
        }
        return response.text();
    }

    static async post(path: string, data: any, userId?: string) {
        const response = await fetch(`${this.baseUrl}${path}`, {
            method: 'POST',
            headers: this.getHeaders(userId),
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const status = response.status;
            const contentType = response.headers.get('content-type');
            let message = response.statusText;
            if (contentType && contentType.includes('application/json')) {
                const err = await response.json().catch(() => ({}));
                message = err.error || message;
            }
            const error: any = new Error(message);
            error.status = status;
            throw error;
        }
        return response.json();
    }

    // --- Auth ---
    static async login(data: { username: string, password?: string }) {
        return this.post('/auth/login', data);
    }

    static async register(data: { username: string, password?: string }) {
        return this.post('/auth/register', data);
    }

    static async getMe(userId: string) {
        return this.get('/auth/me', userId);
    }

    // --- User ---
    static async updateProfile(userId: string, data: { display_name: string, avatar_url: string, bio?: string, custom_status?: string }) {
        return this.post('/user/profile', { id: userId, ...data }, userId);
    }

    static async fetchUserList(userId: string, spaceId?: string | null) {
        const query = spaceId ? `?space_id=${spaceId}` : '';
        return this.get(`/users/list${query}`, userId);
    }

    static async searchUsers(query: string, userId: string) {
        return this.get(`/users/search?q=${encodeURIComponent(query)}`, userId);
    }

    // --- Spaces & Rooms ---
    static async fetchSpaces(userId?: string) {
        return this.get('/spaces', userId);
    }

    static async createSpace(userId: string, name: string, isPrivate: boolean = false) {
        return this.post('/spaces', { name, owner_id: userId, is_private: isPrivate }, userId);
    }

    static async fetchRooms(spaceId: string, userId?: string) {
        return this.get(`/rooms/${spaceId}`, userId);
    }

    static async createRoom(userId: string, spaceId: string, name: string, type: 'text' | 'voice' = 'text') {
        return this.post('/rooms', { space_id: spaceId, name, type }, userId);
    }

    // --- Direct Messaging ---
    static async fetchDMs(userId: string) {
        return this.get('/dm/list', userId);
    }

    static async createDM(userId: string, targetUserId: string) {
        return this.post('/dm/create', { target_user_id: targetUserId }, userId);
    }

    // --- Messages, Reactions, Receipts ---
    static async fetchMessages(roomId: string, userId?: string) {
        return this.get(`/messages/${roomId}`, userId);
    }

    static async sendMessage(roomId: string, userId: string, content: string, replyToId?: string) {
        return this.post('/messages/send', {
            room_id: roomId,
            user_id: userId,
            content,
            reply_to_id: replyToId
        }, userId);
    }

    static async toggleReaction(messageId: string, userId: string, emoji: string) {
        return this.post('/reactions', { message_id: messageId, user_id: userId, emoji }, userId);
    }


    static async setTyping(roomId: string, userId: string, isTyping: boolean) {
        return this.post('/typing', { room_id: roomId, user_id: userId, is_typing: isTyping }, userId);
    }

    // --- Themes ---
    static async fetchThemes(userId: string) {
        return this.get('/themes', userId);
    }

    static async saveTheme(userId: string, theme: { id?: string, name: string, css_content: string, is_url: boolean, is_active: boolean }) {
        return this.post('/themes', theme, userId);
    }

    static async deleteTheme(userId: string, id: string) {
        return this.post('/themes/delete', { id }, userId);
    }

    static async resolveThemeUrl(url: string): Promise<{ css_content: string; resolved_url: string }> {
        return this.post('/themes/resolve-url', { url });
    }

    // --- Voice Chat ---
    static async createCall(roomId: string, userId: string) {
        return this.post('/voice/call', { room_id: roomId }, userId);
    }

    static async sendSignal(callId: string, userId: string, type: string, payload: any) {
        return this.post('/voice/signal', { call_id: callId, type, payload }, userId);
    }

    static async pollSignals(callId: string, userId: string, lastSignalId: number) {
        return this.post('/voice/poll', { call_id: callId, last_signal_id: lastSignalId }, userId);
    }

    static async fetchVoiceParticipants(roomId: string, userId: string) {
        return this.get(`/voice/participants/${roomId}`, userId);
    }

    static async endCall(userId: string) {
        return this.post('/voice/end', {}, userId);
    }

    static async deleteMessage(messageId: string, userId: string) {
        return this.post(`/messages/delete/${messageId}`, {}, userId);
    }

    static async deleteSpace(spaceId: string, userId: string) {
        return this.post(`/spaces/delete/${spaceId}`, {}, userId);
    }

    static async kickUser(spaceId: string, userId: string, targetUserId: string) {
        return this.post('/spaces/kick', { space_id: spaceId, target_user_id: targetUserId }, userId);
    }

    static async banUser(userId: string, targetUserId: string, ban: boolean = true) {
        return this.post('/users/ban', { target_user_id: targetUserId, ban }, userId);
    }

    static async fetchAdminUsers(userId: string) {
        return this.get('/admin/users', userId);
    }

    static async fetchBannedUsers(userId: string) {
        return this.get('/admin/banned', userId);
    }

    static async unbanUser(userId: string, targetUserId: string) {
        return this.post('/users/ban', { target_user_id: targetUserId, ban: false }, userId);
    }


    // --- Pinning ---
    static async fetchPinnedMessages(roomId: string) {
        return this.get(`/messages/pinned/${roomId}`);
    }

    static async pinMessage(messageId: string, isPinned: boolean) {
        return this.post('/messages/pin', { message_id: messageId, is_pinned: isPinned });
    }
}
