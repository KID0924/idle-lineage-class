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
    window.gmShopCategory = 'all';
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
                font-size: 14px !important;
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
                justify-content: space-between !important;
                height: 180px !important;
                min-height: 180px !important;
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
                position: relative !important;
                overflow: hidden !important;
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
                height: 5.4em !important;
                overflow-y: auto !important;
                padding-right: 4px !important;
                border-top: 1px solid rgba(255, 255, 255, 0.05) !important;
                padding-top: 6px !important;
                flex-grow: 1 !important;
                text-align: left !important;
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
                font-size: 13px !important;
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
                    height: 220px !important;
                    border-right: none !important;
                    border-bottom: 1px solid rgba(124, 58, 237, 0.2) !important;
                    padding: 12px !important;
                    display: grid !important;
                    grid-template-columns: 1fr 1fr !important;
                    gap: 8px !important;
                }
                .gm-shop-sidebar > .mt-auto {
                    grid-column: span 2 !important;
                    margin-top: 4px !important;
                    padding-top: 4px !important;
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

        return { isFree, enhanceVal, blessVal, ancVal, attrVal, seteffVal };
    }

    // 3. 渲染裝備網格
    window.renderGMShopGrid = function () {
        let container = document.getElementById('gm-shop-grid-container');
        if (!container) return;

        let opts = getGMShopSelectedOptions();
        let category = window.gmShopCategory || 'all';
        let search = (window.gmShopSearchQuery || '').toLowerCase().trim();

        // 過濾裝備
        let filtered = equipments.filter(item => {
            if (category !== 'all' && item.type !== category) return false;
            if (search && !item.n.toLowerCase().includes(search)) return false;
            return true;
        });

        // 渲染卡片
        let html = '';
        filtered.forEach(eq => {
            let d = DB.items[eq.id];
            if (!d) return;

            // 構建預覽屬性
            let mockItem = {
                id: eq.id,
                cnt: 1,
                en: opts.enhanceVal,
                bless: (opts.blessVal === 'random') ? true : opts.blessVal, // 預覽用祝福
                anc: (opts.ancVal === 'random') ? true : opts.ancVal, // 預覽用遠古
                attr: (opts.attrVal === 'random') ? 'fire5' : opts.attrVal, // 預覽用火靈
                seteff: (opts.seteffVal === 'random') ? '紅獅的誓言' : opts.seteffVal // 預覽用紅獅
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

        let price = opts.isFree ? 0 : (d.p || 0);

        if (!opts.isFree && (player.gold || 0) < price) {
            logSys(`<span class="text-red-400">金幣不足，無法購買！(需 ${price.toLocaleString()} 金幣)</span>`);
            return;
        }

        if (!opts.isFree) {
            player.gold -= price;
        }

        // 處理隨機選項
        let blessVal = opts.blessVal;
        if (blessVal === 'random') {
            let _af = (typeof rollAffixesNew === 'function') ? rollAffixesNew() : { bless: true };
            blessVal = _af.bless;
        }

        let ancVal = opts.ancVal;
        if (ancVal === 'random') {
            let _af = (typeof rollAffixesNew === 'function') ? rollAffixesNew() : { anc: true };
            ancVal = _af.anc;
        }

        let attrVal = opts.attrVal;
        if (attrVal === 'random') {
            attrVal = (typeof rollAttrAffix === 'function') ? rollAttrAffix() : 'fire1';
        }

        let seteffVal = opts.seteffVal;
        if (seteffVal === 'random') {
            if (typeof SHERINE_EFFECTS !== 'undefined') {
                seteffVal = SHERINE_EFFECTS[Math.floor(Math.random() * SHERINE_EFFECTS.length)];
            } else {
                seteffVal = false;
            }
        }

        // 構建物品探針
        let _probe = {
            id: id,
            en: opts.enhanceVal,
            bless: blessVal,
            anc: ancVal,
            attr: attrVal,
            seteff: seteffVal
        };

        // 背包疊加與塞入邏輯
        let ex = (opts.enhanceVal === 0) ? player.inv.find(i => (i.en || 0) === 0 && sameItemSig(i, _probe)) : null;

        if (ex) {
            ex.cnt += 1;
        } else {
            player.inv.push({
                id: id,
                uid: uid(),
                cnt: 1,
                en: opts.enhanceVal,
                bless: blessVal,
                anc: ancVal,
                attr: attrVal,
                seteff: seteffVal,
                lock: false,
                junk: !!(player.junkPrefs && player.junkPrefs[itemSig(_probe)])
            });
        }

        // 發送系統訊息
        let displayItem = { id: id, cnt: 1, en: opts.enhanceVal, bless: blessVal, anc: ancVal, attr: attrVal, seteff: seteffVal };
        logSys(`在 GM 商店購買了 <span class="font-bold">${getItemFullName(displayItem)}</span>${opts.isFree ? ' (免費)' : ` (花費 ${price.toLocaleString()} 金幣)`}`);

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

    // 5. 創建大視窗 DOM
    function createGMShopModal() {
        // 抓取所有裝備 (只執行一次)
        if (equipments.length === 0) {
            for (let id in DB.items) {
                let item = DB.items[id];
                if (item && (item.type === 'wpn' || item.type === 'arm' || item.type === 'acc')) {
                    if (item.isArrow) continue;
                    equipments.push({ id: id, ...item });
                }
            }
            // 排序: 武器 -> 防具 -> 飾品 (內部以售價排序)
            equipments.sort((a, b) => {
                const typeOrder = { wpn: 1, arm: 2, acc: 3 };
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
                        <div class="gm-shop-control-group">
                            <span class="gm-shop-control-label">價格模式</span>
                            <label class="gm-shop-checkbox-container mt-1">
                                <input type="checkbox" id="gm-free-checkbox" class="gm-shop-checkbox" checked onchange="onGMShopOptionChange()">
                                <span class="font-bold text-yellow-400">GM 免費獲得 (0金幣)</span>
                            </label>
                        </div>
                        
                        <div class="border-t border-slate-800 my-1"></div>
                        
                        <div class="gm-shop-control-group">
                            <span class="gm-shop-control-label">自訂強化等級</span>
                            <div class="flex gap-2">
                                <select id="gm-enhance-select" class="gm-shop-select" onchange="onGMEnhanceSelectChange()">
                                    ${[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20].map(v => `<option value="${v}">+${v}</option>`).join('')}
                                    <option value="custom">自訂</option>
                                </select>
                                <input type="number" id="gm-enhance-custom-input" value="0" min="0" max="999" class="gm-shop-search-input hidden" style="width: 80px;" oninput="onGMShopOptionChange()">
                            </div>
                        </div>
                        
                        <div class="gm-shop-control-group">
                            <span class="gm-shop-control-label">祝福狀態</span>
                            <select id="gm-bless-select" class="gm-shop-select" onchange="onGMShopOptionChange()">
                                <option value="none">無屬性</option>
                                <option value="blessed">祝福的</option>
                                <option value="cursed">詛咒的</option>
                                <option value="random">隨機</option>
                            </select>
                        </div>
                        
                        <div class="gm-shop-control-group">
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
                        
                        <div class="gm-shop-control-group">
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
                        
                        <div class="gm-shop-control-group">
                            <span class="gm-shop-control-label">席琳套裝效果</span>
                            <select id="gm-seteff-select" class="gm-shop-select" onchange="onGMShopOptionChange()">
                                ${seteffOptions}
                            </select>
                        </div>
                        
                        <!-- 玩家資產與負重 -->
                        <div class="border-t border-slate-800 pt-4 flex flex-col gap-2 mt-auto">
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
                        <div class="gm-shop-filter-bar">
                            <input type="text" id="gm-shop-search" placeholder="🔍 搜尋裝備名稱..." class="gm-shop-search-input" oninput="onGMShopSearchInput(this.value)">
                            <div class="gm-shop-tabs">
                                <button class="gm-shop-tab-btn active" data-cat="all" onclick="setGMShopCategory('all')">全部</button>
                                <button class="gm-shop-tab-btn" data-cat="wpn" onclick="setGMShopCategory('wpn')">武器</button>
                                <button class="gm-shop-tab-btn" data-cat="arm" onclick="setGMShopCategory('arm')">防具</button>
                                <button class="gm-shop-tab-btn" data-cat="acc" onclick="setGMShopCategory('acc')">飾品</button>
                            </div>
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

    window.setGMShopCategory = function (cat) {
        window.gmShopCategory = cat;

        let btns = document.querySelectorAll('.gm-shop-tab-btn');
        btns.forEach(btn => {
            if (btn.getAttribute('data-cat') === cat) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

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
    }

    // 7. 初始化外掛
    function startupGMShop() {
        if (typeof DB === 'undefined' || !DB.items) return;
        
        injectStyles();

        // 注入按鈕
        if (!document.getElementById('klh-gm-shop-btn')) {
            let btn = document.createElement('div');
            btn.id = 'klh-gm-shop-btn';
            btn.className = 'gm-shop-btn';
            btn.innerHTML = '🛍️ GM 商店';
            btn.onclick = openGMShop;
            document.body.appendChild(btn);
        }

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
