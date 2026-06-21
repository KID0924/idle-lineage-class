/* ============================================================================
 * klh_touch_fix.js — 手機觸控卡死修復外掛
 *
 * 問題描述:
 *   在手機上，點選村莊商人後按「返回村莊」無效，或打怪時切回選單卡住，
 *   必須 pinch zoom in/out 才恢復點擊。這是因為 iOS/Android WebKit 的
 *   position:fixed 元素在 visualViewport 縮放或軟鍵盤彈出/收起後，
 *   觸控命中測試 (hit-test) 座標會與實際渲染位置脫節，導致點擊「穿透」
 *   或「打不到」按鈕。zoom in/out 會強制瀏覽器重新計算佈局，所以能暫時修復。
 *
 * 修復原理:
 *   1. 監聽 visualViewport 的 resize/scroll 事件，在縮放或鍵盤收起後
 *      強制觸發一次 reflow（透過讀取 offsetHeight），讓瀏覽器重算觸控命中區域。
 *   2. 在「返回村莊」按鈕、底部導覽列按鈕、NPC 互動按鈕被點擊後，
 *      強制對 game-screen 做一次微型 reflow。
 *   3. 修復 iOS Safari 300ms click delay 殘留：對所有按鈕加上 touch-action: manipulation。
 *   4. 防止手機雙指縮放導致的命中區域脫節：鎖定 viewport scale = 1。
 *
 * 設計原則: 完全不改原作者程式碼，只追加行為。
 * 掛接方式: 在 index.html 的 </body> 標籤正上方插入此腳本：
 *   <script src="klh_touch_fix.js"></script>
 * ========================================================================== */
(function () {
    'use strict';

    // =============================================
    // 1. 鎖定 viewport 禁止手動縮放（防止 hit-test 偏移的根源）
    // =============================================
    var meta = document.querySelector('meta[name="viewport"]');
    if (meta) {
        var content = meta.getAttribute('content') || '';
        // 如果原本沒有設定 user-scalable=no 與 maximum-scale=1，加上去
        if (content.indexOf('user-scalable') < 0) {
            content += ', user-scalable=no, maximum-scale=1.0';
            meta.setAttribute('content', content);
        }
    }

    // =============================================
    // 2. 全域 touch-action: manipulation（消除 300ms delay 與雙擊縮放）
    // =============================================
    var fixStyle = document.createElement('style');
    fixStyle.id = 'klh-touch-fix-style';
    fixStyle.textContent = [
        // 全域按鈕與可點擊元素：消除 300ms tap delay
        'button, a, [onclick], .btn, .tab-button, .list-item, select, input, label { touch-action: manipulation; }',
        // game-screen 內部：禁止雙擊縮放（保留垂直捲動）
        '#game-screen { touch-action: pan-y; }',
        // NPC 互動容器內的按鈕：確保觸控不被攔截
        '#town-interaction-container button, #town-npc-container button, #town-npc-container div[onclick] { touch-action: manipulation; cursor: pointer; }'
    ].join('\n');
    document.head.appendChild(fixStyle);

    // =============================================
    // 3. visualViewport resize 監聽：強制重算觸控命中區域
    // =============================================
    var vv = window.visualViewport;
    var gs = null;
    var debounceTimer = null;

    function forceReflow() {
        if (!gs) gs = document.getElementById('game-screen');
        if (!gs) return;

        // 方法一：觸發最小化的 reflow（讀取 offsetHeight 會強制瀏覽器重新計算佈局）
        void gs.offsetHeight;

        // 方法二：對 fixed 元素做微型位移再歸位（觸發合成器重繪觸控命中矩陣）
        gs.style.transform = 'translateZ(0)';
        requestAnimationFrame(function () {
            gs.style.transform = '';
        });
    }

    function debouncedReflow() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(forceReflow, 120);
    }

    if (vv) {
        // visualViewport resize 在鍵盤彈出/收起、雙指縮放時觸發
        vv.addEventListener('resize', debouncedReflow);
        vv.addEventListener('scroll', debouncedReflow);
    }

    // 頁面 resize 與方向變更也強制重算
    window.addEventListener('resize', debouncedReflow);
    window.addEventListener('orientationchange', function () {
        setTimeout(forceReflow, 300);
    });

    // =============================================
    // 4. 攔截「返回村莊」按鈕的 click 事件，強制 reflow 確保 NPC 按鈕可點
    // =============================================
    document.addEventListener('click', function (e) {
        if (!e.target) return;
        var btn = e.target.closest ? e.target.closest('button, [onclick]') : null;
        if (!btn) return;

        // 檢測是否是 NPC 互動相關的按鈕（返回村莊、NPC 選擇、底部導覽）
        var isRelevant = false;
        var text = (btn.textContent || '').trim();
        var onclick = btn.getAttribute('onclick') || '';

        if (text === '返回村莊' || text === '返回' ||
            onclick.indexOf('closeNpcInteraction') >= 0 ||
            onclick.indexOf('returnToTown') >= 0 ||
            onclick.indexOf('changeMap') >= 0 ||
            btn.closest('#m-nav') ||
            btn.closest('#town-npc-container') ||
            btn.closest('#town-interaction-container')) {
            isRelevant = true;
        }

        if (isRelevant) {
            // 在 DOM 更新後（setTimeout 0）強制 reflow，讓新出現的按鈕命中區域正確
            setTimeout(forceReflow, 0);
            setTimeout(forceReflow, 100);
            setTimeout(forceReflow, 300);
        }
    }, true);

    // =============================================
    // 5. MutationObserver：監視 town-view 的 visibility 變化，自動 reflow
    // =============================================
    function initObserver() {
        var townView = document.getElementById('town-view');
        var interactionContainer = document.getElementById('town-interaction-container');
        var npcContainer = document.getElementById('town-npc-container');

        var targets = [townView, interactionContainer, npcContainer].filter(Boolean);
        if (!targets.length) return;

        var observer = new MutationObserver(function (mutations) {
            // 當 hidden class 被加入或移除時（顯示/隱藏切換），強制重算觸控命中
            var needsReflow = false;
            for (var i = 0; i < mutations.length; i++) {
                if (mutations[i].type === 'attributes' && mutations[i].attributeName === 'class') {
                    needsReflow = true;
                    break;
                }
            }
            if (needsReflow) {
                setTimeout(forceReflow, 0);
                setTimeout(forceReflow, 150);
            }
        });

        targets.forEach(function (el) {
            observer.observe(el, { attributes: true, attributeFilter: ['class'] });
        });
    }

    // =============================================
    // 6. 打怪 → 選單切換修復：監聽手機導覽列 class 變化
    // =============================================
    function initBodyObserver() {
        var observer = new MutationObserver(function (mutations) {
            for (var i = 0; i < mutations.length; i++) {
                if (mutations[i].type === 'attributes' && mutations[i].attributeName === 'class') {
                    var cls = document.body.className;
                    // 當切換到不同的 mview 時，強制 reflow
                    if (cls.indexOf('mview-') >= 0) {
                        setTimeout(forceReflow, 0);
                        setTimeout(forceReflow, 200);
                    }
                }
            }
        });
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }

    // =============================================
    // 初始化
    // =============================================
    function start() {
        gs = document.getElementById('game-screen');
        initObserver();
        initBodyObserver();
        forceReflow();
        console.log('[klh_touch_fix] 手機觸控修復外掛已啟用 — 禁止縮放、強制 reflow、消除 300ms delay。');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
