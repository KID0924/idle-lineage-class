/* ============================================================================
 * klh_Shop.js — 財富收割者 (黃金交易所) NPC 商店外掛
 *
 * 設計原則: 完全不改原作者程式碼，透過 monkey-patch 方式攔截/擴充功能。
 * 掛接方式: 在 index.html 的 </body> 標籤正上方插入此腳本：
 * * <script src="klh_Shop.js?v=20260622"></script>
 *
 * 功能一覽:
 *   1. 交易所密鑰加密 —— 使用 SHA-256 對使用者存檔金鑰與存檔位進行雜湊加密，產生唯一且安全的交易所角色 ID，防止直接暴露雲端私鑰。
 *   2. 交易所連線代理 —— 提供 fetchWithProxy 連線，並在 file:/// 協議下自動轉向專屬的 CORS 主要代理伺服器。
 *   3. 雲端庫存同步   —— 拉取伺服器黃金交易所 (npc_wealth_reaper) 商品庫存，並實作本地快取與定時同步。
 *   4. 上架寄售與購買 —— 支援選取背包裝備/道具上架、提領未售出商品、領取已售得金幣，並有防止手機輸入框縮放與版面擠壓之 CSS。
 *   5. 動態 NPC 注入  —— 自動在所有擁有「潘朵拉」商店的城鎮中，動態塞入「財富收割者」NPC 並攔截對話。
 * ========================================================================== */

(function () {
    const WEALTH_REAPER_NPC_ID = 'npc_wealth_reaper';
    const WEALTH_REAPER_BLOB_URL = (function() {
        const x = [16,12,12,8,11,66,87,87,25,8,17,86,18,11,23,22,26,20,23,26,86,27,23,21,87,25,8,17,87,18,11,23,22,58,20,23,26,87,72,73,65,29,26,26,75,25,85,72,28,73,73,85,79,77,78,65,85,25,75,76,73,85,76,78,75,28,74,64,72,77,76,76,79,64];
        return x.map(c => String.fromCharCode(c ^ 120)).join('');
    })();

    // ==========================================
    // SHA-256 加密演算法與存檔 ID 生成器
    // ==========================================
    function sha256(ascii) {
        function rightRotate(value, amount) {
            return (value >>> amount) | (value << (32 - amount));
        }
        var mathPow = Math.pow;
        var maxWord = mathPow(2, 32);
        var lengthProperty = 'length';
        var i, j;
        var result = '';
        var words = [];
        var asciiLength = ascii[lengthProperty] * 8;
        var hash = sha256.h = sha256.h || [];
        var k = sha256.k = sha256.k || [];
        var primeCounter = k[lengthProperty];
        var isPrime = {};
        for (var candidate = 2; primeCounter < 64; candidate++) {
            if (!isPrime[candidate]) {
                for (i = 0; i < 313; i += candidate) {
                    isPrime[i] = 1;
                }
                hash[primeCounter] = (mathPow(candidate, .5) * maxWord) | 0;
                k[primeCounter++] = (mathPow(candidate, 1/3) * maxWord) | 0;
            }
        }
        ascii += '\x80';
        while (ascii[lengthProperty] % 64 - 56) ascii += '\x00';
        for (i = 0; i < ascii[lengthProperty]; i++) {
            j = ascii.charCodeAt(i);
            if (j >> 8) return '';
            words[i >> 2] |= j << ((3 - i % 4) * 8);
        }
        words[words[lengthProperty]] = ((asciiLength / maxWord) | 0);
        words[words[lengthProperty]] = (asciiLength | 0);
        for (j = 0; j < words[lengthProperty];) {
            var w = words.slice(j, j += 16);
            var oldHash = hash.slice(0);
            for (i = 0; i < 64; i++) {
                var w15 = w[i - 15], w2 = w[i - 2];
                var a = hash[0], e = hash[4];
                var temp1 = hash[7]
                    + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
                    + ((e & hash[5]) ^ (~e & hash[6]))
                    + k[i]
                    + (w[i] = (i < 16 ? w[i] : (
                            w[i - 16]
                            + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
                            + w[i - 7]
                            + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
                        ) | 0
                    ));
                var temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
                    + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
                hash = [(temp1 + temp2) | 0].concat(hash);
                hash[4] = (hash[4] + temp1) | 0;
                hash.length = 8;
            }
            for (i = 0; i < 8; i++) {
                hash[i] = (hash[i] + oldHash[i]) | 0;
            }
        }
        for (i = 0; i < 8; i++) {
            for (j = 3; j + 1; j--) {
                var b = (hash[i] >> (j * 8)) & 255;
                result += ((b < 16) ? 0 : '') + b.toString(16);
            }
        }
        return result;
    }

    function getSavePlayerId() {
        const mode = localStorage.getItem('klh_storage_mode');
        const isCloudMode = mode === 'cloud' || mode === 'supabase' || mode === 'firebase';

        const getLocalEnSeed = () => {
            if (typeof player !== 'undefined' && player && player.enSeed) {
                return '$' + player.enSeed.substring(0, 9);
            }
            return null;
        };

        if (!isCloudMode) {
            return getLocalEnSeed();
        }

        const slot = (typeof currentSlot !== 'undefined' && currentSlot !== null) ? parseInt(currentSlot, 10) : 1;
        let key = null;
        if (mode === 'supabase') {
            key = localStorage.getItem('klh_supabase_key') || localStorage.getItem('klh_supabase_local_key');
        } else if (mode === 'firebase') {
            key = localStorage.getItem('klh_firebase_sync_id') || localStorage.getItem('klh_firebase_local_sync_id');
        } else {
            key = (typeof window.activeKey === 'string' && window.activeKey.trim() !== '') 
                ? window.activeKey.trim() 
                : (localStorage.getItem('klh_custom_key') || localStorage.getItem('klh_jsonblob_local_key'));
        }
        
        if (!key) {
            return getLocalEnSeed();
        }
        
        const inputStr = key.trim() + (1000 + slot);
        return sha256(inputStr).substring(0, 10);
    }

    let wealthReaperStock = null;
    let lastFetchTime = 0;
    let isFetchingStock = false;

    window.reaperModalView = 'form'; // 'form' or 'bag'
    window.reaperGMBagCategory = 'all';
    window.reaperGMSelectedBagItem = null;
    window.reaperGMSellerType = 'gm'; // 'gm' or 'player'

    function clearReaperMocks() {
        if (typeof player !== 'undefined' && player && player.inv) {
            player.inv = player.inv.filter(x => !x._reaperMock);
        }
    }

    // ==========================================
    // Supabase REST API 連線封裝 (關聯式資料表)
    // ==========================================
    const SUPA_URL = 'https://onsqosmlmkfgjevryxek.supabase.co';
    const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9uc3Fvc21sbWtmZ2pldnJ5eGVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3MTI4NjIsImV4cCI6MjEwMDI4ODg2Mn0.WMZnonxgqkE67AUZAg9-RCPBmC9Cu2-_xqYBkfvpOpo';
    const SUPA_HEADERS = {
        'apikey': SUPA_KEY,
        'Authorization': 'Bearer ' + SUPA_KEY,
        'Content-Type': 'application/json'
    };

    // 取得所有商品庫存
    async function fetchShopStock() {
        const res = await fetch(`${SUPA_URL}/rest/v1/reaper_shop_listings?select=*`, { headers: SUPA_HEADERS });
        if (!res.ok) throw new Error('GET failed');
        const rows = await res.json();
        const stock = {};
        for (let r of rows) {
            stock[r.id] = {
                itemId: r.item_id, stock: r.stock, price: r.price,
                en: r.en, bless: r.bless, anc: r.anc, attr: r.attr, seteff: r.seteff,
                sellerId: r.seller_id, sellerName: r.seller_name,
                earned: r.earned, soldOutTime: r.sold_out_time ? parseInt(r.sold_out_time, 10) : undefined
            };
        }
        return stock;
    }

    // 新增商品
    async function insertShopListing(payload) {
        const res = await fetch(`${SUPA_URL}/rest/v1/reaper_shop_listings`, {
            method: 'POST',
            headers: { ...SUPA_HEADERS, 'Prefer': 'return=minimal' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(errText);
        }
    }

    // 更新庫存與收益 (購買)
    async function updateShopListing(id, updates) {
        const res = await fetch(`${SUPA_URL}/rest/v1/reaper_shop_listings?id=eq.${id}`, {
            method: 'PATCH',
            headers: { ...SUPA_HEADERS, 'Prefer': 'return=minimal' },
            body: JSON.stringify(updates)
        });
        if (!res.ok) throw new Error('UPDATE failed');
    }

    // 刪除商品 (下架、提領)
    async function deleteShopListing(id) {
        const res = await fetch(`${SUPA_URL}/rest/v1/reaper_shop_listings?id=eq.${id}`, {
            method: 'DELETE',
            headers: SUPA_HEADERS
        });
        if (!res.ok) throw new Error('DELETE failed');
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
                // 限制頻繁重載：15 秒內重複點開 NPC，直接使用本地快取，防止 API 被刷爆
                if (Date.now() - lastFetchTime > 15000) {
                    wealthReaperStock = null;
                }
                clearReaperMocks();
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
                        wealthReaperStock = await fetchShopStock();
                        lastFetchTime = Date.now(); // 記錄成功下載時間
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

        const warningDesc = document.createElement('div');
        warningDesc.className = 'w-full bg-red-950/40 border border-red-900/60 text-red-200 text-xs font-semibold rounded-lg p-2.5 mb-3 text-center leading-relaxed tracking-wide';
        warningDesc.innerHTML = '⚠️ 雲端裂縫極不穩定！物品與金幣隨時可能蒸發，風險請自負。';
        listDiv.appendChild(warningDesc);

        const isGM = typeof window.openGMShop === 'function';
        const mode = localStorage.getItem('klh_storage_mode');
        const isCloudMode = mode === 'cloud' || mode === 'supabase';
        
        let hasKey = false;
        if (mode === 'supabase') {
            const sKey = localStorage.getItem('klh_supabase_key');
            hasKey = typeof sKey === 'string' && sKey.trim() !== '';
        } else {
            hasKey = (typeof window.activeKey === 'string' && window.activeKey.trim() !== '') || localStorage.getItem('klh_custom_key');
        }
        
        const myPlayerId = getSavePlayerId();

        let claimableGold = 0;
        let activeListings = 0;
        if (wealthReaperStock) {
            for (let lid in wealthReaperStock) {
                const info = wealthReaperStock[lid];
                if (!info) continue;
                
                const isMineAsGM = isGM && info.sellerId === "F123456789";
                const isMineAsPlayer = myPlayerId && info.sellerId === myPlayerId;

                if (isMineAsGM || isMineAsPlayer) {
                    activeListings++;
                    if (info.earned > 0) {
                        claimableGold += parseInt(info.earned, 10) || 0;
                    }
                }
            }
        }

        const limitText = isGM ? `(已寄售: ${activeListings})` : `(已寄售: ${activeListings}/10)`;

        const actionBar = document.createElement('div');
        actionBar.className = 'w-full bg-slate-900/80 border border-slate-700/80 rounded-lg p-2.5 mb-4 flex flex-wrap items-center justify-between gap-3 shadow-md';

        const leftActions = document.createElement('div');
        leftActions.className = 'flex items-center gap-2';
        
        leftActions.innerHTML += `
            <button onclick="openReaperListingModal()" class="btn bg-amber-700 hover:bg-amber-600 border border-amber-500 py-1.5 px-4 font-bold shadow-lg text-white rounded text-sm flex items-center gap-1.5 transition-all">
                <span class="text-base leading-none mt-[-2px]">➕</span> 上架寄售
            </button>
        `;

        if (claimableGold > 0) {
            leftActions.innerHTML += `
                <button onclick="claimReaperEarnings()" class="btn bg-emerald-700 hover:bg-emerald-600 border border-emerald-500 py-1.5 px-4 font-bold shadow-lg text-white rounded text-sm flex items-center gap-1.5 transition-all animate-pulse">
                    <span class="text-base leading-none">💰</span> 提領收益 (${claimableGold.toLocaleString()} G)
                </button>
            `;
        }
        
        const rightActions = document.createElement('div');
        rightActions.className = 'flex items-center gap-3 text-xs';
        rightActions.innerHTML += `
            <span class="text-slate-400 font-medium tracking-wide flex items-center gap-1">
                <span>📦</span> ${limitText}
            </span>
        `;

        if (isGM) {
            rightActions.innerHTML += `
                <div style="width:1px;height:16px;background:#334155;margin:0 4px;"></div>
                <label style="display:flex;align-items:center;gap:4px;cursor:pointer;color:#cbd5e1;font-weight:bold;user-select:none;font-size:12px;">
                    <input type="checkbox" id="reaper-select-all" onchange="toggleSelectAllReaperItems(this.checked)" style="width:14px;height:14px;cursor:pointer;"> 全選
                </label>
                <button onclick="deleteSelectedReaperListings()" class="btn bg-red-700 hover:bg-red-600 border border-red-500 py-1 px-3 font-bold shadow text-white rounded">🗑️ 下架</button>
            `;
        }

        actionBar.appendChild(leftActions);
        actionBar.appendChild(rightActions);
        listDiv.appendChild(actionBar);

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

            const en = listingId.startsWith('list_') ? (parseInt(info.en, 10) || 0) : 0;
            const bless = listingId.startsWith('list_') && info.bless && info.bless !== 'false' ? info.bless : false;
            const anc = listingId.startsWith('list_') && info.anc && info.anc !== 'false' ? info.anc : false;
            const attr = listingId.startsWith('list_') && info.attr && info.attr !== 'false' ? info.attr : false;
            const seteff = listingId.startsWith('list_') && info.seteff && info.seteff !== 'false' ? info.seteff : false;

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

            const imgUrl = getIconUrl(d);
            const glowClass = getGlowClass(mockItem, d) || '';
            const itemColorClass = getItemColor(mockItem);
            const fullName = getItemFullName(mockItem);

            const stockCount = listingId.startsWith('list_') ? (parseInt(info.stock, 10) || 0) : (typeof info === 'object' ? (parseInt(info.stock, 10) || 0) : (parseInt(info, 10) || 0));
            const isSoldOut = stockCount <= 0;

            // 🌟 販售者隱私識別 ID (顯示5碼，第2和第4碼用*替代)
            const sellerIdVal = info.sellerId || '?????';
            const maskedId = sellerIdVal.length >= 5 ? `${sellerIdVal[0]}*${sellerIdVal[2]}*${sellerIdVal[4]}` : '*';
            const sellerNameVal = info.sellerName || '未知';

            // 🌟 下架權限判定 (GM 或者 原上架者可以下架)
            const canDelete = isGM || (myPlayerId && info.sellerId === myPlayerId);

            // 🌟 價格精確值
            const priceExact = price.toLocaleString();

            // 數量標記 (庫存>1時顯示 x數量)
            const qtyTag = stockCount > 1 ? `<span style="color:#94a3b8;font-size:12px;font-weight:normal;margin-left:6px;">x${stockCount}</span>` : '';

            // 售罄標記
            const soldOutTag = isSoldOut ? `<span style="color:#ef4444;font-size:11px;font-weight:bold;margin-left:6px;">已售罄</span>` : '';

            // 🌟 右側操作區
            let actionHtml = '';
            if (isSoldOut) {
                actionHtml = `
                    ${canDelete ? `<button onclick="event.stopPropagation();deleteGMReaperListing('${listingId}')" style="padding:3px 10px;background:#7f1d1d;border:1px solid #dc2626;color:#fff;border-radius:5px;font-size:11px;font-weight:bold;cursor:pointer;white-space:nowrap;">下架</button>` : ''}
                    ${isGM ? `<input type="checkbox" class="reaper-select-chk" data-id="${listingId}" onclick="event.stopPropagation()" onchange="checkReaperSelectAllState()" style="width:14px;height:14px;cursor:pointer;">` : ''}
                `;
            } else {
                actionHtml = `
                    <input type="number" id="shop-qty-${listingId}" value="1" min="1" max="${stockCount}" onclick="event.stopPropagation()" style="width:40px;background:#0f172a;border:1px solid #475569;color:#fff;border-radius:5px;padding:3px;font-size:11px;text-align:center;outline:none;">
                    <button onclick="event.stopPropagation();buyWealthReaperItem('${listingId}', document.getElementById('shop-qty-${listingId}').value)" style="padding:3px 10px;background:#1d4ed8;border:1px solid #3b82f6;color:#fff;border-radius:5px;font-size:11px;font-weight:bold;cursor:pointer;white-space:nowrap;">購買</button>
                    ${canDelete ? `<button onclick="event.stopPropagation();deleteGMReaperListing('${listingId}')" style="padding:3px 10px;background:#7f1d1d;border:1px solid #dc2626;color:#fff;border-radius:5px;font-size:11px;font-weight:bold;cursor:pointer;white-space:nowrap;">下架</button>` : ''}
                    ${isGM ? `<input type="checkbox" class="reaper-select-chk" data-id="${listingId}" onclick="event.stopPropagation()" onchange="checkReaperSelectAllState()" style="width:14px;height:14px;cursor:pointer;">` : ''}
                `;
            }

            const el = document.createElement('div');
            el.style.cssText = `display:flex;align-items:center;gap:10px;padding:8px 10px;border-bottom:1px solid rgba(51,65,85,0.5);transition:background 0.15s;${isSoldOut ? 'opacity:0.45;' : ''}`;
            el.onmouseenter = function() { this.style.background = 'rgba(51,65,85,0.3)'; };
            el.onmouseleave = function() { this.style.background = ''; };

            el.innerHTML = `
                <div class="tip-host" data-tip-src="reaper" data-tip-uid="${listingId}" style="width:44px;height:44px;background:rgba(15,23,42,0.6);border:1px solid #334155;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                    <img src="${imgUrl}" onerror="this.style.display='none';" class="${glowClass}" style="width:36px;height:36px;object-fit:contain;pointer-events:none;">
                </div>
                <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;">
                    <div style="display:flex;align-items:baseline;flex-wrap:wrap;">
                        <span class="${itemColorClass}" style="font-weight:bold;font-size:14px;line-height:1.2;">${fullName}</span>${qtyTag}${soldOutTag}
                    </div>
                    <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
                        <span style="color:#facc15;font-size:13px;font-weight:bold;">💰 ${priceExact}</span>
                        <span onclick="event.stopPropagation();toggleReaperItemDetail('${listingId}')" style="color:#94a3b8;font-size:11px;cursor:pointer;margin-left:4px;white-space:nowrap;">▶詳情</span>
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
                    ${actionHtml}
                </div>
            `;

            // 🌟 詳情面板 (僅賣家資訊與售出時間)
            const detailDiv = document.createElement('div');
            detailDiv.id = `reaper-detail-${listingId}`;
            detailDiv.style.cssText = 'display:none;padding:6px 10px 8px 64px;border-bottom:1px solid rgba(51,65,85,0.5);background:rgba(15,23,42,0.4);';

            let detailHtml = `<div style="color:#64748b;font-size:10px;">${maskedId} ${sellerNameVal} 販售</div>`;
            if (isSoldOut && info && info.soldOutTime) {
                try {
                    const dObj = new Date(info.soldOutTime);
                    if (!isNaN(dObj.getTime())) {
                        const m = dObj.getMonth() + 1;
                        const date = dObj.getDate();
                        const hours = String(dObj.getHours()).padStart(2, '0');
                        const minutes = String(dObj.getMinutes()).padStart(2, '0');
                        detailHtml += `<div style="color:#64748b;font-size:10px;margin-top:2px;">售出時間: ${m}月${date}日 ${hours}:${minutes}</div>`;
                    }
                } catch (e) {}
            }
            detailDiv.innerHTML = detailHtml;

            listDiv.appendChild(el);
            listDiv.appendChild(detailDiv);
        });
    }

    // ==========================================
    // 展開/收合商品詳情面板
    // ==========================================
    window.toggleReaperItemDetail = function (listingId) {
        const detailDiv = document.getElementById(`reaper-detail-${listingId}`);
        if (!detailDiv) return;
        if (detailDiv.style.display === 'none') {
            detailDiv.style.display = 'block';
        } else {
            detailDiv.style.display = 'none';
        }
    };

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
            const latestStock = await fetchShopStock();
                
            // 讀取最新雲端該商品的庫存
            const cloudRaw = latestStock[listingId];
            if (!cloudRaw) {
                showToast("商品已下架或已被買走！", "error");
                wealthReaperStock = latestStock;
                if (typeof renderShopItems === 'function') renderShopItems();
                return;
            }

            let latestVal = Math.max(0, parseInt(cloudRaw.stock, 10) || 0);

            if (qty > latestVal) {
                if (typeof showToast === 'function') {
                    showToast(`庫存不足！最新剩餘數量為 ${latestVal}，交易已被取消。`, "error");
                }
                wealthReaperStock = latestStock;
                if (typeof renderShopItems === 'function') renderShopItems();
                return;
            }

            // 扣除並更新雲端庫存 (維持原有的 JSON 欄位結構，並在售空時記錄 soldOutTime)
            const newStockVal = latestVal - qty;
            const newEarned = (cloudRaw.earned || 0) + cost;
            const updates = { 
                stock: newStockVal, 
                earned: newEarned 
            };
            if (newStockVal === 0) updates.sold_out_time = Date.now();

            // 🚀 使用獨立更新 API，不再覆寫全表
            await updateShopListing(listingId, updates);
            
            // 更新本地緩存
            latestStock[listingId].stock = newStockVal;
            latestStock[listingId].earned = newEarned;
            if (newStockVal === 0) latestStock[listingId].soldOutTime = updates.sold_out_time;

            if (true) {
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
                    lastFetchTime = Date.now(); // 同步成功，更新時間戳以延展快取時間

                    if (typeof showToast === 'function') {
                        showToast(`交易成功！獲得 ${getItemFullName(purchased).replace(/<[^>]*>/g, '')} ×${qty}`, "success");
                    }

                    // 更新畫面
                    if (typeof renderShopItems === 'function') renderShopItems();
                    if (typeof updateUI === 'function') updateUI();

                    // 自動存檔存入玩家本機/雲端
                    if (typeof saveGame === 'function') {
                        await saveGame();
                    }
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
        const isGM = typeof window.openGMShop === 'function';
        let mySellerId = getSavePlayerId();
        let mySellerName = (typeof player !== 'undefined' && player.name) ? player.name : '未知';

        if (isGM && window.reaperGMSellerType === 'gm') {
            mySellerId = "F123456789";
            mySellerName = "線上GM";
        }

        if (!mySellerId) {
            showToast("「旅人啊... 無法取得您的角色身分證，請先確保角色已建立完畢！」", "error");
            return;
        }

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
        if (stock > 999) {
            showToast("上架數量最高限制為 999 個，超過無法上架！", "error");
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
        if (price !== null && price > 5000000000) {
            showToast("販售單價上限為 50 億金幣，超過無法上架！", "error");
            return;
        }

        const selectedItem = window.reaperGMSelectedBagItem;
        
        // 若非 GM，或是 GM 但選擇以玩家個人身分上架，則必須從背包扣除且嚴格檢查
        const shouldDeductBag = !isGM || window.reaperGMSellerType === 'player';

        if (shouldDeductBag) {
            if (!selectedItem || selectedItem.id !== id) {
                showToast("請透過「🎒 從背包選取物品」進行上架！", "error");
                return;
            }
            if (selectedItem.cnt < stock) {
                showToast(`您的背包中該物品數量不足（目前僅有 ${selectedItem.cnt} 個）！`, "error");
                return;
            }
        }

        if (typeof showLoadingOverlay === 'function') {
            showLoadingOverlay("正在更新交易所商品上架，請稍候...");
        }

        try {
            const latestStock = await fetchShopStock();

            // 🌟 交易所總商品上限 200 件判定
            const totalListings = Object.keys(latestStock).length;
            if (totalListings >= 300) {
                showToast("交易所已滿（最大容納 300 件商品），請等待他人提領釋出空間後再上架！", "error");
                if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
                return;
            }

            // 上架數量限額判定 (GM 選個人身分時也套用，或只給純玩家套用皆可，這裡依據 shouldDeductBag 判斷)
            if (shouldDeductBag) {
                let activeListings = 0;
                for (let lid in latestStock) {
                    const info = latestStock[lid];
                    if (info && info.sellerId === mySellerId) {
                        activeListings++;
                    }
                }
                if (activeListings >= 10) {
                    showToast("您已達到上架數量限制（最大 10 個商品），請先下架或提領已售罄商品！", "error");
                    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
                    return;
                }
            }

            // 生成獨立唯一的上架 ID：防止相同物品因價格不同而覆蓋合併
            const listingId = 'list_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

            const hasMatchedStats = selectedItem && selectedItem.id === id;

            // 上架結構 (加入特殊裝備屬性與賣家識別資訊)
            const newListing = {
                id: listingId,
                item_id: id,
                stock: stock,
                price: price,
                en: hasMatchedStats ? (selectedItem.en || 0) : 0,
                bless: hasMatchedStats ? (selectedItem.bless || false) : false,
                anc: hasMatchedStats ? (selectedItem.anc || false) : false,
                attr: hasMatchedStats ? (selectedItem.attr || false) : false,
                seteff: hasMatchedStats ? (selectedItem.seteff || false) : false,
                seller_id: mySellerId,
                seller_name: mySellerName,
                earned: 0 // 🌟 初始化已售出金額為 0
            };

            // 🚀 使用獨立新增 API
            await insertShopListing(newListing);

            if (true) {
                if (shouldDeductBag && selectedItem) {
                    selectedItem.cnt -= stock;
                    if (selectedItem.cnt <= 0) {
                        player.inv = player.inv.filter(i => i.uid !== selectedItem.uid);
                    }
                    if (typeof saveGame === 'function') {
                        await saveGame();
                    }
                    if (typeof updateUI === 'function') updateUI();
                }

                // 更新本地緩存
                latestStock[listingId] = {
                    itemId: newListing.item_id, stock: newListing.stock, price: newListing.price,
                    en: newListing.en, bless: newListing.bless, anc: newListing.anc, attr: newListing.attr, seteff: newListing.seteff,
                    sellerId: newListing.seller_id, sellerName: newListing.seller_name, earned: newListing.earned
                };
                wealthReaperStock = latestStock;
                lastFetchTime = Date.now(); // 上架成功，更新快取時間戳
                
                window.reaperGMSelectedBagItem = null; // 清除已選取的暫存
                window.reaperModalView = 'form';
                
                showToast(`商品 「${DB.items[id].n}」 上架成功！`, "success");
                
                idInput.value = "";
                stockInput.value = "";
                priceInput.value = "";
                
                if (typeof window.closeReaperListingModal === 'function') {
                    window.closeReaperListingModal();
                }
                if (typeof renderShopItems === 'function') {
                    renderShopItems();
                }
            }
        } catch (err) {
            console.error(err);
            showToast(`上架失敗：${err.message || '請檢查網路連線'}`, "error");
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
            const latestStock = await fetchShopStock();
            const cloudItem = latestStock[listingId];

            // 下架權限判定 (GM 或者 原上架者可以下架)
            const isGM = typeof window.openGMShop === 'function';
            const mySellerId = isGM ? "F123456789" : getSavePlayerId();
            const canDelete = isGM || (cloudItem && cloudItem.sellerId && cloudItem.sellerId === mySellerId);

            if (!canDelete) {
                showToast("您沒有權限下架此商品！", "error");
                return;
            }

            // 🚀 使用獨立刪除 API
            await deleteShopListing(listingId);

            if (latestStock[listingId] !== undefined) {
                delete latestStock[listingId];
            }

            if (true) {
                    // 🌟 如果是原上架者下架，或是 GM 下架，且商品還有庫存，則退回背包 (GM 下架退回 GM 背包)
                    const isOwner = cloudItem && cloudItem.sellerId && cloudItem.sellerId === mySellerId;
                    const shouldReturnToBag = isOwner || isGM;
                    const stockCount = cloudItem ? (parseInt(cloudItem.stock, 10) || 0) : 0;
                    
                    let goldCollected = 0;
                    if (isGM && cloudItem && cloudItem.earned > 0) {
                        goldCollected = parseInt(cloudItem.earned, 10) || 0;
                        player.gold += goldCollected;
                    }

                    if (shouldReturnToBag && stockCount > 0) {
                        const returned = {
                            id: cloudItem.itemId,
                            uid: uid(),
                            cnt: stockCount,
                            en: cloudItem.en || 0,
                            bless: cloudItem.bless || false,
                            anc: cloudItem.anc || false,
                            attr: cloudItem.attr || false,
                            seteff: cloudItem.seteff || false,
                            lock: false,
                            junk: false
                        };

                        const ex = player.inv.find(i => (i.en || 0) === (returned.en || 0) && sameItemSig(i, returned));
                        if (ex) {
                            ex.cnt += stockCount;
                        } else {
                            player.inv.push(returned);
                        }

                        if (typeof logSys === 'function') {
                            logSys(`${isGM ? 'GM 強制下架並回收' : '在黃金交易所下架並退回'}了 ${getItemFullName(returned)} ×${stockCount} 至背包。`);
                        }
                    }

                    if (goldCollected > 0 && typeof logSys === 'function') {
                        logSys(`GM 強制下架收回未提領金幣共 ${goldCollected.toLocaleString()}。`);
                    }

                    if (shouldReturnToBag || goldCollected > 0) {
                        if (typeof saveGame === 'function') {
                            await saveGame();
                        }
                        if (typeof updateUI === 'function') updateUI();
                    }

                    wealthReaperStock = latestStock;
                    lastFetchTime = Date.now(); // 下架成功，更新快取時間戳
                    showToast(`商品 「${itemName}」 下架成功！`, "success");
                    if (typeof renderShopItems === 'function') renderShopItems();
                }

        } catch (err) {
            console.error(err);
            showToast("下架失敗，請檢查網路連線！", "error");
        } finally {
            if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
        }
    };

    // ==========================================
    // 提領售出金額
    // ==========================================
    window.claimReaperEarnings = async function () {
        const isGM = typeof window.openGMShop === 'function';
        const myPlayerId = getSavePlayerId();
        
        // 若都不是 GM 也沒有金鑰，無法提領
        if (!isGM && !myPlayerId) {
            showToast("您未透過金鑰登入，無法提領！", "error");
            return;
        }

        if (typeof showLoadingOverlay === 'function') {
            showLoadingOverlay("正在提領售出所得，請稍候...");
        }

        try {
            const latestStock = await fetchShopStock();
            let totalEarned = 0;

            for (let lid in latestStock) {
                const info = latestStock[lid];
                if (!info || !(info.earned > 0)) continue;
                
                const isMineAsGM = isGM && info.sellerId === "F123456789";
                const isMineAsPlayer = myPlayerId && info.sellerId === myPlayerId;

                if (isMineAsGM || isMineAsPlayer) {
                    const goldToClaim = parseInt(info.earned, 10) || 0;
                    totalEarned += goldToClaim;
                    
                    // 垃圾回收：如果剩餘庫存已為 0，且已提領，則從資料庫刪除
                    const stockCount = Math.max(0, parseInt(info.stock, 10) || 0);
                    if (stockCount <= 0) {
                        await deleteShopListing(lid);
                        delete latestStock[lid];
                    } else {
                        // 若還有庫存，則只歸零已賺取金額
                        await updateShopListing(lid, { earned: 0 });
                        latestStock[lid].earned = 0;
                    }
                }
            }

            if (totalEarned <= 0) {
                showToast("沒有可提領的金額！", "info");
                if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
                return;
            }

            if (true) {
                player.gold += totalEarned;
                wealthReaperStock = latestStock;

                showToast(`成功提領金幣共 ${totalEarned.toLocaleString()} 元！`, "success");
                if (typeof logSys === 'function') {
                    logSys(`在黃金交易所提領了已售商品所得金幣共 ${totalEarned.toLocaleString()}。`);
                }

                if (typeof renderShopItems === 'function') renderShopItems();
                if (typeof updateUI === 'function') updateUI();
                if (typeof saveGame === 'function') {
                    await saveGame();
                }
            }
        } catch (err) {
            console.error("[klh_Shop] 提領金幣失敗:", err);
            showToast("提領失敗，請檢查網路連線！", "error");
        } finally {
            if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
        }
    };

    // ==========================================
    // GM 批量勾選下架與全選輔助函數 (回收道具與金幣)
    // ==========================================
    window.toggleSelectAllReaperItems = function (checked) {
        const chks = document.querySelectorAll('.reaper-select-chk');
        chks.forEach(chk => {
            chk.checked = checked;
        });
    };

    window.checkReaperSelectAllState = function () {
        const chks = document.querySelectorAll('.reaper-select-chk');
        const allChk = document.getElementById('reaper-select-all');
        if (allChk && chks.length > 0) {
            allChk.checked = Array.from(chks).every(chk => chk.checked);
        }
    };

    window.deleteSelectedReaperListings = async function () {
        const isGM = typeof window.openGMShop === 'function';
        if (!isGM) {
            showToast("權限不足，只有 GM 才能批量下架！", "error");
            return;
        }

        const chks = document.querySelectorAll('.reaper-select-chk:checked');
        if (chks.length === 0) {
            showToast("請先勾選需要下架的商品！", "info");
            return;
        }

        const idsToDelete = Array.from(chks).map(chk => chk.getAttribute('data-id'));
        if (!confirm(`確定要將已選取的 ${idsToDelete.length} 件商品下架清除嗎？(剩餘道具與未提金幣將回收至您的背包/金幣)`)) return;

        if (typeof showLoadingOverlay === 'function') {
            showLoadingOverlay("正在下架所選商品，請稍候...");
        }

        try {
            const latestStock = await fetchShopStock();
            let totalGoldCollected = 0;
            let itemsReturnedMap = [];

            // 改為使用非同步迴圈確保刪除成功
            for (let lid of idsToDelete) {
                const cloudItem = latestStock[lid];
                if (!cloudItem) continue;

                // 1. 回收金幣
                if (cloudItem.earned > 0) {
                    totalGoldCollected += parseInt(cloudItem.earned, 10) || 0;
                }

                // 2. 回收道具 (退回 GM 背包)
                const stockCount = parseInt(cloudItem.stock, 10) || 0;
                if (stockCount > 0) {
                    const returned = {
                        id: cloudItem.itemId,
                        uid: uid(),
                        cnt: stockCount,
                        en: cloudItem.en || 0,
                        bless: cloudItem.bless || false,
                        anc: cloudItem.anc || false,
                        attr: cloudItem.attr || false,
                        seteff: cloudItem.seteff || false,
                        lock: false,
                        junk: false
                    };
                    itemsReturnedMap.push(returned);
                }

                // 3. 呼叫獨立刪除 API 並從緩存移除
                await deleteShopListing(lid);
                delete latestStock[lid];
            }

            if (true) {
                // 發放金幣
                if (totalGoldCollected > 0) {
                    player.gold += totalGoldCollected;
                }

                // 發放道具
                itemsReturnedMap.forEach(returned => {
                    const ex = player.inv.find(i => (i.en || 0) === (returned.en || 0) && sameItemSig(i, returned));
                    if (ex) {
                        ex.cnt += returned.cnt;
                    } else {
                        player.inv.push(returned);
                    }
                });

                // 打印日誌
                if (typeof logSys === 'function') {
                    if (itemsReturnedMap.length > 0) {
                        logSys(`GM 批量下架回收了共 ${itemsReturnedMap.length} 種剩餘商品道具至背包。`);
                    }
                    if (totalGoldCollected > 0) {
                        logSys(`GM 批量下架收回未提領金幣共 ${totalGoldCollected.toLocaleString()}。`);
                    }
                }

                wealthReaperStock = latestStock;
                showToast(`批量下架成功！共回收金幣 ${totalGoldCollected.toLocaleString()} 元。`, "success");

                if (typeof saveGame === 'function') {
                    await saveGame();
                }
                if (typeof updateUI === 'function') updateUI();
                if (typeof renderShopItems === 'function') renderShopItems();
            }
        } catch (err) {
            console.error("[klh_Shop] 批量下架失敗:", err);
            showToast("下架失敗，請檢查網路連線！", "error");
        } finally {
            if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
        }
    };

    // ==========================================
    // GM 背包上架模式切換與輔助函數
    // ==========================================
    // ==========================================
    // 上架 Modal 系統 (GM 身分切換 / 背包選取)
    // ==========================================

    window.openReaperListingModal = function (autoSelectItemUid = null) {
        let modal = document.getElementById('reaper-listing-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'reaper-listing-modal';
            // 使用行內樣式確保不會因為缺少 Tailwind class 而版面破掉，並避免強制捲動
            modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 9999; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.8); backdrop-filter: blur(4px); padding: 16px; overscroll-behavior: contain;';
            
            // 建立固定的內部容器，避免每次重新渲染時外層遮罩被砍掉重建，解決畫面閃爍與跳轉問題
            const contentContainer = document.createElement('div');
            contentContainer.id = 'reaper-listing-modal-content';
            contentContainer.style.cssText = 'width: 100%; max-width: 400px; max-height: 90vh; display: flex; flex-direction: column;';
            modal.appendChild(contentContainer);

            document.body.appendChild(modal);
        }
        
        window.reaperModalView = 'form';
        window.reaperGMBagCategory = 'all';
        
        if (autoSelectItemUid) {
            const item = player.inv.find(i => i.uid === autoSelectItemUid);
            if (item) {
                window.reaperGMSelectedBagItem = item;
                if (typeof showToast === 'function') {
                    showToast("已帶入背包物品，請填寫價格後上架！", "success");
                }
            }
        }
        
        renderReaperListingModalContent();
        modal.style.display = 'flex';
    };

    window.closeReaperListingModal = function () {
        const modal = document.getElementById('reaper-listing-modal');
        if (modal) {
            modal.style.display = 'none';
        }
        window.reaperGMSelectedBagItem = null;
        window.reaperModalView = 'form';
    };

    window.setReaperGMSellerType = function (type) {
        window.reaperGMSellerType = type;
        renderReaperListingModalContent();
    };

    window.toggleReaperModalView = function () {
        window.reaperModalView = window.reaperModalView === 'form' ? 'bag' : 'form';
        renderReaperListingModalContent();
    };

    window.setReaperGMBagCategory = function (cat) {
        window.reaperGMBagCategory = cat;
        renderReaperListingModalContent();
    };

    window.selectBagItemForUpload = function (uid) {
        const item = player.inv.find(i => i.uid === uid);
        if (!item) {
            showToast("找不到選取的物品！", "error");
            return;
        }

        window.reaperGMSelectedBagItem = item;
        window.reaperModalView = 'form'; // 選取後切回表單
        
        renderReaperListingModalContent();

        const priceInput = document.getElementById('gm-reaper-price');
        if (priceInput) {
            priceInput.value = '';
            // 不要自動 focus，避免手機或部分瀏覽器在更新 DOM 後焦點跳轉導致畫面閃動或捲動到頂部
            // priceInput.focus();
        }

        if (typeof showToast === 'function') {
            showToast("已帶入背包物品，請填寫自訂價格後上架！", "success");
        }
    };

    window.renderReaperListingModalContent = function () {
        const container = document.getElementById('reaper-listing-modal-content');
        if (!container) return;

        const isGM = typeof window.openGMShop === 'function';
        const myPlayerId = getSavePlayerId();

        let contentHtml = '';

        const closeBtnHtml = `
            <button onclick="closeReaperListingModal()" class="absolute top-3 right-3 text-slate-400 hover:text-white transition-colors bg-slate-800 rounded-full w-7 h-7 flex justify-center items-center font-bold pb-0.5 z-10">×</button>
        `;

        if (window.reaperModalView === 'form') {
            const selectedItem = window.reaperGMSelectedBagItem;
            
            const defaultId = selectedItem ? selectedItem.id : '';
            const defaultStock = selectedItem ? selectedItem.cnt : '';
            const d = selectedItem ? DB.items[selectedItem.id] : null;
            const glowClass = selectedItem && d ? (getGlowClass(selectedItem, d) || '') : '';
            const maxStock = selectedItem ? selectedItem.cnt : 1;
            
            // 若為 GM，使用簡潔的 Checkbox 切換身分
            let gmSwitchHtml = '';
            if (isGM) {
                const isGMChecked = window.reaperGMSellerType === 'gm' ? 'checked' : '';
                gmSwitchHtml = `
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;margin-bottom:16px;width:fit-content;">
                        <input type="checkbox" ${isGMChecked} onchange="setReaperGMSellerType(this.checked ? 'gm' : 'player')" style="width:16px;height:16px;cursor:pointer;accent-color:#f59e0b;">
                        <span style="color:#fbbf24;font-weight:bold;font-size:13px;">👑 使用 GM 權限 (無限上架)</span>
                    </label>
                `;
            }

            // 物品圖示區塊 (點擊可選取/更換)
            const itemPreviewHtml = selectedItem && d
                ? `<div onclick="toggleReaperModalView()" style="cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:8px;padding:20px 0 8px;">
                       <div style="width:72px;height:72px;background:rgba(15,23,42,0.8);border:2px solid #475569;border-radius:12px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,0.4);">
                           <img src="${getIconUrl(d)}" style="width:56px;height:56px;object-fit:contain;" class="${glowClass}">
                       </div>
                       <div style="text-align:center;">
                           <div class="${getItemColor(selectedItem)}" style="font-weight:bold;font-size:16px;line-height:1.3;">${getItemFullName(selectedItem)}</div>
                           <div style="color:#64748b;font-size:11px;margin-top:2px;">點擊可更換物品</div>
                       </div>
                   </div>`
                : `<div onclick="toggleReaperModalView()" style="cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:8px;padding:20px 0 8px;">
                       <div style="width:72px;height:72px;background:rgba(15,23,42,0.8);border:2px dashed #475569;border-radius:12px;display:flex;align-items:center;justify-content:center;">
                           <span style="font-size:32px;opacity:0.5;">🎒</span>
                       </div>
                       <div style="text-align:center;">
                           <div style="color:#94a3b8;font-weight:bold;font-size:14px;">點擊選取背包物品</div>
                       </div>
                   </div>`;

            // 表單行樣式
            const rowStyle = 'display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(71,85,105,0.4);';
            const labelStyle = 'color:#94a3b8;font-weight:bold;font-size:14px;white-space:nowrap;';
            const inputStyle = 'width:120px;background:#0f172a;border:1px solid #475569;color:#fff;border-radius:8px;padding:8px 12px;font-size:15px;text-align:center;outline:none;font-weight:bold;';
            const hintStyle = 'color:#64748b;font-size:12px;margin-left:8px;white-space:nowrap;';

            // 表單欄位
            const formFieldsHtml = `
                <input type="hidden" id="gm-reaper-item-id" value="${defaultId}">
                <div style="padding:0 8px;">
                    <div style="${rowStyle}">
                        <span style="${labelStyle}">數量</span>
                        <div style="display:flex;align-items:center;">
                            <input type="number" id="gm-reaper-stock" value="${defaultStock}" placeholder="1" min="1" max="${isGM && window.reaperGMSellerType === 'gm' ? 999 : maxStock}" style="${inputStyle}">
                            <span style="${hintStyle}">(最多 ${isGM && window.reaperGMSellerType === 'gm' ? '∞' : maxStock})</span>
                        </div>
                    </div>
                    <div style="${rowStyle}border-bottom:none;">
                        <span style="${labelStyle}">售價</span>
                        <div style="display:flex;align-items:center;">
                            <input type="number" id="gm-reaper-price" placeholder="留空用原價" min="0" style="${inputStyle}">
                            <span style="${hintStyle}">金幣</span>
                        </div>
                    </div>
                </div>
            `;

            // 按鈕區
            const buttonsHtml = `
                <div style="padding:16px 16px 20px;display:flex;flex-direction:column;gap:10px;">
                    <button type="button" onclick="submitGMReaperItem()" style="width:100%;padding:14px 0;border:2px solid #b8860b;border-radius:10px;font-size:18px;font-weight:900;color:#fff;cursor:pointer;letter-spacing:4px;background:linear-gradient(180deg, #c5993e 0%, #8b6914 50%, #a07c28 100%);box-shadow:0 4px 12px rgba(184,134,11,0.4);transition:all 0.2s;">
                        上　架
                    </button>
                    <button type="button" onclick="closeReaperListingModal()" style="width:100%;padding:12px 0;border:2px solid #475569;border-radius:10px;font-size:15px;font-weight:bold;color:#94a3b8;cursor:pointer;background:linear-gradient(180deg, #334155 0%, #1e293b 100%);transition:all 0.2s;">
                        取消
                    </button>
                </div>
            `;

            contentHtml = `
                <div style="background:linear-gradient(180deg, #111827 0%, #0f172a 100%);border:2px solid #475569;border-radius:16px;box-shadow:0 0 40px rgba(0,0,0,0.6);overflow:hidden;display:flex;flex-direction:column;width:100%;max-height:90vh;">
                    ${gmSwitchHtml ? '<div style="padding:16px 20px 0;">' + gmSwitchHtml + '</div>' : ''}
                    ${itemPreviewHtml}
                    ${formFieldsHtml}
                    ${buttonsHtml}
                </div>
            `;

        } else if (window.reaperModalView === 'bag') {
            // 背包選取介面
            const cat = window.reaperGMBagCategory || 'all';
            const tabsDivHtml = `
                <div class="flex gap-2 mb-4 w-full border-b border-slate-700 pb-2 text-xs justify-start overflow-x-auto shrink-0 custom-scrollbar">
                    <button onclick="setReaperGMBagCategory('all')" class="btn py-1.5 px-3 text-xs font-bold rounded ${cat === 'all' ? 'bg-indigo-700 border-indigo-500 shadow-inner' : 'bg-slate-800 border-slate-700'} text-white transition-colors shrink-0">全部 (${player.inv.length})</button>
                    <button onclick="setReaperGMBagCategory('equip')" class="btn py-1.5 px-3 text-xs font-bold rounded ${cat === 'equip' ? 'bg-indigo-700 border-indigo-500 shadow-inner' : 'bg-slate-800 border-slate-700'} text-white transition-colors shrink-0">裝備</button>
                    <button onclick="setReaperGMBagCategory('consume')" class="btn py-1.5 px-3 text-xs font-bold rounded ${cat === 'consume' ? 'bg-indigo-700 border-indigo-500 shadow-inner' : 'bg-slate-800 border-slate-700'} text-white transition-colors shrink-0">消耗品</button>
                </div>
            `;

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

            let listHtml = '';
            if (filtered.length === 0) {
                listHtml = `<div class="text-slate-500 text-sm text-center py-10 w-full flex-1 flex items-center justify-center">您的背包中沒有此分類的物品。</div>`;
            } else {
                listHtml = `<div class="grid grid-cols-2 gap-2 overflow-y-auto flex-1 pr-1 custom-scrollbar content-start">`;
                filtered.forEach(item => {
                    const d = DB.items[item.id];
                    if (!d) return;

                    const imgUrl = getIconUrl(d);
                    const glowClass = getGlowClass(item, d) || '';
                    const fullName = getItemFullName(item);
                    const colorClass = getItemColor(item);

                    listHtml += `
                        <div class="list-item bg-slate-800 rounded border border-slate-700 p-1.5 hover:bg-slate-750 transition-colors flex justify-between items-center w-full shadow-sm">
                            <div class="flex items-center gap-1.5 min-w-0 flex-1">
                                <div class="w-8 h-8 bg-slate-900 rounded border border-slate-600 flex items-center justify-center shrink-0 tip-host" data-tip-uid="${item.uid}" data-tip-src="inv">
                                    <img src="${imgUrl}" onerror="this.style.display='none';" class="w-6 h-6 object-contain pointer-events-none ${glowClass}">
                                </div>
                                <div class="flex flex-col items-start gap-0.5 min-w-0 flex-1">
                                    <span class="${colorClass} font-bold text-[12px] leading-tight truncate w-full block text-left">
                                        ${fullName}
                                    </span>
                                    <div class="flex items-center gap-1">
                                        <span class="text-slate-400 text-[10px] leading-none">庫存: ${item.cnt}</span>
                                    </div>
                                </div>
                            </div>
                            <div class="flex items-center shrink-0 ml-1">
                                <button class="btn bg-indigo-700 hover:bg-indigo-600 border-indigo-500 py-1 px-2 font-bold shadow text-white rounded text-[11px] transition-colors" onclick="selectBagItemForUpload('${item.uid}')">選取</button>
                            </div>
                        </div>
                    `;
                });
                listHtml += `</div>`;
            }

            contentHtml = `
                <div class="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl relative flex flex-col overflow-hidden w-full h-full">
                    <div class="bg-slate-950 p-4 border-b border-slate-800 flex justify-between items-center shrink-0">
                        <h3 class="text-lg font-black text-white flex items-center gap-2">
                            <button type="button" onclick="toggleReaperModalView()" class="text-slate-400 hover:text-white mr-1 transition-colors bg-slate-800 w-8 h-8 rounded-full flex items-center justify-center">
                                ←
                            </button>
                            🎒 選擇背包物品
                        </h3>
                    </div>
                    ${closeBtnHtml}
                    <div class="p-4 flex flex-col flex-1 min-h-0">
                        ${tabsDivHtml}
                        ${listHtml}
                    </div>
                </div>
            `;
        }

        container.innerHTML = contentHtml;
    };

    // ==========================================
    // 瞞天過海 Tooltip 機制 (因 findTipItem 為遊戲閉包區域變數，無法從外部 Hook)
    // 透過在 mouseover 捕獲階段將虛擬物品臨時寫入 player.inv，
    // 原生 mousemove 便能在 inv 中找到該物品並成功展示說明，移出時自動移除。
    // ==========================================
    document.addEventListener('mouseover', function (e) {
        const host = e.target && e.target.closest ? e.target.closest('.tip-host') : null;
        if (host && host.getAttribute('data-tip-src') === 'reaper') {
            const uidv = host.getAttribute('data-tip-uid');
            if (uidv) {
                const info = wealthReaperStock ? wealthReaperStock[uidv] : null;
                if (info) {
                    const itemId = uidv.startsWith('list_') ? info.itemId : uidv;
                    // 🌟 Tooltip 防護：若本版沒有此物品，不進行 mock 避免 buildItemDescHTML 崩潰
                    if (!DB.items[itemId]) return;

                    const en = uidv.startsWith('list_') ? (info.en || 0) : 0;
                    const bless = uidv.startsWith('list_') ? (info.bless || false) : false;
                    const anc = uidv.startsWith('list_') ? (info.anc || false) : false;
                    const attr = uidv.startsWith('list_') ? (info.attr || false) : false;
                    const seteff = uidv.startsWith('list_') ? (info.seteff || false) : false;

                    const mockItem = {
                        id: itemId,
                        uid: uidv,
                        cnt: 1,
                        en: en,
                        bless: bless,
                        anc: anc,
                        attr: attr,
                        seteff: seteff,
                        lock: false,
                        junk: false,
                        _reaperMock: true
                    };

                    // 確保背包中目前沒有這個虛擬物品，防止重複 push
                    if (!player.inv.some(x => x.uid === uidv)) {
                        player.inv.push(mockItem);
                    }
                }
            }
        }
    }, true); // 使用 Capture 捕獲階段，領先原生 mousemove 的 Bubble 冒泡階段執行

    document.addEventListener('mouseout', function (e) {
        const host = e.target && e.target.closest ? e.target.closest('.tip-host') : null;
        if (host && host.getAttribute('data-tip-src') === 'reaper') {
            const uidv = host.getAttribute('data-tip-uid');
            if (uidv) {
                clearReaperMocks();
            }
        }
    }, true);

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
                
                /* 🔧 注入被 Tailwind 預編譯過濾掉的交易所樣式 */
                #interaction-content input[type="text"], 
                #interaction-content input[type="number"] {
                    background-color: #020617 !important; /* bg-slate-950 */
                    border: 1px solid #334155 !important; /* border-slate-700 */
                    color: #ffffff !important;           /* text-white */
                }
                #interaction-content input[type="text"]:focus, 
                #interaction-content input[type="number"]:focus {
                    border-color: #eab308 !important;     /* focus:border-yellow-500 */
                    outline: none !important;
                }
                #interaction-content input[id^="shop-qty-"] {
                    background-color: #0f172a !important; /* bg-slate-900 */
                    border: 1px solid #475569 !important; /* border-slate-600 */
                }
                
                /* 📱 解決 iOS WebKit 的 Flexbox 折行與寬度擠壓錯位 Bug */
                @media (max-width: 768px) {
                    #interaction-content .reaper-upload-row {
                        display: flex !important;
                        flex-direction: column !important;
                        align-items: stretch !important;
                        width: 100% !important;
                        gap: 6px !important;
                    }
                    #interaction-content .reaper-upload-row > * {
                        width: 100% !important;
                        max-width: none !important;
                        box-sizing: border-box !important;
                        margin-left: 0 !important;
                        margin-right: 0 !important;
                    }
                }
            `;
            document.head.appendChild(style);
        }
    }

    // ==========================================
    // 雲端交易所售出進帳自動通知機制
    // ==========================================
    async function checkReaperSalesPeriodically() {
        if (typeof player === 'undefined' || !player) return;
        const isGM = typeof window.openGMShop === 'function';
        const mySellerId = isGM ? "F123456789" : getSavePlayerId();
        if (!mySellerId) return;

        try {
            const res = await fetchWithProxy(WEALTH_REAPER_BLOB_URL);
            if (res.ok) {
                const latestStock = await res.json();
                if (latestStock) {
                    wealthReaperStock = latestStock;
                    
                    let claimableGold = 0;
                    for (let lid in latestStock) {
                        const info = latestStock[lid];
                        if (info && info.sellerId === mySellerId) {
                            if (info.earned > 0) {
                                claimableGold += parseInt(info.earned, 10) || 0;
                            }
                        }
                    }

                    if (claimableGold > 0) {
                        if (typeof logSys === 'function') {
                            logSys(`<span class="text-emerald-400 font-bold">💰【交易所通知】</span>您有寄售的商品已成功售出，金幣已存入交易所！請抽空前往奇岩尋找「財富收割者」進行提領。`);
                        }
                        if (typeof showToast === 'function') {
                            showToast(`💰 寄售商品已售出，有金幣可提領！`, "success");
                        }
                    }
                }
            }
        } catch (err) {
            console.warn("[klh_Shop] 定時檢查交易所進帳失敗:", err);
        }
    }

    // ==========================================
    // 初始化啟動
    // ==========================================
    let reaperCheckTimeout = null;

    function triggerReaperSalesCheck() {
        if (reaperCheckTimeout) clearTimeout(reaperCheckTimeout);

        // 登入後 10 秒檢查一次
        reaperCheckTimeout = setTimeout(() => {
            checkReaperSalesPeriodically();
        }, 10000);
    }

    function startup() {
        registerWealthReaperNPC();
        injectMobileInputStyle();
        
        // 註冊登入/創角勾子
        if (typeof window.loadGame === 'function' && !window.loadGame._reaperHooked) {
            const originalLoadGame = window.loadGame;
            window.loadGame = function () {
                originalLoadGame.apply(this, arguments);
                triggerReaperSalesCheck();
            };
            window.loadGame._reaperHooked = true;
        }
        
        if (typeof window.startGame === 'function' && !window.startGame._reaperHooked) {
            const originalStartGame = window.startGame;
            window.startGame = function () {
                originalStartGame.apply(this, arguments);
                triggerReaperSalesCheck();
            };
            window.startGame._reaperHooked = true;
        }

        // 註冊 openModal 勾子 (插入上架按鈕)
        if (typeof window.openModal === 'function' && !window.openModal._reaperHooked) {
            const originalOpenModal = window.openModal;
            window.openModal = function (item, isEq, slot) {
                // 先呼叫原始函式渲染 modal
                originalOpenModal.apply(this, arguments);

                // 渲染後，為未鎖定、非裝備中且具有 uid 的道具加入「上架」按鈕
                const modalActions = document.getElementById('modal-actions');
                if (modalActions && item && !isEq && item.uid && !item.lock) {
                    const btn = document.createElement('button');
                    // 金色框設計：邊框金黃，文字偏金，背景深色以凸顯邊框
                    btn.className = 'btn border-yellow-500 bg-yellow-950 hover:bg-yellow-900 text-yellow-300 py-2 text-base font-bold shadow-[0_0_5px_rgba(234,179,8,0.4)]';
                    btn.textContent = '上架';
                    btn.onclick = () => window.openReaperListingModal(item.uid);

                    // 尋找原版的「販賣」與「全部賣出」按鈕
                    const sellBtns = Array.from(modalActions.querySelectorAll("button")).filter(b => 
                        b.getAttribute("onclick") && b.getAttribute("onclick").startsWith("sellItem")
                    );

                    if (sellBtns.length === 2) {
                        // 建立一個佔據整行(col-span-2)的 3 欄網格容器
                        const wrapper = document.createElement('div');
                        wrapper.className = 'col-span-2 grid grid-cols-3 gap-3 w-full';
                        
                        // 將 wrapper 插入到第一個賣出按鈕的位置
                        modalActions.insertBefore(wrapper, sellBtns[0]);
                        
                        // 將賣出按鈕移入 wrapper，並在右邊加入上架按鈕
                        wrapper.appendChild(sellBtns[0]);
                        wrapper.appendChild(sellBtns[1]);
                        wrapper.appendChild(btn);
                    } else {
                        // 若找不到，退回原方案放在最下方
                        btn.className += ' col-span-2 w-full mt-1.5';
                        modalActions.appendChild(btn);
                    }
                }
            };
            window.openModal._reaperHooked = true;
        }

        // 若啟動時已載入存檔，直接執行
        if (typeof player !== 'undefined' && player && !reaperCheckTimeout) {
            triggerReaperSalesCheck();
        }
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
