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

const app = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });
const dbPath = path.join(process.cwd(), 'data', 'locals.db');

if (!fs.existsSync(path.dirname(dbPath))) fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const schemaPath = path.join(process.cwd(), 'schema.sql');
if (fs.existsSync(schemaPath)) db.exec(fs.readFileSync(schemaPath, 'utf8'));

// Migration & Indexes
try {
    const tableInfo = db.prepare("PRAGMA table_info(users)").all() as any[];
    if (!tableInfo.some(col => col.name === 'session_token')) db.exec("ALTER TABLE users ADD COLUMN session_token TEXT;");
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_messages_room_id_created ON messages(room_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_rooms_space_id ON rooms(space_id);
        CREATE INDEX IF NOT EXISTS idx_participants_user_id ON participants(user_id);
        CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen);
    `);
} catch (err) { }

app.use('*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allowHeaders: ['Content-Type', 'Authorization', 'X-User-ID'] }));

// Utils
const hashPassword = async (password: string, salt: Uint8Array) => {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt as any, iterations: 100000, hash: 'SHA-256' }, key, 256);
    return Buffer.from(bits).toString('base64');
};

const sanitize = (text: string) => text ? text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;') : '';

const lastSeenCache = new Map<string, number>();
const updateLastSeen = (userId: string) => {
    if (!userId) return;
    const now = Date.now();
    if (now - (lastSeenCache.get(userId) || 0) > 30000) {
        db.prepare('UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = ?').run(userId);
        lastSeenCache.set(userId, now);
    }
};

const isAdmin = (userId: string) => {
    const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as any;
    return ['ds4d', 'asuna'].includes(user?.username?.toLowerCase());
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
    if (!userId) return { onClose: () => { } };
    return {
        onOpen(event, ws) { wsRegistry.set(userId, ws); broadcast({ type: 'presence', userId, status: 'online' }, userId); },
        onMessage(event, ws) {
            try {
                const data = JSON.parse(event.data.toString());
                if (data.type === 'signal' && data.to) {
                    const targetWs = wsRegistry.get(data.to);
                    if (targetWs) targetWs.send(JSON.stringify({ type: 'signal', from: userId, payload: data.payload }));
                } else if (data.type === 'heartbeat') updateLastSeen(userId);
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

app.post('/api/spaces/delete/:spaceId', (c) => {
    const sid = c.req.param('spaceId'), uid = c.req.header('X-User-ID');
    const owner = db.prepare('SELECT owner_id FROM spaces WHERE id = ?').get(sid) as any;
    if (owner?.owner_id === uid || isAdmin(uid)) {
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
    db.prepare('UPDATE users SET display_name = COALESCE(?, display_name), avatar_url = COALESCE(?, avatar_url), bio = COALESCE(?, bio), custom_status = COALESCE(?, custom_status) WHERE id = ?').run(display_name, avatar_url, bio, custom_status, uid);
    return c.json({ status: 'updated' });
});

app.get('/api/themes', (c) => c.json(db.prepare('SELECT * FROM user_themes WHERE user_id = ?').all(c.req.header('X-User-ID'))));
app.post('/api/themes', async (c) => {
    const uid = c.req.header('X-User-ID'), { id, name, css_content, is_url, is_active } = await c.req.json();
    const tid = id || uuidv4();
    db.prepare('INSERT INTO user_themes (id, user_id, name, css_content, is_url, is_active) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, css_content=excluded.css_content, is_url=excluded.is_url, is_active=excluded.is_active').run(tid, uid, name, css_content, is_url ? 1 : 0, is_active ? 1 : 0);
    return c.json({ id: tid, status: 'saved' });
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

app.get('/api/messages/:roomId', (c) => c.json(db.prepare('SELECT m.*, u.username, u.display_name, u.avatar_url FROM messages m JOIN users u ON m.user_id = u.id WHERE m.room_id = ? ORDER BY m.created_at ASC LIMIT 100').all(c.req.param('roomId'))));
app.post('/api/messages/send', async (c) => {
    const { room_id, user_id, content, reply_to_id } = await c.req.json(), id = uuidv4(), san = sanitize(content);
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
    const rid = c.req.param('roomId'), call = db.prepare('SELECT id FROM calls WHERE room_id=? AND status=\'active\' ORDER BY created_at DESC LIMIT 1').get(rid) as any;
    return call ? c.json(db.prepare('SELECT u.id, u.username, u.display_name, u.avatar_url FROM call_participants cp JOIN users u ON cp.user_id=u.id WHERE cp.call_id=? AND u.last_seen > datetime(\'now\', \'-45 seconds\')').all(call.id)) : c.json([]);
});
app.post('/api/voice/call', async (c) => {
    const { room_id } = await c.req.json(), uid = c.req.header('X-User-ID');
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

const dist = path.join(process.cwd(), 'dist');
if (fs.existsSync(dist)) app.use('/*', serveStatic({ root: dist, rewriteRequestPath: (p) => p === '/' ? '/index.html' : p }));

setInterval(() => {
    db.prepare("DELETE FROM call_signals WHERE created_at < datetime('now', '-30 minutes')").run();
    db.prepare("DELETE FROM call_participants WHERE user_id IN (SELECT id FROM users WHERE last_seen < datetime('now', '-10 minutes'))").run();
}, 600000);

const port = Number(process.env.PORT) || 3000;
const server = serve({ fetch: app.fetch, port, hostname: '0.0.0.0' });
injectWebSocket(server);
console.log(`[SERVER] Running on port ${port}`);
