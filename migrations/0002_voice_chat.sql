-- Voice Calls (SFU-ready)
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
