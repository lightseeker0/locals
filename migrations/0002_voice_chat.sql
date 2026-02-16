-- Voice Calls (Signaling)
CREATE TABLE IF NOT EXISTS calls (
    id TEXT PRIMARY KEY,
    room_id TEXT REFERENCES rooms(id),
    caller_id TEXT REFERENCES users(id),
    status TEXT DEFAULT 'active', -- 'active', 'ended'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS call_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    call_id TEXT REFERENCES calls(id),
    sender_id TEXT REFERENCES users(id),
    type TEXT NOT NULL, -- 'offer', 'answer', 'candidate', 'end'
    payload TEXT NOT NULL, -- JSON string
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
