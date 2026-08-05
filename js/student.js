(function () {
  'use strict';

  var ID_KEY = 'firefly_student_id';
  var VOL_KEY = 'firefly_volume';
  var POLL_MS = 5000;

  var activeSession = null;
  var sending = false;
  var refreshing = false;
  var lastSessionError = '';

  var el = {
    setup: document.getElementById('setup-panel'),
    main: document.getElementById('main-panel'),
    idInput: document.getElementById('student-id'),
    saveId: document.getElementById('save-id'),
    setupStatus: document.getElementById('setup-status'),
    tap: document.getElementById('tap-btn'),
    volume: document.getElementById('volume'),
    volLabel: document.getElementById('volume-label'),
    sessionStatus: document.getElementById('session-status'),
    idLabel: document.getElementById('id-label'),
    changeId: document.getElementById('change-id'),
    configWarn: document.getElementById('config-warn'),
  };

  function setStatus(node, message, type) {
    node.textContent = message || '';
    node.className = 'status' + (type ? ' ' + type : '');
  }

  function getStoredId() {
    return localStorage.getItem(ID_KEY) || '';
  }

  function isValidId(value) {
    return /^\d{1,10}$/.test(String(value).trim());
  }

  function showSetup(prefill) {
    el.setup.classList.remove('hidden');
    el.main.classList.add('hidden');
    el.idInput.value = prefill || '';
    el.idInput.focus();
  }

  function showMain(id) {
    el.setup.classList.add('hidden');
    el.main.classList.remove('hidden');
    el.idLabel.textContent = 'ID: ' + id;
  }

  function applyVolume(value) {
    var v = Math.max(0, Math.min(1, Number(value)));
    FireflySound.setVolume(v);
    el.volLabel.textContent = Math.round(v * 100) + '%';
    localStorage.setItem(VOL_KEY, String(v));
  }

  function updateSessionUI() {
    if (!FireflyAPI.isConfigured()) {
      setStatus(el.sessionStatus, '記録サーバー未設定（音のみ）', 'warn');
      return;
    }
    if (lastSessionError) {
      setStatus(el.sessionStatus, lastSessionError, 'error');
      return;
    }
    if (activeSession) {
      setStatus(
        el.sessionStatus,
        '記録中: ' + activeSession,
        'ok'
      );
    } else {
      setStatus(el.sessionStatus, '受付中のセッションはありません（音のみ）', '');
    }
  }

  async function refreshSession() {
    if (!FireflyAPI.isConfigured()) {
      activeSession = null;
      lastSessionError = '';
      updateSessionUI();
      return;
    }
    if (refreshing) return;
    refreshing = true;
    try {
      var res = await FireflyAPI.getActiveSession();
      if (res && res.ok && res.active && res.sessionName) {
        activeSession = res.sessionName;
        lastSessionError = '';
      } else if (res && res.ok) {
        activeSession = null;
        lastSessionError = '';
      } else {
        activeSession = null;
        lastSessionError = (res && res.error) || 'セッション状態の取得に失敗しました';
      }
    } catch (err) {
      // 通信失敗時は前回の状態を維持せず、送信しない方に倒す
      activeSession = null;
      lastSessionError = 'セッション状態の取得に失敗しました';
    } finally {
      refreshing = false;
      updateSessionUI();
    }
  }

  async function onTap() {
    FireflySound.play();
    el.tap.classList.add('flash');
    setTimeout(function () {
      el.tap.classList.remove('flash');
    }, 120);

    if (!activeSession || !FireflyAPI.isConfigured() || sending) {
      return;
    }

    var studentId = getStoredId();
    if (!studentId) return;

    sending = true;
    try {
      var timestamp = new Date().toISOString();
      var res = await FireflyAPI.logTap(activeSession, studentId, timestamp);
      if (res && res.skipped) {
        activeSession = null;
        updateSessionUI();
      }
    } catch (err) {
      // 音は出ているので、送信失敗は静かに無視（講義中の操作感を優先）
    } finally {
      sending = false;
    }
  }

  el.saveId.addEventListener('click', function () {
    var id = String(el.idInput.value || '').trim();
    if (!isValidId(id)) {
      setStatus(el.setupStatus, '数字のみ（1〜10桁）で入力してください', 'error');
      return;
    }
    localStorage.setItem(ID_KEY, id);
    setStatus(el.setupStatus, '', '');
    showMain(id);
    refreshSession();
  });

  el.idInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      el.saveId.click();
    }
  });

  el.changeId.addEventListener('click', function () {
    showSetup(getStoredId());
  });

  el.volume.addEventListener('input', function () {
    applyVolume(el.volume.value);
  });

  el.tap.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    onTap();
  });

  // init
  if (!FireflyAPI.isConfigured()) {
    el.configWarn.classList.remove('hidden');
  }

  var storedVol = localStorage.getItem(VOL_KEY);
  var initialVol = storedVol != null ? storedVol : '0.5';
  el.volume.value = initialVol;
  applyVolume(initialVol);

  var id = getStoredId();
  if (id && isValidId(id)) {
    showMain(id);
  } else {
    showSetup('');
  }

  refreshSession();
  setInterval(refreshSession, POLL_MS);
})();
