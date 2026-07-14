// ═══════════════════════════════════════════════════════════════════════════
// 📱 klh_mobile-perf.js — 手機效能優化外掛 v1.0
// ═══════════════════════════════════════════════════════════════════════════
// 掛載於所有遊戲 JS 之後（</body> 前），透過猴子補丁（monkey-patch）
// 攔截高成本函式，依使用者選擇的優化等級套用降級策略。
// 桌機預設不啟用，不影響 any 既有行為。
//
// 優化等級：
//   1 = 輕度：音效節流 250ms、動畫幀率正常、VFX/日誌/CSS 皆為「正常」(不進行任何降級)
//   2 = 中度：關閉音效/BGM、動畫幀率正常、VFX/日誌/CSS 皆為「1 (輕度)」
//   3 = 強力：關閉音效/BGM、動畫幀率正常、VFX/日誌/CSS 皆為「3 (強力)」
//   4 = 進階：自訂各系統細項參數（音效 250ms/500ms/關、動畫正常/減半/1/3、特效、日誌、CSS）
// ═══════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  /* ═══════════════ 常數與狀態 ═══════════════ */
  var PERF_KEY = 'fb5_mobilePerf';
  var _cfg = { enabled: false, level: 2, adv: { audio: 3, anim: 1, vfx: 1, log: 1, css: 1 } };
  var _orig = {};        // 被替換的原始函式 / 原始值備份
  var _st = {            // 執行時狀態
    applied: false,
    trimTimer: null,
    styleEl: null,
    animSkip: 0,         // 動畫跳幀計數器
    numSkip: 0           // 傷害數字跳幀計數器
  };

  /* ═══════════════ 裝置偵測 ═══════════════ */
  function isMobile() {
    var coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    var small = Math.min(screen.width || 9999, screen.height || 9999) <= 1024;
    var ua = /Android|iPhone|iPod|iPad|Mobile|Silk|Kindle|BlackBerry|Windows Phone/i.test(navigator.userAgent || '');
    return (coarse && small) || ua;
  }

  /* ═══════════════ 存讀設定（localStorage） ═══════════════ */
  function _ls(method, key, val) {
    try {
      if (method === 'get') return (typeof _lsGet === 'function') ? _lsGet(key) : localStorage.getItem(key);
      if (typeof _lsSet === 'function') _lsSet(key, val); else localStorage.setItem(key, val);
    } catch (e) { return null; }
  }
  function loadCfg() {
    try {
      var s = _ls('get', PERF_KEY);
      if (s) { 
        var o = JSON.parse(s); 
        _cfg.enabled = !!o.enabled; 
        _cfg.level = [1, 2, 3, 4].indexOf(o.level) >= 0 ? o.level : 2; 
        if (o.adv) {
          _cfg.adv = {
            audio: o.adv.audio !== undefined ? o.adv.audio : 3,
            anim:  o.adv.anim  !== undefined ? o.adv.anim  : 1,
            vfx:   o.adv.vfx   !== undefined ? o.adv.vfx   : 1,
            log:   o.adv.log   !== undefined ? o.adv.log   : 1,
            css:   o.adv.css   !== undefined ? o.adv.css   : 1
          };
        }
      }
    } catch (e) {}
  }
  function saveCfg() { _ls('set', PERF_KEY, JSON.stringify(_cfg)); }

  /* ═══════════════ 首頁 UI 同步 ═══════════════ */
  var _LABELS = { 1: '輕度', 2: '中度', 3: '強力', 4: '進階' };
  function updateHintText(lv) {
    var hint = document.getElementById('hint-mobile-perf');
    if (!hint) return;
    if (!_cfg.enabled) {
      hint.textContent = '手機/平板卡頓時開啟；首次在手機開啟預設「中度」，可隨時切換等級';
      return;
    }
    if (lv == 1) {
      hint.innerHTML = '<span class="text-emerald-400">🟢 輕度：</span>音效 250ms，特效/日誌/CSS 正常';
    } else if (lv == 2) {
      hint.innerHTML = '<span class="text-yellow-400">🟡 中度：</span>關閉音效，特效/日誌/CSS 輕度優化';
    } else if (lv == 3) {
      hint.innerHTML = '<span class="text-rose-400">🔴 強力：</span>關閉音效，特效/日誌/CSS 強力優化';
    } else {
      hint.innerHTML = '<span class="text-purple-400">🟣 進階：</span>請使用遊戲內右上角懸浮面板微調';
    }
  }
  function syncUI() {
    var btn = document.getElementById('btn-mobile-perf');
    var sel = document.getElementById('sel-mobile-level');
    if (btn) {
      if (_cfg.enabled) {
        btn.textContent = '📱 手機優化：' + (_LABELS[_cfg.level] || '中度');
        btn.style.background = '#065f46';
        btn.style.borderColor = '#10b981';
        btn.style.color = '#a7f3d0';
      } else {
        btn.textContent = '📱 手機優化：關閉';
        btn.style.background = '#334155';
        btn.style.borderColor = '#475569';
        btn.style.color = '';
      }
    }
    if (sel) {
      sel.value = '' + _cfg.level;
      sel.classList.toggle('hidden', !_cfg.enabled);
    }
    updateHintText(_cfg.level);
    
    // 同步懸浮面板 UI
    var modal = document.getElementById('klh-perf-modal');
    if (modal) {
        var chk = document.getElementById('klh-perf-chk'); if(chk) chk.checked = _cfg.enabled;
        var sl = document.getElementById('klh-perf-sel'); if(sl) sl.value = _cfg.level;
        var adv = document.getElementById('klh-perf-adv'); if(adv) adv.style.display = (_cfg.level == 4) ? 'block' : 'none';
        ['audio','anim','vfx','log','css'].forEach(function(k){
            var el = document.getElementById('klh-perf-adv-' + k);
            if(el) el.value = _cfg.adv[k];
        });
    }
  }

  /* ═══════════════ 全域 API（首頁按鈕 onclick） ═══════════════ */
  window.toggleMobilePerf = function () {
    _cfg.enabled = !_cfg.enabled;
    saveCfg(); syncUI();
    if (_cfg.enabled) applyAll(); else revertAll();
  };
  window.setMobilePerfLevel = function (v) {
    _cfg.level = parseInt(v, 10) || 2;
    saveCfg(); syncUI();
    if (_cfg.enabled) { revertAll(); applyAll(); }
  };

  /* ═══════════════════════════════════════════════
     各項優化套用 / 還原
     ═══════════════════════════════════════════════ */

  function applyAll() {
    var lv = _cfg.level;
    var aAudio, aAnim, aVfx, aLog, aCss;

    if (lv === 4) {
      aAudio = _cfg.adv.audio;
      aAnim  = _cfg.adv.anim;
      aVfx   = _cfg.adv.vfx;
      aLog   = _cfg.adv.log;
      aCss   = _cfg.adv.css;
    } else if (lv === 1) {
      aAudio = 1; // 250ms
      aAnim  = 1; // 正常
      aVfx   = 0; // 正常
      aLog   = 0; // 正常
      aCss   = 0; // 正常
    } else if (lv === 2) {
      aAudio = 3; // 關閉
      aAnim  = 1; // 正常
      aVfx   = 1; // 輕度
      aLog   = 1; // 輕度
      aCss   = 1; // 輕度
    } else { // lv === 3
      aAudio = 3; // 關閉
      aAnim  = 1; // 正常
      aVfx   = 3; // 強力
      aLog   = 3; // 強力
      aCss   = 3; // 強力
    }

    applyAudio(aAudio);
    applyAnim(aAnim);
    applyVfx(aVfx);
    applyLogTrim(aLog);
    applyCss(aCss);
    _st.applied = true;
    try { console.log('[📱 手機優化] 已啟用 — 等級 ' + lv + ' (' + _LABELS[lv] + ')'); } catch (e) {}
  }

  function revertAll() {
    revertAudio();
    revertAnim();
    revertVfx();
    if (_st.trimTimer) { clearInterval(_st.trimTimer); _st.trimTimer = null; }
    if (_st.styleEl && _st.styleEl.parentNode) { _st.styleEl.remove(); _st.styleEl = null; }
    _st.applied = false;
    try { console.log('[📱 手機優化] 已關閉'); } catch (e) {}
  }

  /* ──────────────────────────────────────────────
     1. 音效節流 / 關閉
     ────────────────────────────────────────────── */
  function applyAudio(lv) {
    revertAudio();
    if (lv === 3) {
      // 關閉音效 + BGM
      if (typeof _sfxCfg !== 'undefined') { _orig._sfxOn = _sfxCfg.on; _sfxCfg.on = false; }
      if (typeof _bgmCfg !== 'undefined') { _orig._bgmOn = _bgmCfg.on; _bgmCfg.on = false; }
      // 同步 UI checkbox（自動化設定面板）
      var sfxEl = document.getElementById('set-sfx-on'); if (sfxEl) sfxEl.checked = false;
      var bgmEl = document.getElementById('set-bgm-on'); if (bgmEl) bgmEl.checked = false;
      return;
    }
    
    var throttleVal = lv === 1 ? 250 : 500;
    // 1. 玩家與通用音效節流
    if (typeof SFX_DEFS !== 'undefined') {
      _orig.sfxThrottle = {};
      for (var k in SFX_DEFS) {
        if (!SFX_DEFS.hasOwnProperty(k)) continue;
        _orig.sfxThrottle[k] = SFX_DEFS[k].throttle;
        SFX_DEFS[k].throttle = throttleVal;
      }
    }
    
    // 2. 專屬怪物擊殺音效節流（playMobKill 攔截，原硬編碼為 80ms）
    if (typeof playMobKill === 'function') {
      _orig.playMobKill = playMobKill;
      var lastKill = 0;
      window.playMobKill = function (mob) {
        var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        if (now - lastKill < throttleVal) return;
        lastKill = now;
        try { _orig.playMobKill(mob); } catch (e) {}
      };
    }

    // 3. 專屬怪物受傷音效節流（playMobHurt 攔截，原硬編碼為 100ms）
    if (typeof playMobHurt === 'function') {
      _orig.playMobHurt = playMobHurt;
      var lastHurt = 0;
      window.playMobHurt = function (mob) {
        var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        if (now - lastHurt < throttleVal) return;
        lastHurt = now;
        try { _orig.playMobHurt(mob); } catch (e) {}
      };
    }

    // 4. 專屬怪物普攻音效節流（playMobAttack 攔截，原硬編碼為 90ms）
    if (typeof playMobAttack === 'function') {
      _orig.playMobAttack = playMobAttack;
      var lastAtk = 0;
      window.playMobAttack = function (mob) {
        var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        if (now - lastAtk < throttleVal) return;
        lastAtk = now;
        try { _orig.playMobAttack(mob); } catch (e) {}
      };
    }

    // 5. 專屬怪物技能音效節流（playMobSkill 攔截，原硬編碼為 110ms）
    if (typeof playMobSkill === 'function') {
      _orig.playMobSkill = playMobSkill;
      var lastSk = 0;
      window.playMobSkill = function (mob) {
        var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        if (now - lastSk < throttleVal) return;
        lastSk = now;
        try { _orig.playMobSkill(mob); } catch (e) {}
      };
    }
  }
  function revertAudio() {
    if (_orig.sfxThrottle && typeof SFX_DEFS !== 'undefined') {
      for (var k in _orig.sfxThrottle) { if (SFX_DEFS[k]) SFX_DEFS[k].throttle = _orig.sfxThrottle[k]; }
      delete _orig.sfxThrottle;
    }
    if ('_sfxOn' in _orig && typeof _sfxCfg !== 'undefined') { _sfxCfg.on = _orig._sfxOn; delete _orig._sfxOn; }
    if ('_bgmOn' in _orig && typeof _bgmCfg !== 'undefined') { _bgmCfg.on = _orig._bgmOn; delete _orig._bgmOn; }
    if (_orig.playMobKill) { window.playMobKill = _orig.playMobKill; delete _orig.playMobKill; }
    if (_orig.playMobHurt) { window.playMobHurt = _orig.playMobHurt; delete _orig.playMobHurt; }
    if (_orig.playMobAttack) { window.playMobAttack = _orig.playMobAttack; delete _orig.playMobAttack; }
    if (_orig.playMobSkill) { window.playMobSkill = _orig.playMobSkill; delete _orig.playMobSkill; }
  }

  /* ──────────────────────────────────────────────
     2. 動畫幀率降低（8fps → 4fps / 2.7fps）
     ────────────────────────────────────────────── */
  function applyAnim(lv) {
    revertAnim();
    if (lv === 1) return;   // 1 = 正常 (不套用降頻，不攔截)
    var skip = lv === 2 ? 2 : 3;   // 2 = 減半 (每2幀播放1幀), 3 = 1/3 (每3幀播放1幀)

    // _mobAnimApply — 怪物序列幀動畫主驅動
    if (typeof _mobAnimApply === 'function') {
      _orig.mobAnimApply = _mobAnimApply;
      window._mobAnimApply = function () {
        _st.animSkip++;
        if (_st.animSkip % skip !== 0) return;
        try { _orig.mobAnimApply(); } catch (e) {}
      };
    }
    // _allySpritesApply — 傭兵 sprite 驅動
    if (typeof _allySpritesApply === 'function') {
      _orig.allySpritesApply = _allySpritesApply;
      window._allySpritesApply = function () {
        if (_st.animSkip % skip !== 0) return;
        try { _orig.allySpritesApply(); } catch (e) {}
      };
    }
    // _playerMorphApply — 玩家變身 sprite 驅動
    if (typeof _playerMorphApply === 'function') {
      _orig.playerMorphApply = _playerMorphApply;
      window._playerMorphApply = function () {
        if (_st.animSkip % skip !== 0) return;
        try { _orig.playerMorphApply(); } catch (e) {}
      };
    }
    // _updateFreezeFx — 冰凍狀態疊層
    if (typeof _updateFreezeFx === 'function') {
      _orig.updateFreezeFx = _updateFreezeFx;
      window._updateFreezeFx = function () {
        if (_st.animSkip % skip !== 0) return;
        try { _orig.updateFreezeFx(); } catch (e) {}
      };
    }
    // _updateMobSkillFx — 怪物技能特效推進
    if (typeof _updateMobSkillFx === 'function') {
      _orig.updateMobSkillFx = _updateMobSkillFx;
      window._updateMobSkillFx = function () {
        if (_st.animSkip % skip !== 0) return;
        try { _orig.updateMobSkillFx(); } catch (e) {}
      };
    }
  }
  function revertAnim() {
    var fns = ['mobAnimApply', 'allySpritesApply', 'playerMorphApply', 'updateFreezeFx', 'updateMobSkillFx'];
    var globs = ['_mobAnimApply', '_allySpritesApply', '_playerMorphApply', '_updateFreezeFx', '_updateMobSkillFx'];
    for (var i = 0; i < fns.length; i++) {
      if (_orig[fns[i]]) { window[globs[i]] = _orig[fns[i]]; delete _orig[fns[i]]; }
    }
    _st.animSkip = 0;
  }

  /* ──────────────────────────────────────────────
     3. VFX 特效減量
     ────────────────────────────────────────────── */
  function applyVfx(lv) {
    revertVfx();
    if (lv === 0) return; // 0 = 正常 (不套用優化，完整繪製)

    // 立即清空畫面上殘留的舊特效 DOM 節點，釋放記憶體
    if (lv >= 2) {
      var vLayer = document.getElementById('vfx-layer');
      if (vLayer) vLayer.innerHTML = '';
    }

    // _vfxBlood — 命中濺血粒子
    if (typeof _vfxBlood === 'function') {
      _orig.vfxBlood = _vfxBlood;
      window._vfxBlood = function (cx, cy, big) {
        if (lv >= 3) return;                  // 強力：無濺血
        if (lv >= 2 && !big) return;           // 中度：僅爆擊/重擊
        try { _orig.vfxBlood(cx, cy, big); } catch (e) {}
      };
    }

    // _vfxNumber — 飄動傷害數字
    if (typeof _vfxNumber === 'function') {
      _orig.vfxNumber = _vfxNumber;
      window._vfxNumber = function (x, y, dmg, ele, big) {
        _st.numSkip++;
        if (lv >= 3 && !big) return;                               // 強力：僅爆擊/重擊
        if (lv >= 2 && !big && _st.numSkip % 2 !== 0) return;     // 中度：一般傷害隔一顯示
        try { _orig.vfxNumber(x, y, dmg, ele, big); } catch (e) {}
      };
    }

    // playSpellFx — 法術命中特效（冰箭/火箭/落雷⋯序列幀 img）
    if (typeof playSpellFx === 'function') {
      _orig.playSpellFx = playSpellFx;
      window.playSpellFx = function (skn, mob) {
        if (lv >= 3) return;
        try { _orig.playSpellFx(skn, mob); } catch (e) {}
      };
    }

    // playSelfFx — 自我增益/治癒特效
    if (typeof playSelfFx === 'function') {
      _orig.playSelfFx = playSelfFx;
      window.playSelfFx = function (skn, anchorRect) {
        if (lv >= 3) return;
        try { _orig.playSelfFx(skn, anchorRect); } catch (e) {}
      };
    }

    // _vfxFlush — 每幀特效生成入口：降低 VFX layer 元素上限
    if (typeof _vfxFlush === 'function') {
      _orig.vfxFlush = _vfxFlush;
      window._vfxFlush = function () {
        try {
          var layer = document.getElementById('vfx-layer');
          var maxEls = lv >= 3 ? 15 : (lv >= 2 ? 40 : 80);
          if (layer && layer.childElementCount > maxEls) {
            var n = layer.childElementCount - maxEls;
            for (var i = 0; i < n && layer.firstChild; i++) layer.removeChild(layer.firstChild);
          }
        } catch (e) {}
        try { _orig.vfxFlush(); } catch (e) {}
      };
    }

    // vfxKill — 擊殺特效（lv3 時跳過粒子/閃光，保留死亡動畫殘影）
    if (typeof vfxKill === 'function') {
      _orig.vfxKill = vfxKill;
      window.vfxKill = function (mob) {
        if (lv >= 3) {
          // 強力：只保留致命傷害數字（不播死亡殘影/閃光/粒子→最輕量）
          try { _orig.vfxKill(mob); } catch (e) {}
          return;
        }
        try { _orig.vfxKill(mob); } catch (e) {}
      };
    }
  }
  function revertVfx() {
    var map = {
      vfxBlood: '_vfxBlood', vfxNumber: '_vfxNumber',
      playSpellFx: 'playSpellFx', playSelfFx: 'playSelfFx',
      vfxFlush: '_vfxFlush', vfxKill: 'vfxKill'
    };
    for (var k in map) { if (_orig[k]) { window[map[k]] = _orig[k]; delete _orig[k]; } }
    _st.numSkip = 0;
  }

  /* ──────────────────────────────────────────────
     4. 日誌 DOM 修剪（防止無限膨脹）
     ────────────────────────────────────────────── */
  function applyLogTrim(lv) {
    if (_st.trimTimer) { clearInterval(_st.trimTimer); _st.trimTimer = null; }
    if (lv === 0) return; // 0 = 正常 (不限制/不修剪日誌)
    var max = lv >= 3 ? 40 : (lv >= 2 ? 80 : 150);
    _st.trimTimer = setInterval(function () {
      try {
        ['combat-log', 'sys-log'].forEach(function (id) {
          var el = document.getElementById(id);
          if (!el) return;
          while (el.childNodes.length > max) el.removeChild(el.firstChild);
        });
      } catch (e) {}
    }, 3000);
  }

  /* ──────────────────────────────────────────────
     5. CSS 效能降級（注入樣式表）
     ────────────────────────────────────────────── */
  function applyCss(lv) {
    if (_st.styleEl && _st.styleEl.parentNode) { _st.styleEl.remove(); _st.styleEl = null; }
    if (lv === 0) return; // 0 = 正常 (不注入樣式表，不精簡 CSS)
    var css = '/* 📱 mobile-perf lv' + lv + ' */\n';

    // ── 所有等級 ──
    css += '[class*="backdrop-blur"],.backdrop-blur-sm{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}\n';

    // ── 中度以上 ──
    if (lv >= 2) {
      css += '.vfx-spell{mix-blend-mode:normal!important}\n';
      css += '.mob-target,.mob-target *{transition:none!important}\n';
    }

    // ── 強力 ──
    if (lv >= 3) {
      css += '.vfx-spell,.vfx-freeze,.vfx-mobskill,.vfx-selffx{display:none!important}\n';
      css += '.vfx-ring,.vfx-particle,.vfx-blood,.vfx-areaflash{display:none!important}\n';
      css += '.mob-anim-shadow,.mob-anim-weapon,.mob-anim-weapon2{display:none!important}\n';
    }

    _st.styleEl = document.createElement('style');
    _st.styleEl.id = 'mobile-perf-css';
    _st.styleEl.textContent = css;
    document.head.appendChild(_st.styleEl);
  }

  /* ═══════════════ 動態注入 UI ═══════════════ */
  function injectUI() {
    // 1. 首頁選單按鈕
    if (!document.getElementById('btn-mobile-perf')) {
      var mainMenu = document.getElementById('main-menu');
      if (mainMenu) {
        var btn = document.createElement('button');
        btn.id = 'btn-mobile-perf';
        btn.className = 'btn text-base w-72 py-2.5';
        btn.style.background = '#334155';
        btn.style.borderColor = '#475569';
        btn.onclick = function () { window.toggleMobilePerf(); };
        btn.textContent = '📱 手機優化：關閉';

        var sel = document.createElement('select');
        sel.id = 'sel-mobile-level';
        sel.className = 'bg-slate-800 border border-slate-600 text-white px-3 py-1.5 text-sm rounded outline-none w-72 hidden';
        sel.onchange = function () { window.setMobilePerfLevel(this.value); };
        sel.innerHTML = '<option value="1">🟢 輕度 (音效節流，其餘正常)</option>' +
                        '<option value="2" selected>🟡 中度 (關閉音效，輕度優化)</option>' +
                        '<option value="3">🔴 強力 (關閉音效，強力優化)</option>' +
                        '<option value="4">🟣 進階 (細部自訂參數)</option>';

        var hint = document.createElement('p');
        hint.id = 'hint-mobile-perf';
        hint.className = 'text-xs text-slate-500 -mt-2 w-72 text-center leading-relaxed px-1';
        hint.textContent = '手機/平板卡頓時開啟；首次在手機開啟預設「中度」，可隨時切換等級';

        var pEls = mainMenu.getElementsByTagName('p');
        if (pEls.length > 0) {
          var lastP = pEls[pEls.length - 1];
          lastP.parentNode.insertBefore(hint, lastP.nextSibling);
          lastP.parentNode.insertBefore(sel, hint);
          lastP.parentNode.insertBefore(btn, sel);
        } else {
          mainMenu.appendChild(btn);
          mainMenu.appendChild(sel);
          mainMenu.appendChild(hint);
        }
      }
    }

    // 2. 遊戲內懸浮介面
    if (document.getElementById('klh-perf-float-btn')) return;

    var fBtn = document.createElement('div');
    fBtn.id = 'klh-perf-float-btn';
    fBtn.innerHTML = '⚙️<div style="font-size:10px;margin-top:-2px">優化</div>';
    fBtn.style.cssText = 'position:fixed;top:80px;right:10px;width:36px;height:36px;background:rgba(15,23,42,0.85);border:1px solid #475569;border-radius:8px;color:#94a3b8;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;z-index:99999;box-shadow:0 0 10px rgba(0,0,0,0.5);user-select:none;line-height:1;';
    fBtn.onclick = function() {
        var m = document.getElementById('klh-perf-modal');
        if (m) m.style.display = m.style.display === 'none' ? 'block' : 'none';
    };
    document.body.appendChild(fBtn);

    var modal = document.createElement('div');
    modal.id = 'klh-perf-modal';
    modal.style.cssText = 'position:fixed;top:125px;right:10px;width:240px;background:rgba(15,23,42,0.95);border:1px solid #475569;border-radius:8px;padding:12px;color:#f8fafc;z-index:99999;box-shadow:0 4px 12px rgba(0,0,0,0.5);display:none;font-family:sans-serif;font-size:13px;backdrop-filter:blur(4px);';
    
    var html = '<div style="font-weight:bold;font-size:14px;border-bottom:1px solid #334155;padding-bottom:8px;margin-bottom:8px;display:flex;justify-content:space-between"><span>📱 手機優化設定</span><span style="cursor:pointer;color:#94a3b8" onclick="document.getElementById(\'klh-perf-modal\').style.display=\'none\'">✖</span></div>';
    html += '<label style="display:flex;align-items:center;margin-bottom:8px;cursor:pointer"><input type="checkbox" id="klh-perf-chk" style="margin-right:6px"> 啟用優化</label>';
    html += '<div style="margin-bottom:8px">等級: <select id="klh-perf-sel" style="background:#1e293b;color:#f8fafc;border:1px solid #475569;border-radius:4px;padding:2px;margin-left:4px;width:120px"><option value="1">🟢 輕度</option><option value="2">🟡 中度</option><option value="3">🔴 強力</option><option value="4">🟣 進階</option></select></div>';
    
    html += '<div id="klh-perf-adv" style="border:1px solid #334155;border-radius:4px;padding:8px;background:rgba(0,0,0,0.2);margin-top:8px">';
    html += '<div style="color:#94a3b8;font-size:11px;margin-bottom:6px">進階微調選項</div>';
    var advItems = [
        {id: 'audio', label: '音效頻率'},
        {id: 'anim', label: '動畫降幀'},
        {id: 'vfx', label: '特效粒子'},
        {id: 'log', label: '日誌數量'},
        {id: 'css', label: '介面渲染'}
    ];
    advItems.forEach(function(item) {
        html += '<div style="display:flex;justify-content:space-between;margin-bottom:4px;align-items:center"><span>'+item.label+'</span>';
        html += '<select id="klh-perf-adv-'+item.id+'" style="background:#1e293b;color:#f8fafc;border:1px solid #475569;border-radius:4px;padding:0 2px">';
        if (item.id === 'audio') {
            html += '<option value="1">250ms</option><option value="2">500ms</option><option value="3">關閉</option>';
        } else if (item.id === 'anim') {
            html += '<option value="1">正常</option><option value="2">減半</option><option value="3">1/3 幀率</option>';
        } else {
            html += '<option value="0">正常</option><option value="1">1 (輕度)</option><option value="2">2 (中度)</option><option value="3">3 (強力)</option>';
        }
        html += '</select></div>';
    });
    html += '</div>';

    modal.innerHTML = html;
    document.body.appendChild(modal);

    document.getElementById('klh-perf-chk').onchange = function(e) { _cfg.enabled = e.target.checked; saveCfg(); syncUI(); if(_cfg.enabled) { revertAll(); applyAll(); } else revertAll(); };
    document.getElementById('klh-perf-sel').onchange = function(e) { _cfg.level = parseInt(e.target.value, 10); saveCfg(); syncUI(); if(_cfg.enabled){ revertAll(); applyAll(); } };
    
    ['audio','anim','vfx','log','css'].forEach(function(k){
        document.getElementById('klh-perf-adv-' + k).onchange = function(e) { 
            _cfg.adv[k] = parseInt(e.target.value, 10); 
            saveCfg(); 
            if(_cfg.enabled && _cfg.level == 4){ revertAll(); applyAll(); }
        };
    });
  }

  /* ═══════════════ 背包分頁延遲渲染優化 (外掛層 Monkey-patch) ═══════════════ */
  (function initLazyTabs() {
    if (typeof renderTabs === 'function' && !window._origRenderTabs) {
      window._origRenderTabs = renderTabs;
      window.renderTabs = function (force) {
        if (!_cfg.enabled) {
          try { window._origRenderTabs(force); } catch (e) {}
          return;
        }

        var wDiv = document.getElementById('tab-weapons');
        var wVis = wDiv && !wDiv.classList.contains('hidden');
        var aDiv = document.getElementById('tab-armors');
        var aVis = aDiv && !aDiv.classList.contains('hidden');
        var iDiv = document.getElementById('tab-items');
        var iVis = iDiv && !iDiv.classList.contains('hidden');
        var eDiv = document.getElementById('tab-equip');
        var eVis = eDiv && !eDiv.classList.contains('hidden');
        var sDiv = document.getElementById('tab-skill');
        var sVis = sDiv && !sDiv.classList.contains('hidden');

        var origGetElementById = document.getElementById;
        var dummies = {};
        document.getElementById = function (id) {
          if (id === 'tab-weapons' && !wVis) return dummies[id] || (dummies[id] = document.createElement('div'));
          if (id === 'tab-armors' && !aVis) return dummies[id] || (dummies[id] = document.createElement('div'));
          if (id === 'tab-items' && !iVis) return dummies[id] || (dummies[id] = document.createElement('div'));
          if (id === 'tab-equip' && !eVis) return dummies[id] || (dummies[id] = document.createElement('div'));
          if (id === 'tab-skill' && !sVis) return dummies[id] || (dummies[id] = document.createElement('div'));
          return origGetElementById.call(document, id);
        };

        var origInv = (typeof player !== 'undefined' && player) ? player.inv : null;
        if (!wVis && !aVis && !iVis && origInv) {
          player.inv = [];
        }

        try {
          window._origRenderTabs(force);
        } catch (e) {
          try { console.error('[📱 手機優化] renderTabs 執行失敗:', e); } catch (ex) {}
        } finally {
          document.getElementById = origGetElementById;
          if (origInv) player.inv = origInv;
        }
      };

      // 完美代理 _sig 簽章屬性，防止重繪邏輯判定失效
      Object.defineProperty(window.renderTabs, '_sig', {
        get: function () { return window._origRenderTabs._sig; },
        set: function (v) { window._origRenderTabs._sig = v; },
        configurable: true
      });
    }

    if (typeof switchTab === 'function' && !window._origSwitchTab) {
      window._origSwitchTab = switchTab;
      window.switchTab = function (t, btn) {
        try { window._origSwitchTab(t, btn); } catch (e) {}
        if (_cfg.enabled && typeof renderTabs === 'function') {
          // 切換分頁時，如果開啟了優化，強制重建以繪製剛打開的分頁
          try { renderTabs(true); } catch (e) {}
        }
      };
    }
  })();

  /* ═══════════════ 啟動流程 ═══════════════ */
  loadCfg();

  if (!_ls('get', PERF_KEY) && isMobile()) {
    _cfg.enabled = true;
    _cfg.level = 2;
    saveCfg();
  }

  function boot() {
    injectUI();
    syncUI();
    if (_cfg.enabled) setTimeout(applyAll, 200);
    setInterval(function () {
      injectUI();
      syncUI();
    }, 2000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})();

