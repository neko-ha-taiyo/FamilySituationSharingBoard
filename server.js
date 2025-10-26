const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'family-status.json');

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

// API: 全メンバーの状況を取得
app.get('/api/status', (req, res) => {
    const data = readData();
    res.json(data);
});

// API: メンバーの状況を更新
app.post('/api/status', (req, res) => {
    const { name, activity, state } = req.body;

    if (!name) {
        return res.status(400).json({ error: '名前が必要です' });
    }

    const data = readData();
    const memberIndex = data.members.findIndex(m => m.name === name);

    const timestamp = new Date().toISOString();

    if (memberIndex >= 0) {
        // 既存メンバーの更新
        data.members[memberIndex] = {
            name,
            activity: activity || data.members[memberIndex].activity || '',
            state: state || data.members[memberIndex].state || '',
            timestamp
        };
    } else {
        // 新規メンバーの追加
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
});

// API: 特定メンバーの状況を削除
app.delete('/api/status/:name', (req, res) => {
    const { name } = req.params;
    const data = readData();

    data.members = data.members.filter(m => m.name !== name);

    if (writeData(data)) {
        res.json({ success: true, data: data.members });
    } else {
        res.status(500).json({ error: 'データの削除に失敗しました' });
    }
});

// サーバー起動
initDataFile();
app.listen(PORT, () => {
    console.log(`サーバーが起動しました: http://localhost:${PORT}`);
});
