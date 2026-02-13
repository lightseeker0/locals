-- Add is_private column to spaces table
ALTER TABLE spaces ADD COLUMN is_private BOOLEAN DEFAULT 0;

-- Create invitations table
CREATE TABLE IF NOT EXISTS invitations (
    code TEXT PRIMARY KEY,
    space_id TEXT REFERENCES spaces(id),
    created_by TEXT REFERENCES users(id),
    uses INTEGER DEFAULT 0,
    max_uses INTEGER DEFAULT 0, -- 0 for unlimited
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
