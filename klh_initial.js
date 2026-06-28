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
 *   5. 屬性查表擴充       —— 力量/敏捷/智力/體質/精神 等六大屬性查表延伸至 70-120 級距，上限 120，並動態覆蓋遊戲原生查表函式。
 *   6. 遊戲內配點優化     —— 遊戲內配點上限 +20，萬能藥上限 +20，加入長按連續配點功能。
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
    window._slotMode = window._slotMode || 'new';
    window.difficultyManuallySelected = false;

    // 🚀 存檔時是否自動清理協力傭兵背包與設定以減少存檔體積 (true: 預設開啟; false: 關閉)
    window.CLEAN_ALLY_DATA_ON_SAVE = true;

    window.DIFFICULTY_SETTINGS = {
        hell: { name: "地獄", mobPower: 3.0, dropRate: 1.5, goldRate: 1.5, potionRate: 0.8, noSunDelay: 5, sunDelay: 5 },
        nightmare: { name: "惡夢", mobPower: 1.5, dropRate: 1.25, goldRate: 1.25, potionRate: 0.9, noSunDelay: 25, sunDelay: 5 },
        standard: { name: "標準", mobPower: 1.0, dropRate: 1.0, goldRate: 1.0, potionRate: 1.0, noSunDelay: 50, sunDelay: 10 },
        blessing: { name: "祝福", mobPower: 0.9, dropRate: 1.1, goldRate: 1.1, potionRate: 1.1, noSunDelay: 25, sunDelay: 5 },
        heaven: { name: "天堂", mobPower: 0.9, dropRate: 1.3, goldRate: 1.3, potionRate: 1.3, noSunDelay: 25, sunDelay: 5 }
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
        `;
        document.head.appendChild(styleEl);
    }

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
            if (typeof currentSlot !== 'undefined') {
                let s = localStorage.getItem('lineage_idle_save_' + currentSlot);
                if (s) {
                    try {
                        let d = JSON.parse(s);
                        d.difficulty = window.gameDifficulty;

                        // 注入自定義設定，以防被原版 saveGame() 覆寫擦除
                        if (d.p) {
                            if (!d.p.config) d.p.config = {};
                            let chkDroprate = document.getElementById('set-droprate');
                            let chkAutoBuyDroprate = document.getElementById('set-auto-buy-droprate');
                            let chkGodBless = document.getElementById('set-god-bless');

                            d.p.config.setDroprate = chkDroprate ? chkDroprate.checked : false;
                            d.p.config.setAutoBuyDroprate = chkAutoBuyDroprate ? chkAutoBuyDroprate.checked : false;
                            d.p.config.setGodBless = chkGodBless ? chkGodBless.checked : false;
                        }

                        localStorage.setItem('lineage_idle_save_' + currentSlot, JSON.stringify(d));
                    } catch (e) { }
                }
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
            let slotDataStr = localStorage.getItem('lineage_idle_save_' + currentSlot);
            let finalDiff = window.gameDifficulty || 'standard';

            // 如果玩家「沒有」手動在難度面板上點選難度，則優先使用該存檔原本儲存的難度
            if (!window.difficultyManuallySelected && slotDataStr) {
                try {
                    let d = JSON.parse(slotDataStr);
                    if (d.difficulty) {
                        finalDiff = d.difficulty;
                    }
                } catch (e) { }
            }

            window.gameDifficulty = finalDiff;
            try {
                originalLoadGame();
            } catch (e) {
                console.error("[KLH] originalLoadGame error:", e);
            }

            // 載入完成後，立刻將最新的最終決定難度同步寫回 LocalStorage
            let s = localStorage.getItem('lineage_idle_save_' + currentSlot);
            if (s) {
                try {
                    let d = JSON.parse(s);
                    d.difficulty = window.gameDifficulty;
                    localStorage.setItem('lineage_idle_save_' + currentSlot, JSON.stringify(d));
                } catch (e) { }
            }

            if (typeof window.updateDifficultyDisplay === 'function') {
                window.updateDifficultyDisplay();
            }
        };
    }

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

            // 讀取存檔中的難度欄位並整合進來
            let s = localStorage.getItem('lineage_idle_save_' + n);
            let diff = 'standard';
            if (s) {
                try {
                    let d = JSON.parse(s);
                    if (d.difficulty) {
                        diff = d.difficulty;
                    }
                } catch (e) {}
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
        window.gameDifficulty = diff;
        if (isManual) {
            window.difficultyManuallySelected = true;
        }

        const diffs = ['hell', 'nightmare', 'standard', 'blessing', 'heaven'];
        diffs.forEach(d => {
            const btn = document.getElementById('btn-diff-' + d);
            if (btn) btn.classList.remove('active');
        });
        const activeBtn = document.getElementById('btn-diff-' + diff);
        if (activeBtn) activeBtn.classList.add('active');

        const descEl = document.getElementById('diff-desc');
        if (descEl) {
            const descs = {
                hell: "【地獄】怪物強度 3.0x，掉寶率 1.5x，金幣量 1.5x，<br>增益藥水效力 0.8x。出怪延遲 0.5秒。<br><span class=\"text-rose-400 font-semibold\">「無盡的絕望深淵，唯有強者能在冥界烈火中存活。」</span>",
                nightmare: "【惡夢】怪物強度 1.5x，掉寶率 1.25x，金幣量 1.25x，<br>增益藥水效力 0.9x。出怪延遲 2.5秒 / 日光 0.5秒。<br><span class=\"text-orange-400 font-semibold\">「恐懼與迷霧籠罩，稍有不慎便會墮入萬劫不復深淵。」</span>",
                standard: "【標準】怪物強度 1.0x，掉寶率 1.0x，金幣量 1.0x，<br>增益藥水效力 1.0x。出怪延遲 5.0秒 / 日光 1.0秒。<br><span class=\"text-slate-400 font-semibold\">「命運之輪平穩運轉，適合所有尋求經典冒險的旅者。」</span>",
                blessing: "【祝福】怪物強度 0.9x，掉寶率 1.1x，金幣量 1.1x，<br>增益藥水效力 1.1x。出怪延遲 2.5秒 / 日光 0.5秒。<br><span class=\"text-emerald-400 font-semibold\">「神聖的光芒庇護著大地，豐饒與幸運伴隨你的每一步。」</span>",
                heaven: "【天堂】怪物強度 0.9x，掉寶率 1.3x，金幣量 1.3x，<br>增益藥水效力 1.3x。出怪延遲 2.5秒 / 日光 0.5秒。<br><span class=\"text-sky-400 font-semibold\">「諸神眷顧的極樂之地，怪孱弱而寶藏無窮的夢幻旅途。」</span>"
            };
            descEl.innerHTML = descs[diff] || "";
        }
    };

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
            } else if (diff === 'standard') {
                diffEl.style.color = '#e2e8f0';
            } else if (diff === 'blessing') {
                diffEl.style.color = '#38bdf8';
                diffEl.style.textShadow = '0 0 6px rgba(56, 189, 248, 0.6)';
            } else if (diff === 'heaven') {
                diffEl.style.color = '#fbbf24';
                diffEl.style.textShadow = '0 0 6px rgba(251, 191, 36, 0.6)';
            } else if (diff === 'nightmare') {
                diffEl.style.color = '#f97316';
                diffEl.style.textShadow = '0 0 6px rgba(249, 115, 22, 0.6)';
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
            find: /delay\s*=\s*\(player\.buffs\.sk_sunlight\s*>\s*0\s*\)\s*\?\s*10\s*:\s*50;/,
            replace: `delay = (player.buffs.sk_sunlight > 0) ? (DIFFICULTY_SETTINGS[window.gameDifficulty || 'standard'] || DIFFICULTY_SETTINGS.standard).sunDelay : (DIFFICULTY_SETTINGS[window.gameDifficulty || 'standard'] || DIFFICULTY_SETTINGS.standard).noSunDelay;`
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
            find: /_dropMult\s*=\s*mob\._grace\s*\?\s*10\s*:\s*\(\s*mob\._sherine\s*\?\s*3\s*:\s*1\s*\)/,
            replace: `_dropMult = (mob._grace ? 10 : (mob._sherine ? 3 : 1)) * (DIFFICULTY_SETTINGS[window.gameDifficulty || 'standard'] || DIFFICULTY_SETTINGS.standard).dropRate`
        },
        {
            find: /gMin\s*\+\s*Math\.floor\(\s*Math\.random\(\)\s*\*\s*\(\s*gMax\s*-\s*gMin\s*\+\s*1\s*\)\s*\)/,
            replace: `Math.floor((gMin + Math.floor(Math.random() * (gMax - gMin + 1))) * (DIFFICULTY_SETTINGS[window.gameDifficulty || 'standard'] || DIFFICULTY_SETTINGS.standard).goldRate)`
        },
        {
            find: /Math\.random\(\)\s*<\s*\(\s*_refine\s*\?\s*0\.30\s*:\s*0\.20\s*\)/,
            replace: `Math.random() < (_refine ? 0.30 : 0.20) * (DIFFICULTY_SETTINGS[window.gameDifficulty || 'standard'] || DIFFICULTY_SETTINGS.standard).dropRate`
        },
        {
            find: /Math\.random\(\)\s*<\s*\(\s*_refine\s*\?\s*0\.15\s*:\s*0\.10\s*\)/,
            replace: `Math.random() < (_refine ? 0.15 : 0.10) * (DIFFICULTY_SETTINGS[window.gameDifficulty || 'standard'] || DIFFICULTY_SETTINGS.standard).dropRate`
        },
        {
            find: /Math\.random\(\)\s*<\s*0\.01/,
            replace: `Math.random() < 0.01 * (DIFFICULTY_SETTINGS[window.gameDifficulty || 'standard'] || DIFFICULTY_SETTINGS.standard).dropRate`
        },
        {
            find: /Math\.random\(\)\s*<\s*0\.005/,
            replace: `Math.random() < 0.005 * (DIFFICULTY_SETTINGS[window.gameDifficulty || 'standard'] || DIFFICULTY_SETTINGS.standard).dropRate`
        },
        {
            find: /Math\.random\(\)\s*<\s*0\.001/,
            replace: `Math.random() < 0.001 * (DIFFICULTY_SETTINGS[window.gameDifficulty || 'standard'] || DIFFICULTY_SETTINGS.standard).dropRate`
        },
        {
            find: /_or\s*&&\s*Math\.random\(\)\s*<\s*_or\s*\/\s*100/,
            replace: `_or && Math.random() < (_or / 100) * (DIFFICULTY_SETTINGS[window.gameDifficulty || 'standard'] || DIFFICULTY_SETTINGS.standard).dropRate`
        }
    ]);

    // F. 藥水效果與屬性隨難度縮放 (recomputeStats)
    patchGlobalFunctionMultiple('recomputeStats', [
        {
            find: /p\.buffs\.haste\s*>\s*0\s*\|\|\s*p\._equipHaste\s*\)\s*spdMult\s*\*=\s*0\.67/,
            replace: `p.buffs.haste > 0 || p._equipHaste) spdMult *= (1.0 - 0.33 * (DIFFICULTY_SETTINGS[window.gameDifficulty || 'standard'] || DIFFICULTY_SETTINGS.standard).potionRate)`
        },
        {
            find: /p\.buffs\.brave\s*>\s*0\s*\)\s*spdMult\s*\*=\s*0\.67/,
            replace: `p.buffs.brave > 0) spdMult *= (1.0 - 0.33 * (DIFFICULTY_SETTINGS[window.gameDifficulty || 'standard'] || DIFFICULTY_SETTINGS.standard).potionRate)`
        },
        {
            find: /p\.buffs\.elfcookie\s*>\s*0\s*\)\s*spdMult\s*\*=\s*0\.85/,
            replace: `p.buffs.elfcookie > 0) spdMult *= (1.0 - 0.15 * (DIFFICULTY_SETTINGS[window.gameDifficulty || 'standard'] || DIFFICULTY_SETTINGS.standard).potionRate)`
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
    // 8. 6大屬性 70 至 120 級距查表與上限擴充
    // ==========================================

    // 力量 (STR) 查表擴充 70-120
    window.getStrMeleeDmg = function (str) {
        return lookupStep(str, [
            [7, 1], [9, 2], [11, 3], [13, 4], [15, 5], [17, 6], [19, 7], [21, 8], [23, 9], [24, 10],
            [25, 11], [27, 12], [29, 13], [31, 14], [33, 15], [34, 16], [35, 17], [37, 18], [39, 19],
            [41, 20], [43, 21], [44, 22], [45, 25], [47, 26], [49, 27], [51, 28], [53, 29], [55, 30],
            [57, 31], [59, 32], [60, 33], [62, 34], [64, 35], [65, 36], [67, 37], [69, 38],
            [71, 40], [74, 41], [77, 42], [80, 43], [83, 44], [86, 45], [89, 46], [92, 47], [95, 48],
            [98, 49], [101, 50], [104, 51], [107, 52], [110, 53], [113, 54], [116, 55], [120, 56]
        ], 58);
    };

    window.getStrMeleeHit = function (str) {
        return lookupStep(str, [
            [7, 4], [8, 5], [10, 6], [11, 7], [13, 8], [14, 9], [16, 10], [17, 11], [19, 12], [20, 13],
            [22, 14], [23, 15], [24, 16], [25, 17], [26, 18], [28, 19], [29, 20], [31, 21], [32, 22],
            [34, 23], [35, 25], [37, 26], [38, 27], [40, 28], [41, 29], [43, 30], [44, 31], [46, 35],
            [47, 36], [49, 37], [50, 38], [52, 39], [53, 40], [55, 41], [56, 42], [58, 43], [59, 44],
            [60, 45], [62, 46], [64, 47], [65, 48], [67, 49], [69, 50],
            [71, 51], [74, 52], [77, 53], [80, 54], [83, 55], [86, 56], [89, 57], [92, 58], [95, 59],
            [98, 60], [101, 61], [104, 62], [107, 63], [110, 64], [113, 65], [116, 66], [120, 67]
        ], 69);
    };

    window.getStrMeleeCrit = function (str) {
        if (str <= 39) return 0;
        if (str <= 44) return 1;
        if (str <= 49) return 2;
        if (str <= 59) return 3;
        if (str <= 64) return 4;
        if (str <= 69) return 5;
        if (str <= 79) return 6;
        if (str <= 89) return 7;
        if (str <= 99) return 8;
        if (str <= 109) return 9;
        if (str <= 119) return 10;
        return 11;
    };

    // 敏捷 (DEX) 查表與上限擴充 70-120
    window.getDexRangedDmg = function (dex) {
        return lookupStep(dex, [
            [8, 2], [11, 3], [14, 4], [17, 5], [20, 6], [23, 7], [24, 8], [26, 9], [29, 10], [32, 11],
            [34, 12], [35, 13], [38, 14], [41, 15], [44, 16], [47, 20], [50, 21], [53, 22], [56, 23], [59, 24],
            [60, 25], [62, 26], [64, 27], [65, 28], [67, 29], [69, 30],
            [72, 31], [75, 32], [78, 33], [81, 34], [84, 35], [87, 36], [90, 37], [93, 38], [96, 39],
            [99, 40], [102, 41], [105, 42], [108, 43], [111, 44], [114, 45], [117, 46], [120, 47]
        ], 49);
    };

    window.getDexRangedHit = function (dex) {
        return lookupStep(dex, [
            [7, -3], [8, -2], [9, -1], [10, 0], [11, 1], [12, 2], [13, 3], [14, 4], [15, 5], [16, 6],
            [17, 7], [18, 8], [19, 9], [20, 10], [21, 11], [22, 12], [23, 13], [24, 14], [25, 16], [26, 17],
            [27, 18], [28, 19], [29, 20], [30, 21], [31, 22], [32, 23], [33, 24], [34, 25], [35, 27], [36, 28],
            [37, 29], [38, 30], [39, 31], [40, 32], [41, 33], [42, 34], [43, 35], [44, 36], [45, 40], [46, 41],
            [47, 42], [48, 43], [49, 44], [50, 45], [51, 46], [52, 47], [53, 48], [54, 49], [55, 50], [56, 51],
            [57, 52], [58, 53], [59, 54],
            [60, 55], [61, 56], [62, 57], [63, 58], [64, 59], [65, 60], [66, 61], [67, 62], [68, 63], [69, 64],
            [71, 65], [74, 66], [77, 67], [80, 68], [83, 69], [86, 70], [89, 71], [92, 72], [95, 73],
            [98, 74], [101, 75], [104, 76], [107, 77], [110, 78], [113, 79], [116, 80], [120, 81]
        ], 83);
    };

    window.getDexRangedCrit = function (dex) {
        if (dex <= 39) return 0;
        if (dex <= 44) return 1;
        if (dex <= 49) return 2;
        if (dex <= 59) return 3;
        if (dex <= 64) return 4;
        if (dex <= 69) return 5;
        if (dex <= 79) return 6;
        if (dex <= 89) return 7;
        if (dex <= 99) return 8;
        if (dex <= 109) return 9;
        if (dex <= 119) return 10;
        return 11;
    };

    window.getDexAC = function (dex) {
        return lookupStep(dex, [
            [8, -2], [11, -3], [14, -4], [17, -5], [20, -6], [23, -7], [26, -8], [29, -9], [32, -10], [35, -11],
            [38, -12], [41, -13], [44, -14], [47, -15], [50, -16], [53, -17], [56, -18], [59, -19],
            [60, -20], [63, -21], [66, -22],
            [70, -23], [75, -24], [80, -25], [85, -26], [90, -27], [95, -28], [100, -29], [105, -30], [110, -31], [115, -32], [120, -33]
        ], -35);
    };

    window.getDexER = function (dex) {
        if (dex <= 60) return Math.floor(dex / 2);
        return 30 + Math.floor((Math.min(dex, 120) - 60) / 3);
    };

    // 智力 (INT) 查表與上限擴充 70-120
    window.getIntMagicDmg = function (int) {
        return lookupStep(int, [
            [14, 0], [19, 1], [24, 2], [29, 4], [34, 5], [39, 7], [44, 8], [49, 12], [54, 13], [59, 14],
            [60, 15], [63, 16], [66, 17], [69, 18],
            [72, 20], [75, 21], [78, 22], [81, 23], [84, 24], [87, 25], [90, 26], [93, 27], [96, 28],
            [99, 29], [102, 30], [105, 31], [108, 32], [111, 33], [114, 34], [117, 35], [120, 36]
        ], 38);
    };

    window.getIntMagicHit = function (int) {
        return lookupStep(int, [
            [8, -4], [11, -3], [14, -2], [17, -1], [22, 0], [24, 1], [25, 2], [28, 3], [31, 4], [34, 5],
            [37, 7], [40, 8], [43, 9], [44, 10], [46, 13], [49, 14], [52, 15], [55, 16], [58, 17],
            [60, 18], [63, 19], [66, 20], [69, 21],
            [72, 22], [75, 23], [78, 24], [81, 25], [84, 26], [87, 27], [90, 28], [93, 29], [96, 30],
            [99, 31], [102, 32], [105, 33], [108, 34], [111, 35], [114, 36], [117, 37], [120, 38]
        ], 40);
    };

    window.getIntMagicCrit = function (int) {
        if (int <= 34) return 0;
        if (int <= 39) return 1;
        if (int <= 44) return 2;
        if (int <= 49) return 4;
        if (int <= 54) return 5;
        if (int <= 59) return 6;
        if (int <= 64) return 7;
        if (int <= 69) return 8;
        if (int <= 79) return 9;
        if (int <= 89) return 10;
        if (int <= 99) return 11;
        if (int <= 109) return 12;
        if (int <= 119) return 13;
        return 14;
    };

    window.getIntExtraMp = function (int) {
        return lookupStep(int, [
            [11, 2], [15, 3], [19, 4], [23, 5], [27, 6], [31, 7], [35, 8], [39, 9], [43, 10], [47, 11],
            [51, 12], [55, 13], [59, 14],
            [60, 15], [63, 16], [66, 17], [69, 18],
            [72, 20], [75, 21], [78, 22], [81, 23], [84, 24], [87, 25], [90, 26], [93, 27], [96, 28],
            [99, 29], [102, 30], [105, 31], [108, 32], [111, 33], [114, 34], [117, 35], [120, 36]
        ], 38);
    };

    window.getIntMpReduce = function (int) {
        if (int <= 45) {
            return lookupStep(int, [
                [8, 5], [10, 6], [11, 7], [13, 8], [14, 9], [16, 10], [17, 11], [19, 12], [20, 13], [22, 14],
                [23, 15], [25, 16], [26, 17], [28, 18], [29, 19], [31, 20], [32, 21], [34, 22], [35, 23], [37, 24],
                [38, 25], [40, 26], [41, 27], [43, 28], [44, 29]
            ], 30);
        }
        return Math.min(40, 30 + Math.floor((int - 45) / 7.5));
    };

    // 體質 (CON) 查表與上限擴充 70-120
    window.getConHpRegenMax = function (con) {
        if (con < 11) return 0;
        return lookupStep(con, [
            [11, 5], [13, 6], [15, 7], [17, 8], [19, 9], [21, 10], [23, 11], [24, 12], [25, 13], [27, 14],
            [29, 15], [31, 16], [33, 17], [34, 18], [35, 19], [37, 20], [39, 21], [41, 22], [43, 23], [44, 24],
            [46, 27], [48, 28], [50, 29], [52, 30], [54, 31], [55, 32], [57, 33], [59, 34],
            [60, 35], [63, 36], [66, 37], [69, 38],
            [72, 40], [75, 41], [78, 42], [81, 43], [84, 44], [87, 45], [90, 46], [93, 47], [96, 48],
            [99, 49], [102, 50], [105, 51], [108, 52], [111, 53], [114, 54], [117, 55], [120, 56]
        ], 58);
    };

    window.getConPotionPct = function (con) {
        if (con <= 65) {
            if (con <= 19) return 0;
            if (con <= 24) return 1;
            if (con <= 30) return 2;
            if (con <= 35) return 3;
            if (con <= 40) return 4;
            if (con <= 45) return 5;
            if (con <= 50) return 6;
            if (con <= 55) return 7;
            if (con <= 60) return 8;
            return 9;
        }
        return Math.min(16, 9 + Math.floor((con - 60) / 10));
    };

    // 精神 (WIS) 查表與上限擴充 70-120
    window.getWisMpRegen = function (wis) {
        return lookupStep(wis, [
            [9, 1], [14, 2], [19, 3], [24, 4], [29, 6], [34, 7], [39, 9], [44, 10], [49, 14], [54, 15], [59, 17],
            [64, 20], [69, 21],
            [72, 23], [75, 24], [78, 25], [81, 26], [84, 27], [87, 28], [90, 29], [93, 30], [96, 31],
            [99, 32], [102, 33], [105, 34], [108, 35], [111, 36], [114, 37], [117, 38], [120, 39]
        ], 41);
    };

    window.getWisMpOnKill = function (wis) {
        if (wis >= 120) return 18;
        if (wis >= 110) return 17;
        if (wis >= 100) return 16;
        if (wis >= 90) return 15;
        if (wis >= 80) return 14;
        if (wis >= 70) return 13;
        if (wis >= 67) return 12;
        if (wis >= 64) return 11;
        if (wis >= 60) return 10;
        if (wis >= 53) return 9;
        if (wis >= 45) return 8;
        if (wis >= 38) return 7;
        if (wis >= 30) return 6;
        if (wis >= 25) return 5;
        if (wis >= 20) return 3;
        if (wis >= 15) return 2;
        if (wis >= 11) return 1;
        return 0;
    };

    window.getWisMR = function (wis) {
        if (wis <= 10) return 0;
        if (wis <= 60) return (wis - 10) * 4;
        return 200 + (Math.min(wis, 120) - 60) * 2;
    };

    window.getWisBlueBonus = function (wis) {
        return lookupStep(wis, [
            [11, 1], [13, 2], [15, 3], [17, 4], [19, 5], [21, 6], [23, 7], [24, 8], [25, 9], [27, 10],
            [29, 11], [31, 12], [33, 13], [34, 14], [35, 15], [37, 16], [39, 17], [41, 18], [43, 19], [44, 20],
            [46, 23], [48, 24], [50, 25], [52, 26], [54, 27], [55, 28], [57, 29], [59, 30],
            [60, 31], [63, 32], [66, 33], [69, 34],
            [72, 35], [75, 36], [78, 37], [81, 38], [84, 39], [87, 40], [90, 41], [93, 42], [96, 43],
            [99, 44], [102, 45], [105, 46], [108, 47], [111, 48], [114, 49], [117, 50], [120, 51]
        ], 53);
    };


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
                        <p class="pl-4 text-slate-400">屬性升級配點上限提升 +20，萬能藥使用上限也提升 +20；同時六大屬性的查表公式全面擴充延伸（70 至 120 級距），單項屬性最高上限可達 120，突破凡人極限！</p>
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

        // 攔截 exportSave 避免特權金鑰被匯出進度
        if (typeof window.exportSave === 'function' && !window.exportSave.__klh_patched_priv) {
            const originalExportSave = window.exportSave;
            window.exportSave = async function () {
                if (typeof checkIsPrivileged === 'function' && checkIsPrivileged()) {
                    if (typeof showToast === 'function') showToast('特權金鑰限制：禁止匯出進度！', 'error');
                    else alert('特權金鑰限制：禁止匯出進度！');
                    return;
                }
                return await originalExportSave.apply(this, arguments);
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
                find: `localStorage.setItem('lineage_idle_save_' + n, saveText);`,
                replace: `localStorage.setItem('lineage_idle_save_' + n, saveText); localStorage.removeItem('lineage_idle_save_' + n + '_empty_flag');`
            },
            {
                find: `openSlotSelect(_slotMode);`,
                replace: `openSlotSelect(window._slotMode);`
            }
        ]);
        patchGlobalFunctionMultiple('restoreBackup', [
            {
                find: `let bak = localStorage.getItem('lineage_idle_save_' + n + '_bak');`,
                replace: `if (typeof checkIsPrivileged === 'function' && checkIsPrivileged()) {
                    if (typeof showToast === 'function') showToast('特權金鑰限制：禁止復原備份！', 'error');
                    else alert('特權金鑰限制：禁止復原備份！');
                    return;
                }
                let bak = localStorage.getItem('lineage_idle_save_' + n + '_bak');`
            },
            {
                find: `localStorage.setItem('lineage_idle_save_' + n, bak);`,
                replace: `localStorage.setItem('lineage_idle_save_' + n, bak); localStorage.removeItem('lineage_idle_save_' + n + '_empty_flag');`
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
    }

    document.addEventListener('DOMContentLoaded', startupInitial);
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
        startupInitial();
    }

})();
