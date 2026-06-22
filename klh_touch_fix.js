/* ============================================================================
 * klh_touch_fix.js — 手機觸控卡死修復外掛 v2
 *
 * 修復的三大問題：
 *   1. 返回村莊/切選單後觸控卡死（需 zoom in/out 才恢復）
 *   2. SELECT 下拉選單（自動化藥水/技能）關閉後，底部選單出現卻不能點
 *   3. 靠近底部選單的 INPUT 點擊後「震一下」就沒反應
 *
 * 根因分析：
 *   A. iOS/Android WebKit position:fixed 容器的觸控命中測試矩陣在
 *      visualViewport 變化後不會自動更新 → 觸控座標對不上渲染位置
 *   B. focusin 觸發時用 display:none 隱藏 #m-nav，導致 layout shift
 *      → 靠近 nav 的 input 被推動 → 觸發 focusout → nav 恢復
 *      → input 移回 → 又觸發 focusin → 無限震盪
 *      已在 klh_jsonblob.js / klh_supabase.js 中改用 off-screen 定位解決
 *   C. SELECT 的 iOS 原生 picker 不觸發 visualViewport resize，
 *      只靠 focusin/focusout，但 focusout 後 hit-test 不更新
 *
 * 修復策略：
 *   1. #m-nav 隱藏已改為「位移到螢幕外」（在 klh_jsonblob / klh_supabase 的 CSS）
 *   2. 本插件負責：SELECT change 後自動 blur + reflow、focusout 後延遲 reflow、
 *      touchstart 偵測非 focusable 區域 → 強制清除 m-keyboard-open、
 *      關鍵 DOM 切換後的 reflow
 *   3. visualViewport resize 時也觸發 reflow
 *
 * 效能影響：趨近於零
 *   - 沒有 setInterval / 定時輪詢
 *   - 所有監聽都是被動觸發
 * ========================================================================== */
(function () {
    'use strict';

    // ── 1. 鎖定 viewport 禁止手動縮放（防止 hit-test 偏移的根源） ──
    var meta = document.querySelector('meta[name="viewport"]');
    if (meta) {
        var content = meta.getAttribute('content') || '';
        if (content.indexOf('user-scalable') < 0) {
            meta.setAttribute('content', content + ', user-scalable=no, maximum-scale=1.0');
        }
    }

    // ── 2. 注入修復用 CSS ──
    var s = document.createElement('style');
    s.id = 'klh-touch-fix';
    s.textContent =
        // 所有可互動元素消除 300ms tap delay
        'button,a,[onclick],.btn,.tab-button,select,input,label,textarea{touch-action:manipulation}\n' +
        '#game-screen{touch-action:pan-y}\n';
    document.head.appendChild(s);

    // ── 3. 強制 reflow 工具函式 ──
    var gs = null;
    var isAndroid = /Android/i.test(navigator.userAgent);
    function reflow() {
        if (!gs) gs = document.getElementById('game-screen');
        if (!gs) return;

        if (isAndroid) {
            // Android/Blink: 透過微調 style 並強制讀取，確保重寫觸控命中測試矩陣
            var orig = gs.style.paddingRight;
            gs.style.paddingRight = '1px';
            void gs.offsetHeight;
            gs.style.paddingRight = orig;
        } else {
            // iOS/Safari: 讀 offsetHeight 強制瀏覽器重算佈局與觸控命中矩陣
            void gs.offsetHeight;
        }

        // 雙重保險：也讀 #m-nav 的命中矩陣
        var nav = document.getElementById('m-nav');
        if (nav) void nav.offsetHeight;
    }

    // 帶防抖的 reflow
    var reflowTimer = null;
    function debouncedReflow(delay) {
        clearTimeout(reflowTimer);
        reflowTimer = setTimeout(reflow, delay || 80);
    }

    // ── 4. 工具函式 ──
    function isFocusable(el) {
        if (!el || !el.tagName) return false;
        var tag = el.tagName;
        return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
    }

    function hasActiveFocusable() {
        return document.activeElement && isFocusable(document.activeElement);
    }

    // 安全地移除 m-keyboard-open 並多次觸發 reflow 確保觸控命中矩陣更新
    function closeKeyboardState() {
        if (!document.body.classList.contains('m-keyboard-open')) return;
        document.body.classList.remove('m-keyboard-open');
        setTimeout(reflow, 30);
        setTimeout(reflow, 150);
        setTimeout(reflow, 350);
    }

    // ── 5. SELECT 元素專用修復 ──
    // iOS 的 <select> picker 是系統原生彈窗，不觸發 visualViewport resize
    // 而且 focusout 的時機不可靠（有時在 picker 關閉後不觸發）
    // 解決方案：監聽 change 事件，用戶選完後主動 blur + reflow
    document.addEventListener('change', function (e) {
        if (!e.target || e.target.tagName !== 'SELECT') return;
        if (!document.body.classList.contains('m-mobile')) return;

        // SELECT 值改變 = 用戶已從 picker 選完 → 延遲後 blur 並清除鍵盤狀態
        setTimeout(function () {
            if (document.activeElement === e.target) {
                e.target.blur();
            }
            closeKeyboardState();
        }, 100);
    }, true);

    // ── 6. touchstart 偵測非 focusable 區域點擊 ──
    // 有些瀏覽器在 select picker 關閉時不觸發 focusout
    // 用 touchstart 偵測用戶點了別的地方
    document.addEventListener('touchstart', function (e) {
        if (!document.body.classList.contains('m-keyboard-open')) return;
        if (!document.body.classList.contains('m-mobile')) return;

        // 檢查用戶點擊的是不是 focusable 元素
        var target = e.target;
        var clickedFocusable = false;
        var el = target;
        while (el) {
            if (isFocusable(el)) { clickedFocusable = true; break; }
            el = el.parentElement;
        }
        if (!clickedFocusable) {
            // 如果點的不是輸入框 → 延遲後確認焦點狀態並清除
            setTimeout(function () {
                if (!hasActiveFocusable()) {
                    closeKeyboardState();
                }
            }, 200);
        }
    }, { passive: true, capture: false });

    // ── 7. focusout 補充 reflow ──
    // klh_jsonblob/klh_supabase 已有 focusout 移除 m-keyboard-open，
    // 但它們沒做 reflow，這裡補上
    document.addEventListener('focusout', function () {
        if (!document.body.classList.contains('m-mobile')) return;
        setTimeout(function () {
            if (!hasActiveFocusable()) {
                // 即使 m-keyboard-open 已被移除，也要 reflow 確保命中矩陣更新
                closeKeyboardState();
                reflow();
            }
        }, 150);
    }, true);

    // ── 8. 點擊後 reflow（攔截關鍵按鈕的 DOM 切換操作） ──
    document.addEventListener('click', function (e) {
        if (!e.target || !document.body.classList.contains('m-mobile')) return;
        var btn = e.target.closest ? e.target.closest('button,[onclick]') : null;
        if (!btn) return;

        var text = (btn.textContent || '').trim();
        var oc = btn.getAttribute('onclick') || '';

        if (text === '返回村莊' || text === '返回' ||
            oc.indexOf('closeNpcInteraction') >= 0 ||
            oc.indexOf('returnToTown') >= 0 ||
            btn.closest('#m-nav') ||
            btn.closest('#town-npc-container')) {
            setTimeout(reflow, 50);
            setTimeout(reflow, 200);
        }
    }, true);

    // ── 9. MutationObserver：監聽關鍵容器的 class 變化 ──
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

        // 監聽 body 的 class 變化
        new MutationObserver(function (mutations) {
            for (var j = 0; j < mutations.length; j++) {
                var old = mutations[j].oldValue || '';
                var cur = document.body.className || '';

                // mview 切換（戰鬥↔設定↔背包）
                if (cur.indexOf('mview-') >= 0) {
                    debouncedReflow(50);
                }

                // m-keyboard-open 剛被移除 → 觸控命中矩陣需要更新
                if (old.indexOf('m-keyboard-open') >= 0 &&
                    cur.indexOf('m-keyboard-open') < 0) {
                    setTimeout(reflow, 30);
                    setTimeout(reflow, 150);
                    setTimeout(reflow, 400);
                }
            }
        }).observe(document.body, {
            attributes: true,
            attributeFilter: ['class'],
            attributeOldValue: true
        });
    }

    // ── 10. visualViewport resize ──
    var vv = window.visualViewport;
    if (vv) {
        var vvTimer = null;
        vv.addEventListener('resize', function () {
            clearTimeout(vvTimer);
            vvTimer = setTimeout(function () {
                reflow();
                // viewport 恢復 + 無焦點 → 確保清除 m-keyboard-open
                if (!hasActiveFocusable()) {
                    closeKeyboardState();
                }
            }, 150);
        });
    }

    // ── 初始化 ──
    function start() {
        gs = document.getElementById('game-screen');
        initObservers();
        console.log('[klh_touch_fix] 手機觸控修復 v2 已啟用');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
