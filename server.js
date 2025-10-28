const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const db = require('./db/database');

const app = express();
const PORT = config.PORT;
const DATA_FILE = path.join(__dirname, 'family-status.json');

// SSE接続を管理する配列
const sseClients = [];

// ミドルウェア
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// データファイルの初期化
function initDataFile() {
    if (!fs.existsSync(DATA_FILE)) {
        const initialData = {
            members: []
        };
        fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
    }
}

// データの読み込み
function readData() {
    try {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading data:', error);
        return { members: [] };
    }
}

// データの書き込み
function writeData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('Error writing data:', error);
        return false;
    }
}

// SSEクライアントにデータをブロードキャスト
function broadcastToClients(data) {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    let disconnectedClients = [];

    sseClients.forEach((client, index) => {
        try {
            if (!client.res.writableEnded) {
                client.res.write(message);
            } else {
                disconnectedClients.push(index);
            }
        } catch (error) {
            console.error('Error sending SSE message:', error);
            disconnectedClients.push(index);
        }
    });

    // 切断されたクライアントを削除
    disconnectedClients.reverse().forEach(index => {
        sseClients.splice(index, 1);
    });

    if (disconnectedClients.length > 0) {
        console.log(`Removed ${disconnectedClients.length} disconnected clients. Active: ${sseClients.length}`);
    }
}

// API: 設定を取得
app.get('/api/config', (req, res) => {
    res.json({
        port: PORT
    });
});

// API: 全メンバーの状況を取得
app.get('/api/status', (req, res) => {
    try {
        const members = db.getAllMembers();
        res.json({ members });
    } catch (error) {
        console.error('Error fetching status from DB:', error);
        // フォールバック: JSONファイルから読み込み
        const data = readData();
        res.json(data);
    }
});

// API: SSEストリームエンドポイント
app.get('/api/status/stream', (req, res) => {
    // SSEヘッダーの設定（nginx/openrestyのバッファリングを無効化）
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Accel-Buffering', 'no'); // nginxのバッファリングを無効化

    // ステータスコードを明示的に設定
    res.status(200);

    // 即座にヘッダーを送信
    res.flushHeaders();

    // 接続直後に現在の状態を送信
    try {
        const members = db.getAllMembers();
        res.write(`data: ${JSON.stringify({ members })}\n\n`);
    } catch (error) {
        console.error('Error fetching status for SSE:', error);
        const data = readData();
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    }

    // クライアントを接続リストに追加
    const clientId = Date.now() + Math.random();
    const client = { id: clientId, res };
    sseClients.push(client);

    console.log(`SSE Client ${clientId.toFixed(3)} connected. Active clients: ${sseClients.length}`);

    // クライアント切断時の処理
    req.on('close', () => {
        const index = sseClients.findIndex(c => c.id === clientId);
        if (index !== -1) {
            sseClients.splice(index, 1);
        }
        console.log(`SSE Client ${clientId.toFixed(3)} disconnected. Active clients: ${sseClients.length}`);
    });
});

// API: メンバーの状況を更新
app.post('/api/status', (req, res) => {
    const { name, activity, state } = req.body;

    if (!name) {
        return res.status(400).json({ error: '名前が必要です' });
    }

    try {
        const timestamp = new Date().toISOString();

        // メンバー情報を更新または追加
        const member = db.insertOrUpdateMember({
            name,
            activity: activity || '',
            state: state || '',
            timestamp
        });

        // 履歴に記録
        db.insertHistory(member.id, activity || '', state || '', timestamp);

        // JSONファイルにも書き込み（後方互換性のため）
        const data = readData();
        const memberIndex = data.members.findIndex(m => m.name === name);

        if (memberIndex >= 0) {
            data.members[memberIndex] = {
                name,
                activity: activity || data.members[memberIndex].activity || '',
                state: state || data.members[memberIndex].state || '',
                timestamp
            };
        } else {
            data.members.push({
                name,
                activity: activity || '',
                state: state || '',
                timestamp
            });
        }
        writeData(data);

        // 全メンバーを取得してレスポンス
        const allMembers = db.getAllMembers();
        res.json({ success: true, data: allMembers });
    } catch (error) {
        console.error('Error updating status:', error);

        // フォールバック: JSONファイルのみで処理
        const data = readData();
        const memberIndex = data.members.findIndex(m => m.name === name);
        const timestamp = new Date().toISOString();

        if (memberIndex >= 0) {
            data.members[memberIndex] = {
                name,
                activity: activity || data.members[memberIndex].activity || '',
                state: state || data.members[memberIndex].state || '',
                timestamp
            };
        } else {
            data.members.push({
                name,
                activity: activity || '',
                state: state || '',
                timestamp
            });
        }

        if (writeData(data)) {
            res.json({ success: true, data: data.members });
        } else {
            res.status(500).json({ error: 'データの保存に失敗しました' });
        }
    }
});

// API: 特定メンバーの状況を削除
app.delete('/api/status/:name', (req, res) => {
    const { name } = req.params;

    try {
        // データベースから削除（履歴もCASCADEで削除される）
        const deleted = db.deleteMember(name);

        if (!deleted) {
            return res.status(404).json({ error: 'メンバーが見つかりません' });
        }

        // JSONファイルからも削除（後方互換性のため）
        const data = readData();
        data.members = data.members.filter(m => m.name !== name);
        writeData(data);

        const allMembers = db.getAllMembers();
        res.json({ success: true, data: allMembers });
    } catch (error) {
        console.error('Error deleting member:', error);

        // フォールバック: JSONファイルのみで処理
        const data = readData();
        data.members = data.members.filter(m => m.name !== name);

        if (writeData(data)) {
            res.json({ success: true, data: data.members });
        } else {
            res.status(500).json({ error: 'データの削除に失敗しました' });
        }
    }
});

// API: 全履歴取得
app.get('/api/history', (req, res) => {
    try {
        const { from, to, limit = 100, offset = 0 } = req.query;

        // パラメータバリデーション
        const parsedLimit = Math.min(parseInt(limit, 10) || 100, 1000);
        const parsedOffset = parseInt(offset, 10) || 0;

        if (parsedLimit > 1000) {
            return res.status(400).json({ error: 'Limit exceeds maximum (1000)' });
        }

        const options = {
            from: from || null,
            to: to || null,
            limit: parsedLimit,
            offset: parsedOffset
        };

        const { history, total } = db.getAllHistory(options);

        res.json({
            history: history.map(h => ({
                id: h.id,
                member: {
                    id: h.member_id,
                    name: h.member_name
                },
                activity: h.activity,
                state: h.state,
                changed_at: h.changed_at
            })),
            total,
            limit: parsedLimit,
            offset: parsedOffset
        });
    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({ error: '履歴の取得に失敗しました' });
    }
});

// API: メンバー別履歴取得
app.get('/api/history/:name', (req, res) => {
    try {
        const { name } = req.params;
        const { from, to, limit = 100, offset = 0 } = req.query;

        // メンバーの存在確認
        const member = db.getMemberByName(name);
        if (!member) {
            return res.status(404).json({ error: 'メンバーが見つかりません' });
        }

        // パラメータバリデーション
        const parsedLimit = Math.min(parseInt(limit, 10) || 100, 1000);
        const parsedOffset = parseInt(offset, 10) || 0;

        if (parsedLimit > 1000) {
            return res.status(400).json({ error: 'Limit exceeds maximum (1000)' });
        }

        const options = {
            from: from || null,
            to: to || null,
            limit: parsedLimit,
            offset: parsedOffset
        };

        const { history, total } = db.getHistoryByMemberId(member.id, options);

        res.json({
            member: {
                id: member.id,
                name: member.name
            },
            history: history.map(h => ({
                id: h.id,
                activity: h.activity,
                state: h.state,
                changed_at: h.changed_at
            })),
            total,
            limit: parsedLimit,
            offset: parsedOffset
        });
    } catch (error) {
        console.error('Error fetching member history:', error);
        res.status(500).json({ error: '履歴の取得に失敗しました' });
    }
});

// ファイル変更を監視してSSEクライアントにブロードキャスト
let watchTimeout = null;
fs.watch(DATA_FILE, (eventType) => {
    // 短時間の複数回の変更を1回にまとめる（デバウンス）
    if (watchTimeout) {
        clearTimeout(watchTimeout);
    }
    watchTimeout = setTimeout(() => {
        try {
            const members = db.getAllMembers();
            broadcastToClients({ members });
        } catch (error) {
            console.error('Error broadcasting from DB:', error);
            const data = readData();
            broadcastToClients(data);
        }
        console.log(`File changed (${eventType}), broadcasted to ${sseClients.length} clients`);
    }, 100);
});

// Keep-Alive: 定期的にハートビートを送信（接続維持）
setInterval(() => {
    if (sseClients.length > 0) {
        sseClients.forEach(client => {
            try {
                if (!client.res.writableEnded) {
                    client.res.write(':heartbeat\n\n');
                }
            } catch (error) {
                // 書き込みエラーは無視（次のクリーンアップで削除される）
            }
        });
    }
}, 30000); // 30秒ごと

// サーバー起動
initDataFile();

// データベース初期化とマイグレーション
try {
    db.initDatabase();
    console.log('Database initialized successfully');

    // 既存JSONデータからの移行
    const migrationResult = db.migrateFromJSON(DATA_FILE);
    console.log(`Data migration completed: ${migrationResult.migrated} migrated, ${migrationResult.skipped} skipped`);
} catch (error) {
    console.error('Database initialization failed:', error);
    console.log('Server will continue with JSON-only mode');
}

app.listen(PORT, () => {
    console.log(`サーバーが起動しました: http://localhost:${PORT}`);
    console.log(`SSE endpoint: http://localhost:${PORT}/api/status/stream`);
    console.log(`History endpoint: http://localhost:${PORT}/api/history`);
});
