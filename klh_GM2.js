/* ============================================================================
 * klh_GM2.js — 高級藥水、神之祝福與掉寶藥水機制 & 克里斯特兌換 & 快速批量賣出 & 轉生系統 & 碧恩席琳附魔說明 & 超強短劍覆寫
 *
 * 設計原則: 完全不改原作者程式碼，只從外面「包住」全域函式 (monkey-patch)。
 * 掛接方式: 在 index.html 的 </body> 標籤正上方，插入以下外掛腳本：
 * * <script src="klh_GM2.js?v=20260616"></script>
 *
 * 功能一覽:
 *   1. 發光 CSS 注入     —— 注入屬性詞綴圖示動態光暈特效 (earth3/earth5-glow等)。
 *   2. 自定義資料庫   —— 新增濃縮白水、超級濃縮白水、掉寶藥水、神之祝福藥水四種自定義藥水。
 *   3. 自動啟用 UI    —— 動態注入自動喝藥水核取方塊（掉寶藥水 / 神之祝福藥水）至設定面板。
 *   4. 自定義藥水效果   —— 觸發回血、添加 Buff 增益效果。
 *   5. 商店注入       —— 針對含有白色藥水的店鋪自動加入自定義藥水選項。
 *   6. 藥水使用覆蓋     —— useItem Hook，支援八種自定義藥水效果。
 *   7. 克里斯特兌換     —— 神之祝福藥水兌換 & 所有祝福/解詛咒卷軸調整為 10,000 金幣換 20 張。
 *   8. 掉寶/祝福機制     —— killMob Hook，掉寶藥水金幣x2、裝備掉寶x3、材料x2；
 *                          神之祝福藥水提升祝福/席琳相剋機率。
 *   9. gainItem 覆蓋    —— 怪物掉落裝備時即時判斷祝福 and 席琳相剋機率。
 *  10. 存檔協調       —— saveGame/loadGame 同步輸存自定義設定 (掉寶/祝福核取方塊狀態)。
 *  11. 快速批量賣出   —— 背包第三欄加入「批量賣出」模式，含模糊搜尋賣出功能。
 *  12. 自動互斥處理   —— 批量賣出與快速強化模式相互排他。
 *  13. renderTabs 覆蓋  —— 完整重寫背包標籤渲染邏輯，支援快速強化和批量賣出 UI 整合。
 *  14. 轉生系統       —— 「時光使者」 NPC ，75 等以上可轉生重置等級，
 *                          保留擁有屬性點數並額外獲得 (Lv-50)/2 點數。
 *  15. 回憶蠟燭保護   —— Hook resetStatsCandle ，防止轉生點數被回憶蠟燭消耗。
 *  16. 席琳裝備注入   —— Hook openModal 於裝備介面新增「席琳注入」按鈕（消耗 1 顆席琳結晶），為特定部位裝備隨機注入強力的席琳混沌套裝效果。
 *  17. 象牙塔 NPC 碧恩 —— 覆寫 renderBianBless，僅保留祝福與解詛咒，並在最下方附屬性/遠古/席琳套裝效果卡片對照。
 *  18. 超強短劍覆寫   —— 將基礎武器「短劍」屬性覆寫為 GM 測試超強數值（全員可用）。
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

            body {
                -webkit-text-size-adjust: 100% !important;
                text-size-adjust: 100% !important;
            }

            /* 防止 iOS 瀏覽器在聚焦輸入框時自動縮放 */
            @media (max-width: 768px) {
                input[id^="fuzzy-sell-input-"] {
                    font-size: 16px !important;
                }
            }

            /* 廢品清單 Modal 動畫與美化 */
            #klh-junk-modal {
                animation: klhFadeIn 0.2s ease-out;
            }
            @keyframes klhFadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            #klh-junk-list-content::-webkit-scrollbar {
                width: 6px;
            }
            #klh-junk-list-content::-webkit-scrollbar-track {
                background: transparent;
            }
            #klh-junk-list-content::-webkit-scrollbar-thumb {
                background: rgba(156, 163, 175, 0.3);
                border-radius: 999px;
            }
            #klh-junk-list-content::-webkit-scrollbar-thumb:hover {
                background: rgba(156, 163, 175, 0.5);
            }
        `;
        let style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
    }

    // 1. 初始化自定義資料庫與屬性
    function initCustomDB() {
        if (typeof DB === 'undefined' || !DB.items) return;


        // 1-2. 新增四種自定義藥水 (加入對應外觀與發光屬性)
        DB.items["potion_super_white"] = {
            n: "濃縮白色藥水",
            type: "pot",
            req: "all",
            p: 3000,
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
            p: 15000,
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
            p: 10000,
            c: "text-green-300 font-bold",
            d: "獲得金幣x2、裝備掉落率x3、材料掉落率x2，持續 300 秒",
            eff: "droprate",
            dur: 300,
            gachaWeight: 0,
            img: "assets/icons/items/自我加速藥水.png" // 外觀採用自我加速藥水圖案
        };

        DB.items["potion_god_bless"] = {
            n: "神之祝福藥水",
            type: "pot",
            req: "all",
            p: 100000,
            c: "text-yellow-300 font-bold",
            d: "怪物掉落裝備時祝福機率x3、附加席琳套裝效果機率x2，持續 300 秒 (無法自動購買)",
            eff: "god_bless",
            dur: 300,
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

        // 1-6. 覆寫短劍為 GM 測試超高數值
        let dagger = DB.items["wpn_shortsword"];
        if (dagger) {
            dagger.dmgS = 600;
            dagger.dmgL = 800;
            dagger.hit = 1000;
            dagger.spd = 0.1;
            dagger.safe = 1000;
        }
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

            // 當核取方塊狀態改變時，立即同步到 player.config 中，確保隨時都是最新狀態
            const syncConfig = () => {
                if (typeof player !== 'undefined' && player) {
                    if (!player.config) player.config = {};
                    player.config.setDroprate = document.getElementById('set-droprate')?.checked || false;
                    player.config.setAutoBuyDroprate = document.getElementById('set-auto-buy-droprate')?.checked || false;
                    player.config.setGodBless = document.getElementById('set-god-bless')?.checked || false;
                }
            };

            document.getElementById('set-droprate')?.addEventListener('change', syncConfig);
            document.getElementById('set-auto-buy-droprate')?.addEventListener('change', syncConfig);
            document.getElementById('set-god-bless')?.addEventListener('change', syncConfig);
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
    const originalKristaExchange = window.kristaExchange;
    const originalRenderKristaExchange = window.renderKristaExchange;

    window.kristaExchange = function (kind) {
        if (kind === 'god_bless_1' || kind === 'god_bless_20') {
            let cost = (kind === 'god_bless_1') ? 100000 : 2000000;
            let count = (kind === 'god_bless_1') ? 1 : 20;

            if ((player.gold || 0) < cost) {
                logSys(`<span class="text-red-400">金幣不足（需 ${cost.toLocaleString()}）。</span>`);
                return;
            }

            player.gold -= cost;
            gainItem('potion_god_bless', count, true, true);
            renderTabs();
            updateUI();
            saveGame();

            logSys(`花費 ${cost.toLocaleString()} 金幣，換得 ${count} 瓶 <span class="text-yellow-300 font-bold">神之祝福藥水</span>。`);

            let _e = document.getElementById('interaction-content');
            if (_e) renderKristaExchange(_e);
        } else {
            if (typeof originalKristaExchange === 'function') {
                originalKristaExchange(kind);
            }
        }
    };

    window.renderKristaExchange = function (el) {
        if (typeof originalRenderKristaExchange === 'function') {
            originalRenderKristaExchange(el);
        }

        let container = el.querySelector('.flex-col');
        if (container) {
            let blessRow1 = `
                <div class="flex items-center justify-between gap-2 bg-slate-800/60 border border-slate-600 rounded p-3">
                    <div class="text-sm text-slate-200 leading-relaxed">100,000 金幣 → 1 瓶 <span class="text-yellow-300 font-bold">神之祝福藥水</span></div>
                    <button class="btn bg-purple-800 hover:bg-purple-700 border-purple-500 py-2 px-4 font-bold shrink-0" onclick="kristaExchange('god_bless_1')">兌換</button>
                </div>`;
            let blessRow20 = `
                <div class="flex items-center justify-between gap-2 bg-slate-800/60 border border-slate-600 rounded p-3">
                    <div class="text-sm text-slate-200 leading-relaxed">2,000,000 金幣 → 20 瓶 <span class="text-yellow-300 font-bold">神之祝福藥水</span></div>
                    <button class="btn bg-purple-800 hover:bg-purple-700 border-purple-500 py-2 px-4 font-bold shrink-0" onclick="kristaExchange('god_bless_20')">兌換</button>
                </div>`;
            container.insertAdjacentHTML('beforeend', blessRow1 + blessRow20);
        }
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
            if (typeof player !== 'undefined' && player && player.config) {
                let chkDroprate = document.getElementById('set-droprate');
                let chkAutoBuyDroprate = document.getElementById('set-auto-buy-droprate');
                let chkGodBless = document.getElementById('set-god-bless');

                player.config.setDroprate = chkDroprate ? chkDroprate.checked : false;
                player.config.setAutoBuyDroprate = chkAutoBuyDroprate ? chkAutoBuyDroprate.checked : false;
                player.config.setGodBless = chkGodBless ? chkGodBless.checked : false;
            }
            return originalSaveGame();
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
        if (typeof player !== 'undefined' && player) {
            if (!player.config) player.config = {};
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

    window.quickLock = {
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

    // 取得該分頁可被批量加鎖/解鎖的背包物品 (此模式下所有裝備/物品均可挑選，非裝備在身上的物品)
    window._qlEligibleItems = function (type) {
        if (typeof player === 'undefined' || !player || !player.inv) return [];
        return player.inv.filter(i => {
            let d = DB.items[i.id];
            if (!d) return false;
            if (type === 'wpn') return d.type === 'wpn';
            if (type === 'arm') return d.type === 'arm' || d.type === 'acc';
            return d.type !== 'wpn' && d.type !== 'arm' && d.type !== 'acc';
        });
    };

    // 建立批量賣出與加鎖/解鎖頭部 UI
    window.buildQuickSellHeader = function (type) {
        // 批量加鎖/解鎖啟用中
        if (window.quickLock && window.quickLock[type].active) {
            let st = window.quickLock[type];
            let eligible = _qlEligibleItems(type);
            let allSel = eligible.length > 0 && eligible.every(i => st.sel[i.uid]);
            let someSel = eligible.some(i => st.sel[i.uid]);
            let totalCount = eligible.filter(i => st.sel[i.uid]).length;

            let hdr = document.createElement('div');
            hdr.className = 'sticky top-0 z-10 mb-1 bg-slate-900 pb-1 flex gap-1';
            hdr.innerHTML = `<div class="flex items-center gap-1 bg-slate-900/80 border border-blue-700 rounded p-1 w-full text-xs">
                <button onclick="cancelQuickLock('${type}')" class="btn border-slate-600 bg-slate-700 hover:bg-slate-600 px-1.5 py-1 font-bold text-white rounded shrink-0">取消</button>
                <button onclick="runQuickLock('${type}', true)" class="btn border-blue-600 bg-blue-800 hover:bg-blue-700 px-1.5 py-1 font-bold text-blue-200 rounded shrink-0">🔒 加鎖 (${totalCount})</button>
                <button onclick="runQuickLock('${type}', false)" class="btn border-red-600 bg-red-800 hover:bg-red-700 px-1.5 py-1 font-bold text-red-200 rounded shrink-0">🔓 解鎖 (${totalCount})</button>
                <label class="flex items-center gap-1 text-slate-300 cursor-pointer select-none whitespace-nowrap ml-auto shrink-0">
                    <input type="checkbox" ${allSel ? 'checked' : ''} onchange="quickLockSelectAll('${type}', this.checked)"> 全選
                </label>
            </div>`;

            let cb = hdr.querySelector('label input');
            if (cb) cb.indeterminate = someSel && !allSel;
            return hdr;
        }

        // 批量賣出啟用中
        let st = window.quickSell[type];
        let hdr = document.createElement('div');
        hdr.className = 'sticky top-0 z-10 mb-1 bg-slate-900 pb-1 flex gap-1';

        if (!st.active) {
            hdr.className = 'sticky top-0 z-10 mb-1 bg-slate-900 pb-1 flex flex-col gap-1';
            hdr.innerHTML = `
                <div class="flex gap-1 w-full">
                    <button onclick="toggleQuickSell('${type}')" class="flex-1 btn border-amber-700 bg-amber-900/70 hover:bg-amber-800 py-1.5 text-sm font-bold text-amber-200 rounded shadow">💰 批量賣出</button>
                    <button onclick="toggleQuickLock('${type}')" class="flex-1 btn border-blue-700 bg-blue-900/70 hover:bg-blue-800 py-1.5 text-sm font-bold text-blue-200 rounded shadow shadow-md">🔒 批量鎖定</button>
                </div>
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

        // 互斥：關閉該分頁的批量加鎖/解鎖模式
        if (window.quickLock && window.quickLock[type]) {
            window.quickLock[type].active = false;
            window.quickLock[type].sel = {};
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

    // 切換至批量加鎖/解鎖模式
    window.toggleQuickLock = function (type) {
        let st = window.quickLock[type];
        st.active = true;
        st.sel = {};

        // 互斥：關閉該分頁的批量賣出模式
        if (window.quickSell && window.quickSell[type]) {
            window.quickSell[type].active = false;
            window.quickSell[type].sel = {};
        }
        // 互斥：關閉該分頁的快速強化模式
        if (typeof quickEnh !== 'undefined' && quickEnh[type]) {
            quickEnh[type].active = false;
            quickEnh[type].sel = {};
        }

        renderTabs(true);
    };

    // 取消批量加鎖/解鎖模式
    window.cancelQuickLock = function (type) {
        let st = window.quickLock[type];
        st.active = false;
        st.sel = {};
        renderTabs(true);
    };

    // 勾選單個已鎖定/未鎖定物品
    window.toggleQuickLockItem = function (type, uid) {
        let st = window.quickLock[type];
        if (st.sel[uid]) {
            delete st.sel[uid];
        } else {
            st.sel[uid] = true;
        }
        renderTabs(true);
    };

    // 批量全選 / 全不選 (加鎖/解鎖模式)
    window.quickLockSelectAll = function (type, checked) {
        let st = window.quickLock[type];
        st.sel = {};
        if (checked) {
            _qlEligibleItems(type).forEach(i => st.sel[i.uid] = true);
        }
        renderTabs(true);
    };

    // 執行批量加鎖/解鎖
    window.runQuickLock = function (type, targetLockState) {
        let st = window.quickLock[type];
        let entries = _qlEligibleItems(type).filter(i => st.sel[i.uid]);
        if (!entries.length) {
            logSys(`<span class="text-red-400 font-bold">尚未勾選任何物品。</span>`);
            return;
        }

        let count = 0;
        entries.forEach(entry => {
            entry.lock = targetLockState;
            count++;
        });

        st.active = false;
        st.sel = {};

        let actionName = targetLockState ? '加鎖' : '解鎖';
        logSys(`<span class="text-green-400 font-bold">批量${actionName}完成！已成功${actionName} ${count} 件物品。</span>`);
        updateUI();
        renderTabs(true);
        saveGame();
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

    // 互斥處理：覆寫 window.toggleQuickEnhance，點擊快速強化時主動關閉批量賣出與加鎖/解鎖
    const originalToggleQuickEnhance = window.toggleQuickEnhance;
    if (typeof originalToggleQuickEnhance === 'function') {
        window.toggleQuickEnhance = function (type) {
            if (window.quickSell && window.quickSell[type]) {
                window.quickSell[type].active = false;
                window.quickSell[type].sel = {};
            }
            if (window.quickLock && window.quickLock[type]) {
                window.quickLock[type].active = false;
                window.quickLock[type].sel = {};
            }
            originalToggleQuickEnhance(type);
        };
    }

    // 試圖動態提取原版 renderTabs 的配置，以防止未來原版更新 slots、_sig 或等級鎖定時失效
    let originalSlots = null;
    let getOriginalSig = null;
    let getRlvLimit = function (slotKey, player) {
        if (slotKey === 'ring3') return 55;
        if (slotKey === 'ring4') return 65;
        return 0;
    };

    if (typeof window.renderTabs === 'function') {
        const str = window.renderTabs.toString();

        // 1. 提取 slots 陣列
        const slotsMatch = str.match(/(?:const|let)?\s*slots\s*=\s*(\[[\s\S]*?\])\s*;/);
        if (slotsMatch) {
            try {
                originalSlots = new Function("return " + slotsMatch[1])();
            } catch (e) {
                console.error("Failed to parse slots from original renderTabs", e);
            }
        }

        // 2. 提取 _sig 函數內部邏輯
        const sigMatch = str.match(/_sig\s*=\s*\(function\s*\(\)\s*\{([\s\S]*?)\}\)\(\);/);
        if (sigMatch) {
            try {
                getOriginalSig = new Function(sigMatch[1]);
            } catch (e) {
                console.error("Failed to parse _sig from original renderTabs", e);
            }
        }

        // 3. 提取 _rlv 運算式，轉為等級限制函數
        const rlvMatch = str.match(/_rlv\s*=\s*(.*?)\s*;/);
        if (rlvMatch) {
            try {
                const expr = rlvMatch[1].replace(/s\.k/g, 'slotKey').replace(/player\.lv/g, 'player.lv');
                getRlvLimit = new Function('slotKey', 'player', `return ${expr}`);
            } catch (e) {
                console.error("Failed to parse _rlv limit from original renderTabs", e);
            }
        }
    }

    const fallbackSlots = [
        { k: 'wpn', n: '武器' }, { k: 'shield', n: '盾牌' }, { k: 'helm', n: '頭盔' },
        { k: 'armor', n: '盔甲' }, { k: 'tshirt', n: 'T恤' }, { k: 'cloak', n: '斗篷' },
        { k: 'gloves', n: '手套' }, { k: 'boots', n: '長靴' }, { k: 'amulet', n: '項鍊' },
        { k: 'ring1', n: '戒指' }, { k: 'ring2', n: '戒指' }, { k: 'ring3', n: '戒指' },
        { k: 'ring4', n: '戒指' }, { k: 'belt', n: '腰帶' }, { k: 'pet', n: '寵物裝備' },
        { k: 'arrow', n: '箭矢' }
    ];

    const slots = originalSlots || fallbackSlots;

    if (!getOriginalSig) {
        getOriginalSig = function () {
            let inv = player.inv.map(i => itemSig(i) + '.' + (i.cnt || 1) + '.' + (i.lock ? 1 : 0) + '.' + (i.junk ? 1 : 0)).join(';');
            let eq = Object.keys(player.eq).map(k => { let e = player.eq[k]; return e ? `${k}:${itemSig(e)}.${e.cnt || 0}` : k + ':'; }).join(',');
            let dd = player.d;
            return `${inv}#${eq}#${(player.skills || []).join(',')}#${(player.grantedSkills || []).join(',')}#${player.cls}#${player.lv}#${player.elfEle || ''}#${dd.str + dd.dex + dd.con + dd.int + dd.wis}`;
        };
    }

    // 覆寫 window.renderTabs 整合快速強化、批量賣出、加鎖與解鎖
    window.renderTabs = function (force) {
        if (state.ff) return; // 補跑期間不刷新畫面
        // 🛡 保護 1: 使用者正按住分頁面板（點擊中）→延後重建，避免按鈕被重繪掉而點擊失效
        if (!force && typeof _tabPointerDown !== 'undefined' && _tabPointerDown) { _tabRebuildPending = true; return; }
        // 🛡 保護 2: 戰鬥 tick 內節流，降低怪物受傷/死亡時高頻重建造成的按鈕閃爍與輸入框失焦
        if (!force && typeof state !== 'undefined' && state.inTick) {
            var _throttleMs = (typeof TAB_REBUILD_THROTTLE_MS !== 'undefined') ? TAB_REBUILD_THROTTLE_MS : 250;
            if (!_tabThrottleTimer) {
                _tabThrottleTimer = setTimeout(function () { _tabThrottleTimer = null; renderTabs(); }, _throttleMs);
            }
            return;
        }
        if (typeof _tabThrottleTimer !== 'undefined' && _tabThrottleTimer) { clearTimeout(_tabThrottleTimer); _tabThrottleTimer = null; }
        // ===== 內容簽章：背包/裝備/技能等實際內容沒變時直接跳過重建 =====
        let _sig = (function () {
            let baseSig = getOriginalSig();
            let qsActive = window.quickSell ? (window.quickSell.wpn.active + '.' + window.quickSell.arm.active + '.' + window.quickSell.item.active) : '';
            let qsSel = window.quickSell ? (Object.keys(window.quickSell.wpn.sel).join(',') + ';' + Object.keys(window.quickSell.arm.sel).join(',') + ';' + Object.keys(window.quickSell.item.sel).join(',')) : '';
            let qeActive = typeof quickEnh !== 'undefined' ? (quickEnh.wpn.active + '.' + quickEnh.arm.active) : '';
            let qeSel = typeof quickEnh !== 'undefined' ? (Object.keys(quickEnh.wpn.sel).join(',') + ';' + Object.keys(quickEnh.arm.sel).join(',')) : '';
            let qlActive = window.quickLock ? (window.quickLock.wpn.active + '.' + window.quickLock.arm.active + '.' + window.quickLock.item.active) : '';
            let qlSel = window.quickLock ? (Object.keys(window.quickLock.wpn.sel).join(',') + ';' + Object.keys(window.quickLock.arm.sel).join(',') + ';' + Object.keys(window.quickLock.item.sel).join(',')) : '';
            return `${baseSig}#${qsActive}#${qsSel}#${qeActive}#${qeSel}#${qlActive}#${qlSel}`;
        })();
        if (!force && _sig === window.renderTabs._sig) return;
        window.renderTabs._sig = _sig;

        // 真的要重建時，先記住各分頁的捲動位置，重建後還原（避免跳回頂端）
        let _scroll = {};
        ['tab-items', 'tab-weapons', 'tab-armors', 'tab-equip', 'tab-skill'].forEach(id => { let el = document.getElementById(id); if (el) _scroll[id] = el.scrollTop; });

        // 🔧 保存模糊搜尋輸入框的值與焦點狀態，避免 innerHTML='' 銷毀後遺失
        let _fuzzyState = {};
        ['wpn', 'arm', 'item'].forEach(function (t) {
            let inp = document.getElementById('fuzzy-sell-input-' + t);
            if (inp) {
                _fuzzyState[t] = { value: inp.value, focused: document.activeElement === inp, selStart: inp.selectionStart, selEnd: inp.selectionEnd };
            }
        });

        let eDiv = document.getElementById('tab-equip'); eDiv.innerHTML = '';
        { let _wd = player.d || {}; let _t = _wd.loadTier || 0; let _hdr = document.createElement('div'); _hdr.className = 'text-center py-0.5 mb-1 rounded bg-slate-900/60 border border-slate-700 text-sm font-bold leading-tight' + (_t >= 1 ? ' cursor-help' : ''); if (_t >= 1) { _hdr.title = _t === 1 ? '負重50%↑：HP/MP不自然恢復' : (_t === 2 ? '負重82%↑：HP/MP不自然恢復、停自動施法、攻速變慢' : '負重100%↑：HP/MP不自然恢復、停自動施法、攻速大幅變慢'); } _hdr.innerHTML = `<span class="text-slate-400">負重 </span><span class="${getLoadColor(_t)}">${_wd.weightPct || 0}%</span>`; eDiv.appendChild(_hdr); }

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
                let _rlv = getRlvLimit(s.k, player);
                let _locked = _rlv && player.lv < _rlv;
                el.innerHTML = `<span class="text-slate-400 w-12">${s.n}</span><span class="${_locked ? 'text-red-400' : 'text-slate-600'}">${_locked ? '需 Lv' + _rlv : '- 空 -'}</span>`;
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

            // ⚡ 快速強化 / 批量賣出 / 批量加鎖與解鎖模式切換與渲染
            let _qeType = (d.type === 'wpn' && !d.isArrow) ? 'wpn' : ((d.type === 'arm' || d.type === 'acc') ? 'arm' : null);
            let _qsType = (d.type === 'wpn') ? 'wpn' : ((d.type === 'arm' || d.type === 'acc') ? 'arm' : 'item');
            let _qlType = (d.type === 'wpn') ? 'wpn' : ((d.type === 'arm' || d.type === 'acc') ? 'arm' : 'item');

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
            else if (_qlType && window.quickLock && window.quickLock[_qlType].active) {
                let st = window.quickLock[_qlType];
                let _checked = !!st.sel[i.uid];
                el.innerHTML = `<div class="flex items-center justify-between gap-2">${_rowInner}<input type="checkbox" class="pointer-events-none w-4 h-4 mr-1 flex-shrink-0" ${_checked ? 'checked' : ''}></div>`;
                if (_checked) el.className += ' ring-2 ring-blue-500/70';
                el.onclick = () => toggleQuickLockItem(_qlType, i.uid);
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

        // 🔧 還原模糊搜尋輸入框的值與焦點
        ['wpn', 'arm', 'item'].forEach(function (t) {
            let saved = _fuzzyState[t];
            if (saved) {
                let inp = document.getElementById('fuzzy-sell-input-' + t);
                if (inp) {
                    inp.value = saved.value;
                    if (saved.focused) {
                        inp.focus();
                        try { inp.setSelectionRange(saved.selStart, saved.selEnd); } catch (e) {}
                    }
                }
            }
        });

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
                if (town.npcs) {
                    // 先移除非象牙塔的時光使者以防殘留，且只將其加入到象牙塔
                    town.npcs = town.npcs.filter(n => n.id !== "npc_rebirth");
                    if (townId === "town_ivory_tower") {
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

function getRebirthPointsByLv(lv) {
    // 原公式：Math.floor(Math.sqrt(difficulty)) + 1
    const mult = (typeof getExpGainMult === 'function') ? getExpGainMult(lv) : (1 / 8);
    const difficulty = mult > 0 ? (1 / mult) : 1024;
    return Math.floor(Math.sqrt(difficulty)) + 1;
    // return Math.floor((lv - 50) / 2);
}

function renderRebirthNPC(div) {
    if (!player) return;
    const count = player.rebirthCount || 0;
    const totalPoints = player.rebirthPoints || 0;
    const lv = player.lv;

    let rebirthBtn = "";
    if (lv >= 75) {
        const pointsEarned = getRebirthPointsByLv(lv);
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
                    <div>4. **額外屬性點**：每次轉生時，您將額外獲得依當前等級（經驗衰減難度）計算的自由分配屬性點（例如：75等送 3 點，80等送 6 點，90等送 33 點，等級越高獲得點數越多）。</div>
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

    const pointsEarned = getRebirthPointsByLv(player.lv);
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
// 15. 廢品記憶清單管理系統
// ==========================================
function parseItemSig(sig) {
    const parts = sig.split('|');
    const itemId = parts[0];
    const en = parseInt(parts[1], 10) || 0;
    const blessVal = parts[2];
    const ancVal = parts[3];
    const attr = parts[4] || '';
    const seteff = parts[5] || '';

    let bless = false;
    if (blessVal === 'B') bless = true;
    else if (blessVal === 'C') bless = 'C';

    let anc = false;
    if (ancVal === 'A') anc = true;
    else if (ancVal && ancVal !== '0') anc = ancVal;

    return {
        id: itemId,
        en: en,
        bless: bless,
        anc: anc,
        attr: attr,
        seteff: seteff
    };
}

window.openJunkListModal = function () {
    let modal = document.getElementById('klh-junk-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'klh-junk-modal';
        modal.className = 'fixed inset-0 z-[999] flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4 hidden';
        modal.innerHTML = `
                <div class="bg-slate-900 border border-slate-700/80 w-full max-w-md rounded-2xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden text-slate-200">
                    <!-- Header -->
                    <div class="px-5 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/30">
                        <span class="font-bold text-yellow-500 flex items-center gap-1.5">
                            🗑️ 廢品記憶清單
                        </span>
                        <button onclick="closeJunkListModal()" class="text-slate-400 hover:text-white transition cursor-pointer text-xl font-bold focus:outline-none">&times;</button>
                    </div>
                    
                    <!-- Content List -->
                    <div id="klh-junk-list-content" class="p-5 overflow-y-auto flex-1 flex flex-col gap-2.5 min-h-[250px]">
                        <!-- Dynamic content goes here -->
                    </div>
                    
                    <!-- Footer -->
                    <div class="px-5 py-4 border-t border-slate-800 bg-slate-950/30 flex flex-col sm:flex-row justify-between items-center gap-3">
                        <button onclick="clearAllJunkPrefs()" class="btn border-red-700 bg-red-950/40 hover:bg-red-900 text-red-200 px-4 py-2 rounded-xl font-bold text-xs transition w-full sm:w-auto">
                            💥 清除所有設定
                        </button>
                        <div class="flex gap-2 w-full sm:w-auto justify-end">
                            <button onclick="sellAllJunkFromModal()" class="btn border-amber-600 bg-amber-800 hover:bg-amber-700 text-amber-100 px-4 py-2 rounded-xl font-bold text-xs transition w-full sm:w-auto">
                                💰 一鍵賣出廢品
                            </button>
                            <button onclick="closeJunkListModal()" class="btn border-slate-600 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl font-bold text-xs transition w-full sm:w-auto">
                                關閉
                            </button>
                        </div>
                    </div>
                </div>
            `;
        document.body.appendChild(modal);
    }

    // Render content
    window.renderJunkListContent();

    // Show modal
    modal.classList.remove('hidden');
};

window.closeJunkListModal = function () {
    const modal = document.getElementById('klh-junk-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
};

window.renderJunkListContent = function () {
    const container = document.getElementById('klh-junk-list-content');
    if (!container) return;

    if (typeof player === 'undefined' || !player) return;
    if (!player.junkPrefs) player.junkPrefs = {};

    const sigs = Object.keys(player.junkPrefs).filter(k => player.junkPrefs[k]);

    if (sigs.length === 0) {
        container.innerHTML = `
                <div class="text-center text-slate-400 py-10 flex flex-col items-center justify-center gap-3 my-auto">
                    <span class="text-4xl opacity-50">📁</span>
                    <p class="text-sm font-semibold">尚無任何設定為廢品的道具</p>
                    <p class="text-xs text-slate-500 max-w-[280px]">您可以直接在背包中點選物品，並點選「設為廢品」將其加入記憶清單，下次獲得該品項時便會自動標記為廢品。</p>
                </div>
            `;
        return;
    }

    let html = '';
    sigs.forEach(sig => {
        const item = parseItemSig(sig);
        const d = DB.items[item.id];
        if (!d) return;

        const fullName = getItemFullName(item);
        const imgUrl = getIconUrl(d);
        const glowClass = getGlowClass(item, d);

        let specText = '';
        if (item.seteff) specText += ` [席琳效果]`;

        html += `
                <div class="flex items-center justify-between bg-slate-800/40 border border-slate-800/80 rounded-xl p-2.5 hover:bg-slate-800/80 transition">
                    <div class="flex items-center gap-2">
                        <img src="${imgUrl}" onerror="this.style.opacity='0';" class="w-6 h-6 object-contain pointer-events-none ${glowClass}">
                        <div class="flex flex-col">
                            <span class="text-sm font-bold flex items-center gap-1">${fullName}</span>
                            ${specText ? `<span class="text-[10px] text-green-400 font-semibold mt-0.5">${specText}</span>` : ''}
                        </div>
                    </div>
                    <button onclick="removeJunkPref('${sig}')" class="text-red-400 hover:text-red-200 transition text-xs font-bold bg-red-950/20 hover:bg-red-950/60 border border-red-900/40 hover:border-red-700/60 px-2.5 py-1 rounded-lg focus:outline-none cursor-pointer">
                        刪除
                    </button>
                </div>
            `;
    });

    container.innerHTML = html;
};

window.removeJunkPref = function (sig) {
    if (player && player.junkPrefs) {
        delete player.junkPrefs[sig];
    }
    if (player && player.inv) {
        player.inv.forEach(i => {
            if (itemSig(i) === sig) {
                i.junk = false;
            }
        });
    }

    window.renderJunkListContent();
    if (typeof renderTabs === 'function') renderTabs();
    if (typeof saveGame === 'function') saveGame();

    logSys(`已將該品項移出廢品記憶設定。`);
};

window.clearAllJunkPrefs = function () {
    if (!confirm('確定要清除所有廢品記憶設定嗎？\n清除後，所有道具將不再自動標記為廢品。')) {
        return;
    }

    if (player) {
        player.junkPrefs = {};
        if (player.inv) {
            player.inv.forEach(i => {
                i.junk = false;
            });
        }
    }

    window.renderJunkListContent();
    if (typeof renderTabs === 'function') renderTabs();
    if (typeof saveGame === 'function') saveGame();

    logSys(`已清除所有廢品記憶設定。`);
};

window.sellAllJunkFromModal = function () {
    if (typeof window.originalSellAllJunk === 'function') {
        window.originalSellAllJunk();
        window.renderJunkListContent();
    }
};

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


    // ==========================================
    // 16. 象牙塔 碧恩（NPC Bian）：新增席琳套裝效果附加功能
    // ==========================================

    // 檢查部位是否支援席琳套裝效果
    function isSherineSlot(slotKey, it) {
        if (!it) return false;
        let d = DB.items[it.id];
        if (!d) return false;
        return (d.type === 'wpn' && !d.isArrow)
            || (d.type === 'arm' && ['helm', 'armor', 'gloves', 'boots', 'cloak'].includes(d.slot))
            || ((d.type === 'acc' || d.type === 'arm') && d.slot === 'belt');
    }

    // Hook window.openModal 以便在裝備 Modal 的「強化」按鈕下方加入「席琳注入」按鈕
    if (typeof window.openModal === 'function') {
        const originalOpenModal = window.openModal;
        window.openModal = function (item, isEq, slot) {
            originalOpenModal(item, isEq, slot);

            let d = DB.items[item.id];
            if (!d) return;

            // 檢查是否是支援席琳注入的裝備
            let isSherine = (d.type === 'wpn' && !d.isArrow)
                || (d.type === 'arm' && ['helm', 'armor', 'gloves', 'boots', 'cloak'].includes(d.slot))
                || ((d.type === 'acc' || d.type === 'arm') && d.slot === 'belt');

            if (isSherine) {
                let actEl = document.getElementById('modal-actions');
                if (actEl) {
                    let sc = player.inv.find(i => i.id === 'sherine_crystal');
                    let scCount = sc ? sc.cnt : 0;

                    let btn = document.createElement('button');
                    let _cursed = item.bless === 'cursed';

                    if (_cursed) {
                        btn.className = `col-span-2 w-full btn border-slate-600 bg-slate-700 text-slate-400 py-3 text-lg font-bold cursor-not-allowed mt-2`;
                        btn.disabled = true;
                        btn.innerHTML = `🔒 席琳注入（詛咒中無法施加）`;
                    } else {
                        btn.className = `col-span-2 w-full btn border-emerald-700 bg-emerald-800 hover:bg-emerald-700 text-emerald-100 py-3 text-lg font-bold mt-2`;
                        btn.innerHTML = `💎 席琳注入（消耗 席琳結晶*1，擁有: ${scCount}）`;
                        btn.onclick = function () {
                            executeModalSherine(item, isEq, slot);
                        };
                    }

                    // 尋找「強化」按鈕並插在它下方，若無則插在「標記為廢品」上方或最底下
                    let enhanceBtn = Array.from(actEl.querySelectorAll('button')).find(b => b.getAttribute('onclick')?.includes('showEnhanceOptions'));
                    if (enhanceBtn) {
                        enhanceBtn.parentNode.insertBefore(btn, enhanceBtn.nextSibling);
                    } else {
                        let junkLabel = actEl.querySelector('label');
                        if (junkLabel) {
                            junkLabel.parentNode.insertBefore(btn, junkLabel);
                        } else {
                            actEl.appendChild(btn);
                        }
                    }
                }
            }
        };
    }

    // 執行 Modal 專屬的席琳注入邏輯
    function executeModalSherine(item, isEq, slot) {
        let sc = player.inv.find(i => i.id === 'sherine_crystal');
        if (!sc || sc.cnt < 1) {
            logSys('<span class="text-red-400 font-bold">缺少 席琳結晶*1。</span>');
            return;
        }

        // 扣除結晶
        sc.cnt -= 1;
        if (sc.cnt <= 0) player.inv = player.inv.filter(i => i.uid !== sc.uid);

        // 隨機獲取席琳效果
        let seteff = SHERINE_EFFECTS[Math.floor(Math.random() * SHERINE_EFFECTS.length)];
        item.seteff = seteff;

        if (DB.items[item.id] && DB.items[item.id].grantSkills) renderSkillSelects();
        calcStats();
        updateUI();
        renderTabs(true);
        saveGame();

        logSys(`成功為你的裝備注入了席琳的恩賜 → ${getItemFullName(item)}（【${seteff}】）。`);

        // 重新整理 Modal 顯示以呈現最新狀態
        openModal(item, isEq, slot);
    }

    // 覆寫碧恩介面渲染，加入最下方故事介紹
    window.renderBianBless = function (el) {
        let slots = [{ k: 'wpn', n: '武器' }, { k: 'shield', n: '盾牌' }, { k: 'helm', n: '頭盔' }, { k: 'armor', n: '盔甲' }, { k: 'tshirt', n: 'T恤' }, { k: 'cloak', n: '斗篷' }, { k: 'gloves', n: '手套' }, { k: 'boots', n: '長靴' }, { k: 'amulet', n: '項鍊' }, { k: 'ring1', n: '戒指' }, { k: 'ring2', n: '戒指' }, { k: 'ring3', n: '戒指' }, { k: 'ring4', n: '戒指' }, { k: 'belt', n: '腰帶' }];
        let cnt = id => pledgeCountItem(id);
        let rows = slots.map(sl => {
            let it = player.eq[sl.k];
            let name = it ? getItemFullName(it) : '<span class="text-slate-500">（未裝備）</span>';
            let _cursed = !!(it && it.bless === 'cursed');
            let _uncurse = _cursed ? `<button class="btn py-1 px-2 text-sm font-bold shrink-0 bg-cyan-800 border-cyan-500 text-cyan-100" onclick="doBianUncurse('${sl.k}')">解除詛咒</button>` : '';

            // 🔧 詛咒裝備：祝福按鈕變灰禁用
            let _blessBtn = (it && !_cursed)
                ? `<button class="btn py-1 px-2 text-sm font-bold w-24 text-center bg-purple-800 border-purple-500 text-purple-100 shrink-0" onclick="doBianBless('${sl.k}')">祝福${sl.n}</button>`
                : `<button class="btn py-1 px-2 text-sm font-bold w-24 text-center bg-slate-700 border-slate-600 text-slate-400 cursor-not-allowed shrink-0" disabled title="${_cursed ? '被詛咒的裝備需先解除詛咒' : ''}">${_cursed ? '🔒 詛咒中' : '祝福' + sl.n}</button>`;

            return `<div class="flex items-center justify-between gap-2 bg-slate-800/60 border border-slate-600 rounded p-2 text-sm">
                    <span class="truncate"><b class="text-amber-300">${sl.n}</b>：${name}</span>
                    <div class="flex items-center gap-1 shrink-0">${_uncurse}${_blessBtn}</div>
                </div>`;
        }).join('');

        el.innerHTML = `
                <div class="flex flex-col gap-2 p-1 max-h-[85vh] overflow-y-auto">
                    <div class="text-slate-300 text-sm leading-relaxed">碧恩：我能為你的裝備灌注力量。每次祝福會在「屬性 / 遠古系 / 祝福」三者中平均抽一個詞綴，隨機<b>附加、取代或消除</b>（只影響該詞綴）。</div>
                    <div class="text-xs text-slate-400">武器用 賦予武器祝福卷軸(持有 ${cnt('new_item_bless_wpn')})；防具用 賦予盔甲祝福卷軸(持有 ${cnt('new_item_bless_arm')})；飾品用 賦予飾品祝福卷軸(持有 ${cnt('new_item_bless_acc')})。<br>含詛咒的裝備可用 解除詛咒的卷軸(持有 ${cnt('new_item_uncurse')}) 移除詛咒。</div>
                    <div class="flex flex-col gap-1.5">${rows}</div>
                    
                    <!-- 天堂口吻之祝福與席琳介紹區塊 -->
                    <div class="mt-4 border-t border-slate-700 pt-3 flex flex-col gap-3">
                        <!-- 卡片一：✨ 殷海薩的祝福 -->
                        <div class="bg-slate-800/60 border border-yellow-600/40 rounded p-3 text-xs leading-relaxed flex flex-col gap-2 shadow-[0_0_8px_rgba(234,179,8,0.15)]">
                            <div class="text-yellow-400 font-bold text-sm">✨ 殷海薩的祝福傳奇</div>
                            <div class="text-slate-300 italic">「當創造之神殷海薩的光芒灑落，平凡的鐵器也將昇華為聖物。」</div>
                            <div class="text-slate-400 border-t border-slate-700/60 pt-2 flex flex-col gap-1">
                                <div class="font-bold text-slate-300">⚔️ 聖力祝福加成 (與詛咒負值對稱)</div>
                                <div>• <b>武器</b>：<span class="c-blessed font-bold">祝福的</span> (外傷+1/外命+1/魔量+2) ｜ <span class="c-cursed font-bold">詛咒的</span> (外傷-1/外命-1/魔量-2)</div>
                                <div>• <b>防具</b>：<span class="c-blessed font-bold">祝福的</span> (AC-1/傷減+1) ｜ <span class="c-cursed font-bold">詛咒的</span> (AC+1/傷減-1)</div>
                                <div>• <b>飾品</b>：<span class="c-blessed font-bold">祝福的</span> (AC-1/魔防+1) ｜ <span class="c-cursed font-bold">詛咒的</span> (AC+1/魔防-1)</div>
                            </div>
                        </div>

                        <!-- 卡片二：💎 遠古之印 -->
                        <div class="bg-slate-800/60 border border-purple-600/40 rounded p-3 text-xs leading-relaxed flex flex-col gap-2 shadow-[0_0_8px_rgba(147,51,234,0.15)]">
                            <div class="text-purple-400 font-bold text-sm">💎 遠古之印能力變體</div>
                            <div class="text-slate-300 italic">「來自遠古時空的烙印，賦予裝備強大的能力變體。」</div>
                            <div class="text-slate-400 border-t border-slate-700/60 pt-2 flex flex-col gap-1">
                                <div class="font-bold text-slate-300">⚔️ 遠古印記加成</div>
                                <div>• <b>武器</b>：<span class="c-ancient font-bold">遠古</span> (外傷+2/魔傷+1) ｜ <span class="c-eternal font-bold">永恆</span> (外傷+4) ｜ <span class="c-immortal font-bold">不朽</span> (外命+4) ｜ <span class="c-primordial font-bold">太初</span> (魔傷+2)</div>
                                <div>• <b>防具</b>：<span class="c-ancient font-bold">遠古</span> (傷減+2) ｜ <span class="c-eternal font-bold">永恆</span> (AC-2) ｜ <span class="c-immortal font-bold">不朽</span> (迴避ER+2) ｜ <span class="c-primordial font-bold">太初</span> (魔防MR+4)</div>
                                <div>• <b>飾品</b>：<span class="c-ancient font-bold">遠古</span> (傷減+1/魔防+1) ｜ <span class="c-eternal font-bold">永恆</span> (外傷+1/AC-1) ｜ <span class="c-immortal font-bold">不朽</span> (外傷+1/外命+1) ｜ <span class="c-primordial font-bold">太初</span> (魔防+2/外魔+2)</div>
                            </div>
                        </div>

                        <!-- 卡片三：🔥 屬性印記與元素共鳴 -->
                        <div class="bg-slate-800/60 border border-amber-600/40 rounded p-3 text-xs leading-relaxed flex flex-col gap-2 shadow-[0_0_8px_rgba(245,158,11,0.15)]">
                            <div class="text-amber-500 font-bold text-sm">🔥 屬性印記與元素共鳴 (將武器攻擊轉為該屬性，剋屬關係為 火克地/地克風/風克水/水克火)</div>
                            <div class="text-slate-300 italic">「將大自然的元素之力封入武器與防具中，激發相生相剋的共鳴。」</div>
                            <div class="text-slate-400 border-t border-slate-700/60 pt-2 flex flex-col gap-2">
                                <div>
                                    <div class="font-bold text-slate-300">⚔️ 武器加成 (固定物理傷害 / 剋屬性怪額外固定傷害)</div>
                                    <ul class="list-none space-y-0.5 mt-1">
                                        <li>• <span class="c-attr-fire1 font-bold">火之</span> / <span class="c-attr-fire3 font-bold">爆炎</span> / <span class="c-attr-fire5 c-attr-glow font-bold">火靈</span>：物理傷害 +1/+3/+5 ｜ 剋地屬怪 +6/+9/+12</li>
                                        <li>• <span class="c-attr-water1 font-bold">水之</span> / <span class="c-attr-water3 font-bold">海嘯</span> / <span class="c-attr-water5 c-attr-glow font-bold">水靈</span>：物理傷害 +1/+3/+5 ｜ 剋火屬怪 +6/+9/+12</li>
                                        <li>• <span class="c-attr-wind1 font-bold">風之</span> / <span class="c-attr-wind3 font-bold">暴風</span> / <span class="c-attr-wind5 c-attr-glow font-bold">風靈</span>：物理傷害 +1/+3/+5 ｜ 剋水屬怪 +6/+9/+12</li>
                                        <li>• <span class="c-attr-earth1 font-bold">地之</span> / <span class="c-attr-earth3 font-bold">崩裂</span> / <span class="c-attr-earth5 c-attr-glow font-bold">地靈</span>：物理傷害 +1/+3/+5 ｜ 剋風屬怪 +6/+9/+12</li>
                                    </ul>
                                </div>
                                <div class="border-t border-slate-800/80 pt-1.5">
                                    <div class="font-bold text-slate-300">🛡️ 防具/飾品加成 (對應元素抗性 / 魔法防禦 MR)</div>
                                    <ul class="list-none space-y-0.5 mt-1">
                                        <li>• <span class="c-attr-fire1 font-bold">火之</span> / <span class="c-attr-fire3 font-bold">爆炎</span> / <span class="c-attr-fire5 c-attr-glow font-bold">火靈</span>：火抗 +1%/+2%/+3% ｜ 魔法防禦 +1/+2/+3</li>
                                        <li>• <span class="c-attr-water1 font-bold">水之</span> / <span class="c-attr-water3 font-bold">海嘯</span> / <span class="c-attr-water5 c-attr-glow font-bold">水靈</span>：水抗 +1%/+2%/+3% ｜ 魔法防禦 +1/+2/+3</li>
                                        <li>• <span class="c-attr-wind1 font-bold">風之</span> / <span class="c-attr-wind3 font-bold">暴風</span> / <span class="c-attr-wind5 c-attr-glow font-bold">風靈</span>：風抗 +1%/+2%/+3% ｜ 魔法防禦 +1/+2/+3</li>
                                        <li>• <span class="c-attr-earth1 font-bold">地之</span> / <span class="c-attr-earth3 font-bold">崩裂</span> / <span class="c-attr-earth5 c-attr-glow font-bold">地靈</span>：地抗 +1%/+2%/+3% ｜ 魔法防禦 +1/+2/+3</li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        <!-- 卡片四：👁️ 席琳的怨念與混沌套裝 -->
                        <div class="bg-slate-800/60 border border-green-600/40 rounded p-3 text-xs leading-relaxed flex flex-col gap-2 shadow-[0_0_8px_rgba(74,222,128,0.15)]">
                            <div class="text-emerald-400 font-bold text-sm">👁️ 席琳的怨念與混沌套裝 (武器/頭盔/防具/手套/長靴/斗篷/腰帶 隨機印記賦予)</div>
                            <div class="text-slate-300 italic">「自死神席琳的嘆息中流出的結晶，帶有使凡人裝備產生套裝共鳴的禁忌魔能。」</div>
                            <div class="text-slate-400 border-t border-slate-700/60 pt-2 flex flex-col gap-2">
                                <div class="font-bold text-slate-300">⚔️ 九大混沌套裝效果 (須裝備同套裝且「不重複」的效果印記名稱方可累積件數，重複名稱只計 1 件)</div>
                                <div class="grid grid-cols-1 gap-2 text-slate-400">
                                    <div>
                                        <b class="text-red-400">【紅獅】(技能輸出)</b> <span class="text-slate-300 ml-1.5">(誓言/壯志/復仇/熱情/單思)</span><br>— 2件：外傷+5/外魔+3 ｜ 3件：傷減+10 ｜ 5件：技能最終傷害+20%
                                    </div>
                                    <div>
                                        <b class="text-blue-400">【白鳥】(命中脆弱)</b> <span class="text-slate-300 ml-1.5">(誓言/依戀/夢想/情愫/犧牲)</span><br>— 2件：外命+5 ｜ 3件：魅力+10 ｜ 5件：命中附加「脆弱」(受傷+20%) 3秒
                                    </div>
                                    <div>
                                        <b class="text-slate-400">【鐵衛】(減傷反擊)</b> <span class="text-slate-300 ml-1.5">(誓言/象徵/盟約/奮戰/守護)</span><br>— 2件：AC-3/傷減+5 ｜ 3件：受傷-20% ｜ 5件：反擊/居合時對全體敵人橫掃普攻
                                    </div>
                                    <div>
                                        <b class="text-yellow-500">【麗人】(近戰重擊)</b> <span class="text-slate-300 ml-1.5">(誓言/加護/期盼/依靠/單戀)</span><br>— 2件：近傷+3/近命+3 ｜ 3件：近暴+2% ｜ 5件：重擊後下一次攻擊 100% 必中
                                    </div>
                                    <div>
                                        <b class="text-sky-400">【疾風】(遠程連射)</b> <span class="text-slate-300 ml-1.5">(誓言/灑脫/傳說/襲擊/迅捷)</span><br>— 2件：遠傷+3/遠命+3 ｜ 3件：遠暴+2% ｜ 5件：連射傷害由 30% 提升至 80%
                                    </div>
                                    <div>
                                        <b class="text-violet-400">【月光】(魔避雙防)</b> <span class="text-slate-300 ml-1.5">(誓言/隱情/幽蔽/純潔/消逝)</span><br>— 2件：外傷+2/外命+2 ｜ 3件：ER+5/MR+10 ｜ 5件：可用迴避率(ER)迴避魔法攻擊
                                    </div>
                                    <div>
                                        <b class="text-orange-400">【學徒】(省魔回魔)</b> <span class="text-slate-300 ml-1.5">(誓言/好奇/研究/夢想/智慧)</span><br>— 2件：MP恢復+5/外魔+6 ｜ 3件：魔暴+2% ｜ 5件：魔量&lt;30%時技能耗魔減半
                                    </div>
                                    <div>
                                        <b class="text-teal-400">【魔女】(魔法共鳴)</b> <span class="text-slate-300 ml-1.5">(誓言/哀戚/束縛/瘋狂/冷冽)</span><br>— 2件：魔傷+2 ｜ 3件：水抗+10/外魔+5 ｜ 5件：每5次共鳴免費冰矛圍籬一次
                                    </div>
                                    <div>
                                        <b class="text-fuchsia-400">【暗影】(物傷連擊)</b> <span class="text-slate-300 ml-1.5">(誓言/護衛/抉擇/瞥視/忠誠)</span><br>— 2件：外傷+7 ｜ 3件：成功迴避回 20 HP ｜ 5件：連擊追加攻擊傷害提升至 100%
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>`;
    };

    // ==========================================
    // 17. 廢品記憶清單管理與 UI 攔截
    // ==========================================
    if (typeof window.sellAllJunk === 'function' && !window.sellAllJunk.__klhJunkWrapped) {
        const originalSellAllJunk = window.sellAllJunk;
        window.originalSellAllJunk = originalSellAllJunk;
        window.sellAllJunk = function () {
            window.openJunkListModal();
        };
        window.sellAllJunk.__klhJunkWrapped = true;
    }

    function initJunkButton() {
        const btn = document.getElementById('btn-sell-junk');
        if (btn) {
            btn.innerText = "廢品清單";
        }
    }
    initJunkButton();

    // 由於可能存在延遲載入或重繪，Hook updateUI 同步更新按鈕文字
    if (typeof window.updateUI === 'function' && !window.updateUI.__klhJunkBtnWrapped) {
        const originalUpdateUI = window.updateUI;
        window.updateUI = function () {
            originalUpdateUI();
            initJunkButton();
        };
        window.updateUI.__klhJunkBtnWrapped = true;
    }
}

// 註冊 DOM 載入與即時啟動
document.addEventListener('DOMContentLoaded', startupGM2);
if (document.readyState === 'interactive' || document.readyState === 'complete') {
    startupGM2();
}
}) ();
