// 《臺北狂飆》【神級特裝：X鍵/手機觸控 天神飛行 + Z鍵十六光劍 + 常駐1%防彈護盾 + 著彈點自爆衝鋒槍】
// 複製本檔案全部內容，貼到遊戲 F12 的 Console（或手機端瀏覽器 Console）中按 Enter 即可！

(() => {
  const g = window.__game;
  if (!g || !g.player || !g.player.combat) {
    console.error('請先進入遊戲操作畫面後再執行此指令！');
    return;
  }

  const p = g.player;
  const combat = p.combat;
  const T = window.THREE;
  const ATTACK_RADIUS = 2.0; // 光劍攻擊半徑 2m
  const SHIELD_RADIUS = 0.92; // 貼身護盾 ~1m

  // 1. 取得障礙物破壞系統
  let breakables = null;
  try {
    if (g.breakables) breakables = g.breakables;
    else if (g.systems) {
      for (let s of g.systems) {
        if (s.brk?.blast) { breakables = s.brk; break; }
        if (s.blast) { breakables = s; break; }
      }
    }
  } catch (e) {}

  // ----------------------------------------------------
  // 2. 常駐 1% 貼身防彈力場 + 高空防摔死保護
  // ----------------------------------------------------
  if (!window.__shieldGroup) {
    window.__shieldGroup = new T.Group();
    const fieldGeom = new T.CylinderGeometry(SHIELD_RADIUS, SHIELD_RADIUS, 1.9, 24, 1, true);
    const fieldMat = new T.MeshBasicMaterial({
      color: 0x33bbee,
      transparent: true,
      opacity: 0.01, // 1% 極致透明度
      side: T.DoubleSide,
      depthWrite: false
    });
    window.__forceFieldMesh = new T.Mesh(fieldGeom, fieldMat);
    window.__shieldGroup.add(window.__forceFieldMesh);

    // 禁用射線檢測，避免視角被拉近
    window.__shieldGroup.traverse(c => { c.raycast = () => {}; });
    g.scene.add(window.__shieldGroup);
  }

  // 阻擋警察開槍 + 飛行防摔傷保護（常駐生效）
  if (!window.__origPlayerDamage) {
    window.__origPlayerDamage = p.damage;
  }
  p.damage = function (t) {
    // 飛行模式中或處於安全降落緩衝期：完全免疫摔落跌倒傷害
    if (t && (t.source === 'fall' || window.__flyModeEnabled || (window.__fallImmuneUntil && Date.now() < window.__fallImmuneUntil))) {
      return;
    }

    // 免疫警察槍擊
    if (t && (t.source === 'police' || t.weapon === 'rifle' || t.weapon === 'pistol' || t.weapon === 'smg')) {
      if (window.__forceFieldMesh) {
        window.__forceFieldMesh.material.opacity = 0.15;
        setTimeout(() => { if (window.__forceFieldMesh) window.__forceFieldMesh.material.opacity = 0.01; }, 60);
      }
      try {
        const hitPoint = t.point || { x: p.position.x, y: p.position.y + 1.1, z: p.position.z };
        g.fx?.sparks?.(hitPoint.x, hitPoint.y, hitPoint.z, 0, 0, 6, 4);
        g.fx?.impact?.(hitPoint, { x: 0, y: 1, z: 0 }, 'metal');
        g.audio?.play?.('bullet_impact', { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z, volume: 0.8 });
      } catch (e) {}
      return; // 100% 免疫警察子彈傷害
    }
    return window.__origPlayerDamage.apply(this, arguments);
  };

  // ----------------------------------------------------
  // 3. 16 隻放射狀光劍陣（支援 Z 鍵與手機觸控按鈕切換）
  // ----------------------------------------------------
  if (!window.__swordsGroup) {
    window.__swordsGroup = new T.Group();
    const bladeLength = 1.05;
    const hiltLength = 0.2;
    const bladeGeom = new T.CylinderGeometry(0.015, 0.018, bladeLength, 8);
    bladeGeom.rotateX(Math.PI / 2);
    const hiltGeom = new T.CylinderGeometry(0.024, 0.024, hiltLength, 8);
    hiltGeom.rotateX(Math.PI / 2);
    const bladeMat = new T.MeshBasicMaterial({ color: 0x00ffff });
    const hiltMat = new T.MeshBasicMaterial({ color: 0x1a1a1a });

    const SWORD_COUNT = 16;
    for (let i = 0; i < SWORD_COUNT; i++) {
      const sword = new T.Group();
      const blade = new T.Mesh(bladeGeom, bladeMat);
      blade.position.z = 0.15;
      const hilt = new T.Mesh(hiltGeom, hiltMat);
      hilt.position.z = -0.45;
      sword.add(blade);
      sword.add(hilt);

      const angle = (i * 2 * Math.PI) / SWORD_COUNT;
      const midDist = 1.35;
      sword.position.set(Math.sin(angle) * midDist, 0, Math.cos(angle) * midDist);
      sword.rotation.y = angle;
      window.__swordsGroup.add(sword);
    }

    window.__swordsGroup.traverse(c => { c.raycast = () => {}; });
    g.scene.add(window.__swordsGroup);
  }

  // 光劍開關狀態
  window.__swordsEnabled = true;

  function toggleSwords() {
    window.__swordsEnabled = !window.__swordsEnabled;
    if (window.__swordsGroup) {
      window.__swordsGroup.visible = window.__swordsEnabled;
    }
    updateHudVisuals();
    console.log(`%c[光劍切換] 十六光劍陣已${window.__swordsEnabled ? '【開啟】' : '【收回】'}（1%防彈護罩常駐中）`, 'color: #00ffff; font-weight: bold;');
    g.events?.emit('notify', {
      text: {
        zh: window.__swordsEnabled ? '⚔️ 十六光劍：已出鞘' : '🛡️ 十六光劍：已收回（防護罩常駐）',
        en: window.__swordsEnabled ? 'Swords Active' : 'Swords Hidden (Shield Active)'
      },
      kind: window.__swordsEnabled ? 'good' : 'info',
      duration: 2
    });
  }

  // ----------------------------------------------------
  // 4. 【極致順暢·天神飛行系統】（支援 PC 鍵盤 + 手機搖桿/觸控按鈕）
  // ----------------------------------------------------
  window.__flyModeEnabled = false;
  window.__fallImmuneUntil = 0;
  window.__mobileTurboEnabled = false; // 手機音速衝刺切換狀態
  let mobileVert = 0;                 // 手機爬升/下降觸控輸入 (-1: 下降, 0: 無, 1: 爬升)

  // 飛行物理參數
  const flyVel = new T.Vector3(0, 0, 0);     // 當前平滑速度向量
  const flyTarget = new T.Vector3(0, 0, 0);  // 目標期望速度
  const camDir = new T.Vector3();           // 相機朝向向量
  const camRight = new T.Vector3();         // 相機右側橫移向量
  const worldUp = new T.Vector3(0, 1, 0);

  const NORMAL_SPEED = 24.0; // 巡航飛行速度（約 86 km/h，細膩穿梭西門町與大街小巷）
  const BOOST_SPEED  = 68.0; // 音速衝刺（約 245 km/h，極速直衝臺北101頂端）
  const SLOW_SPEED   = 8.0;  // Alt 慢速懸停模式（精細停泊樓頂、賞景拍照）

  function toggleFlyMode() {
    window.__flyModeEnabled = !window.__flyModeEnabled;
    if (window.__flyModeEnabled) {
      // 升空微抬 1.2 米，脫離地面接觸
      p.position.y += 1.2;
      p.visY = p.position.y;
      p.vy = 0;
      flyVel.set(0, 0, 0);
      try { g.audio?.play?.('pickup', { volume: 0.9 }); } catch (e) {}
      console.log('%c[飛行切換] 🪽 天神飛行模式【已啟動】！', 'color: #33ff99; font-weight: bold; font-size: 15px;');
      g.events?.emit('notify', {
        text: {
          zh: '🪽 天神飛行：已啟動（手機左搖桿移動/右側滑動轉向，右側浮鈕升降/音速）',
          en: 'Flight Mode On (Joystick to move, Look to steer, Side buttons for Up/Down/Turbo)'
        },
        kind: 'good',
        duration: 4
      });
    } else {
      window.__fallImmuneUntil = Date.now() + 8000; // 關閉飛行後提供 8 秒防摔傷保護
      flyVel.set(0, 0, 0);
      window.__mobileTurboEnabled = false;
      try { g.audio?.play?.('pickup', { volume: 0.7 }); } catch (e) {}
      console.log('%c[飛行切換] 🪽 天神飛行模式【已關閉】（已施加 8 秒安全著陸防摔傷保護）', 'color: #ffaa33; font-weight: bold;');
      g.events?.emit('notify', {
        text: {
          zh: '🪽 天神飛行：已關閉（安全落地保護生效中）',
          en: 'Flight Mode Off (Safe Landing Active)'
        },
        kind: 'info',
        duration: 2.5
      });
    }
    updateHudVisuals();
  }

  // ----------------------------------------------------
  // 5. 【手機/觸控專屬 HUD 懸浮操控系統】（精美透明、不擋視線）
  // ----------------------------------------------------
  const HUD_CONTAINER_ID = '__tgta_cheat_mobile_hud';
  const existingHud = document.getElementById(HUD_CONTAINER_ID);
  if (existingHud) existingHud.remove();

  const hudWrap = document.createElement('div');
  hudWrap.id = HUD_CONTAINER_ID;
  hudWrap.innerHTML = `
    <style>
      #__tgta_cheat_mobile_hud {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 99999;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans TC", sans-serif;
        user-select: none;
        -webkit-user-select: none;
        touch-action: none;
      }
      .tgta-btn {
        pointer-events: auto;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(10, 16, 28, 0.75);
        border: 1.5px solid rgba(0, 255, 255, 0.4);
        border-radius: 12px;
        color: #ffffff;
        font-weight: 700;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5), 0 0 10px rgba(0, 255, 255, 0.2);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        transition: transform 0.1s ease, background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
        cursor: pointer;
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
      }
      .tgta-btn:active {
        transform: scale(0.92);
      }
      /* 右上角快捷選單列 */
      .tgta-top-dock {
        position: absolute;
        top: max(10px, env(safe-area-inset-top));
        right: max(10px, env(safe-area-inset-right));
        display: flex;
        gap: 8px;
        pointer-events: auto;
      }
      .tgta-dock-btn {
        height: 38px;
        padding: 0 12px;
        font-size: 13px;
        letter-spacing: 0.05em;
        border-radius: 20px;
      }
      .tgta-dock-btn.fly-active {
        border-color: #33ff99;
        color: #33ff99;
        background: rgba(20, 60, 40, 0.85);
        box-shadow: 0 0 16px rgba(51, 255, 153, 0.6);
      }
      .tgta-dock-btn.swords-active {
        border-color: #00ffff;
        color: #00ffff;
        background: rgba(10, 45, 70, 0.85);
        box-shadow: 0 0 16px rgba(0, 255, 255, 0.6);
      }
      /* 右側飛行高度與衝刺控制群（飛行開啟時自動浮現） */
      .tgta-fly-dock {
        position: absolute;
        right: max(18px, env(safe-area-inset-right));
        top: 50%;
        transform: translateY(-50%);
        display: flex;
        flex-direction: column;
        gap: 12px;
        transition: opacity 0.25s ease, transform 0.25s ease;
      }
      .tgta-fly-dock.hud-hidden {
        opacity: 0;
        pointer-events: none;
        transform: translateY(-50%) translateX(25px);
      }
      .tgta-round-btn {
        width: 52px;
        height: 52px;
        border-radius: 50%;
        font-size: 20px;
      }
      .tgta-up-btn {
        border-color: #33ff99;
        color: #33ff99;
      }
      .tgta-up-btn:active, .tgta-up-btn.holding {
        background: rgba(51, 255, 153, 0.4);
        box-shadow: 0 0 20px #33ff99;
      }
      .tgta-down-btn {
        border-color: #ffaa33;
        color: #ffaa33;
      }
      .tgta-down-btn:active, .tgta-down-btn.holding {
        background: rgba(255, 170, 51, 0.4);
        box-shadow: 0 0 20px #ffaa33;
      }
      .tgta-turbo-btn {
        border-color: #ff3366;
        color: #ff6688;
        font-size: 18px;
      }
      .tgta-turbo-btn.turbo-on {
        background: rgba(255, 51, 102, 0.45);
        border-color: #ff3366;
        color: #ffffff;
        box-shadow: 0 0 22px #ff3366;
      }
    </style>

    <!-- 頂部快捷開關 -->
    <div class="tgta-top-dock">
      <div id="btn-toggle-fly" class="tgta-btn tgta-dock-btn">🪽 飛行</div>
      <div id="btn-toggle-swords" class="tgta-btn tgta-dock-btn">⚔️ 光劍</div>
    </div>

    <!-- 飛行專用升降與音速鍵（飛行時自動出現） -->
    <div id="tgta-fly-panel" class="tgta-fly-dock hud-hidden">
      <div id="btn-fly-up" class="tgta-btn tgta-round-btn tgta-up-btn" title="按住上升">▲</div>
      <div id="btn-fly-turbo" class="tgta-btn tgta-round-btn tgta-turbo-btn" title="切換音速衝刺">⚡</div>
      <div id="btn-fly-down" class="tgta-btn tgta-round-btn tgta-down-btn" title="按住下降">▼</div>
    </div>
  `;
  document.body.appendChild(hudWrap);

  const btnFly = document.getElementById('btn-toggle-fly');
  const btnSwords = document.getElementById('btn-toggle-swords');
  const flyPanel = document.getElementById('tgta-fly-panel');
  const btnUp = document.getElementById('btn-fly-up');
  const btnDown = document.getElementById('btn-fly-down');
  const btnTurbo = document.getElementById('btn-fly-turbo');

  function updateHudVisuals() {
    if (btnFly) {
      if (window.__flyModeEnabled) btnFly.classList.add('fly-active');
      else btnFly.classList.remove('fly-active');
    }
    if (btnSwords) {
      if (window.__swordsEnabled) btnSwords.classList.add('swords-active');
      else btnSwords.classList.remove('swords-active');
    }
    if (flyPanel) {
      if (window.__flyModeEnabled) flyPanel.classList.remove('hud-hidden');
      else flyPanel.classList.add('hud-hidden');
    }
    if (btnTurbo) {
      if (window.__mobileTurboEnabled) btnTurbo.classList.add('turbo-on');
      else btnTurbo.classList.remove('turbo-on');
    }
  }

  // 綁定觸控事件（支援手機 Touch 與滑鼠 Click）
  function bindTouchTap(el, fn) {
    if (!el) return;
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    });
  }

  function bindTouchHold(el, onHold, onRelease) {
    if (!el) return;
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.add('holding');
      onHold();
    });
    const release = e => {
      el.classList.remove('holding');
      onRelease();
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('pointerleave', release);
  }

  bindTouchTap(btnFly, toggleFlyMode);
  bindTouchTap(btnSwords, toggleSwords);

  // 升空按鈕（按住上升）
  bindTouchHold(btnUp, () => { mobileVert = 1; }, () => { if (mobileVert === 1) mobileVert = 0; });

  // 降落按鈕（按住下降）
  bindTouchHold(btnDown, () => { mobileVert = -1; }, () => { if (mobileVert === -1) mobileVert = 0; });

  // 音速衝刺按鈕（點擊切換音速模式，手機不必辛苦死按著不放）
  bindTouchTap(btnTurbo, () => {
    window.__mobileTurboEnabled = !window.__mobileTurboEnabled;
    updateHudVisuals();
    try { g.audio?.play?.('pickup', { volume: 0.8 }); } catch (e) {}
    g.events?.emit('notify', {
      text: {
        zh: window.__mobileTurboEnabled ? '⚡ 音速衝刺：已開啟 (68 m/s)' : '🚗 音速衝刺：已恢復普通巡航 (24 m/s)',
        en: window.__mobileTurboEnabled ? 'Turbo Boost On (68 m/s)' : 'Cruise Speed (24 m/s)'
      },
      kind: window.__mobileTurboEnabled ? 'good' : 'info',
      duration: 2
    });
  });

  updateHudVisuals();

  // ----------------------------------------------------
  // 6. 鍵盤事件監聽（電腦端依然完美相容 X / Z / WASD / Shift）
  // ----------------------------------------------------
  if (!window.__flyKeys) window.__flyKeys = new Set();
  const pressedKeys = window.__flyKeys;

  function isDown(...keys) {
    for (const k of keys) {
      if (pressedKeys.has(k)) return true;
      if (g.input?.keys?.has?.(k)) return true;
    }
    return false;
  }

  if (!window.__cheatKeyHandler) {
    window.__cheatKeyHandler = {
      down: e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        pressedKeys.add(e.code);
        pressedKeys.add(e.key.toLowerCase());

        // X 鍵：飛行模式開關
        if (e.key === 'x' || e.key === 'X') {
          toggleFlyMode();
        }
        // Z 鍵：十六光劍開關
        if (e.key === 'z' || e.key === 'Z') {
          toggleSwords();
        }
      },
      up: e => {
        pressedKeys.delete(e.code);
        pressedKeys.delete(e.key.toLowerCase());
      },
      blur: () => {
        pressedKeys.clear();
      }
    };
    window.addEventListener('keydown', window.__cheatKeyHandler.down);
    window.addEventListener('keyup', window.__cheatKeyHandler.up);
    window.addEventListener('blur', window.__cheatKeyHandler.blur);
  }

  // ----------------------------------------------------
  // 7. ★ 飛行核心：接管位移，無縫融合手機虛擬搖桿與視角 ★
  // ----------------------------------------------------
  if (!window.__origPlayerIntegrate) {
    window.__origPlayerIntegrate = p.integrate;
  }

  p.integrate = function (rawDt) {
    // 飛行模式關閉時，回歸原版物理
    if (!window.__flyModeEnabled) {
      return window.__origPlayerIntegrate.apply(this, arguments);
    }

    const dt = Math.min(Math.max(Number.isFinite(rawDt) ? rawDt : 1 / 60, 0.001), 0.1);

    // 1. 取得相機真實 3D 瞄準方向（手機右側滑動轉視角時自動跟隨）
    if (g.camera) {
      g.camera.getWorldDirection(camDir);
    } else {
      const yaw = p.cam?.yaw || 0;
      camDir.set(Math.sin(yaw), 0, -Math.cos(yaw));
    }
    camRight.crossVectors(camDir, worldUp).normalize();

    // 2. 判定操作輸入：【鍵盤 WASD】 + 【手機左側虛擬搖桿】完美整合！
    let fwd = 0;
    if (isDown('KeyW', 'w', 'ArrowUp')) fwd += 1;
    if (isDown('KeyS', 's', 'ArrowDown')) fwd -= 1;

    // 手機左側虛擬搖桿（推向前 joyY > 0，推向後 joyY < 0）
    const joyY = p.act?.moveY || g.input?.virtual?.moveY || 0;
    fwd += joyY;

    let side = 0;
    if (isDown('KeyD', 'd', 'ArrowRight')) side += 1;
    if (isDown('KeyA', 'a', 'ArrowLeft')) side -= 1;

    // 手機左側虛擬搖桿（推向右 joyX > 0，推向左 joyX < 0）
    const joyX = p.act?.moveX || g.input?.virtual?.moveX || 0;
    side += joyX;

    // 垂直升降：【鍵盤空白鍵 / C鍵】 + 【手機右側 ▲ / ▼ 觸控鍵】
    let vert = mobileVert;
    if (isDown('Space', ' ')) vert += 1;
    if (isDown('KeyC', 'c', 'ControlLeft', 'ControlRight', 'KeyQ', 'q')) vert -= 1;

    // 音速衝刺：【鍵盤 Shift】或【手機點擊 ⚡ 切換的 Turbo】
    const isSprint = isDown('ShiftLeft', 'ShiftRight', 'shift') || window.__mobileTurboEnabled;
    const isSlow = isDown('AltLeft', 'AltRight', 'alt');
    const curSpeed = isSprint ? BOOST_SPEED : (isSlow ? SLOW_SPEED : NORMAL_SPEED);

    // 3. 計算目標 3D 向量
    flyTarget.set(0, 0, 0);
    if (fwd !== 0) flyTarget.addScaledVector(camDir, fwd);
    if (side !== 0) flyTarget.addScaledVector(camRight, side);
    if (vert !== 0) flyTarget.y += vert;

    if (flyTarget.lengthSq() > 1e-4) {
      flyTarget.normalize().multiplyScalar(curSpeed);
    }

    // 4. 平滑慣性阻尼過渡（無論手機搖桿還是鍵盤，手感都極度絲滑，完全無頓挫）
    const smoothFactor = 1 - Math.exp(-12.5 * dt);
    flyVel.lerp(flyTarget, smoothFactor);
    if (flyVel.lengthSq() < 1e-4 && flyTarget.lengthSq() === 0) {
      flyVel.set(0, 0, 0);
    }

    // 5. 更新玩家真實座標
    p.position.x += flyVel.x * dt;
    p.position.y += flyVel.y * dt;
    p.position.z += flyVel.z * dt;

    // 6. 地面防墜入保護（自動偵測地面高度，貼地滑行不穿模）
    let groundY = -999;
    try {
      groundY = (g.groundAt ? g.groundAt(p.position.x, p.position.z) : g.plan?.groundHeight(p.position.x, p.position.z)) ?? 0;
    } catch (e) {}
    if (p.position.y < groundY + 0.25) {
      p.position.y = groundY + 0.25;
      if (flyVel.y < 0) flyVel.y = 0;
    }

    // 7. 同步相機、網格與角色動態
    p.visY = p.position.y;
    p.vy = 0;
    p.airTime = 0;
    p.grounded = false;
    p.velocity.set(flyVel.x, 0, flyVel.z);
    p.hSpeed = Math.hypot(flyVel.x, flyVel.z);

    // 8. 角色模型平滑面朝飛行前進方向
    const horizSpeed = Math.hypot(flyVel.x, flyVel.z);
    if (horizSpeed > 0.3) {
      const targetHeading = Math.atan2(flyVel.x, -flyVel.z);
      p.heading = targetHeading;
      p.lastHeading = targetHeading;
      if (p.object) p.object.rotation.y = -targetHeading;
    }

    // 9. 每幀即時同步十六光劍陣與貼身護盾位置（高速飛行零延遲緊貼身側！）
    const px = p.position.x, py = p.position.y, pz = p.position.z;
    if (window.__shieldGroup) window.__shieldGroup.position.set(px, py + 0.95, pz);
    if (window.__swordsGroup) {
      window.__swordsGroup.position.set(px, py + 0.95, pz);
      window.__swordsGroup.rotation.y += dt * 3.0; // 飛行時光劍群組優雅自旋
    }

    p.syncBody?.();
  };

  // ----------------------------------------------------
  // 8. 位置跟隨與光劍斬殺循環（定時群體打擊）
  // ----------------------------------------------------
  if (window.__swordInterval) clearInterval(window.__swordInterval);
  const queryBodies = [];
  window.__swordInterval = setInterval(() => {
    try {
      if (!p || p.health <= 0) return;
      const px = p.position.x;
      const py = p.position.y;
      const pz = p.position.z;

      // 護盾與光劍跟隨玩家
      if (window.__shieldGroup) window.__shieldGroup.position.set(px, py + 0.95, pz);
      if (window.__swordsGroup) window.__swordsGroup.position.set(px, py + 0.95, pz);

      // 若光劍收回則不觸發斬擊
      if (!window.__swordsEnabled) return;

      // 破壞障礙物
      try { breakables?.blast?.(px, pz, ATTACK_RADIUS); } catch (e) {}

      // 2m 群體斬擊
      queryBodies.length = 0;
      const count = g.dynamics.query(px, pz, ATTACK_RADIUS, queryBodies);
      let hitAny = false;
      for (let i = 0; i < count; i++) {
        const body = queryBodies[i];
        if (!body || body === p.body) continue;
        if (Math.abs(body.y - py) > 2.5) continue;

        if (body.kind === 'ped' || body.kind === 'police') {
          hitAny = true;
          const pt = { x: body.x, y: body.y + 0.8, z: body.z };
          const dir = { x: (body.x - px) || 0.1, y: 0.2, z: (body.z - pz) || 0.1 };

          body.onDamage?.({ amount: 150, point: pt, dir: dir, weapon: 'bat', source: 'player' });
          body.onImpact?.(dir.x * 25, dir.z * 25, p.body);
          try { g.fx?.punch?.(pt, true); } catch (e) {}
          try { g.fx?.impact?.(pt, { x: 0, y: 1, z: 0 }, 'flesh'); } catch (e) {}
        }
      }

      if (hitAny) {
        try { g.audio?.play?.('punch', { x: px, y: py, z: pz, volume: 0.8 }); } catch (e) {}
      }
    } catch (e) {}
  }, 200);

  // ----------------------------------------------------
  // 9. 【高爆自爆衝鋒槍】（Hook combat.fire）
  // ----------------------------------------------------
  combat.give('smg', 9999);
  combat.mag.smg = 30;
  p.switchWeapon('smg');

  const EXPLOSION_RADIUS = 6.0; // 爆炸半徑 6 米
  const MAX_DAMAGE = 350;       // 爆炸最高傷害
  const blastBodies = [];

  function triggerExplosion(x, y, z) {
    try { g.fx?.explosion?.(x, y, z, 1.3, 0xff4400); } catch (e) {}
    try { g.audio?.play?.('explosion', { x, y: y + 1, z, volume: 1.0 }); } catch (e) {}
    try { g.cameraRig?.shake?.(0.4); } catch (e) {}
    try { breakables?.blast?.(x, z, EXPLOSION_RADIUS); } catch (e) {}
    try { g.peds?.panic?.(x, z, 35); g.traffic?.panic?.(x, z, 35); } catch (e) {}

    blastBodies.length = 0;
    const count = g.dynamics.query(x, z, EXPLOSION_RADIUS, blastBodies);
    for (let i = 0; i < count; i++) {
      const body = blastBodies[i];
      if (!body || body === p.body) continue;

      const dx = body.x - x;
      const dz = body.z - z;
      const dist = Math.hypot(dx, dz);
      if (dist > EXPLOSION_RADIUS) continue;

      const factor = 1 - (dist / EXPLOSION_RADIUS);
      const dmg = Math.round(80 + (MAX_DAMAGE - 80) * factor * factor);
      const nx = dx / (dist || 1);
      const nz = dz / (dist || 1);

      body.onDamage?.({
        amount: dmg,
        source: 'explosion',
        point: { x: body.x, y: body.y + 1, z: body.z },
        dir: { x: nx, y: 0.4, z: nz }
      });

      body.onImpact?.(nx * 800 * factor, nz * 800 * factor, p.body);
    }
  }

  if (!window.__origCombatFire) {
    window.__origCombatFire = combat.fire;
  }

  combat.fire = function () {
    window.__origCombatFire.apply(this, arguments);

    // 衝鋒槍自爆效果
    if (this.p.weapon === 'smg') {
      this.mag.smg = 30;
      this.p.ammo.smg = 9999;

      const hit = this.end;
      if (hit && Number.isFinite(hit.x) && Number.isFinite(hit.z)) {
        triggerExplosion(hit.x, hit.y || p.position.y, hit.z);
      }
    }
  };

  // ----------------------------------------------------
  // 10. 控制台完整說明與就緒通知
  // ----------------------------------------------------
  console.log('%c🌟🪽📱⚔️💥【終極整合神級密技（支援手機觸控＋PC雙模式）】已啟動成功！', 'color: #00ffff; font-size: 18px; font-weight: bold;');
  console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #666;');
  console.log('%c📱【手機模式操控方式】：', 'color: #33ff99; font-size: 14px; font-weight: bold;');
  console.log('   • 螢幕右上角：點【🪽 飛行】按鈕立即起飛/降落，點【⚔️ 光劍】開關十六光劍！');
  console.log('   • 左手推動虛擬搖桿：自然朝相機瞄準方向 3D 自由前進/後退/平移！');
  console.log('   • 右手滑動螢幕：自由旋轉相機視角（仰頭即爬升，低頭即俯衝）！');
  console.log('   • 右側半透明浮鈕：');
  console.log('       ▲ ：按住垂直升空拉高海拔');
  console.log('       ▼ ：按住垂直降落貼近地面');
  console.log('       ⚡ ：點擊切換【音速衝刺 68m/s】（極速直達 101 大樓尖頂，無須死按按鈕！）');
  console.log('%c💻【PC 鍵盤操控方式】：', 'color: #00ffff; font-size: 14px; font-weight: bold;');
  console.log('   • X 鍵切換飛行，Z 鍵切換光劍，WASD 全向飛行，空白鍵上升，C鍵下降，Shift音速衝刺！');
  console.log('   • 貼心防摔傷：關閉飛行或高空降落時自動提供 8 秒跌落傷害免疫！');
  console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #666;');

  g.events?.emit('notify', {
    text: { zh: '🪽 天神飛行 & 光劍護盾已就緒！（手機螢幕已產生專屬懸浮按鈕）', en: 'Flight Ready! Mobile touch HUD active.' },
    kind: 'good',
    duration: 4.5
  });
})();
