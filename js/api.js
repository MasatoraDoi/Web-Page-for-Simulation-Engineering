(function (global) {
  'use strict';

  // fetch だと Apps Script の 302 リダイレクトでスマホ等がタイムアウトしやすい。
  // script タグによる JSONP の方が安定する。
  var REQUEST_TIMEOUT_MS = 20000;
  var cbSeq = 0;

  function getUrl() {
    var url = (global.APP_CONFIG && global.APP_CONFIG.APPS_SCRIPT_URL) || '';
    return String(url).trim();
  }

  function isConfigured() {
    return getUrl().length > 0;
  }

  function request(payload) {
    var base = getUrl();
    if (!base) {
      return Promise.resolve({ ok: false, error: 'APPS_SCRIPT_URL が未設定です' });
    }

    return new Promise(function (resolve) {
      cbSeq += 1;
      var cbName = '_fireflyCb' + Date.now() + '_' + cbSeq;
      var params = new URLSearchParams();
      Object.keys(payload || {}).forEach(function (key) {
        var value = payload[key];
        if (value == null) return;
        params.set(key, String(value));
      });
      params.set('callback', cbName);
      params.set('_ts', String(Date.now()));

      var url = base + (base.indexOf('?') >= 0 ? '&' : '?') + params.toString();
      var script = document.createElement('script');
      var settled = false;
      var timer = setTimeout(function () {
        cleanup();
        resolve({
          ok: false,
          error:
            'Apps Script が応答しません（タイムアウト）。しばらくしてから再読み込みしてください。',
          transient: true,
        });
      }, REQUEST_TIMEOUT_MS);

      function cleanup() {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          delete global[cbName];
        } catch (err) {
          global[cbName] = undefined;
        }
        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }
      }

      global[cbName] = function (data) {
        cleanup();
        if (data && typeof data === 'object') {
          resolve(data);
        } else {
          resolve({ ok: false, error: 'Invalid JSONP response', transient: true });
        }
      };

      script.onerror = function () {
        cleanup();
        resolve({
          ok: false,
          error: '通信に失敗しました。ネットワーク状態を確認して再試行してください。',
          transient: true,
        });
      };

      script.async = true;
      script.src = url;
      document.head.appendChild(script);
    });
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
