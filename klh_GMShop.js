/* ============================================================================
 * klh_GMShop.js — GM 商店系統
 *
 * 設計原則: 完全不改原作者程式碼，自定義浮動按鈕與玻璃摩砂 (Glassmorphism) 大視窗。
 * 掛接方式: 在 index.html 的 </body> 標籤正上方，插入以下外掛腳本：
 * * <script src="klh_GMShop.js?v=20260622"></script>
 *
 * 功能一覽:
 *   1. 浮動按鈕注入   —— 注入一個位於畫面右下角（自適應）的 GM 裝備商店開啟按鈕。
 *   2. 玻璃摩砂大視窗 —— 提供一個現代、極致奢華的半透明裝備展示與購買介面。
 *   3. 全物品抓取與分類 —— 自動從 DB.items 抓取全部武器、防具、飾品、卷軸、魔法書、材料與雜項物品（包含進化果實）。
 *   4. 搜尋與分頁過濾 —— 支援即時關鍵字搜尋、類別標籤與子部位/子類型下拉選單切換過濾。
 *   5. GM 專屬購買設定 ——
 *        - 自訂強化等級 (+0 ~ +15 或更大數值)。
 *        - 自訂祝福狀態（無 / 祝福 / 詛咒 / 隨機）。
 *        - 自訂遠古詞綴（無 / 遠古 / 永恆 / 不朽 / 太初 / 隨機）。
 *        - 自訂屬性詞綴（無 / 隨機 / 爆炎 / 地靈 ... 等 12 種屬性）。
 *        - 自訂席琳套裝（無 / 隨機 / 麗人的加護 / 暗影的忠誠 ... 等 45 種套裝效果）。
 *   6. 實時名稱與光圈預覽 —— 修改任何購買選項時，商店內所有裝備的名稱、顏色與光暈特效會實時同步更新預覽。
 *   7. 雙價格模式     —— 支援「金幣購買（原價）」與「GM 免費獲得（0 金幣）」。
 *   8. 快捷屬性修改   —— 提供 GM 快捷輸入設定角色金幣（上限 9999 億）與等級（1 ~ 999 級）功能。
 *   9. 超強短劍覆寫   —— 開啟時自動將基礎武器「短劍」屬性覆寫為 GM 測試超強數值。
 * ========================================================================== */

(function () {
    const equipments = [];
    window.gmShopMainCategory = 'all';
    window.gmShopSubCategory = 'all';
    window.gmShopSearchQuery = '';
    window.gmShopCurrentPage = 1;
    let lastBtnState = null;

    // 1. 注入樣式
    function injectStyles() {
        const css = `
            .gm-shop-btn {
                position: fixed !important;
                bottom: 85px !important;
                right: 20px !important;
                z-index: 1000 !important;
                background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%) !important;
                border: 2px solid #a78bfa !important;
                color: #fff !important;
                font-weight: bold !important;
                padding: 10px 18px !important;
                border-radius: 9999px !important;
                box-shadow: 0 0 15px rgba(124, 58, 237, 0.6) !important;
                cursor: pointer !important;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
                display: none !important;
                align-items: center !important;
                gap: 6px !important;
                font-family: inherit !important;
                font-size: 14px !important;
                user-select: none !important;
            }
            .gm-shop-btn:hover {
                transform: translateY(-3px) scale(1.05) !important;
                box-shadow: 0 0 25px rgba(124, 58, 237, 0.9) !important;
            }
            .gm-shop-modal {
                position: fixed !important;
                inset: 0 !important;
                z-index: 99999 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                background: rgba(15, 23, 42, 0.7) !important;
                backdrop-filter: blur(12px) !important;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.3s ease !important;
            }
            .gm-shop-modal.open {
                opacity: 1 !important;
                pointer-events: auto !important;
            }
            .gm-shop-container {
                width: 95vw !important;
                max-width: 1200px !important;
                height: 85vh !important;
                background: linear-gradient(135deg, #090d16 0%, #0f172a 100%) !important;
                border: 2px solid #7c3aed !important;
                border-radius: 24px !important;
                box-shadow: 0 0 60px rgba(124, 58, 237, 0.5) !important;
                display: flex !important;
                flex-direction: column !important;
                overflow: hidden !important;
                color: #f1f5f9 !important;
            }
            .gm-shop-header {
                background: rgba(15, 23, 42, 0.6) !important;
                border-b: 1px solid rgba(124, 58, 237, 0.3) !important;
                padding: 18px 24px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                flex-shrink: 0 !important;
            }
            .gm-shop-title {
                font-size: 24px !important;
                font-weight: 800 !important;
                background: linear-gradient(to right, #a78bfa, #818cf8) !important;
                -webkit-background-clip: text !important;
                -webkit-text-fill-color: transparent !important;
                display: flex !important;
                align-items: center !important;
                gap: 8px !important;
            }
            .gm-shop-close-btn {
                background: rgba(255, 255, 255, 0.1) !important;
                border: none !important;
                color: #94a3b8 !important;
                width: 36px !important;
                height: 36px !important;
                border-radius: 50% !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                cursor: pointer !important;
                font-size: 18px !important;
                transition: all 0.2s ease !important;
            }
            .gm-shop-close-btn:hover {
                background: rgba(239, 68, 68, 0.2) !important;
                color: #ef4444 !important;
                transform: rotate(90deg) !important;
            }
            .gm-shop-body {
                display: flex !important;
                flex-direction: row !important;
                flex: 1 !important;
                overflow: hidden !important;
                min-height: 0 !important;
            }
            .gm-shop-sidebar {
                width: 340px !important;
                background: rgba(15, 23, 42, 0.4) !important;
                border-right: 1px solid rgba(124, 58, 237, 0.2) !important;
                padding: 20px !important;
                overflow-y: auto !important;
                display: flex !important;
                flex-direction: column !important;
                gap: 16px !important;
                flex-shrink: 0 !important;
            }
            .gm-shop-content {
                flex: 1 !important;
                display: flex !important;
                flex-direction: column !important;
                padding: 20px !important;
                background: rgba(15, 23, 42, 0.2) !important;
                overflow: hidden !important;
            }
            .gm-shop-filter-bar {
                display: flex !important;
                gap: 12px !important;
                margin-bottom: 16px !important;
                align-items: center !important;
                flex-wrap: wrap !important;
                flex-shrink: 0 !important;
            }
            .gm-shop-search-input {
                flex: 1 !important;
                min-width: 150px !important;
                background: rgba(15, 23, 42, 0.6) !important;
                border: 1px solid rgba(124, 58, 237, 0.3) !important;
                color: #fff !important;
                border-radius: 12px !important;
                padding: 10px 16px !important;
                outline: none !important;
                font-size: 16px !important;
                transition: all 0.2s ease !important;
            }
            .gm-shop-search-input:focus {
                border-color: #a78bfa !important;
                box-shadow: 0 0 10px rgba(124, 58, 237, 0.3) !important;
            }
            .gm-shop-tabs {
                display: flex !important;
                background: rgba(15, 23, 42, 0.5) !important;
                padding: 4px !important;
                border-radius: 12px !important;
                border: 1px solid rgba(148, 163, 184, 0.1) !important;
            }
            .gm-shop-tab-btn {
                background: transparent !important;
                border: none !important;
                color: #94a3b8 !important;
                padding: 8px 16px !important;
                font-weight: 600 !important;
                font-size: 13px !important;
                border-radius: 8px !important;
                cursor: pointer !important;
                transition: all 0.2s ease !important;
            }
            .gm-shop-tab-btn.active {
                background: #7c3aed !important;
                color: #fff !important;
            }
            .gm-shop-grid {
                flex: 1 !important;
                display: grid !important;
                grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)) !important;
                grid-auto-rows: min-content !important;
                gap: 16px !important;
                overflow-y: auto !important;
                padding-right: 6px !important;
                align-content: start !important;
            }
            .gm-shop-card {
                background: rgba(30, 41, 59, 0.3) !important;
                border: 1px solid rgba(124, 58, 237, 0.15) !important;
                border-radius: 16px !important;
                padding: 14px !important;
                display: flex !important;
                flex-direction: column !important;
                justify-content: flex-start !important;
                min-height: 170px !important;
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
                position: relative !important;
                box-sizing: border-box !important;
            }
            .gm-shop-card:hover {
                background: rgba(30, 41, 59, 0.5) !important;
                border-color: rgba(124, 58, 237, 0.5) !important;
                transform: translateY(-2px) !important;
                box-shadow: 0 8px 24px rgba(124, 58, 237, 0.2) !important;
            }
            .gm-shop-card-header {
                display: flex !important;
                gap: 12px !important;
                align-items: center !important;
                flex-shrink: 0 !important;
            }
            .gm-shop-icon-container {
                width: 60px !important;
                height: 60px !important;
                background: rgba(15, 23, 42, 0.8) !important;
                border: 1px solid rgba(124, 58, 237, 0.3) !important;
                border-radius: 12px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                flex-shrink: 0 !important;
            }
            .gm-shop-card-details {
                flex: 1 !important;
                min-width: 0 !important;
                display: flex !important;
                flex-direction: column !important;
                justify-content: center !important;
            }
            .gm-shop-card-name {
                font-size: 15px !important;
                font-weight: 700 !important;
                white-space: nowrap !important;
                overflow: hidden !important;
                text-overflow: ellipsis !important;
            }
            .gm-shop-card-meta-action {
                display: flex !important;
                justify-content: space-between !important;
                align-items: center !important;
                margin-top: 6px !important;
            }
            .gm-shop-card-desc {
                font-size: 11px !important;
                color: #94a3b8 !important;
                line-height: 1.4 !important;
                margin-top: 8px !important;
                overflow: visible !important;
                padding-right: 4px !important;
                border-top: 1px solid rgba(255, 255, 255, 0.05) !important;
                padding-top: 6px !important;
                text-align: left !important;
                height: auto !important;
            }
            .gm-shop-card-price {
                font-size: 14px !important;
                font-weight: 700 !important;
                color: #fbbf24 !important;
            }
            .gm-shop-buy-btn {
                background: #7c3aed !important;
                border: none !important;
                color: #fff !important;
                font-weight: 700 !important;
                font-size: 12px !important;
                padding: 6px 14px !important;
                border-radius: 8px !important;
                cursor: pointer !important;
                transition: all 0.2s ease !important;
            }
            .gm-shop-buy-btn:hover {
                background: #6d28d9 !important;
                box-shadow: 0 0 10px rgba(124, 58, 237, 0.4) !important;
            }
            .gm-shop-control-group {
                display: flex !important;
                flex-direction: column !important;
                gap: 6px !important;
            }
            .gm-shop-control-label {
                font-size: 12px !important;
                font-weight: 600 !important;
                color: #94a3b8 !important;
            }
            .gm-shop-select {
                background: rgba(15, 23, 42, 0.6) !important;
                border: 1px solid rgba(124, 58, 237, 0.3) !important;
                color: #fff !important;
                border-radius: 8px !important;
                padding: 8px 12px !important;
                outline: none !important;
                font-size: 16px !important;
                width: 100% !important;
                cursor: pointer !important;
            }
            .gm-shop-select:focus {
                border-color: #a78bfa !important;
            }
            .gm-shop-checkbox-container {
                display: flex !important;
                align-items: center !important;
                gap: 8px !important;
                cursor: pointer !important;
                user-select: none !important;
                font-size: 13px !important;
            }
            .gm-shop-checkbox {
                width: 16px !important;
                height: 16px !important;
                accent-color: #7c3aed !important;
            }

            .gm-shop-container ::-webkit-scrollbar {
                width: 6px !important;
                height: 6px !important;
            }
            .gm-shop-container ::-webkit-scrollbar-track {
                background: transparent !important;
            }
            .gm-shop-container ::-webkit-scrollbar-thumb {
                background: rgba(124, 58, 237, 0.4) !important;
                border-radius: 3px !important;
            }
            .gm-shop-container ::-webkit-scrollbar-thumb:hover {
                background: rgba(124, 58, 237, 0.6) !important;
            }

            .gm-shop-pagination-bar {
                display: flex !important;
                justify-content: center !important;
                align-items: center !important;
                gap: 12px !important;
                padding-top: 12px !important;
                border-top: 1px solid rgba(124, 58, 237, 0.2) !important;
                flex-shrink: 0 !important;
                margin-top: auto !important;
            }
            .gm-shop-page-btn {
                background: rgba(124, 58, 237, 0.2) !important;
                border: 1px solid rgba(124, 58, 237, 0.4) !important;
                color: #a78bfa !important;
                padding: 6px 12px !important;
                border-radius: 8px !important;
                cursor: pointer !important;
                font-weight: bold !important;
                font-size: 13px !important;
                transition: all 0.2s ease !important;
                user-select: none !important;
            }
            .gm-shop-page-btn:hover:not(:disabled) {
                background: rgba(124, 58, 237, 0.4) !important;
                color: #fff !important;
            }
            .gm-shop-page-btn:disabled {
                opacity: 0.4 !important;
                cursor: not-allowed !important;
            }
            .gm-shop-page-info {
                font-size: 13px !important;
                color: #94a3b8 !important;
                font-weight: 600 !important;
            }

            /* 分頁內容與角色修改樣式 */
            .gm-shop-tab-content {
                display: none !important;
                width: 100% !important;
                height: 100% !important;
                overflow: hidden !important;
            }
            .gm-shop-tab-content.active {
                display: flex !important;
            }
            .gm-shop-char-container {
                display: flex !important;
                flex-direction: column !important;
                gap: 20px !important;
                padding: 24px !important;
                height: 100% !important;
                overflow-y: auto !important;
                width: 100% !important;
                box-sizing: border-box !important;
            }
            .gm-shop-char-grid {
                display: grid !important;
                grid-template-columns: 1fr 1.2fr !important;
                gap: 24px !important;
                width: 100% !important;
            }
            .gm-shop-char-section {
                background: rgba(30, 41, 59, 0.3) !important;
                border: 1px solid rgba(124, 58, 237, 0.2) !important;
                border-radius: 16px !important;
                padding: 20px !important;
                display: flex !important;
                flex-direction: column !important;
                gap: 16px !important;
            }
            .gm-shop-char-section-title {
                font-size: 18px !important;
                font-weight: 700 !important;
                color: #a78bfa !important;
                border-bottom: 1px solid rgba(124, 58, 237, 0.3) !important;
                padding-bottom: 8px !important;
                margin-bottom: 4px !important;
                text-align: left !important;
            }
            .gm-shop-char-input-group {
                display: flex !important;
                flex-direction: column !important;
                gap: 6px !important;
                text-align: left !important;
            }
            .gm-shop-char-input-row {
                display: flex !important;
                align-items: center !important;
                gap: 8px !important;
            }
            .gm-shop-char-input {
                background: rgba(15, 23, 42, 0.6) !important;
                border: 1px solid rgba(124, 58, 237, 0.3) !important;
                color: #fff !important;
                border-radius: 10px !important;
                padding: 8px 12px !important;
                outline: none !important;
                font-size: 15px !important;
                flex: 1 !important;
                transition: all 0.2s ease !important;
                box-sizing: border-box !important;
            }
            .gm-shop-char-input:focus {
                border-color: #a78bfa !important;
                box-shadow: 0 0 8px rgba(124, 58, 237, 0.3) !important;
            }
            .gm-shop-char-btn-adj {
                background: rgba(124, 58, 237, 0.2) !important;
                border: 1px solid rgba(124, 58, 237, 0.4) !important;
                color: #a78bfa !important;
                padding: 6px 10px !important;
                border-radius: 8px !important;
                font-weight: bold !important;
                cursor: pointer !important;
                transition: all 0.2s ease !important;
                font-size: 12px !important;
                user-select: none !important;
            }
            .gm-shop-char-btn-adj:hover {
                background: rgba(124, 58, 237, 0.4) !important;
                color: #fff !important;
            }
            .gm-shop-char-save-btn {
                background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%) !important;
                border: 2px solid #a78bfa !important;
                color: #fff !important;
                font-weight: bold !important;
                font-size: 16px !important;
                padding: 12px 24px !important;
                border-radius: 12px !important;
                cursor: pointer !important;
                transition: all 0.3s ease !important;
                box-shadow: 0 0 15px rgba(124, 58, 237, 0.4) !important;
                align-self: center !important;
                margin-top: 12px !important;
                width: 100% !important;
                max-width: 300px !important;
                text-align: center !important;
            }
            .gm-shop-char-save-btn:hover {
                transform: translateY(-2px) !important;
                box-shadow: 0 0 25px rgba(124, 58, 237, 0.7) !important;
            }

            /* 手機適應調整 */
            @media (max-width: 768px) {
                .gm-shop-modal {
                    padding-top: max(8px, env(safe-area-inset-top)) !important;
                    padding-bottom: max(8px, env(safe-area-inset-bottom)) !important;
                    box-sizing: border-box !important;
                }
                .gm-shop-container {
                    height: calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 16px) !important;
                    height: calc(100vh - 16px) !important;
                    max-height: 98% !important;
                    width: 96vw !important;
                    margin: auto !important;
                    border-radius: 16px !important;
                }
                .gm-shop-header {
                    padding: 8px 12px !important;
                    gap: 6px !important;
                    flex-wrap: wrap !important;
                    justify-content: space-between !important;
                }
                .gm-shop-title {
                    font-size: 18px !important;
                }
                .gm-shop-tabs {
                    order: 3 !important;
                    width: 100% !important;
                    justify-content: center !important;
                }
                .gm-shop-tab-btn {
                    padding: 6px 12px !important;
                    font-size: 12px !important;
                }
                .gm-shop-char-grid {
                    grid-template-columns: 1fr !important;
                    gap: 16px !important;
                }
                .gm-shop-char-container {
                    padding: 12px !important;
                    padding-bottom: 36px !important;
                }
                .gm-shop-body {
                    flex-direction: column !important;
                }
                #gm-shop-tab-content-shop {
                    flex-direction: column !important;
                }
                .gm-shop-content {
                    padding: 8px !important;
                }
                .gm-shop-grid {
                    padding-bottom: 24px !important;
                }
                .gm-shop-sidebar {
                    width: 100% !important;
                    height: 120px !important;
                    border-right: none !important;
                    border-bottom: 1px solid rgba(124, 58, 237, 0.2) !important;
                    padding: 6px !important;
                    display: grid !important;
                    grid-template-columns: 1fr 1fr 1fr !important;
                    gap: 6px 8px !important;
                    overflow: hidden !important;
                }
                .gm-ctrl-divider, #gm-ctrl-assets {
                    display: none !important;
                }
                #gm-ctrl-bless { order: 1 !important; }
                #gm-ctrl-anc { order: 2 !important; }
                #gm-ctrl-attr { order: 3 !important; }
                #gm-ctrl-free { order: 4 !important; }
                #gm-ctrl-enhance { order: 5 !important; }
                #gm-ctrl-seteff { order: 6 !important; }

                .gm-shop-sidebar .gm-shop-control-group {
                    gap: 2px !important;
                }
                .gm-shop-sidebar .gm-shop-control-label {
                    font-size: 11px !important;
                    white-space: nowrap !important;
                }
                .gm-shop-sidebar .gm-shop-select {
                    font-size: 16px !important;
                    padding: 4px 6px !important;
                }
                .gm-shop-sidebar .gm-shop-checkbox-container {
                    font-size: 11px !important;
                    gap: 4px !important;
                    margin-top: 2px !important;
                }
                .gm-shop-sidebar .gm-shop-checkbox {
                    width: 14px !important;
                    height: 14px !important;
                }
                .gm-shop-btn {
                    bottom: 15px !important;
                    right: 15px !important;
                    padding: 8px 12px !important;
                    font-size: 12px !important;
                }
                .gm-shop-char-input-row {
                    gap: 3px !important;
                    justify-content: flex-end !important;
                }
                .gm-shop-char-btn-adj {
                    padding: 4px 6px !important;
                    font-size: 11px !important;
                    border-radius: 6px !important;
                    min-width: 32px !important;
                    height: 28px !important;
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                }
                .gm-shop-char-input {
                    padding: 4px 6px !important;
                    font-size: 13px !important;
                    max-width: 48px !important;
                    height: 28px !important;
                    text-align: center !important;
                }
                #gm-char-gold-input {
                    max-width: 100% !important;
                    text-align: left !important;
                }
                #gm-char-lvl-input, #gm-char-bonus-input {
                    max-width: 65px !important;
                }
                .gm-shop-char-section .text-xs.w-10 {
                    width: 30px !important;
                    flex-shrink: 0 !important;
                }
            }

            /* 🎴 GM 模式收藏冊輔助列樣式 */
            .gm-book-control-bar button {
                padding: 4px 10px !important;
                border-radius: 6px !important;
                cursor: pointer !important;
                line-height: 1.2 !important;
                height: auto !important;
                display: inline-block !important;
            }
        `;
        let style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
    }

    // 2. 獲取當前所選屬性值
    function getGMShopSelectedOptions() {
        let freeCheckbox = document.getElementById('gm-free-checkbox');
        let isFree = freeCheckbox ? freeCheckbox.checked : true;

        let legendCheckbox = document.getElementById('gm-legend-checkbox');
        let isLegendOnly = legendCheckbox ? legendCheckbox.checked : false;

        let enhanceVal = 0;
        let enhanceSel = document.getElementById('gm-enhance-select');
        if (enhanceSel) {
            if (enhanceSel.value === 'custom') {
                let customInput = document.getElementById('gm-enhance-custom-input');
                enhanceVal = parseInt(customInput ? customInput.value : 0) || 0;
            } else {
                enhanceVal = parseInt(enhanceSel.value) || 0;
            }
        }

        let blessVal = false;
        let blessSel = document.getElementById('gm-bless-select');
        if (blessSel) {
            if (blessSel.value === 'blessed') blessVal = true;
            else if (blessSel.value === 'cursed') blessVal = 'cursed';
            else if (blessSel.value === 'random') blessVal = 'random';
        }

        let ancVal = false;
        let ancSel = document.getElementById('gm-anc-select');
        if (ancSel) {
            if (ancSel.value === 'ancient') ancVal = true;
            else if (ancSel.value !== 'none') ancVal = ancSel.value; // 'eternal', 'immortal', 'primordial', 'random'
        }

        let attrVal = false;
        let attrSel = document.getElementById('gm-attr-select');
        if (attrSel && attrSel.value !== 'none') {
            attrVal = attrSel.value;
        }

        let seteffVal = false;
        let seteffSel = document.getElementById('gm-seteff-select');
        if (seteffSel && seteffSel.value !== 'none') {
            seteffVal = seteffSel.value;
        }

        return { isFree, isLegendOnly, enhanceVal, blessVal, ancVal, attrVal, seteffVal };
    }

    // 3. 渲染裝備網格
    window.renderGMShopGrid = function () {
        let container = document.getElementById('gm-shop-grid-container');
        if (!container) return;

        let opts = getGMShopSelectedOptions();
        let mainCat = window.gmShopMainCategory || 'all';
        let subCat = window.gmShopSubCategory || 'all';
        let search = (window.gmShopSearchQuery || '').toLowerCase().trim();

        // 過濾裝備與非裝備
        let filtered = equipments.filter(item => {
            // 0. 僅傳說裝備篩選
            if (opts.isLegendOnly && !item.legend) return false;

            // 1. 主分類過濾
            if (mainCat !== 'all' && item.type !== mainCat) return false;

            // 2. 子部位/武器類型過濾
            if (subCat !== 'all') {
                if (mainCat === 'wpn') {
                    let isBow = !!item.isBow;
                    let isWand = (item.req === 'mage' || item.id.includes('wand') || (item.n && (item.n.includes('杖') || item.n.includes('鐮刀'))));
                    let isTwoHand = (!!item.w2h && !isWand);
                    let isOneHand = (!isBow && !isWand && !item.w2h);

                    if (subCat === 'bow' && !isBow) return false;
                    if (subCat === 'wand' && !isWand) return false;
                    if (subCat === 'twohand' && !isTwoHand) return false;
                    if (subCat === 'onehand' && !isOneHand) return false;
                } else if (mainCat === 'relic') {
                    let rawType = DB.items[item.id] ? DB.items[item.id].type : '';
                    if (subCat === 'wpn' && rawType !== 'wpn') return false;
                    if (subCat === 'arm' && rawType !== 'arm') return false;
                    if (subCat === 'acc' && rawType !== 'acc') return false;
                } else if (mainCat === 'acc') {
                    if (subCat === 'remains') {
                        let isRemains = !!item.remains || item.id.startsWith('rem_');
                        if (!isRemains) return false;
                    } else {
                        if (item.slot !== subCat) return false;
                    }
                } else if (mainCat === 'scroll') {
                    let isEnchant = item.id.includes('weapon') || item.id.includes('armor') || item.id.includes('acc');
                    if (subCat === 'enchant' && !isEnchant) return false;
                    if (subCat === 'utility' && isEnchant) return false;
                } else if (mainCat === 'skillbk') {
                    let isElf = item.id.startsWith('bk_elf_');
                    let isDarkElf = item.id.startsWith('bk_dark_');
                    const knightBks = ['bk_solid_shield', 'bk_reduction_armor', 'bk_shock_stun', 'bk_spike_armor', 'bk_counter_barrier'];
                    let isKnight = knightBks.includes(item.id);
                    let isGeneral = !isElf && !isDarkElf && !isKnight;

                    if (subCat === 'elf' && !isElf) return false;
                    if (subCat === 'darkelf' && !isDarkElf) return false;
                    if (subCat === 'knight' && !isKnight) return false;
                    if (subCat === 'general' && !isGeneral) return false;
                } else if (mainCat === 'etc') {
                    let isPotion = item.type === 'pot' || item.id.startsWith('potion_') || (item.n && item.n.includes('藥水'));
                    let isPet = item.id.includes('pet') || item.eff === 'petlure' || item.eff === 'dragonegg' || (item.n && (item.n.includes('果實') || item.n.includes('寵物') || item.n.includes('進化')));
                    let isMaterial = item.type === 'material' || item.id.startsWith('mat_') || item.id.includes('crystal') || (item.n && (item.n.includes('材料') || item.n.includes('結晶') || item.n.includes('礦石') || item.n.includes('皮革') || item.n.includes('骨頭') || item.n.includes('布料')));
                    let isTalisman = !!item.prideKind || item.id.includes('pride') || item.id.includes('talisman');
                    let isOther = !isPotion && !isPet && !isMaterial && !isTalisman;

                    if (subCat === 'potion' && !isPotion) return false;
                    if (subCat === 'pet' && !isPet) return false;
                    if (subCat === 'material' && !isMaterial) return false;
                    if (subCat === 'talisman' && !isTalisman) return false;
                    if (subCat === 'other' && !isOther) return false;
                } else if (mainCat === 'card') {
                    let isT1 = item.cardTier === 1;
                    let isT2 = item.cardTier === 2;
                    let isT3 = item.cardTier === 3;
                    let isBook = item.id === 'item_card_book' || item.eff === 'cardbook';

                    if (subCat === 'tier1' && !isT1) return false;
                    if (subCat === 'tier2' && !isT2) return false;
                    if (subCat === 'tier3' && !isT3) return false;
                    if (subCat === 'book' && !isBook) return false;
                } else if (mainCat === 'doll') {
                    let tier = item.dollTier || 0;
                    if (subCat === 'tier1' && tier !== 1) return false;
                    if (subCat === 'tier2' && tier !== 2) return false;
                    if (subCat === 'tier3' && tier !== 3) return false;
                    if (subCat === 'tier4' && tier !== 4) return false;
                    if (subCat === 'tier5' && tier !== 5) return false;
                    if (subCat === 'tier6' && tier !== 6) return false;
                } else {
                    if (mainCat !== 'acc' && item.slot !== subCat) return false;
                }
            }

            // 3. 搜尋過濾
            if (search && !item.n.toLowerCase().includes(search)) return false;
            return true;
        });

        // 分頁處理
        let pageSize = 24; // 每頁顯示 24 筆
        let totalItems = filtered.length;
        let totalPages = Math.ceil(totalItems / pageSize) || 1;

        if (window.gmShopCurrentPage > totalPages) {
            window.gmShopCurrentPage = totalPages;
        }
        if (window.gmShopCurrentPage < 1) {
            window.gmShopCurrentPage = 1;
        }

        let startIndex = (window.gmShopCurrentPage - 1) * pageSize;
        let pageItems = filtered.slice(startIndex, startIndex + pageSize);

        // 渲染卡片
        let html = '';
        pageItems.forEach(eq => {
            let d = DB.items[eq.id];
            if (!d) return;

            let isEquip = eq.type === 'wpn' || eq.type === 'arm' || eq.type === 'acc';

            // 構建預覽屬性
            let mockItem = {
                id: eq.id,
                cnt: 1,
                en: isEquip ? opts.enhanceVal : 0,
                bless: isEquip ? ((opts.blessVal === 'random') ? true : opts.blessVal) : false,
                anc: isEquip ? ((opts.ancVal === 'random') ? true : opts.ancVal) : false,
                attr: isEquip ? ((opts.attrVal === 'random') ? 'fire5' : opts.attrVal) : false,
                seteff: isEquip ? ((opts.seteffVal === 'random') ? '紅獅的誓言' : opts.seteffVal) : false
            };

            let iconUrl = getIconUrl(d);
            let glowClass = getGlowClass(mockItem, d) || '';
            let fullName = getItemFullName(mockItem);

            // 處理物品描述 HTML
            let descHtml = '';
            try {
                descHtml = buildItemDescHTML(mockItem);
            } catch (e) {
                descHtml = d.d || '';
            }

            let price = opts.isFree ? 0 : (d.p || 0);
            let displayPrice = opts.isFree ? '免費' : `${price.toLocaleString()} 金幣`;

            html += `
                <div class="gm-shop-card">
                    <div class="gm-shop-card-header">
                        <div class="gm-shop-icon-container">
                            <img src="${iconUrl}" onerror="this.src='https://placehold.co/60x60/1e293b/ffffff?text=?';" class="w-11 h-11 object-contain ${glowClass}">
                        </div>
                        <div class="gm-shop-card-details">
                            <div class="gm-shop-card-name">${fullName}</div>
                            <div class="gm-shop-card-meta-action">
                                <div class="gm-shop-card-price">${displayPrice}</div>
                                <button class="gm-shop-buy-btn" onclick="buyGMShopItem('${eq.id}')">🛒 購買</button>
                            </div>
                        </div>
                    </div>
                    <div class="gm-shop-card-desc">${descHtml}</div>
                </div>
            `;
        });

        if (filtered.length === 0) {
            html = '<div class="col-span-full py-20 text-center text-slate-500 font-bold">找不到相符的裝備。</div>';
        }

        container.innerHTML = html;

        // 渲染分頁按鈕
        let pagContainer = document.getElementById('gm-shop-pagination-container');
        if (pagContainer) {
            if (totalPages <= 1) {
                pagContainer.innerHTML = '';
                pagContainer.style.setProperty('display', 'none', 'important');
            } else {
                pagContainer.style.setProperty('display', 'flex', 'important');
                pagContainer.innerHTML = `
                    <button class="gm-shop-page-btn" ${window.gmShopCurrentPage === 1 ? 'disabled' : ''} onclick="changeGMShopPage(-1)">◀ 上一頁</button>
                    <span class="gm-shop-page-info">第 ${window.gmShopCurrentPage} / ${totalPages} 頁 (共 ${totalItems} 筆)</span>
                    <button class="gm-shop-page-btn" ${window.gmShopCurrentPage === totalPages ? 'disabled' : ''} onclick="changeGMShopPage(1)">下一頁 ▶</button>
                `;
            }
        }
    };

    // 新增：換頁函式
    window.changeGMShopPage = function (dir) {
        window.gmShopCurrentPage = (window.gmShopCurrentPage || 1) + dir;
        renderGMShopGrid();
        let grid = document.getElementById('gm-shop-grid-container');
        if (grid) grid.scrollTop = 0;
    };

    // 4. 購買裝備邏輯
    window.buyGMShopItem = function (id) {
        let opts = getGMShopSelectedOptions();
        let d = DB.items[id];
        if (!d) return;

        let isEquip = d.type === 'wpn' || d.type === 'arm' || d.type === 'acc';
        let buyQty = 1;

        if (!isEquip) {
            let inputQty = prompt(`請輸入購買數量 (${d.n})：`, "1");
            if (inputQty === null) return; // 使用者按取消
            buyQty = parseInt(inputQty) || 0;
            if (buyQty <= 0) {
                logSys('<span class="text-red-400">購買數量必須大於 0！</span>');
                return;
            }
        }

        let price = opts.isFree ? 0 : (d.p || 0);
        let totalPrice = price * buyQty;

        if (!opts.isFree && (player.gold || 0) < totalPrice) {
            logSys(`<span class="text-red-400">金幣不足，無法購買！(需 ${totalPrice.toLocaleString()} 金幣)</span>`);
            return;
        }

        if (!opts.isFree) {
            player.gold -= totalPrice;
        }

        // 處理隨機選項
        let enVal = isEquip ? opts.enhanceVal : 0;
        let blessVal = isEquip ? opts.blessVal : false;
        let ancVal = isEquip ? opts.ancVal : false;
        let attrVal = isEquip ? opts.attrVal : false;
        let seteffVal = isEquip ? opts.seteffVal : false;

        if (isEquip) {
            if (blessVal === 'random') {
                let _af = (typeof rollAffixesNew === 'function') ? rollAffixesNew() : { bless: true };
                blessVal = _af.bless;
            }

            if (ancVal === 'random') {
                let _af = (typeof rollAffixesNew === 'function') ? rollAffixesNew() : { anc: true };
                ancVal = _af.anc;
            }

            if (attrVal === 'random') {
                attrVal = (typeof rollAttrAffix === 'function') ? rollAttrAffix() : 'fire1';
            }

            if (seteffVal === 'random') {
                if (typeof SHERINE_EFFECTS !== 'undefined') {
                    seteffVal = SHERINE_EFFECTS[Math.floor(Math.random() * SHERINE_EFFECTS.length)];
                } else {
                    seteffVal = false;
                }
            }
        }

        // 構建物品探針
        let _probe = {
            id: id,
            en: enVal,
            bless: blessVal,
            anc: ancVal,
            attr: attrVal,
            seteff: seteffVal
        };

        // 背包疊加與塞入邏輯
        let ex = (enVal === 0) ? player.inv.find(i => (i.en || 0) === 0 && sameItemSig(i, _probe)) : null;

        if (ex) {
            ex.cnt += buyQty;
        } else {
            player.inv.push({
                id: id,
                uid: uid(),
                cnt: buyQty,
                en: enVal,
                bless: blessVal,
                anc: ancVal,
                attr: attrVal,
                seteff: seteffVal,
                lock: false,
                junk: !!(player.junkPrefs && player.junkPrefs[itemSig(_probe)])
            });
        }

        // 發送系統訊息
        let displayItem = { id: id, cnt: buyQty, en: enVal, bless: blessVal, anc: ancVal, attr: attrVal, seteff: seteffVal };
        logSys(`在 GM 商店購買了 <span class="font-bold">${getItemFullName(displayItem)}</span> x${buyQty}${opts.isFree ? ' (免費)' : ` (花費 ${totalPrice.toLocaleString()} 金幣)`}`);

        // 特殊頭盔之類的技能更新
        if (d.grantSkills) {
            if (typeof calcStats === 'function') calcStats();
            if (typeof renderSkillSelects === 'function') renderSkillSelects();
        }

        // 狀態更新
        if (typeof calcStats === 'function') calcStats();

        // 更新 GM 商店金幣及重量顯示
        document.getElementById('gm-shop-player-gold').innerText = (player.gold || 0).toLocaleString();
        if (player.d) {
            let loadTier = player.d.loadTier || 0;
            let loadColor = (typeof getLoadColor === 'function') ? getLoadColor(loadTier) : 'text-white';
            let weightPct = player.d.weightPct || 0;
            document.getElementById('gm-shop-player-inv').innerHTML = `<span class="${loadColor} font-bold">${weightPct}%</span>`;
        }

        // 觸發遊戲原生界面重繪與存檔
        if (typeof updateUI === 'function') updateUI();
        if (typeof renderTabs === 'function') renderTabs(true);
        if (typeof saveGame === 'function') saveGame();
    };

    window.modifyGMGold = function () {
        let goldInput = document.getElementById('gm-gold-input');
        if (!goldInput) return;
        let val = parseInt(goldInput.value);
        if (isNaN(val) || val < 0) {
            alert("請輸入大於或等於 0 的金幣數量！");
            return;
        }
        if (val > 999999999999) {
            val = 999999999999;
        }
        player.gold = val;

        // 更新 GM 商店金幣顯示
        document.getElementById('gm-shop-player-gold').innerText = player.gold.toLocaleString();

        // 觸發遊戲原生界面重繪與存檔
        if (typeof updateUI === 'function') updateUI();
        if (typeof renderTabs === 'function') renderTabs(true);
        if (typeof saveGame === 'function') saveGame();

        if (typeof showToast === 'function') {
            showToast(`金幣已成功修改為 ${val.toLocaleString()}`, 'success');
        }
    };

    window.modifyGMLevel = function () {
        let lvlInput = document.getElementById('gm-lvl-input');
        if (!lvlInput) return;
        let val = parseInt(lvlInput.value);
        if (isNaN(val) || val < 1 || val > 999) {
            alert("請輸入 1 到 999 之間的有效等級！");
            return;
        }

        let oldLv = player.lv || 1;
        player.lv = val;
        player.exp = 0; // 重置經驗值為 0

        // 根據等級變化自動補償或扣除「未分配點數」
        let diff = Math.max(0, val - 49) - Math.max(0, oldLv - 49);
        player.bonus = Math.max(0, (player.bonus || 0) + diff);

        // 重新計算屬性與 UI 刷新
        if (typeof calcStats === 'function') calcStats();
        if (typeof updateUI === 'function') updateUI();
        if (typeof saveGame === 'function') saveGame();

        if (typeof showToast === 'function') {
            showToast(`等級已成功修改為 Lv.${val}`, 'success');
        }
    };

    /* 🐾 寵物測試功能 */
    window.gmAddAllPets = function (lv) {
        if (typeof player === 'undefined' || !player || !player.cls) {
            alert("請先載入或建立角色！");
            return;
        }
        let list = petRoster();
        let petTypes = ['黃金龍', '頑皮龍', '淘氣龍', '虎男', '熊貓', '暴走兔', '浣熊', '狼', '熊', '貓'];
        let count = 0;
        let snap = _petMutationSnapshot();
        list.length = 0; // 清空保管箱
        petTypes.forEach(form => {
            let p = petNewInstance(form, lv || 30);
            if (p) {
                list.push(p);
                count++;
            }
        });
        petMarkDirty();
        if (petRosterSave()) {
            if (typeof logSys === 'function') logSys(`<span class="text-green-300 font-bold">🐾 GM 測試：成功生成 ${count} 隻常用寵物（等級 ${lv || 30}）並送入包武保管箱！</span>`);
            if (typeof updateUI === 'function') updateUI();
            if (typeof renderTabs === 'function') renderTabs(true);
            let _d = document.getElementById('interaction-content');
            if (_d && _d.querySelector('[data-petui]')) renderPetStorageNPC(_d);
        } else {
            _petMutationRestore(snap);
            alert("儲存寵物保管箱失敗！");
        }
    };

    window.gmSetAllPetsLevel = function (lv) {
        if (typeof player === 'undefined' || !player || !player.cls) {
            alert("請先載入或建立角色！");
            return;
        }
        let list = petRoster();
        if (!list || list.length === 0) {
            alert("目前保管箱沒有任何寵物！");
            return;
        }
        let snap = _petMutationSnapshot();
        list.forEach(p => {
            p.lv = lv;
            p.exp = 0;
            let def = PET_BOOK[p.form];
            if (def) {
                let hpUp = def.hpUp ? def.hpUp[0] : 5;
                let mpUp = def.mpUp ? def.mpUp[0] : 1;
                p.mhp = (def.hp0 || 30) + (lv - (def.lv0 || 5)) * hpUp;
                p.mmp = (def.mp0 || 0) + (lv - (def.lv0 || 5)) * mpUp;
                p.hp = p.mhp;
                p.mp = p.mmp;
            }
        });
        petMarkDirty();
        if (petRosterSave()) {
            if (typeof logSys === 'function') logSys(`<span class="text-green-300 font-bold">🐾 GM 測試：成功將當前所有寵物等級設定為 Lv.${lv}！</span>`);
            if (typeof updateUI === 'function') updateUI();
            if (typeof renderTabs === 'function') renderTabs(true);
            let _d = document.getElementById('interaction-content');
            if (_d && _d.querySelector('[data-petui]')) renderPetStorageNPC(_d);
        } else {
            _petMutationRestore(snap);
            alert("設定寵物等級失敗！");
        }
    };

    window.gmClearAllPets = function () {
        if (!confirm("確定要清空所有的寵物嗎？")) return;
        
        try {
            let list = petRoster();
            let snap = _petMutationSnapshot();
            
            // 將所有寵物記錄到已釋放名單中，避免被 merge-on-write 復活
            if (typeof _petReleasedUids !== 'undefined') {
                list.forEach(p => {
                    _petReleasedUids[p.uid] = true;
                });
            }
            
            list.length = 0;
            petMarkDirty();
            
            if (petRosterSave()) {
                if (typeof logSys === 'function') logSys(`<span class="text-red-300 font-bold">🐾 GM 測試：已清空所有的寵物保管資料。</span>`);
                if (typeof updateUI === 'function') updateUI();
                if (typeof renderTabs === 'function') renderTabs(true);
                let _d = document.getElementById('interaction-content');
                if (_d && _d.querySelector('[data-petui]')) renderPetStorageNPC(_d);
                if (typeof showToast === 'function') showToast("寵物保管箱已清空！", 'success');
            } else {
                _petMutationRestore(snap);
                alert("清空寵物失敗！");
            }
        } catch (e) {
            console.error("GM Clear Pets Error:", e);
            alert("清空寵物時發生錯誤，請查看主控台。");
        }
    };

    window.gmAddSinglePet = function () {
        if (typeof player === 'undefined' || !player) {
            alert("請先載入或建立角色！");
            return;
        }

        let select = document.getElementById('gm-add-pet-form-select');
        if (!select) return;
        let form = select.value;
        
        let lvInput = document.getElementById('gm-add-pet-lv-input');
        let lv = parseInt(lvInput ? lvInput.value : 30) || 30;
        if (lv < 1) lv = 1;
        if (lv > 999) lv = 999;

        let list = petRoster();
        if (list.length >= PET_STORAGE_MAX) {
            alert(`寵物保管已滿（上限 ${PET_STORAGE_MAX} 隻），無法新增！`);
            return;
        }

        let p = petNewInstance(form, lv);
        if (!p) {
            alert("新增寵物失敗：無效的寵物型態！");
            return;
        }

        list.push(p);
        petMarkDirty();
        
        if (petRosterSave()) {
            if (typeof logSys === 'function') {
                logSys(`<span class="text-green-300 font-bold">🐾 GM 測試：成功新增特定寵物 ${form}（Lv.${lv}）到寵物保管箱！</span>`);
            }
            if (typeof updateUI === 'function') updateUI();
            if (typeof renderTabs === 'function') renderTabs(true);
            let _d = document.getElementById('interaction-content');
            if (_d && _d.querySelector('[data-petui]')) renderPetStorageNPC(_d);
            if (typeof showToast === 'function') showToast("新增寵物成功！", 'success');
            
            // 刷新 GM 寵物編輯下拉選單
            window.loadGMShopCharValues();
        } else {
            // 回滾
            if (typeof _petRoster !== 'undefined') {
                _petRoster = list.filter(x => x.uid !== p.uid);
            }
            petMarkDirty();
            alert("保存新增寵物狀態失敗！");
        }
    };

    /* 🌟 收藏圖鑑解鎖功能 */
    /* 🌟 收藏圖鑑原版 UI 注入與輔助功能 */
    window.gmBookEditModes = { card: false, equip: false, misc: false, relic: false };
    
    window.toggleGMBookEditMode = function (type, checked) {
        window.gmBookEditModes[type] = checked;
        if (type === 'card' && typeof renderCardBook === 'function') renderCardBook();
        if (type === 'equip' && typeof renderEquipBook === 'function') renderEquipBook();
        if (type === 'misc' && typeof renderMiscBook === 'function') renderMiscBook();
        if (type === 'relic' && typeof renderRelicBook === 'function') renderRelicBook();
    };

    window.toggleGMBookItemState = function (type, idOrName) {
        if (typeof player === 'undefined' || !player || !idOrName) return;

        if (type === 'card') {
            if (!player.cardDex) player.cardDex = {};
            let cur = player.cardDex[idOrName] || 0;
            let next = 0;
            if (cur === 0) next = 1;
            else if (cur === 1) next = 11;
            else if (cur === 11) next = 111;
            else next = 0;
            
            player.cardDex[idOrName] = next;
            if (typeof saveCardDex === 'function') saveCardDex();
        } else if (type === 'equip') {
            if (!player.equipDex) player.equipDex = {};
            player.equipDex[idOrName] = !player.equipDex[idOrName];
            if (typeof saveEquipDex === 'function') saveEquipDex();
        } else if (type === 'misc') {
            if (!player.miscDex) player.miscDex = {};
            player.miscDex[idOrName] = !player.miscDex[idOrName];
            if (typeof saveMiscDex === 'function') saveMiscDex();
        } else if (type === 'relic') {
            if (!player.relicDex) player.relicDex = {};
            player.relicDex[idOrName] = !player.relicDex[idOrName];
            if (typeof saveRelicDex === 'function') saveRelicDex();
        }

        if (typeof calcStats === 'function') calcStats();
        if (typeof updateUI === 'function') updateUI();
        if (typeof renderTabs === 'function') renderTabs(true);
        if (typeof saveGame === 'function') saveGame();

        if (type === 'card' && typeof renderCardBook === 'function') renderCardBook();
        if (type === 'equip' && typeof renderEquipBook === 'function') renderEquipBook();
        if (type === 'misc' && typeof renderMiscBook === 'function') renderMiscBook();
        if (type === 'relic' && typeof renderRelicBook === 'function') renderRelicBook();
    };

    window.gmBookUnlockCategory = function (type) {
        if (typeof player === 'undefined' || !player) return;
        
        if (type === 'card') {
            let names = (typeof CARD_REGION_MOBS !== 'undefined' && CARD_REGION_MOBS[_cardBookRegion]) || [];
            if (!player.cardDex) player.cardDex = {};
            names.forEach(nm => { player.cardDex[nm] = 111; });
            if (typeof saveCardDex === 'function') saveCardDex();
        } else if (type === 'equip') {
            let ids = (typeof EQUIP_CAT_ITEMS !== 'undefined' && EQUIP_CAT_ITEMS[_equipBookCat]) || [];
            if (!player.equipDex) player.equipDex = {};
            ids.forEach(id => { player.equipDex[id] = true; });
            if (typeof saveEquipDex === 'function') saveEquipDex();
        } else if (type === 'misc') {
            let ids = (typeof MISC_CAT_ITEMS !== 'undefined' && MISC_CAT_ITEMS[_miscBookCat]) || [];
            if (!player.miscDex) player.miscDex = {};
            ids.forEach(id => { player.miscDex[id] = true; });
            if (typeof saveMiscDex === 'function') saveMiscDex();
        } else if (type === 'relic') {
            let ids = (typeof RELIC_CAT_ITEMS !== 'undefined' && RELIC_CAT_ITEMS[_relicBookCat]) || [];
            if (!player.relicDex) player.relicDex = {};
            ids.forEach(id => { player.relicDex[id] = true; });
            if (typeof saveRelicDex === 'function') saveRelicDex();
        }

        if (typeof calcStats === 'function') calcStats();
        if (typeof updateUI === 'function') updateUI();
        if (typeof renderTabs === 'function') renderTabs(true);
        if (typeof saveGame === 'function') saveGame();

        if (type === 'card' && typeof renderCardBook === 'function') renderCardBook();
        if (type === 'equip' && typeof renderEquipBook === 'function') renderEquipBook();
        if (type === 'misc' && typeof renderMiscBook === 'function') renderMiscBook();
        if (type === 'relic' && typeof renderRelicBook === 'function') renderRelicBook();
        if (typeof showToast === 'function') showToast("本分頁圖鑑已解鎖！", 'success');
    };

    window.gmBookClearCategory = function (type) {
        if (typeof player === 'undefined' || !player) return;
        if (!confirm("確定要將本分頁的所有收集項目改為未解鎖嗎？")) return;

        if (type === 'card') {
            let names = (typeof CARD_REGION_MOBS !== 'undefined' && CARD_REGION_MOBS[_cardBookRegion]) || [];
            if (player.cardDex) { names.forEach(nm => { delete player.cardDex[nm]; }); }
            if (typeof saveCardDex === 'function') saveCardDex();
        } else if (type === 'equip') {
            let ids = (typeof EQUIP_CAT_ITEMS !== 'undefined' && EQUIP_CAT_ITEMS[_equipBookCat]) || [];
            if (player.equipDex) { ids.forEach(id => { delete player.equipDex[id]; }); }
            if (typeof saveEquipDex === 'function') saveEquipDex();
        } else if (type === 'misc') {
            let ids = (typeof MISC_CAT_ITEMS !== 'undefined' && MISC_CAT_ITEMS[_miscBookCat]) || [];
            if (player.miscDex) { ids.forEach(id => { delete player.miscDex[id]; }); }
            if (typeof saveMiscDex === 'function') saveMiscDex();
        } else if (type === 'relic') {
            let ids = (typeof RELIC_CAT_ITEMS !== 'undefined' && RELIC_CAT_ITEMS[_relicBookCat]) || [];
            if (player.relicDex) { ids.forEach(id => { delete player.relicDex[id]; }); }
            if (typeof saveRelicDex === 'function') saveRelicDex();
        }

        if (typeof calcStats === 'function') calcStats();
        if (typeof updateUI === 'function') updateUI();
        if (typeof renderTabs === 'function') renderTabs(true);
        if (typeof saveGame === 'function') saveGame();

        if (type === 'card' && typeof renderCardBook === 'function') renderCardBook();
        if (type === 'equip' && typeof renderEquipBook === 'function') renderEquipBook();
        if (type === 'misc' && typeof renderMiscBook === 'function') renderMiscBook();
        if (type === 'relic' && typeof renderRelicBook === 'function') renderRelicBook();
        if (typeof showToast === 'function') showToast("本分頁圖鑑已重置！", 'success');
    };

    window.gmBookUnlockAll = function (type) {
        if (typeof player === 'undefined' || !player) return;
        
        if (type === 'card' && typeof CARD_MOB_INFO !== 'undefined') {
            if (!player.cardDex) player.cardDex = {};
            Object.keys(CARD_MOB_INFO).forEach(name => { player.cardDex[name] = 111; });
            if (typeof saveCardDex === 'function') saveCardDex();
        } else if (type === 'equip' && typeof EQUIP_ITEM_CAT !== 'undefined') {
            if (!player.equipDex) player.equipDex = {};
            Object.keys(EQUIP_ITEM_CAT).forEach(id => { player.equipDex[id] = true; });
            if (typeof saveEquipDex === 'function') saveEquipDex();
        } else if (type === 'misc' && typeof MISC_ITEM_CAT !== 'undefined') {
            if (!player.miscDex) player.miscDex = {};
            Object.keys(MISC_ITEM_CAT).forEach(id => { player.miscDex[id] = true; });
            if (typeof saveMiscDex === 'function') saveMiscDex();
        } else if (type === 'relic' && typeof RELIC_ITEM_CAT !== 'undefined') {
            if (!player.relicDex) player.relicDex = {};
            Object.keys(RELIC_ITEM_CAT).forEach(id => { player.relicDex[id] = true; });
            if (typeof saveRelicDex === 'function') saveRelicDex();
        }

        if (typeof calcStats === 'function') calcStats();
        if (typeof updateUI === 'function') updateUI();
        if (typeof renderTabs === 'function') renderTabs(true);
        if (typeof saveGame === 'function') saveGame();

        if (type === 'card' && typeof renderCardBook === 'function') renderCardBook();
        if (type === 'equip' && typeof renderEquipBook === 'function') renderEquipBook();
        if (type === 'misc' && typeof renderMiscBook === 'function') renderMiscBook();
        if (type === 'relic' && typeof renderRelicBook === 'function') renderRelicBook();
        if (typeof showToast === 'function') showToast("全部圖鑑解鎖成功！", 'success');
    };

    window.gmBookClearAll = function (type) {
        if (typeof player === 'undefined' || !player) return;
        if (!confirm("確定要清空此大類的所有圖鑑嗎？")) return;

        if (type === 'card') {
            player.cardDex = {};
            if (typeof saveCardDex === 'function') saveCardDex();
        } else if (type === 'equip') {
            player.equipDex = {};
            if (typeof saveEquipDex === 'function') saveEquipDex();
        } else if (type === 'misc') {
            player.miscDex = {};
            if (typeof saveMiscDex === 'function') saveMiscDex();
        } else if (type === 'relic') {
            player.relicDex = {};
            if (typeof saveRelicDex === 'function') saveRelicDex();
        }

        if (typeof calcStats === 'function') calcStats();
        if (typeof updateUI === 'function') updateUI();
        if (typeof renderTabs === 'function') renderTabs(true);
        if (typeof saveGame === 'function') saveGame();

        if (type === 'card' && typeof renderCardBook === 'function') renderCardBook();
        if (type === 'equip' && typeof renderEquipBook === 'function') renderEquipBook();
        if (type === 'misc' && typeof renderMiscBook === 'function') renderMiscBook();
        if (type === 'relic' && typeof renderRelicBook === 'function') renderRelicBook();
        if (typeof showToast === 'function') showToast("全部圖鑑已清空！", 'success');
    };

    window.gmUnlockAllCollections = function () {
        if (typeof player === 'undefined' || !player) {
            alert("請先載入或建立角色！");
            return;
        }
        gmBookUnlockAll('card');
        gmBookUnlockAll('equip');
        gmBookUnlockAll('misc');
        gmBookUnlockAll('relic');
        if (typeof logSys === 'function') logSys(`<span class="text-yellow-300 font-bold">🌟 GM 測試：一鍵完美解鎖【全部四種】收藏圖鑑！能力值已全部激活！</span>`);
        if (typeof showToast === 'function') showToast("全套圖鑑解鎖成功！", 'success');
    };

    window.gmClearAllCollections = function () {
        if (typeof player === 'undefined' || !player) return;
        if (!confirm("確定要清空【所有四類】收藏圖鑑嗎？")) return;
        gmBookClearAll('card');
        gmBookClearAll('equip');
        gmBookClearAll('misc');
        gmBookClearAll('relic');
        if (typeof logSys === 'function') logSys(`<span class="text-red-400 font-bold">🗑️ GM 測試：已清空【全部四種】收藏圖鑑！</span>`);
        if (typeof showToast === 'function') showToast("所有圖鑑已清空！", 'success');
    };

    function injectGMBookControlBars() {
        const types = [
            { id: 'card-book', type: 'card' },
            { id: 'equip-book', type: 'equip' },
            { id: 'misc-book', type: 'misc' },
            { id: 'relic-book', type: 'relic' }
        ];

        types.forEach(t => {
            let bookEl = document.getElementById(t.id);
            if (!bookEl) return;
            
            if (bookEl.querySelector('.gm-book-control-bar')) {
                let chk = bookEl.querySelector(`#gm-book-edit-toggle-${t.type}`);
                if (chk) chk.checked = !!window.gmBookEditModes[t.type];
                return;
            }

            let panel = bookEl.querySelector('.flex-col');
            if (!panel) return;

            let isChecked = !!window.gmBookEditModes[t.type];
            let bar = document.createElement('div');
            bar.className = 'gm-book-control-bar flex items-center justify-between px-4 py-2 text-xs gap-3 flex-shrink-0';
            bar.style.cssText = "background: rgba(88, 28, 135, 0.2) !important; border-bottom: 1px solid rgba(147, 51, 234, 0.3) !important;";
            bar.innerHTML = `
                <div class="flex items-center gap-2">
                    <span class="text-purple-300 font-bold">🔧 GM 輔助模式:</span>
                    <label class="flex items-center gap-1.5 cursor-pointer select-none text-slate-300 hover:text-white" style="font-size: 12px; margin: 0;">
                        <input type="checkbox" id="gm-book-edit-toggle-${t.type}" ${isChecked ? 'checked' : ''} style="width: 14px; height: 14px; cursor: pointer; margin: 0;" onchange="toggleGMBookEditMode('${t.type}', this.checked)">
                        點擊卡片直接【解鎖 / 鎖定】
                    </label>
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="gmBookUnlockCategory('${t.type}')" class="px-2 py-1 bg-sky-950/60 border border-sky-800 text-sky-300 hover:bg-sky-900/60 rounded font-semibold transition" style="font-size: 11px;">⚡ 解鎖本分頁</button>
                    <button onclick="gmBookClearCategory('${t.type}')" class="px-2 py-1 bg-red-950/60 border border-red-900 text-red-400 hover:bg-red-900/60 rounded font-semibold transition" style="font-size: 11px;">🗑️ 清空本分頁</button>
                    <div style="width: 1px; height: 14px; background: rgba(255,255,255,0.1); margin: 0 4px;"></div>
                    <button onclick="gmBookUnlockAll('${t.type}')" class="px-2.5 py-1 bg-amber-950/40 border border-amber-600 text-yellow-300 hover:bg-amber-900/60 rounded font-semibold transition" style="font-size: 11px;">🌟 一鍵解鎖全部</button>
                    <button onclick="gmBookClearAll('${t.type}')" class="px-2 py-1 bg-red-950/80 border border-red-800 text-red-300 hover:bg-red-900/80 rounded font-semibold transition" style="font-size: 11px;">🗑️ 清空全部</button>
                </div>
            `;
            
            let header = panel.firstElementChild;
            if (header) {
                header.after(bar);
            } else {
                panel.prepend(bar);
            }
        });
    }

    function setupGMBookClickDelegation() {
        document.body.addEventListener('click', function (e) {
            const mappings = [
                { bodyId: 'card-book-body', type: 'card' },
                { bodyId: 'equip-book-body', type: 'equip' },
                { bodyId: 'misc-book-body', type: 'misc' },
                { bodyId: 'relic-book-body', type: 'relic' }
            ];

            for (let m of mappings) {
                let body = document.getElementById(m.bodyId);
                if (!body) continue;

                if (!body.contains(e.target)) continue;

                let chk = document.getElementById(`gm-book-edit-toggle-${m.type}`);
                if (!chk || !chk.checked) continue;

                let card = e.target.closest('.bg-slate-800\\/70, .relative.bg-slate-800\\/70, [class*="bg-slate-800"]');
                if (!card) continue;

                e.preventDefault();
                e.stopPropagation();

                let idOrName = '';
                let wrapper = card.parentNode;
                let index = Array.from(wrapper.children).indexOf(card);
                if (index !== -1) {
                    if (m.type === 'card') {
                        let names = (typeof CARD_REGION_MOBS !== 'undefined' && CARD_REGION_MOBS[_cardBookRegion]) || [];
                        idOrName = names[index];
                    } else if (m.type === 'equip') {
                        let ids = (typeof EQUIP_CAT_ITEMS !== 'undefined' && EQUIP_CAT_ITEMS[_equipBookCat]) || [];
                        idOrName = ids[index];
                    } else if (m.type === 'misc') {
                        let ids = (typeof MISC_CAT_ITEMS !== 'undefined' && MISC_CAT_ITEMS[_miscBookCat]) || [];
                        idOrName = ids[index];
                    } else if (m.type === 'relic') {
                        let ids = (typeof RELIC_CAT_ITEMS !== 'undefined' && RELIC_CAT_ITEMS[_relicBookCat]) || [];
                        idOrName = ids[index];
                    }
                }

                if (idOrName) {
                    toggleGMBookItemState(m.type, idOrName);
                }
                break;
            }
        }, true);
    }

    function setupGMBookOverlays() {
        const books = [
            { name: 'renderCardBook', type: 'card' },
            { name: 'renderEquipBook', type: 'equip' },
            { name: 'renderMiscBook', type: 'misc' },
            { name: 'renderRelicBook', type: 'relic' }
        ];

        books.forEach(b => {
            if (typeof window[b.name] === 'function') {
                const originalFunc = window[b.name];
                window[b.name] = function () {
                    originalFunc();
                    try {
                        injectGMBookControlBars();
                    } catch (e) {
                        console.error("GM Book inject failed:", e);
                    }
                };
            }
        });

        setupGMBookClickDelegation();
    }

    // 5. 創建大視窗 DOM
    function createGMShopModal() {
        // 抓取所有商品 (只執行一次)
        if (equipments.length === 0) {
            for (let id in DB.items) {
                let item = DB.items[id];
                if (!item) continue;

                // 0. 遺物類
                if (item.isRelic || (typeof isRelic === 'function' && isRelic(item)) || id.startsWith('relic_')) {
                    equipments.push({ id: id, ...item, type: 'relic' });
                }
                // 1. 魔法娃娃類
                else if (item.doll || item.slot === 'doll' || id.startsWith('doll_')) {
                    equipments.push({ id: id, ...item, type: 'doll' });
                }
                // 2. 裝備類 (武器/防具/飾品)
                else if (item.type === 'wpn' || item.type === 'arm' || item.type === 'acc') {
                    if (item.isArrow) continue;
                    equipments.push({ id: id, ...item });
                }
                // 3. 卷軸類
                else if (item.type === 'scroll' || id.startsWith('scroll_') || id.includes('bless') || id.includes('uncurse') || (item.n && item.n.includes('卷軸'))) {
                    equipments.push({ id: id, ...item, type: 'scroll' });
                }
                // 4. 魔法書類
                else if (item.type === 'skillbk' || id.startsWith('bk_') || (item.n && (item.n.includes('技術書') || item.n.includes('魔法書') || item.n.includes('精靈水晶')))) {
                    equipments.push({ id: id, ...item, type: 'skillbk' });
                }
                // 5. 卡片與圖鑑類
                else if (item.eff === 'card' || item.eff === 'cardbook' || id === 'item_card_book') {
                    equipments.push({ id: id, ...item, type: 'card' });
                }
                // 6. 其他所有物品（包含藥水、材料、果實、結晶等等雜項）一律歸入 etc
                else {
                    equipments.push({ id: id, ...item, type: 'etc' });
                }
            }
            // 排序: 武器 -> 防具 -> 飾品 -> 遺物 -> 魔法娃娃 -> 卷軸 -> 魔法書 -> 卡片圖鑑 -> 材料其他 (內部以售價排序)
            equipments.sort((a, b) => {
                const typeOrder = { wpn: 1, arm: 2, acc: 3, relic: 3.5, doll: 4, scroll: 5, skillbk: 6, card: 7, etc: 8 };
                let orderA = typeOrder[a.type] || 99;
                let orderB = typeOrder[b.type] || 99;
                if (orderA !== orderB) return orderA - orderB;
                return (a.p || 0) - (b.p || 0);
            });
        }

        // 席琳套裝列表生成
        let seteffOptions = `<option value="none">無</option><option value="random">隨機</option>`;
        if (typeof SHERINE_EFFECTS !== 'undefined') {
            const groups = {};
            SHERINE_EFFECTS.forEach(eff => {
                let prefix = eff.slice(0, 2);
                if (!groups[prefix]) groups[prefix] = [];
                groups[prefix].push(eff);
            });
            for (let prefix in groups) {
                seteffOptions += `<optgroup label="${prefix}套裝">`;
                groups[prefix].forEach(eff => {
                    seteffOptions += `<option value="${eff}">${eff}</option>`;
                });
                seteffOptions += `</optgroup>`;
            }
        }

        let modal = document.createElement('div');
        modal.id = 'klh-gm-shop-modal';
        modal.className = 'gm-shop-modal';

        const modalHtml = `
            <div class="gm-shop-container">
                <div class="gm-shop-header">
                    <div class="gm-shop-title">🛍️ GM 商店</div>
                    <div class="gm-shop-tabs">
                        <button id="gm-shop-tab-btn-shop" class="gm-shop-tab-btn active" onclick="switchGMShopTab('shop')">裝備商品</button>
                        <button id="gm-shop-tab-btn-char" class="gm-shop-tab-btn" onclick="switchGMShopTab('char')">角色修改</button>
                        <button id="gm-shop-tab-btn-pet" class="gm-shop-tab-btn" onclick="switchGMShopTab('pet')">寵物修改</button>
                        <button id="gm-shop-tab-btn-collect" class="gm-shop-tab-btn" onclick="switchGMShopTab('collect')">收藏修改</button>
                    </div>
                    <button class="gm-shop-close-btn" onclick="closeGMShop()">&times;</button>
                </div>
                <div class="gm-shop-body">
                    <!-- 裝備商品分頁 -->
                    <div id="gm-shop-tab-content-shop" class="gm-shop-tab-content active">
                        <!-- 側邊欄控制面版 -->
                        <div class="gm-shop-sidebar">
                            <div class="gm-shop-control-group" id="gm-ctrl-free">
                                <span class="gm-shop-control-label">價格與篩選</span>
                                <label class="gm-shop-checkbox-container mt-1">
                                    <input type="checkbox" id="gm-free-checkbox" class="gm-shop-checkbox" checked onchange="onGMShopOptionChange()">
                                    <span class="font-bold text-yellow-400">免費獲得 (0金)</span>
                                </label>
                                <label class="gm-shop-checkbox-container mt-2">
                                    <input type="checkbox" id="gm-legend-checkbox" class="gm-shop-checkbox" onchange="onGMShopOptionChange()">
                                    <span class="font-bold text-orange-400">僅傳說裝備</span>
                                </label>
                            </div>
                            
                            <div class="border-t border-slate-800 my-1 gm-ctrl-divider"></div>
                            
                            <div class="gm-shop-control-group" id="gm-ctrl-enhance">
                                <span class="gm-shop-control-label">自訂強化等級</span>
                                <div class="flex gap-2">
                                    <select id="gm-enhance-select" class="gm-shop-select" onchange="onGMEnhanceSelectChange()">
                                        ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map(v => `<option value="${v}">+${v}</option>`).join('')}
                                        <option value="custom">自訂</option>
                                    </select>
                                    <input type="number" id="gm-enhance-custom-input" value="0" min="0" max="999" class="gm-shop-search-input hidden" style="width: 80px;" oninput="onGMShopOptionChange()">
                                </div>
                            </div>
                            
                            <div class="gm-shop-control-group" id="gm-ctrl-bless">
                                <span class="gm-shop-control-label">祝福狀態</span>
                                <select id="gm-bless-select" class="gm-shop-select" onchange="onGMShopOptionChange()">
                                    <option value="none">無屬性</option>
                                    <option value="blessed">祝福的</option>
                                    <option value="cursed">詛咒的</option>
                                    <option value="random">隨機</option>
                                </select>
                            </div>
                            
                            <div class="gm-shop-control-group" id="gm-ctrl-anc">
                                <span class="gm-shop-control-label">遠古詞綴</span>
                                <select id="gm-anc-select" class="gm-shop-select" onchange="onGMShopOptionChange()">
                                    <option value="none">無</option>
                                    <option value="ancient">遠古 (c-ancient)</option>
                                    <option value="eternal">永恆 (c-eternal)</option>
                                    <option value="immortal">不朽 (c-immortal)</option>
                                    <option value="primordial">太初 (c-primordial)</option>
                                    <option value="random">隨機</option>
                                </select>
                            </div>
                            
                            <div class="gm-shop-control-group" id="gm-ctrl-attr">
                                <span class="gm-shop-control-label">屬性詞綴</span>
                                <select id="gm-attr-select" class="gm-shop-select" onchange="onGMShopOptionChange()">
                                    <option value="none">無</option>
                                    <option value="random">隨機</option>
                                    <optgroup label="地屬性">
                                        <option value="earth1">地之 (+1)</option>
                                        <option value="earth3">崩裂 (+3)</option>
                                        <option value="earth5">地靈 (+5)</option>
                                    </optgroup>
                                    <optgroup label="火屬性">
                                        <option value="fire1">火之 (+1)</option>
                                        <option value="fire3">爆炎 (+3)</option>
                                        <option value="fire5">火靈 (+5)</option>
                                    </optgroup>
                                    <optgroup label="水屬性">
                                        <option value="water1">水之 (+1)</option>
                                        <option value="water3">海嘯 (+3)</option>
                                        <option value="water5">水靈 (+5)</option>
                                    </optgroup>
                                    <optgroup label="風屬性">
                                        <option value="wind1">風之 (+1)</option>
                                        <option value="wind3">暴風 (+3)</option>
                                        <option value="wind5">風靈 (+5)</option>
                                    </optgroup>
                                </select>
                            </div>
                            
                            <div class="gm-shop-control-group" id="gm-ctrl-seteff">
                                <span class="gm-shop-control-label">席琳套裝效果</span>
                                <select id="gm-seteff-select" class="gm-shop-select" onchange="onGMShopOptionChange()">
                                    ${seteffOptions}
                                </select>
                            </div>
                            
                            <!-- 玩家資產與負重 -->
                            <div class="border-t border-slate-800 pt-3 flex flex-col gap-2 mt-auto" id="gm-ctrl-assets">
                                <div class="flex justify-between text-sm">
                                    <span class="text-slate-400">當前金幣</span>
                                    <span class="text-yellow-400 font-bold" id="gm-shop-player-gold">0</span>
                                </div>
                                <div class="flex justify-between text-sm">
                                    <span class="text-slate-400">當前負重</span>
                                    <span class="text-slate-200" id="gm-shop-player-inv">0%</span>
                                </div>
                            </div>
                        </div>
                        
                        <!-- 裝備展示面板 -->
                        <div class="gm-shop-content">
                            <div class="gm-shop-filter-bar" style="gap: 8px !important; margin-bottom: 12px !important;">
                                <input type="text" id="gm-shop-search" placeholder="🔍 搜尋裝備名稱..." class="gm-shop-search-input" style="height: 38px !important; padding: 8px 12px !important;" oninput="onGMShopSearchInput(this.value)">
                                
                                <!-- 主分類選擇 -->
                                <select id="gm-main-cat-select" class="gm-shop-select" style="width: 105px !important; flex-shrink: 0 !important; padding: 6px 8px !important; height: 38px !important; line-height: 1.2 !important;" onchange="setGMShopMainCategory(this.value)">
                                    <option value="all">全部</option>
                                    <option value="wpn">武器</option>
                                    <option value="arm">防具</option>
                                    <option value="acc">飾品</option>
                                    <option value="relic">遺物</option>
                                    <option value="doll">魔法娃娃</option>
                                    <option value="scroll">卷軸</option>
                                    <option value="skillbk">魔法書</option>
                                    <option value="card">卡片圖鑑</option>
                                    <option value="etc">材料其他</option>
                                </select>
                                
                                <!-- 子分類選擇 (預設隱藏) -->
                                <select id="gm-sub-cat-select" class="gm-shop-select" style="width: 105px !important; flex-shrink: 0 !important; padding: 6px 8px !important; height: 38px !important; line-height: 1.2 !important; display: none;" onchange="setGMShopSubCategory(this.value)">
                                    <option value="all">全部部位</option>
                                </select>
                            </div>
                            
                            <!-- 裝備網格 -->
                            <div class="gm-shop-grid" id="gm-shop-grid-container"></div>

                            <!-- 分頁控制 -->
                            <div id="gm-shop-pagination-container" class="gm-shop-pagination-bar"></div>
                        </div>
                    </div>

                    <!-- 角色修改分頁 -->
                    <div id="gm-shop-tab-content-char" class="gm-shop-tab-content">
                        <div class="gm-shop-char-container">
                            <div class="gm-shop-char-grid">
                                <!-- 第一欄 (左)：資產與等級 -->
                                <div class="gm-shop-char-section">
                                    <div class="gm-shop-char-section-title">🪙 資產與等級修改</div>
                                    
                                    <div class="gm-shop-char-input-group">
                                        <span class="gm-shop-control-label">角色等級 (Lv. 1 ~ 999)</span>
                                        <div class="gm-shop-char-input-row">
                                            <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-lvl-input', -10)">-10</button>
                                            <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-lvl-input', -1)">-1</button>
                                            <input type="number" id="gm-char-lvl-input" class="gm-shop-char-input text-center" min="1" max="999" style="max-width: 100px;">
                                            <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-lvl-input', 1)">+1</button>
                                            <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-lvl-input', 10)">+10</button>
                                        </div>
                                    </div>
                                    
                                    <div class="gm-shop-char-input-group">
                                        <span class="gm-shop-control-label">角色金幣 (Gold, 上限 9999 億)</span>
                                        <input type="number" id="gm-char-gold-input" class="gm-shop-char-input" min="0" max="999999999999">
                                    </div>
                                </div>
                                
                                <!-- 右側：六大核心屬性與點數修改 -->
                                <div class="gm-shop-char-section" style="overflow-y: auto; max-height: 60vh; padding-right: 8px;">
                                    <div class="gm-shop-char-section-title flex justify-between">
                                        <span>📊 六大屬性詳細修改</span>
                                    </div>
                                    
                                    <div class="gm-shop-char-input-group mb-4" style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 6px; padding: 8px;">
                                        <span class="gm-shop-control-label font-bold text-emerald-400">未分配點數 (Bonus)</span>
                                        <div class="gm-shop-char-input-row" style="justify-content: center; margin-top: 4px;">
                                            <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-bonus-input', -10)">-10</button>
                                            <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-bonus-input', -1)">-1</button>
                                            <input type="number" id="gm-char-bonus-input" class="gm-shop-char-input text-center font-bold text-emerald-300" min="0" max="9999" style="max-width: 100px; font-size: 16px;">
                                            <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-bonus-input', 1)">+1</button>
                                            <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-bonus-input', 10)">+10</button>
                                        </div>
                                    </div>

                                    <!-- 力量 (STR) -->
                                    <div class="gm-shop-char-input-group" style="border-bottom: 1px dashed #334155; padding-bottom: 8px; margin-bottom: 8px;">
                                        <span class="gm-shop-control-label font-bold text-yellow-400 mb-2">力量 (STR)</span>
                                        
                                        <div class="flex items-center justify-between mt-1">
                                            <span class="text-xs text-slate-400 w-10">起始</span>
                                            <div class="gm-shop-char-input-row" style="flex:1; justify-content: flex-end;">
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-str-base-input', -10)">-10</button>
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-str-base-input', -1)">-1</button>
                                                <input type="number" id="gm-char-str-base-input" class="gm-shop-char-input text-center" min="1" max="9999" style="max-width: 60px;">
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-str-base-input', 1)">+1</button>
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-str-base-input', 10)">+10</button>
                                            </div>
                                        </div>
                                        
                                        <div class="flex items-center justify-between mt-1">
                                            <span class="text-xs text-emerald-400 w-10">升級</span>
                                            <div class="gm-shop-char-input-row" style="flex:1; justify-content: flex-end;">
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-str-alloc-input', -10)">-10</button>
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-str-alloc-input', -1)">-1</button>
                                                <input type="number" id="gm-char-str-alloc-input" class="gm-shop-char-input text-center" min="0" max="9999" style="max-width: 60px;">
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-str-alloc-input', 1)">+1</button>
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-str-alloc-input', 10)">+10</button>
                                            </div>
                                        </div>
                                        
                                        <div class="flex items-center justify-between mt-1">
                                            <span class="text-xs text-pink-400 w-10">萬能</span>
                                            <div class="gm-shop-char-input-row" style="flex:1; justify-content: flex-end;">
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-str-panacea-input', -10)">-10</button>
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-str-panacea-input', -1)">-1</button>
                                                <input type="number" id="gm-char-str-panacea-input" class="gm-shop-char-input text-center" min="0" max="9999" style="max-width: 60px;">
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-str-panacea-input', 1)">+1</button>
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-str-panacea-input', 10)">+10</button>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- 敏捷 (DEX) -->
                                    <div class="gm-shop-char-input-group" style="border-bottom: 1px dashed #334155; padding-bottom: 8px; margin-bottom: 8px;">
                                        <span class="gm-shop-control-label font-bold text-yellow-400 mb-2">敏捷 (DEX)</span>
                                        
                                        <div class="flex items-center justify-between mt-1">
                                            <span class="text-xs text-slate-400 w-10">起始</span>
                                            <div class="gm-shop-char-input-row" style="flex:1; justify-content: flex-end;">
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-dex-base-input', -10)">-10</button>
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-dex-base-input', -1)">-1</button>
                                                <input type="number" id="gm-char-dex-base-input" class="gm-shop-char-input text-center" min="1" max="9999" style="max-width: 60px;">
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-dex-base-input', 1)">+1</button>
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-dex-base-input', 10)">+10</button>
                                            </div>
                                        </div>
                                        
                                        <div class="flex items-center justify-between mt-1">
                                            <span class="text-xs text-emerald-400 w-10">升級</span>
                                            <div class="gm-shop-char-input-row" style="flex:1; justify-content: flex-end;">
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-dex-alloc-input', -10)">-10</button>
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-dex-alloc-input', -1)">-1</button>
                                                <input type="number" id="gm-char-dex-alloc-input" class="gm-shop-char-input text-center" min="0" max="9999" style="max-width: 60px;">
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-dex-alloc-input', 1)">+1</button>
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-dex-alloc-input', 10)">+10</button>
                                            </div>
                                        </div>
                                        
                                        <div class="flex items-center justify-between mt-1">
                                            <span class="text-xs text-pink-400 w-10">萬能</span>
                                            <div class="gm-shop-char-input-row" style="flex:1; justify-content: flex-end;">
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-dex-panacea-input', -10)">-10</button>
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-dex-panacea-input', -1)">-1</button>
                                                <input type="number" id="gm-char-dex-panacea-input" class="gm-shop-char-input text-center" min="0" max="9999" style="max-width: 60px;">
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-dex-panacea-input', 1)">+1</button>
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-dex-panacea-input', 10)">+10</button>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- 體質 (CON) -->
                                    <div class="gm-shop-char-input-group" style="border-bottom: 1px dashed #334155; padding-bottom: 8px; margin-bottom: 8px;">
                                        <span class="gm-shop-control-label font-bold text-yellow-400 mb-2">體質 (CON)</span>
                                        
                                        <div class="flex items-center justify-between mt-1">
                                            <span class="text-xs text-slate-400 w-10">起始</span>
                                            <div class="gm-shop-char-input-row" style="flex:1; justify-content: flex-end;">
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-con-base-input', -10)">-10</button>
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-con-base-input', -1)">-1</button>
                                                <input type="number" id="gm-char-con-base-input" class="gm-shop-char-input text-center" min="1" max="9999" style="max-width: 60px;">
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-con-base-input', 1)">+1</button>
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-con-base-input', 10)">+10</button>
                                            </div>
                                        </div>
                                        
                                        <div class="flex items-center justify-between mt-1">
                                            <span class="text-xs text-emerald-400 w-10">升級</span>
                                            <div class="gm-shop-char-input-row" style="flex:1; justify-content: flex-end;">
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-con-alloc-input', -10)">-10</button>
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-con-alloc-input', -1)">-1</button>
                                                <input type="number" id="gm-char-con-alloc-input" class="gm-shop-char-input text-center" min="0" max="9999" style="max-width: 60px;">
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-con-alloc-input', 1)">+1</button>
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-con-alloc-input', 10)">+10</button>
                                            </div>
                                        </div>
                                        
                                        <div class="flex items-center justify-between mt-1">
                                            <span class="text-xs text-pink-400 w-10">萬能</span>
                                            <div class="gm-shop-char-input-row" style="flex:1; justify-content: flex-end;">
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-con-panacea-input', -10)">-10</button>
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-con-panacea-input', -1)">-1</button>
                                                <input type="number" id="gm-char-con-panacea-input" class="gm-shop-char-input text-center" min="0" max="9999" style="max-width: 60px;">
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-con-panacea-input', 1)">+1</button>
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-con-panacea-input', 10)">+10</button>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- 智力 (INT) -->
                                    <div class="gm-shop-char-input-group" style="border-bottom: 1px dashed #334155; padding-bottom: 8px; margin-bottom: 8px;">
                                        <span class="gm-shop-control-label font-bold text-yellow-400 mb-2">智力 (INT)</span>
                                        
                                        <div class="flex items-center justify-between mt-1">
                                            <span class="text-xs text-slate-400 w-10">起始</span>
                                            <div class="gm-shop-char-input-row" style="flex:1; justify-content: flex-end;">
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-int-base-input', -10)">-10</button>
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-int-base-input', -1)">-1</button>
                                                <input type="number" id="gm-char-int-base-input" class="gm-shop-char-input text-center" min="1" max="9999" style="max-width: 60px;">
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-int-base-input', 1)">+1</button>
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-int-base-input', 10)">+10</button>
                                            </div>
                                        </div>
                                        
                                        <div class="flex items-center justify-between mt-1">
                                            <span class="text-xs text-emerald-400 w-10">升級</span>
                                            <div class="gm-shop-char-input-row" style="flex:1; justify-content: flex-end;">
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-int-alloc-input', -10)">-10</button>
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-int-alloc-input', -1)">-1</button>
                                                <input type="number" id="gm-char-int-alloc-input" class="gm-shop-char-input text-center" min="0" max="9999" style="max-width: 60px;">
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-int-alloc-input', 1)">+1</button>
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-int-alloc-input', 10)">+10</button>
                                            </div>
                                        </div>
                                        
                                        <div class="flex items-center justify-between mt-1">
                                            <span class="text-xs text-pink-400 w-10">萬能</span>
                                            <div class="gm-shop-char-input-row" style="flex:1; justify-content: flex-end;">
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-int-panacea-input', -10)">-10</button>
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-int-panacea-input', -1)">-1</button>
                                                <input type="number" id="gm-char-int-panacea-input" class="gm-shop-char-input text-center" min="0" max="9999" style="max-width: 60px;">
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-int-panacea-input', 1)">+1</button>
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-int-panacea-input', 10)">+10</button>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- 精神 (WIS) -->
                                    <div class="gm-shop-char-input-group" style="border-bottom: 1px dashed #334155; padding-bottom: 8px; margin-bottom: 8px;">
                                        <span class="gm-shop-control-label font-bold text-yellow-400 mb-2">精神 (WIS)</span>
                                        
                                        <div class="flex items-center justify-between mt-1">
                                            <span class="text-xs text-slate-400 w-10">起始</span>
                                            <div class="gm-shop-char-input-row" style="flex:1; justify-content: flex-end;">
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-wis-base-input', -10)">-10</button>
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-wis-base-input', -1)">-1</button>
                                                <input type="number" id="gm-char-wis-base-input" class="gm-shop-char-input text-center" min="1" max="9999" style="max-width: 60px;">
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-wis-base-input', 1)">+1</button>
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-wis-base-input', 10)">+10</button>
                                            </div>
                                        </div>
                                        
                                        <div class="flex items-center justify-between mt-1">
                                            <span class="text-xs text-emerald-400 w-10">升級</span>
                                            <div class="gm-shop-char-input-row" style="flex:1; justify-content: flex-end;">
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-wis-alloc-input', -10)">-10</button>
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-wis-alloc-input', -1)">-1</button>
                                                <input type="number" id="gm-char-wis-alloc-input" class="gm-shop-char-input text-center" min="0" max="9999" style="max-width: 60px;">
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-wis-alloc-input', 1)">+1</button>
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-wis-alloc-input', 10)">+10</button>
                                            </div>
                                        </div>
                                        
                                        <div class="flex items-center justify-between mt-1">
                                            <span class="text-xs text-pink-400 w-10">萬能</span>
                                            <div class="gm-shop-char-input-row" style="flex:1; justify-content: flex-end;">
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-wis-panacea-input', -10)">-10</button>
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-wis-panacea-input', -1)">-1</button>
                                                <input type="number" id="gm-char-wis-panacea-input" class="gm-shop-char-input text-center" min="0" max="9999" style="max-width: 60px;">
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-wis-panacea-input', 1)">+1</button>
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-wis-panacea-input', 10)">+10</button>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- 魅力 (CHA) -->
                                    <div class="gm-shop-char-input-group" style="border-bottom: 1px dashed #334155; padding-bottom: 8px; margin-bottom: 8px;">
                                        <span class="gm-shop-control-label font-bold text-yellow-400 mb-2">魅力 (CHA)</span>
                                        
                                        <div class="flex items-center justify-between mt-1">
                                            <span class="text-xs text-slate-400 w-10">起始</span>
                                            <div class="gm-shop-char-input-row" style="flex:1; justify-content: flex-end;">
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-cha-base-input', -10)">-10</button>
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-cha-base-input', -1)">-1</button>
                                                <input type="number" id="gm-char-cha-base-input" class="gm-shop-char-input text-center" min="1" max="9999" style="max-width: 60px;">
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-cha-base-input', 1)">+1</button>
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-cha-base-input', 10)">+10</button>
                                            </div>
                                        </div>
                                        
                                        <div class="flex items-center justify-between mt-1">
                                            <span class="text-xs text-emerald-400 w-10">升級</span>
                                            <div class="gm-shop-char-input-row" style="flex:1; justify-content: flex-end;">
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-cha-alloc-input', -10)">-10</button>
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-cha-alloc-input', -1)">-1</button>
                                                <input type="number" id="gm-char-cha-alloc-input" class="gm-shop-char-input text-center" min="0" max="9999" style="max-width: 60px;">
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-cha-alloc-input', 1)">+1</button>
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-cha-alloc-input', 10)">+10</button>
                                            </div>
                                        </div>
                                        
                                        <div class="flex items-center justify-between mt-1">
                                            <span class="text-xs text-pink-400 w-10">萬能</span>
                                            <div class="gm-shop-char-input-row" style="flex:1; justify-content: flex-end;">
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-cha-panacea-input', -10)">-10</button>
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-cha-panacea-input', -1)">-1</button>
                                                <input type="number" id="gm-char-cha-panacea-input" class="gm-shop-char-input text-center" min="0" max="9999" style="max-width: 60px;">
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-cha-panacea-input', 1)">+1</button>
                                                <button class="gm-shop-char-btn-adj" onclick="adjustGMCharAttr('gm-char-cha-panacea-input', 10)">+10</button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                                                        <button class="gm-shop-char-save-btn" onclick="saveGMShopCharChanges()">💾 儲存並套用修改</button>
                        </div>
                    </div>

                    <!-- 寵物修改分頁 -->
                    <div id="gm-shop-tab-content-pet" class="gm-shop-tab-content" style="display: none;">
                        <div class="gm-shop-char-container" style="flex-direction: column !important; padding: 24px !important; overflow-y: auto !important; height: 100% !important; box-sizing: border-box !important;">
                            <div class="gm-shop-char-grid">
                                <!-- 第一欄：寵物測試功能 & 編輯 -->
                                <div class="flex flex-col gap-4">
                                    <!-- 寵物測試功能 -->
                                    <div class="gm-shop-char-section">
                                        <div class="gm-shop-char-section-title">🐾 寵物測試功能</div>
                                        <div class="flex flex-col gap-2">
                                            <button class="gm-shop-char-btn-adj py-2 text-center" style="width:100%" onclick="gmAddAllPets(30)">🐣 獲得常用寵物 (Lv.30 進化門檻)</button>
                                            <button class="gm-shop-char-btn-adj py-2 text-center" style="width:100%" onclick="gmAddAllPets(100)">🐉 獲得常用寵物 (Lv.100 頂級)</button>
                                            <div class="flex gap-2">
                                                <button class="gm-shop-char-btn-adj py-2 flex-1 text-center" onclick="gmSetAllPetsLevel(30)">➔ 全員設為 Lv.30</button>
                                                <button class="gm-shop-char-btn-adj py-2 flex-1 text-center" onclick="gmSetAllPetsLevel(100)">➔ 全員設為 Lv.100</button>
                                            </div>
                                            <button class="gm-shop-char-btn-adj py-2 text-center border border-red-900 bg-red-950/20 text-red-400" style="width:100%" onclick="gmClearAllPets()">🗑️ 清空所有寵物</button>
                                        </div>
                                    </div>

                                    <!-- 獲得特定寵物 -->
                                    <div class="gm-shop-char-section">
                                        <div class="gm-shop-char-section-title">🐾 獲得特定寵物</div>
                                        <div class="flex flex-col gap-2">
                                            <div class="gm-shop-char-input-row" style="margin-bottom: 4px;">
                                                <span class="gm-shop-control-label">選擇種類</span>
                                                <select id="gm-add-pet-form-select" class="gm-shop-select text-sm py-1" style="flex: 1; max-width: 140px;">
                                                    <!-- 動態生成 -->
                                                </select>
                                            </div>
                                            <div class="gm-shop-char-input-row" style="margin-bottom: 4px;">
                                                <span class="gm-shop-control-label">設定等級</span>
                                                <input type="number" id="gm-add-pet-lv-input" class="gm-shop-char-input text-sm" style="max-width: 80px;" value="30" min="1" max="999">
                                            </div>
                                            <button class="gm-shop-char-btn-adj py-2 text-center text-sky-300 font-bold bg-sky-950/20 border-sky-600 hover:bg-sky-900/40" style="width:100%" onclick="gmAddSinglePet()">➕ 新增此寵物至保管箱</button>
                                        </div>
                                    </div>

                                    <!-- 單一寵物編輯 -->
                                    <div class="gm-shop-char-section">
                                        <div class="gm-shop-char-section-title">🧬 單一寵物編輯</div>
                                        <div class="gm-shop-char-input-group">
                                            <span class="gm-shop-control-label">選擇要修改的寵物</span>
                                            <select id="gm-pet-select" class="gm-shop-select text-sm py-1.5" onchange="onGMPetSelectChange()">
                                                <option value="">-- 請選擇寵物 --</option>
                                            </select>
                                        </div>
                                        <div id="gm-pet-editor-fields" class="hidden flex flex-col gap-3 mt-2">
                                            <div class="gm-shop-char-input-group">
                                                <span class="gm-shop-control-label">寵物自訂名字</span>
                                                <input type="text" id="gm-pet-name-input" class="gm-shop-char-input" style="max-width:100%; text-align: left;">
                                            </div>
                                            <div class="gm-shop-char-input-group">
                                                <span class="gm-shop-control-label">型態 (種類)</span>
                                                <select id="gm-pet-form-select" class="gm-shop-select text-sm py-1.5">
                                                    <!-- 動態生成 -->
                                                </select>
                                            </div>
                                            <div class="flex gap-2">
                                                <div class="gm-shop-char-input-group flex-1">
                                                    <span class="gm-shop-control-label">等級 (Lv.)</span>
                                                    <input type="number" id="gm-pet-lvl-input" class="gm-shop-char-input text-center" min="1" max="999">
                                                </div>
                                                <div class="gm-shop-char-input-group flex-1">
                                                    <span class="gm-shop-control-label">HP 上限</span>
                                                    <input type="number" id="gm-pet-mhp-input" class="gm-shop-char-input text-center" min="1" max="9999999">
                                                </div>
                                                <div class="gm-shop-char-input-group flex-1">
                                                    <span class="gm-shop-control-label">MP 上限</span>
                                                    <input type="number" id="gm-pet-mmp-input" class="gm-shop-char-input text-center" min="0" max="9999999">
                                                </div>
                                            </div>
                                            <button class="gm-shop-char-save-btn py-2 text-center" style="width:100%; margin-top: 6px;" onclick="saveGMPetChanges()">💾 儲存寵物修改</button>
                                        </div>
                                    </div>
                                </div>

                                <!-- 第二欄：寵物能力限制說明 -->
                                <div class="gm-shop-char-section text-xs leading-relaxed text-slate-400 bg-slate-900/50 border-slate-800">
                                    <div class="gm-shop-char-section-title text-slate-300 font-bold" style="font-size: 13px;">💡 寵物能力限制說明</div>
                                    <ul class="list-disc pl-4 flex flex-col gap-1">
                                        <li><strong class="text-amber-400">等級上限：</strong>最高可修改至 <span class="text-amber-300">999</span> 級。</li>
                                        <li><strong class="text-amber-400">血量/魔力上限：</strong>無數值上限限制，輸入上限為 <span class="text-amber-300">9,999,999</span>。</li>
                                        <li><strong class="text-amber-400">迴避率 (ER)：</strong>物理型上限為 <span class="text-amber-300">25%</span>、特殊型為 <span class="text-amber-300">20%</span>、魔法型為 <span class="text-amber-300">15%</span>。</li>
                                        <li><strong class="text-amber-400">魔法防禦 (MR)：</strong>物理型上限為 <span class="text-amber-300">70%</span>、特殊型為 <span class="text-amber-300">95%</span> (黃金龍為 <span class="text-amber-300">110%</span>)、魔法型為 <span class="text-amber-300">120%</span>。</li>
                                        <li><strong class="text-amber-400">攻擊/防禦/減免：</strong>直接由等級公式與裝備累計，無硬上限。</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 收藏修改分頁 -->
                    <div id="gm-shop-tab-content-collect" class="gm-shop-tab-content" style="display: none;">
                        <div class="gm-shop-char-container" style="flex-direction: column !important; padding: 24px !important; overflow-y: auto !important; height: 100% !important; box-sizing: border-box !important;">
                            <div class="gm-shop-char-grid">
                                <!-- 第一欄：直接打開原版收藏冊進行編輯 -->
                                <div class="flex flex-col gap-4">
                                    <div class="gm-shop-char-section">
                                        <div class="gm-shop-char-section-title">📂 開啟原版收藏冊 (內含 GM 輔助模式)</div>
                                        <div class="grid grid-cols-2 gap-3">
                                            <button class="gm-shop-char-btn-adj py-3 text-center font-bold text-amber-300 bg-amber-950/20 border-amber-600 hover:bg-amber-900/40" style="width:100%" onclick="closeGMShop(); if(typeof openCardBook === 'function') openCardBook();">🎴 怪物卡片收藏</button>
                                            <button class="gm-shop-char-btn-adj py-3 text-center font-bold text-sky-300 bg-sky-950/20 border-sky-600 hover:bg-sky-900/40" style="width:100%" onclick="closeGMShop(); if(typeof openEquipBook === 'function') openEquipBook();">🗡️ 裝備圖鑑收藏</button>
                                            <button class="gm-shop-char-btn-adj py-3 text-center font-bold text-emerald-300 bg-emerald-950/20 border-emerald-600 hover:bg-emerald-900/40" style="width:100%" onclick="closeGMShop(); if(typeof openMiscBook === 'function') openMiscBook();">🧰 道具圖鑑收藏</button>
                                            <button class="gm-shop-char-btn-adj py-3 text-center font-bold text-purple-300 bg-purple-950/20 border-purple-600 hover:bg-purple-900/40" style="width:100%" onclick="closeGMShop(); if(typeof openRelicBook === 'function') openRelicBook();">🏺 遺物圖鑑收藏</button>
                                        </div>
                                    </div>
                                    
                                    <div class="gm-shop-char-section">
                                        <div class="gm-shop-char-section-title">🌟 一鍵全局修改</div>
                                        <div class="flex flex-col gap-2">
                                            <button class="gm-shop-char-btn-adj py-2.5 text-center font-bold text-yellow-300 bg-amber-950/40 border-amber-500 hover:bg-amber-900/60" style="width:100%" onclick="gmUnlockAllCollections()">✨ 完美解鎖全套「四類」收藏圖鑑</button>
                                            <button class="gm-shop-char-btn-adj py-2 text-center text-red-400 border border-red-950 bg-red-950/20 hover:bg-red-900/40" style="width:100%" onclick="gmClearAllCollections()">🗑️ 清空所有收藏圖鑑</button>
                                        </div>
                                    </div>
                                </div>

                                <!-- 第二欄：說明說明 -->
                                <div class="gm-shop-char-section text-xs leading-relaxed text-slate-400 bg-slate-900/50 border-slate-800">
                                    <div class="gm-shop-char-section-title text-slate-300 font-bold" style="font-size: 14px;">📝 GM 收藏冊輔助功能說明</div>
                                    <p class="mb-3 text-slate-300">我們已將 GM 編輯功能<b>完美注入至原版收藏冊介面</b>中！開啟任一收藏冊後，您將會看到頂部的紫色 <b>「🔧 GM 模式」</b> 控制列：</p>
                                    <ul class="list-disc pl-4 flex flex-col gap-2">
                                        <li><strong>點擊卡片解鎖/鎖定：</strong>勾選後，直接點擊收藏冊內的任何怪物卡片或裝備，即可瞬間將其解鎖或鎖定！</li>
                                        <li><strong>怪物卡片循環切換：</strong>怪物卡片點擊時會循環在 <span class="text-slate-500">未解鎖 ➔ 普卡 ➔ 銀卡 ➔ 金卡</span> 之間切換。</li>
                                        <li><strong>分區一鍵控制：</strong>可一鍵只解鎖本頁（如單手劍區、銀騎士村區），或一鍵清空本頁。</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            </div>
        `;

        modal.innerHTML = modalHtml;
        return modal;
    }

    // 6. UI 控制與修改處理函數
    window.switchGMShopTab = function (tab) {
        let shopTabBtn = document.getElementById('gm-shop-tab-btn-shop');
        let charTabBtn = document.getElementById('gm-shop-tab-btn-char');
        let petTabBtn = document.getElementById('gm-shop-tab-btn-pet');
        let collectTabBtn = document.getElementById('gm-shop-tab-btn-collect');
        let shopContent = document.getElementById('gm-shop-tab-content-shop');
        let charContent = document.getElementById('gm-shop-tab-content-char');
        let petContent = document.getElementById('gm-shop-tab-content-pet');
        let collectContent = document.getElementById('gm-shop-tab-content-collect');

        if (tab === 'shop') {
            if (shopTabBtn) shopTabBtn.classList.add('active');
            if (charTabBtn) charTabBtn.classList.remove('active');
            if (petTabBtn) petTabBtn.classList.remove('active');
            if (collectTabBtn) collectTabBtn.classList.remove('active');
            if (shopContent) shopContent.style.setProperty('display', 'flex', 'important');
            if (charContent) charContent.style.setProperty('display', 'none', 'important');
            if (petContent) petContent.style.setProperty('display', 'none', 'important');
            if (collectContent) collectContent.style.setProperty('display', 'none', 'important');
        } else if (tab === 'char') {
            if (shopTabBtn) shopTabBtn.classList.remove('active');
            if (charTabBtn) charTabBtn.classList.add('active');
            if (petTabBtn) petTabBtn.classList.remove('active');
            if (collectTabBtn) collectTabBtn.classList.remove('active');
            if (shopContent) shopContent.style.setProperty('display', 'none', 'important');
            if (charContent) charContent.style.setProperty('display', 'block', 'important');
            if (petContent) petContent.style.setProperty('display', 'none', 'important');
            if (collectContent) collectContent.style.setProperty('display', 'none', 'important');

            window.loadGMShopCharValues();
        } else if (tab === 'pet') {
            if (shopTabBtn) shopTabBtn.classList.remove('active');
            if (charTabBtn) charTabBtn.classList.remove('active');
            if (petTabBtn) petTabBtn.classList.add('active');
            if (collectTabBtn) collectTabBtn.classList.remove('active');
            if (shopContent) shopContent.style.setProperty('display', 'none', 'important');
            if (charContent) charContent.style.setProperty('display', 'none', 'important');
            if (petContent) petContent.style.setProperty('display', 'block', 'important');
            if (collectContent) collectContent.style.setProperty('display', 'none', 'important');

            window.loadGMShopCharValues();
        } else if (tab === 'collect') {
            if (shopTabBtn) shopTabBtn.classList.remove('active');
            if (charTabBtn) charTabBtn.classList.remove('active');
            if (petTabBtn) petTabBtn.classList.remove('active');
            if (collectTabBtn) collectTabBtn.classList.add('active');
            if (shopContent) shopContent.style.setProperty('display', 'none', 'important');
            if (charContent) charContent.style.setProperty('display', 'none', 'important');
            if (petContent) petContent.style.setProperty('display', 'none', 'important');
            if (collectContent) collectContent.style.setProperty('display', 'block', 'important');

            window.loadGMShopCharValues();
        }
    };

    window.loadGMShopCharValues = function () {
        if (typeof player === 'undefined' || !player) return;

        let goldInput = document.getElementById('gm-char-gold-input');
        let lvlInput = document.getElementById('gm-char-lvl-input');
        let bonusInput = document.getElementById('gm-char-bonus-input');

        if (goldInput) goldInput.value = player.gold || 0;
        if (lvlInput) lvlInput.value = player.lv || 1;
        if (bonusInput) bonusInput.value = player.bonus || 0;

        const stats = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
        stats.forEach(st => {
            let bInput = document.getElementById('gm-char-' + st + '-base-input');
            let aInput = document.getElementById('gm-char-' + st + '-alloc-input');
            let pInput = document.getElementById('gm-char-' + st + '-panacea-input');

            if (bInput) bInput.value = (player.base && player.base[st]) ? player.base[st] : 0;
            if (aInput) aInput.value = (player.alloc && player.alloc[st]) ? player.alloc[st] : 0;
            if (pInput) pInput.value = (player.panacea && player.panacea[st]) ? player.panacea[st] : 0;
        });

        // 🐾 GM 測試：載入/刷新寵物編輯列表
        let petSel = document.getElementById('gm-pet-select');
        if (petSel) {
            let list = [];
            try { list = petRoster(); } catch(e) {}
            let html = '<option value="">-- 請選擇寵物 --</option>';
            list.forEach(p => {
                let disp = (p.name ? p.name + ' ' : '') + `(${p.form}) Lv.${p.lv}`;
                html += `<option value="${p.uid}">${disp}</option>`;
            });
            petSel.innerHTML = html;
            
            // 預設隱藏編輯欄位
            let fields = document.getElementById('gm-pet-editor-fields');
            if (fields) fields.classList.add('hidden');
        }
        
        let formSel = document.getElementById('gm-pet-form-select');
        if (formSel && formSel.options.length <= 1) {
            let html = '';
            if (typeof PET_BOOK !== 'undefined') {
                Object.keys(PET_BOOK).forEach(k => {
                    html += `<option value="${k}">${k}</option>`;
                });
            }
            formSel.innerHTML = html;
        }

        let addFormSel = document.getElementById('gm-add-pet-form-select');
        if (addFormSel && addFormSel.options.length <= 1) {
            let html = '';
            if (typeof PET_BOOK !== 'undefined') {
                Object.keys(PET_BOOK).forEach(k => {
                    html += `<option value="${k}">${k}</option>`;
                });
            }
            addFormSel.innerHTML = html;
        }
    };

    window.onGMPetSelectChange = function () {
        let petSel = document.getElementById('gm-pet-select');
        let fields = document.getElementById('gm-pet-editor-fields');
        if (!petSel || !fields) return;
        
        let uid = petSel.value;
        if (!uid) {
            fields.classList.add('hidden');
            return;
        }
        
        let p = petRoster().find(x => x.uid === uid);
        if (!p) {
            fields.classList.add('hidden');
            return;
        }
        
        fields.classList.remove('hidden');
        
        let nameInp = document.getElementById('gm-pet-name-input');
        let formSel = document.getElementById('gm-pet-form-select');
        let lvlInp = document.getElementById('gm-pet-lvl-input');
        let mhpInp = document.getElementById('gm-pet-mhp-input');
        let mmpInp = document.getElementById('gm-pet-mmp-input');
        
        if (nameInp) nameInp.value = p.name || '';
        if (formSel) formSel.value = p.form;
        if (lvlInp) lvlInp.value = p.lv || 1;
        if (mhpInp) mhpInp.value = p.mhp || 1;
        if (mmpInp) mmpInp.value = p.mmp || 0;
    };

    window.saveGMPetChanges = function () {
        let petSel = document.getElementById('gm-pet-select');
        if (!petSel || !petSel.value) return;
        
        let uid = petSel.value;
        let p = petRoster().find(x => x.uid === uid);
        if (!p) return;
        
        let nameInp = document.getElementById('gm-pet-name-input');
        let formSel = document.getElementById('gm-pet-form-select');
        let lvlInp = document.getElementById('gm-pet-lvl-input');
        let mhpInp = document.getElementById('gm-pet-mhp-input');
        let mmpInp = document.getElementById('gm-pet-mmp-input');
        
        let nameVal = nameInp ? nameInp.value.trim() : '';
        let formVal = formSel ? formSel.value : p.form;
        let lvlVal = lvlInp ? parseInt(lvlInp.value) : p.lv;
        let mhpVal = mhpInp ? parseInt(mhpInp.value) : p.mhp;
        let mmpVal = mmpInp ? parseInt(mmpInp.value) : p.mmp;
        
        if (isNaN(lvlVal) || lvlVal < 1 || lvlVal > 999) {
            alert("請輸入 1 到 999 之間的有效等級！");
            return;
        }
        if (isNaN(mhpVal) || mhpVal < 1) {
            alert("血量上限必須大於 0！");
            return;
        }
        if (isNaN(mmpVal) || mmpVal < 0) {
            alert("魔力上限必須大於或等於 0！");
            return;
        }
        
        let snap = _petMutationSnapshot();
        p.name = nameVal;
        p.form = formVal;
        p.lv = lvlVal;
        p.mhp = mhpVal;
        p.mmp = mmpVal;
        p.hp = Math.min(p.hp, p.mhp);
        p.mp = Math.min(p.mp, p.mmp);
        
        petMarkDirty();
        if (petRosterSave()) {
            if (typeof logSys === 'function') logSys(`<span class="text-green-300 font-bold">🐾 GM 測試：成功更新寵物 ${formVal} (${uid}) 的屬性資料！</span>`);
            
            // 重新加載並更新選單
            window.loadGMShopCharValues();
            
            if (typeof updateUI === 'function') updateUI();
            if (typeof renderTabs === 'function') renderTabs(true);
            let _d = document.getElementById('interaction-content');
            if (_d && _d.querySelector('[data-petui]')) renderPetStorageNPC(_d);
            
            if (typeof showToast === 'function') {
                showToast("寵物修改成功！", 'success');
            }
        } else {
            _petMutationRestore(snap);
            alert("儲存寵物修改失敗！");
        }
    };

    window.adjustGMCharAttr = function (id, amount) {
        let input = document.getElementById(id);
        if (!input) return;
        let val = parseInt(input.value) || 0;
        val += amount;
        let min = (id === 'gm-char-lvl-input' || id.includes('base-input')) ? 1 : 0;
        let max = (id === 'gm-char-lvl-input') ? 999 : (id === 'gm-char-gold-input' ? 999999999999 : 9999);

        if (val < min) val = min;
        if (val > max) val = max;
        input.value = val;
    };

    window.saveGMShopCharChanges = function () {
        if (typeof player === 'undefined' || !player) return;

        let goldVal = parseInt(document.getElementById('gm-char-gold-input').value);
        let lvlVal = parseInt(document.getElementById('gm-char-lvl-input').value);
        let bonusVal = parseInt(document.getElementById('gm-char-bonus-input').value);

        if (isNaN(goldVal) || goldVal < 0 || goldVal > 999999999999) {
            alert("請輸入有效的金幣數量 (0 ~ 999,999,999,999)！");
            return;
        }
        if (isNaN(lvlVal) || lvlVal < 1 || lvlVal > 999) {
            alert("請輸入有效的等級 (1 ~ 999)！");
            return;
        }
        if (isNaN(bonusVal) || bonusVal < 0) bonusVal = 0;

        const stats = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
        let baseVals = {}, allocVals = {}, panaceaVals = {};

        let valid = true;
        stats.forEach(st => {
            baseVals[st] = parseInt(document.getElementById('gm-char-' + st + '-base-input').value) || 0;
            allocVals[st] = parseInt(document.getElementById('gm-char-' + st + '-alloc-input').value) || 0;
            panaceaVals[st] = parseInt(document.getElementById('gm-char-' + st + '-panacea-input').value) || 0;

            if (baseVals[st] < 1 || allocVals[st] < 0 || panaceaVals[st] < 0) valid = false;
        });

        if (!valid) {
            alert("屬性數值不能小於 0 (起始屬性不能小於 1)！");
            return;
        }

        // 套用修改
        player.gold = goldVal;

        let oldLv = player.lv || 1;
        player.lv = lvlVal;
        player.exp = 0; // 重置經驗值為 0

        // 根據等級變化自動補償或扣除「未分配點數」
        let diff = Math.max(0, lvlVal - 49) - Math.max(0, oldLv - 49);
        player.bonus = Math.max(0, bonusVal + diff);

        if (!player.base) player.base = {};
        if (!player.alloc) player.alloc = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
        if (!player.panacea) player.panacea = {};

        stats.forEach(st => {
            player.base[st] = baseVals[st];
            player.alloc[st] = allocVals[st];
            player.panacea[st] = panaceaVals[st];
        });

        // 🔧 同步更新萬能藥已使用總量計數，以相容回憶蠟燭退還機制
        let totalUsed = 0;
        stats.forEach(st => {
            totalUsed += (player.panacea[st] || 0);
        });
        player.panaceaUsed = totalUsed;

        // 重新計算屬性與 UI 刷新
        if (typeof calcStats === 'function') calcStats();
        if (typeof updateUI === 'function') updateUI();
        if (typeof saveGame === 'function') saveGame();

        // 更新 GM 商店金幣顯示
        let goldDisplay = document.getElementById('gm-shop-player-gold');
        if (goldDisplay) goldDisplay.innerText = player.gold.toLocaleString();

        if (typeof showToast === 'function') {
            showToast("角色數值與資產已成功修改並儲存！", 'success');
        } else {
            alert("角色數值與資產修改成功！");
        }
    };

    window.openGMShop = function () {
        if (typeof player === 'undefined' || !player || !player.cls) {
            if (typeof logSys === 'function') {
                logSys('<span class="text-red-400 font-bold">【系統】請先載入或建立角色存檔後，再使用 GM 商店！</span>');
            } else {
                alert('請先載入或建立角色存檔後，再使用 GM 商店！');
            }
            return;
        }
        let modal = document.getElementById('klh-gm-shop-modal');
        if (!modal) {
            modal = createGMShopModal();
            document.body.appendChild(modal);

            // 點擊背景關閉
            modal.addEventListener('click', function (e) {
                if (e.target === modal) {
                    closeGMShop();
                }
            });
        }

        // 更新資訊
        document.getElementById('gm-shop-player-gold').innerText = (player.gold || 0).toLocaleString();
        if (player.d) {
            let loadTier = player.d.loadTier || 0;
            let loadColor = (typeof getLoadColor === 'function') ? getLoadColor(loadTier) : 'text-white';
            let weightPct = player.d.weightPct || 0;
            document.getElementById('gm-shop-player-inv').innerHTML = `<span class="${loadColor} font-bold">${weightPct}%</span>`;
        }

        // 重新繪製商品
        renderGMShopGrid();
        modal.classList.add('open');
    };

    window.closeGMShop = function () {
        let modal = document.getElementById('klh-gm-shop-modal');
        if (modal) {
            modal.classList.remove('open');
        }
    };

    window.onGMEnhanceSelectChange = function () {
        let sel = document.getElementById('gm-enhance-select');
        let customInput = document.getElementById('gm-enhance-custom-input');
        if (sel) {
            if (sel.value === 'custom') {
                customInput.classList.remove('hidden');
            } else {
                customInput.classList.add('hidden');
            }
        }
        onGMShopOptionChange();
    };

    window.onGMShopOptionChange = function () {
        window.gmShopCurrentPage = 1;
        renderGMShopGrid();
    };

    window.onGMShopSearchInput = function (val) {
        window.gmShopSearchQuery = val;
        window.gmShopCurrentPage = 1;
        renderGMShopGrid();
    };

    window.setGMShopMainCategory = function (cat) {
        window.gmShopMainCategory = cat;
        window.gmShopSubCategory = 'all';
        window.gmShopCurrentPage = 1;

        // 同步主分類下拉選單
        let mainSel = document.getElementById('gm-main-cat-select');
        if (mainSel) mainSel.value = cat;

        // 動態處理子分類下拉選單
        let subSel = document.getElementById('gm-sub-cat-select');
        if (subSel) {
            if (cat === 'wpn') {
                subSel.style.display = 'block';
                subSel.innerHTML = `
                    <option value="all">全部武器</option>
                    <option value="onehand">單手近戰</option>
                    <option value="twohand">雙手近戰</option>
                    <option value="bow">弓弩</option>
                    <option value="wand">魔杖/法杖</option>
                `;
            } else if (cat === 'arm') {
                subSel.style.display = 'block';
                subSel.innerHTML = `
                    <option value="all">全部部位</option>
                    <option value="helm">頭盔</option>
                    <option value="tshirt">T恤</option>
                    <option value="armor">盔甲</option>
                    <option value="shield">盾牌</option>
                    <option value="gloves">手套</option>
                    <option value="boots">靴子</option>
                    <option value="cloak">斗篷</option>
                    <option value="petarm">寵物防具</option>
                `;
            } else if (cat === 'acc') {
                subSel.style.display = 'block';
                subSel.innerHTML = `
                    <option value="all">全部部位</option>
                    <option value="amulet">項鍊</option>
                    <option value="ring">戒指</option>
                    <option value="belt">腰帶</option>
                    <option value="petwpn">寵物武器</option>
                    <option value="remains">席琳遺骸</option>
                `;
            } else if (cat === 'relic') {
                subSel.style.display = 'block';
                subSel.innerHTML = `
                    <option value="all">全部遺物</option>
                    <option value="wpn">遺物武器</option>
                    <option value="arm">遺物防具</option>
                    <option value="acc">遺物飾品</option>
                `;
            } else if (cat === 'scroll') {
                subSel.style.display = 'block';
                subSel.innerHTML = `
                    <option value="all">全部卷軸</option>
                    <option value="enchant">強化卷軸</option>
                    <option value="utility">一般/變卷</option>
                `;
            } else if (cat === 'skillbk') {
                subSel.style.display = 'block';
                subSel.innerHTML = `
                    <option value="all">全部魔法書</option>
                    <option value="general">一般魔法書</option>
                    <option value="elf">精靈水晶</option>
                    <option value="darkelf">精靈水晶(黑妖)</option>
                    <option value="knight">技術書/其他</option>
                `;
            } else if (cat === 'etc') {
                subSel.style.display = 'block';
                subSel.innerHTML = `
                    <option value="all">全部雜項</option>
                    <option value="potion">藥水/消耗品</option>
                    <option value="material">核心材料/結晶</option>
                    <option value="pet">寵物/進化果實</option>
                    <option value="talisman">傲塔傳送/支配符</option>
                    <option value="other">其他雜項</option>
                `;
            } else if (cat === 'card') {
                subSel.style.display = 'block';
                subSel.innerHTML = `
                    <option value="all">全部卡片</option>
                    <option value="tier1">普卡</option>
                    <option value="tier2">銀卡</option>
                    <option value="tier3">金卡</option>
                    <option value="book">收集冊/其他</option>
                `;
            } else if (cat === 'doll') {
                subSel.style.display = 'block';
                subSel.innerHTML = `
                    <option value="all">全部娃娃</option>
                    <option value="tier1">一階娃娃</option>
                    <option value="tier2">二階娃娃</option>
                    <option value="tier3">三階娃娃</option>
                    <option value="tier4">四階娃娃</option>
                    <option value="tier5">五階娃娃</option>
                    <option value="tier6">六階娃娃</option>
                `;
            } else {
                subSel.style.display = 'none';
                subSel.innerHTML = `<option value="all">全部部位</option>`;
            }
            subSel.value = 'all';
        }

        renderGMShopGrid();
    };

    window.setGMShopSubCategory = function (subCat) {
        window.gmShopSubCategory = subCat;
        let subSel = document.getElementById('gm-sub-cat-select');
        if (subSel) subSel.value = subCat;
        window.gmShopCurrentPage = 1;
        renderGMShopGrid();
    };

    // 檢查按鈕顯示狀態的函式 (優化版：快取 DOM 狀態與狀態比對，避免重複修改 DOM 造成 CPU 升溫與卡頓)
    function checkGMShopBtnVisibility() {
        let btn = document.getElementById('klh-gm-shop-btn');
        if (!btn) return;

        let hasPlayer = !!(typeof player !== 'undefined' && player && player.cls);
        if (lastBtnState !== hasPlayer) {
            btn.style.setProperty('display', hasPlayer ? 'flex' : 'none', 'important');
            lastBtnState = hasPlayer;
        }

        // 額外支援：若載入了 GM 商店，僅在有標籤文字時移除 jsonblob 底部 Hella 與 Zeus 按鈕的 "🔒固定" 標籤
        let hTag = document.getElementById('lock-hella-tag');
        let zTag = document.getElementById('lock-zeus-tag');
        if (hTag && hTag.innerText !== '') hTag.innerText = '';
        if (zTag && zTag.innerText !== '') zTag.innerText = '';

        // 強制解鎖清除所有存檔按鈕的顯示狀態，僅在顯示被隱藏時才重設，避免頻繁寫入 style
        let clearAllBtn = document.getElementById('btn-clear-all');
        if (clearAllBtn && clearAllBtn.style.display !== '') {
            clearAllBtn.style.setProperty('display', '', 'important');
        }
    }

    // 繞過 jsonblob.js 的特權限制（解除存檔鎖定與覆蓋限制）
    function bypassJsonBlobRestrictions() {
        // 1. 覆寫 window.clearAllSaves 繞過 checkIsPrivileged 檢查
        if (typeof window.clearAllSaves === 'function' && !window.clearAllSaves.isBypassedByGMShop) {
            window.clearAllSaves = function () {
                if (!confirm('確定要清除所有存檔嗎？此動作將無法復原。')) return;

                for (let n = 1; n <= 4; n++) {
                    localStorage.removeItem('lineage_idle_save_' + n);
                    localStorage.removeItem('lineage_idle_save_' + n + '_bak');
                }
                localStorage.removeItem('lineage_idle_warehouse');

                if (typeof checkAndPrepopulateSlots === 'function') {
                    checkAndPrepopulateSlots();
                } else if (typeof window.checkAndPrepopulateSlots === 'function') {
                    window.checkAndPrepopulateSlots();
                }

                if (typeof uploadToCloud === 'function') {
                    uploadToCloud(false, true);
                } else if (typeof window.uploadToCloud === 'function') {
                    window.uploadToCloud(false, true);
                }

                if (typeof openSlotSelect === 'function') {
                    openSlotSelect(window._slotMode || 'load');
                } else if (typeof window.openSlotSelect === 'function') {
                    window.openSlotSelect(window._slotMode || 'load');
                }

                if (typeof showToast === 'function') {
                    showToast('已成功清除所有存檔，並自動為您初始化存檔位 1-3！', 'success');
                } else if (typeof window.showToast === 'function') {
                    window.showToast('已成功清除所有存檔，並自動為您初始化存檔位 1-3！', 'success');
                }
            };
            window.clearAllSaves.isBypassedByGMShop = true;
        }

        // 2. 覆寫 window.chooseSlot 繞過 checkIsPrivileged 檢查
        if (typeof window.chooseSlot === 'function' && !window.chooseSlot.isBypassedByGMShop) {
            window.chooseSlot = function (n) {
                const mode = window._slotMode || (typeof window._slotMode !== 'undefined' ? window._slotMode : 'new');
                if (mode === 'load') {
                    currentSlot = n;
                    if (typeof loadGame === 'function') {
                        loadGame();
                    } else if (typeof window.loadGame === 'function') {
                        window.loadGame();
                    }
                    return;
                }

                // 創角模式 (new) —— 直接跳過 checkIsPrivileged() 檢查
                let sum = null;
                if (typeof slotSummary === 'function') {
                    sum = slotSummary(n);
                } else if (typeof window.slotSummary === 'function') {
                    sum = window.slotSummary(n);
                }

                if (sum && !confirm(`存檔 ${n} 已有角色（${sum.cls} Lv.${sum.lv} ${sum.name}），確定覆蓋並重新創角？`)) return;

                currentSlot = n;
                const panel = document.getElementById('slot-select-panel');
                if (panel) panel.classList.add('hidden');

                if (typeof showCreation === 'function') {
                    showCreation();
                } else if (typeof window.showCreation === 'function') {
                    window.showCreation();
                }
            };
            window.chooseSlot.isBypassedByGMShop = true;
        }

        // 3. Hook window.openSlotSelect 以在開啟選檔畫面時強制解鎖
        if (typeof window.openSlotSelect === 'function' && !window.openSlotSelect.isBypassedByGMShop) {
            const originalOpenSlotSelect = window.openSlotSelect;
            window.openSlotSelect = function (mode) {
                originalOpenSlotSelect(mode);

                // 強制顯示清除所有存檔按鈕，並移除🔒固定
                const clearAllBtn = document.getElementById('btn-clear-all');
                if (clearAllBtn) {
                    clearAllBtn.style.setProperty('display', '', 'important');
                }
                const hTag = document.getElementById('lock-hella-tag');
                const zTag = document.getElementById('lock-zeus-tag');
                if (hTag) hTag.innerText = '';
                if (zTag) zTag.innerText = '';
            };
            window.openSlotSelect.isBypassedByGMShop = true;
        }

        // 4. 立即嘗試更新現有的 UI 元件
        const clearAllBtn = document.getElementById('btn-clear-all');
        if (clearAllBtn) {
            clearAllBtn.style.setProperty('display', '', 'important');
        }
        const hTag = document.getElementById('lock-hella-tag');
        const zTag = document.getElementById('lock-zeus-tag');
        if (hTag) hTag.innerText = '';
        if (zTag) zTag.innerText = '';
    }

    // 7. 初始化外掛
    function startupGMShop() {
        if (typeof DB === 'undefined' || !DB.items) return;

        injectStyles();
        setupGMBookOverlays();

        // 🌟 開啟 GMShop 時，直接覆寫短劍與木棒為測試超高數值
        let dagger = DB.items["wpn_shortsword"];
        if (dagger) {
            dagger.dmgS = 3000;
            dagger.dmgL = 4000;
            dagger.hit = 1000;
            dagger.spd = 0.2;
            dagger.safe = 1000;
            console.log("[klh_GMShop] GM 商店已啟動，已覆寫開發者測試短劍數值。");
        }
        let club = DB.items["wpn_10"];
        if (club) {
            club.dmgS = 30000;
            club.dmgL = 40000;
            club.hit = 1000;
            club.spd = 0.1;
            club.safe = 1000;
            console.log("[klh_GMShop] GM 商店已啟動，已覆寫開發者測試木棒數值。");
        }

        // 繞過新版「職業性別×武器種類」攻速表，將持有超強短劍的基礎間隔設為 0.2 秒，超強木棒設為 0.1 秒
        if (typeof window.atkSpdBaseItv === 'function' && !window.atkSpdBaseItv.isHookedByGMShop) {
            const originalAtkSpdBaseItv = window.atkSpdBaseItv;
            window.atkSpdBaseItv = function (p) {
                if (p && p.eq && p.eq.wpn) {
                    if (p.eq.wpn.id === 'wpn_shortsword') return 0.2;
                    if (p.eq.wpn.id === 'wpn_10') return 0.1;
                }
                return originalAtkSpdBaseItv(p);
            };
            window.atkSpdBaseItv.isHookedByGMShop = true;
        }

        // 注入按鈕
        if (!document.getElementById('klh-gm-shop-btn')) {
            let btn = document.createElement('div');
            btn.id = 'klh-gm-shop-btn';
            btn.className = 'gm-shop-btn';
            btn.innerHTML = '🛍️ GM 商店';
            btn.onclick = openGMShop;
            document.body.appendChild(btn);
        }

        // 繞過特權金鑰與存檔鎖定限制
        bypassJsonBlobRestrictions();

        // 立即檢查一次顯示狀態
        checkGMShopBtnVisibility();

        // 定時器雙重保險：每秒檢查一次是否載入存檔或新建角色
        setInterval(checkGMShopBtnVisibility, 1000);

        // Hook 遊戲原生的 updateUI
        if (typeof window.updateUI === 'function' && !window.updateUI.isHookedByGMShop) {
            const originalUpdateUI = window.updateUI;
            window.updateUI = function (...args) {
                originalUpdateUI.apply(this, args);
                checkGMShopBtnVisibility();
            };
            window.updateUI.isHookedByGMShop = true;
        }
    }

    document.addEventListener('DOMContentLoaded', startupGMShop);
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
        startupGMShop();
    }
})();
