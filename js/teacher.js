(function () {
  'use strict';

  var SESSION_KEY = 'firefly_last_session_name';
  var unsubscribe = null;

  var el = {
    sessionName: document.getElementById('session-name'),
    start: document.getElementById('start-btn'),
    end: document.getElementById('end-btn'),
    status: document.getElementById('teacher-status'),
    active: document.getElementById('active-session'),
    configWarn: document.getElementById('config-warn'),
    refresh: document.getElementById('refresh-btn'),
    csv: document.getElementById('csv-btn'),
  };

  function setStatus(message, type) {
    el.status.textContent = message || '';
    el.status.className = 'status' + (type ? ' ' + type : '');
  }

  function setActiveLabel(name) {
    if (name) {
      el.active.textContent = '現在の受付中セッション: ' + name;
      el.active.className = 'status ok';
    } else {
      el.active.textContent = '現在受付中のセッションはありません';
      el.active.className = 'status';
    }
  }

  function applySessionState(res) {
    if (res && res.ok && res.active) {
      setActiveLabel(res.sessionName);
      el.sessionName.value = res.sessionName;
      setStatus('', '');
    } else if (res && res.ok) {
      setActiveLabel(null);
      setStatus('', '');
    } else if (res && res.transient) {
      setStatus(res.error || '通信が不安定です', 'warn');
    } else {
      setStatus((res && res.error) || '状態の取得に失敗しました', 'error');
    }
  }

  function startWatching() {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    if (!FireflyAPI.isConfigured()) {
      setActiveLabel(null);
      setStatus('js/config.js に Firebase 設定を入れてください', 'warn');
      return;
    }
    unsubscribe = FireflyAPI.subscribeActiveSession(applySessionState);
  }

  el.start.addEventListener('click', async function () {
    var name = String(el.sessionName.value || '').trim();
    if (!name) {
      setStatus('セッション名を入力してください', 'error');
      return;
    }
    if (!FireflyAPI.isConfigured()) {
      setStatus('Firebase が未設定です', 'error');
      return;
    }

    el.start.disabled = true;
    setStatus('開始しています…', '');
    try {
      var res = await FireflyAPI.startSession(name);
      if (!res || !res.ok) {
        setStatus((res && res.error) || '開始に失敗しました', 'error');
      } else {
        localStorage.setItem(SESSION_KEY, name);
        setStatus('セッション「' + name + '」を開始しました', 'ok');
        setActiveLabel(name);
      }
    } catch (err) {
      setStatus('開始に失敗しました: ' + err.message, 'error');
    } finally {
      el.start.disabled = false;
    }
  });

  el.end.addEventListener('click', async function () {
    if (!FireflyAPI.isConfigured()) {
      setStatus('Firebase が未設定です', 'error');
      return;
    }
    var name = String(el.sessionName.value || '').trim();
    el.end.disabled = true;
    setStatus('終了しています…', '');
    try {
      var res = await FireflyAPI.endSession(name);
      if (!res || !res.ok) {
        setStatus((res && res.error) || '終了に失敗しました', 'error');
      } else {
        setStatus('セッション「' + res.sessionName + '」を終了しました', 'ok');
        setActiveLabel(null);
      }
    } catch (err) {
      setStatus('終了に失敗しました: ' + err.message, 'error');
    } finally {
      el.end.disabled = false;
    }
  });

  el.refresh.addEventListener('click', async function () {
    setStatus('更新中…', '');
    var res = await FireflyAPI.getActiveSession();
    applySessionState(res);
  });

  function csvEscape(value) {
    var s = String(value == null ? '' : value);
    if (/[",\n\r]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function downloadCsv(filename, text) {
    // Excel 向けに UTF-8 BOM を付与
    var blob = new Blob(['\uFEFF' + text], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function safeFilename(name) {
    return String(name || 'session').replace(/[\\\/:*?"<>|]/g, '_');
  }

  el.csv.addEventListener('click', async function () {
    var name = String(el.sessionName.value || '').trim();
    if (!name) {
      setStatus('CSV にするセッション名を入力してください', 'error');
      return;
    }
    if (!FireflyAPI.isConfigured()) {
      setStatus('Firebase が未設定です', 'error');
      return;
    }

    el.csv.disabled = true;
    setStatus('CSV を作成しています…', '');
    try {
      var res = await FireflyAPI.getSessionTaps(name);
      if (!res || !res.ok) {
        setStatus((res && res.error) || 'CSV の作成に失敗しました', 'error');
        return;
      }
      var taps = res.taps || [];
      if (!taps.length) {
        setStatus('セッション「' + name + '」にタップ記録がありません', 'warn');
        return;
      }

      var lines = ['studentId,timestamp,recordedAt'];
      taps.forEach(function (row) {
        lines.push(
          [row.studentId, row.timestamp, row.recordedAt].map(csvEscape).join(',')
        );
      });

      downloadCsv(safeFilename(name) + '_taps.csv', lines.join('\n') + '\n');
      setStatus(
        'CSV をダウンロードしました（' + taps.length + ' 件 / ' + name + '）',
        'ok'
      );
    } catch (err) {
      setStatus('CSV の作成に失敗しました: ' + err.message, 'error');
    } finally {
      el.csv.disabled = false;
    }
  });

  // init
  if (!FireflyAPI.isConfigured()) {
    el.configWarn.classList.remove('hidden');
  }
  var last = localStorage.getItem(SESSION_KEY);
  if (last) {
    el.sessionName.value = last;
  }
  startWatching();
})();
