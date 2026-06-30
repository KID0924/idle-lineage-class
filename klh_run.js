(function () {
    'use strict';

    function initEmergencyAnnouncement() {
        const headerDiv = document.querySelector('#creation-screen > div.text-center') || document.querySelector('#creation-screen > div:first-child');
        const mainMenu = document.getElementById('main-menu');
        if (headerDiv && mainMenu) {
            // 注入被 Tailwind 預編譯過濾掉的公告欄樣式
            if (!document.getElementById('klh-announcement-custom-style')) {
                const style = document.createElement('style');
                style.id = 'klh-announcement-custom-style';
                style.textContent = `
                    .bg-rose-950\\/40 {
                        background-color: rgba(69, 10, 10, 0.4) !important;
                    }
                    .border-rose-500\\/50 {
                        border-color: rgba(239, 68, 68, 0.5) !important;
                    }
                    .text-rose-400 {
                        color: #fb7185 !important;
                    }
                    .border-rose-900\\/50 {
                        border-color: rgba(127, 29, 29, 0.5) !important;
                    }
                    #klh-emergency-announcement a.text-sky-400 {
                        color: #38bdf8 !important;
                        text-decoration: underline !important;
                        text-underline-offset: 4px !important;
                    }
                    #klh-emergency-announcement a.text-sky-400:hover {
                        color: #7dd3fc !important;
                    }
                `;
                document.head.appendChild(style);
            }
            const announceDiv = document.createElement('div');
            announceDiv.id = 'klh-emergency-announcement';
            announceDiv.className = 'w-full max-w-2xl mx-auto bg-rose-950/40 border border-rose-500/50 rounded-xl p-4 my-4 text-left shadow-lg';
            announceDiv.innerHTML = `
                <div class="text-rose-400 font-bold text-base mb-2 flex items-center gap-1.5 justify-center sm:justify-start">
                    <span>🚨 緊急公告：金鑰版停止更新與存檔遷移通知</span>
                </div>
                <div class="text-xs sm:text-sm text-slate-300 leading-relaxed flex flex-col gap-2.5">
                    <p>感謝各位一直以來對金鑰版的喜愛與支持！</p>
                    <p>近期看到原作者在遊戲平衡上下了非常多心血，出於對原作者的尊重，同時考量到未來可能面臨的系統檢測風險（因本人兩週前才剛開始接觸 JavaScript，時間、能力實在有限）。雖然目前存檔轉移功能一切正常，本人仍決定做出以下調整：</p>
                    <div class="border-t border-rose-900/50 pt-2.5 mt-1 flex flex-col gap-1.5">
                        <p class="text-yellow-400 font-bold"><span class="text-rose-400">●</span> 停止更新： <span class="text-slate-200 font-normal">即日起，金鑰版將正式停止更新。</span></p>
                        <p class="text-yellow-400 font-bold"><span class="text-rose-400">●</span> 網站關閉與存檔保留： <span class="text-yellow-300"><span class="text-slate-200 font-normal">目前仍能進入遊戲遊玩</span>，本網站將於 7 月 7 日後正式關閉，資料僅保留至該日。請大家務必儘早完成遷移，切勿拖到最後一天，以免因網站意外當機或關閉導致心血遺失！</span></p>
                    </div>
                    <p class="mt-1 text-slate-200 font-semibold border-t border-rose-900/50 pt-2.5">
                        ⚠️ 請大家務必抓緊時間，盡快將存檔匯出並轉移至「<a href="https://shines871.github.io/idle-lineage-class/" target="_blank" rel="noopener noreferrer" class="text-sky-400 hover:text-sky-300 underline underline-offset-4">原作者官方版 (秋玥)</a>」或「<a href="https://pp771007.github.io/idle-lineage-class/" target="_blank" rel="noopener noreferrer" class="text-sky-400 hover:text-sky-300 underline underline-offset-4">Chaos 版本</a>」，以免心血損失。再次感謝大家的理解與配合！
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
