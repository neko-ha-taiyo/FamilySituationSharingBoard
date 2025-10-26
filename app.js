// API エンドポイント
const API_BASE = window.location.origin;
const API_STATUS = `${API_BASE}/api/status`;

// グローバル変数
let pollingInterval = 5; // デフォルト5秒
let pollingTimer = null;

// ローカルストレージのキー
const STORAGE_KEYS = {
    POLLING_INTERVAL: 'pollingInterval',
    USER_NAME: 'userName'
};

// DOM要素
const elements = {
    familyStatus: document.getElementById('familyStatus'),
    userName: document.getElementById('userName'),
    activityButtons: document.querySelectorAll('.activity-btn'),
    stateButtons: document.querySelectorAll('.state-btn'),
    settingsBtn: document.getElementById('settingsBtn'),
    mainView: document.getElementById('mainView'),
    settingsView: document.getElementById('settingsView'),
    pollingIntervalInput: document.getElementById('pollingInterval'),
    saveSettingsBtn: document.getElementById('saveSettings'),
    cancelSettingsBtn: document.getElementById('cancelSettings')
};

// 現在の選択状態
const currentSelection = {
    activity: null,
    state: null
};

// 初期化
function init() {
    loadSettings();
    loadUserName();
    setupEventListeners();
    fetchStatus();
    startPolling();
}

// 設定の読み込み
function loadSettings() {
    const savedInterval = localStorage.getItem(STORAGE_KEYS.POLLING_INTERVAL);
    if (savedInterval) {
        pollingInterval = parseInt(savedInterval, 10);
        elements.pollingIntervalInput.value = pollingInterval;
    }
}

// ユーザー名の読み込み
function loadUserName() {
    const savedUserName = localStorage.getItem(STORAGE_KEYS.USER_NAME);
    if (savedUserName) {
        elements.userName.value = savedUserName;
    }
}

// ユーザー名の保存
function saveUserName() {
    const userName = elements.userName.value;
    if (userName) {
        localStorage.setItem(STORAGE_KEYS.USER_NAME, userName);
    }
}

// イベントリスナーの設定
function setupEventListeners() {
    // アクティビティボタンのクリック
    elements.activityButtons.forEach(button => {
        button.addEventListener('click', () => {
            const activity = button.dataset.activity;
            selectActivity(button, activity);
        });
    });

    // 状態ボタンのクリック
    elements.stateButtons.forEach(button => {
        button.addEventListener('click', () => {
            const state = button.dataset.state;
            selectState(button, state);
        });
    });

    // ユーザー名の変更
    elements.userName.addEventListener('change', saveUserName);

    // 設定ボタン
    elements.settingsBtn.addEventListener('click', showSettings);
    elements.saveSettingsBtn.addEventListener('click', saveSettings);
    elements.cancelSettingsBtn.addEventListener('click', hideSettings);
}

// 状況の取得
async function fetchStatus() {
    try {
        const response = await fetch(API_STATUS);
        if (!response.ok) {
            throw new Error('Failed to fetch status');
        }
        const data = await response.json();
        displayStatus(data.members);
    } catch (error) {
        console.error('Error fetching status:', error);
        showError('状況の取得に失敗しました');
    }
}

// 状況の表示
function displayStatus(members) {
    if (!members || members.length === 0) {
        elements.familyStatus.innerHTML = '<div class="empty-status">まだ誰も状況を更新していません</div>';
        return;
    }

    // 更新時刻でソート（新しい順）
    const sortedMembers = [...members].sort((a, b) => {
        return new Date(b.timestamp) - new Date(a.timestamp);
    });

    elements.familyStatus.innerHTML = sortedMembers.map(member => {
        const time = formatTime(member.timestamp);
        const activityDisplay = member.activity ? `<div class="member-activity"><span class="member-activity-label">活動:</span>${escapeHtml(member.activity)}</div>` : '';
        const stateDisplay = member.state ? `<div class="member-state"><span class="member-state-label">状態:</span>${escapeHtml(member.state)}</div>` : '';

        return `
            <div class="member-card">
                <div class="member-info">
                    <div class="member-name">${escapeHtml(member.name)}</div>
                    ${activityDisplay}
                    ${stateDisplay}
                    <div class="member-time">${time}</div>
                </div>
            </div>
        `;
    }).join('');
}

// アクティビティの選択
function selectActivity(button, activity) {
    // 前の選択を解除
    elements.activityButtons.forEach(btn => btn.classList.remove('active'));

    // 新しい選択をハイライト
    button.classList.add('active');
    currentSelection.activity = activity;

    // 自動的に状況を更新
    submitStatus();
}

// 状態の選択
function selectState(button, state) {
    // 前の選択を解除
    elements.stateButtons.forEach(btn => btn.classList.remove('active'));

    // 新しい選択をハイライト
    button.classList.add('active');
    currentSelection.state = state;

    // 自動的に状況を更新
    submitStatus();
}

// 状況の送信
async function submitStatus() {
    const userName = elements.userName.value;

    if (!userName) {
        alert('名前を選択してください');
        return;
    }

    if (!currentSelection.activity && !currentSelection.state) {
        return;
    }

    try {
        const response = await fetch(API_STATUS, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: userName,
                activity: currentSelection.activity,
                state: currentSelection.state
            })
        });

        if (!response.ok) {
            throw new Error('Failed to update status');
        }

        const data = await response.json();
        displayStatus(data.data);
    } catch (error) {
        console.error('Error updating status:', error);
        showError('状況の更新に失敗しました');
    }
}

// ポーリングの開始
function startPolling() {
    stopPolling();
    pollingTimer = setInterval(() => {
        fetchStatus();
    }, pollingInterval * 1000);
}

// ポーリングの停止
function stopPolling() {
    if (pollingTimer) {
        clearInterval(pollingTimer);
        pollingTimer = null;
    }
}

// 設定画面の表示
function showSettings() {
    elements.mainView.classList.add('hidden');
    elements.settingsView.classList.remove('hidden');
}

// 設定画面の非表示
function hideSettings() {
    elements.settingsView.classList.add('hidden');
    elements.mainView.classList.remove('hidden');
}

// 設定の保存
function saveSettings() {
    const newInterval = parseInt(elements.pollingIntervalInput.value, 10);

    if (isNaN(newInterval) || newInterval < 1 || newInterval > 300) {
        alert('更新間隔は1〜300秒の範囲で設定してください');
        return;
    }

    pollingInterval = newInterval;
    localStorage.setItem(STORAGE_KEYS.POLLING_INTERVAL, pollingInterval);

    // ポーリングを再起動
    startPolling();

    showSuccess('設定を保存しました');
    hideSettings();
}

// 時刻のフォーマット
function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) {
        return 'たった今';
    } else if (diffMins < 60) {
        return `${diffMins}分前`;
    } else if (diffHours < 24) {
        return `${diffHours}時間前`;
    } else {
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${month}/${day} ${hours}:${minutes}`;
    }
}

// HTMLエスケープ
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 成功メッセージの表示
function showSuccess(message) {
    // シンプルな実装: アラートを使用
    // より洗練された実装としてトースト通知を追加することも可能
    console.log('Success:', message);
}

// エラーメッセージの表示
function showError(message) {
    console.error('Error:', message);
    alert(message);
}

// ページ読み込み時に初期化
document.addEventListener('DOMContentLoaded', init);

// ページがアンロードされる前にポーリングを停止
window.addEventListener('beforeunload', stopPolling);
