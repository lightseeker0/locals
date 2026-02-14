import { Hono, Context, Next } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { cors } from 'hono/cors';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'node:path';
import * as fs from 'node:fs';

const app = new Hono();
const dbPath = path.join(process.cwd(), 'data', 'locals.db');

// Ensure data directory exists
if (!fs.existsSync(path.dirname(dbPath))) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

const db = new Database(dbPath);

// Initialize database schema if not exists
const schemaPath = fs.existsSync('/app_root/schema.sql')
    ? '/app_root/schema.sql'
    : path.join(process.cwd(), '..', 'schema.sql');

const schema = fs.readFileSync(schemaPath, 'utf8');
db.exec(schema);

app.use('*', cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-User-ID'],
    exposeHeaders: ['Content-Type'],
}));

// Serve static files from the 'dist' folder
const distPath = fs.existsSync('/app_root/dist')
    ? '/app_root/dist'
    : path.join(process.cwd(), '..', 'dist');

app.use('/*', serveStatic({
    root: distPath,
    rewriteRequestPath: (path) => (path === '/' ? '/index.html' : path),
}));

// Fallback for SPA routing (serve index.html for unknown routes)
app.get('*', async (c, next) => {
    if (c.req.path.startsWith('/api')) {
        return next();
    }
    const html = fs.readFileSync(path.join(distPath, 'index.html'), 'utf-8');
    return c.html(html);
});

// Utility for hashing passwords (replication of Cloudflare logic)
// ... (rest of the file remains same, but I'll update the whole block below for consistency)
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
    return Buffer.from(exportedKey).toString('base64');
};

const updateLastSeen = (userId: string) => {
    if (!userId) return;
    db.prepare('UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = ?').run(userId);
};

// Middleware to update last seen
app.use('/api/*', async (c: Context, next: Next) => {
    const userId = c.req.header('X-User-ID');
    if (userId) updateLastSeen(userId);
    await next();
});

// --- API Routes (Replicating [[path]].ts) ---

app.get('/api/spaces', async (c: Context) => {
    const userId = c.req.header('X-User-ID');
    let results;
    if (userId) {
        results = db.prepare(`SELECT DISTINCT s.* FROM spaces s 
                   LEFT JOIN rooms r ON s.id = r.space_id 
                   LEFT JOIN participants p ON r.id = p.room_id 
                   WHERE s.is_private = 0 OR s.owner_id = ? OR p.user_id = ? 
                   ORDER BY s.created_at DESC`).all(userId, userId);
    } else {
        results = db.prepare(`SELECT * FROM spaces WHERE is_private = 0 ORDER BY created_at DESC`).all();
    }
    return c.json(results);
});

app.get('/api/users/search', async (c: Context) => {
    const query = c.req.query('q') || '';
    const results = db.prepare('SELECT id, username, display_name, avatar_url FROM users WHERE username LIKE ? OR display_name LIKE ? LIMIT 10')
        .all(`%${query}%`, `%${query}%`);
    return c.json(results);
});

app.get('/api/users/list', async (c: Context) => {
    const userId = c.req.header('X-User-ID');
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);

    const spaceId = c.req.query('space_id');
    let results;

    if (spaceId) {
        results = db.prepare(`
            SELECT DISTINCT u.id, u.username, u.display_name, u.avatar_url, u.last_seen, u.is_banned, u.custom_status 
            FROM users u
            JOIN participants p ON u.id = p.user_id
            JOIN rooms r ON p.room_id = r.id
            WHERE r.space_id = ?
            ORDER BY u.last_seen DESC LIMIT 200
        `).all(spaceId);
    } else {
        results = db.prepare(`
            SELECT id, username, display_name, avatar_url, last_seen, is_banned, custom_status 
            FROM users 
            ORDER BY last_seen DESC LIMIT 200
        `).all();
    }
    return c.json(results);
});

app.get('/api/rooms/:spaceId', async (c: Context) => {
    const spaceId = c.req.param('spaceId');
    const results = db.prepare('SELECT * FROM rooms WHERE space_id = ? AND is_private = 0').all(spaceId);
    return c.json(results);
});

app.get('/api/dm/list', async (c: Context) => {
    const userId = c.req.header('X-User-ID');
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);
    const results = db.prepare(`
        SELECT r.*, u.username as other_username, u.display_name as other_display_name, u.avatar_url as other_avatar, u.last_seen
        FROM rooms r
        JOIN participants p ON r.id = p.room_id
        JOIN participants p2 ON r.id = p2.room_id AND p2.user_id != p.user_id
        JOIN users u ON p2.user_id = u.id
        WHERE p.user_id = ? AND r.type = 'dm'
    `).all(userId);
    return c.json(results);
});

app.get('/api/messages/:roomId', async (c: Context) => {
    const roomId = c.req.param('roomId');
    const results = db.prepare(`
        SELECT m.*, u.username, u.display_name, u.avatar_url 
        FROM messages m 
        JOIN users u ON m.user_id = u.id 
        WHERE m.room_id = ? 
        ORDER BY m.created_at ASC LIMIT 100
    `).all(roomId);
    return c.json(results);
});

app.post('/api/auth/register', async (c: Context) => {
    const { username, password } = await c.req.json();
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) return c.json({ error: 'User exists' }, 400);

    const id = uuidv4();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const passwordHash = await hashPassword(password, salt);
    const saltStr = Buffer.from(salt).toString('base64');

    db.prepare('INSERT INTO users (id, username, display_name, password_hash) VALUES (?, ?, ?, ?)')
        .run(id, username, username, `${saltStr}:${passwordHash}`);

    return c.json({ id, username, status: 'registered' });
});

app.post('/api/auth/login', async (c: Context) => {
    const { username, password } = await c.req.json();
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;
    if (!user || !user.password_hash) return c.json({ error: 'Invalid credentials' }, 401);

    const [saltStr, hash] = user.password_hash.split(':');
    const salt = Buffer.from(saltStr, 'base64');
    const calculatedHash = await hashPassword(password, new Uint8Array(salt));

    if (calculatedHash !== hash) return c.json({ error: 'Invalid credentials' }, 401);
    if (user.is_banned) return c.json({ error: 'This account has been banned' }, 403);

    updateLastSeen(user.id);
    const { password_hash, ...safeUser } = user;
    return c.json(safeUser);
});

app.post('/api/messages/send', async (c: Context) => {
    const { room_id, user_id, content, reply_to_id } = await c.req.json();
    const id = uuidv4();
    db.prepare('INSERT INTO messages (id, room_id, user_id, content, reply_to_id) VALUES (?, ?, ?, ?, ?)')
        .run(id, room_id, user_id, content, reply_to_id || null);

    updateLastSeen(user_id);
    return c.json({ id, status: 'sent' });
});

app.post('/api/voice/call', async (c: Context) => {
    const { room_id } = await c.req.json();
    const userId = c.req.header('X-User-ID');

    const existingCall = db.prepare('SELECT id FROM calls WHERE room_id = ? AND status = \'active\' ORDER BY created_at DESC LIMIT 1')
        .get(room_id) as any;

    if (existingCall) {
        return c.json({ id: existingCall.id, status: 'joined' });
    }

    if (userId) {
        db.prepare('UPDATE calls SET status = \'ended\' WHERE caller_id = ? AND status = \'active\'')
            .run(userId);
    }

    const id = uuidv4();
    db.prepare('INSERT INTO calls (id, room_id, caller_id) VALUES (?, ?, ?)')
        .run(id, room_id, userId);
    return c.json({ id, status: 'initiated' });
});

app.post('/api/voice/signal', async (c: Context) => {
    const { call_id, type, payload } = await c.req.json();
    const userId = c.req.header('X-User-ID');
    db.prepare('INSERT INTO call_signals (call_id, sender_id, type, payload) VALUES (?, ?, ?, ?)')
        .run(call_id, userId, type, JSON.stringify(payload));
    return c.json({ status: 'sent' });
});

app.post('/api/voice/poll', async (c: Context) => {
    const { call_id, last_signal_id } = await c.req.json();
    const userId = c.req.header('X-User-ID');
    const results = db.prepare('SELECT * FROM call_signals WHERE call_id = ? AND id > ? AND sender_id != ? ORDER BY id ASC')
        .all(call_id, last_signal_id || 0, userId);
    return c.json(results);
});

app.post('/api/voice/end', async (c: Context) => {
    const userId = c.req.header('X-User-ID');
    if (userId) {
        db.prepare('UPDATE calls SET status = \'ended\' WHERE caller_id = ? AND status = \'active\'')
            .run(userId);
    }
    return c.json({ status: 'ended' });
});

// Start the server
const port = 3000;
console.log(`Server is running on http://localhost:${port}`);

serve({
    fetch: app.fetch,
    port
});
