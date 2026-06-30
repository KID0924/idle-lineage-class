/* ============================================================================
 * klh_Addition.js — 高級藥水、神之祝福與掉寶藥水機制 & 克里斯特兌換 & 快速批量賣出 & 轉生系統 & 碧恩席琳附魔說明
 *
 * 設計原則:
 *   1. 完全不改原作者程式碼 —— 僅透過從外部「包住」全域函式 (Monkey-Patch) 進行擴充。
 *   2. 優雅降級與安全降載 —— 核心 Hook 皆以 try-catch 沙盒包裹並配備 typeof 存在性檢查，
 *                         若原作者未來改版導致函式或變數消失，外掛功能會默默安全降級或停用，
 *                         確保絕對不拋出致命 JS 錯誤，完全保障原版遊戲流程不中斷。
 *
 * 掛接方式: 在 index.html 的 </body> 標籤正上方，插入以下外掛腳本：
 *   <script src="klh_Addition.js?v=20260623"></script>
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
 *  14. 轉生系統       —— 「時光使者」 NPC ，75 等以上可轉生重置等級，保留擁有屬性點數並依當前等級（經驗衰減難度）計算獲得額外屬性點，並加入轉生前匯出存檔之防範提醒。
 *  15. 回憶蠟燭保護   —— Hook resetStatsCandle ，防止轉生點數被回憶蠟燭消耗。
 *  16. 席琳裝備注入   —— Hook openModal 於裝備介面新增「席琳注入」按鈕（消耗 1 顆席琳結晶），為特定部位裝備隨機注入強力的席琳混沌套裝效果。
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

            /* 🔧 注入被 Tailwind 預編譯過濾掉的模糊搜尋輸入框樣式 */
            input[id^="fuzzy-sell-input-"] {
                background-color: #020617 !important; /* bg-slate-950 */
                border: 1px solid #334155 !important; /* border-slate-700 */
                color: #ffffff !important;           /* text-white */
            }
            input[id^="fuzzy-sell-input-"]:focus {
                border-color: #eab308 !important;     /* focus:border-yellow-500 */
                outline: none !important;
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
            try {
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
            } catch (e) {
                console.error("[klh_GM2] getGlowClass hook error:", e);
            }
            return originalGetGlowClass(item, d);
        };
    } else {
        console.warn("[klh_GM2] 找不到 window.getGlowClass，發光特效注入已降級");
    }

    // 5. 覆寫 window.getShopItemsForNpc，使所有包含「白色藥水」的雜貨商店皆販售新藥水，且排列於「白色藥水」正下方
    if (typeof window.getShopItemsForNpc === 'function') {
        const originalGetShopItemsForNpc = window.getShopItemsForNpc;
        window.getShopItemsForNpc = function (npcId) {
            let list = originalGetShopItemsForNpc(npcId);
            try {
                let idx = list.indexOf("potion_ult"); // 找到「白色藥水」的位置
                if (idx !== -1) {
                    // 先過濾掉已存在的自定義藥水 (避免重複寫入)
                    list = list.filter(id => id !== "potion_super_white" && id !== "potion_hyper_white" && id !== "potion_droprate");
                    // 重新定位並插入至白色藥水下方
                    idx = list.indexOf("potion_ult");
                    list.splice(idx + 1, 0, "potion_super_white", "potion_hyper_white", "potion_droprate");
                }
            } catch (e) {
                console.error("[klh_GM2] getShopItemsForNpc hook error:", e);
            }
            return list;
        };
    } else {
        console.warn("[klh_GM2] 找不到 window.getShopItemsForNpc，商店自訂藥水注入已降級");
    }

    // 6. 覆寫 window.useItem 實現新藥水效果
    if (typeof window.useItem === 'function') {
        const originalUseItem = window.useItem;
        window.useItem = function (u, silent = false) {
            try {
                if (typeof player !== 'undefined' && player) {
                    let item = player.inv.find(i => i.uid === u);
                    if (item) {
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
                    }
                }
            } catch (e) {
                console.error("[klh_GM2] useItem hook error (自定義藥水邏輯失敗):", e);
            }
            return originalUseItem(u, silent);
        };
    } else {
        console.warn("[klh_GM2] 找不到 window.useItem，自定義藥水使用功能已降級");
    }

    // 7. 覆寫 Krista 兌換系統
    if (typeof window.kristaExchange === 'function') {
        const originalKristaExchange = window.kristaExchange;
        window.kristaExchange = function (kind) {
            try {
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
                    return; // 執行完自定義邏輯即返回
                }
            } catch (e) {
                console.error("[klh_GM2] kristaExchange hook error:", e);
            }
            return originalKristaExchange(kind);
        };
    } else {
        console.warn("[klh_GM2] 找不到 window.kristaExchange，克里斯特神之祝福兌換已降級");
    }

    if (typeof window.renderKristaExchange === 'function') {
        const originalRenderKristaExchange = window.renderKristaExchange;
        window.renderKristaExchange = function (el) {
            originalRenderKristaExchange(el);
            try {
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
            } catch (e) {
                console.error("[klh_GM2] renderKristaExchange hook error:", e);
            }
        };
    } else {
        console.warn("[klh_GM2] 找不到 window.renderKristaExchange，克里斯特神之祝福兌換介面已降級");
    }

    // 8. 掉寶與神之祝福核心機制 (Monkey Patch 掉落系統)
    let _isMonsterDrop = false;
    let _currentDroppingMob = null;

    // 覆寫 window.killMob 捕捉掉落上下文、金幣加倍與掉落倍化
    if (typeof window.killMob === 'function') {
        const originalKillMob = window.killMob;
        window.killMob = function (idx) {
            if (typeof player === 'undefined' || !player) return originalKillMob(idx);
            let mob = typeof mapState !== 'undefined' && mapState.mobs ? mapState.mobs[idx] : null;
            if (!mob || mob._dead) return originalKillMob(idx);

            _isMonsterDrop = true;
            _currentDroppingMob = mob;

            let originalMobDrops = null;
            let originalDarkWeaponDrops = null;
            let originalDarkCrystalDrops = null;

            try {
                // 掉寶藥水：修改資料庫掉率以達成 3倍/2倍 掉落
                if (player.buffs && player.buffs.droprate > 0) {
                    // 複製並修改 MOB_DROPS
                    if (typeof MOB_DROPS !== 'undefined' && MOB_DROPS[mob.n]) {
                        originalMobDrops = MOB_DROPS[mob.n];
                        MOB_DROPS[mob.n] = originalMobDrops.map(entry => {
                            let itemId = entry[0];
                            let rate = entry[1];
                            let d = typeof DB !== 'undefined' && DB.items ? DB.items[itemId] : null;
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
                            let d = typeof DB !== 'undefined' && DB.items ? DB.items[itemId] : null;
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
                            let d = typeof DB !== 'undefined' && DB.items ? DB.items[itemId] : null;
                            let isEquip = d && (d.type === 'wpn' || d.type === 'arm' || d.type === 'acc');
                            let mult = isEquip ? 3 : 2;
                            return [itemId, rate * mult];
                        });
                    }
                }
            } catch (e) {
                console.error("[klh_GM2] killMob pre-hook error:", e);
            }

            try {
                let goldBefore = player.gold || 0;
                originalKillMob(idx);

                try {
                    // 掉寶藥水：獲得金幣翻倍 (靜默加錢，不顯示洗頻提示)
                    let goldGained = (player.gold || 0) - goldBefore;
                    if (goldGained > 0 && player.buffs && player.buffs.droprate > 0) {
                        player.gold += goldGained;
                        // logSys(`[掉寶藥水] 額外獲得 <span class="text-yellow-400 font-bold">${goldGained} 金幣</span>。`); // 註解隱藏以防洗頻
                    }

                    // 掉寶藥水：處理 hardcoded 非資料庫迴圈掉落項目的二次加成 (達到 2倍 效果)
                    if (player.buffs && player.buffs.droprate > 0) {
                        let _dropMult = mob._grace ? 10 : (mob._sherine ? 3 : 1);

                        // 1. 黑魔石額外掉落 (材料 2倍)
                        let _refine = player.skills && player.skills.includes('sk_dark_refine');
                        if (typeof mapState !== 'undefined' && mapState.current === 'silent_outer') {
                            if (Math.random() < (_refine ? 0.30 : 0.20)) gainItem('mat_blackstone2', 1);
                            if (Math.random() < (_refine ? 0.15 : 0.10)) gainItem('mat_blackstone3', 1);
                        } else if (_refine && typeof mapCategoryOf === 'function' && typeof mapState !== 'undefined' && ['wild', 'dungeon'].includes(mapCategoryOf(mapState.current))) {
                            if (Math.random() < 0.01) gainItem('mat_blackstone2', 1);
                            if (Math.random() < 0.005) gainItem('mat_blackstone3', 1);
                            if (Math.random() < 0.001) gainItem('mat_blackstone4', 1);
                        }

                        // 2. 銀礦石額外掉落 (材料 2倍)
                        let _oreRates = { '石頭高崙': 100, '鋼鐵高崙': 100, '侏儒': 50, '侏儒戰士': 50, '黑騎士': 50, '哈柏哥布林': 50, '蜥蜴人': 50 };
                        let _or = _oreRates[mob.n];
                        if (_or && Math.random() < _or / 100) gainItem('mat_silverore', 1);

                        // 3. 40等以上 Boss 賦予祝福卷軸額外掉落 (材料 2倍)
                        if (mob.boss && mob.lv >= 40 && typeof mapState !== 'undefined' && mapState.current !== 'dream_island' && (typeof isSiegeArea !== 'function' || !isSiegeArea(mapState.current)) && !mob.siegeEnemy) {
                            if (Math.random() < 0.001 * _dropMult) gainItem('new_item_bless_wpn', 1);
                            if (Math.random() < 0.001 * _dropMult) gainItem('new_item_bless_arm', 1);
                            if (Math.random() < 0.0001 * _dropMult) gainItem('new_item_bless_acc', 1);
                        }

                        // 4. 眠龍/妖森 區域額外掉落 (材料 2倍)
                        if (typeof AREA_BONUS_MAPS !== 'undefined' && typeof mapState !== 'undefined' && AREA_BONUS_MAPS.includes(mapState.current)) {
                            let bonusRate = (player.skills && player.skills.includes('sk_elf_worldtree') ? 0.30 : 0.20) * _dropMult;
                            if (typeof AREA_BONUS_ITEMS !== 'undefined') {
                                AREA_BONUS_ITEMS.forEach(itemId => {
                                    if (typeof DB !== 'undefined' && DB.items && DB.items[itemId] && Math.random() < Math.min(1, bonusRate)) gainItem(itemId, 1);
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
                } catch (e) {
                    console.error("[klh_GM2] killMob post-hook error:", e);
                }
            } finally {
                // 還原 MOB_DROPS 等資料庫
                if (originalMobDrops && typeof MOB_DROPS !== 'undefined') MOB_DROPS[mob.n] = originalMobDrops;
                if (originalDarkWeaponDrops && typeof DARK_WEAPON_DROPS !== 'undefined') DARK_WEAPON_DROPS[mob.n] = originalDarkWeaponDrops;
                if (originalDarkCrystalDrops && typeof DARK_CRYSTAL_DROPS !== 'undefined') DARK_CRYSTAL_DROPS[mob.n] = originalDarkCrystalDrops;

                _isMonsterDrop = false;
                _currentDroppingMob = null;
            }
        };
    } else {
        console.warn("[klh_GM2] 找不到 window.killMob，掉寶藥水加倍與怪物掉寶擴充功能已降級");
    }

    // 覆寫 window.gainItem 以在怪物掉落裝備時控制神之祝福套裝效果 (2倍)
    if (typeof window.gainItem === 'function') {
        const originalGainItem = window.gainItem;
        window.gainItem = function (id, cnt = 1, silent = false, forceNormal = false, affixOld = false) {
            let oldForceSherineSet = typeof _forceSherineSet !== 'undefined' ? _forceSherineSet : false;
            try {
                if (_isMonsterDrop && player && player.buffs && player.buffs.god_bless > 0 && !forceNormal && typeof _sherineLootCtx !== 'undefined' && _sherineLootCtx) {
                    let d = typeof DB !== 'undefined' && DB.items ? DB.items[id] : null;
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
            } catch (e) {
                console.error("[klh_GM2] gainItem hook error:", e);
            }

            try {
                return originalGainItem(id, cnt, silent, forceNormal, affixOld);
            } finally {
                if (typeof _forceSherineSet !== 'undefined') {
                    _forceSherineSet = oldForceSherineSet;
                }
            }
        };
    } else {
        console.warn("[klh_GM2] 找不到 window.gainItem，神之祝福裝備掉落特效加成已降級");
    }

    // 覆寫 rollAffixesNew / rollAffixesOld 以在怪物掉落裝備時將祝福機率乘以 3
    if (typeof window.rollAffixesNew === 'function') {
        const originalRollAffixesNew = window.rollAffixesNew;
        window.rollAffixesNew = function () {
            let res = originalRollAffixesNew();
            try {
                if (_isMonsterDrop && player && player.buffs && player.buffs.god_bless > 0) {
                    // 祝福機率乘 3。若原本失敗，則額外判定 2 次
                    if (!res.bless) {
                        let m = (typeof _sherineLootCtx !== 'undefined' && _sherineLootCtx) ? 3 : 1;
                        let blessChance = 0.01 * m;
                        if (Math.random() < blessChance || Math.random() < blessChance) {
                            res.bless = true;
                        }
                    }
                }
            } catch (e) {
                console.error("[klh_GM2] rollAffixesNew hook error:", e);
            }
            return res;
        };
    } else {
        console.warn("[klh_GM2] 找不到 window.rollAffixesNew，神之祝福機率提升功能已降級");
    }

    if (typeof window.rollAffixesOld === 'function') {
        const originalRollAffixesOld = window.rollAffixesOld;
        window.rollAffixesOld = function () {
            let res = originalRollAffixesOld();
            try {
                if (_isMonsterDrop && player && player.buffs && player.buffs.god_bless > 0) {
                    // 祝福機率乘 3。若原本失敗，則額外判定 2 次
                    if (!res.bless) {
                        let m = (typeof _sherineLootCtx !== 'undefined' && _sherineLootCtx) ? 3 : 1;
                        let blessChance = 0.01 * m;
                        if (Math.random() < blessChance || Math.random() < blessChance) {
                            res.bless = true;
                        }
                    }
                }
            } catch (e) {
                console.error("[klh_GM2] rollAffixesOld hook error:", e);
            }
            return res;
        };
    } else {
        console.warn("[klh_GM2] 找不到 window.rollAffixesOld，神之祝福機率提升功能已降級");
    }

    // 9. 覆寫 window.saveGame 以儲存新設定
    if (typeof window.saveGame === 'function') {
        const originalSaveGame = window.saveGame;
        window.saveGame = function () {
            try {
                if (typeof player !== 'undefined' && player && player.config) {
                    let chkDroprate = document.getElementById('set-droprate');
                    let chkAutoBuyDroprate = document.getElementById('set-auto-buy-droprate');
                    let chkGodBless = document.getElementById('set-god-bless');

                    player.config.setDroprate = chkDroprate ? chkDroprate.checked : false;
                    player.config.setAutoBuyDroprate = chkAutoBuyDroprate ? chkAutoBuyDroprate.checked : false;
                    player.config.setGodBless = chkGodBless ? chkGodBless.checked : false;
                }
            } catch (e) {
                console.error("[klh_GM2] saveGame hook error:", e);
            }
            return originalSaveGame.apply(this, arguments);
        };
    } else {
        console.warn("[klh_GM2] 找不到 window.saveGame，設定存檔功能已降級");
    }

    // 10. 覆寫 window.loadGame 載入設定，並支援即時還原
    if (typeof window.loadGame === 'function') {
        const originalLoadGame = window.loadGame;
        window.loadGame = function () {
            let res = originalLoadGame();
            try {
                restoreCustomSettings();
            } catch (e) {
                console.error("[klh_GM2] loadGame hook error:", e);
            }
            return res;
        };
    } else {
        console.warn("[klh_GM2] 找不到 window.loadGame，設定讀取功能已降級");
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
            let res = originalAutoActions();

            try {
                if (typeof player === 'undefined' || !player || player.dead) return res;

                // 12-1. 掉寶藥水自動化
                let chkDroprate = document.getElementById('set-droprate');
                if (chkDroprate && chkDroprate.checked && (player.buffs.droprate || 0) <= 0) {
                    let item = player.inv.find(i => i.id === 'potion_droprate');
                    if (item) {
                        useItem(item.uid, true);
                    } else {
                        let chkAutoBuyDroprate = document.getElementById('set-auto-buy-droprate');
                        if (chkAutoBuyDroprate && chkAutoBuyDroprate.checked) {
                            let price = typeof DB !== 'undefined' && DB.items && DB.items['potion_droprate'] ? DB.items['potion_droprate'].p : 0;
                            if (price > 0 && player.gold >= price) {
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
            } catch (e) {
                console.error("[klh_GM2] autoActions hook error:", e);
            }
            return res;
        };
    } else {
        console.warn("[klh_GM2] 找不到 window.autoActions，自動吃藥水功能已降級");
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

        // 互斥：關閉該分頁的快速廢品模式
        if (typeof quickJunk !== 'undefined' && quickJunk[type]) {
            quickJunk[type].active = false;
            quickJunk[type].sel = {};
            quickJunk[type].known = {};
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

        // 互斥：關閉該分頁的快速廢品模式
        if (typeof quickJunk !== 'undefined' && quickJunk[type]) {
            quickJunk[type].active = false;
            quickJunk[type].sel = {};
            quickJunk[type].known = {};
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
    if (typeof window.toggleQuickEnhance === 'function') {
        const originalToggleQuickEnhance = window.toggleQuickEnhance;
        window.toggleQuickEnhance = function (type) {
            try {
                if (window.quickSell && window.quickSell[type]) {
                    window.quickSell[type].active = false;
                    window.quickSell[type].sel = {};
                }
                if (window.quickLock && window.quickLock[type]) {
                    window.quickLock[type].active = false;
                    window.quickLock[type].sel = {};
                }
            } catch (e) {
                console.error("[klh_GM2] toggleQuickEnhance hook error:", e);
            }
            originalToggleQuickEnhance(type);
        };
    }

    // 互斥處理：覆寫 window.toggleQuickJunk，點擊快速廢品時主動關閉批量賣出與加鎖/解鎖
    if (typeof window.toggleQuickJunk === 'function') {
        const originalToggleQuickJunk = window.toggleQuickJunk;
        window.toggleQuickJunk = function (type) {
            try {
                if (window.quickSell && window.quickSell[type]) {
                    window.quickSell[type].active = false;
                    window.quickSell[type].sel = {};
                }
                if (window.quickLock && window.quickLock[type]) {
                    window.quickLock[type].active = false;
                    window.quickLock[type].sel = {};
                }
            } catch (e) {
                console.error("[klh_GM2] toggleQuickJunk hook error:", e);
            }
            originalToggleQuickJunk(type);
        };
    }

    // ==========================================
    // 13. renderTabs 動態代理 Hook 與 DOM 後處理
    // ==========================================
    let lastGM2Sig = "";
    const originalRenderTabs = window.renderTabs;

    window.renderTabs = function (force) {
        if (typeof state !== 'undefined' && state.ff) return; // 補跑期間不刷新畫面

        // 🛡 保護 0: 如果使用者正聚焦在模糊搜尋輸入框中，且非強制 (force) 重建（如背景戰鬥 tick），
        // 則直接跳過重繪，防止瀏覽器銷毀 DOM 節點導致輸入法組字狀態 (Composition State) 被打碎而卡頓。
        let activeEl = document.activeElement;
        if (!force && activeEl && activeEl.tagName === 'INPUT' && activeEl.id && activeEl.id.startsWith('fuzzy-sell-input-')) {
            return;
        }

        // 🛡 保護 1: 使用者正按住分頁面板（點擊中）→延後重建，避免按鈕被重繪掉而點擊失效
        if (!force && typeof _tabPointerDown !== 'undefined' && _tabPointerDown) {
            _tabRebuildPending = true;
            return;
        }
        // 🛡 保護 2: 戰鬥 tick 內節流，降低怪物受傷/死亡時高頻重建造成的按鈕閃爍與輸入框失焦
        if (!force && typeof state !== 'undefined' && state.inTick) {
            var _throttleMs = (typeof TAB_REBUILD_THROTTLE_MS !== 'undefined') ? TAB_REBUILD_THROTTLE_MS : 250;
            if (!_tabThrottleTimer) {
                _tabThrottleTimer = setTimeout(function () {
                    _tabThrottleTimer = null;
                    renderTabs();
                }, _throttleMs);
            }
            return;
        }
        if (typeof _tabThrottleTimer !== 'undefined' && _tabThrottleTimer) {
            clearTimeout(_tabThrottleTimer);
            _tabThrottleTimer = null;
        }

        // 1. 計算自定義功能簽章，狀態有變時強制重繪
        let currentGM2Sig = (function() {
            let qsActive = window.quickSell ? (window.quickSell.wpn.active + '.' + window.quickSell.arm.active + '.' + window.quickSell.item.active) : '';
            let qsSel = window.quickSell ? (Object.keys(window.quickSell.wpn.sel).join(',') + ';' + Object.keys(window.quickSell.arm.sel).join(',') + ';' + Object.keys(window.quickSell.item.sel).join(',')) : '';
            let qlActive = window.quickLock ? (window.quickLock.wpn.active + '.' + window.quickLock.arm.active + '.' + window.quickLock.item.active) : '';
            let qlSel = window.quickLock ? (Object.keys(window.quickLock.wpn.sel).join(',') + ';' + Object.keys(window.quickLock.arm.sel).join(',') + ';' + Object.keys(window.quickLock.item.sel).join(',')) : '';
            let qjActive = window.quickJunk ? (window.quickJunk.wpn.active + '.' + window.quickJunk.arm.active + '.' + window.quickJunk.item.active) : '';
            let qjSel = window.quickJunk ? (Object.keys(window.quickJunk.wpn.sel).join(',') + ';' + Object.keys(window.quickJunk.arm.sel).join(',') + ';' + Object.keys(window.quickJunk.item.sel).join(',')) : '';
            return `${qsActive}#${qsSel}#${qlActive}#${qlSel}#${qjActive}#${qjSel}`;
        })();
        let needForce = force || (currentGM2Sig !== lastGM2Sig);
        lastGM2Sig = currentGM2Sig;

        // 2. 記住捲動位置與模糊搜尋焦點狀態
        let _scroll = {};
        ['tab-items', 'tab-weapons', 'tab-armors', 'tab-equip', 'tab-skill'].forEach(id => {
            let el = document.getElementById(id);
            if (el) _scroll[id] = el.scrollTop;
        });

        let _fuzzyState = {};
        ['wpn', 'arm', 'item'].forEach(function (t) {
            let inp = document.getElementById('fuzzy-sell-input-' + t);
            if (inp) {
                _fuzzyState[t] = {
                    value: inp.value,
                    focused: document.activeElement === inp,
                    selStart: inp.selectionStart,
                    selEnd: inp.selectionEnd
                };
            }
        });

        // 3. 掛接動態標記攔截器
        let lastCreatedDiv = null;
        const originalCreateElement = document.createElement;
        const originalGetItemFullName = window.getItemFullName;

        document.createElement = function(tagName) {
            const el = originalCreateElement.apply(this, arguments);
            if (tagName === 'div') {
                lastCreatedDiv = el;
            }
            return el;
        };

        window.getItemFullName = function(i) {
            if (lastCreatedDiv) {
                lastCreatedDiv.__klh_item = i;
                lastCreatedDiv = null;
            }
            return originalGetItemFullName.apply(this, arguments);
        };

        // 4. 呼叫官方原版 renderTabs
        try {
            if (typeof originalRenderTabs === 'function') {
                originalRenderTabs(needForce);
            }
        } finally {
            // 還原系統函式，避免對後續操作產生副作用
            document.createElement = originalCreateElement;
            window.getItemFullName = originalGetItemFullName;
        }

        // 5. 進行 DOM 注入後處理
        patchRenderedTabs();

        // 6. 還原捲動位置與模糊搜尋框狀態
        ['tab-items', 'tab-weapons', 'tab-armors', 'tab-equip', 'tab-skill'].forEach(id => {
            let el = document.getElementById(id);
            if (el && _scroll[id] !== undefined) el.scrollTop = _scroll[id];
        });

        ['wpn', 'arm', 'item'].forEach(function (t) {
            let saved = _fuzzyState[t];
            if (saved) {
                let inp = document.getElementById('fuzzy-sell-input-' + t);
                if (inp) {
                    inp.value = saved.value;
                    if (saved.focused) {
                        inp.focus();
                        try {
                            inp.setSelectionRange(saved.selStart, saved.selEnd);
                        } catch (e) {}
                    }
                }
            }
        });

        if (typeof updateSummonLock === 'function') {
            updateSummonLock();
        }
    };

    function patchRenderedTabs() {
        const divs = [
            { type: 'wpn', el: document.getElementById('tab-weapons') },
            { type: 'arm', el: document.getElementById('tab-armors') },
            { type: 'item', el: document.getElementById('tab-items') }
        ];

        divs.forEach(({ type, el }) => {
            if (!el) return;

            // A. 處理表頭注入
            patchHeaders(type, el);

            // B. 處理物品列注入
            const children = Array.from(el.children);
            children.forEach(child => {
                const i = child.__klh_item;
                if (!i) return;

                // 批量賣出模式
                if (window.quickSell && window.quickSell[type].active && !i.lock) {
                    let _checked = !!window.quickSell[type].sel[i.uid];
                    let existingCheckbox = child.querySelector('.klh-qs-checkbox');
                    if (existingCheckbox) {
                        existingCheckbox.checked = _checked;
                    } else {
                        let inner = child.querySelector('.flex.items-center.gap-2') || child.firstChild;
                        if (inner) {
                            child.innerHTML = `<div class="flex items-center justify-between gap-2 w-full">${inner.outerHTML}<input type="checkbox" class="pointer-events-none w-4 h-4 mr-1 flex-shrink-0 klh-qs-checkbox" ${_checked ? 'checked' : ''}></div>`;
                        }
                    }
                    child.classList.remove('ring-2', 'ring-amber-500/70', 'ring-blue-500/70');
                    if (_checked) child.classList.add('ring-2', 'ring-amber-500/70');
                    child.onclick = () => toggleQuickSellItem(type, i.uid);
                }
                // 批量加鎖模式
                else if (window.quickLock && window.quickLock[type].active) {
                    let _checked = !!window.quickLock[type].sel[i.uid];
                    let existingCheckbox = child.querySelector('.klh-ql-checkbox');
                    if (existingCheckbox) {
                        existingCheckbox.checked = _checked;
                    } else {
                        let inner = child.querySelector('.flex.items-center.gap-2') || child.firstChild;
                        if (inner) {
                            child.innerHTML = `<div class="flex items-center justify-between gap-2 w-full">${inner.outerHTML}<input type="checkbox" class="pointer-events-none w-4 h-4 mr-1 flex-shrink-0 klh-ql-checkbox" ${_checked ? 'checked' : ''}></div>`;
                        }
                    }
                    child.classList.remove('ring-2', 'ring-amber-500/70', 'ring-blue-500/70');
                    if (_checked) child.classList.add('ring-2', 'ring-blue-500/70');
                    child.onclick = () => toggleQuickLockItem(type, i.uid);
                }
            });
        });
    }

    function patchHeaders(type, div) {
        // 尋找原版快速表頭（具有 sticky 類別的元素）
        let origHeader = div.querySelector('.sticky');
        
        // 移除之前外掛建立的舊表頭，避免重複堆疊
        const oldCustomHeaders = div.querySelectorAll('.klh-custom-header');
        oldCustomHeaders.forEach(h => h.remove());

        if (!origHeader) return;

        const sellActive = window.quickSell && window.quickSell[type].active;
        const lockActive = window.quickLock && window.quickLock[type].active;

        if (sellActive || lockActive) {
            // 隱藏原版快速表頭 (防止快速強化或快速廢品按鈕出現造成混淆)
            origHeader.style.display = 'none';

            // 建立並插入批量操作表頭（包含取消/確認/全選等）
            if (typeof window.buildQuickSellHeader === 'function') {
                const customHdr = window.buildQuickSellHeader(type);
                customHdr.classList.add('klh-custom-header');
                div.insertBefore(customHdr, origHeader.nextSibling);
            }
        } else {
            // 顯示原版快速表頭（包含快速強化與 2.25 新版快速廢品）
            origHeader.style.display = '';

            // 建立並在原版快速表頭下方插入「批量賣出 / 批量鎖定 / 模糊搜尋」控制面板
            if (typeof window.buildQuickSellHeader === 'function') {
                const customHdr = window.buildQuickSellHeader(type);
                customHdr.classList.add('klh-custom-header');
                div.insertBefore(customHdr, origHeader.nextSibling);
            }
        }
    }

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
                    <div>6. **時空印記**：時空亂流莫測，轉生前建議先**匯出存檔**以防靈魂消散於時光洪流之中。</div>
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
    if (window.__klhGM2Started) return;
    window.__klhGM2Started = true;
    injectGlowStyles();
    initCustomDB();
    restoreCustomSettings();
    registerRebirthNPC();

    // 攔截並 Hook interactNPC 以支援時光使者
    if (typeof window.interactNPC === 'function' && !window.interactNPC.__klhRebirthWrapped) {
        const originalInteractNPC = window.interactNPC;
        window.interactNPC = function (npcId, townId) {
            try {
                if (npcId === "npc_rebirth") {
                    window._activePanel = null;
                    let townNpcContainer = document.getElementById('town-npc-container');
                    if (townNpcContainer) townNpcContainer.classList.add('hidden');
                    
                    let interactionContainer = document.getElementById('town-interaction-container');
                    if (interactionContainer) {
                        interactionContainer.classList.remove('hidden');
                        interactionContainer.classList.add('flex');
                    }

                    let npcName = document.getElementById('interaction-npc-name');
                    if (npcName) npcName.innerText = "時光使者";
                    
                    let npcTitle = document.getElementById('interaction-npc-title');
                    if (npcTitle) npcTitle.innerText = "[轉生系統]";

                    let contentDiv = document.getElementById('interaction-content');
                    if (contentDiv && typeof renderRebirthNPC === 'function') {
                        renderRebirthNPC(contentDiv);
                    }
                    return;
                }
            } catch (e) {
                console.error("[klh_GM2] interactNPC hook error:", e);
            }
            originalInteractNPC(npcId, townId);
        };
        window.interactNPC.__klhRebirthWrapped = true;
    }

    // 攔截並 Hook resetStatsCandle()，防止前世升級與轉生屬性點被回憶蠟燭吃掉
    if (typeof window.resetStatsCandle === 'function' && !window.resetStatsCandle.__klhRebirthWrapped) {
        const originalResetStatsCandle = window.resetStatsCandle;
        window.resetStatsCandle = function () {
            // 計算吃蠟燭前，玩家「應有」的總升級與轉生點數
            // alloc 是玩家已經點上去的點數，bonus 是還沒點的點數
            let currentTotalPoints = 0;
            try {
                if (typeof player !== 'undefined' && player) {
                    if (player.alloc) {
                        currentTotalPoints += (player.alloc.str || 0);
                        currentTotalPoints += (player.alloc.dex || 0);
                        currentTotalPoints += (player.alloc.con || 0);
                        currentTotalPoints += (player.alloc.int || 0);
                        currentTotalPoints += (player.alloc.wis || 0);
                        currentTotalPoints += (player.alloc.cha || 0);
                    }
                    currentTotalPoints += (player.bonus || 0);
                }
            } catch (e) {
                console.error("[klh_GM2] resetStatsCandle pre-hook error:", e);
            }

            // 執行原版的吃蠟燭 (這會把 alloc 歸零，並把 bonus 洗成 創角加成 + (lv-49))
            originalResetStatsCandle();

            // 蓋掉原版的計算，直接把玩家吃蠟燭前持有的「總點數量」原封不動還給他！
            try {
                if (typeof player !== 'undefined' && player) {
                    // 由於重置後 player.alloc 是 0，所以把吃蠟燭前的所有點數都塞回 player.bonus
                    if (currentTotalPoints > 0) {
                        player.bonus = currentTotalPoints;
                    }
                    
                    if (typeof updateUI === 'function') {
                        updateUI();
                    }
                }
            } catch (e) {
                console.error("[klh_GM2] resetStatsCandle post-hook error:", e);
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

            try {
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
            } catch (e) {
                console.error("[klh_GM2] openModal hook error:", e);
            }
        };
    } else {
        console.warn("[klh_GM2] 找不到 window.openModal，席琳注入按鈕擴充已降級");
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

    // ==========================================
    // 17. 廢品記憶清單管理與 UI 攔截
    // ==========================================
    if (typeof window.sellAllJunk === 'function' && !window.sellAllJunk.__klhJunkWrapped) {
        const originalSellAllJunk = window.sellAllJunk;
        window.originalSellAllJunk = originalSellAllJunk;
        window.sellAllJunk = function () {
            try {
                if (typeof window.openJunkListModal === 'function') {
                    window.openJunkListModal();
                    return;
                }
            } catch (e) {
                console.error("[klh_GM2] sellAllJunk hook error:", e);
            }
            if (typeof window.originalSellAllJunk === 'function') {
                window.originalSellAllJunk();
            }
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
            try {
                initJunkButton();
            } catch (e) {
                console.error("[klh_GM2] updateUI hook error:", e);
            }
        };
        window.updateUI.__klhJunkBtnWrapped = true;
    }
}

// 註冊 DOM 載入與即時啟動
function safeStartupGM2() {
    try {
        startupGM2();
    } catch (e) {
        console.error("[klh_GM2] startup error:", e);
    }
}

document.addEventListener('DOMContentLoaded', safeStartupGM2);
if (document.readyState === 'interactive' || document.readyState === 'complete') {
    safeStartupGM2();
}
}) ();
