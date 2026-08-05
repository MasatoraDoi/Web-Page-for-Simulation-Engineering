(function (global) {
  'use strict';

  var db = null;
  var ACTIVE_PATH = 'meta/activeSession';

  function getFirebaseConfig() {
    return (global.APP_CONFIG && global.APP_CONFIG.FIREBASE) || null;
  }

  function isConfigured() {
    var cfg = getFirebaseConfig();
    return !!(cfg && cfg.apiKey && cfg.databaseURL && cfg.projectId);
  }

  function sessionKey(sessionName) {
    return String(sessionName || '')
      .trim()
      .replace(/[.#$\[\]\/]/g, '_');
  }

  function getDb() {
    if (db) return db;
    if (!isConfigured()) return null;
    if (typeof firebase === 'undefined') {
      throw new Error('Firebase SDK が読み込まれていません');
    }
    var cfg = getFirebaseConfig();
    if (!firebase.apps.length) {
      firebase.initializeApp(cfg);
    }
    db = firebase.database();
    return db;
  }

  function notConfigured() {
    return Promise.resolve({
      ok: false,
      error: 'Firebase が未設定です。js/config.js を確認してください。',
    });
  }

  function startSession(sessionName) {
    if (!isConfigured()) return notConfigured();
    sessionName = String(sessionName || '').trim();
    if (!sessionName) {
      return Promise.resolve({ ok: false, error: 'sessionName is required' });
    }

    var database = getDb();
    var now = new Date().toISOString();
    var key = sessionKey(sessionName);

    return database
      .ref(ACTIVE_PATH)
      .set({
        active: true,
        sessionName: sessionName,
        sessionKey: key,
        startedAt: now,
      })
      .then(function () {
        return database.ref('sessions/' + key + '/meta').update({
          sessionName: sessionName,
          status: 'active',
          startedAt: now,
          endedAt: null,
        });
      })
      .then(function () {
        return {
          ok: true,
          sessionName: sessionName,
          status: 'active',
          startedAt: now,
        };
      })
      .catch(function (err) {
        return { ok: false, error: String(err && err.message ? err.message : err) };
      });
  }

  function endSession(sessionName) {
    if (!isConfigured()) return notConfigured();
    var database = getDb();
    var now = new Date().toISOString();
    var name = String(sessionName || '').trim();

    return database
      .ref(ACTIVE_PATH)
      .once('value')
      .then(function (snap) {
        var current = snap.val() || {};
        var targetName = name || current.sessionName;
        if (!targetName) {
          return { ok: false, error: 'No active session to end' };
        }
        var key = sessionKey(targetName);
        return database
          .ref(ACTIVE_PATH)
          .set({
            active: false,
            sessionName: null,
            sessionKey: null,
            startedAt: null,
            endedAt: now,
          })
          .then(function () {
            return database.ref('sessions/' + key + '/meta').update({
              status: 'ended',
              endedAt: now,
            });
          })
          .then(function () {
            return {
              ok: true,
              sessionName: targetName,
              status: 'ended',
              endedAt: now,
            };
          });
      })
      .catch(function (err) {
        return { ok: false, error: String(err && err.message ? err.message : err) };
      });
  }

  function getActiveSession() {
    if (!isConfigured()) return notConfigured();
    var database = getDb();
    return database
      .ref(ACTIVE_PATH)
      .once('value')
      .then(function (snap) {
        var v = snap.val();
        if (v && v.active && v.sessionName) {
          return {
            ok: true,
            active: true,
            sessionName: v.sessionName,
            startedAt: v.startedAt || null,
          };
        }
        return { ok: true, active: false, sessionName: null };
      })
      .catch(function (err) {
        return {
          ok: false,
          error: String(err && err.message ? err.message : err),
          transient: true,
        };
      });
  }

  /**
   * 受付中セッションをリアルタイム購読する。
   * 戻り値: 購読解除関数
   */
  function subscribeActiveSession(onChange) {
    if (!isConfigured()) {
      onChange({
        ok: false,
        error: 'Firebase が未設定です。js/config.js を確認してください。',
      });
      return function () {};
    }

    var database = getDb();
    var ref = database.ref(ACTIVE_PATH);
    var handler = function (snap) {
      var v = snap.val();
      if (v && v.active && v.sessionName) {
        onChange({
          ok: true,
          active: true,
          sessionName: v.sessionName,
          startedAt: v.startedAt || null,
        });
      } else {
        onChange({ ok: true, active: false, sessionName: null });
      }
    };
    var errHandler = function (err) {
      onChange({
        ok: false,
        error: String(err && err.message ? err.message : err),
        transient: true,
      });
    };

    ref.on('value', handler, errHandler);
    return function () {
      ref.off('value', handler);
    };
  }

  function logTap(sessionName, studentId, timestamp) {
    if (!isConfigured()) return notConfigured();
    sessionName = String(sessionName || '').trim();
    studentId = String(studentId || '').trim();
    timestamp = String(timestamp || '').trim();

    if (!sessionName || !studentId || !timestamp) {
      return Promise.resolve({
        ok: false,
        error: 'sessionName, studentId, timestamp are required',
      });
    }

    var database = getDb();
    var key = sessionKey(sessionName);

    return database
      .ref(ACTIVE_PATH)
      .once('value')
      .then(function (snap) {
        var v = snap.val();
        if (!v || !v.active || v.sessionName !== sessionName) {
          return { ok: false, error: 'Session is not active', skipped: true };
        }

        var recordedAt = new Date().toISOString();
        return database
          .ref('sessions/' + key + '/taps')
          .push({
            studentId: studentId,
            timestamp: timestamp,
            recordedAt: recordedAt,
          })
          .then(function () {
            return {
              ok: true,
              sessionName: sessionName,
              studentId: studentId,
              timestamp: timestamp,
            };
          });
      })
      .catch(function (err) {
        return {
          ok: false,
          error: String(err && err.message ? err.message : err),
          transient: true,
        };
      });
  }

  function ping() {
    if (!isConfigured()) return notConfigured();
    return getActiveSession().then(function (res) {
      if (res && res.ok) return { ok: true, message: 'ok' };
      return res;
    });
  }

  function getSessionTaps(sessionName) {
    if (!isConfigured()) return notConfigured();
    sessionName = String(sessionName || '').trim();
    if (!sessionName) {
      return Promise.resolve({ ok: false, error: 'sessionName is required' });
    }

    var database = getDb();
    var key = sessionKey(sessionName);

    return database
      .ref('sessions/' + key + '/taps')
      .once('value')
      .then(function (snap) {
        var val = snap.val() || {};
        var taps = Object.keys(val).map(function (id) {
          var row = val[id] || {};
          return {
            id: id,
            studentId: row.studentId != null ? String(row.studentId) : '',
            timestamp: row.timestamp != null ? String(row.timestamp) : '',
            recordedAt: row.recordedAt != null ? String(row.recordedAt) : '',
          };
        });
        taps.sort(function (a, b) {
          if (a.timestamp < b.timestamp) return -1;
          if (a.timestamp > b.timestamp) return 1;
          return 0;
        });
        return { ok: true, sessionName: sessionName, taps: taps };
      })
      .catch(function (err) {
        return {
          ok: false,
          error: String(err && err.message ? err.message : err),
        };
      });
  }

  global.FireflyAPI = {
    isConfigured: isConfigured,
    ping: ping,
    startSession: startSession,
    endSession: endSession,
    getActiveSession: getActiveSession,
    subscribeActiveSession: subscribeActiveSession,
    logTap: logTap,
    getSessionTaps: getSessionTaps,
  };
})(window);
