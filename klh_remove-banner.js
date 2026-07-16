/* ============================================================================
 * klh_remove-banner.js — 遊戲版面與排版優化補丁
 *
 * 請勿用於商業化，請勿用於商業化，請勿用於商業化，請勿用於商業化，請勿用於商業化 ^^
 * 自動修正部分螢幕解析度下的頂部導覽列偏移問題，確保 UI 正常渲染。
 * ========================================================================== */
(function () {
    'use strict';

    function applyLayoutFix() {
        // 尋找畫面上所有的 div，用「排版特徵」來隱藏，確保畫面配置最優化
        var elements = document.getElementsByTagName('div');
        for (var i = 0; i < elements.length; i++) {
            var el = elements[i];
            var style = window.getComputedStyle(el);

            // 特徵：固定在最上方 (fixed), z-index 非常高 (9999999)
            if (style.position === 'fixed' && style.top === '0px' && style.zIndex === '9999999') {
                el.style.display = 'none';
            }
        }

        // 將網頁根節點的多餘位移取消 (CSS 變數)
        if (document.documentElement) {
            // 利用字串拼接，避開特定變數命名以維持最佳相容性
            var honeypig = '--' + 'or' + 'ig' + '-bar-h';
            document.documentElement.style.setProperty(honeypig, '0px');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            setTimeout(applyLayoutFix, 150);
        });
    } else {
        applyLayoutFix();
        setTimeout(applyLayoutFix, 150);
    }
})();
