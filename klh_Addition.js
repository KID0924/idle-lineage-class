/* ============================================================================
 * klh_Addition.js — 快速批量賣出、批量加鎖、模糊搜尋 & 轉生系統 & 廢品記憶清單 & PC_Fix 列表優化
 *
 * 設計原則:
 *   1. 完全不改原作者程式碼 —— 僅透過從外部「包住」全域函式 (Monkey-Patch) 進行擴充。
 *   2. 優雅降級與安全降載 —— 核心 Hook 皆以 try-catch 沙盒包裹並配備 typeof 存在性檢查，
 *                         若原作者未來改版導致函式或變數消失，外掛功能會默默安全降級或停用，
 *                         確保絕對不拋出致命 JS 錯誤，完全保障原版遊戲流程不中斷。
 *
 * 掛接方式: 在 index.html 的 </body> 標籤正上方，插入以下外掛腳本：
 *   <script src="klh_Addition.js?v=20260713"></script>
 *
 * 功能一覽:
 *   1. PC_Fix 整合與全域樣式 —— 提供效能列表模式 CSS 與官方皮革格子模式切換，含發光/彈窗特效 CSS。
 *   2. 快速批量賣出與鎖定系統 —— 背包第三欄加入「批量賣出/加鎖/解鎖」功能，含模糊搜尋一鍵拋售。
 *   3. renderTabs 動態代理 Hook —— 覆寫背包標籤渲染邏輯，支援批量 Checkbox 與模糊搜尋置頂排序。
 *   4. 轉生系統實作 —— 「時光使者」NPC（75等以上可轉生，保留屬性點並獲得依難度遞增的額外點數）。
 *   5. 廢品記憶清單管理系統 —— 背包中物品點選「設為廢品」將其加入清單，之後獲得該道具時會自動標記。
 *   6. 核心功能與入口 Hook —— Hook NPC 互動、回憶蠟燭保護、以及統計分頁中的廢品清單按鈕與啟動器。
 * ========================================================================== */

(function () {

    /* ============================================================================
     *  ⚡ 1. PC_Fix 整合、全域介面樣式與發光特效 CSS 注入
     *  此模組包含：PC 效能優化排版模式（列表模式與格子模式）、簽章優化節流與相關全域 CSS 注入。
     * ============================================================================ */

    /* 
     * 【效能監控】檢查分頁面板在畫面上是否真正看得見。
     * 防止後台定時器對隱藏的分頁進行無意義的重新重繪 DOM，以節省處理器資源。
     */
    function isPanelVisible(id) {
        try {
            var el = document.getElementById(id);
            if (!el) return false;
            return !el.classList.contains('hidden') &&
                   el.style.display !== 'none' &&
                   (el.clientHeight > 0 || el.offsetHeight > 0 || (el.getBoundingClientRect && el.getBoundingClientRect().height > 0));
        } catch (e) {
            return false;
        }
    }

    /* 
     * 【重繪判定】計算背包與裝備的「結構特徵簽章」（包含道具ID、屬性、加值、鎖定狀態等，但忽略藥水等堆疊數量變化）。
     * 若此特徵無異，代表背包結構未變（可能只是增加金幣或藥水數量變多），則不重新重繪 DOM，達到大幅省電/降負載之目的。
     */
    function getStructSig() {
        try {
            if (!window.player || !Array.isArray(window.player.inv)) return "";
            var invSig = window.player.inv.map(function (i) {
                return (i.id || "") + "." + (i.attr || "") + "." + (i.anc || "") + "." + (i.bless || "") + "." + (i.lock ? 1 : 0) + "." + (i.junk ? 1 : 0);
            }).join(";");
            var eqSig = "";
            if (window.player.eq) {
                eqSig = Object.keys(window.player.eq).map(function (k) {
                    var e = window.player.eq[k];
                    return e ? (k + ":" + e.id + "." + (e.attr || "") + "." + (e.anc || "") + "." + (e.bless || "")) : (k + ":");
                }).join(",");
            }
            var quickSig = "";
            ['quickSell', 'quickLock', 'quickJunk', 'quickEnh'].forEach(function (key) {
                if (window[key]) {
                    ['wpn', 'arm', 'item'].forEach(function (type) {
                        var st = window[key][type];
                        if (st && st.active) {
                            quickSig += key + "_" + type + ":" + Object.keys(st.sel || {}).filter(function (u) { return st.sel[u]; }).join(',') + ";";
                        }
                    });
                }
            });
            var skillSig = (window.player.skills || []).join(",") + "#" + (window.player.grantedSkills || []).join(",");
            var charSig = window.player.cls + "#" + window.player.lv + "#" + (window.player.elfEle || "");
            return invSig + "#" + eqSig + "#" + quickSig + "#" + skillSig + "#" + charSig;
        } catch (e) {
            return "";
        }
    }

    /* 
     * 【防衝突同步】將外掛計算的結構簽章同步回原版遊戲，
     * 告知系統目前背包狀態已為最新，避免原版重繪時發生覆蓋與排版衝突。
     */
    function syncOriginalSig(origFn) {
        try {
            if (!window.player || !Array.isArray(window.player.inv) || !window.player.eq || typeof window.itemSig !== 'function') return;
            var inv = window.player.inv.map(function(i){ return window.itemSig(i) + '.' + (i.cnt || 1) + '.' + (i.lock ? 1 : 0) + '.' + (i.junk ? 1 : 0); }).join(';');
            var eq = Object.keys(window.player.eq).map(function(k){ var e = window.player.eq[k]; return e ? (k + ':' + window.itemSig(e) + '.' + (e.cnt || 0)) : (k + ':'); }).join(',');
            var dd = window.player.d || {};
            origFn._sig = inv + '#' + eq + '#' + (window.player.skills || []).join(',') + '#' + (window.player.grantedSkills || []).join(',') + '#' + window.player.cls + '#' + window.player.lv + '#' + (window.player.elfEle || '') + '#' + ((dd.str || 0) + (dd.dex || 0) + (dd.con || 0) + (dd.int || 0) + (dd.wis || 0));
        } catch (e) {}
    }

    /* 
     * 【版面樣式】列表排版模式專用的 CSS：
     * 將官方原本的「大格子圖標」改為「橫向條狀列表」排版，調整字級，並在小螢幕時隱藏右側裝備大面板以防爆版。
     */
    var LIST_CSS = `
        #equipment-window { display: none !important; }
        .classic-inventory-tab {
            background: none !important;
            border: none !important;
            padding: 0 !important;
        }
        .classic-inventory-viewport {
            background: none !important;
            border: none !important;
            padding: 0 !important;
            height: auto !important;
            overflow: visible !important;
        }
        .classic-inventory-viewport > .list-item,
        #tab-weapons > .list-item,
        #tab-armors > .list-item,
        #tab-items > .list-item,
        #tab-equip > .list-item {
            background-color: #1e293b !important;
            border-bottom: 1px solid #334155 !important;
            border-radius: 6px !important;
            margin-bottom: 4px !important;
            padding: 6px 12px !important;
            height: 48px !important;
            display: flex !important;
            align-items: center !important;
            min-height: 0 !important;
            box-sizing: border-box !important;
            box-shadow: 0 1px 3px rgba(0,0,0,0.2) !important;
            filter: none !important;
        }
        .classic-inventory-viewport > .list-item:hover,
        #tab-weapons > .list-item:hover,
        #tab-armors > .list-item:hover,
        #tab-items > .list-item:hover,
        #tab-equip > .list-item:hover {
            background-color: #334155 !important;
        }
        .classic-icon-box {
            width: 32px !important;
            height: 32px !important;
            flex: 0 0 32px !important;
            margin-right: 12px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
        }
        .classic-name-box {
            display: flex !important;
            flex-direction: row !important;
            align-items: center !important;
            gap: 8px !important;
            flex: 1 1 auto !important;
            min-width: 0 !important;
            overflow: hidden !important;
            white-space: nowrap !important;
        }
        .classic-name-box > span {
            display: inline-block !important;
            white-space: nowrap !important;
        }
        .classic-name-box > span:not(.classic-slot-name):first-of-type {
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            flex: 0 1 auto !important;
            text-align: left !important;
        }
        .classic-name-box span.text-red-500,
        .classic-name-box span.text-slate-500 {
            font-size: 11px !important;
            flex-shrink: 0 !important;
        }
        .sticky.top-0 {
            top: -12px !important;
        }
    `;

    /* 
     * 【樣式管理】動態向網頁 `<head>` 中新增/移除列表模式的樣式標籤 (Style Tag)。
     */
    function injectListCSS() {
        if (document.getElementById('klh-list-mode-style')) return;
        var s = document.createElement('style');
        s.id = 'klh-list-mode-style';
        s.textContent = LIST_CSS;
        document.head.appendChild(s);
    }
    function removeListCSS() {
        var s = document.getElementById('klh-list-mode-style');
        if (s) s.remove();
    }

    /* 
     * 【樣式清洗】移除原版分頁容器殘留的格子排版 CSS Class，確保列表排版時樣式不會被打亂。
     */
    function stripGridResidue() {
        ['tab-equip', 'tab-weapons', 'tab-armors', 'tab-items'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.classList.remove('classic-inventory-tab');
        });
    }

    /* 
     * 【版面切換套用】依據指定的模式 (list 或 grid) 注入/移出 CSS 樣式，並清理元素殘留屬性。
     */
    function applyLayoutMode(mode) {
        if (mode === 'list') {
            injectListCSS();
            stripGridResidue();
        } else {
            removeListCSS();
        }
    }

    /* 
     * 【功能攔截】Hook 官方分頁切換：
     * 當切換分頁標籤（例如從武器切換到道具）時，強制觸發一次即時重繪以套用正確排版。
     */
    function hookSwitchTab() {
        if (typeof window.switchTab !== 'function' || window.switchTab.__klh_hooked) return;
        var _orig = window.switchTab;
        window.switchTab = function (t, btn) {
            _orig(t, btn);
            if (typeof window.renderTabs === 'function') window.renderTabs(true);
        };
        window.switchTab.__klh_hooked = true;
    }

    /* 
     * 【功能攔截】Hook 官方背包格子渲染裝飾：
     * 當啟用效能列表模式時，直接攔截並跳過官方的大格子包裝邏輯，提升手機與舊裝置效能。
     */
    function hookDecorate() {
        if (typeof window.decorateClassicInventoryTab !== 'function' || window.decorateClassicInventoryTab.__klh_hooked) return;
        var _orig = window.decorateClassicInventoryTab;
        window.decorateClassicInventoryTab = function (div) {
            if ((localStorage.getItem('klh_ui_mode') || 'list') === 'list') return;
            _orig(div);
        };
        window.decorateClassicInventoryTab.__klh_hooked = true;
    }

    /* 
     * 【功能攔截】Hook 官方大裝備側面板：
     * 當處於效能列表模式下，直接隱藏右側裝備欄，避免面板過寬。
     */
    function hookEquipWin() {
        ['openEquipmentWindow', 'refreshEquipmentWindow', 'toggleEquipmentWindow', 'closeEquipmentWindow', 'closeEquipmentSidePanel'].forEach(function (name) {
            if (typeof window[name] !== 'function' || window[name].__klh_hooked) return;
            var orig = window[name];
            window[name] = function () {
                if ((localStorage.getItem('klh_ui_mode') || 'list') === 'list') return;
                return orig.apply(this, arguments);
            };
            window[name].__klh_hooked = true;
        });
    }

    /* 
     * 【全域開關】切換當前的排版模式（效能列表模式 ↔ 官方格子模式）。
     * 保存狀態至瀏覽器快取 (localStorage) 並強制重新整理背包畫面。
     */
    window.toggleLayoutMode = function () {
        var current = localStorage.getItem('klh_ui_mode') || 'list';
        var next = current === 'list' ? 'grid' : 'list';
        localStorage.setItem('klh_ui_mode', next);
        applyLayoutMode(next);
        if (typeof window.renderTabs === 'function') window.renderTabs(true);

        if (typeof window.showToast === 'function') {
            window.showToast(next === 'list' ? '已切換為：2.58 效能列表模式' : '已切換為：官方皮革格子模式', 'info');
        } else if (typeof window.logSys === 'function') {
            window.logSys(next === 'list' ? '已切換為：2.58 效能列表模式' : '已切換為：官方皮革格子模式');
        }
    };

    /* 
     * 【省電優化】比照 Chaos 版本強制開啟 UI 減頻（每秒2次）與日誌捲動批次化（500ms 節流）。
     * 若偵測到目前是 Chaos 版本，則直接不動作，以 Chaos 版本的原生設定為主。
     */
    function initPowerSavingOptimizations() {
        const isChaos = (typeof window.openPowerSaveModal === 'function') || !!document.getElementById('btn-powersave');
        if (isChaos) {
            console.log("[klh_Addition] 偵測為 Chaos 版本，省電重繪與日誌滾動以 Chaos 原生設定為主。");
            return;
        }

        console.log("[klh_Addition] 非 Chaos 版本，強制開啟 UI 重繪降頻 (每秒2次) 與日誌捲動批過化 (500ms)。");

        // 1. UI 重繪頻率限制 (每秒2次)
        if (typeof window.flushTickRender === 'function' && !window.flushTickRender.__klh_throttled) {
            const originalFlushTickRender = window.flushTickRender;
            const UI_SLOW_INTERVAL_MS = 500;
            let lastRenderTime = 0;

            window.flushTickRender = function () {
                let now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
                if (now - lastRenderTime < UI_SLOW_INTERVAL_MS) {
                    return; // 暫緩重繪
                }
                lastRenderTime = now;
                originalFlushTickRender.apply(this, arguments);
            };
            window.flushTickRender.__klh_throttled = true;
        }

        // 2. 戰鬥日誌/系統日誌捲動批次化 (500ms 節流，防 Layout Reflow 引起發熱)
        try {
            const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop') || Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop');
            if (desc && desc.set) {
                let bypassScroll = true;
                let scrollTargets = new Set();
                let scrollTimer = null;

                Object.defineProperty(Element.prototype, 'scrollTop', {
                    configurable: true,
                    enumerable: !!desc.enumerable,
                    get: function () {
                        return desc.get.call(this);
                    },
                    set: function (val) {
                        if (bypassScroll && (this.id === 'combat-log' || this.id === 'sys-log')) {
                            this._needScrollBatch = true;
                            scrollTargets.add(this);
                            if (!scrollTimer) {
                                scrollTimer = setTimeout(() => {
                                    scrollTimer = null;
                                    bypassScroll = false; // 暫時關閉攔截以執行真正的滾動
                                    scrollTargets.forEach(el => {
                                        if (el._needScrollBatch) {
                                            el._needScrollBatch = false;
                                            el.scrollTop = el.scrollHeight;
                                        }
                                    });
                                    scrollTargets.clear();
                                    bypassScroll = true; // 重新啟用攔截
                                }, 500);
                            }
                            return;
                        }
                        desc.set.call(this, val);
                    }
                });
            }
        } catch (e) {
            console.error("[klh_Addition] 注入日誌捲動節流失敗:", e);
        }
    }

    /* 
     * 【初始化】啟動所有 PC_Fix 列表優化 Hooks 並套用當前的排版設定。
     */
    function initPCFix() {
        hookSwitchTab();
        hookDecorate();
        hookEquipWin();
        applyLayoutMode(localStorage.getItem('klh_ui_mode') || 'list');
        initPowerSavingOptimizations();
    }

    /* 
     * 【動態 CSS 注入】向網頁注入以下美化/防錯 CSS：
     * 1. 裝備詞綴發光動畫（黃光 earth3-glow, 橙光 earth5-glow）。
     * 2. iOS 輸入框聚焦防自動縮放設定。
     * 3. 廢品管理視窗的淡入動畫與精美滾動條樣式。
     * 4. 補上被 Tailwind 預編譯器過濾掉的模糊搜尋框聚焦高亮樣式。
     */
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


    /* ============================================================================
     *  ⚡ 2. 快速批量賣出與鎖定系統 (Quick Sell & Lock System)
     * ============================================================================ */

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
            let isList = (localStorage.getItem('klh_ui_mode') || 'list') === 'list';
            let modeLabel = isList ? '📊 效能列表' : '🏺 官方格子';
            let layoutBtnColor = isList ? 'border-amber-700 bg-amber-950/70 text-amber-200' : 'border-purple-700 bg-purple-950/70 text-purple-200';

            hdr.innerHTML = `
                <div class="flex gap-1 w-full">
                    <button onclick="toggleQuickSell('${type}')" class="flex-1 btn border-amber-700 bg-amber-900/70 hover:bg-amber-800 py-1.5 text-sm font-bold text-amber-200 rounded shadow">💰 批量賣出</button>
                    <button onclick="toggleQuickLock('${type}')" class="flex-1 btn border-blue-700 bg-blue-900/70 hover:bg-blue-800 py-1.5 text-sm font-bold text-blue-200 rounded shadow shadow-md">🔒 批量鎖定</button>
                </div>
                <div class="flex gap-1 w-full">
                    <input type="text" id="fuzzy-sell-input-${type}" placeholder="模糊搜尋 (如: 匕首)..." class="flex-1 bg-slate-950 border border-slate-700 text-white rounded text-xs px-2 py-1" onkeydown="if(event.key==='Enter') runFuzzySearch('${type}')">
                    <button onclick="runFuzzySearch('${type}')" class="btn border-sky-700 bg-sky-900/70 hover:bg-sky-800 py-1 px-3 text-xs font-bold text-sky-200 rounded shadow shrink-0">🔍 搜尋</button>
                    <button onclick="toggleLayoutMode()" class="btn ${layoutBtnColor} hover:brightness-110 py-1 px-1.5 text-xs font-bold rounded shadow shrink-0">${modeLabel}</button>
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
        st.fuzzyMatches = null; // 清除模糊搜尋紀錄

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
        st.fuzzyMatches = null; // 清除模糊搜尋紀錄
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
        st.fuzzyMatches = null; // 清除模糊搜尋紀錄

        logSys(`<span class="text-yellow-400 font-bold">批量賣出完成！</span>獲得 <span class="text-yellow-400 font-bold">${totalGold.toLocaleString()} 金幣</span>。`);
        if (details.length <= 5) {
            details.forEach(d => logSys("  - 賣出 " + d));
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
        st.fuzzyMatches = matches.map(i => i.uid); // 儲存模糊搜尋結果的 uid

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
            details.forEach(d => logSys("  - 賣出 " + d));
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


    /* ============================================================================
     *  ⚡ 3. renderTabs 背包分頁渲染代理 Hook & DOM 後處理
     * ============================================================================ */

    let lastGM2Sig = "";
    const originalRenderTabs = window.renderTabs;

    window.renderTabs = function (force) {
        if (typeof state !== 'undefined' && state.ff) return; // 補跑期間不刷新畫面

        // 🛡 保護 0: 如果使用者正聚焦在模糊搜尋輸入框中，且非強制 (force) 重建，
        // 則直接跳過重繪，防止瀏覽器銷毀 DOM 節點導致輸入法組字狀態被打碎而卡頓。
        let activeEl = document.activeElement;
        if (!force && activeEl && activeEl.tagName === 'INPUT' && activeEl.id && activeEl.id.startsWith('fuzzy-sell-input-')) {
            return;
        }

        // 🛡 保護 1: 使用者正按住分頁面板（點擊中）→延後重建，避免按鈕被重繪掉而點擊失效
        if (!force && typeof _tabPointerDown !== 'undefined' && _tabPointerDown) {
            _tabRebuildPending = true;
            return;
        }

        // 🛡 核心優化 A: 分頁完全不可見時，不論何種模式，一律攔截不重建 DOM (降載優化)
        var anyVisible = isPanelVisible('tab-equip') || isPanelVisible('tab-weapons') ||
                         isPanelVisible('tab-armors') || isPanelVisible('tab-items') || isPanelVisible('tab-skill');
        if (!force && !anyVisible) {
            syncOriginalSig(originalRenderTabs);
            return;
        }

        // 判斷目前版面模式
        let currentLayoutMode = localStorage.getItem('klh_ui_mode') || 'list';

        if (currentLayoutMode === 'list') {
            // 🛡 列表模式：1000ms 結構性簽章節流 (大幅降低戰鬥掛機時 CPU 重繪消耗)
            var structSig = getStructSig();
            var now = Date.now();
            var lastRender = window.renderTabs._lastRenderTime || 0;
            var isStructSame = (structSig !== "" && structSig === window.renderTabs._structSig);

            if (!force && isStructSame && (now - lastRender < 1000)) {
                syncOriginalSig(originalRenderTabs);
                return;
            }
            window.renderTabs._lastRenderTime = now;
            window.renderTabs._structSig = structSig;
        } else {
            // 🛡 格子模式：走原版戰鬥 tick 內節流 (250ms 合併)
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
            // 相容處理新版 UI 物品被包裝在 .classic-inventory-viewport 容器內的情況
            let targetContainer = el.querySelector('.classic-inventory-viewport') || el;
            const children = Array.from(targetContainer.children);
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
                    child.ondblclick = null; // 避免批量模式下雙擊觸發裝備/使用
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
                    child.ondblclick = null; // 避免批量模式下雙擊觸發裝備/使用
                }
            });

            // ⚡ 當啟用批量賣出模式且有模糊搜尋結果時，僅將模糊搜尋到的物品置頂排在最前面
            let activeMode = null;
            let topUids = null;
            if (window.quickSell && window.quickSell[type].active && window.quickSell[type].fuzzyMatches) {
                activeMode = 'sell';
                topUids = new Set(window.quickSell[type].fuzzyMatches);
            }

            if (activeMode && topUids && topUids.size > 0) {
                const currentChildren = Array.from(targetContainer.children);
                const selectedNodes = [];
                const unselectedNodes = [];
                const emptyNodes = [];

                currentChildren.forEach(child => {
                    const i = child.__klh_item;
                    if (i) {
                        if (topUids.has(i.uid)) {
                            selectedNodes.push(child);
                        } else {
                            unselectedNodes.push(child);
                        }
                    } else if (child.classList.contains('classic-grid-empty')) {
                        emptyNodes.push(child);
                    }
                });

                // 依序重新 Append：已勾選項目 -> 未勾選項目 -> 空格子
                // 表頭/工具列元素（無 __klh_item 且非 classic-grid-empty 的 node）因為沒有被 append，所以會自然維持在最頂部
                const sortedContent = selectedNodes.concat(unselectedNodes).concat(emptyNodes);
                sortedContent.forEach(node => {
                    targetContainer.appendChild(node);
                });
            }
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


    /* ============================================================================
     *  ⚡ 4. 轉生系統實作 (Rebirth NPC & System)
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
        let difficulty = 1;
        if (lv >= 90) difficulty = 1024;
        else if (lv >= 87) difficulty = 512;
        else if (lv >= 86) difficulty = 256;
        else if (lv >= 84) difficulty = 128;
        else if (lv >= 82) difficulty = 64;
        else if (lv >= 80) difficulty = 32;
        else if (lv >= 79) difficulty = 16;
        else if (lv >= 75) difficulty = 8;
        else if (lv >= 70) difficulty = 4;
        else if (lv >= 50) difficulty = 2;
        return Math.floor(Math.sqrt(difficulty)) + 1;
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


    /* ============================================================================
     *  ⚡ 5. 廢品記憶清單管理系統
     * ============================================================================ */

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
        if (typeof window.sellAllJunk === 'function') {
            window.sellAllJunk();
            window.renderJunkListContent();
        }
    };


    /* ============================================================================
     *  ⚡ 6. 核心功能 Hook (NPC 互動、蠟燭重置、統計頁按鈕與啟動器)
     * ============================================================================ */

    function startupGM2() {
        if (window.__klhGM2Started) return;
        window.__klhGM2Started = true;
        injectGlowStyles();
        registerRebirthNPC();

        // ⚡ 7. 核心功能 Hook (NPC 互動與蠟燭重置保護)
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
        // ⚡ 8. 統計分頁廢品清單按鈕與全域載入監聽
        // ==========================================
        if (typeof window.renderAuditTab === 'function' && !window.renderAuditTab.__klhJunkAuditWrapped) {
            const originalRenderAuditTab = window.renderAuditTab;
            window.renderAuditTab = function () {
                originalRenderAuditTab();
                try {
                    const el = document.getElementById('tab-audit');
                    if (el && !el.classList.contains('hidden')) {
                        const btnToggle = el.querySelector('button[onclick^="toggleAuditView"]');
                        if (btnToggle && !el.querySelector('#btn-open-junk-modal-audit')) {
                            const junkBtn = document.createElement('button');
                            junkBtn.id = 'btn-open-junk-modal-audit';
                            junkBtn.onclick = function () {
                                if (typeof window.openJunkListModal === 'function') {
                                    window.openJunkListModal();
                                }
                            };
                            
                            const parent = btnToggle.parentNode;
                            if (parent.classList.contains('justify-between')) {
                                const wrapper = document.createElement('div');
                                wrapper.className = 'flex items-center gap-2';
                                parent.replaceChild(wrapper, btnToggle);
                                
                                junkBtn.className = 'btn px-3 py-1 text-xs bg-amber-900 border-amber-600 text-amber-200 font-bold';
                                junkBtn.innerText = '廢品清單';
                                wrapper.appendChild(junkBtn);
                                wrapper.appendChild(btnToggle);
                            } else {
                                junkBtn.className = 'btn px-3 py-1 text-xs bg-amber-900 border-amber-600 text-amber-200 font-bold';
                                junkBtn.innerText = '廢品清單';
                                parent.insertBefore(junkBtn, btnToggle);
                            }
                        }
                    }
                } catch (e) {
                    console.error("[klh_GM2] renderAuditTab hook error:", e);
                }
            };
            window.renderAuditTab.__klhJunkAuditWrapped = true;
        }
    }

    // 註冊 DOM 載入與即時啟動
    function safeStartupGM2() {
        try {
            startupGM2();
        } catch (e) {
            console.error("[klh_GM2] startup error:", e);
        }
        try {
            initPCFix();
        } catch (e) {
            console.error("[klh_PC_fix] initPCFix error:", e);
        }
    }

    document.addEventListener('DOMContentLoaded', safeStartupGM2);
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
        safeStartupGM2();
    }

    window.addEventListener('load', function () {
        try {
            hookDecorate();
            hookEquipWin();
            applyLayoutMode(localStorage.getItem('klh_ui_mode') || 'list');
        } catch (e) {
            console.error("[klh_PC_fix] window load error:", e);
        }
    });

})();
