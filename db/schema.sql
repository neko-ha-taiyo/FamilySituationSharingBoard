-- Family Board Database Schema
-- SQLite database for tracking family member status and history

-- members テーブル: 現在の状態を保持（既存JSONデータと同等）
CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  activity TEXT,
  state TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- status_history テーブル: 全ての状態変更履歴を記録
CREATE TABLE IF NOT EXISTS status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL,
  activity TEXT,
  state TEXT,
  changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

-- パフォーマンス最適化用インデックス
CREATE INDEX IF NOT EXISTS idx_history_member_time ON status_history(member_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_date ON status_history(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_members_name ON members(name);
