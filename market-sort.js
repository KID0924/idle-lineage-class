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
            var searchInput = document.getElementById('trade-search');
            if (searchInput && searchInput.parentNode && searchInput.parentNode.id !== 'my-sort-ui') {
                var wrapper = document.createElement('div');
                wrapper.id = 'my-sort-ui';
                wrapper.style.display = 'flex';
                wrapper.style.gap = '6px';
                wrapper.style.marginBottom = '8px';
                wrapper.style.width = '100%';
                
                searchInput.parentNode.insertBefore(wrapper, searchInput);
                
                searchInput.style.marginBottom = '0';
                searchInput.style.flex = '1';
                searchInput.style.minWidth = '0';
                wrapper.appendChild(searchInput);
                
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
                
                selectEl.innerHTML = '<option value="none">🔀 預設</option>' +
                                     '<option value="priceAsc">💰 總價:低➡️高</option>' +
                                     '<option value="priceDesc">💰 總價:高➡️低</option>' +
                                     '<option value="unitPriceAsc">📦 單價:低➡️高</option>' +
                                     '<option value="unitPriceDesc">📦 單價:高➡️低</option>';
                wrapper.appendChild(selectEl);
                
                selectEl.value = window._myCurrentSort;
                selectEl.addEventListener('change', function(e) {
                    window._myCurrentSort = e.target.value;
                    if (typeof tradeShowMax !== 'undefined') tradeShowMax = 80;
                    window.paintTradeList();
                });
            }
        }
        return result;
    };
    
    window._mySortInitialized = true;
    if (document.getElementById('trade-list')) {
        window.paintTradeList();
    }
})();
