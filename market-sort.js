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
    
    // ----------------------------------------------------
    // 1. 交易所原版清單 排序與繪製 Hook
    // ----------------------------------------------------
    window.paintTradeList = function() {
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
            
            var searchInput = document.getElementById('trade-search');
            if (searchInput && searchInput.parentNode && searchInput.parentNode.id !== 'my-sort-ui') {
                var wrapper = document.createElement('div');
                wrapper.id = 'my-sort-ui';
                wrapper.style.display = 'flex';
                wrapper.style.gap = '4px';
                wrapper.style.marginBottom = '8px';
                wrapper.style.width = '100%';
                wrapper.style.alignItems = 'center';
                wrapper.style.flexWrap = 'wrap';
                
                searchInput.parentNode.insertBefore(wrapper, searchInput);
                
                searchInput.style.marginBottom = '0';
                searchInput.style.flex = '1 1 120px';
                searchInput.style.minWidth = '0';
                wrapper.appendChild(searchInput);

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
                    { text: '變形控制戒指', val: '變形控制戒指' },
                    { text: '傳送控制戒指', val: '傳送控制戒指' },
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
                quickSelectEl.style.flex = '0 0 90px';
                quickSelectEl.style.width = '90px';
                quickSelectEl.style.padding = '8px 2px';
                quickSelectEl.style.borderRadius = '8px';
                quickSelectEl.style.border = '1px solid #5a4a26';
                quickSelectEl.style.background = '#efe9dc';
                quickSelectEl.style.color = '#2a2018';
                quickSelectEl.style.fontSize = '13px';
                quickSelectEl.style.fontWeight = 'bold';

                var qHtml = '';
                for (var q = 0; q < quickItems.length; q++) {
                    qHtml += '<option value="' + quickItems[q].val + '">' + quickItems[q].text + '</option>';
                }
                quickSelectEl.innerHTML = qHtml;

                if (searchInput.value) {
                    quickSelectEl.value = searchInput.value;
                }

                window.doQuickSearch = function(val) {
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
                };

                quickSelectEl.addEventListener('change', function(e) {
                    window.doQuickSearch(e.target.value);
                });

                var prevBtn = document.createElement('button');
                prevBtn.id = 'my-quick-prev-btn';
                prevBtn.textContent = '<';
                prevBtn.title = '上一個選項';
                prevBtn.style.flex = '0 0 auto';
                prevBtn.style.padding = '7px 5px';
                prevBtn.style.borderRadius = '6px';
                prevBtn.style.border = '1px solid #5a4a26';
                prevBtn.style.background = '#efe9dc';
                prevBtn.style.color = '#2a2018';
                prevBtn.style.fontSize = '11px';
                prevBtn.style.fontWeight = 'bold';
                prevBtn.style.cursor = 'pointer';

                prevBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    var total = quickSelectEl.options.length;
                    var prevIdx = (quickSelectEl.selectedIndex - 1 + total) % total;
                    quickSelectEl.selectedIndex = prevIdx;
                    window.doQuickSearch(quickSelectEl.value);
                });

                var nextBtn = document.createElement('button');
                nextBtn.id = 'my-quick-next-btn';
                nextBtn.textContent = '>';
                nextBtn.title = '下一個選項';
                nextBtn.style.flex = '0 0 auto';
                nextBtn.style.padding = '7px 5px';
                nextBtn.style.borderRadius = '6px';
                nextBtn.style.border = '1px solid #5a4a26';
                nextBtn.style.background = '#efe9dc';
                nextBtn.style.color = '#2a2018';
                nextBtn.style.fontSize = '11px';
                nextBtn.style.fontWeight = 'bold';
                nextBtn.style.cursor = 'pointer';

                nextBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    var total = quickSelectEl.options.length;
                    var nextIdx = (quickSelectEl.selectedIndex + 1) % total;
                    quickSelectEl.selectedIndex = nextIdx;
                    window.doQuickSearch(quickSelectEl.value);
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
                
                var selectEl = document.createElement('select');
                selectEl.id = 'my-sort-select';
                selectEl.style.flex = '0 0 auto';
                selectEl.style.padding = '7px 4px';
                selectEl.style.borderRadius = '8px';
                selectEl.style.border = '1px solid #5a4a26';
                selectEl.style.background = '#efe9dc';
                selectEl.style.color = '#2a2018';
                selectEl.style.fontSize = '13px';
                selectEl.style.fontWeight = 'bold';
                
                selectEl.innerHTML = '<option value="none">預設</option>' +
                                     '<option value="priceAsc">總價:低到高</option>' +
                                     '<option value="priceDesc">總價:高到低</option>' +
                                     '<option value="unitPriceAsc">單價:低到高</option>' +
                                     '<option value="unitPriceDesc">單價:高到低</option>';
                wrapper.appendChild(selectEl);
                
                selectEl.value = window._myCurrentSort;
                selectEl.addEventListener('change', function(e) {
                    window._myCurrentSort = e.target.value;
                    if (typeof tradeShowMax !== 'undefined') tradeShowMax = 80;
                    window.paintTradeList();
                });

                var analyticsBtn = document.createElement('button');
                analyticsBtn.id = 'my-analytics-btn';
                analyticsBtn.innerHTML = '行情分析';
                analyticsBtn.title = '點擊打開全市場數據分析彈出視窗';
                analyticsBtn.style.flex = '0 0 auto';
                analyticsBtn.style.padding = '7px 10px';
                analyticsBtn.style.borderRadius = '8px';
                analyticsBtn.style.border = '1px solid #b8860b';
                analyticsBtn.style.background = 'linear-gradient(135deg, #d4af37, #aa7c11)';
                analyticsBtn.style.color = '#ffffff';
                analyticsBtn.style.fontSize = '13px';
                analyticsBtn.style.fontWeight = 'bold';
                analyticsBtn.style.cursor = 'pointer';
                analyticsBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
                analyticsBtn.style.transition = 'transform 0.1s ease, filter 0.2s ease';

                analyticsBtn.addEventListener('mouseover', function() {
                    analyticsBtn.style.filter = 'brightness(1.1)';
                });
                analyticsBtn.addEventListener('mouseout', function() {
                    analyticsBtn.style.filter = 'none';
                });
                analyticsBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    window.openMarketAnalyticsModal();
                });

                wrapper.appendChild(analyticsBtn);
            }
            
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
                            unitSpan.style.color = '#d97706';
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
    
    // ----------------------------------------------------
    // 2. 數據分析與 Modal 彈出視窗 UI
    // ----------------------------------------------------
    window.openMarketAnalyticsModal = function() {
        var existingModal = document.getElementById('my-market-modal');
        if (existingModal) {
            existingModal.style.display = 'flex';
            window.renderMarketAnalyticsContent();
            var input = document.getElementById('my-auto-refresh-input');
            if (input) {
                input.dispatchEvent(new Event('change'));
            }
            return;
        }

        var modalOverlay = document.createElement('div');
        modalOverlay.id = 'my-market-modal';
        modalOverlay.style.position = 'fixed';
        modalOverlay.style.top = '0';
        modalOverlay.style.left = '0';
        modalOverlay.style.width = '100vw';
        modalOverlay.style.height = '100vh';
        modalOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        modalOverlay.style.backdropFilter = 'blur(5px)';
        modalOverlay.style.zIndex = '999999';
        modalOverlay.style.display = 'flex';
        modalOverlay.style.justifyContent = 'center';
        modalOverlay.style.alignItems = 'center';
        modalOverlay.style.fontFamily = 'system-ui, -apple-system, sans-serif';

        var modalBox = document.createElement('div');
        modalBox.style.width = '96%';
        modalBox.style.maxWidth = '780px';
        modalBox.style.maxHeight = '92vh';
        modalBox.style.background = '#1a1816';
        modalBox.style.color = '#f0e6d2';
        modalBox.style.border = '2px solid #a88238';
        modalBox.style.borderRadius = '14px';
        modalBox.style.boxShadow = '0 10px 30px rgba(0,0,0,0.8)';
        modalBox.style.display = 'flex';
        modalBox.style.flexDirection = 'column';
        modalBox.style.overflow = 'hidden';

        var header = document.createElement('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.padding = '12px 18px';
        header.style.background = '#28231d';
        header.style.borderBottom = '1px solid #4a3d2c';

        var title = document.createElement('div');
        title.style.fontSize = '17px';
        title.style.fontWeight = 'bold';
        title.style.color = '#f3d898';
        title.innerHTML = '交易所數據大師 <span style="font-size:12px;color:#a09078;font-weight:normal;">(全市場即時大盤)</span>';

        var headerRight = document.createElement('div');
        headerRight.style.display = 'flex';
        headerRight.style.alignItems = 'center';
        headerRight.style.gap = '8px';

        var refreshBtn = document.createElement('button');
        refreshBtn.textContent = '刷新';
        refreshBtn.style.padding = '4px 10px';
        refreshBtn.style.borderRadius = '6px';
        refreshBtn.style.border = '1px solid #5a4a36';
        refreshBtn.style.background = '#3a6a3a';
        refreshBtn.style.color = '#fff';
        refreshBtn.style.fontSize = '12px';
        refreshBtn.style.fontWeight = 'bold';
        refreshBtn.style.cursor = 'pointer';
        refreshBtn.addEventListener('click', function() {
            window.renderMarketAnalyticsContent();
        });

        var autoLabel = document.createElement('span');
        autoLabel.style.color = '#a09078';
        autoLabel.style.fontSize = '12px';
        autoLabel.textContent = '自動:';

        var autoInput = document.createElement('input');
        autoInput.id = 'my-auto-refresh-input';
        autoInput.type = 'number';
        autoInput.step = '0.1';
        autoInput.min = '0';
        autoInput.max = '600';
        autoInput.value = '0.5';
        autoInput.placeholder = '秒';
        autoInput.style.width = '48px';
        autoInput.style.padding = '3px 4px';
        autoInput.style.borderRadius = '4px';
        autoInput.style.border = '1px solid #5a4a36';
        autoInput.style.background = '#141210';
        autoInput.style.color = '#fff';
        autoInput.style.fontSize = '12px';
        autoInput.style.textAlign = 'center';

        var autoStatus = document.createElement('span');
        autoStatus.id = 'my-auto-refresh-status';
        autoStatus.style.color = '#6ee7b7';
        autoStatus.style.fontSize = '11px';

        window._myAutoRefreshTimer = null;

        function startAutoRefreshTimer() {
            if (window._myAutoRefreshTimer) {
                clearInterval(window._myAutoRefreshTimer);
                window._myAutoRefreshTimer = null;
            }
            var sec = parseFloat(autoInput.value);
            if (!isNaN(sec) && sec > 0) {
                autoStatus.textContent = '(' + sec + 's)';
                autoStatus.style.color = '#6ee7b7';
                window._myAutoRefreshTimer = setInterval(function() {
                    window.renderMarketAnalyticsContent();
                }, Math.floor(sec * 1000));
            } else {
                autoStatus.textContent = '';
                autoStatus.style.color = '#666';
            }
        }

        autoInput.addEventListener('change', startAutoRefreshTimer);
        startAutoRefreshTimer();

        var closeBtn = document.createElement('button');
        closeBtn.innerHTML = 'X';
        closeBtn.style.background = 'none';
        closeBtn.style.border = 'none';
        closeBtn.style.color = '#d0b898';
        closeBtn.style.fontSize = '18px';
        closeBtn.style.fontWeight = 'bold';
        closeBtn.style.cursor = 'pointer';
        closeBtn.style.padding = '0 5px';
        closeBtn.addEventListener('click', function() {
            if (window._myAutoRefreshTimer) {
                clearInterval(window._myAutoRefreshTimer);
                window._myAutoRefreshTimer = null;
            }
            modalOverlay.style.display = 'none';
        });

        headerRight.appendChild(refreshBtn);
        headerRight.appendChild(autoLabel);
        headerRight.appendChild(autoInput);
        headerRight.appendChild(autoStatus);
        headerRight.appendChild(closeBtn);

        header.appendChild(title);
        header.appendChild(headerRight);
        modalBox.appendChild(header);

        var toolbar = document.createElement('div');
        toolbar.style.display = 'flex';
        toolbar.style.justifyContent = 'space-between';
        toolbar.style.alignItems = 'center';
        toolbar.style.padding = '10px 18px';
        toolbar.style.background = '#201c18';
        toolbar.style.borderBottom = '1px solid #383026';
        toolbar.style.flexWrap = 'wrap';
        toolbar.style.gap = '8px';

        var tabsNav = document.createElement('div');
        tabsNav.style.display = 'flex';
        tabsNav.style.gap = '6px';
        tabsNav.style.overflowX = 'auto';
        tabsNav.style.maxWidth = '100%';
        tabsNav.style.webkitOverflowScrolling = 'touch';

        var activeTab = 'summary';

        function createTabBtn(id, label) {
            var btn = document.createElement('button');
            btn.className = 'my-tab-btn';
            btn.dataset.tab = id;
            btn.textContent = label;
            btn.style.padding = '6px 12px';
            btn.style.borderRadius = '6px';
            btn.style.border = '1px solid #5a4a36';
            btn.style.background = id === activeTab ? '#8b6b28' : '#2d2720';
            btn.style.color = id === activeTab ? '#ffffff' : '#c5b498';
            btn.style.fontSize = '13px';
            btn.style.fontWeight = 'bold';
            btn.style.cursor = 'pointer';

            btn.addEventListener('click', function() {
                activeTab = id;
                var allTabs = tabsNav.querySelectorAll('.my-tab-btn');
                for (var t = 0; t < allTabs.length; t++) {
                    var isCur = allTabs[t].dataset.tab === activeTab;
                    allTabs[t].style.background = isCur ? '#8b6b28' : '#2d2720';
                    allTabs[t].style.color = isCur ? '#ffffff' : '#c5b498';
                }
                window.renderMarketAnalyticsContent(activeTab);
            });
            return btn;
        }

        tabsNav.appendChild(createTabBtn('summary', '大盤行情'));
        tabsNav.appendChild(createTabBtn('deals', '最低單價撿漏'));
        tabsNav.appendChild(createTabBtn('categories', '熱門分類'));
        toolbar.appendChild(tabsNav);

        var filterInput = document.createElement('input');
        filterInput.id = 'my-modal-filter-input';
        filterInput.type = 'text';
        filterInput.placeholder = '快速過濾...';
        filterInput.style.padding = '6px 10px';
        filterInput.style.borderRadius = '6px';
        filterInput.style.border = '1px solid #5a4a36';
        filterInput.style.background = '#141210';
        filterInput.style.color = '#fff';
        filterInput.style.fontSize = '13px';
        filterInput.style.width = '180px';

        filterInput.addEventListener('input', function() {
            window.renderMarketAnalyticsContent(activeTab);
        });

        toolbar.appendChild(filterInput);
        modalBox.appendChild(toolbar);

        var contentBody = document.createElement('div');
        contentBody.id = 'my-modal-body';
        contentBody.style.padding = '10px 8px';
        contentBody.style.overflowY = 'auto';
        contentBody.style.overflowX = 'auto';
        contentBody.style.webkitOverflowScrolling = 'touch';
        contentBody.style.flex = '1';
        modalBox.appendChild(contentBody);

        modalOverlay.appendChild(modalBox);
        document.body.appendChild(modalOverlay);

        modalOverlay.addEventListener('click', function(e) {
            if (e.target === modalOverlay) {
                if (window._myAutoRefreshTimer) {
                    clearInterval(window._myAutoRefreshTimer);
                    window._myAutoRefreshTimer = null;
                }
                modalOverlay.style.display = 'none';
            }
        });

        window.renderMarketAnalyticsContent(activeTab);
    };

    // ----------------------------------------------------
    // 3. 渲染 Modal 數據內容
    // ----------------------------------------------------
    window.renderMarketAnalyticsContent = function(tab) {
        if (tab) { window._myActiveTab = tab; }
        tab = tab || window._myActiveTab || 'summary';
        var body = document.getElementById('my-modal-body');
        var filterInput = document.getElementById('my-modal-filter-input');
        if (!body) return;

        var filterKw = filterInput ? filterInput.value.trim().toLowerCase() : '';

        if (typeof marketData === 'undefined' || !Array.isArray(marketData) || marketData.length === 0) {
            body.innerHTML = '<div style="text-align:center;padding:40px;color:#a09078;font-size:15px;">尚未讀取到交易所數據，請先打開遊戲內的交易所介面！</div>';
            return;
        }

        var processedData = [];
        for (var i = 0; i < marketData.length; i++) {
            var d = marketData[i];
            var cnt = d.cnt || 1;
            var price = d.price || 0;
            var unitPrice = Math.floor(price / cnt);
            var rawName = d.nameHtml || d.n || d.name || '未知物品';
            
            var cleanName = rawName.replace(/<[^>]+>/g, '').trim();

            processedData.push({
                raw: d,
                id: d.id,
                name: rawName,
                cleanName: cleanName,
                cnt: cnt,
                price: price,
                unitPrice: unitPrice
            });
        }

        if (filterKw) {
            processedData = processedData.filter(function(item) {
                return item.cleanName.toLowerCase().indexOf(filterKw) !== -1;
            });
        }

        if (tab === 'summary') {
            var groups = {};
            for (var j = 0; j < processedData.length; j++) {
                var item = processedData[j];
                var name = item.cleanName;
                if (!groups[name]) {
                    groups[name] = {
                        name: name,
                        rawName: item.name,
                        packs: 0,
                        totalCnt: 0,
                        minUnit: Infinity,
                        maxUnit: 0,
                        totalUnitPriceSum: 0,
                        minTotalPrice: Infinity
                    };
                }
                groups[name].packs += 1;
                groups[name].totalCnt += item.cnt;
                if (item.unitPrice < groups[name].minUnit) groups[name].minUnit = item.unitPrice;
                if (item.unitPrice > groups[name].maxUnit) groups[name].maxUnit = item.unitPrice;
                if (item.price < groups[name].minTotalPrice) groups[name].minTotalPrice = item.price;
                groups[name].totalUnitPriceSum += item.unitPrice;
            }

            var groupList = [];
            for (var k in groups) {
                var g = groups[k];
                g.avgUnit = Math.floor(g.totalUnitPriceSum / g.packs);
                groupList.push(g);
            }

            groupList.sort(function(a, b) {
                return b.packs - a.packs;
            });

            var html = '<div style="margin-bottom:8px;color:#caa668;font-size:12px;">共有 <b>' + groupList.length + '</b> 種商品掛牌中（橫向滑動查看全部）：</div>';
            html += '<table style="width:100%;min-width:520px;border-collapse:collapse;font-size:12px;text-align:left;">';
            html += '<thead><tr style="border-bottom:2px solid #5a4a36;color:#e8d0a0;background:#241f19;">' +
                    '<th style="padding:6px 8px;min-width:120px;white-space:nowrap;">商品名稱</th>' +
                    '<th style="padding:6px 8px;text-align:center;min-width:85px;white-space:nowrap;">掛單數</th>' +
                    '<th style="padding:6px 8px;text-align:right;min-width:85px;white-space:nowrap;">最低單價</th>' +
                    '<th style="padding:6px 8px;text-align:right;min-width:85px;white-space:nowrap;">平均單價</th>' +
                    '<th style="padding:6px 8px;text-align:right;min-width:85px;white-space:nowrap;">最低總價</th>' +
                    '</tr></thead><tbody>';

            for (var gIdx = 0; gIdx < groupList.length; gIdx++) {
                var grp = groupList[gIdx];
                var bg = gIdx % 2 === 0 ? '#1c1916' : '#231f1a';
                html += '<tr class="my-modal-row" data-name="' + grp.name + '" style="border-bottom:1px solid #332b21;background:' + bg + ';cursor:pointer;" onmouseover="this.style.background=\'#3a3124\'" onmouseout="this.style.background=\'' + bg + '\'">' +
                        '<td style="padding:6px 8px;color:#fff;font-weight:bold;white-space:nowrap;">' + grp.name + '</td>' +
                        '<td style="padding:6px 8px;text-align:center;color:#d0b898;white-space:nowrap;">' + grp.packs + ' 筆 (' + grp.totalCnt.toLocaleString() + '個)</td>' +
                        '<td style="padding:6px 8px;text-align:right;color:#6ee7b7;font-weight:bold;white-space:nowrap;">' + grp.minUnit.toLocaleString() + '</td>' +
                        '<td style="padding:6px 8px;text-align:right;color:#fcd34d;white-space:nowrap;">' + grp.avgUnit.toLocaleString() + '</td>' +
                        '<td style="padding:6px 8px;text-align:right;color:#93c5fd;white-space:nowrap;">' + grp.minTotalPrice.toLocaleString() + '</td>' +
                        '</tr>';
            }
            html += '</tbody></table>';
            body.innerHTML = html;

        } else if (tab === 'deals') {
            processedData.sort(function(a, b) {
                return a.unitPrice - b.unitPrice;
            });

            var topDeals = processedData.slice(0, 100);

            var dHtml = '<div style="margin-bottom:8px;color:#caa668;font-size:12px;">全市場單價最低的前 100 筆商品（橫向滑動查看全部）：</div>';
            dHtml += '<table style="width:100%;min-width:440px;border-collapse:collapse;font-size:12px;text-align:left;">';
            dHtml += '<thead><tr style="border-bottom:2px solid #5a4a36;color:#e8d0a0;background:#241f19;">' +
                    '<th style="padding:6px 8px;min-width:120px;white-space:nowrap;">商品名稱</th>' +
                    '<th style="padding:6px 8px;text-align:center;min-width:70px;white-space:nowrap;">數量</th>' +
                    '<th style="padding:6px 8px;text-align:right;min-width:85px;white-space:nowrap;">單價</th>' +
                    '<th style="padding:6px 8px;text-align:right;min-width:85px;white-space:nowrap;">總售價</th>' +
                    '</tr></thead><tbody>';

            for (var dIdx = 0; dIdx < topDeals.length; dIdx++) {
                var deal = topDeals[dIdx];
                var dBg = dIdx % 2 === 0 ? '#1c1916' : '#231f1a';
                dHtml += '<tr class="my-modal-row" data-name="' + deal.cleanName + '" style="border-bottom:1px solid #332b21;background:' + dBg + ';cursor:pointer;" onmouseover="this.style.background=\'#3a3124\'" onmouseout="this.style.background=\'' + dBg + '\'">' +
                        '<td style="padding:6px 8px;color:#fff;font-weight:bold;white-space:nowrap;">' + deal.cleanName + '</td>' +
                        '<td style="padding:6px 8px;text-align:center;color:#d0b898;white-space:nowrap;">' + deal.cnt.toLocaleString() + '</td>' +
                        '<td style="padding:6px 8px;text-align:right;color:#6ee7b7;font-weight:bold;white-space:nowrap;">' + deal.unitPrice.toLocaleString() + '</td>' +
                        '<td style="padding:6px 8px;text-align:right;color:#93c5fd;white-space:nowrap;">' + deal.price.toLocaleString() + '</td>' +
                        '</tr>';
            }
            dHtml += '</tbody></table>';
            body.innerHTML = dHtml;

        } else if (tab === 'categories') {
            var catItems = [
                { text: '全部最低單價', val: '' },
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
                { text: '變形控制戒指', val: '變形控制戒指' },
                { text: '傳送控制戒指', val: '傳送控制戒指' },
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

            var catGroups = [];
            for (var c = 0; c < catItems.length; c++) {
                var searchVal = catItems[c].val.toLowerCase();
                var searchTxt = catItems[c].text;
                
                var matched = processedData.filter(function(item) {
                    return item.cleanName.toLowerCase().indexOf(searchVal) !== -1;
                });

                matched.sort(function(a, b) {
                    return a.unitPrice - b.unitPrice;
                });

                var minUnit = matched.length > 0 ? matched[0].unitPrice : 0;
                var minUnitName = matched.length > 0 ? matched[0].cleanName : '';
                var totalCnt = 0;

                for (var m = 0; m < matched.length; m++) {
                    totalCnt += matched[m].cnt;
                }

                var top20 = matched.slice(0, 20);
                var top20Sum = 0;
                for (var t = 0; t < top20.length; t++) {
                    top20Sum += top20[t].unitPrice;
                }
                var avgTop20 = top20.length > 0 ? Math.floor(top20Sum / top20.length) : 0;

                catGroups.push({
                    name: searchTxt,
                    val: catItems[c].val,
                    packs: matched.length,
                    totalCnt: totalCnt,
                    minUnit: minUnit,
                    minUnitName: minUnitName,
                    avgTop20: avgTop20,
                    top20Count: top20.length
                });
            }

            var cHtml = '<div style="margin-bottom:8px;color:#caa668;font-size:12px;">熱門分類行情摘要（橫向滑動查看全部）：</div>';
            cHtml += '<table style="width:100%;min-width:480px;border-collapse:collapse;font-size:12px;text-align:left;">';
            cHtml += '<thead><tr style="border-bottom:2px solid #5a4a36;color:#e8d0a0;background:#241f19;">' +
                    '<th style="padding:6px 8px;min-width:110px;white-space:nowrap;">分類關鍵字</th>' +
                    '<th style="padding:6px 8px;text-align:center;min-width:85px;white-space:nowrap;">掛單數</th>' +
                    '<th style="padding:6px 8px;text-align:right;min-width:110px;white-space:nowrap;">最低單價</th>' +
                    '<th style="padding:6px 8px;text-align:right;min-width:110px;white-space:nowrap;">前20低平均單價</th>' +
                    '</tr></thead><tbody>';

            for (var cgIdx = 0; cgIdx < catGroups.length; cgIdx++) {
                var cg = catGroups[cgIdx];
                var bg;
                if (cgIdx % 2 === 0) { bg = '#1c1916'; } else { bg = '#231f1a'; }
                var packsText, minUnitText, avgTop20Text;
                if (cg.packs > 0) {
                    packsText = cg.packs + ' 筆 (' + cg.totalCnt.toLocaleString() + '個)';
                    minUnitText = cg.minUnit.toLocaleString();
                    minUnitText += ' <span style="font-size:11px;color:#8a8070;font-weight:normal;">(' + cg.minUnitName + ')</span>';
                    
                    avgTop20Text = cg.avgTop20.toLocaleString();
                    avgTop20Text += ' <span style="font-size:11px;color:#8a8070;font-weight:normal;">(前' + cg.top20Count + '筆)</span>';
                } else {
                    packsText = '<span style="color:#666;">無掛牌</span>';
                    minUnitText = '<span style="color:#666;">-</span>';
                    avgTop20Text = '<span style="color:#666;">-</span>';
                }
                cHtml += '<tr class="my-modal-row" data-name="' + cg.val + '"';
                cHtml += ' style="border-bottom:1px solid #332b21;background:' + bg + ';cursor:pointer;"';
                cHtml += ' onmouseover="this.style.background=\'#3a3124\'"';
                cHtml += ' onmouseout="this.style.background=\'' + bg + '\'">';
                cHtml += '<td style="padding:6px 8px;color:#fff;font-weight:bold;vertical-align:middle;white-space:nowrap;">' + cg.name + '</td>';
                cHtml += '<td style="padding:6px 8px;text-align:center;color:#d0b898;vertical-align:middle;white-space:nowrap;">' + packsText + '</td>';
                cHtml += '<td style="padding:6px 8px;text-align:right;color:#6ee7b7;font-weight:bold;vertical-align:middle;white-space:nowrap;">' + minUnitText + '</td>';
                cHtml += '<td style="padding:6px 8px;text-align:right;color:#fcd34d;font-weight:bold;vertical-align:middle;white-space:nowrap;">' + avgTop20Text + '</td>';
                cHtml += '</tr>';
            }
            cHtml += '</tbody></table>';
            body.innerHTML = cHtml;
        }

        var rows = body.querySelectorAll('.my-modal-row');
        for (var r = 0; r < rows.length; r++) {
            rows[r].addEventListener('click', function() {
                var itemName = this.dataset.name;
                var modal = document.getElementById('my-market-modal');
                if (modal) modal.style.display = 'none';
                if (typeof window.doQuickSearch === 'function') {
                    window.doQuickSearch(itemName);
                }
            });
        }
    };
    
    window._mySortInitialized = true;
    if (document.getElementById('trade-list')) {
        window.paintTradeList();
    }
})();
