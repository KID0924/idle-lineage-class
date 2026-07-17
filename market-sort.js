(function () {
  // 防重複載入
  if (window._ms) return;

  var o = window.paintTradeList;
  if (typeof o !== 'function') return;

  window._ms = 1;
  window._mc = 'n';

  window.paintTradeList = function () {
    var m = window.marketData;
    if (m && Array.isArray(m) && window._mc !== 'n') {
      m.sort(function (a, b) {
        var s = window._mc;
        var ac = a.cnt || 1;
        var bc = b.cnt || 1;
        if (s === 'pa') return a.price - b.price;
        if (s === 'pd') return b.price - a.price;
        if (s === 'ua') return (a.price / ac) - (b.price / bc);
        if (s === 'ud') return (b.price / bc) - (a.price / ac);
        return 0;
      });
    }

    var r = o.apply(this, arguments);

    var si = document.getElementById('trade-search');
    if (si && si.parentNode && si.parentNode.id !== 'msu') {
      // 建立並排容器
      var w = document.createElement('div');
      w.id = 'msu';
      w.style.cssText = 'display:flex;gap:6px;margin-bottom:8px;width:100%';
      si.parentNode.insertBefore(w, si);

      // 搜尋框變窄
      si.style.flex = '1';
      si.style.minWidth = '0';
      si.style.marginBottom = '0';
      w.appendChild(si);

      // 排序下拉選單
      var se = document.createElement('select');
      se.style.cssText = 'flex:0 0 auto;padding:8px 4px;border-radius:8px;border:1px solid #5a4a26;background:#efe9dc;color:#2a2018;font-size:13px;font-weight:bold';
      se.innerHTML =
        '<option value="n">\u{1F500}\u9810\u8A2D</option>' +
        '<option value="pa">\u{1F4B0}\u7E3D\u50F9\u4F4E\u2192\u9AD8</option>' +
        '<option value="pd">\u{1F4B0}\u7E3D\u50F9\u9AD8\u2192\u4F4E</option>' +
        '<option value="ua">\u{1F4E6}\u55AE\u50F9\u4F4E\u2192\u9AD8</option>' +
        '<option value="ud">\u{1F4E6}\u55AE\u50F9\u9AD8\u2192\u4F4E</option>';
      w.appendChild(se);
      se.value = window._mc;

      se.onchange = function () {
        window._mc = se.value;
        if (typeof tradeShowMax !== 'undefined') tradeShowMax = 80;
        window.paintTradeList();
      };
    }

    return r;
  };

  // 如果已經在交易所畫面，立即套用
  if (document.getElementById('trade-list')) {
    window.paintTradeList();
  }
})();
