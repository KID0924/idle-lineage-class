/* ============================================================================
 * klh_mobile_allies_hud.js — 手機版戰鬥傭兵狀態懸浮窗 v1.0.6
 *
 * 設計原則:
 *   1. 完全不改原作者程式碼 —— 僅透過從外部監聽與 DOM 注入進行修復，不改動遊戲原生程式碼。
 *   2. 優雅降級與安全降載 —— 所有功能區塊、監聽器與事件皆以 try-catch 沙盒包裹並配備相容性檢查，
 *                         若瀏覽器 API、全域變數 (如 player、DB) 缺失或 DOM 元素被修改，
 *                         外掛會默默安全降級或停用局部功能，絕對不拋出致命 JS 錯誤，保障核心遊戲不中斷。
 *
 * 掛接方式: 在 index.html 的 </body> 標籤正上方，插入以下外掛腳本：
 *   <script src="klh_mobile_allies_hud.js?v=20260701c"></script>
 *
 * 功能一覽:
 *   1. 自動顯示隱藏     —— 僅在手機模式 (body.m-mobile) 且擁有傭兵時自動顯示（非戰鬥畫面亦可檢視）。
 *   2. 雙重視覺模式     —— 支援折疊（Bubble 氣泡模式）與展開（Panel 卡片模式）自由切換，適應行動端螢幕空間。
 *   3. 觸控/滑鼠拖曳     —— 可在畫面上任意拖曳定位，拖曳坐標與折疊狀態自動同步儲存至 LocalStorage。
 *   4. 傭兵狀態監控     —— 即時更新至多 3 隻（最多取前三個）上場協力傭兵的 HP / MP 條數值，免切分頁。
 *   5. 直式卡片排版     —— 採用簡潔直式卡片，保留血條數值文字，等級旁整合顯示經驗百分比，清爽不擠佔空間。
 *   6. 倒地快速復活     —— 傭兵倒地時動態彈出「返生術」與「復活卷軸」快速按鈕，便利點擊.
 *   7. 點擊餵藥水功能   —— 點擊傭兵卡片或點選專屬的 🍶 小按鈕，可直接給該傭兵手動餵用隊長設定的預設藥水。
 *   8. 髒資料自動修復   —— 自動偵測並還原被舊版外掛污染的傭兵名稱，防範存檔損壞。
 *   9. 局部更新效能優化 —— 引入特權簽章比對，數值變動僅修改 DOM 節點屬性，不重建 HTML，極致節能省電防發熱。
 * ========================================================================== */
(function () {
    'use strict';

    // ── 注入樣式 ──
    function injectStyles() {
        try {
            if (document.getElementById('klh-allies-hud-style')) return;

            const style = document.createElement('style');
            style.id = 'klh-allies-hud-style';
            style.textContent = `
                /* 懸浮窗主容器 */
                .klh-hud-container {
                    position: fixed;
                    z-index: 9999;
                    user-select: none;
                    font-family: system-ui, -apple-system, sans-serif;
                    touch-action: none;
                    opacity: 0;
                    transform: scale(0.9);
                    pointer-events: none;
                    transition: opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1), transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                }
                
                .klh-hud-container.hud-visible {
                    opacity: 1;
                    transform: scale(1);
                    pointer-events: auto;
                }

                /* --- 1. 折疊氣泡模式 (Bubble) --- */
                .hud-collapsed-view {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 44px;
                    height: 44px;
                    background: rgba(15, 23, 42, 0.75);
                    backdrop-filter: blur(8px);
                    -webkit-backdrop-filter: blur(8px);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 50%;
                    box-shadow: 0 10px 20px -3px rgba(0, 0, 0, 0.5), 0 4px 8px -2px rgba(0, 0, 0, 0.3);
                    cursor: move;
                    position: relative;
                    transition: transform 0.2s, background-color 0.2s;
                }
                .hud-collapsed-view:active {
                    transform: scale(0.92);
                    background: rgba(15, 23, 42, 0.9);
                }
                .hud-bubble-icon {
                    font-size: 20px;
                    line-height: 1;
                }
                .hud-badge {
                    position: absolute;
                    top: -3px;
                    right: -3px;
                    color: white;
                    font-size: 9px;
                    font-weight: bold;
                    border-radius: 999px;
                    padding: 1.5px 5px;
                    min-width: 10px;
                    text-align: center;
                    box-shadow: 0 0 6px rgba(0,0,0,0.4);
                }
                .hud-badge-ok {
                    background: #10b981;
                    box-shadow: 0 0 5px rgba(16, 185, 129, 0.6);
                }
                .hud-badge-down {
                    background: #f43f5e;
                    box-shadow: 0 0 8px rgba(244, 63, 94, 0.8);
                    animation: hud-pulse-glow 1.5s infinite;
                }
                @keyframes hud-pulse-glow {
                    0%, 100% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.15); opacity: 0.9; }
                }

                /* --- 2. 展開面板模式 (Panel) --- */
                .hud-expanded-view {
                    width: 175px; /* 直式面板寬度 */
                    background: rgba(15, 23, 42, 0.78);
                    backdrop-filter: blur(10px);
                    -webkit-backdrop-filter: blur(10px);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    border-radius: 12px;
                    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.65), 0 8px 10px -6px rgba(0, 0, 0, 0.4);
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                }
                .hud-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 6px 10px;
                    background: rgba(30, 41, 59, 0.55);
                    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                    cursor: move;
                }
                .hud-title {
                    font-size: 11px;
                    font-weight: bold;
                    color: #e2e8f0;
                    letter-spacing: 0.5px;
                }
                .hud-close-btn {
                    background: none;
                    border: none;
                    color: #94a3b8;
                    font-size: 11px;
                    cursor: pointer;
                    padding: 1px 4px;
                    border-radius: 4px;
                    transition: color 0.15s, background-color 0.15s;
                }
                .hud-close-btn:hover {
                    background: rgba(255, 255, 255, 0.1);
                    color: #f1f5f9;
                }
                .hud-list {
                    padding: 6px 8px 8px 8px;
                    display: flex;
                    flex-direction: column; /* 直向排列 */
                    gap: 6px;
                    box-sizing: border-box;
                }

                /* 傭兵單項卡片 */
                .hud-item {
                    display: flex;
                    flex-direction: column;
                    gap: 3.5px;
                    padding: 5px 6px;
                    background: rgba(255, 255, 255, 0.03);
                    border: 1px solid rgba(255, 255, 255, 0.05);
                    border-radius: 6px;
                    box-sizing: border-box;
                    cursor: pointer; /* 可點擊 */
                    transition: background 0.15s, border-color 0.15s;
                }
                .hud-item:active {
                    background: rgba(255, 255, 255, 0.06);
                }
                .hud-item-downed {
                    background: rgba(244, 63, 94, 0.05);
                    border-color: rgba(244, 63, 94, 0.18);
                    cursor: default;
                }
                .hud-item-downed:active {
                    background: rgba(244, 63, 94, 0.05);
                }
                .hud-meta {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    line-height: 1.2;
                }
                .hud-name {
                    font-size: 11.5px;
                    font-weight: bold;
                    color: #a5b4fc; /* Indigo 300 */
                    max-width: 90px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .hud-item-downed .hud-name {
                    color: #64748b; /* Slate 500 */
                }
                .hud-meta-right {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }
                .hud-lv {
                    font-size: 9.5px;
                    color: #fbbf24; /* Amber 400 */
                    font-weight: 600;
                    white-space: nowrap;
                }
                .hud-pot-btn {
                    background: rgba(30, 41, 59, 0.65);
                    border: 0.5px solid rgba(255, 255, 255, 0.15);
                    border-radius: 4px;
                    padding: 1px 3px;
                    cursor: pointer;
                    line-height: 1;
                    font-size: 10px;
                    transition: background 0.15s, transform 0.15s;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    box-sizing: border-box;
                    height: 16px;
                }
                .hud-pot-btn:active {
                    background: rgba(59, 130, 246, 0.5);
                    transform: scale(0.9);
                }

                /* 屬性條樣式 (保留文字覆蓋，以顯示具體數值) */
                .hud-bar-row {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    height: 9px;
                }
                .hud-bar-label {
                    font-size: 8px;
                    width: 13px;
                    color: #94a3b8;
                    text-align: right;
                    font-weight: bold;
                }
                .hud-bar-bg {
                    flex: 1;
                    height: 8px;
                    background: rgba(0, 0, 0, 0.45);
                    border-radius: 4px;
                    overflow: hidden;
                    position: relative;
                    border: 0.5px solid rgba(255, 255, 255, 0.05);
                }
                .hud-bar-fill {
                    height: 100%;
                    border-radius: 4px;
                    transition: width 0.15s ease-out;
                }
                .hud-bar-fill-hp {
                    background: linear-gradient(90deg, #b91c1c, #dc2626, #ef4444);
                }
                .hud-bar-fill-mp {
                    background: linear-gradient(90deg, #1d4ed8, #2563eb, #3b82f6);
                }
                .hud-bar-text {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 7px;
                    color: rgba(255, 255, 255, 0.9);
                    font-weight: bold;
                    line-height: 7px;
                    transform: scale(0.95);
                    pointer-events: none;
                }

                /* 倒地復活狀態區 */
                .hud-down-status {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-top: 1px;
                }
                .hud-down-text {
                    font-size: 10px;
                    font-weight: bold;
                    color: #f43f5e;
                }
                .hud-rez-btn-container {
                    display: flex;
                    gap: 3px;
                }
                .hud-rez-btn {
                    font-size: 9px;
                    font-weight: bold;
                    padding: 2px 5px;
                    border-radius: 4px;
                    border: 0.5px solid transparent;
                    text-align: center;
                    cursor: pointer;
                    transition: filter 0.15s, opacity 0.15s;
                    white-space: nowrap;
                }
                .hud-rez-btn:active {
                    filter: brightness(1.2);
                }
                .hud-rez-btn-rez {
                    background: #1e3a8a;
                    border-color: #3b82f6;
                    color: #bfdbfe;
                }
                .hud-rez-btn-scroll {
                    background: #7f1d1d;
                    border-color: #b91c1c;
                    color: #fecaca;
                }
                .hud-rez-btn.disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                    background: #1e293b;
                    border-color: #475569;
                    color: #64748b;
                    pointer-events: none;
                }

                /* 方案 A 的 CSS 增強 */
                /* 1. 卡片冷卻遮罩效果 */
                .hud-item.hud-item-cooldown {
                    position: relative;
                }
                .hud-item.hud-item-cooldown::after {
                    content: '';
                    position: absolute;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0, 0, 0, 0.35); /* 半透明暗色遮罩 */
                    border-radius: 6px;
                    z-index: 5;
                    pointer-events: none; /* 僅作視覺遮罩，讓滑鼠事件仍由卡片接收（維持拖曳功能） */
                }

                /* 2. 餵藥按鈕冷卻樣式 */
                .hud-pot-btn.hud-pot-cd {
                    background: rgba(244, 63, 94, 0.2) !important;
                    border-color: rgba(244, 63, 94, 0.4) !important;
                    color: #f43f5e !important;
                    font-size: 8px !important;
                    font-weight: bold !important;
                    min-width: 24px;
                }

                /* 圓形血條 SVG 樣式 */
                .hud-circular-hp {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 44px;
                    height: 44px;
                    pointer-events: none;
                }
                .hud-circular-bg {
                    fill: none;
                    stroke: rgba(255, 255, 255, 0.12);
                    stroke-width: 1.5;
                    transition: stroke 0.2s, opacity 0.2s;
                }
                .hud-ring-bg-downed {
                    stroke: rgba(244, 63, 94, 0.4);
                    animation: hud-ring-pulse 1.5s infinite;
                }
                .hud-circular-fill {
                    fill: none;
                    stroke: #10b981;
                    stroke-width: 1.5;
                    stroke-linecap: round;
                    transition: stroke-dasharray 0.2s ease-out, stroke 0.2s;
                }
                @keyframes hud-ring-pulse {
                    0%, 100% { stroke: rgba(244, 63, 94, 0.4); }
                    50% { stroke: rgba(244, 63, 94, 0.8); }
                }
            `;
            document.head.appendChild(style);
        } catch (e) {
            console.warn('[klh_allies_hud] Style injection failed:', e);
        }
    }

    // ── 全域狀態與定位變數 ──
    let hudContainer = null;
    let isDragging = false;
    let startX = 0, startY = 0;
    
    // 拖曳距離判定點擊
    let dragStartX = 0;
    let dragStartY = 0;
    let dragDistance = 0;
    let dragTarget = null;
    
    // 預設坐標
    let posX = 0;
    let posY = 75; 
    let isCollapsed = false;
    let currentAlliesCount = 0; // 追蹤當前前場傭兵數量

    // 從 LocalStorage 載入設定
    function loadSettings() {
        try {
            // 動態取得預設位置（狀態列下方，靠右側）
            posX = window.innerWidth - 190;

            const savedX = localStorage.getItem('klh_mobile_hud_x');
            const savedY = localStorage.getItem('klh_mobile_hud_y');
            const savedCol = localStorage.getItem('klh_mobile_hud_collapsed');

            if (savedX !== null && savedX !== "NaN") posX = parseFloat(savedX);
            if (savedY !== null && savedY !== "NaN") posY = parseFloat(savedY);
            if (savedCol !== null) isCollapsed = savedCol === '1';

            // 防止極端或損壞的 LocalStorage 值 (NaN 或負值)
            if (isNaN(posX) || posX < 0) posX = window.innerWidth - 190;
            if (isNaN(posY) || posY < 0) posY = 75;
        } catch (e) {
            console.warn('[klh_allies_hud] Failed to load settings:', e);
        }
    }

    // 儲存定位與折疊狀態
    function saveSettings() {
        try {
            localStorage.setItem('klh_mobile_hud_x', posX);
            localStorage.setItem('klh_mobile_hud_y', posY);
            localStorage.setItem('klh_mobile_hud_collapsed', isCollapsed ? '1' : '0');
        } catch (e) {
            console.warn('[klh_allies_hud] Failed to save settings:', e);
        }
    }

    // ── 邊界檢查 ──
    function clampPosition() {
        try {
            if (!hudContainer) return;
            const rect = hudContainer.getBoundingClientRect();
            
            // 當容器尚未算寬高時，使用預設的 CSS 尺寸進行邊界預估，避免一開始被擠到極右邊 0px 寬度的外側
            const w = rect.width || (isCollapsed ? 44 : 175);
            const h = rect.height || (isCollapsed ? 44 : (currentAlliesCount * 65 + 35));

            const maxX = window.innerWidth - w;
            const maxY = window.innerHeight - h;

            if (isNaN(posX) || isNaN(posY)) {
                posX = window.innerWidth - w - 15;
                posY = 75;
            }

            posX = Math.max(0, Math.min(posX, maxX));
            posY = Math.max(0, Math.min(posY, maxY));

            hudContainer.style.left = posX + 'px';
            hudContainer.style.top = posY + 'px';
        } catch (e) {
            console.warn('[klh_allies_hud] clampPosition failed:', e);
        }
    }

    // ── 拖曳事件處理 ──
    function onDragStart(e) {
        try {
            if (e.target.closest('.hud-no-drag')) return;
            
            isDragging = true;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;

            startX = clientX - posX;
            startY = clientY - posY;
            
            dragStartX = clientX;
            dragStartY = clientY;
            dragDistance = 0;
            dragTarget = e.target;

            document.addEventListener('mousemove', onDragMove, { passive: false });
            document.addEventListener('mouseup', onDragEnd);
            document.addEventListener('touchmove', onDragMove, { passive: false });
            document.addEventListener('touchend', onDragEnd);
        } catch (err) {
            console.warn('[klh_allies_hud] onDragStart failed:', err);
        }
    }

    function onDragMove(e) {
        try {
            if (!isDragging) return;
            if (e.cancelable) e.preventDefault(); // 阻止手機瀏覽器下拉重新整理等預設滾動

            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;

            posX = clientX - startX;
            posY = clientY - startY;
            
            dragDistance = Math.hypot(clientX - dragStartX, clientY - dragStartY);

            clampPosition();
        } catch (err) {
            console.warn('[klh_allies_hud] onDragMove failed:', err);
        }
    }

    function onDragEnd() {
        try {
            if (!isDragging) return;
            isDragging = false;

            document.removeEventListener('mousemove', onDragMove);
            document.removeEventListener('mouseup', onDragEnd);
            document.removeEventListener('touchmove', onDragMove);
            document.removeEventListener('touchend', onDragEnd);

            saveSettings();

            // 如果移動距離很小（即不是在拖曳懸浮窗位置），判定為手動點擊卡片喝水
            if (dragDistance < 5 && dragTarget) {
                if (!dragTarget.closest('.hud-no-drag')) {
                    const item = dragTarget.closest('[data-slot]');
                    if (item) {
                        const slot = item.getAttribute('data-slot');
                        if (slot) {
                            window.tryFeedPotion(slot);
                        }
                    }
                }
            }
        } catch (err) {
            console.warn('[klh_allies_hud] onDragEnd failed:', err);
        }
    }

    // ── 建立 HUD DOM ──
    function createHud() {
        try {
            if (document.getElementById('klh-mobile-allies-hud')) return;

            hudContainer = document.createElement('div');
            hudContainer.id = 'klh-mobile-allies-hud';
            hudContainer.className = 'klh-hud-container';
            
            // 綁定拖曳與點擊監聽 (包含 touch 與 mouse)
            hudContainer.addEventListener('mousedown', onDragStart);
            hudContainer.addEventListener('touchstart', onDragStart, { passive: true });

            document.body.appendChild(hudContainer);
            
            // 初始化尺寸定位
            clampPosition();
        } catch (e) {
            console.warn('[klh_allies_hud] createHud failed:', e);
        }
    }

    // ── 切換折疊與展開 ──
    function toggleCollapse(e) {
        try {
            if (e) {
                e.stopPropagation();
                e.preventDefault();
            }
            isCollapsed = !isCollapsed;
            saveSettings();
            updateHudUI();
            
            // 切換模式後元件寬度改變，需重新校正避免溢出螢幕邊界
            setTimeout(clampPosition, 50);
        } catch (err) {
            console.warn('[klh_allies_hud] toggleCollapse failed:', err);
        }
    }

    // ── 建立架構與更新值優化（防抖、防卡頓、防止拖曳中斷） ──
    let _hudSig = '';

    function buildStructure(allies, downedCount) {
        try {
            if (isCollapsed) {
                const badgeClass = downedCount > 0 ? 'hud-badge-down' : 'hud-badge-ok';
                
                // 繪製三個同心圓的 SVG 容器，由外到內半徑分別為 20, 18, 16
                const radii = [20, 18, 16];
                let svgHtml = `<svg class="hud-circular-hp" width="44" height="44" viewBox="0 0 44 44">`;
                for (let i = 0; i < 3; i++) {
                    const r = radii[i];
                    const circumference = 2 * Math.PI * r;
                    svgHtml += `
                        <circle id="hud-ring-bg-${i}" class="hud-circular-bg" cx="22" cy="22" r="${r}" />
                        <circle id="hud-ring-fill-${i}" class="hud-circular-fill" cx="22" cy="22" r="${r}" 
                            transform="rotate(-90 22 22)" stroke-dasharray="0 ${circumference}" style="display: none;" />
                    `;
                }
                svgHtml += `</svg>`;

                hudContainer.innerHTML = `
                    <div class="hud-collapsed-view" id="klh-hud-bubble">
                        ${svgHtml}
                        <span class="hud-bubble-icon">👥</span>
                        <span id="klh-hud-badge" class="hud-badge ${badgeClass}">${allies.length}</span>
                    </div>
                `;
                document.getElementById('klh-hud-bubble').addEventListener('click', toggleCollapse);
            } else {
                let listHtml = '';
                
                allies.forEach(a => {
                    const s = a._slot;
                    const name = a._allyName || '傭兵';
                    const lv = a.lv || 1;
                    
                    if (a._downed) {
                        listHtml += `
                            <div class="hud-item hud-item-downed" data-slot="${s}">
                                <div class="hud-meta">
                                    <span class="hud-name">${name}</span>
                                    <span id="hud-lv-txt-${s}" class="hud-lv">Lv.${lv}</span>
                                </div>
                                <div class="hud-down-status">
                                    <span class="hud-down-text">💀 倒地</span>
                                    <div class="hud-rez-btn-container">
                                        <button id="hud-btn-rez-${s}" class="hud-rez-btn hud-rez-btn-rez hud-no-drag" onclick="window.reviveMercenary('${s}','rez');">返生術</button>
                                        <button id="hud-btn-scroll-${s}" class="hud-rez-btn hud-rez-btn-scroll hud-no-drag" onclick="window.reviveMercenary('${s}','scroll');">卷軸</button>
                                    </div>
                                </div>
                            </div>
                        `;
                    } else {
                        listHtml += `
                            <div class="hud-item" data-slot="${s}">
                                <div class="hud-meta">
                                    <span class="hud-name">${name}</span>
                                    <div class="hud-meta-right">
                                        <span id="hud-lv-txt-${s}" class="hud-lv">Lv.${lv}</span>
                                        <button id="hud-pot-btn-${s}" class="hud-pot-btn hud-no-drag" onclick="window.tryFeedPotion('${s}')" title="手動使用隊長設定的藥水">🍶</button>
                                    </div>
                                </div>
                                <!-- HP 條 (保留文字覆蓋) -->
                                <div class="hud-bar-row">
                                    <span class="hud-bar-label">HP</span>
                                    <div class="hud-bar-bg">
                                        <div id="hud-hp-fill-${s}" class="hud-bar-fill hud-bar-fill-hp" style="width: 100%"></div>
                                        <div id="hud-hp-txt-${s}" class="hud-bar-text">0/0</div>
                                    </div>
                                </div>
                                <!-- MP 條 (保留文字覆蓋) -->
                                <div class="hud-bar-row">
                                    <span class="hud-bar-label">MP</span>
                                    <div class="hud-bar-bg">
                                        <div id="hud-mp-fill-${s}" class="hud-bar-fill hud-bar-fill-mp" style="width: 100%"></div>
                                        <div id="hud-mp-txt-${s}" class="hud-bar-text">0/0</div>
                                    </div>
                                </div>
                            </div>
                        `;
                    }
                });

                hudContainer.innerHTML = `
                    <div class="hud-expanded-view">
                        <div class="hud-header">
                            <span class="hud-title">👥 傭兵狀態</span>
                            <button class="hud-close-btn hud-no-drag" id="klh-hud-collapse-btn">➖ 折疊</button>
                        </div>
                        <div class="hud-list">
                            ${listHtml}
                        </div>
                    </div>
                `;
                
                document.getElementById('klh-hud-collapse-btn').addEventListener('click', toggleCollapse);
            }
        } catch (err) {
            console.warn('[klh_allies_hud] buildStructure failed:', err);
        }
    }

    function updateValues(allies) {
        try {
            if (isCollapsed) {
                const badge = document.getElementById('klh-hud-badge');
                if (badge) {
                    const downedCount = allies.filter(a => a._downed).length;
                    badge.textContent = allies.length;
                    if (downedCount > 0) {
                        badge.className = 'hud-badge hud-badge-down';
                    } else {
                        badge.className = 'hud-badge hud-badge-ok';
                    }
                }

                // 更新圓形血條 (三個同心圓，由外到內)
                const radii = [20, 18, 16];

                for (let i = 0; i < 3; i++) {
                    const bgRing = document.getElementById(`hud-ring-bg-${i}`);
                    const fillRing = document.getElementById(`hud-ring-fill-${i}`);
                    if (!bgRing || !fillRing) continue;

                    const radius = radii[i];
                    const circumference = 2 * Math.PI * radius;
                    const ally = allies[i];

                    if (ally) {
                        bgRing.style.opacity = '1';
                        if (ally._downed) {
                            fillRing.style.display = 'none';
                            fillRing.setAttribute('stroke-dasharray', `0 ${circumference}`);
                            bgRing.classList.add('hud-ring-bg-downed');
                        } else {
                            const curHp = ally.curHp || 0;
                            const maxHp = ally.mhp || 1;
                            const hpPct = Math.max(0, Math.min(100, (curHp / maxHp) * 100));
                            const fillLength = (hpPct / 100) * circumference;

                            if (fillLength <= 0) {
                                fillRing.style.display = 'none';
                            } else {
                                fillRing.style.display = '';
                                fillRing.setAttribute('stroke-dasharray', `${fillLength} ${circumference}`);
                            }
                            bgRing.classList.remove('hud-ring-bg-downed');

                            // 根據血量百分比顯示不同顏色 (紅/橘/綠)
                            if (hpPct < 30) {
                                fillRing.style.stroke = '#ef4444'; // 紅色
                            } else if (hpPct < 70) {
                                fillRing.style.stroke = '#f59e0b'; // 橘黃色
                            } else {
                                fillRing.style.stroke = '#10b981'; // 綠色
                            }
                        }
                    } else {
                        // 空傭兵槽，將背景圈淡化，隱藏前場進度
                        bgRing.style.opacity = '0.25';
                        bgRing.classList.remove('hud-ring-bg-downed');
                        fillRing.style.display = 'none';
                        fillRing.setAttribute('stroke-dasharray', `0 ${circumference}`);
                    }
                }
            } else {
                allies.forEach(a => {
                    const s = a._slot;
                    
                    // 1. 取得等級與經驗值，並計算經驗百分比（取整數）
                    const req = (typeof getExpReq === 'function') ? getExpReq(a.lv || 1) : 0;
                    const expPctRaw = (req > 0 && isFinite(req)) ? ((a.exp || 0) / req) * 100 : 0;
                    const expPct = Math.min(100, Math.max(0, Math.round(expPctRaw)));
                    
                    // 2. 更新等級欄文字 (例如：Lv.50 (47%))
                    const lvTxt = document.getElementById('hud-lv-txt-' + s);
                    if (lvTxt) {
                        lvTxt.textContent = `Lv.${a.lv || 1} (${expPct}%)`;
                    }

                    if (a._downed) {
                        // 更新返生術按鈕狀態
                        const rb = document.getElementById('hud-btn-rez-' + s);
                        const sb = document.getElementById('hud-btn-scroll-' + s);
                        
                        if (rb) {
                            const learnedRez = !!(player && player.skills && player.skills.includes('sk_resurrection'));
                            if (learnedRez) {
                                rb.style.display = '';
                                const rk = (typeof DB !== 'undefined' && DB.skills) ? DB.skills.sk_resurrection : null;
                                let cost = rk && player.d && typeof player.d.getMpCost === 'function' 
                                    ? player.d.getMpCost(rk.mp, rk.tier) 
                                    : (rk ? rk.mp : Infinity);
                                if (typeof cost === 'number' && isFinite(cost)) {
                                    cost = Math.round(cost);
                                }
                                const canRez = !player.dead && (player.mp || 0) >= cost;
                                
                                rb.classList.toggle('disabled', !canRez);
                                rb.title = player.dead ? '玩家已死亡' : ((player.mp || 0) >= cost ? `消耗 ${cost} MP 立即復活` : `MP 不足 (需 ${cost})`);
                            } else {
                                rb.style.display = 'none';
                            }
                        }
                        
                        if (sb) {
                            const sc = player.inv && player.inv.find(i => i.id === 'scroll_revive');
                            const scrollCnt = sc ? (sc.cnt || 0) : 0;
                            const cd = a._reviveCd || 0;
                            const canScroll = scrollCnt > 0 && cd <= 0;
                            
                            sb.classList.toggle('disabled', !canScroll);
                            sb.textContent = cd > 0 ? `${Math.ceil(cd / 10)}秒` : '卷軸';
                            sb.title = scrollCnt <= 0 ? '沒有復活卷軸' : (cd > 0 ? `冷卻中，還需 ${Math.ceil(cd / 10)} 秒` : `消耗 1 張復活卷軸復活`);
                        }
                    } else {
                        // 更新 HP/MP 的條與文字（數值皆四捨五入取整數，保留文字覆蓋）
                        const curHp = Math.round(a.curHp || 0);
                        const maxHp = Math.round(a.mhp || 1);
                        const hpPct = Math.max(0, Math.min(100, (curHp / maxHp) * 100));

                        const curMp = Math.round(a.mp || 0);
                        const maxMp = Math.round(a.mmp || 1);
                        const mpPct = Math.max(0, Math.min(100, (curMp / maxMp) * 100));
                        
                        const hpFill = document.getElementById('hud-hp-fill-' + s);
                        const hpTxt = document.getElementById('hud-hp-txt-' + s);
                        const mpFill = document.getElementById('hud-mp-fill-' + s);
                        const mpTxt = document.getElementById('hud-mp-txt-' + s);
                        
                        if (hpFill) hpFill.style.width = hpPct + '%';
                        if (hpTxt) hpTxt.textContent = `${curHp}/${maxHp}`;
                        if (mpFill) mpFill.style.width = mpPct + '%';
                        if (mpTxt) mpTxt.textContent = `${curMp}/${maxMp}`;

                        // 更新藥水冷卻狀態 (方案 C)
                        const cd = a._potCd || 0;
                        const itemEl = document.querySelector(`.hud-item[data-slot="${s}"]`);
                        const potBtn = document.getElementById('hud-pot-btn-' + s);
                        
                        if (cd > 0) {
                            if (itemEl) itemEl.classList.add('hud-item-cooldown');
                            if (potBtn) {
                                potBtn.classList.add('hud-pot-cd');
                                potBtn.textContent = (cd / 10).toFixed(1) + 's';
                            }
                        } else {
                            if (itemEl) itemEl.classList.remove('hud-item-cooldown');
                            if (potBtn) {
                                potBtn.classList.remove('hud-pot-cd');
                                potBtn.textContent = '🍶';
                            }
                        }
                    }
                });
            }
        } catch (err) {
            console.warn('[klh_allies_hud] updateValues failed:', err);
        }
    }

    // ── 手動餵食隊長預設藥水邏輯 ──
    window.tryFeedPotion = function (slot) {
        try {
            // 防抖：防止拖曳懸浮窗時觸發喝水
            if (dragDistance >= 5) return;

            const allies = (typeof player !== 'undefined' && player && player.allies) ? player.allies : [];
            const ally = allies.find(a => a && String(a._slot) === String(slot));
            if (!ally) return;
            if (ally._downed) return; // 倒地不喝水

            // 1. 檢查血量是否已滿
            if ((ally.curHp || 0) >= (ally.mhp || 1)) {
                return; // 滿血時靜默返回，不彈窗不輸出日誌，防止連點遮擋
            }

            // 2. 檢查藥水冷卻
            if ((ally._potCd || 0) > 0) {
                return; // 冷卻中靜默返回，不彈窗不輸出日誌，防止連點遮擋
            }

            // 3. 取得隊長設定的藥水 ID (預設為大紅 potion_heal，或是自動化面板設定的藥水)
            const potSel = document.getElementById('set-pot');
            const potId = potSel ? potSel.value : 'potion_heal';
            
            const pdef = (typeof DB !== 'undefined' && DB.items) ? DB.items[potId] : null;
            if (!pdef || pdef.val == null) {
                if (typeof logSys === 'function') {
                    logSys('<span class="text-red-400">隊長未設定有效的治癒藥水！</span>');
                }
                return;
            }

            // 4. 檢查隊長背包中的藥水數量
            const stack = player.inv && player.inv.find(i => i.id === potId && (i.cnt || 0) > 0);
            if (!stack) {
                if (typeof logSys === 'function') {
                    logSys(`<span class="text-red-400">隊長身上沒有 ${pdef.n}！</span>`);
                }
                return;
            }

            // 5. 扣除隊長背包 1 瓶並補血
            stack.cnt--;
            player.inv = player.inv.filter(i => (i.cnt || 0) > 0);
            
            const _conPct = (typeof getConPotionPct === 'function') ? getConPotionPct((ally.d && ally.d.con) || 0) : 0;
            const h = Math.max(1, Math.floor(pdef.val * (1 + _conPct / 100)));
            
            ally.curHp = Math.min(ally.mhp || 1, (ally.curHp || 0) + h);
            ally._potCd = 10; // 10 ticks = ~1秒冷卻，比照自動吃藥冷卻



            // 6. 輸出戰鬥對話與介面更新
            if (typeof logCombat === 'function') {
                logCombat(`<span class="text-emerald-300 font-bold">協力·${ally._allyName}</span> 手動飲用 ${pdef.n}，恢復 ${h} 點 HP。`, 'heal', 'mercenary');
            }
            if (typeof renderSquadPanel === 'function') {
                renderSquadPanel(); // 即時重繪隊伍面板
            }
        } catch (e) {
            console.warn('[klh_allies_hud] tryFeedPotion failed:', e);
        }
    };

    // ── 主渲染邏輯 ──
    function updateHudUI() {
        try {
            if (!hudContainer) return;

            // 條件過濾：必須在手機模式（body 包含 m-mobile，或視窗寬度 <= 768px 代表窄螢幕），且至少有一隻已招募傭兵 (最多取前三個) (移除非戰鬥畫面的限制，允許任何畫面皆能檢視)
            const isMobile = document.body.classList.contains('m-mobile') || window.innerWidth <= 768;
            const allies = (typeof player !== 'undefined' && player && player.allies) 
                ? player.allies.filter(Boolean).slice(0, 3) 
                : [];

            // ── 安全防禦：自動修復因舊版外掛導致 _allyName 被 HTML/數值污染的問題 ──
            allies.forEach(a => {
                if (a && a._allyName) {
                    if (a._allyName.includes('<') || a._allyName.includes('/') || /[\d]{3,}\/[\d]{3,}/.test(a._allyName)) {
                        try {
                            if (typeof allyName === 'function') {
                                a._allyName = allyName(a);
                            } else {
                                a._allyName = a._allyName.replace(/<[^>]*>/g, '')
                                                         .replace(/[\d/]+/g, '')
                                                         .replace(/Lv\..*$/g, '')
                                                         .trim() || '傭兵';
                            }
                        } catch (err) {
                            console.warn('[klh_allies_hud] Name cleanup failed:', err);
                        }
                    }
                }
            });

            if (!isMobile || allies.length === 0) {
                hudContainer.classList.remove('hud-visible');
                _hudSig = ''; // 隱藏時重置特徵碼，下次打開強制重建
                currentAlliesCount = 0;
                return;
            }

            hudContainer.classList.add('hud-visible');
            currentAlliesCount = allies.length;

            const downedCount = allies.filter(a => a._downed).length;
            
            // 特徵碼：包含傭兵名單、是否倒地、等級，以及目前折疊狀態。只有這些有變時才重建 DOM
            const sig = allies.map(a => a._slot + ':' + (a._allyName || '') + ':' + (a._downed ? 'D' : 'A') + ':' + (a.lv || 1)).join('|') + '|' + (isCollapsed ? 'C' : 'E');
            
            if (sig !== _hudSig) {
                _hudSig = sig;
                buildStructure(allies, downedCount);
                clampPosition();
            }

            // 數值直接對應更新，不觸發 HTML 重建，大幅降低重繪卡頓
            updateValues(allies);
        } catch (err) {
            console.warn('[klh_allies_hud] updateHudUI failed:', err);
        }
    }

    // ── 初始化啟動 ──
    function start() {
        try {
            injectStyles();
            loadSettings();
            createHud();
            
            // 每 250ms 更新一次 UI 狀態，比照主介面的 mirror 更新週期
            setInterval(updateHudUI, 250);
            
            // 視窗尺寸改變時校正邊界
            window.addEventListener('resize', clampPosition);
            window.addEventListener('orientationchange', clampPosition);

            console.log('[klh_mobile_allies_hud] 手機版傭兵懸浮 HUD 已載入');
        } catch (e) {
            console.error('[klh_mobile_allies_hud] Initialization failed:', e);
        }
    }

    // 監聽頁面載入
    try {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', start);
        } else {
            start();
        }
    } catch (e) {
        console.error('[klh_mobile_allies_hud] Startup hook listener failed:', e);
    }
})();
