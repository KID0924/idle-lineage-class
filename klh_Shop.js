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
                        listDiv.innerHTML = '<div class="text-red-500 font-bold text-center py-8">無法連線交易所取得庫存，請確認網路連線。</div>';
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
            adminPanel.innerHTML = `
                <div class="text-yellow-400 font-bold text-xs flex justify-between items-center">
                    <span>🛠&nbsp;交易所 GM 管理上架面版</span>
                    <span class="text-slate-500 text-[10px] font-normal">限 GM 權限顯示</span>
                </div>
                <div class="flex flex-wrap gap-2 items-center text-xs">
                    <input type="text" id="gm-reaper-item-id" placeholder="物品 ID (例如: wpn_shortsword)" class="bg-slate-950 border border-slate-700 text-white rounded px-2.5 py-1.5 w-48 focus:outline-none">
                    <input type="number" id="gm-reaper-stock" placeholder="上架數量" min="1" class="bg-slate-950 border border-slate-700 text-white rounded px-2.5 py-1.5 w-20 focus:outline-none">
                    <input type="number" id="gm-reaper-price" placeholder="自訂單價 (留空使用原版價)" min="0" class="bg-slate-950 border border-slate-700 text-white rounded px-2.5 py-1.5 w-48 focus:outline-none">
                    <button onclick="submitGMReaperItem()" class="btn bg-amber-700 hover:bg-amber-600 border-amber-500 py-1.5 px-3 text-xs font-bold shadow text-white rounded">🚀 上架新商品</button>
                </div>
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
            const info = getItemInfo(listingId);
            if (!info.itemId) return;

            const d = DB.items[info.itemId];
            if (!d) return;

            const price = info.price !== null ? info.price : shopPrice(d.p || 0);
            const priceDisp = price.toLocaleString();

            const el = document.createElement('div');
            el.className = 'list-item bg-slate-800 rounded mb-2 border border-slate-700 p-3 hover:bg-slate-750 transition-colors';
            el.style.cssText = 'display:flex !important; justify-content:space-between !important; align-items:center !important; width:100% !important; box-sizing:border-box !important;';

            const imgUrl = getIconUrl(d);
            const glowClass = getGlowClass(null, d);
            const itemColorClass = getItemColor({ id: info.itemId });

            const isSoldOut = info.stock <= 0;
            const opacityClass = isSoldOut ? 'opacity-50' : '';

            el.innerHTML = `
                <div class="flex items-center gap-4 min-w-0 flex-1 ${opacityClass}">
                    <div class="w-12 h-12 bg-slate-900 rounded border border-slate-600 flex items-center justify-center shrink-0">
                        <img src="${imgUrl}" onerror="this.style.display='none';" class="w-10 h-10 object-contain pointer-events-none ${glowClass}">
                    </div>
                    <div class="flex flex-col items-start gap-1.5">
                        <span class="${itemColorClass} font-bold text-lg leading-none truncate">
                            ${d.n} <span class="text-slate-400 text-xs font-normal">(交易所庫存: ${info.stock})${info.price !== null ? ' <span class="text-amber-400 text-xs font-normal">[自訂價格]</span>' : ''}</span>
                        </span>
                        <div class="flex items-center gap-2">
                            <span class="text-yellow-400 font-bold text-base leading-none">${priceDisp} 金幣</span>
                            <span class="text-slate-400 text-xs hidden md:block leading-none">${d.d || ''}</span>
                        </div>
                    </div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                    ${isSoldOut
                        ? `<button class="btn bg-slate-700 border-slate-600 text-slate-500 py-2 px-6 font-bold shrink-0 cursor-not-allowed opacity-60" disabled>已售罄</button>`
                        : `
                           <input type="number" id="shop-qty-${listingId}" value="1" min="1" max="${info.stock}" class="w-16 bg-slate-900 border border-slate-600 text-center text-white rounded py-1.5 outline-none">
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

        const info = getItemInfo(listingId);
        if (!info.itemId) return;

        const price = info.price !== null ? info.price : shopPrice(DB.items[info.itemId].p || 0);
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
                let latestVal = 0;
                if (cloudRaw !== undefined && cloudRaw !== null) {
                    if (listingId.startsWith('list_')) {
                        latestVal = Math.max(0, parseInt(cloudRaw.stock, 10) || 0);
                    } else {
                        // 兼容舊數字格式
                        latestVal = typeof cloudRaw === 'object' ? (parseInt(cloudRaw.stock, 10) || 0) : (parseInt(cloudRaw, 10) || 0);
                    }
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
                    gainItem(info.itemId, qty, true, true);
                    if (typeof logSys === 'function') {
                        logSys(`在黃金交易所購買了 ${DB.items[info.itemId].n} ×${qty}。`);
                    }

                    // 更新本地庫存快取
                    wealthReaperStock = latestStock;

                    if (typeof showToast === 'function') {
                        showToast(`交易成功！獲得 ${DB.items[info.itemId].n} ×${qty}`, "success");
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
                showToast("交易同步失敗，請檢查網路連線後重試！", "error");
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

                // 上架結構
                latestStock[listingId] = {
                    itemId: id,
                    stock: stock,
                    price: price
                };

                const putRes = await fetchWithProxy(WEALTH_REAPER_BLOB_URL, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(latestStock)
                });

                if (putRes.ok) {
                    wealthReaperStock = latestStock;
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
    // 初始化啟動
    // ==========================================
    function startup() {
        registerWealthReaperNPC();
    }

    // 1. 立即嘗試註冊一次
    registerWealthReaperNPC();

    // 2. 於 DOMContentLoaded 觸發時嘗試一次
    document.addEventListener('DOMContentLoaded', startup);
    
    // 3. 預備機制：若 readyState 已經就緒，立即嘗試一次
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
        startup();
    }

    // 4. 於 window.onload 觸發時再嘗試一次
    window.addEventListener('load', startup);
})();
