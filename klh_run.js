(function () {
    'use strict';

    function initEmergencyAnnouncement() {
        const headerDiv = document.querySelector('#creation-screen > div.text-center') || document.querySelector('#creation-screen > div:first-child');
        const mainMenu = document.getElementById('main-menu');
        if (headerDiv && mainMenu) {
            const announceDiv = document.createElement('div');
            announceDiv.id = 'klh-emergency-announcement';
            announceDiv.className = 'w-full max-w-2xl mx-auto bg-rose-950/40 border border-rose-500/50 rounded-xl p-4 my-4 text-left shadow-lg';
            announceDiv.innerHTML = `
                <div class="text-rose-400 font-bold text-base mb-2 flex items-center gap-1.5 justify-center sm:justify-start">
                    <span>🚨 緊急公告：金鑰版停止更新與存檔遷移通知</span>
                </div>
                <div class="text-xs sm:text-sm text-slate-300 leading-relaxed flex flex-col gap-2.5">
                    <p>感謝各位一直以來對金鑰版的喜愛與支持！</p>
                    <p>近期看到原作者在遊戲平衡上下了非常多心血，出於對原作者的尊重，同時考量到未來可能面臨的系統檢測風險（因本人兩週前才剛開始接觸 JavaScript，能力實在有限）。雖然目前存檔轉移功能一切正常，我們仍決定做出以下調整：</p>
                    <div class="border-t border-rose-900/50 pt-2.5 mt-1 flex flex-col gap-1.5">
                        <p class="text-yellow-400 font-bold"><span class="text-rose-400">●</span> 停止更新： <span class="text-slate-200 font-normal">即日起，金鑰版將正式停止更新。</span></p>
                        <p class="text-yellow-400 font-bold"><span class="text-rose-400">●</span> 存檔保留期限： <span class="text-yellow-300">各位的存檔資料將保留 10 天（至 7 月 7 日截止）。</span></p>
                    </div>
                    <p class="mt-1 text-slate-200 font-semibold border-t border-rose-900/50 pt-2.5">
                        ⚠️ 請大家務必抓緊時間，盡快將存檔匯出並轉移至「<a href="https://shines871.github.io/idle-lineage-class/" target="_blank" class="text-sky-400 hover:text-sky-300 underline underline-offset-4">原作者官方版 (秋玥)</a>」或「<a href="https://pp771007.github.io/idle-lineage-class/" target="_blank" class="text-sky-400 hover:text-sky-300 underline underline-offset-4">Chaos 版本</a>」，以免心血損失。再次感謝大家的理解與配合！
                    </p>
                </div>
            `;
            mainMenu.parentNode.insertBefore(announceDiv, mainMenu);
        }
    }

    if (document.readyState === 'interactive' || document.readyState === 'complete') {
        initEmergencyAnnouncement();
    } else {
        document.addEventListener('DOMContentLoaded', initEmergencyAnnouncement);
    }
})();
