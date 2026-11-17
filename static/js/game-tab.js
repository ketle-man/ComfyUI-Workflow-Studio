/**
 * Game タブ (実験的機能)
 *
 * ゲーム本体は別パッケージ ComfyUI-WFS-Games が配信する。
 *   GET /wfs_games/manifest  が応答したときだけタブを表示する (未インストールなら何もしない)。
 * ゲームは manifest の entry を動的 import し、mount(container, host) で起動する。
 * ゲームが host.finish(result) で返した報酬プロンプトから、WFS がワークフローを組み立てて生成する。
 * ゲームは ComfyUI を直接操作しない。
 *
 * 契約の詳細は PLAN_GAME_TAB.md / ComfyUI-WFS-Games の README を参照。
 */

import { showToast } from "./app.js";
import { t, getLang } from "./i18n.js";
import { escapeHtml, readJsonStorage } from "./util.js";
import { comfyUI } from "./comfyui-client.js";
import { comfyWorkflow } from "./comfyui-workflow.js";
import { _expandWildcardsInWorkflow } from "./generate-tab.js";

const HOST_API_VERSION = 1;
const MANIFEST_URL = "/wfs_games/manifest";
const ENTRY_PREFIX = "/wfs_games/static/";
const LS_SETTINGS = "wfm_game_settings";

const DEFAULT_SETTINGS = {
    gameId: "",
    difficulty: "normal",
    sound: true,
    bgm: true,
    workflow: "ws_game_sdxl_t2i.json",
    // 画風・キャラ・シーンはゲームが報酬プロンプトとして渡すので、ここは品質タグだけ
    basePrompt: "masterpiece, best quality",
    negativePrompt: "",
    generateEachStage: true,   // ステージクリアごとに画像を生成する
    autoGenerateEnding: true,  // 全クリア時のエンディング画像も自動で生成する
    autoGenerateGameover: true, // ゲームオーバー時の敗北画像も自動で生成する
};

const state = {
    manifest: null,
    opened: false,
    handle: null,        // mount() の戻り値
    mountToken: 0,
    jobs: [],            // 画像1枚ごとのカード { id, kind, title, result, selected, el, status, apiWf, imageUrl }
    jobSeq: 0,
    queue: Promise.resolve(), // 生成は1枚ずつ順番に行う
};

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// settings
// ---------------------------------------------------------------------------

// 以前の既定値。保存値がこれと同じなら新しい既定値に置き換える(ユーザーが編集した値は残す)
const OLD_DEFAULT_BASE_PROMPTS = ["masterpiece, best quality, outer space scenery"];

function loadSettings() {
    const s = { ...DEFAULT_SETTINGS, ...readJsonStorage(LS_SETTINGS, {}) };
    if (OLD_DEFAULT_BASE_PROMPTS.includes(s.basePrompt)) s.basePrompt = DEFAULT_SETTINGS.basePrompt;
    return s;
}

function saveSettings(patch) {
    const next = { ...loadSettings(), ...patch };
    try { localStorage.setItem(LS_SETTINGS, JSON.stringify(next)); } catch { /* storage unavailable */ }
    return next;
}

// ---------------------------------------------------------------------------
// detection
// ---------------------------------------------------------------------------

function isSafeGamePath(p) {
    return typeof p === "string" && p.startsWith(ENTRY_PREFIX) && !p.includes("..") && !p.includes("//", 1) && !/[\\?#]/.test(p);
}

async function fetchManifest() {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
        const res = await fetch(MANIFEST_URL, { signal: ctrl.signal, cache: "no-store" });
        if (!res.ok) return null;
        const data = await res.json();
        if (data?.api_version !== HOST_API_VERSION) {
            console.warn(`[WFS Game] unsupported game pack api_version: ${data?.api_version} (expected ${HOST_API_VERSION})`);
            return null;
        }
        const games = (Array.isArray(data.games) ? data.games : []).filter((g) => g && typeof g.id === "string" && isSafeGamePath(g.entry));
        if (!games.length) return null;
        games.forEach((g) => { if (g.thumbnail && !isSafeGamePath(g.thumbnail)) delete g.thumbnail; });
        return { ...data, games };
    } catch {
        return null; // 未インストール (404) / 接続不可
    } finally {
        clearTimeout(timer);
    }
}

function localized(obj, fallback = "") {
    if (!obj) return fallback;
    if (typeof obj === "string") return obj;
    return obj[getLang()] || obj.en || Object.values(obj)[0] || fallback;
}

function currentGame() {
    const s = loadSettings();
    const games = state.manifest?.games || [];
    return games.find((g) => g.id === s.gameId) || games[0] || null;
}

// ---------------------------------------------------------------------------
// shell
// ---------------------------------------------------------------------------

function renderShell() {
    const root = $("wfm-tab-game");
    const s = loadSettings();
    const games = state.manifest.games;
    root.innerHTML = `
        <div class="wfm-game-layout">
            <aside class="wfm-game-side">
                <div class="wfm-game-section">
                    <div class="wfm-game-section-title">${escapeHtml(t("gameListTitle"))}</div>
                    <div class="wfm-game-list" id="wfm-game-list">
                        ${games.map((g) => `
                            <button type="button" class="wfm-game-card" data-game-id="${escapeHtml(g.id)}">
                                ${g.thumbnail ? `<img src="${escapeHtml(g.thumbnail)}" alt="">` : ""}
                                <span class="wfm-game-card-name">${escapeHtml(localized(g.name, g.id))}</span>
                                <span class="wfm-game-card-desc">${escapeHtml(localized(g.description))}</span>
                            </button>`).join("")}
                    </div>
                </div>
                <div class="wfm-game-section">
                    <div class="wfm-game-section-title">${escapeHtml(t("gamePlaySettings"))}</div>
                    <label class="wfm-game-field">
                        <span>${escapeHtml(t("gameDifficulty"))}</span>
                        <select id="wfm-game-difficulty" class="wfm-select">
                            <option value="easy">${escapeHtml(t("gameDifficultyEasy"))}</option>
                            <option value="normal">${escapeHtml(t("gameDifficultyNormal"))}</option>
                            <option value="hard">${escapeHtml(t("gameDifficultyHard"))}</option>
                        </select>
                    </label>
                    <label class="wfm-game-check"><input type="checkbox" id="wfm-game-bgm"> ${escapeHtml(t("gameBgm"))}</label>
                    <label class="wfm-game-check"><input type="checkbox" id="wfm-game-sound"> ${escapeHtml(t("gameSound"))}</label>
                    <div class="wfm-game-note">${escapeHtml(t("gamePlaySettingsNote"))}</div>
                </div>
                <div class="wfm-game-section">
                    <div class="wfm-game-section-title">${escapeHtml(t("gameGenSettings"))}</div>
                    <label class="wfm-game-field">
                        <span>${escapeHtml(t("gameWorkflow"))}</span>
                        <div class="wfm-game-row">
                            <select id="wfm-game-workflow" class="wfm-select"></select>
                            <button type="button" id="wfm-game-workflow-reload" class="wfm-btn wfm-btn-sm" title="${escapeHtml(t("gameWorkflowReload"))}">&#x21bb;</button>
                        </div>
                    </label>
                    <label class="wfm-game-field">
                        <span>${escapeHtml(t("gameBasePrompt"))}</span>
                        <textarea id="wfm-game-base-prompt" class="wfm-textarea" rows="3"></textarea>
                    </label>
                    <label class="wfm-game-field">
                        <span>${escapeHtml(t("gameNegativePrompt"))}</span>
                        <textarea id="wfm-game-negative-prompt" class="wfm-textarea" rows="2" placeholder="${escapeHtml(t("gameNegativePlaceholder"))}"></textarea>
                    </label>
                    <label class="wfm-game-check"><input type="checkbox" id="wfm-game-each-stage"> ${escapeHtml(t("gameEachStage"))}</label>
                    <label class="wfm-game-check"><input type="checkbox" id="wfm-game-auto-generate"> ${escapeHtml(t("gameAutoGenerate"))}</label>
                    <label class="wfm-game-check"><input type="checkbox" id="wfm-game-auto-gameover"> ${escapeHtml(t("gameAutoGameover"))}</label>
                </div>
            </aside>
            <section class="wfm-game-main">
                <div class="wfm-game-toolbar">
                    <span class="wfm-game-current" id="wfm-game-current"></span>
                    <span class="wfm-game-spacer"></span>
                    <button type="button" id="wfm-game-restart" class="wfm-btn wfm-btn-sm">${escapeHtml(t("gameRestart"))}</button>
                </div>
                <div class="wfm-game-stage" id="wfm-game-stage"></div>
            </section>
            <aside class="wfm-game-result" id="wfm-game-result">
                <div class="wfm-game-section-title">${escapeHtml(t("gameResultTitle"))}</div>
                <div class="wfm-game-result-status" id="wfm-game-result-status">${escapeHtml(t("gameResultEmpty"))}</div>
                <div class="wfm-game-row" id="wfm-game-end-row" hidden>
                    <button type="button" id="wfm-game-play-again" class="wfm-btn wfm-btn-sm">${escapeHtml(t("gamePlayAgain"))}</button>
                </div>
                <div class="wfm-game-jobs" id="wfm-game-jobs"></div>
            </aside>
        </div>`;

    $("wfm-game-difficulty").value = s.difficulty;
    $("wfm-game-sound").checked = s.sound !== false;
    $("wfm-game-bgm").checked = s.bgm !== false;
    $("wfm-game-base-prompt").value = s.basePrompt;
    $("wfm-game-negative-prompt").value = s.negativePrompt;
    $("wfm-game-each-stage").checked = s.generateEachStage !== false;
    $("wfm-game-auto-generate").checked = s.autoGenerateEnding !== false;
    $("wfm-game-auto-gameover").checked = s.autoGenerateGameover !== false;
    markSelectedGame();
}

function markSelectedGame() {
    const g = currentGame();
    document.querySelectorAll("#wfm-game-list .wfm-game-card").forEach((el) => {
        el.classList.toggle("active", el.dataset.gameId === g?.id);
    });
    const cur = $("wfm-game-current");
    if (cur) cur.textContent = g ? localized(g.name, g.id) : "";
}

async function loadWorkflowOptions() {
    const sel = $("wfm-game-workflow");
    if (!sel) return;
    const s = loadSettings();
    // 一覧の取得(全ワークフローの解析)は時間がかかるので、先に保存済みの選択だけ表示しておく
    if (!sel.options.length && s.workflow) {
        sel.innerHTML = `<option value="${escapeHtml(s.workflow)}">${escapeHtml(s.workflow)}</option>`;
        sel.value = s.workflow;
    }
    let names = [];
    try {
        const res = await fetch("/api/wfm/workflows");
        const list = await res.json();
        names = (Array.isArray(list) ? list : [])
            .filter((w) => ["api", "ui"].includes(w.analysis?.format) && (w.analysis?.inputs?.prompts ?? 1) > 0)
            .map((w) => w.filename);
    } catch { /* keep empty */ }
    if (s.workflow && !names.includes(s.workflow)) names.unshift(s.workflow);
    sel.innerHTML = names.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");
    sel.value = s.workflow;
}

function bindShell() {
    $("wfm-game-list").addEventListener("click", (e) => {
        const card = e.target.closest(".wfm-game-card");
        if (!card) return;
        if (card.dataset.gameId === currentGame()?.id && state.handle) { state.handle.focus?.(); return; }
        saveSettings({ gameId: card.dataset.gameId });
        markSelectedGame();
        mountCurrentGame();
    });
    // プレイ設定はゲーム起動時に渡すので、変更したら再起動して反映する
    $("wfm-game-difficulty").addEventListener("change", (e) => { saveSettings({ difficulty: e.target.value }); mountCurrentGame(); });
    $("wfm-game-sound").addEventListener("change", (e) => { saveSettings({ sound: e.target.checked }); mountCurrentGame(); });
    $("wfm-game-bgm").addEventListener("change", (e) => { saveSettings({ bgm: e.target.checked }); mountCurrentGame(); });
    $("wfm-game-workflow").addEventListener("change", (e) => saveSettings({ workflow: e.target.value }));
    $("wfm-game-workflow-reload").addEventListener("click", loadWorkflowOptions);
    $("wfm-game-base-prompt").addEventListener("change", (e) => {
        saveSettings({ basePrompt: e.target.value });
        state.jobs.forEach((job) => { if (job.status === "idle" || job.status === "queued") refreshJobPrompt(job); });
    });
    $("wfm-game-negative-prompt").addEventListener("change", (e) => saveSettings({ negativePrompt: e.target.value }));
    $("wfm-game-each-stage").addEventListener("change", (e) => saveSettings({ generateEachStage: e.target.checked }));
    $("wfm-game-auto-generate").addEventListener("change", (e) => saveSettings({ autoGenerateEnding: e.target.checked }));
    $("wfm-game-auto-gameover").addEventListener("change", (e) => saveSettings({ autoGenerateGameover: e.target.checked }));
    $("wfm-game-restart").addEventListener("click", restartGame);
    $("wfm-game-play-again").addEventListener("click", restartGame);
    const jobs = $("wfm-game-jobs");
    jobs.addEventListener("change", (e) => {
        const cb = e.target.closest("input[data-reward-idx]");
        const job = jobOf(e.target);
        if (!cb || !job) return;
        const idx = Number(cb.dataset.rewardIdx);
        if (cb.checked) job.selected.add(idx); else job.selected.delete(idx);
        refreshJobPrompt(job);
    });
    jobs.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-act]");
        const job = jobOf(e.target);
        if (!btn || !job) return;
        if (btn.dataset.act === "generate") enqueueJob(job);
        else if (btn.dataset.act === "open") openInGenerateUI(job);
    });
}

// ---------------------------------------------------------------------------
// game lifecycle
// ---------------------------------------------------------------------------

function unmountGame() {
    if (state.handle) {
        try { state.handle.unmount?.(); } catch (e) { console.error("[WFS Game] unmount failed", e); }
        state.handle = null;
    }
}

function resetResult() {
    // 生成中・待機中のジョブはそのまま続く(カードだけ消える)。画像は出力フォルダに残る
    state.jobs.forEach((job) => { job.removed = true; if (job.imageUrl) URL.revokeObjectURL(job.imageUrl); });
    state.jobs = [];
    const jobs = $("wfm-game-jobs");
    if (jobs) jobs.innerHTML = "";
    const st = $("wfm-game-result-status");
    if (st) st.textContent = t("gameResultEmpty");
    const end = $("wfm-game-end-row");
    if (end) end.hidden = true;
}

async function mountCurrentGame() {
    const game = currentGame();
    const stage = $("wfm-game-stage");
    if (!game || !stage) return;
    const token = ++state.mountToken;
    unmountGame();
    resetResult();
    stage.innerHTML = `<div class="wfm-game-loading">${escapeHtml(t("gameLoading"))}</div>`;
    try {
        // ゲームパック更新後に古いモジュールがキャッシュから読まれないよう、バージョンを付ける
        const ver = encodeURIComponent(game.version || state.manifest.package_version || "0");
        const mod = await import(`${game.entry}?v=${ver}`);
        if (token !== state.mountToken) return; // 読み込み中に別ゲームへ切り替わった
        if (typeof mod.mount !== "function") throw new Error("mount() not found");
        const s = loadSettings();
        const host = {
            apiVersion: HOST_API_VERSION,
            lang: getLang(),
            settings: { difficulty: s.difficulty, sound: s.sound !== false, bgm: s.bgm !== false },
            runStart: () => { if (token === state.mountToken) resetResult(); },
            stageClear: (result) => { if (token === state.mountToken) onStageClear(result); },
            finish: (result) => { if (token === state.mountToken) onGameFinished(result); },
        };
        const handle = await mod.mount(stage, host);
        if (token !== state.mountToken) { try { handle?.unmount?.(); } catch { /* ignore */ } return; }
        state.handle = handle || null;
        if (!isGameTabActive()) state.handle?.pause?.();
    } catch (e) {
        console.error("[WFS Game] failed to load game", e);
        stage.innerHTML = `<div class="wfm-game-loading">${escapeHtml(t("gameLoadFailed", e.message))}</div>`;
    }
}

function restartGame() {
    resetResult();
    if (state.handle?.restart) state.handle.restart();
    else mountCurrentGame();
}

function isGameTabActive() {
    return $("wfm-tab-game")?.classList.contains("active");
}

// ---------------------------------------------------------------------------
// result & generation
// ---------------------------------------------------------------------------

function sanitizeResult(raw) {
    const r = raw && typeof raw === "object" ? raw : {};
    const rewards = (Array.isArray(r.rewards) ? r.rewards : [])
        .filter((x) => x && x.type === "prompt" && typeof x.text === "string" && x.text.trim())
        .slice(0, 50)
        .map((x) => ({
            text: x.text.trim().slice(0, 500),
            weight: Number.isFinite(Number(x.weight)) ? Number(x.weight) : 1,
            source: typeof x.source === "string" ? x.source : "clear",
        }));
    const kind = ["stage", "ending", "gameover"].includes(r.kind) ? r.kind : (r.cleared ? "ending" : "gameover");
    const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    return {
        kind,
        bonus: !!r.bonus, // アイテムを全部取ったステージ(プライベート写真)
        negative: typeof r.negative === "string" ? r.negative.trim().slice(0, 500) : "",
        cleared: !!r.cleared,
        score: num(r.score),
        stage: num(r.stage),
        stagesTotal: num(r.stagesTotal),
        stageName: typeof r.stageName === "string" ? r.stageName.slice(0, 100) : "",
        rewards,
    };
}

function onStageClear(raw) {
    const result = sanitizeResult(raw);
    const job = result.bonus
        ? addJob(result, t("gameJobStagePrivate", result.stage, result.stageName), "private")
        : addJob(result, t("gameJobStage", result.stage, result.stageName));
    if (loadSettings().generateEachStage !== false) enqueueJob(job);
}

function onGameFinished(raw) {
    const result = sanitizeResult(raw);
    const cleared = result.kind === "ending";
    $("wfm-game-result-status").innerHTML = `
        <div class="wfm-game-result-head ${cleared ? "cleared" : "failed"}">${escapeHtml(cleared ? t("gameCleared") : t("gameOverLabel"))}</div>
        <div>${escapeHtml(t("gameScore", result.score))}</div>`;
    $("wfm-game-end-row").hidden = false;
    const s = loadSettings();
    if (cleared) {
        const job = addJob(result, t("gameJobEnding"));
        if (s.autoGenerateEnding !== false) enqueueJob(job);
    } else if (result.rewards.length) {
        // ゲームオーバー: 負けたステージを背景にした敗北の場面(クリア済みステージの画像は残る)
        const job = addJob(result, t("gameJobGameover", result.stage, result.stageName), "gameover");
        if (s.autoGenerateGameover !== false) enqueueJob(job);
    }
}

// ---- image cards ----

function jobOf(el) {
    const card = el.closest?.(".wfm-game-job");
    return card ? state.jobs.find((j) => String(j.id) === card.dataset.jobId) : null;
}

function addJob(result, title, variant = "") {
    const job = {
        id: ++state.jobSeq, kind: result.kind, title, result,
        selected: new Set(result.rewards.map((_, i) => i)),
        status: "idle", apiWf: null, imageUrl: null, el: null,
    };
    const el = document.createElement("div");
    el.className = variant ? `wfm-game-job wfm-game-job-${variant}` : "wfm-game-job";
    el.dataset.jobId = String(job.id);
    el.innerHTML = `
        <div class="wfm-game-job-head">
            <span class="wfm-game-job-title">${escapeHtml(title)}</span>
            <span class="wfm-game-job-status" data-role="status"></span>
        </div>
        <div class="wfm-game-progress" data-role="progress" hidden><div class="wfm-game-progress-bar" data-role="bar"></div></div>
        <img class="wfm-game-job-img" data-role="img" alt="" hidden>
        <details class="wfm-game-job-details">
            <summary>${escapeHtml(t("gamePromptDetails"))}</summary>
            <div class="wfm-game-rewards">
                ${result.rewards.map((r, i) => `
                    <label class="wfm-game-reward">
                        <input type="checkbox" data-reward-idx="${i}" checked>
                        <span><span class="wfm-game-reward-src">${escapeHtml(sourceLabel(r.source))}</span>${escapeHtml(r.text)}</span>
                    </label>`).join("")}
                ${result.negative ? `<div class="wfm-game-note">${escapeHtml(t("gameNegativeFromGame"))}: ${escapeHtml(result.negative)}</div>` : ""}
            </div>
            <label class="wfm-game-field">
                <span>${escapeHtml(t("gameFinalPrompt"))}</span>
                <textarea class="wfm-textarea" data-role="prompt" rows="4"></textarea>
            </label>
        </details>
        <div class="wfm-game-row">
            <button type="button" class="wfm-btn wfm-btn-sm wfm-btn-primary" data-act="generate">${escapeHtml(t("gameGenerate"))}</button>
            <button type="button" class="wfm-btn wfm-btn-sm" data-act="open" hidden>${escapeHtml(t("gameOpenInGenerateUI"))}</button>
        </div>`;
    job.el = el;
    state.jobs.push(job);
    $("wfm-game-jobs")?.prepend(el); // 新しいものを上に
    refreshJobPrompt(job);
    setJobStatus(job, "idle");
    return job;
}

const part = (job, role) => job.el.querySelector(`[data-role="${role}"]`);

function setJobStatus(job, status, text = "") {
    job.status = status;
    const label = { idle: "", queued: t("gameJobQueued"), running: t("gameGenerating"), done: t("gameJobDone"), failed: t("gameGenerateFailed", "") }[status] ?? "";
    const st = part(job, "status");
    st.textContent = text || label;
    st.dataset.status = status;
    part(job, "progress").hidden = status !== "running";
    const gen = job.el.querySelector('button[data-act="generate"]');
    gen.disabled = status === "queued" || status === "running";
    gen.textContent = job.imageUrl || status === "failed" ? t("gameRegenerate") : t("gameGenerate");
}

function buildPrompt(job) {
    const s = loadSettings();
    const parts = [];
    const seen = new Set();
    const push = (txt) => {
        const v = (txt || "").trim();
        if (!v) return;
        const key = v.toLowerCase().replace(/\s+/g, " ");
        if (seen.has(key)) return;
        seen.add(key);
        parts.push(v);
    };
    push(s.basePrompt);
    job.result.rewards.forEach((r, i) => { if (job.selected.has(i)) push(formatReward(r)); });
    return parts.join(", ");
}

function refreshJobPrompt(job) {
    part(job, "prompt").value = buildPrompt(job);
}

function enqueueJob(job) {
    if (job.status === "queued" || job.status === "running") return;
    setJobStatus(job, "queued");
    state.queue = state.queue.then(() => runJob(job)).catch(() => {});
}

async function runJob(job) {
    if (job.removed) return;
    const prompt = (part(job, "prompt").value || buildPrompt(job)).trim();
    if (!prompt) { setJobStatus(job, "failed", t("gameEmptyPrompt")); return; }
    setJobStatus(job, "running");
    const bar = part(job, "bar");
    bar.style.width = "0%";
    try {
        const wf = await buildWorkflow(prompt, job.result.negative);
        job.apiWf = wf;
        const expanded = await _expandWildcardsInWorkflow(wf);
        const { images } = await comfyUI.generate(expanded, {
            seedMode: "random",
            quietVram: true, // VRAM 調整のトーストでゲーム画面を隠さない
            onProgress: (pct) => {
                bar.style.width = `${(pct * 100).toFixed(1)}%`;
                part(job, "status").textContent = `${t("gameGenerating")} ${(pct * 100).toFixed(0)}%`;
            },
        });
        const img = images.filter((x) => x.type !== "temp")[0] || images[0];
        if (!img) throw new Error(t("gameNoImage"));
        const blob = await comfyUI.getImageBlob(img);
        if (job.imageUrl) URL.revokeObjectURL(job.imageUrl);
        job.imageUrl = URL.createObjectURL(blob);
        if (job.removed) { URL.revokeObjectURL(job.imageUrl); return; }
        const el = part(job, "img");
        el.src = job.imageUrl;
        el.title = t("gameGenerated", [img.subfolder, img.filename].filter(Boolean).join("/"));
        el.hidden = false;
        job.el.querySelector('button[data-act="open"]').hidden = false;
        setJobStatus(job, "done");
    } catch (e) {
        console.error("[WFS Game] generation failed", e);
        if (!job.removed) {
            setJobStatus(job, "failed", t("gameGenerateFailed", e.message));
            showToast(t("gameGenerateFailed", e.message), "error");
        }
    }
}

function sourceLabel(src) {
    const key = { style: "gameSrcStyle", character: "gameSrcCharacter", scene: "gameSrcScene", clear: "gameSrcClear", enemy: "gameSrcEnemy", bonus: "gameSrcBonus" }[src];
    return key ? t(key) : src;
}

function joinUnique(...parts) {
    const seen = new Set();
    const out = [];
    for (const p of parts) {
        for (const tag of (p || "").split(",")) {
            const v = tag.trim();
            const k = v.toLowerCase();
            if (v && !seen.has(k)) { seen.add(k); out.push(v); }
        }
    }
    return out.join(", ");
}

function formatReward(r) {
    return r.weight !== 1 ? `(${r.text}:${r.weight})` : r.text;
}

async function buildWorkflow(prompt, gameNegative) {
    const s = loadSettings();
    if (!s.workflow) throw new Error(t("gameNoWorkflow"));
    const res = await fetch(`/api/wfm/workflows/raw?filename=${encodeURIComponent(s.workflow)}`);
    if (!res.ok) throw new Error(t("gameWorkflowLoadFailed", s.workflow));
    const raw = await res.json();
    const format = comfyWorkflow.detectFormat(raw, s.workflow);
    let wf;
    if (format === "ui") wf = await comfyWorkflow.convertUiToApi(raw);
    else if (format === "api") wf = structuredClone(raw);
    else throw new Error(t("unknownWorkflowFormat"));

    const analysis = comfyWorkflow.analyzeWorkflow(wf);
    const pos = analysis.prompt_nodes?.find((n) => n.role === "positive");
    const neg = analysis.prompt_nodes?.find((n) => n.role === "negative");
    if (!pos || !wf[pos.id]) throw new Error(t("gameNoPositiveNode"));
    wf[pos.id].inputs[pos.textKey || "text"] = prompt;
    if (neg && wf[neg.id]) {
        // 設定のネガティブ(空ならワークフロー自身のもの)に、ゲームが渡したネガティブを足す
        const key = neg.textKey || "text";
        const base = s.negativePrompt.trim() || (typeof wf[neg.id].inputs[key] === "string" ? wf[neg.id].inputs[key] : "");
        wf[neg.id].inputs[key] = joinUnique(base, gameNegative);
    }
    return wf;
}

async function openInGenerateUI(job) {
    if (!job?.apiWf) return;
    const { loadWorkflowIntoEditor } = await import("./generate-tab.js");
    const ok = await loadWorkflowIntoEditor(structuredClone(job.apiWf), loadSettings().workflow);
    if (ok !== false) document.querySelector('.wfm-tab[data-tab="generate"]')?.click();
}

// ---------------------------------------------------------------------------
// tab visibility
// ---------------------------------------------------------------------------

function onTabsClicked(e) {
    const tab = e.target.closest(".wfm-tab");
    if (!tab) return;
    if (tab.dataset.tab === "game") {
        // app.js の表示切替が終わってから初期化する
        setTimeout(onOpen, 0);
    } else {
        state.handle?.pause?.();
    }
}

async function onOpen() {
    if (!state.opened) {
        state.opened = true;
        renderShell();
        bindShell();
        loadWorkflowOptions();
        await mountCurrentGame();
        return;
    }
    state.handle?.resume?.();
}

export async function initGameTab() {
    const btn = document.querySelector('.wfm-tab[data-tab="game"]');
    if (!btn || !$("wfm-tab-game")) return;
    const manifest = await fetchManifest();
    if (!manifest) return; // ゲームパック未インストール: タブは hidden のまま
    state.manifest = manifest;
    btn.hidden = false;
    document.querySelector('.wfm-help-nav-item[data-help-page="game"]')?.removeAttribute("hidden");
    document.querySelector(".wfm-tabs")?.addEventListener("click", onTabsClicked);
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) state.handle?.pause?.();
        else if (isGameTabActive()) state.handle?.resume?.();
    });
    // 動作確認用 (DevTools から window._wfmGameTab.handle.debugClear() など)
    window._wfmGameTab = state;
}
