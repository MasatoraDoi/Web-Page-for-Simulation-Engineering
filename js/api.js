(function (global) {
  'use strict';

  function getUrl() {
    var url = (global.APP_CONFIG && global.APP_CONFIG.APPS_SCRIPT_URL) || '';
    return String(url).trim();
  }

  function isConfigured() {
    return getUrl().length > 0;
  }

  async function request(payload) {
    var url = getUrl();
    if (!url) {
      return { ok: false, error: 'APPS_SCRIPT_URL が未設定です' };
    }

    var response;
    try {
      // Apps Script はリダイレクトするため text で受け取り JSON を自分でパースする
      response = await fetch(url, {
        method: 'POST',
        // text/plain にすると CORS プリフライトを避けやすい
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'follow',
      });
    } catch (err) {
      return {
        ok: false,
        error:
          '通信に失敗しました（Failed to fetch）。Apps Script の公開設定が「全員」になっていないか、大学アカウント制限の可能性があります。README のトラブルシュートを確認してください。',
      };
    }

    var text = await response.text();
    if (/^\s*</.test(text)) {
      return {
        ok: false,
        error:
          'Apps Script がログイン画面を返しました。ウェブアプリの「アクセスできるユーザー」を「全員」にし、新しいデプロイ版を発行してください。',
      };
    }
    try {
      return JSON.parse(text);
    } catch (err) {
      return { ok: false, error: 'Invalid JSON response', raw: text.slice(0, 200) };
    }
  }

  global.FireflyAPI = {
    isConfigured: isConfigured,
    ping: function () {
      return request({ action: 'ping' });
    },
    startSession: function (sessionName) {
      return request({ action: 'startSession', sessionName: sessionName });
    },
    endSession: function (sessionName) {
      return request({ action: 'endSession', sessionName: sessionName });
    },
    getActiveSession: function () {
      return request({ action: 'getActiveSession' });
    },
    logTap: function (sessionName, studentId, timestamp) {
      return request({
        action: 'logTap',
        sessionName: sessionName,
        studentId: studentId,
        timestamp: timestamp,
      });
    },
  };
})(window);
