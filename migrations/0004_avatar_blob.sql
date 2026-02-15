-- Convert avatar_url from TEXT to BLOB for better large data handling
-- This migration handles the schema change for improved avatar storage

-- For SQLite, we need to recreate the table since we can't directly alter column types
-- Create temporary table with updated schema
CREATE TABLE IF NOT EXISTS users_new (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    display_name TEXT,
    avatar_url BLOB,
    bio TEXT,
    custom_status TEXT,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_banned BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Copy data from old table to new table
INSERT INTO users_new 
SELECT id, username, password_hash, display_name, avatar_url, bio, custom_status, last_seen, is_banned, created_at 
FROM users;

-- Drop old table
DROP TABLE users;

-- Rename new table
ALTER TABLE users_new RENAME TO users;

-- Recreate any indexes if needed
