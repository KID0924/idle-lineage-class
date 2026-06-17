/* ============================================================================
 * klh_GM2.js — 高級藥水、神之祝福與掉寶藥水機制 & 克里斯特兌換 & 強力短劍屬性繼承 & 快速批量賣出
 *
 * 設計原則: 完全不改原作者程式碼，只從外面「包住」全域函式 (monkey-patch)。
 * 掛接方式: 在 index.html 的 </body> 標籤正上方，插入以下外掛腳本：
 * * <script src="klh_GM2.js?v=20260616"></script>
 * ========================================================================== */

(function () {
    // 注入發光特效 CSS
    function injectGlowStyles() {
        const css = `
            @keyframes earth3Glow {
                0%, 100% { filter: drop-shadow(0 0 4px rgba(245, 158, 11, 0.55)); }
                50% { filter: drop-shadow(0 0 10px rgba(245, 158, 11, 1)); }
            }
            .earth3-glow { animation: earth3Glow 2s infinite ease-in-out !important; }

            @keyframes earth5Glow {
                0%, 100% { filter: drop-shadow(0 0 6px rgba(217, 119, 6, 0.6)) drop-shadow(0 0 12px rgba(217, 119, 6, 0.4)); }
                50% { filter: drop-shadow(0 0 12px rgba(217, 119, 6, 1)) drop-shadow(0 0 24px rgba(217, 119, 6, 0.8)); }
            }
            .earth5-glow { animation: earth5Glow 2s infinite ease-in-out !important; }
        `;
        let style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
    }

    // 1. 初始化自定義資料庫與屬性
    function initCustomDB() {
        if (typeof DB === 'undefined' || !DB.items) return;

        // 1-1. 開發者測試短劍數值繼承 (繼承 v1.17 測試版設定)
        let dagger = DB.items["wpn_shortsword"];
        if (dagger) {
            dagger.dmgS = 600;
            dagger.dmgL = 800;
            dagger.hit = 1000;
            dagger.spd = 0.1;
            dagger.safe = 1000;
        }

        // 1-2. 新增四種自定義藥水 (加入對應外觀與發光屬性)
        DB.items["potion_super_white"] = {
            n: "濃縮白色藥水",
            type: "pot",
            req: "all",
            p: 1200,
            c: "text-white font-bold",
            d: "恢復 180 HP",
            val: 180,
            gachaWeight: 0,
            img: "assets/icons/items/白色藥水.png" // 外觀採用普通白色藥水圖案
        };

        DB.items["potion_hyper_white"] = {
            n: "超級濃縮白色藥水",
            type: "pot",
            req: "all",
            p: 2400,
            c: "text-white font-bold",
            d: "恢復 540 HP",
            val: 540,
            gachaWeight: 0,
            img: "assets/icons/items/白色藥水.png" // 外觀採用普通白色藥水圖案
        };

        DB.items["potion_droprate"] = {
            n: "掉寶藥水",
            type: "pot",
            req: "all",
            p: 1000,
            c: "text-green-300 font-bold",
            d: "獲得金幣x2、裝備掉落率x3、材料掉落率x2，持續 600 秒",
            eff: "droprate",
            dur: 600,
            gachaWeight: 0,
            img: "assets/icons/items/自我加速藥水.png" // 外觀採用自我加速藥水圖案
        };

        DB.items["potion_god_bless"] = {
            n: "神之祝福藥水",
            type: "pot",
            req: "all",
            p: 10000,
            c: "text-yellow-300 font-bold",
            d: "怪物掉落裝備時祝福機率x3、附加席琳套裝效果機率x2，持續 600 秒 (無法自動購買)",
            eff: "god_bless",
            dur: 600,
            gachaWeight: 0,
            img: "assets/icons/items/萬能藥(WIS).png" // 外觀採用萬能藥(WIS)圖案
        };

        // 1-3. 註冊增益名稱 (若 BUFF_NAMES 存在)
        if (typeof BUFF_NAMES !== 'undefined') {
            BUFF_NAMES.droprate = "掉寶藥水";
            BUFF_NAMES.god_bless = "神之祝福";
        }

        // 1-4. 註冊虛擬技能以供狀態欄著色顯示
        if (typeof DB.skills !== 'undefined') {
            DB.skills.droprate = { n: "掉寶藥水", type: "buff" };
            DB.skills.god_bless = { n: "神之祝福", type: "buff" };
        }

        // 1-5. 動態注入自動喝水下拉選單選項
        initPotSelectOptions();
    }

    // 2. 動態添加自動喝水選項至 #set-pot 下拉選單
    function initPotSelectOptions() {
        let potSel = document.getElementById('set-pot');
        if (potSel) {
            if (!potSel.querySelector('option[value="potion_super_white"]')) {
                let opt1 = document.createElement('option');
                opt1.value = 'potion_super_white';
                opt1.className = 'text-white';
                opt1.textContent = '濃縮白色藥水';
                potSel.appendChild(opt1);
            }
            if (!potSel.querySelector('option[value="potion_hyper_white"]')) {
                let opt2 = document.createElement('option');
                opt2.value = 'potion_hyper_white';
                opt2.className = 'text-white';
                opt2.textContent = '超級濃縮白色藥水';
                potSel.appendChild(opt2);
            }
        }
    }

    // 3. 動態注入自動使用與自動購買核取方塊 (調整位置至「藍色藥水」下方)
    function initAutoBuffCheckboxes() {
        let blueRow = document.getElementById('set-blue')?.closest('.col-span-2');
        if (blueRow && !document.getElementById('set-droprate')) {
            let html = `
                <div class="col-span-2 flex justify-between items-center border-t border-slate-700 pt-2 mt-1">
                    <label class="cursor-pointer flex items-center gap-2">
                        <input type="checkbox" id="set-droprate" class="w-4 h-4"> 
                        <span class="text-green-300 font-bold">掉寶藥水</span>
                    </label>
                    <label class="cursor-pointer flex items-center gap-1 text-xs text-slate-400">
                        <input type="checkbox" id="set-auto-buy-droprate" class="w-3 h-3"> 
                        <span>自動購買</span>
                    </label>
                </div>
                <div class="col-span-2 flex justify-between items-center border-t border-slate-700 pt-2 mt-1">
                    <label class="cursor-pointer flex items-center gap-2">
                        <input type="checkbox" id="set-god-bless" class="w-4 h-4"> 
                        <span class="text-yellow-300 font-bold">神之祝福藥水</span>
                    </label>
                    <span class="text-xs text-slate-500">無自動購買</span>
                </div>
            `;
            blueRow.insertAdjacentHTML('afterend', html);
        }
    }

    // 4. 覆寫 window.getGlowClass 處理發光特效
    if (typeof window.getGlowClass === 'function') {
        const originalGetGlowClass = window.getGlowClass;
        window.getGlowClass = function (item, d) {
            let itemId = (item && item.id) || (d && d.id);
            if (!itemId && d) {
                for (let key in DB.items) {
                    if (DB.items[key] === d) {
                        itemId = key;
                        break;
                    }
                }
            }

            if (itemId === 'potion_super_white') return 'earth3-glow'; // 崩裂橘黃發光
            if (itemId === 'potion_hyper_white') return 'earth5-glow'; // 地靈深金琥珀發光
            if (itemId === 'potion_droprate') return 'bless-glow';     // 黃金祝福發光
            if (itemId === 'potion_god_bless') return 'bless-glow';    // 黃金祝福發光

            return originalGetGlowClass(item, d);
        };
    }

    // 5. 覆寫 window.getShopItemsForNpc，使所有包含「白色藥水」的雜貨商店皆販售新藥水，且排列於「白色藥水」正下方
    if (typeof window.getShopItemsForNpc === 'function') {
        const originalGetShopItemsForNpc = window.getShopItemsForNpc;
        window.getShopItemsForNpc = function (npcId) {
            let list = originalGetShopItemsForNpc(npcId);
            let idx = list.indexOf("potion_ult"); // 找到「白色藥水」的位置
            if (idx !== -1) {
                // 先過濾掉已存在的自定義藥水 (避免重複寫入)
                list = list.filter(id => id !== "potion_super_white" && id !== "potion_hyper_white" && id !== "potion_droprate");
                // 重新定位並插入至白色藥水下方
                idx = list.indexOf("potion_ult");
                list.splice(idx + 1, 0, "potion_super_white", "potion_hyper_white", "potion_droprate");
            }
            return list;
        };
    }

    // 6. 覆寫 window.useItem 實現新藥水效果
    const originalUseItem = window.useItem;
    window.useItem = function (u, silent = false) {
        if (typeof player === 'undefined' || !player) return originalUseItem(u, silent);
        let item = player.inv.find(i => i.uid === u);
        if (!item) return originalUseItem(u, silent);

        // 處理濃縮與超級濃縮白水
        if (item.id === 'potion_super_white' || item.id === 'potion_hyper_white') {
            if (player.dead) { if (!silent) logSys(`死亡狀態無法使用道具，請先復活。`); return; }
            if (player.cds.pot > 0) return;
            let d = DB.items[item.id];
            let h = Math.floor(d.val * (1 + getConPotionPct(player.d.con) / 100));
            if (typeof hasMastery === 'function' && hasMastery('k_survive')) h = Math.floor(h * 1.25);
            player.hp = Math.min(player.mhp, player.hp + h);
            player.cds.pot = 1;
            if (!silent) logSys(`飲用 ${d.n}，恢復 ${h} HP。`);
            consume(item);
            calcStats();
            updateUI();
            if (!silent && !document.getElementById('item-modal').classList.contains('hidden')) {
                closeModal();
            }
            return;
        }
        // 處理掉寶藥水與神之祝福藥水
        else if (item.id === 'potion_droprate' || item.id === 'potion_god_bless') {
            if (player.dead) { if (!silent) logSys(`死亡狀態無法使用道具，請先復活。`); return; }
            let d = DB.items[item.id];
            player.buffs[d.eff] = d.dur;
            if (!silent) logSys(`使用了 ${d.n}，效果持續 ${d.dur} 秒。`);
            consume(item);
            calcStats();
            updateUI();
            if (!silent && !document.getElementById('item-modal').classList.contains('hidden')) {
                closeModal();
            }
            return;
        }

        return originalUseItem(u, silent);
    };

    // 7. 覆寫 Krista 兌換系統
    window.kristaExchange = function (kind) {
        let cost = 10000;
        let count = 20;

        if (kind === 'god_bless_1') {
            cost = 10000;
            count = 1;
        } else if (kind === 'god_bless_20') {
            cost = 200000;
            count = 20;
        }

        if ((player.gold || 0) < cost) {
            logSys(`<span class="text-red-400">金幣不足（需 ${cost.toLocaleString()}）。</span>`);
            return;
        }

        let cfg = {
            wpn: { out: 'new_item_bless_wpn', outNm: '賦予武器祝福卷軸', type: '張' },
            arm: { out: 'new_item_bless_arm', outNm: '賦予盔甲祝福卷軸', type: '張' },
            acc: { out: 'new_item_bless_acc', outNm: '賦予飾品祝福卷軸', type: '張' },
            uncurse: { out: 'new_item_uncurse', outNm: '解除詛咒的卷軸', type: '張' },
            god_bless_1: { out: 'potion_god_bless', outNm: '神之祝福藥水', type: '瓶' },
            god_bless_20: { out: 'potion_god_bless', outNm: '神之祝福藥水', type: '瓶' }
        }[kind];

        if (!cfg) return;

        player.gold -= cost;
        gainItem(cfg.out, count, true, true);
        renderTabs();
        updateUI();
        saveGame();

        let colorClass = cfg.out === 'potion_god_bless' ? 'text-yellow-300' : 'text-purple-300';
        logSys(`花費 ${cost.toLocaleString()} 金幣，換得 ${count} ${cfg.type} <span class="${colorClass} font-bold">${cfg.outNm}</span>。`);

        let _e = document.getElementById('interaction-content');
        if (_e) renderKristaExchange(_e);
    };

    window.renderKristaExchange = function (el) {
        let row = (kind, outNm, type) => `
        <div class="flex items-center justify-between gap-2 bg-slate-800/60 border border-slate-600 rounded p-3">
            <div class="text-sm text-slate-200 leading-relaxed">10,000 金幣 → 20 ${type} <span class="text-purple-300 font-bold">${outNm}</span></div>
            <button class="btn bg-purple-800 hover:bg-purple-700 border-purple-500 py-2 px-4 font-bold shrink-0" onclick="kristaExchange('${kind}')">兌換</button>
        </div>`;

        el.innerHTML = `
        <div class="flex flex-col gap-3 p-1">
            <div class="text-slate-300 text-sm leading-relaxed">克里斯特：只需 10,000 金幣，我就能為你提供各種祝福卷軸、解咒卷軸與神之祝福藥水。</div>
            <div class="text-sm">你的金幣：<span class="text-yellow-400 font-bold">${(player.gold || 0).toLocaleString()}</span></div>
            ${row('wpn', '賦予武器祝福卷軸', '張')}
            ${row('arm', '賦予盔甲祝福卷軸', '張')}
            ${row('acc', '賦予飾品祝福卷軸', '張')}
            ${row('uncurse', '解除詛咒的卷軸', '張')}
            <div class="flex items-center justify-between gap-2 bg-slate-800/60 border border-slate-600 rounded p-3">
                <div class="text-sm text-slate-200 leading-relaxed">10,000 金幣 → 1 瓶 <span class="text-yellow-300 font-bold">神之祝福藥水</span></div>
                <button class="btn bg-purple-800 hover:bg-purple-700 border-purple-500 py-2 px-4 font-bold shrink-0" onclick="kristaExchange('god_bless_1')">兌換</button>
            </div>
            <div class="flex items-center justify-between gap-2 bg-slate-800/60 border border-slate-600 rounded p-3">
                <div class="text-sm text-slate-200 leading-relaxed">200,000 金幣 → 20 瓶 <span class="text-yellow-300 font-bold">神之祝福藥水</span></div>
                <button class="btn bg-purple-800 hover:bg-purple-700 border-purple-500 py-2 px-4 font-bold shrink-0" onclick="kristaExchange('god_bless_20')">兌換</button>
            </div>
        </div>`;
    };

    // 8. 掉寶與神之祝福核心機制 (Monkey Patch 掉落系統)
    let _isMonsterDrop = false;
    let _currentDroppingMob = null;

    // 覆寫 window.killMob 捕捉掉落上下文、金幣加倍與掉落倍化
    const originalKillMob = window.killMob;
    window.killMob = function (idx) {
        if (typeof player === 'undefined' || !player) return originalKillMob(idx);
        let mob = mapState.mobs[idx];
        if (!mob || mob._dead) return originalKillMob(idx);

        _isMonsterDrop = true;
        _currentDroppingMob = mob;

        let originalMobDrops = null;
        let originalDarkWeaponDrops = null;
        let originalDarkCrystalDrops = null;

        // 掉寶藥水：修改資料庫掉率以達成 3倍/2倍 掉落
        if (player.buffs.droprate > 0) {
            // 複製並修改 MOB_DROPS
            if (typeof MOB_DROPS !== 'undefined' && MOB_DROPS[mob.n]) {
                originalMobDrops = MOB_DROPS[mob.n];
                MOB_DROPS[mob.n] = originalMobDrops.map(entry => {
                    let itemId = entry[0];
                    let rate = entry[1];
                    let d = DB.items[itemId];
                    let isEquip = d && (d.type === 'wpn' || d.type === 'arm' || d.type === 'acc');
                    let mult = isEquip ? 3 : 2;
                    return [itemId, rate * mult];
                });
            }
            // 複製並修改 DARK_WEAPON_DROPS
            if (typeof DARK_WEAPON_DROPS !== 'undefined' && DARK_WEAPON_DROPS[mob.n]) {
                originalDarkWeaponDrops = DARK_WEAPON_DROPS[mob.n];
                DARK_WEAPON_DROPS[mob.n] = originalDarkWeaponDrops.map(entry => {
                    let itemId = entry[0];
                    let rate = entry[1];
                    let d = DB.items[itemId];
                    let isEquip = d && (d.type === 'wpn' || d.type === 'arm' || d.type === 'acc');
                    let mult = isEquip ? 3 : 2;
                    return [itemId, rate * mult];
                });
            }
            // 複製並修改 DARK_CRYSTAL_DROPS
            if (typeof DARK_CRYSTAL_DROPS !== 'undefined' && DARK_CRYSTAL_DROPS[mob.n]) {
                originalDarkCrystalDrops = DARK_CRYSTAL_DROPS[mob.n];
                DARK_CRYSTAL_DROPS[mob.n] = originalDarkCrystalDrops.map(entry => {
                    let itemId = entry[0];
                    let rate = entry[1];
                    let d = DB.items[itemId];
                    let isEquip = d && (d.type === 'wpn' || d.type === 'arm' || d.type === 'acc');
                    let mult = isEquip ? 3 : 2;
                    return [itemId, rate * mult];
                });
            }
        }

        try {
            let goldBefore = player.gold || 0;
            originalKillMob(idx);

            // 掉寶藥水：獲得金幣翻倍
            let goldGained = (player.gold || 0) - goldBefore;
            if (goldGained > 0 && player.buffs.droprate > 0) {
                player.gold += goldGained;
                logSys(`[掉寶藥水] 額外獲得 <span class="text-yellow-400 font-bold">${goldGained} 金幣</span>。`);
            }

            // 掉寶藥水：處理 hardcoded 非資料庫迴圈掉落項目的二次加成 (達到 2倍 效果)
            if (player.buffs.droprate > 0) {
                let _dropMult = mob._grace ? 10 : (mob._sherine ? 3 : 1);

                // 1. 黑魔石額外掉落 (材料 2倍)
                let _refine = player.skills.includes('sk_dark_refine');
                if (mapState.current === 'silent_outer') {
                    if (Math.random() < (_refine ? 0.30 : 0.20)) gainItem('mat_blackstone2', 1);
                    if (Math.random() < (_refine ? 0.15 : 0.10)) gainItem('mat_blackstone3', 1);
                } else if (_refine && typeof mapCategoryOf === 'function' && ['wild', 'dungeon'].includes(mapCategoryOf(mapState.current))) {
                    if (Math.random() < 0.01) gainItem('mat_blackstone2', 1);
                    if (Math.random() < 0.005) gainItem('mat_blackstone3', 1);
                    if (Math.random() < 0.001) gainItem('mat_blackstone4', 1);
                }

                // 2. 銀礦石額外掉落 (材料 2倍)
                let _oreRates = { '石頭高崙': 100, '鋼鐵高崙': 100, '侏儒': 50, '侏儒戰士': 50, '黑騎士': 50, '哈柏哥布林': 50, '蜥蜴人': 50 };
                let _or = _oreRates[mob.n];
                if (_or && Math.random() < _or / 100) gainItem('mat_silverore', 1);

                // 3. 40等以上 Boss 賦予祝福卷軸額外掉落 (材料 2倍)
                if (mob.boss && mob.lv >= 40 && mapState.current !== 'dream_island' && !isSiegeArea(mapState.current) && !mob.siegeEnemy) {
                    if (Math.random() < 0.001 * _dropMult) gainItem('new_item_bless_wpn', 1);
                    if (Math.random() < 0.001 * _dropMult) gainItem('new_item_bless_arm', 1);
                    if (Math.random() < 0.0001 * _dropMult) gainItem('new_item_bless_acc', 1);
                }

                // 4. 眠龍/妖森 區域額外掉落 (材料 2倍)
                if (typeof AREA_BONUS_MAPS !== 'undefined' && AREA_BONUS_MAPS.includes(mapState.current)) {
                    let bonusRate = (player.skills.includes('sk_elf_worldtree') ? 0.30 : 0.20) * _dropMult;
                    if (typeof AREA_BONUS_ITEMS !== 'undefined') {
                        AREA_BONUS_ITEMS.forEach(itemId => {
                            if (DB.items[itemId] && Math.random() < Math.min(1, bonusRate)) gainItem(itemId, 1);
                        });
                    }
                }

                // 5. 血盟盟友擊殺掉寶額外判定 (裝備 3倍 -> 額外判定 2 次)
                if ((mob.wild && mob.race === '血盟') || mob.siegeEnemy) {
                    if (typeof pledgeBonusDrop === 'function') {
                        pledgeBonusDrop(mob);
                        pledgeBonusDrop(mob);
                    }
                }
            }
        } finally {
            // 還原 MOB_DROPS 等資料庫
            if (originalMobDrops) MOB_DROPS[mob.n] = originalMobDrops;
            if (originalDarkWeaponDrops) DARK_WEAPON_DROPS[mob.n] = originalDarkWeaponDrops;
            if (originalDarkCrystalDrops) DARK_CRYSTAL_DROPS[mob.n] = originalDarkCrystalDrops;

            _isMonsterDrop = false;
            _currentDroppingMob = null;
        }
    };

    // 覆寫 window.gainItem 以在怪物掉落裝備時控制神之祝福套裝效果 (2倍)
    const originalGainItem = window.gainItem;
    window.gainItem = function (id, cnt = 1, silent = false, forceNormal = false, affixOld = false) {
        let oldForceSherineSet = typeof _forceSherineSet !== 'undefined' ? _forceSherineSet : false;
        if (_isMonsterDrop && player && player.buffs.god_bless > 0 && !forceNormal && typeof _sherineLootCtx !== 'undefined' && _sherineLootCtx) {
            let d = DB.items[id];
            let _slotOk = d && ((d.type === 'wpn' && !d.isArrow)
                || (d.type === 'arm' && ['helm', 'armor', 'gloves', 'boots', 'cloak'].includes(d.slot))
                || ((d.type === 'acc' || d.type === 'arm') && d.slot === 'belt'));
            if (_slotOk) {
                // 額外判定一次席琳套裝效果 (相當於將機率乘 2，若成功則設定 _forceSherineSet 強制賦予)
                let rate = (_sherineLootCtx.boss ? 0.05 : (_sherineLootCtx.grace ? 0.005 : 0.001));
                if (Math.random() < rate) {
                    _forceSherineSet = true;
                }
            }
        }

        try {
            return originalGainItem(id, cnt, silent, forceNormal, affixOld);
        } finally {
            if (typeof _forceSherineSet !== 'undefined') {
                _forceSherineSet = oldForceSherineSet;
            }
        }
    };

    // 覆寫 rollAffixesNew / rollAffixesOld 以在怪物掉落裝備時將祝福機率乘以 3
    const originalRollAffixesNew = window.rollAffixesNew;
    if (typeof originalRollAffixesNew === 'function') {
        window.rollAffixesNew = function () {
            let res = originalRollAffixesNew();
            if (_isMonsterDrop && player && player.buffs.god_bless > 0) {
                // 祝福機率乘 3。若原本失敗，則額外判定 2 次
                if (!res.bless) {
                    let m = (typeof _sherineLootCtx !== 'undefined' && _sherineLootCtx) ? 3 : 1;
                    let blessChance = 0.01 * m;
                    if (Math.random() < blessChance || Math.random() < blessChance) {
                        res.bless = true;
                    }
                }
            }
            return res;
        };
    }

    const originalRollAffixesOld = window.rollAffixesOld;
    if (typeof originalRollAffixesOld === 'function') {
        window.rollAffixesOld = function () {
            let res = originalRollAffixesOld();
            if (_isMonsterDrop && player && player.buffs.god_bless > 0) {
                // 祝福機率乘 3。若原本失敗，則額外判定 2 次
                if (!res.bless) {
                    let m = (typeof _sherineLootCtx !== 'undefined' && _sherineLootCtx) ? 3 : 1;
                    let blessChance = 0.01 * m;
                    if (Math.random() < blessChance || Math.random() < blessChance) {
                        res.bless = true;
                    }
                }
            }
            return res;
        };
    }

    // 9. 覆寫 window.saveGame 以儲存新設定
    if (typeof window.saveGame === 'function') {
        const originalSaveGame = window.saveGame;
        window.saveGame = function () {
            originalSaveGame();
            if (typeof player !== 'undefined' && player && player.config) {
                let chkDroprate = document.getElementById('set-droprate');
                let chkAutoBuyDroprate = document.getElementById('set-auto-buy-droprate');
                let chkGodBless = document.getElementById('set-god-bless');

                player.config.setDroprate = chkDroprate ? chkDroprate.checked : false;
                player.config.setAutoBuyDroprate = chkAutoBuyDroprate ? chkAutoBuyDroprate.checked : false;
                player.config.setGodBless = chkGodBless ? chkGodBless.checked : false;
            }
        };
    }

    // 10. 覆寫 window.loadGame 載入設定，並支援即時還原
    if (typeof window.loadGame === 'function') {
        const originalLoadGame = window.loadGame;
        window.loadGame = function () {
            originalLoadGame();
            restoreCustomSettings();
        };
    }

    // 11. 恢復與載入自定義設定的輔助函式
    function restoreCustomSettings() {
        initAutoBuffCheckboxes();
        if (typeof player !== 'undefined' && player && player.config) {
            let c = player.config;
            let chkDroprate = document.getElementById('set-droprate');
            let chkAutoBuyDroprate = document.getElementById('set-auto-buy-droprate');
            let chkGodBless = document.getElementById('set-god-bless');

            if (chkDroprate && c.setDroprate !== undefined) chkDroprate.checked = c.setDroprate;
            if (chkAutoBuyDroprate && c.setAutoBuyDroprate !== undefined) chkAutoBuyDroprate.checked = c.setAutoBuyDroprate;
            if (chkGodBless && c.setGodBless !== undefined) chkGodBless.checked = c.setGodBless;
        }
    }

    // 12. 覆寫 window.autoActions 實現自動吃藥水與自動購買邏輯
    if (typeof window.autoActions === 'function') {
        const originalAutoActions = window.autoActions;
        window.autoActions = function () {
            originalAutoActions();

            if (typeof player === 'undefined' || !player || player.dead) return;

            // 12-1. 掉寶藥水自動化
            let chkDroprate = document.getElementById('set-droprate');
            if (chkDroprate && chkDroprate.checked && (player.buffs.droprate || 0) <= 0) {
                let item = player.inv.find(i => i.id === 'potion_droprate');
                if (item) {
                    useItem(item.uid, true);
                } else {
                    let chkAutoBuyDroprate = document.getElementById('set-auto-buy-droprate');
                    if (chkAutoBuyDroprate && chkAutoBuyDroprate.checked) {
                        let price = DB.items['potion_droprate'].p;
                        if (player.gold >= price) {
                            player.gold -= price;
                            gainItem('potion_droprate', 1, true, true);
                            let newItem = player.inv.find(i => i.id === 'potion_droprate');
                            if (newItem) useItem(newItem.uid, true);
                        }
                    }
                }
            }

            // 12-2. 神之祝福藥水自動化 (無自動購買)
            let chkGodBless = document.getElementById('set-god-bless');
            if (chkGodBless && chkGodBless.checked && (player.buffs.god_bless || 0) <= 0) {
                let item = player.inv.find(i => i.id === 'potion_god_bless');
                if (item) {
                    useItem(item.uid, true);
                }
            }
        };
    }

    // ============================================================================
    // ⚡ 14. 快速批量賣出系統 (Quick Sell System)
    // ============================================================================
    
    window.quickSell = {
        wpn: { active: false, sel: {} },
        arm: { active: false, sel: {} },
        item: { active: false, sel: {} }
    };

    // 取得該分頁可被批量賣出的背包物品 (未鎖定、非裝備在身上的物品，並排除不可販售物品)
    window._qsEligibleItems = function (type) {
        if (typeof player === 'undefined' || !player || !player.inv) return [];
        return player.inv.filter(i => {
            let d = DB.items[i.id];
            if (!d || i.lock) return false;
            if (d.noSell) return false; // 排除不可販售的關鍵道具 (例如精通之證)
            if (type === 'wpn') return d.type === 'wpn';
            if (type === 'arm') return d.type === 'arm' || d.type === 'acc';
            return d.type !== 'wpn' && d.type !== 'arm' && d.type !== 'acc';
        });
    };

    // 建立批量賣出頭部 UI
    window.buildQuickSellHeader = function (type) {
        let st = window.quickSell[type];
        let hdr = document.createElement('div');
        hdr.className = 'sticky top-0 z-10 mb-1 bg-slate-900 pb-1 flex gap-1';

        if (!st.active) {
            hdr.className = 'sticky top-0 z-10 mb-1 bg-slate-900 pb-1 flex flex-col gap-1';
            hdr.innerHTML = `
                <button onclick="toggleQuickSell('${type}')" class="w-full btn border-amber-700 bg-amber-900/70 hover:bg-amber-800 py-1.5 text-sm font-bold text-amber-200 rounded shadow">💰 批量賣出</button>
                <div class="flex gap-1 w-full">
                    <input type="text" id="fuzzy-sell-input-${type}" placeholder="模糊搜尋 (如: 匕首)..." class="flex-1 bg-slate-950 border border-slate-700 text-white rounded text-xs px-2 py-1" onkeydown="if(event.key==='Enter') runFuzzySearch('${type}')">
                    <button onclick="runFuzzySearch('${type}')" class="btn border-sky-700 bg-sky-900/70 hover:bg-sky-800 py-1 px-3 text-xs font-bold text-sky-200 rounded shadow shrink-0">🔍 搜尋</button>
                    <button onclick="runFuzzySell('${type}')" class="btn border-red-700 bg-red-900/70 hover:bg-red-800 py-1 px-3 text-xs font-bold text-red-200 rounded shadow shrink-0">💥 一鍵賣出</button>
                </div>
            `;
            return hdr;
        }

        let eligible = _qsEligibleItems(type);
        let allSel = eligible.length > 0 && eligible.every(i => st.sel[i.uid]);
        let someSel = eligible.some(i => st.sel[i.uid]);

        // 計算目前勾選的總賣價
        let totalGold = 0;
        eligible.forEach(i => {
            if (st.sel[i.uid]) {
                totalGold += getSellPrice(i) * (i.cnt || 1);
            }
        });

        hdr.innerHTML = `<div class="flex items-center gap-1 bg-slate-900/80 border border-slate-700 rounded p-1 w-full">
            <button onclick="cancelQuickSell('${type}')" class="btn border-slate-600 bg-slate-700 hover:bg-slate-600 px-2 py-1 text-xs font-bold text-white rounded">取消</button>
            <button onclick="runQuickSell('${type}')" class="btn border-amber-600 bg-amber-800 hover:bg-amber-700 px-2 py-1 text-xs font-bold text-amber-200 rounded">賣出 (<span class="text-yellow-400 font-bold">${totalGold.toLocaleString()}</span>金幣)</button>
            <label class="flex items-center gap-1 text-xs text-slate-300 cursor-pointer select-none whitespace-nowrap ml-auto">
                <input type="checkbox" ${allSel ? 'checked' : ''} onchange="quickSellSelectAll('${type}', this.checked)"> 全選
            </label>
        </div>`;
        
        let cb = hdr.querySelector('label input');
        if (cb) cb.indeterminate = someSel && !allSel;
        return hdr;
    };

    // 切換至批量賣出模式
    window.toggleQuickSell = function (type) {
        let st = window.quickSell[type];
        st.active = true;
        st.sel = {};

        // 互斥：關閉該分頁的快速強化模式
        if (typeof quickEnh !== 'undefined' && quickEnh[type]) {
            quickEnh[type].active = false;
            quickEnh[type].sel = {};
        }

        renderTabs(true);
    };

    // 取消批量賣出模式
    window.cancelQuickSell = function (type) {
        let st = window.quickSell[type];
        st.active = false;
        st.sel = {};
        renderTabs(true);
    };

    // 批量全選 / 全不選
    window.quickSellSelectAll = function (type, checked) {
        let st = window.quickSell[type];
        st.sel = {};
        if (checked) {
            _qsEligibleItems(type).forEach(i => st.sel[i.uid] = true);
        }
        renderTabs(true);
    };

    // 勾選單個物品
    window.toggleQuickSellItem = function (type, uid) {
        let st = window.quickSell[type];
        if (st.sel[uid]) {
            delete st.sel[uid];
        } else {
            st.sel[uid] = true;
        }
        renderTabs(true);
    };

    // 執行批量賣出
    window.runQuickSell = function (type) {
        let st = window.quickSell[type];
        let entries = _qsEligibleItems(type).filter(i => st.sel[i.uid]);
        if (!entries.length) {
            logSys(`<span class="text-red-400 font-bold">尚未勾選任何物品。</span>`);
            return;
        }

        let totalGold = 0;
        let sellUids = new Set();
        let details = [];
        let anyGrant = false;

        entries.forEach(entry => {
            sellUids.add(entry.uid);
            let d = DB.items[entry.id];
            if (d && d.grantSkills) {
                anyGrant = true;
            }
            let price = getSellPrice(entry);
            let cnt = entry.cnt || 1;
            let gold = price * cnt;
            totalGold += gold;
            details.push(`${getItemFullName(entry)} x${cnt} (${gold.toLocaleString()}金幣)`);
        });

        // 加金幣、扣背包物品
        player.gold = (player.gold || 0) + totalGold;
        player.inv = player.inv.filter(i => !sellUids.has(i.uid));

        st.active = false;
        st.sel = {};

        logSys(`<span class="text-yellow-400 font-bold">批量賣出完成！</span>獲得 <span class="text-yellow-400 font-bold">${totalGold.toLocaleString()} 金幣</span>。`);
        if (details.length <= 5) {
            details.forEach(d => logSys(`  - 賣出 ${d}`));
        } else {
            logSys(`  - 共賣出 ${details.length} 種物品。`);
        }

        calcStats();
        if (anyGrant && typeof renderSkillSelects === 'function') {
            renderSkillSelects();
        }
        updateUI(); // 🏅 同步更新主畫面金幣與負重顯示
        renderTabs(true);
        saveGame();
    };

    // 模糊搜尋與勾選 (排除鎖定物品)
    window.runFuzzySearch = function (type) {
        let inputEl = document.getElementById(`fuzzy-sell-input-${type}`);
        if (!inputEl) return;
        let query = inputEl.value.trim().toLowerCase();
        if (!query) {
            logSys(`<span class="text-red-400 font-bold">請輸入搜尋關鍵字。</span>`);
            return;
        }

        let eligible = _qsEligibleItems(type);
        let matches = eligible.filter(i => {
            if (i.lock) return false; // 鎖定物品不搜尋不勾選
            let fullName = getItemFullName(i).toLowerCase();
            let d = DB.items[i.id];
            let baseName = d ? d.n.toLowerCase() : '';
            return fullName.includes(query) || baseName.includes(query);
        });

        if (matches.length === 0) {
            logSys(`<span class="text-amber-400 font-bold">找不到符合「${query}」的未鎖定物品。</span>`);
            return;
        }

        // 啟動批量賣出模式
        let st = window.quickSell[type];
        st.active = true;
        st.sel = {};

        // 互斥：關閉該分頁的快速強化模式
        if (typeof quickEnh !== 'undefined' && quickEnh[type]) {
            quickEnh[type].active = false;
            quickEnh[type].sel = {};
        }

        // 自動勾選所有匹配的未鎖定物品
        matches.forEach(i => {
            if (!i.lock) st.sel[i.uid] = true;
        });

        logSys(`<span class="text-green-400 font-bold">已進入批量模式，並自動勾選符合「${query}」的 ${matches.length} 件未鎖定物品。</span>`);
        renderTabs(true);
    };

    // 模糊搜尋一鍵賣出 (排除鎖定物品)
    window.runFuzzySell = function (type) {
        let inputEl = document.getElementById(`fuzzy-sell-input-${type}`);
        if (!inputEl) return;
        let query = inputEl.value.trim().toLowerCase();
        if (!query) {
            logSys(`<span class="text-red-400 font-bold">請輸入搜尋關鍵字。</span>`);
            return;
        }

        let eligible = _qsEligibleItems(type);
        let matches = eligible.filter(i => {
            if (i.lock) return false; // 鎖定物品不賣
            let fullName = getItemFullName(i).toLowerCase();
            let d = DB.items[i.id];
            let baseName = d ? d.n.toLowerCase() : '';
            return fullName.includes(query) || baseName.includes(query);
        });

        if (matches.length === 0) {
            logSys(`<span class="text-amber-400 font-bold">找不到符合「${query}」的未鎖定物品。</span>`);
            return;
        }

        let totalGold = 0;
        let sellUids = new Set();
        let details = [];
        let anyGrant = false;

        matches.forEach(entry => {
            if (entry.lock) return; // 雙重防護
            sellUids.add(entry.uid);
            let d = DB.items[entry.id];
            if (d && d.grantSkills) {
                anyGrant = true;
            }
            let price = getSellPrice(entry);
            let cnt = entry.cnt || 1;
            let gold = price * cnt;
            totalGold += gold;
            details.push(`${getItemFullName(entry)} x${cnt} (${gold.toLocaleString()}金幣)`);
        });

        if (!confirm(`確定要一鍵賣出所有包含「${query}」的 ${matches.length} 件未鎖定物品嗎？\n將會獲得 ${totalGold.toLocaleString()} 金幣。\n(鎖定裝備已被安全排除，不會售出)`)) {
            return;
        }

        // 扣除並售出
        player.inv = player.inv.filter(i => !sellUids.has(i.uid));
        player.gold = (player.gold || 0) + totalGold;

        logSys(`<span class="text-yellow-400 font-bold">模糊一鍵賣出完成！</span>獲得 <span class="text-yellow-400 font-bold">${totalGold.toLocaleString()} 金幣</span>。`);
        if (details.length <= 5) {
            details.forEach(d => logSys(`  - 賣出 ${d}`));
        } else {
            logSys(`  - 共賣出 ${details.length} 種物品。`);
        }

        inputEl.value = ''; // 售出後清除輸入框

        calcStats();
        if (anyGrant && typeof renderSkillSelects === 'function') {
            renderSkillSelects();
        }
        updateUI();
        renderTabs(true);
        saveGame();
    };

    // 互斥處理：覆寫 window.toggleQuickEnhance，點擊快速強化時主動關閉批量賣出
    const originalToggleQuickEnhance = window.toggleQuickEnhance;
    if (typeof originalToggleQuickEnhance === 'function') {
        window.toggleQuickEnhance = function (type) {
            if (window.quickSell && window.quickSell[type]) {
                window.quickSell[type].active = false;
                window.quickSell[type].sel = {};
            }
            originalToggleQuickEnhance(type);
        };
    }

    // 覆寫 window.renderTabs 整合快速強化與批量賣出
    window.renderTabs = function (force) {
        if (state.ff) return; // 補跑期間不刷新畫面
        // ===== 內容簽章：背包/裝備/技能等實際內容沒變時直接跳過重建 =====
        let _sig = (function () {
            let inv = player.inv.map(i => itemSig(i) + '.' + (i.cnt || 1) + '.' + (i.lock ? 1 : 0) + '.' + (i.junk ? 1 : 0)).join(';');
            let eq = Object.keys(player.eq).map(k => { let e = player.eq[k]; return e ? `${k}:${itemSig(e)}.${e.cnt || 0}` : k + ':'; }).join(',');
            let dd = player.d;
            let qsActive = window.quickSell ? (window.quickSell.wpn.active + '.' + window.quickSell.arm.active + '.' + window.quickSell.item.active) : '';
            let qsSel = window.quickSell ? (Object.keys(window.quickSell.wpn.sel).join(',') + ';' + Object.keys(window.quickSell.arm.sel).join(',') + ';' + Object.keys(window.quickSell.item.sel).join(',')) : '';
            let qeActive = typeof quickEnh !== 'undefined' ? (quickEnh.wpn.active + '.' + quickEnh.arm.active) : '';
            let qeSel = typeof quickEnh !== 'undefined' ? (Object.keys(quickEnh.wpn.sel).join(',') + ';' + Object.keys(quickEnh.arm.sel).join(',')) : '';
            return `${inv}#${eq}#${(player.skills || []).join(',')}#${(player.grantedSkills || []).join(',')}#${player.cls}#${player.lv}#${player.elfEle || ''}#${dd.str + dd.dex + dd.con + dd.int + dd.wis}#${qsActive}#${qsSel}#${qeActive}#${qeSel}`;
        })();
        if (!force && _sig === window.renderTabs._sig) return;
        window.renderTabs._sig = _sig;

        // 真的要重建時，先記住各分頁的捲動位置，重建後還原（避免跳回頂端）
        let _scroll = {};
        ['tab-items', 'tab-weapons', 'tab-armors', 'tab-equip', 'tab-skill'].forEach(id => { let el = document.getElementById(id); if (el) _scroll[id] = el.scrollTop; });

        let eDiv = document.getElementById('tab-equip'); eDiv.innerHTML = '';
        { let _wd = player.d || {}; let _t = _wd.loadTier || 0; let _hdr = document.createElement('div'); _hdr.className = 'text-center py-0.5 mb-1 rounded bg-slate-900/60 border border-slate-700 text-sm font-bold leading-tight' + (_t >= 1 ? ' cursor-help' : ''); if (_t >= 1) { _hdr.title = _t === 1 ? '負重50%↑：HP/MP不自然恢復' : (_t === 2 ? '負重82%↑：HP/MP不自然恢復、停自動施法、攻速變慢' : '負重100%↑：HP/MP不自然恢復、停自動施法、攻速大幅變慢'); } _hdr.innerHTML = `<span class="text-slate-400">負重 </span><span class="${getLoadColor(_t)}">${_wd.weightPct || 0}%</span>`; eDiv.appendChild(_hdr); }
        const slots = [{ k: 'wpn', n: '武器' }, { k: 'shield', n: '盾牌' }, { k: 'helm', n: '頭盔' }, { k: 'armor', n: '盔甲' }, { k: 'tshirt', n: 'T恤' }, { k: 'cloak', n: '斗篷' }, { k: 'gloves', n: '手套' }, { k: 'boots', n: '長靴' }, { k: 'amulet', n: '項鍊' }, { k: 'ring1', n: '戒指' }, { k: 'ring2', n: '戒指' }, { k: 'belt', n: '腰帶' }, { k: 'arrow', n: '箭矢' }];

        let setCheck = {}, _setSeen = {};
        for (let k in player.eq) {
            let e = player.eq[k];
            if (e) {
                let ed = DB.items[e.id];
                if (ed.set && !_setSeen[e.id]) { _setSeen[e.id] = true; setCheck[ed.set] = (setCheck[ed.set] || 0) + 1; }
            }
        }
        let activeSets = [];
        if (setCheck['leather'] >= 4) activeSets.push('leather');
        if (setCheck['bone'] >= 3) activeSets.push('bone');
        if (setCheck['dk'] >= 4) activeSets.push('dk');
        if (setCheck['silver'] >= 4) activeSets.push('silver');
        if (setCheck['oasis'] >= 4) activeSets.push('oasis');
        if (setCheck['gnome'] >= 3) activeSets.push('gnome');
        if (setCheck['mage'] >= 2) activeSets.push('mage');
        if (setCheck['kurt'] >= 4) activeSets.push('kurt');
        if (setCheck['mr'] >= 2) activeSets.push('mr');
        if (setCheck['guard'] >= 3) activeSets.push('guard');
        if (setCheck['steel'] >= 5) activeSets.push('steel');
        if (setCheck['kinglord'] >= 4) activeSets.push('kinglord');

        slots.forEach(s => {
            let eq = player.eq[s.k];
            let isSetActive = false;
            if (eq && DB.items[eq.id].set && activeSets.includes(DB.items[eq.id].set)) isSetActive = true;
            let isSherineActive = !!(eq && eq.seteff && player._sherineSetCnt && (player._sherineSetCnt[eq.seteff.slice(0, 2)] || 0) >= 2);

            let el = document.createElement('div');
            el.className = `list-item text-base rounded mb-1 ${isSherineActive
                ? 'bg-green-900 border border-green-400 ring-1 ring-green-400/60 shadow-[0_0_10px_rgba(74,222,128,0.6)]'
                : (isSetActive ? 'bg-amber-900 border border-amber-400 ring-1 ring-amber-400/60 shadow-[0_0_10px_rgba(245,158,11,0.55)]' : 'bg-slate-800')}`;
            if (eq) {
                let d = DB.items[eq.id];
                let imgUrl = getIconUrl(d);
                let glowClass = getGlowClass(eq, d);
                let imgHtml = `<img src="${imgUrl}" onerror="this.style.opacity='0';" class="w-6 h-6 ml-2 object-contain pointer-events-none ${glowClass}">`;
                el.innerHTML = `<span class="text-slate-400 w-12">${s.n}</span><div class="flex items-center justify-end flex-1"><span class="${getItemColor(eq)} text-right font-bold">${getItemFullName(eq)}</span>${imgHtml}</div>`;
                el.onclick = () => openModal(eq, true, s.k);
            } else {
                el.innerHTML = `<span class="text-slate-400 w-12">${s.n}</span><span class="text-slate-600">- 空 -</span>`;
            }
            eDiv.appendChild(el);
        });

        let wDiv = document.getElementById('tab-weapons'); wDiv.innerHTML = '';
        let aDiv = document.getElementById('tab-armors'); aDiv.innerHTML = '';
        let iDiv = document.getElementById('tab-items'); iDiv.innerHTML = '';

        // ⚡ 快速強化與批量賣出頭部
        wDiv.appendChild(buildQuickEnhanceHeader('wpn'));
        wDiv.appendChild(buildQuickSellHeader('wpn'));

        aDiv.appendChild(buildQuickEnhanceHeader('arm'));
        aDiv.appendChild(buildQuickSellHeader('arm'));

        iDiv.appendChild(buildQuickSellHeader('item'));

        player.inv.forEach(i => {
            if (!DB.items[i.id]) return;
            let d = DB.items[i.id];

            let statusTag = '';
            let itemBg = 'bg-slate-800';

            if (d.type === 'skillbk') {
                let sk = DB.skills[d.sk];
                let isClsPossible = skillReqLv(sk, d.sk) !== undefined;

                if (player.skills.includes(d.sk)) {
                    statusTag = '<span class="text-slate-500 text-[10px] font-bold">[已學習]</span>';
                    itemBg = 'bg-slate-900 opacity-70';
                } else if (!isClsPossible) {
                    statusTag = '<span class="text-red-500 text-[10px] font-bold">[無法學習]</span>';
                    itemBg = 'bg-red-950/40';
                }
            }
            else if (d.type === 'wpn' || d.type === 'arm' || d.type === 'acc') {
                let canEquip = checkCanEquip(i);
                if (!canEquip) {
                    statusTag = '<span class="text-red-500 text-[10px] font-bold">[無法裝備]</span>';
                    itemBg = 'bg-red-950/40';
                }
            }

            let el = document.createElement('div');
            el.className = `list-item text-base ${itemBg} rounded mb-1 ${i.lock ? 'border-red-900 border-2' : ''}`;

            let imgUrl = getIconUrl(d);
            let glowClass = getGlowClass(i, d);
            let imgHtml = `<img src="${imgUrl}" onerror="this.style.opacity='0';" class="w-6 h-6 object-contain pointer-events-none ${glowClass}">`;

            let _rowInner = `<div class="flex items-center gap-2">${imgHtml}<span class="${getItemColor(i)} font-bold">${getItemFullName(i)}</span> ${statusTag} ${i.lock ? '<span class="text-xs text-red-500">[🔒]</span>' : ''} ${(i.junk && !i.lock) ? '<span class="text-xs text-amber-400 font-bold">[廢]</span>' : ''}</div>`;

            // ⚡ 快速強化 / 批量賣出模式切換與渲染
            let _qeType = (d.type === 'wpn' && !d.isArrow) ? 'wpn' : ((d.type === 'arm' || d.type === 'acc') ? 'arm' : null);
            let _qsType = (d.type === 'wpn') ? 'wpn' : ((d.type === 'arm' || d.type === 'acc') ? 'arm' : 'item');

            if (_qeType && quickEnh[_qeType].active && !i.lock) {
                let _checked = !!quickEnh[_qeType].sel[i.uid];
                el.innerHTML = `<div class="flex items-center justify-between gap-2">${_rowInner}<input type="checkbox" class="pointer-events-none w-4 h-4 mr-1 flex-shrink-0" ${_checked ? 'checked' : ''}></div>`;
                if (_checked) el.className += ' ring-2 ring-blue-500/70';
                el.onclick = () => toggleQuickItem(_qeType, i.uid);
            } 
            else if (_qsType && window.quickSell[_qsType].active && !i.lock) {
                let _checked = !!window.quickSell[_qsType].sel[i.uid];
                el.innerHTML = `<div class="flex items-center justify-between gap-2">${_rowInner}<input type="checkbox" class="pointer-events-none w-4 h-4 mr-1 flex-shrink-0" ${_checked ? 'checked' : ''}></div>`;
                if (_checked) el.className += ' ring-2 ring-amber-500/70';
                el.onclick = () => toggleQuickSellItem(_qsType, i.uid);
            }
            else {
                el.innerHTML = _rowInner;
                el.onclick = () => openModal(i, false);
            }

            if (d.type === 'wpn') {
                wDiv.appendChild(el);
            } else if (d.type === 'arm' || d.type === 'acc') {
                aDiv.appendChild(el);
            } else {
                iDiv.appendChild(el);
            }
        });

        let sDiv = document.getElementById('tab-skill'); sDiv.innerHTML = '';
        let tiers = {};
        let sortedSkills = [...player.skills].sort((a, b) => DB.skills[a].tier - DB.skills[b].tier);
        sortedSkills.forEach(sid => {
            let sk = DB.skills[sid];
            if (!tiers[sk.tier]) tiers[sk.tier] = [];
            tiers[sk.tier].push(sid);
        });

        for (let t in tiers) {
            let tDiv = document.createElement('div');
            tDiv.className = 'flex flex-wrap gap-1 mb-2 bg-slate-800 p-1 rounded';
            tiers[t].forEach(sid => {
                let sk = DB.skills[sid];
                let isAvail = true;
                let __granted = player.grantedSkills && player.grantedSkills.includes(sid);
                let needLv = skillReqLv(sk, sid);
                if (!__granted && (needLv === undefined || player.lv < needLv)) isAvail = false;
                if (!__granted && sk.reqEle && player.elfEle !== sk.reqEle) isAvail = false;
                if (!__granted && sk.reqEleAny && !player.elfEle) isAvail = false;
                let imgUrl = getIconUrl(sk, true);
                if (sk.type === 'manual') {
                    tDiv.innerHTML += `<button id="manual-btn-${sid}" data-unavail="${isAvail ? '0' : '1'}" onclick="manualCast('${sid}')" ${isAvail ? '' : 'disabled'}
                class="px-2 py-1 text-xs border rounded whitespace-nowrap flex items-center gap-1 transition-colors
                ${isAvail ? 'border-amber-500 text-amber-300 hover:bg-amber-900/40 cursor-pointer' : 'border-slate-600 text-slate-500 opacity-50 cursor-not-allowed'}">
                <img src="${imgUrl}" onerror="this.style.display='none';" class="w-4 h-4 object-contain pointer-events-none">
                <span>${sk.n}</span><span class="text-[10px] opacity-70">施放</span>
            </button>`;
                    return;
                }
                let c = sk.type === 'atk' ? 'text-cyan-300' : (sk.type === 'heal' ? 'text-green-300' : 'text-purple-300');
                if (!isAvail) c = 'text-slate-500 opacity-50';
                tDiv.innerHTML += `<div class="px-2 py-1 text-xs border border-slate-600 rounded whitespace-nowrap flex items-center gap-1 ${c}">
        <img src="${imgUrl}" onerror="this.style.display='none';" class="w-4 h-4 object-contain pointer-events-none">
        <span>${sk.n}</span>
    </div>`;
            });
            sDiv.appendChild(tDiv);
        }

        ['tab-items', 'tab-weapons', 'tab-armors', 'tab-equip', 'tab-skill'].forEach(id => { let el = document.getElementById(id); if (el && _scroll[id] != null) el.scrollTop = _scroll[id]; });
        updateSummonLock();
    };

    // 15. GM 模組初始化與注入
    
    // ==========================================
    // 5. 轉生系統實作 (Rebirth System) - Moved from klh_jsonblob
    // ==========================================
    // 5. 轉生系統實作 (Rebirth System)
    // ==========================================
    function registerRebirthNPC() {
        if (typeof DB !== 'undefined' && DB.towns) {
            const rebirthNpc = {
                id: "npc_rebirth",
                n: "時光使者",
                title: "轉生系統",
                type: "pray",
                d: "提供 75 等以上角色進行轉生，保留屬性點數並獲得額外點數加成。"
            };
            for (let townId in DB.towns) {
                let town = DB.towns[townId];
                if (town.npcs && !town.npcs.some(n => n.id === "npc_rebirth")) {
                    if (townId.startsWith("town_") && !townId.includes("castle")) {
                        town.npcs.push(rebirthNpc);
                    }
                }
            }
        }
    }

    // 攔截並 Hook interactNPC 以支援時光使者
    const originalInteractNPC = window.interactNPC;
    window.interactNPC = function (npcId, townId) {
        if (npcId === "npc_rebirth") {
            window._activePanel = null;
            document.getElementById('town-npc-container').classList.add('hidden');
            document.getElementById('town-interaction-container').classList.remove('hidden');
            document.getElementById('town-interaction-container').classList.add('flex');

            document.getElementById('interaction-npc-name').innerText = "時光使者";
            document.getElementById('interaction-npc-title').innerText = "[轉生系統]";

            let contentDiv = document.getElementById('interaction-content');
            renderRebirthNPC(contentDiv);
            return;
        }
        originalInteractNPC(npcId, townId);
    };

    function renderRebirthNPC(div) {
        if (!player) return;
        const count = player.rebirthCount || 0;
        const totalPoints = player.rebirthPoints || 0;
        const lv = player.lv;

        let rebirthBtn = "";
        if (lv >= 75) {
            const pointsEarned = lv - 50;
            rebirthBtn = `
                <div class="mt-6 flex justify-center">
                    <button onclick="executeRebirthNPC()" class="btn py-3 px-6 text-base font-bold bg-emerald-700 hover:bg-emerald-600 border-emerald-500 w-full max-w-sm">
                        進行轉生（獲得 ${pointsEarned} 點額外屬性點）
                    </button>
                </div>
            `;
        } else {
            rebirthBtn = `
                <div class="mt-6 text-slate-400 text-center">
                    <p>⚠️ 您的等級不足 75 等（目前為 ${lv} 等），還不能進行轉生。</p>
                </div>
            `;
        }

        div.innerHTML = `
            <div class="flex flex-col gap-4 p-4 text-slate-300 text-sm leading-relaxed max-w-xl mx-auto">
                <div class="bg-slate-900/60 border border-slate-700 rounded-lg p-4 space-y-2 text-left">
                    <div class="text-yellow-400 font-bold text-lg border-b border-slate-700 pb-1 mb-2">📜 轉生規則說明</div>
                    <div>1. **等級限制**：等級達到 <b class="text-orange-400">75 等</b> 以上方可進行轉生。</div>
                    <div>2. **轉生後狀態**：等級重置為 <b class="text-yellow-400">1 等</b>，經驗值歸零。</div>
                    <div>3. **屬性保留**：您之前分配的屬性點數、基礎屬性、以及萬能藥加成將**完全保留**。</div>
                    <div>4. **額外屬性點**：每次轉生時，您將額外獲得 <b class="text-emerald-400">當前等級 - 50</b> 點的自由分配點數（例如：75等轉生送 25 點，80等轉生送 30 點）。</div>
                    <div>5. **回憶蠟燭保護**：轉生獲得的點數將受到系統保護，使用「回憶蠟燭」重置時不會遺失。</div>
                </div>
                
                <div class="bg-slate-900/60 border border-slate-700 rounded-lg p-4 flex justify-around text-center shrink-0">
                    <div>
                        <div class="text-xs text-slate-400">轉生次數</div>
                        <div class="text-2xl font-bold text-yellow-500 mt-1">${count} 次</div>
                    </div>
                    <div class="border-r border-slate-700"></div>
                    <div>
                        <div class="text-xs text-slate-400">轉生累計額外點數</div>
                        <div class="text-2xl font-bold text-emerald-400 mt-1">${totalPoints} 點</div>
                    </div>
                </div>
                
                ${rebirthBtn}
            </div>
        `;
    }

    window.executeRebirthNPC = function () {
        if (!player) return;
        if (player.lv < 75) {
            alert("您的等級不足 75 等，無法轉生！");
            return;
        }

        const pointsEarned = player.lv - 50;
        const confirmMsg = `確定要進行轉生嗎？\n\n` +
            `• 等級重設為 1 等 (經驗值重設為 0)\n` +
            `• 目前的所有屬性與已分配點數將保留\n` +
            `• 額外加送 ${pointsEarned} 點屬性點數！`;

        if (confirm(confirmMsg)) {
            player.rebirthCount = (player.rebirthCount || 0) + 1;
            player.rebirthPoints = (player.rebirthPoints || 0) + pointsEarned;
            player.bonus += pointsEarned;

            player.lv = 1;
            player.exp = 0;

            // 重新計算屬性以更新 HP/MP 最大值
            calcStats();
            player.hp = player.mhp;
            player.mp = player.mmp;

            saveGame();

            // 重新渲染轉生 NPC 介面
            let contentDiv = document.getElementById('interaction-content');
            if (contentDiv) {
                renderRebirthNPC(contentDiv);
            }

            updateUI();

            if (typeof logSys === 'function') {
                logSys(`<span class="text-emerald-300 font-bold">★★★ 轉生成功！等級回到 1 等，並額外獲得 ${pointsEarned} 點屬性點！ ★★★</span>`);
            }
        }
    };

    // 攔截並 Hook resetStatsCandle()，防止轉生屬性點被回憶蠟燭吃掉
    const originalResetStatsCandle = window.resetStatsCandle;
    window.resetStatsCandle = function () {
        originalResetStatsCandle();
        if (player && player.rebirthPoints) {
            player.bonus += player.rebirthPoints;
            if (typeof updateUI === 'function') {
                updateUI();
            }
        }
    };

    // ==========================================

    // 時光使者發光控制：玩家達 75 等以上才會發光，以下不會
    function updateRebirthNpcGlow() {
        const npcContainer = document.getElementById('town-npc-container');
        if (npcContainer) {
            const cards = npcContainer.children;
            for (let card of cards) {
                if (card.textContent.includes('時光使者')) {
                    if (typeof player !== 'undefined' && player && player.lv >= 75) {
                        card.style.border = '2px solid #10b981';
                        card.style.boxShadow = '0 0 15px rgba(16,185,129,0.8)';
                        const iconSpan = card.querySelector('.text-2xl');
                        if (iconSpan) {
                            iconSpan.classList.add('animate-pulse');
                            iconSpan.style.textShadow = '0 0 10px #10b981';
                        }
                    } else {
                        card.style.border = '';
                        card.style.boxShadow = '';
                        const iconSpan = card.querySelector('.text-2xl');
                        if (iconSpan) {
                            iconSpan.classList.remove('animate-pulse');
                            iconSpan.style.textShadow = '';
                        }
                    }
                }
            }
        }
    }

    function startupGM2() {
        injectGlowStyles();
        initCustomDB();
        restoreCustomSettings();
        registerRebirthNPC();

        // 攔截並 Hook interactNPC 以支援時光使者
        if (typeof window.interactNPC === 'function' && !window.interactNPC.__klhRebirthWrapped) {
            const originalInteractNPC = window.interactNPC;
            window.interactNPC = function (npcId, townId) {
                if (npcId === "npc_rebirth") {
                    window._activePanel = null;
                    document.getElementById('town-npc-container').classList.add('hidden');
                    document.getElementById('town-interaction-container').classList.remove('hidden');
                    document.getElementById('town-interaction-container').classList.add('flex');

                    document.getElementById('interaction-npc-name').innerText = "時光使者";
                    document.getElementById('interaction-npc-title').innerText = "[轉生系統]";

                    let contentDiv = document.getElementById('interaction-content');
                    renderRebirthNPC(contentDiv);
                    return;
                }
                originalInteractNPC(npcId, townId);
            };
            window.interactNPC.__klhRebirthWrapped = true;
        }

        // 攔截並 Hook resetStatsCandle()，防止轉生屬性點被回憶蠟燭吃掉
        if (typeof window.resetStatsCandle === 'function' && !window.resetStatsCandle.__klhRebirthWrapped) {
            const originalResetStatsCandle = window.resetStatsCandle;
            window.resetStatsCandle = function () {
                originalResetStatsCandle();
                if (player && player.rebirthPoints) {
                    player.bonus += player.rebirthPoints;
                    if (typeof updateUI === 'function') {
                        updateUI();
                    }
                }
            };
            window.resetStatsCandle.__klhRebirthWrapped = true;
        }

        // 監聽 town-npc-container 以動態控制時光使者發光
        if (typeof MutationObserver !== 'undefined') {
            const observer = new MutationObserver(updateRebirthNpcGlow);
            const checkExist = setInterval(() => {
                const element = document.getElementById('town-npc-container');
                if (element) {
                    observer.observe(element, { childList: true });
                    updateRebirthNpcGlow(); // 初始檢查一次
                    clearInterval(checkExist);
                }
            }, 100);
        }

        // Hook updateUI 以在等級變更或屬性重算時即時更新發光狀態
        if (typeof window.updateUI === 'function' && !window.updateUI.__klhRebirthGlowWrapped) {
            const originalUpdateUI = window.updateUI;
            window.updateUI = function () {
                originalUpdateUI();
                updateRebirthNpcGlow();
            };
            window.updateUI.__klhRebirthGlowWrapped = true;
        }
    }

    // 註冊 DOM 載入與即時啟動
    document.addEventListener('DOMContentLoaded', startupGM2);
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
        startupGM2();
    }
})();
