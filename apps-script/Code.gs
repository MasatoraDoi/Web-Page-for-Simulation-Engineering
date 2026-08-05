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

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  try {
    var params = {};
    if (e && e.postData && e.postData.contents) {
      params = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      params = e.parameter;
    }

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

    return jsonResponse_(result);
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err) });
  }
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
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

  var sessions = ensureSessionsSheet_();
  ensureTapSheet_(sessionName);

  var data = sessions.getDataRange().getValues();
  var now = new Date().toISOString();

  // 既存の active をすべて終了
  for (var i = 1; i < data.length; i++) {
    if (data[i][1] === 'active') {
      sessions.getRange(i + 1, 2).setValue('ended');
      if (!data[i][3]) {
        sessions.getRange(i + 1, 4).setValue(now);
      }
    }
  }

  // 同名セッションがあれば再利用して active に戻す
  for (var j = 1; j < data.length; j++) {
    if (String(data[j][0]) === sessionName) {
      sessions.getRange(j + 1, 2).setValue('active');
      sessions.getRange(j + 1, 3).setValue(now);
      sessions.getRange(j + 1, 4).setValue('');
      return {
        ok: true,
        sessionName: sessionName,
        sheetName: sanitizeSheetName_(sessionName),
        status: 'active',
        startedAt: now
      };
    }
  }

  sessions.appendRow([sessionName, 'active', now, '']);
  return {
    ok: true,
    sessionName: sessionName,
    sheetName: sanitizeSheetName_(sessionName),
    status: 'active',
    startedAt: now
  };
}

function endSession_(sessionName) {
  sessionName = String(sessionName || '').trim();
  var sessions = ensureSessionsSheet_();
  var data = sessions.getDataRange().getValues();
  var now = new Date().toISOString();
  var ended = null;

  for (var i = 1; i < data.length; i++) {
    var name = String(data[i][0]);
    var status = data[i][1];
    if (status !== 'active') continue;
    if (sessionName && name !== sessionName) continue;

    sessions.getRange(i + 1, 2).setValue('ended');
    sessions.getRange(i + 1, 4).setValue(now);
    ended = name;
  }

  if (!ended) {
    return { ok: false, error: 'No active session to end' };
  }
  return { ok: true, sessionName: ended, status: 'ended', endedAt: now };
}

function getActiveSession_() {
  var sessions = ensureSessionsSheet_();
  var data = sessions.getDataRange().getValues();

  for (var i = data.length - 1; i >= 1; i--) {
    if (data[i][1] === 'active') {
      return {
        ok: true,
        active: true,
        sessionName: String(data[i][0]),
        startedAt: data[i][2] ? new Date(data[i][2]).toISOString() : null
      };
    }
  }
  return { ok: true, active: false, sessionName: null };
}

function logTap_(sessionName, studentId, timestamp) {
  sessionName = String(sessionName || '').trim();
  studentId = String(studentId || '').trim();
  timestamp = String(timestamp || '').trim();

  if (!sessionName || !studentId || !timestamp) {
    return { ok: false, error: 'sessionName, studentId, timestamp are required' };
  }

  var active = getActiveSession_();
  if (!active.active || active.sessionName !== sessionName) {
    return { ok: false, error: 'Session is not active', skipped: true };
  }

  var tap = ensureTapSheet_(sessionName);
  var recordedAt = new Date().toISOString();
  tap.sheet.appendRow([studentId, timestamp, recordedAt]);
  return {
    ok: true,
    sessionName: sessionName,
    sheetName: tap.sheetName,
    studentId: studentId,
    timestamp: timestamp
  };
}
