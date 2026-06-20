(function () {
    'use strict';

    // === 平衡調整配置區 ===
    const CONFIG = {
        // 傭兵輸出傷害倍率 (1.0 = 100% 原版傷害)
        MERC_DAMAGE_SCALE: 1.0,
        
        // 傭兵承受傷害倍率 (1.0 = 100% 原版傷害)
        MERC_DAMAGE_TAKEN_SCALE: 1.0,
        
        // 受療恢復量調整設定 (1人存活 = 75% / 2人存活 = 50% / 3人存活 = 25%)
        HEAL_SCALE_BY_COUNT: {
            1: 0.75,
            2: 0.50,
            3: 0.25
        }
    };

    // 計算當前受療恢復倍率
    function getMercHealScale() {
        if (!player.allies) return 1.0;
        const aliveCount = player.allies.filter(a => a && (a.hp !== undefined ? a.hp : (a.curHp !== undefined ? a.curHp : a.mhp)) > 0).length;
        if (aliveCount <= 1) return CONFIG.HEAL_SCALE_BY_COUNT[1] || 1.0;
        if (aliveCount === 2) return CONFIG.HEAL_SCALE_BY_COUNT[2] || 0.75;
        return CONFIG.HEAL_SCALE_BY_COUNT[3] || 0.50; // 3人或以上
    }

    let lastRegenTime = 0;
    let targetAlly = null;
    let targetPotionAlly = null;
    let isRedirectingLog = false;
    let isUiInitialized = false;
    let isAllyAttacking = false;

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
        let mobHitBonus = (mob.hit || 0) - (st.blindVal || 0) - (st.weaken > 0 ? 2 : 0) - (st.disease > 0 ? 4 : 0) + ((mob._siegeHitEnd > state.ticks) ? 2 : 0);
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
        let dmgBonus = (atkDb != null ? atkDb : (mob.db || 0)) - (st.weaken > 0 ? 4 : 0) - (st.broken > 0 ? 2 : 0) + ((mob._siegeDmgEnd > state.ticks) ? 4 : 0);
        let totalDmg = baseWeaponDmg + dmgBonus;
        
        if (mob._sherine) totalDmg = Math.floor(totalDmg * 2);
        if (mob._grace) totalDmg = Math.floor(totalDmg * 1.5);

        // 屬性抗性
        let resFactor = 1.0;
        if (mob.e === 'fire' && ally.d && ally.d.resFire) resFactor -= effResistPct(ally.d.resFire) / 100;
        if (mob.e === 'water' && ally.d && ally.d.resWater) resFactor -= effResistPct(ally.d.resWater) / 100;
        if (mob.e === 'earth' && ally.d && ally.d.resEarth) resFactor -= effResistPct(ally.d.resEarth) / 100;
        if (mob.e === 'wind' && ally.d && ally.d.resWind) resFactor -= effResistPct(ally.d.resWind) / 100;
        resFactor = Math.max(0, Math.min(1, resFactor));
        totalDmg = Math.floor(totalDmg * resFactor);

        // 隨機減免：騎士 (10-AC)/2、妖精/黑暗妖精 (10-AC)/3、法師 (10-AC)/5
        let rndDrMax = 0;
        let acGap = Math.max(0, 10 - allyAc);
        if (ally.cls === 'knight') rndDrMax = Math.floor(acGap / 2);
        else if (ally.cls === 'elf' || ally.cls === 'dark') rndDrMax = Math.floor(acGap / 3);
        else rndDrMax = Math.floor(acGap / 5);
        rndDrMax = Math.max(0, rndDrMax);
        let randomDr = Math.floor(Math.random() * (rndDrMax + 1));

        let dr = (ally.d && ally.d.dr !== undefined) ? ally.d.dr : 0;
        totalDmg -= dr;
        totalDmg -= randomDr;
        
        if (ally.buffs && ally.buffs.sk_holy_barrier > 0) totalDmg = Math.floor(totalDmg * 0.7);

        // 盾牌格檔
        if (heavy && ally.eq && ally.eq.shield) {
            let _sh = DB.items[ally.eq.shield.id];
            if (_sh && _sh.block && Math.random() * 100 < _sh.block) {
                totalDmg = Math.floor(totalDmg * 0.5);
            }
        }

        // 看破 / 雙重破壞 / 雙刀暴擊
        if (mob.seeInsight || mob.siegeInsight) {
            let insightRate = Math.min(15, 5 + Math.floor((mob.lv || 1) / 10));
            if (Math.random() * 100 < insightRate) totalDmg *= 2;
        }
        if (mob.doubleDestroy) {
            let ddRate = (mob.lv >= 50) ? (6 + Math.floor((mob.lv - 50) / 5)) : 5;
            if (Math.random() * 100 < ddRate) totalDmg *= 2;
        }
        if (mob.atkDoubleChance && Math.random() < mob.atkDoubleChance) {
            totalDmg *= 2;
        }

        totalDmg = Math.max(1, totalDmg);

        // 平衡調整：傭兵承受傷害倍率
        totalDmg = Math.max(1, Math.floor(totalDmg * CONFIG.MERC_DAMAGE_TAKEN_SCALE));

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

        let baseMagicDmg = 0;
        let extraMagicDmg = 0;
        let isDamageSkill = false;

        if (sk.dmg) {
            baseMagicDmg = roll(sk.dmg[0], sk.dmg[1]);
            extraMagicDmg = (sk.db || 0) + (sk.dbLv ? (mob.lv || 0) * (sk.dbLvMult || 1) : 0);
            isDamageSkill = true;
        } else if (sk.d) {
            if (Array.isArray(sk.d)) {
                baseMagicDmg = roll(sk.d[0], sk.d[1]);
            } else {
                baseMagicDmg = Number(sk.d) || 0;
            }
            extraMagicDmg = sk.db || 0;
            isDamageSkill = true;
        }

        // 判定是否為純狀態類技能（若不是傷害技能，且沒在 directDamageTypes 裡，就判定為抵抗）
        if (!isDamageSkill) {
            const directDamageTypes = ['stone', 'paralyze', 'silence', 'magicseal', 'freeze', 'slowatk', 'poison', 'burn', 'scald', 'stun'];
            if (!directDamageTypes.includes(sk.type)) {
                logCombat(`[傭兵] <span class="text-emerald-300 font-bold">${ally._allyName}</span> 抵抗了 <span class="${getMobColor(mob.lv)}">${mob.n}</span> 的 ${sk.skn || '魔法'}。`, 'magic');
                return;
            }
        }

        let resFactor = 1.0;
        if (sk.ele === 'fire' && ally.d && ally.d.resFire) resFactor -= effResistPct(ally.d.resFire) / 100;
        if (sk.ele === 'water' && ally.d && ally.d.resWater) resFactor -= effResistPct(ally.d.resWater) / 100;
        if (sk.ele === 'earth' && ally.d && ally.d.resEarth) resFactor -= effResistPct(ally.d.resEarth) / 100;
        if (sk.ele === 'wind' && ally.d && ally.d.resWind) resFactor -= effResistPct(ally.d.resWind) / 100;
        resFactor = Math.max(0, Math.min(1, resFactor));

        let allyMr = (ally.d && ally.d.mr !== undefined) ? ally.d.mr : 10;
        let mrFactor = mrMult(allyMr);
        let allyDr = (ally.d && ally.d.dr !== undefined) ? ally.d.dr : 0;

        let dmg = 0;
        if (isDamageSkill) {
            if (sk.fixedDmg) {
                dmg = baseMagicDmg + extraMagicDmg;
            } else {
                dmg = Math.floor(Math.floor((baseMagicDmg + extraMagicDmg) * resFactor) * mrFactor) - allyDr;
            }
        } else {
            dmg = Math.max(5, Math.floor(mob.lv / 2));
        }

        if (mob._sherine) dmg = Math.floor(dmg * 2);
        if (mob._grace) dmg = Math.floor(dmg * 2);
        dmg = Math.max(1, dmg);

        if (ally.buffs && ally.buffs.sk_holy_barrier > 0) dmg = Math.floor(dmg * 0.7);

        // 平衡調整：傭兵承受傷害倍率
        dmg = Math.max(1, Math.floor(dmg * CONFIG.MERC_DAMAGE_TAKEN_SCALE));

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

    // 6. 傭兵自然回血回魔、全體持續回復魔法聯動以及玩家治療聯動
    if (typeof window.tick === 'function' && !window.tick.isHooked) {
        const originalTick = window.tick;
        window.tick = function () {
            let hotTicked = false;
            let hotHealAmount = 0;
            let hotSkName = '';
            
            // 預判原版 tick 內是否會觸發 HoT 恢復
            if (player && player.hot && !player.dead) {
                if (player.hot.cd - 1 <= 0) {
                    hotTicked = true;
                    hotSkName = player.hot.skName;
                    
                    let _spCoefHot = (1 + (3 * (player.d.magicDmg || 0) / 16));
                    hotHealAmount = player.hot.healDice
                        ? Math.max(1, Math.floor((rollDice(player.hot.healDice[0], player.hot.healDice[1]) + (player.hot.healBase || 0)) * _spCoefHot))
                        : Math.max(1, roll(player.hot.valDice[0], player.hot.valDice[1]) + (player.d.magicDmg || 0));
                }
            }

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

                // 2. 如果回城 (地圖以 town_ 開頭)，自動解散已陣亡的協力傭兵，並補滿存活傭兵的血魔
                if (typeof mapState !== 'undefined' && mapState && mapState.current && mapState.current.startsWith('town_')) {
                    let hasDead = player.allies.some(ally => ally && (ally.hp !== undefined ? ally.hp : ally.curHp) <= 0);
                    if (hasDead) {
                        player.allies = player.allies.filter(ally => ally && (ally.hp !== undefined ? ally.hp : ally.curHp) > 0);
                        logSys(`<span class="text-slate-400 font-bold">「陣亡的協力傭兵已於回城後自動解散。」</span>`);
                    }
                    
                    // 補滿存活傭兵的血魔
                    let healedAny = false;
                    player.allies.forEach(ally => {
                        if (ally && (ally.hp !== undefined ? ally.hp : ally.curHp) > 0) {
                            if (ally.hp !== ally.mhp || ally.mp !== ally.mmp) {
                                ally.hp = ally.mhp;
                                ally.curHp = ally.mhp;
                                ally.mp = ally.mmp;
                                healedAny = true;
                            }
                        }
                    });
                    
                    if (hasDead || healedAny) {
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

                // 4. 生命的祝福 (HoT) 全體 25% 聯動 (平衡調整)
                if (hotTicked && hotSkName === DB.skills.sk_elf_lifebless.n) {
                    player.allies.forEach(ally => {
                        if (ally && (ally.hp !== undefined ? ally.hp : ally.curHp) > 0) {
                            if (ally.hp === undefined) ally.hp = ally.curHp || ally.mhp;
                            let reducedHot = Math.max(1, Math.floor(hotHealAmount * getMercHealScale()));
                            ally.hp = Math.min(ally.mhp, ally.hp + reducedHot);
                            ally.curHp = ally.hp;
                            logCombat(`[團隊] <span class="text-emerald-300 font-bold">${ally._allyName}</span> 受到生命的祝福持續回復了 ${reducedHot} HP。`, 'heal');
                        }
                    });
                    if (typeof updateUI === 'function') updateUI();
                }
            }
        };
        window.tick.isHooked = true;
    }

    // 7. 覆寫 window.castSkill 實現治療重定向與全體治療
    if (typeof window.castSkill === 'function' && !window.castSkill.isHooked) {
        const originalCastSkill = window.castSkill;
        window.castSkill = function (skId) {
            const sk = DB.skills[skId];
            if (!sk) return originalCastSkill.apply(this, arguments);

            const isHealSkill = sk.type === 'heal';
            if (!isHealSkill) return originalCastSkill.apply(this, arguments);

            // 排除解毒術、聖潔之光、魔法相消術等淨化技能
            const isPurify = ['sk_antidote', 'sk_holy_light', 'sk_cancel'].includes(skId);
            if (isPurify) return originalCastSkill.apply(this, arguments);

            // 判斷是否為全體治療技能
            const isPartyHeal = skId === 'sk_full_heal';

            let isWaterVitalActive = !!(player && player.buffs && player.buffs.sk_elf_watervital > 0 && (player._waterVitalCd || 0) <= 0);
            let oldPlayerHp = player.hp;

            if (targetAlly && !isPartyHeal) {
                isRedirectingLog = true;
            }

            let res;
            try {
                res = originalCastSkill.apply(this, arguments);
            } finally {
                isRedirectingLog = false;
            }

            if (res !== false) {
                let _spCoefHeal = (1 + (3 * (player.d.magicDmg || 0) / 16));
                let heal = sk.healDice
                    ? Math.max(1, Math.floor((rollDice(sk.healDice[0], sk.healDice[1]) + (sk.healBase || 0)) * _spCoefHeal))
                    : Math.max(1, (sk.valBase || 0) + roll(sk.valDice[0], sk.valDice[1]) + (player.d.magicDmg || 0));
                
                if (isWaterVitalActive) {
                    heal = heal * 2;
                }

                if (isPartyHeal) {
                    // 全體治療：所有存活夥伴獲得 25% 恢復量 (平衡調整)
                    if (player.allies && player.allies.length > 0) {
                        player.allies.forEach(ally => {
                            if (ally && (ally.hp !== undefined ? ally.hp : ally.curHp) > 0) {
                                if (ally.hp === undefined) ally.hp = ally.curHp || ally.mhp;
                                let reducedHeal = Math.max(1, Math.floor(heal * getMercHealScale()));
                                ally.hp = Math.min(ally.mhp, ally.hp + reducedHeal);
                                ally.curHp = ally.hp;
                                logCombat(`[團隊] <span class="text-emerald-300 font-bold">${ally._allyName}</span> 受到全部治癒術恢復了 ${reducedHeal} HP。`, 'heal');
                            }
                        });
                    }
                } else if (targetAlly) {
                    // 單體治療：重定向至特定傭兵 (受療恢復量) (平衡調整)
                    player.hp = oldPlayerHp; // 還原玩家 HP

                    if (targetAlly.hp === undefined) targetAlly.hp = targetAlly.curHp || targetAlly.mhp;
                    let reducedHeal = Math.max(1, Math.floor(heal * getMercHealScale()));
                    targetAlly.hp = Math.min(targetAlly.mhp, targetAlly.hp + reducedHeal);
                    targetAlly.curHp = targetAlly.hp;

                    logCombat(`施放 ${sk.n} 治療 [傭兵] <span class="text-emerald-300 font-bold">${targetAlly._allyName}</span>，恢復了 ${reducedHeal} 點 HP。`, 'heal');
                } else {
                    // 玩家自身單體治療：不再進行 10% 分水聯動
                }

                if (typeof updateUI === 'function') updateUI();
            }
            return res;
        };
        window.castSkill.isHooked = true;
    }

    // 8. Hook window.useItem 實現藥水重定向
    if (typeof window.useItem === 'function' && !window.useItem.isHooked) {
        const originalUseItem = window.useItem;
        window.useItem = function (u, silent = false) {
            let item = player.inv.find(i => i.uid === u);
            if (!item) return originalUseItem.apply(this, arguments);

            let isHealPotion = item.id.includes('potion_heal') || item.id === 'potion_strong' || item.id === 'potion_ult';
            let oldPlayerHp = player.hp;

            let res = originalUseItem.apply(this, arguments);

            if (res !== false && isHealPotion && targetPotionAlly) {
                player.hp = oldPlayerHp; // 還原玩家 HP

                let d = DB.items[item.id];
                let h = Math.floor(d.val * (1 + getConPotionPct(player.d.con) / 100));
                if (hasMastery('k_survive')) h = Math.floor(h * 1.25);

                // 藥水給傭兵使用時受療恢復量 (平衡調整)
                let reducedH = Math.max(1, Math.floor(h * getMercHealScale()));
                if (targetPotionAlly.hp === undefined) targetPotionAlly.hp = targetPotionAlly.curHp || targetPotionAlly.mhp;
                targetPotionAlly.hp = Math.min(targetPotionAlly.mhp, targetPotionAlly.hp + reducedH);
                targetPotionAlly.curHp = targetPotionAlly.hp;

                logSys(`給予 [傭兵] ${targetPotionAlly._allyName} 飲用 ${d.n}，恢復 ${reducedH} HP。`);
                if (typeof updateUI === 'function') updateUI();
            }
            return res;
        };
        window.useItem.isHooked = true;
    }

    // 9. Hook window.logCombat 用以過濾與重算戰鬥日誌
    if (typeof window.logCombat === 'function' && !window.logCombat.isHooked) {
        const originalLogCombat = window.logCombat;
        window.logCombat = function (msg, type) {
            if (isRedirectingLog && type === 'heal' && msg.includes('恢復了')) {
                return; // 過濾重定向玩家補血 log
            }
            
            // 如果是傭兵攻擊，將輸出的傷害數值進行倍率調整顯示
            if (isAllyAttacking) {
                msg = msg.replace(/(造成\s*(?:<span[^>]*>)?\s*)(\d+)(\s*(?:<\/span>)?\s*點傷害)/g, function (match, prefix, numStr, suffix) {
                    let num = parseInt(numStr);
                    let reducedNum = Math.max(1, Math.floor(num * CONFIG.MERC_DAMAGE_SCALE));
                    return prefix + reducedNum + suffix;
                });
            }
            return originalLogCombat.apply(this, arguments);
        };
        window.logCombat.isHooked = true;
    }

    // 10. Hook window.autoActions 增加傭兵自動吃藥水邏輯
    if (typeof window.autoActions === 'function' && !window.autoActions.isHooked) {
        const originalAutoActions = window.autoActions;
        window.autoActions = function () {
            // 優先執行玩家自身自動吃藥/BUFF邏輯
            originalAutoActions.apply(this, arguments);

            // 傭兵自動吃藥
            if (!state.running || player.dead) return;
            
            const mercHealTypeEl = document.getElementById('set-merc-heal-type');
            const mercHealType = mercHealTypeEl ? mercHealTypeEl.value : '';
            if (mercHealType !== 'potion') return; // 只有選擇使用藥水才執行
            
            if (player.cds.pot > 0) return; // 與玩家共用吃藥冷卻

            const mercHpThrEl = document.getElementById('set-merc-hp-thr');
            const mercHpThr = mercHpThrEl ? (parseInt(mercHpThrEl.value) || 0) : 0;
            if (mercHpThr <= 0) return;

            if (player.allies && player.allies.length > 0) {
                // 尋找第一隻需要補血的存活傭兵
                let target = player.allies.find(ally => {
                    if (!ally) return false;
                    let hp = ally.hp !== undefined ? ally.hp : (ally.curHp !== undefined ? ally.curHp : ally.mhp);
                    if (hp <= 0) return false;
                    let pct = (hp / ally.mhp) * 100;
                    return pct <= mercHpThr;
                });

                if (target) {
                    const potEl = document.getElementById('set-pot');
                    const potId = potEl ? potEl.value : 'potion_heal';
                    const item = player.inv.find(i => i.id === potId);
                    if (item) {
                        targetPotionAlly = target;
                        try {
                            useItem(item.uid, true);
                        } finally {
                            targetPotionAlly = null;
                        }
                    } else if (document.getElementById('set-auto-buy-pot')?.checked) {
                        // 自動買藥水補貨
                        let needed = 100;
                        let unitPrice = shopPrice(DB.items[potId].p);
                        if (player.gold >= needed * unitPrice) {
                            player.gold -= needed * unitPrice;
                            gainItem(potId, needed, true, true);
                            logSys(`自動消耗 ${needed * unitPrice} 金幣購買了 ${needed} 瓶${DB.items[potId].n}。`);
                            let fresh = player.inv.find(i => i.id === potId);
                            if (fresh) {
                                targetPotionAlly = target;
                                try {
                                    useItem(fresh.uid, true);
                                } finally {
                                    targetPotionAlly = null;
                                }
                            }
                        }
                    }
                }
            }
        };
        window.autoActions.isHooked = true;
    }

    // 11. Hook window.autoCastSpells 增加傭兵自動補血魔法邏輯
    if (typeof window.autoCastSpells === 'function' && !window.autoCastSpells.isHooked) {
        const originalAutoCastSpells = window.autoCastSpells;
        window.autoCastSpells = function () {
            // 優先執行玩家自身自動施法（給予玩家補血最高優先權）
            originalAutoCastSpells.apply(this, arguments);

            // 傭兵自動補血
            if (!state.running || player.dead) return;
            
            const mercHealTypeEl = document.getElementById('set-merc-heal-type');
            const mercHealType = mercHealTypeEl ? mercHealTypeEl.value : '';
            if (mercHealType !== 'magic') return; // 只有選擇使用治癒魔法才執行
            
            if ((player.d.loadTier || 0) >= 2) return; // 負重 82%+ 暫停施法
            if (player.cds.healSk > 0) return; // 與玩家共用治癒 CD

            const healSkEl = document.getElementById('sel-heal-skill');
            const healSk = healSkEl ? healSkEl.value : '';
            if (!healSk) return;

            const mercHpThrEl = document.getElementById('set-merc-hp-thr');
            const mercHpThr = mercHpThrEl ? (parseInt(mercHpThrEl.value) || 0) : 0;
            if (mercHpThr <= 0) return;

            if (player.allies && player.allies.length > 0) {
                // 尋找第一隻需要補血的存活傭兵
                let target = player.allies.find(ally => {
                    if (!ally) return false;
                    let hp = ally.hp !== undefined ? ally.hp : (ally.curHp !== undefined ? ally.curHp : ally.mhp);
                    if (hp <= 0) return false;
                    let pct = (hp / ally.mhp) * 100;
                    return pct <= mercHpThr;
                });

                if (target) {
                    targetAlly = target;
                    try {
                        castSkill(healSk);
                    } finally {
                        targetAlly = null;
                    }
                }
            }
        };
        window.autoCastSpells.isHooked = true;
    }

    // Hook window.alliesTick 實現傭兵輸出調降 40% (利用 getter/setter 阻截 HP 扣減)
    if (typeof window.alliesTick === 'function' && !window.alliesTick.isHooked) {
        const originalAlliesTick = window.alliesTick;
        window.alliesTick = function () {
            let cleanupList = [];
            
            // 攔截場上所有存活怪物的 HP 扣減
            if (typeof mapState !== 'undefined' && mapState && mapState.mobs) {
                mapState.mobs.forEach(m => {
                    if (m && m.curHp !== undefined) {
                        let originalCurHp = m.curHp;
                        Object.defineProperty(m, 'curHp', {
                            get() { return originalCurHp; },
                            set(val) {
                                let diff = originalCurHp - val;
                                if (diff > 0 && isAllyAttacking) {
                                    // 傭兵造成之傷害調整倍率
                                    let reducedDmg = Math.max(1, Math.floor(diff * CONFIG.MERC_DAMAGE_SCALE));
                                    originalCurHp = originalCurHp - reducedDmg;
                                } else {
                                    originalCurHp = val;
                                }
                            },
                            configurable: true
                        });
                        cleanupList.push({
                            mob: m,
                            orig: originalCurHp
                        });
                    }
                });
            }

            isAllyAttacking = true;
            try {
                originalAlliesTick.apply(this, arguments);
            } finally {
                isAllyAttacking = false;
                // 恢復原版 curHp 屬性描述，防止內建模擬機制或保存數據異常
                cleanupList.forEach(item => {
                    delete item.mob.curHp;
                    item.mob.curHp = item.orig;
                });
            }
        };
        window.alliesTick.isHooked = true;
    }

    // UI 動態注入與自定義設定儲存/載入
    function injectMercenaryUI() {
        const healSkillSelect = document.getElementById('sel-heal-skill');
        if (healSkillSelect && !document.getElementById('set-merc-hp-thr')) {
            const mercHealContainer = document.createElement('div');
            mercHealContainer.id = 'klh-merc-heal-container';
            mercHealContainer.innerHTML = `
                <div class="flex justify-between items-center mb-2 mt-3 text-sm">
                    <span class="text-emerald-400 font-bold">傭兵補助 HP &lt;</span>
                    <span><input type="number" id="set-merc-hp-thr" value="40"
                            class="w-12 bg-slate-900 border border-slate-600 text-center text-white rounded">%</span>
                </div>
                <select id="set-merc-heal-type"
                    class="w-full bg-slate-900 border border-slate-600 text-emerald-300 px-2 py-2 mb-3 rounded text-sm outline-none">
                    <option value="" class="text-slate-400">無</option>
                    <option value="magic" class="text-emerald-300">使用治癒魔法</option>
                    <option value="potion" class="text-emerald-300">使用生命藥水</option>
                </select>
            `;
            // 插入至治癒魔法選擇框下方
            healSkillSelect.parentNode.insertBefore(mercHealContainer, healSkillSelect.nextSibling);
            
            document.getElementById('set-merc-hp-thr').addEventListener('change', () => {
                if (typeof saveGame === 'function') saveGame();
            });
            document.getElementById('set-merc-heal-type').addEventListener('change', () => {
                if (typeof saveGame === 'function') saveGame();
            });
        }
    }

    function restoreMercenarySettings() {
        injectMercenaryUI();
        if (player && player.config) {
            const mercHpThrEl = document.getElementById('set-merc-hp-thr');
            const mercHealTypeEl = document.getElementById('set-merc-heal-type');
            if (mercHpThrEl) {
                if (player.config.mercHpThr !== undefined) {
                    mercHpThrEl.value = player.config.mercHpThr;
                } else {
                    mercHpThrEl.value = "40";
                    player.config.mercHpThr = "40";
                }
            }
            if (mercHealTypeEl) {
                if (player.config.mercHealType !== undefined) {
                    mercHealTypeEl.value = player.config.mercHealType;
                } else {
                    mercHealTypeEl.value = "";
                    player.config.mercHealType = "";
                }
            }
        }
    }

    function ensureMercenaryUiAndSettings() {
        if (isUiInitialized) return;
        if (document.getElementById('automation-panel')) {
            injectMercenaryUI();
            restoreMercenarySettings();
            isUiInitialized = true;
        }
    }

    if (typeof window.saveGame === 'function' && !window.saveGame.isHookedMerc) {
        const originalSaveGame = window.saveGame;
        window.saveGame = function () {
            // 1. 呼叫原始存檔 (這會建立全新的 player.config 並儲存到 localStorage)
            let res = originalSaveGame.apply(this, arguments);

            // 2. 存檔後，在記憶體與 LocalStorage 中補回傭兵自定義設定
            if (player && player.config) {
                const mercHpThrEl = document.getElementById('set-merc-hp-thr');
                const mercHealTypeEl = document.getElementById('set-merc-heal-type');
                
                let valHpThr = mercHpThrEl ? mercHpThrEl.value : "40";
                let valHealType = mercHealTypeEl ? mercHealTypeEl.value : "";
                
                player.config.mercHpThr = valHpThr;
                player.config.mercHealType = valHealType;
                
                // 3. 同步寫入 LocalStorage，以防被原版 saveGame() 覆寫擦除
                if (typeof currentSlot !== 'undefined') {
                    let s = localStorage.getItem('lineage_idle_save_' + currentSlot);
                    if (s) {
                        try {
                            let d = JSON.parse(s);
                            if (d.p) {
                                if (!d.p.config) d.p.config = {};
                                d.p.config.mercHpThr = valHpThr;
                                d.p.config.mercHealType = valHealType;
                                localStorage.setItem('lineage_idle_save_' + currentSlot, JSON.stringify(d));
                            }
                        } catch (e) {
                            console.error("[klh_team] 寫入 LocalStorage 自定義存檔失敗:", e);
                        }
                    }
                }
            }
            return res;
        };
        window.saveGame.isHookedMerc = true;
    }

    if (typeof window.loadGame === 'function' && !window.loadGame.isHookedMerc) {
        const originalLoadGame = window.loadGame;
        window.loadGame = function () {
            let res = originalLoadGame.apply(this, arguments);
            restoreMercenarySettings();
            return res;
        };
        window.loadGame.isHookedMerc = true;
    }

    if (typeof window.updateUI === 'function' && !window.updateUI.isHookedMerc) {
        const originalUpdateUI = window.updateUI;
        window.updateUI = function () {
            ensureMercenaryUiAndSettings();
            return originalUpdateUI.apply(this, arguments);
        };
        window.updateUI.isHookedMerc = true;
    }

    // 12. 高效無效能損耗渲染 (Hook window.allyName)
    if (typeof window.allyName === 'function' && !window.allyName.isHooked) {
        const originalAllyName = window.allyName;
        window.allyName = function (a) {
            let name = originalAllyName(a);
            if (!a) return name;
            
            if (a.hp === undefined) {
                a.hp = a.curHp !== undefined ? a.curHp : a.mhp;
            }
            a.hp = Math.floor(a.hp);
            a.curHp = a.hp;
            if (a.mp !== undefined) {
                a.mp = Math.floor(a.mp);
            }
            const hp = Math.max(0, a.hp);
            const mhp = Math.floor(a.mhp || 100);
            const mp = Math.max(0, a.mp || 0);
            const mmp = Math.floor(a.mmp || 0);

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

    // Hook window.buildAlly 確保傭兵在初始化快照時，其血量與魔力即為乾淨的整數，從而避免戰鬥日誌名稱中出現浮點數
    if (typeof window.buildAlly === 'function' && !window.buildAlly.isHooked) {
        const originalBuildAlly = window.buildAlly;
        window.buildAlly = function () {
            let ally = originalBuildAlly.apply(this, arguments);
            if (ally) {
                if (ally.hp !== undefined) ally.hp = Math.floor(ally.hp);
                if (ally.curHp !== undefined) ally.curHp = Math.floor(ally.curHp);
                if (ally.mhp !== undefined) ally.mhp = Math.floor(ally.mhp);
                if (ally.mp !== undefined) ally.mp = Math.floor(ally.mp);
                if (ally.mmp !== undefined) ally.mmp = Math.floor(ally.mmp);
                // 重新渲染並賦予乾淨無小數點的 HTML 名稱，這樣戰鬥日誌中顯示的數值就是完美的整數
                if (typeof allyName === 'function') {
                    ally._allyName = allyName(ally);
                }
            }
            return ally;
        };
        window.buildAlly.isHooked = true;
    }

})();
