// API エンドポイント
// ウィンドウのオリジンを使用（自動的に正しいホストとポートを使用）
const API_BASE = window.location.origin;
const API_STATUS = `${API_BASE}/api/status`;
const API_CONFIG = `${API_BASE}/api/config`;
const API_HISTORY = `${API_BASE}/api/history`;

// グローバル変数
let pollingInterval = 5; // デフォルト5秒（フォールバック用）
let pollingTimer = null;
let lastStatusHash = null; // 前回のステータスハッシュ
let notificationPermission = 'default'; // 通知許可状態
let lastErrorTime = 0; // 最後のエラー表示時刻
const ERROR_DISPLAY_INTERVAL = 10000; // エラー表示の最小間隔（ミリ秒）
let timeUpdateInterval = null; // 時刻更新用のインターバル
let currentMembers = []; // 現在表示中のメンバー情報
let currentHistoryItems = []; // 現在表示中の履歴アイテム

// SSE関連の変数
let eventSource = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
const RECONNECT_INTERVAL = 3000; // 3秒後に再接続
const MAX_RECONNECT_ATTEMPTS = 10; // 最大再接続試行回数
let useSSE = true; // SSEを使用するかどうか

// ローカルストレージのキー
const STORAGE_KEYS = {
    POLLING_INTERVAL: 'pollingInterval',
    USER_NAME: 'userName',
    NOTIFICATION_ENABLED: 'notificationEnabled'
};

// DOM要素
const elements = {
    familyStatus: document.getElementById('familyStatus'),
    userName: document.getElementById('userName'),
    activityButtons: document.querySelectorAll('.activity-btn'),
    stateButtons: document.querySelectorAll('.state-btn'),
    settingsBtn: document.getElementById('settingsBtn'),
    mainView: document.getElementById('mainView'),
    historyView: document.getElementById('historyView'),
    settingsView: document.getElementById('settingsView'),
    cancelSettingsBtn: document.getElementById('cancelSettings'),
    currentTab: document.getElementById('currentTab'),
    historyTab: document.getElementById('historyTab'),
    historyList: document.getElementById('historyList'),
    historyMemberFilter: document.getElementById('historyMemberFilter'),
    historyDateFilter: document.getElementById('historyDateFilter'),
    loadMoreHistory: document.getElementById('loadMoreHistory')
};

// 現在の選択状態
const currentSelection = {
    activity: null,
    state: null
};

// 履歴表示の状態
const historyState = {
    currentMember: '',
    currentDateFilter: 'today',
    offset: 0,
    limit: 50,
    hasMore: false,
    isLoading: false
};

// 初期化
function init() {
    loadSettings();
    loadUserName();
    initializeNotifications();
    setupEventListeners();

    // SSEがサポートされているかチェック
    if (typeof EventSource !== 'undefined' && useSSE) {
        connectSSE();
    } else {
        console.warn('EventSource not supported, using polling fallback');
        fetchStatus();
        startPolling();
    }

    // 時刻のリアルタイム更新を開始（1分ごと）
    startTimeUpdateInterval();
}

// 設定の読み込み
function loadSettings() {
    const savedInterval = localStorage.getItem(STORAGE_KEYS.POLLING_INTERVAL);
    if (savedInterval) {
        pollingInterval = parseInt(savedInterval, 10);
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

// 通知機能の初期化
function initializeNotifications() {
    // ブラウザが通知をサポートしているかチェック
    if (!('Notification' in window)) {
        console.log('このブラウザは通知をサポートしていません');
        return;
    }

    // 現在の通知許可状態を確認
    notificationPermission = Notification.permission;

    // 許可がまだ得られていない場合、ユーザーに許可を求める
    if (notificationPermission === 'default') {
        requestNotificationPermission();
    }
}

// 通知許可のリクエスト
function requestNotificationPermission() {
    Notification.requestPermission().then(permission => {
        notificationPermission = permission;
        if (permission === 'granted') {
            console.log('通知が有効になりました');
            localStorage.setItem(STORAGE_KEYS.NOTIFICATION_ENABLED, 'true');
        }
    });
}

// プッシュ通知を送信
function sendNotification(title, options = {}) {
    if (!('Notification' in window)) {
        return;
    }

    if (notificationPermission !== 'granted') {
        return;
    }

    try {
        new Notification(title, {
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="50" y="70" font-size="70" text-anchor="middle" dominant-baseline="central">👨‍👩‍👧‍👦</text></svg>',
            badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="%23667eea"/></svg>',
            ...options
        });
    } catch (error) {
        console.error('通知送信エラー:', error);
    }
}

// ステータスのハッシュを計算
function calculateStatusHash(members) {
    // JSON.stringify で簡単にシリアライズ（日本語対応）
    return JSON.stringify(members.map(m => ({
        name: m.name,
        activity: m.activity,
        state: m.state
    })));
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
    elements.cancelSettingsBtn.addEventListener('click', hideSettings);

    // タブ切り替え
    elements.currentTab.addEventListener('click', showCurrentView);
    elements.historyTab.addEventListener('click', showHistoryView);

    // 履歴フィルター
    elements.historyMemberFilter.addEventListener('change', onHistoryFilterChange);
    elements.historyDateFilter.addEventListener('change', onHistoryFilterChange);

    // さらに読み込むボタン
    elements.loadMoreHistory.addEventListener('click', loadMoreHistory);
}

// SSE接続の確立
function connectSSE() {
    // 既存の接続があれば閉じる
    if (eventSource) {
        eventSource.close();
    }

    const API_STREAM = `${API_BASE}/api/status/stream`;
    eventSource = new EventSource(API_STREAM);

    // メッセージ受信時の処理
    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);

            // ステータス変更の検知
            const currentHash = calculateStatusHash(data.members);
            if (lastStatusHash !== null && lastStatusHash !== currentHash) {
                notifyStatusChange(data.members);
            }
            lastStatusHash = currentHash;

            // 表示の更新
            displayStatus(data.members);
        } catch (error) {
            console.error('SSE: Error parsing data:', error);
        }
    };

    // 接続開始時
    eventSource.onopen = () => {
        reconnectAttempts = 0; // 再接続カウンタをリセット

        // 再接続タイマーをクリア
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }

        // エラーがクリアされた
        lastErrorTime = 0;
    };

    // エラー発生時
    eventSource.onerror = (error) => {
        console.error('SSE: Connection error');
        eventSource.close();

        reconnectAttempts++;

        // 自動再接続
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            const delay = Math.min(RECONNECT_INTERVAL * reconnectAttempts, 30000);

            if (!reconnectTimer) {
                reconnectTimer = setTimeout(() => {
                    reconnectTimer = null;
                    connectSSE();
                }, delay);
            }
        } else {
            // フォールバック: ポーリングに切り替え
            console.warn('SSE: Max reconnect attempts reached, falling back to polling');
            useSSE = false;
            fetchStatus();
            startPolling();

            // エラーメッセージを表示
            const now = Date.now();
            if (now - lastErrorTime > ERROR_DISPLAY_INTERVAL) {
                showError('リアルタイム接続に失敗しました。ポーリングモードに切り替えました。');
                lastErrorTime = now;
            }
        }
    };
}

// SSE接続を閉じる
function closeSSE() {
    if (eventSource) {
        eventSource.close();
        eventSource = null;
    }
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
}

// 状況の取得
async function fetchStatus() {
    try {
        const response = await fetch(API_STATUS);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: Failed to fetch status`);
        }
        const data = await response.json();

        // ステータスが変わったかチェック
        const currentHash = calculateStatusHash(data.members);
        if (lastStatusHash !== null && lastStatusHash !== currentHash) {
            // ステータスが変わった場合、通知を送信
            notifyStatusChange(data.members);
        }
        lastStatusHash = currentHash;

        displayStatus(data.members);

        // エラーがクリアされた
        lastErrorTime = 0;
    } catch (error) {
        console.error('Error fetching status:', error);

        // エラーを表示する際の最小間隔をチェック
        const now = Date.now();
        if (now - lastErrorTime > ERROR_DISPLAY_INTERVAL) {
            showError(`状況の取得に失敗しました: ${error.message}`);
            lastErrorTime = now;
        }
    }
}

// ステータス変更を検知して通知
function notifyStatusChange(members) {
    // 最新の更新を取得
    if (!members || members.length === 0) {
        return;
    }

    // 最新の更新者を取得
    const latestMember = members.reduce((latest, current) => {
        return new Date(current.timestamp) > new Date(latest.timestamp) ? current : latest;
    });

    // 通知メッセージを構築
    let message = latestMember.name;
    const updates = [];

    if (latestMember.activity) {
        updates.push(`活動: ${latestMember.activity}`);
    }
    if (latestMember.state) {
        updates.push(`状態: ${latestMember.state}`);
    }

    const body = updates.length > 0 ? updates.join(' / ') : '状況を更新しました';

    // 通知を送信
    sendNotification(`${message}の状況が更新されました`, {
        body: body,
        tag: 'status-update',
        requireInteraction: false
    });
}

// 状況の表示
function displayStatus(members) {
    if (!members || members.length === 0) {
        elements.familyStatus.innerHTML = '<div class="empty-status">まだ誰も状況を更新していません</div>';
        currentMembers = [];
        return;
    }

    // 更新時刻でソート（新しい順）
    const sortedMembers = [...members].sort((a, b) => {
        return new Date(b.timestamp) - new Date(a.timestamp);
    });

    // 現在のメンバー情報を保存
    currentMembers = sortedMembers;

    elements.familyStatus.innerHTML = sortedMembers.map(member => {
        const time = formatTime(member.timestamp);
        const activityDisplay = member.activity ? `<div class="member-activity"><span class="member-activity-label">活動:</span>${escapeHtml(member.activity)}</div>` : '';
        const stateDisplay = member.state ? `<div class="member-state"><span class="member-state-label">状態:</span>${escapeHtml(member.state)}</div>` : '';

        return `
            <div class="member-card" data-timestamp="${member.timestamp}">
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
        showError('名前を選択してください');
        return;
    }

    // アクティビティか状態の少なくともどちらかが選択されていれば送信
    if (!currentSelection.activity && !currentSelection.state) {
        // どちらも選択されていない場合は、送信せずにフェッチを実行
        // これにより、他のメンバーの更新を表示できる
        await fetchStatus();
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

// 設定の保存（将来の拡張用に残す）
function saveSettings() {
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
    // コンソールのみに出力（静かな成功）
    console.log('Success:', message);
}

// エラーメッセージの表示
function showError(message) {
    // コンソールに出力（アラートは表示しない）
    console.error('Error:', message);
}

// タブビューの切り替え
function showCurrentView() {
    elements.currentTab.classList.add('active');
    elements.historyTab.classList.remove('active');
    elements.mainView.classList.remove('hidden');
    elements.historyView.classList.add('hidden');
    elements.settingsView.classList.add('hidden');
}

function showHistoryView() {
    elements.currentTab.classList.remove('active');
    elements.historyTab.classList.add('active');
    elements.mainView.classList.add('hidden');
    elements.historyView.classList.remove('hidden');
    elements.settingsView.classList.add('hidden');

    // 履歴をロード
    loadHistory();
}

// 履歴フィルター変更時の処理
function onHistoryFilterChange() {
    historyState.currentMember = elements.historyMemberFilter.value;
    historyState.currentDateFilter = elements.historyDateFilter.value;
    historyState.offset = 0;
    loadHistory();
}

// 履歴のロード
async function loadHistory(append = false) {
    if (historyState.isLoading) return;

    historyState.isLoading = true;

    if (!append) {
        historyState.offset = 0;
        elements.historyList.innerHTML = '<div class="history-empty">読み込み中...</div>';
    }

    try {
        const params = new URLSearchParams({
            limit: historyState.limit,
            offset: historyState.offset
        });

        // 日付フィルター
        const dateRange = getDateRange(historyState.currentDateFilter);
        if (dateRange.from) {
            params.append('from', dateRange.from);
        }
        if (dateRange.to) {
            params.append('to', dateRange.to);
        }

        // メンバーフィルター
        const url = historyState.currentMember
            ? `${API_HISTORY}/${encodeURIComponent(historyState.currentMember)}?${params}`
            : `${API_HISTORY}?${params}`;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('Failed to fetch history');
        }

        const data = await response.json();
        const history = data.history || [];
        const total = data.total || 0;

        // 次のページがあるかチェック
        historyState.hasMore = (historyState.offset + historyState.limit) < total;

        if (append) {
            displayHistory(history, true);
        } else {
            displayHistory(history, false);
        }

        // さらに読み込むボタンの表示/非表示
        if (historyState.hasMore) {
            elements.loadMoreHistory.classList.remove('hidden');
        } else {
            elements.loadMoreHistory.classList.add('hidden');
        }

    } catch (error) {
        console.error('Error fetching history:', error);
        elements.historyList.innerHTML = '<div class="history-empty">履歴の取得に失敗しました</div>';
    } finally {
        historyState.isLoading = false;
    }
}

// さらに履歴を読み込む
async function loadMoreHistory() {
    historyState.offset += historyState.limit;
    await loadHistory(true);
}

// 日付範囲を取得
function getDateRange(filter) {
    const now = new Date();
    const range = { from: null, to: null };

    switch (filter) {
        case 'today':
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            range.from = startOfDay.toISOString();
            break;
        case 'week':
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            range.from = weekAgo.toISOString();
            break;
        case 'month':
            const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            range.from = monthAgo.toISOString();
            break;
        case 'all':
            // 全期間なのでfrom/toを指定しない
            break;
    }

    return range;
}

// 履歴の表示
function displayHistory(history, append = false) {
    if (!history || history.length === 0) {
        if (!append) {
            elements.historyList.innerHTML = '<div class="history-empty">履歴がありません</div>';
            currentHistoryItems = [];
        }
        return;
    }

    // 履歴アイテムを保存（追加の場合は結合）
    if (append) {
        currentHistoryItems = currentHistoryItems.concat(history);
    } else {
        currentHistoryItems = history;
    }

    const historyHtml = history.map(item => {
        const memberName = item.member ? item.member.name : '不明';
        const time = formatHistoryTime(item.changed_at);
        const activity = item.activity ? escapeHtml(item.activity) : '未設定';
        const state = item.state ? escapeHtml(item.state) : '未設定';

        return `
            <div class="history-item" data-timestamp="${item.changed_at}">
                <div class="history-header">
                    <div class="history-member-name">${escapeHtml(memberName)}</div>
                    <div class="history-time">${time}</div>
                </div>
                <div class="history-change">
                    <div class="history-field">
                        <span class="history-field-label">活動:</span>
                        <span class="history-value">${activity}</span>
                    </div>
                    <div class="history-field">
                        <span class="history-field-label">状態:</span>
                        <span class="history-value">${state}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (append) {
        elements.historyList.insertAdjacentHTML('beforeend', historyHtml);
    } else {
        elements.historyList.innerHTML = historyHtml;
    }
}

// 履歴用の時刻フォーマット
function formatHistoryTime(timestamp) {
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
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${year}/${month}/${day} ${hours}:${minutes}`;
    }
}

// 時刻更新のインターバルを開始
function startTimeUpdateInterval() {
    // 既存のインターバルがあればクリア
    if (timeUpdateInterval) {
        clearInterval(timeUpdateInterval);
    }

    // 1分（60秒）ごとに時刻を更新
    timeUpdateInterval = setInterval(() => {
        updateDisplayedTimes();
    }, 60000);
}

// 時刻更新のインターバルを停止
function stopTimeUpdateInterval() {
    if (timeUpdateInterval) {
        clearInterval(timeUpdateInterval);
        timeUpdateInterval = null;
    }
}

// 表示されている時刻を更新
function updateDisplayedTimes() {
    // 現在の状況カードの時刻を更新
    const memberCards = elements.familyStatus.querySelectorAll('.member-card');
    memberCards.forEach(card => {
        const timestamp = card.dataset.timestamp;
        if (timestamp) {
            const timeElement = card.querySelector('.member-time');
            if (timeElement) {
                timeElement.textContent = formatTime(timestamp);
            }
        }
    });

    // 履歴アイテムの時刻を更新
    const historyItems = elements.historyList.querySelectorAll('.history-item');
    historyItems.forEach(item => {
        const timestamp = item.dataset.timestamp;
        if (timestamp) {
            const timeElement = item.querySelector('.history-time');
            if (timeElement) {
                timeElement.textContent = formatHistoryTime(timestamp);
            }
        }
    });
}

// ページ読み込み時に初期化
document.addEventListener('DOMContentLoaded', init);

// ページがアンロードされる前にクリーンアップ
window.addEventListener('beforeunload', () => {
    closeSSE();
    stopPolling();
    stopTimeUpdateInterval();
});
