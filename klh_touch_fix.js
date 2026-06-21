/* ============================================================================
 * klh_touch_fix.js — 手機觸控卡死修復外掛（輕量版）
 *
 * 問題: 手機上點「返回村莊」或切選單時觸控卡住，需 zoom in/out 才恢復。
 * 根因: iOS/Android WebKit 的 position:fixed 在 visualViewport 變化後，
 *        觸控命中測試座標會與渲染位置脫節。
 *
 * 修復策略（極輕量，不影響效能）:
 *   1. 鎖定 viewport 禁止手動縮放（防止 hit-test 偏移的根源）
 *   2. 全域 touch-action: manipulation（消除 300ms delay 與雙擊縮放）
 *   3. 在關鍵 DOM 切換時做一次 reflow（等效用戶手動 zoom 的效果）
 *
 * 效能影響: 趨近於零
 *   - 沒有 setInterval / 定時輪詢
 *   - MutationObserver 只監聽 3 個元素的 class 變化（不監聽 subtree）
 *   - reflow 只在「按鈕被點」或「class 變更」時觸發，不會持續運行
 * ========================================================================== */
(function () {
    'use strict';

    // ── 1. 鎖定 viewport 禁止縮放 ──
    var meta = document.querySelector('meta[name="viewport"]');
    if (meta) {
        var content = meta.getAttribute('content') || '';
        if (content.indexOf('user-scalable') < 0) {
            meta.setAttribute('content', content + ', user-scalable=no, maximum-scale=1.0');
        }
    }

    // ── 2. 注入極少量 CSS ──
    var s = document.createElement('style');
    s.id = 'klh-touch-fix';
    s.textContent =
        'button,a,[onclick],.btn,.tab-button,select,input,label{touch-action:manipulation}' +
        '#game-screen{touch-action:pan-y}';
    document.head.appendChild(s);

    // ── 3. 強制 reflow 工具函式 ──
    var gs = null;
    function reflow() {
        if (!gs) gs = document.getElementById('game-screen');
        if (!gs) return;
        // 讀 offsetHeight 強制瀏覽器重算佈局（觸控命中矩陣跟著更新）
        void gs.offsetHeight;
    }

    // ── 4. 點擊後 reflow（只攔截關鍵按鈕，用事件委派不加額外 listener） ──
    document.addEventListener('click', function (e) {
        if (!e.target || !document.body.classList.contains('m-mobile')) return;
        var btn = e.target.closest ? e.target.closest('button,[onclick]') : null;
        if (!btn) return;

        var text = (btn.textContent || '').trim();
        var oc = btn.getAttribute('onclick') || '';

        // 只在這幾種關鍵切換操作後 reflow
        if (text === '返回村莊' || text === '返回' ||
            oc.indexOf('closeNpcInteraction') >= 0 ||
            oc.indexOf('returnToTown') >= 0 ||
            btn.closest('#m-nav') ||
            btn.closest('#town-npc-container')) {
            // 延遲 reflow 讓 DOM 先更新完成
            setTimeout(reflow, 50);
            setTimeout(reflow, 200);
        }
    }, true);

    // ── 5. MutationObserver：只監聽 3 個關鍵容器的 class 變化 ──
    //    效能幾乎為零：attributeFilter 限定只看 class，不監聽子樹
    function initObservers() {
        var ids = ['town-view', 'town-interaction-container', 'town-npc-container'];
        var observer = new MutationObserver(function () {
            setTimeout(reflow, 50);
        });

        for (var i = 0; i < ids.length; i++) {
            var el = document.getElementById(ids[i]);
            if (el) {
                observer.observe(el, { attributes: true, attributeFilter: ['class'] });
            }
        }

        // 監聽 body 的 mview 切換（戰鬥↔設定↔背包）
        new MutationObserver(function () {
            if (document.body.className.indexOf('mview-') >= 0) {
                setTimeout(reflow, 50);
            }
        }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }

    // ── 6. visualViewport resize（鍵盤收起/彈出時觸發，被動監聽不耗效能） ──
    var vv = window.visualViewport;
    if (vv) {
        var timer = null;
        vv.addEventListener('resize', function () {
            clearTimeout(timer);
            timer = setTimeout(reflow, 150);
        });
    }

    // ── 初始化 ──
    function start() {
        gs = document.getElementById('game-screen');
        initObservers();
        console.log('[klh_touch_fix] 手機觸控修復已啟用（輕量版）');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
