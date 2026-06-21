(function () {
    'use strict';

    const SUPABASE_URL = "https://tteveuemmbyesbskeoty.supabase.co";
    const SUPABASE_ANON_KEY = "sb_publishable_W9Nu6MCy33wzEb3VKv7emg_ZWvkCCyP";
    let supabase = null;

    // ==========================================
    // 共享輔助函式與 UI 宣告 (與 klh_jsonblob.js 共用/相容)
    // ==========================================
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

    if (typeof window.isValidUuid !== 'function') {
        window.isValidUuid = function (key) {
            key = (key || "").trim();
            if (!key) return false;
            if (key.startsWith("http://") || key.startsWith("https://")) {
                return true;
            }
            const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
            return uuidRegex.test(key);
        };
    }

    if (typeof window.copyLocalSavesToCloudCache !== 'function') {
        window.copyLocalSavesToCloudCache = function () {
            const mode = localStorage.getItem('klh_storage_mode') || 'local';
            let activeKey = '';
            if (mode === 'supabase') {
                activeKey = localStorage.getItem('klh_supabase_key') || '';
            } else {
                activeKey = window.activeKey || localStorage.getItem('lineage_idle_jsonblob_url') || '019ed445-679f-7ae4-9f05-f887591d1266';
            }
            if (!activeKey) return;
            const suffix = '_' + activeKey.trim();
            const originalGetItem = Storage.prototype.__originalGetItem || Storage.prototype.getItem;
            const originalSetItem = Storage.prototype.__originalSetItem || Storage.prototype.setItem;
            const originalRemoveItem = Storage.prototype.__originalRemoveItem || Storage.prototype.removeItem;

            ['1', '2', '3', '4'].forEach(n => {
                const localVal = originalGetItem.call(localStorage, 'lineage_idle_save_' + n);
                if (localVal !== null) {
                    originalSetItem.call(localStorage, 'klh_cloud_save_' + n + suffix, localVal);
                } else {
                    originalRemoveItem.call(localStorage, 'klh_cloud_save_' + n + suffix);
                }
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
        };
    }

    if (typeof window.refreshLoadBtnVisibility !== 'function') {
        window.refreshLoadBtnVisibility = function () {
            const btnLoad = document.getElementById('btn-load');
            if (btnLoad) {
                const anySaveExists = ['1', '2', '3', '4'].some(n => localStorage.getItem('lineage_idle_save_' + n));
                if (anySaveExists) btnLoad.classList.remove('hidden');
                else btnLoad.classList.add('hidden');
            }
        };
    }

    // 解決 iOS 虛擬鍵盤彈起/滾動 bug
    if (!window.__klh_keyboard_listeners_attached) {
        window.__klh_keyboard_listeners_attached = true;
        let isKeyboardOpened = false;
        document.addEventListener('focusin', function (e) {
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
                // 只有 INPUT / TEXTAREA 會彈出虛擬鍵盤，需要隱藏底部導航
                // SELECT 是原生 picker 彈窗，不佔頁面空間，不需隱藏 nav
                isKeyboardOpened = true;
                // 延遲隱藏 nav，避免同步改變佈局導致焦點丟失（輸入框震動 bug）
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

    // CSS 注入
    if (!document.getElementById('klh-style-el')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'klh-style-el';
        styleEl.innerHTML = `
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

            /* 解決 iOS 鍵盤彈起時的自動縮放與 fixed 元素錯位 */
            body.m-mobile input, 
            body.m-mobile select, 
            body.m-mobile textarea {
                font-size: 16px !important;
            }
            /* 僅在手機版且虛擬鍵盤開啟時將底部導航移到螢幕外（不用 display:none 以避免 layout shift 導致靠近底部的 input 震動） */
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
            @keyframes klh-fade-in {
                from { opacity: 0; transform: translateY(-8px); }
                to { opacity: 1; transform: translateY(0); }
            }
        `;
        document.head.appendChild(styleEl);
    }

    if (typeof window.showToast !== 'function') {
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
            setTimeout(() => toast.classList.add('show'), 10);
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        };
    }

    if (typeof window.showLoadingOverlay !== 'function') {
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
            overlay.classList.add('show');
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
                if (fillEl) fillEl.style.width = '100%';
                setTimeout(() => {
                    overlay.classList.remove('show');
                }, 300);
            }
        };
    }

    // localStorage 模式隔離代理
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
            return originalGetItem.call(this, getRedirectedKey(key));
        };

        Storage.prototype.setItem = function (key, value) {
            return originalSetItem.call(this, getRedirectedKey(key), value);
        };

        Storage.prototype.removeItem = function (key) {
            return originalRemoveItem.call(this, getRedirectedKey(key));
        };
    }

    // 攔截 saveGame() / saveWarehouse() / loadGame()
    if (!window.__klh_save_game_wrapped) {
        window.__klh_save_game_wrapped = true;
        const originalSaveGame = window.saveGame;
        window.saveGame = async function () {
            if (player && player.dead) return;
            originalSaveGame();
            const storageMode = localStorage.getItem('klh_storage_mode') || 'local';
            if (storageMode === 'supabase') {
                if (typeof window.uploadToSupabase === 'function') {
                    return await window.uploadToSupabase();
                }
            } else if (storageMode === 'cloud') {
                if (typeof window.uploadToCloud === 'function') {
                    return await window.uploadToCloud();
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
            if (storageMode === 'supabase') {
                if (typeof window.uploadToSupabase === 'function') {
                    return await window.uploadToSupabase();
                }
            } else if (storageMode === 'cloud') {
                if (typeof window.uploadToCloud === 'function') {
                    return await window.uploadToCloud();
                }
            }
        };
    }

    if (typeof window.switchToLocalMode !== 'function') {
        window.switchToLocalMode = function () {
            const currentMode = localStorage.getItem('klh_storage_mode') || 'local';
            if (currentMode === 'local') return;

            localStorage.setItem('klh_storage_mode', 'local');
            window.updateStorageModeUI();
            if (typeof window.refreshLoadBtnVisibility === 'function') {
                window.refreshLoadBtnVisibility();
            }

            const slotSelectPanel = document.getElementById('slot-select-panel');
            if (slotSelectPanel && !slotSelectPanel.classList.contains('hidden')) {
                if (typeof window.openSlotSelect === 'function') {
                    window.openSlotSelect(window._slotMode || 'load');
                }
            }
            window.showToast('已切換回本地儲存模式，存檔將只保存在本機瀏覽器。', 'success');
        };
    }

    if (typeof window.handleFastKeyClick !== 'function') {
        window.handleFastKeyClick = async function (btn) {
            const key = btn.getAttribute('data-key');
            if (key.startsWith("0012") && key.length === 12) {
                if (typeof window.syncFromSupabase === 'function') {
                    localStorage.setItem('klh_supabase_key', key);
                    localStorage.setItem('klh_storage_mode', 'supabase');
                    window.updateStorageModeUI();
                    await window.syncFromSupabase(true);
                }
            } else {
                if (typeof window.syncFromCloud === 'function') {
                    if (typeof window.saveJsonBlobConfig === 'function') {
                        window.saveJsonBlobConfig(key);
                    } else {
                        localStorage.setItem('lineage_idle_jsonblob_url', key);
                    }
                    localStorage.setItem('klh_storage_mode', 'cloud');
                    window.updateStorageModeUI();
                    await window.syncFromCloud(true);
                }
            }
        };
    }

    if (typeof window.initCloudSaveUI !== 'function') {
        window.initCloudSaveUI = function () {
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
                        <button id="btn-cloud-read" class="btn w-full py-2.5 text-sm bg-indigo-700 hover:bg-indigo-600 border-indigo-500 font-bold"></button>
                    </div>
                    <div id="klh-quick-keys-header" class="text-[11px] text-slate-400 font-bold mt-1">快速切換公用金鑰：</div>
                    <div id="klh-quick-keys-list" class="flex flex-col gap-1.5 text-sm"></div>
                </div>
            `;
            mainMenu.appendChild(container);
            window.updateStorageModeUI();
        };
    }

    if (typeof window.updateStorageModeUI !== 'function') {
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
            const readBtn = document.getElementById('btn-cloud-read');
            // const quickKeysHeader = document.getElementById('klh-quick-keys-header');
            // const quickKeysList = document.getElementById('klh-quick-keys-list');

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
                        inputEl.placeholder = '請輸入雲端金鑰';
                        inputEl.value = window.activeKey || '';
                    }
                    if (readBtn) {
                        readBtn.innerText = '登入';
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
                    if (localKey && sKey === localKey) {
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
                        readBtn.innerText = '登入';
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
    }


    // 動態載入 Supabase SDK
    function loadSupabaseSDK() {
        return new Promise((resolve, reject) => {
            if (window.supabase) {
                resolve(window.supabase);
                return;
            }
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
            script.onload = () => {
                if (window.supabase) {
                    resolve(window.supabase);
                } else {
                    reject(new Error('Supabase SDK loaded but window.supabase is not defined'));
                }
            };
            script.onerror = () => reject(new Error('Failed to load Supabase SDK'));
            document.head.appendChild(script);
        });
    }

    // 1. 生成 12 位元隨機小寫英數亂碼 (例如: 0012k1i6d224)
    function generatePlayerID() {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < 12; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    let lastAutoUploadTime = 0;
    const AUTO_UPLOAD_DEBOUNCE_MS = 60000; // 60秒自動存檔上傳節流

    window.addEventListener('beforeunload', () => {
        window.__klh_is_unloading = true;
    });

    // 2. 異步上傳至 Supabase
    window.uploadToSupabase = async function (isManual = false, forceFullOverwrite = false, skipMergeSlot = null) {
        if (!supabase) return;

        // 自動上傳節流：若非手動且非強制全覆寫，且頁面沒有在關閉中，限制 60 秒內只上傳一次
        if (!isManual && !forceFullOverwrite && !window.__klh_is_unloading) {
            const now = Date.now();
            if (now - lastAutoUploadTime < AUTO_UPLOAD_DEBOUNCE_MS) {
                return;
            }
            lastAutoUploadTime = now;
        }

        const key = (localStorage.getItem('klh_supabase_key') || '').trim();
        if (!key) {
            if (isManual) window.showToast('雲端金鑰不存在，無法執行寫入！', 'error');
            return;
        }

        const payload = {
            save_1: localStorage.getItem('lineage_idle_save_1'),
            save_2: localStorage.getItem('lineage_idle_save_2'),
            save_3: localStorage.getItem('lineage_idle_save_3'),
            save_4: localStorage.getItem('lineage_idle_save_4'),
            warehouse: localStorage.getItem('lineage_idle_warehouse')
        };

        const activeSlot = (typeof window.currentSlot !== 'undefined') ? parseInt(window.currentSlot, 10) : null;

        // 合併雲端其他槽位的存檔
        if (!forceFullOverwrite && activeSlot >= 1 && activeSlot <= 4) {
            if (isManual) {
                window.showLoadingOverlay('正在讀取並合併雲端存檔...');
            }
            try {
                const { data, error } = await supabase
                    .rpc('load_player_save', { player_id: key });

                if (error) {
                    throw error;
                }

                if (data) {
                    const cloudData = data;
                    const skipSlot = (skipMergeSlot !== null) ? parseInt(skipMergeSlot, 10) : null;

                    for (let n = 1; n <= 4; n++) {
                        if (n !== activeSlot && n !== skipSlot) {
                            const cloudSlotVal = cloudData['save_' + n];
                            if (cloudSlotVal !== undefined && cloudSlotVal !== null) {
                                payload['save_' + n] = (typeof cloudSlotVal === 'object') ? JSON.stringify(cloudSlotVal) : cloudSlotVal;
                            } else {
                                payload['save_' + n] = null;
                            }
                        }
                    }
                    
                    const cloudWarehouse = cloudData.warehouse;
                    if (activeSlot !== 5 && cloudWarehouse !== undefined && cloudWarehouse !== null) {
                        payload.warehouse = (typeof cloudWarehouse === 'object') ? JSON.stringify(cloudWarehouse) : cloudWarehouse;
                    }
                }
            } catch (e) {
                console.error("[Supabase] 讀取並合併存檔失敗:", e);
                if (isManual) {
                    window.showToast('雲端存檔同步失敗：無法取得最新狀態，已取消同步！', 'error');
                }
                return;
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
            const { error } = await supabase
                .rpc('save_player_save', {
                    player_id: key,
                    new_save_data: payload
                });

            if (error) throw error;

            if (isManual) {
                window.showToast('成功將本機進度同步至雲端！', 'success');
            }
        } catch (err) {
            console.error('Error syncing to Supabase:', err);
            if (isManual) {
                window.showToast('上傳雲端存檔失敗，請檢查網路連線。', 'error');
            }
        } finally {
            if (isManual) {
                window.hideLoadingOverlay();
            }
        }
    };

    // 3. 異步自 Supabase 讀取並同步本機
    window.syncFromSupabase = async function (isManual) {
        if (!supabase) return;
        const key = (localStorage.getItem('klh_supabase_key') || '').trim();
        if (!key) {
            if (isManual) window.showToast('雲端金鑰不存在，無法讀取！', 'error');
            return;
        }

        window.isCloudSyncing = true;
        if (typeof window.updateLoadButtonState === 'function') {
            window.updateLoadButtonState();
        }

        if (isManual) {
            window.showLoadingOverlay('正在讀取雲端存檔中...');
        }

        try {
            const { data, error } = await supabase
                .rpc('load_player_save', { player_id: key });

            if (error) {
                throw error;
            }

            if (!data) {
                window.showToast('雲端無存檔或金鑰已失效！如果是全新金鑰，請進行手動存檔初始化。', 'error');
                return;
            }

            const currentMode = localStorage.getItem('klh_storage_mode') || 'local';
            if (currentMode !== 'supabase') {
                console.warn("[Supabase] 下載完成，但玩家已切換模式，放棄寫入。");
                return;
            }

            const payload = data;
            ['1', '2', '3', '4'].forEach(n => {
                const val = payload['save_' + n];
                if (val !== undefined && val !== null) {
                    const strVal = (typeof val === 'object') ? JSON.stringify(val) : val;
                    localStorage.setItem('lineage_idle_save_' + n, strVal);
                } else {
                    localStorage.removeItem('lineage_idle_save_' + n);
                }
            });

            const warehouseVal = payload.warehouse;
            if (warehouseVal !== undefined && warehouseVal !== null) {
                const strVal = (typeof warehouseVal === 'object') ? JSON.stringify(warehouseVal) : warehouseVal;
                localStorage.setItem('lineage_idle_warehouse', strVal);
            } else {
                localStorage.removeItem('lineage_idle_warehouse');
            }

            if (isManual) window.showToast('雲端存檔同步成功！', 'success');

            if (typeof window.refreshLoadBtnVisibility === 'function') {
                window.refreshLoadBtnVisibility();
            }
        } catch (err) {
            console.error('[Supabase] 讀取失敗:', err);
            if (isManual) window.showToast('讀取雲端存檔失敗：' + err.message, 'error');
        } finally {
            window.isCloudSyncing = false;
            if (typeof window.updateLoadButtonState === 'function') {
                window.updateLoadButtonState();
            }

            const slotSelectPanel = document.getElementById('slot-select-panel');
            if (slotSelectPanel && !slotSelectPanel.classList.contains('hidden')) {
                if (typeof window.openSlotSelect === 'function') {
                    window.openSlotSelect(window._slotMode || 'load');
                }
            }

            if (isManual) {
                window.hideLoadingOverlay();
            }
        }
    };

    // 4. 切換為 Supabase 模式與新創玩家自動發卡
    window.switchToSupabaseMode = async function () {
        localStorage.setItem('klh_storage_mode', 'supabase');

        let localKey = (localStorage.getItem('klh_supabase_local_key') || '').trim();

        // 直接套用本機專屬金鑰
        if (localKey) {
            localStorage.setItem('klh_supabase_key', localKey);
        }
        let key = (localStorage.getItem('klh_supabase_key') || '').trim();

        if (typeof window.updateStorageModeUI === 'function') {
            window.updateStorageModeUI();
        }

        if (!key) {
            const newKey = generatePlayerID();

            window.showLoadingOverlay('正在初始化雲端存檔位置...');
            try {
                const initialTemplate = {
                    "save_1": null,
                    "save_2": null,
                    "save_3": null,
                    "save_4": null,
                    "warehouse": null
                };
                const { error } = await supabase
                    .rpc('save_player_save', {
                        player_id: newKey,
                        new_save_data: initialTemplate
                    });

                if (error) throw error;

                // 成功寫入雲端後，才寫入本機設定，本機金鑰與當前金鑰同步
                key = newKey;
                localStorage.setItem('klh_supabase_key', key);
                localStorage.setItem('klh_supabase_local_key', key);

                // 同步本地快取並上傳
                if (typeof window.copyLocalSavesToCloudCache === 'function') {
                    window.copyLocalSavesToCloudCache();
                }
                await window.uploadToSupabase(false, true);

                if (typeof window.updateStorageModeUI === 'function') {
                    window.updateStorageModeUI();
                }

                window.showToast(`【新創成功】雲端金鑰為: ${key}`, 'success');
                if (typeof window.showSupabaseKeyBanner === 'function') {
                    window.showSupabaseKeyBanner(key);
                } else if (typeof window.showSupabaseKeyModal === 'function') {
                    window.showSupabaseKeyModal(key);
                } else {
                    alert(`【新創大成功】您的雲端備份金鑰為:\n\n${key}\n\n請務必截圖妥善保存！`);
                }
            } catch (err) {
                console.error("[Supabase] 創立新帳號失敗:", err);
                window.showToast('創立新帳號失敗：' + err.message, 'error');
                // 創立失敗，退回本地模式
                localStorage.setItem('klh_storage_mode', 'local');
                if (typeof window.updateStorageModeUI === 'function') {
                    window.updateStorageModeUI();
                }
                window.hideLoadingOverlay();
                return;
            } finally {
                window.hideLoadingOverlay();
            }
        }

        await window.syncFromSupabase(true);

        const slotSelectPanel = document.getElementById('slot-select-panel');
        if (slotSelectPanel && !slotSelectPanel.classList.contains('hidden')) {
            if (typeof window.openSlotSelect === 'function') {
                window.openSlotSelect(window._slotMode || 'load');
            }
        }
    };

    // 複製本機專屬金鑰
    window.copySupabaseLocalKey = function () {
        const localKey = localStorage.getItem('klh_supabase_local_key') || '';
        if (!localKey) {
            window.showToast('尚未生成本機金鑰！', 'error');
            return;
        }
        navigator.clipboard.writeText(localKey).then(() => {
            window.showToast('本機金鑰已成功複製到剪貼簿！', 'success');
        }).catch(err => {
            // 備用複製
            const el = document.createElement('textarea');
            el.value = localKey;
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
            window.showToast('本機金鑰已成功複製到剪貼簿！', 'success');
        });
    };

    // 還原為本機專屬金鑰
    window.restoreSupabaseLocalKey = async function () {
        const localKey = localStorage.getItem('klh_supabase_local_key') || '';
        if (!localKey) return;
        localStorage.setItem('klh_supabase_key', localKey);
        if (typeof window.updateStorageModeUI === 'function') {
            window.updateStorageModeUI();
        }
        await window.syncFromSupabase(true);
    };

    // 5. 處理手動讀取按鈕
    window.handleSupabaseReadClick = async function () {
        const inputEl = document.getElementById('jsonblob-input');
        if (inputEl) {
            let key = inputEl.value.trim();
            if (key.length !== 12) {
                window.showToast('雲端金鑰格式錯誤！必須為 12 碼英數字 (例如: 0012k1i6d224)', 'error');
                return;
            }
            localStorage.setItem('klh_supabase_key', key);
            localStorage.setItem('klh_storage_mode', 'supabase');
            if (typeof window.updateStorageModeUI === 'function') {
                window.updateStorageModeUI();
            }
            await window.syncFromSupabase(true);
        }
    };

    // 初始化與啟動
    async function init() {
        try {
            // 預設是切回雲端 (supabase)
            if (localStorage.getItem('klh_storage_mode') === null) {
                localStorage.setItem('klh_storage_mode', 'supabase');
            }

            // 🚀 在 DOM 載入後先嘗試初始化 UI (若尚未建立)
            if (typeof window.initCloudSaveUI === 'function') {
                window.initCloudSaveUI();
            }

            await loadSupabaseSDK();
            supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            console.log("[Supabase] Client 初始化成功！");

            const initialStorageMode = localStorage.getItem('klh_storage_mode') || 'local';
            if (initialStorageMode === 'supabase') {
                window.syncFromSupabase(false).then(() => {
                    if (typeof window.refreshLoadBtnVisibility === 'function') {
                        window.refreshLoadBtnVisibility();
                    }
                });
            }
        } catch (err) {
            console.error("[Supabase] SDK 載入或 Client 初始化失敗:", err);
        }
    }

    if (document.readyState === 'interactive' || document.readyState === 'complete') {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }

})();
