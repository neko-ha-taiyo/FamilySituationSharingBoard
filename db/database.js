const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'family-board.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let db = null;

/**
 * データベース初期化
 * DBファイルが存在しない場合は作成し、スキーマを適用
 */
function initDatabase() {
  try {
    // データベース接続
    db = new Database(DB_PATH);

    // WALモードを有効化（同時アクセス性能向上）
    db.pragma('journal_mode = WAL');

    // 外部キー制約を有効化
    db.pragma('foreign_keys = ON');

    // スキーマ読み込みと適用
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    db.exec(schema);

    console.log('Database initialized successfully at:', DB_PATH);
    return db;
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}

/**
 * データベース接続取得
 * @returns {Database} データベースインスタンス
 */
function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * データベース接続を閉じる
 */
function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    console.log('Database connection closed');
  }
}

// ========================================
// Members テーブル操作
// ========================================

/**
 * 全メンバー取得
 * @returns {Array} メンバー一覧
 */
function getAllMembers() {
  const stmt = db.prepare('SELECT * FROM members ORDER BY updated_at DESC');
  return stmt.all();
}

/**
 * 名前でメンバー検索
 * @param {string} name - メンバー名
 * @returns {Object|undefined} メンバー情報
 */
function getMemberByName(name) {
  const stmt = db.prepare('SELECT * FROM members WHERE name = ?');
  return stmt.get(name);
}

/**
 * メンバーIDで検索
 * @param {number} id - メンバーID
 * @returns {Object|undefined} メンバー情報
 */
function getMemberById(id) {
  const stmt = db.prepare('SELECT * FROM members WHERE id = ?');
  return stmt.get(id);
}

/**
 * メンバー追加または更新
 * @param {Object} memberData - メンバーデータ
 * @param {string} memberData.name - メンバー名
 * @param {string} memberData.activity - 活動状態
 * @param {string} memberData.state - 状態
 * @param {string} [memberData.timestamp] - タイムスタンプ（オプション）
 * @returns {Object} 挿入または更新されたメンバー情報（idを含む）
 */
function insertOrUpdateMember(memberData) {
  const { name, activity, state, timestamp } = memberData;

  try {
    // トランザクション開始
    const transaction = db.transaction(() => {
      // 既存メンバーをチェック
      const existing = getMemberByName(name);

      if (existing) {
        // 更新
        const updateStmt = db.prepare(`
          UPDATE members
          SET activity = ?, state = ?, timestamp = ?, updated_at = CURRENT_TIMESTAMP
          WHERE name = ?
        `);
        updateStmt.run(activity, state, timestamp || new Date().toISOString(), name);
        return getMemberByName(name);
      } else {
        // 新規挿入
        const insertStmt = db.prepare(`
          INSERT INTO members (name, activity, state, timestamp, updated_at)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);
        const info = insertStmt.run(name, activity, state, timestamp || new Date().toISOString());
        return getMemberById(info.lastInsertRowid);
      }
    });

    return transaction();
  } catch (error) {
    console.error('Error in insertOrUpdateMember:', error);
    throw error;
  }
}

/**
 * メンバー削除
 * @param {string} name - メンバー名
 * @returns {boolean} 削除成功かどうか
 */
function deleteMember(name) {
  try {
    const stmt = db.prepare('DELETE FROM members WHERE name = ?');
    const info = stmt.run(name);
    return info.changes > 0;
  } catch (error) {
    console.error('Error in deleteMember:', error);
    throw error;
  }
}

// ========================================
// History テーブル操作
// ========================================

/**
 * 履歴追加
 * @param {number} memberId - メンバーID
 * @param {string} activity - 活動状態
 * @param {string} state - 状態
 * @param {string} [changedAt] - 変更日時（オプション、デフォルトは現在時刻）
 * @returns {Object} 挿入された履歴情報
 */
function insertHistory(memberId, activity, state, changedAt = null) {
  try {
    const stmt = db.prepare(`
      INSERT INTO status_history (member_id, activity, state, changed_at)
      VALUES (?, ?, ?, ?)
    `);
    const info = stmt.run(
      memberId,
      activity,
      state,
      changedAt || new Date().toISOString()
    );

    return {
      id: info.lastInsertRowid,
      member_id: memberId,
      activity,
      state,
      changed_at: changedAt || new Date().toISOString()
    };
  } catch (error) {
    console.error('Error in insertHistory:', error);
    throw error;
  }
}

/**
 * メンバーIDで履歴取得
 * @param {number} memberId - メンバーID
 * @param {Object} options - オプション
 * @param {string} [options.from] - 開始日時
 * @param {string} [options.to] - 終了日時
 * @param {number} [options.limit=100] - 取得件数上限
 * @param {number} [options.offset=0] - オフセット
 * @returns {Object} 履歴データと件数
 */
function getHistoryByMemberId(memberId, options = {}) {
  const {
    from = null,
    to = null,
    limit = 100,
    offset = 0
  } = options;

  try {
    // WHERE条件構築
    let whereClause = 'WHERE member_id = ?';
    const params = [memberId];

    if (from) {
      whereClause += ' AND changed_at >= ?';
      params.push(from);
    }

    if (to) {
      whereClause += ' AND changed_at <= ?';
      params.push(to);
    }

    // 件数取得
    const countStmt = db.prepare(`SELECT COUNT(*) as total FROM status_history ${whereClause}`);
    const { total } = countStmt.get(...params);

    // データ取得
    const dataStmt = db.prepare(`
      SELECT * FROM status_history
      ${whereClause}
      ORDER BY changed_at DESC
      LIMIT ? OFFSET ?
    `);
    const history = dataStmt.all(...params, limit, offset);

    return { history, total };
  } catch (error) {
    console.error('Error in getHistoryByMemberId:', error);
    throw error;
  }
}

/**
 * 全履歴取得（全メンバー）
 * @param {Object} options - オプション
 * @param {string} [options.from] - 開始日時
 * @param {string} [options.to] - 終了日時
 * @param {number} [options.limit=100] - 取得件数上限
 * @param {number} [options.offset=0] - オフセット
 * @returns {Object} 履歴データと件数（メンバー情報をJOIN）
 */
function getAllHistory(options = {}) {
  const {
    from = null,
    to = null,
    limit = 100,
    offset = 0
  } = options;

  try {
    // WHERE条件構築
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (from) {
      whereClause += ' AND h.changed_at >= ?';
      params.push(from);
    }

    if (to) {
      whereClause += ' AND h.changed_at <= ?';
      params.push(to);
    }

    // 件数取得
    const countStmt = db.prepare(`
      SELECT COUNT(*) as total
      FROM status_history h
      ${whereClause}
    `);
    const { total } = countStmt.get(...params);

    // データ取得（メンバー情報をJOIN）
    const dataStmt = db.prepare(`
      SELECT
        h.id,
        h.member_id,
        h.activity,
        h.state,
        h.changed_at,
        m.name as member_name
      FROM status_history h
      INNER JOIN members m ON h.member_id = m.id
      ${whereClause}
      ORDER BY h.changed_at DESC
      LIMIT ? OFFSET ?
    `);
    const history = dataStmt.all(...params, limit, offset);

    return { history, total };
  } catch (error) {
    console.error('Error in getAllHistory:', error);
    throw error;
  }
}

// ========================================
// データ移行
// ========================================

/**
 * JSONファイルからSQLiteへデータ移行
 * @param {string} jsonFilePath - JSONファイルパス
 * @returns {Object} 移行結果
 */
function migrateFromJSON(jsonFilePath) {
  try {
    // JSONファイル読み込み
    if (!fs.existsSync(jsonFilePath)) {
      console.log('No JSON file found for migration');
      return { migrated: 0, skipped: 0 };
    }

    const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
    const members = jsonData.members || [];

    let migrated = 0;
    let skipped = 0;

    // トランザクションで一括処理
    const transaction = db.transaction(() => {
      members.forEach(member => {
        const { name, activity, state, timestamp } = member;

        // 既存チェック
        const existing = getMemberByName(name);

        if (!existing) {
          // 新規のみ移行
          const result = insertOrUpdateMember({ name, activity, state, timestamp });

          // 初期履歴も追加
          insertHistory(result.id, activity, state, timestamp);

          migrated++;
        } else {
          skipped++;
        }
      });
    });

    transaction();

    console.log(`Migration completed: ${migrated} migrated, ${skipped} skipped`);
    return { migrated, skipped };
  } catch (error) {
    console.error('Error in migrateFromJSON:', error);
    throw error;
  }
}

// ========================================
// エクスポート
// ========================================

module.exports = {
  initDatabase,
  getDatabase,
  closeDatabase,

  // Members操作
  getAllMembers,
  getMemberByName,
  getMemberById,
  insertOrUpdateMember,
  deleteMember,

  // History操作
  insertHistory,
  getHistoryByMemberId,
  getAllHistory,

  // Migration
  migrateFromJSON
};
