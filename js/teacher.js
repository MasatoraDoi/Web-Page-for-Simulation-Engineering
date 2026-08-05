(function () {
  'use strict';

  var SESSION_KEY = 'firefly_last_session_name';

  var el = {
    sessionName: document.getElementById('session-name'),
    start: document.getElementById('start-btn'),
    end: document.getElementById('end-btn'),
    status: document.getElementById('teacher-status'),
    active: document.getElementById('active-session'),
    configWarn: document.getElementById('config-warn'),
    refresh: document.getElementById('refresh-btn'),
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

  async function refreshActive() {
    if (!FireflyAPI.isConfigured()) {
      setActiveLabel(null);
      setStatus('APPS_SCRIPT_URL を js/config.js に設定してください', 'warn');
      return;
    }
    try {
      var res = await FireflyAPI.getActiveSession();
      if (res && res.ok && res.active) {
        setActiveLabel(res.sessionName);
        el.sessionName.value = res.sessionName;
        setStatus('', '');
      } else if (res && res.ok) {
        setActiveLabel(null);
        setStatus('', '');
      } else {
        setActiveLabel(null);
        setStatus((res && res.error) || '状態の取得に失敗しました', 'error');
      }
    } catch (err) {
      setStatus('状態の取得に失敗しました: ' + err.message, 'error');
    }
  }

  el.start.addEventListener('click', async function () {
    var name = String(el.sessionName.value || '').trim();
    if (!name) {
      setStatus('セッション名を入力してください', 'error');
      return;
    }
    if (!FireflyAPI.isConfigured()) {
      setStatus('APPS_SCRIPT_URL が未設定です', 'error');
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
      setStatus('APPS_SCRIPT_URL が未設定です', 'error');
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
      refreshActive();
    }
  });

  el.refresh.addEventListener('click', function () {
    refreshActive();
  });

  // init
  if (!FireflyAPI.isConfigured()) {
    el.configWarn.classList.remove('hidden');
  }
  var last = localStorage.getItem(SESSION_KEY);
  if (last) {
    el.sessionName.value = last;
  }
  refreshActive();
  setInterval(refreshActive, 4000);
})();
