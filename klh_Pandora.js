/* ============================================================================
 * klh_Pandora.js — 潘朵拉的妹妹抽獎系統 (金幣抽獎)
 *
 * 設計原則: 完全不改原作者程式碼，只從外面「包住」全域函式 (monkey-patch)。
 * 掛接方式: 在 index.html 的 </body> 標籤正上方，插入以下外掛腳本：
 * * <script src="klh_Pandora.js?v=20260622"></script>
 *
 * 功能一覽:
 *   1. 抽獎權重初始化 —— 依物品售價自動分配加權機率 (傳說 1 / 稀有 10 / 一般 50~100)。
 *   2. 加權隨機抽取   —— 從全物品資料庫池中進行一次加權抽獎。
 *   3. 抽獎費用計算   —— 單抽固定 9,999 金幣，10 連抽 10 倍，100 連抽 100 倍。
 *   4. 抽獎 UI 渲染   —— 「潘朵拉的妹妹」NPC 對話視窗，含抽獎轉盤動畫、傳說大獎金光特效與全螢幕閃光。
 *   5. 單抽邏輯       —— 帶有圖示輪播動畫、傳說大獎廣播提示。
 *   6. 十連抽邏輯     —— 批次抽取、批次 DOM 更新，傳說大獎框線金色高光。
 *   7. 百連抽邏輯     —— 批次抽取、物品去重統計摘要，傳說大獎廣播。
 *   8. NPC 注入       —— 動態將「潘朵拉的妹妹」NPC 插入至所有含潘朵拉的城鎮，
 *                        並包裝 interactNPC 攔截對話事件。
 * ========================================================================== */

(function () {
    // 1. 初始化抽獎物品權重
    function initGachaWeights() {
        if (typeof DB === 'undefined' || !DB.items) return;

        // 調整係數 (方便未來微調，附上各稀有度平均基礎 W 值與平均最終權重)
        const multExtreme = 1;  // 極度稀有 (價格 > 100,000)：平均 W = 1.00，平均最終權重 = 1.00 * 1 = 1.00
        const multRare = 1;  // 稀有 (價格 > 30,000)：平均 W = 9.88，平均最終權重 = 9.88 * 1 = 9.88
        const multUncommon = 2;    // 罕見 (價格 > 10,000)：平均 W = 13.41，平均最終權重 = 13.41 * 2 = 26.82
        const multCommon = 3;    // 一般 (價格 > 1,000)：平均 W = 46.13，平均最終權重 = 46.13 * 3 = 138.39
        const multJunk = 4;   // 便宜貨 (價格 <= 1,000)：平均 W = 73.12，平均最終權重 = 73.12 * 4 = 292.48

        for (let id in DB.items) {
            let item = DB.items[id];
            if (!item) continue;

            // 任務道具、沒價格的物品，或已被主程式排除的商品 (權重 0)
            if (item.gachaWeight === 0 || !item.p || item.p <= 1 || (item.n && (item.n.includes("鑰匙") || item.n.includes("地圖")))) {
                item.gachaWeight = 0;
                continue;
            }

            // 取得目前已由 index.html 初始化好的權重值 (預設為 100)
            let w = item.gachaWeight !== undefined ? item.gachaWeight : 100;

            // 依照價格 (p) 乘上對應的調整係數
            if (item.p > 100000) {
                item.gachaWeight = w * multExtreme;     // 十萬以上極度稀有
            } else if (item.p > 30000) {
                item.gachaWeight = w * multRare;      // 三萬以上稀有
            } else if (item.p > 10000) {
                item.gachaWeight = w * multUncommon;   // 一萬以上罕見
            } else if (item.p > 1000) {
                item.gachaWeight = w * multCommon;     // 一千以上一般
            } else {
                item.gachaWeight = w * multJunk;      // 便宜貨超容易抽到
            }
        }
    }

    // 2. 根據權重隨機抽取一個物品 ID
    function getWeightedGachaResult() {
        let totalWeight = 0;
        let pool = [];

        // 建立抽獎池並計算總權重
        for (let id in DB.items) {
            let item = DB.items[id];
            if (!item) continue;
            let weight = item.gachaWeight !== undefined ? item.gachaWeight : 100;
            if (weight > 0) {
                totalWeight += weight;
                pool.push({ id: id, weight: weight });
            }
        }

        if (pool.length === 0) {
            return 'potion_heal'; // 保底防呆
        }

        // 抽出隨機數
        let rand = Math.random() * totalWeight;
        let currentWeight = 0;

        // 找出對應的物品
        for (let item of pool) {
            currentWeight += item.weight;
            if (rand <= currentWeight) {
                return item.id;
            }
        }
        return pool[pool.length - 1].id;
    }

    // 取得動態抽獎價格（單抽固定 9999 金幣，十抽 10 倍，百抽 100 倍且百連加收 10 倍魔力維持費）
    function getSisterGachaCost(mode) {
        let base = 9999;
        if (mode === 'single') return base;
        if (mode === 'ten') return base * 10;
        if (mode === 'hundred') return base * 1000;
        return base;
    }

    let gachaRolling = false;

    // 3. 渲染「潘朵拉的妹妹」專屬的黑市 UI
    window.renderPandoraSisterShop = function (div) {
        // 注入被 Tailwind 預編譯過濾掉的網格與尺寸樣式
        if (!document.getElementById('klh-gacha-custom-style')) {
            const style = document.createElement('style');
            style.id = 'klh-gacha-custom-style';
            style.textContent = `
                .grid-cols-5 {
                    grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
                }
                .grid-cols-10 {
                    grid-template-columns: repeat(10, minmax(0, 1fr)) !important;
                }
                /* 限制 Grid 容器總寬度以確保方格緊密相鄰，並水平居中 */
                #gacha-ten .grid {
                    width: 256px !important;
                    margin-left: auto !important;
                    margin-right: auto !important;
                }
                #gacha-hundred .grid {
                    width: 248px !important;
                    margin-left: auto !important;
                    margin-right: auto !important;
                }
                /* 寫死固定的正方形尺寸 */
                #gacha-ten .grid > div {
                    width: 48px !important;
                    height: 48px !important;
                    box-sizing: border-box !important;
                }
                #gacha-hundred .grid > div {
                    width: 23px !important;
                    height: 23px !important;
                    box-sizing: border-box !important;
                }
                .gacha10-icon, .gacha100-icon {
                    width: 100% !important;
                    height: 100% !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                }
                #gacha-ten .grid img,
                #gacha-hundred .grid img {
                    max-width: 100% !important;
                    max-height: 100% !important;
                    object-fit: contain !important;
                }
                /* 單抽外框放大，並對齊 */
                #gacha-display {
                    width: 180px !important;
                    height: 180px !important;
                }
                /* 單抽的問號與圖片同步放大，比例更協調 */
                #gacha-icon {
                    font-size: 72px !important;
                }
                #gacha-display img {
                    width: 130px !important;
                    height: 130px !important;
                    object-fit: contain !important;
                }
            `;
            document.head.appendChild(style);
        }
        if (!window._gachaMode) window._gachaMode = 'single';
        let mode = window._gachaMode;

        let cells = '';
        for (let k = 0; k < 10; k++) {
            cells += `<div class="bg-slate-900 border-2 border-purple-700 rounded-lg aspect-square overflow-hidden"><div class="gacha10-icon w-full h-full flex items-center justify-center text-xl" data-idx="${k}">❓</div></div>`;
        }

        let cells100 = '';
        for (let k = 0; k < 100; k++) {
            cells100 += `<div class="bg-slate-900 border border-purple-700 rounded aspect-square overflow-hidden"><div class="gacha100-icon w-full h-full flex items-center justify-center text-[10px]" data-idx="${k}">❓</div></div>`;
        }

        let costSingle = getSisterGachaCost('single');
        let costTen = getSisterGachaCost('ten');
        let costHundred = getSisterGachaCost('hundred');

        let warningHtml = `<p class="text-red-400 text-[10px] mb-0.5 text-center font-bold">⚠️ 召喚百次法陣將導致空間震盪，百連抽需加收 10 倍魔力維持費！</p>`;

        let html = `
        <div class="flex flex-col items-center justify-start h-full p-2 w-full">
            <h3 class="text-2xl font-bold text-purple-400 mb-0.5 drop-shadow-md">潘朵拉的妹妹</h3>
            ${warningHtml}
            <p class="text-slate-300 text-[11px] mb-0.5 text-center">金幣抽獎：單抽 <span class="text-yellow-400 font-bold">${costSingle.toLocaleString()}</span> / 十連 <span class="text-yellow-400 font-bold">${costTen.toLocaleString()}</span> / 百連 <span class="text-yellow-400 font-bold">${costHundred.toLocaleString()}</span></p>
            <p class="text-slate-400 text-[10px] mb-2 text-center">抽中裝備有 1% 機率帶有 祝福 詞綴！</p>

            <div class="flex gap-2 mb-2">
                <button id="gacha-tab-single" class="btn py-1 px-3 text-xs rounded-full ${mode === 'single' ? 'bg-purple-700 border-purple-500' : 'bg-slate-700 border-slate-600'}" onclick="setGachaMode('single')">單抽</button>
                <button id="gacha-tab-ten" class="btn py-1 px-3 text-xs rounded-full ${mode === 'ten' ? 'bg-purple-700 border-purple-500' : 'bg-slate-700 border-slate-600'}" onclick="setGachaMode('ten')">10 連抽</button>
                <button id="gacha-tab-hundred" class="btn py-1 px-3 text-xs rounded-full ${mode === 'hundred' ? 'bg-purple-700 border-purple-500' : 'bg-slate-700 border-slate-600'}" onclick="setGachaMode('hundred')">100 連抽</button>
            </div>

            <div id="gacha-single" class="${mode === 'single' ? '' : 'hidden'} flex flex-col items-center w-full">
                <div id="gacha-display" class="w-36 h-36 bg-slate-900 border-4 border-purple-700 rounded-xl shadow-[0_0_20px_rgba(126,34,206,0.6)] flex flex-col items-center justify-center mb-3 relative overflow-hidden">
                    <span class="text-5xl" id="gacha-icon">❓</span>
                    <div id="gacha-name" class="absolute bottom-0 w-full text-center text-xs font-bold text-white bg-black/80 px-1 py-1 hidden"></div>
                </div>
                <button id="btn-gacha" class="btn bg-purple-700 hover:bg-purple-600 border-purple-500 py-2 px-6 text-sm font-bold rounded-full shadow-[0_0_10px_rgba(126,34,206,0.5)] transition-all transform hover:scale-105" onclick="doSisterGacha()">
                    🎰 進行抽獎（${costSingle.toLocaleString()} 金幣）
                </button>
            </div>

            <div id="gacha-ten" class="${mode === 'ten' ? '' : 'hidden'} flex flex-col items-center w-full">
                <div class="grid grid-cols-5 gap-1 w-full max-w-[260px] mb-2">${cells}</div>
                <button id="btn-gacha10" class="btn bg-purple-700 hover:bg-purple-600 border-purple-500 py-2 px-6 text-sm font-bold rounded-full shadow-[0_0_10px_rgba(126,34,206,0.5)] transition-all transform hover:scale-105" onclick="doSisterGacha10()">
                    🎰 10 連抽（${costTen.toLocaleString()} 金幣）
                </button>
                <div id="gacha10-results" class="flex flex-wrap justify-center gap-x-2 gap-y-0.5 mt-2 text-xs"></div>
            </div>

            <div id="gacha-hundred" class="${mode === 'hundred' ? '' : 'hidden'} flex flex-col items-center w-full">
                <div class="grid grid-cols-10 gap-0.5 w-full max-w-[260px] mb-2">${cells100}</div>
                <button id="btn-gacha100" class="btn bg-purple-700 hover:bg-purple-600 border-purple-500 py-2 px-6 text-sm font-bold rounded-full shadow-[0_0_10px_rgba(126,34,206,0.5)] transition-all transform hover:scale-105" onclick="doSisterGacha100()">
                    🎰 100 連抽（${costHundred.toLocaleString()} 金幣）
                </button>
                <div id="gacha100-results" class="flex flex-wrap justify-center gap-x-2 gap-y-0.5 mt-2 text-xs max-h-20 overflow-y-auto"></div>
            </div>

            <p id="gacha-msg" class="text-yellow-300 mt-2 font-bold text-sm min-h-6 text-center"></p>
        </div>
        `;

        div.innerHTML = html;
    };

    // 4. 切換單抽 / 10連抽 / 100連抽
    window.setGachaMode = function (m) {
        if (gachaRolling) return;
        window._gachaMode = m;
        const sEl = document.getElementById('gacha-single');
        const tEl = document.getElementById('gacha-ten');
        const hEl = document.getElementById('gacha-hundred');
        const bS = document.getElementById('gacha-tab-single');
        const bT = document.getElementById('gacha-tab-ten');
        const bH = document.getElementById('gacha-tab-hundred');
        const msg = document.getElementById('gacha-msg');

        if (sEl) sEl.classList.toggle('hidden', m !== 'single');
        if (tEl) tEl.classList.toggle('hidden', m !== 'ten');
        if (hEl) hEl.classList.toggle('hidden', m !== 'hundred');
        if (bS) bS.className = `btn py-1 px-3 text-xs rounded-full ${m === 'single' ? 'bg-purple-700 border-purple-500' : 'bg-slate-700 border-slate-600'}`;
        if (bT) bT.className = `btn py-1 px-3 text-xs rounded-full ${m === 'ten' ? 'bg-purple-700 border-purple-500' : 'bg-slate-700 border-slate-600'}`;
        if (bH) bH.className = `btn py-1 px-3 text-xs rounded-full ${m === 'hundred' ? 'bg-purple-700 border-purple-500' : 'bg-slate-700 border-slate-600'}`;
        if (msg) msg.innerHTML = '';
    };

    // 5. 執行單抽邏輯（帶有轉盤動畫與特效）
    window.doSisterGacha = function () {
        if (gachaRolling) return;

        let cost = getSisterGachaCost('single');
        if (player.gold < cost) {
            const msg = document.getElementById('gacha-msg');
            if (msg) msg.innerHTML = `<span class="text-red-400">金幣不足！(需 ${cost.toLocaleString()} 金幣)</span>`;
            return;
        }
        player.gold -= cost;

        // 立即扣款、結算並存檔（防止玩家在動畫中關閉網頁產生吃檔 Bug）
        updateUI();

        let finalId = getWeightedGachaResult();
        let gainedItem = gainItem(finalId, 1, true, false, true); // 詞綴機率照舊
        if (!gainedItem) {
            gainedItem = { id: finalId, en: 0, bless: false, anc: false, attr: false, cnt: 1 };
        }
        saveGame();

        gachaRolling = true;
        let btn = document.getElementById('btn-gacha');
        if (btn) {
            btn.disabled = true;
            btn.classList.remove('hover:scale-105');
        }

        const gachaMsg = document.getElementById('gacha-msg');
        if (gachaMsg) gachaMsg.innerHTML = '<span class="text-slate-300">命運的齒輪開始轉動...</span>';

        const nameBox = document.getElementById('gacha-name');
        if (nameBox) nameBox.classList.add('hidden');

        // 重置外框為紫色
        let gachaBox = document.getElementById('gacha-display');
        if (gachaBox) {
            gachaBox.classList.remove('border-yellow-400', 'shadow-[0_0_60px_rgba(250,204,21,0.8)]', 'animate-pulse');
            gachaBox.classList.add('border-purple-700', 'shadow-[0_0_30px_rgba(126,34,206,0.6)]');
        }

        let displayIcon = document.getElementById('gacha-icon');
        let itemIds = Object.keys(DB.items);

        let rollCount = 0;
        let rollInterval = setInterval(() => {
            if (!displayIcon || !displayIcon.isConnected) {
                clearInterval(rollInterval);
                gachaRolling = false;
                return;
            }

            // 動畫期間：隨機展示圖片
            let randomTempId = itemIds[Math.floor(Math.random() * itemIds.length)];
            let tempImg = getIconUrl(DB.items[randomTempId]);
            displayIcon.innerHTML = `<img src="${tempImg}" onerror="this.src='https://placehold.co/100x100/1e293b/ffffff?text=?';" class="w-24 h-24 object-contain opacity-60">`;
            rollCount++;

            if (rollCount > 15) {
                clearInterval(rollInterval);

                let d = DB.items[gainedItem.id] || DB.items[finalId];
                let finalImg = getIconUrl(d);
                let glowClass = getGlowClass(null, d);
                let fullName = getItemFullName(gainedItem);
                let colorClass = getItemColor(gainedItem);

                if (nameBox) {
                    nameBox.innerHTML = `<span class="${colorClass}">${fullName}</span>`;
                    nameBox.classList.remove('hidden');
                }

                // 判斷是否為「傳說大獎」 (gachaWeight === 1)
                let isJackpot = (d && d.gachaWeight === 1);

                if (isJackpot) {
                    // 外框變為金色強光
                    if (gachaBox) {
                        gachaBox.classList.remove('border-purple-700', 'shadow-[0_0_30px_rgba(126,34,206,0.6)]');
                        gachaBox.classList.add('border-yellow-400', 'shadow-[0_0_60px_rgba(250,204,21,0.8)]', 'animate-pulse');
                    }

                    displayIcon.innerHTML = `<img src="${finalImg}" onerror="this.src='https://placehold.co/100x100/1e293b/ffffff?text=?';" class="w-32 h-32 object-contain ${glowClass} drop-shadow-[0_0_25px_rgba(255,255,255,1)] animate-bounce">`;

                    if (gachaMsg) {
                        gachaMsg.innerHTML = `🌟 <span class="text-yellow-300 font-extrabold text-2xl drop-shadow-[0_0_10px_rgba(253,224,71,0.8)]">傳說降臨！</span> 獲得 <span class="${colorClass} text-2xl font-bold">${fullName}</span>！🌟`;
                    }

                    // 全螢幕白光閃爍
                    let flash = document.createElement('div');
                    flash.className = 'fixed inset-0 bg-white z-50 pointer-events-none transition-opacity duration-1000 ease-out';
                    document.body.appendChild(flash);
                    void flash.offsetWidth;
                    flash.style.opacity = '0';
                    setTimeout(() => flash.remove(), 1000);

                    let brightJackpotName = `<span class="text-yellow-300 font-extrabold animate-pulse" style="color: #fffbeb; text-shadow: 0 0 8px #facc15, 0 0 15px #eab308, 0 0 30px #ca8a04; font-size: 1.15em; display: inline-block;">${fullName}</span>`;
                    logSys(`【系統廣播】一道金光劃破天際！玩家在抽獎中幸運抽中了傳說級的 ${brightJackpotName}！`);
                } else {
                    displayIcon.innerHTML = `<img src="${finalImg}" onerror="this.src='https://placehold.co/100x100/1e293b/ffffff?text=?';" class="w-28 h-28 object-contain ${glowClass} drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]">`;
                    if (gachaMsg) {
                        gachaMsg.innerHTML = `恭喜獲得 <span class="${colorClass} text-xl">${fullName}</span>！`;
                    }
                    logSys(`在潘朵拉的妹妹處花費 ${cost.toLocaleString()} 金幣，抽中了 <span class="${colorClass} font-bold">${fullName}</span>！`);
                }

                gachaRolling = false;
                if (btn) {
                    btn.disabled = false;
                    btn.classList.add('hover:scale-105');
                }
            }
        }, 80);
    };

    // 6. 執行十連抽邏輯
    window.doSisterGacha10 = function () {
        if (gachaRolling) return;

        let cost = getSisterGachaCost('ten');
        if (player.gold < cost) {
            const msg = document.getElementById('gacha-msg');
            if (msg) msg.innerHTML = `<span class="text-red-400">金幣不足！(需 ${cost.toLocaleString()} 金幣)</span>`;
            return;
        }
        player.gold -= cost;

        updateUI();

        // 暫時備份並屏蔽高耗能的 DOM/數值更新，改為最後單次批次更新
        const origRenderTabs = window.renderTabs;
        const origCalcStats = window.calcStats;
        const origRenderSkillSelects = window.renderSkillSelects;

        window.renderTabs = () => { };
        window.calcStats = () => { };
        window.renderSkillSelects = () => { };

        let results = [];
        try {
            for (let k = 0; k < 10; k++) {
                let fid = getWeightedGachaResult();
                let gi = gainItem(fid, 1, true, false, true);
                if (!gi) gi = { id: fid, en: 0, bless: false, anc: false, attr: false, cnt: 1 };
                results.push(gi);
            }
        } finally {
            // 還原函式
            window.renderTabs = origRenderTabs;
            window.calcStats = origCalcStats;
            window.renderSkillSelects = origRenderSkillSelects;
        }

        // 單次批次更新
        if (typeof window.calcStats === 'function') window.calcStats();
        if (typeof window.renderSkillSelects === 'function') window.renderSkillSelects();
        if (typeof window.renderTabs === 'function') window.renderTabs(true);
        saveGame();

        gachaRolling = true;
        let btn = document.getElementById('btn-gacha10');
        if (btn) {
            btn.disabled = true;
            btn.classList.remove('hover:scale-105');
        }

        const gachaMsg = document.getElementById('gacha-msg');
        if (gachaMsg) gachaMsg.innerHTML = '<span class="text-slate-300">命運的齒輪開始轉動...</span>';

        const resultsEl = document.getElementById('gacha10-results');
        if (resultsEl) resultsEl.innerHTML = '';

        let iconEls = Array.from(document.querySelectorAll('.gacha10-icon'));
        iconEls.forEach(el => {
            let cell = el.parentElement;
            if (cell) {
                cell.classList.remove('border-yellow-400', 'animate-pulse');
                cell.classList.add('border-purple-700');
            }
        });

        let itemIds = Object.keys(DB.items);
        let rollCount = 0;
        let rollInterval = setInterval(() => {
            if (!iconEls.length || !iconEls[0].isConnected) {
                clearInterval(rollInterval);
                gachaRolling = false;
                return;
            }

            iconEls.forEach(el => {
                let rid = itemIds[Math.floor(Math.random() * itemIds.length)];
                let img = getIconUrl(DB.items[rid]);
                el.innerHTML = `<img src="${img}" onerror="this.src='https://placehold.co/100x100/1e293b/ffffff?text=?';" class="w-full h-full object-contain opacity-60">`;
            });
            rollCount++;

            if (rollCount > 15) {
                clearInterval(rollInterval);

                let jackpotNames = [];
                results.forEach((gi, k) => {
                    let d = DB.items[gi.id];
                    let img = getIconUrl(d);
                    let glow = getGlowClass(null, d);
                    let el = iconEls[k];
                    if (!el) return;
                    el.innerHTML = `<img src="${img}" onerror="this.src='https://placehold.co/100x100/1e293b/ffffff?text=?';" class="w-full h-full object-contain ${glow}">`;

                    if (d && d.gachaWeight === 1) {
                        let cell = el.parentElement;
                        if (cell) {
                            cell.classList.remove('border-purple-700');
                            cell.classList.add('border-yellow-400', 'animate-pulse');
                        }
                        let brightJackpotName = `<span class="text-yellow-300 font-extrabold animate-pulse" style="color: #fffbeb; text-shadow: 0 0 8px #facc15, 0 0 15px #eab308, 0 0 30px #ca8a04; font-size: 1.15em; display: inline-block;">${getItemFullName(gi)}</span>`;
                        jackpotNames.push(brightJackpotName);
                    }
                });

                if (resultsEl) {
                    resultsEl.innerHTML = results.map(gi => `<span class="${getItemColor(gi)}">${getItemFullName(gi)}</span>`).join('、');
                }

                let itemsList = results.map(gi => `<span class="${getItemColor(gi)} font-bold">${getItemFullName(gi)}</span>`).join('、');

                if (jackpotNames.length > 0) {
                    if (gachaMsg) {
                        gachaMsg.innerHTML = `🌟 <span class="text-yellow-300 font-extrabold text-xl drop-shadow-[0_0_10px_rgba(253,224,71,0.8)]">傳說降臨！</span> 本次 10 連抽出 ${jackpotNames.length} 件傳說！<br>`
                            + `<div class="text-base font-bold text-yellow-300 mt-1.5 animate-pulse">🎉 幸運獲得：${jackpotNames.join('、')}</div>`
                            + `<div class="text-sm font-normal mt-2 leading-relaxed">獲得物品：<br>${itemsList}</div>`;
                    }

                    let flash = document.createElement('div');
                    flash.className = 'fixed inset-0 bg-white z-50 pointer-events-none transition-opacity duration-1000 ease-out';
                    document.body.appendChild(flash);
                    void flash.offsetWidth;
                    flash.style.opacity = '0';
                    setTimeout(() => flash.remove(), 1000);

                    jackpotNames.forEach(nm => logSys(`【系統廣播】一道金光劃破天際！玩家在十連抽中幸運抽中了傳說級的 ${nm}！`));
                } else {
                    if (gachaMsg) {
                        gachaMsg.innerHTML = `恭喜完成 10 連抽，獲得 10 件物品！<br><div class="text-sm font-normal mt-2 leading-relaxed">獲得物品：<br>${itemsList}</div>`;
                    }
                }
                logSys(`在潘朵拉的妹妹處花費 ${cost.toLocaleString()} 金幣進行 10 連抽，獲得：${results.map(gi => `<span class="${getItemColor(gi)} font-bold">${getItemFullName(gi)}</span>`).join('、')}。`);

                gachaRolling = false;
                if (btn) {
                    btn.disabled = false;
                    btn.classList.add('hover:scale-105');
                }
            }
        }, 80);
    };

    // 6.5 執行百連抽邏輯
    window.doSisterGacha100 = function () {
        if (gachaRolling) return;

        let cost = getSisterGachaCost('hundred');
        if (player.gold < cost) {
            const msg = document.getElementById('gacha-msg');
            if (msg) msg.innerHTML = `<span class="text-red-400">金幣不足！(需 ${cost.toLocaleString()} 金幣)</span>`;
            return;
        }
        player.gold -= cost;

        updateUI();

        // 暫時備份並屏蔽高耗能的 DOM/數值更新，改為最後單次批次更新
        const origRenderTabs = window.renderTabs;
        const origCalcStats = window.calcStats;
        const origRenderSkillSelects = window.renderSkillSelects;

        window.renderTabs = () => { };
        window.calcStats = () => { };
        window.renderSkillSelects = () => { };

        let results = [];
        try {
            for (let k = 0; k < 100; k++) {
                let fid = getWeightedGachaResult();
                let gi = gainItem(fid, 1, true, false, true);
                if (!gi) gi = { id: fid, en: 0, bless: false, anc: false, attr: false, cnt: 1 };
                results.push(gi);
            }
        } finally {
            // 還原函式
            window.renderTabs = origRenderTabs;
            window.calcStats = origCalcStats;
            window.renderSkillSelects = origRenderSkillSelects;
        }

        // 單次批次更新
        if (typeof window.calcStats === 'function') window.calcStats();
        if (typeof window.renderSkillSelects === 'function') window.renderSkillSelects();
        if (typeof window.renderTabs === 'function') window.renderTabs(true);
        saveGame();

        gachaRolling = true;
        let btn = document.getElementById('btn-gacha100');
        if (btn) {
            btn.disabled = true;
            btn.classList.remove('hover:scale-105');
        }

        const gachaMsg = document.getElementById('gacha-msg');
        if (gachaMsg) gachaMsg.innerHTML = '<span class="text-slate-300">命運的齒輪開始轉動...</span>';

        const resultsEl = document.getElementById('gacha100-results');
        if (resultsEl) resultsEl.innerHTML = '';

        let iconEls = Array.from(document.querySelectorAll('.gacha100-icon'));
        iconEls.forEach(el => {
            let cell = el.parentElement;
            if (cell) {
                cell.classList.remove('border-yellow-400', 'animate-pulse');
                cell.classList.add('border-purple-700');
            }
        });

        let itemIds = Object.keys(DB.items);
        let rollCount = 0;
        let rollInterval = setInterval(() => {
            if (!iconEls.length || !iconEls[0].isConnected) {
                clearInterval(rollInterval);
                gachaRolling = false;
                return;
            }

            iconEls.forEach(el => {
                let rid = itemIds[Math.floor(Math.random() * itemIds.length)];
                let img = getIconUrl(DB.items[rid]);
                el.innerHTML = `<img src="${img}" onerror="this.src='https://placehold.co/100x100/1e293b/ffffff?text=?';" class="w-full h-full object-contain opacity-60">`;
            });
            rollCount++;

            if (rollCount > 15) {
                clearInterval(rollInterval);

                let jackpotNames = [];
                results.forEach((gi, k) => {
                    let d = DB.items[gi.id];
                    let img = getIconUrl(d);
                    let glow = getGlowClass(null, d);
                    let el = iconEls[k];
                    if (!el) return;
                    el.innerHTML = `<img src="${img}" onerror="this.src='https://placehold.co/100x100/1e293b/ffffff?text=?';" class="w-full h-full object-contain ${glow}">`;

                    if (d && d.gachaWeight === 1) {
                        let cell = el.parentElement;
                        if (cell) {
                            cell.classList.remove('border-purple-700');
                            cell.classList.add('border-yellow-400', 'animate-pulse');
                        }
                        let brightJackpotName = `<span class="text-yellow-300 font-extrabold animate-pulse" style="color: #fffbeb; text-shadow: 0 0 8px #facc15, 0 0 15px #eab308, 0 0 30px #ca8a04; font-size: 1.15em; display: inline-block;">${getItemFullName(gi)}</span>`;
                        jackpotNames.push(brightJackpotName);
                    }
                });

                if (resultsEl) {
                    resultsEl.innerHTML = results.map(gi => `<span class="${getItemColor(gi)}">${getItemFullName(gi)}</span>`).join('、');
                }

                // Summarize findings for clean display in gachaMsg
                let itemSummary = {};
                results.forEach(gi => {
                    let name = getItemFullName(gi);
                    let color = getItemColor(gi);
                    let key = `${color}||${name}`;
                    itemSummary[key] = (itemSummary[key] || 0) + 1;
                });

                let summaryList = Object.keys(itemSummary).map(k => {
                    let [color, name] = k.split('||');
                    return `<span class="${color} font-bold">${name}</span> x${itemSummary[k]}`;
                }).join('、');

                if (jackpotNames.length > 0) {
                    if (gachaMsg) {
                        gachaMsg.innerHTML = `🌟 <span class="text-yellow-300 font-extrabold text-xl drop-shadow-[0_0_10px_rgba(253,224,71,0.8)]">傳說降臨！</span> 本次 100 連抽出 ${jackpotNames.length} 件傳說！<br>`
                            + `<div class="text-base font-bold text-yellow-300 mt-1.5 animate-pulse">🎉 幸運獲得：${jackpotNames.join('、')}</div>`
                            + `<div class="text-sm font-normal mt-2 leading-relaxed">獲得物品：<br>${summaryList}</div>`;
                    }

                    let flash = document.createElement('div');
                    flash.className = 'fixed inset-0 bg-white z-50 pointer-events-none transition-opacity duration-1000 ease-out';
                    document.body.appendChild(flash);
                    void flash.offsetWidth;
                    flash.style.opacity = '0';
                    setTimeout(() => flash.remove(), 1000);

                    jackpotNames.forEach(nm => logSys(`【系統廣播】一道金光劃破天際！玩家在百連抽中幸運抽中了傳說級的 ${nm}！`));
                } else {
                    if (gachaMsg) {
                        gachaMsg.innerHTML = `恭喜完成 100 連抽，獲得 100 件物品！<br><div class="text-sm font-normal mt-2 leading-relaxed">獲得物品：<br>${summaryList}</div>`;
                    }
                }
                logSys(`在潘朵拉的妹妹處花費 ${cost.toLocaleString()} 金幣進行 100 連抽，獲得：${summaryList}。`);

                gachaRolling = false;
                if (btn) {
                    btn.disabled = false;
                    btn.classList.add('hover:scale-105');
                }
            }
        }, 80);
    };

    // 7. GM 模組初始化與注入
    function startupGM() {
        initGachaWeights();

        // 動態將「潘朵拉的妹妹」限定注入至說話之島 (town_talking)
        if (typeof DB !== 'undefined' && DB.towns) {
            for (let townId in DB.towns) {
                let town = DB.towns[townId];
                if (town.npcs) {
                    town.npcs = town.npcs.filter(n => n.id !== 'npc_pandora_sister');
                    if (townId === 'town_talking') {
                        let pandoraIdx = town.npcs.findIndex(n => n.id === 'npc_pandora');
                        let insertPos = pandoraIdx !== -1 ? pandoraIdx + 1 : town.npcs.length;
                        town.npcs.splice(insertPos, 0, {
                            id: "npc_pandora_sister",
                            n: "潘朵拉的妹妹",
                            title: "白商",
                            type: "shop",
                            d: "提供金幣隨機抽獎。"
                        });
                    }
                }
            }
        }

        // 包裝與攔截 interactNPC
        if (typeof window.interactNPC === 'function' && !window.interactNPC.__klhGMWrapped) {
            const originalInteractNPC = window.interactNPC;
            window.interactNPC = function (npcId, townId) {
                if (npcId === 'npc_pandora_sister') {
                    // 執行原版 interactNPC 載入基本的 NPC 標題與對話面板
                    originalInteractNPC(npcId, townId);

                    let contentDiv = document.getElementById('interaction-content');
                    if (contentDiv) {
                        renderPandoraSisterShop(contentDiv);
                    }
                } else {
                    originalInteractNPC(npcId, townId);
                }
            };
            window.interactNPC.__klhGMWrapped = true;
        }

        // 若目前正在城鎮畫面中，自動刷新地圖渲染 NPC
        try {
            if (typeof mapState !== 'undefined' && mapState.type === 'town' && typeof renderTownNPCs === 'function') {
                renderTownNPCs(mapState.current);
            }
        } catch (e) {}
    }

    document.addEventListener('DOMContentLoaded', startupGM);
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
        startupGM();
    }
})();
