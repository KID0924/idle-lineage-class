/* ============================================================================
 * klh_initial.js — 創角優化、多難度系統、數值 Patch、屬性擴充 & iOS 鍵盤修復
 *
 * 設計原則:
 *   1. 完全不改原作者程式碼 —— 僅透過從外部「包住」全域函式 (Monkey-Patch) 進行擴充。
 *   2. 優雅降級與安全降載 —— 核心 Hook 皆以 try-catch 沙盒包裹並配備 typeof 存在性檢查，
 *                         若原作者未來改版導致函式或變數消失，外掛功能會默默安全降級或停用，
 *                         確保絕對不拋出致命 JS 錯誤，完全保障原版遊戲流程不中斷。
 *
 * 掛接方式: 在 index.html 中，於 klh_database.js 之前載入：
 *   <script src="klh_initial.js?v=20260628"></script>
 *   <script src="klh_database.js?v=20260628"></script>
 *
 * 功能一覽:
 *   1. 創角數值優化       —— 初始屬性翻倍 (x2)，可分配點數雙倍 (x2)，創角上限各屬性 +20，長按按鈕連續分配點數。
 *   2. 空存檔預填         —— 新存檔自動填入女騎士初始存檔，防止進入空白畫面。
 *   3. 多難度系統         —— 地獄/惡夢/標準/祝福/天堂五段難度，影響怪物強度、掉寶率、金幣量、藥水效力、出怪延遲。
 *   4. 數值 Patch 對接    —— 透過字串替換 patch 原生函式 (tick/killMob/recomputeStats/spawnMob等)，嵌入難度乘數運算。
 *   5. 遊戲內配點優化     —— 遊戲內配點上限 +20，萬能藥上限 +20，加入長按連續配點功能。
 *   7. 存檔槽整合         —— Hook 劫持 openSlotSelect/chooseSlot/slotSummary，在原版渲染基礎上整合難度顯示，防止特權金鑰覆蓋存檔。
 *   8. 更新說明面板       —— 在創角畫面注入可折疊的「與原版差異更新說明」面板。
 *   9. 鍵盤輸入錯位修復   —— 解決 iOS 鍵盤彈起時 fixed 元素錯位及輸入框自動放大網頁等 UI UX 問題。
 *  10. 傭兵存檔精簡       —— 存檔時自動清理協力傭兵背包（inv）以縮減存檔體積。若未來原作者新增「可移水/卷軸給傭兵消耗的功能」，請將 window.CLEAN_ALLY_DATA_ON_SAVE = true 改為 false。
 * ========================================================================== */

(function () {
    'use strict';

    // ==========================================
    // 0. 全域常數與設定
    // ==========================================
    window.gameDifficulty = window.gameDifficulty || 'standard';
    window.tempSelectedDifficulty = window.gameDifficulty;
    window._slotMode = window._slotMode || 'new';
    window.difficultyManuallySelected = false;

    // 🚀 存檔時是否自動清理協力傭兵背包與設定以減少存檔體積 (true: 預設開啟; false: 關閉)
    window.CLEAN_ALLY_DATA_ON_SAVE = true;

    window.DIFFICULTY_SETTINGS = {
        hell: { name: "地獄", mobPower: 3.0, dropRate: 3.0, goldRate: 3.0, potionRate: 0.8, healRate: 1.25, noSunDelay: 5, sunDelay: 5 },
        standard: { name: "標準", mobPower: 1.0, dropRate: 1.0, goldRate: 1.0, potionRate: 1.0, healRate: 1.0, noSunDelay: 50, sunDelay: 10 },
        heaven: { name: "天堂", mobPower: 0.9, dropRate: 2.0, goldRate: 2.0, potionRate: 1.3, healRate: 1.75, noSunDelay: 25, sunDelay: 5 }
    };

    const PRIVILEGED_KEYS = [
        "019ebb3a-ad04-76f1-81df-d15d7b2d03d0", // 4. 天后海拉
        "019ebb3a-e777-7ab7-b744-aaab13066231", // 5. 天神宙斯
        "0012k1i6d229",                         // Supabase 5. 天后海拉
        "0012k1i6d230"                          // Supabase 6. 天神宙斯
    ];

    function checkIsPrivileged() {
        if (typeof window.openGMShop === 'function') {
            return false; // 開啟 GM 商店功能時，解除特權金鑰固定限制
        }
        const mode = localStorage.getItem('klh_storage_mode') || 'local';
        if (mode === 'local') {
            return false; // 本地模式不限制特權金鑰，允許匯入與刪除
        }
        if (mode === 'supabase') {
            const normalized = (localStorage.getItem('klh_supabase_key') || "").trim().toLowerCase();
            return PRIVILEGED_KEYS.some(k => k.toLowerCase() === normalized);
        } else {
            const normalized = (window.activeKey || "").trim().toLowerCase();
            return PRIVILEGED_KEYS.some(k => k.toLowerCase() === normalized);
        }
    }
    window.checkIsPrivileged = checkIsPrivileged;

    // 注入 CSS 樣式（難度按鈕、創角面板滾動條、iOS 修復）
    if (!document.getElementById('klh-initial-style-el')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'klh-initial-style-el';
        styleEl.innerHTML = `
            .btn-diff {
                background-color: hsl(210, 20%, 20%);
                border: 1px solid hsl(210, 20%, 40%);
                color: hsl(210, 10%, 80%);
                transition: all 0.2s ease;
            }
            .btn-diff:hover {
                background-color: hsl(210, 25%, 30%);
                border-color: hsl(210, 25%, 50%);
            }
            #btn-diff-hell.active {
                background-color: hsl(0, 70%, 25%) !important;
                border-color: hsl(0, 100%, 50%) !important;
                box-shadow: 0 0 10px hsl(0, 100%, 40%);
                color: #fff;
            }
            #btn-diff-standard.active {
                background-color: hsl(120, 40%, 25%) !important;
                border-color: hsl(120, 100%, 40%) !important;
                box-shadow: 0 0 10px hsl(120, 100%, 30%);
                color: #fff;
            }
            #btn-diff-blessing.active {
                background-color: hsl(200, 60%, 25%) !important;
                border-color: hsl(200, 100%, 40%) !important;
                box-shadow: 0 0 10px hsl(200, 100%, 30%);
                color: #fff;
            }
            #btn-diff-heaven.active {
                background-color: hsl(45, 70%, 25%) !important;
                border-color: hsl(45, 100%, 40%) !important;
                box-shadow: 0 0 10px hsl(45, 100%, 30%);
                color: #fff;
            }
            #btn-diff-nightmare.active {
                background-color: hsl(25, 70%, 25%) !important;
                border-color: hsl(25, 100%, 40%) !important;
                box-shadow: 0 0 10px hsl(25, 100%, 30%);
                color: #fff;
            }

            /* 美化創角面板的滾動條 */
            #creation-screen::-webkit-scrollbar {
                width: 6px;
            }
            #creation-screen::-webkit-scrollbar-track {
                background: transparent;
            }
            #creation-screen::-webkit-scrollbar-thumb {
                background: rgba(156, 163, 175, 0.35);
                border-radius: 999px;
            }
            #creation-screen::-webkit-scrollbar-thumb:hover {
                background: rgba(156, 163, 175, 0.55);
            }

            /* 解決 iOS 鍵盤彈起時的自動縮放與 fixed 元素錯位 */
            body.m-mobile input, 
            body.m-mobile select, 
            body.m-mobile textarea {
                font-size: 16px !important;
            }
            /* 僅在手機版且虛擬鍵盤開啟時將底部導航移到螢幕外 */
            body.m-mobile.m-keyboard-open #m-nav {
                position: fixed !important;
                bottom: -200px !important;
                left: 0 !important;
                right: 0 !important;
                pointer-events: none !important;
                opacity: 0 !important;
                height: 0 !important;
                overflow: hidden !important;
            }

            /* 修正手機版分頁欄被 sticky 拉下導致上方留空、下方遮擋的問題 */
            body.m-mobile #col-right > .tab-bar {
                position: static !important;
            }

            /* 修正手機版村莊地圖等比例縮小時，NPC 角色沒有跟著縮小（顯得巨大且重疊擠在一起）的問題 */
            body.m-mobile .town-npc {
                transform: translate(-50%, -100%) scale(var(--town-scale, 1)) !important;
                transform-origin: bottom center !important;
            }
            body.m-mobile .town-npc:hover {
                transform: translate(-50%, -100%) scale(calc(1.07 * var(--town-scale, 1))) !important;
            }
        `;
        document.head.appendChild(styleEl);
    }

    // 定期更新村莊縮放比例，解決 CSS 無法直接從 100vw 轉換成無單位 scale 的問題
    let lastTownWidth = 0;
    setInterval(function () {
        const townView = document.getElementById('town-view');
        if (townView) {
            const width = townView.getBoundingClientRect().width;
            if (width !== lastTownWidth) {
                lastTownWidth = width;
                const scale = Math.min(1, width / 800);
                document.documentElement.style.setProperty('--town-scale', scale);
            }
        }
    }, 500);

    // ==========================================
    // 1. saveGame Hook (傭兵清理 + 難度/config 注入)
    // ==========================================
    if (!window.__klh_save_game_initial_wrapped) {
        window.__klh_save_game_initial_wrapped = true;
        const originalSaveGame = window.saveGame;
        window.saveGame = async function (isManual = false) {
            if (typeof player !== 'undefined' && player && player.dead) return;

            // 🚀 開關開啟時，在寫檔前清理協力傭兵的背包與過濾設定以精簡存檔
            let originalAllies = null;
            try {
                if (window.CLEAN_ALLY_DATA_ON_SAVE && typeof player !== 'undefined' && player && player.allies) {
                    originalAllies = JSON.parse(JSON.stringify(player.allies));
                    player.allies.forEach(ally => {
                        if (ally) {
                            ally.inv = [];
                            ally.junkPrefs = {};
                        }
                    });
                }
            } catch (e) {
                console.error("[KLH] saveGame ally cleanup error:", e);
            }

            try {
                if (typeof originalSaveGame === 'function') {
                    originalSaveGame();
                }
            } catch (e) {
                console.error("[KLH] originalSaveGame error:", e);
            }

            // 🚀 寫檔後立刻在記憶體中還原原本的傭兵背包與設定
            if (originalAllies && typeof player !== 'undefined' && player) {
                player.allies = originalAllies;
            }

            // 注入難度與自定義設定至存檔
            // 🔧 使用 _lzGet/_lzSet + _saveUnwrap/_saveWrap 正確處理 LZ-String 壓縮 + 簽章層
            if (typeof currentSlot !== 'undefined') {
                let rawPayload = (typeof _lzGet === 'function') ? _lzGet('lineage_idle_save_' + currentSlot) : localStorage.getItem('lineage_idle_save_' + currentSlot);
                if (rawPayload) {
                    try {
                        // 解開簽章層 (SIG1:hash:json → json)
                        let jsonStr = rawPayload;
                        if (typeof _saveUnwrap === 'function') {
                            let unwrapped = _saveUnwrap(rawPayload);
                            jsonStr = unwrapped.payload || rawPayload;
                        }
                        let d = JSON.parse(jsonStr);
                        d.difficulty = window.gameDifficulty;



                        // 重新封裝：簽章 + LZ壓縮 寫回
                        let newJsonStr = JSON.stringify(d);
                        if (typeof _lzSet === 'function' && typeof _saveWrap === 'function') {
                            _lzSet('lineage_idle_save_' + currentSlot, _saveWrap(newJsonStr));
                        } else if (typeof _lzSet === 'function') {
                            _lzSet('lineage_idle_save_' + currentSlot, newJsonStr);
                        } else {
                            localStorage.setItem('lineage_idle_save_' + currentSlot, newJsonStr);
                        }
                    } catch (e) {
                        console.error("[KLH] saveGame difficulty injection error:", e);
                    }
                }
            }
            // 離線掛機：存檔後蓋時間戳
            if (typeof offlineStamp === 'function') {
                offlineStamp();
            }
        };
    }

    // 動態將「儲存遊戲」按鈕的 onclick 改為帶 isManual=true
    try {
        document.querySelectorAll('button').forEach(btn => {
            if (btn.textContent.trim() === '儲存遊戲') {
                btn.setAttribute('onclick', 'saveGame(true)');
            }
        });
    } catch (e) {
        console.error("[KLH] 儲存按鈕重綁定失敗:", e);
    }

    // ==========================================
    // 2. loadGame Hook (讀取存檔難度)
    // ==========================================
    if (typeof window.loadGame === 'function' && !window.__klh_load_game_wrapped) {
        window.__klh_load_game_wrapped = true;
        const originalLoadGame = window.loadGame;
        window.loadGame = function () {
            // 離線掛機：讀檔前擷取離線錨點
            let _offPre = (typeof offlinePreLoad === 'function') ? offlinePreLoad() : null;
            // 🔧 使用 _lzGet + _saveUnwrap 正確處理 LZ-String 壓縮 + 簽章層
            let rawPayload = (typeof _lzGet === 'function') ? _lzGet('lineage_idle_save_' + currentSlot) : localStorage.getItem('lineage_idle_save_' + currentSlot);
            let finalDiff = window.gameDifficulty || 'standard';

            // 如果玩家「沒有」手動在難度面板上點選難度，則優先使用該存檔原本儲存的難度
            if (!window.difficultyManuallySelected && rawPayload) {
                try {
                    let jsonStr = rawPayload;
                    if (typeof _saveUnwrap === 'function') {
                        let unwrapped = _saveUnwrap(rawPayload);
                        jsonStr = unwrapped.payload || rawPayload;
                    }
                    let d = JSON.parse(jsonStr);
                    if (d.difficulty) {
                        finalDiff = d.difficulty;
                    }
                } catch (e) {
                    console.error("[KLH] loadGame difficulty read error:", e);
                }
            }

            window.gameDifficulty = finalDiff;
            try {
                originalLoadGame();
            } catch (e) {
                console.error("[KLH] originalLoadGame error:", e);
            }

            // 載入完成後，立刻將最新的最終決定難度同步寫回 LocalStorage
            let rawAfterLoad = (typeof _lzGet === 'function') ? _lzGet('lineage_idle_save_' + currentSlot) : localStorage.getItem('lineage_idle_save_' + currentSlot);
            if (rawAfterLoad) {
                try {
                    let jsonStr = rawAfterLoad;
                    if (typeof _saveUnwrap === 'function') {
                        let unwrapped = _saveUnwrap(rawAfterLoad);
                        jsonStr = unwrapped.payload || rawAfterLoad;
                    }
                    let d = JSON.parse(jsonStr);
                    d.difficulty = window.gameDifficulty;
                    let newJsonStr = JSON.stringify(d);
                    if (typeof _lzSet === 'function' && typeof _saveWrap === 'function') {
                        _lzSet('lineage_idle_save_' + currentSlot, _saveWrap(newJsonStr));
                    } else if (typeof _lzSet === 'function') {
                        _lzSet('lineage_idle_save_' + currentSlot, newJsonStr);
                    } else {
                        localStorage.setItem('lineage_idle_save_' + currentSlot, newJsonStr);
                    }
                } catch (e) {
                    console.error("[KLH] loadGame difficulty write-back error:", e);
                }
            }

            if (typeof window.updateDifficultyDisplay === 'function') {
                window.updateDifficultyDisplay();
            }
            // 離線掛機：讀檔後結算收益
            if (_offPre && typeof offlineAfterLoad === 'function') {
                offlineAfterLoad(_offPre);
            }
        };
    }

    // ==========================================
    // 離線掛機其餘 3 處可省去的勾子注入點（已註解）
    // ==========================================
    /*
    // 4. changeMap 注入
    if (typeof window.changeMap === 'function') {
        const originalChangeMap = window.changeMap;
        window.changeMap = function () {
            const res = originalChangeMap.apply(this, arguments);
            if (typeof offlineStamp === 'function') {
                offlineStamp();
            }
            return res;
        };
    }

    // 5. killMob 注入
    if (typeof window.killMob === 'function') {
        const originalKillMob = window.killMob;
        window.killMob = function (idx) {
            if (typeof mapState !== 'undefined' && mapState && mapState.mobs) {
                let mob = mapState.mobs[idx];
                if (mob && !mob._dead && window.__afkKillTally && mob.n) {
                    __afkKillTally[mob.n] = (__afkKillTally[mob.n] || 0) + 1;
                }
            }
            return originalKillMob.apply(this, arguments);
        };
    }

    // 6. gainItem 注入
    if (typeof window.gainItem === 'function') {
        const originalGainItem = window.gainItem;
        window.gainItem = function (id, cnt=1) {
            if (window.__afkGainTally && id) {
                __afkGainTally[id] = (__afkGainTally[id] || 0) + (cnt == null ? 1 : cnt);
            }
            return originalGainItem.apply(this, arguments);
        };
    }
    */

    // ==========================================
    // 3. slotSummary Hook (難度顯示)
    // ==========================================
    if (typeof window.slotSummary === 'function' && !window.__klh_slot_summary_wrapped) {
        window.__klh_slot_summary_wrapped = true;
        const originalSlotSummary = window.slotSummary;
        window.slotSummary = function (n) {
            let sum = null;
            if (typeof originalSlotSummary === 'function') {
                sum = originalSlotSummary(n);
            }
            if (!sum) return null;

            // 🔧 使用 _lzGet + _saveUnwrap 正確處理 LZ-String 壓縮 + 簽章層
            let rawSlotData = (typeof _lzGet === 'function') ? _lzGet('lineage_idle_save_' + n) : localStorage.getItem('lineage_idle_save_' + n);
            let diff = 'standard';
            if (rawSlotData) {
                try {
                    let jsonStr = rawSlotData;
                    if (typeof _saveUnwrap === 'function') {
                        let unwrapped = _saveUnwrap(rawSlotData);
                        jsonStr = unwrapped.payload || rawSlotData;
                    }
                    let d = JSON.parse(jsonStr);
                    if (d.difficulty) {
                        diff = d.difficulty;
                    }
                } catch (e) { }
            }
            let diffName = window.DIFFICULTY_SETTINGS[diff] ? window.DIFFICULTY_SETTINGS[diff].name : '標準';

            sum.difficulty = diff;
            sum.difficultyName = diffName;
            return sum;
        };
    }

    // ==========================================
    // 4. 創角數值優化與長按連續點擊 (Character Creation)
    // ==========================================
    const rawCreateBase = {
        knight: { str: 16, dex: 12, con: 14, int: 8, wis: 9, cha: 8, pts: 8 },
        mage: { str: 8, dex: 7, con: 12, int: 12, wis: 12, cha: 8, pts: 16 },
        elf: { str: 11, dex: 12, con: 12, int: 12, wis: 12, cha: 8, pts: 8 },
        dark: { str: 12, dex: 15, con: 8, int: 10, wis: 11, cha: 8, pts: 11 }
    };

    window.applyCreateBaseModifiers = function () {
        const mode = localStorage.getItem('klh_storage_mode') || 'local';
        let isMultiplied = false;
        if (mode === 'cloud') {
            const activeKeyLower = (window.activeKey || "").trim().toLowerCase();
            const MULTIPLIED_KEYS = [
                "019ebb1f-b31c-769f-8475-02be610a13b0",
                "019ebb3a-0d11-7569-a341-463d28054478",
                "019ebb3a-58de-78fd-8139-eca46c089de3",
                "019ebb3a-ad04-76f1-81df-d15d7b2d03d0",
                "019ebb3a-e777-7ab7-b744-aaab13066231"
            ];
            isMultiplied = MULTIPLIED_KEYS.includes(activeKeyLower);
        } else if (mode === 'supabase') {
            const activeKeyLower = (localStorage.getItem('klh_supabase_key') || "").trim().toLowerCase();
            const SUPABASE_MULTIPLIED_KEYS = [
                "0012k1i6d226", // 太陽神阿波羅
                "0012k1i6d227", // 火神赫發斯特斯
                "0012k1i6d228", // 勝利女神雅典那
                "0012k1i6d229", // 天后海拉
                "0012k1i6d230"  // 天神宙斯
            ];
            isMultiplied = SUPABASE_MULTIPLIED_KEYS.includes(activeKeyLower);
        }
        const multStats = isMultiplied ? 2 : 1;
        const multPts = isMultiplied ? 2 : 1;
        if (typeof createBase !== 'undefined') {
            for (let cls in rawCreateBase) {
                if (createBase[cls]) {
                    createBase[cls].str = rawCreateBase[cls].str * multStats;
                    createBase[cls].dex = rawCreateBase[cls].dex * multStats;
                    createBase[cls].con = rawCreateBase[cls].con * multStats;
                    createBase[cls].int = rawCreateBase[cls].int * multStats;
                    createBase[cls].wis = rawCreateBase[cls].wis * multStats;
                    createBase[cls].cha = rawCreateBase[cls].cha * multStats;
                    createBase[cls].pts = rawCreateBase[cls].pts * multPts;
                }
            }
        }
        if (typeof updateCreateUI === 'function') {
            try {
                updateCreateUI();
            } catch (e) { }
        }
    };

    // 初始套用一次
    window.applyCreateBaseModifiers();

    // 長按加減點邏輯
    let holdTimeout = null;
    let holdInterval = null;

    function adjStatCustom(s, dir, amount) {
        let b = createBase[curCreate.cls];
        const mode = localStorage.getItem('klh_storage_mode') || 'local';
        let isMultiplied = false;
        if (mode === 'cloud') {
            const activeKeyLower = (window.activeKey || "").trim().toLowerCase();
            const MULTIPLIED_KEYS = [
                "019ebb1f-b31c-769f-8475-02be610a13b0",
                "019ebb3a-0d11-7569-a341-463d28054478",
                "019ebb3a-58de-78fd-8139-eca46c089de3",
                "019ebb3a-ad04-76f1-81df-d15d7b2d03d0",
                "019ebb3a-e777-7ab7-b744-aaab13066231"
            ];
            isMultiplied = MULTIPLIED_KEYS.includes(activeKeyLower);
        } else if (mode === 'supabase') {
            const activeKeyLower = (localStorage.getItem('klh_supabase_key') || "").trim().toLowerCase();
            const SUPABASE_MULTIPLIED_KEYS = [
                "0012k1i6d226",
                "0012k1i6d227",
                "0012k1i6d228",
                "0012k1i6d229",
                "0012k1i6d230"
            ];
            isMultiplied = SUPABASE_MULTIPLIED_KEYS.includes(activeKeyLower);
        }
        const multStats = isMultiplied ? 2 : 1;
        let capN = 20 * multStats;
        if (dir > 0) {
            let spent = curCreate.str + curCreate.dex + curCreate.con + curCreate.int + curCreate.wis + curCreate.cha;
            let left = b.pts - spent;
            if (left <= 0) return;
            let actualAmount = Math.min(amount, left);
            let capLeft = capN - (b[s] + curCreate[s]);
            actualAmount = Math.min(actualAmount, capLeft);
            if (actualAmount > 0) {
                curCreate[s] += actualAmount;
            }
        } else {
            if (curCreate[s] <= 0) return;
            let actualAmount = Math.min(amount, curCreate[s]);
            if (actualAmount > 0) {
                curCreate[s] -= actualAmount;
            }
        }
        updateCreateUI();
    }

    window.startHoldStat = function (stat, dir) {
        window.stopHoldStat();
        adjStatCustom(stat, dir, 1);
        holdTimeout = setTimeout(() => {
            holdInterval = setInterval(() => {
                let b = createBase[curCreate.cls];
                let spent = curCreate.str + curCreate.dex + curCreate.con + curCreate.int + curCreate.wis + curCreate.cha;
                let left = b.pts - spent;
                let amount = 2;
                if (dir > 0 && left === 1) {
                    amount = 1;
                }
                adjStatCustom(stat, dir, amount);
            }, 80);
        }, 350);
    };

    window.stopHoldStat = function () {
        if (holdTimeout) { clearTimeout(holdTimeout); holdTimeout = null; }
        if (holdInterval) { clearInterval(holdInterval); holdInterval = null; }
    };

    window.handleStatPress = function (stat, dir) {
        window.startHoldStat(stat, dir);
    };

    function attachHoldEventsToStatButtons() {
        const container = document.getElementById('stat-allocation');
        if (!container) return;
        const buttons = container.querySelectorAll('button');
        buttons.forEach(btn => {
            const onclickAttr = btn.getAttribute('onclick');
            if (onclickAttr && onclickAttr.includes('adjStat')) {
                const match = onclickAttr.match(/adjStat\('(\w+)',\s*(-?\d+)\)/);
                if (match) {
                    const stat = match[1];
                    const dir = parseInt(match[2], 10);
                    btn.removeAttribute('onclick');

                    btn.addEventListener('mousedown', (e) => { e.preventDefault(); window.handleStatPress(stat, dir); });
                    btn.addEventListener('mouseup', window.stopHoldStat);
                    btn.addEventListener('mouseleave', window.stopHoldStat);

                    btn.addEventListener('touchstart', (e) => { e.preventDefault(); window.handleStatPress(stat, dir); }, { passive: false });
                    btn.addEventListener('touchend', window.stopHoldStat);
                    btn.addEventListener('touchcancel', window.stopHoldStat);
                }
            }
        });
    }

    if (typeof window.showCreation === 'function' && !window.__klh_show_creation_wrapped) {
        window.__klh_show_creation_wrapped = true;
        const originalShowCreation = window.showCreation;
        window.showCreation = function () {
            try {
                originalShowCreation();
            } catch (e) {
                console.error("[KLH] originalShowCreation error:", e);
            }
            attachHoldEventsToStatButtons();
        };
    }

    // ==========================================
    // 5. 空存檔預填與安全限制 (Save Slot Prepopulation)
    // ==========================================
    window.createDefaultFemaleKnightSave = function (slotNumber) {
        const daggerUid = Math.random().toString(36).substr(2, 9);
        const jacketUid = Math.random().toString(36).substr(2, 9);
        const potionUid = Math.random().toString(36).substr(2, 9);

        const daggerItem = { id: 'wpn_dagger1', uid: daggerUid, cnt: 1, en: 0, bless: false, anc: false, attr: false, seteff: false, lock: false, junk: false };
        const jacketItem = { id: 'amr_jacket', uid: jacketUid, cnt: 1, en: 0, bless: false, anc: false, attr: false, seteff: false, lock: false, junk: false };
        const potionItem = { id: 'potion_heal', uid: potionUid, cnt: 100, en: 0, bless: false, anc: false, attr: false, seteff: false, lock: false, junk: false };

        let baseStr = 32, baseDex = 24, baseCon = 28, baseInt = 16, baseWis = 18, baseCha = 16, pts = 24;
        let multStats = 2;

        if (typeof createBase !== 'undefined' && createBase.knight) {
            let knightBase = createBase.knight;
            baseStr = knightBase.str;
            baseDex = knightBase.dex;
            baseCon = knightBase.con;
            baseInt = knightBase.int;
            baseWis = knightBase.wis;
            baseCha = knightBase.cha;
            pts = knightBase.pts;
            multStats = baseStr / 16;
        }

        const capN = 20 * multStats;
        let stats = { str: baseStr, dex: baseDex, con: baseCon, int: baseInt, wis: baseWis, cha: baseCha };
        const order = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
        let remainingPts = pts;

        for (let i = 0; i < order.length; i++) {
            if (remainingPts <= 0) break;
            let key = order[i];
            let currentVal = stats[key];
            let room = capN - currentVal;
            if (room > 0) {
                let allocate = Math.min(remainingPts, room);
                stats[key] += allocate;
                remainingPts -= allocate;
            }
        }

        const playerObj = {
            cls: 'knight',
            name: '初心者',
            avatar: '女騎士',
            lv: 1,
            exp: 0,
            gold: 32767,
            hp: 16,
            mhp: 16,
            mp: 1,
            mmp: 1,
            blessings: {},
            base: { str: stats.str, dex: stats.dex, con: stats.con, int: stats.int, wis: stats.wis, cha: stats.cha },
            bonus: 0,
            alloc: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
            panacea: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
            panaceaUsed: 0,
            junkPrefs: {},
            bloodPledge: null,
            magicShieldCd: 0,
            lastMapByCat: {},
            tracking: null,
            ismaelAccUsed: false,
            sherineWorld: false,
            masteryQuest: null,
            mastery: null,
            masteryChangeCnt: 0,
            siege: { active: false, city: 'kent', victoryCity: null, gateKilled: false, towerKilled: false, endTime: 0, kills: 0, result: null, cooldownUntil: 0, rewardPending: false, victoryUntil: 0, accCdUntil: 0 },
            inv: [daggerItem, jacketItem, potionItem],
            eq: { wpn: daggerItem, arrow: null, helm: null, armor: jacketItem, shield: null, cloak: null, tshirt: null, gloves: null, boots: null, ring1: null, ring2: null, ring3: null, ring4: null, amulet: null, belt: null },
            skills: [],
            buffs: { haste: 0, brave: 0, blue: 0, cautious: 0, elfcookie: 0, poly: 0, shield: 0, sk_magic_shield: 0 },
            poly: null,
            allies: [],
            summon: null, charmed: null, manualCd: {}, elfEle: null, hot: null,
            cds: { pot: 0, atkSk: 0, healSk: 0, purifySk: 0 },
            dead: false,
            statuses: { stun: 0, freeze: 0, stone: 0, poison: 0, poisonDmg: 0, poisonTick: 0, burn: 0, burnDmg: 0, burnTick: 0, scald: 0, scaldDmg: 0, scaldTick: 0, bleed: 0, bleedDmg: 0, bleedTick: 0, sleep: 0, silence: 0, paralyze: 0, magicseal: 0, armorBreak: 0, slowAtk: 0, cleave: 0 },
            d: {
                str: stats.str, dex: stats.dex, con: stats.con, int: stats.int, wis: stats.wis, cha: stats.cha,
                meleeDmg: 0, meleeHit: 0, meleeCrit: 0,
                rangedDmg: 0, rangedHit: 0, rangedCrit: 0,
                extraDmg: 0, extraHit: 0,
                magicDmg: 0, magicHit: 0, magicCrit: 0, extraMp: 0, mpReduce: 0,
                meleeCritDmg: 50, rangedCritDmg: 50, magicCritDmg: 50,
                ac: 10, mr: 0, er: 0, dr: 0,
                resFire: 0, resWater: 0, resEarth: 0, resWind: 0,
                hpRegenMax: 0, hpR: 0, mpR: 0, aspd: 1.0
            }
        };

        if (window.applySaveDefaults) {
            window.applySaveDefaults(playerObj);
        }

        return {
            v: window.SAVE_VERSION || 2,
            p: playerObj,
            ms: { current: 'training', mobs: [null, null, null], targetIdx: 0 },
            ticks: 0,
            difficulty: 'standard'
        };
    };

    window.checkAndPrepopulateSlots = function () {
        for (let n = 1; n <= 3; n++) {
            if (localStorage.getItem('lineage_idle_save_' + n + '_empty_flag') === 'true') {
                continue;
            }
            if (!localStorage.getItem('lineage_idle_save_' + n)) {
                const saveObj = window.createDefaultFemaleKnightSave(n);
                localStorage.setItem('lineage_idle_save_' + n, JSON.stringify(saveObj));
            }
        }
    };

    window.clearAllSaves = function () {
        if (checkIsPrivileged()) {
            if (typeof window.showToast === 'function') window.showToast('特權金鑰限制：禁止清除所有存檔！', 'error');
            return;
        }
        if (!confirm('確定要清除所有存檔嗎？此動作將無法復原。')) return;

        const maxSlots = (typeof window.getMaxSaveSlot === 'function') ? window.getMaxSaveSlot() : 6;
        for (let n = 1; n <= maxSlots; n++) {
            localStorage.removeItem('lineage_idle_save_' + n);
            localStorage.removeItem('lineage_idle_save_' + n + '_bak');
        }
        localStorage.removeItem('lineage_idle_warehouse');

        window.checkAndPrepopulateSlots();
        const storageMode = localStorage.getItem('klh_storage_mode') || 'local';
        if (storageMode === 'cloud') {
            if (typeof window.uploadToCloud === 'function') window.uploadToCloud(false, true);
        } else if (storageMode === 'supabase') {
            if (typeof window.uploadToSupabase === 'function') window.uploadToSupabase(false, true);
        }

        if (typeof window.openSlotSelect === 'function') {
            window.openSlotSelect(window._slotMode || 'load');
        }
        if (typeof window.showToast === 'function') window.showToast('已成功清除所有存檔，並自動為您初始化存檔位 1-3！', 'success');
    };

    // 重新實作 chooseSlot
    window.chooseSlot = function (n) {
        const mode = window._slotMode || (typeof _slotMode !== 'undefined' ? _slotMode : 'new');
        if (mode === 'load') {
            currentSlot = n;
            loadGame();
            return;
        }

        // 創角模式 (new)
        if (checkIsPrivileged()) {
            let sum = slotSummary(n);
            if (sum) {
                if (typeof window.showToast === 'function') window.showToast('特權金鑰限制：不允許創新角色覆蓋既有存檔。', 'error');
                return;
            }
        }

        let sum = slotSummary(n);
        if (sum && !confirm(`存檔 ${n} 已有角色（${sum.cls} Lv.${sum.lv} ${sum.name}），確定覆蓋並重新創角？`)) return;

        localStorage.removeItem('lineage_idle_save_' + n + '_empty_flag');
        currentSlot = n;
        document.getElementById('slot-select-panel').classList.add('hidden');
        showCreation();
    };

    // ==========================================
    // 6. 多難度系統整合 (Difficulty Selection)
    // ==========================================
    window.selectDifficulty = function (diff, isManual = true) {
        // 向後相容：舊存檔可能含 nightmare/blessing，自動歸類
        if (diff === 'nightmare') diff = 'hell';
        if (diff === 'blessing') diff = 'heaven';

        if (isManual) {
            // 手動點選時，只更新臨時選擇與描述，不立即修改真正的遊戲難度
            window.tempSelectedDifficulty = diff;
        } else {
            // 初始化或載入時，直接套用設定
            window.gameDifficulty = diff;
            window.tempSelectedDifficulty = diff;
        }

        const activeDiff = window.tempSelectedDifficulty || 'standard';

        const diffs = ['hell', 'standard', 'heaven'];
        diffs.forEach(d => {
            const btn = document.getElementById('btn-diff-' + d);
            if (btn) {
                if (d === activeDiff) btn.classList.add('active');
                else btn.classList.remove('active');
            }
        });

        const descEl = document.getElementById('diff-desc');
        if (descEl) {
            const descs = {
                hell: "【地獄】怪物強度 3.0x，掉寶率 3.0x，金幣量 3.0x，<br>增益藥水效力 0.8x，治癒藥水恢復 1.25x。<br>出怪延遲 0.5秒。<br><span style=\"color:#f87171;font-weight:600;\">「無盡的絕望深淵，唯有強者能在冥界烈火中存活。」</span>",
                standard: "【標準】怪物強度 1.0x，掉寶率 1.0x，金幣量 1.0x，<br>增益藥水與治癒恢復 1.0x。<br>出怪延遲 5.0秒 / 日光 1.0秒。<br><span style=\"color:#94a3b8;font-weight:600;\">「命運之輪平穩運轉，適合所有尋求經典冒險的旅者。」</span>",
                heaven: "【天堂】怪物強度 0.9x，掉寶率 2.0x，金幣量 2.0x，<br>增益藥水效力 1.3x，治癒藥水恢復 1.75x。<br>出怪延遲 2.5秒 / 日光 0.5秒。<br><span style=\"color:#38bdf8;font-weight:600;\">「諸神眷顧的極樂之地，怪孱弱而寶藏無窮的夢幻旅途。」</span>"
            };
            descEl.innerHTML = descs[activeDiff] || "";
        }

        // 如果是初始化/載入，一併更新頂部觸發按鈕文字
        if (!isManual) {
            const triggerText = document.getElementById('diff-trigger-text');
            if (triggerText) {
                const ds = window.DIFFICULTY_SETTINGS[activeDiff] || window.DIFFICULTY_SETTINGS.standard;
                triggerText.innerText = '難度：' + ds.name;
                triggerText.style.color = activeDiff === 'hell' ? '#ff4d4d' : activeDiff === 'heaven' ? '#fbbf24' : '#f8f3e4';
            }
        }
    };

    window.confirmDifficulty = function () {
        const selected = window.tempSelectedDifficulty || 'standard';
        window.gameDifficulty = selected;
        window.difficultyManuallySelected = true;

        // 更新頂部按鈕文字
        const triggerText = document.getElementById('diff-trigger-text');
        if (triggerText) {
            const ds = window.DIFFICULTY_SETTINGS[selected] || window.DIFFICULTY_SETTINGS.standard;
            triggerText.innerText = '難度：' + ds.name;
            triggerText.style.color = selected === 'hell' ? '#ff4d4d' : selected === 'heaven' ? '#fbbf24' : '#f8f3e4';
        }

        // 創新角色狀態下或者當前選中角色槽，刷新大廳 UI
        if (typeof window.updateLoadInfo === 'function') {
            window.updateLoadInfo();
        }

        // 關閉彈出面板
        const popup = document.getElementById('diff-dropdown-popup');
        if (popup) popup.style.display = 'none';
    };

    // 7. Hook 治癒藥水恢復量，使其受難度 healRate 影響（涵蓋玩家、傭兵與寵物）
    if (typeof window.potionHealBase === 'function' && !window.__klh_potion_heal_base_wrapped) {
        window.__klh_potion_heal_base_wrapped = true;
        const originalPotionHealBase = window.potionHealBase;
        window.potionHealBase = function (d) {
            let base = originalPotionHealBase(d);
            const ds = window.DIFFICULTY_SETTINGS[window.gameDifficulty || 'standard'] || window.DIFFICULTY_SETTINGS.standard;
            return Math.floor(base * (ds.healRate || 1.0));
        };
    }

    window.deleteSingleSave = function (n) {
        if (typeof window.openGMShop !== 'function') {
            if (typeof window.showToast === 'function') window.showToast('權限不足：單獨刪除存檔僅限 GM 權限使用！', 'error');
            return;
        }
        if (checkIsPrivileged()) {
            if (typeof window.showToast === 'function') window.showToast('特權金鑰限制：禁止刪除此存檔！', 'error');
            return;
        }
        let sum = slotSummary(n);
        if (!sum) return;
        if (!confirm(`確定要單獨刪除存檔 ${n} 嗎？\n角色：${sum.cls} Lv.${sum.lv} ${sum.name}\n⚠ 刪除後此位置將填成空，並自動同步至雲端。`)) return;

        let cur = localStorage.getItem('lineage_idle_save_' + n);
        if (cur) {
            localStorage.setItem('lineage_idle_save_' + n + '_bak', cur);
        }
        localStorage.removeItem('lineage_idle_save_' + n);
        localStorage.setItem('lineage_idle_save_' + n + '_empty_flag', 'true');

        const storageMode = localStorage.getItem('klh_storage_mode') || 'local';
        if (storageMode === 'cloud') {
            if (typeof window.uploadToCloud === 'function') window.uploadToCloud(false, false, n);
        } else if (storageMode === 'supabase') {
            if (typeof window.uploadToSupabase === 'function') window.uploadToSupabase(false, false, n);
        }
        if (typeof window.openSlotSelect === 'function') window.openSlotSelect(window._slotMode || 'load');
        if (typeof window.showToast === 'function') window.showToast(`已成功刪除存檔 ${n}！`, 'success');
    };

    // 重新實作 openSlotSelect
    if (typeof window.openSlotSelect === 'function' && !window.__klh_open_slot_select_initial_wrapped) {
        window.__klh_open_slot_select_initial_wrapped = true;
        const originalOpenSlotSelect = window.openSlotSelect;
        window.openSlotSelect = function (mode) {
            window._slotMode = mode;
            try { _slotMode = mode; } catch (e) { }

            // 1. 呼叫原作者的 openSlotSelect
            if (typeof originalOpenSlotSelect === 'function') {
                originalOpenSlotSelect(mode);
            }

            // 2. 難度面板注入
            let diffPanel = document.getElementById('difficulty-selection-block');
            if (!diffPanel) {
                const titleEl = document.getElementById('slot-select-title');
                diffPanel = document.createElement('div');
                diffPanel.id = 'difficulty-selection-block';
                diffPanel.className = 'w-full flex flex-col items-center gap-3 p-4 rounded-xl border border-slate-700 bg-slate-900/40 mb-2';
                diffPanel.innerHTML = `
                    <div class="text-sm font-bold text-yellow-400">遊戲難度設定</div>
                    <div class="flex gap-2 w-full max-w-md">
                        <button onclick="selectDifficulty('hell')" id="btn-diff-hell" class="btn btn-diff flex-1 py-2 text-sm font-bold">地獄</button>
                        <button onclick="selectDifficulty('nightmare')" id="btn-diff-nightmare" class="btn btn-diff flex-1 py-2 text-sm font-bold">惡夢</button>
                        <button onclick="selectDifficulty('standard')" id="btn-diff-standard" class="btn btn-diff flex-1 py-2 text-sm font-bold">標準</button>
                        <button onclick="selectDifficulty('blessing')" id="btn-diff-blessing" class="btn btn-diff flex-1 py-2 text-sm font-bold">祝福</button>
                        <button onclick="selectDifficulty('heaven')" id="btn-diff-heaven" class="btn btn-diff flex-1 py-2 text-sm font-bold">天堂</button>
                    </div>
                    <div id="diff-desc" class="w-full max-w-md text-xs text-slate-300 text-center border border-slate-800 bg-slate-950/40 rounded p-3 leading-relaxed"></div>
                `;
                if (titleEl) {
                    titleEl.parentNode.insertBefore(diffPanel, titleEl.nextSibling);
                }
            }

            // 延用當前難度
            window.selectDifficulty(window.gameDifficulty || 'standard', window.difficultyManuallySelected);

            // 🚀 雲端同步中的提示
            let list = document.getElementById('slot-list');
            if (window.isCloudSyncing && list) {
                list.innerHTML = `<div class="w-full text-center py-8 text-indigo-400 font-bold flex flex-col items-center gap-3">
                    <div class="klh-loading-spinner" style="width:36px; height:36px; border-top-color:#818cf8; border-left-color:rgba(129,140,248,0.1); border-right-color:rgba(129,140,248,0.1); border-bottom-color:rgba(129,140,248,0.1);"></div>
                    <span>正在同步雲端存檔中，請稍候...</span>
                </div>`;
                return;
            }

            // 3. 難度顯示與 GM 刪除按鈕
            if (list) {
                const maxSlots = (typeof window.getMaxSaveSlot === 'function') ? window.getMaxSaveSlot() : 6;
                const rows = list.children;
                for (let i = 0; i < Math.min(rows.length, maxSlots); i++) {
                    const n = i + 1;
                    const row = rows[i];
                    if (!row) continue;

                    const sum = slotSummary(n);
                    if (sum) {
                        const btn = row.children[0];
                        if (btn) {
                            const span = btn.querySelector('span');
                            if (span) {
                                let text = span.innerText;
                                if (text.includes('（經典）')) {
                                    text = text.replace('（經典）', ` [${sum.difficultyName}]（經典）`);
                                } else {
                                    text = text + ` [${sum.difficultyName}]`;
                                }
                                span.innerText = text;
                            }
                        }

                        if (typeof window.openGMShop === 'function') {
                            let actionArea = row.children[1];
                            if (mode === 'load' && actionArea) {
                                const deleteBtn = document.createElement('button');
                                deleteBtn.onclick = function () { window.deleteSingleSave(n); };
                                deleteBtn.className = 'btn py-2 px-2 text-base font-bold bg-red-700 hover:bg-red-600 border-red-500 whitespace-nowrap';
                                deleteBtn.style.cssText = 'width: 50px; flex-shrink: 0;';
                                deleteBtn.innerText = '刪除';
                                actionArea.appendChild(deleteBtn);
                            } else if (mode === 'new') {
                                let actionArea = document.createElement('div');
                                actionArea.className = 'flex gap-2 shrink-0 w-14';
                                const deleteBtn = document.createElement('button');
                                deleteBtn.onclick = function () { window.deleteSingleSave(n); };
                                deleteBtn.className = 'btn py-2 px-2 text-base font-bold bg-red-700 hover:bg-red-600 border-red-500 whitespace-nowrap';
                                deleteBtn.style.cssText = 'width: 50px; flex-shrink: 0;';
                                deleteBtn.innerText = '刪除';
                                actionArea.appendChild(deleteBtn);
                                row.appendChild(actionArea);
                            }
                        }
                    }
                }
            }

            // 清除所有存檔按鈕注入
            const isPrivileged = checkIsPrivileged();
            let btnContainer = document.getElementById('slot-select-btn-container');
            if (!btnContainer) {
                const backBtn = document.querySelector('#slot-select-panel > button[onclick="slotBackToMenu()"]');
                if (backBtn) {
                    btnContainer = document.createElement('div');
                    btnContainer.id = 'slot-select-btn-container';
                    btnContainer.className = 'flex gap-4 mt-4';
                    backBtn.parentNode.insertBefore(btnContainer, backBtn);
                    btnContainer.appendChild(backBtn);

                    const clearAllBtn = document.createElement('button');
                    clearAllBtn.id = 'btn-clear-all';
                    clearAllBtn.onclick = function () { window.clearAllSaves(); };
                    clearAllBtn.className = 'btn px-6 py-2 bg-red-700 hover:bg-red-600 text-base font-bold';
                    clearAllBtn.innerText = '清除所有存檔';
                    btnContainer.insertBefore(clearAllBtn, backBtn);
                }
            }

            const clearAllBtn = document.getElementById('btn-clear-all');
            if (clearAllBtn) {
                clearAllBtn.style.display = isPrivileged ? 'none' : '';
            }
        };
    }

    // 重新實作 openLoadSelect — 頂部中央難度按鈕 + 下拉彈出面板
    if (typeof window.openLoadSelect === 'function' && !window.__klh_open_load_select_wrapped) {
        window.__klh_open_load_select_wrapped = true;
        const originalOpenLoadSelect = window.openLoadSelect;
        window.openLoadSelect = function () {
            originalOpenLoadSelect.apply(this, arguments);

            // 難度觸發按鈕 + 下拉面板注入頂部中央
            let diffTrigger = document.getElementById('diff-trigger-btn');
            if (!diffTrigger) {
                const stage = document.getElementById('load-art-stage');
                if (stage) {
                    // 外層容器（頂部居中）
                    const wrapper = document.createElement('div');
                    wrapper.id = 'diff-trigger-wrapper';
                    wrapper.style.cssText = 'position:absolute; z-index:10; left:50%; top:2.5%; transform:translateX(-50%); display:flex; flex-direction:column; align-items:center;';

                    // 觸發按鈕
                    diffTrigger = document.createElement('button');
                    diffTrigger.id = 'diff-trigger-btn';
                    diffTrigger.type = 'button';
                    diffTrigger.style.cssText = 'cursor:pointer; padding:5px 18px; border:1px solid rgba(198,156,74,0.7); background:linear-gradient(180deg,rgba(40,32,18,0.92),rgba(12,8,4,0.95)); color:#f8f3e4; font-family:Georgia,"Times New Roman","Microsoft JhengHei",serif; font-size:clamp(11px,1.2vw,15px); font-weight:700; text-shadow:0 1px 3px #000; box-shadow:inset 0 1px 0 rgba(255,232,167,0.18),0 0 10px rgba(0,0,0,0.5); white-space:nowrap;';
                    diffTrigger.innerHTML = '<span id="diff-trigger-text">難度：標準</span> ▼';
                    diffTrigger.onclick = function () {
                        const popup = document.getElementById('diff-dropdown-popup');
                        if (popup) {
                            const isHidden = popup.style.display === 'none';
                            if (isHidden) {
                                // 打開時重設選單狀態為目前真正的遊戲難度
                                window.selectDifficulty(window.gameDifficulty || 'standard', false);
                                popup.style.display = 'flex';
                            } else {
                                popup.style.display = 'none';
                            }
                        }
                    };
                    wrapper.appendChild(diffTrigger);

                    // 下拉彈出面板
                    const popup = document.createElement('div');
                    popup.id = 'diff-dropdown-popup';
                    popup.style.cssText = 'display:none; flex-direction:column; gap:6px; margin-top:4px; padding:10px; border:1px solid rgba(198,156,74,0.68); background:linear-gradient(180deg,rgba(28,23,15,0.95),rgba(7,5,3,0.98)); box-shadow:inset 0 1px 0 rgba(255,232,167,0.16),0 4px 18px rgba(0,0,0,0.7); font-family:Georgia,"Times New Roman","Microsoft JhengHei",serif; width:88vw; max-width:340px; box-sizing:border-box;';
                    popup.innerHTML = `
                        <div style="color:#fbbf24; text-shadow:0 1px 2px #000; font-size:13px; font-weight:bold; text-align:center;">遊戲難度設定</div>
                        <div style="display:flex; gap:5px; margin-top:4px;">
                            <button onclick="selectDifficulty('hell')" id="btn-diff-hell" class="btn btn-diff" style="flex:1; font-size:12px; font-weight:bold; cursor:pointer; height:28px; display:flex; align-items:center; justify-content:center;">地獄</button>
                            <button onclick="selectDifficulty('standard')" id="btn-diff-standard" class="btn btn-diff" style="flex:1; font-size:12px; font-weight:bold; cursor:pointer; height:28px; display:flex; align-items:center; justify-content:center;">標準</button>
                            <button onclick="selectDifficulty('heaven')" id="btn-diff-heaven" class="btn btn-diff" style="flex:1; font-size:12px; font-weight:bold; cursor:pointer; height:28px; display:flex; align-items:center; justify-content:center;">天堂</button>
                        </div>
                        <div id="diff-desc" style="width:100%; font-size:11px; color:#f8f3e4; text-align:center; border:1px solid rgba(198,156,74,0.3); background:rgba(0,0,0,0.4); padding:6px; line-height:1.45; min-height:48px; box-sizing:border-box; margin-top:3px; display:block;"></div>
                        <button onclick="confirmDifficulty()" class="btn" style="width:100%; height:30px; margin-top:4px; font-size:12px; font-weight:bold; cursor:pointer; background:linear-gradient(180deg,#c69c4a,#8c641b); border:1px solid rgba(255,232,167,0.5); color:#fff; display:flex; align-items:center; justify-content:center; text-shadow:0 1px 2px #000; box-shadow:0 2px 4px rgba(0,0,0,0.4);">確定</button>
                    `;
                    wrapper.appendChild(popup);
                    stage.appendChild(wrapper);
                }
            }
            // 同步選中的難度樣式與描述
            window.selectDifficulty(window.gameDifficulty || 'standard', window.difficultyManuallySelected);
        };
    }

    // 重新實作 updateLoadInfo — 在 Alignment（一般）內直接拼接顯示難度文字，防止被 UI 透明覆蓋層覆寫裁剪
    if (typeof window.updateLoadInfo === 'function' && !window.__klh_update_load_info_wrapped) {
        window.__klh_update_load_info_wrapped = true;
        const originalUpdateLoadInfo = window.updateLoadInfo;
        window.updateLoadInfo = function () {
            // 當前選中的存檔編號
            const currentSelectedSlot = typeof _loadSelectedSlot !== 'undefined' ? _loadSelectedSlot : null;
            
            // 如果切換了存檔槽 (或者首次開啟面臨初始化)
            if (currentSelectedSlot !== null && window._klh_last_seen_selected_slot !== currentSelectedSlot) {
                window._klh_last_seen_selected_slot = currentSelectedSlot;
                window.difficultyManuallySelected = false; // 切換存檔時，重置手動選難度的標記

                const sum = slotSummary(currentSelectedSlot);
                if (sum) {
                    const diff = sum.difficulty || 'standard';
                    window.gameDifficulty = diff;
                    window.tempSelectedDifficulty = diff;
                    if (typeof window.selectDifficulty === 'function') {
                        window.selectDifficulty(diff, false);
                    }
                }
            }

            originalUpdateLoadInfo.apply(this, arguments);

            const alignEl = document.getElementById('load-info-alignment');
            if (!alignEl) return;

            // 清除可能殘留的舊 span 節點
            const oldTag = document.getElementById('load-info-diff-tag');
            if (oldTag) oldTag.remove();

            const sum = slotSummary(_loadSelectedSlot);
            if (sum) {
                // 如果是手動調整難度，優先以當前全局難度為主；否則使用該存檔本身的難度
                const diff = window.difficultyManuallySelected ? (window.gameDifficulty || 'standard') : (sum.difficulty || 'standard');
                const ds = window.DIFFICULTY_SETTINGS[diff] || window.DIFFICULTY_SETTINGS.standard;

                const baseText = sum.classic ? '經典' : '一般';
                
                // 直接寫入 innerText，放進同一個輸入框內，並調整字型大小以防擠壓換行
                alignEl.innerText = `${baseText}(${ds.name})`;
                alignEl.style.fontSize = 'clamp(8px, 0.95vw, 12px)';
                
                if (diff === 'hell') {
                    alignEl.style.color = '#ff4d4d';
                    alignEl.style.textShadow = '0 0 4px rgba(255, 77, 77, 0.5)';
                } else if (diff === 'heaven') {
                    alignEl.style.color = '#fbbf24';
                    alignEl.style.textShadow = '0 0 4px rgba(251, 191, 36, 0.5)';
                } else {
                    alignEl.style.color = '#f4edda';
                    alignEl.style.textShadow = '';
                }
            } else {
                alignEl.style.color = '';
                alignEl.style.textShadow = '';
                alignEl.style.fontSize = '';
            }
        };
    }

    // 在左側 #status-panel 新增難度行
    window.updateDifficultyDisplay = function () {
        let goldEl = document.getElementById('st-gold');
        if (goldEl && !document.getElementById('st-difficulty-row')) {
            const parent = goldEl.parentElement.parentElement;
            const diffRow = document.createElement('div');
            diffRow.id = 'st-difficulty-row';
            diffRow.className = 'flex justify-between text-slate-400 border-t border-slate-700 pt-2';
            diffRow.innerHTML = `<span>遊戲難度</span> <span class="font-bold" id="st-difficulty">標準</span>`;
            parent.appendChild(diffRow);
        }

        const diffEl = document.getElementById('st-difficulty');
        if (diffEl) {
            const diff = window.gameDifficulty || 'standard';
            const settings = window.DIFFICULTY_SETTINGS[diff] || window.DIFFICULTY_SETTINGS.standard;
            diffEl.innerText = settings.name;

            diffEl.style.color = '';
            diffEl.style.textShadow = '';

            if (diff === 'hell') {
                diffEl.style.color = '#ff4d4d';
                diffEl.style.textShadow = '0 0 6px rgba(255, 77, 77, 0.6)';
            } else if (diff === 'heaven') {
                diffEl.style.color = '#fbbf24';
                diffEl.style.textShadow = '0 0 6px rgba(251, 191, 36, 0.6)';
            } else {
                diffEl.style.color = '#e2e8f0';
            }
        }
    };

    // 遊戲內配點長按
    function attachHoldEventsToInGameStatButtons() {
        const buttons = document.querySelectorAll('button[onclick^="adjBonusStat"]');
        buttons.forEach(btn => {
            const onclickAttr = btn.getAttribute('onclick');
            if (onclickAttr) {
                const match = onclickAttr.match(/adjBonusStat\('(\w+)'\)/);
                if (match) {
                    const stat = match[1];
                    btn.removeAttribute('onclick');

                    let btnHoldTimeout = null;
                    let btnHoldInterval = null;

                    const startHold = () => {
                        stopHold();
                        if (typeof adjBonusStat === 'function') {
                            adjBonusStat(stat);
                        }

                        btnHoldTimeout = setTimeout(() => {
                            btnHoldInterval = setInterval(() => {
                                if (player && player.bonus > 0) {
                                    if (typeof adjBonusStat === 'function') {
                                        adjBonusStat(stat);
                                    }
                                } else {
                                    stopHold();
                                }
                            }, 80);
                        }, 350);
                    };

                    const stopHold = () => {
                        if (btnHoldTimeout) { clearTimeout(btnHoldTimeout); btnHoldTimeout = null; }
                        if (btnHoldInterval) { clearInterval(btnHoldInterval); btnHoldInterval = null; }
                    };

                    btn.addEventListener('mousedown', (e) => { e.preventDefault(); startHold(); });
                    btn.addEventListener('mouseup', stopHold);
                    btn.addEventListener('mouseleave', stopHold);

                    btn.addEventListener('touchstart', (e) => { e.preventDefault(); startHold(); }, { passive: false });
                    btn.addEventListener('touchend', stopHold);
                    btn.addEventListener('touchcancel', stopHold);
                }
            }
        });
    }

    // updateUI Hook
    if (typeof window.updateUI === 'function' && !window.__klh_update_ui_wrapped) {
        window.__klh_update_ui_wrapped = true;
        const originalUpdateUI = window.updateUI;
        window.updateUI = function () {
            try {
                originalUpdateUI();
            } catch (e) {
                console.error("[KLH] originalUpdateUI error:", e);
            }
            window.updateDifficultyDisplay();
            attachHoldEventsToInGameStatButtons();
        };
    }


    // ==========================================
    // 7. 數值與效果對接 (Game Patches)
    // ==========================================
    function patchGlobalFunctionMultiple(name, patches) {
        if (typeof window[name] !== 'function') {
            console.error(`Global function ${name} not found for patching`);
            return;
        }
        let code = window[name].toString();
        let anyPatched = false;
        for (let p of patches) {
            let found = false;
            if (p.find instanceof RegExp) {
                found = p.find.test(code);
            } else {
                found = code.includes(p.find);
            }
            if (!found) {
                console.warn(`Could not find pattern/string in function ${name}: ${p.find}`);
                continue;
            }
            code = code.replace(p.find, p.replace);
            anyPatched = true;
        }
        if (anyPatched) {
            try {
                eval("window." + name + " = " + code);
                console.log(`Successfully patched global function: ${name}`);
            } catch (err) {
                console.error(`Error patching function ${name}:`, err);
            }
        }
    }

    // A. 出怪延遲 (tick)
    patchGlobalFunctionMultiple('tick', [
        {
            find: /delay\s*=\s*Math\.round\(\s*50\s*\*\s*\(\s*_pfW\s*\/\s*16\s*\)\s*\*\s*_mv\s*\);/,
            replace: `let _ds = DIFFICULTY_SETTINGS[window.gameDifficulty || 'standard'] || DIFFICULTY_SETTINGS.standard;
                      delay = Math.round(_ds.noSunDelay * (_pfW / 16) * _mv);`
        },
        {
            find: /if\s*\(player\.buffs\.sk_sunlight\s*>\s*0\s*\)\s*delay\s*-=\s*10;/,
            replace: `if (player.buffs.sk_sunlight > 0) delay -= (DIFFICULTY_SETTINGS[window.gameDifficulty || 'standard'] || DIFFICULTY_SETTINGS.standard).sunDelay;`
        }
    ]);

    // B. 怪物物理傷害 (enemyPhysicalAttack)
    patchGlobalFunctionMultiple('enemyPhysicalAttack', [
        {
            find: /totalDmg\s*=\s*Math\.max\(\s*1\s*,\s*totalDmg\s*\);/,
            replace: `totalDmg = Math.floor(totalDmg * (DIFFICULTY_SETTINGS[window.gameDifficulty || 'standard'] || DIFFICULTY_SETTINGS.standard).mobPower);
                      totalDmg = Math.max(1, totalDmg);`
        }
    ]);

    // C. 怪物魔法傷害與 DoTs (applyMobMagic)
    patchGlobalFunctionMultiple('applyMobMagic', [
        {
            find: /dmg\s*=\s*Math\.max\(\s*1\s*,\s*dmg\s*\);/,
            replace: `dmg = Math.floor(dmg * (DIFFICULTY_SETTINGS[window.gameDifficulty || 'standard'] || DIFFICULTY_SETTINGS.standard).mobPower);
                      dmg = Math.max(1, dmg);`
        }
    ]);

    // 包裹 applyMobMagic 以攔截 DoTs 的傷害設定
    if (typeof window.applyMobMagic === 'function') {
        const originalApplyMobMagic = window.applyMobMagic;
        window.applyMobMagic = function (mob, sk) {
            const prevPoisonDmg = player.statuses.poisonDmg;
            const prevBurnDmg = player.statuses.burnDmg;
            const prevScaldDmg = player.statuses.scaldDmg;

            try {
                originalApplyMobMagic(mob, sk);
            } catch (e) {
                console.error("[KLH] originalApplyMobMagic error:", e);
                return;
            }

            const ds = window.DIFFICULTY_SETTINGS[window.gameDifficulty || 'standard'] || window.DIFFICULTY_SETTINGS.standard;
            const mp = ds.mobPower;

            if (player.statuses.poisonDmg !== prevPoisonDmg && player.statuses.poisonDmg > 0) {
                player.statuses.poisonDmg = Math.floor(player.statuses.poisonDmg * mp);
            }
            if (player.statuses.burnDmg !== prevBurnDmg && player.statuses.burnDmg > 0) {
                player.statuses.burnDmg = Math.floor(player.statuses.burnDmg * mp);
            }
            if (player.statuses.scaldDmg !== prevScaldDmg && player.statuses.scaldDmg > 0) {
                player.statuses.scaldDmg = Math.floor(player.statuses.scaldDmg * mp);
            }
        };
    }

    // D. 怪物生命值隨難度縮放 (spawnMob)
    if (typeof window.spawnMob === 'function') {
        const originalSpawnMob = window.spawnMob;
        window.spawnMob = function (idx) {
            try {
                originalSpawnMob(idx);
            } catch (e) {
                console.error("[KLH] originalSpawnMob error:", e);
                return;
            }
            let mob = mapState.mobs[idx];
            if (mob) {
                const ds = window.DIFFICULTY_SETTINGS[window.gameDifficulty || 'standard'] || window.DIFFICULTY_SETTINGS.standard;
                mob.hp = Math.floor(mob.hp * ds.mobPower);
                mob.curHp = mob.hp;
            }
        };
    }

    // E. 掉率與金幣隨難度縮放 (killMob)
    patchGlobalFunctionMultiple('killMob', [
        {
            find: /let\s*_dropBase\s*=\s*\(mob\._grace\s*\?\s*10\s*:\s*\(mob\._sherine\s*\?\s*\(mob\._sherineMad\s*\?\s*5\s*:\s*3\s*\)\s*:\s*1\s*\)\);/,
            replace: `let _dropBase = (mob._grace ? 10 : (mob._sherine ? (mob._sherineMad ? 5 : 3) : 1)) * (DIFFICULTY_SETTINGS[window.gameDifficulty || 'standard'] || DIFFICULTY_SETTINGS.standard).dropRate;`
        },
        {
            find: /let\s*_cdm\s*=\s*classicDropMult\(\);/,
            replace: `let _cdm = classicDropMult() * (DIFFICULTY_SETTINGS[window.gameDifficulty || 'standard'] || DIFFICULTY_SETTINGS.standard).dropRate;`
        },
        {
            find: /gMin\s*\+\s*Math\.floor\(\s*Math\.random\(\)\s*\*\s*\(\s*gMax\s*-\s*gMin\s*\+\s*1\s*\)\s*\)/,
            replace: `Math.floor((gMin + Math.floor(Math.random() * (gMax - gMin + 1))) * (DIFFICULTY_SETTINGS[window.gameDifficulty || 'standard'] || DIFFICULTY_SETTINGS.standard).goldRate)`
        },
        {
            find: /_or\s*&&\s*Math\.random\(\)\s*<\s*_or\s*\/\s*100\s*\*\s*classicDropMult\(\)/,
            replace: `_or && Math.random() < (_or / 100 * classicDropMult()) * (DIFFICULTY_SETTINGS[window.gameDifficulty || 'standard'] || DIFFICULTY_SETTINGS.standard).dropRate`
        },
        {
            find: /Math\.random\(\)\s*<\s*0\.001\s*\*\s*classicDropMult\(\)/,
            replace: `Math.random() < 0.001 * classicDropMult() * (DIFFICULTY_SETTINGS[window.gameDifficulty || 'standard'] || DIFFICULTY_SETTINGS.standard).dropRate`
        }
    ]);

    // F. 藥水效果與屬性隨難度縮放 (recomputeStats)
    patchGlobalFunctionMultiple('recomputeStats', [
        {
            find: /if\(p\.buffs\.haste\s*>\s*0\s*\|\|\s*p\._equipHaste\s*\|\|\s*_mercPots\)\s*spdMult\s*\*=\s*0\.67;/,
            replace: `if(p.buffs.haste > 0 || p._equipHaste || _mercPots) spdMult *= Math.max(0.01, 1.0 - 0.33 * (DIFFICULTY_SETTINGS[window.gameDifficulty || 'standard'] || DIFFICULTY_SETTINGS.standard).potionRate);`
        },
        {
            find: /if\(p\.buffs\.brave\s*>\s*0\s*\|\|\s*\(_mercPots\s*&&\s*\['knight','dragon','warrior','royal'\]\.includes\(p\.cls\)\)\)\s*spdMult\s*\*=\s*0\.67;/,
            replace: `if(p.buffs.brave > 0 || (_mercPots && ['knight','dragon','warrior','royal'].includes(p.cls))) spdMult *= Math.max(0.01, 1.0 - 0.33 * (DIFFICULTY_SETTINGS[window.gameDifficulty || 'standard'] || DIFFICULTY_SETTINGS.standard).potionRate);`
        },
        {
            find: /if\(p\.buffs\.elfcookie\s*>\s*0\s*\|\|\s*\(_mercPots\s*&&\s*p\.cls\s*===\s*'elf'\)\)\s*spdMult\s*\*=\s*0\.85;/,
            replace: `if(p.buffs.elfcookie > 0 || (_mercPots && p.cls === 'elf')) spdMult *= Math.max(0.01, 1.0 - 0.15 * (DIFFICULTY_SETTINGS[window.gameDifficulty || 'standard'] || DIFFICULTY_SETTINGS.standard).potionRate);`
        },
        {
            find: /d\.mpR\s*\+=\s*getWisBlueBonus\(\s*d\.wis\s*\)/,
            replace: `d.mpR += getWisBlueBonus(d.wis) * (DIFFICULTY_SETTINGS[window.gameDifficulty || 'standard'] || DIFFICULTY_SETTINGS.standard).potionRate`
        },
        {
            find: /d\.magicDmg\s*\+=\s*2;\s*d\.mpR\s*\+=\s*2;/,
            replace: `d.magicDmg += 2 * (DIFFICULTY_SETTINGS[window.gameDifficulty || 'standard'] || DIFFICULTY_SETTINGS.standard).potionRate; d.mpR += 2 * (DIFFICULTY_SETTINGS[window.gameDifficulty || 'standard'] || DIFFICULTY_SETTINGS.standard).potionRate;`
        }
    ]);

    // 創角階段上限為原本+20
    patchGlobalFunctionMultiple('adjStat', [
        {
            find: /let capN = (\d+);/,
            replace: "let capN = parseInt($1) * ((['019ebb1f-b31c-769f-8475-02be610a13b0', '019ebb3a-0d11-7569-a341-463d28054478', '019ebb3a-58de-78fd-8139-eca46c089de3', '019ebb3a-ad04-76f1-81df-d15d7b2d03d0', '019ebb3a-e777-7ab7-b744-aaab13066231'].includes((window.activeKey || '').trim().toLowerCase()) && (localStorage.getItem('klh_storage_mode') || 'local') === 'cloud') ? 2 : 1);"
        }
    ]);

    // 遊戲內配點上限為原本+20
    patchGlobalFunctionMultiple('adjBonusStat', [
        {
            find: /let capN = (\d+);/,
            replace: 'let capN = parseInt($1) + 20;'
        }
    ]);

    // 萬能藥單項屬性上限為原本+20
    patchGlobalFunctionMultiple('useItem', [
        {
            find: /let st = d\.pstat,\s*cap = (\d+);/,
            replace: 'let st = d.pstat, cap = parseInt($1) + 20;'
        }
    ]);

    // 動態修改萬能藥說明文字中的上限描述
    if (typeof DB !== 'undefined' && DB.items) {
        for (let itemId in DB.items) {
            let item = DB.items[itemId];
            if (item && item.eff === 'panacea' && item.d) {
                item.d = item.d.replace(/上限\s*(\d+)/g, (match, p1) => {
                    const originalVal = parseInt(p1, 10);
                    return `上限${originalVal + 20}`;
                });
            }
        }
    }




    // ==========================================
    // 9. iOS 鍵盤彈起/縮放/錯位修復
    // ==========================================
    if (!window.__klh_keyboard_listeners_attached) {
        window.__klh_keyboard_listeners_attached = true;
        let isKeyboardOpened = false;
        document.addEventListener('focusin', function (e) {
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
                isKeyboardOpened = true;
                setTimeout(() => {
                    if (isKeyboardOpened) {
                        document.body.classList.add('m-keyboard-open');
                    }
                }, 250);
            }
        });

        document.addEventListener('focusout', function (e) {
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
                document.body.classList.remove('m-keyboard-open');
                isKeyboardOpened = false;
                setTimeout(() => {
                    window.scrollTo(0, 0);
                    document.body.scrollTop = 0;
                }, 50);
            }
        });

        window.addEventListener('scroll', function () {
            if (isKeyboardOpened && (window.scrollY > 0 || document.body.scrollTop > 0)) {
                window.scrollTo(0, 0);
                document.body.scrollTop = 0;
            }
        });

        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', function () {
                const vv = window.visualViewport;
                const currentHeight = vv.height * (vv.scale || 1);
                const standardHeight = window.innerHeight;

                if (currentHeight >= (standardHeight - 100)) {
                    if (document.body.classList.contains('m-keyboard-open')) {
                        document.body.classList.remove('m-keyboard-open');
                        isKeyboardOpened = false;

                        if (document.activeElement &&
                            (document.activeElement.tagName === 'INPUT' ||
                                document.activeElement.tagName === 'TEXTAREA')) {
                            document.activeElement.blur();
                        }

                        setTimeout(() => {
                            window.scrollTo(0, 0);
                            document.body.scrollTop = 0;
                        }, 50);
                    }
                }
            });
        }
    }

    // ==========================================
    // 10. 初始化執行
    // ==========================================
    let started = false;
    function startupInitial() {
        if (started) return;
        started = true;

        // 預設存檔模式
        if (localStorage.getItem('klh_storage_mode') === null) {
            setTimeout(() => {
                if (localStorage.getItem('klh_storage_mode') === null) {
                    const defaultMode = (typeof window.switchToSupabaseMode === 'function') ? 'supabase' : 'local';
                    localStorage.setItem('klh_storage_mode', defaultMode);
                    if (typeof window.updateStorageModeUI === 'function') {
                        window.updateStorageModeUI();
                    }
                }
            }, 0);
        }

        const creationScreen = document.getElementById('creation-screen');
        if (creationScreen) {
            creationScreen.style.maxHeight = 'calc(100vh - 32px)';
            creationScreen.style.overflowY = 'auto';
        }

        // 增添感謝文字與更新說明按鈕
        const headerDiv = document.querySelector('#creation-screen > div.text-center') || document.querySelector('#creation-screen > div:first-child');
        if (headerDiv) {
            const btn = document.createElement('button');
            btn.id = 'thanks-btn';
            btn.className = 'w-full text-center py-2.5 px-4 bg-slate-800/30 hover:bg-slate-800/60 border border-slate-700/85 hover:border-yellow-500/50 text-slate-300 rounded-xl transition-all duration-300 flex flex-col items-center justify-center gap-1 mt-2 focus:outline-none cursor-pointer';
            btn.innerHTML = `
                <div class="text-sm font-semibold text-slate-300">感謝原作者(秋玥)的分享，創造出色的放置天堂</div>
                <div class="text-sm font-semibold text-slate-300">感謝作者(Chaos)的改良，提供了滑順的使用體驗</div>
                <span class="text-xs text-yellow-500 font-bold mt-1 flex items-center gap-1">
                    🛠️ 與原版差異更新說明 (點擊<span id="thanks-btn-state">展開</span>) <span id="thanks-arrow" style="display:inline-block; transition: transform 0.2s;">▼</span>
                </span>
            `;

            const panel = document.createElement('div');
            panel.id = 'thanks-panel';
            panel.className = 'hidden w-full max-w-2xl mx-auto bg-slate-950/80 border border-slate-800 rounded-xl p-4 mt-3 text-left overflow-y-auto max-h-[260px] transition-all duration-300 shadow-inner';
            panel.innerHTML = `
                <div class="text-yellow-400 font-bold text-base border-b border-slate-800 pb-2 mb-3 flex items-center gap-1.5">
                    🛠️ 與原版差異更新說明
                </div>
                <div class="flex flex-col gap-3.5 text-sm text-slate-300 leading-relaxed">
                    <div>
                        <span class="font-bold text-cyan-400">📖 完整遊戲更新與常見問答 (QA.html)</span>
                        <p class="pl-4 text-slate-400">
                            完整更新內容、常見問答及仇恨計算機：
                            <a href="QA.html" target="_blank" class="text-yellow-400 hover:text-yellow-300 font-bold underline inline-flex items-center gap-1 ml-1">
                                🔗 點我開啟【更新指南 & 常見問答】
                            </a>
                        </p>
                    </div>
                    <div>
                        <span class="font-bold text-amber-300">1. 全新雲端存檔功能</span>
                        <p class="pl-4 text-slate-400">支援系統自然產出的專屬雲端金鑰。<strong class="text-rose-400">（⚠️請務必熟記並保存金鑰。）</strong></p>
                    </div>
                    <div>
                        <span class="font-bold text-amber-300">2. 難易度自由切換</span>
                        <p class="pl-4 text-slate-400">新增遊戲難易度隨時、隨意切換功能，關卡挑戰更彈性。</p>
                    </div>
                    <div>
                        <span class="font-bold text-amber-300">3. 全新金幣抽獎系統</span>
                        <p class="pl-4 text-slate-400">「潘朵拉的妹妹」神秘降臨！她偷偷帶走了姐姐藏寶庫中的稀世神裝，讓冒險者能用閃亮的金幣進行轉蛋。不過，為了維護亞丁大陸的物價平衡，諸神稍微對她的魔法機率動了點手腳，以免神裝氾濫成災！</p>
                    </div>
                    <div>
                        <span class="font-bold text-amber-300">4. 煉金術的究極補給</span>
                        <p class="pl-4 text-slate-400">象牙塔研究室的瘋狂煉金術士們終於爆肝研發出突破性成果！現在可在商店購得「濃縮白水」與「超級濃縮白水」，更有能獲得幸運女神微笑的「掉寶藥水」與「神之祝福藥水」，讓你的獵殺之旅效率倍增！</p>
                    </div>
                    <div>
                        <span class="font-bold text-amber-300">5. 時光裂縫與重獲新生</span>
                        <p class="pl-4 text-slate-400">象牙塔的「時光使者」開啟了禁忌的轉生法陣！當你的實力達到 75 級的凡人極限，即可選擇打破肉身重獲新生，不僅能保留你強大的天賦，還能獲得神明額外賜予的屬性點數，重登巔峰！</p>
                    </div>
                    <div>
                        <span class="font-bold text-amber-300">6. 赫爾溫的背包整理術</span>
                        <p class="pl-4 text-slate-400">總是為雜亂的背包頭痛嗎？赫爾溫大師為你解鎖了強大的次元背包整理術！新增「批量賣出」與「模糊搜尋」功能，彈指間就能清除海量垃圾廢品，讓你的行囊如施展了極道防護般清爽！</p>
                    </div>
                    <div>
                        <span class="font-bold text-amber-300">7. 奇岩「財富收割者」黑市</span>
                        <p class="pl-4 text-slate-400">財富收割者跑路了 收割了大家的財富</p>
                    </div>
                    <div>
                        <span class="font-bold text-amber-300">8. 死神席琳的禁忌共鳴</span>
                        <p class="pl-4 text-slate-400">死神席琳的眼淚落入凡間，化為了蘊含無盡黑暗力量的「席琳結晶」！只要在裝備介面輕輕捏碎一顆結晶，就能為你手中的特定神兵防具注入禁忌的靈魂共鳴，強行激活傳說中的九大混沌套裝效果！</p>
                    </div>
                    <div>
                        <span class="font-bold text-amber-300">9. 屬性配點與萬能藥上限提升</span>
                        <p class="pl-4 text-slate-400">屬性升級配點上限提升 +20，萬能藥使用上限也提升 +20。</p>
                    </div>
                </div>
            `;

            btn.onclick = function (e) {
                e.preventDefault();
                const isHidden = panel.classList.contains('hidden');
                const stateText = document.getElementById('thanks-btn-state');
                const arrow = document.getElementById('thanks-arrow');

                if (isHidden) {
                    panel.classList.remove('hidden');
                    if (stateText) stateText.textContent = '收合';
                    if (arrow) arrow.style.transform = 'rotate(180deg)';
                } else {
                    panel.classList.add('hidden');
                    if (stateText) stateText.textContent = '展開';
                    if (arrow) arrow.style.transform = 'rotate(0deg)';
                }
            };

            headerDiv.appendChild(btn);
            headerDiv.appendChild(panel);
        }

        attachHoldEventsToStatButtons();
        attachHoldEventsToInGameStatButtons();

        // 攔截 exportSave 避免特權金鑰被匯出進度，並在匯出時進行存檔淨化
        if (typeof window.exportSave === 'function' && !window.exportSave.__klh_patched_priv) {
            const originalExportSave = window.exportSave;
            window.exportSave = async function () {
                if (typeof checkIsPrivileged === 'function' && checkIsPrivileged()) {
                    if (typeof showToast === 'function') showToast('特權金鑰限制：禁止匯出進度！', 'error');
                    else alert('特權金鑰限制：禁止匯出進度！');
                    return;
                }

                // 暫時覆寫全域的 _saveWrap 以便在生成簽章與匯出檔案前淨化資料
                const originalSaveWrap = window._saveWrap || (typeof _saveWrap === 'function' ? _saveWrap : null);
                if (originalSaveWrap) {
                    window._saveWrap = function (payloadStr) {
                        try {
                            let _obj = JSON.parse(payloadStr);
                            const customItemIds = ['potion_super_white', 'potion_hyper_white', 'potion_droprate', 'potion_god_bless'];
                            if (_obj.p) {
                                // 1. 清理背包自訂藥水
                                if (Array.isArray(_obj.p.inv)) {
                                    _obj.p.inv = _obj.p.inv.filter(i => i && !customItemIds.includes(i.id));
                                }
                                // 2. 清理自動喝水設定 → 一律改回紅色藥水；清理自訂自動 Buff 設定與自訂 config 欄位
                                if (_obj.p.config) {
                                    // 喝水設定一律改回原版紅色藥水
                                    _obj.p.config.setPot = 'potion_heal';
                                    // 移除外掛專屬 config 欄位
                                    delete _obj.p.config.setDroprate;
                                    delete _obj.p.config.setAutoBuyDroprate;
                                    delete _obj.p.config.setGodBless;
                                    if (_obj.p.config.autoBuffSkills) {
                                        delete _obj.p.config.autoBuffSkills.droprate;
                                        delete _obj.p.config.autoBuffSkills.god_bless;
                                    }
                                }
                                // 3. 清理自訂 Buff 剩餘時間
                                if (_obj.p.buffs) {
                                    delete _obj.p.buffs.droprate;
                                    delete _obj.p.buffs.god_bless;
                                }
                                // 4. 清理自訂傭兵設定
                                delete _obj.p.klhTeamConfig;
                                // 5. 清理協力傭兵 (allies) 背包中的自訂藥水
                                if (Array.isArray(_obj.p.allies)) {
                                    _obj.p.allies.forEach(ally => {
                                        if (ally && Array.isArray(ally.inv)) {
                                            ally.inv = ally.inv.filter(i => i && !customItemIds.includes(i.id));
                                        }
                                    });
                                }
                                // 6. 清理轉生系統欄位（原版不存在）
                                delete _obj.p.rebirthCount;
                                delete _obj.p.rebirthPoints;
                                // 7. 清理廢品記憶中自訂物品的簽章 key
                                if (_obj.p.junkPrefs && typeof _obj.p.junkPrefs === 'object') {
                                    for (let sig in _obj.p.junkPrefs) {
                                        if (customItemIds.some(id => sig.startsWith(id + '|') || sig === id)) {
                                            delete _obj.p.junkPrefs[sig];
                                        }
                                    }
                                }
                            }
                            // 8. 清理倉庫裡的自訂藥水
                            if (_obj.wh && Array.isArray(_obj.wh.items)) {
                                _obj.wh.items = _obj.wh.items.filter(i => i && !customItemIds.includes(i.id));
                            }
                            // 9. 清理外掛專屬頂層欄位 (難度系統)
                            delete _obj.difficulty;
                            payloadStr = JSON.stringify(_obj);
                        } catch (e) {
                            console.error("[klh_initial] Sanitizing export data failed:", e);
                        }
                        return originalSaveWrap(payloadStr);
                    };
                }

                try {
                    return await originalExportSave.apply(this, arguments);
                } finally {
                    // 恢復原先的 _saveWrap
                    if (originalSaveWrap) {
                        window._saveWrap = originalSaveWrap;
                    }
                }
            };
            window.exportSave.__klh_patched_priv = true;
        }

        // 修正 _slotMode 作用域遮蔽問題與清理空存檔標記，且限制特權金鑰匯入
        patchGlobalFunctionMultiple('importSave', [
            {
                find: `let input = document.createElement('input');`,
                replace: `if (typeof checkIsPrivileged === 'function' && checkIsPrivileged()) {
                    if (typeof showToast === 'function') showToast('特權金鑰限制：禁止匯入存檔到此伺服器！', 'error');
                    else alert('特權金鑰限制：禁止匯入存檔！');
                    return;
                }
                let input = document.createElement('input');`
            },
            {
                find: `_lzSet('lineage_idle_save_' + n, _saveWrap(saveText));`,
                replace: `_lzSet('lineage_idle_save_' + n, _saveWrap(saveText)); localStorage.removeItem('lineage_idle_save_' + n + '_empty_flag');`
            },
            {
                find: `openSlotSelect(_slotMode);`,
                replace: `openSlotSelect(window._slotMode);`
            }
        ]);
        patchGlobalFunctionMultiple('restoreBackup', [
            {
                find: `let bak = _lsGet('lineage_idle_save_' + n + '_bak');`,
                replace: `if (typeof checkIsPrivileged === 'function' && checkIsPrivileged()) {
                    if (typeof showToast === 'function') showToast('特權金鑰限制：禁止復原備份！', 'error');
                    else alert('特權金鑰限制：禁止復原備份！');
                    return;
                }
                let bak = _lsGet('lineage_idle_save_' + n + '_bak');`
            },
            {
                find: `if(!_lzSetStoredRaw('lineage_idle_save_' + n, bak)) { alert('復原失敗：瀏覽器儲存空間不足或目前無法寫入。'); return; }`,
                replace: `if(!_lzSetStoredRaw('lineage_idle_save_' + n, bak)) { alert('復原失敗：瀏覽器儲存空間不足或目前無法寫入。'); return; } localStorage.removeItem('lineage_idle_save_' + n + '_empty_flag');`
            },
            {
                find: `openSlotSelect(_slotMode);`,
                replace: `openSlotSelect(window._slotMode);`
            }
        ]);

        // 延遲修正手機版存檔列表格式
        setTimeout(() => {
            if (typeof window.openSlotSelect === 'function') {
                const wrappedOpenSlotSelect = window.openSlotSelect;
                window.openSlotSelect = function (mode) {
                    wrappedOpenSlotSelect(mode);
                    // 手機版格式修正
                    if (document.body.classList.contains('m-mobile')) {
                        const list = document.getElementById('slot-list');
                        if (list && typeof slotSummary === 'function') {
                            const rows = list.children;
                            for (let i = 0; i < rows.length; i++) {
                                const btn = rows[i].children[0];
                                if (!btn) continue;
                                const sum = slotSummary(i + 1);
                                if (!sum) continue;
                                const l1 = btn.querySelector('.m-slot-l1');
                                const l2 = btn.querySelector('.m-slot-l2');
                                if (l1 && l2) {
                                    l1.style.display = 'flex';
                                    l1.style.width = '100%';
                                    l1.style.padding = '0 12px';
                                    l1.style.boxSizing = 'border-box';
                                    l1.innerHTML = `<span style="flex: 1; text-align: left;">存檔 ${i + 1}</span>`
                                        + `<span style="flex: 1; text-align: center;">${sum.cls}</span>`
                                        + `<span style="flex: 1; text-align: right;">Lv.${sum.lv}</span>`;

                                    l2.style.display = 'flex';
                                    l2.style.width = '100%';
                                    l2.style.padding = '0 12px';
                                    l2.style.boxSizing = 'border-box';
                                    l2.innerHTML = `<span style="flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${sum.name}</span>`
                                        + `<span style="flex: 1; text-align: right;">[${sum.difficultyName}]</span>`;
                                }
                            }
                        }
                    }
                };
            }
        }, 100);

        // 🌡️ 戰鬥動畫關閉優化 (將 Chaos 版最省電的「關閉戰鬥動畫」性能優化移植至原版主選單)
        (function initKlhPowerSave() {
            const key = 'lineage_anim_off';
            const getAnimOff = () => localStorage.getItem(key) === '1';
            const toggleAnim = () => {
                const current = getAnimOff();
                localStorage.setItem(key, current ? '0' : '1');
                updateUI();
                window.__animOff = !current;
                applyAnimationsOverride();
            };

            const updateUI = () => {
                const btn = document.getElementById('btn-anim-toggle');
                if (btn) {
                    const off = getAnimOff();
                    btn.textContent = off ? '🎬 戰鬥動畫：關閉 (流暢/省電)' : '🎬 戰鬥動畫：開啟';
                    btn.className = 'btn text-base w-72 py-2.5 ' + (off
                        ? 'bg-emerald-800 hover:bg-emerald-700 border-emerald-600'
                        : 'bg-slate-700 hover:bg-slate-600 border-slate-500');
                }
            };

            const applyAnimationsOverride = () => {
                if (getAnimOff()) {
                    window.__animOff = true;
                    // 覆寫怪物動畫更新
                    if (typeof window._mobAnimApply === 'function' && !window._mobAnimApply_original) {
                        window._mobAnimApply_original = window._mobAnimApply;
                        window._mobAnimApply = function () {
                            try { if (typeof _updateFreezeFx === 'function') _updateFreezeFx(); } catch (e) {}
                            try { if (typeof _updateMobSkillFx === 'function') _updateMobSkillFx(); } catch (e) {}
                        };
                    }
                    // 覆寫隊友/玩家動畫更新
                    if (typeof window._allySpritesApply === 'function' && !window._allySpritesApply_original) {
                        window._allySpritesApply_original = window._allySpritesApply;
                        window._allySpritesApply = function () {};
                    }
                    if (typeof window._playerMorphApply === 'function' && !window._playerMorphApply_original) {
                        window._playerMorphApply_original = window._playerMorphApply;
                        window._playerMorphApply = function () {};
                    }
                } else {
                    window.__animOff = false;
                    // 還原原本的動畫更新
                    if (window._mobAnimApply_original) {
                        window._mobAnimApply = window._mobAnimApply_original;
                        delete window._mobAnimApply_original;
                    }
                    if (window._allySpritesApply_original) {
                        window._allySpritesApply = window._allySpritesApply_original;
                        delete window._allySpritesApply_original;
                    }
                    if (window._playerMorphApply_original) {
                        window._playerMorphApply = window._playerMorphApply_original;
                        delete window._playerMorphApply_original;
                    }
                }
            };

            // 注入按鈕至原版主選單 (如果是在原版網站運行)
            const menu = document.getElementById('main-menu');
            const refBtn = document.getElementById('btn-vfxnum-toggle');
            if (menu && refBtn && !document.getElementById('btn-anim-toggle')) {
                const btn = document.createElement('button');
                btn.id = 'btn-anim-toggle';
                btn.onclick = toggleAnim;
                menu.insertBefore(btn, refBtn.nextSibling);
                updateUI();
            }

            // 初始執行覆寫
            applyAnimationsOverride();
        })();
    }

    document.addEventListener('DOMContentLoaded', startupInitial);
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
        startupInitial();
    }

})();
