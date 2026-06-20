/* ============================================================================
 * klh_GMShop.js — GM 裝備批發商店系統
 *
 * 設計原則: 完全不改原作者程式碼，自定義浮動按鈕與玻璃摩砂 (Glassmorphism) 大視窗。
 * 掛接方式: 在 index.html 的 </body> 標籤正上方，插入以下外掛腳本：
 * * <script src="klh_GMShop.js?v=20260618"></script>
 *
 * 功能一覽:
 *   1. 浮動按鈕注入   —— 注入一個位於畫面右下角（自適應）的 GM 裝備商店開啟按鈕。
 *   2. 玻璃摩砂大視窗 —— 提供一個現代、極致奢華的半透明裝備展示與購買介面。
 *   3. 裝備全抓取     —— 自動從 DB.items 抓取所有 wpn (排除箭矢) / arm / acc 等裝備。
 *   4. 搜尋與分頁過濾 —— 支援即時關鍵字搜尋、類別標籤切換（全部 / 武器 / 防具 / 飾品）。
 *   5. GM 專屬購買設定 ——
 *        - 自訂強化等級 (+0 ~ +15 或更大數值)。
 *        - 自訂祝福狀態（無 / 祝福 / 詛咒 / 隨機）。
 *        - 自訂遠古詞綴（無 / 遠古 / 永恆 / 不朽 / 太初 / 隨機）。
 *        - 自訂屬性詞綴（無 / 隨機 / 爆炎 / 地靈 ... 等 12 種屬性）。
 *        - 自訂席琳套裝（無 / 隨機 / 麗人的加護 / 暗影的忠誠 ... 等 45 種套裝效果）。
 *   6. 實時名稱與光圈預覽 —— 修改任何購買選項時，商店內所有裝備的名稱、顏色與光暈特效會實時同步更新預覽。
 *   7. 雙價格模式     —— 支援「金幣購買（原價）」與「GM 免費獲得（0 金幣）」。
 * ========================================================================== */

(function () {
    const equipments = [];
    window.gmShopMainCategory = 'all';
    window.gmShopSubCategory = 'all';
    window.gmShopSearchQuery = '';

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

            /* 手機適應調整 */
            @media (max-width: 768px) {
                .gm-shop-container {
                    height: 95vh !important;
                    width: 98vw !important;
                }
                .gm-shop-body {
                    flex-direction: column !important;
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
                    let isPet = item.id.includes('pet') || (item.n && (item.n.includes('果實') || item.n.includes('寵物') || item.n.includes('進化')));
                    let isMaterial = item.type === 'material' || item.id.startsWith('mat_') || item.id.includes('crystal') || (item.n && (item.n.includes('材料') || item.n.includes('結晶') || item.n.includes('礦石') || item.n.includes('皮革') || item.n.includes('骨頭') || item.n.includes('布料')));
                    let isOther = !isPotion && !isPet && !isMaterial;

                    if (subCat === 'potion' && !isPotion) return false;
                    if (subCat === 'pet' && !isPet) return false;
                    if (subCat === 'material' && !isMaterial) return false;
                    if (subCat === 'other' && !isOther) return false;
                } else {
                    if (item.slot !== subCat) return false;
                }
            }

            // 3. 搜尋過濾
            if (search && !item.n.toLowerCase().includes(search)) return false;
            return true;
        });

        // 渲染卡片
        let html = '';
        filtered.forEach(eq => {
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
    };

    // 4. 購買裝備邏輯
    window.buyGMShopItem = function (id) {
        let opts = getGMShopSelectedOptions();
        let d = DB.items[id];
        if (!d) return;

        let isEquip = d.type === 'wpn' || d.type === 'arm' || d.type === 'acc';
        let buyQty = 1;

        if (!isEquip) {
            let inputQty = prompt(`請輸入購買數量 (${d.n})：`, "100");
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
        player.lv = val;
        player.exp = 0; // 重置經驗值為 0
        
        // 重新計算屬性與 UI 刷新
        if (typeof calcStats === 'function') calcStats();
        if (typeof updateUI === 'function') updateUI();
        if (typeof saveGame === 'function') saveGame();
        
        if (typeof showToast === 'function') {
            showToast(`等級已成功修改為 Lv.${val}`, 'success');
        }
    };

    // 5. 創建大視窗 DOM
    function createGMShopModal() {
        // 抓取所有商品 (只執行一次)
        if (equipments.length === 0) {
            for (let id in DB.items) {
                let item = DB.items[id];
                if (!item) continue;

                // 1. 裝備類 (武器/防具/飾品)
                if (item.type === 'wpn' || item.type === 'arm' || item.type === 'acc') {
                    if (item.isArrow) continue;
                    equipments.push({ id: id, ...item });
                }
                // 2. 卷軸類
                else if (item.type === 'scroll' || id.startsWith('scroll_') || id.includes('bless') || id.includes('uncurse') || (item.n && item.n.includes('卷軸'))) {
                    equipments.push({ id: id, ...item, type: 'scroll' });
                }
                // 3. 魔法書類
                else if (item.type === 'skillbk' || id.startsWith('bk_') || (item.n && (item.n.includes('技術書') || item.n.includes('魔法書') || item.n.includes('精靈水晶')))) {
                    equipments.push({ id: id, ...item, type: 'skillbk' });
                }
                // 4. 其他所有物品（包含藥水、材料、果實、結晶等等雜項）一律歸入 etc
                else {
                    equipments.push({ id: id, ...item, type: 'etc' });
                }
            }
            // 排序: 武器 -> 防具 -> 飾品 -> 卷軸 -> 魔法書 -> 材料其他 (內部以售價排序)
            equipments.sort((a, b) => {
                const typeOrder = { wpn: 1, arm: 2, acc: 3, scroll: 4, skillbk: 5, etc: 6 };
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
                    <div class="gm-shop-title">🛍️ GM 裝備批發商店</div>
                    <button class="gm-shop-close-btn" onclick="closeGMShop()">&times;</button>
                </div>
                <div class="gm-shop-body">
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
                                    ${[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20].map(v => `<option value="${v}">+${v}</option>`).join('')}
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
                        
                        <!-- GM 數值修改區 -->
                        <div class="border-t border-slate-800 pt-3 flex flex-col gap-2 mt-auto">
                            <span class="gm-shop-control-label">GM 快捷修改</span>
                            <div class="flex gap-1.5">
                                <input type="number" id="gm-gold-input" class="gm-shop-search-input" style="height: 30px !important; padding: 2px 6px !important; font-size: 13px !important; flex: 1; min-width: 50px;" placeholder="設定金幣">
                                <button class="gm-shop-buy-btn" style="padding: 2px 8px !important; font-size: 11px !important; white-space: nowrap;" onclick="modifyGMGold()">改金幣</button>
                            </div>
                            <div class="flex gap-1.5">
                                <input type="number" id="gm-lvl-input" class="gm-shop-search-input" style="height: 30px !important; padding: 2px 6px !important; font-size: 13px !important; flex: 1; min-width: 50px;" placeholder="設定等級">
                                <button class="gm-shop-buy-btn" style="padding: 2px 8px !important; font-size: 11px !important; white-space: nowrap;" onclick="modifyGMLevel()">改等級</button>
                            </div>
                        </div>
                        
                        <!-- 玩家資產與負重 -->
                        <div class="border-t border-slate-800 pt-3 flex flex-col gap-2" id="gm-ctrl-assets">
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
                                <option value="scroll">卷軸</option>
                                <option value="skillbk">魔法書</option>
                                <option value="etc">材料其他</option>
                            </select>
                            
                            <!-- 子分類選擇 (預設隱藏) -->
                            <select id="gm-sub-cat-select" class="gm-shop-select" style="width: 105px !important; flex-shrink: 0 !important; padding: 6px 8px !important; height: 38px !important; line-height: 1.2 !important; display: none;" onchange="setGMShopSubCategory(this.value)">
                                <option value="all">全部部位</option>
                            </select>
                        </div>
                        
                        <!-- 裝備網格 -->
                        <div class="gm-shop-grid" id="gm-shop-grid-container"></div>
                    </div>
                </div>
            </div>
        `;

        modal.innerHTML = modalHtml;
        return modal;
    }

    // 6. UI 控制響應函數
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
        renderGMShopGrid();
    };

    window.onGMShopSearchInput = function (val) {
        window.gmShopSearchQuery = val;
        renderGMShopGrid();
    };

    window.setGMShopMainCategory = function (cat) {
        window.gmShopMainCategory = cat;
        window.gmShopSubCategory = 'all';

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
                `;
            } else if (cat === 'acc') {
                subSel.style.display = 'block';
                subSel.innerHTML = `
                    <option value="all">全部部位</option>
                    <option value="amulet">項鍊</option>
                    <option value="ring">戒指</option>
                    <option value="belt">腰帶</option>
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
                    <option value="all">全部材料與雜項</option>
                    <option value="potion">藥水類</option>
                    <option value="pet">寵物/果實類</option>
                    <option value="material">核心材料/結晶</option>
                    <option value="other">其他雜項</option>
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
        renderGMShopGrid();
    };

    // 檢查按鈕顯示狀態的函式
    function checkGMShopBtnVisibility() {
        let btn = document.getElementById('klh-gm-shop-btn');
        if (!btn) return;
        if (typeof player !== 'undefined' && player && player.cls) {
            btn.style.setProperty('display', 'flex', 'important');
        } else {
            btn.style.setProperty('display', 'none', 'important');
        }

        // 額外支援：若載入了 GM 商店，移除 jsonblob 底部 Hella 與 Zeus 按鈕的 "🔒固定" 標籤
        let hTag = document.getElementById('lock-hella-tag');
        let zTag = document.getElementById('lock-zeus-tag');
        if (hTag) hTag.innerText = '';
        if (zTag) zTag.innerText = '';

        // 強制解鎖清除所有存檔按鈕的顯示狀態
        let clearAllBtn = document.getElementById('btn-clear-all');
        if (clearAllBtn) {
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

        // 🌟 開啟 GMShop 時，直接覆寫短劍為測試超高數值
        let dagger = DB.items["wpn_shortsword"];
        if (dagger) {
            dagger.dmgS = 600;
            dagger.dmgL = 800;
            dagger.hit = 1000;
            dagger.spd = 0.1;
            dagger.safe = 1000;
            console.log("[klh_GMShop] GM 商店已啟動，已覆寫開發者測試短劍數值。");
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
