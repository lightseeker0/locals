-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    display_name TEXT,
    avatar_url BLOB,
    bio TEXT,
    custom_status TEXT,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_banned BOOLEAN DEFAULT 0,
    role TEXT DEFAULT 'member', -- 'admin', 'member'
    session_token TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Spaces (Servers) Table
CREATE TABLE IF NOT EXISTS spaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon_url TEXT,
    owner_id TEXT REFERENCES users(id),
    is_private BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Invitations Table
CREATE TABLE IF NOT EXISTS invitations (
    code TEXT PRIMARY KEY,
    space_id TEXT REFERENCES spaces(id),
    created_by TEXT REFERENCES users(id),
    uses INTEGER DEFAULT 0,
    max_uses INTEGER DEFAULT 0, -- 0 for unlimited
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Rooms (Channels) Table
CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    space_id TEXT REFERENCES spaces(id),
    name TEXT NOT NULL,
    type TEXT DEFAULT 'text', -- 'text', 'voice', 'dm'
    is_private BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Room Participants (For DMs and Private Rooms)
CREATE TABLE IF NOT EXISTS participants (
    room_id TEXT REFERENCES rooms(id),
    user_id TEXT REFERENCES users(id),
    space_id TEXT REFERENCES spaces(id),
    role TEXT DEFAULT 'member', -- 'owner', 'admin', 'member'
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_participants_room_user ON participants(room_id, user_id);
CREATE INDEX IF NOT EXISTS idx_participants_user_id ON participants(user_id);

-- Voice Calls (Signaling)
CREATE TABLE IF NOT EXISTS calls (
    id TEXT PRIMARY KEY,
    room_id TEXT REFERENCES rooms(id),
    caller_id TEXT REFERENCES users(id),
    status TEXT DEFAULT 'active', -- 'active', 'ended'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS call_participants (
    call_id TEXT REFERENCES calls(id),
    user_id TEXT REFERENCES users(id),
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (call_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_calls_room_status_created ON calls(room_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_call_participants_call_id ON call_participants(call_id);

-- User Themes (BetterDiscord Style)
CREATE TABLE IF NOT EXISTS user_themes (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id),
    name TEXT NOT NULL,
    css_content TEXT,
    is_active BOOLEAN DEFAULT 0,
    is_url BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Messages Table
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    room_id TEXT REFERENCES rooms(id),
    user_id TEXT REFERENCES users(id),
    content TEXT NOT NULL,
    reply_to_id TEXT REFERENCES messages(id),
    is_pinned BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_messages_room_id_created ON messages(room_id, created_at);

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    type TEXT DEFAULT 'mention',
    resource_id TEXT,
    is_read BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(actor_id) REFERENCES users(id)
);

-- Message Reactions
CREATE TABLE IF NOT EXISTS reactions (
    id TEXT PRIMARY KEY,
    message_id TEXT REFERENCES messages(id),
    user_id TEXT REFERENCES users(id),
    emoji TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Read Receipts
CREATE TABLE IF NOT EXISTS read_receipts (
    room_id TEXT REFERENCES rooms(id),
    user_id TEXT REFERENCES users(id),
    last_read_message_id TEXT REFERENCES messages(id),
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (room_id, user_id)
);
