// ═══════════════════════════════════════════════════════════════════════════
// 📈 klh_perf-monitor.js — 實時效能監控器 (FPS & Game Tick Monitor) v1.0
// ═══════════════════════════════════════════════════════════════════════════
// 獨立掛載的外掛，在畫面右上方建立小型的效能監控器。
// 桌機與手機皆可運作，提供實時 FPS 測量及 window.tick() 單次執行時間統計。
// ═══════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  function initPerfMonitor() {
    if (document.getElementById('klh-perf-monitor')) return;
    var monitor = document.createElement('div');
    monitor.id = 'klh-perf-monitor';
    monitor.setAttribute('style', 'position: fixed; top: 4px; right: 4px; z-index: 100000; background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(4px); border: 1px solid rgba(51, 65, 85, 0.7); border-radius: 6px; padding: 3px 6px; font-family: monospace; font-size: 10px; color: #cbd5e1; pointer-events: auto; cursor: pointer; user-select: none; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.5); transition: opacity 0.3s; opacity: 0.8;');
    document.body.appendChild(monitor);

    var fps = 0;
    var lastFrameTime = performance.now();
    var frameCount = 0;
    var lastTickTimeMs = 0;

    // 攔截全域的 tick() 以追蹤處理耗時
    if (typeof window.tick === 'function') {
      var originalTick = window.tick;
      window.tick = function () {
        var t0 = performance.now();
        originalTick.apply(this, arguments);
        lastTickTimeMs = performance.now() - t0;
      };
    }

    function updateUI() {
      var animOff = window.__vfxOff;
      var fpsColor = '#22c55e';
      if (fps < 45) fpsColor = '#eab308';
      if (fps < 25) fpsColor = '#ef4444';

      var tickColor = '#cbd5e1';
      if (lastTickTimeMs > 16) tickColor = '#eab308';
      if (lastTickTimeMs > 50) tickColor = '#ef4444';

      monitor.innerHTML = '<span style="color: ' + fpsColor + '; font-weight: bold;">FPS: ' + fps + '</span> | ' +
                          '<span style="color: ' + tickColor + ';">Tick: ' + lastTickTimeMs.toFixed(1) + 'ms</span> | ' +
                          '<span style="color: ' + (animOff ? '#10b981' : '#f43f5e') + '; font-weight: bold;">VFX: ' + (animOff ? 'OFF' : 'ON') + '</span>';
    }

    function measureFps() {
      var now = performance.now();
      frameCount++;
      if (now >= lastFrameTime + 1000) {
        fps = Math.round((frameCount * 1000) / (now - lastFrameTime));
        frameCount = 0;
        lastFrameTime = now;
        updateUI();
      }
      requestAnimationFrame(measureFps);
    }
    requestAnimationFrame(measureFps);

    var collapsed = false;
    monitor.onclick = function() {
      collapsed = !collapsed;
      monitor.style.opacity = collapsed ? '0.1' : '0.8';
    };
  }

  function boot() {
    initPerfMonitor();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})();
