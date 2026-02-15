import { Hono, Context, Next } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { cors } from 'hono/cors';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'node:path';
import * as fs from 'node:fs';
import crypto from 'node:crypto';

const app = new Hono();
const dbPath = path.join(process.cwd(), 'data', 'locals.db');

// Ensure data directory exists
if (!fs.existsSync(path.dirname(dbPath))) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

const db = new Database(dbPath, { verbose: (sql) => console.log(`[SQL] ${sql}`) });

// Initialize database schema if not exists
const possibleSchemaPaths = [
    path.join(process.cwd(), 'schema.sql'),
    path.join(process.cwd(), '..', 'schema.sql'),
    '/app/schema.sql',
    '/app/server/schema.sql',
    '/app_root/schema.sql'
];

let schemaPath = '';
for (const p of possibleSchemaPaths) {
    console.log(`[DEBUG] Checking for schema at: ${p}`);
    if (fs.existsSync(p)) {
        schemaPath = p;
        break;
    }
}

if (!schemaPath) {
    console.error('[ERROR] Could not find schema.sql in any of the following locations:', possibleSchemaPaths);
    process.exit(1);
}

console.log(`[INFO] Using schema from: ${schemaPath}`);
const schema = fs.readFileSync(schemaPath, 'utf8');
db.exec(schema);

// Migration: Add session_token if it doesn't exist
try {
    const tableInfo = db.prepare("PRAGMA table_info(users)").all() as any[];
    const hasSessionToken = tableInfo.some(col => col.name === 'session_token');
    if (!hasSessionToken) {
        console.log('[MIGRATION] Adding session_token column to users table...');
        db.exec("ALTER TABLE users ADD COLUMN session_token TEXT;");
    }
} catch (err) {
    console.error('[MIGRATION ERROR]', err);
}

// Migration: Add space_id to participants if it doesn't exist
try {
    const tableInfo = db.prepare("PRAGMA table_info(participants)").all() as any[];
    const hasSpaceId = tableInfo.some(col => col.name === 'space_id');
    if (!hasSpaceId) {
        console.log('[MIGRATION] Adding space_id column to participants table...');
        db.exec("ALTER TABLE participants ADD COLUMN space_id TEXT REFERENCES spaces(id);");
    }
} catch (err) {
    console.error('[MIGRATION ERROR] Participants space_id:', err);
}

// Performance Indexes
try {
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_messages_room_id_created ON messages(room_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_rooms_space_id ON rooms(space_id);
        CREATE INDEX IF NOT EXISTS idx_participants_user_id ON participants(user_id);
        CREATE INDEX IF NOT EXISTS idx_call_participants_call_id ON call_participants(call_id);
        CREATE INDEX IF NOT EXISTS idx_call_signals_call_id_id ON call_signals(call_id, id);
        CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen);
    `);

    // Cleanup: Drop notification table if exists since it's no longer used
    db.exec("DROP TABLE IF EXISTS notifications;");
    console.log('[DB] Indexes applied and cleanup complete.');
} catch (err) {
    console.error('[DB ERROR] Failed to apply indexes:', err);
}

app.use('*', cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-User-ID'],
    exposeHeaders: ['Content-Type'],
}));

app.onError((err, c) => {
    console.error(`[HONO ERROR] ${c.req.method} ${c.req.path}:`, err);
    return c.json({ error: 'Internal Server Error', message: err.message }, 500);
});

// Serve static files from the 'dist' folder
const distPath = fs.existsSync(path.join(process.cwd(), '..', 'dist'))
    ? path.join(process.cwd(), '..', 'dist')
    : path.join(process.cwd(), 'dist');

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
    try {
        const encoder = new TextEncoder();
        const passwordKey = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            { name: 'PBKDF2' },
            false,
            ['deriveBits']
        );

        const derivedBits = await crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt: salt as any,
                iterations: 100000,
                hash: 'SHA-256'
            },
            passwordKey,
            256
        );

        return Buffer.from(derivedBits).toString('base64');
    } catch (err) {
        console.error('[HASH] Error hashing password:', err);
        throw err;
    }
};

// Utility to sanitize HTML and prevent XSS
const sanitize = (text: string) => {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

const isAdmin = (userId: string) => {
    if (!userId) return false;
    const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as any;
    if (!user) return false;
    const adminUsernames = ['ds4d', 'Asuna', 'asuna'];
    return adminUsernames.includes(user.username.toLowerCase());
};

const lastSeenCache = new Map<string, number>();
const updateLastSeen = (userId: string) => {
    if (!userId) return;
    const now = Date.now();
    const lastUpdate = lastSeenCache.get(userId) || 0;

    // Only update DB if more than 5 seconds passed since last update for this user
    if (now - lastUpdate > 5000) {
        try {
            db.prepare('UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = ?').run(userId);
            lastSeenCache.set(userId, now);
        } catch (err) {
            console.error(`[DB] Failed to update lastSeen for ${userId}:`, err);
        }
    }
};

// Middleware to update last seen and validate session
app.use('/api/*', async (c: Context, next: Next) => {
    const userId = c.req.header('X-User-ID');
    const authHeader = c.req.header('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

    // Public routes that don't need token validation
    const publicRoutes = ['/api/auth/login', '/api/auth/register'];
    const isPublic = publicRoutes.some(route => c.req.path === route);

    if (userId && !isPublic) {
        // Validate token if userId is provided
        const user = db.prepare('SELECT session_token FROM users WHERE id = ?').get(userId) as any;

        if (!user) {
            console.warn(`[AUTH] User ${userId} not found in database.`);
            return c.json({ error: 'Unauthorized', message: 'User not found.' }, 401);
        }

        if (!user.session_token || user.session_token !== token) {
            console.warn(`[AUTH] Unauthorized attempt for user ${userId}. Token mismatch. Provided: ${token ? token.slice(0, 8) + '...' : 'NONE'}, Stored: ${user.session_token ? user.session_token.slice(0, 8) + '...' : 'NONE'}`);
            return c.json({ error: 'Unauthorized', message: 'Invalid or missing session token. Please re-login.' }, 401);
        }
    }

    if (userId) updateLastSeen(userId);
    await next();
});

// Global Error Handler
app.onError((err, c) => {
    console.error(`[CRITICAL ERROR] ${c.req.method} ${c.req.path}:`, err);
    return c.json({
        error: 'Internal Server Error',
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    }, 500);
});

// --- API Routes (Replicating [[path]].ts) ---

app.get('/api/spaces', async (c: Context) => {
    try {
        const userId = c.req.header('X-User-ID');
        let results;
        if (userId) {
            results = db.prepare(`
                SELECT DISTINCT s.*,
                    (SELECT COUNT(*) FROM messages m 
                     JOIN rooms r2 ON m.room_id = r2.id 
                     LEFT JOIN read_receipts rr ON rr.room_id = r2.id AND rr.user_id = ?
                     WHERE r2.space_id = s.id AND m.user_id != ? AND (rr.updated_at IS NULL OR m.created_at > rr.updated_at)
                    ) as unread_count,
                    0 as mention_count
                FROM spaces s 
                LEFT JOIN rooms r ON s.id = r.space_id 
                LEFT JOIN participants p ON r.id = p.room_id 
                WHERE s.is_private = 0 OR s.owner_id = ? OR p.user_id = ? 
                ORDER BY s.created_at DESC
            `).all(userId, userId, userId, userId);
        } else {
            results = db.prepare(`SELECT *, 0 as unread_count, 0 as mention_count FROM spaces WHERE is_private = 0 ORDER BY created_at DESC`).all();
        }
        return c.json(results);
    } catch (err) {
        console.error('[SPACES] Error fetching spaces:', err);
        throw err;
    }
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
    try {
        const spaceId = c.req.param('spaceId');
        const userId = c.req.header('X-User-ID');

        let results;
        if (userId) {
            results = db.prepare(`
                SELECT r.*,
                    (SELECT COUNT(*) FROM messages m 
                     LEFT JOIN read_receipts rr ON rr.room_id = r.id AND rr.user_id = ?
                     WHERE m.room_id = r.id AND m.user_id != ? AND (rr.updated_at IS NULL OR m.created_at > rr.updated_at)
                    ) as unread_count,
                    0 as mention_count
                FROM rooms r 
                WHERE r.space_id = ? AND r.is_private = 0
            `).all(userId, userId, spaceId);
        } else {
            results = db.prepare('SELECT *, 0 as unread_count, 0 as mention_count FROM rooms WHERE space_id = ? AND is_private = 0').all(spaceId);
        }
        return c.json(results);
    } catch (err) {
        console.error('[ROOMS] Error fetching rooms:', err);
        throw err;
    }
});

app.post('/api/spaces/delete/:spaceId', async (c: Context) => {
    const spaceId = c.req.param('spaceId');
    const userId = c.req.header('X-User-ID');
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);

    const spaceOrder = db.prepare('SELECT owner_id FROM spaces WHERE id = ?').get(spaceId) as any;
    if (!spaceOrder) return c.json({ error: 'Space not found' }, 404);

    if (spaceOrder.owner_id !== userId && !isAdmin(userId)) {
        return c.json({ error: 'Forbidden', message: 'Only owner or site admin can delete a space' }, 403);
    }

    try {
        const deleteTx = db.transaction(() => {
            // Delete rooms first (messages and participants will cascade if defined, otherwise cleanup manually)
            const rooms = db.prepare('SELECT id FROM rooms WHERE space_id = ?').all(spaceId) as any[];
            for (const room of rooms) {
                db.prepare('DELETE FROM messages WHERE room_id = ?').run(room.id);
                db.prepare('DELETE FROM participants WHERE room_id = ?').run(room.id);
                db.prepare('DELETE FROM read_receipts WHERE room_id = ?').run(room.id);
                db.prepare('DELETE FROM rooms WHERE id = ?').run(room.id);
            }
            db.prepare('DELETE FROM participants WHERE space_id = ?').run(spaceId); // Global space participants if any
            db.prepare('DELETE FROM spaces WHERE id = ?').run(spaceId);
        });

        deleteTx();
        console.log(`[SPACES] Space deleted: ${spaceId} by ${userId}`);
        return c.json({ status: 'deleted' });
    } catch (err: any) {
        console.error('[SPACES] Delete error:', err);
        return c.json({ error: 'Failed to delete space', message: err.message }, 500);
    }
});

app.get('/api/auth/me', async (c: Context) => {
    const userId = c.req.header('X-User-ID');
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);

    const user = db.prepare('SELECT id, username, display_name, avatar_url, last_seen, is_banned, custom_status FROM users WHERE id = ?').get(userId);
    if (!user) return c.json({ error: 'User not found' }, 404);

    return c.json(user);
});

app.get('/api/dm/list', async (c: Context) => {
    try {
        const userId = c.req.header('X-User-ID');
        if (!userId) return c.json({ error: 'Unauthorized' }, 401);
        const results = db.prepare(`
            SELECT r.*, u.username as other_username, u.display_name as other_display_name, u.avatar_url as other_avatar, u.last_seen,
                (SELECT COUNT(*) FROM messages m 
                 LEFT JOIN read_receipts rr ON rr.room_id = r.id AND rr.user_id = ?
                 WHERE m.room_id = r.id AND m.user_id != ? AND (rr.updated_at IS NULL OR m.created_at > rr.updated_at)
                ) as unread_count,
                0 as mention_count
            FROM rooms r
            JOIN participants p ON r.id = p.room_id
            JOIN participants p2 ON r.id = p2.room_id AND p2.user_id != p.user_id
            JOIN users u ON p2.user_id = u.id
            WHERE p.user_id = ? AND r.type = 'dm'
        `).all(userId, userId, userId);
        return c.json(results);
    } catch (err) {
        console.error('[DM] Error fetching DM list:', err);
        throw err;
    }
});

app.post('/api/user/profile', async (c: Context) => {
    const userId = c.req.header('X-User-ID');
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);

    try {
        const { display_name, avatar_url, bio, custom_status } = await c.req.json();

        db.prepare(`
            UPDATE users 
            SET display_name = COALESCE(?, display_name), 
                avatar_url = COALESCE(?, avatar_url), 
                bio = COALESCE(?, bio),
                custom_status = COALESCE(?, custom_status) 
            WHERE id = ?
        `).run(display_name, avatar_url, bio, custom_status, userId);

        console.log(`[USER] Profile updated for: ${userId}`);
        return c.json({ status: 'updated' });
    } catch (err: any) {
        console.error(`[USER] Profile update error:`, err);
        return c.json({ error: 'Failed to update profile', details: err.message }, 500);
    }
});

// --- Themes ---
app.get('/api/themes', async (c: Context) => {
    const userId = c.req.header('X-User-ID');
    if (!userId) return c.json([]);
    const themes = db.prepare('SELECT * FROM user_themes WHERE user_id = ?').all(userId);
    return c.json(themes);
});

app.post('/api/themes', async (c: Context) => {
    const userId = c.req.header('X-User-ID');
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);
    const { id, name, css_content, is_url, is_active } = await c.req.json();
    const themeId = id || uuidv4();

    db.prepare(`
        INSERT INTO user_themes (id, user_id, name, css_content, is_url, is_active)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            css_content = excluded.css_content,
            is_url = excluded.is_url,
            is_active = excluded.is_active
    `).run(themeId, userId, name, css_content, is_url ? 1 : 0, is_active ? 1 : 0);

    return c.json({ id: themeId, status: 'saved' });
});

app.post('/api/themes/delete', async (c: Context) => {
    const { id } = await c.req.json();
    db.prepare('DELETE FROM user_themes WHERE id = ?').run(id);
    return c.json({ status: 'deleted' });
});

// --- Reactions ---
app.get('/api/reactions/:messageId', async (c: Context) => {
    const messageId = c.req.param('messageId');
    const results = db.prepare(`
        SELECT r.*, u.username, u.display_name
        FROM reactions r
        JOIN users u ON r.user_id = u.id
        WHERE r.message_id = ?
    `).all(messageId);
    return c.json(results);
});

app.post('/api/reactions', async (c: Context) => {
    const { message_id, user_id, emoji } = await c.req.json();
    const existing = db.prepare('SELECT id FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?')
        .get(message_id, user_id, emoji) as any;

    if (existing) {
        db.prepare('DELETE FROM reactions WHERE id = ?').run(existing.id);
        return c.json({ status: 'removed' });
    } else {
        const id = uuidv4();
        db.prepare('INSERT INTO reactions (id, message_id, user_id, emoji) VALUES (?, ?, ?, ?)')
            .run(id, message_id, user_id, emoji);
        return c.json({ id, status: 'added' });
    }
});


// --- Read Receipts ---
app.post('/api/read-receipts', async (c: Context) => {
    const { room_id, user_id, message_id } = await c.req.json();
    db.prepare(`
        INSERT INTO read_receipts (room_id, user_id, last_read_message_id, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(room_id, user_id) DO UPDATE SET
            last_read_message_id = excluded.last_read_message_id,
            updated_at = CURRENT_TIMESTAMP
    `).run(room_id, user_id, message_id);
    return c.json({ status: 'updated' });
});

// --- Typing (In-memory for simplicity) ---
const typingState = new Map<string, Set<string>>(); // roomId -> Set of userIds

app.post('/api/typing', async (c: Context) => {
    const { room_id, user_id, is_typing } = await c.req.json();
    if (!typingState.has(room_id)) typingState.set(room_id, new Set());

    if (is_typing) {
        typingState.get(room_id)!.add(user_id);
        // Auto-remove after 5 seconds
        setTimeout(() => {
            typingState.get(room_id)?.delete(user_id);
        }, 5000);
    } else {
        typingState.get(room_id)!.delete(user_id);
    }
    return c.json({ status: 'ok' });
});

app.get('/api/typing', async (c: Context) => {
    const roomId = c.req.query('room_id');
    if (!roomId || !typingState.has(roomId)) return c.json([]);

    const userIds = Array.from(typingState.get(roomId)!);
    if (userIds.length === 0) return c.json([]);

    const users = db.prepare(`SELECT id, username, display_name FROM users WHERE id IN (${userIds.map(() => '?').join(',')})`).all(...userIds);
    return c.json(users);
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
    try {
        const { username, password } = await c.req.json();
        console.log(`[AUTH] Registering user: ${username}`);

        const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
        if (existing) {
            console.log(`[AUTH] Registration failed: User ${username} already exists`);
            return c.json({ error: 'User exists' }, 400);
        }

        const id = uuidv4();
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const passwordHash = await hashPassword(password, new Uint8Array(salt));
        const saltStr = Buffer.from(salt).toString('base64');

        const token = crypto.randomUUID();
        db.prepare('INSERT INTO users (id, username, display_name, password_hash, session_token) VALUES (?, ?, ?, ?, ?)')
            .run(id, username, username, `${saltStr}:${passwordHash}`, token);

        // Auto-join first available space and its rooms
        try {
            const defaultSpace = db.prepare('SELECT id FROM spaces LIMIT 1').get() as any;
            if (defaultSpace) {
                console.log(`[AUTH] Auto-joining user ${username} to space ${defaultSpace.id}`);
                db.prepare('INSERT INTO participants (space_id, user_id, role) VALUES (?, ?, ?)')
                    .run(defaultSpace.id, id, 'member');

                const rooms = db.prepare('SELECT id FROM rooms WHERE space_id = ?').all(defaultSpace.id) as any[];
                for (const room of rooms) {
                    db.prepare('INSERT OR IGNORE INTO participants (room_id, user_id, space_id) VALUES (?, ?, ?)')
                        .run(room.id, id, defaultSpace.id);
                }
            }
        } catch (autoJoinErr) {
            console.error(`[AUTH] Auto-join failed (ignoring):`, autoJoinErr);
        }

        console.log(`[AUTH] User registered successfully: ${username} (${id})`);
        return c.json({ id, username, session_token: token, status: 'registered' });
    } catch (err: any) {
        console.error(`[AUTH] Registration error:`, err);
        return c.json({ error: 'Internal server error', details: err.message }, 500);
    }
});

app.post('/api/auth/login', async (c: Context) => {
    try {
        const { username, password } = await c.req.json();
        console.log(`[AUTH] Login attempt for: ${username}`);

        const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;
        if (!user || !user.password_hash) {
            console.log(`[AUTH] Login failed: User ${username} not found`);
            return c.json({ error: 'Invalid credentials' }, 401);
        }

        const [saltStr, hash] = user.password_hash.split(':');
        const salt = Buffer.from(saltStr, 'base64');
        const calculatedHash = await hashPassword(password, new Uint8Array(salt));

        console.log(`[AUTH] Comparing hashes for ${username}:`);
        console.log(`[AUTH] Stored: ${hash}`);
        console.log(`[AUTH] Calc'd: ${calculatedHash}`);

        if (calculatedHash !== hash) {
            console.log(`[AUTH] Login failed: Incorrect password for ${username}`);
            return c.json({ error: 'Invalid credentials' }, 401);
        }

        if (user.is_banned) {
            console.log(`[AUTH] Login failed: User ${username} is banned`);
            return c.json({ error: 'This account has been banned' }, 403);
        }

        const token = crypto.randomUUID();
        db.prepare('UPDATE users SET session_token = ? WHERE id = ?').run(token, user.id);

        updateLastSeen(user.id);
        const { password_hash, session_token, ...safeUser } = user;
        console.log(`[AUTH] Login successful: ${username}`);
        return c.json({ ...safeUser, session_token: token });
    } catch (err: any) {
        console.error(`[AUTH] Login error:`, err);
        return c.json({ error: 'Internal server error', details: err.message }, 500);
    }
});

app.post('/api/messages/send', async (c: Context) => {
    const { room_id, user_id, content, reply_to_id } = await c.req.json();
    const sanitizedContent = sanitize(content);
    const id = uuidv4();
    db.prepare('INSERT INTO messages (id, room_id, user_id, content, reply_to_id) VALUES (?, ?, ?, ?, ?)')
        .run(id, room_id, user_id, sanitizedContent, reply_to_id || null);

    updateLastSeen(user_id);
    return c.json({ id, status: 'sent', content: sanitizedContent });
});

app.get('/api/voice/participants/:roomId', async (c: Context) => {
    const roomId = c.req.param('roomId');
    const call = db.prepare('SELECT id FROM calls WHERE room_id = ? AND status = \'active\' ORDER BY created_at DESC LIMIT 1').get(roomId) as any;

    if (!call) return c.json([]);

    const participants = db.prepare(`
        SELECT u.id, u.username, u.display_name, u.avatar_url 
        FROM call_participants cp
        JOIN users u ON cp.user_id = u.id
        WHERE cp.call_id = ?
    `).all(call.id);

    return c.json(participants);
});

app.post('/api/voice/call', async (c: Context) => {
    const { room_id } = await c.req.json();
    const userId = c.req.header('X-User-ID');
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);

    let call = db.prepare('SELECT id FROM calls WHERE room_id = ? AND status = \'active\' ORDER BY created_at DESC LIMIT 1').get(room_id) as any;

    if (!call) {
        const id = uuidv4();
        db.prepare('INSERT INTO calls (id, room_id, caller_id) VALUES (?, ?, ?)')
            .run(id, room_id, userId);
        call = { id };
    }

    // Add user to participants
    db.prepare('INSERT OR IGNORE INTO call_participants (call_id, user_id) VALUES (?, ?)')
        .run(call.id, userId);

    return c.json({ id: call.id, status: 'joined' });
});

app.post('/api/voice/signal', async (c: Context) => {
    const { call_id, type, payload } = await c.req.json();
    const userId = c.req.header('X-User-ID');

    const parsedPayload = typeof payload === 'string' ? JSON.parse(payload) : payload;
    console.log(`[SIGNAL] From: ${userId}, To: ${parsedPayload.to}, Type: ${type}`);

    db.prepare('INSERT INTO call_signals (call_id, sender_id, type, payload) VALUES (?, ?, ?, ?)')
        .run(call_id, userId, type, JSON.stringify(payload));
    return c.json({ status: 'sent' });
});

app.post('/api/voice/poll', async (c: Context) => {
    const { call_id, last_signal_id } = await c.req.json();
    const userId = c.req.header('X-User-ID');
    const results = db.prepare('SELECT * FROM call_signals WHERE call_id = ? AND id > ? AND sender_id != ? ORDER BY id ASC')
        .all(call_id, last_signal_id || 0, userId);

    if (results.length > 0) {
        console.log(`[POLL] User ${userId} found ${results.length} new signals for call ${call_id}`);
    }
    return c.json(results);
});

app.post('/api/voice/end', async (c: Context) => {
    const userId = c.req.header('X-User-ID');
    if (userId) {
        // Remove from participants
        db.prepare('DELETE FROM call_participants WHERE user_id = ?').run(userId);

        // Mark call as ended if no participants left
        const remaining = db.prepare('SELECT COUNT(*) as count FROM call_participants cp JOIN calls c ON cp.call_id = c.id WHERE c.status = \'active\' AND cp.user_id != ?').get(userId) as any;
        if (remaining && remaining.count === 0) {
            db.prepare('UPDATE calls SET status = \'ended\' WHERE status = \'active\'').run();
        }
    }
    return c.json({ status: 'ended' });
});

// --- Zombie Cleanup Task ---
// Runs every 15 seconds to remove participants who aren't polling anymore (tab closed)
setInterval(() => {
    try {
        // Find participants whose last_seen is older than 20 seconds
        const zombies = db.prepare(`
            SELECT cp.user_id, cp.call_id, u.username
            FROM call_participants cp
            JOIN users u ON cp.user_id = u.id
            WHERE u.last_seen < datetime('now', '-45 seconds')
        `).all() as any[];

        if (zombies.length > 0) {
            console.log(`[CLEANUP] Found ${zombies.length} zombie participants.`);

            for (const zombie of zombies) {
                console.log(`[CLEANUP] Removing ${zombie.username} (${zombie.user_id}) from call ${zombie.call_id} (Inactivity)`);
                db.prepare('DELETE FROM call_participants WHERE user_id = ? AND call_id = ?').run(zombie.user_id, zombie.call_id);

                // If no one left, end the call
                const remaining = db.prepare('SELECT COUNT(*) as count FROM call_participants WHERE call_id = ?').get(zombie.call_id) as any;
                if (remaining && remaining.count === 0) {
                    console.log(`[CLEANUP] Ending call ${zombie.call_id} (No active participants)`);
                    db.prepare('UPDATE calls SET status = \'ended\' WHERE id = ?').run(zombie.call_id);
                }
            }
        }
    } catch (err) {
        console.error(`[CLEANUP] Error during voice cleanup:`, err);
    }
}, 15000);

// Start the server
const port = 3000;
console.log(`Server is running on http://localhost:${port}`);

serve({
    fetch: app.fetch,
    port
});
