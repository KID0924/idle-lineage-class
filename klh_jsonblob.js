/* ============================================================================
 * klh_jsonblob_cloud.js — 雲端存檔與難度自訂功能
 *
 * 設計原則: 完全不改原作者程式碼，只從外面「包住」全域函式 (monkey-patch)。
 * 掛接方式: 在 index.html 的 </body> 標籤正上方，插入以下外掛腳本：
 * * <script src="klh_jsonblob_cloud.js?v=20260616"></script>
 * ========================================================================== */

(function () {
    // ==========================================
    // 0. 全域常數與設定
    // ==========================================
    window.DEFAULT_CLOUD_URL = "https://api.jsonblob.com/api/jsonBlob";

    // 初始化金鑰：優先讀取 lineage_idle_jsonblob_url，若無則嘗試新版的 klh_jsonblob_key，最後回退至預設公用金鑰
    let initialKey = localStorage.getItem('lineage_idle_jsonblob_url');
    if (!initialKey) {
        initialKey = localStorage.getItem('klh_jsonblob_key');
        if (initialKey) {
            // 自動遷移到舊的（原裝）金鑰欄位中
            localStorage.setItem('lineage_idle_jsonblob_url', initialKey);
            localStorage.removeItem('klh_jsonblob_key'); // 刪除多餘的新金鑰欄位
        }
    }
    window.activeKey = initialKey || "019ebb1f-b31c-769f-8475-02be610a13b0";
    window.gameDifficulty = 'standard';
    window._slotMode = 'new';

    // 取得乾淨正規化後的雲端存檔 URL
    function getCleanCloudUrl(key) {
        key = (key || "").trim();
        if (!key) key = "019ebb1f-b31c-769f-8475-02be610a13b0";

        // 如果是完整的 URL 且包含 jsonblob.com
        if (key.startsWith("http://") || key.startsWith("https://")) {
            if (key.includes("jsonblob.com")) {
                const parts = key.split('/');
                const id = parts[parts.length - 1];
                if (id) {
                    return `${window.DEFAULT_CLOUD_URL}/${id}`;
                }
            }
            // 對於非 jsonblob 的自訂 URL，直接使用
            // 但如果包含了 jsonblob.com，將它替換成 api 子網域以開啟 CORS 存取
            let url = key;
            if (url.includes("://jsonblob.com")) {
                url = url.replace("://jsonblob.com", "://api.jsonblob.com");
            }
            return url;
        }

        // 如果只是 UUID，拼裝預設網址
        return `${window.DEFAULT_CLOUD_URL}/${key}`;
    }

    window.DIFFICULTY_SETTINGS = {
        hell: { name: "地獄", mobPower: 3.0, dropRate: 3.0, goldRate: 3.0, potionRate: 0.8, noSunDelay: 1, sunDelay: 1 },
        nightmare: { name: "惡夢", mobPower: 1.5, dropRate: 1.5, goldRate: 1.5, potionRate: 0.9, noSunDelay: 10, sunDelay: 3 },
        standard: { name: "標準", mobPower: 1.0, dropRate: 1.0, goldRate: 1.0, potionRate: 1.0, noSunDelay: 50, sunDelay: 10 },
        blessing: { name: "祝福", mobPower: 0.9, dropRate: 1.5, goldRate: 1.5, potionRate: 1.0, noSunDelay: 10, sunDelay: 3 },
        heaven: { name: "天堂", mobPower: 0.8, dropRate: 2.0, goldRate: 2.0, potionRate: 2.0, noSunDelay: 10, sunDelay: 1 }
    };

    const PRIVILEGED_KEYS = [
        "019ebb3a-ad04-76f1-81df-d15d7b2d03d0", // 4. 天后海拉
        "019ebb3a-e777-7ab7-b744-aaab13066231"  // 5. 天神宙斯
    ];

    function checkIsPrivileged() {
        const normalized = (window.activeKey || "").trim().toLowerCase();
        return PRIVILEGED_KEYS.some(k => k.toLowerCase() === normalized);
    }

    // 注入 CSS 樣式
    const styleEl = document.createElement('style');
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
        
        /* Toast 訊息框樣式 */
        .klh-toast-container {
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 10000;
            display: flex;
            flex-direction: column;
            gap: 8px;
            pointer-events: none;
            width: 90%;
            max-width: 380px;
        }
        .klh-toast {
            padding: 10px 16px;
            border-radius: 8px;
            background: rgba(15, 23, 42, 0.95);
            border: 1px solid rgba(234, 179, 8, 0.4);
            color: #f8fafc;
            font-size: 13px;
            font-weight: bold;
            text-align: center;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -2px rgba(0, 0, 0, 0.5);
            opacity: 0;
            transform: translateY(-20px);
            transition: opacity 0.3s ease, transform 0.3s ease;
            pointer-events: auto;
        }
        .klh-toast.show {
            opacity: 1;
            transform: translateY(0);
        }
        .klh-toast.info {
            border-color: rgba(56, 189, 248, 0.6);
            color: #e0f2fe;
        }
        .klh-toast.success {
            border-color: rgba(74, 222, 128, 0.6);
            color: #f0fdf4;
        }
        .klh-toast.error {
            border-color: rgba(239, 68, 68, 0.6);
            color: #fef2f2;
        }

        /* 載入遮罩樣式 (防呆與讀取進度條) */
        .klh-loading-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(15, 23, 42, 0.85);
            backdrop-filter: blur(5px);
            z-index: 9999;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 20px;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.3s ease;
        }
        .klh-loading-overlay.show {
            opacity: 1;
            pointer-events: auto;
        }
        .klh-loading-spinner {
            width: 54px;
            height: 54px;
            border: 4px solid rgba(234, 179, 8, 0.1);
            border-top: 4px solid #fbbf24;
            border-radius: 50%;
            animation: klh-spin 1s linear infinite;
        }
        @keyframes klh-spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .klh-loading-bar-container {
            width: 260px;
            height: 8px;
            background: rgba(51, 65, 85, 0.6);
            border-radius: 999px;
            overflow: hidden;
            border: 1px solid rgba(255,255,255,0.05);
            box-shadow: inset 0 2px 4px rgba(0,0,0,0.5);
        }
        .klh-loading-bar-fill {
            height: 100%;
            width: 0%;
            background: linear-gradient(90deg, #d97706, #fbbf24);
            box-shadow: 0 0 10px rgba(251, 191, 36, 0.6);
            border-radius: 999px;
            transition: width 0.2s ease-out;
        }
        .klh-loading-text {
            color: #fbbf24;
            font-size: 15px;
            font-weight: bold;
            text-shadow: 0 2px 4px rgba(0,0,0,0.6);
            letter-spacing: 1px;
        }
    `;
    document.head.appendChild(styleEl);

    // Toast 訊息提示函式
    window.showToast = function (message, type = 'info') {
        let container = document.querySelector('.klh-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'klh-toast-container';
            document.body.appendChild(container);
        }
        const toast = document.createElement('div');
        toast.className = `klh-toast ${type}`;
        toast.innerText = message;
        container.appendChild(toast);

        // 觸發動畫
        setTimeout(() => toast.classList.add('show'), 10);

        // 3 秒後自動淡出並移除
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    };

    // 載入與防呆進度條邏輯
    let loadingTimer = null;
    let loadingProgress = 0;

    window.showLoadingOverlay = function (message) {
        let overlay = document.querySelector('.klh-loading-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'klh-loading-overlay';
            overlay.innerHTML = `
                <div class="klh-loading-spinner"></div>
                <div class="klh-loading-text"></div>
                <div class="klh-loading-bar-container">
                    <div class="klh-loading-bar-fill"></div>
                </div>
            `;
            document.body.appendChild(overlay);
        }
        overlay.querySelector('.klh-loading-text').innerText = message;
        const fillEl = overlay.querySelector('.klh-loading-bar-fill');
        fillEl.style.width = '0%';
        loadingProgress = 0;

        if (loadingTimer) clearInterval(loadingTimer);

        // 顯示遮罩
        overlay.classList.add('show');

        // 模擬進度條增長：前幾秒快速上升到 50%，接著緩慢逼近 95% 進行防呆等待
        loadingTimer = setInterval(() => {
            if (loadingProgress < 50) {
                loadingProgress += 5 + Math.random() * 5;
            } else if (loadingProgress < 95) {
                loadingProgress += (95 - loadingProgress) * 0.1;
            }
            fillEl.style.width = `${Math.min(95, loadingProgress)}%`;
        }, 100);
    };

    window.hideLoadingOverlay = function () {
        if (loadingTimer) {
            clearInterval(loadingTimer);
            loadingTimer = null;
        }
        const overlay = document.querySelector('.klh-loading-overlay');
        if (overlay) {
            const fillEl = overlay.querySelector('.klh-loading-bar-fill');
            if (fillEl) {
                fillEl.style.width = '100%';
            }
            // 讓使用者看見 100% 進度條完成的視覺回饋後再關閉
            setTimeout(() => {
                overlay.classList.remove('show');
            }, 300);
        }
    };


    // ==========================================
    // 1. 雲端存檔自訂 (JSONBlob Cloud Save)
    // ==========================================

    // 帶有自動備份/備用代理的 CORS 請求封裝（防 Adblock 或代理伺服器斷線）
    async function fetchWithProxy(targetUrl, options = {}) {
        const method = options.method || 'GET';

        // 1. 優先嘗試直接發送請求（不分本機伺服器或 file:///，一律嘗試直接連線）
        try {
            console.log(`[JSONBlob] 嘗試直接進行 ${method} 請求...`);
            const res = await fetch(targetUrl, options);
            if (res.ok) {
                console.log(`[JSONBlob] 直接 ${method} 請求成功！`);
                res.connectionMethod = "直接連線";
                return res;
            }
            console.warn(`[JSONBlob] 直接 ${method} 請求回傳非成功狀態碼:`, res.status);
        } catch (err) {
            console.warn(`[JSONBlob] 直接 ${method} 請求失敗，嘗試使用自訂代理伺服器...`, err);
        }

        // 2. 當直接請求失敗時，嘗試使用主要代理伺服器
        const customProxy = localStorage.getItem('klh_custom_proxy') || "https://fragrant-glade-bab3.dreammy0924.workers.dev/";
        if (customProxy.trim()) {
            let p = customProxy.trim();
            if (!p.endsWith('/')) p += '/';
            const proxyUrl = p + targetUrl;
            const fetchOptions = method === 'PUT' ? { ...options, mode: 'cors' } : options;
            try {
                console.log(`[JSONBlob] 嘗試使用主要代理 ${method}: ${proxyUrl}`);
                const res = await fetch(proxyUrl, fetchOptions);
                if (res.status === 200 || res.status === 201 || res.ok) {
                    console.log(`[JSONBlob] 透過主要代理讀寫成功！`);
                    res.connectionMethod = "主要代理";
                    return res;
                }
                console.warn(`[JSONBlob] 主要代理回傳狀態碼 ${res.status}: ${proxyUrl}`);
            } catch (err) {
                console.warn(`[JSONBlob] 主要代理失敗: ${proxyUrl}`, err);
            }
        }

        throw new Error(`CORS proxy and direct connection failed for ${method}.`);
    }

    window.saveJsonBlobConfig = function (key) {
        key = (key || "").trim();
        if (!key) key = "019ebb1f-b31c-769f-8475-02be610a13b0";
        window.activeKey = key;
        localStorage.setItem('lineage_idle_jsonblob_url', key);

        const inputEl = document.getElementById('jsonblob-input');
        if (inputEl) inputEl.value = key;
    };

    window.clearJsonBlobConfig = function () {
        window.saveJsonBlobConfig("019ebb1f-b31c-769f-8475-02be610a13b0");
    };

    // 異步上傳至雲端
    window.uploadToCloud = async function (isManual = false) {
        const targetUrl = getCleanCloudUrl(window.activeKey);
        const payload = {
            save_1: localStorage.getItem('lineage_idle_save_1'),
            save_2: localStorage.getItem('lineage_idle_save_2'),
            save_3: localStorage.getItem('lineage_idle_save_3'),
            save_4: localStorage.getItem('lineage_idle_save_4'),
            warehouse: localStorage.getItem('lineage_idle_warehouse')
        };

        if (isManual) {
            window.showLoadingOverlay('正在上傳雲端存檔中...');
        }

        try {
            const res = await fetchWithProxy(targetUrl, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                if (isManual) {
                    window.showToast('成功將本機進度上傳至雲端！(管道：' + (res.connectionMethod || '直接連線') + ')', 'success');
                }
            } else {
                console.error('Failed to sync to cloud. Status:', res.status);
                if (isManual) {
                    window.showToast('上傳雲端存檔失敗，狀態碼：' + res.status, 'error');
                }
            }
        } catch (err) {
            console.error('Error syncing to cloud:', err);
            if (isManual) {
                window.showToast('上傳雲端存檔失敗，請檢查網路連線。', 'error');
            }
        } finally {
            if (isManual) {
                window.hideLoadingOverlay();
            }
        }
    };

    // 異步自雲端讀取並同步本機
    // 異步自雲端讀取並同步本機
    window.syncFromCloud = async function (isManual) {
        const targetUrl = getCleanCloudUrl(window.activeKey);

        // 顯示讀取與防呆進度條遮罩 (僅在手動操作時顯示，避免網頁載入時阻擋使用者)
        if (isManual) {
            window.showLoadingOverlay('正在讀取雲端存檔中...');
        }

        try {
            const res = await fetchWithProxy(targetUrl);
            if (res.status === 200) {
                const payload = await res.json();
                if (payload) {
                    ['1', '2', '3', '4'].forEach(n => {
                        const val = payload['save_' + n] || payload['lineage_idle_save_' + n];
                        if (val !== undefined && val !== null) {
                            const strVal = (typeof val === 'object') ? JSON.stringify(val) : val;
                            localStorage.setItem('lineage_idle_save_' + n, strVal);
                        } else {
                            localStorage.removeItem('lineage_idle_save_' + n);
                        }
                    });

                    // 支援舊版 lineage_idle_warehouse 的相容性，避免移轉時清空倉庫
                    const warehouseVal = payload.warehouse || payload.lineage_idle_warehouse;
                    if (warehouseVal !== undefined && warehouseVal !== null) {
                        const strVal = (typeof warehouseVal === 'object') ? JSON.stringify(warehouseVal) : warehouseVal;
                        localStorage.setItem('lineage_idle_warehouse', strVal);
                    } else {
                        localStorage.removeItem('lineage_idle_warehouse');
                    }

                    checkAndPrepopulateSlots();
                    if (isManual) window.showToast('雲端存檔讀取並同步本機成功！(管道：' + (res.connectionMethod || '未知') + ')', 'success');

                    refreshLoadBtnVisibility();

                    // 如果當前使用者已經停留在選檔畫面，則自動刷新以呈現最新自雲端同步下來的存檔
                    const slotSelectPanel = document.getElementById('slot-select-panel');
                    if (slotSelectPanel && !slotSelectPanel.classList.contains('hidden')) {
                        if (typeof openSlotSelect === 'function') {
                            openSlotSelect(window._slotMode || 'load');
                        }
                    }
                }
            } else if (res.status === 404) {
                if (isManual) window.showToast('此金鑰在雲端無存檔，已自動以本機資料初始化雲端。', 'info');
                await window.uploadToCloud(isManual);
            } else {
                if (isManual) window.showToast('讀取雲端存檔失敗，狀態碼：' + res.status, 'error');
            }
        } catch (err) {
            console.error(err);
            if (isManual) window.showToast('讀取雲端存檔失敗，請檢查網路連線。', 'error');
        } finally {
            // 隱藏讀取遮罩
            if (isManual) {
                window.hideLoadingOverlay();
            }
        }
    };

    function refreshLoadBtnVisibility() {
        const btnLoad = document.getElementById('btn-load');
        if (btnLoad) {
            if (anySaveExists()) btnLoad.classList.remove('hidden');
            else btnLoad.classList.add('hidden');
        }
    }


    window.handleCloudSaveReadClick = async function () {
        const inputEl = document.getElementById('jsonblob-input');
        if (inputEl) {
            let key = inputEl.value.trim();
            window.saveJsonBlobConfig(key);
            await window.syncFromCloud(true);
        }
    };

    window.handleCloudSaveWriteClick = async function () {
        const inputEl = document.getElementById('jsonblob-input');
        if (inputEl) {
            let key = inputEl.value.trim();
            window.saveJsonBlobConfig(key);
            await window.uploadToCloud(true);
        }
    };

    window.handleCloudResetClick = async function () {
        window.clearJsonBlobConfig();
        await window.syncFromCloud(true);
    };

    window.clearAllCloudData = window.clearAllSaves;

    window.handleFastKeyClick = async function (btn) {
        const key = btn.getAttribute('data-key');
        window.saveJsonBlobConfig(key);
        await window.syncFromCloud(true);
    };

    // 注入雲端存檔 UI 至主畫面
    function initCloudSaveUI() {
        const mainMenu = document.getElementById('main-menu');
        if (!mainMenu) return;
        if (document.getElementById('cloud-save-container')) return;

        const container = document.createElement('div');
        container.id = 'cloud-save-container';
        container.className = 'w-80 flex flex-col gap-3 mt-6 p-4 rounded-xl border border-slate-700 bg-slate-900/40 text-center';
        container.innerHTML = `
            <div class="text-sm font-bold text-yellow-500">雲端存檔同步 (JSONBlob)</div>
            <input id="jsonblob-input" type="text" class="w-full bg-slate-950 border border-slate-700 text-white rounded px-3 py-1.5 text-xs text-center focus:outline-none focus:border-yellow-500">
            <div class="w-full">
                <button onclick="handleCloudSaveReadClick()" class="btn w-full py-2 text-xs bg-indigo-700 hover:bg-indigo-600 border-indigo-500 font-bold">讀取雲端</button>
            </div>
            <div class="text-[10px] text-slate-400 font-bold mt-1">快速切換公用金鑰：</div>
            <div class="flex flex-col gap-1.5 text-xs">
                <button onclick="handleFastKeyClick(this)" class="btn py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-amber-300 font-normal" data-key="019ebb1f-b31c-769f-8475-02be610a13b0">1. 阿波羅 (預設/太陽神)</button>
                <button onclick="handleFastKeyClick(this)" class="btn py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-orange-300 font-normal" data-key="019ebb3a-0d11-7569-a341-463d28054478">2. 赫發斯特斯 (火神)</button>
                <button onclick="handleFastKeyClick(this)" class="btn py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-green-300 font-normal" data-key="019ebb3a-58de-78fd-8139-eca46c089de3">3. 雅典那 (勝利女神)</button>
                <button onclick="handleFastKeyClick(this)" class="btn py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-rose-300 font-normal" data-key="019ebb3a-ad04-76f1-81df-d15d7b2d03d0">4. 海拉 (天后) 🔒固定</button>
                <button onclick="handleFastKeyClick(this)" class="btn py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-cyan-300 font-normal" data-key="019ebb3a-e777-7ab7-b744-aaab13066231">5. 宙斯 (天神) 🔒固定</button>
            </div>
        `;
        mainMenu.appendChild(container);

        const inputEl = document.getElementById('jsonblob-input');
        inputEl.placeholder = '019ebb1f-b31c-769f-8475-02be610a13b0';
        inputEl.value = window.activeKey;
    }

    // 攔截 saveGame() / saveWarehouse() / loadGame() / slotSummary()
    const originalSaveGame = window.saveGame;
    window.saveGame = async function () {
        if (player && player.dead) return;
        originalSaveGame();

        let s = localStorage.getItem('lineage_idle_save_' + currentSlot);
        if (s) {
            try {
                let d = JSON.parse(s);
                d.difficulty = window.gameDifficulty;
                localStorage.setItem('lineage_idle_save_' + currentSlot, JSON.stringify(d));
            } catch (e) { }
        }
        return await window.uploadToCloud();
    };

    const originalSaveWarehouse = window.saveWarehouse;
    window.saveWarehouse = async function (w) {
        originalSaveWarehouse(w);
        return await window.uploadToCloud();
    };

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
        originalLoadGame();

        // 載入完成後，立刻將最新的最終決定難度同步寫回 LocalStorage 以便保存
        let s = localStorage.getItem('lineage_idle_save_' + currentSlot);
        if (s) {
            try {
                let d = JSON.parse(s);
                d.difficulty = window.gameDifficulty;
                localStorage.setItem('lineage_idle_save_' + currentSlot, JSON.stringify(d));
            } catch (e) { }
        }

        updateDifficultyDisplay();
    };

    // 重新實作 slotSummary，讀取難度欄位並整合於摘要
    window.slotSummary = function (n) {
        checkAndPrepopulateSlots();
        let s = localStorage.getItem('lineage_idle_save_' + n);
        if (!s) return null;
        try {
            let d = JSON.parse(s);
            let p = d.p;
            let clsName = { knight: '騎士', mage: '法師', elf: '妖精', dark: '黑暗妖精' }[p.cls] || p.cls;
            let diff = d.difficulty || 'standard';
            let diffName = DIFFICULTY_SETTINGS[diff] ? DIFFICULTY_SETTINGS[diff].name : '標準';
            return {
                name: p.name || '未命名',
                cls: clsName,
                lv: p.lv || 1,
                gold: p.gold || 0,
                difficulty: diff,
                difficultyName: diffName
            };
        } catch (e) {
            return null;
        }
    };


    // ==========================================
    // 2. 創角數值優化與長按連續點擊 (Character Creation)
    // ==========================================
    // 初始數值 (2倍化) 與 分配點數 (3倍化)
    if (createBase) {
        for (let cls in createBase) {
            let base = createBase[cls];
            base.str *= 2;
            base.dex *= 2;
            base.con *= 2;
            base.int *= 2;
            base.wis *= 2;
            base.cha *= 2;
            base.pts *= 3;
        }
    }

    // 長按加減點邏輯
    let holdTimeout = null;
    let holdInterval = null;

    function adjStatCustom(s, dir, amount) {
        let b = createBase[curCreate.cls];
        let capN = 40; // 創角階段各屬性最高點調至 40 (原為 20 的 2 倍)
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

        // 點擊立即改變 1 點
        adjStatCustom(stat, dir, 1);

        // 350ms 延遲後以 80ms 間隔每次改變 2 點
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

    const originalShowCreation = window.showCreation;
    window.showCreation = function () {
        originalShowCreation();
        attachHoldEventsToStatButtons();
    };


    // ==========================================
    // 3. 空存檔預填與安全限制 (Save Slot Prepopulation)
    // ==========================================
    window.createDefaultFemaleKnightSave = function (slotNumber) {
        const daggerUid = Math.random().toString(36).substr(2, 9);
        const jacketUid = Math.random().toString(36).substr(2, 9);
        const potionUid = Math.random().toString(36).substr(2, 9);

        const daggerItem = { id: 'wpn_dagger1', uid: daggerUid, cnt: 1, en: 0, bless: false, anc: false, attr: false, seteff: false, lock: false, junk: false };
        const jacketItem = { id: 'amr_jacket', uid: jacketUid, cnt: 1, en: 0, bless: false, anc: false, attr: false, seteff: false, lock: false, junk: false };
        const potionItem = { id: 'potion_heal', uid: potionUid, cnt: 100, en: 0, bless: false, anc: false, attr: false, seteff: false, lock: false, junk: false };

        // 騎士基礎：str:16, dex:12, con:14, int:8, wis:9, cha:8, pts:8
        // 乘2後：str:32, dex:24, con:28, int:16, wis:18, cha:16
        // pts三倍後：24。全部分配給力量。力量 = 32 + 24 = 56。
        const playerObj = {
            avatar: '女騎士',
            cls: 'knight',
            name: '初心者',
            base: { str: 56, dex: 24, con: 28, int: 16, wis: 18, cha: 16 },
            lv: 1,
            exp: 0,
            gold: 32767,
            inv: [daggerItem, jacketItem, potionItem],
            eq: {
                wpn: daggerItem,
                helm: null,
                armor: jacketItem,
                shield: null,
                cloak: null,
                tshirt: null,
                gloves: null,
                boots: null,
                ring1: null,
                ring2: null,
                amulet: null,
                belt: null
            },
            junkPrefs: {},
            skills: [],
            summon: null, charmed: null, manualCd: {}, hot: null, elfEle: null,
            buffs: { haste: 0, brave: 0, blue: 0, cautious: 0, elfcookie: 0, poly: 0, shield: 0 },
            alloc: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
            panacea: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
            panaceaUsed: 0,
            bonus: 0,
            hp: 1,
            mp: 1,
            dead: false
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
            if (!localStorage.getItem('lineage_idle_save_' + n)) {
                const saveObj = window.createDefaultFemaleKnightSave(n);
                localStorage.setItem('lineage_idle_save_' + n, JSON.stringify(saveObj));
            }
        }
    };

    window.clearAllSaves = function () {
        if (checkIsPrivileged()) {
            window.showToast('特權金鑰限制：禁止清除所有存檔！', 'error');
            return;
        }
        if (!confirm('確定要清除所有存檔嗎？此動作將無法復原。')) return;

        for (let n = 1; n <= 4; n++) {
            localStorage.removeItem('lineage_idle_save_' + n);
            localStorage.removeItem('lineage_idle_save_' + n + '_bak');
        }
        localStorage.removeItem('lineage_idle_warehouse');

        window.checkAndPrepopulateSlots();
        window.uploadToCloud();

        if (typeof window.openSlotSelect === 'function') {
            window.openSlotSelect(window._slotMode || 'load');
        }
        window.showToast('已成功清除所有存檔，並自動為您初始化存檔位 1-3！', 'success');
    };

    // 重新實作 chooseSlot，避免 _slotMode 無法從外部寫入的問題
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
                window.showToast('特權金鑰限制：不允許創新角色覆蓋既有存檔。', 'error');
                return;
            }
        }

        let sum = slotSummary(n);
        if (sum && !confirm(`存檔 ${n} 已有角色（${sum.cls} Lv.${sum.lv} ${sum.name}），確定覆蓋並重新創角？`)) return;

        currentSlot = n;
        document.getElementById('slot-select-panel').classList.add('hidden');
        showCreation();
    };


    // ==========================================
    // 4. 多難度系統整合 (Difficulty Selection)
    // ==========================================
    window.difficultyManuallySelected = false;

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
                hell: "【地獄】怪物強度 3.0x，掉寶率 3x，金幣量 3x，<br>增益藥水效力 0.8x。出怪延遲 0.1秒。",
                nightmare: "【惡夢】怪物強度 1.5x，掉寶率 1.5x，金幣量 1.5x，<br>增益藥水效力 0.9x。出怪延遲 1s / 日光 0.3s。",
                standard: "【標準】怪物強度 1.0x，掉寶率 1x，金幣量 1.0x，<br>增益藥水效力 1x。出怪延遲 5s / 日光 1s。",
                blessing: "【祝福】怪物強度 0.9x，掉寶率 1.5x，金幣量 1.5x，<br>增益藥水效力 1.0x。出怪延遲 1.0s / 日光 0.3s。",
                heaven: "【天堂】怪物強度 0.8.0x，掉寶率 2.0x，金幣量 2.0x，<br>增益藥水效力 2.0x。出怪延遲 1.0s / 日光 0.1s。"
            };
            descEl.innerHTML = descs[diff] || "";
        }
    };

    // 重新實作 openSlotSelect
    window.openSlotSelect = function (mode) {
        window._slotMode = mode;
        try { _slotMode = mode; } catch (e) { }
        document.getElementById('main-menu').classList.add('hidden');
        document.getElementById('creation-panel').classList.add('hidden');
        document.getElementById('slot-select-panel').classList.remove('hidden');
        document.getElementById('slot-select-title').innerText = (mode === 'new') ? '選擇存檔位（創建角色）' : '選擇存檔位（載入進度）';

        // 難度面板注入
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
                <div id="diff-desc" class="w-full max-w-md h-12 text-xs text-slate-300 text-center flex items-center justify-center border border-slate-800 bg-slate-950/40 rounded p-2"></div>
            `;
            titleEl.parentNode.insertBefore(diffPanel, titleEl.nextSibling);
        }

        // 延用當前難度與手動選擇標記，防止因非同步同步刷新而重置難度
        window.selectDifficulty(window.gameDifficulty || 'standard', window.difficultyManuallySelected);

        let list = document.getElementById('slot-list'); list.innerHTML = '';
        checkAndPrepopulateSlots();

        for (let n = 1; n <= 4; n++) {
            let sum = slotSummary(n);
            let label;
            if (sum) {
                label = `<div style="display: flex; flex-direction: column; width: 100%; gap: 4px; padding: 0 12px; box-sizing: border-box;">`
                    + `<div style="display: flex; width: 100%;">`
                    + `<span style="flex: 1; text-align: left;">存檔 ${n}</span>`
                    + `<span style="flex: 1; text-align: center;">${sum.cls}</span>`
                    + `<span style="flex: 1; text-align: right;">Lv.${sum.lv}</span>`
                    + `</div>`
                    + `<div style="display: flex; width: 100%;">`
                    + `<span style="flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${sum.name}</span>`
                    + `<span style="flex: 1; text-align: right;">[${sum.difficultyName}]</span>`
                    + `</div>`
                    + `</div>`;
            } else {
                label = `存檔 ${n}　（空）`;
            }
            let disabled = (mode === 'load' && !sum);
            let bak = (mode === 'load') ? slotBackupSummary(n) : null;
            let importBtn = `<button onclick="importSave(${n})" class="btn flex-1 min-w-0 py-4 px-2 text-base font-bold bg-indigo-700 hover:bg-indigo-600 border-indigo-500 whitespace-nowrap">匯入進度</button>`;
            let restoreBtn = bak ? `<button onclick="restoreBackup(${n})" title="復原匯入前自動備份的存檔（${bak.cls} Lv.${bak.lv}　${bak.name}）" class="btn flex-1 min-w-0 py-4 px-2 text-sm font-bold bg-amber-700 hover:bg-amber-600 border-amber-500 whitespace-nowrap">↩ 復原備份</button>` : '';
            let actionArea = (mode === 'load') ? `<div class="flex gap-2 shrink-0 w-56">${importBtn}${restoreBtn}</div>` : '';
            list.innerHTML += `<div class="flex gap-2 w-full">`
                + `<button onclick="chooseSlot(${n})" ${disabled ? 'disabled' : ''} class="btn flex-1 min-w-0 py-4 text-lg font-bold ${disabled ? 'opacity-40' : ''}">${label}</button>`
                + actionArea
                + `</div>`;
        }

        // 清除所有存檔按鈕注入與特權金鑰隱藏邏輯
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

    // 在左側 #status-panel 新增難度行與 updateUI() 同步
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
            const settings = DIFFICULTY_SETTINGS[diff] || DIFFICULTY_SETTINGS.standard;
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

    const originalUpdateUI = window.updateUI;
    window.updateUI = function () {
        originalUpdateUI();
        window.updateDifficultyDisplay();
        attachHoldEventsToInGameStatButtons();
    };


    // ==========================================
    // 5. 數值與效果對接 (Game Patches)
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

    // 包裹 applyMobMagic 以攔截 5 種 DoTs (燙傷、中毒、灼燒、次級灼燒、次級燙傷) 的傷害設定
    const originalApplyMobMagic = window.applyMobMagic;
    window.applyMobMagic = function (mob, sk) {
        const prevPoisonDmg = player.statuses.poisonDmg;
        const prevBurnDmg = player.statuses.burnDmg;
        const prevScaldDmg = player.statuses.scaldDmg;

        originalApplyMobMagic(mob, sk);

        const ds = DIFFICULTY_SETTINGS[window.gameDifficulty || 'standard'] || DIFFICULTY_SETTINGS.standard;
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

    // D. 怪物生命值隨難度縮放 (spawnMob)
    const originalSpawnMob = window.spawnMob;
    window.spawnMob = function (idx) {
        originalSpawnMob(idx);
        let mob = mapState.mobs[idx];
        if (mob) {
            const ds = DIFFICULTY_SETTINGS[window.gameDifficulty || 'standard'] || DIFFICULTY_SETTINGS.standard;
            mob.hp = Math.floor(mob.hp * ds.mobPower);
            mob.curHp = mob.hp;
        }
    };

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

    // 創角階段上限 capN = 40 (原來是 20)
    patchGlobalFunctionMultiple('adjStat', [
        {
            find: `let capN = 20;`,
            replace: `let capN = 40;`
        }
    ]);

    // ==========================================
    // 6. 初始化執行與自動同步
    // ==========================================
    let started = false;
    function startup() {
        if (started) return;
        started = true;

        initCloudSaveUI();
        attachHoldEventsToStatButtons();
        attachHoldEventsToInGameStatButtons();

        // 修正 _slotMode 作用域遮蔽問題
        patchGlobalFunctionMultiple('importSave', [
            {
                find: `openSlotSelect(_slotMode);`,
                replace: `openSlotSelect(window._slotMode);`
            }
        ]);
        patchGlobalFunctionMultiple('restoreBackup', [
            {
                find: `openSlotSelect(_slotMode);`,
                replace: `openSlotSelect(window._slotMode);`
            }
        ]);

        // 攔截手機版登出確認按鈕點擊，防止在非同步雲端存檔尚未上傳完成時就 reload 網頁
        document.addEventListener('click', async function (e) {
            const btn = e.target && e.target.closest && e.target.closest('#m-logout-ok');
            if (btn) {
                e.stopImmediatePropagation();
                e.preventDefault();

                const msgEl = document.getElementById('m-logout-msg');
                if (msgEl) msgEl.innerHTML = "正在儲存並同步至雲端，請稍候...";
                const btnsEl = document.getElementById('m-logout-btns');
                if (btnsEl) btnsEl.style.display = 'none';

                try {
                    if (typeof window.saveGame === 'function') {
                        await window.saveGame();
                    }
                } catch (err) {
                    console.error("Logout save failed:", err);
                }

                try {
                    if (window.__afk && window.__afk.stamp) {
                        window.__afk.stamp();
                    }
                } catch (err) { }

                try {
                    location.reload();
                } catch (err) { }
            }
        }, true); // 注意：必須設為 true 以啟用捕獲階段攔截！

        // 自動雲端載入並同步（靜音，不跳警告窗）
        window.syncFromCloud(false).then(() => {
            refreshLoadBtnVisibility();
        });

        // 延遲一段時間，確保 afk-mobile.js 已經對 window.openSlotSelect 進行了第一次包裝
        setTimeout(() => {
            if (typeof window.openSlotSelect === 'function') {
                const originalOpenSlotSelect = window.openSlotSelect;
                window.openSlotSelect = function (mode) {
                    originalOpenSlotSelect(mode);
                    // 執行完後（包含 afk-mobile.js 的 reformat()），如果是手機版則修正排版
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

    document.addEventListener('DOMContentLoaded', startup);
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
        startup();
    }

})();