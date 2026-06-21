/* ============================================================================
 * klh_jsonblob.js — 雲端存檔、難度自訂、數值擴充 & 創角優化
 *
 * 設計原則: 完全不改原作者程式碼，只從外面「包住」全域函式 (monkey-patch)。
 * 掛接方式: 在 index.html 的 </body> 標籤正上方，插入以下外掛腳本：
 * * <script src="klh_jsonblob.js?v=20260616"></script>
 *
 * 功能一覽:
 *   1. 雲端存檔 (JSONBlob) —— 透過 JSONBlob API 讀寫最多 4 格存檔 + 倉庫，
 *                             支援直接連線或自訂 CORS 代理備援。
 *   2. 創角數值優化       —— 初始屬性翻倍 (x2)，可分配點數雙倍 (x2)，
 *                             創角上限各屬性 +20，長按按鈕連續分配點數。
 *   3. 空存檔預填         —— 新存檔自動填入女騎士初始存檔，防止進入空白畫面。
 *   4. 多難度系統         —— 地獄/惡夢/標準/祝福/天堂五段難度，
 *                             影響怪物強度、掉寶率、金幣量、藥水效力、出怪延遲。
 *   5. 數值 Patch 對接    —— 透過字串替換 patch 原生函式 (tick/killMob/
 *                             recomputeStats/spawnMob等)，嵌入難度乘數運算。
 *   6. 屬性查表擴充       —— 力量/敏捷/智力/體質/精神 等六大屬性查表延伸至 70-120 級距，
 *                             上限 120，並動態覆蓋遊戲原生查表函式。
 *   7. 遊戲內配點優化     —— 遊戲內配點上限 +40，萬能藥上限 +40，
 *                             加入長按連續配點功能。
 *   8. 存檔槽整合         —— 重實作 openSlotSelect/chooseSlot/slotSummary，
 *                             整合難度顯示，防止特權金鑰覆蓋存檔。
 *   9. 更新說明面板       —— 在創角畫面注入可折疊的「與原版差異更新說明」面板。
 *  10. 登出安全與遮罩防呆 —— 攔截手機版登出確認，並在雲端上傳/下載期間顯示全域阻擋遮罩（禁止點擊取消），確保資料同步完整。
 *  11. Toast / 進度條     —— 全域通知 Toast 與讀取動畫進度條 UI 元件，降低等待焦慮。
 *  12. 特權金鑰保護       —— 預設保留特定公用金鑰槽（天后/宙斯），
 *                             禁止該金鑰覆蓋或清除存檔。
 *  13. 鍵盤輸入錯位修復   —— 解決 iOS 鍵盤彈起時 fixed 元素錯位及輸入框自動放大網頁等 UI UX 問題。
 * ========================================================================== */

(function () {
    // ==========================================
    // localStorage 模式隔離代理 (Storage.prototype 代理，相容手機版 Safari/Chrome)
    // ==========================================
    const originalGetItem = Storage.prototype.__originalGetItem || Storage.prototype.getItem;
    const originalSetItem = Storage.prototype.__originalSetItem || Storage.prototype.setItem;
    const originalRemoveItem = Storage.prototype.__originalRemoveItem || Storage.prototype.removeItem;

    function getRedirectedKey(key) {
        const mode = originalGetItem.call(localStorage, 'klh_storage_mode') || 'local';
        if (mode === 'cloud' || mode === 'supabase') {
            let activeKey;
            if (mode === 'supabase') {
                activeKey = originalGetItem.call(localStorage, 'klh_supabase_key') || '';
            } else {
                activeKey = window.activeKey || originalGetItem.call(localStorage, 'lineage_idle_jsonblob_url') || '019ed445-679f-7ae4-9f05-f887591d1266';
            }
            if (activeKey) {
                const suffix = '_' + activeKey.trim();
                // 🚀 遊戲存檔與倉庫：重定向至雲端快取鍵 + 金鑰後綴
                if (key.startsWith('lineage_idle_save_') || key === 'lineage_idle_warehouse') {
                    return key.replace('lineage_idle_save_', 'klh_cloud_save_').replace('lineage_idle_warehouse', 'klh_cloud_warehouse') + suffix;
                }
                // 🚀 離線掛機模組 (afk-offline.js) 的狀態鍵：直接加金鑰後綴，防止不同伺服器的地圖/時間戳互相污染
                if (key.startsWith('afk_ts_') || key.startsWith('afk_map_') || key.startsWith('afk_pride_')) {
                    return key + suffix;
                }
            }
        }
        return key;
    }

    if (!Storage.prototype.__klh_patched) {
        Storage.prototype.__klh_patched = true;
        Storage.prototype.__originalGetItem = originalGetItem;
        Storage.prototype.__originalSetItem = originalSetItem;
        Storage.prototype.__originalRemoveItem = originalRemoveItem;

        Storage.prototype.getItem = function (key) {
            return originalGetItem.call(this, getRedirectedKey(key));
        };

        Storage.prototype.setItem = function (key, value) {
            return originalSetItem.call(this, getRedirectedKey(key), value);
        };

        Storage.prototype.removeItem = function (key) {
            return originalRemoveItem.call(this, getRedirectedKey(key));
        };
    }

    // ==========================================
    // 本地雲端存檔快取管理與同步鎖
    // ==========================================
    window.isCloudSyncing = false;

    function updateLoadButtonState() {
        const btnLoad = document.getElementById('btn-load');
        if (!btnLoad) return;

        if (window.isCloudSyncing) {
            btnLoad.disabled = true;
            btnLoad.classList.add('opacity-50', 'pointer-events-none');
            if (!btnLoad.dataset.originalText) {
                btnLoad.dataset.originalText = btnLoad.textContent || "載入遊戲進度";
            }
            btnLoad.textContent = "雲端同步中...";
            btnLoad.classList.remove('hidden');
        } else {
            btnLoad.disabled = false;
            btnLoad.classList.remove('opacity-50', 'pointer-events-none');
            if (btnLoad.dataset.originalText) {
                btnLoad.textContent = btnLoad.dataset.originalText;
            }
            refreshLoadBtnVisibility();
        }
    }

    function clearLocalCloudCache() {
        const activeKey = window.activeKey || originalGetItem.call(localStorage, 'lineage_idle_jsonblob_url') || '019ed445-679f-7ae4-9f05-f887591d1266';
        const suffix = '_' + activeKey.trim();
        ['1', '2', '3', '4'].forEach(n => {
            originalRemoveItem.call(localStorage, 'klh_cloud_save_' + n + suffix);
            originalRemoveItem.call(localStorage, 'klh_cloud_save_' + n + '_empty_flag' + suffix);
        });
        originalRemoveItem.call(localStorage, 'klh_cloud_warehouse' + suffix);
        console.log("[JSONBlob] 本地雲端存檔快取已清空。後綴:", suffix);
    }

    window.copyLocalSavesToCloudCache = function () {
        const activeKey = window.activeKey || originalGetItem.call(localStorage, 'lineage_idle_jsonblob_url') || '019ed445-679f-7ae4-9f05-f887591d1266';
        const suffix = '_' + activeKey.trim();
        ['1', '2', '3', '4'].forEach(n => {
            const localVal = originalGetItem.call(localStorage, 'lineage_idle_save_' + n);
            if (localVal !== null) {
                originalSetItem.call(localStorage, 'klh_cloud_save_' + n + suffix, localVal);
            } else {
                originalRemoveItem.call(localStorage, 'klh_cloud_save_' + n + suffix);
            }

            // 同步複製空存檔標記
            const localEmptyFlag = originalGetItem.call(localStorage, 'lineage_idle_save_' + n + '_empty_flag');
            if (localEmptyFlag !== null) {
                originalSetItem.call(localStorage, 'klh_cloud_save_' + n + '_empty_flag' + suffix, localEmptyFlag);
            } else {
                originalRemoveItem.call(localStorage, 'klh_cloud_save_' + n + '_empty_flag' + suffix);
            }
        });
        const localWarehouse = originalGetItem.call(localStorage, 'lineage_idle_warehouse');
        if (localWarehouse !== null) {
            originalSetItem.call(localStorage, 'klh_cloud_warehouse' + suffix, localWarehouse);
        } else {
            originalRemoveItem.call(localStorage, 'klh_cloud_warehouse' + suffix);
        }
        console.log("[JSONBlob] 已成功將本地存檔複製到雲端暫存區。後綴:", suffix);
    };

    // ==========================================
    // 0. 全域常數與設定
    // ==========================================
    window.DEFAULT_CLOUD_URL = "https://api.jsonblob.com/api/jsonBlob";

    // 🚀 存檔時是否自動清理協力傭兵背包與設定以減少存檔體積 (true: 預設開啟; false: 關閉)
    window.CLEAN_ALLY_DATA_ON_SAVE = true;

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
    window.activeKey = initialKey || "019ed445-679f-7ae4-9f05-f887591d1266";
    window.gameDifficulty = 'standard';
    window._slotMode = 'new';

    // 取得乾淨正規化後的雲端存檔 URL
    function getCleanCloudUrl(key) {
        key = (key || "").trim();
        if (!key) key = "019ed445-679f-7ae4-9f05-f887591d1266";

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

    window.isValidUuid = function (key) {
        key = (key || "").trim();
        if (!key) return false;
        if (key.startsWith("http://") || key.startsWith("https://")) {
            return true;
        }
        const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
        return uuidRegex.test(key);
    };

    window.DIFFICULTY_SETTINGS = {
        hell: { name: "地獄", mobPower: 3.0, dropRate: 3.0, goldRate: 3.0, potionRate: 0.8, noSunDelay: 1, sunDelay: 1 },
        nightmare: { name: "惡夢", mobPower: 1.5, dropRate: 1.5, goldRate: 1.5, potionRate: 0.9, noSunDelay: 10, sunDelay: 3 },
        standard: { name: "標準", mobPower: 1.0, dropRate: 1.0, goldRate: 1.0, potionRate: 1.0, noSunDelay: 50, sunDelay: 10 },
        blessing: { name: "祝福", mobPower: 0.9, dropRate: 1.5, goldRate: 1.5, potionRate: 1.0, noSunDelay: 10, sunDelay: 3 },
        heaven: { name: "天堂", mobPower: 0.8, dropRate: 2.0, goldRate: 2.0, potionRate: 2.0, noSunDelay: 10, sunDelay: 1 }
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
        if (mode === 'supabase') {
            const normalized = (localStorage.getItem('klh_supabase_key') || "").trim().toLowerCase();
            return PRIVILEGED_KEYS.some(k => k.toLowerCase() === normalized);
        } else {
            const normalized = (window.activeKey || "").trim().toLowerCase();
            return PRIVILEGED_KEYS.some(k => k.toLowerCase() === normalized);
        }
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
        /* 僅在手機版且虛擬鍵盤開啟時隱藏底部/頂部導航，防止擠歪 */
        body.m-mobile.m-keyboard-open #m-nav {
            display: none !important;
        }
        /* 儲存模式切換按鈕縮小與美化，避免按鈕過大/排版不美觀 */
        #btn-switch-local, #btn-switch-supabase, #btn-switch-cloud {
            padding: 5px 2px !important;
            font-size: 11px !important;
            line-height: 1.2 !important;
        }
        /* 雲端設定區按鈕（讀取按鈕、公用金鑰按鈕等）縮小，使 UI 更加精緻 */
        #cloud-settings-section button {
            padding: 6px 12px !important;
            font-size: 12px !important;
        }
        @keyframes klh-fade-in {
            from { opacity: 0; transform: translateY(-8px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `;
    document.head.appendChild(styleEl);

    if (typeof window.showSupabaseKeyBanner !== 'function') {
        window.showSupabaseKeyBanner = function (key) {
            const existing = document.getElementById('supabase-key-banner');
            if (existing) existing.remove();

            const container = document.getElementById('cloud-save-container');
            if (!container) return;

            const banner = document.createElement('div');
            banner.id = 'supabase-key-banner';
            banner.style.cssText = 'background: rgba(30, 41, 59, 0.95); border: 1px solid #b89243; border-radius: 8px; padding: 12px; margin-top: 10px; text-align: center; animation: klh-fade-in 0.3s ease; position: relative;';
            banner.innerHTML = `
                <div style="font-size: 13px; font-weight: bold; color: #fbbf24; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    <span>🎉 雲端金鑰建立成功！</span>
                    <button onclick="this.closest('#supabase-key-banner').remove()" style="color: #94a3b8; background: none; border: none; font-size: 16px; cursor: pointer; padding: 0 4px; line-height: 1; outline: none;">&times;</button>
                </div>
                <div style="font-size: 11px; color: #e2e8f0; margin-bottom: 8px; line-height: 1.4; text-align: left;">
                    這是您的本機專屬金鑰，可用於多裝置存檔同步。請務必備份保存（點擊下方即可複製）：
                </div>
                <div onclick="navigator.clipboard.writeText('${key}'); window.showToast('雲端金鑰已成功複製到剪貼簿！', 'success');" style="background: #020617; border: 1px solid #334155; border-radius: 6px; padding: 8px; font-family: monospace; font-size: 16px; font-weight: bold; color: #22d3ee; cursor: pointer; display: flex; justify-content: center; align-items: center; gap: 6px; transition: background 0.2s;" onmouseover="this.style.background='#0f172a'" onmouseout="this.style.background='#020617'">
                    <span>${key}</span>
                    <span style="font-size: 12px;">📋</span>
                </div>
            `;
            const statusEl = document.getElementById('storage-mode-status');
            if (statusEl) {
                statusEl.parentNode.insertBefore(banner, statusEl.nextSibling);
            } else {
                container.appendChild(banner);
            }
        };
    }

    if (typeof window.showSupabaseKeyModal !== 'function') {
        window.showSupabaseKeyModal = function (key) {
            const backdrop = document.createElement('div');
            backdrop.className = 'klh-modal-backdrop';
            backdrop.style.cssText = 'position: fixed; inset: 0; background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(5px); z-index: 10001; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.25s ease;';
            backdrop.innerHTML = `
                <div style="background: #1e293b padding-box, linear-gradient(135deg, #4a3613 0%, #b89243 20%, #6e5220 42%, #e6c474 60%, #5c4318 80%, #c9a14a 100%) border-box; border: 2px solid transparent; border-radius: 16px; width: 90%; max-width: 380px; padding: 24px; text-align: center; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8); transform: scale(0.9); transition: transform 0.25s ease;">
                    <div style="font-size: 40px; margin-bottom: 12px;">🎉</div>
                    <div style="font-size: 18px; font-weight: bold; color: #fbbf24; margin-bottom: 10px; text-shadow: 1px 1px 2px rgba(0,0,0,0.5);">雲端金鑰建立成功！</div>
                    <div style="font-size: 13px; color: #e2e8f0; line-height: 1.5; margin-bottom: 16px;">
                        這是您的本機專屬雲端金鑰，可用於多裝置存檔同步。請務必妥善備份保存：
                    </div>
                    <div onclick="navigator.clipboard.writeText('${key}'); window.showToast('雲端金鑰已成功複製到剪貼簿！', 'success');" style="background: #020617; border: 1px solid #334155; border-radius: 8px; padding: 12px; font-family: monospace; font-size: 20px; font-weight: bold; color: #22d3ee; letter-spacing: 1px; cursor: pointer; display: flex; justify-content: center; align-items: center; gap: 8px; margin-bottom: 8px; transition: background 0.2s;" onmouseover="this.style.background='#0f172a'" onmouseout="this.style.background='#020617'">
                        <span>${key}</span>
                        <span style="font-size: 16px;">📋</span>
                    </div>
                    <div style="font-size: 11px; color: #94a3b8; margin-bottom: 24px;">（點擊上方金鑰框即可快速複製）</div>
                    <button class="btn w-full py-2.5 text-sm bg-cyan-700 hover:bg-cyan-600 border-cyan-500 font-bold" style="border-radius: 8px;" onclick="const bd = this.closest('.klh-modal-backdrop'); bd.style.opacity='0'; setTimeout(() => bd.remove(), 250);">確認並開始遊戲</button>
                </div>
            `;
            document.body.appendChild(backdrop);
            setTimeout(() => {
                backdrop.style.opacity = '1';
                backdrop.children[0].style.transform = 'scale(1)';
            }, 20);
        };
    }

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
        const customProxy = localStorage.getItem('klh_custom_proxy') || "https://fragrant-glade-bab3.dreammy0924.workers.dev/";

        // file:/// 協議下直連 CORS 必定被擋，直接跳過省時間
        const isFileProtocol = window.location.protocol === 'file:';

        async function tryDirect() {
            if (isFileProtocol) {
                throw new Error("File protocol forces proxy.");
            }
            console.log(`[JSONBlob] 嘗試直接進行 ${method} 請求...`);
            const res = await fetch(targetUrl, options);
            if (res.ok) {
                console.log(`[JSONBlob] 直接 ${method} 請求成功！`);
                res.connectionMethod = "直接連線";
                return res;
            }
            throw new Error(`Direct connection returned status ${res.status}`);
        }

        async function tryProxy() {
            if (!customProxy.trim()) {
                throw new Error("No custom proxy defined.");
            }
            let p = customProxy.trim();
            if (!p.endsWith('/')) p += '/';
            const proxyUrl = p + targetUrl;
            const fetchOptions = method === 'PUT' ? { ...options, mode: 'cors' } : options;
            console.log(`[JSONBlob] 嘗試使用主要代理 ${method}: ${proxyUrl}`);
            const res = await fetch(proxyUrl, fetchOptions);
            if (res.status === 200 || res.status === 201 || res.ok) {
                console.log(`[JSONBlob] 透過主要代理讀寫成功！`);
                res.connectionMethod = "主要代理";
                return res;
            }
            throw new Error(`Proxy connection returned status ${res.status}`);
        }

        // 🚀 永遠優先直連，失敗才走代理（file:/// 除外，因為 CORS 必定擋住直連）
        if (isFileProtocol) {
            try {
                return await tryProxy();
            } catch (err) {
                console.warn(`[JSONBlob] 代理失敗，嘗試直接連線...`, err);
                try {
                    return await tryDirect();
                } catch (err2) {
                    console.error(`[JSONBlob] 所有連線管道皆失敗:`, err2);
                    throw err2;
                }
            }
        } else {
            try {
                return await tryDirect();
            } catch (err) {
                console.warn(`[JSONBlob] 直接連線失敗，回退至主要代理...`, err);
                try {
                    return await tryProxy();
                } catch (err2) {
                    console.error(`[JSONBlob] 所有連線管道皆失敗:`, err2);
                    throw err2;
                }
            }
        }
    }


    window.saveJsonBlobConfig = function (key) {
        key = (key || "").trim();
        if (!key) key = "019ed445-679f-7ae4-9f05-f887591d1266";

        // 🚀 當切換的金鑰與目前不同時，清空本地的雲端快取，避免舊金鑰的資料殘留並跑到新金鑰中
        if (window.activeKey !== key) {
            clearLocalCloudCache();
        }

        window.activeKey = key;
        localStorage.setItem('lineage_idle_jsonblob_url', key);

        const inputEl = document.getElementById('jsonblob-input');
        if (inputEl) inputEl.value = key;
    };

    window.clearJsonBlobConfig = function () {
        window.saveJsonBlobConfig("019ed445-679f-7ae4-9f05-f887591d1266");
    };

    let lastAutoUploadTime = 0;
    const AUTO_UPLOAD_DEBOUNCE_MS = 60000; // 60秒自動存檔上傳節流

    window.addEventListener('beforeunload', () => {
        window.__klh_is_unloading = true;
    });

    // 異步上傳至雲端
    window.uploadToCloud = async function (isManual = false, forceFullOverwrite = false, skipMergeSlot = null) {
        // 自動上傳節流：若非手動且非強制全覆寫，且頁面沒有在關閉中，限制 60 秒內只上傳一次
        if (!isManual && !forceFullOverwrite && !window.__klh_is_unloading) {
            const now = Date.now();
            if (now - lastAutoUploadTime < AUTO_UPLOAD_DEBOUNCE_MS) {
                return;
            }
            lastAutoUploadTime = now;
        }

        if (!window.isValidUuid(window.activeKey)) {
            if (isManual) window.showToast('雲端金鑰格式無效，無法執行寫入！', 'error');
            return;
        }
        const targetUrl = getCleanCloudUrl(window.activeKey);
        const payload = {
            save_1: localStorage.getItem('lineage_idle_save_1'),
            save_2: localStorage.getItem('lineage_idle_save_2'),
            save_3: localStorage.getItem('lineage_idle_save_3'),
            save_4: localStorage.getItem('lineage_idle_save_4'),
            warehouse: localStorage.getItem('lineage_idle_warehouse')
        };

        // 取得目前正在遊玩的存檔位 (1~4)
        const activeSlot = (typeof currentSlot !== 'undefined') ? parseInt(currentSlot, 10) : null;

        // 如果不是強制全覆寫，且當前有加載角色，先取得雲端存檔，把其他存檔位的雲端資料合併進來，避免覆蓋別人的存檔
        if (!forceFullOverwrite && activeSlot >= 1 && activeSlot <= 4) {
            if (isManual) {
                window.showLoadingOverlay('正在讀取並合併雲端存檔...');
            }
            try {
                const res = await fetchWithProxy(targetUrl);
                if (res.status === 200) {
                    const cloudData = await res.json();
                    if (cloudData && typeof cloudData === 'object') {
                        // 確定要跳過合併的槽位 (若 skipMergeSlot 被指定)
                        const skipSlot = (skipMergeSlot !== null) ? parseInt(skipMergeSlot, 10) : null;

                        for (let n = 1; n <= 4; n++) {
                            // 如果是目前正在玩的槽位，或者是被指定跳過合併 (即要刪除/覆寫) 的槽位，則不上傳雲端舊值 (維持 payload 本地值)
                            if (n !== activeSlot && n !== skipSlot) {
                                const cloudSlotVal = cloudData['save_' + n] || cloudData['lineage_idle_save_' + n];
                                if (cloudSlotVal !== undefined && cloudSlotVal !== null) {
                                    payload['save_' + n] = (typeof cloudSlotVal === 'object') ? JSON.stringify(cloudSlotVal) : cloudSlotVal;
                                } else {
                                    payload['save_' + n] = null; // 🚀 雲端已清空/無存檔，則上傳時也維持清空，防止舊存檔復活
                                }
                            }
                        }
                    }
                } else {
                    throw new Error('HTTP ' + res.status);
                }
            } catch (e) {
                console.error("[JSONBlob] 讀取並合併雲端存檔失敗，為避免覆蓋他人進度，本次同步已取消:", e);
                if (isManual) {
                    window.showToast('雲端存檔同步失敗：無法取得雲端最新狀態，已取消本次同步以保護其他存檔位！', 'error');
                }
                return; // 🚀 直接中斷，不執行下方的 PUT 覆蓋上傳，以確保其他存檔位安全
            } finally {
                if (isManual) {
                    window.hideLoadingOverlay();
                }
            }
        }

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
                const PUBLIC_KEYS = [
                    "019ed445-679f-7ae4-9f05-f887591d1266",
                    "019ebb1f-b31c-769f-8475-02be610a13b0",
                    "019ebb3a-0d11-7569-a341-463d28054478",
                    "019ebb3a-58de-78fd-8139-eca46c089de3",
                    "019ebb3a-ad04-76f1-81df-d15d7b2d03d0",
                    "019ebb3a-e777-7ab7-b744-aaab13066231"
                ];
                const activeKeyLower = (window.activeKey || "").trim().toLowerCase();
                if (window.isValidUuid(window.activeKey) && !PUBLIC_KEYS.includes(activeKeyLower)) {
                    localStorage.setItem('klh_custom_key', (window.activeKey || "").trim());
                }
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
    window.syncFromCloud = async function (isManual) {
        if (!window.isValidUuid(window.activeKey)) {
            window.showToast('雲端金鑰格式無效，無法執行讀取！', 'error');
            return;
        }

        window.isCloudSyncing = true;
        updateLoadButtonState();

        const targetUrl = getCleanCloudUrl(window.activeKey);

        // 顯示讀取與防呆進度條遮罩 (僅在手動操作時顯示，避免網頁載入時阻擋使用者)
        if (isManual) {
            window.showLoadingOverlay('正在讀取雲端存檔中...');
        }

        try {
            const res = await fetchWithProxy(targetUrl);
            if (res.status === 200) {
                // 💥 關鍵安全防線：如果在下載期間，玩家已經切換回本地模式，則直接放棄寫入，防止覆蓋本地存檔！
                const currentMode = originalGetItem.call(localStorage, 'klh_storage_mode') || 'local';
                if (currentMode !== 'cloud') {
                    console.warn("[JSONBlob] 下載完成，但偵測到玩家已切回本地模式，已自動取消寫入以保護本地存檔。");
                    return;
                }

                const payload = await res.json();
                if (payload) {
                    const PUBLIC_KEYS = [
                        "019ed445-679f-7ae4-9f05-f887591d1266",
                        "019ebb1f-b31c-769f-8475-02be610a13b0",
                        "019ebb3a-0d11-7569-a341-463d28054478",
                        "019ebb3a-58de-78fd-8139-eca46c089de3",
                        "019ebb3a-ad04-76f1-81df-d15d7b2d03d0",
                        "019ebb3a-e777-7ab7-b744-aaab13066231"
                    ];
                    const activeKeyLower = (window.activeKey || "").trim().toLowerCase();
                    if (window.isValidUuid(window.activeKey) && !PUBLIC_KEYS.includes(activeKeyLower)) {
                        localStorage.setItem('klh_custom_key', (window.activeKey || "").trim());
                    }
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

                    // 🚀 雲端模式下讀取完畢後不在此處偷偷自動預填空存檔，以保持雲端與本地狀態誠實一致
                    // checkAndPrepopulateSlots();
                    if (isManual) window.showToast('雲端存檔讀取並同步本機成功！(管道：' + (res.connectionMethod || '未知') + ')', 'success');

                    refreshLoadBtnVisibility();

                    // 🚀 此處原有的選檔列表刷新已移至下方 finally 區塊統一執行
                }
            } else if (res.status === 404) {
                window.showToast('雲端無存檔或金鑰已失效！如果是全新金鑰，請點選「手動寫入雲端」進行初始化。', 'error');
            } else {
                if (isManual) window.showToast('讀取雲端存檔失敗，狀態碼：' + res.status, 'error');
            }
        } catch (err) {
            console.error(err);
            if (isManual) window.showToast('讀取雲端存檔失敗，請檢查網路連線。', 'error');
        } finally {
            window.isCloudSyncing = false;
            updateLoadButtonState();

            // 🚀 確保同步完成後（不論成功或失敗），若目前在選檔畫面，就重繪列表以呈現最新狀態（或解除正在同步狀態）
            const slotSelectPanel = document.getElementById('slot-select-panel');
            if (slotSelectPanel && !slotSelectPanel.classList.contains('hidden')) {
                if (typeof openSlotSelect === 'function') {
                    openSlotSelect(window._slotMode || 'load');
                }
            }

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
    window.refreshLoadBtnVisibility = refreshLoadBtnVisibility;


    window.handleCloudSaveReadClick = async function () {
        const inputEl = document.getElementById('jsonblob-input');
        if (inputEl) {
            let key = inputEl.value.trim();
            if (!window.isValidUuid(key)) {
                window.showToast('金鑰格式錯誤！必須為 36 碼 UUID 格式 (例如: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)', 'error');
                return;
            }
            window.saveJsonBlobConfig(key);
            localStorage.setItem('klh_storage_mode', 'cloud'); // 🚀 切換至雲端模式
            window.updateStorageModeUI();
            await window.syncFromCloud(true);
        }
    };

    window.handleCloudSaveWriteClick = async function () {
        const inputEl = document.getElementById('jsonblob-input');
        if (inputEl) {
            let key = inputEl.value.trim();
            if (!window.isValidUuid(key)) {
                window.showToast('金鑰格式錯誤！必須為 36 碼 UUID 格式 (例如: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)', 'error');
                return;
            }
            window.saveJsonBlobConfig(key);
            localStorage.setItem('klh_storage_mode', 'cloud'); // 🚀 切換至雲端模式
            window.updateStorageModeUI();

            // 🚀 在手動寫入前，將真實的本地存檔複製到雲端快取中
            window.copyLocalSavesToCloudCache();

            await window.uploadToCloud(true);
        }
    };

    window.handleCloudResetClick = async function () {
        window.clearJsonBlobConfig();
        localStorage.setItem('klh_storage_mode', 'cloud'); // 🚀 切換至雲端模式
        window.updateStorageModeUI();
        await window.syncFromCloud(true);
    };

    window.clearAllCloudData = window.clearAllSaves;

    window.handleFastKeyClick = async function (btn) {
        const key = btn.getAttribute('data-key');
        const mode = localStorage.getItem('klh_storage_mode') || 'local';
        // Supabase keys start with "0012" and are 12 characters long
        if (key.startsWith("0012") && key.length === 12) {
            localStorage.setItem('klh_supabase_key', key);
            localStorage.setItem('klh_storage_mode', 'supabase');
            window.updateStorageModeUI();
            await window.syncFromSupabase(true);
        } else {
            window.saveJsonBlobConfig(key);
            localStorage.setItem('klh_storage_mode', 'cloud'); // 🚀 切換至雲端模式
            window.updateStorageModeUI();
            await window.syncFromCloud(true);
        }
    };

    // 儲存模式 UI 控制與切換
    window.updateStorageModeUI = function () {
        if (typeof window.applyCreateBaseModifiers === 'function') {
            window.applyCreateBaseModifiers();
        }
        const mode = localStorage.getItem('klh_storage_mode') || 'local';
        const modeTextEl = document.getElementById('current-storage-mode-text');
        const settingsSection = document.getElementById('cloud-settings-section');

        const btnLocal = document.getElementById('btn-switch-local');
        const btnCloud = document.getElementById('btn-switch-cloud');
        const btnSupabase = document.getElementById('btn-switch-supabase');

        const inputEl = document.getElementById('jsonblob-input');
        const readBtn = settingsSection ? settingsSection.querySelector('button') : null;
        const quickKeysHeader = document.getElementById('klh-quick-keys-header');
        const quickKeysList = document.getElementById('klh-quick-keys-list');

        if (modeTextEl) {
            if (mode === 'cloud') {
                let keyName = "自訂金鑰";
                const normalized = (window.activeKey || "").trim().toLowerCase();
                const keys = {
                    "019ed445-679f-7ae4-9f05-f887591d1266": "水蛇許德拉",
                    "019ebb1f-b31c-769f-8475-02be610a13b0": "太陽神阿波羅",
                    "019ebb3a-0d11-7569-a341-463d28054478": "火神赫發斯特斯",
                    "019ebb3a-58de-78fd-8139-eca46c089de3": "勝利女神雅典那",
                    "019ebb3a-ad04-76f1-81df-d15d7b2d03d0": "天后海拉",
                    "019ebb3a-e777-7ab7-b744-aaab13066231": "天神宙斯"
                };
                if (keys[normalized]) {
                    keyName = keys[normalized];
                }
                modeTextEl.innerHTML = `<span class="text-indigo-400 font-bold">雲端同步 (${keyName})</span>`;
                if (settingsSection) settingsSection.style.display = 'flex';
                if (btnLocal) btnLocal.className = 'btn flex-1 py-2 text-[10px] bg-slate-800 hover:bg-slate-700 text-white font-bold whitespace-nowrap';
                if (btnCloud) btnCloud.className = 'btn flex-1 py-2 text-[10px] bg-indigo-700 hover:bg-indigo-600 text-white font-bold border-indigo-500 whitespace-nowrap';
                if (btnSupabase) btnSupabase.className = 'btn flex-1 py-2 text-[10px] bg-slate-800 hover:bg-slate-700 text-white font-bold whitespace-nowrap';

                if (inputEl) {
                    inputEl.placeholder = '019ed445-679f-7ae4-9f05-f887591d1266';
                    inputEl.value = window.activeKey || '';
                }
                if (readBtn) {
                    readBtn.innerText = '手動讀取雲端';
                    readBtn.setAttribute('onclick', 'handleCloudSaveReadClick()');
                    readBtn.className = 'btn w-full py-2.5 text-sm bg-indigo-700 hover:bg-indigo-600 border-indigo-500 font-bold';
                }
            } else if (mode === 'supabase') {
                const sKey = localStorage.getItem('klh_supabase_key') || '';
                let localKey = localStorage.getItem('klh_supabase_local_key') || '';
                if (!localKey && sKey) {
                    localKey = sKey;
                    localStorage.setItem('klh_supabase_local_key', localKey);
                }

                let keyDisplay = sKey || '無金鑰';
                const sKeyLower = sKey.trim().toLowerCase();
                const supabaseKeysMap = {
                    "0012k1i6d225": "水蛇許德拉",
                    "0012k1i6d226": "太陽神阿波羅",
                    "0012k1i6d227": "火神赫發斯特斯",
                    "0012k1i6d228": "勝利女神雅典那",
                    "0012k1i6d229": "天后海拉",
                    "0012k1i6d230": "天神宙斯"
                };
                if (supabaseKeysMap[sKeyLower]) {
                    keyDisplay = supabaseKeysMap[sKeyLower];
                } else if (localKey && sKey === localKey) {
                    keyDisplay = "本機金鑰";
                }

                modeTextEl.innerHTML = `<span class="text-cyan-400 font-bold cursor-pointer" onclick="window.copySupabaseLocalKey()" title="點擊複製本機金鑰">雲端金鑰 (${keyDisplay}) 📋</span>`;
                if (settingsSection) settingsSection.style.display = 'flex';

                if (btnLocal) btnLocal.className = 'btn flex-1 py-2 text-[10px] bg-slate-800 hover:bg-slate-700 text-white font-bold whitespace-nowrap';
                if (btnCloud) btnCloud.className = 'btn flex-1 py-2 text-[10px] bg-slate-800 hover:bg-slate-700 text-white font-bold whitespace-nowrap';
                if (btnSupabase) btnSupabase.className = 'btn flex-1 py-2 text-[10px] bg-cyan-700 hover:bg-cyan-600 text-white font-bold border-cyan-500 whitespace-nowrap';

                if (inputEl) {
                    inputEl.placeholder = '請輸入 12 碼雲端金鑰';
                    inputEl.value = sKey;
                }
                if (readBtn) {
                    readBtn.innerText = '手動讀取雲端';
                    readBtn.setAttribute('onclick', 'handleSupabaseReadClick()');
                    readBtn.className = 'btn w-full py-2.5 text-sm bg-cyan-700 hover:bg-cyan-600 border-cyan-500 font-bold';
                }
            } else {
                modeTextEl.innerHTML = `<span class="text-green-400 font-bold">本地模式</span>`;
                if (settingsSection) settingsSection.style.display = 'none';
                if (btnLocal) btnLocal.className = 'btn flex-1 py-2 text-[10px] bg-green-700 hover:bg-green-600 text-white font-bold border-green-500 whitespace-nowrap';
                if (btnCloud) btnCloud.className = 'btn flex-1 py-2 text-[10px] bg-slate-800 hover:bg-slate-700 text-white font-bold whitespace-nowrap';
                if (btnSupabase) btnSupabase.className = 'btn flex-1 py-2 text-[10px] bg-slate-800 hover:bg-slate-700 text-white font-bold whitespace-nowrap';
            }
        }

        // 動態渲染快速公用金鑰清單
        if (quickKeysHeader && quickKeysList) {
            if (mode === 'cloud' || mode === 'supabase') {
                quickKeysHeader.style.display = 'block';
                quickKeysList.style.display = 'flex';
                
                const showLock = (typeof window.openGMShop === 'function') ? '' : '🔒固定';
                let html = '';

                if (mode === 'cloud') {
                    html += `<div id="klh-custom-key-btn-container" class="flex flex-col gap-1.5 w-full"></div>`;
                    const cloudKeys = [
                        { idx: 1, name: "水蛇許德拉", key: "019ed445-679f-7ae4-9f05-f887591d1266", color: "text-sky-300", suffix: "(預設) (標準)" },
                        { idx: 2, name: "太陽神阿波羅", key: "019ebb1f-b31c-769f-8475-02be610a13b0", color: "text-amber-300", suffix: "" },
                        { idx: 3, name: "火神赫發斯特斯", key: "019ebb3a-0d11-7569-a341-463d28054478", color: "text-orange-300", suffix: "" },
                        { idx: 4, name: "勝利女神雅典那", key: "019ebb3a-58de-78fd-8139-eca46c089de3", color: "text-green-300", suffix: "" },
                        { idx: 5, name: "天后海拉", key: "019ebb3a-ad04-76f1-81df-d15d7b2d03d0", color: "text-rose-300", suffix: showLock },
                        { idx: 6, name: "天神宙斯", key: "019ebb3a-e777-7ab7-b744-aaab13066231", color: "text-cyan-300", suffix: showLock }
                    ];
                    cloudKeys.forEach(k => {
                        html += `
                            <button onclick="handleFastKeyClick(this)" class="btn py-2.5 text-sm bg-slate-800 hover:bg-slate-700 ${k.color} font-normal w-full" style="position: relative; display: flex; justify-content: center; align-items: center;" data-key="${k.key}">
                                <span style="position: absolute; left: 16px;">${k.idx}.</span>
                                <span class="font-bold">${k.name}</span>
                                <span style="position: absolute; right: 16px; font-size: 11px; opacity: 0.9;">${k.suffix}</span>
                            </button>
                        `;
                    });
                } else {
                    const sKey = localStorage.getItem('klh_supabase_key') || '';
                    const localKey = localStorage.getItem('klh_supabase_local_key') || '';
                    if (localKey && sKey !== localKey) {
                        html += `
                            <button onclick="window.restoreSupabaseLocalKey()" class="btn py-2.5 text-sm bg-slate-800 hover:bg-slate-700 text-yellow-400 font-bold w-full mb-1.5" style="position: relative; display: flex; justify-content: center; align-items: center;">
                                <span style="position: absolute; left: 16px;">⭐</span>
                                <span class="font-bold">還原為本機雲端金鑰</span>
                                <span style="position: absolute; right: 16px; font-size: 11px; opacity: 0.9;">(${localKey})</span>
                            </button>
                        `;
                    }
                    const supabaseKeys = [
                        { idx: 1, name: "水蛇許德拉", key: "0012k1i6d225", color: "text-sky-300", suffix: "(預設) (標準)" },
                        { idx: 2, name: "太陽神阿波羅", key: "0012k1i6d226", color: "text-amber-300", suffix: "" },
                        { idx: 3, name: "火神赫發斯特斯", key: "0012k1i6d227", color: "text-orange-300", suffix: "" },
                        { idx: 4, name: "勝利女神雅典那", key: "0012k1i6d228", color: "text-green-300", suffix: "" },
                        { idx: 5, name: "天后海拉", key: "0012k1i6d229", color: "text-rose-300", suffix: showLock },
                        { idx: 6, name: "天神宙斯", key: "0012k1i6d230", color: "text-cyan-300", suffix: showLock }
                    ];
                    supabaseKeys.forEach(k => {
                        html += `
                            <button onclick="handleFastKeyClick(this)" class="btn py-2.5 text-sm bg-slate-800 hover:bg-slate-700 ${k.color} font-normal w-full" style="position: relative; display: flex; justify-content: center; align-items: center;" data-key="${k.key}">
                                <span style="position: absolute; left: 16px;">${k.idx}.</span>
                                <span class="font-bold">${k.name}</span>
                                <span style="position: absolute; right: 16px; font-size: 11px; opacity: 0.9;">${k.suffix}</span>
                            </button>
                        `;
                    });
                }
                quickKeysList.innerHTML = html;
            } else {
                quickKeysHeader.style.display = 'none';
                quickKeysList.style.display = 'none';
            }
        }

        // 更新歷史自訂金鑰按鈕顯示
        const customKey = localStorage.getItem('klh_custom_key');
        const customContainer = document.getElementById('klh-custom-key-btn-container');
        if (customContainer) {
            if (customKey && window.isValidUuid(customKey)) {
                customContainer.innerHTML = `
                    <button onclick="handleFastKeyClick(this)" class="btn py-2.5 text-sm bg-slate-800 hover:bg-slate-700 text-yellow-400 font-normal w-full" style="position: relative; display: flex; justify-content: center; align-items: center;" data-key="${customKey}">
                        <span style="position: absolute; left: 16px;">⭐</span>
                        <span class="font-bold">歷史自訂金鑰</span>
                        <span style="position: absolute; right: 16px; font-size: 11px; opacity: 0.9;">(${customKey.substring(0, 8)}...)</span>
                    </button>
                `;
            } else {
                customContainer.innerHTML = '';
            }
        }
    };

    window.switchToLocalMode = function () {
        const currentMode = localStorage.getItem('klh_storage_mode') || 'local';
        if (currentMode === 'local') return;

        localStorage.setItem('klh_storage_mode', 'local');
        window.updateStorageModeUI();
        if (typeof refreshLoadBtnVisibility === 'function') {
            refreshLoadBtnVisibility();
        }

        // 重新渲染存檔選擇畫面 (如果目前開著)
        const slotSelectPanel = document.getElementById('slot-select-panel');
        if (slotSelectPanel && !slotSelectPanel.classList.contains('hidden')) {
            if (typeof openSlotSelect === 'function') {
                openSlotSelect(window._slotMode || 'load');
            }
        }
        window.showToast('已切換回本地儲存模式，存檔將只保存在本機瀏覽器。', 'success');
    };

    window.switchToCloudMode = async function () {
        localStorage.setItem('klh_storage_mode', 'cloud');
        window.updateStorageModeUI();

        // 切換到雲端時，自動同步一次雲端
        await window.syncFromCloud(true);

        // 重新渲染存檔選擇畫面 (如果目前開著)
        const slotSelectPanel = document.getElementById('slot-select-panel');
        if (slotSelectPanel && !slotSelectPanel.classList.contains('hidden')) {
            if (typeof openSlotSelect === 'function') {
                openSlotSelect(window._slotMode || 'load');
            }
        }
    };

    // 注入雲端存檔 UI 至主畫面
    function initCloudSaveUI() {
        const mainMenu = document.getElementById('main-menu');
        if (!mainMenu) return;
        if (document.getElementById('cloud-save-container')) return;

        const container = document.createElement('div');
        container.id = 'cloud-save-container';
        container.className = 'w-80 flex flex-col gap-3 mt-6 p-4 rounded-xl border border-slate-700 bg-slate-900/40 text-center';

        const hasSupabase = (typeof window.switchToSupabaseMode === 'function');
        const hasCloud = (typeof window.switchToCloudMode === 'function');

        let buttonsHtml = `<button id="btn-switch-local" onclick="switchToLocalMode()" class="btn flex-1 py-2 text-[10px] bg-slate-800 hover:bg-slate-700 text-white font-bold whitespace-nowrap">切回本地</button>`;
        if (hasSupabase) {
            buttonsHtml += `<button id="btn-switch-supabase" onclick="switchToSupabaseMode()" class="btn flex-1 py-2 text-[10px] bg-slate-800 hover:bg-slate-700 text-white font-bold whitespace-nowrap">切回雲端</button>`;
        }
        if (hasCloud) {
            buttonsHtml += `<button id="btn-switch-cloud" onclick="switchToCloudMode()" class="btn flex-1 py-2 text-[10px] bg-slate-800 hover:bg-slate-700 text-white font-bold whitespace-nowrap">Jsonblob</button>`;
        }

        container.innerHTML = `
            <div class="text-sm font-bold text-yellow-500">存檔儲存模式</div>
            <div id="storage-mode-status" class="text-xs text-slate-300 font-bold bg-slate-950/60 p-2.5 rounded border border-slate-800 flex justify-between items-center">
                <span>目前存檔模式：</span>
                <span id="current-storage-mode-text" class="font-bold text-green-400">本地模式</span>
            </div>
            
            <div class="flex gap-1.5 w-full">
                ${buttonsHtml}
            </div>

            <div id="cloud-settings-section" class="flex flex-col gap-3 border-t border-slate-800 pt-3" style="display: none;">
                <input id="jsonblob-input" type="text" class="w-full bg-slate-950 border border-slate-700 text-white rounded px-3 py-2.5 text-sm text-center focus:outline-none focus:border-yellow-500">
                <div class="w-full">
                    <button onclick="handleCloudSaveReadClick()" class="btn w-full py-2.5 text-sm bg-indigo-700 hover:bg-indigo-600 border-indigo-500 font-bold">手動讀取雲端</button>
                </div>
                <div id="klh-quick-keys-header" class="text-[11px] text-slate-400 font-bold mt-1">快速切換公用金鑰：</div>
                <div id="klh-quick-keys-list" class="flex flex-col gap-1.5 text-sm"></div>
            </div>
        `;
        mainMenu.appendChild(container);

        // 初始化狀態更新
        window.updateStorageModeUI();
    }

    // 攔截 saveGame() / saveWarehouse() / loadGame() / slotSummary()
    if (!window.__klh_save_game_wrapped) {
        window.__klh_save_game_wrapped = true;
        const originalSaveGame = window.saveGame;
        window.saveGame = async function () {
            if (player && player.dead) return;

            // 🚀 開關開啟時，在寫檔前清理協力傭兵的背包與過濾設定以精簡存檔
            let originalAllies = null;
            if (window.CLEAN_ALLY_DATA_ON_SAVE && player && player.allies) {
                originalAllies = JSON.parse(JSON.stringify(player.allies));
                player.allies.forEach(ally => {
                    if (ally) {
                        ally.inv = [];
                        ally.junkPrefs = {};
                    }
                });
            }

            originalSaveGame();

            // 🚀 寫檔後立刻在記憶體中還原原本的傭兵背包與設定，確保對運行中的遊戲完全無副作用
            if (originalAllies && player) {
                player.allies = originalAllies;
            }

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

            const storageMode = localStorage.getItem('klh_storage_mode') || 'local';
            if (storageMode === 'cloud') {
                if (typeof window.uploadToCloud === 'function') {
                    return await window.uploadToCloud();
                }
            } else if (storageMode === 'supabase') {
                if (typeof window.uploadToSupabase === 'function') {
                    return await window.uploadToSupabase();
                }
            }
        };
    }

    if (!window.__klh_save_warehouse_wrapped) {
        window.__klh_save_warehouse_wrapped = true;
        const originalSaveWarehouse = window.saveWarehouse;
        window.saveWarehouse = async function (w) {
            originalSaveWarehouse(w);

            const storageMode = localStorage.getItem('klh_storage_mode') || 'local';
            if (storageMode === 'cloud') {
                if (typeof window.uploadToCloud === 'function') {
                    return await window.uploadToCloud();
                }
            } else if (storageMode === 'supabase') {
                if (typeof window.uploadToSupabase === 'function') {
                    return await window.uploadToSupabase();
                }
            }
        };
    }

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
        // 🚀 不在此處自動預填空存檔，以保持與雲端一致的真實狀態
        // checkAndPrepopulateSlots();
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
                "0012k1i6d226", // 太陽神阿波羅
                "0012k1i6d227", // 火神赫發斯特斯
                "0012k1i6d228", // 勝利女神雅典那
                "0012k1i6d229", // 天后海拉
                "0012k1i6d230"  // 天神宙斯
            ];
            isMultiplied = SUPABASE_MULTIPLIED_KEYS.includes(activeKeyLower);
        }
        const multStats = isMultiplied ? 2 : 1;
        let capN = 20 * multStats; // 創角階段各屬性最高點調至 20 * 倍率
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

        // 根據遊戲規則與創角順序動態分配屬性點數：依據「力量滿上限再分配至敏捷、敏捷滿上限再分配至體質...」之規則進行分配
        let baseStr = 32, baseDex = 24, baseCon = 28, baseInt = 16, baseWis = 18, baseCha = 16, pts = 24;
        let multStats = 2; // 預設屬性倍率

        if (typeof createBase !== 'undefined' && createBase.knight) {
            let knightBase = createBase.knight;
            baseStr = knightBase.str;
            baseDex = knightBase.dex;
            baseCon = knightBase.con;
            baseInt = knightBase.int;
            baseWis = knightBase.wis;
            baseCha = knightBase.cha;
            pts = knightBase.pts;
            // 透過「當前力量值 / 騎士原始力量值 16」動態推算目前的屬性倍率，以支援未來任何倍率 (如 1.5x、3x 等)
            multStats = baseStr / 16;
        }

        const capN = 20 * multStats; // 創角階段單屬性上限：原始上限 20 乘以動態倍率
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
                continue; // 手動清空的存檔位，不自動預填
            }
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
        const storageMode = localStorage.getItem('klh_storage_mode') || 'local';
        if (storageMode === 'cloud') {
            window.uploadToCloud(false, true);
        }

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

        localStorage.removeItem('lineage_idle_save_' + n + '_empty_flag');
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
                hell: "【地獄】怪物強度 3.0x，掉寶率 3.0x，金幣量 3.0x，<br>增益藥水效力 0.8x。出怪延遲 0.1秒。<br><span class=\"text-rose-400 font-semibold\">「無盡的絕望深淵，唯有強者能在冥界烈火中存活。」</span>",
                nightmare: "【惡夢】怪物強度 1.5x，掉寶率 1.5x，金幣量 1.5x，<br>增益藥水效力 0.9x。出怪延遲 1.0秒 / 日光 0.3秒。<br><span class=\"text-orange-400 font-semibold\">「恐懼與迷霧籠罩，稍有不慎便會墮入萬劫不復深淵。」</span>",
                standard: "【標準】怪物強度 1.0x，掉寶率 1.0x，金幣量 1.0x，<br>增益藥水效力 1.0x。出怪延遲 5.0秒 / 日光 1.0秒。<br><span class=\"text-slate-400 font-semibold\">「命運之輪平穩運轉，適合所有尋求經典冒險的旅者。」</span>",
                blessing: "【祝福】怪物強度 0.9x，掉寶率 1.5x，金幣量 1.5x，<br>增益藥水效力 1.0x。出怪延遲 1.0秒 / 日光 0.3秒。<br><span class=\"text-emerald-400 font-semibold\">「神聖的光芒庇護著大地，豐饒與幸運伴隨你的每一步。」</span>",
                heaven: "【天堂】怪物強度 0.8x，掉寶率 2.0x，金幣量 2.0x，<br>增益藥水效力 2.0x。出怪延遲 1.0秒 / 日光 0.1秒。<br><span class=\"text-sky-400 font-semibold\">「諸神眷顧的極樂之地，怪孱弱而寶藏無窮的夢幻旅途。」</span>"
            };
            descEl.innerHTML = descs[diff] || "";
        }
    };

    window.deleteSingleSave = function (n) {
        if (typeof window.openGMShop !== 'function') {
            window.showToast('權限不足：單獨刪除存檔僅限 GM 權限使用！', 'error');
            return;
        }
        if (checkIsPrivileged()) {
            window.showToast('特權金鑰限制：禁止刪除此存檔！', 'error');
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
            window.uploadToCloud(false, false, n);
        }
        window.openSlotSelect(window._slotMode || 'load');
        window.showToast(`已成功刪除存檔 ${n}！`, 'success');
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
                <div id="diff-desc" class="w-full max-w-md text-xs text-slate-300 text-center border border-slate-800 bg-slate-950/40 rounded p-3 leading-relaxed"></div>
            `;
            titleEl.parentNode.insertBefore(diffPanel, titleEl.nextSibling);
        }

        // 延用當前難度與手動選擇標記，防止因非同步同步刷新而重置難度
        window.selectDifficulty(window.gameDifficulty || 'standard', window.difficultyManuallySelected);

        let list = document.getElementById('slot-list'); list.innerHTML = '';

        // 🚀 如果目前正在非同步下載/同步雲端存檔中，顯示同步提示並中斷渲染，防止載入到舊的快取存檔
        if (window.isCloudSyncing) {
            list.innerHTML = `<div class="w-full text-center py-8 text-indigo-400 font-bold flex flex-col items-center gap-3">
                <div class="klh-loading-spinner" style="width:36px; height:36px; border-top-color:#818cf8; border-left-color:rgba(129,140,248,0.1); border-right-color:rgba(129,140,248,0.1); border-bottom-color:rgba(129,140,248,0.1);"></div>
                <span>正在同步雲端存檔中，請稍候...</span>
            </div>`;
            return;
        }

        // 🚀 為了確保與雲端伺服器誠實一致，我們不在此處自動預填空存檔
        // checkAndPrepopulateSlots();

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
            let importBtn = `<button onclick="importSave(${n})" class="btn flex-1 min-w-0 py-4 px-1 text-sm font-bold bg-indigo-700 hover:bg-indigo-600 border-indigo-500 whitespace-nowrap">匯入</button>`;
            let restoreBtn = bak ? `<button onclick="restoreBackup(${n})" title="復原匯入前自動備份的存檔（${bak.cls} Lv.${bak.lv}　${bak.name}）" class="btn flex-1 min-w-0 py-4 px-1 text-sm font-bold bg-amber-700 hover:bg-amber-600 border-amber-500 whitespace-nowrap">復原</button>` : '';
            let deleteBtn = (sum && typeof window.openGMShop === 'function') ? `<button onclick="deleteSingleSave(${n})" class="btn py-4 px-2 text-sm font-bold bg-red-700 hover:bg-red-600 border-red-500 whitespace-nowrap" style="width: 50px; flex-shrink: 0;">刪除</button>` : '';

            let actionArea = '';
            if (mode === 'load') {
                actionArea = `<div class="flex gap-1 shrink-0 w-56">${importBtn}${restoreBtn}${deleteBtn}</div>`;
            } else {
                if (sum && typeof window.openGMShop === 'function') {
                    actionArea = `<div class="flex gap-1 shrink-0 w-14">${deleteBtn}</div>`;
                }
            }
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

    // 創角階段上限為原本+20 (防止作者日後變動，動態改寫為原本上限+20)
    patchGlobalFunctionMultiple('adjStat', [
        {
            find: /let capN = (\d+);/,
            replace: "let capN = parseInt($1) * ((['019ebb1f-b31c-769f-8475-02be610a13b0', '019ebb3a-0d11-7569-a341-463d28054478', '019ebb3a-58de-78fd-8139-eca46c089de3', '019ebb3a-ad04-76f1-81df-d15d7b2d03d0', '019ebb3a-e777-7ab7-b744-aaab13066231'].includes((window.activeKey || '').trim().toLowerCase()) && (localStorage.getItem('klh_storage_mode') || 'local') === 'cloud') ? 2 : 1);"
        }
    ]);

    // 遊戲內配點上限為原本+40 (動態改寫為原本上限+40)
    patchGlobalFunctionMultiple('adjBonusStat', [
        {
            find: /let capN = (\d+);/,
            replace: 'let capN = parseInt($1) + 40;'
        }
    ]);

    // 萬能藥單項屬性上限為原本+40 (動態改寫為原本上限+40)
    patchGlobalFunctionMultiple('useItem', [
        {
            find: /let st = d\.pstat,\s*cap = (\d+);/,
            replace: 'let st = d.pstat, cap = parseInt($1) + 40;'
        }
    ]);

    // 動態修改萬能藥說明文字中的上限描述為原本上限+40
    if (typeof DB !== 'undefined' && DB.items) {
        for (let itemId in DB.items) {
            let item = DB.items[itemId];
            if (item && item.eff === 'panacea' && item.d) {
                item.d = item.d.replace(/上限\s*(\d+)/g, (match, p1) => {
                    const originalVal = parseInt(p1, 10);
                    return `上限${originalVal + 40}`;
                });
            }
        }
    }

    // ==========================================
    // 6. 6大屬性 70 至 120 級距查表與上限擴充
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
    // 7. 初始化執行與自動同步
    // ==========================================
    let started = false;
    function startup() {
        if (started) return;
        started = true;

        // 預設是切回雲端 (supabase)
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
            // 建立按鈕
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

            // 建立說明面板
            const panel = document.createElement('div');
            panel.id = 'thanks-panel';
            panel.className = 'hidden w-full max-w-2xl mx-auto bg-slate-950/80 border border-slate-800 rounded-xl p-4 mt-3 text-left overflow-y-auto max-h-[260px] transition-all duration-300 shadow-inner';
            panel.innerHTML = `
                <div class="text-yellow-400 font-bold text-base border-b border-slate-800 pb-2 mb-3 flex items-center gap-1.5">
                    🛠️ 與原版差異更新說明
                </div>
                <div class="flex flex-col gap-3.5 text-sm text-slate-300 leading-relaxed">
                    <div>
                        <span class="font-bold text-amber-300">1. 全新雲端存檔功能</span>
                        <p class="pl-4 text-slate-400">支援公用金鑰（所有人皆可改寫）與 Jsonblob 個人私鑰。</p>
                        <p class="pl-4 text-rose-400 font-semibold mt-0.5">⚠️ 注意事項：私鑰需註冊免費會員，若連續 3 天未登入將會刪除帳號；未註冊者不論是否登入，滿 1 天即會自動刪除帳號。</p>
                    </div>
                    <div>
                        <span class="font-bold text-amber-300">2. 難易度自由切換</span>
                        <p class="pl-4 text-slate-400">新增遊戲難易度隨時、隨意切換功能，關卡挑戰更彈性。</p>
                    </div>
                    <div>
                        <span class="font-bold text-amber-300">3. 初始福利大放送</span>
                        <p class="pl-4 text-slate-200 font-semibold">初始屬性點數翻倍，可分配屬性點數也是雙倍 (2倍) 設定，讓您開局即是強者！</p>
                        <p class="pl-4 text-slate-400 mt-0.5">（本地模式、自訂金鑰與水蛇許德拉伺服器除外，維持原版 1 倍設定）</p>
                    </div>
                    <div>
                        <span class="font-bold text-amber-300">4. 全新金幣抽獎系統</span>
                        <p class="pl-4 text-slate-400">「潘朵拉的妹妹」神秘降臨！她偷偷帶走了姐姐藏寶庫中的稀世神裝，讓冒險者能用閃亮的金幣進行轉蛋。不過，為了維護亞丁大陸的物價平衡，諸神稍微對她的魔法機率動了點手腳，以免神裝氾濫成災！</p>
                    </div>
                    <div>
                        <span class="font-bold text-amber-300">5. 煉金術的究極補給</span>
                        <p class="pl-4 text-slate-400">象牙塔研究室的瘋狂煉金術士們終於爆肝研發出突破性成果！現在可在商店購得「濃縮白水」與「超級濃縮白水」，更有能獲得幸運女神微笑的「掉寶藥水」與「神之祝福藥水」，讓你的獵殺之旅效率倍增！</p>
                    </div>
                    <div>
                        <span class="font-bold text-amber-300">6. 時光裂縫與重獲新生</span>
                        <p class="pl-4 text-slate-400">象牙塔的「時光使者」開啟了禁忌的轉生法陣！當你的實力達到 75 級的凡人極限，即可選擇打破肉身重獲新生，不僅能保留你強大的天賦，還能獲得神明額外賜予的屬性點數，重登巔峰！</p>
                    </div>
                    <div>
                        <span class="font-bold text-amber-300">7. 赫爾溫的背包整理術</span>
                        <p class="pl-4 text-slate-400">總是為雜亂的背包頭痛嗎？赫爾溫大師為你解鎖了強大的次元背包整理術！新增「批量賣出」與「模糊搜尋」功能，彈指間就能清除海量垃圾廢品，讓你的行囊如施展了極道防護般清爽！</p>
                    </div>
                    <div>
                        <span class="font-bold text-amber-300">8. 奇岩「財富收割者」黑市</span>
                        <p class="pl-4 text-slate-400">奇岩城鎮的陰暗角落出現了神祕的黑市商人「財富收割者」！他串聯了無形的次元雲端市場，讓全亞丁的行者都能在此自由上架寄售神兵利器、隨時提領金幣，享受一夜暴富的快感！</p>
                    </div>
                    <div>
                        <span class="font-bold text-amber-300">9. 死神席琳的禁忌共鳴</span>
                        <p class="pl-4 text-slate-400">死神席琳的眼淚落入凡間，化為了蘊含無盡黑暗力量的「席琳結晶」！只要在裝備介面輕輕捏碎一顆結晶，就能為你手中的特定神兵防具注入禁忌的靈魂共鳴，強行激活傳說中的九大混沌套裝效果！</p>
                    </div>
                    <div>
                        <span class="font-bold text-amber-300">10. 屬性配點與萬能藥上限提升</span>
                        <p class="pl-4 text-slate-400">屬性升級配點上限提升 +40，萬能藥使用上限也提升 +40；同時六大屬性的查表公式全面擴充延伸（70 至 120 級距），單項屬性最高上限可達 120，突破凡人極限！</p>
                    </div>
                </div>
            `;

            // 註冊點擊事件
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

        initCloudSaveUI();
        // registerRebirthNPC(); // Moved to klh_GM2.js
        attachHoldEventsToStatButtons();
        attachHoldEventsToInGameStatButtons();

        // 修正 _slotMode 作用域遮蔽問題與清理空存檔標記
        patchGlobalFunctionMultiple('importSave', [
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
                find: `localStorage.setItem('lineage_idle_save_' + n, bak);`,
                replace: `localStorage.setItem('lineage_idle_save_' + n, bak); localStorage.removeItem('lineage_idle_save_' + n + '_empty_flag');`
            },
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
                const storageMode = localStorage.getItem('klh_storage_mode') || 'local';
                const loadMsg = storageMode === 'cloud'
                    ? "正在儲存並同步至雲端，請稍候..."
                    : "正在儲存進度，請稍候...";

                if (msgEl) {
                    msgEl.innerHTML = loadMsg;
                }
                const btnsEl = document.getElementById('m-logout-btns');
                if (btnsEl) btnsEl.style.display = 'none';

                // 🚀 使用全螢幕遮罩擋住整個畫面，並顯示進度條，防止玩家點擊旁邊取消
                if (typeof window.showLoadingOverlay === 'function') {
                    window.showLoadingOverlay(loadMsg);
                }

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

                // 🚀 隱藏遮罩（這會將進度條衝到 100% 並延遲 300ms 關閉）
                if (typeof window.hideLoadingOverlay === 'function') {
                    window.hideLoadingOverlay();
                }

                // 🚀 額外延遲 350ms，讓 100% 的進度條動畫播放完畢，再重新整理網頁
                setTimeout(() => {
                    try {
                        location.reload();
                    } catch (err) { }
                }, 350);
            }
        }, true); // 注意：必須設為 true 以啟用捕獲階段攔截！

        // 自動雲端載入並同步（僅在雲端模式下執行）
        const initialStorageMode = localStorage.getItem('klh_storage_mode') || 'local';
        if (initialStorageMode === 'cloud') {
            window.syncFromCloud(false).then(() => {
                refreshLoadBtnVisibility();
            });
        } else if (initialStorageMode === 'supabase') {
            if (typeof window.syncFromSupabase === 'function') {
                window.syncFromSupabase(false).then(() => {
                    refreshLoadBtnVisibility();
                });
            } else {
                refreshLoadBtnVisibility();
            }
        } else {
            refreshLoadBtnVisibility();
        }

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

    // 解決 iOS 虛擬鍵盤彈起導致網頁滾動、錯位且收起時不回彈的 bug
    // ⚠ 防止與 klh_supabase.js 重複註冊（兩邊同時載入時只需一組 listener）
    if (!window.__klh_keyboard_listeners_attached) {
        window.__klh_keyboard_listeners_attached = true;
        let isKeyboardOpened = false;
        document.addEventListener('focusin', function (e) {
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) {
                document.body.classList.add('m-keyboard-open');
                isKeyboardOpened = true;
            }
        });

        document.addEventListener('focusout', function (e) {
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) {
                document.body.classList.remove('m-keyboard-open');
                isKeyboardOpened = false;
                setTimeout(() => {
                    window.scrollTo(0, 0);
                    document.body.scrollTop = 0;
                }, 50);
            }
        });

        // 解決 iOS 鍵盤彈出時強行滾動視窗 (window scroll) 導致 fixed 佈局整體偏移飛走的 bug
        window.addEventListener('scroll', function () {
            if (isKeyboardOpened && (window.scrollY > 0 || document.body.scrollTop > 0)) {
                window.scrollTo(0, 0);
                document.body.scrollTop = 0;
            }
        });

        // 利用 visualViewport 雙重保險偵測鍵盤收起（解決 iOS 點擊鍵盤「完成」後不觸發 blur/focusout 導致選單消失的 bug）
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', function () {
                const vv = window.visualViewport;
                // 計算真實 Layout 視窗高度，防止 pinch-zoom 影響判斷
                const currentHeight = vv.height * (vv.scale || 1);
                const standardHeight = window.innerHeight;
                
                // 如果目前高度已恢復（大於標準高度減 100px），代表鍵盤已關閉
                if (currentHeight >= (standardHeight - 100)) {
                    if (document.body.classList.contains('m-keyboard-open')) {
                        document.body.classList.remove('m-keyboard-open');
                        isKeyboardOpened = false;
                        
                        // 強制讓輸入框失焦，確保觸發 focusout 事件與同步狀態
                        if (document.activeElement && 
                            (document.activeElement.tagName === 'INPUT' || 
                             document.activeElement.tagName === 'SELECT' || 
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

    document.addEventListener('DOMContentLoaded', startup);
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
        startup();
    }

})();