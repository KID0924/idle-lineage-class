/* ============================================================================
 * klh_PC_fix.js — 電腦版寬螢幕延展模式切換外掛
 *
 * 設計原則: 完全不改原作者程式碼，僅透過 CSS 覆寫與浮動按鈕實現寬螢幕切換。
 * 掛接方式: 在 index.html 的 </body> 標籤正上方，插入以下外掛腳本：
 *   <script src="klh_PC_fix.js?v=20260623"></script>
 *
 * 功能一覽:
 *   1. 寬螢幕延展模式  —— 解除 #game-screen 的 max-w-[1600px] 限制，
 *                         讓三欄（左側狀態/中間地圖日誌/右側裝備清單）自動延展
 *                         至整個瀏覽器視窗寬度，善用 1920/2560/3840 等大螢幕空間。
 *   2. 浮動切換按鈕    —— 在遊戲畫面右下角注入一個小型圓形切換按鈕（📐），
 *                         位於 GM 商店按鈕下方（bottom: 20px），雙開時不互相遮擋。
 *   3. 使用者偏好記憶  —— 將延展模式開關狀態存入 localStorage，重新整理後自動套用。
 *   4. 手機用戶保護    —— 透過 UA + pointer + 螢幕寬度三重偵測，手機/平板環境下
 *                         完全不注入按鈕與樣式，零影響原有觸控體驗。
 *   5. 面板高度自由調整 —— 桌機用戶可拖曳每個 .panel 底部的調整把手，自訂面板高度。
 *                         偏好高度自動存入 localStorage，重整後自動還原。
 *                         雙擊把手可重設該面板回預設高度。
 *
 * 延展模式修改清單:
 *   - #game-screen: 移除 max-width 限制
 *   - #col-left:    寬度微增至 360px（給狀態面板更多呼吸空間）
 *   - #col-center:  維持 flex-1（自動填滿剩餘空間）
 *   - #col-right:   寬度微增至 420px（裝備/能力面板更舒適）
 *   - body padding:  增加左右邊距（大螢幕視覺居中更舒服）
 *
 * 效能影響：趨近於零
 *   - 純 CSS class 切換，無 setInterval / 定時輪詢
 *   - 手機環境完全跳過初始化
 * ========================================================================== */
(function () {
    'use strict';

    // ── 0. 手機/平板偵測：非桌機環境直接跳過，零影響 ──
    function isDesktop() {
        // 指標精確度（滑鼠 = fine，觸控 = coarse）
        var hasFinePointer = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
        // 螢幕寬度大於 1200px（排除大平板的 1024px 邊界）
        var wideScreen = (window.innerWidth || screen.width || 0) >= 1200;
        // UA 不含行動裝置關鍵字
        var uaDesktop = !/Android|iPhone|iPod|iPad|Mobile|Silk|Kindle|BlackBerry|Windows Phone/i.test(navigator.userAgent || '');
        // 需同時滿足：精確指標 + 寬螢幕 + 非行動 UA
        return hasFinePointer && wideScreen && uaDesktop;
    }

    if (!isDesktop()) {
        console.log('[klh_PC_fix] 偵測到行動裝置，已跳過寬螢幕延展外掛。');
        return;
    }

    // ── 1. localStorage 鍵名 ──
    var STORAGE_KEY = 'klh_pc_widescreen_mode';
    var RESIZE_STORAGE_KEY = 'klh_pc_panel_heights';

    // ── 2. 注入延展模式 CSS + 拖曳把手 CSS ──
    var styleEl = document.createElement('style');
    styleEl.id = 'klh-pc-fix-style';
    styleEl.textContent = [
        // ── 延展模式核心：掛在 body.klh-widescreen 下，避免影響非啟用狀態 ──
        'body.klh-widescreen #game-screen {',
        '    max-width: none !important;',
        '    padding: 0 12px !important;',
        '}',
        // 左欄微增寬度
        'body.klh-widescreen #col-left {',
        '    width: 360px !important;',
        '    min-width: 360px !important;',
        '}',
        // 右欄微增寬度
        'body.klh-widescreen #col-right {',
        '    width: 420px !important;',
        '    min-width: 420px !important;',
        '}',
        // body 增加左右邊距讓大螢幕看起來更舒服
        'body.klh-widescreen {',
        '    padding-left: 18px !important;',
        '    padding-right: 18px !important;',
        '}',

        // ── 被設定了自訂高度的面板：覆蓋 flex 讓高度生效 ──
        '.klh-resized {',
        '    flex: none !important;',
        '    overflow: hidden !important;',
        '}',

        // 確保所有 panel 都有相對定位，以利於絕對定位把手定位
        '.panel {',
        '    position: relative !important;',
        '}',

        // ── 拖曳把手樣式 ──
        '.klh-resize-handle {',
        '    height: 10px !important;',
        '    cursor: ns-resize !important;',
        '    position: absolute !important;',
        '    bottom: 0 !important;',
        '    left: 0 !important;',
        '    right: 0 !important;',
        '    z-index: 50 !important;',
        '    user-select: none !important;',
        '    border-bottom-left-radius: 0.75rem !important;',
        '    border-bottom-right-radius: 0.75rem !important;',
        '    background: rgba(15, 23, 42, 0.9) !important;',
        '    border-top: 1px solid #334155 !important;',
        '    transition: background 0.2s ease !important;',
        '}',
        // 中央橫桿指示（視覺提示可拖曳）
        '.klh-resize-handle::after {',
        '    content: "" !important;',
        '    position: absolute !important;',
        '    left: 50% !important;',
        '    top: 50% !important;',
        '    transform: translate(-50%, -50%) !important;',
        '    width: 48px !important;',
        '    height: 3px !important;',
        '    border-radius: 2px !important;',
        '    background: #64748b !important;',
        '    transition: background 0.2s ease, width 0.2s ease !important;',
        '}',
        '.klh-resize-handle:hover {',
        '    background: rgba(34, 211, 238, 0.12) !important;',
        '}',
        '.klh-resize-handle:hover::after {',
        '    background: #22d3ee !important;',
        '    width: 64px !important;',
        '}',
        // 拖曳中的把手高亮
        '.klh-resize-handle.dragging {',
        '    background: rgba(34, 211, 238, 0.18) !important;',
        '}',
        '.klh-resize-handle.dragging::after {',
        '    background: #06b6d4 !important;',
        '    width: 64px !important;',
        '}',

        // ── 切換按鈕樣式 ──
        '#klh-pc-widescreen-btn {',
        '    position: fixed !important;',
        '    bottom: 20px !important;',
        '    right: 20px !important;',
        '    z-index: 999 !important;',
        '    width: 44px !important;',
        '    height: 44px !important;',
        '    border-radius: 50% !important;',
        '    border: 2px solid #475569 !important;',
        '    background: rgba(30, 41, 59, 0.85) !important;',
        '    backdrop-filter: blur(8px) !important;',
        '    color: #94a3b8 !important;',
        '    font-size: 18px !important;',
        '    cursor: pointer !important;',
        '    display: flex !important;',
        '    align-items: center !important;',
        '    justify-content: center !important;',
        '    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;',
        '    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4) !important;',
        '    user-select: none !important;',
        '    line-height: 1 !important;',
        '    padding: 0 !important;',
        '}',
        '#klh-pc-widescreen-btn:hover {',
        '    transform: scale(1.12) !important;',
        '    border-color: #38bdf8 !important;',
        '    color: #38bdf8 !important;',
        '    box-shadow: 0 0 16px rgba(56, 189, 248, 0.4) !important;',
        '}',
        // 啟用狀態的按鈕高亮
        '#klh-pc-widescreen-btn.active {',
        '    border-color: #22d3ee !important;',
        '    color: #22d3ee !important;',
        '    background: rgba(8, 51, 68, 0.9) !important;',
        '    box-shadow: 0 0 12px rgba(34, 211, 238, 0.35) !important;',
        '}',
        '#klh-pc-widescreen-btn.active:hover {',
        '    box-shadow: 0 0 20px rgba(34, 211, 238, 0.5) !important;',
        '}',
        // Tooltip
        '#klh-pc-widescreen-btn .klh-btn-tooltip {',
        '    position: absolute !important;',
        '    bottom: calc(100% + 8px) !important;',
        '    right: 0 !important;',
        '    background: rgba(15, 23, 42, 0.95) !important;',
        '    border: 1px solid #334155 !important;',
        '    border-radius: 8px !important;',
        '    padding: 6px 10px !important;',
        '    font-size: 12px !important;',
        '    color: #e2e8f0 !important;',
        '    white-space: nowrap !important;',
        '    pointer-events: none !important;',
        '    opacity: 0 !important;',
        '    transform: translateY(4px) !important;',
        '    transition: opacity 0.2s ease, transform 0.2s ease !important;',
        '}',
        '#klh-pc-widescreen-btn:hover .klh-btn-tooltip {',
        '    opacity: 1 !important;',
        '    transform: translateY(0) !important;',
        '}',

        ''
    ].join('\n');
    document.head.appendChild(styleEl);

    // ── 3. 建立切換按鈕 ──
    function createToggleButton() {
        if (document.getElementById('klh-pc-widescreen-btn')) return;

        var btn = document.createElement('button');
        btn.id = 'klh-pc-widescreen-btn';
        btn.setAttribute('title', '切換寬螢幕延展模式');
        btn.innerHTML = '<span style="font-size: 17px;">📐</span>' +
                         '<span class="klh-btn-tooltip">寬螢幕延展模式</span>';

        btn.addEventListener('click', function () {
            toggleWidescreen();
        });

        document.body.appendChild(btn);
    }

    // ── 4. 切換延展模式 ──
    function toggleWidescreen() {
        var isActive = document.body.classList.toggle('klh-widescreen');
        var btn = document.getElementById('klh-pc-widescreen-btn');

        if (isActive) {
            if (btn) btn.classList.add('active');
            localStorage.setItem(STORAGE_KEY, '1');
            if (typeof window.showToast === 'function') {
                window.showToast('已啟用寬螢幕延展模式', 'success');
            }
        } else {
            if (btn) btn.classList.remove('active');
            localStorage.setItem(STORAGE_KEY, '0');
            if (typeof window.showToast === 'function') {
                window.showToast('已切換回標準版面', 'info');
            }
        }

        console.log('[klh_PC_fix] 寬螢幕延展模式: ' + (isActive ? 'ON' : 'OFF'));
    }

    // ══════════════════════════════════════════════════════════════════════
    //  5. 面板高度自由拖曳調整系統
    // ══════════════════════════════════════════════════════════════════════

    // ── 5a. localStorage 存取自訂高度 ──
    function loadPanelHeights() {
        try {
            var raw = localStorage.getItem(RESIZE_STORAGE_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch (e) { return {}; }
    }
    function savePanelHeight(panelKey, height) {
        var data = loadPanelHeights();
        if (height === null) {
            delete data[panelKey];
        } else {
            data[panelKey] = height;
        }
        localStorage.setItem(RESIZE_STORAGE_KEY, JSON.stringify(data));
    }

    // ── 5b. 為面板生成穩定的識別鍵 ──
    function getPanelKey(panel) {
        // 優先用 id
        if (panel.id) return panel.id;
        // 退而求其次：用父層 id + 該 panel 在同級中的索引
        var parent = panel.parentElement;
        var parentId = parent ? (parent.id || 'unknown') : 'root';
        var idx = 0;
        if (parent) {
            var siblings = parent.querySelectorAll(':scope > .panel');
            for (var i = 0; i < siblings.length; i++) {
                if (siblings[i] === panel) { idx = i; break; }
            }
        }
        return parentId + '_panel_' + idx;
    }

    // ── 5c. 注入拖曳把手 + 事件綁定 ──
    function setupResizablePanel(panel) {
        // 跳過 tab-bar（只有按鈕的那一排）
        if (panel.classList.contains('tab-bar')) return;
        // 跳過右欄能力/裝備/技能等內容面板
        if (panel.id === 'tab-content-panel') return;

        var key = getPanelKey(panel);

        // 建立把手元素
        var handle = document.createElement('div');
        handle.className = 'klh-resize-handle';
        handle.title = '上下拖曳調整高度 / 雙擊重設';
        panel.appendChild(handle);

        // --- 拖曳邏輯 ---
        var startY = 0;
        var startH = 0;
        var dragging = false;

        function onMouseDown(e) {
            e.preventDefault();
            e.stopPropagation();
            dragging = true;
            startY = e.clientY;
            startH = panel.offsetHeight;
            handle.classList.add('dragging');
            // 拖曳中禁止選取文字與 pointer-events 穿透
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'ns-resize';
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        }

        function onMouseMove(e) {
            if (!dragging) return;
            var diff = e.clientY - startY;
            var newH = Math.max(80, startH + diff);  // 最小 80px
            panel.style.height = newH + 'px';
            if (!panel.classList.contains('klh-resized')) {
                panel.classList.add('klh-resized');
            }
        }

        function onMouseUp(e) {
            if (!dragging) return;
            dragging = false;
            handle.classList.remove('dragging');
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            // 儲存偏好
            savePanelHeight(key, panel.offsetHeight);
        }

        handle.addEventListener('mousedown', onMouseDown);

        // --- 雙擊重設 ---
        handle.addEventListener('dblclick', function (e) {
            e.preventDefault();
            e.stopPropagation();
            panel.style.height = '';
            panel.classList.remove('klh-resized');
            savePanelHeight(key, null);
            if (typeof window.showToast === 'function') {
                window.showToast('已重設面板高度', 'info');
            }
        });

        // --- 還原上次的自訂高度 ---
        var townView = document.getElementById('town-view');
        var isMapPanel = townView && (panel === townView.parentElement);
        var saved = loadPanelHeights();
        if (saved[key]) {
            if (isMapPanel) {
                // 地圖面板交由 syncMapPanelHeight() 根據目前是村莊還是打怪來決定是否還原
            } else {
                panel.style.height = saved[key] + 'px';
                panel.classList.add('klh-resized');
            }
        }
    }

    // ── 5d. 掃描三欄中的所有 .panel 並注入把手 ──
    function initResizablePanels() {
        var columns = ['#col-left', '#col-center', '#col-right'];
        columns.forEach(function (colSel) {
            var col = document.querySelector(colSel);
            if (!col) return;
            var panels = col.querySelectorAll(':scope > .panel');
            panels.forEach(function (p) {
                setupResizablePanel(p);
            });
        });
        console.log('[klh_PC_fix] 面板高度拖曳調整已啟用（拖曳底部把手 / 雙擊重設）');
    }

    // ── 5e. 同步地圖面板高度（只在村莊時套用自訂高度，打怪時自動折疊） ──
    function syncMapPanelHeight() {
        var townView = document.getElementById('town-view');
        if (!townView) return;
        var mapPanel = townView.parentElement;
        if (!mapPanel) return;

        var key = getPanelKey(mapPanel);
        var saved = loadPanelHeights();
        var savedH = saved[key];

        var isTown = !townView.classList.contains('hidden');
        var handle = mapPanel.querySelector('.klh-resize-handle');

        if (isTown) {
            // 在村莊狀態：套用自訂高度（如果有的話）
            if (savedH) {
                mapPanel.style.height = savedH + 'px';
                mapPanel.classList.add('klh-resized');
            }
            // 顯示拖曳把手
            if (handle) handle.style.display = '';
        } else {
            // 在打怪狀態：清除自訂高度，讓其自動折疊
            mapPanel.style.height = '';
            mapPanel.classList.remove('klh-resized');
            // 隱藏拖曳把手
            if (handle) handle.style.display = 'none';
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    //  6. 初始化
    // ══════════════════════════════════════════════════════════════════════

    function init() {
        createToggleButton();

        // 讀取上次的偏好
        var saved = localStorage.getItem(STORAGE_KEY);
        if (saved === '1') {
            document.body.classList.add('klh-widescreen');
            var btn = document.getElementById('klh-pc-widescreen-btn');
            if (btn) btn.classList.add('active');
            console.log('[klh_PC_fix] 自動套用上次的寬螢幕延展模式偏好。');
        }

        // 啟用面板高度拖曳
        initResizablePanels();

        // ── 7. 地圖面板專屬：監聽村莊/戰鬥狀態切換 ──
        var townView = document.getElementById('town-view');
        if (townView) {
            // 初始化同步一次
            syncMapPanelHeight();
            // 監聽 class 變化
            var observer = new MutationObserver(function () {
                syncMapPanelHeight();
            });
            observer.observe(townView, { attributes: true, attributeFilter: ['class'] });
        }

        console.log('[klh_PC_fix] 電腦版寬螢幕延展外掛已啟用（按鈕位於右下角 📐）');
    }

    // ── 啟動 ──
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
