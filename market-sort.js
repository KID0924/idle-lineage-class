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
    if (typeof window._myCurrentSort === 'undefined') {
        try {
            var savedSort = localStorage.getItem('my_market_sort_type');
            window._myCurrentSort = (savedSort && ['none','priceAsc','priceDesc','unitPriceAsc','unitPriceDesc'].indexOf(savedSort) !== -1) ? savedSort : 'none';
        } catch(e) {
            window._myCurrentSort = 'none';
        }
    }
    
    if (typeof window._priceFormatMode === 'undefined') {
        try {
            var savedFormat = localStorage.getItem('my_price_format_mode');
            window._priceFormatMode = (savedFormat === 'full' || savedFormat === 'abbrev') ? savedFormat : 'abbrev';
        } catch(e) {
            window._priceFormatMode = 'abbrev';
        }
    }

    if (typeof window._showUnitPriceInList === 'undefined') {
        try {
            var savedShow = localStorage.getItem('my_show_unit_price');
            window._showUnitPriceInList = savedShow !== null ? (savedShow === 'true') : true;
        } catch(e) {
            window._showUnitPriceInList = true;
        }
    }

    function formatLargeNumberHtml(num) {
        if (typeof num !== 'number') return num;
        var textStr;
        if (window._priceFormatMode === 'full') {
            textStr = num.toLocaleString();
        } else {
            if (num >= 100000000) {
                textStr = parseFloat((num / 100000000).toFixed(2)) + '億';
            } else if (num >= 10000) {
                textStr = parseFloat((num / 10000).toFixed(1)) + '萬';
            } else {
                textStr = num.toLocaleString();
            }
        }
        return '<span title="' + num.toLocaleString() + '" style="cursor:help;">' + textStr + '</span>';
    }

    function formatPriceText(num) {
        if (typeof num !== 'number') return num;
        if (window._priceFormatMode === 'abbrev') {
            if (num >= 100000000) {
                return parseFloat((num / 100000000).toFixed(2)) + '億';
            } else if (num >= 10000) {
                return parseFloat((num / 10000).toFixed(1)) + '萬';
            }
        }
        return num.toLocaleString();
    }

    function getBargainItemIds(allData) {
        if (typeof allData === 'undefined' || !Array.isArray(allData) || allData.length === 0) return {};
        
        var processed = [];
        for (var i = 0; i < allData.length; i++) {
            var d = allData[i];
            var cnt = d.cnt || 1;
            var price = d.price || 0;
            var unitPrice = Math.floor(price / cnt);
            var rawName = d.nameHtml || d.n || d.name || '';
            var cleanName = rawName.replace(/<[^>]+>/g, '').trim();
            processed.push({
                id: d.id,
                cleanName: cleanName,
                cnt: cnt,
                price: price,
                unitPrice: unitPrice
            });
        }

        var catItems = [
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
            { text: '天罰', val: '天罰' },
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
            { text: '不死族的鑰匙', val: '不死族的鑰匙' },
            { text: '鑰匙', val: '鑰匙' },
            { text: '變形怪', val: '變形怪' },
            { text: '蛇女', val: '蛇女' },
            { text: '潘', val: '潘' },
            { text: '樹枝', val: '樹枝' },
            { text: '金屬塊', val: '金屬塊' },
            { text: '鋼鐵', val: '鋼鐵' },
            { text: '鋼鐵長靴', val: '鋼鐵長靴' },
            { text: '鋼鐵手套', val: '鋼鐵手套' },
            { text: '品質藍寶石', val: '品質藍寶石' },
            { text: '品質綠寶石', val: '品質綠寶石' },
            { text: '龍鱗', val: '龍鱗' },
            { text: '炎魔', val: '炎魔' },
            { text: '赤焰', val: '赤焰' },
            { text: '烈焰之魂', val: '烈焰之魂' },
            { text: '食人巨魔', val: '食人巨魔' },
            { text: '力量手套', val: '力量手套' },
            { text: '巴士瑟之帽', val: '巴士瑟之帽' },
            { text: '馬庫爾之帽', val: '馬庫爾之帽' },
            { text: '西瑪之帽', val: '西瑪之帽' },
            { text: '瑟魯基之劍', val: '瑟魯基之劍' },
            { text: '熾炎天使弓', val: '熾炎天使弓' },
            { text: '古代的卷軸', val: '古代的卷軸' },
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

        var alertItemIds = {};

        for (var c = 0; c < catItems.length; c++) {
            var searchVal = catItems[c].val.toLowerCase();
            var searchTxt = catItems[c].text;
            if (!searchVal) continue;

            var matched = processed.filter(function(item) {
                return item.cleanName.toLowerCase().indexOf(searchVal) !== -1;
            });

            if (matched.length === 0) continue;

            matched.sort(function(a, b) {
                return a.unitPrice - b.unitPrice;
            });

            var minUnit = matched[0].unitPrice;
            var isAlert = false;

            if (searchTxt === '烈焰之魂') {
                if (minUnit > 0 && minUnit < 100000000) isAlert = true;
            } else if (searchTxt === '力量手套' || searchTxt === '食人巨魔' || searchTxt === '瑟魯基之劍' || searchTxt === '熾炎天使弓' || searchTxt === '赤焰') {
                if (minUnit > 0 && minUnit < 1000000) isAlert = true;
            } else if (searchTxt === '巴士瑟之帽' || searchTxt === '馬庫爾之帽' || searchTxt === '西瑪之帽' || searchTxt === '古代的卷軸' || searchTxt === '變形控制戒指') {
                if (minUnit > 0 && minUnit < 20000000) isAlert = true;
            } else if (matched.length >= 2) {
                var u1 = matched[0].unitPrice;
                var u2 = matched[1].unitPrice;
                if (u2 > 0) {
                    var gapRatio = (u2 - u1) / u2;
                    if (gapRatio >= 0.5) {
                        if (searchTxt === '+9') {
                            if (u1 < 6000000) isAlert = true;
                        } else if (searchTxt === '+8') {
                            if (u1 < 1000000) isAlert = true;
                        } else if (searchTxt === '+7') {
                            if (u1 < 500000) isAlert = true;
                        } else if (searchTxt === '+6') {
                            if (u1 < 200000) isAlert = true;
                        } else {
                            isAlert = true;
                        }
                    }
                }
            }

            if (isAlert) {
                for (var m = 0; m < matched.length; m++) {
                    if (matched[m].unitPrice === minUnit) {
                        alertItemIds[matched[m].id] = true;
                    }
                }
            }
        }

        return alertItemIds;
    }

    function getTrackedItemsMap() {
        var savedJson = localStorage.getItem('my_auto_focus_gold_items');
        var map = {};
        if (savedJson) {
            try {
                var arr = JSON.parse(savedJson);
                if (Array.isArray(arr)) {
                    for (var i = 0; i < arr.length; i++) {
                        map[arr[i]] = true;
                    }
                    return map;
                }
            } catch(e) {}
        }
        return null;
    }

    function isItemTracked(itemName, trackedMap) {
        if (itemName === '全部最低單價') return false;
        if (trackedMap === null) return true;
        return !!trackedMap[itemName];
    }

    function setItemTracked(itemName, isTracked) {
        var savedJson = localStorage.getItem('my_auto_focus_gold_items');
        var map = {};
        var catNames = [
            '烈焰之魂', '變形控制戒指', '古代的卷軸', '巴士瑟之帽', '馬庫爾之帽', '西瑪之帽',
            '力量手套', '食人巨魔', '瑟魯基之劍', '熾炎天使弓',
            '卷', '武器施法的卷軸', '武器祝福卷軸', '盔甲施法的卷軸', '盔甲祝福卷軸',
            '飾品', '飾品施法的卷軸', '飾品祝福卷軸', '力量魔法頭盔', '敏捷魔法頭盔',
            '搜索狀', '天罰', '萬能藥', '十字', '腕甲', '艾', '精靈鏈甲',
            '精靈金屬盔甲', '腰帶', '泰坦', '頂鍊', '戒指', '傳送控制戒指',
            '不死', '不死族的鑰匙', '鑰匙', '變形怪', '蛇女', '潘', '樹枝', '金屬塊',
            '鋼鐵', '鋼鐵長靴', '鋼鐵手套', '品質藍寶石', '品質綠寶石', '龍鱗',
            '炎魔', '赤焰', '+9', '+8', '+7', '+6'
        ];

        if (savedJson) {
            try {
                var arr = JSON.parse(savedJson);
                if (Array.isArray(arr)) {
                    for (var i = 0; i < arr.length; i++) map[arr[i]] = true;
                }
            } catch(e) {}
        } else {
            for (var c = 0; c < catNames.length; c++) map[catNames[c]] = true;
        }

        map[itemName] = isTracked;

        var newArr = [];
        for (var k in map) {
            if (map[k]) newArr.push(k);
        }
        try {
            localStorage.setItem('my_auto_focus_gold_items', JSON.stringify(newArr));
        } catch(e) {}
    }

    function checkAutoFocusGold(allData, isFromModal) {
        if (typeof allData === 'undefined' || !Array.isArray(allData) || allData.length === 0) return;
        try {
            var enabledVal = localStorage.getItem('my_auto_focus_gold_enabled');
            var isEnabled = enabledVal !== null ? (enabledVal === 'true') : true;
            if (!isEnabled) return;

            if (!isFromModal) {
                var bgEnabledVal = localStorage.getItem('my_auto_focus_bg_enabled');
                var isBgEnabled = bgEnabledVal !== null ? (bgEnabledVal === 'true') : true;
                if (!isBgEnabled) return;
            }

            var scrollGoldOnlyVal = localStorage.getItem('my_auto_focus_scroll_gold_only');
            var isScrollGoldOnly = scrollGoldOnlyVal !== null ? (scrollGoldOnlyVal === 'true') : true;

            var trackedMap = getTrackedItemsMap();

            var processed = [];
            for (var i = 0; i < allData.length; i++) {
                var d = allData[i];
                var cnt = d.cnt || 1;
                var price = d.price || 0;
                var unitPrice = Math.floor(price / cnt);
                var rawName = d.nameHtml || d.n || d.name || '';
                var cleanName = rawName.replace(/<[^>]+>/g, '').trim();
                processed.push({
                    id: d.id,
                    cleanName: cleanName,
                    cnt: cnt,
                    price: price,
                    unitPrice: unitPrice
                });
            }

            var catItems = [
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
                { text: '天罰', val: '天罰' },
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
                { text: '不死族的鑰匙', val: '不死族的鑰匙' },
                { text: '鑰匙', val: '鑰匙' },
                { text: '變形怪', val: '變形怪' },
                { text: '蛇女', val: '蛇女' },
                { text: '潘', val: '潘' },
                { text: '樹枝', val: '樹枝' },
                { text: '金屬塊', val: '金屬塊' },
                { text: '鋼鐵', val: '鋼鐵' },
                { text: '鋼鐵長靴', val: '鋼鐵長靴' },
                { text: '鋼鐵手套', val: '鋼鐵手套' },
                { text: '品質藍寶石', val: '品質藍寶石' },
                { text: '品質綠寶石', val: '品質綠寶石' },
                { text: '龍鱗', val: '龍鱗' },
                { text: '炎魔', val: '炎魔' },
                { text: '赤焰', val: '赤焰' },
                { text: '烈焰之魂', val: '烈焰之魂' },
                { text: '食人巨魔', val: '食人巨魔' },
                { text: '力量手套', val: '力量手套' },
                { text: '巴士瑟之帽', val: '巴士瑟之帽' },
                { text: '馬庫爾之帽', val: '馬庫爾之帽' },
                { text: '西瑪之帽', val: '西瑪之帽' },
                { text: '瑟魯基之劍', val: '瑟魯基之劍' },
                { text: '熾炎天使弓', val: '熾炎天使弓' },
                { text: '古代的卷軸', val: '古代的卷軸' },
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

            var highPriceList = [
                '烈焰之魂', '變形控制戒指', '古代的卷軸',
                '巴士瑟之帽', '馬庫爾之帽', '西瑪之帽',
                '力量手套', '食人巨魔', '瑟魯基之劍', '熾炎天使弓', '赤焰'
            ];

            var matchedAlerts = [];

            for (var c = 0; c < catItems.length; c++) {
                var searchVal = catItems[c].val.toLowerCase();
                var searchTxt = catItems[c].text;
                if (!searchVal) continue;
                if (!isItemTracked(searchTxt, trackedMap)) continue;

                var matched = processed.filter(function(item) {
                    return item.cleanName.toLowerCase().indexOf(searchVal) !== -1;
                });
                if (matched.length === 0) continue;

                matched.sort(function(a, b) { return a.unitPrice - b.unitPrice; });
                var minUnit = matched[0].unitPrice;
                var minUnitCnt = matched[0].cnt;

                var isAlert = false;
                if (searchTxt === '烈焰之魂') {
                    if (minUnit > 0 && minUnit < 100000000) isAlert = true;
                } else if (searchTxt === '力量手套' || searchTxt === '食人巨魔' || searchTxt === '瑟魯基之劍' || searchTxt === '熾炎天使弓' || searchTxt === '赤焰') {
                    if (minUnit > 0 && minUnit < 1000000) isAlert = true;
                } else if (searchTxt === '巴士瑟之帽' || searchTxt === '馬庫爾之帽' || searchTxt === '西瑪之帽' || searchTxt === '古代的卷軸' || searchTxt === '變形控制戒指') {
                    if (minUnit > 0 && minUnit < 20000000) isAlert = true;
                } else if (matched.length >= 2) {
                    var u1 = matched[0].unitPrice;
                    var u2 = matched[1].unitPrice;
                    if (u2 > 0 && (u2 - u1) / u2 >= 0.5) {
                        if (searchTxt === '+9') { if (u1 < 6000000) isAlert = true; }
                        else if (searchTxt === '+8') { if (u1 < 1000000) isAlert = true; }
                        else if (searchTxt === '+7') { if (u1 < 500000) isAlert = true; }
                        else if (searchTxt === '+6') { if (u1 < 200000) isAlert = true; }
                        else { isAlert = true; }
                    }
                }

                if (isAlert) {
                    var isHP = highPriceList.indexOf(searchTxt) !== -1;
                    var isElixir20 = (searchTxt === '萬能藥' && minUnitCnt >= 20);
                    var isGold = isHP || (minUnitCnt >= 100) || isElixir20;
                    var isScroll = searchTxt.indexOf('卷') !== -1 || searchTxt === '萬能藥';

                    // 若開啟「大單限制」，且為卷軸/萬能藥但數量不達大單門檻且非高價物，則不自動帶入
                    if (isScrollGoldOnly && isScroll && !isGold) {
                        continue;
                    }

                    matchedAlerts.push({
                        name: searchTxt,
                        minUnit: minUnit,
                        minUnitCnt: minUnitCnt,
                        isGoldAlert: isGold,
                        origIdx: c
                    });
                }
            }

            if (matchedAlerts.length === 0) return;

            matchedAlerts.sort(function(a, b) {
                function getRank(item) {
                    var isHP = highPriceList.indexOf(item.name) !== -1;
                    var isScroll = item.name.indexOf('卷') !== -1;
                    var isElixir20 = (item.name === '萬能藥' && item.minUnitCnt >= 20);
                    if (item.isGoldAlert) {
                        if (isHP) return 1;
                        if ((isScroll && item.minUnitCnt >= 100) || isElixir20) return 2;
                        return 3;
                    } else {
                        if (['+9','+8','+7','+6'].indexOf(item.name) !== -1) return 4;
                        return 5;
                    }
                }
                var rA = getRank(a);
                var rB = getRank(b);
                if (rA !== rB) return rA - rB;
                return a.origIdx - b.origIdx;
            });

            var topItem = matchedAlerts[0];
            var currentKey = topItem.name + '_' + topItem.minUnit + '_' + topItem.minUnitCnt;

            if (window._lastAutoFocusedKey !== currentKey) {
                var searchInput = document.getElementById('trade-search') || document.querySelector('input[type="text"]');
                if (searchInput && document.activeElement === searchInput) {
                    return;
                }

                window._lastAutoFocusedKey = currentKey;

                var modalOverlay = document.getElementById('my-market-modal');
                if (modalOverlay) {
                    modalOverlay.style.display = 'none';
                }

                if (typeof window.doQuickSearch === 'function') {
                    window.doQuickSearch(topItem.name);
                }
            }
        } catch(e) {
            console.log('checkAutoFocusGold error:', e);
        }
    }

    // ----------------------------------------------------
    // 1. 交易所原版清單 排序與繪製 Hook
    // ----------------------------------------------------
    window.paintTradeList = function() {
        if (typeof marketData !== 'undefined' && Array.isArray(marketData)) {
            checkAutoFocusGold(marketData, false);
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
                    { text: '天罰', val: '天罰' },
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
                    { text: '不死族的鑰匙', val: '不死族的鑰匙' },
                    { text: '鑰匙', val: '鑰匙' },
                    { text: '變形怪', val: '變形怪' },
                    { text: '蛇女', val: '蛇女' },
                    { text: '潘', val: '潘' },
                    { text: '樹枝', val: '樹枝' },
                    { text: '金屬塊', val: '金屬塊' },
                    { text: '鋼鐵', val: '鋼鐵' },
                    { text: '鋼鐵長靴', val: '鋼鐵長靴' },
                    { text: '鋼鐵手套', val: '鋼鐵手套' },
                    { text: '品質藍寶石', val: '品質藍寶石' },
                    { text: '品質綠寶石', val: '品質綠寶石' },
                    { text: '龍鱗', val: '龍鱗' },
                    { text: '炎魔', val: '炎魔' },
                    { text: '赤焰', val: '赤焰' },
                    { text: '烈焰之魂', val: '烈焰之魂' },
                    { text: '食人巨魔', val: '食人巨魔' },
                    { text: '力量手套', val: '力量手套' },
                    { text: '巴士瑟之帽', val: '巴士瑟之帽' },
                    { text: '馬庫爾之帽', val: '馬庫爾之帽' },
                    { text: '西瑪之帽', val: '西瑪之帽' },
                    { text: '瑟魯基之劍', val: '瑟魯基之劍' },
                    { text: '熾炎天使弓', val: '熾炎天使弓' },
                    { text: '古代的卷軸', val: '古代的卷軸' },
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
                    try {
                        localStorage.setItem('my_market_sort_type', window._myCurrentSort);
                    } catch(err) {}
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
            
            var alertMap = (typeof marketData !== 'undefined' && Array.isArray(marketData)) ? getBargainItemIds(marketData) : {};

            var items = box.querySelectorAll('.shop-item');
            for (var i = 0; i < items.length; i++) {
                var sip = items[i].querySelector('.si-p');
                if (sip) {
                    var existingUnitSpan = sip.querySelector('.my-unit-price');
                    if (window._showUnitPriceInList === false) {
                        if (existingUnitSpan) {
                            existingUnitSpan.remove();
                        }
                    } else {
                        var info = items[i].querySelector('.si-info');
                        if (info && info.dataset.detail) {
                            var itemId = parseInt(info.dataset.detail, 10);
                            var itemData = typeof marketData !== 'undefined' && marketData.find(function(x) { return x.id === itemId; });
                            if (itemData && itemData.price) {
                                var cnt = itemData.cnt || 1;
                                var unitPrice = Math.floor(itemData.price / cnt);
                                var isBargain = alertMap && alertMap[itemId];
                                var unitColor = isBargain ? '#ffd700' : '#d97706';

                                if (!existingUnitSpan) {
                                    var unitSpan = document.createElement('span');
                                    unitSpan.className = 'my-unit-price';
                                    unitSpan.style.color = unitColor;
                                    unitSpan.style.marginLeft = '8px';
                                    unitSpan.style.fontSize = '12px';
                                    unitSpan.style.fontWeight = 'bold';
                                    sip.appendChild(unitSpan);
                                    existingUnitSpan = unitSpan;
                                }
                                existingUnitSpan.style.color = unitColor;
                                existingUnitSpan.textContent = '(單價: ' + formatPriceText(unitPrice) + ')';
                                existingUnitSpan.title = '完整單價: ' + unitPrice.toLocaleString();
                            }
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
        modalOverlay.style.right = '0';
        modalOverlay.style.bottom = '0';
        modalOverlay.style.width = '100vw';
        modalOverlay.style.height = '100vh';
        modalOverlay.style.height = '100dvh';
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
        modalBox.style.maxHeight = '82vh';
        modalBox.style.maxHeight = 'calc(100dvh - 60px)';
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
                    window.renderMarketAnalyticsContent(null, true);
                }, Math.floor(sec * 1000));
            } else {
                autoStatus.textContent = '';
                autoStatus.style.color = '#666';
            }
        }

        autoInput.addEventListener('change', startAutoRefreshTimer);
        startAutoRefreshTimer();

        if (typeof window._showUnitPriceInList === 'undefined') {
            try {
                var savedShow = localStorage.getItem('my_show_unit_price');
                window._showUnitPriceInList = savedShow !== null ? (savedShow === 'true') : true;
            } catch(e) {
                window._showUnitPriceInList = true;
            }
        }

        if (typeof window._priceFormatMode === 'undefined') {
            try {
                var savedFormat = localStorage.getItem('my_price_format_mode');
                window._priceFormatMode = (savedFormat === 'full' || savedFormat === 'abbrev') ? savedFormat : 'abbrev';
            } catch(e) {
                window._priceFormatMode = 'abbrev';
            }
        }

        var unitToggleBtn = document.createElement('button');
        unitToggleBtn.id = 'my-unit-toggle-btn';
        unitToggleBtn.style.padding = '4px 8px';
        unitToggleBtn.style.borderRadius = '6px';
        unitToggleBtn.style.border = '1px solid #5a4a36';
        unitToggleBtn.style.fontSize = '12px';
        unitToggleBtn.style.fontWeight = 'bold';
        unitToggleBtn.style.cursor = 'pointer';

        function updateUnitToggleBtnState() {
            if (window._showUnitPriceInList) {
                unitToggleBtn.textContent = '單價: 顯';
                unitToggleBtn.style.background = '#2563eb';
                unitToggleBtn.style.color = '#fff';
            } else {
                unitToggleBtn.textContent = '單價: 隱';
                unitToggleBtn.style.background = '#374151';
                unitToggleBtn.style.color = '#9ca3af';
            }
        }
        updateUnitToggleBtnState();

        unitToggleBtn.addEventListener('click', function() {
            window._showUnitPriceInList = !window._showUnitPriceInList;
            try {
                localStorage.setItem('my_show_unit_price', window._showUnitPriceInList ? 'true' : 'false');
            } catch(e) {}
            updateUnitToggleBtnState();
            if (typeof window.paintTradeList === 'function') {
                window.paintTradeList();
            }
        });

        var formatToggleBtn = document.createElement('button');
        formatToggleBtn.id = 'my-format-toggle-btn';
        formatToggleBtn.style.padding = '4px 8px';
        formatToggleBtn.style.borderRadius = '6px';
        formatToggleBtn.style.border = '1px solid #5a4a36';
        formatToggleBtn.style.fontSize = '12px';
        formatToggleBtn.style.fontWeight = 'bold';
        formatToggleBtn.style.cursor = 'pointer';

        function updateFormatToggleBtnState() {
            if (window._priceFormatMode === 'full') {
                formatToggleBtn.textContent = '價格: 完整';
                formatToggleBtn.style.background = '#059669';
                formatToggleBtn.style.color = '#fff';
            } else {
                formatToggleBtn.textContent = '價格: 縮寫';
                formatToggleBtn.style.background = '#374151';
                formatToggleBtn.style.color = '#d1d5db';
            }
        }
        updateFormatToggleBtnState();

        formatToggleBtn.addEventListener('click', function() {
            window._priceFormatMode = (window._priceFormatMode === 'full') ? 'abbrev' : 'full';
            try {
                localStorage.setItem('my_price_format_mode', window._priceFormatMode);
            } catch(e) {}
            updateFormatToggleBtnState();
            window.renderMarketAnalyticsContent();
            if (typeof window.paintTradeList === 'function') {
                window.paintTradeList();
            }
        });

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
        headerRight.appendChild(unitToggleBtn);
        headerRight.appendChild(formatToggleBtn);
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
        tabsNav.appendChild(createTabBtn('focus', '🎯 專注自動搜尋'));
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
        contentBody.style.padding = '10px 8px 70px 8px';
        contentBody.style.overflowY = 'auto';
        contentBody.style.overflowX = 'auto';
        contentBody.style.webkitOverflowScrolling = 'touch';
        contentBody.style.overscrollBehavior = 'contain';
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
    window.renderMarketAnalyticsContent = function(tab, isAutoRefresh) {
        if (tab) { window._myActiveTab = tab; }
        tab = tab || window._myActiveTab || 'summary';

        if (tab === 'focus' && isAutoRefresh && document.getElementById('my-focus-grid')) {
            return;
        }

        var body = document.getElementById('my-modal-body');
        var filterInput = document.getElementById('my-modal-filter-input');
        if (!body) return;

        var oldBodyScrollTop = body.scrollTop;
        var oldGrid = document.getElementById('my-focus-grid');
        var oldGridScrollTop = oldGrid ? oldGrid.scrollTop : 0;

        var enabledVal = localStorage.getItem('my_auto_focus_gold_enabled');
        var isMasterEnabled = enabledVal !== null ? (enabledVal === 'true') : true;

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

        var getTrackedItemsMap = function() {
            var savedJson = localStorage.getItem('my_auto_focus_gold_items');
            var map = {};
            if (savedJson) {
                try {
                    var arr = JSON.parse(savedJson);
                    if (Array.isArray(arr)) {
                        for (var i = 0; i < arr.length; i++) {
                            map[arr[i]] = true;
                        }
                        return map;
                    }
                } catch(e) {}
            }
            return null;
        };

        var isItemTracked = function(itemName, trackedMap) {
            if (itemName === '全部最低單價') return false;
            if (trackedMap === null) return true;
            return !!trackedMap[itemName];
        };

        var setItemTracked = function(itemName, isTracked) {
            var savedJson = localStorage.getItem('my_auto_focus_gold_items');
            var map = {};
            var catNames = [
                '烈焰之魂', '變形控制戒指', '古代的卷軸', '巴士瑟之帽', '馬庫爾之帽', '西瑪之帽',
                '力量手套', '食人巨魔', '瑟魯基之劍', '熾炎天使弓', '赤焰',
                '卷', '武器施法的卷軸', '武器祝福卷軸', '盔甲施法的卷軸', '盔甲祝福卷軸',
                '飾品', '飾品施法的卷軸', '飾品祝福卷軸', '力量魔法頭盔', '敏捷魔法頭盔',
                '搜索狀', '天罰', '萬能藥', '十字', '腕甲', '艾', '精靈鏈甲',
                '精靈金屬盔甲', '腰帶', '泰坦', '頂鍊', '戒指', '傳送控制戒指',
                '不死', '不死族的鑰匙', '鑰匙', '變形怪', '蛇女', '潘', '樹枝', '金屬塊',
                '鋼鐵', '鋼鐵長靴', '鋼鐵手套', '品質藍寶石', '品質綠寶石', '龍鱗',
                '炎魔', '+9', '+8', '+7', '+6'
            ];

            if (savedJson) {
                try {
                    var arr = JSON.parse(savedJson);
                    if (Array.isArray(arr)) {
                        for (var i = 0; i < arr.length; i++) map[arr[i]] = true;
                    }
                } catch(e) {}
            } else {
                for (var c = 0; c < catNames.length; c++) map[catNames[c]] = true;
            }

            map[itemName] = isTracked;

            var newArr = [];
            for (var k in map) {
                if (map[k]) newArr.push(k);
            }
            try {
                localStorage.setItem('my_auto_focus_gold_items', JSON.stringify(newArr));
            } catch(e) {}
        };

        if (tab === 'focus') {
            var bgEnabledVal = localStorage.getItem('my_auto_focus_bg_enabled');
            var isBgEnabled = bgEnabledVal !== null ? (bgEnabledVal === 'true') : true;

            var scrollGoldOnlyVal = localStorage.getItem('my_auto_focus_scroll_gold_only');
            var isScrollGoldOnly = scrollGoldOnlyVal !== null ? (scrollGoldOnlyVal === 'true') : true;

            var trackedMap = getTrackedItemsMap();

            var allCategoryNames = [
                '烈焰之魂', '變形控制戒指', '古代的卷軸', '巴士瑟之帽', '馬庫爾之帽', '西瑪之帽',
                '力量手套', '食人巨魔', '瑟魯基之劍', '熾炎天使弓', '赤焰',
                '卷', '武器施法的卷軸', '武器祝福卷軸', '盔甲施法的卷軸', '盔甲祝福卷軸',
                '飾品', '飾品施法的卷軸', '飾品祝福卷軸', '力量魔法頭盔', '敏捷魔法頭盔',
                '搜索狀', '天罰', '萬能藥', '十字', '腕甲', '艾', '精靈鏈甲',
                '精靈金屬盔甲', '腰帶', '泰坦', '頂鍊', '戒指', '傳送控制戒指',
                '不死', '不死族的鑰匙', '鑰匙', '變形怪', '蛇女', '潘', '樹枝', '金屬塊',
                '鋼鐵', '鋼鐵長靴', '鋼鐵手套', '品質藍寶石', '品質綠寶石', '龍鱗',
                '炎魔', '+9', '+8', '+7', '+6'
            ];

            var itemDisabled = !isMasterEnabled ? ' disabled' : '';
            var itemStyle = !isMasterEnabled ? 'cursor:not-allowed;opacity:0.4;' : 'cursor:pointer;';

            var fHtml = '<div style="padding:14px;background:#1e1a16;border-radius:10px;border:1px solid #4a3d2c;color:#f0e6d2;font-size:13px;line-height:1.6;">';
            fHtml += '<div style="font-size:16px;font-weight:bold;color:#f3d898;margin-bottom:12px;">🎯 撿漏「自動鎖定關鍵字」追蹤設定</div>';
            
            fHtml += '<div style="margin-bottom:16px;background:#2a2219;padding:12px;border-radius:8px;border:1px solid #7c5a24;">';
            fHtml += '<label style="display:flex;align-items:center;cursor:pointer;font-weight:bold;color:#fcd34d;font-size:14.5px;">';
            fHtml += '<input type="checkbox" id="my-focus-master-chk"' + (isMasterEnabled ? ' checked' : '') + ' style="width:19px;height:19px;margin-right:10px;cursor:pointer;" />';
            fHtml += '開啟「撿漏警示」自動鎖定帶入關鍵字';
            fHtml += '</label>';
            fHtml += '<div style="font-size:12px;color:#caa668;margin-top:6px;margin-left:29px;">';
            fHtml += '💡 說明：當掃描到符合您勾選項目的撿漏警示時，系統會<b>自動帶入搜尋關鍵字並過濾畫面</b>供您確認。若同時觸發多項，<b>金黃色特級永遠為第一優先</b>！';
            fHtml += '</div>';

            if (!isMasterEnabled) {
                fHtml += '<div style="margin-top:10px;margin-left:29px;padding:6px 10px;background:#3b1818;border:1px solid #7f1d1d;border-radius:6px;color:#fca5a5;font-size:12px;font-weight:bold;display:flex;align-items:center;">';
                fHtml += '🔒 目前總開關為「關閉」狀態，下方所有追蹤項目已自動鎖定防止誤觸。';
                fHtml += '</div>';
            }

            fHtml += '<div style="margin-top:10px;padding-top:10px;border-top:1px dashed #5a4a36;margin-left:29px;">';
            fHtml += '<label style="display:flex;align-items:center;' + itemStyle + 'color:#fcd34d;font-size:13.5px;font-weight:bold;">';
            fHtml += '<input type="checkbox" id="my-focus-scroll-gold-chk"' + (isScrollGoldOnly ? ' checked' : '') + itemDisabled + ' style="width:17px;height:17px;margin-right:8px;' + itemStyle + '" />';
            fHtml += '📜 卷軸類/萬能藥僅限符合「大單條件（卷軸 ≥ 100, 萬能藥 ≥ 20）」才帶入';
            fHtml += '</label>';
            fHtml += '<div style="font-size:11.5px;color:#caa668;margin-top:4px;margin-left:25px;">';
            fHtml += '💡 說明：開啟後，卷軸類須<b>數量 ≥ 100 張</b>、萬能藥須<b>數量 ≥ 20 個</b>大單才會自動帶入關鍵字；而腕甲、+9 等一般裝備只要符合警示即會帶入。';
            fHtml += '</div></div>';

            fHtml += '<div style="margin-top:10px;padding-top:10px;border-top:1px dashed #5a4a36;margin-left:29px;">';
            fHtml += '<label style="display:flex;align-items:center;' + itemStyle + 'color:#e2e8f0;font-size:13.5px;">';
            fHtml += '<input type="checkbox" id="my-focus-bg-chk"' + (isBgEnabled ? ' checked' : '') + itemDisabled + ' style="width:17px;height:17px;margin-right:8px;' + itemStyle + '" />';
            fHtml += '允許在「非彈窗狀態（主交易所介面）」自動帶入關鍵字';
            fHtml += '</label>';
            fHtml += '<div style="font-size:11.5px;color:#a09078;margin-top:4px;margin-left:25px;">';
            fHtml += '取消勾選後，將<b>僅在您打開數據大師彈窗時</b>才會觸發自動鎖定帶入。';
            fHtml += '</div></div></div>';

            var btnStyle1 = !isMasterEnabled ? 'padding:4px 10px;background:#4a3d2c;color:#888;border:none;border-radius:4px;cursor:not-allowed;font-size:12px;margin-right:6px;opacity:0.5;' : 'padding:4px 10px;background:#7c5a24;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;margin-right:6px;';
            var btnStyle2 = !isMasterEnabled ? 'padding:4px 10px;background:#332b21;color:#666;border:none;border-radius:4px;cursor:not-allowed;font-size:12px;opacity:0.5;' : 'padding:4px 10px;background:#4a3d2c;color:#ccc;border:none;border-radius:4px;cursor:pointer;font-size:12px;';

            fHtml += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">';
            fHtml += '<div style="font-weight:bold;color:#fcd34d;font-size:14px;">📌 選擇欲追蹤帶入的商品項目（可直接在表格勾選或在此設定）：</div>';
            fHtml += '<div>';
            fHtml += '<button id="my-focus-select-all"' + itemDisabled + ' style="' + btnStyle1 + '">🔘 全選</button>';
            fHtml += '<button id="my-focus-deselect-all"' + itemDisabled + ' style="' + btnStyle2 + '">⚪ 全不選</button>';
            fHtml += '</div></div>';

            fHtml += '<div id="my-focus-grid" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(170px, 1fr));gap:8px;background:#141210;padding:12px;border-radius:8px;border:1px solid #3d3224;max-height:360px;overflow-y:auto;' + (!isMasterEnabled ? 'opacity:0.6;' : '') + '">';

            for (var a = 0; a < allCategoryNames.length; a++) {
                var cName = allCategoryNames[a];
                var isChecked = isItemTracked(cName, trackedMap);
                var isHP = ['烈焰之魂','變形控制戒指','古代的卷軸','巴士瑟之帽','馬庫爾之帽','西瑪之帽','力量手套','食人巨魔','瑟魯基之劍','熾炎天使弓','赤焰'].indexOf(cName) !== -1;
                var textColor = isHP ? '#fef08a' : '#fca5a5';
                
                fHtml += '<label style="display:flex;align-items:center;' + itemStyle + 'color:' + textColor + ';font-size:12.5px;">';
                fHtml += '<input type="checkbox" class="my-focus-item-chk" value="' + cName + '"' + (isChecked ? ' checked' : '') + itemDisabled + ' style="width:15px;height:15px;margin-right:6px;' + itemStyle + '" />';
                fHtml += (isHP ? '⭐ ' : '') + cName;
                fHtml += '</label>';
            }

            fHtml += '</div>';

            fHtml += '<div style="margin-top:14px;font-size:12px;color:#a09078;background:#181512;padding:8px 12px;border-radius:6px;border:1px solid #332b21;">';
            fHtml += '💡 <b>優先級說明：</b>標示 ⭐ 為特級高價/大單商品，觸發時優先於一般商品帶入搜尋。';
            fHtml += '</div></div>';

            body.innerHTML = fHtml;

            var masterChk = document.getElementById('my-focus-master-chk');
            if (masterChk) {
                masterChk.addEventListener('change', function() {
                    try {
                        localStorage.setItem('my_auto_focus_gold_enabled', this.checked ? 'true' : 'false');
                        if (typeof window.renderMarketAnalyticsContent === 'function') {
                            window.renderMarketAnalyticsContent('focus');
                        }
                    } catch(e) {}
                });
            }

            var scrollGoldChk = document.getElementById('my-focus-scroll-gold-chk');
            if (scrollGoldChk) {
                scrollGoldChk.addEventListener('change', function() {
                    try {
                        localStorage.setItem('my_auto_focus_scroll_gold_only', this.checked ? 'true' : 'false');
                    } catch(e) {}
                });
            }

            var bgChk = document.getElementById('my-focus-bg-chk');
            if (bgChk) {
                bgChk.addEventListener('change', function() {
                    try {
                        localStorage.setItem('my_auto_focus_bg_enabled', this.checked ? 'true' : 'false');
                    } catch(e) {}
                });
            }

            var itemChks = body.querySelectorAll('.my-focus-item-chk');
            for (var ic = 0; ic < itemChks.length; ic++) {
                itemChks[ic].addEventListener('change', function() {
                    setItemTracked(this.value, this.checked);
                });
            }

            var btnSelectAll = document.getElementById('my-focus-select-all');
            if (btnSelectAll) {
                btnSelectAll.addEventListener('click', function() {
                    var chks = body.querySelectorAll('.my-focus-item-chk');
                    var newArr = [];
                    for (var k = 0; k < chks.length; k++) {
                        chks[k].checked = true;
                        newArr.push(chks[k].value);
                    }
                    try {
                        localStorage.setItem('my_auto_focus_gold_items', JSON.stringify(newArr));
                    } catch(e) {}
                });
            }

            var btnDeselectAll = document.getElementById('my-focus-deselect-all');
            if (btnDeselectAll) {
                btnDeselectAll.addEventListener('click', function() {
                    var chks = body.querySelectorAll('.my-focus-item-chk');
                    for (var k = 0; k < chks.length; k++) {
                        chks[k].checked = false;
                    }
                    try {
                        localStorage.setItem('my_auto_focus_gold_items', JSON.stringify([]));
                    } catch(e) {}
                });
            }
            return;
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
                        '<td style="padding:6px 8px;text-align:right;color:#6ee7b7;font-weight:bold;white-space:nowrap;">' + formatLargeNumberHtml(grp.minUnit) + '</td>' +
                        '<td style="padding:6px 8px;text-align:right;color:#fcd34d;white-space:nowrap;">' + formatLargeNumberHtml(grp.avgUnit) + '</td>' +
                        '<td style="padding:6px 8px;text-align:right;color:#93c5fd;white-space:nowrap;">' + formatLargeNumberHtml(grp.minTotalPrice) + '</td>' +
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
                        '<td style="padding:6px 8px;text-align:right;color:#6ee7b7;font-weight:bold;white-space:nowrap;">' + formatLargeNumberHtml(deal.unitPrice) + '</td>' +
                        '<td style="padding:6px 8px;text-align:right;color:#93c5fd;white-space:nowrap;">' + formatLargeNumberHtml(deal.price) + '</td>' +
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
                { text: '天罰', val: '天罰' },
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
                { text: '不死族的鑰匙', val: '不死族的鑰匙' },
                { text: '鑰匙', val: '鑰匙' },
                { text: '變形怪', val: '變形怪' },
                { text: '蛇女', val: '蛇女' },
                { text: '潘', val: '潘' },
                { text: '樹枝', val: '樹枝' },
                { text: '金屬塊', val: '金屬塊' },
                { text: '鋼鐵', val: '鋼鐵' },
                { text: '鋼鐵長靴', val: '鋼鐵長靴' },
                { text: '鋼鐵手套', val: '鋼鐵手套' },
                { text: '品質藍寶石', val: '品質藍寶石' },
                { text: '品質綠寶石', val: '品質綠寶石' },
                { text: '龍鱗', val: '龍鱗' },
                { text: '炎魔', val: '炎魔' },
                { text: '赤焰', val: '赤焰' },
                { text: '烈焰之魂', val: '烈焰之魂' },
                { text: '食人巨魔', val: '食人巨魔' },
                { text: '力量手套', val: '力量手套' },
                { text: '巴士瑟之帽', val: '巴士瑟之帽' },
                { text: '馬庫爾之帽', val: '馬庫爾之帽' },
                { text: '西瑪之帽', val: '西瑪之帽' },
                { text: '瑟魯基之劍', val: '瑟魯基之劍' },
                { text: '熾炎天使弓', val: '熾炎天使弓' },
                { text: '古代的卷軸', val: '古代的卷軸' },
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
                var minUnitCnt = matched.length > 0 ? matched[0].cnt : 0;
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

                // 價差警示與偷甩/拋售判定 (最低與次低價差 >= 50%)
                var isAlert = false;
                if (searchTxt === '全部最低單價') {
                    isAlert = false;
                } else if (searchTxt === '烈焰之魂') {
                    if (minUnit > 0 && minUnit < 100000000) {
                        isAlert = true;
                    }
                } else if (searchTxt === '力量手套') {
                    if (minUnit > 0 && minUnit < 1000000) isAlert = true;
                } else if (searchTxt === '食人巨魔') {
                    if (minUnit > 0 && minUnit < 1000000) isAlert = true;
                } else if (searchTxt === '瑟魯基之劍') {
                    if (minUnit > 0 && minUnit < 1000000) isAlert = true;
                } else if (searchTxt === '熾炎天使弓' || searchTxt === '赤焰') {
                    if (minUnit > 0 && minUnit < 1000000) isAlert = true;
                } else if (searchTxt === '巴士瑟之帽') {
                    if (minUnit > 0 && minUnit < 20000000) isAlert = true;
                } else if (searchTxt === '馬庫爾之帽') {
                    if (minUnit > 0 && minUnit < 20000000) isAlert = true;
                } else if (searchTxt === '西瑪之帽') {
                    if (minUnit > 0 && minUnit < 20000000) isAlert = true;
                } else if (searchTxt === '古代的卷軸' || searchTxt === '變形控制戒指') {
                    if (minUnit > 0 && minUnit < 20000000) isAlert = true;
                } else if (matched.length >= 2) {
                    var u1 = matched[0].unitPrice;
                    var u2 = matched[1].unitPrice;
                    if (u2 > 0) {
                        var gapRatio = (u2 - u1) / u2;
                        if (gapRatio >= 0.5) {
                            if (searchTxt === '+9') {
                                if (u1 < 6000000) isAlert = true;
                            } else if (searchTxt === '+8') {
                                if (u1 < 1000000) isAlert = true;
                            } else if (searchTxt === '+7') {
                                if (u1 < 500000) isAlert = true;
                            } else if (searchTxt === '+6') {
                                if (u1 < 200000) isAlert = true;
                            } else {
                                isAlert = true;
                            }
                        }
                    }
                }

                // 倒數 30 秒安全計時器邏輯
                window._alertTimers = window._alertTimers || {};
                var alertRemainSec = 0;
                if (isAlert) {
                    var timerKey = searchTxt + '_' + minUnit;
                    if (!window._alertTimers[timerKey]) {
                        window._alertTimers[timerKey] = Date.now();
                    }
                    var elapsed = Math.floor((Date.now() - window._alertTimers[timerKey]) / 1000);
                    alertRemainSec = 30 - elapsed;
                    if (alertRemainSec < 0) alertRemainSec = 0;
                }

                catGroups.push({
                    origIdx: c,
                    name: searchTxt,
                    val: catItems[c].val,
                    packs: matched.length,
                    totalCnt: totalCnt,
                    minUnit: minUnit,
                    minUnitName: minUnitName,
                    minUnitCnt: minUnitCnt,
                    avgTop20: avgTop20,
                    top20Count: top20.length,
                    isAlert: isAlert,
                    alertRemainSec: alertRemainSec
                });
            }

            var highPriceList = [
                '烈焰之魂', '變形控制戒指', '古代的卷軸',
                '巴士瑟之帽', '馬庫爾之帽', '西瑪之帽',
                '力量手套', '食人巨魔', '瑟魯基之劍', '熾炎天使弓', '赤焰'
            ];

            // 觸發警示的項目自動跑到表格最上方 (高價/大單特級最優先 -> 一般紅色警示 -> 一般項目)
            catGroups.sort(function(a, b) {
                function getSortRank(cg) {
                    if (!cg.isAlert || cg.name === '全部最低單價') return 999;
                    var isHighPrice = highPriceList.indexOf(cg.name) !== -1;
                    var isScroll = cg.name.indexOf('卷') !== -1;
                    var isOver100 = cg.minUnitCnt >= 100;
                    var isElixir20 = (cg.name === '萬能藥' && cg.minUnitCnt >= 20);
                    var isGold = isHighPrice || isOver100 || isElixir20;

                    if (isGold) {
                        if (isHighPrice) return 1;
                        if ((isScroll && isOver100) || isElixir20) return 2;
                        return 3;
                    }
                    if (['+9','+8','+7','+6'].indexOf(cg.name) !== -1) return 4;
                    return 5;
                }
                var rA = getSortRank(a);
                var rB = getSortRank(b);
                if (rA !== rB) return rA - rB;
                return (a.origIdx || 0) - (b.origIdx || 0);
            });

            var activeTrackMap = getTrackedItemsMap();

            var renderCatRowHtml = function(cg) {
                var isHighPrice = highPriceList.indexOf(cg.name) !== -1;
                var isElixir20 = (cg.name === '萬能藥' && cg.minUnitCnt >= 20);
                var isGold = cg.isAlert && (
                    isHighPrice || 
                    cg.minUnitCnt >= 100 ||
                    isElixir20
                );
                var bg, hoverBg, borderCol;
                if (isGold) {
                    bg = '#5c4813';
                    hoverBg = '#7a621a';
                    borderCol = '#a17d23';
                } else if (cg.isAlert) {
                    bg = '#4e1414';
                    hoverBg = '#6b1d1d';
                    borderCol = '#991b1b';
                } else {
                    bg = (cg.origIdx || 0) % 2 === 0 ? '#1c1916' : '#231f1a';
                    hoverBg = '#3a3124';
                    borderCol = '#332b21';
                }
                var packsText, minUnitText, minUnitItemText, avgTop20Text, avgTop20Suffix, nameText;
                if (cg.isAlert) {
                    var badgeBg = isGold ? '#d97706' : '#dc2626';
                    nameText = '🔥 ' + cg.name + ' <span style="font-size:10px;background:' + badgeBg + ';color:#ffffff;padding:1px 4px;border-radius:3px;margin-left:2px;font-weight:normal;">撿漏警示</span>';
                    if (cg.alertRemainSec > 0) {
                        nameText += ' <span style="font-size:10px;background:#d97706;color:#ffffff;padding:1px 5px;border-radius:3px;margin-left:3px;font-weight:bold;">⏳ ' + cg.alertRemainSec + 's</span>';
                    }
                } else {
                    nameText = cg.name;
                }

                if (cg.packs > 0) {
                    packsText = cg.packs + ' 筆 (' + cg.totalCnt.toLocaleString() + '個)';
                    minUnitText = formatLargeNumberHtml(cg.minUnit);
                    var subColor = isGold ? '#fef08a' : (cg.isAlert ? '#fca5a5' : '#ffffff');
                    var cntColor = isGold ? '#fef08a' : (cg.isAlert ? '#fcd34d' : '#fbbf24');
                    minUnitItemText = '<span style="font-size:11px;color:' + subColor + ';font-weight:normal;">(' + cg.minUnitName + ')</span>';
                    minUnitItemText += ' <span style="font-size:11px;color:' + cntColor + ';font-weight:bold;">× ' + cg.minUnitCnt.toLocaleString() + '</span>';
                    
                    avgTop20Text = formatLargeNumberHtml(cg.avgTop20);
                    avgTop20Suffix = '<span style="font-size:11px;color:' + (isGold ? '#fef08a' : (cg.isAlert ? '#fca5a5' : '#8a8070')) + ';font-weight:normal;">(前' + cg.top20Count + '筆)</span>';
                } else {
                    packsText = '<span style="color:#666;">無掛牌</span>';
                    minUnitText = '<span style="color:#666;">-</span>';
                    minUnitItemText = '<span style="color:#666;">-</span>';
                    avgTop20Text = '<span style="color:#666;">-</span>';
                    avgTop20Suffix = '<span style="color:#666;">-</span>';
                }

                var isTracked = isItemTracked(cg.name, activeTrackMap);
                var isChkDisabled = !isMasterEnabled || cg.name === '全部最低單價';
                var chkDisabledAttr = isChkDisabled ? ' disabled' : '';
                var chkCursor = isChkDisabled ? 'cursor:not-allowed;opacity:0.4;' : 'cursor:pointer;';
                var chkTitle = !isMasterEnabled ? ' title="自動帶入搜尋總開關已關閉（已鎖定防誤觸）"' : '';
                var chkHtml = '<input type="checkbox" class="my-table-track-chk" data-name="' + cg.name + '"' + (isTracked ? ' checked' : '') + chkDisabledAttr + chkTitle + ' style="width:16px;height:16px;vertical-align:middle;' + chkCursor + '" />';

                var rHtml = '<tr class="my-modal-row" data-name="' + cg.val + '"';
                rHtml += ' style="border-bottom:1px solid ' + borderCol + ';background:' + bg + ';cursor:pointer;"';
                rHtml += ' onmouseover="this.style.background=\'' + hoverBg + '\'"';
                rHtml += ' onmouseout="this.style.background=\'' + bg + '\'">';
                rHtml += '<td style="padding:6px 4px;text-align:center;vertical-align:middle;width:45px;" onclick="event.stopPropagation();">' + chkHtml + '</td>';
                rHtml += '<td style="padding:6px 8px;color:' + (isGold ? '#fde047' : (cg.isAlert ? '#f87171' : '#fff')) + ';font-weight:bold;vertical-align:middle;white-space:nowrap;">' + nameText + '</td>';
                rHtml += '<td style="padding:6px 8px;text-align:left;vertical-align:middle;white-space:nowrap;">' + minUnitItemText + '</td>';
                rHtml += '<td style="padding:6px 8px;text-align:right;color:' + (isGold ? '#fde047' : (cg.isAlert ? '#f87171' : '#6ee7b7')) + ';font-weight:bold;vertical-align:middle;white-space:nowrap;">' + minUnitText + '</td>';
                rHtml += '<td style="padding:6px 8px;text-align:right;color:' + (isGold ? '#fef08a' : (cg.isAlert ? '#fde047' : '#fcd34d')) + ';font-weight:bold;vertical-align:middle;white-space:nowrap;">' + avgTop20Text + '</td>';
                rHtml += '<td style="padding:6px 8px;text-align:left;vertical-align:middle;white-space:nowrap;">' + avgTop20Suffix + '</td>';
                rHtml += '<td style="padding:6px 8px;text-align:center;color:' + (isGold ? '#fef08a' : (cg.isAlert ? '#fca5a5' : '#d0b898')) + ';vertical-align:middle;white-space:nowrap;">' + packsText + '</td>';
                rHtml += '</tr>';
                return rHtml;
            }

            var cHtml = '<div style="margin-bottom:8px;color:#caa668;font-size:12px;">' +
                (isMasterEnabled ?
                    '熱門分類行情摘要（勾選首欄「追蹤」可決定該項目是否自動鎖定帶入搜尋）：' :
                    '熱門分類行情摘要 <span style="color:#f87171;font-size:11.5px;font-weight:bold;margin-left:6px;">🔒 自動帶入搜尋已關閉（首欄追蹤已鎖定防誤觸）</span>：') +
                '</div>';
            cHtml += '<table style="width:100%;min-width:520px;border-collapse:collapse;font-size:12px;text-align:left;">';
            cHtml += '<thead><tr style="border-bottom:2px solid #5a4a36;color:#e8d0a0;background:#241f19;">' +
                    '<th style="padding:6px 4px;text-align:center;width:45px;white-space:nowrap;" title="' + (isMasterEnabled ? '勾選是否自動帶入搜尋' : '自動帶入搜尋已關閉（已鎖定防誤觸）') + '">追蹤</th>' +
                    '<th style="padding:6px 8px;min-width:110px;white-space:nowrap;">分類關鍵字</th>' +
                    '<th style="padding:6px 8px;text-align:left;min-width:90px;white-space:nowrap;">最低價物品</th>' +
                    '<th style="padding:6px 8px;text-align:right;min-width:70px;width:70px;white-space:nowrap;">最低單價</th>' +
                    '<th style="padding:6px 8px;text-align:right;min-width:85px;width:85px;white-space:nowrap;">前20均價</th>' +
                    '<th style="padding:6px 8px;text-align:left;min-width:60px;white-space:nowrap;">統計</th>' +
                    '<th style="padding:6px 8px;text-align:center;min-width:85px;white-space:nowrap;">掛單數</th>' +
                    '</tr></thead><tbody>';

            for (var cgIdx = 0; cgIdx < catGroups.length; cgIdx++) {
                cHtml += renderCatRowHtml(catGroups[cgIdx]);
            }

            cHtml += '</tbody></table>';
            body.innerHTML = cHtml;

            var tableTrackChks = body.querySelectorAll('.my-table-track-chk');
            for (var ttc = 0; ttc < tableTrackChks.length; ttc++) {
                tableTrackChks[ttc].addEventListener('change', function(e) {
                    e.stopPropagation();
                    var targetName = this.dataset.name;
                    setItemTracked(targetName, this.checked);
                });
            }
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

        if (body) body.scrollTop = oldBodyScrollTop;
        var newGrid = document.getElementById('my-focus-grid');
        if (newGrid) {
            newGrid.scrollTop = oldGridScrollTop;
        }
    };
    
    window._mySortInitialized = true;
    if (document.getElementById('trade-list')) {
        window.paintTradeList();
    }
})();
