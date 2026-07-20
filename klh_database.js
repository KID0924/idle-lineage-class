/* ============================================================================
 * klh_database.js — 雲端存檔引擎 (JSONBlob + Supabase 雙引擎合一)
 *
 * 設計原則:
 *   1. 完全不改原作者程式碼 —— 僅透過從外部「包住」全域函式 (Monkey-Patch) 進行擴充。
 *   2. 優雅降級與安全降載 —— 核心 Hook 皆以 try-catch 沙盒包裹並配備 typeof 存在性檢查，
 *                         若原作者未來改版導致函式或變數消失，外掛功能會默默安全降級或停用，
 *                         確保絕對不拋出致命 JS 錯誤，完全保障原版遊戲流程不中斷。
 *   3. 存檔安全機制 (雙引擎) —— 具有本地 / 雲端雙備份引擎，當偵測到本地存檔異常遺失或為 null 時，
 *                         能精確攔截防止洗白雲端數據，確保金鑰隔離與特權安全。
 *
 * 掛接方式: 在 index.html 中，於 klh_initial.js 之後載入：
 *   <script src="klh_initial.js?v=20260628"></script>
 *   <script src="klh_database.js?v=20260628"></script>
 *
 * 功能一覽:
 *   1. 雲端存檔 (JSONBlob)  —— 透過 JSONBlob API 讀寫全部存檔槽 + 倉庫，支援直接連線或自訂 CORS 代理備援。
 *   2. 雲端存檔 (Supabase)  —— 透過 Supabase Database API 儲存最多 N 格存檔與倉庫，含 LZ-String 壓縮。
 *   3. Storage Proxy 代理   —— Hook Storage 原生方法，在雲端模式下自動重定向存檔鍵至雲端快取鍵 + 金鑰後綴。
 *   4. Toast / Loading UI   —— 全域通知 Toast 與讀取動畫進度條 UI 元件。
 *   5. 模式切換 UI          —— 於主選單注入本地/Supabase/Jsonblob 模式切換按鈕與快速切換公用金鑰。
 *   6. saveGame/saveWarehouse Hook —— 攔截存檔寫入後自動上傳至雲端。
 *   7. 登出安全攔截         —— 攔截手機版登出確認，在雲端上傳完成前顯示全域阻擋遮罩。
 *   8. Null 覆蓋災難攔截   —— 上傳前偵測本地存檔異常為空時強制攔截，避免洗白雲端。
 *   9. 本機金鑰過期防護    —— Supabase 金鑰失效時自動生成新金鑰並上傳同步。
 * ========================================================================== */

(function () {
    'use strict';

    // ==========================================================================
    // 【儲存引擎總開關】可藉由修改此數字來切換啟用的雲端儲存引擎
    // 1 = 僅啟用 Supabase (雲端金鑰)
    // 2 = 僅啟用 JSONBlob
    // 3 = 僅啟用 Firebase
    // 4 = Supabase + JSONBlob
    // 5 = Supabase + Firebase
    // 6 = JSONBlob + Firebase
    // 7 = 全引擎皆啟用 (Supabase + JSONBlob + Firebase)
    // 8 = 全引擎皆關閉 (僅留本地儲存)
    // ==========================================================================
    const ENGINE_SWITCH = 7;

    const allowSupabase = (ENGINE_SWITCH === 1 || ENGINE_SWITCH === 4 || ENGINE_SWITCH === 5 || ENGINE_SWITCH === 7);
    const allowJsonBlob = (ENGINE_SWITCH === 2 || ENGINE_SWITCH === 4 || ENGINE_SWITCH === 6 || ENGINE_SWITCH === 7);
    const allowFirebase = (ENGINE_SWITCH === 3 || ENGINE_SWITCH === 5 || ENGINE_SWITCH === 6 || ENGINE_SWITCH === 7);

    // ==========================================
    // 0. 內嵌 LZ-String 核心壓縮/解壓縮演算法 (Supabase 用)
    // (精簡版，僅包含 compressToBase64 / decompressFromBase64)
    // 來源: https://github.com/pieroxy/lz-string (MIT License)
    // ==========================================
    var LZString = (function() {
        var f = String.fromCharCode;
        var keyStrBase64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
        var baseReverseDic = {};

        function getBaseValue(alphabet, character) {
            if (!baseReverseDic[alphabet]) {
                baseReverseDic[alphabet] = {};
                for (var i = 0; i < alphabet.length; i++) {
                    baseReverseDic[alphabet][alphabet.charAt(i)] = i;
                }
            }
            return baseReverseDic[alphabet][character];
        }

        function _compress(uncompressed, bitsPerChar, getCharFromInt) {
            if (uncompressed == null) return "";
            var i, value,
                context_dictionary = {},
                context_dictionaryToCreate = {},
                context_c = "",
                context_wc = "",
                context_w = "",
                context_enlargeIn = 2,
                context_dictSize = 3,
                context_numBits = 2,
                context_data = [],
                context_data_val = 0,
                context_data_position = 0,
                ii;

            for (ii = 0; ii < uncompressed.length; ii++) {
                context_c = uncompressed.charAt(ii);
                if (!Object.prototype.hasOwnProperty.call(context_dictionary, context_c)) {
                    context_dictionary[context_c] = context_dictSize++;
                    context_dictionaryToCreate[context_c] = true;
                }
                context_wc = context_w + context_c;
                if (Object.prototype.hasOwnProperty.call(context_dictionary, context_wc)) {
                    context_w = context_wc;
                } else {
                    if (Object.prototype.hasOwnProperty.call(context_dictionaryToCreate, context_w)) {
                        if (context_w.charCodeAt(0) < 256) {
                            for (i = 0; i < context_numBits; i++) {
                                context_data_val = (context_data_val << 1);
                                if (context_data_position == bitsPerChar - 1) {
                                    context_data_position = 0;
                                    context_data.push(getCharFromInt(context_data_val));
                                    context_data_val = 0;
                                } else {
                                    context_data_position++;
                                }
                            }
                            value = context_w.charCodeAt(0);
                            for (i = 0; i < 8; i++) {
                                context_data_val = (context_data_val << 1) | (value & 1);
                                if (context_data_position == bitsPerChar - 1) {
                                    context_data_position = 0;
                                    context_data.push(getCharFromInt(context_data_val));
                                    context_data_val = 0;
                                } else {
                                    context_data_position++;
                                }
                                value = value >> 1;
                            }
                        } else {
                            value = 1;
                            for (i = 0; i < context_numBits; i++) {
                                context_data_val = (context_data_val << 1) | value;
                                if (context_data_position == bitsPerChar - 1) {
                                    context_data_position = 0;
                                    context_data.push(getCharFromInt(context_data_val));
                                    context_data_val = 0;
                                } else {
                                    context_data_position++;
                                }
                                value = 0;
                            }
                            value = context_w.charCodeAt(0);
                            for (i = 0; i < 16; i++) {
                                context_data_val = (context_data_val << 1) | (value & 1);
                                if (context_data_position == bitsPerChar - 1) {
                                    context_data_position = 0;
                                    context_data.push(getCharFromInt(context_data_val));
                                    context_data_val = 0;
                                } else {
                                    context_data_position++;
                                }
                                value = value >> 1;
                            }
                        }
                        context_enlargeIn--;
                        if (context_enlargeIn == 0) {
                            context_enlargeIn = Math.pow(2, context_numBits);
                            context_numBits++;
                        }
                        delete context_dictionaryToCreate[context_w];
                    } else {
                        value = context_dictionary[context_w];
                        for (i = 0; i < context_numBits; i++) {
                            context_data_val = (context_data_val << 1) | (value & 1);
                            if (context_data_position == bitsPerChar - 1) {
                                context_data_position = 0;
                                context_data.push(getCharFromInt(context_data_val));
                                context_data_val = 0;
                            } else {
                                context_data_position++;
                            }
                            value = value >> 1;
                        }
                    }
                    context_enlargeIn--;
                    if (context_enlargeIn == 0) {
                        context_enlargeIn = Math.pow(2, context_numBits);
                        context_numBits++;
                    }
                    context_dictionary[context_wc] = context_dictSize++;
                    context_w = String(context_c);
                }
            }
            if (context_w !== "") {
                if (Object.prototype.hasOwnProperty.call(context_dictionaryToCreate, context_w)) {
                    if (context_w.charCodeAt(0) < 256) {
                        for (i = 0; i < context_numBits; i++) {
                            context_data_val = (context_data_val << 1);
                            if (context_data_position == bitsPerChar - 1) {
                                context_data_position = 0;
                                context_data.push(getCharFromInt(context_data_val));
                                context_data_val = 0;
                            } else {
                                context_data_position++;
                            }
                        }
                        value = context_w.charCodeAt(0);
                        for (i = 0; i < 8; i++) {
                            context_data_val = (context_data_val << 1) | (value & 1);
                            if (context_data_position == bitsPerChar - 1) {
                                context_data_position = 0;
                                context_data.push(getCharFromInt(context_data_val));
                                context_data_val = 0;
                            } else {
                                context_data_position++;
                            }
                            value = value >> 1;
                        }
                    } else {
                        value = 1;
                        for (i = 0; i < context_numBits; i++) {
                            context_data_val = (context_data_val << 1) | value;
                            if (context_data_position == bitsPerChar - 1) {
                                context_data_position = 0;
                                context_data.push(getCharFromInt(context_data_val));
                                context_data_val = 0;
                            } else {
                                context_data_position++;
                            }
                            value = 0;
                        }
                        value = context_w.charCodeAt(0);
                        for (i = 0; i < 16; i++) {
                            context_data_val = (context_data_val << 1) | (value & 1);
                            if (context_data_position == bitsPerChar - 1) {
                                context_data_position = 0;
                                context_data.push(getCharFromInt(context_data_val));
                                context_data_val = 0;
                            } else {
                                context_data_position++;
                            }
                            value = value >> 1;
                        }
                    }
                    context_enlargeIn--;
                    if (context_enlargeIn == 0) {
                        context_enlargeIn = Math.pow(2, context_numBits);
                        context_numBits++;
                    }
                    delete context_dictionaryToCreate[context_w];
                } else {
                    value = context_dictionary[context_w];
                    for (i = 0; i < context_numBits; i++) {
                        context_data_val = (context_data_val << 1) | (value & 1);
                        if (context_data_position == bitsPerChar - 1) {
                            context_data_position = 0;
                            context_data.push(getCharFromInt(context_data_val));
                            context_data_val = 0;
                        } else {
                            context_data_position++;
                        }
                        value = value >> 1;
                    }
                }
                context_enlargeIn--;
                if (context_enlargeIn == 0) {
                    context_enlargeIn = Math.pow(2, context_numBits);
                    context_numBits++;
                }
            }
            value = 2;
            for (i = 0; i < context_numBits; i++) {
                context_data_val = (context_data_val << 1) | (value & 1);
                if (context_data_position == bitsPerChar - 1) {
                    context_data_position = 0;
                    context_data.push(getCharFromInt(context_data_val));
                    context_data_val = 0;
                } else {
                    context_data_position++;
                }
                value = value >> 1;
            }
            while (true) {
                context_data_val = (context_data_val << 1);
                if (context_data_position == bitsPerChar - 1) {
                    context_data.push(getCharFromInt(context_data_val));
                    break;
                } else {
                    context_data_position++;
                }
            }
            return context_data.join('');
        }

        function _decompress(length, resetValue, getNextValue) {
            var dictionary = [],
                next, enlargeIn = 4, dictSize = 4, numBits = 3,
                entry = "", result = [], i, w, bits, resb, maxpower, power, c,
                data = {val: getNextValue(0), position: resetValue, index: 1};
            for (i = 0; i < 3; i++) { dictionary[i] = i; }
            bits = 0; maxpower = Math.pow(2, 2); power = 1;
            while (power != maxpower) {
                resb = data.val & data.position; data.position >>= 1;
                if (data.position == 0) { data.position = resetValue; data.val = getNextValue(data.index++); }
                bits |= (resb > 0 ? 1 : 0) * power; power <<= 1;
            }
            switch (next = bits) {
                case 0: bits = 0; maxpower = Math.pow(2, 8); power = 1;
                    while (power != maxpower) { resb = data.val & data.position; data.position >>= 1; if (data.position == 0) { data.position = resetValue; data.val = getNextValue(data.index++); } bits |= (resb > 0 ? 1 : 0) * power; power <<= 1; }
                    c = f(bits); break;
                case 1: bits = 0; maxpower = Math.pow(2, 16); power = 1;
                    while (power != maxpower) { resb = data.val & data.position; data.position >>= 1; if (data.position == 0) { data.position = resetValue; data.val = getNextValue(data.index++); } bits |= (resb > 0 ? 1 : 0) * power; power <<= 1; }
                    c = f(bits); break;
                case 2: return "";
            }
            dictionary[3] = c; w = c; result.push(c);
            while (true) {
                if (data.index > length) { return ""; }
                bits = 0; maxpower = Math.pow(2, numBits); power = 1;
                while (power != maxpower) { resb = data.val & data.position; data.position >>= 1; if (data.position == 0) { data.position = resetValue; data.val = getNextValue(data.index++); } bits |= (resb > 0 ? 1 : 0) * power; power <<= 1; }
                switch (c = bits) {
                    case 0: bits = 0; maxpower = Math.pow(2, 8); power = 1;
                        while (power != maxpower) { resb = data.val & data.position; data.position >>= 1; if (data.position == 0) { data.position = resetValue; data.val = getNextValue(data.index++); } bits |= (resb > 0 ? 1 : 0) * power; power <<= 1; }
                        dictionary[dictSize++] = f(bits); c = dictSize - 1; enlargeIn--; break;
                    case 1: bits = 0; maxpower = Math.pow(2, 16); power = 1;
                        while (power != maxpower) { resb = data.val & data.position; data.position >>= 1; if (data.position == 0) { data.position = resetValue; data.val = getNextValue(data.index++); } bits |= (resb > 0 ? 1 : 0) * power; power <<= 1; }
                        dictionary[dictSize++] = f(bits); c = dictSize - 1; enlargeIn--; break;
                    case 2: return result.join('');
                }
                if (enlargeIn == 0) { enlargeIn = Math.pow(2, numBits); numBits++; }
                if (dictionary[c]) { entry = dictionary[c]; }
                else { if (c === dictSize) { entry = w + w.charAt(0); } else { return null; } }
                result.push(entry);
                dictionary[dictSize++] = w + entry.charAt(0);
                enlargeIn--;
                if (enlargeIn == 0) { enlargeIn = Math.pow(2, numBits); numBits++; }
                w = entry;
            }
        }

        return {
            compressToBase64: function(input) {
                if (input == null) return "";
                var res = _compress(input, 6, function(a) { return keyStrBase64.charAt(a); });
                switch (res.length % 4) { default: case 0: return res; case 1: return res + "==="; case 2: return res + "=="; case 3: return res + "="; }
            },
            decompressFromBase64: function(input) {
                if (input == null) return "";
                if (input == "") return null;
                return _decompress(input.length, 32, function(index) { return getBaseValue(keyStrBase64, input.charAt(index)); });
            }
        };
    })();

    // 雲端存檔解壓輔助函式
    function decompressCloudPayload(data) {
        if (data && typeof data === 'object' && data.__compressed__ === true && typeof data.data === 'string') {
            try {
                const decompressed = LZString.decompressFromBase64(data.data);
                if (!decompressed) { console.error("[雲端存檔] LZ-String 解壓失敗：結果為空"); return null; }
                const parsed = JSON.parse(decompressed);
                console.log("[雲端存檔] 成功解壓縮雲端存檔 (壓縮長度:", data.data.length, "→ 還原長度:", decompressed.length, ")");
                return parsed;
            } catch (e) { console.error("[雲端存檔] 解壓縮或 JSON 解析失敗:", e); return null; }
        }
        return data;
    }

    // ==========================================
    // 1. 動態存檔位偵測與全域註冊
    // ==========================================
    function getMaxSaveSlot() {
        return 16;
    }
    window.getMaxSaveSlot = getMaxSaveSlot;



    // ==========================================
    // 2. localStorage 模式隔離代理 (Storage.prototype)
    // ==========================================
    const originalGetItem = Storage.prototype.__originalGetItem || Storage.prototype.getItem;
    const originalSetItem = Storage.prototype.__originalSetItem || Storage.prototype.setItem;
    const originalRemoveItem = Storage.prototype.__originalRemoveItem || Storage.prototype.removeItem;
    const originalClear = Storage.prototype.__originalClear || Storage.prototype.clear;

    if (!window.__klh_storage_cache) {
        window.__klh_storage_cache = {
            mode: originalGetItem.call(localStorage, 'klh_storage_mode') || 'local',
            supabaseKey: originalGetItem.call(localStorage, 'klh_supabase_key') || '',
            jsonblobUrl: originalGetItem.call(localStorage, 'lineage_idle_jsonblob_url') || '',
            firebaseUrl: originalGetItem.call(localStorage, 'klh_firebase_database_url') || '',
            firebaseSyncId: originalGetItem.call(localStorage, 'klh_firebase_sync_id') || ''
        };
    }

    function getRedirectedKey(key) {
        const mode = window.__klh_storage_cache.mode;
        if ((mode === 'cloud' && allowJsonBlob) || (mode === 'supabase' && allowSupabase) || (mode === 'firebase' && allowFirebase)) {
            let activeKey;
            if (mode === 'supabase') {
                activeKey = window.__klh_storage_cache.supabaseKey;
            } else if (mode === 'firebase') {
                activeKey = window.__klh_storage_cache.firebaseSyncId;
            } else {
                activeKey = window.activeKey || window.__klh_storage_cache.jsonblobUrl;
            }
            if (activeKey) {
                const suffix = '_' + activeKey.trim();
                if (key.startsWith('lineage_idle_save_') || key === 'lineage_idle_warehouse') {
                    return key.replace('lineage_idle_save_', 'klh_cloud_save_').replace('lineage_idle_warehouse', 'klh_cloud_warehouse') + suffix;
                }
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
            try { return originalGetItem.call(this, getRedirectedKey(key)); }
            catch (e) { console.error("[KLH] Storage.getItem override error:", e); return originalGetItem.call(this, key); }
        };

        Storage.prototype.setItem = function (key, value) {
            try {
                if (key === 'klh_storage_mode') {
                    const oldMode = originalGetItem.call(this, 'klh_storage_mode');
                    const newMode = value || 'local';
                    window.__klh_storage_cache.mode = newMode;
                    if (oldMode !== newMode) {
                        setTimeout(() => { if (typeof window.cleanUnusedCloudCaches === 'function') window.cleanUnusedCloudCaches(); }, 100);
                    }
                } else if (key === 'klh_supabase_key') {
                    const oldKey = originalGetItem.call(this, 'klh_supabase_key');
                    const newKey = (value || '').trim();
                    window.__klh_storage_cache.supabaseKey = newKey;
                    if (oldKey && newKey && oldKey !== newKey) {
                        setTimeout(() => { if (typeof window.cleanUnusedCloudCaches === 'function') window.cleanUnusedCloudCaches(); }, 100);
                    }
                } else if (key === 'lineage_idle_jsonblob_url') {
                    const oldKey = originalGetItem.call(this, 'lineage_idle_jsonblob_url');
                    const newKey = (value || '').trim();
                    window.__klh_storage_cache.jsonblobUrl = newKey;
                    if (oldKey && newKey && oldKey !== newKey) {
                        setTimeout(() => { if (typeof window.cleanUnusedCloudCaches === 'function') window.cleanUnusedCloudCaches(); }, 100);
                    }
                } else if (key === 'klh_firebase_database_url') {
                    window.__klh_storage_cache.firebaseUrl = (value || '').trim();
                } else if (key === 'klh_firebase_sync_id') {
                    const oldKey = originalGetItem.call(this, 'klh_firebase_sync_id');
                    const newKey = (value || '').trim();
                    window.__klh_storage_cache.firebaseSyncId = newKey;
                    if (oldKey && newKey && oldKey !== newKey) {
                        setTimeout(() => { if (typeof window.cleanUnusedCloudCaches === 'function') window.cleanUnusedCloudCaches(); }, 100);
                    }
                }
                return originalSetItem.call(this, getRedirectedKey(key), value);
            } catch (e) { console.error("[KLH] Storage.setItem override error:", e); return originalSetItem.call(this, key, value); }
        };

        Storage.prototype.removeItem = function (key) {
            try {
                if (key === 'klh_storage_mode') window.__klh_storage_cache.mode = 'local';
                else if (key === 'klh_supabase_key') window.__klh_storage_cache.supabaseKey = '';
                else if (key === 'lineage_idle_jsonblob_url') window.__klh_storage_cache.jsonblobUrl = '';
                else if (key === 'klh_firebase_database_url') window.__klh_storage_cache.firebaseUrl = '';
                else if (key === 'klh_firebase_sync_id') window.__klh_storage_cache.firebaseSyncId = '';
                return originalRemoveItem.call(this, getRedirectedKey(key));
            } catch (e) { console.error("[KLH] Storage.removeItem override error:", e); return originalRemoveItem.call(this, key); }
        };
    }

    if (!Storage.prototype.__klh_clear_patched) {
        Storage.prototype.__klh_clear_patched = true;
        Storage.prototype.__originalClear = originalClear;
        Storage.prototype.clear = function () {
            try {
                if (window.__klh_storage_cache) {
                    window.__klh_storage_cache.mode = 'local';
                    window.__klh_storage_cache.supabaseKey = '';
                    window.__klh_storage_cache.jsonblobUrl = '';
                    window.__klh_storage_cache.firebaseUrl = '';
                    window.__klh_storage_cache.firebaseSyncId = '';
                }
                return originalClear.call(this);
            } catch (e) { console.error("[KLH] Storage.clear override error:", e); return originalClear.call(this); }
        };
    }

    // ==========================================
    // 3. 雲端同步狀態與 UI 輔助函式
    // ==========================================
    window.isCloudSyncing = window.isCloudSyncing || false;
    if (typeof window.__klh_cloud_sync_success === 'undefined') {
        window.__klh_cloud_sync_success = false;
    }

    // 💡 雲端快取垃圾清理器：自動掃描並刪除所有跟當前啟用的 Key/ID 無關的過期快取檔案，防範 localStorage 堆積
    window.cleanUnusedCloudCaches = function () {
        const mode = localStorage.getItem('klh_storage_mode') || 'local';
        const activeKeys = new Set();
        
        // 僅保留當前啟用的雲端儲存引擎之「目前登入金鑰/存檔」的快取，其他模式與其他金鑰的快取一律清除
        if (mode === 'supabase' && allowSupabase) {
            const sbKey = (localStorage.getItem('klh_supabase_key') || '').trim();
            if (sbKey) activeKeys.add(sbKey);
        } else if (mode === 'cloud' && allowJsonBlob) {
            const jbKey = (window.activeKey || localStorage.getItem('lineage_idle_jsonblob_url') || '').trim();
            if (jbKey) activeKeys.add(jbKey);
        } else if (mode === 'firebase' && allowFirebase) {
            const fbKey = (localStorage.getItem('klh_firebase_sync_id') || '').trim();
            if (fbKey) activeKeys.add(fbKey);
        }
        
        let deleteCount = 0;
        const keysToRemove = [];
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key) continue;
            
            // 🔒 快取安全限制：僅允許清理以 klh_ 開頭的雲端存檔/倉庫快取，絕不碰觸原版或任何插件的 afk_ 等非 klh_ 鍵值以防未來出錯
            if (key.startsWith('klh_cloud_save_') || key.startsWith('klh_cloud_warehouse')) {
                let isOrphan = true;
                for (const actKey of activeKeys) {
                    if (key.endsWith('_' + actKey)) {
                        isOrphan = false;
                        break;
                    }
                }
                if (isOrphan) {
                    keysToRemove.push(key);
                }
            }
        }
        
        keysToRemove.forEach(k => {
            originalRemoveItem.call(localStorage, k);
            deleteCount++;
        });
        
        if (deleteCount > 0) {
            console.log(`[KLH Cache Sweeper] 已成功自動清理 ${deleteCount} 個與當前金鑰無關的快取檔案。`);
        }
        return deleteCount;
    };

    // 🔍 本地快取即時檢視視窗
    window.showStorageInspectorModal = function () {
        const oldBackdrop = document.getElementById('klh-inspector-backdrop');
        if (oldBackdrop) oldBackdrop.remove();
        
        const backdrop = document.createElement('div');
        backdrop.id = 'klh-inspector-backdrop';
        backdrop.style.cssText = 'position: fixed; inset: 0; background: rgba(15, 23, 42, 0.75); backdrop-filter: blur(2px); z-index: 100000; display: flex; align-items: center; justify-content: center; opacity: 1; transition: opacity 0.2s ease-in-out;';
        
        const content = document.createElement('div');
        content.style.cssText = 'background: #0f172a; border: 2px solid #334155; border-radius: 16px; width: 90%; max-width: 320px; padding: 20px; color: white; display: flex; flex-direction: column; gap: 10px; max-height: 80vh; overflow-y: auto; text-align: left; font-family: sans-serif; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.9);';
        
        backdrop.onclick = function (e) {
            if (e.target === backdrop) backdrop.remove();
        };
        
        const listItems = [];
        let totalSize = 0;
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key) continue;
            
            const isLocal = key.startsWith('lineage_idle_save_') || key === 'lineage_idle_warehouse';
            const isCloudCache = key.startsWith('klh_cloud_save_') || key.startsWith('klh_cloud_warehouse') || key.startsWith('afk_ts_') || key.startsWith('afk_map_') || key.startsWith('afk_pride_');
            
            if (isLocal || isCloudCache) {
                const val = localStorage.getItem(key) || '';
                const sizeKB = (val.length / 1024).toFixed(1);
                totalSize += val.length;
                
                let displayName = key;
                let colorClass = 'color: #94a3b8;';
                if (isLocal) {
                    if (key.includes('warehouse')) {
                        displayName = `[本地] 倉庫數據`;
                    } else {
                        displayName = `[本地] 存檔槽 ${key.replace('lineage_idle_save_', '')}`;
                    }
                    colorClass = 'color: #4ade80; font-weight: bold;';
                } else if (isCloudCache) {
                    const parts = key.split('_');
                    const suffix = parts[parts.length - 1] || '';
                    const shortSuffix = suffix.substring(0, 8);
                    
                    if (key.includes('warehouse')) {
                        displayName = `[雲端] 倉庫數據 (${shortSuffix})`;
                    } else if (key.includes('empty_flag')) {
                        const slotNum = key.match(/save_(\d+)_empty_flag/)?.[1] || '';
                        displayName = `[雲端] 存檔槽 ${slotNum} 空白旗標 (${shortSuffix})`;
                    } else if (key.includes('save_')) {
                        const slotNum = key.match(/save_(\d+)/)?.[1] || '';
                        displayName = `[雲端] 存檔槽 ${slotNum} (${shortSuffix})`;
                    } else if (key.includes('afk_ts')) {
                        displayName = `[雲端] 離線時間戳 (${shortSuffix})`;
                    } else if (key.includes('afk_map')) {
                        displayName = `[雲端] 離線地圖 (${shortSuffix})`;
                    } else if (key.includes('afk_pride')) {
                        displayName = `[雲端] 離線榮譽 (${shortSuffix})`;
                    } else {
                        displayName = `[雲端] 快取檔案 (${shortSuffix})`;
                    }
                    colorClass = 'color: #fb923c; font-weight: bold;';
                }
                
                listItems.push(`<div style="display: flex; justify-content: space-between; border-bottom: 1px solid #1e293b; padding: 6px 0; font-size: 11px;">
                    <span style="${colorClass}">${displayName}</span>
                    <span style="color: #64748b;">${sizeKB} KB</span>
                </div>`);
            }
        }
        
        const totalSizeKB = (totalSize / 1024).toFixed(1);
        
        content.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; padding-bottom: 8px;">
                <span style="font-size: 13px; font-weight: bold; color: #fbbf24; display: flex; align-items: center; gap: 4px;">🔍 本地快取監視器</span>
                <button onclick="document.getElementById('klh-inspector-backdrop').remove()" style="color: #94a3b8; background: none; border: none; font-size: 20px; cursor: pointer; outline: none;">&times;</button>
            </div>
            <div style="max-height: 40vh; overflow-y: auto; display: flex; flex-direction: column; margin: 4px 0;">
                ${listItems.length > 0 ? listItems.join('') : '<div style="text-align: center; color: #64748b; font-size: 12px; padding: 20px 0;">無快取存檔資料</div>'}
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #334155; padding-top: 8px; margin-top: 5px;">
                <span>快取項目：<b>${listItems.length}</b> 個</span>
                <span>總大小：<b>${totalSizeKB} KB</b></span>
            </div>
            <div style="display: flex; gap: 8px; margin-top: 10px;">
                <button onclick="if(typeof window.cleanUnusedCloudCaches === 'function'){ window.cleanUnusedCloudCaches(); window.showStorageInspectorModal(); if(typeof window.showToast==='function') window.showToast('快取清理完成！','success'); }" style="flex: 1; padding: 8px; background: #dc2626; border: none; border-radius: 6px; color: white; font-size: 11px; font-weight: bold; cursor: pointer; text-align: center;" class="hover:opacity-90">強制手動清理</button>
                <button onclick="document.getElementById('klh-inspector-backdrop').remove()" style="flex: 1; padding: 8px; background: #334155; border: none; border-radius: 6px; color: #cbd5e1; font-size: 11px; font-weight: bold; cursor: pointer; text-align: center;" class="hover:opacity-90">關閉</button>
            </div>
        `;
        
        backdrop.appendChild(content);
        document.body.appendChild(backdrop);
    };

    // 網路錯誤鎖定畫面
    if (typeof window.showNetworkErrorScreen !== 'function') {
        window.showNetworkErrorScreen = function (message) {
            const existing = document.getElementById('klh-network-lock-overlay');
            if (existing) existing.remove();
            const overlay = document.createElement('div');
            overlay.id = 'klh-network-lock-overlay';
            overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(15, 23, 42, 0.98); backdrop-filter: blur(10px); z-index: 9999999; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #f1f5f9; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; text-align: center; box-sizing: border-box;';
            overlay.innerHTML = `
                <div style="background: rgba(30, 41, 59, 0.9); border: 2px solid #ef4444; border-radius: 16px; padding: 30px; max-width: 450px; width: 100%; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5); box-sizing: border-box;">
                    <div style="font-size: 64px; margin-bottom: 20px; display: inline-block;">🌐</div>
                    <h2 style="font-size: 20px; font-weight: bold; color: #f87171; margin-top: 0; margin-bottom: 12px; line-height: 1.4;">連線失敗！已鎖定遊戲以防存檔洗白</h2>
                    <p style="font-size: 13px; color: #cbd5e1; line-height: 1.6; margin-bottom: 24px; text-align: left;">
                        ${message || '系統未能成功下載您的雲端最新存檔。為避免自動存檔系統將您的<b>新手/空進度</b>上傳並覆蓋掉雲端的滿級舊存檔，我們已自動啟用「絕對防禦」鎖定畫面。<br><br>請嘗試重新整理網頁，或點選下方按鈕切換回本地儲存模式。'}
                    </p>
                    <div style="display: flex; flex-direction: column; gap: 12px; width: 100%;">
                        <button id="klh-lock-reload-btn" style="background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; border: none; padding: 12px; border-radius: 8px; font-weight: bold; font-size: 14px; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.4);">🔄 重新整理網頁</button>
                        <button id="klh-lock-local-btn" style="background: rgba(71, 85, 105, 0.5); color: #cbd5e1; border: 1px solid #475569; padding: 10px; border-radius: 8px; font-size: 13px; cursor: pointer; transition: all 0.2s;">🏠 切換回本地模式</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            document.getElementById('klh-lock-reload-btn').addEventListener('click', function() { location.reload(); });
            document.getElementById('klh-lock-local-btn').addEventListener('click', function() { localStorage.setItem('klh_storage_mode', 'local'); location.reload(); });
        };
    }

    function updateLoadButtonState() {
        const btnLoad = document.getElementById('btn-load');
        if (!btnLoad) return;
        if (window.isCloudSyncing) {
            btnLoad.disabled = true;
            btnLoad.classList.add('opacity-50', 'pointer-events-none');
            if (!btnLoad.dataset.originalText) btnLoad.dataset.originalText = btnLoad.textContent || "載入遊戲進度";
            btnLoad.textContent = "雲端同步中...";
            btnLoad.classList.remove('hidden');
        } else {
            btnLoad.disabled = false;
            btnLoad.classList.remove('opacity-50', 'pointer-events-none');
            if (btnLoad.dataset.originalText) btnLoad.textContent = btnLoad.dataset.originalText;
            refreshLoadBtnVisibility();
        }
    }
    window.updateLoadButtonState = updateLoadButtonState;

    function refreshLoadBtnVisibility() {
        const btnLoad = document.getElementById('btn-load');
        if (btnLoad) {
            if (typeof anySaveExists === 'function' && anySaveExists()) btnLoad.classList.remove('hidden');
            else btnLoad.classList.add('hidden');
        }
    }
    window.refreshLoadBtnVisibility = refreshLoadBtnVisibility;

    // ==========================================
    // 4. CSS 注入 (Toast, Loading, 按鈕美化)
    // ==========================================
    if (!document.getElementById('klh-database-style-el')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'klh-database-style-el';
        styleEl.innerHTML = `
            /* Toast 訊息框樣式 */
            .klh-toast-container {
                position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
                z-index: 10000; display: flex; flex-direction: column; gap: 8px;
                pointer-events: none; width: 90%; max-width: 380px;
            }
            .klh-toast {
                padding: 10px 16px; border-radius: 8px; background: rgba(15, 23, 42, 0.95);
                border: 1px solid rgba(234, 179, 8, 0.4); color: #f8fafc; font-size: 13px;
                font-weight: bold; text-align: center;
                box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -2px rgba(0, 0, 0, 0.5);
                opacity: 0; transform: translateY(-20px);
                transition: opacity 0.3s ease, transform 0.3s ease; pointer-events: auto;
            }
            .klh-toast.show { opacity: 1; transform: translateY(0); }
            .klh-toast.info { border-color: rgba(56, 189, 248, 0.6); color: #e0f2fe; }
            .klh-toast.success { border-color: rgba(74, 222, 128, 0.6); color: #f0fdf4; }
            .klh-toast.error { border-color: rgba(239, 68, 68, 0.6); color: #fef2f2; }
            .klh-toast.danger { border-color: rgba(239, 68, 68, 1); background: rgba(127, 29, 29, 0.95); color: #fee2e2; box-shadow: 0 0 12px rgba(239, 68, 68, 0.6); }

            /* 載入遮罩樣式 */
            .klh-loading-overlay {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(5px);
                z-index: 9999; display: flex; flex-direction: column; align-items: center;
                justify-content: center; gap: 20px; opacity: 0; pointer-events: none;
                transition: opacity 0.3s ease;
            }
            .klh-loading-overlay.show { opacity: 1; pointer-events: auto; }
            .klh-loading-spinner {
                width: 54px; height: 54px; border: 4px solid rgba(234, 179, 8, 0.1);
                border-top: 4px solid #fbbf24; border-radius: 50%;
                animation: klh-spin 1s linear infinite;
            }
            @keyframes klh-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            .klh-loading-bar-container {
                width: 260px; height: 8px; background: rgba(51, 65, 85, 0.6);
                border-radius: 999px; overflow: hidden;
                border: 1px solid rgba(255,255,255,0.05); box-shadow: inset 0 2px 4px rgba(0,0,0,0.5);
            }
            .klh-loading-bar-fill {
                height: 100%; width: 0%; background: linear-gradient(90deg, #d97706, #fbbf24);
                box-shadow: 0 0 10px rgba(251, 191, 36, 0.6); border-radius: 999px;
                transition: width 0.2s ease-out;
            }
            .klh-loading-text {
                color: #fbbf24; font-size: 15px; font-weight: bold;
                text-shadow: 0 2px 4px rgba(0,0,0,0.6); letter-spacing: 1px;
            }

            /* 儲存模式切換按鈕縮小與美化 */
            #btn-switch-local, #btn-switch-supabase, #btn-switch-cloud {
                padding: 5px 2px !important; font-size: 11px !important; line-height: 1.2 !important;
            }
            #cloud-settings-section button {
                padding: 6px 12px !important; font-size: 12px !important;
            }
            @keyframes klh-fade-in {
                from { opacity: 0; transform: translateY(-8px); }
                to { opacity: 1; transform: translateY(0); }
            }
        `;
        document.head.appendChild(styleEl);
    }

    // ==========================================
    // 5. Toast / Loading Overlay 函式
    // ==========================================
    if (typeof window.showToast !== 'function') {
        window.showToast = function (message, type = 'info') {
            let container = document.querySelector('.klh-toast-container');
            if (!container) { container = document.createElement('div'); container.className = 'klh-toast-container'; document.body.appendChild(container); }
            const toast = document.createElement('div');
            toast.className = `klh-toast ${type}`;
            toast.innerText = message;
            container.appendChild(toast);
            setTimeout(() => toast.classList.add('show'), 10);
            setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
        };
    }

    let loadingTimer = null;
    let loadingProgress = 0;

    if (typeof window.showLoadingOverlay !== 'function') {
        window.showLoadingOverlay = function (message) {
            let overlay = document.querySelector('.klh-loading-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.className = 'klh-loading-overlay';
                overlay.innerHTML = `<div class="klh-loading-spinner"></div><div class="klh-loading-text"></div><div class="klh-loading-bar-container"><div class="klh-loading-bar-fill"></div></div>`;
                document.body.appendChild(overlay);
            }
            overlay.querySelector('.klh-loading-text').innerText = message;
            const fillEl = overlay.querySelector('.klh-loading-bar-fill');
            fillEl.style.width = '0%';
            loadingProgress = 0;
            if (loadingTimer) clearInterval(loadingTimer);
            overlay.classList.add('show');
            loadingTimer = setInterval(() => {
                if (loadingProgress < 50) loadingProgress += 5 + Math.random() * 5;
                else if (loadingProgress < 95) loadingProgress += (95 - loadingProgress) * 0.1;
                fillEl.style.width = `${Math.min(95, loadingProgress)}%`;
            }, 100);
        };
    }

    if (typeof window.hideLoadingOverlay !== 'function') {
        window.hideLoadingOverlay = function () {
            if (loadingTimer) { clearInterval(loadingTimer); loadingTimer = null; }
            const overlay = document.querySelector('.klh-loading-overlay');
            if (overlay) {
                const fillEl = overlay.querySelector('.klh-loading-bar-fill');
                if (fillEl) fillEl.style.width = '100%';
                setTimeout(() => { overlay.classList.remove('show'); }, 300);
            }
        };
    }

    // Supabase Key Banner & Modal
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
                    這是您的本機專屬金鑰，可用於多裝置存檔同步。<strong style="color: #f87171;">⚠️請務必熟記並妥善備份，此帳號遺失後無法查詢！</strong>（點擊下方即可複製）：
                </div>
                <div onclick="navigator.clipboard.writeText('${key}'); window.showToast('雲端金鑰已成功複製到剪貼簿！', 'success');" style="background: #020617; border: 1px solid #334155; border-radius: 6px; padding: 8px; font-family: monospace; font-size: 16px; font-weight: bold; color: #22d3ee; cursor: pointer; display: flex; justify-content: center; align-items: center; gap: 6px; transition: background 0.2s;" onmouseover="this.style.background='#0f172a'" onmouseout="this.style.background='#020617'">
                    <span>${key}</span><span style="font-size: 12px;">📋</span>
                </div>
            `;
            const statusEl = document.getElementById('storage-mode-status');
            if (statusEl) statusEl.parentNode.insertBefore(banner, statusEl.nextSibling);
            else container.appendChild(banner);
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
                        這是您的本機專屬雲端金鑰，可用於多裝置存檔同步。<strong style="color: #f87171;">⚠️請務必熟記並妥善備份，此帳號遺失後無法查詢！</strong>
                    </div>
                    <div onclick="navigator.clipboard.writeText('${key}'); window.showToast('雲端金鑰已成功複製到剪貼簿！', 'success');" style="background: #020617; border: 1px solid #334155; border-radius: 8px; padding: 12px; font-family: monospace; font-size: 20px; font-weight: bold; color: #22d3ee; letter-spacing: 1px; cursor: pointer; display: flex; justify-content: center; align-items: center; gap: 8px; margin-bottom: 8px; transition: background 0.2s;" onmouseover="this.style.background='#0f172a'" onmouseout="this.style.background='#020617'">
                        <span>${key}</span><span style="font-size: 16px;">📋</span>
                    </div>
                    <div style="font-size: 11px; color: #94a3b8; margin-bottom: 24px;">（點擊上方金鑰框即可快速複製）</div>
                    <button class="btn w-full py-2.5 text-sm bg-cyan-700 hover:bg-cyan-600 border-cyan-500 font-bold" style="border-radius: 8px;" onclick="const bd = this.closest('.klh-modal-backdrop'); bd.style.opacity='0'; setTimeout(() => bd.remove(), 250);">確認並開始遊戲</button>
                </div>
            `;
            document.body.appendChild(backdrop);
            setTimeout(() => { backdrop.style.opacity = '1'; backdrop.children[0].style.transform = 'scale(1)'; }, 20);
        };
    }

    // ==========================================
    // 6. 雲端快取管理輔助函式
    // ==========================================
    function clearLocalCloudCache() {
        const activeKey = window.activeKey || originalGetItem.call(localStorage, 'lineage_idle_jsonblob_url') || '019ed445-679f-7ae4-9f05-f887591d1266';
        const suffix = '_' + activeKey.trim();
        const maxSlots = getMaxSaveSlot();
        for (let n = 1; n <= maxSlots; n++) {
            originalRemoveItem.call(localStorage, 'klh_cloud_save_' + n + suffix);
            originalRemoveItem.call(localStorage, 'klh_cloud_save_' + n + '_empty_flag' + suffix);
        }
        originalRemoveItem.call(localStorage, 'klh_cloud_warehouse' + suffix);
        console.log("[JSONBlob] 本地雲端存檔快取已清空。後綴:", suffix);
    }

    window.copyLocalSavesToCloudCache = function () {
        const mode = localStorage.getItem('klh_storage_mode') || 'local';
        let activeKey = '';
        if (mode === 'supabase' && allowSupabase) activeKey = localStorage.getItem('klh_supabase_key') || '';
        else if (mode === 'cloud' && allowJsonBlob) activeKey = window.activeKey || localStorage.getItem('lineage_idle_jsonblob_url') || '';
        else if (mode === 'firebase' && allowFirebase) activeKey = localStorage.getItem('klh_firebase_sync_id') || '';
        if (!activeKey) return;
        const suffix = '_' + activeKey.trim();
        const maxSlots = getMaxSaveSlot();
        for (let n = 1; n <= maxSlots; n++) {
            const localVal = originalGetItem.call(localStorage, 'lineage_idle_save_' + n);
            if (localVal !== null) originalSetItem.call(localStorage, 'klh_cloud_save_' + n + suffix, localVal);
            else originalRemoveItem.call(localStorage, 'klh_cloud_save_' + n + suffix);
            const localEmptyFlag = originalGetItem.call(localStorage, 'lineage_idle_save_' + n + '_empty_flag');
            if (localEmptyFlag !== null) originalSetItem.call(localStorage, 'klh_cloud_save_' + n + '_empty_flag' + suffix, localEmptyFlag);
            else originalRemoveItem.call(localStorage, 'klh_cloud_save_' + n + '_empty_flag' + suffix);
        }
        const localWarehouse = originalGetItem.call(localStorage, 'lineage_idle_warehouse');
        if (localWarehouse !== null) originalSetItem.call(localStorage, 'klh_cloud_warehouse' + suffix, localWarehouse);
        else originalRemoveItem.call(localStorage, 'klh_cloud_warehouse' + suffix);
        console.log("[KLH] 已成功將本地存檔複製到雲端暫存區。後綴:", suffix);
    };

    window.copyCloudCacheToLocalSaves = function () {
        const mode = localStorage.getItem('klh_storage_mode') || 'local';
        if (mode !== 'supabase' && mode !== 'cloud' && mode !== 'firebase') {
            window.showToast('此功能僅支援雲端模式 (Supabase / JSONBlob / Firebase)！', 'warning');
            return;
        }
        
        let activeKey = '';
        let modeName = '';
        if (mode === 'supabase') {
            activeKey = (localStorage.getItem('klh_supabase_key') || '').trim();
            modeName = 'Supabase 雲端';
        } else if (mode === 'cloud') {
            activeKey = (window.activeKey || localStorage.getItem('lineage_idle_jsonblob_url') || '').trim();
            modeName = 'JSONBlob 雲端';
        } else if (mode === 'firebase') {
            activeKey = (localStorage.getItem('klh_firebase_sync_id') || '').trim();
            modeName = 'Firebase 雲端';
        }

        if (!activeKey) {
            window.showToast(`當前${modeName}金鑰不存在，無法複製！`, 'error');
            return;
        }
        if (!confirm(`確定要把當前${modeName}存檔複製並覆蓋到本地嗎？本地原有的進度將會被覆蓋！`)) return;
        
        const suffix = '_' + activeKey.trim();
        const maxSlots = getMaxSaveSlot();
        let copyCount = 0;
        for (let n = 1; n <= maxSlots; n++) {
            const cloudVal = originalGetItem.call(localStorage, 'klh_cloud_save_' + n + suffix);
            if (cloudVal !== null) {
                originalSetItem.call(localStorage, 'lineage_idle_save_' + n, cloudVal);
                copyCount++;
            } else {
                originalRemoveItem.call(localStorage, 'lineage_idle_save_' + n);
            }
            const cloudEmptyFlag = originalGetItem.call(localStorage, 'klh_cloud_save_' + n + '_empty_flag' + suffix);
            if (cloudEmptyFlag !== null) {
                originalSetItem.call(localStorage, 'lineage_idle_save_' + n + '_empty_flag', cloudEmptyFlag);
            } else {
                originalRemoveItem.call(localStorage, 'lineage_idle_save_' + n + '_empty_flag');
            }
        }
        const cloudWarehouse = originalGetItem.call(localStorage, 'klh_cloud_warehouse' + suffix);
        if (cloudWarehouse !== null) {
            originalSetItem.call(localStorage, 'lineage_idle_warehouse', cloudWarehouse);
        } else {
            originalRemoveItem.call(localStorage, 'lineage_idle_warehouse');
        }
        console.log(`[KLH] 已成功將 ${modeName} 存檔複製到本地進度。後綴:`, suffix);
        window.showToast(`複製成功！已將 ${copyCount} 個槽位的雲端進度同步至本地。`, 'success');
        
        // 刷新 UI
        if (typeof refreshLoadBtnVisibility === 'function') refreshLoadBtnVisibility();
        const slotSelectPanel = document.getElementById('slot-select-panel');
        if (slotSelectPanel && !slotSelectPanel.classList.contains('hidden') && typeof openSlotSelect === 'function') {
            openSlotSelect(window._slotMode || 'load');
        }
    };


    // ==========================================
    // 7. JSONBlob 雲端存檔引擎
    // ==========================================
    const PUBLIC_KEYS = [
        "019ed445-679f-7ae4-9f05-f887591d1266", "019ebb1f-b31c-769f-8475-02be610a13b0",
        "019ebb3a-0d11-7569-a341-463d28054478", "019ebb3a-58de-78fd-8139-eca46c089de3",
        "019ebb3a-ad04-76f1-81df-d15d7b2d03d0", "019ebb3a-e777-7ab7-b744-aaab13066231"
    ];

    window.DEFAULT_CLOUD_URL = "https://api.jsonblob.com/api/jsonBlob";

    // 初始化金鑰
    let initialKey = localStorage.getItem('lineage_idle_jsonblob_url');
    if (!initialKey) {
        initialKey = localStorage.getItem('klh_jsonblob_key');
        if (initialKey) { localStorage.setItem('lineage_idle_jsonblob_url', initialKey); localStorage.removeItem('klh_jsonblob_key'); }
    }
    let localKeyVal = localStorage.getItem('klh_jsonblob_local_key');
    if (localKeyVal && PUBLIC_KEYS.includes(localKeyVal.trim().toLowerCase())) { localStorage.removeItem('klh_jsonblob_local_key'); localKeyVal = null; }
    if (!localKeyVal && initialKey && !PUBLIC_KEYS.includes(initialKey.trim().toLowerCase())) { localStorage.setItem('klh_jsonblob_local_key', initialKey); }
    window.activeKey = initialKey || "";

    window.isValidUuid = function (key) {
        key = (key || "").trim();
        if (!key) return false;
        if (key.startsWith("http://") || key.startsWith("https://")) return true;
        return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(key);
    };

    function getCleanCloudUrl(key) {
        key = (key || "").trim();
        if (!key) key = "";
        if (key.startsWith("http://") || key.startsWith("https://")) {
            if (key.includes("jsonblob.com")) { const parts = key.split('/'); const id = parts[parts.length - 1]; if (id) return `${window.DEFAULT_CLOUD_URL}/${id}`; }
            let url = key;
            if (url.includes("://jsonblob.com")) url = url.replace("://jsonblob.com", "://api.jsonblob.com");
            return url;
        }
        return `${window.DEFAULT_CLOUD_URL}/${key}`;
    }

    // API 請求封裝 (依據使用者要求全面改為直接連線，移除代理備援機制)
    async function fetchWithProxy(targetUrl, options = {}) {
        const res = await fetch(targetUrl, options);
        if (res.ok || res.status === 200 || res.status === 201) { 
            res.connectionMethod = "直接連線"; 
            return res; 
        }
        throw new Error(`Direct connection returned status ${res.status}`);
    }

    window.saveJsonBlobConfig = function (key, remember = true) {
        key = (key || "").trim();
        if (!key) key = "";
        if (window.activeKey !== key) { clearLocalCloudCache(); }
        window.activeKey = key;
        localStorage.setItem('lineage_idle_jsonblob_url', key);
        if (!localStorage.getItem('klh_jsonblob_local_key')) {
            if (!PUBLIC_KEYS.includes(key.trim().toLowerCase())) localStorage.setItem('klh_jsonblob_local_key', key);
        }
        const inputEl = document.getElementById('jsonblob-input');
        if (inputEl) inputEl.value = key;
    };
    window.clearJsonBlobConfig = function () { window.saveJsonBlobConfig("019ed445-679f-7ae4-9f05-f887591d1266"); };

    // JSONBlob 上傳/下載節流
    let jbLastAutoUploadTime = 0;
    let jbLastManualUploadTime = 0;
    const AUTO_UPLOAD_DEBOUNCE_MS = 960000;
    const MANUAL_UPLOAD_DEBOUNCE_MS = 10000;

    window.addEventListener('beforeunload', () => { window.__klh_is_unloading = true; });

    // 🔧 共用遊戲資料收集與還原（明確列舉需要雲端同步的 localStorage 鍵值）
    //    目前包含：寵物名冊、龍之鑽石/黑市。日後有新增再手動加入。
    const _SHARED_KEYS = [
        'fb5_pet_roster',                // 寵物名冊（一般模式）
        'fb5_pet_roster_classic',         // 寵物名冊（經典模式）
        'fb5_pandora_relic_market_v1'     // 龍之鑽石、流浪收購商、遺物布告欄
    ];
    function _collectSharedData() {
        const shared = {};
        for (const key of _SHARED_KEYS) {
            const val = localStorage.getItem(key);
            if (val !== null) shared[key] = val;
        }
        return Object.keys(shared).length ? shared : null;
    }
    function _restoreSharedData(shared) {
        if (!shared || typeof shared !== 'object') return;
        for (const key of _SHARED_KEYS) {
            const val = shared[key];
            if (val !== undefined && val !== null) {
                localStorage.setItem(key, (typeof val === 'object') ? JSON.stringify(val) : val);
            }
        }
    }

    window.uploadToCloud = async function (isManual = false, forceFullOverwrite = false, skipMergeSlot = null) {
        if (!window.__klh_cloud_sync_success) {
            if (isManual && typeof window.showToast === 'function') window.showToast('同步失敗：尚未成功下載雲端最新存檔，已攔截上傳以防覆寫！', 'error');
            return false;
        }
        const now = Date.now();
        if (!forceFullOverwrite && !window.__klh_is_unloading) {
            if (isManual) { if (now - jbLastManualUploadTime < MANUAL_UPLOAD_DEBOUNCE_MS) return true; jbLastManualUploadTime = now; }
            else { if (now - jbLastAutoUploadTime < AUTO_UPLOAD_DEBOUNCE_MS) return true; jbLastAutoUploadTime = now; }
        }
        if (!window.isValidUuid(window.activeKey)) { if (isManual) window.showToast('雲端金鑰格式無效！', 'error'); return false; }
        const targetUrl = getCleanCloudUrl(window.activeKey);
        const maxSlots = getMaxSaveSlot();
        const payload = { warehouse: localStorage.getItem('lineage_idle_warehouse') };
        for (let n = 1; n <= maxSlots; n++) payload['save_' + n] = localStorage.getItem('lineage_idle_save_' + n);
        const sharedData = _collectSharedData();
        if (sharedData) payload.shared = sharedData;
        const activeSlot = (typeof currentSlot !== 'undefined') ? parseInt(currentSlot, 10) : null;
        if (activeSlot >= 1 && activeSlot <= maxSlots) {
            if (!payload['save_' + activeSlot]) {
                if (isManual) window.showToast('偵測到本地當前槽位存檔為空，已攔截雲端覆寫！', 'error');
                return false;
            }
        }
        if (isManual) window.showLoadingOverlay('正在上傳雲端存檔中...');
        try {
            const payloadStr = JSON.stringify(payload);
            const compressed = LZString.compressToBase64(payloadStr);
            const uploadBody = { __compressed__: true, data: compressed };
            const res = await fetchWithProxy(targetUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(uploadBody) });
            if (res.ok) {
                const activeKeyLower = (window.activeKey || "").trim().toLowerCase();
                if (window.isValidUuid(window.activeKey) && !PUBLIC_KEYS.includes(activeKeyLower)) localStorage.setItem('klh_custom_key', window.activeKey.trim());
                if (isManual) window.showToast('成功將本機進度上傳至雲端！(管道：' + (res.connectionMethod || '直接連線') + ') ⚠️注意：請勿跨裝置雙開遊戲。', 'success');
                return true;
            }
            if (isManual) window.showToast('上傳雲端存檔失敗，狀態碼：' + res.status, 'error');
            return false;
        } catch (err) { if (isManual) window.showToast('上傳雲端存檔失敗，請檢查網路連線。', 'error'); return false;
        } finally { if (isManual) window.hideLoadingOverlay(); }
    };

    window.syncFromCloud = async function (isManual) {
        if (!window.isValidUuid(window.activeKey)) { window.showToast('雲端金鑰格式無效！', 'error'); return; }
        window.isCloudSyncing = true;
        updateLoadButtonState();
        const targetUrl = getCleanCloudUrl(window.activeKey);
        if (isManual) window.showLoadingOverlay('正在讀取雲端存檔中...');
        try {
            const res = await fetchWithProxy(targetUrl);
            if (res.status === 200) {
                const currentMode = originalGetItem.call(localStorage, 'klh_storage_mode') || 'local';
                if (currentMode !== 'cloud') return;
                const rawPayload = await res.json();
                const payload = decompressCloudPayload(rawPayload);
                if (payload) {
                    const activeKeyLower = (window.activeKey || "").trim().toLowerCase();
                    if (window.isValidUuid(window.activeKey) && !PUBLIC_KEYS.includes(activeKeyLower)) localStorage.setItem('klh_custom_key', window.activeKey.trim());
                    const maxSlots = getMaxSaveSlot();
                    for (let n = 1; n <= maxSlots; n++) {
                        const val = payload['save_' + n] || payload['lineage_idle_save_' + n];
                        if (val !== undefined && val !== null) localStorage.setItem('lineage_idle_save_' + n, (typeof val === 'object') ? JSON.stringify(val) : val);
                        else localStorage.removeItem('lineage_idle_save_' + n);
                    }
                    const warehouseVal = payload.warehouse || payload.lineage_idle_warehouse;
                    if (warehouseVal !== undefined && warehouseVal !== null) localStorage.setItem('lineage_idle_warehouse', (typeof warehouseVal === 'object') ? JSON.stringify(warehouseVal) : warehouseVal);
                    else localStorage.removeItem('lineage_idle_warehouse');
                    if (payload.shared) _restoreSharedData(payload.shared);
                    if (isManual) {
                        const isPublic = PUBLIC_KEYS.includes(activeKeyLower);
                        window.showToast(isPublic ? '進入諸神共用殿堂成功！(管道：' + (res.connectionMethod || '未知') + ')' : '雲端存檔讀取成功！(管道：' + (res.connectionMethod || '未知') + ')', isPublic ? 'danger' : 'success');
                    }
                    window.__klh_cloud_sync_success = true;
                    refreshLoadBtnVisibility();
                }
            } else if (res.status === 404) {
                window.showToast('雲端無存檔或金鑰已失效！', 'error');
            } else {
                if (isManual) window.showToast('讀取雲端存檔失敗，狀態碼：' + res.status, 'error');
                else if (typeof window.showNetworkErrorScreen === 'function') window.showNetworkErrorScreen('伺服器返回狀態碼：' + res.status);
            }
        } catch (err) {
            if (isManual) window.showToast('讀取雲端存檔失敗，請檢查網路連線。', 'error');
            else if (typeof window.showNetworkErrorScreen === 'function') window.showNetworkErrorScreen();
        } finally {
            window.isCloudSyncing = false;
            updateLoadButtonState();
            const slotSelectPanel = document.getElementById('slot-select-panel');
            if (slotSelectPanel && !slotSelectPanel.classList.contains('hidden') && typeof openSlotSelect === 'function') openSlotSelect(window._slotMode || 'load');
            if (isManual) window.hideLoadingOverlay();
        }
    };

    // Firebase 核心輔助與 REST 請求封裝
    function getFirebaseDatabaseURL() {
        const url = localStorage.getItem('klh_firebase_database_url') || "";
        if (url && url.trim()) {
            let cleanUrl = url.trim();
            if (cleanUrl.endsWith('/')) {
                cleanUrl = cleanUrl.slice(0, -1);
            }
            return cleanUrl;
        }
        return "https://datagame-98776-default-rtdb.firebaseio.com";
    }

    window.saveFirebaseConfig = function (serverUrl, syncId) {
        serverUrl = (serverUrl || "").trim();
        syncId = (syncId || "").trim();
        if (serverUrl.endsWith('/')) serverUrl = serverUrl.slice(0, -1);
        
        localStorage.setItem('klh_firebase_database_url', serverUrl);
        localStorage.setItem('klh_firebase_sync_id', syncId);
        
        let localSyncId = localStorage.getItem('klh_firebase_local_sync_id') || '';
        if (!localSyncId && syncId) {
            localSyncId = syncId;
            localStorage.setItem('klh_firebase_local_sync_id', localSyncId);
        }
        
        window.__klh_storage_cache.firebaseUrl = serverUrl;
        window.__klh_storage_cache.firebaseSyncId = syncId;
    };

    window.uploadToFirebase = async function (isManual = false) {
        if (!window.__klh_cloud_sync_success) {
            if (isManual && typeof window.showToast === 'function') window.showToast('同步失敗：尚未成功下載雲端最新存檔，已攔截上傳以防覆寫！', 'error');
            return false;
        }
        const syncId = (localStorage.getItem('klh_firebase_sync_id') || "").trim();
        if (!syncId) {
            if (isManual) window.showToast('請先輸入並登入 Firebase 存檔名稱！', 'error');
            return false;
        }
        
        const databaseURL = getFirebaseDatabaseURL();
        const maxSlots = getMaxSaveSlot();
        const sharedDataFB = _collectSharedData();
        const payload = {
            saves: {},
            warehouse: localStorage.getItem('lineage_idle_warehouse'),
            shared: sharedDataFB || {},
            updatedAt: Date.now(),
            clientInfo: 'Firebase-Sync-Module-v1'
        };
        
        let hasAnyLocalData = false;
        for (let n = 1; n <= maxSlots; n++) {
            const saveVal = localStorage.getItem('lineage_idle_save_' + n);
            const emptyFlag = localStorage.getItem('lineage_idle_save_' + n + '_empty_flag');
            if (saveVal) {
                payload.saves['lineage_idle_save_' + n] = saveVal;
                hasAnyLocalData = true;
            }
            if (emptyFlag) {
                payload.saves['lineage_idle_save_' + n + '_empty_flag'] = emptyFlag;
            }
        }
        if (payload.warehouse) hasAnyLocalData = true;
        
        if (!hasAnyLocalData) {
            if (isManual) window.showToast('上傳失敗：本地無任何存檔數據，已攔截以防清空雲端！', 'error');
            return false;
        }
        
        const activeSlot = (typeof currentSlot !== 'undefined') ? parseInt(currentSlot, 10) : null;
        if (activeSlot && activeSlot >= 1 && activeSlot <= maxSlots) {
            const currentSave = localStorage.getItem('lineage_idle_save_' + activeSlot);
            if (!currentSave) {
                if (isManual) window.showToast('安全性攔截：當前選擇槽位存檔為空，已終止上傳！', 'error');
                return false;
            }
        }
        
        if (isManual) window.showLoadingOverlay('正在上傳存檔至 Firebase...');
        try {
            const targetUrl = `${databaseURL}/saves/${syncId}.json`;
            const response = await fetch(targetUrl, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (response.ok) {
                if (isManual) window.showToast('存檔上傳 Firebase 成功！', 'success');
                return true;
            }
            if (isManual) window.showToast('上傳 Firebase 失敗，狀態碼：' + response.status, 'error');
            return false;
        } catch (err) {
            if (isManual) window.showToast('上傳 Firebase 失敗，請檢查網路連線。', 'error');
            return false;
        } finally {
            if (isManual) window.hideLoadingOverlay();
        }
    };

    window.syncFromFirebase = async function (isManual) {
        const syncId = (localStorage.getItem('klh_firebase_sync_id') || "").trim();
        if (!syncId) {
            window.showToast('請先輸入 Firebase 存檔金鑰！', 'error');
            return;
        }
        window.isCloudSyncing = true;
        updateLoadButtonState();
        const databaseURL = getFirebaseDatabaseURL();
        if (isManual) window.showLoadingOverlay('正在讀取 Firebase 存檔中...');
        try {
            const targetUrl = `${databaseURL}/saves/${syncId}.json`;
            const res = await fetch(targetUrl);
            if (res.status === 200) {
                const currentMode = originalGetItem.call(localStorage, 'klh_storage_mode') || 'local';
                if (currentMode !== 'firebase') return;
                const payload = await res.json();
                if (payload && payload.saves) {
                    const maxSlots = getMaxSaveSlot();
                    for (let n = 1; n <= maxSlots; n++) {
                        const val = payload.saves['lineage_idle_save_' + n];
                        const flag = payload.saves['lineage_idle_save_' + n + '_empty_flag'];
                        if (val !== undefined && val !== null) {
                            localStorage.setItem('lineage_idle_save_' + n, val);
                        } else {
                            localStorage.removeItem('lineage_idle_save_' + n);
                        }
                        if (flag !== undefined && flag !== null) {
                            localStorage.setItem('lineage_idle_save_' + n + '_empty_flag', flag);
                        } else {
                            localStorage.removeItem('lineage_idle_save_' + n + '_empty_flag');
                        }
                    }
                    const warehouseVal = payload.warehouse;
                    if (warehouseVal !== undefined && warehouseVal !== null) {
                        localStorage.setItem('lineage_idle_warehouse', warehouseVal);
                    } else {
                        localStorage.removeItem('lineage_idle_warehouse');
                    }
                    if (payload.shared) _restoreSharedData(payload.shared);
                    if (isManual) window.showToast('Firebase 存檔讀取成功！', 'success');
                    window.__klh_cloud_sync_success = true;
                } else {
                    if (isManual) window.showToast('Firebase 雲端無此存檔進度！', 'error');
                }
            } else {
                if (isManual) window.showToast('Firebase 讀取失敗，狀態碼：' + res.status, 'error');
            }
            refreshLoadBtnVisibility();
        } catch (err) {
            if (isManual) window.showToast('讀取 Firebase 存檔失敗：' + err.message, 'error');
            else if (typeof window.showNetworkErrorScreen === 'function') window.showNetworkErrorScreen('錯誤：' + err.message);
        } finally {
            window.isCloudSyncing = false;
            updateLoadButtonState();
            const slotSelectPanel = document.getElementById('slot-select-panel');
            if (slotSelectPanel && !slotSelectPanel.classList.contains('hidden') && typeof openSlotSelect === 'function') openSlotSelect(window._slotMode || 'load');
            if (isManual) window.hideLoadingOverlay();
        }
    };

    window.switchToFirebaseMode = function () {
        localStorage.setItem('klh_storage_mode', 'firebase');
        window.updateStorageModeUI();
        const slotSelectPanel = document.getElementById('slot-select-panel');
        if (slotSelectPanel && !slotSelectPanel.classList.contains('hidden') && typeof openSlotSelect === 'function') openSlotSelect(window._slotMode || 'load');
    };

    window.handleFirebaseReadClick = async function () {
        const serverInput = document.getElementById('firebase-server-input');
        const syncInput = document.getElementById('firebase-sync-input');
        const serverUrl = serverInput ? serverInput.value.trim() : '';
        const syncId = syncInput ? syncInput.value.trim() : '';
        
        if (!serverUrl || !syncId) {
            window.showToast('請先輸入伺服器網址與存檔名稱！', 'error');
            return;
        }
        
        window.saveFirebaseConfig(serverUrl, syncId);
        window.updateStorageModeUI();
        await window.syncFromFirebase(true);
    };
 
    window.restoreFirebaseLocalSyncId = async function () {
        const localSyncId = localStorage.getItem('klh_firebase_local_sync_id') || '';
        if (!localSyncId) { window.showToast('無本機存檔名稱！', 'error'); return; }
        
        localStorage.setItem('klh_firebase_sync_id', localSyncId);
        window.__klh_storage_cache.firebaseSyncId = localSyncId;
        
        const syncInput = document.getElementById('firebase-sync-input');
        if (syncInput) syncInput.value = localSyncId;
        
        window.updateStorageModeUI();
        await window.syncFromFirebase(true);
    };

    window.handleFirebaseCreateClick = async function () {
        const serverInput = document.getElementById('firebase-server-input');
        const serverUrl = serverInput ? serverInput.value.trim() : '';
        if (!serverUrl) {
            window.showToast('請先輸入 Firebase 伺服器網址！', 'error');
            return;
        }

        const syncId = prompt("請輸入要建立的 Firebase 存檔名稱 (Sync ID)：");
        if (syncId === null) return;
        const cleanId = syncId.trim();
        if (!cleanId) {
            window.showToast('存檔名稱不能為空！', 'error');
            return;
        }

        // Firebase 鍵名不允許包含特殊字元
        if (/[\.\$\#\[\]\/]/.test(cleanId)) {
            window.showToast('存檔名稱不能包含特殊字元 (. $ # [ ] /)！', 'error');
            return;
        }

        window.showLoadingOverlay('正在建立 Firebase 存檔中...');
        try {
            let cleanServerUrl = serverUrl;
            if (cleanServerUrl.endsWith('/')) cleanServerUrl = cleanServerUrl.slice(0, -1);
            const targetUrl = `${cleanServerUrl}/saves/${cleanId}.json`;
            
            const response = await fetch(targetUrl, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });

            if (response.ok) {
                const syncInput = document.getElementById('firebase-sync-input');
                if (syncInput) syncInput.value = cleanId;
                window.saveFirebaseConfig(serverUrl, cleanId);
                window.__klh_cloud_sync_success = true;
                window.showToast(`成功建立存檔【${cleanId}】！已自動登入。`, 'success');
                window.updateStorageModeUI();
            } else {
                window.showToast('建立存檔失敗，伺服器錯誤碼：' + response.status, 'error');
            }
        } catch (err) {
            window.showToast('建立存檔失敗，請檢查網址與網路連線：' + err.message, 'error');
        } finally {
            window.hideLoadingOverlay();
        }
    };

    // JSONBlob UI 操作函式
    window.handleCloudSaveReadClick = async function () {
        const inputEl = document.getElementById('jsonblob-input');
        if (inputEl) {
            let key = inputEl.value.trim();
            const match = key.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
            if (match) key = match[1];
            if (!window.isValidUuid(key)) { window.showToast('格式錯誤！', 'error'); return; }
            window.saveJsonBlobConfig(key);
            localStorage.setItem('klh_storage_mode', 'cloud');
            window.updateStorageModeUI();
            await window.syncFromCloud(true);
        }
    };
    window.handleCloudSaveWriteClick = async function () {
        const inputEl = document.getElementById('jsonblob-input');
        if (inputEl) {
            let key = inputEl.value.trim();
            const match = key.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
            if (match) key = match[1];
            if (!window.isValidUuid(key)) { window.showToast('格式錯誤！', 'error'); return; }
            window.saveJsonBlobConfig(key);
            localStorage.setItem('klh_storage_mode', 'cloud');
            window.updateStorageModeUI();
            window.copyLocalSavesToCloudCache();
            window.__klh_cloud_sync_success = true;
            await window.uploadToCloud(true);
        }
    };
    window.handleCloudResetClick = async function () {
        window.clearJsonBlobConfig();
        localStorage.setItem('klh_storage_mode', 'cloud');
        window.updateStorageModeUI();
        await window.syncFromCloud(true);
    };
    window.restoreJsonBlobLocalKey = async function () {
        const localKey = localStorage.getItem('klh_jsonblob_local_key') || '';
        if (!localKey) return;
        window.saveJsonBlobConfig(localKey);
        window.updateStorageModeUI();
        await window.syncFromCloud(true);
    };

    // ==========================================
    // 8. Supabase 雲端存檔引擎
    // ==========================================
    const SUPABASE_URL = "https://tteveuemmbyesbskeoty.supabase.co";
    const SUPABASE_ANON_KEY = "sb_publishable_mkhMpjoJR31jQ7740P7WPg_pivSaiFI";
    let supabase = null;

    function loadSupabaseSDK() {
        return new Promise((resolve, reject) => {
            if (window.supabase) { resolve(window.supabase); return; }
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
            script.onload = () => { if (window.supabase) resolve(window.supabase); else reject(new Error('Supabase SDK loaded but not defined')); };
            script.onerror = () => reject(new Error('Failed to load Supabase SDK'));
            document.head.appendChild(script);
        });
    }

    function generatePlayerID() {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let result = '*';
        if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
            const arr = new Uint8Array(15); crypto.getRandomValues(arr);
            for (let i = 0; i < 15; i++) result += chars.charAt(arr[i] % chars.length);
        } else {
            for (let i = 0; i < 15; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    let sbLastAutoUploadTime = 0;
    let sbLastManualUploadTime = 0;

    window.uploadToSupabase = async function (isManual = false, forceFullOverwrite = false, skipMergeSlot = null) {
        if (!supabase) return false;
        if (!window.__klh_cloud_sync_success) {
            if (isManual) window.showToast('同步失敗：尚未成功下載雲端最新存檔，已攔截上傳！', 'error');
            return false;
        }
        const now = Date.now();
        if (!forceFullOverwrite && !window.__klh_is_unloading) {
            if (isManual) { if (now - sbLastManualUploadTime < MANUAL_UPLOAD_DEBOUNCE_MS) return true; sbLastManualUploadTime = now; }
            else { if (now - sbLastAutoUploadTime < AUTO_UPLOAD_DEBOUNCE_MS) return true; sbLastAutoUploadTime = now; }
        }
        const key = (localStorage.getItem('klh_supabase_key') || '').trim();
        if (!key) { if (isManual) window.showToast('雲端金鑰不存在！', 'error'); return false; }
        const maxSlots = getMaxSaveSlot();
        const payload = { warehouse: localStorage.getItem('lineage_idle_warehouse') };
        for (let n = 1; n <= maxSlots; n++) payload['save_' + n] = localStorage.getItem('lineage_idle_save_' + n);
        const sharedDataSB = _collectSharedData();
        if (sharedDataSB) payload.shared = sharedDataSB;
        const activeSlot = (typeof window.currentSlot !== 'undefined') ? parseInt(window.currentSlot, 10) : null;
        if (activeSlot >= 1 && activeSlot <= maxSlots && !payload['save_' + activeSlot]) {
            if (isManual) window.showToast('偵測到本地當前槽位存檔為空，已攔截雲端覆寫！', 'error');
            return false;
        }
        if (isManual) window.showLoadingOverlay('正在上傳雲端存檔中...');
        try {
            const payloadJsonStr = JSON.stringify(payload);
            const compressedPayload = LZString.compressToBase64(payloadJsonStr);
            const { error } = await supabase.rpc('save_player_save_short', { player_id: key, new_save_data: {}, new_save_data_short: compressedPayload });
            if (error) throw error;
            if (isManual) window.showToast('成功將本機進度同步至雲端！ ⚠️請勿跨裝置雙開遊戲。', 'success');
            return true;
        } catch (err) { 
            console.error('Supabase upload error:', err);
            if (isManual) window.showToast('上傳雲端存檔失敗：' + (err.message || err), 'error'); 
            return false;
        } finally { if (isManual) window.hideLoadingOverlay(); }
    };

    window.syncFromSupabase = async function (isManual) {
        if (!supabase) return;
        const key = (localStorage.getItem('klh_supabase_key') || '').trim();
        if (!key) { if (isManual) window.showToast('雲端金鑰不存在！', 'error'); return; }
        window.isCloudSyncing = true;
        updateLoadButtonState();
        if (isManual) window.showLoadingOverlay('正在讀取雲端存檔中...');
        try {
            const { data: rawData, error } = await supabase.rpc('load_player_save', { player_id: key, client_version: 'compressed' });
            if (error) throw error;
            if (!rawData) {
                const localKey = localStorage.getItem('klh_supabase_local_key') || '';
                if (key === localKey && localKey) {
                    // 本地金鑰失效，自動生成新金鑰
                    const newKey = generatePlayerID();
                    window.showToast('偵測到本機金鑰已失效，正在為您生成新金鑰...', 'info');
                    try {
                        const maxSlots_nk = getMaxSaveSlot();
                        const initialTemplate = { "warehouse": null };
                        for (let n = 1; n <= maxSlots_nk; n++) initialTemplate["save_" + n] = null;
                        const initCompressed = LZString.compressToBase64(JSON.stringify(initialTemplate));
                        const { error: initError } = await supabase.rpc('save_player_save_short', { player_id: newKey, new_save_data: {}, new_save_data_short: initCompressed });
                        if (initError) throw initError;
                        localStorage.setItem('klh_supabase_key', newKey);
                        localStorage.setItem('klh_supabase_local_key', newKey);
                        window.__klh_cloud_sync_success = true;
                        if (typeof window.copyLocalSavesToCloudCache === 'function') window.copyLocalSavesToCloudCache();
                        await window.uploadToSupabase(false, true);
                        if (typeof window.updateStorageModeUI === 'function') window.updateStorageModeUI();
                        if (typeof window.showSupabaseKeyModal === 'function') window.showSupabaseKeyModal(newKey);
                        else alert(`【金鑰重置成功】新金鑰為：\n\n${newKey}\n\n⚠️請務必妥善保存！`);
                    } catch (err2) { window.showToast('自動生成新金鑰失敗', 'error'); }
                } else {
                    window.showToast('雲端無存檔或金鑰已失效！', 'error');
                }
                return;
            }
            const currentMode = localStorage.getItem('klh_storage_mode') || 'local';
            if (currentMode !== 'supabase') return;
            const payload = decompressCloudPayload(rawData);
            const maxSlots_sync = getMaxSaveSlot();
            for (let n = 1; n <= maxSlots_sync; n++) {
                const val = payload['save_' + n];
                if (val !== undefined && val !== null) localStorage.setItem('lineage_idle_save_' + n, (typeof val === 'object') ? JSON.stringify(val) : val);
                else localStorage.removeItem('lineage_idle_save_' + n);
            }
            const warehouseVal = payload.warehouse;
            if (warehouseVal !== undefined && warehouseVal !== null) localStorage.setItem('lineage_idle_warehouse', (typeof warehouseVal === 'object') ? JSON.stringify(warehouseVal) : warehouseVal);
            else localStorage.removeItem('lineage_idle_warehouse');
            if (payload.shared) _restoreSharedData(payload.shared);
            window.__klh_cloud_sync_success = true;
            if (isManual) window.showToast('雲端存檔同步成功！', 'success');
            refreshLoadBtnVisibility();
        } catch (err) {
            if (isManual) window.showToast('讀取雲端存檔失敗：' + err.message, 'error');
            else if (typeof window.showNetworkErrorScreen === 'function') window.showNetworkErrorScreen('錯誤：' + err.message);
        } finally {
            window.isCloudSyncing = false;
            updateLoadButtonState();
            const slotSelectPanel = document.getElementById('slot-select-panel');
            if (slotSelectPanel && !slotSelectPanel.classList.contains('hidden') && typeof openSlotSelect === 'function') openSlotSelect(window._slotMode || 'load');
            if (isManual) window.hideLoadingOverlay();
        }
    };

    // Supabase 模式切換與自動發卡
    window.switchToSupabaseMode = async function () {
        localStorage.setItem('klh_storage_mode', 'supabase');
        let currentKey = (localStorage.getItem('klh_supabase_key') || '').trim();
        let localKey = (localStorage.getItem('klh_supabase_local_key') || '').trim();
        if (!currentKey && localKey) localStorage.setItem('klh_supabase_key', localKey);
        let key = (localStorage.getItem('klh_supabase_key') || '').trim();
        if (typeof window.updateStorageModeUI === 'function') window.updateStorageModeUI();
        if (!key) {
            const newKey = generatePlayerID();
            window.showLoadingOverlay('正在初始化雲端存檔位置...');
            try {
                const maxSlots_sw = getMaxSaveSlot();
                const initialTemplate = { "warehouse": null };
                for (let n = 1; n <= maxSlots_sw; n++) initialTemplate["save_" + n] = null;
                const switchCompressed = LZString.compressToBase64(JSON.stringify(initialTemplate));
                const { error } = await supabase.rpc('save_player_save_short', { player_id: newKey, new_save_data: {}, new_save_data_short: switchCompressed });
                if (error) throw error;
                key = newKey;
                localStorage.setItem('klh_supabase_key', key);
                localStorage.setItem('klh_supabase_local_key', key);
                window.__klh_cloud_sync_success = true;
                if (typeof window.copyLocalSavesToCloudCache === 'function') window.copyLocalSavesToCloudCache();
                await window.uploadToSupabase(false, true);
                if (typeof window.updateStorageModeUI === 'function') window.updateStorageModeUI();
                window.showToast(`【新創成功】雲端金鑰為: ${key}`, 'success');
                if (typeof window.showSupabaseKeyBanner === 'function') window.showSupabaseKeyBanner(key);
                else if (typeof window.showSupabaseKeyModal === 'function') window.showSupabaseKeyModal(key);
            } catch (err) {
                window.showToast('創立新帳號失敗：' + err.message, 'error');
                localStorage.setItem('klh_storage_mode', 'local');
                if (typeof window.updateStorageModeUI === 'function') window.updateStorageModeUI();
                window.hideLoadingOverlay();
                return;
            } finally { window.hideLoadingOverlay(); }
        }
        await window.syncFromSupabase(true);
        const slotSelectPanel = document.getElementById('slot-select-panel');
        if (slotSelectPanel && !slotSelectPanel.classList.contains('hidden') && typeof openSlotSelect === 'function') openSlotSelect(window._slotMode || 'load');
    };

    // Supabase 輔助函式
    window.copySupabaseLocalKey = function () {
        const localKey = localStorage.getItem('klh_supabase_local_key') || '';
        if (!localKey) { window.showToast('尚未生成本機金鑰！', 'error'); return; }
        navigator.clipboard.writeText(localKey).then(() => { window.showToast('本機金鑰已成功複製！', 'success'); }).catch(() => {
            const el = document.createElement('textarea'); el.value = localKey; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el);
            window.showToast('本機金鑰已成功複製！', 'success');
        });
    };
    window.restoreSupabaseLocalKey = async function () {
        const localKey = localStorage.getItem('klh_supabase_local_key') || '';
        if (!localKey) return;
        localStorage.setItem('klh_supabase_key', localKey);
        if (typeof window.updateStorageModeUI === 'function') window.updateStorageModeUI();
        await window.syncFromSupabase(true);
    };
    let isSupabaseLoggingIn = false;
    window.handleSupabaseReadClick = async function () {
        if (isSupabaseLoggingIn) return;
        const inputEl = document.getElementById('jsonblob-input');
        if (inputEl) {
            let key = inputEl.value.trim();
            if (key.length < 12 || key.length > 16) { window.showToast('金鑰格式錯誤！必須為 12~16 碼', 'error'); return; }
            isSupabaseLoggingIn = true;
            window.showLoadingOverlay('安全驗證中，請稍候...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            try {
                const { data, error } = await supabase.rpc('load_player_save', { player_id: key, client_version: 'compressed' });
                if (error) throw error;
                if (!data) { window.showToast('雲端金鑰不存在或已失效！', 'error'); window.hideLoadingOverlay(); isSupabaseLoggingIn = false; return; }
                localStorage.setItem('klh_supabase_key', key);
                localStorage.setItem('klh_storage_mode', 'supabase');
                if (typeof window.updateStorageModeUI === 'function') window.updateStorageModeUI();
                await window.syncFromSupabase(true);
            } catch (err) { window.showToast('登入驗證失敗', 'error');
            } finally { isSupabaseLoggingIn = false; window.hideLoadingOverlay(); }
        }
    };

    // ==========================================
    // 9. 模式切換與 UI 函式
    // ==========================================
    window.switchToLocalMode = function () {
        if ((localStorage.getItem('klh_storage_mode') || 'local') === 'local') return;
        localStorage.setItem('klh_storage_mode', 'local');
        window.updateStorageModeUI();
        refreshLoadBtnVisibility();
        const slotSelectPanel = document.getElementById('slot-select-panel');
        if (slotSelectPanel && !slotSelectPanel.classList.contains('hidden') && typeof openSlotSelect === 'function') openSlotSelect(window._slotMode || 'load');
        window.showToast('已切換回本地儲存模式。', 'success');
    };

    window.switchToCloudMode = function () {
        localStorage.setItem('klh_storage_mode', 'cloud');
        window.updateStorageModeUI();
        const slotSelectPanel = document.getElementById('slot-select-panel');
        if (slotSelectPanel && !slotSelectPanel.classList.contains('hidden') && typeof openSlotSelect === 'function') openSlotSelect(window._slotMode || 'load');
    };

    window.handleFastKeyClick = async function (btn) {
        const key = btn.getAttribute('data-key');
        if (key.startsWith("0012") && key.length === 12) {
            localStorage.setItem('klh_supabase_key', key);
            localStorage.setItem('klh_storage_mode', 'supabase');
            window.updateStorageModeUI();
            await window.syncFromSupabase(true);
        } else {
            window.saveJsonBlobConfig(key);
            localStorage.setItem('klh_storage_mode', 'cloud');
            window.updateStorageModeUI();
            await window.syncFromCloud(true);
        }
    };

    // 儲存模式 UI 完整控制
    window.updateStorageModeUI = function () {
        if (typeof window.applyCreateBaseModifiers === 'function') window.applyCreateBaseModifiers();
        const mode = localStorage.getItem('klh_storage_mode') || 'local';
        const modeTextEl = document.getElementById('current-storage-mode-text');
        const settingsSection = document.getElementById('cloud-settings-section');
        const btnLocal = document.getElementById('btn-switch-local');
        const btnCloud = document.getElementById('btn-switch-cloud');
        const btnSupabase = document.getElementById('btn-switch-supabase');
        const btnFirebase = document.getElementById('btn-switch-firebase');
        const inputEl = document.getElementById('jsonblob-input');
        const readBtn = document.getElementById('btn-cloud-read');
        const quickKeysHeader = document.getElementById('klh-quick-keys-header');
        const quickKeysList = document.getElementById('klh-quick-keys-list');

        if (modeTextEl) {
            if (mode === 'cloud' && allowJsonBlob) {
                let keyName = "自訂金鑰";
                const normalized = (window.activeKey || "").trim().toLowerCase();
                const keys = { "019ed445-679f-7ae4-9f05-f887591d1266": "水蛇許德拉", "019ebb1f-b31c-769f-8475-02be610a13b0": "太陽神阿波羅", "019ebb3a-0d11-7569-a341-463d28054478": "火神赫發斯特斯", "019ebb3a-58de-78fd-8139-eca46c089de3": "勝利女神雅典那", "019ebb3a-ad04-76f1-81df-d15d7b2d03d0": "天后海拉", "019ebb3a-e777-7ab7-b744-aaab13066231": "天神宙斯" };
                const localKey = localStorage.getItem('klh_jsonblob_local_key') || '';
                if (keys[normalized]) keyName = keys[normalized];
                else if (localKey && normalized === localKey.toLowerCase()) keyName = "本機金鑰";
                modeTextEl.innerHTML = `<span class="text-indigo-400 font-bold">雲端同步 (${keyName})</span>`;
                if (settingsSection) settingsSection.style.display = 'flex';
                if (btnLocal) btnLocal.className = 'btn flex-1 py-2 text-[10px] bg-slate-800 hover:bg-slate-700 text-white font-bold whitespace-nowrap';
                if (btnCloud) btnCloud.className = 'btn flex-1 py-2 text-[10px] bg-indigo-700 hover:bg-indigo-600 text-white font-bold border-indigo-500 whitespace-nowrap';
                if (btnSupabase) btnSupabase.className = 'btn flex-1 py-2 text-[10px] bg-slate-800 hover:bg-slate-700 text-white font-bold whitespace-nowrap';
                if (btnFirebase) btnFirebase.className = 'btn flex-1 py-2 text-[10px] bg-slate-800 hover:bg-slate-700 text-white font-bold whitespace-nowrap';
                if (inputEl) {
                    inputEl.style.display = 'block';
                    inputEl.placeholder = '支援貼上 Jsonblob 網址或序號';
                    if (document.activeElement !== inputEl) {
                        const isPublic = PUBLIC_KEYS.some(k => k.toLowerCase() === normalized);
                        inputEl.value = isPublic ? '' : (window.activeKey || '');
                    }
                }
                const fbInputs = document.getElementById('firebase-inputs-container'); if (fbInputs) fbInputs.style.display = 'none';
                const hintEl = document.getElementById('jsonblob-hint'); if (hintEl) hintEl.style.display = 'block';
                const fbHintEl = document.getElementById('firebase-hint'); if (fbHintEl) fbHintEl.style.display = 'none';
                const sHintEl = document.getElementById('supabase-hint'); if (sHintEl) sHintEl.style.display = 'none';
                const fbExtra = document.getElementById('klh-firebase-extra-container'); if (fbExtra) fbExtra.style.display = 'none';
                const readBtnContainer = document.getElementById('btn-cloud-read-container'); if (readBtnContainer) readBtnContainer.style.display = 'block';
                if (readBtn) { readBtn.innerText = '登入'; readBtn.setAttribute('onclick', 'handleCloudSaveReadClick()'); readBtn.className = 'btn w-full py-2.5 text-sm bg-indigo-700 hover:bg-indigo-600 border-indigo-500 font-bold'; }
            } else if (mode === 'supabase' && allowSupabase) {
                const sKey = localStorage.getItem('klh_supabase_key') || '';
                let localKey = localStorage.getItem('klh_supabase_local_key') || '';
                if (!localKey && sKey) { localKey = sKey; localStorage.setItem('klh_supabase_local_key', localKey); }
                let keyDisplay = sKey || '無金鑰';
                if (localKey && sKey === localKey) keyDisplay = "本機金鑰";
                modeTextEl.innerHTML = `<span class="text-cyan-400 font-bold cursor-pointer" onclick="window.copySupabaseLocalKey()" title="點擊複製本機金鑰">雲端金鑰 (${keyDisplay}) 📋</span>`;
                if (settingsSection) settingsSection.style.display = 'flex';
                if (btnLocal) btnLocal.className = 'btn flex-1 py-2 text-[10px] bg-slate-800 hover:bg-slate-700 text-white font-bold whitespace-nowrap';
                if (btnCloud) btnCloud.className = 'btn flex-1 py-2 text-[10px] bg-slate-800 hover:bg-slate-700 text-white font-bold whitespace-nowrap';
                if (btnSupabase) btnSupabase.className = 'btn flex-1 py-2 text-[10px] bg-cyan-700 hover:bg-cyan-600 text-white font-bold border-cyan-500 whitespace-nowrap';
                if (btnFirebase) btnFirebase.className = 'btn flex-1 py-2 text-[10px] bg-slate-800 hover:bg-slate-700 text-white font-bold whitespace-nowrap';
                if (inputEl) {
                    inputEl.style.display = 'block';
                    inputEl.placeholder = '請輸入 12~16 碼雲端金鑰';
                    if (document.activeElement !== inputEl) {
                        inputEl.value = sKey;
                    }
                }
                const fbInputs = document.getElementById('firebase-inputs-container'); if (fbInputs) fbInputs.style.display = 'none';
                const hintEl = document.getElementById('jsonblob-hint'); if (hintEl) hintEl.style.display = 'none';
                const fbHintEl = document.getElementById('firebase-hint'); if (fbHintEl) fbHintEl.style.display = 'none';
                const sHintEl = document.getElementById('supabase-hint'); if (sHintEl) sHintEl.style.display = 'block';
                const fbExtra = document.getElementById('klh-firebase-extra-container'); if (fbExtra) fbExtra.style.display = 'none';
                const readBtnContainer = document.getElementById('btn-cloud-read-container'); if (readBtnContainer) readBtnContainer.style.display = 'block';
                if (readBtn) { readBtn.innerText = '登入'; readBtn.setAttribute('onclick', 'handleSupabaseReadClick()'); readBtn.className = 'btn w-full py-2.5 text-sm bg-cyan-700 hover:bg-cyan-600 border-cyan-500 font-bold'; }
            } else if (mode === 'firebase' && allowFirebase) {
                const fbUrl = localStorage.getItem('klh_firebase_database_url') || '';
                const fbSyncId = localStorage.getItem('klh_firebase_sync_id') || '';
                const syncDisplay = fbSyncId || '無存檔';
                modeTextEl.innerHTML = `<span class="text-orange-400 font-bold">Firebase (${syncDisplay})</span>`;
                if (settingsSection) settingsSection.style.display = 'flex';
                if (btnLocal) btnLocal.className = 'btn flex-1 py-2 text-[10px] bg-slate-800 hover:bg-slate-700 text-white font-bold whitespace-nowrap';
                if (btnCloud) btnCloud.className = 'btn flex-1 py-2 text-[10px] bg-slate-800 hover:bg-slate-700 text-white font-bold whitespace-nowrap';
                if (btnSupabase) btnSupabase.className = 'btn flex-1 py-2 text-[10px] bg-slate-800 hover:bg-slate-700 text-white font-bold whitespace-nowrap';
                if (btnFirebase) btnFirebase.className = 'btn flex-1 py-2 text-[10px] bg-orange-700 hover:bg-orange-600 text-white font-bold border-orange-500 whitespace-nowrap';
                if (inputEl) inputEl.style.display = 'none';
                const fbInputs = document.getElementById('firebase-inputs-container');
                if (fbInputs) {
                    fbInputs.style.display = 'flex';
                    const sInput = document.getElementById('firebase-server-input');
                    const syncInput = document.getElementById('firebase-sync-input');
                    if (sInput && document.activeElement !== sInput) sInput.value = fbUrl;
                    if (syncInput && document.activeElement !== syncInput) syncInput.value = fbSyncId;
                }
                const hintEl = document.getElementById('jsonblob-hint'); if (hintEl) hintEl.style.display = 'none';
                const fbHintEl = document.getElementById('firebase-hint'); if (fbHintEl) fbHintEl.style.display = 'block';
                const sHintEl = document.getElementById('supabase-hint'); if (sHintEl) sHintEl.style.display = 'none';
                const fbExtra = document.getElementById('klh-firebase-extra-container');
                if (fbExtra) {
                    fbExtra.style.display = 'block';
                    fbExtra.innerHTML = `
                        <div class="flex gap-2 w-full">
                            <button onclick="window.handleFirebaseReadClick()" class="btn flex-1 py-2.5 text-sm bg-orange-700 hover:bg-orange-600 border-orange-500 font-bold text-white">登入</button>
                            <button onclick="window.handleFirebaseCreateClick()" class="btn flex-1 py-2.5 text-sm bg-slate-800 hover:bg-slate-700 border-slate-700 font-bold text-yellow-400">建立存檔</button>
                        </div>
                    `;
                }
                const readBtnContainer = document.getElementById('btn-cloud-read-container'); if (readBtnContainer) readBtnContainer.style.display = 'none';
            } else {
                modeTextEl.innerHTML = `<span class="text-green-400 font-bold">本地模式</span>`;
                if (settingsSection) settingsSection.style.display = 'none';
                if (btnLocal) btnLocal.className = 'btn flex-1 py-2 text-[10px] bg-green-700 hover:bg-green-600 text-white font-bold border-green-500 whitespace-nowrap';
                if (btnCloud) btnCloud.className = 'btn flex-1 py-2 text-[10px] bg-slate-800 hover:bg-slate-700 text-white font-bold whitespace-nowrap';
                if (btnSupabase) btnSupabase.className = 'btn flex-1 py-2 text-[10px] bg-slate-800 hover:bg-slate-700 text-white font-bold whitespace-nowrap';
                if (btnFirebase) btnFirebase.className = 'btn flex-1 py-2 text-[10px] bg-slate-800 hover:bg-slate-700 text-white font-bold whitespace-nowrap';
            }

            // 🔒 隱藏彩蛋：當 Supabase 啟用時，只有在 JSONBlob 輸入框輸入 "lf2.net" (不分大小寫) 或是目前已在 Supabase 模式，才會顯示 Supabase 按鈕
            if (btnSupabase) {
                const inputVal = (inputEl ? inputEl.value : (localStorage.getItem('lineage_idle_jsonblob_url') || '')).trim().toLowerCase();
                const showSupabase = (mode === 'supabase') || (inputVal === 'lf2.net');
                btnSupabase.style.setProperty('display', (allowSupabase && showSupabase) ? '' : 'none', 'important');
            }
        }

        // 還原本機金鑰按鈕
        const restoreContainer = document.getElementById('klh-restore-key-container');
        if (restoreContainer) {
            restoreContainer.innerHTML = '';
            if (mode === 'supabase' && allowSupabase) {
                const sKey = localStorage.getItem('klh_supabase_key') || '';
                const localKey = localStorage.getItem('klh_supabase_local_key') || '';
                if (localKey && sKey !== localKey) {
                    restoreContainer.innerHTML = `<button onclick="window.restoreSupabaseLocalKey()" class="btn py-2.5 text-sm bg-slate-800 hover:bg-slate-700 text-yellow-400 font-bold w-full mb-1.5" style="position: relative; display: flex; justify-content: center; align-items: center;"><span style="position: absolute; left: 16px;">⭐</span><span class="font-bold">還原為本機雲端金鑰</span><span style="position: absolute; right: 16px; font-size: 11px; opacity: 0.9;">(${localKey})</span></button>`;
                }
            } else if (mode === 'cloud' && allowJsonBlob) {
                const localKey = localStorage.getItem('klh_jsonblob_local_key') || '';
                if (localKey && window.activeKey !== localKey) {
                    restoreContainer.innerHTML = `<button onclick="window.restoreJsonBlobLocalKey()" class="btn py-2.5 text-sm bg-slate-800 hover:bg-slate-700 text-yellow-400 font-bold w-full mb-1.5" style="position: relative; display: flex; justify-content: center; align-items: center;"><span style="position: absolute; left: 16px;">⭐</span><span class="font-bold">還原為本機雲端金鑰</span><span style="position: absolute; right: 16px; font-size: 11px; opacity: 0.9;">(${localKey.substring(0, 8)}...)</span></button>`;
                }
            } else if (mode === 'firebase' && allowFirebase) {
                const fbSyncId = localStorage.getItem('klh_firebase_sync_id') || '';
                const localSyncId = localStorage.getItem('klh_firebase_local_sync_id') || '';
                if (localSyncId && fbSyncId !== localSyncId) {
                    restoreContainer.innerHTML = `<button onclick="window.restoreFirebaseLocalSyncId()" class="btn py-2.5 text-sm bg-slate-800 hover:bg-slate-700 text-yellow-400 font-bold w-full mb-1.5" style="position: relative; display: flex; justify-content: center; align-items: center;"><span style="position: absolute; left: 16px;">⭐</span><span class="font-bold">還原為本機雲端存檔</span><span style="position: absolute; right: 16px; font-size: 11px; opacity: 0.9;">(${localSyncId})</span></button>`;
                }
            }
        }

        // 快速公用金鑰清單 (依據使用者要求全部隱藏)
        if (quickKeysHeader && quickKeysList) {
            // if (mode === 'cloud' && allowJsonBlob) {
            //     quickKeysHeader.style.display = 'block';
            //     quickKeysList.style.display = 'flex';
            //     const showLock = (typeof window.openGMShop === 'function') ? '' : '🔒固定';
            //     let html = '';
            //     quickKeysHeader.innerHTML = `<div class="text-[11px] text-slate-400 font-bold mt-1">快速切換公用金鑰：</div><div class="text-[11px] text-rose-400 font-bold mt-1 mb-2 leading-normal text-left border border-rose-950/40 bg-rose-950/20 p-2 rounded">⚠️ 此為諸神共用殿堂，存檔隨時可能被覆蓋！推薦使用本機專屬金鑰。</div>`;
            //     html += `<div id="klh-custom-key-btn-container" class="flex flex-col gap-1.5 w-full"></div>`;
            //     const cloudKeys = [
            //         { idx: 1, name: "水蛇許德拉", key: "019ed445-679f-7ae4-9f05-f887591d1266", color: "text-sky-300", suffix: "(預設)" },
            //         { idx: 2, name: "太陽神阿波羅", key: "019ebb1f-b31c-769f-8475-02be610a13b0", color: "text-amber-300", suffix: "" },
            //         { idx: 3, name: "火神赫發斯特斯", key: "019ebb3a-0d11-7569-a341-463d28054478", color: "text-orange-300", suffix: "" },
            //         { idx: 4, name: "勝利女神雅典那", key: "019ebb3a-58de-78fd-8139-eca46c089de3", color: "text-green-300", suffix: "" },
            //         { idx: 5, name: "天后海拉", key: "019ebb3a-ad04-76f1-81df-d15d7b2d03d0", color: "text-rose-300", suffix: showLock },
            //         { idx: 6, name: "天神宙斯", key: "019ebb3a-e777-7ab7-b744-aaab13066231", color: "text-cyan-300", suffix: showLock }
            //     ];
            //     cloudKeys.forEach(k => { html += `<button onclick="handleFastKeyClick(this)" class="btn py-2.5 text-sm bg-slate-800 hover:bg-slate-700 ${k.color} font-normal w-full" style="position: relative; display: flex; justify-content: center; align-items: center;" data-key="${k.key}"><span style="position: absolute; left: 16px;">${k.idx}.</span><span class="font-bold">${k.name}</span><span style="position: absolute; right: 16px; font-size: 11px; opacity: 0.9;">${k.suffix}</span></button>`; });
            //     quickKeysList.innerHTML = html;
            // } else {
                quickKeysHeader.style.display = 'none';
                quickKeysList.style.display = 'none';
            // }
        }

        // 歷史自訂金鑰按鈕
        const customKey = localStorage.getItem('klh_custom_key');
        const customContainer = document.getElementById('klh-custom-key-btn-container');
        if (customContainer) {
            if (customKey && window.isValidUuid(customKey)) {
                customContainer.innerHTML = `<button onclick="handleFastKeyClick(this)" class="btn py-2.5 text-sm bg-slate-800 hover:bg-slate-700 text-yellow-400 font-normal w-full" style="position: relative; display: flex; justify-content: center; align-items: center;" data-key="${customKey}"><span style="position: absolute; left: 16px;">⭐</span><span class="font-bold">歷史自訂金鑰</span><span style="position: absolute; right: 16px; font-size: 11px; opacity: 0.9;">(${customKey.substring(0, 8)}...)</span></button>`;
            } else customContainer.innerHTML = '';
        }

        // 複製至本地按鈕顯示控制
        const copyToLocalContainer = document.getElementById('btn-copy-to-local-container');
        if (copyToLocalContainer) {
            copyToLocalContainer.style.display = (mode === 'supabase' || mode === 'cloud' || mode === 'firebase') ? 'block' : 'none';
        }

        // Supabase 建立金鑰提示 banner 顯示/隱藏
        const supabaseBanner = document.getElementById('supabase-key-banner');
        if (supabaseBanner) supabaseBanner.style.display = (mode === 'supabase' && allowSupabase) ? 'block' : 'none';
    };

    // 注入雲端存檔 UI 至主畫面
    function initCloudSaveUI() {
        // 注入被 Tailwind 預編譯過濾掉的樣式
        if (!document.getElementById('klh-db-custom-style')) {
            const style = document.createElement('style');
            style.id = 'klh-db-custom-style';
            style.textContent = `
                #jsonblob-input, #firebase-server-input, #firebase-sync-input {
                    background-color: #020617 !important;
                    border: 1px solid #334155 !important;
                    color: #ffffff !important;
                }
                #jsonblob-input:focus, #firebase-server-input:focus, #firebase-sync-input:focus {
                    border-color: #eab308 !important;
                }
                .bg-slate-950\\/60 {
                    background-color: rgba(2, 6, 23, 0.6) !important;
                }
                .bg-amber-950\\/40 {
                    background-color: rgba(69, 26, 3, 0.4) !important;
                }
                .border-amber-900\\/50 {
                    border-color: rgba(120, 53, 15, 0.5) !important;
                }
                #btn-cloud-settings {
                    background: linear-gradient(180deg, #0284c7 0%, #0369a1 100%) !important;
                    border: 2px solid #22d3ee !important;
                    color: #ffffff !important;
                    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9), 0 0 6px #22d3ee !important;
                    box-shadow: 0 0 12px rgba(34, 211, 238, 0.5), inset 0 1px 3px rgba(255, 255, 255, 0.4) !important;
                    font-weight: bold !important;
                    margin-bottom: 8px !important;
                    animation: cyan-pulse 2s infinite alternate !important;
                }
                #btn-cloud-settings:hover {
                    filter: brightness(1.2) !important;
                    box-shadow: 0 0 20px rgba(34, 211, 238, 0.85), inset 0 1px 4px rgba(255, 255, 255, 0.5) !important;
                    transform: scale(1.02);
                }
                @keyframes cyan-pulse {
                    0% {
                        box-shadow: 0 0 8px rgba(34, 211, 238, 0.4), inset 0 1px 3px rgba(255, 255, 255, 0.3);
                    }
                    100% {
                        box-shadow: 0 0 18px rgba(34, 211, 238, 0.75), inset 0 1px 3px rgba(255, 255, 255, 0.3);
                    }
                }
            `;
            document.head.appendChild(style);
        }
        const mainMenu = document.getElementById('main-menu');
        if (!mainMenu || document.getElementById('cloud-save-container')) return;
        if (!allowSupabase && !allowJsonBlob && !allowFirebase) return;

        // 1. 建立選單上的「雲端存檔設定」按鈕，置頂並配置醒目金框樣式
        const menuBtn = document.createElement('button');
        menuBtn.id = 'btn-cloud-settings';
        menuBtn.className = 'btn text-base w-72 py-2.5 font-bold';
        menuBtn.innerHTML = '☁️ 雲端存檔設定';
        menuBtn.onclick = function () {
            window.showCloudSaveModal();
        };
        mainMenu.insertBefore(menuBtn, mainMenu.firstChild);

        // 2. 建立懸浮視窗 Modal (直接附於 body 上，預設隱藏)
        let modalBackdrop = document.getElementById('cloud-save-modal-backdrop');
        if (!modalBackdrop) {
            modalBackdrop = document.createElement('div');
            modalBackdrop.id = 'cloud-save-modal-backdrop';
            modalBackdrop.style.cssText = 'position: fixed; inset: 0; background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(4px); z-index: 9999; display: none; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.25s ease-in-out;';
            
            // 點擊背景空白處自動關閉
            modalBackdrop.onclick = function (e) {
                if (e.target === modalBackdrop) window.hideCloudSaveModal();
            };

            const modalContent = document.createElement('div');
            modalContent.style.cssText = 'background: #0f172a padding-box, linear-gradient(135deg, #4a3613 0%, #b89243 20%, #6e5220 42%, #e6c474 60%, #5c4318 80%, #c9a14a 100%) border-box; border: 2px solid transparent; border-radius: 16px; width: 90%; max-width: 380px; padding: 24px; color: white; display: flex; flex-direction: column; gap: 12px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8); position: relative; max-height: 90vh; overflow-y: auto; text-align: center;';
            
            // 關閉按鈕 (x)
            const closeBtn = document.createElement('button');
            closeBtn.innerHTML = '&times;';
            closeBtn.style.cssText = 'position: absolute; top: 12px; right: 16px; color: #94a3b8; background: none; border: none; font-size: 24px; cursor: pointer; outline: none; transition: color 0.2s; z-index: 10;';
            closeBtn.onmouseover = function() { this.style.color = '#f87171'; };
            closeBtn.onmouseout = function() { this.style.color = '#94a3b8'; };
            closeBtn.onclick = function() { window.hideCloudSaveModal(); };
            modalContent.appendChild(closeBtn);

            const container = document.createElement('div');
            container.id = 'cloud-save-container';
            container.className = 'w-full flex flex-col gap-3 text-center';
            
            let buttonsHtml = `<button id="btn-switch-local" onclick="switchToLocalMode()" class="btn flex-1 py-2 text-[10px] bg-slate-800 hover:bg-slate-700 text-white font-bold whitespace-nowrap">切回本地</button>`;
            if (allowSupabase) buttonsHtml += `<button id="btn-switch-supabase" onclick="switchToSupabaseMode()" class="btn flex-1 py-2 text-[10px] bg-slate-800 hover:bg-slate-700 text-white font-bold whitespace-nowrap">切回雲端</button>`;
            if (allowJsonBlob) buttonsHtml += `<button id="btn-switch-cloud" onclick="switchToCloudMode()" class="btn flex-1 py-2 text-[10px] bg-slate-800 hover:bg-slate-700 text-white font-bold whitespace-nowrap">Jsonblob</button>`;
            if (allowFirebase) buttonsHtml += `<button id="btn-switch-firebase" onclick="switchToFirebaseMode()" class="btn flex-1 py-2 text-[10px] bg-slate-800 hover:bg-slate-700 text-white font-bold whitespace-nowrap">Firebase</button>`;
            
            container.innerHTML = `
                <div class="text-sm font-bold text-yellow-500 flex justify-center items-center gap-1.5">
                    <span>存檔儲存模式</span>
                    <button onclick="window.showStorageInspectorModal()" class="text-[9px] bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white px-1.5 py-0.5 rounded border border-slate-700 font-normal cursor-pointer transition-colors" style="border-color: #475569 !important;">🔍 快取</button>
                </div>
                <div id="storage-mode-status" class="text-xs text-slate-300 font-bold bg-slate-950/60 p-2.5 rounded border border-slate-800 flex justify-between items-center">
                    <span>目前存檔模式：</span><span id="current-storage-mode-text" class="font-bold text-green-400">本地模式</span>
                </div>
                <div class="text-[11px] text-amber-400 font-bold leading-relaxed bg-amber-950/40 p-2 rounded border border-amber-900/50">
                    ⚠️ 注意：使用雲端同步請勿跨裝置雙開遊戲！儲存後請務必回首頁或登出！
                </div>
                <div class="flex gap-1.5 w-full">${buttonsHtml}</div>
                <div id="cloud-settings-section" class="flex flex-col gap-3 border-t border-slate-800 pt-3" style="display: none;">
                    <input id="jsonblob-input" type="text" oninput="this.classList.remove('text-white/50'); this.classList.add('text-white'); if (typeof window.updateStorageModeUI === 'function') window.updateStorageModeUI();" class="w-full bg-slate-950 border border-slate-700 text-white rounded px-3 py-2.5 text-sm text-center focus:outline-none focus:border-yellow-500">
                    
                    <div id="firebase-inputs-container" class="flex flex-col gap-2" style="display: none;">
                        <input id="firebase-server-input" type="text" placeholder="請輸入 Firebase 伺服器網址" class="w-full bg-slate-950 border border-slate-700 text-white rounded px-3 py-2.5 text-sm text-center focus:outline-none focus:border-yellow-500">
                        <input id="firebase-sync-input" type="text" placeholder="請輸入 Firebase 存檔名稱 (Sync ID)" class="w-full bg-slate-950 border border-slate-700 text-white rounded px-3 py-2.5 text-sm text-center focus:outline-none focus:border-yellow-500">
                    </div>

                    <div id="jsonblob-hint" class="text-[11px] text-slate-400 text-left -mt-1 leading-relaxed bg-slate-900/50 p-2 rounded" style="display: none;">
                        請至 <a href="https://jsonblob.com" target="_blank" style="color: #3b82f6; text-decoration-color: #3b82f6;" class="hover:opacity-80 underline underline-offset-2 font-bold">JSONBlob 官網 🔗</a> <span class="text-yellow-400 font-bold text-[13px] bg-yellow-900/30 px-1 rounded">註冊</span> 後，點擊Clear再點擊 Save 建立專屬網址。<br>
                        <span class="text-rose-400 font-bold">⚠️ 注意：必須註冊才能保留存檔，未註冊建立的網址只會保留 24 小時！</span><br>
                        支援輸入以下 3 種格式：<br>
                        <span class="text-slate-500 font-mono text-[10px]">1. 序號：019f3dad-406e-7673-b9df-8594bd436b9c<br>
                        2. 網址：https://jsonblob.com/019f3dad-406e-7673...<br>
                        3. API：https://jsonblob.com/019f3dad-406e-7673.../json</span><br>
                        <span class="text-cyan-400 font-bold">💡 JSONBlob 適合 <b>存檔較小</b>（如初期玩家、進度較少，總存檔 &lt; 1MB）的 <b>單人使用者</b>。<a href="https://github.com/KID0924/idle-lineage-class" target="_blank" style="color: #3b82f6; text-decoration-color: #3b82f6;" class="hover:opacity-80 underline underline-offset-2 font-bold ml-1">詳情說明 🔗</a></span>
                    </div>
                    <div id="firebase-hint" class="text-[11px] text-slate-400 text-left -mt-1 leading-relaxed bg-slate-900/50 p-2 rounded" style="display: none;">
                        🔧 <b>Firebase 快速設定步驟：</b><br>
                        1. 前往 <a href="https://firebase.google.com" target="_blank" style="color: #3b82f6; text-decoration-color: #3b82f6;" class="hover:opacity-80 underline underline-offset-2 font-bold">Firebase 官網 🔗</a> ➔ 點擊 <b>Go to console</b>。<br>
                        2. 點擊 <b>新增專案</b>（關閉 Analytics 即可快速建立）。<br>
                        3. 進入左側 <b>Realtime Database</b> ➔ 點擊 <b>建立資料庫</b>（位置選美國/預設即可）。<br>
                        4. 切換到 <b>規則 (Rules)</b> 頁籤，將讀寫值皆改為 <b><code>true</code></b> 並點擊 <b>發布</b>。<br>
                        5. 複製資料庫主頁的 <b>資料庫網址</b><br>（格式：<span class="text-orange-400 font-mono text-[10px]">https://...firebaseio.com</span>）。<br>
                        <span class="text-cyan-400 font-bold">💡 Firebase 適合 <b>存檔較大</b>（遊玩進度極深、遊戲數據龐大，免費容量高達 <b>1GB</b>，可建立不同存檔供 <b>30 ~ 50 人同時使用無壓力</b>）的使用者。<a href="https://github.com/KID0924/idle-lineage-class" target="_blank" style="color: #3b82f6; text-decoration-color: #3b82f6;" class="hover:opacity-80 underline underline-offset-2 font-bold ml-1">詳情說明 🔗</a></span>
                    </div>
                    <div id="supabase-hint" class="text-[11px] text-slate-400 text-left -mt-1 leading-relaxed bg-slate-900/50 p-2 rounded" style="display: none;">
                        伺服器頻寬有限，請盡量改用 Jsonblob 連線。
                    </div>
                    <div class="w-full" id="btn-copy-to-local-container" style="display: none;"><button onclick="window.copyCloudCacheToLocalSaves()" class="btn w-full py-2.5 text-sm bg-rose-950/40 hover:bg-rose-900/60 border-rose-800 text-rose-300 font-bold">📥 複製回本地</button></div>
                    <div class="w-full" id="btn-cloud-read-container"><button id="btn-cloud-read" class="btn w-full py-2.5 text-sm bg-indigo-700 hover:bg-indigo-600 border-indigo-500 font-bold"></button></div>
                    <div id="klh-firebase-extra-container" class="w-full" style="display: none;"></div>
                    <div id="klh-restore-key-container" class="w-full"></div>
                    <div id="klh-quick-keys-header" class="text-[11px] text-slate-400 font-bold mt-1">快速切換公用金鑰：</div>
                    <div id="klh-quick-keys-list" class="flex flex-col gap-1.5 text-sm"></div>
                </div>
                <button onclick="window.hideCloudSaveModal()" class="btn w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700 font-bold mt-2">關閉並返回</button>
            `;
            modalContent.appendChild(container);
            modalBackdrop.appendChild(modalContent);
            document.body.appendChild(modalBackdrop);
        }

        // 3. 定義全域顯示 / 隱藏 Modal 的函式
        window.showCloudSaveModal = function () {
            const modal = document.getElementById('cloud-save-modal-backdrop');
            if (modal) {
                modal.style.display = 'flex';
                setTimeout(() => { modal.style.opacity = '1'; }, 10);
            }
        };

        window.hideCloudSaveModal = function () {
            const currentMode = localStorage.getItem('klh_storage_mode') || 'local';
            if (currentMode === 'cloud') {
                const inputEl = document.getElementById('jsonblob-input');
                const inputVal = inputEl ? inputEl.value.trim() : '';
                if (window.isValidUuid(inputVal)) {
                    // 自動幫忙登入/儲存此金鑰
                    window.saveJsonBlobConfig(inputVal);
                } else {
                    // 金鑰無效，強制切回本地模式並提示
                    localStorage.setItem('klh_storage_mode', 'local');
                    window.updateStorageModeUI();
                    if (typeof window.showToast === 'function') {
                        window.showToast('⚠️ 未輸入有效金鑰，已自動為您切回本地儲存模式。', 'warning');
                    }
                }
            } else if (currentMode === 'firebase') {
                const serverInput = document.getElementById('firebase-server-input');
                const syncInput = document.getElementById('firebase-sync-input');
                const serverUrl = serverInput ? serverInput.value.trim() : '';
                const syncId = syncInput ? syncInput.value.trim() : '';
                if (serverUrl && syncId) {
                    window.saveFirebaseConfig(serverUrl, syncId);
                } else {
                    // 強制切回本地模式
                    localStorage.setItem('klh_storage_mode', 'local');
                    window.updateStorageModeUI();
                    if (typeof window.showToast === 'function') {
                        window.showToast('⚠️ 未輸入有效伺服器與存檔，已自動為您切回本地儲存模式。', 'warning');
                    }
                }
            }

            const modal = document.getElementById('cloud-save-modal-backdrop');
            if (modal) {
                modal.style.opacity = '0';
                setTimeout(() => { modal.style.display = 'none'; }, 250);
            }
        };

        window.updateStorageModeUI();
    }
    window.initCloudSaveUI = initCloudSaveUI;

    // ==========================================
    // 10. saveGame / saveWarehouse Hook (雲端上傳)
    // ==========================================
    if (typeof window.loadGame === 'function' && !window.__klh_load_game_db_wrapped) {
        window.__klh_load_game_db_wrapped = true;
        const originalLoadGame = window.loadGame;
        window.loadGame = function () {
            try {
                let raw = (typeof _lzGet === 'function') ? _lzGet('lineage_idle_save_' + currentSlot) : localStorage.getItem('lineage_idle_save_' + currentSlot);
                if (raw) {
                    let unwrapped = _saveUnwrap(raw);
                    if (unwrapped.ok && unwrapped.payload) {
                        let data = JSON.parse(unwrapped.payload);
                        if (data && data.p && data.p.klh_save_domain) {
                            let saveDomain = data.p.klh_save_domain;
                            let currentDomain = location.hostname;
                            if (saveDomain !== currentDomain) {
                                let yes = confirm(`⚠️ 【存檔來源網站衝突警告】\n\n載入的存檔來源網站為「${saveDomain}」，與當前網頁「${currentDomain}」不同。\n\n不同版本的網站存檔資料欄位可能存在衝突，確定要載入此存檔嗎？`);
                                if (!yes) {
                                    if (typeof window.hideLoadingOverlay === 'function') window.hideLoadingOverlay();
                                    return;
                                }
                            }
                        }
                    }
                }
            } catch (e) {
                console.error("[KLH] loadGame check domain error:", e);
            }
            originalLoadGame();
        };
    }

    if (typeof window.saveGame === 'function' && !window.__klh_save_game_db_wrapped) {
        window.__klh_save_game_db_wrapped = true;
        const originalSaveGame = window.saveGame;
        window.saveGame = async function (isManual = false) {
            // 注入當前網域標籤到記憶體中的 player 物件上
            try {
                if (typeof player !== 'undefined' && player) {
                    player.klh_save_domain = location.hostname;
                }
            } catch (err) {
                console.error("[KLH] Failed to inject domain into player:", err);
            }

            // 💡 動態偵測手動點擊：如果點擊了名為「存檔」或「儲存」的按鈕，自動判定為手動儲存，以啟用雲端同步彈窗
            let manual = isManual;
            if (!manual && typeof window !== 'undefined' && window.event && window.event.type === 'click') {
                const target = window.event.target;
                if (target) {
                    const btn = target.closest('button');
                    const text = (btn ? btn.textContent : target.textContent) || '';
                    if (text.includes('存檔') || text.includes('儲存')) {
                        manual = true;
                    }
                }
            }

            try { await originalSaveGame(manual); } catch (e) { console.error("[KLH] originalSaveGame error:", e); }
            try {
                const storageMode = localStorage.getItem('klh_storage_mode') || 'local';
                if (storageMode === 'supabase' && allowSupabase) { if (typeof window.uploadToSupabase === 'function') return await window.uploadToSupabase(manual); }
                else if (storageMode === 'cloud' && allowJsonBlob) { if (typeof window.uploadToCloud === 'function') return await window.uploadToCloud(manual); }
                else if (storageMode === 'firebase' && allowFirebase) { if (typeof window.uploadToFirebase === 'function') return await window.uploadToFirebase(manual); }
            } catch (e) { console.error("[KLH] saveGame post-hook upload error:", e); }
        };
    }

    if (typeof window.exportSave === 'function' && !window.__klh_export_save_db_wrapped) {
        window.__klh_export_save_db_wrapped = true;
        const originalExportSave = window.exportSave;
        window.exportSave = async function () {
            // 暫時攔截 _saveWrap，在匯出時清除網域資訊，保持檔案乾淨
            const originalSaveWrap = window._saveWrap;
            if (typeof originalSaveWrap === 'function') {
                window._saveWrap = function (payloadStr) {
                    try {
                        let d = JSON.parse(payloadStr);
                        if (d && d.p && d.p.klh_save_domain) {
                            delete d.p.klh_save_domain;
                        }
                        payloadStr = JSON.stringify(d);
                    } catch (e) {}
                    return originalSaveWrap(payloadStr);
                };
            }
            try {
                await originalExportSave();
            } finally {
                if (typeof originalSaveWrap === 'function') {
                    window._saveWrap = originalSaveWrap;
                }
            }
        };
    }

    if (typeof window.saveWarehouse === 'function' && !window.__klh_save_warehouse_wrapped) {
        window.__klh_save_warehouse_wrapped = true;
        const originalSaveWarehouse = window.saveWarehouse;
        window.saveWarehouse = async function (w) {
            try { originalSaveWarehouse(w); } catch (e) { console.error("[KLH] originalSaveWarehouse error:", e); }
            try {
                const storageMode = localStorage.getItem('klh_storage_mode') || 'local';
                if (storageMode === 'supabase' && allowSupabase) { if (typeof window.uploadToSupabase === 'function') return await window.uploadToSupabase(); }
                else if (storageMode === 'cloud' && allowJsonBlob) { if (typeof window.uploadToCloud === 'function') return await window.uploadToCloud(); }
                else if (storageMode === 'firebase' && allowFirebase) { if (typeof window.uploadToFirebase === 'function') return await window.uploadToFirebase(); }
            } catch (e) { console.error("[KLH] saveWarehouse post-hook upload error:", e); }
        };
    }

    // ==========================================
    // 11. 登出安全攔截
    // ==========================================
    document.addEventListener('click', async function (e) {
        const btn = e.target && e.target.closest && e.target.closest('#m-logout-ok');
        if (btn) {
            e.stopImmediatePropagation();
            e.preventDefault();
            const msgEl = document.getElementById('m-logout-msg');
            const storageMode = localStorage.getItem('klh_storage_mode') || 'local';
            const isCloudMode = (storageMode === 'cloud' && allowJsonBlob) || (storageMode === 'supabase' && allowSupabase) || (storageMode === 'firebase' && allowFirebase);
            const loadMsg = isCloudMode ? "正在儲存並同步至雲端，請稍候..." : "正在儲存進度，請稍候...";
            if (msgEl) msgEl.innerHTML = loadMsg;
            const btnsEl = document.getElementById('m-logout-btns');
            if (btnsEl) btnsEl.style.display = 'none';
            if (typeof window.showLoadingOverlay === 'function') window.showLoadingOverlay(loadMsg);
            let saveSuccess = true;
            try { if (typeof window.saveGame === 'function') { const res = await window.saveGame(true); if (res === false) saveSuccess = false; } }
            catch (err) { saveSuccess = false; }
            if (typeof window.hideLoadingOverlay === 'function') window.hideLoadingOverlay();
            if (!saveSuccess && isCloudMode) {
                const confirmForce = confirm("⚠️ 雲端備份失敗。\n是否仍要強行回首頁？");
                if (!confirmForce) {
                    if (msgEl) msgEl.innerHTML = '回首頁前會<b>自動幫你存檔</b>，進度不會遺失。<br>確定回首頁？';
                    if (btnsEl) btnsEl.style.display = 'flex';
                    const logoutModal = document.getElementById('m-logout-modal');
                    if (logoutModal) logoutModal.classList.remove('open');
                    return;
                }
            }
            try { if (window.__afk && window.__afk.stamp) window.__afk.stamp(); } catch (err) {}
            setTimeout(() => { try { location.reload(); } catch (err) {} }, 350);
        }
    }, true);

    // ==========================================
    // 12. 初始化與自動同步
    // ==========================================
    async function initDatabase() {
        // 模式安全退回校正
        let initialStorageMode = localStorage.getItem('klh_storage_mode') || 'local';
        if (initialStorageMode === 'supabase' && !allowSupabase) {
            initialStorageMode = allowJsonBlob ? 'cloud' : (allowFirebase ? 'firebase' : 'local');
            localStorage.setItem('klh_storage_mode', initialStorageMode);
        } else if (initialStorageMode === 'cloud' && !allowJsonBlob) {
            initialStorageMode = allowSupabase ? 'supabase' : (allowFirebase ? 'firebase' : 'local');
            localStorage.setItem('klh_storage_mode', initialStorageMode);
        } else if (initialStorageMode === 'firebase' && !allowFirebase) {
            initialStorageMode = allowSupabase ? 'supabase' : (allowJsonBlob ? 'cloud' : 'local');
            localStorage.setItem('klh_storage_mode', initialStorageMode);
        }

        // 初始化雲端存檔 UI
        initCloudSaveUI();

        // 自動清理無效的雲端本地快取檔案
        if (typeof window.cleanUnusedCloudCaches === 'function') {
            window.cleanUnusedCloudCaches();
        }

        // 自動載入 Supabase SDK
        if (allowSupabase) {
            try {
                await loadSupabaseSDK();
                supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                console.log("[Supabase] Client 初始化成功！");
            } catch (err) {
                console.error("[Supabase] SDK 載入或 Client 初始化失敗:", err);
            }
        }

        // 偵測預設模式
        if (localStorage.getItem('klh_storage_mode') === null || localStorage.getItem('klh_storage_mode') === 'supabase') {
            if (allowSupabase) {
                const hasSupabaseKey = (localStorage.getItem('klh_supabase_key') || '').trim() || (localStorage.getItem('klh_supabase_local_key') || '').trim();
                if (!hasSupabaseKey) {
                    localStorage.setItem('klh_storage_mode', 'local');
                } else if (localStorage.getItem('klh_storage_mode') === null) {
                    localStorage.setItem('klh_storage_mode', 'supabase');
                }
            } else {
                localStorage.setItem('klh_storage_mode', 'local');
            }
        }
        window.updateStorageModeUI();

        // 自動雲端載入並同步
        if (initialStorageMode === 'cloud' && allowJsonBlob) {
            window.syncFromCloud(false).then(() => { refreshLoadBtnVisibility(); });
        } else if (initialStorageMode === 'supabase' && allowSupabase) {
            if (supabase) {
                window.syncFromSupabase(false).then(() => { refreshLoadBtnVisibility(); });
            } else {
                refreshLoadBtnVisibility();
            }
        } else if (initialStorageMode === 'firebase' && allowFirebase) {
            // Firebase 模式不自動在載入時連線讀取，節省流量，直接啟用快取讀寫
            window.__klh_cloud_sync_success = true;
            refreshLoadBtnVisibility();
        } else {
            refreshLoadBtnVisibility();
        }
    }

    if (document.readyState === 'interactive' || document.readyState === 'complete') {
        initDatabase();
    } else {
        document.addEventListener('DOMContentLoaded', initDatabase);
    }

})();
