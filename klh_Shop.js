/* ============================================================================
 * klh_Shop.js — 財富收割者 (黃金交易所) NPC 商店外掛
 *
 * 設計原則: 完全不改原作者程式碼，透過 monkey-patch 方式攔截/擴充功能。
 * 掛接方式: 在 index.html 的 </body> 標籤正上方插入此腳本：
 * * <script src="klh_Shop.js?v=20260619"></script>
 * ========================================================================== */

(function () {
    const WEALTH_REAPER_NPC_ID = 'npc_wealth_reaper';
    const WEALTH_REAPER_BLOB_URL = "https://api.jsonblob.com/api/jsonBlob/019ededb-9681-7aed-8fcd-aa04e792830c";

    let wealthReaperStock = null;
    let isFetchingStock = false;

    window.reaperGMBagMode = false;
    window.reaperGMBagCategory = 'all';
    window.reaperGMSelectedBagItem = null;

    // ==========================================
    // 代理與連線封裝
    // ==========================================
    async function fetchWithProxy(targetUrl, options = {}) {
        const method = options.method || 'GET';
        const customProxy = localStorage.getItem('klh_custom_proxy') || "https://fragrant-glade-bab3.dreammy0924.workers.dev/";
        const isFileProtocol = window.location.protocol === 'file:';

        async function tryDirect() {
            if (isFileProtocol) throw new Error("File protocol forces proxy.");
            console.log(`[klh_Shop] 嘗試直接進行 ${method} 請求: ${targetUrl}`);
            const res = await fetch(targetUrl, options);
            if (res.ok) {
                console.log(`[klh_Shop] 直接 ${method} 成功！`);
                return res;
            }
            throw new Error(`Direct connection returned status ${res.status}`);
        }

        async function tryProxy() {
            if (!customProxy.trim()) throw new Error("No custom proxy defined.");
            let p = customProxy.trim();
            if (!p.endsWith('/')) p += '/';
            const proxyUrl = p + targetUrl;
            const fetchOptions = method === 'PUT' ? { ...options, mode: 'cors' } : options;
            console.log(`[klh_Shop] 嘗試使用主要代理 ${method}: ${proxyUrl}`);
            const res = await fetch(proxyUrl, fetchOptions);
            if (res.status === 200 || res.status === 201 || res.ok) {
                console.log(`[klh_Shop] 透過主要代理 ${method} 成功！`);
                return res;
            }
            throw new Error(`Proxy connection returned status ${res.status}`);
        }

        if (isFileProtocol) {
            try { return await tryProxy(); }
            catch (err) {
                console.warn(`[klh_Shop] 代理失敗，嘗試直接連線...`, err);
                try { return await tryDirect(); }
                catch (err2) {
                    console.error(`[klh_Shop] 所有連線管道皆失敗:`, err2);
                    throw err2;
                }
            }
        } else {
            try { return await tryDirect(); }
            catch (err) {
                console.warn(`[klh_Shop] 直接連線失敗，回退至主要代理...`, err);
                try { return await tryProxy(); }
                catch (err2) {
                    console.error(`[klh_Shop] 所有連線管道皆失敗:`, err2);
                    throw err2;
                }
            }
        }
    }

    // ==========================================
    // 註冊 NPC 至奇岩
    // ==========================================
    let registerTimer = null;
    let registerAttempts = 0;

    function registerWealthReaperNPC() {
        if (typeof DB === 'undefined' || !DB.towns || !DB.towns.town_giran || !DB.towns.town_giran.npcs) {
            registerAttempts++;
            console.warn(`[klh_Shop] 找不到奇岩城鎮配置，嘗試次數: ${registerAttempts}/100`);
            
            // 如果尚未設置定時器，設定定時重試
            if (!registerTimer && registerAttempts < 100) {
                registerTimer = setInterval(() => {
                    registerWealthReaperNPC();
                }, 100);
            }
            
            // 嘗試超過 100 次（10秒）則清除定時器
            if (registerAttempts >= 100 && registerTimer) {
                clearInterval(registerTimer);
                registerTimer = null;
                console.error("[klh_Shop] 註冊財富收割者 NPC 超時失敗。");
            }
            return;
        }

        // 成功取得 DB，清除重試定時器
        if (registerTimer) {
            clearInterval(registerTimer);
            registerTimer = null;
        }

        const npcs = DB.towns.town_giran.npcs;
        if (!npcs.some(n => n.id === WEALTH_REAPER_NPC_ID)) {
            npcs.push({
                id: WEALTH_REAPER_NPC_ID,
                n: "財富收割者",
                title: "黃金交易所",
                type: "shop",
                d: "提供限量資源的稀有交易，全服共用庫存。"
            });
            console.log("[klh_Shop] 財富收割者 NPC 註冊成功。");

            // 🚀 如果玩家當前正停留在奇岩中，立即重新刷新城鎮 NPC 渲染，避免需要切換地圖才看到 NPC
            if (typeof window.renderTownNPCs === 'function') {
                try {
                    const container = document.getElementById('town-npc-container');
                    if (container && (container.innerHTML.includes('溫諾') || container.innerHTML.includes('邁爾'))) {
                        console.log("[klh_Shop] 檢測到玩家當前在奇岩城鎮中，立即重新繪製城鎮...");
                        window.renderTownNPCs('town_giran');
                    }
                } catch (e) {
                    console.warn("[klh_Shop] 重新渲染奇岩 NPC 失敗:", e);
                }
            }
        }
    }

    // ==========================================
    // Hook 商店商品列表取得
    // ==========================================
    if (typeof window.getShopItemsForNpc === 'function') {
        const originalGetShopItemsForNpc = window.getShopItemsForNpc;
        window.getShopItemsForNpc = function (npcId) {
            if (npcId === WEALTH_REAPER_NPC_ID) {
                return ['wpn_shortsword', 'potion_heal'];
            }
            return originalGetShopItemsForNpc(npcId);
        };
    }

    // ==========================================
    // Hook 商店主渲染 (開商店時重置庫存快取並同步金鑰至 window)
    // ==========================================
    if (typeof window.renderTownShop === 'function') {
        const originalRenderTownShop = window.renderTownShop;
        window.renderTownShop = function (containerElement, npcId = '') {
            registerWealthReaperNPC(); // 🚀 防禦性補註冊
            window._currentShopNpc = npcId; // 🚀 關鍵修復：將 npcId 綁定至 window 屬性 (因原生 _currentShopNpc 是以 let 宣告的變數，window 預設讀不到)
            if (npcId === WEALTH_REAPER_NPC_ID) {
                wealthReaperStock = null; // 清除舊庫存快取，強制重新下載
            }
            originalRenderTownShop(containerElement, npcId);
        };
    }

    // ==========================================
    // Hook 商品渲染列表 (自定義黃金交易所 UI)
    // ==========================================
    if (typeof window.renderShopItems === 'function') {
        const originalRenderShopItems = window.renderShopItems;
        window.renderShopItems = async function () {
            if (window._currentShopNpc === WEALTH_REAPER_NPC_ID) {
                const listDiv = document.getElementById('shop-items-list');
                if (!listDiv) return;

                if (window.reaperGMBagMode) {
                    renderGMBagItemsUI(listDiv);
                    return;
                }

                if (wealthReaperStock === null && !isFetchingStock) {
                    isFetchingStock = true;
                    listDiv.innerHTML = `
                        <div class="w-full text-center py-8 text-indigo-400 font-bold flex flex-col items-center gap-3">
                            <div class="klh-loading-spinner" style="width:36px; height:36px; border-top-color:#818cf8; border-left-color:rgba(129,140,248,0.1); border-right-color:rgba(129,140,248,0.1); border-bottom-color:rgba(129,140,248,0.1);"></div>
                            <span>正在連線取得交易所庫存，請稍候...</span>
                        </div>
                    `;
                    try {
                        const res = await fetchWithProxy(WEALTH_REAPER_BLOB_URL);
                        if (res.status === 200) {
                            wealthReaperStock = await res.json();
                        } else {
                            throw new Error("HTTP " + res.status);
                        }
                    } catch (err) {
                        console.error("[klh_Shop] 取得庫存失敗:", err);
                        listDiv.innerHTML = `
                            <div class="text-red-400 font-bold text-center py-8 px-4 leading-relaxed">
                                💥 哎呀！交易所運送物資的馬車在奇岩地監被巴風特洗劫一空了！<br>
                                <span class="text-slate-500 text-xs font-normal">（請檢查您的雲端金鑰設定與網路連線）</span>
                            </div>
                        `;
                        isFetchingStock = false;
                        return;
                    }
                    isFetchingStock = false;
                }

                if (isFetchingStock) {
                    return;
                }

                renderWealthReaperItemsUI(listDiv);
            } else {
                originalRenderShopItems();
            }
        };
    }

    function getItemInfo(listingId) {
        const raw = wealthReaperStock ? wealthReaperStock[listingId] : null;
        if (raw === null || raw === undefined) {
            return { itemId: null, stock: 0, price: null };
        }
        if (listingId.startsWith('list_')) {
            // 新版上架格式 (獨立金鑰)
            return {
                itemId: raw.itemId,
                stock: Math.max(0, parseInt(raw.stock, 10) || 0),
                price: (raw.price !== undefined && raw.price !== null) ? Math.max(0, parseInt(raw.price, 10)) : null
            };
        } else {
            // 舊版兼容格式：key 就是 itemId 本身
            if (typeof raw === 'object') {
                return {
                    itemId: listingId,
                    stock: Math.max(0, parseInt(raw.stock, 10) || 0),
                    price: (raw.price !== undefined && raw.price !== null) ? Math.max(0, parseInt(raw.price, 10)) : null
                };
            }
            return {
                itemId: listingId,
                stock: Math.max(0, parseInt(raw, 10) || 0),
                price: null
            };
        }
    }

    function renderWealthReaperItemsUI(listDiv) {
        listDiv.innerHTML = '';

        // 如果是 GM 權限（載入 gmshop 的人），在頂部渲染上架管理面板
        const isGM = typeof window.openGMShop === 'function';
        if (isGM) {
            const adminPanel = document.createElement('div');
            adminPanel.className = 'bg-slate-900/60 border border-slate-700 rounded-lg p-3 mb-4 text-left flex flex-col gap-2 w-full';
            
            // 🌟 額外顯示目前選取的物品稱號 preview
            const selectedTip = window.reaperGMSelectedBagItem
                ? `<div class="text-xs text-indigo-300 font-bold border-t border-slate-700/50 pt-1.5 mt-1">已選取：${getItemFullName(window.reaperGMSelectedBagItem)}</div>`
                : '';

            const defaultId = window.reaperGMSelectedBagItem ? window.reaperGMSelectedBagItem.id : '';
            const defaultStock = window.reaperGMSelectedBagItem ? window.reaperGMSelectedBagItem.cnt : '';

            adminPanel.innerHTML = `
                <div class="text-yellow-400 font-bold text-xs flex justify-between items-center">
                    <span>🛠&nbsp;交易所 GM 管理上架面版</span>
                    <span class="text-slate-500 text-[10px] font-normal">限 GM 權限顯示</span>
                </div>
                <div class="flex flex-wrap gap-2 items-center text-xs">
                    <input type="text" id="gm-reaper-item-id" value="${defaultId}" placeholder="物品 ID (例如: wpn_shortsword)" class="bg-slate-950 border border-slate-700 text-white rounded px-2.5 py-1.5 w-48 focus:outline-none">
                    <input type="number" id="gm-reaper-stock" value="${defaultStock}" placeholder="上架數量" min="1" class="bg-slate-950 border border-slate-700 text-white rounded px-2.5 py-1.5 w-20 focus:outline-none">
                    <input type="number" id="gm-reaper-price" placeholder="自訂單價 (留空使用原版價)" min="0" class="bg-slate-950 border border-slate-700 text-white rounded px-2.5 py-1.5 w-48 focus:outline-none">
                    <button onclick="submitGMReaperItem()" class="btn bg-amber-700 hover:bg-amber-600 border-amber-500 py-1.5 px-3 text-xs font-bold shadow text-white rounded">🚀 上架商品</button>
                    <button onclick="toggleGMBagMode()" class="btn ${window.reaperGMBagMode ? 'bg-slate-700 hover:bg-slate-600 border-slate-500' : 'bg-indigo-700 hover:bg-indigo-600 border-indigo-500'} py-1.5 px-3 text-xs font-bold shadow text-white rounded">
                        ${window.reaperGMBagMode ? '🔙 返回商品列表' : '🎒 從背包選取物品'}
                    </button>
                </div>
                ${selectedTip}
            `;
            listDiv.appendChild(adminPanel);
        }

        const ids = Object.keys(wealthReaperStock || {});
        if (ids.length === 0) {
            const emptyEl = document.createElement('div');
            emptyEl.className = 'text-slate-500 text-sm text-center py-8 w-full';
            emptyEl.innerText = '目前交易所沒有上架任何商品。';
            listDiv.appendChild(emptyEl);
            return;
        }

        ids.forEach(listingId => {
            const info = wealthReaperStock[listingId];
            if (!info) return;

            // 舊版兼容格式
            const itemId = listingId.startsWith('list_') ? info.itemId : listingId;
            if (!itemId) return;

            const d = DB.items[itemId];
            if (!d) return; // 🌟 1. 第一關防護：本版查無此物品則安全跳過不渲染

            const en = listingId.startsWith('list_') ? (info.en || 0) : 0;
            const bless = listingId.startsWith('list_') ? (info.bless || false) : false;
            const anc = listingId.startsWith('list_') ? (info.anc || false) : false;
            const attr = listingId.startsWith('list_') ? (info.attr || false) : false;
            const seteff = listingId.startsWith('list_') ? (info.seteff || false) : false;

            const mockItem = {
                id: itemId,
                en: en,
                bless: bless,
                anc: anc,
                attr: attr,
                seteff: seteff
            };

            const customPrice = listingId.startsWith('list_') ? info.price : (typeof info === 'object' ? info.price : null);
            const price = (customPrice !== undefined && customPrice !== null) ? Math.max(0, parseInt(customPrice, 10)) : shopPrice(d.p || 0);
            const priceDisp = price.toLocaleString();

            const el = document.createElement('div');
            el.className = 'list-item bg-slate-800 rounded mb-2 border border-slate-700 p-3 hover:bg-slate-750 transition-colors';
            el.style.cssText = 'display:flex !important; justify-content:space-between !important; align-items:center !important; width:100% !important; box-sizing:border-box !important;';

            const imgUrl = getIconUrl(d);
            const glowClass = getGlowClass(mockItem, d) || '';
            const itemColorClass = getItemColor(mockItem);
            const fullName = getItemFullName(mockItem);

            const stockCount = listingId.startsWith('list_') ? (parseInt(info.stock, 10) || 0) : (typeof info === 'object' ? (parseInt(info.stock, 10) || 0) : (parseInt(info, 10) || 0));
            const isSoldOut = stockCount <= 0;
            const opacityClass = isSoldOut ? 'opacity-50' : '';

            el.innerHTML = `
                <div class="flex items-center gap-4 min-w-0 flex-1 ${opacityClass}">
                    <div class="w-12 h-12 bg-slate-900 rounded border border-slate-600 flex items-center justify-center shrink-0 tip-host" data-tip-src="reaper" data-tip-uid="${listingId}">
                        <img src="${imgUrl}" onerror="this.style.display='none';" class="w-10 h-10 object-contain pointer-events-none ${glowClass}">
                    </div>
                    <div class="flex flex-col items-start gap-1.5 min-w-0 flex-1">
                        <span class="${itemColorClass} font-bold text-lg leading-none truncate">
                            ${fullName} <span class="text-slate-400 text-xs font-normal">(庫存: ${stockCount})${customPrice !== null && customPrice !== undefined ? ' <span class="text-amber-400 text-xs font-normal">[自訂價格]</span>' : ''}</span>
                        </span>
                        <div class="flex items-center gap-2">
                            <span class="text-yellow-400 font-bold text-base leading-none">${priceDisp} 金幣</span>
                            <span class="text-slate-400 text-xs hidden md:block leading-none truncate max-w-xs">${d.d || ''}</span>
                        </div>
                    </div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                    ${isSoldOut
                        ? `<button class="btn bg-slate-700 border-slate-600 text-slate-500 py-2 px-6 font-bold shrink-0 cursor-not-allowed opacity-60" disabled>已售罄</button>`
                        : `
                           <input type="number" id="shop-qty-${listingId}" value="1" min="1" max="${stockCount}" class="w-16 bg-slate-900 border border-slate-600 text-center text-white rounded py-1.5 outline-none">
                           <button class="btn bg-blue-700 hover:bg-blue-600 border-blue-500 py-2 px-5 font-bold shadow text-white" onclick="buyWealthReaperItem('${listingId}', document.getElementById('shop-qty-${listingId}').value)">購買</button>
                          `
                    }
                    ${isGM ? `<button class="btn bg-red-700 hover:bg-red-600 border-red-500 py-2 px-4 font-bold shadow text-white rounded" onclick="deleteGMReaperListing('${listingId}')">下架</button>` : ''}
                </div>
            `;
            listDiv.appendChild(el);
        });
    }

    // ==========================================
    // 購買並同步雲端庫存
    // ==========================================
    window.buyWealthReaperItem = async function (listingId, qty) {
        qty = Math.max(1, Math.floor(Number(qty) || 1));

        if (!wealthReaperStock || wealthReaperStock[listingId] === undefined) {
            if (typeof showToast === 'function') showToast("商品資料異常，請重新開啟交易所！", "error");
            return;
        }

        const info = wealthReaperStock[listingId];
        const itemId = listingId.startsWith('list_') ? info.itemId : listingId;
        
        // 🌟 3. 購買防護：防止當前版本沒有此物品，讀取屬性報錯導致遮罩卡死
        if (!itemId || !DB.items[itemId]) {
            if (typeof showToast === 'function') {
                showToast("此商品不適用於當前遊戲版本，交易已被取消！", "error");
            }
            return;
        }

        const en = listingId.startsWith('list_') ? (info.en || 0) : 0;
        const bless = listingId.startsWith('list_') ? (info.bless || false) : false;
        const anc = listingId.startsWith('list_') ? (info.anc || false) : false;
        const attr = listingId.startsWith('list_') ? (info.attr || false) : false;
        const seteff = listingId.startsWith('list_') ? (info.seteff || false) : false;

        const customPrice = listingId.startsWith('list_') ? info.price : (typeof info === 'object' ? info.price : null);
        const price = (customPrice !== undefined && customPrice !== null) ? Math.max(0, parseInt(customPrice, 10)) : shopPrice(DB.items[itemId].p || 0);
        const cost = price * qty;

        if (player.gold < cost) {
            if (typeof logSys === 'function') logSys("金幣不足。");
            if (typeof showToast === 'function') showToast("金幣不足！", "error");
            return;
        }

        const startTime = Date.now(); // 🚀 記錄交易開始時間，配合 1 秒防連點延遲

        if (typeof showLoadingOverlay === 'function') {
            showLoadingOverlay("正在與交易所同步庫存中，請稍候...");
        }

        try {
            // 🚀 交易鎖定：先向雲端獲取最新即時庫存，防止同時間被其他玩家買走
            const res = await fetchWithProxy(WEALTH_REAPER_BLOB_URL);
            if (res.status === 200) {
                const latestStock = await res.json();
                
                // 讀取最新雲端該商品的庫存
                const cloudRaw = latestStock[listingId];
                if (!cloudRaw) {
                    showToast("商品已下架或已被買走！", "error");
                    wealthReaperStock = latestStock;
                    if (typeof renderShopItems === 'function') renderShopItems();
                    return;
                }

                let latestVal = 0;
                if (listingId.startsWith('list_')) {
                    latestVal = Math.max(0, parseInt(cloudRaw.stock, 10) || 0);
                } else {
                    // 兼容舊數字格式
                    latestVal = typeof cloudRaw === 'object' ? (parseInt(cloudRaw.stock, 10) || 0) : (parseInt(cloudRaw, 10) || 0);
                }

                if (qty > latestVal) {
                    if (typeof showToast === 'function') {
                        showToast(`庫存不足！最新剩餘數量為 ${latestVal}，交易已被取消。`, "error");
                    }
                    wealthReaperStock = latestStock;
                    if (typeof renderShopItems === 'function') renderShopItems();
                    return;
                }

                // 扣除並更新雲端庫存 (維持原有的 JSON 欄位結構)
                if (listingId.startsWith('list_')) {
                    latestStock[listingId].stock = latestVal - qty;
                } else {
                    if (typeof latestStock[listingId] === 'object' && latestStock[listingId] !== null) {
                        latestStock[listingId].stock = latestVal - qty;
                    } else {
                        latestStock[listingId] = latestVal - qty;
                    }
                }

                const putRes = await fetchWithProxy(WEALTH_REAPER_BLOB_URL, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(latestStock)
                });

                if (putRes.ok) {
                    // 扣除玩家金幣並給予道具
                    player.gold -= cost;

                    // 🌟 核心：直接複製屬性建立 purchased 物件給予玩家，避免 gainItem 造成屬性隨機擲骰
                    const purchased = {
                        id: itemId,
                        uid: uid(),
                        cnt: qty,
                        en: en,
                        bless: bless,
                        anc: anc,
                        attr: attr,
                        seteff: seteff,
                        lock: false,
                        junk: false
                    };

                    // 判斷背包中是否已有完全相同屬性的物品，有則疊加，無則 push
                    const ex = player.inv.find(i => (i.en || 0) === (purchased.en || 0) && sameItemSig(i, purchased));
                    if (ex) {
                        ex.cnt += qty;
                    } else {
                        player.inv.push(purchased);
                    }

                    if (typeof logSys === 'function') {
                        logSys(`在黃金交易所購買了 ${getItemFullName(purchased)} ×${qty}。`);
                    }

                    // 更新本地庫存快取
                    wealthReaperStock = latestStock;

                    if (typeof showToast === 'function') {
                        showToast(`交易成功！獲得 ${getItemFullName(purchased)} ×${qty}`, "success");
                    }

                    // 更新畫面
                    if (typeof renderShopItems === 'function') renderShopItems();
                    if (typeof updateUI === 'function') updateUI();

                    // 自動存檔存入玩家本機/雲端
                    if (typeof saveGame === 'function') {
                        await saveGame();
                    }
                } else {
                    throw new Error("Cloud PUT request failed");
                }
            } else {
                throw new Error("Cloud GET request failed");
            }
        } catch (err) {
            console.error("[klh_Shop] 交易所同步失敗:", err);
            if (typeof showToast === 'function') {
                showToast("不好了！交易所與您的水鏡魔法連線中斷，交易失敗！", "error");
            }
        } finally {
            // 🚀 強制將連線等待時間補足至至少 1000 毫秒，防止玩家連續點擊
            const elapsed = Date.now() - startTime;
            const remainingDelay = Math.max(0, 1000 - elapsed);
            if (remainingDelay > 0) {
                await new Promise(resolve => setTimeout(resolve, remainingDelay));
            }
            if (typeof hideLoadingOverlay === 'function') {
                hideLoadingOverlay();
            }
        }
    };

    // ==========================================
    // GM 上架新商品 (生成唯一 Listing ID，防合併覆蓋)
    // ==========================================
    window.submitGMReaperItem = async function () {
        const idInput = document.getElementById('gm-reaper-item-id');
        const stockInput = document.getElementById('gm-reaper-stock');
        const priceInput = document.getElementById('gm-reaper-price');

        if (!idInput || !stockInput || !priceInput) return;
        const id = idInput.value.trim();
        const stock = parseInt(stockInput.value, 10);
        const customPriceRaw = priceInput.value.trim();
        const price = customPriceRaw !== "" ? parseInt(customPriceRaw, 10) : null;

        if (!id) {
            showToast("請輸入物品 ID！", "error");
            return;
        }
        if (isNaN(stock) || stock <= 0) {
            showToast("請輸入大於 0 的有效上架數量！", "error");
            return;
        }
        if (typeof DB === 'undefined' || !DB.items || !DB.items[id]) {
            showToast("無效的物品 ID，請檢查遊戲資料庫！", "error");
            return;
        }
        if (price !== null && (isNaN(price) || price < 0)) {
            showToast("請輸入有效的自訂價格！", "error");
            return;
        }

        if (typeof showLoadingOverlay === 'function') {
            showLoadingOverlay("正在更新交易所商品上架，請稍候...");
        }

        try {
            const res = await fetchWithProxy(WEALTH_REAPER_BLOB_URL);
            if (res.status === 200) {
                const latestStock = await res.json();

                // 生成獨立唯一的上架 ID：防止相同物品因價格不同而覆蓋合併
                const listingId = 'list_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

                const selectedItem = window.reaperGMSelectedBagItem;
                const hasMatchedStats = selectedItem && selectedItem.id === id;

                // 上架結構 (加入特殊裝備屬性)
                latestStock[listingId] = {
                    itemId: id,
                    stock: stock,
                    price: price,
                    en: hasMatchedStats ? (selectedItem.en || 0) : 0,
                    bless: hasMatchedStats ? (selectedItem.bless || false) : false,
                    anc: hasMatchedStats ? (selectedItem.anc || false) : false,
                    attr: hasMatchedStats ? (selectedItem.attr || false) : false,
                    seteff: hasMatchedStats ? (selectedItem.seteff || false) : false
                };

                const putRes = await fetchWithProxy(WEALTH_REAPER_BLOB_URL, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(latestStock)
                });

                if (putRes.ok) {
                    wealthReaperStock = latestStock;
                    window.reaperGMBagMode = false; // 🚀 上架成功後自動切回商品列表
                    window.reaperGMSelectedBagItem = null; // 清除已選取的暫存
                    showToast(`商品 「${DB.items[id].n}」 上架成功！`, "success");
                    idInput.value = "";
                    stockInput.value = "";
                    priceInput.value = "";
                    if (typeof renderShopItems === 'function') renderShopItems();
                } else {
                    throw new Error("PUT failed");
                }
            } else {
                throw new Error("GET failed");
            }
        } catch (err) {
            console.error(err);
            showToast("更新交易所失敗，請檢查網路連線！", "error");
        } finally {
            if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
        }
    };

    // ==========================================
    // GM 下架商品 (根據 Listing ID 刪除)
    // ==========================================
    window.deleteGMReaperListing = async function (listingId) {
        const info = getItemInfo(listingId);
        if (!info.itemId) return;

        const itemName = DB.items[info.itemId] ? DB.items[info.itemId].n : info.itemId;
        const priceLabel = info.price !== null ? `${info.price} 金幣` : "原版價";
        if (!confirm(`確定要將商品「${itemName}」 (價格: ${priceLabel}) 下架嗎？`)) return;

        if (typeof showLoadingOverlay === 'function') {
            showLoadingOverlay("正在下架商品，請稍候...");
        }

        try {
            const res = await fetchWithProxy(WEALTH_REAPER_BLOB_URL);
            if (res.status === 200) {
                const latestStock = await res.json();

                if (latestStock[listingId] !== undefined) {
                    delete latestStock[listingId];
                }

                const putRes = await fetchWithProxy(WEALTH_REAPER_BLOB_URL, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(latestStock)
                });

                if (putRes.ok) {
                    wealthReaperStock = latestStock;
                    showToast(`商品 「${itemName}」 下架成功！`, "success");
                    if (typeof renderShopItems === 'function') renderShopItems();
                } else {
                    throw new Error("PUT failed");
                }
            } else {
                throw new Error("GET failed");
            }
        } catch (err) {
            console.error(err);
            showToast("下架失敗，請檢查網路連線！", "error");
        } finally {
            if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
        }
    };

    // ==========================================
    // GM 背包上架模式切換與輔助函數
    // ==========================================
    window.toggleGMBagMode = function () {
        window.reaperGMBagMode = !window.reaperGMBagMode;
        if (typeof renderShopItems === 'function') {
            renderShopItems();
        }
    };

    window.setReaperGMBagCategory = function (cat) {
        window.reaperGMBagCategory = cat;
        if (typeof renderShopItems === 'function') {
            renderShopItems();
        }
    };

    window.selectBagItemForUpload = function (uid) {
        const item = player.inv.find(i => i.uid === uid);
        if (!item) {
            showToast("找不到選取的物品！", "error");
            return;
        }

        window.reaperGMSelectedBagItem = item;

        // 🌟 先刷新 DOM，讓 value="${defaultId}" 和 value="${defaultStock}" 自動被帶入
        if (typeof renderShopItems === 'function') {
            renderShopItems();
        }

        // 🌟 刷新後再獲取價格輸入框以清空並聚焦，這時它的 DOM 已經是重新渲染後的最新實例
        const priceInput = document.getElementById('gm-reaper-price');
        if (priceInput) {
            priceInput.value = '';
            priceInput.focus();
        }

        if (typeof showToast === 'function') {
            showToast("已自動帶入物品屬性，請填寫自訂價格後上架！", "success");
        }
    };

    function renderGMBagItemsUI(listDiv) {
        listDiv.innerHTML = '';

        // 1. 頂部仍渲染 GM 管理面板 (以供帶入和點擊上架)
        const isGM = typeof window.openGMShop === 'function';
        if (isGM) {
            const adminPanel = document.createElement('div');
            adminPanel.className = 'bg-slate-900/60 border border-slate-700 rounded-lg p-3 mb-4 text-left flex flex-col gap-2 w-full';
            
            // 🌟 額外顯示目前選取的物品稱號 preview
            const selectedTip = window.reaperGMSelectedBagItem
                ? `<div class="text-xs text-indigo-300 font-bold border-t border-slate-700/50 pt-1.5 mt-1">已選取：${getItemFullName(window.reaperGMSelectedBagItem)}</div>`
                : '';

            const defaultId = window.reaperGMSelectedBagItem ? window.reaperGMSelectedBagItem.id : '';
            const defaultStock = window.reaperGMSelectedBagItem ? window.reaperGMSelectedBagItem.cnt : '';

            adminPanel.innerHTML = `
                <div class="text-yellow-400 font-bold text-xs flex justify-between items-center">
                    <span>🛠&nbsp;交易所 GM 管理上架面版</span>
                    <span class="text-slate-500 text-[10px] font-normal">限 GM 權限顯示</span>
                </div>
                <div class="flex flex-wrap gap-2 items-center text-xs">
                    <input type="text" id="gm-reaper-item-id" value="${defaultId}" placeholder="物品 ID (例如: wpn_shortsword)" class="bg-slate-950 border border-slate-700 text-white rounded px-2.5 py-1.5 w-48 focus:outline-none">
                    <input type="number" id="gm-reaper-stock" value="${defaultStock}" placeholder="上架數量" min="1" class="bg-slate-950 border border-slate-700 text-white rounded px-2.5 py-1.5 w-20 focus:outline-none">
                    <input type="number" id="gm-reaper-price" placeholder="自訂單價 (留空使用原版價)" min="0" class="bg-slate-950 border border-slate-700 text-white rounded px-2.5 py-1.5 w-48 focus:outline-none">
                    <button onclick="submitGMReaperItem()" class="btn bg-amber-700 hover:bg-amber-600 border-amber-500 py-1.5 px-3 text-xs font-bold shadow text-white rounded">🚀 上架商品</button>
                    <button onclick="toggleGMBagMode()" class="btn ${window.reaperGMBagMode ? 'bg-slate-700 hover:bg-slate-600 border-slate-500' : 'bg-indigo-700 hover:bg-indigo-600 border-indigo-500'} py-1.5 px-3 text-xs font-bold shadow text-white rounded">
                        ${window.reaperGMBagMode ? '🔙 返回商品列表' : '🎒 從背包選取物品'}
                    </button>
                </div>
                ${selectedTip}
            `;
            listDiv.appendChild(adminPanel);
        }

        // 2. 渲染分類 Tab 頁籤
        const cat = window.reaperGMBagCategory || 'all';
        const tabsDiv = document.createElement('div');
        tabsDiv.className = 'flex gap-2 mb-3 w-full border-b border-slate-700 pb-2 text-xs justify-start';
        tabsDiv.innerHTML = `
            <button onclick="setReaperGMBagCategory('all')" class="btn py-1 px-3 text-xs font-bold rounded ${cat === 'all' ? 'bg-indigo-700 border-indigo-500' : 'bg-slate-800 border-slate-700'} text-white">全部 (${player.inv.length})</button>
            <button onclick="setReaperGMBagCategory('equip')" class="btn py-1 px-3 text-xs font-bold rounded ${cat === 'equip' ? 'bg-indigo-700 border-indigo-500' : 'bg-slate-800 border-slate-700'} text-white">裝備</button>
            <button onclick="setReaperGMBagCategory('consume')" class="btn py-1 px-3 text-xs font-bold rounded ${cat === 'consume' ? 'bg-indigo-700 border-indigo-500' : 'bg-slate-800 border-slate-700'} text-white">消耗品</button>
        `;
        listDiv.appendChild(tabsDiv);

        // 3. 獲取並過濾背包物品
        const bagItems = player.inv || [];
        const filtered = bagItems.filter(item => {
            const d = DB.items[item.id];
            if (!d) return false;
            if (cat === 'equip') {
                return d.type === 'wpn' || d.type === 'arm' || d.type === 'acc';
            }
            if (cat === 'consume') {
                return d.type !== 'wpn' && d.type !== 'arm' && d.type !== 'acc';
            }
            return true;
        });

        if (filtered.length === 0) {
            const emptyEl = document.createElement('div');
            emptyEl.className = 'text-slate-500 text-sm text-center py-8 w-full';
            emptyEl.innerText = '您的背包中沒有此分類的物品。';
            listDiv.appendChild(emptyEl);
            return;
        }

        // 4. 渲染背包物品列表 (帶有 tip-host 與 data-tip-uid 以支持完整屬性 Hover 彈窗)
        filtered.forEach(item => {
            const d = DB.items[item.id];
            if (!d) return;

            const imgUrl = getIconUrl(d);
            const glowClass = getGlowClass(item, d) || '';
            const fullName = getItemFullName(item);
            const colorClass = getItemColor(item);

            const el = document.createElement('div');
            el.className = 'list-item bg-slate-800 rounded mb-2 border border-slate-700 p-3 hover:bg-slate-750 transition-colors';
            el.style.cssText = 'display:flex !important; justify-content:space-between !important; align-items:center !important; width:100% !important; box-sizing:border-box !important;';

            el.innerHTML = `
                <div class="flex items-center gap-4 min-w-0 flex-1">
                    <div class="w-12 h-12 bg-slate-900 rounded border border-slate-600 flex items-center justify-center shrink-0 tip-host" data-tip-uid="${item.uid}" data-tip-src="inv">
                        <img src="${imgUrl}" onerror="this.style.display='none';" class="w-10 h-10 object-contain pointer-events-none ${glowClass}">
                    </div>
                    <div class="flex flex-col items-start gap-1.5 min-w-0 flex-1">
                        <span class="${colorClass} font-bold text-base leading-none truncate">
                            ${fullName}
                        </span>
                        <div class="flex items-center gap-2">
                            <span class="text-slate-400 text-xs leading-none">擁有數量: ${item.cnt}</span>
                            <span class="text-slate-400 text-xs hidden md:block leading-none truncate max-w-xs">${d.d || ''}</span>
                        </div>
                    </div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                    <button class="btn bg-indigo-700 hover:bg-indigo-600 border-indigo-500 py-1.5 px-4 font-bold shadow text-white rounded text-xs" onclick="selectBagItemForUpload('${item.uid}')">選取上架</button>
                </div>
            `;
            listDiv.appendChild(el);
        });
    }

    // ==========================================
    // Hook 全域 Tooltip 物品檢索
    // ==========================================
    if (typeof window.findTipItem === 'function') {
        const originalFindTipItem = window.findTipItem;
        window.findTipItem = function (src, uidv) {
            if (src === 'reaper') {
                const info = wealthReaperStock ? wealthReaperStock[uidv] : null;
                if (info) {
                    const itemId = uidv.startsWith('list_') ? info.itemId : uidv;
                    
                    // 🌟 2. Tooltip 防護：若本版沒有此物品，回傳 null 避免 buildItemDescHTML 崩潰
                    if (!DB.items[itemId]) return null;
                    
                    const en = uidv.startsWith('list_') ? (info.en || 0) : 0;
                    const bless = uidv.startsWith('list_') ? (info.bless || false) : false;
                    const anc = uidv.startsWith('list_') ? (info.anc || false) : false;
                    const attr = uidv.startsWith('list_') ? (info.attr || false) : false;
                    const seteff = uidv.startsWith('list_') ? (info.seteff || false) : false;
                    
                    return {
                        id: itemId,
                        uid: uidv,
                        cnt: 1,
                        en: en,
                        bless: bless,
                        anc: anc,
                        attr: attr,
                        seteff: seteff,
                        lock: false,
                        junk: false
                    };
                }
            }
            return originalFindTipItem(src, uidv);
        };
    }

    // ==========================================
    // 防止手機輸入框點擊放大 (CSS 注入)
    // ==========================================
    function injectMobileInputStyle() {
        const styleId = 'reaper-mobile-input-style';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.innerHTML = `
                /* 📱 解決 iOS / 手機版點擊輸入框會自動放大網頁的問題 */
                #interaction-content input[type="text"], 
                #interaction-content input[type="number"] {
                    font-size: 16px !important;
                }
            `;
            document.head.appendChild(style);
        }
    }

    // ==========================================
    // 初始化啟動
    // ==========================================
    function startup() {
        registerWealthReaperNPC();
        injectMobileInputStyle();
    }

    // 1. 立即嘗試註冊與注入樣式
    registerWealthReaperNPC();
    injectMobileInputStyle();

    // 2. 於 DOMContentLoaded 觸發時嘗試一次
    document.addEventListener('DOMContentLoaded', startup);
    
    // 3. 預備機制：若 readyState 已經就緒，立即嘗試一次
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
        startup();
    }

    // 4. 於 window.onload 觸發時再嘗試一次
    window.addEventListener('load', startup);
})();
