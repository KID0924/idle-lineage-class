(function () {
    'use strict';

    let lastRegenTime = 0;

    // 注入隱藏原版 MP 顯示的 CSS 樣式，避免重複
    function injectTeamCSS() {
        if (document.getElementById('klh-team-style')) return;
        const css = `
            #dt-buffs span.text-blue-300, 
            #m-battle-buffs span.text-blue-300 {
                display: none !important;
            }
        `;
        const style = document.createElement('style');
        style.id = 'klh-team-style';
        style.textContent = css;
        document.head.appendChild(style);
    }
    injectTeamCSS();

    // 1. 仇恨權重演算法 (騎士:10 / 黑妖:6 / 妖精:4 / 法師:3)
    function getJobWeight(cls) {
        if (cls === 'knight') return 10;
        if (cls === 'dark') return 6;
        if (cls === 'elf') return 4;
        if (cls === 'mage') return 3;
        return 4; 
    }

    function selectAttackTarget() {
        const targets = [];
        
        // 1. 主角 (主角權重多 * 2)
        targets.push({
            type: 'player',
            weight: getJobWeight(player.cls) * 2,
            ref: player
        });
        
        // 2. 存活傭兵
        const aliveAllies = (player.allies || []).filter(a => a && (a.hp !== undefined ? a.hp : (a.curHp !== undefined ? a.curHp : a.mhp)) > 0);
        aliveAllies.forEach(ally => {
            targets.push({
                type: 'ally',
                weight: getJobWeight(ally.cls),
                ref: ally
            });
        });
        
        const totalWeight = targets.reduce((sum, t) => sum + t.weight, 0);
        if (totalWeight <= 0) return null;
        
        let rand = Math.random() * totalWeight;
        for (let t of targets) {
            rand -= t.weight;
            if (rand <= 0) {
                return t;
            }
        }
        return targets[0];
    }

    // 2. Hook window.enemyPhysicalAttack (物理攻擊)
    if (typeof window.enemyPhysicalAttack === 'function' && !window.enemyPhysicalAttack.isHooked) {
        const originalEnemyPhysicalAttack = window.enemyPhysicalAttack;
        window.enemyPhysicalAttack = function (mob, idx, stunChance = 0, atkDmg = null, atkDb = null) {
            const target = selectAttackTarget();
            if (target && target.type === 'ally') {
                processAllyTakePhysicalDamage(target.ref, mob, idx, stunChance, atkDmg, atkDb);
                return; // 攔截
            }
            originalEnemyPhysicalAttack.apply(this, arguments);
        };
        window.enemyPhysicalAttack.isHooked = true;
    }

    // 3. Hook window.applyMobMagic (魔法攻擊)
    if (typeof window.applyMobMagic === 'function' && !window.applyMobMagic.isHooked) {
        const originalApplyMobMagic = window.applyMobMagic;
        window.applyMobMagic = function (mob, sk) {
            if (!sk) return;
            const target = selectAttackTarget();
            if (target && target.type === 'ally') {
                processAllyTakeMagicDamage(target.ref, mob, sk);
                return; // 攔截
            }
            originalApplyMobMagic.apply(this, arguments);
        };
        window.applyMobMagic.isHooked = true;
    }

    // 4. 傭兵受傷物理傷害計算
    function processAllyTakePhysicalDamage(ally, mob, idx, stunChance, atkDmg, atkDb) {
        if (ally.hp === undefined) {
            ally.hp = ally.curHp !== undefined ? ally.curHp : ally.mhp;
        }

        let st = mob.st || { blindVal: 0, weaken: 0, disease: 0 };
        let mobHitBonus = (mob.hit || 0) - (st.blindVal || 0) - (st.weaken > 0 ? 2 : 0) - (st.disease > 0 ? 4 : 0);
        let allyAc = (ally.d && ally.d.ac !== undefined) ? ally.d.ac : 10;
        let rawHitValue = mob.lv + mobHitBonus - ally.lv + allyAc;
        let hitValue = stretchHitValue(rawHitValue);
        let rollHit = roll(1, 20);
        
        let hit = false;
        let heavy = rollHit === 20;
        if (rollHit === 20) hit = true;
        else if (rollHit !== 1 && hitValue >= rollHit) hit = true;

        if (!hit) {
            logCombat(`[傭兵] <span class="text-emerald-300 font-bold">${ally._allyName}</span> 成功迴避 <span class="${getMobColor(mob.lv)}">${mob.n}</span> 的物理攻擊。`, 'evade');
            return;
        }

        let diceCount = (atkDmg ? atkDmg[0] : mob.dmg[0]) || 1;
        let diceSides = (atkDmg ? atkDmg[1] : mob.dmg[1]) || 1;
        let baseWeaponDmg = heavy ? (diceCount * diceSides) : roll(diceCount, diceSides);
        let dmgBonus = (atkDb != null ? atkDb : (mob.db || 0)) - (st.weaken > 0 ? 4 : 0) - (st.broken > 0 ? 2 : 0);
        let totalDmg = baseWeaponDmg + dmgBonus;
        
        if (mob._sherine) totalDmg = Math.floor(totalDmg * 2);
        if (mob._grace) totalDmg = Math.floor(totalDmg * 1.5);

        let dr = (ally.d && ally.d.dr !== undefined) ? ally.d.dr : 0;
        totalDmg -= dr;
        totalDmg = Math.max(1, totalDmg);

        ally.hp -= totalDmg;
        ally.curHp = ally.hp;

        let atkMsg = `[傭兵] <span class="text-emerald-300 font-bold">${ally._allyName}</span> 被 <span class="${getMobColor(mob.lv)}">${mob.n}</span> 擊中，造成 ${totalDmg} 點傷害。`;
        if (heavy) atkMsg += " (重擊!)";
        logCombat(atkMsg, 'enemy');

        if (ally.hp <= 0) {
            ally.hp = 0;
            ally.curHp = 0;
            logSys(`<span class="text-red-400 font-bold">「協力傭兵 ${ally._allyName} 傷重陣亡！」</span>`);
            logCombat(`[傭兵] ${ally._allyName} 已經戰死。`, 'enemy');
        }
        
        if (typeof updateUI === 'function') updateUI();
    }

    // 5. 傭兵受傷魔法傷害計算
    function processAllyTakeMagicDamage(ally, mob, sk) {
        if (ally.hp === undefined) {
            ally.hp = ally.curHp !== undefined ? ally.curHp : ally.mhp;
        }

        const directDamageTypes = ['stone', 'paralyze', 'silence', 'magicseal', 'freeze', 'slowatk', 'poison', 'burn', 'scald', 'stun'];
        if (!directDamageTypes.includes(sk.type) && sk.d === undefined) {
            logCombat(`[傭兵] <span class="text-emerald-300 font-bold">${ally._allyName}</span> 抵抗了 <span class="${getMobColor(mob.lv)}">${mob.n}</span> 的 ${sk.skn || '魔法'}。`, 'magic');
            return;
        }

        let dmg = 0;
        if (sk.d) {
            let baseMagicDmg = roll(sk.d[0], sk.d[1]);
            let extraMagicDmg = sk.db || 0;
            let allyMr = (ally.d && ally.d.mr !== undefined) ? ally.d.mr : 10;
            let mrFactor = mrMult(allyMr);
            let allyDr = (ally.d && ally.d.dr !== undefined) ? ally.d.dr : 0;
            dmg = Math.max(1, Math.floor((baseMagicDmg + extraMagicDmg) * mrFactor) - allyDr);
        } else {
            dmg = sk.d ? roll(sk.d[0], sk.d[1]) : Math.max(5, Math.floor(mob.lv / 2));
        }

        if (mob._sherine) dmg = Math.floor(dmg * 2);
        if (mob._grace) dmg = Math.floor(dmg * 2);
        dmg = Math.max(1, dmg);

        ally.hp -= dmg;
        ally.curHp = ally.hp;

        logCombat(`[傭兵] <span class="text-emerald-300 font-bold">${ally._allyName}</span> 受到 <span class="${getMobColor(mob.lv)}">${mob.n}</span> 施放的 ${sk.skn || '魔法'} 攻擊，受到 ${dmg} 點傷害。`, 'enemy');

        if (ally.hp <= 0) {
            ally.hp = 0;
            ally.curHp = 0;
            logSys(`<span class="text-red-400 font-bold">「協力傭兵 ${ally._allyName} 傷重陣亡！」</span>`);
            logCombat(`[傭兵] ${ally._allyName} 已經戰死。`, 'enemy');
        }

        if (typeof updateUI === 'function') updateUI();
    }

    // 6. 傭兵自然回血回魔以及玩家治療連動
    if (typeof window.tick === 'function' && !window.tick.isHooked) {
        const originalTick = window.tick;
        window.tick = function () {
            originalTick.apply(this, arguments);
            
            const now = Date.now();
            if (player && player.allies) {
                // 1. 如果已陣亡，強制封鎖其行動與法術 CD，並清空 MP
                player.allies.forEach(ally => {
                    if (ally && (ally.hp !== undefined ? ally.hp : ally.curHp) <= 0) {
                        ally._atkCd = 9999;
                        ally.mp = 0;
                    }
                });

                // 2. 如果回城 (地圖以 town_ 開頭)，自動解散已陣亡的協力傭兵
                if (typeof mapState !== 'undefined' && mapState && mapState.current && mapState.current.startsWith('town_')) {
                    let hasDead = player.allies.some(ally => ally && (ally.hp !== undefined ? ally.hp : ally.curHp) <= 0);
                    if (hasDead) {
                        player.allies = player.allies.filter(ally => ally && (ally.hp !== undefined ? ally.hp : ally.curHp) > 0);
                        logSys(`<span class="text-slate-400 font-bold">「陣亡的協力傭兵已於回城後自動解散。」</span>`);
                        if (typeof updateUI === 'function') updateUI();
                    }
                }

                // 3. 處理存活傭兵的自然回血回魔
                if (now - lastRegenTime >= 15000) {
                    lastRegenTime = now;
                    player.allies.forEach(ally => {
                        if (ally && (ally.hp !== undefined ? ally.hp : ally.curHp) > 0) {
                            if (ally.hp === undefined) ally.hp = ally.curHp || ally.mhp;
                            let hpRegen = Math.max(1, Math.floor(ally.mhp * 0.05));
                            ally.hp = Math.min(ally.mhp, ally.hp + hpRegen);
                            if (ally.mmp > 0) {
                                let mpRegen = Math.max(1, Math.floor(ally.mmp * 0.10));
                                ally.mp = Math.min(ally.mmp, (ally.mp || 0) + mpRegen);
                            }
                            ally.curHp = ally.hp;
                        }
                    });
                }
            }
        };
        window.tick.isHooked = true;
    }

    // 玩家治癒術連動 (單體治療補自己，傭兵得分得 10%)
    if (typeof window.castSkill === 'function' && !window.castSkill.isHooked) {
        const originalCastSkill = window.castSkill;
        window.castSkill = function (skId) {
            let isWaterVitalActive = !!(player && player.buffs && player.buffs.sk_elf_watervital > 0 && (player._waterVitalCd || 0) <= 0);
            let res = originalCastSkill.apply(this, arguments);
            
            const sk = DB.skills[skId];
            const healSkillIds = ['sk_heal1', 'sk_heal_mid', 'sk_heal2', 'sk_full_heal', 'sk_elf_lifespring', 'sk_helm_heal1', 'sk_helm_heal2'];
            if (res !== false && sk && healSkillIds.includes(skId)) {
                let _spCoefHeal = (1 + (3 * (player.d.magicDmg || 0) / 16));
                let heal = sk.healDice
                    ? Math.max(1, Math.floor((rollDice(sk.healDice[0], sk.healDice[1]) + (sk.healBase || 0)) * _spCoefHeal))
                    : Math.max(1, (sk.valBase || 0) + roll(sk.valDice[0], sk.valDice[1]) + (player.d.magicDmg || 0));
                
                if (isWaterVitalActive) {
                    heal = heal * 2;
                }

                if (player.allies && player.allies.length > 0) {
                    player.allies.forEach(ally => {
                        if (ally && (ally.hp !== undefined ? ally.hp : ally.curHp) > 0) {
                            if (ally.hp === undefined) ally.hp = ally.curHp || ally.mhp;
                            let portion = Math.max(1, Math.floor(heal * 0.10));
                            ally.hp = Math.min(ally.mhp, ally.hp + portion);
                            ally.curHp = ally.hp;
                            logCombat(`[傭兵] <span class="text-emerald-300 font-bold">${ally._allyName}</span> 受治療連動恢復了 ${portion} HP。`, 'magic');
                        }
                    });
                    if (typeof updateUI === 'function') updateUI();
                }
            }
            return res;
        };
        window.castSkill.isHooked = true;
    }

    // 7. 高效無效能損耗渲染 (Hook window.allyName)
    if (typeof window.allyName === 'function' && !window.allyName.isHooked) {
        const originalAllyName = window.allyName;
        window.allyName = function (a) {
            let name = originalAllyName(a);
            if (!a) return name;
            
            if (a.hp === undefined) {
                a.hp = a.curHp !== undefined ? a.curHp : a.mhp;
            }
            const hp = Math.max(0, a.hp);
            const mhp = a.mhp || 100;
            const mp = Math.max(0, a.mp || 0);
            const mmp = a.mmp || 0;

            const isDead = hp <= 0;
            const hpPct = isDead ? 0 : Math.min(100, Math.floor((hp / mhp) * 100));
            const mpPct = (!isDead && mmp > 0) ? Math.min(100, Math.floor((mp / mmp) * 100)) : 0;

            let displayName = name;
            if (isDead) {
                displayName = `<span style="color:#94a3b8;text-decoration:line-through;">${name}</span>`;
            }

            // 微型 HTML 血條 (Inline CSS 繪製)
            const barStyle = 'display:inline-flex;flex-direction:column;gap:1.5px;width:60px;vertical-align:middle;margin-left:6px;margin-right:4px;line-height:0;';
            const hpBarHtml = `<div style="width:100%;height:4px;background:#334155;border-radius:1.5px;overflow:hidden;display:inline-block;line-height:0;"><div style="width:${hpPct}%;height:100%;background:${isDead ? '#64748b' : '#ef4444'};"></div></div>`;
            const mpBarHtml = mmp > 0 ? `<div style="width:100%;height:2.5px;background:#334155;border-radius:1px;overflow:hidden;display:inline-block;line-height:0;"><div style="width:${mpPct}%;height:100%;background:${isDead ? '#64748b' : '#3b82f6'};"></div></div>` : '';
            const barHtml = `<div style="${barStyle}">${hpBarHtml}${mpBarHtml}</div>`;

            // 數值顯示：HP值 (紅) ；若有 MP，則顯示 MP值 (藍)
            let hpValHtml = '';
            if (isDead) {
                hpValHtml = `<span style="color:#ef4444;font-size:10px;font-weight:bold;margin-left:2px;">[已陣亡]</span>`;
            } else {
                hpValHtml = `<span style="color:#f87171;font-size:10px;font-weight:bold;margin-left:2px;">${hp}/${mhp}</span>`;
            }
            const mpValHtml = (!isDead && mmp > 0) ? `<span style="color:#60a5fa;font-size:10px;font-weight:bold;margin-left:4px;">${mp}/${mmp}</span>` : '';

            // 利用 span 閉合，無縫嵌入原版 renderStatusEffects 流程中，完全免除 DOM 查詢，效能極佳且完全防覆蓋
            return `${displayName}</span>${barHtml}${hpValHtml}${mpValHtml}<span>`;
        };
        window.allyName.isHooked = true;
    }

    function roll(n, s) {
        let sum = 0;
        for (let i = 0; i < n; i++) sum += Math.floor(Math.random() * s) + 1;
        return sum;
    }

    function rollDice(count, sides) {
        let s = 0;
        for (let i = 0; i < count; i++) s += roll(1, sides);
        return s;
    }

    function stretchHitValue(v) {
        if (v <= 0) return 0;
        if (v <= 10) return v;
        return 10 + Math.floor((v - 10) / 2);
    }

    function mrMult(mr) {
        if (mr <= 100) return 1 - (mr * 0.5) / 100;
        return 0.5 * (100 / mr);
    }

    function getMobColor(lv) {
        if (typeof player === 'undefined') return 'text-white';
        let diff = lv - player.lv;
        if (diff <= -6) return 'text-slate-400';
        if (diff <= -3) return 'text-blue-300';
        if (diff <= 2) return 'text-white';
        if (diff <= 5) return 'text-orange-300';
        return 'text-red-400 font-bold';
    }

    // 預防 iOS 雙擊或事件雙重觸發導致重複招募同一個傭兵
    if (typeof window.toggleAlly === 'function' && !window.toggleAlly.isHooked) {
        const originalToggleAlly = window.toggleAlly;
        let lastToggleTime = 0;
        
        window.toggleAlly = function (slotN) {
            const now = Date.now();
            // 500ms 內防抖
            if (now - lastToggleTime < 500) {
                console.warn("[klh_team] 偵測到快速重複點擊，已攔截。");
                return;
            }
            lastToggleTime = now;
            
            // 安全防線：如果欲招募 the 傭兵已經在隊伍中，禁止重複招募
            slotN = String(slotN);
            if (!player.allies) player.allies = [];
            
            const isAllyActiveFunc = (typeof isAllyActive === 'function') ? isAllyActive : (slot => player.allies.some(a => a && a._slot === String(slot)));
            if (!isAllyActiveFunc(slotN)) {
                // 如果已經存在該槽位的傭兵，就不執行招募，防止重複引用
                if (player.allies.some(a => a && a._slot === slotN)) {
                    console.warn("[klh_team] 傭兵隊伍中已存在該槽位的角色，拒絕重複加入。");
                    return;
                }
            }
            
            originalToggleAlly.apply(this, arguments);
        };
        window.toggleAlly.isHooked = true;
    }

})();
