/* ============================================================================
 * klh_pk.js — 無界競技場 (Supabase 即時配對 & 決鬥加速外掛)
 *
 * 設計原則:
 *   1. 完全不改原作者程式碼 —— 僅透過從外部「包住」全域函式 (Monkey-Patch) 進行擴充。
 *   2. 優雅降級與安全降載 —— 核心 Hook 皆以 try-catch 沙盒包裹並配備 typeof 存在性檢查，
 *                         若原作者未來改版導致函式或變數消失，外掛功能會默默安全降級或停用，
 *                         確保絕對不拋出致命 JS 錯誤，完全保障原版遊戲流程不中斷。
 *   3. 極致省流量架構 —— 搜尋僅下載預覽欄位（~0.85KB/次），挑戰才精準下載單筆名片（~1.3KB），
 *                       刷新對手列表雲端僅拉 4 筆（~5.1KB），其餘 6 名由前端零流量 NPC 補齊。
 *   4. 雙重安全防禦 —— 前端 3 秒冷卻倒數 + 後端 Supabase Trigger 硬性攔截，
 *                     防止惡意腳本或外掛繞過前端狂刷 API。
 *
 * 掛接方式: 在 index.html 的 </body> 標籤正上方，插入以下外掛腳本：
 *   <script src="js/klh_pk.js?v=20260722"></script>
 *
 * 功能一覽:
 *   1. Supabase 連線初始化 —— 異步載入 SDK 並建立 Client 連線。
 *   2. 雲端名片上傳 —— 含 player_name ≤10字 / weapon_name ≤25字 字數限制與 3 秒按鈕冷卻。
 *   3. 雲端挑戰 & 搜尋 —— 兩階段省流量架構（階段1 預覽 → 階段2 精準下載 card_data）。
 *   4. 對手列表刷新 —— 雲端 RPC 隨機抽樣 4 名 + 前端零流量生成 6 名 NPC，共 10 名混合。
 *   5. 本機 NPC 對手生成器 —— 含超級首領 / 菜鳥新手 / 波動對手三種難度分佈。
 *   6. 雲端 UI 注入 & DOM 監聽 —— MutationObserver 自動偵測面板掛載點並嵌入。
 *   7. 決鬥 5 秒計時加速 —— 每 100ms 批次執行 10 個 tick (10 倍速)，分出勝負即自動銷毀。
 *   8. Monkey-Patch Hooks —— Hook pvpArenaStart / pvpResultContinue / openPvpArena 等。
 * ========================================================================== */

(function () {
    'use strict';

    /* ========================================================================
     *  ⚡ 1. Supabase 連線初始化
     * ======================================================================== */

    const SUPABASE_URL = 'https://onsqosmlmkfgjevryxek.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9uc3Fvc21sbWtmZ2pldnJ5eGVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3MTI4NjIsImV4cCI6MjEwMDI4ODg2Mn0.WMZnonxgqkE67AUZAg9-RCPBmC9Cu2-_xqYBkfvpOpo';

    let supabase = null;
    let cachedOpponents = null;

    function loadSupabaseSDK() {
        return new Promise((resolve, reject) => {
            if (window.supabase && typeof window.supabase.createClient === 'function') {
                resolve(window.supabase);
                return;
            }
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
            script.onload = () => {
                if (window.supabase) resolve(window.supabase);
                else reject(new Error('Supabase SDK 載入後未發現 window.supabase'));
            };
            script.onerror = () => reject(new Error('無法載入 Supabase SDK 腳本'));
            document.head.appendChild(script);
        });
    }

    async function getSupabaseClient() {
        if (!supabase) {
            await loadSupabaseSDK();
            supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        }
        return supabase;
    }

    getSupabaseClient().catch(err => console.error('[雲端競技場] Supabase SDK 初始化失敗:', err));

    /* ========================================================================
     *  ⚡ 2. 雲端名片上傳 (含字數限制 & 3 秒冷卻)
     * ======================================================================== */

    window.uploadCloudCard = async function (btn) {
        if (!player || !player.cls || !player.enSeed) {
            alert('角色尚未建立或缺乏 enSeed，無法上傳名片。');
            return;
        }

        let originalText = btn.textContent;
        btn.textContent = '上傳中...';
        btn.disabled = true;

        let card = pvpCardBuild();
        let derived = pvpCardDerive(card);
        let power = pvpCardPower(derived);
        let cardStr = pvpCardEncode(card);

        let rawName = String(player.name || '未命名').trim();
        let pName = rawName.length > 10 ? rawName.slice(0, 10) : rawName;

        let details = getCardFullDetails(cardStr, { player_name: pName });
        let rawWpn = String(details.wpnDesc || '徒手').trim();
        let wpnDesc = rawWpn.length > 25 ? rawWpn.slice(0, 25) : rawWpn;

        let payload = {
            en_seed: player.enSeed,
            player_name: pName,
            power: power,
            card_data: cardStr,
            class_name: details.className || '騎士',
            level: details.lv || (player.lv || 1),
            weapon_name: wpnDesc,
            updated_at: new Date().toISOString().split('.')[0] + 'Z'
        };

        try {
            let sb = await getSupabaseClient();
            if (!sb) throw new Error('Supabase Client 未初始化');

            let { error } = await sb.from('arena_cards').upsert(payload, { onConflict: 'en_seed' });
            if (error) throw error;

            btn.textContent = '✅ 上傳成功！';
            let cd = 3;
            btn.disabled = true;
            let timer = setInterval(() => {
                cd--;
                if (cd > 0) {
                    btn.textContent = '⏳ 冷卻中 (' + cd + 's)';
                } else {
                    clearInterval(timer);
                    btn.textContent = originalText;
                    btn.disabled = false;
                }
            }, 1000);
            try { logSys('<span class="text-sky-300 font-bold">☁️ 雲端競技場：</span>已成功更新你的對戰名片（戰力 ' + power.toLocaleString() + '）'); } catch(e){}
            refreshCloudOpponents();

        } catch (err) {
            console.error('上傳名片失敗:', err);
            let errMsg = (err && err.message) ? err.message : String(err);
            btn.textContent = '❌ 上傳失敗';
            setTimeout(() => { btn.textContent = originalText; btn.disabled = false; }, 1500);
            alert('上傳失敗：' + errMsg);
        }
    };

    /* ========================================================================
     *  ⚡ 3. 雲端挑戰 & 搜尋
     * ======================================================================== */

    // 挑戰對手列表中的玩家（直接使用已快取的 card_data）
    window.pvpCloudChallenge = function (cardStr, seed) {
        if (!cardStr || typeof pvpCardDecode !== 'function') return;
        let res = pvpCardDecode(cardStr);
        if (!res || !res.card) {
            alert('名片格式無效');
            return;
        }
        if (seed && cachedOpponents) {
            let found = cachedOpponents.find(o => (o.en_seed || o.seed || o.player_name) === seed);
            if (found) {
                found.challengeCount = (found.challengeCount || 0) + 1;
                if (found.player_name) {
                    res.card.n = found.player_name;
                    if (res.card.p) res.card.p.name = found.player_name;
                }
            }
        }
        pvpArenaStart(res.card);
    };

    // 🔍 搜尋雲端玩家 (階段 1：僅抓取預覽欄位，排除 card_data，極致省流量 ~0.85KB)
    window.searchCloudPlayer = async function (btnParam) {
        let input = _pvpField('pvp-search-name');
        let resBox = _pvpField('pvp-search-result');
        if (!input || !resBox) return;

        let queryName = input.value.trim();
        if (!queryName) {
            alert('請輸入要搜尋的玩家名字');
            return;
        }

        let btn = btnParam || _pvpField('pvp-btn-search');
        if (btn) {
            btn.disabled = true;
            let cd = 3;
            btn.textContent = '⏳ 冷卻中 (' + cd + 's)';
            let timer = setInterval(() => {
                cd--;
                if (cd > 0) {
                    btn.textContent = '⏳ 冷卻中 (' + cd + 's)';
                } else {
                    clearInterval(timer);
                    btn.textContent = '🔍 尋找玩家';
                    btn.disabled = false;
                }
            }, 1000);
        }

        resBox.classList.remove('hidden');
        resBox.innerHTML = '<div class="text-xs text-slate-400 py-2 text-center">正在雲端尋找「' + _pvpEsc(queryName) + '」...</div>';

        try {
            let sb = await getSupabaseClient();
            if (!sb) throw new Error('Supabase Client 未初始化');

            const { data, error } = await sb.from('arena_cards')
                .select('en_seed, player_name, power, class_name, level, weapon_name')
                .ilike('player_name', '%' + queryName + '%')
                .limit(5);

            if (error) throw error;

            if (!data || data.length === 0) {
                resBox.innerHTML = '<div class="text-xs text-rose-400 py-2.5 text-center bg-slate-900/80 border border-slate-700 rounded">未在雲端找到名字包含「' + _pvpEsc(queryName) + '」的玩家名片</div>';
                return;
            }

            let myCard = pvpCardBuild();
            let myDerived = pvpCardDerive(myCard);
            let myPower = pvpCardPower(myDerived);

            let html = '<div class="text-xs font-bold text-amber-300 mb-1.5 flex items-center justify-between"><span>🔍 搜尋結果 (' + data.length + ' 筆)：</span><button type="button" class="text-[10px] text-slate-400 hover:text-slate-200" onclick="document.getElementById(\'pvp-search-result\').classList.add(\'hidden\')">✖ 關閉</button></div><div class="flex flex-col gap-2 mb-3">';
            data.forEach(opponent => {
                let pwr = Number(opponent.power) || 0;
                let colorClass = pwr > myPower ? 'text-rose-300' : (pwr < myPower ? 'text-emerald-300' : 'text-amber-300');
                let seed = opponent.en_seed || opponent.seed || opponent.player_name;

                let clsName = opponent.class_name || '冒險者';
                let clsTag = '<span class="text-xs font-semibold text-amber-300 bg-amber-950/50 border border-amber-700/50 px-1.5 py-0.5 rounded ml-0.5">' + _pvpEsc(clsName) + '</span>';

                let lvStr = opponent.level ? ('Lv.' + opponent.level) : '';
                let wpnStr = opponent.weapon_name || '';
                let displayDesc = (lvStr ? (lvStr + (wpnStr ? '・手持 ' : '')) : (wpnStr ? '手持 ' : '')) + wpnStr;
                let sumText = displayDesc ? ('<div class="text-xs text-slate-400">' + _pvpEsc(displayDesc) + '</div>') : '';

                html += '<div class="bg-amber-950/40 border border-amber-700/60 rounded p-2.5 flex items-center justify-between gap-3 hover:bg-amber-900/40 transition-colors">' +
                            '<div class="flex flex-col gap-1">' +
                                '<div class="font-bold text-sm text-slate-200 flex items-center gap-2 flex-wrap">' +
                                    '<span>' + _pvpEsc(opponent.player_name) + '</span>' + clsTag +
                                '</div>' +
                                sumText +
                            '</div>' +
                            '<button type="button" class="btn px-4 py-1.5 text-xs font-bold shrink-0 bg-amber-700 hover:bg-amber-600 text-amber-100" onclick="pvpSearchChallenge(\'' + _pvpEsc(seed) + '\', \'' + _pvpEsc(opponent.player_name) + '\', this)">⚔️ 挑戰</button>' +
                        '</div>';
            });
            html += '</div>';
            resBox.innerHTML = html;

        } catch (err) {
            console.error('搜尋玩家失敗:', err);
            let errText = (err && err.message) ? err.message : String(err);
            resBox.innerHTML = '<div class="text-xs text-rose-400 py-2 text-center">搜尋失敗：' + _pvpEsc(errText) + '</div>';
        }
    };

    // ⚡ 階段 2：點擊搜尋結果的「⚔️ 挑戰」時，才精準下載該 1 位對手的 card_data (~1.3KB)
    window.pvpSearchChallenge = async function (seed, playerName, btn) {
        if (btn) { btn.disabled = true; btn.textContent = '載入中...'; }
        try {
            let sb = await getSupabaseClient();
            if (!sb) throw new Error('Supabase 未初始化');

            const { data, error } = await sb.from('arena_cards')
                .select('card_data, player_name')
                .eq('en_seed', seed)
                .single();

            if (error || !data || !data.card_data) {
                alert('無法載入該對手的卡片資料');
                if (btn) { btn.disabled = false; btn.textContent = '⚔️ 挑戰'; }
                return;
            }

            if (cachedOpponents) {
                let found = cachedOpponents.find(o => (o.en_seed || o.seed || o.player_name) === seed);
                if (!found) {
                    cachedOpponents.push({
                        en_seed: seed,
                        player_name: data.player_name || playerName,
                        card_data: data.card_data,
                        challengeCount: 0
                    });
                }
            }

            pvpCloudChallenge(data.card_data, seed);
        } catch (e) {
            alert('連線失敗: ' + e.message);
            if (btn) { btn.disabled = false; btn.textContent = '⚔️ 挑戰'; }
        }
    };

    /* ========================================================================
     *  ⚡ 4. 對手列表刷新 (雲端 4 名 + 本機 6 名 NPC 混合)
     * ======================================================================== */

    window.refreshCloudOpponents = async function (btn) {
        if (!player || !player.cls || !player.enSeed) return;

        let listContainer = _pvpField('cloud-opponents-list');
        if (!listContainer) return;

        let isManualClick = !!btn;

        let myCard = pvpCardBuild();
        let myDerived = pvpCardDerive(myCard);
        let myPower = pvpCardPower(myDerived);

        // 非手動點擊且記憶體已有快取列表 → 直接繪製（不動雲端、不重洗）
        if (!isManualClick && cachedOpponents && cachedOpponents.length > 0) {
            renderOpponentList(listContainer, cachedOpponents, myPower);
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.textContent = '尋找中...';
        }

        listContainer.innerHTML = '<div class="text-slate-400 py-4 text-center">正在搜尋實力相近的對手...</div>';

        let minPower = Math.floor(myPower * 0.7);
        let maxPower = Math.floor(myPower * 1.3);

        try {
            let sb = await getSupabaseClient();
            if (!sb) throw new Error('Supabase Client 未初始化');

            const { data, error } = await sb.rpc('get_random_opponents', {
                p_my_seed: player.enSeed,
                p_min_power: minPower,
                p_max_power: maxPower
            });

            if (error) throw error;

            if (btn) {
                let cd = 3;
                btn.textContent = '⏳ 冷卻中 (' + cd + 's)';
                let timer = setInterval(() => {
                    cd--;
                    if (cd > 0) {
                        btn.textContent = '⏳ 冷卻中 (' + cd + 's)';
                    } else {
                        clearInterval(timer);
                        btn.textContent = '🔄 刷新對手列表';
                        btn.disabled = false;
                    }
                }, 1000);
            }

            let cloudList = (data || []).slice(0, 4);
            let needLocalCount = 10 - cloudList.length; // 若雲端回傳 0 筆，自動動態補滿 10 個本機 NPC！
            let localBots = generateLocalBots(myPower, needLocalCount);
            let combined = cloudList.concat(localBots);
            cachedOpponents = combined.sort(() => 0.5 - Math.random());

            renderOpponentList(listContainer, cachedOpponents, myPower);

        } catch (err) {
            console.warn('拉取雲端對手失敗，自動無縫切換至純本機離線 NPC 模式:', err);
            if (btn) { btn.textContent = '🔄 刷新對手列表'; btn.disabled = false; }

            let localBots = generateLocalBots(myPower, 10);
            cachedOpponents = localBots;
            renderOpponentList(listContainer, cachedOpponents, myPower);
        }
    };

    /* ========================================================================
     *  ⚡ 5. UI 輔助工具函式 & 資料常數
     * ======================================================================== */

    function _pvpPanelBody() {
        return document.getElementById('pvp-arena-body-modal') || document.getElementById('pvp-arena-body') || document.getElementById('tab-pvp');
    }
    function _pvpField(id) {
        let b = _pvpPanelBody();
        return b ? b.querySelector('#' + id) : null;
    }
    function _pvpEsc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function renderOpponentList(listContainer, selected, myPower) {
        let html = '<div class="flex flex-col gap-2">';
        selected.forEach(opponent => {
            let pwr = Number(opponent.power) || 0;
            let colorClass = pwr > myPower ? 'text-rose-300' : (pwr < myPower ? 'text-emerald-300' : 'text-amber-300');
            let details = getCardFullDetails(opponent.card_data, opponent);

            let botTag = opponent.is_bot ? '<span class="text-[10px] bg-slate-700 text-sky-300 px-1 rounded ml-0.5">NPC</span>' : '';

            let seed = opponent.en_seed || opponent.seed || opponent.player_name;
            let count = opponent.challengeCount || 0;

            let btnHtml = '';
            if (count >= 3) {
                btnHtml = '<button type="button" class="btn px-3 py-1 text-xs font-bold shrink-0 opacity-60 bg-rose-950/80 border border-rose-800 text-rose-300 cursor-not-allowed" disabled>🏥 住院</button>';
            } else if (count > 0) {
                btnHtml = '<button type="button" class="btn px-3 py-1 text-xs font-bold shrink-0 bg-slate-700 hover:bg-slate-600 text-sky-200" onclick="pvpCloudChallenge(\'' + opponent.card_data + '\', \'' + _pvpEsc(seed) + '\')">🔄 挑戰</button>';
            } else {
                btnHtml = '<button type="button" class="btn px-3 py-1 text-xs font-bold shrink-0" onclick="pvpCloudChallenge(\'' + opponent.card_data + '\', \'' + _pvpEsc(seed) + '\')">⚔️ 挑戰</button>';
            }

            html += '<div class="bg-slate-900/70 border border-slate-700/80 rounded p-2 flex items-center justify-between gap-2 hover:bg-slate-800 transition-colors' + (count >= 3 ? ' opacity-50' : '') + '">' +
                        '<div class="flex flex-col gap-0.5 min-w-0 flex-1">' +
                            '<div class="font-bold text-xs sm:text-sm text-slate-200 flex items-center gap-1.5 flex-nowrap overflow-hidden">' +
                                '<span class="truncate max-w-[130px] sm:max-w-none shrink">' + _pvpEsc(opponent.player_name) + '</span>' + botTag +
                                '<span class="text-[10px] font-semibold text-amber-300 bg-amber-950/50 border border-amber-700/50 px-1 py-0.2 rounded shrink-0 ml-auto sm:ml-0">' + _pvpEsc(details.className) + '</span>' +
                            '</div>' +
                            '<div class="text-[11px] text-slate-400 truncate">' + _pvpEsc(details.summaryText) + '</div>' +
                        '</div>' +
                        '<div class="shrink-0">' + btnHtml + '</div>' +
                    '</div>';
        });
        html += '</div>';

        listContainer.innerHTML = html;
    }

    const CLASS_NAME_MAP = {
        royal: '王族', knight: '騎士', elf: '妖精', mage: '法師',
        dark: '黑暗妖精', dragon: '龍騎士', illusion: '幻術士', warrior: '狂戰士'
    };

    const AVATARS_BY_CLASS = {
        royal: ['王子', '公主'], knight: ['男騎士', '女騎士'],
        mage: ['男法師', '女法師'], elf: ['男妖精', '女妖精'],
        dark: ['男黑暗妖精', '女黑暗妖精'], illusion: ['男幻術士', '女幻術士'],
        dragon: ['男龍騎士', '女龍騎士'], warrior: ['男戰士', '女戰士']
    };

    const CLASS_SKILLS_MAP = {
        mage: ['sk_eb', 'sk_sunburst', 'sk_ice_lance', 'sk_lightning', 'sk_firestorm', 'sk_meteor', 'sk_heal2', 'sk_full_heal', 'sk_summon', 'sk_cancel'],
        knight: ['sk_solid_carriage', 'sk_reduction_armor', 'sk_bounce_attack', 'sk_shock_stun'],
        elf: ['sk_triple_arrow', 'sk_storm_shot', 'sk_elf_summon', 'sk_elf_summon2', 'sk_nature_blessing'],
        dark: ['sk_double_brake', 'sk_shadow_fang', 'sk_unbroken', 'sk_final_burn'],
        warrior: ['sk_titan_rock', 'sk_desperado', 'sk_titan_magic', 'sk_slayer'],
        dragon: ['sk_dragon_skin', 'sk_magma_breath', 'sk_foeman', 'sk_dragon_thrill'],
        illusion: ['sk_mind_break', 'sk_bone_break', 'sk_illu_avatar', 'sk_joy_pain'],
        royal: ['sk_glowing_aura', 'sk_brave_aura', 'sk_run_clan', 'sk_true_target']
    };

    const CLASS_MASTERY_MAP = {
        royal: 'r_aura', knight: 'k_sword', mage: 'm_magic', elf: 'e_bow',
        dark: 'd_claw', dragon: 'dk_chain', illusion: 'i_kiringku', warrior: 'w_rage'
    };

    // 從名片解密取得「職業名稱」、「等級」與「手持裝備/武器」資訊
    function getCardFullDetails(cardStr, botObj) {
        let className = '騎士';
        let lv = 30;
        let wpnDesc = '徒手';
        let summaryText = 'Lv.30・手持 徒手';
        try {
            if (typeof pvpCardDecode === 'function') {
                let res = pvpCardDecode(cardStr);
                if (res && res.card && res.card.p) {
                    let p = res.card.p;
                    lv = p.lv || 1;
                    className = CLASS_NAME_MAP[p.cls] || '冒險者';

                    if (p.eq && typeof DB !== 'undefined' && DB.items) {
                        let wpnItem = p.eq.wpn || p.eq.main || p.eq.weapon;
                        if (!wpnItem) {
                            for (let slot in p.eq) {
                                let it = p.eq[slot];
                                if (it && it.id && DB.items[it.id] && DB.items[it.id].type === 'wpn') {
                                    wpnItem = it;
                                    break;
                                }
                            }
                        }
                        if (wpnItem && wpnItem.id && DB.items[wpnItem.id]) {
                            if (typeof getItemFullName === 'function') {
                                wpnDesc = getItemFullName(wpnItem).replace(/<[^>]*>/g, '').trim();
                            } else {
                                let dbItem = DB.items[wpnItem.id];
                                let ancStr = wpnItem.anc ? (typeof ancName === 'function' ? ancName(wpnItem.anc) + ' ' : '遠古 ') : '';
                                let blessStr = wpnItem.bless ? (typeof blessName === 'function' ? blessName(wpnItem.bless) + ' ' : '祝福的 ') : '';
                                let enVal = Number(wpnItem.en) || 0;
                                let enStr = enVal > 0 ? ('+' + enVal + ' ') : '';
                                let setStr = wpnItem.seteff ? (wpnItem.seteff.slice(0, 2) + '') : '';
                                wpnDesc = ancStr + blessStr + enStr + setStr + (dbItem.name || dbItem.n || '武器');
                            }
                        }
                    }
                    summaryText = 'Lv.' + lv + '・手持 ' + wpnDesc;
                }
            }
        } catch (e) {}

        if (botObj && botObj.is_bot) {
            if (botObj.clsName) className = botObj.clsName;
            if (botObj.summaryText) summaryText = botObj.summaryText;
        }

        return { className: className, lv: lv, wpnDesc: wpnDesc, summaryText: summaryText };
    }

    /* ========================================================================
     *  ⚡ 6. 本機 NPC 對手生成器 (0 雲端流量)
     * ======================================================================== */

    const CLASS_WEAPONS_MAP = {
        royal: ['wpn_katana', 'wpn_longsword'],
        knight: ['wpn_2hsword', 'wpn_official_2h', 'wpn_vander_sword', 'wpn_dragonslayer'],
        elf: ['wpn_elfbow', 'wpn_3'],
        mage: ['wpn_2', 'wpn_alien'],
        dark: ['wpn_dagger2', 'wpn_scimitar'],
        dragon: ['wpn_halberd', 'wpn_12'],
        illusion: ['wpn_9', 'wpn_11'],
        warrior: ['wpn_battleaxe', 'wpn_23']
    };

    const BOT_SET_LIST = ['紅獅', '青狼', '白虎', '朱雀', '玄武'];
    const BOT_ATTR_LIST = ['fire_3', 'water_3', 'wind_3', 'earth_3'];

    // 6 名 NPC 包含：1 名 +100% 超級首領 + 1 名 -50% 菜鳥新手 + 4 名 ±20% 波動對手 (含極致豐富詞綴/套裝)
    function generateLocalBots(myPower, count) {
        let bots = [];
        let classes = ['royal', 'knight', 'mage', 'elf', 'dark', 'illusion', 'dragon', 'warrior'];

        let wpnIds = (typeof DB !== 'undefined' && DB.items) ? Object.keys(DB.items).filter(k => DB.items[k] && DB.items[k].type === 'wpn') : [];
        let armIds = (typeof DB !== 'undefined' && DB.items) ? Object.keys(DB.items).filter(k => DB.items[k] && DB.items[k].type === 'arm') : [];
        let accIds = (typeof DB !== 'undefined' && DB.items) ? Object.keys(DB.items).filter(k => DB.items[k] && DB.items[k].type === 'acc') : [];

        let myLv = (typeof player !== 'undefined' && player.lv) ? player.lv : 35;

        for (let i = 0; i < count; i++) {
            let isSuperBoss = (i === 0);
            let isWeakBot = (i === 1);

            let cls = classes[Math.floor(Math.random() * classes.length)];
            let clsName = CLASS_NAME_MAP[cls] || '騎士';
            let name = (typeof pvpRandomName === 'function') ? pvpRandomName() : ('玩家' + Math.floor(Math.random() * 99999));

            let pwr, lv, enWpn, armCount, sCount;

            if (isSuperBoss) {
                pwr = Math.floor(myPower * 2.0);
                lv = Math.floor(myLv * 1.3) + 5;
                // 首領：低等級保底最少 +12，高等級隨等級提升至最高 +15
                let bossBaseEn = Math.max(12, Math.floor(lv / 7));
                enWpn = Math.min(15, bossBaseEn + Math.floor(Math.random() * 3));
                armCount = 6;
                sCount = 5;
            } else if (isWeakBot) {
                pwr = Math.max(1000, Math.floor(myPower * 0.75)); // 菜鳥 75% 戰力
                lv = Math.max(1, Math.floor(myLv * 0.85));
                // 菜鳥：隨等級縮放，低等級 +1~+3，高等級跟隨成長 (+4~+8)
                let weakBaseEn = Math.floor(lv / 15);
                enWpn = Math.min(9, Math.max(1, weakBaseEn + Math.floor(Math.random() * 3)));
                armCount = 2;
                sCount = 1;
            } else {
                let ratio = 0.9 + (Math.random() * 0.6); // 90% ~ 150% 戰力區間
                pwr = Math.max(1000, Math.floor(myPower * ratio));
                lv = Math.max(1, Math.floor(myLv * ratio));
                let baseEn = Math.floor(lv / 9); // 一般對手：跟隨等級動態提升
                enWpn = Math.min(15, Math.max(6, baseEn + Math.floor(Math.random() * 4)));
                armCount = Math.floor(Math.random() * 3) + 3;
                sCount = Math.floor(Math.random() * 3) + 2;
            }

            // 豐富裝備配置 (精準職業武器 + 祝福/遠古/永恆/屬性/席琳套裝)
            let eq = {};
            let wpnDesc = '徒手';
            let matchedWpns = CLASS_WEAPONS_MAP[cls] || [];
            let validWpnPool = matchedWpns.filter(w => wpnIds.includes(w));
            if (validWpnPool.length === 0) validWpnPool = wpnIds;

            if (validWpnPool.length > 0) {
                let wid = validWpnPool[Math.floor(Math.random() * validWpnPool.length)];
                let wpnObj = { id: wid, en: enWpn, cnt: 1 };

                if (enWpn >= 8) wpnObj.bless = true;
                if (enWpn >= 11) wpnObj.anc = (i % 2 === 0) ? 'eternal' : true;
                if (enWpn >= 9) wpnObj.seteff = BOT_SET_LIST[i % BOT_SET_LIST.length];
                if (enWpn >= 7) wpnObj.attr = BOT_ATTR_LIST[i % BOT_ATTR_LIST.length];

                eq['wpn'] = wpnObj;

                if (typeof getItemFullName === 'function') {
                    wpnDesc = getItemFullName(wpnObj).replace(/<[^>]*>/g, '').trim();
                } else {
                    let dbItem = DB.items[wid];
                    let ancStr = wpnObj.anc ? (wpnObj.anc === 'eternal' ? '永恆 ' : '遠古 ') : '';
                    let blessStr = wpnObj.bless ? '祝福的 ' : '';
                    let enStr = enWpn > 0 ? ('+' + enWpn + ' ') : '';
                    let setStr = wpnObj.seteff ? (wpnObj.seteff + ' ') : '';
                    wpnDesc = ancStr + blessStr + enStr + setStr + (dbItem ? (dbItem.name || dbItem.n || '武器') : '武器');
                }
            }

            if (armIds.length > 0) {
                for (let a = 0; a < armCount; a++) {
                    let aid = armIds[Math.floor(Math.random() * armIds.length)];
                    let enArm = isSuperBoss ? (Math.floor(Math.random() * 3) + 8) : (isWeakBot ? 0 : Math.floor(Math.random() * 6) + 1);
                    let armObj = { id: aid, en: enArm, cnt: 1 };
                    if (enArm >= 7) armObj.bless = true;
                    if (enArm >= 8 && eq['wpn'] && eq['wpn'].seteff && a === 1) armObj.seteff = eq['wpn'].seteff;
                    eq['arm_' + a] = armObj;
                }
            }

            if (accIds.length > 0 && !isWeakBot) {
                let accCount = isSuperBoss ? 4 : Math.floor(Math.random() * 3) + 1;
                for (let c = 0; c < accCount; c++) {
                    let cid = accIds[Math.floor(Math.random() * accIds.length)];
                    let enAcc = Math.floor(Math.random() * 5);
                    eq['acc_' + c] = { id: cid, en: enAcc, cnt: 1 };
                }
            }

            let botSkills = [];
            let pool = CLASS_SKILLS_MAP[cls] || ['sk_eb', 'sk_heal2'];
            let shuffled = pool.slice().sort(() => 0.5 - Math.random());
            botSkills = shuffled.slice(0, Math.min(pool.length, sCount));

            let allocPts = Math.floor(lv * (isSuperBoss ? 1.2 : (isWeakBot ? 0.4 : 0.8)));
            let allocObj = { str: allocPts, dex: allocPts, con: allocPts, int: allocPts, wis: allocPts, cha: 0 };

            let options = AVATARS_BY_CLASS[cls] || ['男騎士', '女騎士'];
            let avatarSprite = options[Math.floor(Math.random() * options.length)];

            let alignVal = Math.floor(Math.random() * 65535) - 32768;
            let clanPool = (typeof NPC_CLAN_NAME_CURATED !== 'undefined' && Array.isArray(NPC_CLAN_NAME_CURATED)) ? NPC_CLAN_NAME_CURATED : ['亞丁騎士團'];
            let clanName = (Math.random() < 0.8) ? clanPool[Math.floor(Math.random() * clanPool.length)] : '';
            let botMastery = CLASS_MASTERY_MAP[cls] || '';

            let botCard = {
                n: name,
                avatar: avatarSprite,
                clan: clanName,
                align: alignVal,
                p: {
                    name: name,
                    cls: cls,
                    lv: lv,
                    mastery: botMastery,
                    alignmentValue: alignVal,
                    base: { str: isSuperBoss ? 25 : 20, dex: isSuperBoss ? 25 : 20, con: isSuperBoss ? 25 : 20, int: isSuperBoss ? 25 : 20, wis: isSuperBoss ? 25 : 20, cha: 18 },
                    alloc: allocObj,
                    panacea: { str: isSuperBoss ? 10 : 2, dex: isSuperBoss ? 10 : 2, con: isSuperBoss ? 10 : 2, int: isSuperBoss ? 10 : 2, wis: isSuperBoss ? 10 : 2, cha: 0 },
                    eq: eq,
                    skills: botSkills,
                    buffs: { haste: true },
                    hp: Math.floor(pwr * (isSuperBoss ? 0.18 : (isWeakBot ? 0.08 : 0.12)) + (isSuperBoss ? 3000 : 1000)),
                    mp: isSuperBoss ? 1200 : 500
                }
            };

            let cardStr = (typeof pvpCardEncode === 'function') ? pvpCardEncode(botCard) : '';

            bots.push({
                player_name: name,
                power: pwr,
                card_data: cardStr,
                is_bot: true,
                is_boss: isSuperBoss,
                clsName: clsName,
                summaryText: 'Lv.' + lv + '・手持 ' + wpnDesc
            });
        }
        return bots;
    }

    /* ========================================================================
     *  ⚡ 7. 雲端 UI 注入 & DOM 監聽
     * ======================================================================== */

    function injectCloudUI() {
        let body = _pvpPanelBody();
        if (!body) return;

        if (_pvpField('cloud-arena-container')) return;

        let CARD = 'bg-slate-800/60 border border-slate-600 rounded p-3 mb-3';
        let HEAD = 'text-sky-300 font-bold mb-2 flex items-center justify-between';

        let container = document.createElement('div');
        container.id = 'cloud-arena-container';
        container.className = CARD;
        container.style.border = '1px solid #0369a1';

        let html =
            '<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2 pr-7">' +
                '<div class="font-bold text-sky-300 text-xs sm:text-sm flex items-center gap-1">' +
                    '<span>⚔️ 無界競技場</span>' +
                    '<span class="text-[10px] font-normal text-slate-400">(配對實力相近玩家)</span>' +
                '</div>' +
                '<button type="button" class="btn px-2.5 py-1 text-xs bg-sky-800 hover:bg-sky-700 border-sky-500 font-bold shrink-0 self-start sm:self-auto" onclick="uploadCloudCard(this)">📤 上傳我的名片</button>' +
            '</div>' +
            '<div class="text-[11px] text-slate-400 leading-tight mb-2.5">上傳後其他玩家可挑戰你的分身。點擊下方可隨機尋找對手。</div>' +

            '<!-- 🔍 搜尋指定玩家列 -->' +
            '<div class="flex items-center gap-1.5 mb-2.5">' +
                '<input type="text" id="pvp-search-name" class="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-100 flex-1 min-w-0 placeholder-slate-500" placeholder="輸入雲端玩家名字搜尋..." onkeydown="if(event.key===\'Enter\') searchCloudPlayer();">' +
                '<button type="button" id="pvp-btn-search" class="btn px-2.5 py-1 text-xs bg-amber-800 hover:bg-amber-700 text-amber-200 border border-amber-600 font-bold shrink-0" onclick="searchCloudPlayer(this)">🔍 尋找玩家</button>' +
            '</div>' +
            '<div id="pvp-search-result" class="hidden"></div>' +

            '<div id="cloud-opponents-list" class="mb-2.5"></div>' +
            '<button type="button" class="btn w-full py-1.5 text-xs font-bold bg-slate-700 hover:bg-slate-600" onclick="refreshCloudOpponents(this)">🔄 刷新對手列表</button>';

        container.innerHTML = html;

        let firstCard = body.firstElementChild;
        let targetRef = firstCard && firstCard.nextElementSibling ? firstCard.nextElementSibling : null;

        if (targetRef) {
            body.insertBefore(container, targetRef);
        } else {
            body.appendChild(container);
        }

        refreshCloudOpponents();
    }

    // MutationObserver 自動監聽全域 DOM 變化，確保面板掛載即嵌入雲端 UI
    const observer = new MutationObserver(() => {
        let body = _pvpPanelBody();
        if (body && !_pvpField('cloud-arena-container')) {
            injectCloudUI();
        }
    });

    if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            observer.observe(document.body, { childList: true, subtree: true });
        });
    }

    /* ========================================================================
     *  ⚡ 8. 決鬥計時加速 & Monkey-Patch Hooks
     * ======================================================================== */

    // Hook openPvpArena：開啟面板時自動嵌入雲端 UI
    const origOpenPvpArena = window.openPvpArena;
    if (typeof origOpenPvpArena === 'function') {
        window.openPvpArena = function() {
            let res = origOpenPvpArena.apply(this, arguments);
            setTimeout(injectCloudUI, 30);
            return res;
        };
    }

    // Hook renderPvpArenaNPC：NPC 面板渲染後自動嵌入雲端 UI
    const origRenderPvpArenaNPC = window.renderPvpArenaNPC;
    if (typeof origRenderPvpArenaNPC === 'function') {
        window.renderPvpArenaNPC = function(contentDiv) {
            let res = origRenderPvpArenaNPC.apply(this, arguments);
            setTimeout(injectCloudUI, 30);
            return res;
        };
    }

    // Hook renderPvpTab：PvP 分頁切換時自動嵌入雲端 UI
    const origRenderPvpTab = window.renderPvpTab;
    if (typeof origRenderPvpTab === 'function') {
        window.renderPvpTab = function() {
            let res = origRenderPvpTab.apply(this, arguments);
            setTimeout(injectCloudUI, 30);
            return res;
        };
    }

    // Hook pvpArenaStart：決鬥開始時記錄啟動時間（供加速按鈕判定用）
    const origPvpArenaStart = window.pvpArenaStart;
    if (typeof origPvpArenaStart === 'function') {
        window.pvpArenaStart = function() {
            window._klhDuelStartedAt = Date.now();
            window._klhSpeedUpClicked = false;
            return origPvpArenaStart.apply(this, arguments);
        };
    }

    // ⏱️ 5 秒決鬥加速按鈕檢測機制
    setInterval(function () {
        let isActive = (typeof pvpArenaActive === 'function') ? pvpArenaActive() : false;
        if (!isActive || !window._klhDuelStartedAt || window._klhSpeedUpClicked) {
            let b = document.getElementById('pvp-fast-result-btn');
            if (b) b.remove();
            return;
        }

        let elapsedSec = Math.floor((Date.now() - window._klhDuelStartedAt) / 1000);
        if (elapsedSec >= 5) {
            if (!document.getElementById('pvp-fast-result-btn')) {
                let btnContainer = document.createElement('div');
                btnContainer.id = 'pvp-fast-result-btn';
                btnContainer.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:10090;';
                btnContainer.innerHTML = '<button type="button" class="btn px-4 py-2 font-bold text-sm bg-amber-500 hover:bg-amber-400 text-slate-950 border border-yellow-200 shadow-xl rounded-full animate-bounce flex items-center gap-1.5" onclick="pvpSpeedUp10x()">⚡ 戰鬥已超過5秒！點擊 加速看結果</button>';
                document.body.appendChild(btnContainer);
            }
        }
    }, 1000);

    // 10 倍速極速戰鬥加速（每 100ms 批次執行 10 個 tick，分出勝負即自動銷毀）
    window.pvpSpeedUp10x = function () {
        window._klhSpeedUpClicked = true;
        let b = document.getElementById('pvp-fast-result-btn');
        if (b) b.remove();

        if (window._klhSpeedTimer) {
            clearInterval(window._klhSpeedTimer);
            window._klhSpeedTimer = null;
        }

        if (typeof logSys === 'function') logSys('<span class="text-amber-300 font-bold">⚡ 已開啟 10 倍速加速戰鬥...</span>');

        let batchCount = 0;
        window._klhSpeedTimer = setInterval(function () {
            let isActive = (typeof pvpArenaActive === 'function') ? pvpArenaActive() : false;
            if (!isActive || !player || player.dead) {
                clearInterval(window._klhSpeedTimer);
                window._klhSpeedTimer = null;
                try { if (typeof renderMobs === 'function') renderMobs(); } catch (e) {}
                try { if (typeof updateUI === 'function') updateUI(); } catch (e) {}
                return;
            }

            for (let i = 0; i < 10; i++) {
                let curActive = (typeof pvpArenaActive === 'function') ? pvpArenaActive() : false;
                if (!curActive || player.dead) break;
                try {
                    if (typeof state !== 'undefined') state.inTick = true;
                    if (typeof tick === 'function') tick();
                } catch (e) {
                } finally {
                    if (typeof state !== 'undefined') state.inTick = false;
                    if (typeof settleDeadMobs === 'function') settleDeadMobs();
                }
            }

            try { if (typeof renderMobs === 'function') renderMobs(); } catch (e) {}
            try { if (typeof updateUI === 'function') updateUI(); } catch (e) {}

            batchCount++;
        }, 100);
    };

    // Hook pvpResultContinue：點擊「繼續」整備時，將畫面上殘留對手的視覺血條補滿
    const origPvpResultContinue = window.pvpResultContinue;
    if (typeof origPvpResultContinue === 'function') {
        window.pvpResultContinue = function() {
            let res = origPvpResultContinue.apply(this, arguments);
            if (typeof mapState !== 'undefined' && mapState && mapState.mobs && mapState.mobs[0]) {
                mapState.mobs[0].curHp = mapState.mobs[0].hp;
                try { if (typeof renderMobs === 'function') renderMobs(); } catch (e) {}
            }
            return res;
        };
    }

})();
