/* ============================================================================
 * klh_Addition.js — 轉生系統 & 核心功能 Hook (NPC 互動、蠟燭保護)
 *
 * 設計原則:
 *   1. 完全不改原作者程式碼 —— 僅透過從外部「包住」全域函式 (Monkey-Patch) 進行擴充。
 *   2. 優雅降級與安全降載 —— 核心 Hook 皆以 try-catch 沙盒包裹並配備 typeof 存在性檢查，
 *                         若原作者未來改版導致函式或變數消失，外掛功能會默默安全降級或停用，
 *                         確保絕對不拋出致命 JS 錯誤，完全保障原版遊戲流程不中斷。
 *
 * 掛接方式: 在 index.html 的 </body> 標籤正上方，插入以下外掛腳本：
 *   <script src="klh_Addition.js?v=20260716"></script>
 *
 * 功能一覽:
 *   1. 轉生系統實作 —— 「時光使者」NPC（75等以上可轉生，保留屬性點並獲得依難度遞增的額外點數）。
 *   2. 核心功能與入口 Hook —— Hook NPC 互動、回憶蠟燭保護。
 * ========================================================================== */

(function () {

    /* ============================================================================
     *  ⚡ 1. 轉生系統實作 (Rebirth NPC & System)
     * ============================================================================ */

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
                    town.npcs = town.npcs.filter(n => n.id !== "npc_rebirth");
                    if (townId === "town_ivory_tower") {
                        town.npcs.push(rebirthNpc);
                    }
                }
            }
        }
    }

    function getRebirthPointsByLv(lv) {
        if (lv >= 90) return 66;
        if (lv >= 87) return 46;
        if (lv >= 86) return 34;
        if (lv >= 84) return 24;
        if (lv >= 82) return 18;
        if (lv >= 80) return 12;
        if (lv >= 79) return 10;
        if (lv >= 75) return 6;
        return 0;
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
                    <div>3. **屬性重置**：已分配的升級屬性點將被重置，角色回到初始屬性狀態（但萬能藥加成完整保留）。</div>
                    <div>4. **累積轉生點數**：每次轉生時，您將額外獲得「轉生加成點數」（例如：75等送 6 點，80等送 12 點，90等送 66 點，等級越高獲得點數越多），這些點數會永久累加並在 1 等時可供分配！</div>
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
            `• 已分配的屬性點將會重置回創角狀態\n` +
            `• 獲得額外累加的 ${pointsEarned} 點永久屬性點！`;

        if (confirm(confirmMsg)) {
            player.rebirthCount = (player.rebirthCount || 0) + 1;
            player.rebirthPoints = (player.rebirthPoints || 0) + pointsEarned;

            player.lv = 1;
            player.exp = 0;

            // 執行轉生重置：
            // 1. 還原角色基礎屬性 (創角時的起始狀態)
            if (typeof createBase !== 'undefined' && createBase[player.cls]) {
                const b = createBase[player.cls];
                player.base = { str: b.str, dex: b.dex, con: b.con, int: b.int, wis: b.wis, cha: b.cha };
                player.alloc = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
                // 2. 角色重置後總可用點數 = 創角時可分配點數 + 累計轉生加成點數
                player.bonus = b.pts + player.rebirthPoints;
            } else {
                // 防呆備份方案
                player.alloc = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
                player.bonus = (player.bonus || 0) + pointsEarned;
            }

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


    /* ============================================================================
     *  ⚡ 2. 核心功能 Hook (NPC 互動與蠟燭重置保護)
     * ============================================================================ */

    function startupGM2() {
        if (window.__klhGM2Started) return;
        window.__klhGM2Started = true;
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
                    console.error("[klh_Addition] interactNPC hook error:", e);
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
                    console.error("[klh_Addition] resetStatsCandle pre-hook error:", e);
                }

                // 執行原版的吃蠟燭 (這會把 alloc 歸零，並把 bonus 洗成 創角加成 + (lv-49))
                originalResetStatsCandle();

                // 蓋掉原版的計算，直接把玩家吃蠟燭前持有的「總點數量」原封不動還給他！
                try {
                    if (typeof player !== 'undefined' && player) {
                        if (currentTotalPoints > 0) {
                            player.bonus = currentTotalPoints;
                        }
                        
                        if (typeof updateUI === 'function') {
                            updateUI();
                        }
                    }
                } catch (e) {
                    console.error("[klh_Addition] resetStatsCandle post-hook error:", e);
                }
            };
            window.resetStatsCandle.__klhRebirthWrapped = true;
        }

        // 若目前正在城鎮畫面中，自動刷新地圖渲染 NPC
        try {
            if (typeof mapState !== 'undefined' && mapState.type === 'town' && typeof renderTownNPCs === 'function') {
                renderTownNPCs(mapState.current);
            }
        } catch (e) {}
    }

    // 註冊 DOM 載入與即時啟動
    function safeStartupGM2() {
        try {
            startupGM2();
        } catch (e) {
            console.error("[klh_Addition] startup error:", e);
        }
    }

    document.addEventListener('DOMContentLoaded', safeStartupGM2);
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
        safeStartupGM2();
    }

})();
