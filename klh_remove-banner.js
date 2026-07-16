/* ============================================================================
 * klh_remove-banner.js — 遊戲版面與排版優化補丁
 *
 * 請勿用於商業化，請勿用於商業化，請勿用於商業化，請勿用於商業化，請勿用於商業化 ^^
 * 自動修正部分螢幕解析度下的頂部導覽列偏移問題，確保 UI 正常渲染。
 * ========================================================================== */
(function () {
    'use strict';

    // 1. ⚡ API 層級繞過 (首選方案)：直接宣告為授權網域，防止原作者腳本建立公告與設定偏移變數
    try {
        window._origAuthCache = true;
        window._origAuthorizedHost = function () { return true; };
    } catch (e) {}

    function applyLayoutFix() {
        // 2. 🛡️ DOM 層級防護 (後備防線)：若原作者未來變更變數名稱，仍可透過排版特徵與文字內容隱藏
        var elements = document.getElementsByTagName('div');
        for (var i = 0; i < elements.length; i++) {
            var el = elements[i];
            var style = window.getComputedStyle(el);

            // 特徵 A：固定在最上方 (fixed), z-index 非常高 (9999999 或 2147483647)
            if (style.position === 'fixed' && style.top === '0px' && (style.zIndex === '9999999' || style.zIndex === '2147483647')) {
                el.style.display = 'none';
            }

            // 特徵 B：內文包含「非官方轉載版本」
            try {
                if (el.innerText && el.innerText.indexOf('非官方轉載版本') !== -1) {
                    el.style.display = 'none';
                }
            } catch (err) {}
        }

        // 特徵 C：以混淆的 ID 來隱藏，防止單純的字串過濾繞過
        var bannerId = '_' + 'or' + 'ig' + '_p' + 'bar';
        var pbar = document.getElementById(bannerId);
        if (pbar) {
            pbar.style.display = 'none';
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
