// 《臺北狂飆》【神級特裝：X鍵/手機觸控 天神飛行 + Z鍵十六光劍 + 常駐1%防彈護盾 + 著彈點自爆槍 + 🕶️黑道堂口友軍火力支援】
// 複製本檔案全部內容，貼到遊戲 F12 的 Console（或手機端瀏覽器 Console）中按 Enter 即可！

(() => {
  function initPlugin() {
    const g = window.__game;
    // 確保遊戲、玩家、戰鬥系統以及警察系統皆已完整載入（防止進遊戲前執行腳本導致物理剛體未初始化）
    if (!g || !g.player || !g.player.combat || !g.police || !g.police._debug || !g.police._debug.roadblocks || !g.police._debug.roadblocks.officers) {
      setTimeout(initPlugin, 500);
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

    // 免疫警察槍擊（友軍黑道也絕不傷害玩家）
    if (t && (t.source === 'police' || t.source === 'gang' || t.weapon === 'rifle' || t.weapon === 'pistol' || t.weapon === 'smg')) {
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

      const angle = (i / SWORD_COUNT) * Math.PI * 2;
      sword.position.set(Math.cos(angle) * SHIELD_RADIUS, 0, Math.sin(angle) * SHIELD_RADIUS);
      sword.rotation.y = -angle;

      window.__swordsGroup.add(sword);
    }

    window.__swordsGroup.traverse(c => { c.raycast = () => {}; });
    g.scene.add(window.__swordsGroup);
    window.__swordsGroup.visible = false;
  }

  window.__swordsEnabled = false;
  function toggleSwords() {
    window.__swordsEnabled = !window.__swordsEnabled;
    if (window.__swordsGroup) {
      window.__swordsGroup.visible = window.__swordsEnabled;
    }
    updateHudVisuals();
    try {
      g.audio?.play?.(window.__swordsEnabled ? 'weapon_pickup' : 'ui_menu', { volume: 0.9, rate: 1.2 });
      g.events?.emit('notify', {
        text: {
          zh: window.__swordsEnabled ? '⚔️ 十六光劍陣：已展開！環形高速護體' : '⚔️ 十六光劍陣：已收回！',
          en: window.__swordsEnabled ? 'Light Swords Deployed!' : 'Light Swords Retracted!'
        },
        kind: window.__swordsEnabled ? 'good' : 'neutral',
        duration: 2.0
      });
    } catch (e) {}
  }

  // 恢復原版車輛生成（取消警車變黑廂型車）
  if (window.__origVehiclesSpawn) {
    g.vehicles.spawn = window.__origVehiclesSpawn;
    delete window.__origVehiclesSpawn;
  }
  if (window.__origPoliceSpawnCar && g.police) {
    g.police.spawnCar = window.__origPoliceSpawnCar;
    delete window.__origPoliceSpawnCar;
  }
  delete window.__blackPoliceVans;

  // ----------------------------------------------------
  // 4. 🕶️【黑道友軍系統 (採用官方警察全黑特警造型＋警用突擊步槍)】
  // ----------------------------------------------------
  // ★ 核心修復：全面恢復所有警察剛體的原生傷害回調，絕不留無敵警察！★
  const officersMgr = g.police?._debug?.roadblocks?.officers;
  if (officersMgr && officersMgr.list) {
    for (let off of officersMgr.list) {
      if (off && off.body) {
        // 重設原生傷害回調，確保不管是誰都能正常挨打扣血陣亡！
        off.body.onDamage = t => {
          if (off.body.userData?.gangMember?.active) {
            off.body.userData.gangMember.takeDamage(t);
          } else {
            officersMgr.onDamage(off, t);
          }
        };
        off.body.onImpact = (t, n, r) => officersMgr.onImpact(off, t, n, r);
        delete off.body.userData?.gang;
        delete off.body.userData?.gangMember;
        off.hp = 100;
        off.maxHp = 100;
        off.posed = false;
        off.state = 'chase';
        delete off.dead;
      }
    }
  }
  
  // ★ 擴充警方總人力池（破解預設 30 人上限限制）★
  // 防止我們的 12 名黑道兄弟佔據了原本要生成敵方警察的位置，導致沒有警察可以打！
  if (officersMgr && officersMgr.list && officersMgr.list.length > 0) {
    const currentLimit = officersMgr.list.length;
    const targetLimit = 80; // 擴充到 80 人
    if (currentLimit < targetLimit) {
      try {
        const OfficerClass = officersMgr.list[0].constructor;
        for (let i = currentLimit; i < targetLimit; i++) {
          const newOfficer = new OfficerClass(officersMgr);
          officersMgr.list.push(newOfficer);
        }
        console.log(`[整合密技] 警方人力池已從 ${currentLimit} 擴充至 ${targetLimit}，確保敵方火力不減！`);
      } catch (e) {
        console.error('擴充警方人力池失敗:', e);
      }
    }
  }

  // 確保 officersMgr.onDamage 能將傷害即時傳遞給黑道兄弟
  if (officersMgr && !officersMgr.__gangDamageHooked) {
    officersMgr.__gangDamageHooked = true;
    const origOnDamage = officersMgr.onDamage;
    officersMgr.onDamage = function(off, t) {
      if (off && off.body?.userData?.gangMember?.active) {
        off.body.userData.gangMember.takeDamage(t);
        return;
      }
      return origOnDamage.apply(this, arguments);
    };
  }

  // 清理任何先前殘留的黑道兄弟實例
  if (window.__gangSystem && window.__gangSystem.members) {
    for (let m of window.__gangSystem.members) {
      try { m.destroy(); } catch (e) {}
    }
  }

  // ★ 黑道混編模式自訂武器配置表 ★
  // 當選擇「混編(mixed)」時，會依照以下陣列順序發放武器給小弟（步槍與手槍交替混編）。
  // 可選武器：'rifle' (步槍), 'pistol' (手槍)
  window.__gangMixedWeapons = [
    'rifle',   // 第1個小弟
    'pistol',  // 第2個小弟
    'rifle',   // 第3個小弟
    'pistol',  // 第4個小弟
    'rifle',   // 第5個小弟
    'pistol',  // 第6個小弟
    'rifle',   // 第7個小弟
    'pistol',  // 第8個小弟
    'rifle',   // 第9個小弟
    'pistol',  // 第10個小弟
    'rifle',   // 第11個小弟
    'pistol'   // 第12個小弟
  ];

  window.__gangSystem = {
    targetCount: 0,          // ★ 預設 0 名兄弟，進入遊戲後再手動招募以避免無敵 Bug
    maxFollowDistance: 50,   // ★ 限制黑道預設不能超過玩家 50m（可在設定調整 15m~200m）
    weaponType: 'rifle',      // ★ 預設武器為步槍 ('rifle')
    members: [],
    kills: { police: 0, cars: 0, heli: 0 },
    activeTaxis: [],         // 計程車援兵車隊
    godMode: false,          // 友軍無敵開關（預設 false，允許被車輛炸死/被槍打死）
    isPanelOpen: false
  };

  const GANG_WEAPONS = {
    mixed: { id: 'mixed', name: { zh: '🎲 堂口混編 (步槍/手槍)', en: 'Mixed Squad' } },
    rifle: { id: 'rifle', name: { zh: '💥 突擊步槍 (遠程全自動掃射)', en: 'Assault Rifle' }, range: 85, dmg: 20 },
    pistol: { id: 'pistol', name: { zh: '🔫 警用配槍 (中距精準壓制)', en: 'Pistol' }, range: 55, dmg: 15 }
  };

  // ----------------------------------------------------
  // ★ 警方 AI 仇恨重定向核心：讓官方警方/特警/警車優先鎖定與圍剿黑道兄弟 ★
  // ----------------------------------------------------
  function hookPoliceTargeting() {
    try {
      const rb = g.police?._debug?.roadblocks;
      if (!rb || !rb.officers) return false;
      const officersMgr = rb.officers;
      const carsMgr = rb.cars;

      if (!officersMgr.__gangPriorityHooked) {
        officersMgr.__gangPriorityHooked = true;

        // ★ 1. 擴充警員實體物件池：從原版 16 個擴展至 64 個槽位！（配合每車 4 警全額部署）★
        try {
          const OfficerProto = officersMgr.list[0]?.constructor;
          if (OfficerProto && officersMgr.list.length < 64) {
            while (officersMgr.list.length < 64) {
              const idx = officersMgr.list.length;
              const newOff = new OfficerProto();
              newOff.idx = idx;
              newOff.blipId = `police-officer-${idx}`;
              newOff.body.onDamage = t => officersMgr.onDamage(newOff, t);
              newOff.body.onImpact = (t, n, r) => officersMgr.onImpact(newOff, t, n, r);
              officersMgr.list.push(newOff);
            }
          }
        } catch (e) {}

        // ★ 2. 擴充 GPU InstancedMesh 繪製緩衝區 (80 實例容量，確保 64 人全數正常渲染不破圖) ★
        try {
          const expandBuffer = target => {
            if (!target || !target.mesh || target.mesh._gangExpanded) return;
            target.mesh._gangExpanded = true;
            const newCount = 80;
            const oldGeo = target.mesh.geometry;
            const ThreeLib = window.THREE || (g.scene?.constructor?.prototype ? Object.getPrototypeOf(g.scene).constructor : null);

            ['aA', 'aB', 'aC'].forEach(attrName => {
              const oldAttr = target[attrName] || oldGeo?.getAttribute?.(attrName);
              if (oldAttr) {
                const newArr = new Float32Array(newCount * 4);
                if (oldAttr.array) newArr.set(oldAttr.array.subarray(0, Math.min(oldAttr.array.length, newArr.length)));
                const BufferAttr = oldAttr.constructor || (ThreeLib ? ThreeLib.BufferAttribute : null);
                if (BufferAttr) {
                  const newAttr = new BufferAttr(newArr, 4);
                  if (typeof newAttr.setUsage === 'function') newAttr.setUsage(35048); // DynamicDrawUsage
                  oldGeo.setAttribute(attrName, newAttr);
                  target[attrName] = newAttr;
                }
              }
            });

            const oldMat = target.mesh.instanceMatrix;
            if (oldMat) {
              const newMatArr = new Float32Array(newCount * 16);
              if (oldMat.array) newMatArr.set(oldMat.array.subarray(0, Math.min(oldMat.array.length, newMatArr.length)));
              const BufferAttr = oldMat.constructor || (ThreeLib ? ThreeLib.BufferAttribute : null);
              if (BufferAttr) {
                const newMatAttr = new BufferAttr(newMatArr, 16);
                if (typeof newMatAttr.setUsage === 'function') newMatAttr.setUsage(35048);
                target.mesh.instanceMatrix = newMatAttr;
              }
            }
          };

          if (officersMgr.render?.near) expandBuffer(officersMgr.render.near);
          if (officersMgr.render?.far) expandBuffer(officersMgr.render.far);
        } catch (e) {}

        // ★ 3. 獨立種族脫鉤：重寫 activeCount、aliveCount、countRole ★
        // 官方警方計算在場人數時，徹底排除黑道兄弟（黑道兄弟完全不佔用警方名額！）
        try {
          Object.defineProperty(officersMgr, 'activeCount', {
            get() {
              let count = 0;
              for (let t of this.list) {
                if (t.active && t.role !== 'gang' && !t.body?.userData?.gang) {
                  count++;
                }
              }
              return count;
            },
            configurable: true
          });

          Object.defineProperty(officersMgr, 'aliveCount', {
            get() {
              let count = 0;
              for (let t of this.list) {
                if (t.active && t.state !== 'dead' && t.role !== 'gang' && !t.body?.userData?.gang) {
                  count++;
                }
              }
              return count;
            },
            configurable: true
          });

          const origCountRole = officersMgr.countRole?.bind(officersMgr);
          if (origCountRole) {
            officersMgr.countRole = function(role) {
              if (role === 'gang') return 0;
              let count = 0;
              for (let n of this.list) {
                if (n.active && n.role === role && n.role !== 'gang' && n.state !== 'dead' && !n.body?.userData?.gang) {
                  count++;
                }
              }
              return count;
            };
          }

          // ★ 4. 提升官方最高警員配額 (budget.maxOfficers) 至 48 (確保每輛警車下 4 警火力全開) ★
          if (officersMgr.S?.budget) {
            officersMgr.S.budget.maxOfficers = 48;
          }
        } catch (e) {}

        const origThink = officersMgr.think;
        officersMgr.think = function (officer, dt) {
          // 若為我方黑道兄弟，跳過官方警察 AI，由本腳本獨立接管自主巡邏與索敵
          if (officer.role === 'gang' || officer.body?.userData?.gang) return;

          // 尋找 85 米內距離該警員最近的存活黑道兄弟
          const gang = window.__gangSystem;
          let bestMob = null;
          let minDist = 85;

          if (gang && gang.members) {
            for (let m of gang.members) {
              if (m.active && m.officer && m.hp > 0) {
                const dx = m.officer.x - officer.x;
                const dz = m.officer.z - officer.z;
                const dist = Math.hypot(dx, dz);
                if (dist < minDist) {
                  minDist = dist;
                  bestMob = m;
                }
              }
            }
          }

          if (bestMob) {
            // 警方偵測到黑道兄弟！將思考目標臨時置換為該黑道兄弟
            const realP = this.S.P;
            const mobTarget = {
              x: bestMob.officer.x,
              y: bestMob.officer.y,
              z: bestMob.officer.z,
              vx: bestMob.officer.vx || 0,
              vz: bestMob.officer.vz || 0,
              speed: Math.hypot(bestMob.officer.vx || 0, bestMob.officer.vz || 0),
              heading: bestMob.officer.heading || 0,
              onFoot: true,
              inVehicle: false,
              vehicle: null,
              twoWheeler: false,
              alive: bestMob.hp > 0,
              armed: true,    // 標記持械極度危險，誘使警官第一時間拔槍迎戰
              sinceShot: 0.1,  // 視同剛開火，警方優先開槍壓制
              body: bestMob.body,
              stillT: 0,
              teleported: false,
              damage: dmg => bestMob.takeDamage(dmg)
            };

            try {
              this.S.P = mobTarget;
              origThink.call(this, officer, dt);
            } finally {
              this.S.P = realP;
            }

            // ★ 引擎射擊補償：因為黑道的剛體可能被官方子彈射線忽略，這裡強制模擬警察命中的傷害！
            // 當警察距離 40m 內、有拔槍、而且處於瞄準狀態時，有一定機率對黑道造成實質傷害
            if (officer.gun > 0 && minDist < 45 && officer.aim > 0.5 && Math.random() < 0.08) {
              const hitDmg = 5; // 警察步槍和手槍統一扣 5 滴血
              // 模擬命中
              if (Math.random() < 0.20) { // 警察命中率下調為 20%
                bestMob.takeDamage({ amount: hitDmg, source: 'police_simulated' });
                try { 
                  g.fx?.impact?.({ x: bestMob.officer.x, y: bestMob.officer.y + 1, z: bestMob.officer.z }, { x:0, y:1, z:0 }, 'flesh');
                  g.audio?.play?.('bullet_impact', { x: bestMob.officer.x, y: bestMob.officer.y, z: bestMob.officer.z, volume: 0.5 });
                } catch(e){}
              }
            }

          } else {
            origThink.call(this, officer, dt);
          }
        };
      }

      if (carsMgr && !carsMgr.__gangPriorityHooked) {
        carsMgr.__gangPriorityHooked = true;

        // ★ 核心升級：警車編制從 2 人擴充為 4 人！★
        // 1. 鉤住 track：當新警車（巡邏車、追擊車、特警車）生成時，滿載 4 名警員！
        const origTrack = carsMgr.track;
        if (origTrack) {
          carsMgr.track = function (v, role, swat, isScooter) {
            const item = origTrack.apply(this, arguments);
            if (item && !item.scooter) {
              item.crewMax = 4;
              item.crew = 4;
            }
            return item;
          };
        }

        // 2. 鉤住 deploy：當警車停車開門時，強制從四個車門派遣 4 名警員下車戰鬥！
        const origDeploy = carsMgr.deploy;
        if (origDeploy) {
          carsMgr.deploy = function (car, count, state) {
            if (car && !car.scooter) {
              car.crewMax = 4;
              if (car.crew < 4 && car.officers.length === 0) {
                car.crew = 4;
              }
              if (count < 4 && state === 'chase') {
                count = 4;
              }
            }
            return origDeploy.call(this, car, count, state);
          };
        }

        // 3. 升級當前場上現有警車編制至 4 人
        if (carsMgr.list) {
          for (let c of carsMgr.list) {
            if (c && !c.scooter) {
              c.crewMax = 4;
              if (c.crew < 4 && c.officers.length === 0) {
                c.crew = 4;
              }
            }
          }
        }

        const origPursue = carsMgr.pursue;
        carsMgr.pursue = function (car, dt, dist) {
          if (car && !car.scooter) {
            car.crewMax = 4;
            if (car.crew < 4 && car.officers.length === 0) {
              car.crew = 4;
            }
          }
          const gang = window.__gangSystem;
          let bestMob = null;
          let minDist = 110;

          if (gang && gang.members && car.v?.body) {
            for (let m of gang.members) {
              if (m.active && m.officer && m.hp > 0) {
                const dx = m.officer.x - car.v.body.x;
                const dz = m.officer.z - car.v.body.z;
                const d = Math.hypot(dx, dz);
                if (d < minDist) {
                  minDist = d;
                  bestMob = m;
                }
              }
            }
          }

          if (bestMob) {
            const realP = this.S.P;
            const mobTarget = {
              x: bestMob.officer.x,
              y: bestMob.officer.y,
              z: bestMob.officer.z,
              vx: bestMob.officer.vx || 0,
              vz: bestMob.officer.vz || 0,
              speed: Math.hypot(bestMob.officer.vx || 0, bestMob.officer.vz || 0),
              heading: bestMob.officer.heading || 0,
              onFoot: true,
              inVehicle: false,
              vehicle: null,
              twoWheeler: false,
              alive: bestMob.hp > 0,
              armed: true,
              sinceShot: 0.1,
              body: bestMob.body,
              stillT: 0,
              teleported: false,
              damage: dmg => bestMob.takeDamage(dmg)
            };

            try {
              this.S.P = mobTarget;
              origPursue.call(this, car, dt, dist);
            } finally {
              this.S.P = realP;
            }
          } else {
            origPursue.call(this, car, dt, dist);
          }
        };
      }

      // ★ 5. 直升機 AI 仇恨與索敵重定向：讓空中直升機盤旋、探照燈與機槍俯衝掃射黑道兄弟 ★
      if (g.police && !g.police.__gangHeliHooked) {
        g.police.__gangHeliHooked = true;

        const getHeliTarget = (realPlayer) => {
          const gang = window.__gangSystem;
          if (!gang || !gang.members) return realPlayer;
          const alive = gang.members.filter(m => m.active && m.officer && m.hp >= 1 && m.officer.state !== 'dead');
          if (alive.length === 0) return realPlayer;

          // 優先反擊剛向直升機開火的黑道兄弟
          if (window.__lastHeliAttacker && window.__lastHeliAttacker.active && window.__lastHeliAttacker.hp >= 1 && (Date.now() - (window.__lastHeliAttackTime || 0) < 6000)) {
            const m = window.__lastHeliAttacker;
            return {
              x: m.officer.x, y: m.officer.y, z: m.officer.z,
              vx: m.officer.vx || 0, vz: m.officer.vz || 0,
              speed: Math.hypot(m.officer.vx || 0, m.officer.vz || 0),
              heading: m.officer.heading || 0,
              onFoot: true, inVehicle: false, vehicle: null, twoWheeler: false,
              alive: true, armed: true, sinceShot: 0.1, body: m.body, stillT: 0, teleported: false,
              damage: dmg => m.takeDamage(dmg)
            };
          }

          // 搜尋空中直升機位置
          const heliBody = g.dynamics?.list?.find(b => b && b.active && b.userData?.heli);
          const refX = heliBody ? heliBody.x : realPlayer.x;
          const refZ = heliBody ? heliBody.z : realPlayer.z;

          let best = null, minDist = 160;
          for (let m of alive) {
            const d = Math.hypot(m.officer.x - refX, m.officer.z - refZ);
            if (d < minDist) {
              minDist = d;
              best = m;
            }
          }

          if (best) {
            return {
              x: best.officer.x, y: best.officer.y, z: best.officer.z,
              vx: best.officer.vx || 0, vz: best.officer.vz || 0,
              speed: Math.hypot(best.officer.vx || 0, best.officer.vz || 0),
              heading: best.officer.heading || 0,
              onFoot: true, inVehicle: false, vehicle: null, twoWheeler: false,
              alive: true, armed: true, sinceShot: 0.1, body: best.body, stillT: 0, teleported: false,
              damage: dmg => best.takeDamage(dmg)
            };
          }
          return realPlayer;
        };

        const origOfficersUpdate = officersMgr.update;
        if (origOfficersUpdate) {
          officersMgr.update = function(dt) {
            origOfficersUpdate.call(this, dt);
            try {
              if (this.S) {
                this.S.__realPlayerBackup = this.S.P;
                this.S.P = getHeliTarget(this.S.__realPlayerBackup);
              }
            } catch (e) {}
          };
        }

        const origRoadblocksUpdate = rb.update;
        if (origRoadblocksUpdate) {
          rb.update = function(dt) {
            try {
              if (officersMgr.S && officersMgr.S.__realPlayerBackup) {
                officersMgr.S.P = officersMgr.S.__realPlayerBackup;
              }
            } catch (e) {}
            return origRoadblocksUpdate.call(this, dt);
          };
        }

        const origPoliceUpdate = g.police.update;
        if (origPoliceUpdate) {
          g.police.update = function(dt) {
            try {
              return origPoliceUpdate.call(this, dt);
            } finally {
              if (officersMgr.S && officersMgr.S.__realPlayerBackup) {
                officersMgr.S.P = officersMgr.S.__realPlayerBackup;
              }
            }
          };
        }
      }

      return true;
    } catch (e) {
      return false;
    }
  }

  // 黑道兄弟：原生警員骨架模型（不改動骨架動畫，金色戰袍+頭頂「江湖黑道」牌匾，地圖專屬「黑」字圖標）
  class GangMember {
    constructor(index, customSpawn = null) {
      this.index = index;
      this.active = true;
      this.hp = 250;       // ★ 黑道血量 250 (警察的 2.5 倍)
      this.maxHp = 250;
      this.lastHealTime = Date.now();
      this.officer = null;
      this.body = null;
      this.weapon = 'rifle';
      this.titleSprite = null; // 頭頂「江湖黑道」牌匾
      this.goldArmor = null;   // 金色風衣/戰甲 3D 模型
      this.isFling = false;     // ★ 被車輛高速撞擊擊飛狀態
      this.flingVx = 0;
      this.flingVz = 0;
      this.flingVy = 0;
      this.flingTimer = 0;
      this.lastCarHitTime = 0;  // 撞擊冷卻時間戳，防止多幀重複秒殺
      this.walkPhase = Math.random() * Math.PI * 2;
      this.attackTimer = Date.now() + 400 + Math.random() * 400;
      this.target = null;
      this.blipId = `gang-member-blip-${this.index}-${Date.now()}`;
      this._outfitTinted = false;

      const heading = p.rotation?.y || 0;
      const offsetAngle = (this.index - 1.5) * 0.55;
      const followDist = 3.2 + (this.index % 2) * 1.5;
      let spawnX = p.position.x + Math.sin(heading + Math.PI + offsetAngle) * followDist;
      let spawnZ = p.position.z - Math.cos(heading + Math.PI + offsetAngle) * followDist;

      if (customSpawn && Number.isFinite(customSpawn.x) && Number.isFinite(customSpawn.z)) {
        spawnX = customSpawn.x;
        spawnZ = customSpawn.z;
      }

      // 輪替 SWAT 特警 Persona (4: swat-a, 5: swat-b) 避免單一模型實例限制
      const swatPersona = (this.index % 2 === 0) ? 4 : 5;

      // ★ 核心修復：獨立種族分配！★
      hookPoliceTargeting();
      const officersMgr = g.police?._debug?.roadblocks?.officers;
      const officersList = officersMgr?.list || [];
      const assignedOfficers = new Set((window.__gangSystem?.members || []).map(m => m.officer).filter(Boolean));

      // 從物件池尾端（高索引處 47, 46, 45...）逆向指派專屬黑道實體，
      // 讓出前端槽位 (0~35) 專供官方警察與霹靂小組全量生成，完全不排擠警方名額！
      let matchedOfficer = null;
      for (let i = officersList.length - 1; i >= 0; i--) {
        const off = officersList[i];
        if (!assignedOfficers.has(off) && (!off.active || off.role === 'gang' || off.state === 'dead')) {
          matchedOfficer = off;
          break;
        }
      }
      if (!matchedOfficer) {
        for (let i = officersList.length - 1; i >= 0; i--) {
          const off = officersList[i];
          if (!assignedOfficers.has(off)) {
            matchedOfficer = off;
            break;
          }
        }
      }

      this.officer = matchedOfficer;
      this.body = matchedOfficer ? matchedOfficer.body : null;

      // 若警方實體池未成功啟動，標記無效
      if (!this.officer || !this.body) {
        this.active = false;
        return;
      }

      // 確保加入剛體物理系統
      try {
        g.dynamics?.add?.(this.body);
      } catch (e) {}

      // ★ 核心關鍵：將 posed 設為 true，徹底遮斷原版警察 AI think() 邏輯，完全由本腳本接管！
      this.officer.posed = true;
      this.officer.active = true;
      this.officer.dead = false;          // ★ 關鍵修復：徹底清空 dead 標記，防止重用物件被誤判陣亡！
      this.officer.deadT = 0;
      this.officer.fall = 0;
      this.officer.downT = 0;
      this.officer.flinch = 0;
      this.officer.variant = 1;           // 原生特警骨架模型
      this.officer.persona = swatPersona; // 4 或 5
      this.officer.rest = 0;              // ★ 強制清零站崗姿勢，絕不背手/抱胸！
      this.officer.aim = 0.0;             // 平常自然巡邏持槍
      this.officer.crouch = 0.0;
      this.officer.role = 'gang';
      // ★ 核心修復：將原生 state 設為 'return'！
      // 原版引擎逮捕檢測：if (n !== 'dead' && n !== 'down' && n !== 'return' && n !== 'leave' && dist < 1.6)
      // 設為 'return' 後，引擎 100% 排除黑道兄弟，兄弟貼身保護大哥時絕不會誤跳「警察正在逮捕你！快跑！」
      this.officer.state = 'return';
      this.officer.hp = 250;              // ★ 250 血量
      this.officer.maxHp = 250;
      this.officer.x = spawnX;
      this.officer.z = spawnZ;
      this.officer.y = p.position.y;
      this.officer.heading = heading;

      if (this.body) {
        this.body.x = spawnX;
        this.body.z = spawnZ;
        this.body.y = p.position.y;
      }

      // 復位 3D 骨架姿勢（從倒地橫躺復位至直立，防止重用時趴在地上）
      const rootObj = this.officer.hero?.rc?.root || this.officer.mesh;
      if (rootObj) {
        try {
          rootObj.rotation.x = 0;
          rootObj.rotation.y = 0;
          rootObj.rotation.z = 0;
          rootObj.position.y = 0;
        } catch (e) {}
      }

      // 標記物理實體為友軍玩家側單位
      this.body.kind = 'ped';
      this.body.owner = 'player';
      this.body.userData = this.body.userData || {};
      this.body.userData.gang = true;
      this.body.userData.gangMember = this;
      this.body.userData.officer = this.officer;
      
      this._handleDmg = dmg => this.takeDamage(dmg);
      this.body.onDamage = this._handleDmg;
      this.body.damage = this._handleDmg;
      if (this.officer) {
        this.officer.damage = this._handleDmg;
        this.officer.onDamage = this._handleDmg;
      }

      // 分配武器模式（空手/球棒/手槍/步槍/混編）
      this.assignWeapon();

      // 建立金色戰袍外觀與頭頂「江湖黑道」牌匾
      this.createVisuals();

      // ★ 地圖圖標：「警」徹底改為「黑」（純金高反光底色配粗黑字，醒目霸氣）★
      try {
        g.ui?.addBlip?.(this.blipId, {
          x: spawnX,
          z: spawnZ,
          icon: 'police',
          color: '#FFD700',
          glyph: '黑',
          label: { zh: `江湖黑道 #${this.index + 1}`, en: `Mobster #${this.index + 1}` }
        });
      } catch (e) {}

      // 自主漫遊與戰術走位變數
      const initAng = Math.random() * Math.PI * 2;
      const initRad = 5 + Math.random() * 12;
      this.wanderX = spawnX + Math.sin(initAng) * initRad;
      this.wanderZ = spawnZ - Math.cos(initAng) * initRad;
      this.wanderTimer = Date.now() + 5000 + Math.random() * 4000;
      this.pauseTimer = 0;
      this.strafeDir = Math.random() < 0.5 ? -1 : 1;
      this.strafeTimer = Date.now() + 2000;
    }

    // 建立頭頂「江湖黑道」牌匾與金色戰袍 Overlay
    createVisuals() {
      if (!this.titleSprite) {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 512;
          canvas.height = 140;
          const ctx = canvas.getContext('2d');

          // 深黑曜石圓角底板
          ctx.fillStyle = 'rgba(10, 12, 18, 0.90)';
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(14, 14, 484, 112, 18);
          } else {
            ctx.rect(14, 14, 484, 112);
          }
          ctx.fill();

          // 霸氣雙重純金立體邊框
          ctx.strokeStyle = '#ffd700';
          ctx.lineWidth = 4.5;
          ctx.stroke();

          ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(22, 22, 468, 96);

          // 四角裝飾金釘
          ctx.fillStyle = '#ffb300';
          [[26, 26], [486, 26], [26, 114], [486, 114]].forEach(([x, y]) => {
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
          });

          // 清晰高對比字體「江湖黑道」（去除散光光暈，改用粗黑描邊保證遠處清晰可讀）
          const fontFam = '"Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif';
          ctx.font = `bold 64px ${fontFam}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          // 先繪製深黑厚描邊（防止筆畫黏在一起，徹底消除散光感）
          ctx.shadowBlur = 0;
          ctx.lineWidth = 8;
          ctx.strokeStyle = '#000000';
          ctx.lineJoin = 'round';
          ctx.strokeText('江 湖 黑 道', 256, 70);

          // 核心填色：亮金色，確保遠距離依然分明
          const grad = ctx.createLinearGradient(0, 40, 0, 100);
          grad.addColorStop(0, '#FFFFFF');
          grad.addColorStop(0.3, '#FFF066');
          grad.addColorStop(1, '#FFB700');
          ctx.fillStyle = grad;
          ctx.fillText('江 湖 黑 道', 256, 70);

          const texture = new T.CanvasTexture(canvas);
          texture.minFilter = T.LinearFilter;
          texture.magFilter = T.LinearFilter;
          texture.needsUpdate = true;
          const spriteMat = new T.SpriteMaterial({
            map: texture,
            transparent: true,
            depthWrite: false
          });
          this.titleSprite = new T.Sprite(spriteMat);
          this.titleSprite.scale.set(1.8, 0.49, 1.0);
          g.scene.add(this.titleSprite);
        } catch (e) {}
      }

      // ★ 頭頂血量條 Sprite（動態更新 HP 百分比）★
      if (!this.hpBarSprite) {
        try {
          const hpCanvas = document.createElement('canvas');
          hpCanvas.width = 256;
          hpCanvas.height = 40;
          this._hpCanvas = hpCanvas;
          this._hpCtx = hpCanvas.getContext('2d');
          this._hpTexture = new T.CanvasTexture(hpCanvas);
          this._hpTexture.needsUpdate = true;
          const hpMat = new T.SpriteMaterial({
            map: this._hpTexture,
            transparent: true,
            depthWrite: false
          });
          this.hpBarSprite = new T.Sprite(hpMat);
          this.hpBarSprite.scale.set(1.2, 0.19, 1.0);
          g.scene.add(this.hpBarSprite);
          this._lastHpDraw = -1;
        } catch (e) {}
      }
    }

    // 更新血量條 canvas（僅在 HP 變化時重繪，節省效能）
    updateHpBar() {
      if (!this._hpCanvas || !this._hpCtx) return;
      const ratio = Math.max(0, Math.min(1, this.hp / this.maxHp));
      const drawKey = Math.round(ratio * 100);
      if (drawKey === this._lastHpDraw) return;
      this._lastHpDraw = drawKey;

      const ctx = this._hpCtx;
      const w = 256, h = 40;
      ctx.clearRect(0, 0, w, h);

      // 外框背景
      ctx.fillStyle = 'rgba(0, 0, 0, 0.70)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(4, 4, w - 8, h - 8, 8);
      else ctx.rect(4, 4, w - 8, h - 8);
      ctx.fill();

      // HP 填充條（綠 > 黃 > 紅）
      const barW = (w - 16) * ratio;
      const color = ratio > 0.5 ? '#33ff66' : ratio > 0.25 ? '#ffcc00' : '#ff3333';
      ctx.fillStyle = color;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(8, 8, barW, h - 16, 5);
      else ctx.rect(8, 8, barW, h - 16);
      ctx.fill();

      // HP 數值文字（取整 Math.max(0, Math.ceil(this.hp))，消除浮點小數）
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${Math.max(0, Math.ceil(this.hp))}/${this.maxHp}`, w / 2, h / 2);

      if (this._hpTexture) this._hpTexture.needsUpdate = true;
    }

    removeVisuals() {
      if (this.titleSprite) {
        try { g.scene.remove(this.titleSprite); } catch (e) {}
        this.titleSprite = null;
      }
      if (this.hpBarSprite) {
        try { g.scene.remove(this.hpBarSprite); } catch (e) {}
        this.hpBarSprite = null;
        this._hpCanvas = null;
        this._hpCtx = null;
        this._hpTexture = null;
      }
    }

    // 武器動態裝配（預設突擊步槍，僅支援 突擊步槍/警用配槍/雙槍混編）
    assignWeapon() {
      const sys = window.__gangSystem;
      let mode = sys?.weaponType || 'rifle';
      if (mode === 'bat' || mode === 'fists') {
        mode = 'rifle';
        if (sys) sys.weaponType = 'rifle';
      }

      if (mode === 'mixed') {
        const pool = window.__gangMixedWeapons || ['rifle', 'pistol'];
        this.weapon = pool[this.index % pool.length];
      } else if (mode === 'pistol' || mode === 'rifle') {
        this.weapon = mode;
      } else {
        this.weapon = 'rifle';
      }

      if (this.officer) {
        if (this.weapon === 'rifle') {
          this.officer.gun = 2;    // 雙手握持突擊步槍
          this.officer.weapon = 2;
        } else {
          this.officer.gun = 1;    // 單手握持手槍
          this.officer.weapon = 1;
        }
      }
    }

    takeDamage(dmg) {
      // 若該兄弟已被釋放或不活躍，絕不攔截傷害！直接對原生實體扣血，防止變成無敵殭屍警察
      if (!this.active) {
        if (this.officer) {
          const amt = (typeof dmg === 'number' ? dmg : (dmg?.amount || dmg?.damage || 30));
          this.officer.hp = Math.max(0, (this.officer.hp || 100) - amt);
          if (this.officer.hp <= 0) {
            this.officer.state = 'dead';
            this.officer.active = false;
          }
        }
        return;
      }
      if (window.__gangSystem.godMode) return; // 僅在開啟友軍無敵時免疫
      if (dmg && dmg.source === 'gang') return; // 黑道隊友間不互傷

      let amount = 30;
      if (typeof dmg === 'number') {
        amount = dmg;
      } else if (dmg) {
        if (typeof dmg.amount === 'number') amount = dmg.amount;
        else if (typeof dmg.damage === 'number') amount = dmg.damage;
        else if (typeof dmg.hp === 'number') amount = dmg.hp;
      }

      this.hp -= amount;
      this.updateHpBar();
      if (this.officer) {
        this.officer.hp = Math.max(0, this.hp);
        this.officer.flinch = 1.0; // 受擊抖動反饋
      }
      
      // ★ 核心修復：血量低於 1 或被致死傷害命中時，立即執行陣亡判定！★
      if (this.hp < 1) {
        this.die();
      }
    }

    die() {
      if (!this.active) return;
      this.active = false;
      this.hp = 0;
      this.removeVisuals();
      try { g.ui?.removeBlip?.(this.blipId); } catch (e) {}
      try {
        g.audio?.play?.('ped_scream', {
          x: this.officer?.x || p.position.x,
          y: (this.officer?.y || p.position.y) + 1,
          z: this.officer?.z || p.position.z,
          rate: 0.85
        });
      } catch (e) {}

      if (this.officer) {
        this.officer.hp = 0;
        this.officer.active = false;
        this.officer.posed = false;
        delete this.officer.dead; // ★ 徹底刪除自定義標記，絕不污染池子物件
        this.officer.state = 'dead';
        this.officer.deadT = 0.1;
        this.officer.rest = 0;
        this.officer.gun = 0;
        this.officer.aim = 0;
        this.officer.reach = 0;
        this.officer.stride = 0;
        this.officer.vx = 0;
        this.officer.vz = 0;

        // 倒地橫躺姿勢
        const rootObj = this.officer.hero?.rc?.root || this.officer.mesh;
        if (rootObj) {
          try {
            rootObj.rotation.x = -Math.PI / 2;
            rootObj.position.y = Math.max(0, this.officer.y - 0.7);
          } catch (e) {}
        }
      }

      if (this.body) {
        delete this.body.userData.gang;
        delete this.body.userData.gangMember;
        this.body.kind = 'police';
        this.body.owner = 'police';
        this.body.active = false;
        try { g.dynamics?.remove?.(this.body); } catch (e) {}
      }

      // 同步更新堂口 HUD 剩餘人數，讓玩家可隨時按 X 派計程車補兵！
      updateGangUI();
    }

    destroy() {
      this.active = false;
      this.removeVisuals();
      try { g.ui?.removeBlip?.(this.blipId); } catch (e) {}
      if (this.officer) {
        this.officer.active = false;
        this.officer.posed = false;
        this.officer.rest = 0;
        this.officer.gun = 0;
        this.officer.weapon = 1;
        this.officer.hp = 100;
        this.officer.maxHp = 100;
        this.officer.state = 'idle';
        if (this.body) {
          delete this.body.userData.gang;
          delete this.body.userData.gangMember;
          delete this.body.onDamage; // 拔除自定義傷害鉤子，防止其變成無敵實體
          delete this.body.damage;
          this.body.kind = 'police';
          this.body.owner = 'police';
          this.body.active = false;
          try { g.dynamics?.remove?.(this.body); } catch (e) {}
        }
      }
    }

    // 索敵邏輯：
    // 0. 極限最高優先級：若警察太靠近 (20m 以內)，黑道全員優先擊斃警察（自衛防禦與拔除近身威脅）
    // 1. 次高優先級：空中警用直升機 (140m 內，全員防空集火)；
    // 2. 剩餘存活黑道對半戰術分工：50% 車>人 (85m)，50% 人>車 (75m)
    findTarget() {
      if (!this.officer) return null;
      const dynList = g.dynamics?.list || [];

      // 搜尋地面警察輔助函式（自動過濾死亡與友軍黑道，優先鎖定最近者）
      const findPolice = (maxRange = 75) => {
        let targetOfficer = null;
        let minDist = maxRange;
        for (let b of dynList) {
          if (!b || !b.active || b.kind !== 'police' || b.userData?.heli || b.userData?.gang) continue;
          if (b.userData?.officer && (b.userData.officer.state === 'dead' || b.userData.officer.hp <= 0)) continue;
          if (typeof b.hp === 'number' && b.hp <= 0) continue;
          const dx = b.x - this.officer.x;
          const dz = b.z - this.officer.z;
          const dist = Math.hypot(dx, dz);
          if (dist <= minDist) {
            minDist = dist;
            targetOfficer = { body: b, x: b.x, y: b.y + 1.2, z: b.z, kind: 'police', dist };
          }
        }
        return targetOfficer;
      };

      // 0. ★ 最高優先級：若警察太靠近 (20m 以內)，黑道優先擊斃警察！
      const closeCop = findPolice(20);
      if (closeCop) {
        return closeCop;
      }

      // 1. 次高優先級：空中警用直升機 (140m 內，全員防空集火)
      for (let b of dynList) {
        if (!b || !b.active) continue;
        if (b.userData?.heli || (b.owner === 'police' && b.height > 2.2 && b.mass > 1500)) {
          const dx = b.x - this.officer.x;
          const dz = b.z - this.officer.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 140) {
            return { body: b, x: b.x, y: b.y + 1.0, z: b.z, kind: 'heli', dist };
          }
        }
      }

      // 搜尋警車 (85m 內)
      const findCar = () => {
        const vehList = g.vehicles?.list || [];
        for (let v of vehList) {
          if (!v || v.destroyed || !v.body) continue;
          const isPolice = v.kind === 'police' || v.sirenOn || v.lightsOn || g.police?.isPoliceVehicle?.(v.id);
          if (isPolice) {
            const dx = v.body.x - this.officer.x;
            const dz = v.body.z - this.officer.z;
            const dist = Math.hypot(dx, dz);
            if (dist < 85) {
              return { body: v.body, vehicle: v, x: v.body.x, y: v.body.y + 0.8, z: v.body.z, kind: 'car', dist };
            }
          }
        }
        return null;
      };

      // 2. 依當前「存活黑道」動態精確對半分工：
      // 一半兄弟：直升機 > 車 > 人
      // 另一半兄弟：直升機 > 人 > 車
      const aliveMembers = window.__gangSystem?.members?.filter(m => m.active && m.officer && m.hp >= 1 && m.officer.state !== 'dead') || [];
      const myRank = aliveMembers.indexOf(this);
      const preferCar = (myRank >= 0) ? (myRank % 2 !== 0) : (this.index % 2 !== 0);

      if (preferCar) {
        // ★ 戰術反載具小組：車 > 人
        const car = findCar();
        if (car) return car;
        const cop = findPolice(75);
        if (cop) return cop;
      } else {
        // ★ 戰術反步兵小組：人 > 車
        const cop = findPolice(75);
        if (cop) return cop;
        const car = findCar();
        if (car) return car;
      }

      return null;
    }

    // 遠程開火（警用配槍 🔫 / 突擊步槍 💥）
    fireAt(target) {
      if (!target || !this.active || !this.officer) return;
      const isPistol = (this.weapon === 'pistol');
      const dmg = isPistol ? 15 : 20;  // 手槍 15，步槍 20 (基準 1 倍傷害)
      const soundRate = isPistol ? 1.02 : 1.25;

      const muzzleX = this.officer.x + Math.sin(this.officer.heading) * 0.45;
      const muzzleY = this.officer.y + 1.35;
      const muzzleZ = this.officer.z - Math.cos(this.officer.heading) * 0.45;

      const targetX = target.x + (Math.random() - 0.5) * (isPistol ? 0.45 : 0.7);
      const targetY = target.y + (Math.random() - 0.5) * 0.5;
      const targetZ = target.z + (Math.random() - 0.5) * (isPistol ? 0.45 : 0.7);

      // 槍口閃光與彈道軌跡
      try {
        g.fx?.flash?.(muzzleX, muzzleY, muzzleZ, isPistol ? 2.5 : 3.5, 2.0, 1.0, 0.4, 0.07);
        g.fx?.tracer?.(muzzleX, muzzleY, muzzleZ, targetX, targetY, targetZ);
        g.fx?.flash?.(targetX, targetY, targetZ, 2.0, 1.6, 1.0, 0.3, 0.06);
        g.audio?.play?.('gunshot', { x: muzzleX, y: muzzleY, z: muzzleZ, rate: soundRate + (Math.random() - 0.5) * 0.1, volume: 0.95 });
        g.audio?.play?.('bullet_impact', { x: targetX, y: targetY, z: targetZ, volume: 0.75 });
      } catch (e) {}

      // 實質傷害判定
      // ★ 命中率：手槍 20%，步槍連發 10%
      const hitChance = isPistol ? 0.20 : 0.10;
      if (Math.random() > hitChance) return; // 沒打中就直接結束，不扣血

      const aimDir = {
        x: (targetX - muzzleX) || 0.1,
        y: (targetY - muzzleY) || 0.1,
        z: (targetZ - muzzleZ) || 0.1
      };

      const wpnKind = isPistol ? 'pistol' : 'rifle';

      if (target.kind === 'heli') {
        // ★ 恢復對直升機 1 倍傷害（步槍 20 / 手槍 15）
        window.__lastHeliAttacker = this;
        window.__lastHeliAttackTime = Date.now();
        if (target.body?.onDamage) {
          target.body.onDamage({ amount: dmg, source: 'gang', weapon: wpnKind, dir: aimDir, point: { x: targetX, y: targetY, z: targetZ } });
        }
        if (target.body?.userData?.heli) {
          const h = target.body.userData;
          if (h.hp !== undefined) {
            h.hp -= dmg;
            if (h.hp <= 0 && h.state !== 'crash' && h.state !== 'wreck') {
              h.state = 'crash';
              window.__gangSystem.kills.heli++;
              updateGangUI();
            }
          }
        }
      } else if (target.kind === 'car') {
        // ★ 恢復對警車 1 倍傷害（步槍 20 / 手槍 15）
        if (target.vehicle?.damage) {
          target.vehicle.damage({ amount: dmg, source: 'gang', weapon: wpnKind, point: { x: targetX, y: targetY, z: targetZ }, dir: aimDir });
        } else if (target.body?.onDamage) {
          target.body.onDamage({ amount: dmg, source: 'gang', weapon: wpnKind });
        }
        if (target.vehicle && (target.vehicle.health <= 0 || target.vehicle.destroyed)) {
          window.__gangSystem.kills.cars++;
          updateGangUI();
        }
      } else if (target.kind === 'police') {
        // 對警察 1 倍傷害
        const off = target.body?.userData?.officer;
        const wasAlive = off ? (off.state !== 'dead' && off.hp > 0) : true;
        if (target.body?.onDamage) {
          target.body.onDamage({ amount: dmg, source: 'gang', weapon: wpnKind, dir: aimDir, point: { x: targetX, y: targetY, z: targetZ } });
        }
        if (wasAlive && off && (off.state === 'dead' || off.hp <= 0)) {
          window.__gangSystem.kills.police++;
          updateGangUI();
        }
      }
    }

    // 每幀更新循環
    update(dt) {
      if (!this.active) return;

      // ★ 動態修補：確保剛體回調絕對不會被引擎覆蓋，徹底解決「第一波招募無敵」問題！
      if (this.body && this.body.onDamage !== this._handleDmg) {
        this.body.onDamage = this._handleDmg;
        this.body.damage = this._handleDmg;
        if (this.officer) {
          this.officer.onDamage = this._handleDmg;
          this.officer.damage = this._handleDmg;
        }
      }

      // ★ 核心修復：隨時同步原生 officer 生命值與死亡/受傷狀態 ★
      if (this.officer) {
        // 若原生 officer 的 hp 受到車撞、爆炸波及扣血，即時同步至黑道自身 hp
        if (typeof this.officer.hp === 'number' && this.officer.hp < this.hp) {
          this.hp = this.officer.hp;
          this.updateHpBar();
        }

        // ★ 自動回血機制：每 20 秒回復 50 滴血 (20% 血量)
        if (Date.now() - this.lastHealTime > 20000) {
          this.lastHealTime = Date.now();
          if (this.hp > 0 && this.hp < this.maxHp) {
            this.hp = Math.min(this.maxHp, this.hp + 50);
            this.officer.hp = this.hp;
            this.updateHpBar();
            // 閃爍綠光代表回血
            try { g.fx?.flash?.(this.officer.x, this.officer.y + 1, this.officer.z, 2.5, 1.5, 0.2, 1.0, 0.2); } catch(e){}
          }
        }

        if (this.hp < 1) {
          this.die();
          return;
        }

        // 維持 return 狀態以防誤判逮捕
        this.officer.state = 'return';
        this.officer.active = true;
        // ★ 核心升級：警車/載具高速撞擊擊飛拋物線空中飛行與受創翻滾物理 ★
        if (this.isFling) {
          // 拋物線空中位移
          this.officer.x += this.flingVx * dt;
          this.officer.z += this.flingVz * dt;
          this.officer.y += this.flingVy * dt;

          // 空氣阻力與水平速度衰減
          const drag = Math.pow(0.22, dt);
          this.flingVx *= drag;
          this.flingVz *= drag;

          // 重力加速度 (g = -18 m/s²)
          this.flingVy -= 18 * dt;

          // 地面貼合與反彈碰撞
          let groundY = p.position?.y || 0;
          try {
            groundY = g.groundAt ? g.groundAt(this.officer.x, this.officer.z, this.officer.y) : (g.plan?.groundHeight?.(this.officer.x, this.officer.z) || groundY);
          } catch (e) {}

          if (this.officer.y <= groundY) {
            this.officer.y = groundY;
            if (this.flingVy < -3.5) {
              // 著地二次微彈跳與摩擦
              this.flingVy = -this.flingVy * 0.22;
              this.flingVx *= 0.5;
              this.flingVz *= 0.5;
              try { g.audio?.play?.('punch', { x: this.officer.x, y: this.officer.y, z: this.officer.z, volume: 0.45 }); } catch (e) {}
            } else {
              this.flingVy = 0;
              this.flingVx *= 0.75;
              this.flingVz *= 0.75;
            }
          }

          // 同步物理剛體
          if (this.body) {
            this.body.x = this.officer.x;
            this.body.y = this.officer.y;
            this.body.z = this.officer.z;
            this.body.vx = this.flingVx;
            this.body.vz = this.flingVz;
          }

          // 維持倒地翻滾受創姿態
          this.officer.state = 'down';
          this.officer.fall = 1.0;
          this.officer.downT = 0;
          this.officer.stride = 0;

          // 擊飛計時結束且垂直速度已平穩：起身拍灰復原繼續戰鬥！
          if (Date.now() > this.flingTimer && Math.abs(this.flingVy) < 0.4) {
            this.isFling = false;
            this.officer.state = 'return';
            this.officer.fall = 0;
            this.officer.posed = true;
            this.officer.downT = 0;
            this.downTimer = 0;
          }

          // 同步頭頂牌匾與血條位置
          if (this.titleSprite) this.titleSprite.position.set(this.officer.x, this.officer.y + 2.35, this.officer.z);
          if (this.hpBarSprite) {
            this.hpBarSprite.position.set(this.officer.x, this.officer.y + 1.95, this.officer.z);
            this.updateHpBar();
          }
          try { g.ui?.updateBlip?.(this.blipId, this.officer.x, this.officer.z); } catch (e) {}
          return; // 滯空拋物線翻滾中，暫停自主索敵與漫遊
        }

        // ★ 核心修復：處理被車撞倒或受擊擊倒狀態（state==='down'），倒地1秒後自動拍灰站起繼續戰鬥！絕不躺在地上裝死！★
        if (this.officer.state === 'down' || (this.officer.fall && this.officer.fall > 0.25)) {
          if (!this.downTimer) this.downTimer = Date.now() + 1000;
          if (Date.now() > this.downTimer) {
            this.officer.state = 'patrol';
            this.officer.fall = 0;
            this.officer.posed = true;
            this.officer.downT = 0;
            this.downTimer = 0;
          } else {
            return; // 倒地過渡中，暫時停止位移與索敵
          }
        } else {
          this.downTimer = 0;
        }
      } else if (this.hp < 1) {
        this.die();
        return;
      }

      const playerX = p.position.x;
      const playerY = p.position.y;
      const playerZ = p.position.z;

      const distToPlayer = Math.hypot(playerX - this.officer.x, playerZ - this.officer.z);



      // ★ 限制黑道預設不能超過玩家 50m（可在設定面板自訂 15m~200m）★
      const maxFollowDist = window.__gangSystem.maxFollowDistance || 50;
      const isExceedingDistance = distToPlayer > maxFollowDist;

      // 檢查是否卡在街區建築物牆角：若距離玩家 > 18m 且卡在原地超過 2 秒沒移動，判定為卡牆
      if (!this._lastCheckX) {
        this._lastCheckX = this.officer.x;
        this._lastCheckZ = this.officer.z;
        this._lastCheckTime = Date.now();
      } else if (Date.now() - this._lastCheckTime > 2000) {
        const movedDist = Math.hypot(this.officer.x - this._lastCheckX, this.officer.z - this._lastCheckZ);
        this.isStuck = (distToPlayer > 18 && movedDist < 0.6);
        this._lastCheckX = this.officer.x;
        this._lastCheckZ = this.officer.z;
        this._lastCheckTime = Date.now();
      }

      // 若遠超距離上限（> maxFollowDist + 15m）或被建築物卡住脫節，立即瞬移到大哥身邊防掉隊！
      if (isExceedingDistance || this.isStuck || distToPlayer > (maxFollowDist + 15)) {
        this.isStuck = false;
        const ang = (this.index / 12) * Math.PI * 2 + Math.random() * 0.4;
        const safeDist = 4.5 + Math.random() * 5.0;
        this.officer.x = playerX + Math.sin(ang) * safeDist;
        this.officer.z = playerZ - Math.cos(ang) * safeDist;
        const gh = g.plan?.groundHeight?.(this.officer.x, this.officer.z);
        this.officer.y = (gh !== undefined && Number.isFinite(gh)) ? gh : playerY;
        this.wanderX = this.officer.x;
        this.wanderZ = this.officer.z;
        if (this.body) {
          this.body.x = this.officer.x;
          this.body.z = this.officer.z;
          this.body.y = this.officer.y;
          this.body.vx = 0;
          this.body.vz = 0;
        }
      }

      // 1. 索敵戰鬥循環（若超過限制距離則強制放棄遠程目標，優先回防大哥身邊）
      const target = isExceedingDistance ? null : this.findTarget();
      this.target = target;

      let moveSpeed = 0;
      let goalX = this.officer.x;
      let goalZ = this.officer.z;

      if (target) {
        const dx = target.x - this.officer.x;
        const dz = target.z - this.officer.z;
        const horizDist = Math.max(0.2, Math.hypot(dx, dz));
        const targetHeading = Math.atan2(dx, -dz);

        this.officer.heading = targetHeading;

        // --- 全員遠程槍械（警用配槍 🔫 / 突擊步槍 💥）戰鬥 AI ---
        this.officer.aim = 1.0;
        this.officer.gun = (this.weapon === 'pistol') ? 1 : 2;

        // 計算對空或對人仰角
        const pitch = Math.atan2(target.y - (this.officer.y + 1.35), horizDist);
        this.officer.pitch = pitch;

        if (Date.now() > this.attackTimer) {
          this.fireAt(target);
          this.attackTimer = Date.now() + (this.weapon === 'pistol' ? 280 : 180) + Math.random() * 120;
        }

        // 戰鬥走位切換計時
        if (Date.now() > this.strafeTimer) {
          this.strafeDir = Math.random() < 0.5 ? -1 : 1;
          this.strafeTimer = Date.now() + 1500 + Math.random() * 2000;
        }
        const rightX = -Math.sin(targetHeading + Math.PI / 2);
        const rightZ = Math.cos(targetHeading + Math.PI / 2);

        if (target.kind !== 'heli' && horizDist > 32) {
          // 太遠時自主前推尋求壓制
          goalX = this.officer.x + Math.sin(targetHeading) * 4.0;
          goalZ = this.officer.z - Math.cos(targetHeading) * 4.0;
          moveSpeed = 4.2;
        } else if (target.kind !== 'heli' && horizDist < 9) {
          // 太近時戰術後撤保證射擊安全距離
          goalX = this.officer.x - Math.sin(targetHeading) * 3.5;
          goalZ = this.officer.z + Math.cos(targetHeading) * 3.5;
          moveSpeed = 3.6;
        } else {
          // 左右戰術側向滑步走位壓制
          goalX = this.officer.x + rightX * this.strafeDir * 2.8;
          goalZ = this.officer.z + rightZ * this.strafeDir * 2.8;
          moveSpeed = 2.6;
        }
      } else {
        // 非戰鬥狀態 或 超過跟隨距離限制回防
        this.officer.aim = 0.0;
        this.officer.pitch = 0.0;
        this.officer.gun = (this.weapon === 'pistol' ? 1 : 2);
        this.officer.rest = 0; // ★ 強制保持 0，絕不允許手背身後或抱胸站崗！

        if (isExceedingDistance || distToPlayer > 36) {
          // 超過限制距離或距離過遠：疾速狂奔跟上大哥！
          const toPlayerAngle = Math.atan2(playerX - this.officer.x, -(playerZ - this.officer.z));
          this.officer.heading = toPlayerAngle;
          this.wanderX = playerX;
          this.wanderZ = playerZ;
          this.pauseTimer = 0;
          goalX = playerX;
          goalZ = playerZ;
          moveSpeed = isExceedingDistance ? Math.min(14.0, distToPlayer * 0.35 + 5.0) : Math.min(12.5, distToPlayer * 0.38 + 3.8);
        } else {
          // 玩家身處附近：在街區範圍（5~25米）自由自主巡邏探索
          if (Date.now() > this.pauseTimer) {
            const distToWander = Math.hypot(this.wanderX - this.officer.x, this.wanderZ - this.officer.z);
            if (distToWander < 1.2 || Date.now() > this.wanderTimer) {
              // 到達巡邏點，原地駐足停步觀察 2.5~5 秒
              this.pauseTimer = Date.now() + 2500 + Math.random() * 3200;
              this.wanderTimer = this.pauseTimer + 7000 + Math.random() * 6000;

              // 隨機選取街區下一個巡邏漫遊點（5~22米範圍隨機探勘）
              const ang = Math.random() * Math.PI * 2;
              const rad = 5 + Math.random() * 18;
              this.wanderX = playerX + Math.sin(ang) * rad;
              this.wanderZ = playerZ - Math.cos(ang) * rad;
            } else {
              // 悠閒巡邏步行
              goalX = this.wanderX;
              goalZ = this.wanderZ;
              moveSpeed = 2.2 + (this.index % 3) * 0.35;
            }
          } else {
            // 駐足警戒停步中：自然微轉頭環顧四周街景
            moveSpeed = 0;
            this.officer.heading += dt * 0.32 * (this.index % 2 === 0 ? 1 : -1);
          }
        }
      }

      // 兄弟成員間的自然防擠壓排斥力，避免兩人重疊卡位
      let sepX = 0, sepZ = 0;
      const allMembers = window.__gangSystem.members || [];
      for (let other of allMembers) {
        if (other === this || !other.active || !other.officer) continue;
        const ox = this.officer.x - other.officer.x;
        const oz = this.officer.z - other.officer.z;
        const d2 = ox * ox + oz * oz;
        if (d2 < 3.5 && d2 > 0.01) {
          const d = Math.sqrt(d2);
          sepX += (ox / d) * (1.9 - d) * 1.6;
          sepZ += (oz / d) * (1.9 - d) * 1.6;
        }
      }

      const toGoalX = (goalX - this.officer.x) + sepX;
      const toGoalZ = (goalZ - this.officer.z) + sepZ;
      const distToGoal = Math.hypot(toGoalX, toGoalZ);

      if (distToPlayer > 120) {
        // 瞬間脫離過遠（如玩家瞬移或光速飛行）：戰術集結瞬移
        const ang = Math.random() * Math.PI * 2;
        const rad = 6 + Math.random() * 8;
        this.officer.x = playerX + Math.sin(ang) * rad;
        this.officer.z = playerZ - Math.cos(ang) * rad;
        this.officer.y = playerY;
        this.wanderX = this.officer.x;
        this.wanderZ = this.officer.z;
      } else if (distToGoal > 0.4 && moveSpeed > 0) {
        const currentSpeed = Math.min(moveSpeed, distToGoal * 2.6);
        const moveDirX = toGoalX / distToGoal;
        const moveDirZ = toGoalZ / distToGoal;

        this.officer.vx = moveDirX * currentSpeed;
        this.officer.vz = moveDirZ * currentSpeed;
        this.officer.x += this.officer.vx * dt;
        this.officer.z += this.officer.vz * dt;

        if (!target) {
          this.officer.heading = Math.atan2(this.officer.vx, -this.officer.vz);
        }

        // 自然擺腿與踏步動畫
        this.walkPhase += dt * currentSpeed * 2.5;
        this.officer.phase = this.walkPhase;
        this.officer.stride = Math.min(1.0, currentSpeed / 4.8);
      } else {
        this.officer.vx *= 0.5;
        this.officer.vz *= 0.5;
        this.officer.stride = 0;
      }

      // 地面高程貼合
      let groundY = playerY;
      try {
        groundY = g.groundAt ? g.groundAt(this.officer.x, this.officer.z, this.officer.y) : (g.plan?.groundHeight?.(this.officer.x, this.officer.z) || playerY);
      } catch (e) {}
      this.officer.y += (groundY - this.officer.y) * Math.min(1, dt * 14);

      // 同步物理 Body
      if (this.body) {
        this.body.x = this.officer.x;
        this.body.y = this.officer.y;
        this.body.z = this.officer.z;
        this.body.heading = this.officer.heading;
      }



      // 同步頭頂「江湖黑道」霸氣牌匾
      if (this.titleSprite && this.officer) {
        this.titleSprite.position.set(this.officer.x, this.officer.y + 2.35, this.officer.z);
      }

      // 同步血量條位置與重繪
      if (this.hpBarSprite && this.officer) {
        this.hpBarSprite.position.set(this.officer.x, this.officer.y + 1.95, this.officer.z);
        this.updateHpBar();
      }



      // 同步地圖圖標（「警」改成「黑」）
      try {
        g.ui?.updateBlip?.(this.blipId, this.officer.x, this.officer.z);
      } catch (e) {}
    }
  }

  // 堂口陣列管理（僅在手動點擊面板設定人數、或初始載入時同步，戰鬥中陣亡請呼叫計程車支援）
  function syncGangMemberCount(manual = false) {
    const sys = window.__gangSystem;
    if (!sys) return;
    const target = sys.targetCount;

    // 縮減人數：若當前人數大於目標，解散多餘人員
    while (sys.members.length > target) {
      const m = sys.members.pop();
      try { m.destroy(); } catch (e) {}
    }

    // 只有手動調整人數時，才主動補充新成員；戰鬥中陣亡請呼叫計程車支援
    if (manual) {
      sys.members = sys.members.filter(m => m && m.active && m.officer && m.hp >= 1 && m.officer.state !== 'dead');
      let added = 0;
      while (sys.members.length < target && added < 8) {
        added++;
        const idx = sys.members.length;
        const mob = new GangMember(idx);
        if (mob.active && mob.officer) {
          sys.members.push(mob);
        }
      }
    }

    updateGangUI();
    hookPoliceTargeting();
  }

  // ----------------------------------------------------
  // 地圖「警」改「黑」圖標管理系統（Minimap & Fullmap Blips）
  // ----------------------------------------------------
  const __blipCanvasCache = new Map();

  function getCrispBlackBlip(size, isGang) {
    const s = Math.max(16, size || 24);
    const key = `${s}_${isGang}`;
    if (__blipCanvasCache.has(key)) return __blipCanvasCache.get(key);

    const cv = document.createElement('canvas');
    cv.width = cv.height = s;
    const ctx = cv.getContext('2d');
    const r = s * 0.44;
    ctx.translate(s / 2, s / 2);

    // 圓形底色：黑道兄弟純金底黑字 / 敵對警察深曜石底白字
    ctx.fillStyle = isGang ? '#FFD700' : '#141824';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // 粗邊框
    ctx.lineWidth = Math.max(1.5, s * 0.09);
    ctx.strokeStyle = isGang ? '#000000' : '#4da3ff';
    ctx.stroke();

    // 醒目巨大「黑」字（填滿 66% 比例，小地圖一眼看清）
    const fontFam = '"Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif';
    ctx.font = `900 ${Math.round(s * 0.66)}px ${fontFam}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isGang ? '#000000' : '#FFFFFF';
    ctx.fillText('黑', 0, s * 0.04);

    __blipCanvasCache.set(key, cv);
    return cv;
  }

  // 攔截並改寫 g.ui.addBlip，確保所有警方圖標 glyph 全部改為「黑」
  if (g.ui && !window.__origAddBlip) {
    window.__origAddBlip = g.ui.addBlip.bind(g.ui);
    g.ui.addBlip = function (id, data) {
      if (data && (data.icon === 'police' || (id && String(id).includes('police')))) {
        data.glyph = '黑';
        if (id && (String(id).includes('gang') || String(id).includes('mobster'))) {
          data.color = '#FFD700';
        }
      }
      return window.__origAddBlip(id, data);
    };
  }

  function syncMinimapBlips() {
    try {
      const blipsHolder = g.ui?._debug?.minimap?.blips;
      if (!blipsHolder || !blipsHolder.map) return;
      const map = blipsHolder.map;
      const bpIconSize = g.ui?._debug?.minimap?.bp?.icon || 24;

      const gang = window.__gangSystem;
      const gangBlipIds = new Set();

      if (gang && gang.members) {
        for (let m of gang.members) {
          if (m.active) {
            gangBlipIds.add(m.blipId);
            if (m.officer && m.officer.blipId) gangBlipIds.add(m.officer.blipId);
          }
        }
      }

      // 1. 確保所有現有地圖上的 police blip 都寫「黑」
      for (let [id, b] of map.entries()) {
        const isGangBlip = gangBlipIds.has(id) || String(id).startsWith('gang-');
        if (isGangBlip || b.icon === 'police' || String(id).includes('police')) {
          b.glyph = '黑';
          if (isGangBlip) {
            b.color = '#FFD700';
          }
          // 強制替換超清晰高對比「黑」圖標 Canvas，徹底防止小地圖顯示舊版「警」
          b.spr = getCrispBlackBlip(bpIconSize, isGangBlip);
          b.sprPx = bpIconSize;
        }
      }

      // 2. 確保每個存活的黑道兄弟都有 blip 且座標精確同步
      if (gang && gang.members) {
        for (let m of gang.members) {
          if (m.active && m.officer) {
            const ox = m.officer.x;
            const oz = m.officer.z;
            if (!map.has(m.blipId)) {
              g.ui.addBlip(m.blipId, {
                x: ox,
                z: oz,
                icon: 'police',
                color: '#FFD700',
                glyph: '黑',
                label: { zh: `江湖黑道 #${m.index + 1}`, en: `Mobster #${m.index + 1}` }
              });
            } else {
              g.ui.updateBlip(m.blipId, ox, oz);
            }
            const gb = map.get(m.blipId);
            if (gb) {
              gb.x = ox;
              gb.z = oz;
              gb.glyph = '黑';
              gb.color = '#FFD700';
              gb.spr = getCrispBlackBlip(bpIconSize, true);
              gb.sprPx = bpIconSize;
            }
          }
        }
      }
    } catch (e) {}
  }

  // ----------------------------------------------------
  // ★ 計程車支援系統（車頂黃金皇冠、玩家可開可破壞、20秒防塞車超時下車）★
  // ----------------------------------------------------
  window.__activeTaxiReinforcements = [];

  // 建立車頂 3D 尊貴黃金皇冠模型
  function createTaxiCrownMesh() {
    try {
      const crownGroup = new T.Group();

      // 純金高反光材質
      const goldMat = new T.MeshStandardMaterial({
        color: 0xffd700,
        metalness: 0.92,
        roughness: 0.15,
        emissive: 0x332200
      });
      // 皇家璀璨紅寶石材質
      const rubyMat = new T.MeshStandardMaterial({
        color: 0xff1133,
        metalness: 0.75,
        roughness: 0.15,
        emissive: 0x440011
      });

      // 1. 皇冠底部金質底座環
      const baseGeo = new T.CylinderGeometry(0.24, 0.26, 0.08, 16);
      const baseMesh = new T.Mesh(baseGeo, goldMat);
      baseMesh.position.y = 0.04;
      crownGroup.add(baseMesh);

      // 2. 底圈飾邊珍珠金珠 (環繞 8 顆)
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        const beadGeo = new T.SphereGeometry(0.025, 8, 8);
        const beadMesh = new T.Mesh(beadGeo, goldMat);
        beadMesh.position.set(Math.sin(ang) * 0.25, 0.04, Math.cos(ang) * 0.25);
        crownGroup.add(beadMesh);
      }

      // 3. 皇冠王冠尖角 (5 個向外外擴的立體金錐)
      const numPoints = 5;
      for (let i = 0; i < numPoints; i++) {
        const ang = (i / numPoints) * Math.PI * 2;
        const ptGeo = new T.ConeGeometry(0.045, 0.22, 5);
        const ptMesh = new T.Mesh(ptGeo, goldMat);
        ptMesh.position.set(Math.sin(ang) * 0.22, 0.18, Math.cos(ang) * 0.22);
        ptMesh.rotation.z = -Math.sin(ang) * 0.24;
        ptMesh.rotation.x = Math.cos(ang) * 0.24;
        crownGroup.add(ptMesh);

        // 尖端璀璨紅寶石
        const gemGeo = new T.SphereGeometry(0.030, 8, 8);
        const gemMesh = new T.Mesh(gemGeo, rubyMat);
        gemMesh.position.set(Math.sin(ang) * 0.255, 0.29, Math.cos(ang) * 0.255);
        crownGroup.add(gemMesh);
      }

      // 4. 皇冠中央大寶石球
      const centerGemGeo = new T.SphereGeometry(0.058, 10, 10);
      const centerGem = new T.Mesh(centerGemGeo, rubyMat);
      centerGem.position.set(0, 0.16, 0);
      crownGroup.add(centerGem);

      // 縮放並抬高至計程車車頂（燈牌後方車頂位置）
      crownGroup.scale.set(1.45, 1.45, 1.45);
      crownGroup.position.set(0, 1.44, -0.05);
      return crownGroup;
    } catch (e) {
      return null;
    }
  }

  function callTaxiReinforcements() {
    const sys = window.__gangSystem;
    if (!sys) return;

    // ★ 計程車載人支援機制 ★
    // 先清洗已陣亡或無效實體
    sys.members = sys.members.filter(m => m.active && m.officer && m.officer.active && m.hp >= 1 && m.officer.state !== 'dead');

    const target = sys.targetCount;
    const aliveBefore = sys.members.length;
    const deadCount = Math.max(0, target - aliveBefore);

    if (deadCount === 0) {
      g.events?.emit?.('notify', {
        text: { zh: `🕶️ 目前黑道兄弟全員在線 (${aliveBefore}/${target})，無人員陣亡！`, en: `All squad members alive!` },
        kind: 'neutral', duration: 2.8
      });
      return;
    }

    // 尋找生成點 (60公尺外)
    const heading = p.rotation?.y || 0;
    const spawnAngle = heading + Math.PI + (Math.random() - 0.5);
    const spawnDist = 60; 
    const spawnX = p.position.x + Math.sin(spawnAngle) * spawnDist;
    const spawnZ = p.position.z - Math.cos(spawnAngle) * spawnDist;
    const spawnHeading = Math.atan2(p.position.x - spawnX, -(p.position.z - spawnZ));

    let taxiObj = null;
    try {
      taxiObj = g.vehicles?.spawn?.('taxi', spawnX, spawnZ, spawnHeading, { driver: 'none', speed: 20, locked: false });
    } catch (e) {}

    if (!taxiObj) {
      try { taxiObj = g.vehicles?.spawn?.('sedan', spawnX, spawnZ, spawnHeading, { driver: 'none', speed: 20, color: 15909376, locked: false }); } catch (e) {}
    }

    if (taxiObj) {
      if (taxiObj.object) {
        const crown = createTaxiCrownMesh();
        if (crown) taxiObj.object.add(crown);
      }
      
      window.__activeTaxiReinforcements.push({
        taxi: taxiObj,
        count: deadCount,
        spawnTime: Date.now(),
        spawned: false
      });

      g.events?.emit?.('notify', {
        text: { zh: `🚕 皇冠計程車已從鄰近街區派出，載著 ${deadCount} 名兄弟趕來支援！`, en: `Taxi dispatched with ${deadCount} mobsters!` },
        kind: 'good', duration: 3.5
      });
      
      try { g.audio?.play?.('horn', { volume: 0.85 }); } catch (e) {}
    } else {
      // 如果計程車生成失敗，直接原地復活
      syncGangMemberCount(true);
      g.events?.emit?.('notify', { text: { zh: `🕶️ 已直接補充 ${deadCount} 名兄弟！`, en: `Spawned ${deadCount} mobsters!` }, kind: 'good' });
    }
    updateGangUI();
  }

  function updateTaxiReinforcements(dt) {
    const sys = window.__gangSystem;
    if (!sys || !window.__activeTaxiReinforcements) return;
    
    for (let i = window.__activeTaxiReinforcements.length - 1; i >= 0; i--) {
      const task = window.__activeTaxiReinforcements[i];
      if (task.spawned) continue;

      const taxi = task.taxi;
      if (!taxi || !taxi.body) {
        task.spawned = true;
        continue;
      }

      const dx = p.position.x - taxi.body.x;
      const dz = p.position.z - taxi.body.z;
      const dist = Math.hypot(dx, dz);
      const elapsed = Date.now() - task.spawnTime;

      // 簡單模擬計程車開向玩家
      if (dist > 15) {
        const dirX = dx / dist;
        const dirZ = dz / dist;
        const speed = 25; // 趕路車速
        taxi.body.vx = dirX * speed;
        taxi.body.vz = dirZ * speed;
        // 將車頭對準玩家
        taxi.body.rotation = Math.atan2(dirX, -dirZ);
        if (taxi.object) {
          taxi.object.rotation.y = taxi.body.rotation;
        }
      }

      // 抵達 (15m內) 或塞車超時 (10秒) -> 自動下車
      if (dist <= 15 || elapsed > 10000) {
        task.spawned = true;
        taxi.body.vx = 0;
        taxi.body.vz = 0;
        
        try { g.audio?.play?.('car_door_close', { volume: 0.9 }); } catch (e) {}
        
        // 在計程車旁生成黑道兄弟
        let added = 0;
        while (sys.members.length < sys.targetCount && added < task.count) {
          added++;
          const idx = sys.members.length;
          // 傳遞客製化生成座標給 GangMember constructor
          const mob = new GangMember(idx, { 
            x: taxi.body.x + (Math.random() - 0.5) * 4, 
            z: taxi.body.z + (Math.random() - 0.5) * 4 
          });
          if (mob.active && mob.officer) {
            sys.members.push(mob);
          }
        }
        
        g.events?.emit?.('subtitle', { text: '大哥我們來幫你了！', speaker: '黑道堂口兄弟', duration: 4.5 });
        window.__activeTaxiReinforcements.splice(i, 1);
        updateGangUI();
      }
    }
  }

  // ----------------------------------------------------
  // ★ 地圖點選傳送核心（滑鼠右鍵直接傳送 / 頂部按鈕切換瞬移模式，0衝突·完美解鎖移動）★
  // ----------------------------------------------------
  window.__mapTeleportEnabled = false; // ★ 預設為 false（原版導航模式），絕不與正常查看地圖/設導航衝突！

  function teleportPlayerTo(targetX, targetZ) {
    if (!Number.isFinite(targetX) || !Number.isFinite(targetZ)) return;

    let targetY = p.position.y;
    try {
      const gh = g.plan?.groundHeight?.(targetX, targetZ);
      if (gh !== undefined && Number.isFinite(gh)) {
        targetY = gh + 1.0;
      } else if (g.groundAt) {
        const ga = g.groundAt(targetX, targetZ, p.position.y);
        if (ga !== undefined && Number.isFinite(ga)) targetY = ga + 1.0;
      }
    } catch (e) {}

    // 1. 同步玩家所在載具（開車/騎車時連車帶人傳送）
    const veh = g.vehicles?.playerVehicle;
    if (veh && veh.body) {
      veh.body.x = targetX;
      veh.body.z = targetZ;
      veh.body.y = targetY;
      veh.body.vx = 0;
      veh.body.vy = 0;
      veh.body.vz = 0;
      if (veh.object) {
        veh.object.position.set(targetX, targetY, targetZ);
      }
    }

    // 2. 傳送玩家本體並重設物理剛體狀態
    p.position.set(targetX, targetY, targetZ);
    if (p.body) {
      p.body.x = targetX;
      p.body.y = targetY;
      p.body.z = targetZ;
      p.body.vx = 0;
      p.body.vy = 0;
      p.body.vz = 0;
      p.body.falling = false;
      p.body.grounded = true;
    }
    p.airborne = false;
    p.grounded = true;

    // 3. 落地安全保護：免疫墜落與撞擊傷害 6 秒
    window.__fallImmuneUntil = Date.now() + 6000;

    // 4. 同步召集並傳送存活的江湖黑道兄弟護駕
    const gang = window.__gangSystem;
    if (gang && gang.members) {
      const aliveMembers = gang.members.filter(m => m.active && m.officer);
      aliveMembers.forEach((m, idx) => {
        const ang = (idx / (aliveMembers.length || 1)) * Math.PI * 2;
        const rad = 3.5 + (idx % 2) * 1.5;
        const ox = targetX + Math.sin(ang) * rad;
        const oz = targetZ - Math.cos(ang) * rad;
        m.officer.x = ox;
        m.officer.z = oz;
        m.officer.y = targetY;
        m.wanderX = ox;
        m.wanderZ = oz;
        if (m.body) {
          m.body.x = ox;
          m.body.y = targetY;
          m.body.z = oz;
          m.body.vx = 0;
          m.body.vz = 0;
        }
      });
    }

    // 5. 播放瞬移科幻音效
    try {
      g.audio?.play?.('nitro', { volume: 0.85, rate: 1.5 });
      g.audio?.play?.('pickup', { volume: 0.9 });
    } catch (e) {}

    // 6. 彈出遊戲原生通知
    g.events?.emit?.('notify', {
      text: {
        zh: `⚡ 已瞬移抵達目標街區！[${Math.round(targetX)}, ${Math.round(targetZ)}]`,
        en: `Teleported to [${Math.round(targetX)}, ${Math.round(targetZ)}]!`
      },
      kind: 'good',
      duration: 3.5
    });

    // 7. ★★★ 徹底關閉地圖、彈出 nav.scope、完全解鎖角色移動與空白鍵！★★★
    const fullmap = g.ui?._debug?.fullmap;
    if (fullmap) {
      try {
        fullmap.gps?.set?.(null); // 清除衝突的導航點，避免留下雜亂導航線
      } catch (e) {}

      // 關鍵核心：呼叫 fullmap.close() 執行 this.nav.pop(this.scope) 彈出輸入攔截！
      try {
        fullmap.close();
      } catch (e) {}

      // 同步呼叫全域 UI 關閉
      try {
        g.ui?.closeMenu?.();
      } catch (e) {}

      // 觸發右上角原生關閉鈕，確保事件鏈完整
      try {
        const closeBtn = document.querySelector('.fm-close');
        if (closeBtn) closeBtn.click();
      } catch (e) {}

      // 強制清空地圖按鍵快取，防止按 Space 跳躍誤判為地圖按鍵！
      if (fullmap.keys) fullmap.keys.clear();
      if (fullmap.pointers) fullmap.pointers.clear();
      fullmap.isOpen = false;
      if (fullmap.el) fullmap.el.classList.remove('show');
    }

    // 確保視窗焦點與玩家控制器立刻恢復靈敏響應
    try {
      if (document.activeElement && document.activeElement.blur) {
        document.activeElement.blur();
      }
      window.focus();
      if (g.input?.focus) g.input.focus();
    } catch (e) {}
  }

  function setupMapTeleportHook() {
    try {
      const fullmap = g.ui?._debug?.fullmap;
      if (!fullmap) return;

      // 1. Hook toggleWaypointAt（左鍵點擊地圖時）
      if (!fullmap.__origToggleWaypoint) {
        fullmap.__origToggleWaypoint = fullmap.toggleWaypointAt.bind(fullmap);
        fullmap.toggleWaypointAt = function (clientX, clientY) {
          // 只有在地圖開啟中才允許動作
          if (!this.isOpen) return;

          // 若玩家主動切換為「點圖瞬移模式」，左鍵直接瞬移前往
          if (window.__mapTeleportEnabled) {
            const worldPos = this.screenToWorld(clientX, clientY);
            if (worldPos && Number.isFinite(worldPos.x) && Number.isFinite(worldPos.z)) {
              teleportPlayerTo(worldPos.x, worldPos.z);
              return;
            }
          }
          // 否則維持原版設定 GPS 導航路線，雙方絕不衝突！
          return this.__origToggleWaypoint(clientX, clientY);
        };
      }

      // 2. ★ 支援滑鼠右鍵直接瞬移（左鍵導航、右鍵瞬移，分工明確，0衝突！）★
      if (fullmap.canvas && !fullmap.canvas.__hasTeleportRightClick) {
        fullmap.canvas.__hasTeleportRightClick = true;
        fullmap.canvas.addEventListener('contextmenu', e => {
          e.preventDefault();
          e.stopPropagation();
          if (!fullmap.isOpen) return;
          const worldPos = fullmap.screenToWorld(e.clientX, e.clientY);
          if (worldPos && Number.isFinite(worldPos.x) && Number.isFinite(worldPos.z)) {
            teleportPlayerTo(worldPos.x, worldPos.z);
          }
        }, { capture: true });
      }

      // 3. 在大地圖介面上建立瞬移模式切換膠囊按鈕
      if (fullmap.el && !document.getElementById('tgta-map-tp-badge')) {
        const tpBadge = document.createElement('div');
        tpBadge.id = 'tgta-map-tp-badge';
        tpBadge.className = 'fm-teleport-badge tp-off';
        tpBadge.innerHTML = `
          <span class="tp-badge-icon" style="font-size:16px;">⚡</span>
          <span id="tp-badge-label">左鍵瞬移模式：<strong style="color:#aaa;">【關閉】(右鍵隨時可傳送)</strong></span>
        `;
        tpBadge.title = '點擊切換左鍵模式：【關閉】左鍵為原版設定導航 / 【開啟】左鍵點擊直接傳送（地圖上隨時點擊右鍵皆可直接瞬移！）';

        tpBadge.addEventListener('click', e => {
          e.stopPropagation();
          e.preventDefault();
          window.__mapTeleportEnabled = !window.__mapTeleportEnabled;
          updateTpBadgeVisuals();
          try { g.audio?.play?.('ui_click', { volume: 0.7 }); } catch (err) {}
        });

        fullmap.el.appendChild(tpBadge);
        updateTpBadgeVisuals();
      }
    } catch (e) {}
  }

  function updateTpBadgeVisuals() {
    const badge = document.getElementById('tgta-map-tp-badge');
    const label = document.getElementById('tp-badge-label');
    const fullmap = g.ui?._debug?.fullmap;
    const isEnabled = window.__mapTeleportEnabled;

    if (badge) {
      badge.classList.toggle('tp-off', !isEnabled);
      badge.style.borderColor = isEnabled ? '#00e5ff' : 'rgba(255, 255, 255, 0.3)';
      badge.style.boxShadow = isEnabled ? '0 0 22px rgba(0, 229, 255, 0.65)' : 'none';
      badge.style.background = isEnabled ? 'rgba(8, 22, 36, 0.95)' : 'rgba(15, 20, 28, 0.88)';
    }
    if (label) {
      label.innerHTML = isEnabled
        ? `左鍵瞬移模式：<strong style="color:#00ffcc;">【開啟】左鍵點擊即刻前往</strong>`
        : `左鍵瞬移模式：<strong style="color:#bbb;">【關閉】原版導航路線 (右鍵直接瞬移)</strong>`;
    }
    if (fullmap && fullmap.canvas) {
      fullmap.canvas.style.cursor = isEnabled ? 'crosshair' : 'default';
    }
  }

  // ----------------------------------------------------
  // 5. 手機與 PC 整合控制面板（HUD：頂部固定式，取消黑廂型車）
  // ----------------------------------------------------
  const OLD_HUD_ID = 'tgta-cheat-hud-root';
  const existingHud = document.getElementById(OLD_HUD_ID);
  if (existingHud) existingHud.remove();

  const hudWrap = document.createElement('div');
  hudWrap.id = OLD_HUD_ID;
  hudWrap.innerHTML = `
    <style>
      #${OLD_HUD_ID} {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 99999;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Microsoft JhengHei", sans-serif;
        user-select: none;
        -webkit-user-select: none;
        transition: opacity 0.25s ease, visibility 0.25s ease;
      }
      #${OLD_HUD_ID}.menu-hidden {
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
      .tgta-btn {
        background: rgba(18, 22, 32, 0.85);
        border: 2px solid rgba(0, 255, 255, 0.4);
        color: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
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
      /* ★ 頂部快捷選單列：100% 固定式（頂部置中固定，不飄移、不擋右上地圖鍵） ★ */
      .tgta-top-dock {
        position: absolute;
        top: max(12px, env(safe-area-inset-top));
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 8px;
        pointer-events: auto;
      }
      .tgta-dock-btn {
        height: 38px;
        padding: 0 13px;
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
      .tgta-dock-btn.gang-active {
        border-color: #ff9933;
        color: #ffcc66;
        background: rgba(50, 25, 10, 0.88);
        box-shadow: 0 0 18px rgba(255, 153, 51, 0.7);
      }
      .tgta-dock-btn.map-btn {
        border-color: #00e5ff;
        color: #00e5ff;
        background: rgba(10, 35, 50, 0.82);
      }
      .tgta-dock-btn.map-btn:hover {
        background: rgba(0, 229, 255, 0.3);
        box-shadow: 0 0 16px rgba(0, 229, 255, 0.7);
      }

      /* ⚡ 大地圖點圖瞬移膠囊按鈕樣式（浮現在大地圖正上方） */
      .fm-teleport-badge {
        position: absolute;
        top: 68px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 9px 20px;
        background: rgba(8, 14, 24, 0.92);
        border: 2px solid #00e5ff;
        box-shadow: 0 0 22px rgba(0, 229, 255, 0.55), inset 0 0 10px rgba(0, 229, 255, 0.2);
        border-radius: 28px;
        color: #ffffff;
        font-family: -apple-system, BlinkMacSystemFont, "Noto Sans TC", "Segoe UI", sans-serif;
        font-size: 13.5px;
        font-weight: 800;
        cursor: pointer;
        z-index: 1000;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        user-select: none;
        transition: all 0.25s ease;
        letter-spacing: 0.03em;
      }
      .fm-teleport-badge:hover {
        transform: translateX(-50%) scale(1.05);
        box-shadow: 0 0 30px rgba(0, 229, 255, 0.85);
        background: rgba(12, 22, 38, 0.96);
      }
      .fm-teleport-badge.tp-off {
        border-color: rgba(255, 255, 255, 0.28);
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
        color: #8899a6;
        background: rgba(15, 20, 28, 0.88);
      }

      /* 🕶️ 黑道堂口固定式設定面板（緊貼頂部選單正下方置中） */
      .tgta-gang-panel {
        position: absolute;
        top: max(56px, calc(env(safe-area-inset-top) + 46px));
        left: 50%;
        transform: translateX(-50%);
        width: 310px;
        background: rgba(15, 18, 26, 0.94);
        border: 2px solid #ff9933;
        border-radius: 14px;
        padding: 12px 14px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.8), 0 0 20px rgba(255, 153, 51, 0.35);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        pointer-events: auto;
        color: #f0f4f8;
        display: none;
        flex-direction: column;
        gap: 10px;
        font-size: 13px;
      }
      .tgta-gang-panel.open {
        display: flex;
      }
      .tgta-gang-title {
        font-size: 14px;
        font-weight: 800;
        color: #ffaa33;
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid rgba(255, 153, 51, 0.3);
        padding-bottom: 6px;
      }
      .tgta-stepper {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: rgba(0, 0, 0, 0.4);
        border-radius: 8px;
        padding: 4px 6px;
      }
      .tgta-step-btn {
        width: 36px;
        height: 32px;
        font-size: 16px;
        border-radius: 6px;
        border-color: #ff9933;
      }
      .tgta-count-val {
        font-size: 15px;
        font-weight: 800;
        color: #00ffcc;
      }
      .tgta-presets {
        display: flex;
        gap: 4px;
        justify-content: space-between;
      }
      .tgta-preset-btn {
        flex: 1;
        height: 28px;
        font-size: 11px;
        padding: 0 1px;
        border-radius: 6px;
        border-color: rgba(255, 255, 255, 0.25);
      }
      .tgta-wpn-title {
        font-size: 12px;
        font-weight: 700;
        color: #ffaa33;
        margin-top: 2px;
      }
      .tgta-wpn-row {
        display: flex;
        gap: 5px;
        flex-wrap: wrap;
        justify-content: space-between;
      }
      .tgta-wpn-btn {
        flex: 1;
        min-width: 60px;
        height: 28px;
        font-size: 12px;
        border-radius: 6px;
        border-color: rgba(255, 255, 255, 0.25);
      }
      .tgta-wpn-btn.active {
        border-color: #00ffcc;
        color: #00ffcc;
        background: rgba(0, 255, 204, 0.25);
        box-shadow: 0 0 10px rgba(0, 255, 204, 0.4);
      }
      .tgta-gang-stats {
        font-size: 11px;
        color: #aaa;
        background: rgba(0, 0, 0, 0.35);
        padding: 6px 8px;
        border-radius: 6px;
        line-height: 1.5;
      }
      .tgta-stat-hl {
        color: #ffaa33;
        font-weight: bold;
      }

      /* 右側飛行高度與衝刺控制群（飛行開啟時自動浮現，整合防穿透膠囊底板） */
      .tgta-fly-dock {
        position: absolute;
        right: max(14px, env(safe-area-inset-right));
        top: 42%;
        transform: translateY(-50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        padding: 10px 8px;
        background: rgba(10, 15, 24, 0.88);
        border: 2px solid rgba(0, 255, 255, 0.45);
        border-radius: 36px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.8), 0 0 16px rgba(0, 255, 255, 0.2);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        transition: opacity 0.25s ease, transform 0.25s ease;
        z-index: 100000;
        pointer-events: auto !important;
        touch-action: none !important;
        user-select: none !important;
        -webkit-user-select: none !important;
        -webkit-touch-callout: none !important;
      }
      .tgta-fly-dock.hud-hidden {
        opacity: 0;
        pointer-events: none !important;
        transform: translateY(-50%) translateX(25px);
      }
      .tgta-round-btn {
        width: 54px;
        height: 54px;
        border-radius: 50%;
        font-size: 22px;
        pointer-events: auto !important;
        touch-action: none !important;
        user-select: none !important;
        -webkit-user-select: none !important;
        -webkit-touch-callout: none !important;
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
        font-size: 20px;
        pointer-events: auto !important;
        touch-action: manipulation;
        user-select: none !important;
        -webkit-user-select: none !important;
        -webkit-touch-callout: none !important;
      }
      .tgta-turbo-btn.turbo-on {
        background: rgba(255, 51, 102, 0.45);
        border-color: #ff3366;
        color: #ffffff;
        box-shadow: 0 0 22px #ff3366;
      }
      .tgta-dock-btn.hide-dock-btn {
        border-color: rgba(255, 255, 255, 0.35);
        color: #bbb;
        background: rgba(25, 20, 25, 0.85);
      }
      .tgta-dock-btn.hide-dock-btn:hover, .tgta-dock-btn.hide-dock-btn:active {
        background: rgba(50, 25, 40, 0.9);
        border-color: #ff5588;
        color: #fff;
      }
      .tgta-restore-dock {
        position: absolute;
        top: max(12px, env(safe-area-inset-top));
        left: 50%;
        transform: translateX(-50%);
        height: 38px;
        padding: 0 16px;
        font-size: 13px;
        font-weight: 800;
        letter-spacing: 0.05em;
        border-radius: 20px;
        border: 2px solid #ff9933 !important;
        color: #ffcc66 !important;
        background: rgba(25, 18, 12, 0.92) !important;
        box-shadow: 0 0 18px rgba(255, 153, 51, 0.6) !important;
        pointer-events: auto !important;
        z-index: 100000;
        cursor: pointer;
        display: none;
        align-items: center;
        justify-content: center;
        gap: 6px;
      }
      .tgta-hide-ui-btn {
        position: absolute;
        top: max(14px, env(safe-area-inset-top));
        right: max(14px, env(safe-area-inset-right));
        width: 48px;
        height: 48px;
        background: rgba(15, 18, 26, 0.92);
        border: 2px solid rgba(0, 255, 255, 0.6);
        border-radius: 50%;
        color: #fff;
        font-size: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 100000;
        user-select: none !important;
        -webkit-user-select: none !important;
        -webkit-touch-callout: none !important;
        pointer-events: auto !important;
        touch-action: manipulation;
        box-shadow: 0 4px 18px rgba(0, 0, 0, 0.7), 0 0 14px rgba(0, 255, 255, 0.35);
        transition: transform 0.15s ease, background 0.15s ease, opacity 0.2s ease;
      }
      .tgta-hide-ui-btn:active {
        transform: scale(0.9);
        background: rgba(0, 255, 255, 0.3);
      }
      .hud-wrap-hidden .tgta-top-dock,
      .hud-wrap-hidden .tgta-gang-panel,
      .hud-wrap-hidden .tgta-fly-dock,
      .hud-wrap-hidden #tgta-gang-alive-float {
        display: none !important;
      }
      .hud-wrap-hidden .tgta-restore-dock {
        display: flex !important;
      }
    </style>

    <!-- ★ 隱藏時顯示的頂部居中展開小膠囊 ★ -->
    <div id="btn-restore-hud" class="tgta-btn tgta-restore-dock" title="點擊展開外掛UI">🕶️ 展開外掛</div>
    <div id="btn-toggle-hud" class="tgta-hide-ui-btn" title="隱藏外掛UI">👁️</div>
    <!-- ★ 頂部快捷開關（固定置中式） ★ -->
    <div class="tgta-top-dock">
      <div id="btn-toggle-fly" class="tgta-btn tgta-dock-btn">🪽 飛行</div>
      <div id="btn-toggle-swords" class="tgta-btn tgta-dock-btn">⚔️ 光劍</div>
      <div id="btn-toggle-gang" class="tgta-btn tgta-dock-btn">🕶️ 黑道堂口</div>
      <div id="btn-toggle-tp-map" class="tgta-btn tgta-dock-btn map-btn">🗺️ 傳送地圖</div>
      <div id="btn-dock-hide" class="tgta-btn tgta-dock-btn hide-dock-btn" title="隱藏外掛所有按鈕">👁️ 隱藏UI</div>
    </div>

    <!-- 🕶️ 黑道堂口專屬設定面板（固定置中） -->
    <div id="tgta-gang-card" class="tgta-gang-panel">
      <div class="tgta-gang-title">
        <span>🕶️ 堂口支援 (多樣化武器武裝部隊)</span>
        <span id="btn-close-gang" style="cursor:pointer;font-size:16px;">✕</span>
      </div>

      <div class="tgta-stepper">
        <div id="btn-gang-minus" class="tgta-btn tgta-step-btn">➖</div>
        <div class="tgta-count-val">兄弟人數：<span id="gang-count-txt">0</span> 人</div>
        <div id="btn-gang-plus" class="tgta-btn tgta-step-btn">➕</div>
      </div>

      <div class="tgta-presets">
        <div class="tgta-btn tgta-preset-btn" data-cnt="0">解散</div>
        <div class="tgta-btn tgta-preset-btn" data-cnt="1">1名</div>
        <div class="tgta-btn tgta-preset-btn" data-cnt="2">2名</div>
        <div class="tgta-btn tgta-preset-btn" data-cnt="4">4名</div>
        <div class="tgta-btn tgta-preset-btn" data-cnt="6">6名</div>
        <div class="tgta-btn tgta-preset-btn" data-cnt="8">8名</div>
      </div>

      <div class="tgta-wpn-title">武器設定：</div>
      <div class="tgta-wpn-row">
        <div class="tgta-btn tgta-wpn-btn active" data-wpn="rifle" title="突擊步槍全自動掃射 (預設)">💥步槍</div>
        <div class="tgta-btn tgta-wpn-btn" data-wpn="pistol" title="警用手槍精準壓制">🔫手槍</div>
        <div class="tgta-btn tgta-wpn-btn" data-wpn="mixed" title="堂口混編 (步槍與手槍交替)">🎲混編</div>
      </div>

      <div class="tgta-wpn-title" style="margin-top:6px;">跟隨限制距離：</div>
      <div class="tgta-stepper">
        <div id="btn-gang-dist-minus" class="tgta-btn tgta-step-btn">➖</div>
        <div class="tgta-count-val">活動限制：<span id="stat-gang-dist">50m</span></div>
        <div id="btn-gang-dist-plus" class="tgta-btn tgta-step-btn">➕</div>
      </div>

      <div class="tgta-presets">
        <div class="tgta-btn tgta-preset-dist-btn" data-dist="25">25m</div>
        <div class="tgta-btn tgta-preset-dist-btn" data-dist="50">50m(預設)</div>
        <div class="tgta-btn tgta-preset-dist-btn" data-dist="80">80m</div>
        <div class="tgta-btn tgta-preset-dist-btn" data-dist="120">120m</div>
      </div>

      <div id="btn-call-taxi" class="tgta-btn" style="margin-top:8px; height:36px; background:linear-gradient(135deg, #f5c518, #d49a00); color:#1a1400; font-weight:900; font-size:13px; border:2px solid #ffe066; border-radius:8px; display:flex; align-items:center; justify-content:center; gap:6px; cursor:pointer;">
        🕶️ 補充兄弟+計程車 (快捷鍵: B)
      </div>

      <div id="gang-stats-box" class="tgta-gang-stats" style="margin-top:8px;">
        兄弟造型：<span class="tgta-stat-hl" style="color:#ffd700;">★ 耀眼純金戰袍 (頭頂「江湖黑道」)</span><br>
        地圖標記：<span class="tgta-stat-hl" style="color:#00ffcc;">★ 專屬金底黑字「黑」圖標</span><br>
        裝備武器：<span id="stat-gang-weapon" class="tgta-stat-hl">🎲 堂口混編 (步槍/手槍)</span><br>
        活動上限：<span id="stat-gang-dist-val" class="tgta-stat-hl" style="color:#00ffcc;">50m (超距自動狂奔回防)</span><br>
        兄弟血量：<span class="tgta-stat-hl">250 HP (警察血量 100)</span><br>
        警方仇恨：<span class="tgta-stat-hl" style="color:#ff4466;">★ 警方優先攻擊黑道</span><br>
        兄弟存活：<span id="stat-gang-alive" class="tgta-stat-hl">4</span> 人<br>
        殲滅員警：<span id="stat-gang-cops" class="tgta-stat-hl">0</span> 名 | 
        摧毀警車：<span id="stat-gang-cars" class="tgta-stat-hl">0</span> 輛<br>
        擊落空勤直升機：<span id="stat-gang-heli" class="tgta-stat-hl">0</span> 架
      </div>
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
  const btnGang = document.getElementById('btn-toggle-gang');
  const btnTpMap = document.getElementById('btn-toggle-tp-map');
  const gangCard = document.getElementById('tgta-gang-card');
  const btnCloseGang = document.getElementById('btn-close-gang');
  const btnGangMinus = document.getElementById('btn-gang-minus');
  const btnGangPlus = document.getElementById('btn-gang-plus');
  const gangCountTxt = document.getElementById('gang-count-txt');

  const flyPanel = document.getElementById('tgta-fly-panel');
  const btnUp = document.getElementById('btn-fly-up');
  const btnDown = document.getElementById('btn-fly-down');
  const btnTurbo = document.getElementById('btn-fly-turbo');

  // 更新黑道 UI 數字統計
  function updateGangUI() {
    const sys = window.__gangSystem;
    if (sys.weaponType === 'bat' || sys.weaponType === 'fists') {
      sys.weaponType = 'rifle';
    }
    if (gangCountTxt) gangCountTxt.innerText = sys.targetCount;
    const statWpn = document.getElementById('stat-gang-weapon');
    if (statWpn) {
      const curWpn = GANG_WEAPONS[sys.weaponType || 'rifle'];
      statWpn.innerText = curWpn ? curWpn.name.zh : '💥 突擊步槍';
    }
    const statDist = document.getElementById('stat-gang-dist');
    const statDistVal = document.getElementById('stat-gang-dist-val');
    if (statDist) statDist.innerText = `${sys.maxFollowDistance || 50}m`;
    if (statDistVal) statDistVal.innerText = `${sys.maxFollowDistance || 50}m (超距自動狂奔回防)`;

    const statAlive = document.getElementById('stat-gang-alive');
    const statCops = document.getElementById('stat-gang-cops');
    const statCars = document.getElementById('stat-gang-cars');
    const statHeli = document.getElementById('stat-gang-heli');
    const aliveCount = sys.members.filter(m => m.active && m.officer && m.officer.active && m.hp >= 1 && m.officer.state !== 'dead').length;
    if (statAlive) statAlive.innerText = aliveCount;
    if (statCops) statCops.innerText = sys.kills.police;
    if (statCars) statCars.innerText = sys.kills.cars;
    if (statHeli) statHeli.innerText = sys.kills.heli;

    const btnCallTaxi = document.getElementById('btn-call-taxi');
    if (btnCallTaxi) {
      const dead = Math.max(0, sys.targetCount - aliveCount);
      btnCallTaxi.innerText = dead > 0 ? `🕶️ 補充兄弟+計程車 (${dead}人陣亡·按B)` : `🕶️ 補充兄弟+計程車 (全員在線·按B)`;
    }
  }

  // 監聽選單/大地圖狀態，開啟時自動隱藏 HUD，關閉時自動還原
  const updateMenuVisibility = () => {
    const isMenuOpen = !!document.querySelector('.fm.show, .ph-wrap.show, .pause-wrap.show, .ti-wrap.show');
    if (hudWrap) {
      hudWrap.classList.toggle('menu-hidden', isMenuOpen);
    }
  };
  const menuObserver = new MutationObserver(updateMenuVisibility);
  menuObserver.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
  const menuCheckTimer = setInterval(updateMenuVisibility, 300);
  window.__tgtaMenuObserver = menuObserver;
  window.__tgtaMenuTimer = menuCheckTimer;
  updateMenuVisibility();

  function updateHudVisuals() {
    if (btnFly) {
      if (window.__flyModeEnabled) btnFly.classList.add('fly-active');
      else btnFly.classList.remove('fly-active');
    }
    if (btnSwords) {
      if (window.__swordsEnabled) btnSwords.classList.add('swords-active');
      else btnSwords.classList.remove('swords-active');
    }
    if (btnGang) {
      if (window.__gangSystem.targetCount > 0) btnGang.classList.add('gang-active');
      else btnGang.classList.remove('gang-active');
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

  // 綁定觸控與點擊事件（雙重相容觸控螢幕與滑鼠點擊，加入防抖機制徹底杜絕 touchend + click 雙重觸發）
  function bindTouchTap(el, fn) {
    if (!el) return;
    let lastFireTime = 0;
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;

    const fire = (e) => {
      const now = Date.now();
      // 至少間隔 350ms，徹底防止 touchend 後瀏覽器自動補派發 click 事件造成的二段反轉
      if (now - lastFireTime < 350) return;
      lastFireTime = now;
      if (e) {
        try { e.preventDefault(); } catch (err) {}
        try { e.stopPropagation(); } catch (err) {}
      }
      fn(e);
    };

    el.addEventListener('touchstart', e => {
      if (e.changedTouches && e.changedTouches[0]) {
        const t = e.changedTouches[0];
        touchStartX = t.clientX;
        touchStartY = t.clientY;
      }
      touchStartTime = Date.now();
    }, { passive: true });

    el.addEventListener('touchend', e => {
      if (e.changedTouches && e.changedTouches[0]) {
        const t = e.changedTouches[0];
        const dist = Math.hypot(t.clientX - touchStartX, t.clientY - touchStartY);
        if (dist < 30 && Date.now() - touchStartTime < 700) {
          fire(e);
        }
      }
    }, { passive: false });

    el.addEventListener('click', e => {
      fire(e);
    });
  }

  function bindTouchHold(el, onHold, onRelease) {
    if (!el) return;
    let isHolding = false;
    const start = e => {
      if (isHolding) return;
      isHolding = true;
      if (e) {
        try { e.preventDefault(); } catch(err) {}
        try { e.stopPropagation(); } catch(err) {}
      }
      el.classList.add('holding');
      onHold();
    };
    const end = e => {
      if (!isHolding) return;
      isHolding = false;
      if (e) {
        try { e.preventDefault(); } catch(err) {}
        try { e.stopPropagation(); } catch(err) {}
      }
      el.classList.remove('holding');
      onRelease();
    };

    // 禁用長按系統氣泡與選單（防止手機長按彈出放大鏡或複製選單導致中斷）
    el.addEventListener('contextmenu', e => {
      try { e.preventDefault(); e.stopPropagation(); } catch (err) {}
    });

    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('touchend', end, { passive: false });
    el.addEventListener('touchcancel', end, { passive: false });

    el.addEventListener('pointerdown', e => {
      try { el.setPointerCapture(e.pointerId); } catch(err) {}
      start(e);
    });
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);

    el.addEventListener('mousedown', start);
    window.addEventListener('mouseup', () => { if (isHolding) end(); });
  }

  // 綁定頂部快捷按鈕
  bindTouchTap(btnFly, toggleFlyMode);
  bindTouchTap(btnSwords, toggleSwords);
  bindTouchTap(btnGang, () => {
    window.__gangSystem.isPanelOpen = !window.__gangSystem.isPanelOpen;
    gangCard.classList.toggle('open', window.__gangSystem.isPanelOpen);
    updateGangUI();
  });
  bindTouchTap(btnTpMap, () => {
    const fullmap = g.ui?._debug?.fullmap;
    if (fullmap) {
      window.__mapTeleportEnabled = true;
      setupMapTeleportHook();
      updateTpBadgeVisuals();
      if (!fullmap.isOpen) {
        fullmap.open();
      } else {
        fullmap.requestClose();
      }
    }
  });

  const btnToggleHud = document.getElementById('btn-toggle-hud');
  const btnDockHide = document.getElementById('btn-dock-hide');
  const btnRestoreHud = document.getElementById('btn-restore-hud');

  let hudHidden = false;
  function setHudVisibility(hidden) {
    hudHidden = hidden;
    if (hudHidden) {
      hudWrap.classList.add('hud-wrap-hidden');
      if (btnToggleHud) {
        btnToggleHud.innerText = '🙈';
        btnToggleHud.title = '點擊展開外掛UI';
        btnToggleHud.style.opacity = '0.65';
      }
    } else {
      hudWrap.classList.remove('hud-wrap-hidden');
      if (btnToggleHud) {
        btnToggleHud.innerText = '👁️';
        btnToggleHud.title = '隱藏外掛UI';
        btnToggleHud.style.opacity = '1.0';
      }
    }
    try { g.audio?.play?.('ui_click', { volume: 0.8 }); } catch (err) {}
  }

  bindTouchTap(btnToggleHud, () => setHudVisibility(!hudHidden));
  bindTouchTap(btnDockHide, () => setHudVisibility(true));
  bindTouchTap(btnRestoreHud, () => setHudVisibility(false));

  // ★ 關鍵防護：徹底阻止飛行面板區域內的觸控滲透到底層視角層 (.tc-look)
  if (flyPanel) {
    ['pointerdown', 'pointermove', 'touchstart', 'touchmove'].forEach(evt => {
      flyPanel.addEventListener(evt, e => {
        try { e.stopPropagation(); } catch (err) {}
      }, { passive: false });
    });
  }

  bindTouchTap(btnCloseGang, () => {
    window.__gangSystem.isPanelOpen = false;
    gangCard.classList.remove('open');
  });

  // 黑道人數增減
  bindTouchTap(btnGangMinus, () => {
    if (window.__gangSystem.targetCount > 0) {
      window.__gangSystem.targetCount--;
      syncGangMemberCount(true);
      updateHudVisuals();
    }
  });
  bindTouchTap(btnGangPlus, () => {
    if (window.__gangSystem.targetCount < 8) {
      window.__gangSystem.targetCount++;
      syncGangMemberCount(true);
      updateHudVisuals();
    }
  });

  // 預設人數快捷鈕
  hudWrap.querySelectorAll('.tgta-preset-btn').forEach(btn => {
    bindTouchTap(btn, () => {
      const cnt = parseInt(btn.getAttribute('data-cnt'), 10);
      window.__gangSystem.targetCount = cnt;
      syncGangMemberCount(true);
      updateHudVisuals();
    });
  });

  // 跟隨距離調整按鈕
  const btnDistMinus = document.getElementById('btn-gang-dist-minus');
  const btnDistPlus = document.getElementById('btn-gang-dist-plus');
  const btnCallTaxi = document.getElementById('btn-call-taxi');

  bindTouchTap(btnDistMinus, () => {
    window.__gangSystem.maxFollowDistance = Math.max(15, (window.__gangSystem.maxFollowDistance || 50) - 10);
    updateGangUI();
  });
  bindTouchTap(btnDistPlus, () => {
    window.__gangSystem.maxFollowDistance = Math.min(200, (window.__gangSystem.maxFollowDistance || 50) + 10);
    updateGangUI();
  });
  hudWrap.querySelectorAll('.tgta-preset-dist-btn').forEach(btn => {
    bindTouchTap(btn, () => {
      const dist = parseInt(btn.getAttribute('data-dist'), 10);
      window.__gangSystem.maxFollowDistance = dist;
      updateGangUI();
    });
  });
  bindTouchTap(btnCallTaxi, () => {
    callTaxiReinforcements();
  });

  // 堂口武器切換按鈕綁定（混編/球棒/空手/手槍/步槍 即時秒切換）
  hudWrap.querySelectorAll('.tgta-wpn-btn').forEach(btn => {
    bindTouchTap(btn, () => {
      const wpn = btn.getAttribute('data-wpn');
      window.__gangSystem.weaponType = wpn;
      hudWrap.querySelectorAll('.tgta-wpn-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-wpn') === wpn);
      });
      for (let m of window.__gangSystem.members) {
        if (m.active) {
          m.assignWeapon();
        }
      }
      updateGangUI();
      try {
        g.audio?.play?.('ui_menu', { volume: 0.85 });
      } catch (e) {}
    });
  });

  // 升空按鈕（按住上升）
  window.__mobileVert = 0;
  bindTouchHold(btnUp, () => { window.__mobileVert = 1; }, () => { if (window.__mobileVert === 1) window.__mobileVert = 0; });
  // 降落按鈕（按住下降）
  bindTouchHold(btnDown, () => { window.__mobileVert = -1; }, () => { if (window.__mobileVert === -1) window.__mobileVert = 0; });
  // 渦輪音速衝刺切換鈕
  bindTouchTap(btnTurbo, () => {
    window.__mobileTurboEnabled = !window.__mobileTurboEnabled;
    updateHudVisuals();
    try {
      g.audio?.play?.('nitro', { volume: 0.8, rate: window.__mobileTurboEnabled ? 1.2 : 0.8 });
    } catch (e) {}
  });

  // 初始同步友軍黑道人數與地圖傳送 Hook
  syncGangMemberCount(true);
  updateHudVisuals();
  setupMapTeleportHook();
  setInterval(setupMapTeleportHook, 1000);

  // ----------------------------------------------------
  // 6. 鍵盤事件監聽（PC 端相容 X / Z / G / WASD / Shift）
  // ----------------------------------------------------
  if (!window.__flyKeys) window.__flyKeys = new Set();
  const pressedKeys = window.__flyKeys;

  function isKeyDown(...keys) {
    for (let k of keys) {
      if (pressedKeys.has(k) || pressedKeys.has(k.toLowerCase())) return true;
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

        // X 鍵：切換穿牆全載具飛行模式（空戰/空中巡邏）
        if (e.key === 'x' || e.key === 'X') {
          toggleFlyMode();
        }
        // B 鍵：直接補充黑道兄弟 + 附近生成皇冠計程車護駕
        if (e.key === 'b' || e.key === 'B') {
          callTaxiReinforcements();
        }
        // Z 鍵：十六光劍開關
        if (e.key === 'z' || e.key === 'Z') {
          toggleSwords();
        }
        // G 鍵：黑道堂口面板開關 / 增減友軍
        if (e.key === 'g' || e.key === 'G') {
          window.__gangSystem.isPanelOpen = !window.__gangSystem.isPanelOpen;
          gangCard.classList.toggle('open', window.__gangSystem.isPanelOpen);
          updateGangUI();
        }
        // H 鍵：隱藏/顯示外掛按鈕 (HUD Toggle)
        if (e.key === 'h' || e.key === 'H') {
          btnToggleHud?.click();
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
    if (!window.__flyModeEnabled) {
      return window.__origPlayerIntegrate.apply(this, arguments);
    }
    if (g.vehicles?.playerVehicle) {
      return;
    }

    const dt = Math.min(Math.max(Number.isFinite(rawDt) ? rawDt : 1 / 60, 0.001), 0.1);

    if (g.camera) {
      g.camera.getWorldDirection(camDir);
    } else {
      const yaw = p.cam?.yaw || 0;
      camDir.set(Math.sin(yaw), 0, -Math.cos(yaw));
    }
    camDir.y = 0;
    camDir.normalize();

    camRight.set(-camDir.z, 0, camDir.x);

    let moveX = 0;
    let moveZ = 0;

    // ★ 讀取手機虛擬搖桿與遊戲原生輸入軸（moveX / moveY）
    let joyX = 0;
    let joyY = 0;
    const inp = g.input;
    if (inp) {
      if (inp.virtual && (Math.abs(inp.virtual.moveX || 0) > 0.05 || Math.abs(inp.virtual.moveY || 0) > 0.05)) {
        joyX = inp.virtual.moveX || 0;
        joyY = inp.virtual.moveY || 0;
      } else if (typeof inp.axis === 'function') {
        joyX = inp.axis('moveX') || 0;
        joyY = inp.axis('moveY') || 0;
      } else if (inp.axes) {
        joyX = inp.axes.moveX || 0;
        joyY = inp.axes.moveY || 0;
      }
    }
    if (Math.hypot(joyX, joyY) < 0.05 && p?.act) {
      joyX = p.act.moveX || 0;
      joyY = p.act.moveY || 0;
    }

    let inputX = joyX;
    let inputY = joyY;

    if (isKeyDown('KeyW', 'ArrowUp', 'w')) inputY = Math.max(inputY, 1);
    if (isKeyDown('KeyS', 'ArrowDown', 's')) inputY = Math.min(inputY, -1);
    if (isKeyDown('KeyA', 'ArrowLeft', 'a')) inputX = Math.min(inputX, -1);
    if (isKeyDown('KeyD', 'ArrowRight', 'd')) inputX = Math.max(inputX, 1);

    if (Math.hypot(inputX, inputY) > 0.08) {
      // camDir: 朝前方, camRight: 朝右方
      // inputY > 0: 向前, inputY < 0: 向後
      // inputX > 0: 向右, inputX < 0: 向左
      moveX = camDir.x * inputY + camRight.x * inputX;
      moveZ = camDir.z * inputY + camRight.z * inputX;
      const horizLen = Math.hypot(moveX, moveZ);
      if (horizLen > 1) {
        moveX /= horizLen;
        moveZ /= horizLen;
      }
    }

    let moveY = 0;
    if (window.__mobileVert !== 0) {
      moveY = window.__mobileVert; // +1: 上升, -1: 下降
    }
    if (isKeyDown('Space', ' ')) moveY = Math.max(moveY, 1);
    if (isKeyDown('KeyC', 'c', 'ShiftRight')) moveY = Math.min(moveY, -1);

    const isTurbo = window.__mobileTurboEnabled || isKeyDown('ShiftLeft', 'Shift', 'KeyE', 'e');
    const flySpeed = isTurbo ? 68.0 : 25.0;

    p.position.x += moveX * flySpeed * dt;
    p.position.y += moveY * flySpeed * dt;
    p.position.z += moveZ * flySpeed * dt;

    if (horizLen > 0.001 && p.rotation) {
      p.rotation.y = Math.atan2(moveX, -moveZ);
    }

    p.velocity?.set?.(moveX * flySpeed, moveY * flySpeed, moveZ * flySpeed);
    if (p.body) {
      p.body.x = p.position.x;
      p.body.y = p.position.y;
      p.body.z = p.position.z;
      p.body.vx = moveX * flySpeed;
      p.body.vy = moveY * flySpeed;
      p.body.vz = moveZ * flySpeed;
    }

    p.airborne = true;
    p.grounded = false;
  };

  // ----------------------------------------------------
  // 8. 全載具飛行核心＋黑道兄弟/光劍即時更新主循環
  // ----------------------------------------------------
  let camDir = new T.Vector3();
  let camRight = new T.Vector3();
  window.__mobileVert = 0;

  function toggleFlyMode() {
    window.__flyModeEnabled = !window.__flyModeEnabled;
    const isFlying = window.__flyModeEnabled;

    if (isFlying) {
      try {
        p.position.y += 2.0;
        if (p.body) p.body.y += 2.0;
      } catch (e) {}
    } else {
      window.__fallImmuneUntil = Date.now() + 8000;
      window.__mobileVert = 0;
    }

    updateHudVisuals();

    try {
      g.audio?.play?.(isFlying ? 'whoosh' : 'ui_menu', { volume: 0.9, rate: isFlying ? 1.3 : 0.9 });
      g.events?.emit('notify', {
        text: {
          zh: isFlying ? '🪽 天神全載具飛行：已啟動！（徒步/機車/轎車皆支援飛行）' : '🪽 天神全載具飛行：已降落關閉（獲得 8 秒安全著陸防摔傷）',
          en: isFlying ? 'Vehicle & Foot Flight Activated!' : 'Flight Deactivated!'
        },
        kind: isFlying ? 'good' : 'neutral',
        duration: 3.0
      });
    } catch (e) {}
  }

  // ----------------------------------------------------
  // ★ 警車與載具碰撞核心：精確分辨「撞人」與「靠近」★
  // • 靠近 (< 3.2 m/s)：0 傷害、不扣血、不擊飛，僅沿車體邊界做防穿模柔和擠開
  // • 撞人 (>= 3.2 m/s)：扣 10 滴血 (10 HP)、拋物線真實擊飛受創倒地、播放金屬與肉體撞擊聲，具備 1.1s 冷卻
  // ----------------------------------------------------
  function checkVehicleCollisionsWithGang(dt) {
    const gang = window.__gangSystem;
    if (!gang || !gang.members) return;

    // 收集場上所有活躍車輛（警方巡邏車、特警裝甲車、攔截車與地圖上的活躍載具）
    const vehicles = [];
    if (g.vehicles?.list) {
      for (let v of g.vehicles.list) {
        if (v && !v.destroyed && v.body) vehicles.push(v);
      }
    }
    const policeCars = g.police?._debug?.roadblocks?.cars?.list;
    if (policeCars) {
      for (let c of policeCars) {
        if (c && !c.scooter && c.crewMax < 4) {
          c.crewMax = 4;
          if (c.crew < 4 && c.officers.length === 0) c.crew = 4;
        }
        if (c?.v && !c.v.destroyed && c.v.body && !vehicles.includes(c.v)) {
          vehicles.push(c.v);
        }
      }
    }

    const now = Date.now();

    for (let veh of vehicles) {
      const vb = veh.body;
      if (!vb) continue;

      // 計算車輛實際移動速度
      const vx = vb.vx || 0;
      const vz = vb.vz || 0;
      let carSpeed = Math.hypot(vx, vz);
      if (typeof veh.speed === 'number' && Math.abs(veh.speed) > carSpeed) {
        carSpeed = Math.abs(veh.speed);
      }

      // 車體碰撞盒半寬與半長 (OBB Box)
      const halfW = (veh.spec?.halfW || 1.05) + 0.35; // ~1.4m
      const halfL = (veh.spec?.halfL || 2.45) + 0.35; // ~2.8m
      const heading = vb.heading !== undefined ? vb.heading : (veh.heading || 0);
      const cosH = Math.cos(heading);
      const sinH = Math.sin(heading);

      for (let m of gang.members) {
        if (!m.active || !m.officer || m.hp < 1 || m.officer.state === 'dead') continue;

        const dx = m.officer.x - vb.x;
        const dz = m.officer.z - vb.z;
        const dist = Math.hypot(dx, dz);
        // 快速距離篩選 (大於車身半徑直接跳過)
        if (dist > halfL + 1.2) continue;

        // 垂直高度差檢測 (防止車輛在天橋或空中時誤判地面行人)
        const dy = Math.abs((m.officer.y || 0) - (vb.y || 0));
        if (dy > 2.6) continue;

        // 轉換至車體局部坐標系 (OBB Oriented Bounding Box)
        const localX = dx * cosH + dz * sinH;
        const localZ = -dx * sinH + dz * cosH;

        if (Math.abs(localX) < halfW && Math.abs(localZ) < halfL) {
          // 發生碰撞！依車速臨界值 (3.2 m/s，約 11.5 km/h) 嚴格分辨「撞人」與「靠近」
          const isRamming = carSpeed >= 3.2;

          if (isRamming) {
            // ============================================
            // 【撞人判定】：具備實質衝撞動能 (>= 3.2 m/s)
            // ============================================
            // 防多幀連擊秒殺冷卻 (1.1 秒免撞保護期)
            if (now - (m.lastCarHitTime || 0) < 1100) continue;
            m.lastCarHitTime = now;

            // 1. 精準扣 10 滴血 (黑道總血量 250，扣 10 滴)
            m.takeDamage({ amount: 10, source: 'car_impact' });

            // 2. 計算拋物線擊飛方向與初速度
            let normCarVx = carSpeed > 0.05 ? (vx / carSpeed) : Math.sin(heading);
            let normCarVz = carSpeed > 0.05 ? (vz / carSpeed) : -Math.cos(heading);
            if (Math.hypot(normCarVx, normCarVz) < 0.1) {
              normCarVx = Math.sin(heading);
              normCarVz = -Math.cos(heading);
            }

            // 結合車身慣性前進方向 (75%) 與碰撞點往外彈開方向 (25%)
            const awayDist = Math.max(0.1, dist);
            let flingDirX = normCarVx * 0.75 + (dx / awayDist) * 0.25;
            let flingDirZ = normCarVz * 0.75 + (dz / awayDist) * 0.25;
            const flingLen = Math.hypot(flingDirX, flingDirZ) || 1;
            flingDirX /= flingLen;
            flingDirZ /= flingLen;

            // 水平初速 (9.5 ~ 22 m/s) 與 垂直躍起初速 (3.8 ~ 7.5 m/s)
            const flingSpeed = Math.min(22, Math.max(9.5, carSpeed * 1.3));
            const flingVy = Math.min(7.5, 3.8 + carSpeed * 0.22);

            m.isFling = true;
            m.flingVx = flingDirX * flingSpeed;
            m.flingVz = flingDirZ * flingSpeed;
            m.flingVy = flingVy;
            m.flingTimer = now + 1400; // 滯空拋物線 + 翻滾受創站立恢復時間 1.4 秒

            // 3. 動作設置為倒地翻滾受創姿態
            if (m.officer) {
              m.officer.state = 'down';
              m.officer.fall = 1.0;
              m.officer.downT = 0;
              m.officer.flinch = 1.0;
            }

            // 4. 打擊反饋：金屬撞擊聲、肉體碰撞聲、慘叫聲與火花揚塵
            try {
              g.audio?.play?.('crash_light', { x: m.officer.x, y: m.officer.y + 1, z: m.officer.z, volume: 0.95 });
              g.audio?.play?.('flesh', { x: m.officer.x, y: m.officer.y + 1, z: m.officer.z, volume: 0.85 });
              g.audio?.play?.('ped_scream', { x: m.officer.x, y: m.officer.y + 1, z: m.officer.z, volume: 0.65, rate: 0.9 });
              g.fx?.impact?.({ x: m.officer.x, y: m.officer.y + 0.8, z: m.officer.z }, { x: flingDirX, y: 0.4, z: flingDirZ }, 'flesh');
              g.fx?.sparks?.(m.officer.x, m.officer.y + 0.8, m.officer.z, flingDirX * 3, 2, flingDirZ * 3, 4);
            } catch (e) {}

          } else {
            // ============================================
            // 【靠近判定】：車輛怠速、低速或擦身慢行 (< 3.2 m/s)
            // ============================================
            // ★ 0 傷害、不扣血、不擊飛！僅沿車身外緣做柔和防穿模平移，維持正常戰鬥持槍站姿
            if (!m.isFling) {
              const overlapX = halfW - Math.abs(localX);
              const overlapZ = halfL - Math.abs(localZ);

              let pushLx = 0, pushLz = 0;
              if (overlapX < overlapZ) {
                pushLx = (localX >= 0 ? 1 : -1) * (overlapX + 0.08);
              } else {
                pushLz = (localZ >= 0 ? 1 : -1) * (overlapZ + 0.08);
              }

              // 旋轉回世界坐標系
              const pushWorldX = pushLx * cosH - pushLz * sinH;
              const pushWorldZ = pushLx * sinH + pushLz * cosH;

              m.officer.x += pushWorldX * 0.45;
              m.officer.z += pushWorldZ * 0.45;
              if (m.body) {
                m.body.x = m.officer.x;
                m.body.z = m.officer.z;
              }
            }
          }
        }
      }
    }
  }

  // ----------------------------------------------------
  // ★ 直升機空對地索敵與空中掃射壓制 ★
  // • 當直升機在場且盤旋/戰鬥時，直升機機槍不僅打玩家，也會主動掃射在場的黑道兄弟！
  // • 包含槍口火光、高空曳光彈、著彈點火花、機槍音效與實質傷害
  // ----------------------------------------------------
  let lastHeliShootTime = 0;
  function updateHeliAirSupport(dt) {
    const gang = window.__gangSystem;
    if (!gang || !gang.members) return;

    // 取得空中活躍的警用直升機
    const heliBody = g.dynamics?.list?.find(b => b && b.active && b.userData?.heli);
    if (!heliBody) return;

    // 篩選存活黑道成員
    const aliveMobs = gang.members.filter(m => m.active && m.officer && m.hp >= 1 && m.officer.state !== 'dead');
    if (aliveMobs.length === 0) return;

    // 搜尋 135 米內黑道
    let targetMob = null;
    let minDist = 135;

    // 優先反擊剛向直升機開火的黑道
    if (window.__lastHeliAttacker && window.__lastHeliAttacker.active && window.__lastHeliAttacker.hp >= 1 && (Date.now() - (window.__lastHeliAttackTime || 0) < 5500)) {
      targetMob = window.__lastHeliAttacker;
    } else {
      for (let m of aliveMobs) {
        const d = Math.hypot(m.officer.x - heliBody.x, m.officer.z - heliBody.z);
        if (d < minDist) {
          minDist = d;
          targetMob = m;
        }
      }
    }

    if (!targetMob) return;

    const now = Date.now();
    // 直升機每 1.2~1.8 秒發動一輪 2~3 連發機槍空中壓制
    if (now > lastHeliShootTime) {
      lastHeliShootTime = now + 1200 + Math.random() * 600;

      const muzzleX = heliBody.x + (Math.random() - 0.5) * 1.5;
      const muzzleY = heliBody.y - 1.2;
      const muzzleZ = heliBody.z + (Math.random() - 0.5) * 1.5;

      const hitX = targetMob.officer.x + (Math.random() - 0.5) * 1.2;
      const hitY = targetMob.officer.y + 0.8;
      const hitZ = targetMob.officer.z + (Math.random() - 0.5) * 1.2;

      try {
        // 機槍槍口閃光與曳光彈
        g.fx?.flash?.(muzzleX, muzzleY, muzzleZ, 3.5, 2.5, 1.2, 0.6, 0.08);
        g.fx?.tracer?.(muzzleX, muzzleY, muzzleZ, hitX, hitY, hitZ);
        g.fx?.flash?.(hitX, hitY, hitZ, 2.2, 1.8, 1.0, 0.4, 0.08);
        g.audio?.play?.('gunshot', { x: muzzleX, y: muzzleY, z: muzzleZ, volume: 0.92, rate: 0.86 });
        g.audio?.play?.('bullet_impact', { x: hitX, y: hitY, z: hitZ, volume: 0.75 });
      } catch (e) {}

      // 40% 機率命中黑道兄弟，造成 10~15 滴傷害
      if (Math.random() < 0.40) {
        const dmg = 10 + Math.floor(Math.random() * 6);
        targetMob.takeDamage({ amount: dmg, source: 'police_heli' });
        try {
          g.fx?.impact?.({ x: hitX, y: hitY, z: hitZ }, { x: 0, y: 1, z: 0 }, 'flesh');
        } catch (e) {}
      }
    }
  }

  // 載具飛行輔助變數
  const vForward = new T.Vector3();

  if (window.__ultimateMainLoop) {
    clearInterval(window.__ultimateMainLoop);
  }

  window.__ultimateMainLoop = setInterval(() => {
    try {
      const dt = 0.05; // 50ms 步長
      const veh = g.vehicles?.playerVehicle;
      const isFlying = !!window.__flyModeEnabled;

      // 1. 全載具飛行接管
      if (isFlying && veh && veh.body) {
        veh.health = Math.max(veh.health || 100, 100);
        veh.destroyed = false;
        veh.onFire = false;
        veh.sinking = 0;

        const heading = veh.heading !== undefined ? veh.heading : (veh.body.heading || 0);
        vForward.set(Math.sin(heading), 0, -Math.cos(heading)).normalize();

        // ★ 讀取車輛駕駛輸入（支援手機方向踏板與虛擬搖桿）
        let joyX = 0;
        let joyY = 0;
        let steerAxis = 0;
        let throttleAxis = 0;
        const inp = g.input;
        if (inp) {
          if (inp.virtual) {
            if (typeof inp.virtual.moveX === 'number') joyX = inp.virtual.moveX;
            if (typeof inp.virtual.moveY === 'number') joyY = inp.virtual.moveY;
            if (typeof inp.virtual.throttle === 'number') throttleAxis += inp.virtual.throttle;
            if (typeof inp.virtual.brake === 'number') throttleAxis -= inp.virtual.brake;
          }
          if (typeof inp.axis === 'function') {
            const s = inp.axis('steer');
            const t = inp.axis('throttle');
            const b = inp.axis('brake');
            const mx = inp.axis('moveX');
            const my = inp.axis('moveY');
            if (steerAxis === 0 && typeof s === 'number') steerAxis = s;
            if (throttleAxis === 0) {
              if (typeof t === 'number') throttleAxis += t;
              if (typeof b === 'number') throttleAxis -= b;
            }
            if (joyX === 0 && typeof mx === 'number') joyX = mx;
            if (joyY === 0 && typeof my === 'number') joyY = my;
          }
          if (inp.axes) {
            if (steerAxis === 0 && typeof inp.axes.steer === 'number') steerAxis = inp.axes.steer;
            if (throttleAxis === 0) {
              if (typeof inp.axes.throttle === 'number') throttleAxis += inp.axes.throttle;
              if (typeof inp.axes.brake === 'number') throttleAxis -= inp.axes.brake;
            }
            if (joyX === 0 && typeof inp.axes.moveX === 'number') joyX = inp.axes.moveX;
            if (joyY === 0 && typeof inp.axes.moveY === 'number') joyY = inp.axes.moveY;
          }
        }

        let steer = 0;
        if (Math.abs(steerAxis) > 0.08) steer -= steerAxis;
        else if (Math.abs(joyX) > 0.08) steer -= joyX;
        if (isKeyDown('KeyA', 'ArrowLeft', 'a')) steer = Math.max(steer, 1);
        if (isKeyDown('KeyD', 'ArrowRight', 'd')) steer = Math.min(steer, -1);

        const turnSpeed = (veh.spec?.twoWheeler ? 3.0 : 2.4) * dt;
        veh.heading = heading + steer * turnSpeed;
        veh.body.heading = veh.heading;
        if (veh.object) veh.object.rotation.y = veh.heading;

        let throttle = 0;
        if (Math.abs(throttleAxis) > 0.08) throttle += throttleAxis;
        else if (Math.abs(joyY) > 0.08) throttle += joyY; // ★ joyY > 0 正向推動為向前
        if (isKeyDown('KeyW', 'ArrowUp', 'w')) throttle = Math.max(throttle, 1);
        if (isKeyDown('KeyS', 'ArrowDown', 's')) throttle = Math.min(throttle, -1);

        const isTurbo = !!(window.__mobileTurboEnabled || isKeyDown('ShiftLeft', 'Shift', 'KeyE', 'e'));
        const topFlightSpeed = isTurbo ? 65.0 : 32.0;

        let curSpeed = Math.hypot(veh.body.vx || 0, veh.body.vz || 0);
        let targetSpeed = throttle > 0 ? (topFlightSpeed * throttle) : (throttle < 0 ? -15.0 : 0);
        curSpeed += (targetSpeed - curSpeed) * Math.min(1, dt * 5);

        let vertMove = 0;
        if (window.__mobileVert !== 0) vertMove = window.__mobileVert;
        if (isKeyDown('Space', ' ')) vertMove = Math.max(vertMove, 1);
        if (isKeyDown('KeyC', 'c', 'ShiftRight')) vertMove = Math.min(vertMove, -1);
        const vertSpeed = vertMove * (isTurbo ? 32.0 : 18.0);

        veh.body.vx = vForward.x * curSpeed;
        veh.body.vz = vForward.z * curSpeed;
        veh.body.vy = vertSpeed;

        veh.body.x += veh.body.vx * dt;
        veh.body.z += veh.body.vz * dt;
        veh.body.y += vertSpeed * dt;

        veh.speed = curSpeed;
        if (veh.object) {
          veh.object.position.set(veh.body.x, veh.body.y, veh.body.z);
          veh.object.rotation.x = 0;
          veh.object.rotation.z = 0;
        }

        if (veh.spec?.twoWheeler) {
          veh.lean = 0;
          veh.wheelieA = 0;
        }
      }

      // 2. 堂口黑道兄弟每幀更新與索敵
      const gang = window.__gangSystem;
      if (gang && gang.members) {
        for (let m of gang.members) {
          if (m.active) {
            m.update(dt);
          }
        }
      }
      checkVehicleCollisionsWithGang(dt);
      updateHeliAirSupport(dt);
      hookPoliceTargeting();
      syncMinimapBlips();
      updateTaxiReinforcements(dt);

      // 黑道兄弟已採用 officer.state = 'return'，引擎逮捕檢測自然豁免友軍，無需壓制玩家犯罪星級，警察通緝完全正常運行

      // ★ 更新 HUD 浮動存活人數計數器（真實活體過濾，絕不虛報）★
      try {
        const aliveCount = gang ? gang.members.filter(m => m.active && m.officer && m.hp >= 1 && m.officer.state !== 'dead').length : 0;
        let counterEl = document.getElementById('tgta-gang-alive-float');
        if (aliveCount > 0) {
          if (!counterEl) {
            counterEl = document.createElement('div');
            counterEl.id = 'tgta-gang-alive-float';
            counterEl.style.cssText = 'position:fixed;top:max(58px,env(safe-area-inset-top,0px));right:max(14px,env(safe-area-inset-right,0px));background:rgba(10,12,18,0.85);color:#ffd700;font-size:14px;font-weight:800;padding:6px 14px;border-radius:10px;border:1.5px solid rgba(255,215,0,0.6);z-index:99999;pointer-events:none;font-family:"Noto Sans TC","Microsoft JhengHei",sans-serif;text-shadow:0 0 8px rgba(255,215,0,0.4);';
            document.body.appendChild(counterEl);
          }
          counterEl.textContent = `🕶️ 江湖黑道 ${aliveCount}/${gang.targetCount} 存活`;
          counterEl.style.display = '';
        } else if (counterEl) {
          counterEl.style.display = 'none';
        }
      } catch (e) {}

      // ★ 只要目前存活超過 4 名黑道，自動 5 星警報並維持 ★
      try {
        if (g.police && window.__gangSystem) {
          const aliveCount = window.__gangSystem.members.filter(m => m.active && m.officer && m.hp >= 1 && m.officer.state !== 'dead').length;
          if (aliveCount > 4) {
            if (typeof g.police.setLevel === 'function') {
              g.police.setLevel(5); // 遊戲底層控制星星數的函數
            } else {
              g.police.level = 5;
            }
          }
        }
      } catch (e) {}

      // 3. 護盾與光劍跟隨玩家或載具
      const px = veh ? veh.body.x : p.position.x;
      const py = veh ? veh.y : p.position.y;
      const pz = veh ? veh.body.z : p.position.z;

      if (window.__shieldGroup) window.__shieldGroup.position.set(px, py + 0.95, pz);
      if (window.__swordsGroup) window.__swordsGroup.position.set(px, py + 0.95, pz);

      if (window.__swordsGroup && window.__swordsEnabled) {
        window.__swordsGroup.rotation.y += dt * 8.0; // 高速旋轉
      }

      // 4. 光劍環形攻擊判定
      if (!window.__swordsEnabled) return;
      const currentAttackRadius = veh ? 4.5 : ATTACK_RADIUS;

      try { breakables?.blast?.(px, pz, currentAttackRadius); } catch (e) {}

      queryBodies.length = 0;
      const count = g.dynamics.query(px, pz, currentAttackRadius, queryBodies);
      let hitAny = false;
      for (let i = 0; i < count; i++) {
        const body = queryBodies[i];
        if (!body || body === p.body || (veh && body === veh.body)) continue;
        if (body.userData?.gang) continue; // 不傷友軍黑道兄弟
        if (Math.abs(body.y - py) > 3.0) continue;

        if (body.kind === 'ped' || body.kind === 'police') {
          hitAny = true;
          const pt = { x: body.x, y: body.y + 0.8, z: body.z };
          const dir = { x: (body.x - px) || 0.1, y: 0.2, z: (body.z - pz) || 0.1 };

          body.onDamage?.({ amount: 150, point: pt, dir: dir, weapon: 'bat', source: 'player' });
          body.onImpact?.(dir.x * 25, dir.z * 25, veh ? veh.body : p.body);
          try { g.fx?.punch?.(pt, true); } catch (e) {}
          try { g.fx?.impact?.(pt, { x: 0, y: 1, z: 0 }, 'flesh'); } catch (e) {}
        }
      }

      if (hitAny) {
        try { g.audio?.play?.('punch', { x: px, y: py, z: pz, volume: 0.8 }); } catch (e) {}
      }
    } catch (e) {}
  }, 50);

  const queryBodies = [];

  // ----------------------------------------------------
  // 9. 【高爆自爆衝鋒槍】（Hook combat.fire）
  // ----------------------------------------------------
  combat.give('smg', 9999);
  combat.mag.smg = 30;
  p.switchWeapon('smg');

  const EXPLOSION_RADIUS = 6.0;
  const MAX_DAMAGE = 350;
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
      if (body.userData?.gang && window.__gangSystem.godMode) continue; // 若無開啟友軍無敵，黑道會正常受到車輛爆炸波及！

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
  console.log('%c🌟🪽🚗🏍️🕶️⚔️💥【終極整合神級密技：全載具飛行＋光劍＋特警全黑黑道友軍＋自爆槍】已就緒！', 'color: #00ffff; font-size: 18px; font-weight: bold;');
  console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #666;');
  console.log('%c🕶️【黑道堂口友軍火力支援】：', 'color: #ff9933; font-size: 14px; font-weight: bold;');
  console.log('   • 造型升級：採用遊戲官方高精細 Police 3D 模型，純黑 SWAT 特警作戰服配備，質感完全無縫融合！');
  console.log('   • 武器升級：手持官方【警用突擊步槍】，全自動索敵射擊警察、警車與空中警用直升機！');
  console.log('   • 固定式選單：頂部【🪽 飛行】【⚔️ 光劍】【🕶️ 黑道堂口】為固定式置中按鈕，不阻擋大地圖！');
  console.log('   • 人數隨意設定：支援 0 ~ 12 人自由調整，點擊 ➕ ➖ 或預設按鈕立即刷出兄弟！');
  console.log('   • 空戰支援：當直升機盤旋時，黑道兄弟會抬高槍口仰角向天空傾瀉火力擊落直升機！');
  console.log('%c🚗🏍️【騎車與開車空戰飛行】：', 'color: #33ff99; font-size: 14px; font-weight: bold;');
  console.log('   • 任何機車、轎車，上車後立即支援飛行！W/S 前後，A/D 轉向，空白鍵上升，C鍵下降，Shift 音速衝刺！');
  console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #666;');

  g.events?.emit('notify', {
    text: { zh: '🕶️ 黑道堂口兄弟已集合！（官方全黑特警造型·標配警用突擊步槍）', en: 'SWAT Black Mobster Squad Ready!' },
    kind: 'good',
    duration: 4.5
  });

  } // end of initPlugin
  
  initPlugin();
})();
