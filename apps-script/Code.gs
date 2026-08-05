/**
 * ホタル共振アプリ用 Google Apps Script
 *
 * 使い方:
 * 1. 新しい Google スプレッドシートを作成
 * 2. 拡張機能 → Apps Script を開き、このファイルの内容を貼り付け
 * 3. デプロイ → 新しいデプロイ → 種類: ウェブアプリ
 *    - 実行ユーザー: 自分
 *    - アクセスできるユーザー: 全員
 * 4. 発行された URL を js/config.js の APPS_SCRIPT_URL に設定
 *
 * シート構成:
 * - Sessions … セッション一覧（開始/終了）
 * - （セッション名と同名のシート）… そのセッションのタップ記録
 */

var SESSIONS_SHEET = 'Sessions';
var RESERVED_SHEET_NAMES = { Sessions: true };
var ACTIVE_CACHE_KEY = 'activeSessionV2';
var ACTIVE_CACHE_TTL_SEC = 21600; // 6 hours

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  var params = {};
  if (e && e.postData && e.postData.contents) {
    try {
      params = JSON.parse(e.postData.contents);
    } catch (err) {
      params = (e && e.parameter) || {};
    }
  } else if (e && e.parameter) {
    params = e.parameter;
  }

  var callback = params.callback || '';
  try {
    var action = params.action || '';
    var result;

    switch (action) {
      case 'startSession':
        result = startSession_(params.sessionName);
        break;
      case 'endSession':
        result = endSession_(params.sessionName);
        break;
      case 'getActiveSession':
        result = getActiveSession_();
        break;
      case 'logTap':
        result = logTap_(params.sessionName, params.studentId, params.timestamp);
        break;
      case 'ping':
        result = { ok: true, message: 'ok' };
        break;
      default:
        result = { ok: false, error: 'Unknown action: ' + action };
    }

    return jsonResponse_(result, callback);
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err) }, callback);
  }
}

function sanitizeCallback_(name) {
  name = String(name || '');
  // JSONP 用。任意コード実行を避けるため英数字と _ のみ許可
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return '';
  return name;
}

function jsonResponse_(obj, callback) {
  var cb = sanitizeCallback_(callback);
  var body = JSON.stringify(obj);
  if (cb) {
    return ContentService
      .createTextOutput(cb + '(' + body + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(body)
    .setMimeType(ContentService.MimeType.JSON);
}

function getSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getCache_() {
  return CacheService.getScriptCache();
}

function setActiveCache_(sessionName, startedAt) {
  getCache_().put(
    ACTIVE_CACHE_KEY,
    JSON.stringify({
      active: true,
      sessionName: sessionName,
      startedAt: startedAt,
      updatedAt: new Date().toISOString()
    }),
    ACTIVE_CACHE_TTL_SEC
  );
}

function setInactiveCache_() {
  // remove だと「キャッシュなし→シート再読込」になり、終了直後や競合で古い active を拾い直すことがある
  getCache_().put(
    ACTIVE_CACHE_KEY,
    JSON.stringify({
      active: false,
      sessionName: null,
      startedAt: null,
      updatedAt: new Date().toISOString()
    }),
    ACTIVE_CACHE_TTL_SEC
  );
}

function readActiveCache_() {
  var raw = getCache_().get(ACTIVE_CACHE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

function withSheetLock_(fn) {
  var lock = LockService.getScriptLock();
  var got = lock.tryLock(2000);
  if (!got) {
    throw new Error('Spreadsheet is busy. Retry shortly.');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function ensureSessionsSheet_() {
  var ss = getSpreadsheet_();
  var sessions = ss.getSheetByName(SESSIONS_SHEET);
  if (!sessions) {
    sessions = ss.insertSheet(SESSIONS_SHEET);
    sessions.appendRow(['sessionName', 'status', 'startedAt', 'endedAt']);
  }
  return sessions;
}

/**
 * スプレッドシートのタブ名として使える形に整える
 * 禁止文字: \ / ? * [ ]
 */
function sanitizeSheetName_(sessionName) {
  var name = String(sessionName || '').trim();
  name = name.replace(/[\\\/\?\*\[\]]/g, '_');
  if (name.length > 100) {
    name = name.substring(0, 100);
  }
  if (!name || RESERVED_SHEET_NAMES[name]) {
    name = 'session_' + name;
  }
  return name;
}

function ensureTapSheet_(sessionName) {
  var ss = getSpreadsheet_();
  var sheetName = sanitizeSheetName_(sessionName);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(['studentId', 'timestamp', 'recordedAt']);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(['studentId', 'timestamp', 'recordedAt']);
  }
  return { sheet: sheet, sheetName: sheetName };
}

function startSession_(sessionName) {
  sessionName = String(sessionName || '').trim();
  if (!sessionName) {
    return { ok: false, error: 'sessionName is required' };
  }

  var now = new Date().toISOString();

  // シート書き込みより先にキャッシュ更新（生徒がすぐ状態を取れる／開始がタイムアウトしにくくなる）
  setActiveCache_(sessionName, now);

  var sheetWarning = null;
  try {
    withSheetLock_(function () {
      var sessions = ensureSessionsSheet_();
      // タブ作成は初回タップ時に行う（開始を速くする）

      var data = sessions.getDataRange().getValues();

      for (var i = 1; i < data.length; i++) {
        if (data[i][1] === 'active') {
          sessions.getRange(i + 1, 2).setValue('ended');
          if (!data[i][3]) {
            sessions.getRange(i + 1, 4).setValue(now);
          }
        }
      }

      var reused = false;
      for (var j = 1; j < data.length; j++) {
        if (String(data[j][0]) === sessionName) {
          sessions.getRange(j + 1, 2).setValue('active');
          sessions.getRange(j + 1, 3).setValue(now);
          sessions.getRange(j + 1, 4).setValue('');
          reused = true;
          break;
        }
      }

      if (!reused) {
        sessions.appendRow([sessionName, 'active', now, '']);
      }
    });
  } catch (err) {
    sheetWarning = String(err);
  }

  return {
    ok: true,
    sessionName: sessionName,
    sheetName: sanitizeSheetName_(sessionName),
    status: 'active',
    startedAt: now,
    warning: sheetWarning
  };
}

function endSession_(sessionName) {
  sessionName = String(sessionName || '').trim();
  var now = new Date().toISOString();

  // 先に inactive を書いて、終了後の「まだ記録中」を防ぐ
  setInactiveCache_();

  var ended = null;
  var sheetWarning = null;
  try {
    withSheetLock_(function () {
      var sessions = ensureSessionsSheet_();
      var data = sessions.getDataRange().getValues();

      for (var i = 1; i < data.length; i++) {
        var name = String(data[i][0]);
        var status = data[i][1];
        if (status !== 'active') continue;
        if (sessionName && name !== sessionName) continue;

        sessions.getRange(i + 1, 2).setValue('ended');
        sessions.getRange(i + 1, 4).setValue(now);
        ended = name;
      }
    });
  } catch (err) {
    sheetWarning = String(err);
  }

  if (!ended && !sheetWarning) {
    return { ok: false, error: 'No active session to end' };
  }
  return {
    ok: true,
    sessionName: ended || sessionName || null,
    status: 'ended',
    endedAt: now,
    warning: sheetWarning
  };
}

function getActiveSession_() {
  var cached = readActiveCache_();

  // 明示的に inactive ならシートを見ない（終了済みセッションの復活を防ぐ）
  if (cached && cached.active === false) {
    return {
      ok: true,
      active: false,
      sessionName: null,
      source: 'cache'
    };
  }

  if (cached && cached.active === true && cached.sessionName) {
    return {
      ok: true,
      active: true,
      sessionName: String(cached.sessionName),
      startedAt: cached.startedAt || null,
      source: 'cache'
    };
  }

  // キャッシュが空（旧形式含む）のときだけシートを確認
  var fromSheet = null;
  try {
    fromSheet = withSheetLock_(function () {
      var ss = getSpreadsheet_();
      var sessions = ss.getSheetByName(SESSIONS_SHEET);
      if (!sessions) {
        setInactiveCache_();
        return { ok: true, active: false, sessionName: null, source: 'sheet' };
      }
      var data = sessions.getDataRange().getValues();
      for (var i = data.length - 1; i >= 1; i--) {
        if (data[i][1] === 'active') {
          var name = String(data[i][0]);
          var startedAt = data[i][2] ? new Date(data[i][2]).toISOString() : null;
          setActiveCache_(name, startedAt);
          return {
            ok: true,
            active: true,
            sessionName: name,
            startedAt: startedAt,
            source: 'sheet'
          };
        }
      }
      setInactiveCache_();
      return { ok: true, active: false, sessionName: null, source: 'sheet' };
    });
  } catch (err) {
    return {
      ok: true,
      active: false,
      sessionName: null,
      warning: String(err),
      source: 'lock-timeout'
    };
  }

  return fromSheet;
}

function logTap_(sessionName, studentId, timestamp) {
  sessionName = String(sessionName || '').trim();
  studentId = String(studentId || '').trim();
  timestamp = String(timestamp || '').trim();

  if (!sessionName || !studentId || !timestamp) {
    return { ok: false, error: 'sessionName, studentId, timestamp are required' };
  }

  var cached = readActiveCache_();
  var cacheOk = cached && cached.active === true && cached.sessionName === sessionName;
  if (!cacheOk) {
    var active = getActiveSession_();
    if (!active.active || active.sessionName !== sessionName) {
      return { ok: false, error: 'Session is not active', skipped: true };
    }
  }

  var recordedAt = new Date().toISOString();
  var sheetName = sanitizeSheetName_(sessionName);

  withSheetLock_(function () {
    var tap = ensureTapSheet_(sessionName);
    sheetName = tap.sheetName;
    tap.sheet.appendRow([studentId, timestamp, recordedAt]);
  });

  return {
    ok: true,
    sessionName: sessionName,
    sheetName: sheetName,
    studentId: studentId,
    timestamp: timestamp
  };
}
