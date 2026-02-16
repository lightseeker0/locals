import { Hono, Context, Next } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { cors } from 'hono/cors';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'node:path';
import * as fs from 'node:fs';
import crypto from 'node:crypto';
import { createNodeWebSocket } from '@hono/node-ws';
import { AccessToken } from 'livekit-server-sdk';

const app = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });
const dbPath = path.join(process.cwd(), 'data', 'locals.db');

if (!fs.existsSync(path.dirname(dbPath))) fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 5000');

const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';

const schemaPath = path.join(process.cwd(), 'schema.sql');
if (fs.existsSync(schemaPath)) db.exec(fs.readFileSync(schemaPath, 'utf8'));

// Migration & Indexes
try {
    const tableInfo = db.prepare("PRAGMA table_info(users)").all() as any[];
    if (!tableInfo.some(col => col.name === 'session_token')) db.exec("ALTER TABLE users ADD COLUMN session_token TEXT;");
    if (!tableInfo.some(col => col.name === 'role')) db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'member';");
    // SFU-only cleanup: remove legacy mesh signaling storage if it exists.
    db.exec(`
        DROP INDEX IF EXISTS idx_call_signals_call_id_id;
        DROP INDEX IF EXISTS idx_call_signals_created_at;
        DROP TABLE IF EXISTS call_signals;
    `);
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_messages_room_id_created ON messages(room_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_rooms_space_id ON rooms(space_id);
        CREATE INDEX IF NOT EXISTS idx_participants_user_id ON participants(user_id);
        CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen);
        CREATE INDEX IF NOT EXISTS idx_calls_room_status_created ON calls(room_id, status, created_at);
        CREATE INDEX IF NOT EXISTS idx_call_participants_call_id ON call_participants(call_id);
    `);
} catch (err) { }

app.use('*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allowHeaders: ['Content-Type', 'Authorization', 'X-User-ID'] }));

// Utils
const hashPassword = async (password: string, salt: Uint8Array) => {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt as any, iterations: 600000, hash: 'SHA-256' }, key, 256);
    return Buffer.from(bits).toString('base64');
};

const sanitize = (text: string) => text ? text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;') : '';
const extractBetterDiscordDownloadUrl = (html: string) => {
    const match = html.match(/href="(\/Download\?id=\d+)"/i) || html.match(/https:\/\/betterdiscord\.app\/Download\?id=\d+/i);
    if (!match) return null;
    const href = match[1] || match[0];
    return href.startsWith('http') ? href : `https://betterdiscord.app${href}`;
};
const looksLikeCss = (text: string) => {
    const sample = text.slice(0, 2000);
    if (/<html[\s>]/i.test(sample)) return false;
    return /@import|:root|body\s*\{|html\s*\{|[#.][a-z0-9_-]+\s*\{/i.test(sample);
};
const resolveThemeCssFromUrl = async (rawUrl: string): Promise<{ css_content: string; resolved_url: string }> => {
    const input = (rawUrl || '').trim();
    if (!input) throw new Error('Theme URL is required');
    let currentUrl: URL;
    try {
        currentUrl = new URL(input);
    } catch {
        throw new Error('Invalid URL format');
    }
    if (!['http:', 'https:'].includes(currentUrl.protocol)) {
        throw new Error('Only http/https theme URLs are supported');
    }

    // Follow a few resolver hops (e.g., BetterDiscord page -> Download endpoint -> CSS).
    for (let hop = 0; hop < 4; hop++) {
        const res = await fetch(currentUrl.toString(), {
            redirect: 'follow',
            headers: {
                'Accept': 'text/css,text/plain,text/html;q=0.8,*/*;q=0.5',
                'User-Agent': 'Locals-ThemeResolver/1.0'
            }
        });

        if (!res.ok) {
            throw new Error(`Theme URL returned ${res.status}`);
        }

        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        const finalUrl = new URL(res.url || currentUrl.toString());
        const body = await res.text();

        if (contentType.includes('text/css') || looksLikeCss(body)) {
            return { css_content: body, resolved_url: finalUrl.toString() };
        }

        // BetterDiscord theme pages are HTML; extract their actual /Download?id=... link.
        if (finalUrl.hostname.endsWith('betterdiscord.app') && contentType.includes('text/html')) {
            const downloadUrl = extractBetterDiscordDownloadUrl(body);
            if (downloadUrl) {
                currentUrl = new URL(downloadUrl);
                continue;
            }
        }

        throw new Error('URL did not return CSS content. Use a direct .css/raw URL or BetterDiscord download link.');
    }

    throw new Error('Could not resolve theme URL');
};

const lastSeenCache = new Map<string, number>();
const updateLastSeen = (userId?: string) => {
    if (!userId) return;
    const now = Date.now();
    if (now - (lastSeenCache.get(userId) || 0) > 30000) {
        db.prepare('UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = ?').run(userId);
        lastSeenCache.set(userId, now);
    }
};

const isAdmin = (userId?: string) => {
    if (!userId) return false;
    const user = db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as any;
    return user?.role === 'admin';
};

const checkMembership = (userId: string, roomId?: string, spaceId?: string) => {
    if (!userId) return false;
    if (isAdmin(userId)) return true;
    if (roomId) {
        return !!db.prepare('SELECT 1 FROM participants WHERE room_id = ? AND user_id = ?').get(roomId, userId);
    }
    if (spaceId) {
        // Space root check (special case for space_root_... rooms)
        const sid = spaceId.startsWith('space_root_') ? spaceId.substring(11) : spaceId;
        return !!db.prepare('SELECT 1 FROM participants WHERE (space_id = ? OR room_id = ?) AND user_id = ?').get(sid, 'space_root_' + sid, userId);
    }
    return false;
};

// Middleware
app.use('/api/*', async (c, next) => {
    const userId = c.req.header('X-User-ID');
    const auth = c.req.header('Authorization');
    const token = auth?.startsWith('Bearer ') ? auth.substring(7) : null;
    if (userId && !['/api/auth/login', '/api/auth/register'].some(r => c.req.path === r)) {
        const user = db.prepare('SELECT session_token FROM users WHERE id = ?').get(userId) as any;
        if (!user || user.session_token !== token) return c.json({ error: 'Unauthorized' }, 401);
    }
    if (userId) updateLastSeen(userId);
    await next();
});

// WebSocket
const wsRegistry = new Map<string, any>();
const broadcast = (data: any, excludeUserId?: string) => {
    const payload = JSON.stringify(data);
    wsRegistry.forEach((ws, id) => { if (id !== excludeUserId && ws.readyState === 1) ws.send(payload); });
};

app.get('/ws', upgradeWebSocket((c) => {
    const userId = c.req.query('userId');
    const token = c.req.query('token');

    if (!userId || !token) return { onClose: () => { } };

    // Security: Validate session token before allowing WS connection
    const user = db.prepare('SELECT session_token FROM users WHERE id = ?').get(userId) as any;
    if (!user || user.session_token !== token) {
        return { onClose: () => { } };
    }

    return {
        onOpen(event, ws) { wsRegistry.set(userId, ws); broadcast({ type: 'presence', userId, status: 'online' }, userId); },
        onMessage(event, ws) {
            try {
                const data = JSON.parse(event.data.toString());
                if (data.type === 'heartbeat') {
                    updateLastSeen(userId);
                } else if (data.type === 'typing') {
                    // Broadcast typing status to room members
                    const { room_id, is_typing } = data;
                    const participants = db.prepare('SELECT user_id FROM participants WHERE room_id = ?').all(room_id) as any[];
                    participants.forEach(p => {
                        if (p.user_id !== userId) {
                            wsRegistry.get(p.user_id)?.send(JSON.stringify({ type: 'typing', room_id, user_id: userId, is_typing }));
                        }
                    });
                } else if (data.type === 'voice_room_update') {
                    // Broadcast room update to all participants in that room
                    const { room_id } = data;
                    const participants = db.prepare('SELECT user_id FROM participants WHERE room_id = ?').all(room_id) as any[];
                    participants.forEach(p => {
                        wsRegistry.get(p.user_id)?.send(JSON.stringify({ type: 'voice_room_update', room_id }));
                    });
                } else if (data.type === 'voice_speaking') {
                    const { room_id, is_speaking } = data;
                    if (!room_id) return;

                    const activeCall = db.prepare('SELECT id FROM calls WHERE room_id=? AND status=\'active\' ORDER BY created_at DESC LIMIT 1').get(room_id) as any;
                    if (!activeCall?.id) return;

                    const senderInCall = db.prepare('SELECT 1 as ok FROM call_participants WHERE call_id = ? AND user_id = ?').get(activeCall.id, userId) as any;
                    if (!senderInCall?.ok) return;

                    const participants = db.prepare('SELECT user_id FROM call_participants WHERE call_id = ?').all(activeCall.id) as any[];
                    participants.forEach((p) => {
                        if (p.user_id !== userId) {
                            wsRegistry.get(p.user_id)?.send(JSON.stringify({
                                type: 'voice_speaking',
                                room_id,
                                user_id: userId,
                                is_speaking: !!is_speaking
                            }));
                        }
                    });
                }
            } catch (err) { }
        },
        onClose() { wsRegistry.delete(userId); broadcast({ type: 'presence', userId, status: 'offline' }, userId); }
    };
}));

// API Routes
app.get('/api/spaces', (c) => {
    const uid = c.req.header('X-User-ID');
    const res = uid ? db.prepare('SELECT DISTINCT s.*, 0 as unread_count, 0 as mention_count FROM spaces s LEFT JOIN rooms r ON s.id = r.space_id LEFT JOIN participants p ON r.id = p.room_id WHERE s.is_private = 0 OR s.owner_id = ? OR p.user_id = ? ORDER BY s.created_at DESC').all(uid, uid) : db.prepare('SELECT *, 0 as unread_count, 0 as mention_count FROM spaces WHERE is_private = 0 ORDER BY created_at DESC').all();
    return c.json(res);
});

app.get('/api/users/search', (c) => {
    const q = c.req.query('q') || '';
    return c.json(db.prepare('SELECT id, username, display_name, avatar_url FROM users WHERE username LIKE ? OR display_name LIKE ? LIMIT 10').all(`%${q}%`, `%${q}%`));
});

app.get('/api/users/list', (c) => c.json(db.prepare('SELECT id, username, display_name, avatar_url, last_seen, custom_status FROM users ORDER BY last_seen DESC LIMIT 200').all()));

app.get('/api/rooms/:spaceId', (c) => c.json(db.prepare('SELECT *, 0 as unread_count, 0 as mention_count FROM rooms WHERE space_id = ? AND is_private = 0').all(c.req.param('spaceId'))));

app.post('/api/spaces', async (c) => {
    const uid = c.req.header('X-User-ID');
    const { name, icon_url } = await c.req.json();
    if (!name || name.trim().length < 2 || name.length > 50) return c.json({ error: 'Invalid name length (2-50)' }, 400);
    const spaceId = uuidv4();
    const sanitizedName = sanitize(name);
    db.transaction(() => {
        db.prepare('INSERT INTO spaces (id, name, icon_url, owner_id) VALUES (?, ?, ?, ?)').run(spaceId, sanitizedName, icon_url, uid);
        db.prepare('INSERT INTO participants (room_id, user_id, space_id, role) VALUES (?, ?, ?, ?)').run('space_root_' + spaceId, uid, spaceId, 'owner');
        // Create default rooms
        const generalId = uuidv4(), voiceId = uuidv4();
        db.prepare('INSERT INTO rooms (id, space_id, name, type) VALUES (?, ?, ?, ?)').run(generalId, spaceId, 'general', 'text');
        db.prepare('INSERT INTO rooms (id, space_id, name, type) VALUES (?, ?, ?, ?)').run(voiceId, spaceId, 'ses', 'voice');
        // Add owner to default rooms
        db.prepare('INSERT INTO participants (room_id, user_id, space_id) VALUES (?, ?, ?)').run(generalId, uid, spaceId);
        db.prepare('INSERT INTO participants (room_id, user_id, space_id) VALUES (?, ?, ?)').run(voiceId, uid, spaceId);
    })();
    return c.json({ id: spaceId, status: 'created' });
});

app.post('/api/rooms', async (c) => {
    const { space_id, name, type } = await c.req.json();
    const uid = c.req.header('X-User-ID');
    if (!uid || !checkMembership(uid, undefined, space_id)) return c.json({ error: 'Forbidden' }, 403);
    if (!name || name.trim().length < 2 || name.length > 50) return c.json({ error: 'Invalid name length (2-50)' }, 400);

    const id = uuidv4();
    const sanitizedName = sanitize(name);
    db.prepare('INSERT INTO rooms (id, space_id, name, type) VALUES (?, ?, ?, ?)').run(id, space_id, sanitizedName, type || 'text');
    return c.json({ id, status: 'created' });
});

app.post('/api/invites', async (c) => {
    const uid = c.req.header('X-User-ID');
    const { space_id } = await c.req.json();
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    db.prepare('INSERT INTO invitations (code, space_id, created_by) VALUES (?, ?, ?)').run(code, space_id, uid);
    return c.json({ code });
});

app.post('/api/invites/join', async (c) => {
    const uid = c.req.header('X-User-ID');
    const { code } = await c.req.json();
    const invite = db.prepare('SELECT space_id FROM invitations WHERE code = ?').get(code) as any;
    if (!invite) return c.json({ error: 'Invalid code' }, 404);

    db.transaction(() => {
        db.prepare('INSERT OR IGNORE INTO participants (room_id, user_id, space_id) VALUES (?, ?, ?)').run('space_root_' + invite.space_id, uid, invite.space_id);
        const rooms = db.prepare('SELECT id FROM rooms WHERE space_id = ? AND is_private = 0').all(invite.space_id) as any[];
        rooms.forEach(r => {
            db.prepare('INSERT OR IGNORE INTO participants (room_id, user_id, space_id) VALUES (?, ?, ?)').run(r.id, uid, invite.space_id);
        });
        db.prepare('UPDATE invitations SET uses = uses + 1 WHERE code = ?').run(code);
    })();
    return c.json({ space_id: invite.space_id, status: 'joined' });
});

app.post('/api/spaces/delete/:spaceId', (c) => {
    const sid = c.req.param('spaceId'), uid = c.req.header('X-User-ID');
    const owner = db.prepare('SELECT owner_id FROM spaces WHERE id = ?').get(sid) as any;
    if (uid && (owner?.owner_id === uid || isAdmin(uid))) {
        db.transaction(() => {
            db.prepare('DELETE FROM messages WHERE room_id IN (SELECT id FROM rooms WHERE space_id = ?)').run(sid);
            db.prepare('DELETE FROM rooms WHERE space_id = ?').run(sid);
            db.prepare('DELETE FROM spaces WHERE id = ?').run(sid);
        })();
        return c.json({ status: 'deleted' });
    }
    return c.json({ error: 'Forbidden' }, 403);
});

app.get('/api/auth/me', (c) => {
    const uid = c.req.header('X-User-ID');
    return uid ? c.json(db.prepare('SELECT id, username, display_name, avatar_url, last_seen, is_banned, custom_status FROM users WHERE id = ?').get(uid)) : c.json({ error: 'Unauthorized' }, 401);
});

app.get('/api/dm/list', (c) => {
    const uid = c.req.header('X-User-ID');
    return uid ? c.json(db.prepare('SELECT r.*, u.username as other_username, u.display_name as other_display_name, u.avatar_url as other_avatar, u.last_seen, 0 as unread_count FROM rooms r JOIN participants p ON r.id = p.room_id JOIN participants p2 ON r.id = p2.room_id AND p2.user_id != p.user_id JOIN users u ON p2.user_id = u.id WHERE p.user_id = ? AND r.type = \'dm\'').all(uid)) : c.json({ error: 'Unauthorized' }, 401);
});

app.post('/api/user/profile', async (c) => {
    const uid = c.req.header('X-User-ID');
    const { display_name, avatar_url, bio, custom_status } = await c.req.json();

    // Validation
    if (display_name && (display_name.length < 2 || display_name.length > 50)) return c.json({ error: 'Invalid display name length' }, 400);
    if (bio && bio.length > 200) return c.json({ error: 'Bio too long' }, 400);
    if (custom_status && custom_status.length > 100) return c.json({ error: 'Status too long' }, 400);

    const sDname = display_name ? sanitize(display_name) : display_name;
    const sBio = bio ? sanitize(bio) : bio;
    const sStatus = custom_status ? sanitize(custom_status) : custom_status;

    db.prepare('UPDATE users SET display_name = COALESCE(?, display_name), avatar_url = COALESCE(?, avatar_url), bio = COALESCE(?, bio), custom_status = COALESCE(?, custom_status) WHERE id = ?').run(sDname, avatar_url, sBio, sStatus, uid);
    return c.json({ status: 'updated' });
});

app.get('/api/themes', (c) => c.json(db.prepare('SELECT * FROM user_themes WHERE user_id = ?').all(c.req.header('X-User-ID'))));
app.post('/api/themes', async (c) => {
    const uid = c.req.header('X-User-ID'), { id, name, css_content, is_url, is_active } = await c.req.json();
    const tid = id || uuidv4();
    db.prepare('INSERT INTO user_themes (id, user_id, name, css_content, is_url, is_active) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, css_content=excluded.css_content, is_url=excluded.is_url, is_active=excluded.is_active').run(tid, uid, name, css_content, is_url ? 1 : 0, is_active ? 1 : 0);
    return c.json({ id: tid, status: 'saved' });
});
app.post('/api/themes/delete', async (c) => {
    const uid = c.req.header('X-User-ID');
    const { id } = await c.req.json() as { id?: string };
    if (!uid || !id) return c.json({ error: 'Missing theme id' }, 400);
    db.prepare('DELETE FROM user_themes WHERE id = ? AND user_id = ?').run(id, uid);
    return c.json({ status: 'deleted' });
});
app.post('/api/themes/resolve-url', async (c) => {
    try {
        const { url } = await c.req.json() as { url?: string };
        const resolved = await resolveThemeCssFromUrl(url || '');
        return c.json(resolved);
    } catch (err: any) {
        return c.json({ error: err?.message || 'Failed to resolve theme URL' }, 400);
    }
});

app.get('/api/reactions/:messageId', (c) => c.json(db.prepare('SELECT r.*, u.username, u.display_name FROM reactions r JOIN users u ON r.user_id = u.id WHERE r.message_id = ?').all(c.req.param('messageId'))));
app.post('/api/reactions', async (c) => {
    const { message_id, user_id, emoji } = await c.req.json();
    const ex = db.prepare('SELECT id FROM reactions WHERE message_id=? AND user_id=? AND emoji=?').get(message_id, user_id, emoji) as any;
    if (ex) { db.prepare('DELETE FROM reactions WHERE id=?').run(ex.id); return c.json({ status: 'removed' }); }
    const id = uuidv4(); db.prepare('INSERT INTO reactions (id, message_id, user_id, emoji) VALUES (?, ?, ?, ?)').run(id, message_id, user_id, emoji);
    return c.json({ id, status: 'added' });
});

const typing = new Map<string, Set<string>>();
app.post('/api/typing', async (c) => {
    const { room_id, user_id, is_typing } = await c.req.json();
    if (!typing.has(room_id)) typing.set(room_id, new Set());
    if (is_typing) { typing.get(room_id)!.add(user_id); setTimeout(() => typing.get(room_id)?.delete(user_id), 5000); }
    else typing.get(room_id)!.delete(user_id);
    return c.json({ status: 'ok' });
});
app.get('/api/typing', (c) => {
    const rid = c.req.query('room_id');
    const ids = Array.from(typing.get(rid!) || []);
    return ids.length ? c.json(db.prepare(`SELECT id, username, display_name FROM users WHERE id IN(${ids.map(() => '?').join(',')})`).all(...ids)) : c.json([]);
});

app.get('/api/messages/:roomId', (c) => {
    const rid = c.req.param('roomId'), uid = c.req.header('X-User-ID');
    if (!uid || !checkMembership(uid, rid)) return c.json({ error: 'Forbidden' }, 403);
    return c.json(db.prepare('SELECT m.*, u.username, u.display_name, u.avatar_url FROM messages m JOIN users u ON m.user_id = u.id WHERE m.room_id = ? ORDER BY m.created_at ASC LIMIT 200').all(rid));
});

app.post('/api/messages/send', async (c) => {
    const { room_id, user_id, content, reply_to_id } = await c.req.json(), id = uuidv4(), san = sanitize(content);
    if (!user_id || !checkMembership(user_id, room_id)) return c.json({ error: 'Forbidden' }, 403);

    db.prepare('INSERT INTO messages (id, room_id, user_id, content, reply_to_id) VALUES (?, ?, ?, ?, ?)').run(id, room_id, user_id, san, reply_to_id || null);
    const u = db.prepare('SELECT username, display_name, avatar_url FROM users WHERE id = ?').get(user_id) as any;
    const msg = { id, room_id, user_id, content: san, reply_to_id, username: u?.username, display_name: u?.display_name, avatar_url: u?.avatar_url, created_at: new Date().toISOString() };
    const parts = db.prepare('SELECT user_id FROM participants WHERE room_id = ?').all(room_id) as any[];
    parts.forEach(p => wsRegistry.get(p.user_id)?.send(JSON.stringify({ type: 'message', message: msg })));
    return c.json({ id, status: 'sent' });
});

app.post('/api/auth/register', async (c) => {
    const { username, password } = await c.req.json();
    if (db.prepare('SELECT id FROM users WHERE username=?').get(username)) return c.json({ error: 'Exists' }, 400);
    const id = uuidv4(), salt = crypto.getRandomValues(new Uint8Array(16)), hash = await hashPassword(password, salt), token = crypto.randomUUID();
    db.prepare('INSERT INTO users (id, username, display_name, password_hash, session_token) VALUES (?, ?, ?, ?, ?)').run(id, username, username, `${Buffer.from(salt).toString('base64')}:${hash}`, token);
    return c.json({ id, username, session_token: token });
});
app.post('/api/auth/login', async (c) => {
    const { username, password } = await c.req.json(), user = db.prepare('SELECT * FROM users WHERE username=?').get(username) as any;
    if (!user) return c.json({ error: 'Forbidden' }, 401);
    const [s, h] = user.password_hash.split(':');
    if (await hashPassword(password, Buffer.from(s, 'base64')) !== h) return c.json({ error: 'Forbidden' }, 401);
    const token = crypto.randomUUID(); db.prepare('UPDATE users SET session_token=? WHERE id=?').run(token, user.id);
    const { password_hash, session_token, ...safe } = user;
    return c.json({ ...safe, session_token: token });
});

app.get('/api/voice/participants/:roomId', (c) => {
    const rid = c.req.param('roomId'), uid = c.req.header('X-User-ID'), call = db.prepare('SELECT id FROM calls WHERE room_id=? AND status=\'active\' ORDER BY created_at DESC LIMIT 1').get(rid) as any;
    if (!uid || !checkMembership(uid, rid)) return c.json({ error: 'Forbidden' }, 403);
    return call ? c.json(db.prepare('SELECT u.id, u.username, u.display_name, u.avatar_url FROM call_participants cp JOIN users u ON cp.user_id=u.id WHERE cp.call_id=? AND u.last_seen > datetime(\'now\', \'-45 seconds\')').all(call.id)) : c.json([]);
});
app.post('/api/voice/call', async (c) => {
    const { room_id } = await c.req.json(), uid = c.req.header('X-User-ID');
    if (!uid || !checkMembership(uid, room_id)) return c.json({ error: 'Forbidden' }, 403);

    let call = db.prepare('SELECT id FROM calls WHERE room_id=? AND status=\'active\' ORDER BY created_at DESC LIMIT 1').get(room_id) as any;
    if (!call) { const id = uuidv4(); db.prepare('INSERT INTO calls (id, room_id, caller_id) VALUES (?, ?, ?)').run(id, room_id, uid); call = { id }; }
    db.prepare('INSERT OR IGNORE INTO call_participants (call_id, user_id) VALUES (?, ?)').run(call.id, uid);
    return c.json({ id: call.id, status: 'joined' });
});

app.post('/api/voice/end', (c) => {
    const uid = c.req.header('X-User-ID');
    if (uid) {
        const cs = db.prepare('SELECT call_id FROM call_participants WHERE user_id=?').all(uid) as any[];
        db.prepare('DELETE FROM call_participants WHERE user_id=?').run(uid);
        cs.forEach(({ call_id }) => { if ((db.prepare('SELECT COUNT(*) as c FROM call_participants WHERE call_id=?').get(call_id) as any).c === 0) db.prepare('UPDATE calls SET status=\'ended\' WHERE id=?').run(call_id); });
    }
    return c.json({ status: 'ended' });
});

app.post('/api/voice/sfu-token', async (c) => {
    const uid = c.req.header('X-User-ID');
    if (!uid) return c.json({ error: 'Unauthorized' }, 401);
    if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
        return c.json({ error: 'SFU is not configured on server' }, 503);
    }

    const body = await c.req.json().catch(() => ({} as any));
    const roomId = (body?.room_id || '').toString().trim();
    const name = (body?.name || '').toString().trim();
    if (!roomId) return c.json({ error: 'Missing room_id' }, 400);

    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
        identity: uid,
        name: name || uid,
        ttl: '2h'
    });
    at.addGrant({
        roomJoin: true,
        room: roomId,
        canPublish: true,
        canSubscribe: true
    });

    const token = await at.toJwt();
    return c.json({ token, url: LIVEKIT_URL });
});

const potentialDistPaths = [
    path.join(process.cwd(), 'dist'),
    path.join(process.cwd(), '..', 'dist'),
];
let distDir = '';
for (const p of potentialDistPaths) {
    if (fs.existsSync(path.join(p, 'index.html'))) {
        distDir = p;
        break;
    }
}

if (distDir) {
    app.use('/*', serveStatic({ root: path.relative(process.cwd(), distDir) }));
    app.get('*', async (c, next) => {
        if (c.req.path.startsWith('/api') || c.req.path === '/ws') return next();
        try {
            const html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf-8');
            return c.html(html);
        } catch (e) { return next(); }
    });
}

setInterval(() => {
    db.prepare("DELETE FROM call_participants WHERE user_id IN (SELECT id FROM users WHERE last_seen < datetime('now', '-2 minutes'))").run();
}, 60000);

const port = Number(process.env.PORT) || 3000;
const server = serve({ fetch: app.fetch, port, hostname: '0.0.0.0' });
injectWebSocket(server);
console.log(`[SERVER] Running on port ${port}`);
