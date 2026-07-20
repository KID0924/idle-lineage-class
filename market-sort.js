(function() {
    // 防重複載入
    if (window._mySortInitialized) {
        return;
    }
    
    var origPaint = window.paintTradeList;
    if (typeof origPaint !== 'function') {
        return;
    }
    
    window._origPaintTradeList = origPaint;
    window._myCurrentSort = 'none';
    
    window.paintTradeList = function() {
        // 關鍵修復：直接呼叫 marketData，不要加上 window.
        if (typeof marketData !== 'undefined' && Array.isArray(marketData)) {
            var sortType = window._myCurrentSort;
            if (sortType && sortType !== 'none') {
                marketData.sort(function(a, b) {
                    var aCnt = a.cnt || 1;
                    var bCnt = b.cnt || 1;
                    var aUnit = a.price / aCnt;
                    var bUnit = b.price / bCnt;
                    if (sortType === 'priceAsc') return a.price - b.price;
                    if (sortType === 'priceDesc') return b.price - a.price;
                    if (sortType === 'unitPriceAsc') return aUnit - bUnit;
                    if (sortType === 'unitPriceDesc') return bUnit - aUnit;
                    return 0;
                });
            }
        }
        
        var result = window._origPaintTradeList.apply(this, arguments);
        
        if (document.getElementById('trade-list')) {
            var box = document.getElementById('trade-list');
            
            // 1. 建立並排的排序下拉選單
            var searchInput = document.getElementById('trade-search');
            if (searchInput && searchInput.parentNode && searchInput.parentNode.id !== 'my-sort-ui') {
                var wrapper = document.createElement('div');
                wrapper.id = 'my-sort-ui';
                wrapper.style.display = 'flex';
                wrapper.style.gap = '4px';
                wrapper.style.marginBottom = '8px';
                wrapper.style.width = '100%';
                
                searchInput.parentNode.insertBefore(wrapper, searchInput);
                
                searchInput.style.marginBottom = '0';
                searchInput.style.flex = '1';
                searchInput.style.minWidth = '0';
                wrapper.appendChild(searchInput);

                // 2. 建立快速填入下拉選單 (放置於搜尋名稱與排序選單中間)
                var quickItems = [
                    { text: '快速填入', val: '' },
                    { text: '卷', val: '卷' },
                    { text: '武器施法的卷軸', val: '武器施法的卷軸' },
                    { text: '武器祝福卷軸', val: '武器祝福卷軸' },
                    { text: '盔甲施法的卷軸', val: '盔甲施法的卷軸' },
                    { text: '盔甲祝福卷軸', val: '盔甲祝福卷軸' },
                    { text: '飾品', val: '飾品' },
                    { text: '飾品施法的卷軸', val: '飾品施法的卷軸' },
                    { text: '飾品祝福卷軸', val: '飾品祝福卷軸' },
                    { text: '力量魔法頭盔', val: '力量魔法頭盔' },
                    { text: '敏捷魔法頭盔', val: '敏捷魔法頭盔' },
                    { text: '搜索狀', val: '搜索狀' },
                    { text: '萬能藥', val: '萬能藥' },
                    { text: '十字', val: '十字' },
                    { text: '腕甲', val: '腕甲' },
                    { text: '艾', val: '艾' },
                    { text: '精靈鏈甲', val: '精靈鏈甲' },
                    { text: '精靈金屬盔甲', val: '精靈金屬盔甲' },
                    { text: '腰帶', val: '腰帶' },
                    { text: '泰坦', val: '泰坦' },
                    { text: '項鍊', val: '項鍊' },
                    { text: '戒指', val: '戒指' },
                    { text: '不死', val: '不死' },
                    { text: '鑰匙', val: '鑰匙' },
                    { text: '變形怪', val: '變形怪' },
                    { text: '蛇女', val: '蛇女' },
                    { text: '潘', val: '潘' },
                    { text: '樹枝', val: '樹枝' },
                    { text: '金屬塊', val: '金屬塊' },
                    { text: '鋼鐵', val: '鋼鐵' },
                    { text: '鋼鐵頭盔', val: '鋼鐵頭盔' },
                    { text: '鋼鐵長靴', val: '鋼鐵長靴' },
                    { text: '鋼鐵手套', val: '鋼鐵手套' },
                    { text: '品質', val: '品質' },
                    { text: 'STR', val: 'STR' },
                    { text: 'INT', val: 'INT' },
                    { text: 'DEX', val: 'DEX' },
                    { text: 'CHA', val: 'CHA' },
                    { text: 'CON', val: 'CON' },
                    { text: 'WIS', val: 'WIS' },
                    { text: '+9', val: '+9' },
                    { text: '+8', val: '+8' },
                    { text: '+7', val: '+7' },
                    { text: '+6', val: '+6' },
                    { text: '抗魔法', val: '抗魔法' },
                    { text: '抗魔法頭盔', val: '抗魔法頭盔' }
                ];

                var quickSelectEl = document.createElement('select');
                quickSelectEl.id = 'my-quick-select';
                quickSelectEl.style.flex = '0 0 auto';
                quickSelectEl.style.maxWidth = '90px';
                quickSelectEl.style.padding = '8px 2px';
                quickSelectEl.style.borderRadius = '8px';
                quickSelectEl.style.border = '1px solid #5a4a26';
                quickSelectEl.style.background = '#efe9dc';
                quickSelectEl.style.color = '#2a2018';
                quickSelectEl.style.fontSize = '13.5px';
                quickSelectEl.style.fontWeight = 'bold';

                var qHtml = '';
                for (var q = 0; q < quickItems.length; q++) {
                    qHtml += '<option value="' + quickItems[q].val + '">' + quickItems[q].text + '</option>';
                }
                quickSelectEl.innerHTML = qHtml;

                if (searchInput.value) {
                    quickSelectEl.value = searchInput.value;
                }

                function doQuickSearch(val) {
                    searchInput.value = val;
                    if (typeof tradeSearch !== 'undefined') {
                        tradeSearch = val;
                    }
                    if (typeof tradeShowMax !== 'undefined') {
                        tradeShowMax = 80;
                    }
                    if (typeof searchInput.oninput === 'function') {
                        searchInput.oninput();
                    } else {
                        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                    window.paintTradeList();
                }

                quickSelectEl.addEventListener('change', function(e) {
                    doQuickSearch(e.target.value);
                });

                // 新增「◀」上一個與「▶」下一個切換按鈕
                var prevBtn = document.createElement('button');
                prevBtn.id = 'my-quick-prev-btn';
                prevBtn.textContent = '◀';
                prevBtn.title = '點擊切換至上一個選項';
                prevBtn.style.flex = '0 0 auto';
                prevBtn.style.padding = '8px 5px';
                prevBtn.style.borderRadius = '8px';
                prevBtn.style.border = '1px solid #5a4a26';
                prevBtn.style.background = '#efe9dc';
                prevBtn.style.color = '#2a2018';
                prevBtn.style.fontSize = '12px';
                prevBtn.style.fontWeight = 'bold';
                prevBtn.style.cursor = 'pointer';

                prevBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    var total = quickSelectEl.options.length;
                    var prevIdx = (quickSelectEl.selectedIndex - 1 + total) % total;
                    quickSelectEl.selectedIndex = prevIdx;
                    doQuickSearch(quickSelectEl.value);
                });

                var nextBtn = document.createElement('button');
                nextBtn.id = 'my-quick-next-btn';
                nextBtn.textContent = '▶';
                nextBtn.title = '點擊切換至下一個選項';
                nextBtn.style.flex = '0 0 auto';
                nextBtn.style.padding = '8px 5px';
                nextBtn.style.borderRadius = '8px';
                nextBtn.style.border = '1px solid #5a4a26';
                nextBtn.style.background = '#efe9dc';
                nextBtn.style.color = '#2a2018';
                nextBtn.style.fontSize = '12px';
                nextBtn.style.fontWeight = 'bold';
                nextBtn.style.cursor = 'pointer';

                nextBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    var total = quickSelectEl.options.length;
                    var nextIdx = (quickSelectEl.selectedIndex + 1) % total;
                    quickSelectEl.selectedIndex = nextIdx;
                    doQuickSearch(quickSelectEl.value);
                });

                searchInput.addEventListener('input', function() {
                    var cur = searchInput.value;
                    var has = false;
                    for (var q = 0; q < quickItems.length; q++) {
                        if (quickItems[q].val && quickItems[q].val === cur) {
                            has = true;
                            break;
                        }
                    }
                    quickSelectEl.value = has ? cur : '';
                });

                wrapper.appendChild(quickSelectEl);
                wrapper.appendChild(prevBtn);
                wrapper.appendChild(nextBtn);
                
                // 3. 建立排序下拉選單
                var selectEl = document.createElement('select');
                selectEl.id = 'my-sort-select';
                selectEl.style.flex = '0 0 auto';
                selectEl.style.padding = '8px 4px';
                selectEl.style.borderRadius = '8px';
                selectEl.style.border = '1px solid #5a4a26';
                selectEl.style.background = '#efe9dc';
                selectEl.style.color = '#2a2018';
                selectEl.style.fontSize = '13.5px';
                selectEl.style.fontWeight = 'bold';
                
                selectEl.innerHTML = '<option value="none">預設</option>' +
                                     '<option value="priceAsc">總價:低➡️高</option>' +
                                     '<option value="priceDesc">總價:高➡️低</option>' +
                                     '<option value="unitPriceAsc">單價:低➡️高</option>' +
                                     '<option value="unitPriceDesc">單價:高➡️低</option>';
                wrapper.appendChild(selectEl);
                
                selectEl.value = window._myCurrentSort;
                selectEl.addEventListener('change', function(e) {
                    window._myCurrentSort = e.target.value;
                    if (typeof tradeShowMax !== 'undefined') tradeShowMax = 80;
                    window.paintTradeList();
                });
            }
            
            // 2. 針對所有商品計算並在 DOM 上標註單價（單數與複數皆顯示，保持一致性）
            var items = box.querySelectorAll('.shop-item');
            for (var i = 0; i < items.length; i++) {
                var info = items[i].querySelector('.si-info');
                if (info && info.dataset.detail) {
                    var itemId = parseInt(info.dataset.detail, 10);
                    var itemData = typeof marketData !== 'undefined' && marketData.find(function(x) { return x.id === itemId; });
                    if (itemData && itemData.price) {
                        var cnt = itemData.cnt || 1;
                        var unitPrice = Math.floor(itemData.price / cnt);
                        var sip = items[i].querySelector('.si-p');
                        if (sip && !sip.querySelector('.my-unit-price')) {
                            var unitSpan = document.createElement('span');
                            unitSpan.className = 'my-unit-price';
                            unitSpan.style.color = '#d97706'; // 醒目的深橘色
                            unitSpan.style.marginLeft = '8px';
                            unitSpan.style.fontSize = '12px';
                            unitSpan.style.fontWeight = 'bold';
                            unitSpan.textContent = '(單價: ' + unitPrice.toLocaleString() + ')';
                            sip.appendChild(unitSpan);
                        }
                    }
                }
            }
        }
        return result;
    };
    
    window._mySortInitialized = true;
    if (document.getElementById('trade-list')) {
        window.paintTradeList();
    }
})();
