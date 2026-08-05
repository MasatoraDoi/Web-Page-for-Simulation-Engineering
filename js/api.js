(function (global) {
  'use strict';

  // Apps Script は 302 → googleusercontent のリダイレクトがあり、環境によって遅い
  var REQUEST_TIMEOUT_MS = 25000;

  function getUrl() {
    var url = (global.APP_CONFIG && global.APP_CONFIG.APPS_SCRIPT_URL) || '';
    return String(url).trim();
  }

  function isConfigured() {
    return getUrl().length > 0;
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  async function fetchAppsScript(url, signal) {
    // まず manual で Location を取り、本体 URL を直接叩く（follow のハング回避）
    var first = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      cache: 'no-store',
      signal: signal,
    });

    var target = null;
    if (first.status >= 300 && first.status < 400) {
      target = first.headers.get('Location');
    }

    if (target) {
      var second = await fetch(target, {
        method: 'GET',
        redirect: 'follow',
        cache: 'no-store',
        signal: signal,
      });
      return second.text();
    }

    // Location が読めない／リダイレクトなしの場合は従来どおり
    if (first.type === 'opaqueredirect' || first.status === 0) {
      var followed = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        cache: 'no-store',
        signal: signal,
      });
      return followed.text();
    }

    return first.text();
  }

  async function fetchOnce(url) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = null;
    if (controller) {
      timer = setTimeout(function () {
        controller.abort();
      }, REQUEST_TIMEOUT_MS);
    }

    try {
      var text = await fetchAppsScript(url, controller ? controller.signal : undefined);
      return { ok: true, text: text };
    } catch (err) {
      return { ok: false, err: err };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function request(payload) {
    var base = getUrl();
    if (!base) {
      return { ok: false, error: 'APPS_SCRIPT_URL が未設定です' };
    }

    var params = new URLSearchParams();
    Object.keys(payload || {}).forEach(function (key) {
      var value = payload[key];
      if (value == null) return;
      params.set(key, String(value));
    });
    params.set('_ts', String(Date.now()));

    var url = base + (base.indexOf('?') >= 0 ? '&' : '?') + params.toString();

    var attempt = await fetchOnce(url);
    if (!attempt.ok) {
      if (attempt.err && attempt.err.name === 'AbortError') {
        return {
          ok: false,
          error:
            'Apps Script が応答しません（タイムアウト）。しばらくしてから再読み込みしてください。',
          transient: true,
        };
      }
      return {
        ok: false,
        error: '通信に失敗しました。ネットワーク状態を確認して再試行してください。',
        transient: true,
      };
    }

    var text = attempt.text;
    if (/^\s*</.test(text)) {
      await sleep(400);
      params.set('_ts', String(Date.now()));
      url = base + (base.indexOf('?') >= 0 ? '&' : '?') + params.toString();
      attempt = await fetchOnce(url);
      if (!attempt.ok) {
        return {
          ok: false,
          error: '通信に失敗しました。ネットワーク状態を確認して再試行してください。',
          transient: true,
        };
      }
      text = attempt.text;
      if (/^\s*</.test(text)) {
        return {
          ok: false,
          error: 'サーバーが一時的に不正な応答を返しました。自動で再試行します。',
          transient: true,
        };
      }
    }

    try {
      return JSON.parse(text);
    } catch (err) {
      return { ok: false, error: 'Invalid JSON response', raw: text.slice(0, 200), transient: true };
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
