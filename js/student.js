(function () {
  'use strict';

  var ID_KEY = 'firefly_student_id';
  var VOL_KEY = 'firefly_volume';

  var activeSession = null;
  var sending = false;
  var lastSessionError = '';
  var unsubscribe = null;

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
    if (activeSession) {
      setStatus(
        el.sessionStatus,
        lastSessionError
          ? '記録中: ' + activeSession + '（通信不安定）'
          : '記録中: ' + activeSession,
        lastSessionError ? 'warn' : 'ok'
      );
      return;
    }
    if (lastSessionError) {
      setStatus(el.sessionStatus, lastSessionError, 'warn');
      return;
    }
    setStatus(el.sessionStatus, '受付中のセッションはありません（音のみ）', '');
  }

  function applySessionState(res) {
    if (res && res.ok && res.active && res.sessionName) {
      activeSession = res.sessionName;
      lastSessionError = '';
    } else if (res && res.ok) {
      activeSession = null;
      lastSessionError = '';
    } else if (res && res.transient) {
      lastSessionError = res.error || '通信が不安定です';
    } else {
      activeSession = null;
      lastSessionError = (res && res.error) || 'セッション状態の取得に失敗しました';
    }
    updateSessionUI();
  }

  function startWatchingSession() {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    if (!FireflyAPI.isConfigured()) {
      activeSession = null;
      lastSessionError = '';
      updateSessionUI();
      return;
    }
    setStatus(el.sessionStatus, 'セッションを確認中…', '');
    unsubscribe = FireflyAPI.subscribeActiveSession(applySessionState);
  }

  async function onTap() {
    try {
      await FireflySound.play();
    } catch (err) {
      // 音声失敗でも記録は続行
    }
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
      // 音は出しているので、送信失敗は講義中の操作感を優先して無視
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
    // iOS: このユーザー操作で AudioContext を有効化
    FireflySound.unlock();
    showMain(id);
    startWatchingSession();
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
    FireflySound.unlock();
    applyVolume(el.volume.value);
  });

  // click の方が iOS で音声解除・再生に安定（pointerdown+preventDefault は避ける）
  el.tap.addEventListener('click', function () {
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

  startWatchingSession();
})();
