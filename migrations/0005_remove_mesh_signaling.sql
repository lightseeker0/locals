-- Remove legacy mesh signaling storage after SFU-only migration
DROP INDEX IF EXISTS idx_call_signals_call_id_id;
DROP INDEX IF EXISTS idx_call_signals_created_at;
DROP TABLE IF EXISTS call_signals;
