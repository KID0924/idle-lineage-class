/* ============================================================================
 * klh_touch_fix.js — 手機觸控卡死修復外掛 v2
 *
 * 設計原則:
 *   1. 完全不改原作者程式碼 —— 僅透過從外部監聽 DOM 事件與觸控動作進行修復，不改動遊戲原生程式碼。
 *   2. 優雅降級與安全降載 —— 所有功能區塊與監聽器皆以 try-catch 包裹並實施相容性檢查，
 *                         若瀏覽器 API (如 visualViewport、MutationObserver) 缺失或 DOM 元素被修改，
 *                         外掛會默默安全降級或停用局部功能，絕對不拋出致命 JS 錯誤，保障核心遊戲不中斷。
 *
 * 掛接方式: 在 index.html 的 </body> 標籤正上方，插入以下外掛腳本：
 *   <script src="klh_touch_fix.js?v=20260623"></script>
 *
 * 功能一覽:
 *   1. 縮放限制注入        —— 鎖定 Viewport user-scalable 禁止手動縮放，消除 hit-test 偏移的根本原因。
 *   2. 點擊延遲消除        —— 注入全互動元素 CSS touch-action: manipulation，消除 iOS 300ms 點擊延遲。
 *   3. 觸控坐標自動修正    —— 利用強制 Reflow 技術（微幅滾動捲軸 1px 並回彈），解決切換地圖/選單後觸控卡死（座標對不上）問題。
 *   4. 下拉選單自動 Blur   —— 監聽 SELECT 下拉選單 change 事件，在選擇後立即強制 blur 觸發鍵盤關閉與 hit-test 更新。
 *   5. 鍵盤狀態防潮保護    —— touchstart 偵測非輸入元素點擊，在非 focus 區域強制清除 m-keyboard-open 樣式與鍵盤佔位。
 *   6. 視區大小變更修正    —— 監聽 visualViewport resize，即時觸發 Reflow，確保虛擬鍵盤彈起/收回時的選單對齊正常。
 * ========================================================================== */
(function () {
    'use strict';

    // ── 1. 鎖定 viewport 禁止手動縮放（防止 hit-test 偏移的根源） ──
    try {
        var meta = document.querySelector('meta[name="viewport"]');
        if (meta) {
            var content = meta.getAttribute('content') || '';
            if (content.indexOf('user-scalable') < 0) {
                meta.setAttribute('content', content + ', user-scalable=no, maximum-scale=1.0');
            }
        }
    } catch (e) {
        console.warn('[klh_touch_fix] Viewport lock failed:', e);
    }

    // ── 2. 注入修復用 CSS ──
    try {
        var s = document.createElement('style');
        s.id = 'klh-touch-fix';
        s.textContent =
            // 所有可互動元素消除 300ms tap delay
            'button,a,[onclick],.btn,.tab-button,select,input,label,textarea{touch-action:manipulation}\n' +
            '#game-screen{touch-action:pan-y}\n';
        document.head.appendChild(s);
    } catch (e) {
        console.warn('[klh_touch_fix] CSS injection failed:', e);
    }

    // ── 3. 強制 reflow 工具函式 ──
    var gs = null;
    var isAndroid = false;
    try {
        isAndroid = /Android/i.test(navigator.userAgent);
    } catch (e) {
        console.warn('[klh_touch_fix] User agent check failed:', e);
    }

    function reflow() {
        try {
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
        } catch (e) {
            console.warn('[klh_touch_fix] reflow failed:', e);
        }
    }

    // 帶防抖的 reflow
    var reflowTimer = null;
    function debouncedReflow(delay) {
        try {
            clearTimeout(reflowTimer);
            reflowTimer = setTimeout(reflow, delay || 80);
        } catch (e) {
            console.warn('[klh_touch_fix] debouncedReflow failed:', e);
        }
    }

    // ── 4. 工具函式 ──
    function isFocusable(el) {
        try {
            if (!el || !el.tagName) return false;
            var tag = el.tagName;
            return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
        } catch (e) {
            console.warn('[klh_touch_fix] isFocusable check failed:', e);
            return false;
        }
    }

    function hasActiveFocusable() {
        try {
            return document.activeElement && isFocusable(document.activeElement);
        } catch (e) {
            console.warn('[klh_touch_fix] hasActiveFocusable check failed:', e);
            return false;
        }
    }

    // 安全地移除 m-keyboard-open 並多次觸發 reflow 確保觸控命中矩陣更新
    function closeKeyboardState() {
        try {
            if (!document.body.classList.contains('m-keyboard-open')) return;
            document.body.classList.remove('m-keyboard-open');
            setTimeout(reflow, 30);
            setTimeout(reflow, 150);
            setTimeout(reflow, 350);
        } catch (e) {
            console.warn('[klh_touch_fix] closeKeyboardState failed:', e);
        }
    }

    // ── 5. SELECT 元素專用修復 ──
    // iOS 的 <select> picker 是系統原生彈窗，不觸發 visualViewport resize
    // 而且 focusout 的時機不可靠（有時在 picker 關閉後不觸發）
    // 解決方案：監聽 change 事件，用戶選完後主動 blur + reflow
    try {
        document.addEventListener('change', function (e) {
            try {
                if (!e.target || e.target.tagName !== 'SELECT') return;
                if (!document.body.classList.contains('m-mobile')) return;

                // SELECT 值改變 = 用戶已從 picker 選完 → 延遲後 blur 並清除鍵盤狀態
                setTimeout(function () {
                    try {
                        if (document.activeElement === e.target) {
                            e.target.blur();
                        }
                        closeKeyboardState();
                    } catch (err) {
                        console.warn('[klh_touch_fix] SELECT change handler internal error:', err);
                    }
                }, 100);
            } catch (err) {
                console.warn('[klh_touch_fix] SELECT change handler error:', err);
            }
        }, true);
    } catch (e) {
        console.warn('[klh_touch_fix] SELECT change listener registration failed:', e);
    }

    // ── 6. touchstart 偵測非 focusable 區域點擊 ──
    // 有些瀏覽器在 select picker 關閉時不觸發 focusout
    // 用 touchstart 偵測用戶點了別的地方
    try {
        document.addEventListener('touchstart', function (e) {
            try {
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
                        try {
                            if (!hasActiveFocusable()) {
                                closeKeyboardState();
                            }
                        } catch (err) {
                            console.warn('[klh_touch_fix] touchstart internal check failed:', err);
                        }
                    }, 200);
                }
            } catch (err) {
                console.warn('[klh_touch_fix] touchstart handler error:', err);
            }
        }, { passive: true, capture: false });
    } catch (e) {
        console.warn('[klh_touch_fix] touchstart listener registration failed:', e);
    }

    // ── 7. focusout 補充 reflow ──
    // klh_jsonblob/klh_supabase 已有 focusout 移除 m-keyboard-open，
    // 但它們沒做 reflow，這裡補上
    try {
        document.addEventListener('focusout', function () {
            try {
                if (!document.body.classList.contains('m-mobile')) return;
                setTimeout(function () {
                    try {
                        if (!hasActiveFocusable()) {
                            // 即使 m-keyboard-open 已被移除，也要 reflow 確保命中矩陣更新
                            closeKeyboardState();
                            reflow();
                        }
                    } catch (err) {
                        console.warn('[klh_touch_fix] focusout internal check failed:', err);
                    }
                }, 150);
            } catch (err) {
                console.warn('[klh_touch_fix] focusout handler error:', err);
            }
        }, true);
    } catch (e) {
        console.warn('[klh_touch_fix] focusout listener registration failed:', e);
    }

    // ── 8. 點擊後 reflow（攔截關鍵按鈕的 DOM 切換操作） ──
    try {
        document.addEventListener('click', function (e) {
            try {
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
            } catch (err) {
                console.warn('[klh_touch_fix] click handler error:', err);
            }
        }, true);
    } catch (e) {
        console.warn('[klh_touch_fix] click listener registration failed:', e);
    }

    // ── 9. MutationObserver：監聽關鍵容器的 class 變化 ──
    function initObservers() {
        try {
            var ids = ['town-view', 'town-interaction-container', 'town-npc-container'];
            var observer = new MutationObserver(function () {
                try {
                    setTimeout(reflow, 50);
                } catch (err) {
                    console.warn('[klh_touch_fix] MutationObserver callback failed:', err);
                }
            });

            for (var i = 0; i < ids.length; i++) {
                var el = document.getElementById(ids[i]);
                if (el) {
                    observer.observe(el, { attributes: true, attributeFilter: ['class'] });
                }
            }

            // 監聽 body 的 class 變化
            new MutationObserver(function (mutations) {
                try {
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
                } catch (err) {
                    console.warn('[klh_touch_fix] body MutationObserver callback failed:', err);
                }
            }).observe(document.body, {
                attributes: true,
                attributeFilter: ['class'],
                attributeOldValue: true
            });
        } catch (e) {
            console.warn('[klh_touch_fix] initObservers failed:', e);
        }
    }

    // ── 10. visualViewport resize ──
    try {
        var vv = window.visualViewport;
        if (vv) {
            var vvTimer = null;
            vv.addEventListener('resize', function () {
                try {
                    clearTimeout(vvTimer);
                    vvTimer = setTimeout(function () {
                        try {
                            reflow();
                            // viewport 恢復 + 無焦點 → 確保清除 m-keyboard-open
                            if (!hasActiveFocusable()) {
                                closeKeyboardState();
                            }
                        } catch (err) {
                            console.warn('[klh_touch_fix] visualViewport resize handler internal error:', err);
                        }
                    }, 150);
                } catch (err) {
                    console.warn('[klh_touch_fix] visualViewport resize callback failed:', err);
                }
            });
        }
    } catch (e) {
        console.warn('[klh_touch_fix] visualViewport listener registration failed:', e);
    }

    // ── 初始化 ──
    function start() {
        try {
            gs = document.getElementById('game-screen');
            initObservers();
            console.log('[klh_touch_fix] 手機觸控修復 v2 已啟用');
        } catch (e) {
            console.warn('[klh_touch_fix] start failed:', e);
        }
    }

    try {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', start);
        } else {
            start();
        }
    } catch (e) {
        console.warn('[klh_touch_fix] start initialization registration failed:', e);
    }
})();
