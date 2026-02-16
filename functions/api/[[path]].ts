/// <reference types="@cloudflare/workers-types" />

interface Env {
    DB: D1Database;
    ADMIN_USERNAME: string;
}

// Increase request body size handling
const MAX_BODY_SIZE = 2000000; // 2MB - increase from default 100KB

// Utility for hashing passwords (PBKDF2)
const hashPassword = async (password: string, salt: Uint8Array) => {
    const encoder = new TextEncoder();
    const passwordKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveBits', 'deriveKey']
    );

    const key = await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: 100000,
            hash: 'SHA-256'
        } as any,
        passwordKey,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );

    const exportedKey = await crypto.subtle.exportKey('raw', key);
    return btoa(String.fromCharCode(...new Uint8Array(exportedKey)));
};

export const onRequest: PagesFunction<Env> = async (context) => {
    const { request, env } = context;
    const url = new URL(request.url);
    const path = url.pathname.replace('/api', '');

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-ID',
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    const updateLastSeen = async (userId: string) => {
        if (!userId) return;
        await env.DB.prepare('UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = ?').bind(userId).run();
    };

    try {
        const userIdHeader = request.headers.get('X-User-ID');
        if (userIdHeader) await updateLastSeen(userIdHeader);

        // --- GET METHODS ---
        if (request.method === 'GET') {
            if (path === '/spaces') {
                const query = userIdHeader
                    ? `SELECT DISTINCT s.* FROM spaces s 
                       LEFT JOIN rooms r ON s.id = r.space_id 
                       LEFT JOIN participants p ON r.id = p.room_id 
                       WHERE s.is_private = 0 OR s.owner_id = ? OR p.user_id = ? 
                       ORDER BY s.created_at DESC`
                    : `SELECT * FROM spaces WHERE is_private = 0 ORDER BY created_at DESC`;

                const { results } = userIdHeader
                    ? await env.DB.prepare(query).bind(userIdHeader, userIdHeader).all()
                    : await env.DB.prepare(query).all();

                return Response.json(results, { headers: corsHeaders });
            }

            if (path === '/users/search') {
                const query = url.searchParams.get('q') || '';
                const { results } = await env.DB.prepare('SELECT id, username, display_name, avatar_url FROM users WHERE username LIKE ? OR display_name LIKE ? LIMIT 10')
                    .bind(`%${query}%`, `%${query}%`).all();
                return Response.json(results, { headers: corsHeaders });
            }

            if (path === '/users/list') {
                if (!userIdHeader) return new Response('Unauthorized', { status: 401 });

                const currentUser = await env.DB.prepare('SELECT username FROM users WHERE id = ?').bind(userIdHeader).first() as any;
                if (!currentUser) return new Response('Unauthorized', { status: 401 });

                const adminUsername = env.ADMIN_USERNAME || 'ds4d';
                const isAdmin = currentUser.username.toLowerCase() === adminUsername.toLowerCase();

                let results;
                if (isAdmin) {
                    results = await env.DB.prepare("SELECT id, username, display_name, avatar_url, last_seen, custom_status, is_banned FROM users").all();
                } else {
                    // Users see others who share a SPACE with them (regardless of specific room participation)
                    // We find spaces where the current user is a participant in at least one room OR is the owner
                    results = await env.DB.prepare(`
                        SELECT DISTINCT u.id, u.username, u.display_name, u.avatar_url, u.last_seen, u.custom_status, u.is_banned
                        FROM users u
                        WHERE u.id = ? 
                        OR u.id IN (
                            SELECT DISTINCT p.user_id
                            FROM participants p
                            JOIN rooms r ON p.room_id = r.id
                            WHERE r.space_id IN (
                                SELECT DISTINCT r2.space_id
                                FROM rooms r2
                                JOIN participants p2 ON r2.id = p2.room_id
                                WHERE p2.user_id = ?
                            )
                        )
                        OR u.id IN (
                            SELECT owner_id FROM spaces WHERE id IN (
                                SELECT DISTINCT r3.space_id
                                FROM rooms r3
                                JOIN participants p3 ON r3.id = p3.room_id
                                WHERE p3.user_id = ?
                            )
                        )
                    `).bind(userIdHeader, userIdHeader, userIdHeader).all();
                }
                return Response.json(results.results, { headers: corsHeaders });
            }

            if (path.startsWith('/rooms/')) {
                const spaceId = path.split('/')[2];
                const { results } = await env.DB.prepare('SELECT * FROM rooms WHERE space_id = ? AND is_private = 0').bind(spaceId).all();
                return Response.json(results, { headers: corsHeaders });
            }

            if (path === '/dm/list') {
                if (!userIdHeader) return new Response('Unauthorized', { status: 401 });
                const { results } = await env.DB.prepare(`
                    SELECT r.*, u.username as other_username, u.display_name as other_display_name, u.avatar_url as other_avatar, u.last_seen
                    FROM rooms r
                    JOIN participants p ON r.id = p.room_id
                    JOIN participants p2 ON r.id = p2.room_id AND p2.user_id != p.user_id
                    JOIN users u ON p2.user_id = u.id
                    WHERE p.user_id = ? AND r.type = 'dm'
                `).bind(userIdHeader).all();
                return Response.json(results, { headers: corsHeaders });
            }

            if (path.startsWith('/messages/')) {
                const roomId = path.split('/')[2];
                const { results } = await env.DB.prepare(`
                    SELECT m.*, u.username, u.display_name, u.avatar_url 
                    FROM messages m 
                    JOIN users u ON m.user_id = u.id 
                    WHERE m.room_id = ? 
                    ORDER BY m.created_at ASC LIMIT 200
                `).bind(roomId).all();
                return Response.json(results, { headers: corsHeaders });
            }

            if (path === '/typing') {
                const roomId = url.searchParams.get('room_id');
                const { results } = await env.DB.prepare(`
                    SELECT u.display_name || u.username as name
                    FROM participants p
                    JOIN users u ON p.user_id = u.id
                    WHERE p.room_id = ? AND u.last_seen > datetime('now', '-10 seconds')
                    AND u.custom_status = 'typing:' || ?
                `).bind(roomId, roomId).all();
                return Response.json(results, { headers: corsHeaders });
            }

            if (path.startsWith('/reactions/')) {
                const messageId = path.split('/')[2];
                const { results } = await env.DB.prepare(`
                    SELECT emoji, COUNT(*) as count, GROUP_CONCAT(user_id) as users
                    FROM reactions WHERE message_id = ? GROUP BY emoji
                `).bind(messageId).all();
                return Response.json(results, { headers: corsHeaders });
            }

            if (path === '/auth/me') {
                if (!userIdHeader) return new Response('Unauthorized', { status: 401, headers: corsHeaders });
                const user = await env.DB.prepare('SELECT id, username, display_name, avatar_url, bio, is_banned FROM users WHERE id = ?')
                    .bind(userIdHeader).first() as any;
                if (!user) return Response.json({ error: 'User not found' }, { status: 401, headers: corsHeaders });

                if (user.is_banned) return Response.json({ error: 'This account has been banned' }, { status: 403, headers: corsHeaders });

                // Add is_admin flag
                const adminUsername = env.ADMIN_USERNAME || 'ds4d';
                (user as any).is_admin = user.username.toLowerCase() === adminUsername.toLowerCase();

                return Response.json(user, { headers: corsHeaders });
            }

            if (path === '/users/list') {
                if (!userIdHeader) return new Response('Unauthorized', { status: 401 });
                const spaceId = url.searchParams.get('space_id');

                let results;
                if (spaceId) {
                    // Fetch members of the specific space (server)
                    const data = await env.DB.prepare(`
                        SELECT DISTINCT u.id, u.username, u.display_name, u.avatar_url, u.last_seen, u.is_banned, u.custom_status 
                        FROM users u
                        JOIN participants p ON u.id = p.user_id
                        JOIN rooms r ON p.room_id = r.id
                        WHERE r.space_id = ?
                        ORDER BY 
                            CASE WHEN u.last_seen IS NOT NULL THEN 1 ELSE 2 END,
                            u.last_seen DESC
                        LIMIT 200
                    `).bind(spaceId).all();
                    results = data.results;
                } else {
                    // Fallback to global list (or maybe just friends later)
                    // limit to 200 to avoid overload
                    const data = await env.DB.prepare(`
                        SELECT id, username, display_name, avatar_url, last_seen, is_banned, custom_status 
                        FROM users 
                        ORDER BY 
                            CASE WHEN last_seen IS NOT NULL THEN 1 ELSE 2 END,
                            last_seen DESC 
                        LIMIT 200
                    `).all();
                    results = data.results;
                }

                return Response.json(results, { headers: corsHeaders });
            }

            if (path === '/themes') {
                if (!userIdHeader) return new Response('Unauthorized', { status: 401 });
                const { results } = await env.DB.prepare('SELECT * FROM user_themes WHERE user_id = ?')
                    .bind(userIdHeader).all();
                return Response.json(results, { headers: corsHeaders });
            }

            if (path.startsWith('/voice/participants/')) {
                const parts = path.split('/');
                const roomId = parts[parts.length - 1];

                // Fetch participants from call_participants table
                // Filter users who haven't updated their 'last_seen' in the last 15 seconds
                const { results } = await env.DB.prepare(`
                    SELECT u.id, u.username, u.display_name, u.avatar_url, MAX(cp.joined_at) as last_activity
                    FROM call_participants cp
                    JOIN calls c ON cp.call_id = c.id
                    JOIN users u ON cp.user_id = u.id
                    WHERE c.room_id = ? AND c.status = 'active'
                    AND u.last_seen > datetime('now', '-60 seconds')
                    GROUP BY u.id
                `).bind(roomId).all();

                return Response.json(results, { headers: corsHeaders });
            }

            if (path.startsWith('/messages/pinned/')) {
                const roomId = path.split('/').pop();
                const { results } = await env.DB.prepare(`
                    SELECT m.*, u.username, u.display_name, u.avatar_url 
                    FROM messages m
                    JOIN users u ON m.user_id = u.id
                    WHERE m.room_id = ? AND m.is_pinned = 1
                    ORDER BY m.created_at ASC
                    `).bind(roomId).all();
                return Response.json(results, { headers: corsHeaders });
            }

            if (path === '/notifications') {
                if (!userIdHeader) return new Response('Unauthorized', { status: 401 });
                const { results } = await env.DB.prepare(`
                    SELECT n.*, u.username as actor_username, u.display_name as actor_display_name, u.avatar_url as actor_avatar
                    FROM notifications n
                    JOIN users u ON n.actor_id = u.id
                    WHERE n.user_id = ?
                    ORDER BY n.created_at DESC
                    LIMIT 50
                `).bind(userIdHeader).all();
                return Response.json(results, { headers: corsHeaders });
            }
        }

        // --- POST METHODS ---
        if (request.method === 'POST') {
            let body: any = {};
            try {
                body = await request.json();
            } catch (parseError: any) {
                console.error('JSON Parse error:', parseError);
                return Response.json({ error: 'Invalid JSON: ' + parseError.message }, { status: 400, headers: corsHeaders });
            }

            if (path === '/auth/register') {
                const { username, password } = body;
                const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
                if (existing) return Response.json({ error: 'User exists' }, { status: 400, headers: corsHeaders });

                const id = crypto.randomUUID();
                const salt = crypto.getRandomValues(new Uint8Array(16));
                const passwordHash = await hashPassword(password, salt);
                const saltStr = btoa(String.fromCharCode(...salt));

                await env.DB.prepare('INSERT INTO users (id, username, display_name, password_hash) VALUES (?, ?, ?, ?)')
                    .bind(id, username, username, `${saltStr}:${passwordHash} `).run();

                return Response.json({ id, username, status: 'registered' }, { headers: corsHeaders });
            }

            if (path === '/auth/login') {
                const { username, password } = body;
                const user = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first() as any;
                if (!user || !user.password_hash) return Response.json({ error: 'Invalid credentials' }, { status: 401, headers: corsHeaders });

                const [saltStr, hash] = user.password_hash.split(':');
                const salt = new Uint8Array(atob(saltStr).split('').map(c => c.charCodeAt(0)));
                const calculatedHash = await hashPassword(password, salt);

                if (calculatedHash !== hash) return Response.json({ error: 'Invalid credentials' }, { status: 401, headers: corsHeaders });

                if (user.is_banned) return Response.json({ error: 'This account has been banned' }, { status: 403, headers: corsHeaders });

                await updateLastSeen(user.id);
                const { password_hash, ...safeUser } = user;

                const adminUsername = env.ADMIN_USERNAME || 'ds4d';
                (safeUser as any).is_admin = safeUser.username.toLowerCase() === adminUsername.toLowerCase();

                return Response.json(safeUser, { headers: corsHeaders });
            }

            if (path === '/user/profile') {
                const { id, display_name, avatar_url } = body;

                // Validation: Check avatar_url size (1.5MB with improved request handling)
                if (avatar_url && avatar_url.length > 1500000) {
                    return Response.json({ error: 'Avatar image exceeds 1.5MB limit' }, { status: 413, headers: corsHeaders });
                }

                // Validation: Check display_name
                if (!display_name || display_name.trim().length === 0) {
                    return Response.json({ error: 'Display name cannot be empty' }, { status: 400, headers: corsHeaders });
                }

                if (display_name.length > 50) {
                    return Response.json({ error: 'Display name too long (max 50 characters)' }, { status: 400, headers: corsHeaders });
                }

                try {
                    const result = await env.DB.prepare('UPDATE users SET display_name = ?, avatar_url = ? WHERE id = ?')
                        .bind(display_name, avatar_url || null, id).run();

                    if (!result.success) {
                        return Response.json({ error: 'Failed to save avatar' }, { status: 500, headers: corsHeaders });
                    }

                    return Response.json({ status: 'updated' }, { headers: corsHeaders });
                } catch (dbError: any) {
                    console.error('Database error:', dbError);
                    return Response.json({ error: 'Database error: ' + dbError.message }, { status: 500, headers: corsHeaders });
                }
            }

            if (path === '/admin/users') {
                if (!userIdHeader) return new Response('Unauthorized', { status: 401, headers: corsHeaders });
                const user = await env.DB.prepare('SELECT username FROM users WHERE id = ?').bind(userIdHeader).first() as any;
                const adminUsername = env.ADMIN_USERNAME || 'ds4d';
                if (!user || user.username.toLowerCase() !== adminUsername.toLowerCase()) {
                    return Response.json({ error: 'Permission denied' }, { status: 403, headers: corsHeaders });
                }

                const { results } = await env.DB.prepare('SELECT id, username, display_name, avatar_url, created_at, is_banned FROM users ORDER BY created_at DESC LIMIT 50').all();
                return Response.json(results, { headers: corsHeaders });
            }

            if (path === '/dm/create') {
                const { target_user_id } = body;
                if (!userIdHeader) return new Response('Unauthorized', { status: 401 });

                const existing = await env.DB.prepare(`
                        SELECT r.id FROM rooms r
                        JOIN participants p1 ON r.id = p1.room_id
                        JOIN participants p2 ON r.id = p2.room_id
                        WHERE r.type = 'dm' AND p1.user_id = ? AND p2.user_id = ?
                    `).bind(userIdHeader, target_user_id).first();

                if (existing) return Response.json(existing, { headers: corsHeaders });

                const roomId = crypto.randomUUID();
                await env.DB.prepare('INSERT INTO rooms (id, name, type, is_private) VALUES (?, ?, ?, ?)')
                    .bind(roomId, `dm_${userIdHeader}_${target_user_id} `, 'dm', 1).run();

                await env.DB.prepare('INSERT INTO participants (room_id, user_id, role) VALUES (?, ?, ?), (?, ?, ?)')
                    .bind(roomId, userIdHeader, 'member', roomId, target_user_id, 'member').run();

                return Response.json({ id: roomId, status: 'created' }, { headers: corsHeaders });
            }

            if (path === '/spaces') {
                const { name, owner_id, is_private } = body;
                const id = crypto.randomUUID();
                await env.DB.prepare('INSERT INTO spaces (id, name, owner_id, is_private) VALUES (?, ?, ?, ?)')
                    .bind(id, name, owner_id, is_private ? 1 : 0).run();
                const roomId = crypto.randomUUID();
                await env.DB.prepare('INSERT INTO rooms (id, space_id, name) VALUES (?, ?, ?)')
                    .bind(roomId, id, 'general').run();
                // Add owner as participant
                await env.DB.prepare('INSERT INTO participants (room_id, user_id, role) VALUES (?, ?, ?)')
                    .bind(roomId, owner_id, 'owner').run();
                return Response.json({ id, name, status: 'created' }, { headers: corsHeaders });
            }

            if (path === '/rooms') {
                const { space_id, name, type } = body;
                const id = crypto.randomUUID();
                await env.DB.prepare('INSERT INTO rooms (id, space_id, name, type) VALUES (?, ?, ?, ?)')
                    .bind(id, space_id, name, type || 'text').run();
                return Response.json({ id, name, status: 'created' }, { headers: corsHeaders });
            }

            if (path === '/invites/create') {
                const { space_id, max_uses, expires_in_hours } = body;
                if (!userIdHeader) return new Response('Unauthorized', { status: 401 });

                const code = Math.random().toString(36).substring(2, 8).toUpperCase();
                const expiresAt = expires_in_hours ? new Date(Date.now() + expires_in_hours * 3600000).toISOString() : null;

                await env.DB.prepare('INSERT INTO invitations (code, space_id, created_by, max_uses, expires_at) VALUES (?, ?, ?, ?, ?)')
                    .bind(code, space_id, userIdHeader, max_uses || 0, expiresAt).run();

                return Response.json({ code }, { headers: corsHeaders });
            }

            if (path === '/invites/join') {
                const { code } = body;
                if (!userIdHeader) return new Response('Unauthorized', { status: 401 });

                const invite = await env.DB.prepare('SELECT * FROM invitations WHERE code = ?').bind(code).first() as any;
                if (!invite) return Response.json({ error: 'Invalid invite code' }, { status: 404, headers: corsHeaders });

                if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
                    return Response.json({ error: 'Invite expired' }, { status: 400, headers: corsHeaders });
                }

                if (invite.max_uses > 0 && invite.uses >= invite.max_uses) {
                    return Response.json({ error: 'Invite limit reached' }, { status: 400, headers: corsHeaders });
                }

                await env.DB.prepare('UPDATE invitations SET uses = uses + 1 WHERE code = ?').bind(code).run();

                const space = await env.DB.prepare('SELECT * FROM spaces WHERE id = ?').bind(invite.space_id).first() as any;

                // Add user to general room
                const generalRoom = await env.DB.prepare('SELECT id FROM rooms WHERE space_id = ? AND name = ?').bind(invite.space_id, 'general').first() as any;
                if (generalRoom) {
                    await env.DB.prepare('INSERT OR IGNORE INTO participants (room_id, user_id) VALUES (?, ?)')
                        .bind(generalRoom.id, userIdHeader).run();
                }

                return Response.json(space, { headers: corsHeaders });
            }

            if (path === '/messages/send') {
                const { room_id, user_id, content, reply_to_id } = body;
                const id = crypto.randomUUID();
                await env.DB.prepare('INSERT INTO messages (id, room_id, user_id, content, reply_to_id) VALUES (?, ?, ?, ?, ?)')
                    .bind(id, room_id, user_id, content, reply_to_id || null).run();

                await updateLastSeen(user_id);

                // Check for mentions
                const mentionMatch = content.match(/@(\w+)/g);
                if (mentionMatch) {
                    for (const mention of mentionMatch) {
                        const username = mention.substring(1);
                        const targetUser = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first() as any;
                        if (targetUser && targetUser.id !== user_id) {
                            const notifId = crypto.randomUUID();
                            await env.DB.prepare('INSERT INTO notifications (id, user_id, actor_id, type, resource_id) VALUES (?, ?, ?, ?, ?)')
                                .bind(notifId, targetUser.id, user_id, 'mention', id).run();
                        }
                    }
                }

                return Response.json({ id, status: 'sent' }, { headers: corsHeaders });
            }

            if (path === '/messages/pin') {
                const { message_id, is_pinned } = body;
                await env.DB.prepare('UPDATE messages SET is_pinned = ? WHERE id = ?')
                    .bind(is_pinned ? 1 : 0, message_id).run();
                return Response.json({ status: 'updated' }, { headers: corsHeaders });
            }

            if (path === '/notifications/read') {
                const { notification_id, all } = body;
                if (!userIdHeader) return new Response('Unauthorized', { status: 401 });

                if (all) {
                    await env.DB.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').bind(userIdHeader).run();
                } else {
                    await env.DB.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').bind(notification_id, userIdHeader).run();
                }
                return Response.json({ status: 'updated' }, { headers: corsHeaders });
            }

            if (path === '/typing') {
                const { room_id, user_id, is_typing } = body;
                const status = is_typing ? `typing:${room_id} ` : '';
                await env.DB.prepare('UPDATE users SET custom_status = ? WHERE id = ?')
                    .bind(status, user_id).run();
                return Response.json({ status: 'updated' }, { headers: corsHeaders });
            }

            if (path === '/read-receipts') {
                const { room_id, user_id, message_id } = body;
                await env.DB.prepare(`
                    INSERT INTO read_receipts (room_id, user_id, last_read_message_id) VALUES (?, ?, ?)
                    ON CONFLICT(room_id, user_id) DO UPDATE SET last_read_message_id = excluded.last_read_message_id, updated_at = CURRENT_TIMESTAMP
                `).bind(room_id, user_id, message_id).run();
                return Response.json({ status: 'updated' }, { headers: corsHeaders });
            }

            if (path === '/reactions') {
                const { message_id, user_id, emoji } = body;
                const existing = await env.DB.prepare('SELECT id FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?')
                    .bind(message_id, user_id, emoji).first();

                if (existing) {
                    await env.DB.prepare('DELETE FROM reactions WHERE id = ?').bind(existing.id).run();
                    return Response.json({ status: 'removed' }, { headers: corsHeaders });
                } else {
                    const id = crypto.randomUUID();
                    await env.DB.prepare('INSERT INTO reactions (id, message_id, user_id, emoji) VALUES (?, ?, ?, ?)')
                        .bind(id, message_id, user_id, emoji).run();
                    return Response.json({ status: 'added' }, { headers: corsHeaders });
                }
            }

            if (path === '/themes') {
                if (!userIdHeader) return new Response('Unauthorized', { status: 401 });
                const { id, name, css_content, is_url, is_active } = body;
                if (id) {
                    await env.DB.prepare(`
                        UPDATE user_themes SET name = ?, css_content = ?, is_url = ?, is_active = ? WHERE id = ? AND user_id = ?
                    `).bind(name, css_content, is_url ? 1 : 0, is_active ? 1 : 0, id, userIdHeader).run();
                } else {
                    const newId = crypto.randomUUID();
                    await env.DB.prepare(`
                        INSERT INTO user_themes (id, user_id, name, css_content, is_url, is_active) VALUES (?, ?, ?, ?, ?, ?)
                    `).bind(newId, userIdHeader, name, css_content, is_url ? 1 : 0, is_active ? 1 : 0).run();
                }
                return Response.json({ status: 'saved' }, { headers: corsHeaders });
            }

            if (path === '/themes/delete') {
                if (!userIdHeader) return new Response('Unauthorized', { status: 401 });
                const { id } = body;
                await env.DB.prepare('DELETE FROM user_themes WHERE id = ? AND user_id = ?')
                    .bind(id, userIdHeader).run();
                return Response.json({ status: 'deleted' }, { headers: corsHeaders });
            }

            // --- Voice Chat Signaling ---
            if (path === '/voice/call') {
                const { room_id } = body;
                if (!userIdHeader) return new Response('Unauthorized', { status: 401 });

                // Check for an existing active call in this room
                let call = await env.DB.prepare('SELECT id FROM calls WHERE room_id = ? AND status = \'active\' ORDER BY created_at DESC LIMIT 1')
                    .bind(room_id).first() as any;

                if (!call) {
                    // Start a new call
                    const id = crypto.randomUUID();
                    await env.DB.prepare('INSERT INTO calls (id, room_id, caller_id) VALUES (?, ?, ?)')
                        .bind(id, room_id, userIdHeader).run();
                    call = { id };
                }

                // Register user as an active participant for this call
                await env.DB.prepare(`
                    INSERT INTO call_participants (call_id, user_id) VALUES (?, ?)
                    ON CONFLICT(call_id, user_id) DO UPDATE SET joined_at = CURRENT_TIMESTAMP
                `).bind(call.id, userIdHeader).run();

                // Clean up any other active call participations for this user
                await env.DB.prepare('DELETE FROM call_participants WHERE user_id = ? AND call_id != ?').bind(userIdHeader, call.id).run();

                return Response.json({ id: call.id, status: 'joined' }, { headers: corsHeaders });
            }

            if (path === '/voice/end') {
                if (!userIdHeader) return new Response('Unauthorized', { status: 401 });

                // Remove from participants
                await env.DB.prepare('DELETE FROM call_participants WHERE user_id = ?').bind(userIdHeader).run();

                // If the user was the last participant, mark the call as ended
                // This is a simple cleanup heuristic
                return Response.json({ status: 'ended' }, { headers: corsHeaders });
            }

            // --- Deletion Endpoints ---
            if (path.startsWith('/messages/delete/')) {
                const parts = path.split('/');
                const messageId = parts[parts.length - 1];
                // In a real app, check if user is the sender or admin
                await env.DB.prepare('DELETE FROM messages WHERE id = ?').bind(messageId).run();
                await env.DB.prepare('DELETE FROM reactions WHERE message_id = ?').bind(messageId).run();
                return Response.json({ status: 'deleted' }, { headers: corsHeaders });
            }

            if (path.startsWith('/spaces/delete/')) {
                const parts = path.split('/');
                const spaceId = parts[parts.length - 1];
                if (!userIdHeader) return new Response('Unauthorized', { status: 401, headers: corsHeaders });

                const space = await env.DB.prepare('SELECT * FROM spaces WHERE id = ?').bind(spaceId).first() as any;
                if (!space) return new Response('Not Found', { status: 404, headers: corsHeaders });

                const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userIdHeader).first() as any;
                if (!user) return new Response('Unauthorized', { status: 401, headers: corsHeaders });

                let canDelete = false;
                if (space.is_private) {
                    canDelete = space.owner_id === userIdHeader;
                } else {
                    // Use environment variable for admin username
                    const adminUsername = env.ADMIN_USERNAME || 'ds4d';
                    canDelete = user.username.toLowerCase() === adminUsername.toLowerCase();
                }

                if (!canDelete) {
                    return Response.json({ error: 'Permission denied' }, { status: 403, headers: corsHeaders });
                }

                // Cascading delete
                const rooms = await env.DB.prepare('SELECT id FROM rooms WHERE space_id = ?').bind(spaceId).all();
                for (const room of (rooms.results as any)) {
                    await env.DB.prepare('DELETE FROM messages WHERE room_id = ?').bind(room.id).run();
                    await env.DB.prepare('DELETE FROM participants WHERE room_id = ?').bind(room.id).run();
                }
                await env.DB.prepare('DELETE FROM rooms WHERE space_id = ?').bind(spaceId).run();
                await env.DB.prepare('DELETE FROM spaces WHERE id = ?').bind(spaceId).run();
                return Response.json({ status: 'deleted' }, { headers: corsHeaders });
            }

            if (path === '/spaces/kick') {
                const { space_id, target_user_id } = body;
                if (!userIdHeader) return new Response('Unauthorized', { status: 401, headers: corsHeaders });

                const space = await env.DB.prepare('SELECT * FROM spaces WHERE id = ?').bind(space_id).first() as any;
                if (!space) return new Response('Not Found', { status: 404, headers: corsHeaders });

                if (space.owner_id !== userIdHeader) {
                    return Response.json({ error: 'Only the owner can kick users' }, { status: 403, headers: corsHeaders });
                }

                // Remove user from all participants in (rooms of this space)
                const rooms = await env.DB.prepare('SELECT id FROM rooms WHERE space_id = ?').bind(space_id).all();
                for (const room of (rooms.results as any)) {
                    await env.DB.prepare('DELETE FROM participants WHERE room_id = ? AND user_id = ?').bind(room.id, target_user_id).run();
                }

                return Response.json({ status: 'kicked' }, { headers: corsHeaders });
            }

            if (path === '/users/ban') {
                const { target_user_id, ban } = body;
                if (!userIdHeader) return new Response('Unauthorized', { status: 401, headers: corsHeaders });

                const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userIdHeader).first() as any;
                const adminUsername = env.ADMIN_USERNAME || 'ds4d';
                if (!user || user.username.toLowerCase() !== adminUsername.toLowerCase()) {
                    return Response.json({ error: 'Permission denied' }, { status: 403, headers: corsHeaders });
                }

                await env.DB.prepare('UPDATE users SET is_banned = ? WHERE id = ?').bind(ban ? 1 : 0, target_user_id).run();
                return Response.json({ status: ban ? 'banned' : 'unbanned' }, { headers: corsHeaders });
            }

            if (path === '/admin/banned') {
                if (!userIdHeader) return new Response('Unauthorized', { status: 401, headers: corsHeaders });
                const user = await env.DB.prepare('SELECT username FROM users WHERE id = ?').bind(userIdHeader).first() as any;
                const adminUsername = env.ADMIN_USERNAME || 'ds4d';
                if (!user || user.username.toLowerCase() !== adminUsername.toLowerCase()) {
                    return Response.json({ error: 'Permission denied' }, { status: 403, headers: corsHeaders });
                }

                const { results } = await env.DB.prepare('SELECT id, username, display_name, avatar_url, is_banned FROM users WHERE is_banned = 1').all();
                return Response.json(results, { headers: corsHeaders });
            }

        }

        return new Response('Not Found', { status: 404, headers: corsHeaders });
    } catch (error: any) {
        return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
    }
};
