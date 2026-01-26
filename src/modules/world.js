
import { getSettings, saveSettings } from "./core.js";
import { notify } from "./notifications.js";
import { initBackgroundManager } from "./backgrounds.js";
import { initAtmosphere, updateAtmosphere } from "./atmosphere.js";
import { updateSpriteStage, initSprites } from "./sprites.js";
import { initScavenge, initSpriteInteraction, spawnScavengeNodes } from "./interaction.js";
import { initChatSync } from "./chat_sync.js";
import { initNavigation } from "./navigation.js";
import {
    initGestures,
    initSensory,
    initInputAssist,
    initTrophies,
    initHaptics,
    initVisualPhysics,
    addTrauma,
    getRealityEngineV3,
    initForgeV3,
    initGameplayV3
} from "./reality.js";
import { initRuneCasting } from "./reality.js";
import { initLockpicking, initScratchCard } from "./minigames.js";
import { initSimulation, worldGen, utilityAI } from "./simulation.js";
import { openCalendar } from "./calendar.js";

let reBound = false;
let reObserver = null;
let reLastSig = "";
let reEngine = null;
let reV3 = null;

async function ensureRealityV3() {
    if (reV3) return reV3;
    try {
        reV3 = getRealityEngineV3();
        try { initForgeV3(); } catch (_) {}
        try { initGameplayV3(); } catch (_) {}
        return reV3;
    } catch (_) {
        return null;
    }
}

function esc(s) {
    return String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function slug(s) {
    return String(s || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 60);
}

function hash(str) {
    let h = 0;
    const s = String(str || "");
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return String(h);
}

function readLastChatMessage() {
    try {
        const chatEl = document.getElementById("chat");
        if (!chatEl) return null;
        const last = chatEl.querySelector(".mes:last-child") || chatEl.lastElementChild;
        if (!last) return null;
        const name =
            last.querySelector?.(".mes_name")?.textContent ||
            last.querySelector?.(".name_text")?.textContent ||
            last.querySelector?.(".name")?.textContent ||
            last.getAttribute?.("ch_name") ||
            last.getAttribute?.("data-name") ||
            last.dataset?.name ||
            "";
        const text =
            last.querySelector?.(".mes_text")?.textContent ||
            last.querySelector?.(".mes-text")?.textContent ||
            last.textContent ||
            "";
        const nm = String(name || "").trim() || "Story";
        const tx = String(text || "").trim();
        if (!tx) return null;
        return { name: nm.slice(0, 80), text: tx.slice(0, 6000) };
    } catch (_) {
        return null;
    }
}

function isGroupChatActive() {
    try {
        if (typeof window.getContext === "function") {
            const ctx = window.getContext();
            if (ctx && ctx.groupId !== null && ctx.groupId !== undefined) return true;
        }
    } catch (_) {}
    try {
        return document.querySelector("#group_chat_members, .group-chat, .group_members") !== null;
    } catch (_) {
        return false;
    }
}

function readRecentChatTexts(limit = 30) {
    try {
        const chatEl = document.getElementById("chat");
        if (!chatEl) return [];
        const msgs = Array.from(chatEl.querySelectorAll(".mes"));
        if (!msgs.length) return [];
        const slice = msgs.slice(Math.max(0, msgs.length - limit));
        const out = [];
        for (const m of slice) {
            // Prefer mes_text to avoid "Name: text" and button text contamination
            const t =
                m.querySelector?.(".mes_text")?.textContent ||
                m.querySelector?.(".mes-text")?.textContent ||
                "";
            const clean = String(t || "").trim();
            if (clean) out.push(clean.slice(0, 4000));
        }
        return out;
    } catch (_) {
        return [];
    }
}

function extractTagValue(text, key) {
    const re = new RegExp(`\\[\\s*${key}\\s*:\\s*([^\\]]+)\\]`, "ig");
    let out = [];
    let m = null;
    while ((m = re.exec(String(text || ""))) !== null) out.push(String(m[1] || "").trim());
    out = out.filter(Boolean);
    return out.length ? out[out.length - 1] : "";
}

function stripTags(text) {
    let t = String(text || "");
    t = t.replace(/<think[\s\S]*?<\/think>/gi, "");
    t = t.replace(/<analysis[\s\S]*?<\/analysis>/gi, "");
    t = t.replace(/^\s*(thinking|analysis)\s*:[^\n]*$/gim, "");
    t = stripCssBlocks(t);
    t = t.replace(/<[^>]*?>/g, "");
    t = t.replace(/\[[^\]]*?\]/g, "");
    t = t.replace(/\s+\n/g, "\n");
    return t.trim();
}

function stripCssBlocks(text) {
    const src = String(text || "").replace(/\r/g, "");
    const lines = src.split("\n");
    const out = [];
    let depth = 0;
    for (const line of lines) {
        const t = String(line || "");
        const s = t.trim();
        if (!s) {
            if (depth === 0) out.push("");
            continue;
        }
        const opens = (s.match(/\{/g) || []).length;
        const closes = (s.match(/\}/g) || []).length;
        if (depth > 0) {
            depth = Math.max(0, depth + opens - closes);
            continue;
        }
        const looksCssStart =
            /^(\.|\#|:root\b|@keyframes\b|@media\b|@font-face\b)/i.test(s) ||
            (s.includes("--") && s.includes(":")) ||
            (s.includes("{") && s.includes(":") && !/\bhttps?:\/\//i.test(s));
        if (looksCssStart) {
            depth = Math.max(1, opens - closes);
            continue;
        }
        out.push(t);
    }
    return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function hasSeenDevNotice(s) {
    try {
        if (s?.realityEngine?.devNoticeSeen === true) return true;
    } catch (_) {}
    try {
        return localStorage.getItem("UIE_RE_DEV_NOTICE_SEEN") === "1";
    } catch (_) {
        return false;
    }
}

function markDevNoticeSeen(s) {
    try {
        ensureReality(s);
        s.realityEngine.devNoticeSeen = true;
        saveSettings();
    } catch (_) {}
    try {
        localStorage.setItem("UIE_RE_DEV_NOTICE_SEEN", "1");
    } catch (_) {}
}

function ensureReality(s) {
    if (!s.realityEngine || typeof s.realityEngine !== "object") {
        s.realityEngine = {
            enabled: false,
            view: "room",
            locationId: "",
            stress: 0,
            maxStress: 100,
            backgrounds: {},
            audio: { enabled: true },
            ui: { showQuickButtons: true, showHud: true, hideStUi: true, vnInstant: true }
        };
    }
    const r = s.realityEngine;
    if (typeof r.enabled !== "boolean") r.enabled = false;
    if (typeof r.view !== "string") r.view = "room";
    if (typeof r.locationId !== "string") r.locationId = "";
    if (!r.backgrounds || typeof r.backgrounds !== "object") r.backgrounds = {};
    if (!r.audio || typeof r.audio !== "object") r.audio = { enabled: true };
    if (typeof r.audio.enabled !== "boolean") r.audio.enabled = true;
    if (!r.ui || typeof r.ui !== "object") r.ui = { showQuickButtons: true };
    if (typeof r.ui.showQuickButtons !== "boolean") r.ui.showQuickButtons = true;
    if (typeof r.ui.showHud !== "boolean") r.ui.showHud = true;
    // Default to HIDING ST UI for full immersion
    if (typeof r.ui.hideStUi !== "boolean") r.ui.hideStUi = true;
    if (typeof r.ui.vnInstant !== "boolean") r.ui.vnInstant = true;
    if (typeof r.ui.allowBg !== "boolean") r.ui.allowBg = true;

    r.comingSoon = false;

    if (!Number.isFinite(Number(r.stress))) r.stress = 0;
    if (!Number.isFinite(Number(r.maxStress)) || Number(r.maxStress) <= 0) r.maxStress = 100;
    if (!r.sprites || typeof r.sprites !== "object") r.sprites = { sets: {}, speakerMap: {} };
    if (!r.sprites.sets || typeof r.sprites.sets !== "object") r.sprites.sets = {};
    if (!r.sprites.speakerMap || typeof r.sprites.speakerMap !== "object") r.sprites.speakerMap = {};
}

function setStageEnabled(enabled) {
    const el = document.getElementById("reality-stage");
    if (!el) return;
    const s = getSettings();
    ensureReality(s);
    if (s.realityEngine.comingSoon === true) enabled = false;
    if (enabled) {
        // IMPORTANT: CSS handles layout changes now.
        // We toggle 'display' but the children are 'fixed'
        el.style.display = "block";

        try { document.getElementById("re-bg")?.style && (document.getElementById("re-bg").style.backgroundImage = ""); } catch (_) {}
        if (s.realityEngine.ui?.hideStUi !== false) document.body.dataset.realityStage = "1";
        else delete document.body.dataset.realityStage;
    } else {
        el.style.display = "none";
        delete document.body.dataset.realityStage;
        try { document.getElementById("re-bg")?.style && (document.getElementById("re-bg").style.backgroundImage = ""); } catch (_) {}
        try { const m = document.getElementById("re-st-menu"); if (m) m.style.display = "none"; } catch (_) {}
        try { const f = document.getElementById("re-forge-modal"); if (f) f.style.display = "none"; } catch (_) {}
    }
}

async function ensureMapEngine() {
    // Legacy function removed.
    return null;
}

class RealityEngine {
    constructor() {
        this.typingTimer = null;
        this.typingText = "";
        this.typingIdx = 0;
        this.map = null;
        this.audio = { el: null, cache: new Map() };
        this.vn = {
            text: "",
            pages: [],
            pageIdx: 0,
            autoMode: false,
            autoTimer: null,
            settings: {
                speed: 30,
                wordsPerBox: 20, // Default changed to 20 per request
                promptPrefix: ""
            }
        };
        this.loadVnSettings();
    }

    loadVnSettings() {
        try {
            const s = getSettings();
            if (s.realityEngine?.vn) {
                this.vn.settings = { ...this.vn.settings, ...s.realityEngine.vn };
                // Ensure default is 20 if undefined/invalid
                if (!Number.isFinite(Number(this.vn.settings.wordsPerBox))) this.vn.settings.wordsPerBox = 20;
                // Load Auto Mode
                if (typeof s.realityEngine.vn.autoMode === "boolean") {
                    this.vn.autoMode = s.realityEngine.vn.autoMode;
                }
            }
        } catch (_) {}
    }

    saveVnSettings() {
        const s = getSettings();
        ensureReality(s);
        s.realityEngine.vn = { ...this.vn.settings, autoMode: this.vn.autoMode };
        saveSettings();
    }

    paginateText(text) {
        const limit = Number(this.vn.settings.wordsPerBox) || 20;
        if (limit <= 0) return [text];

        const words = text.split(/\s+/);
        const pages = [];
        let current = [];

        for (const w of words) {
            current.push(w);
            if (current.length >= limit && /[.!?"]$/.test(w)) { // Try to break on sentences
                pages.push(current.join(" "));
                current = [];
            } else if (current.length >= limit * 1.5) { // Hard limit
                pages.push(current.join(" "));
                current = [];
            }
        }
        if (current.length) pages.push(current.join(" "));
        if (pages.length === 0) pages.push("");

        return pages;
    }

    renderVnPage() {
        const text = this.vn.pages[this.vn.pageIdx] || "";
        this.startTypewriter(text, () => {
            if (this.vn.autoMode) this.scheduleAutoAdvance();
        });

        const prev = document.getElementById("re-vn-prev");
        const next = document.getElementById("re-vn-next");
        
        // Show box if hidden (sanity check)
        const box = document.getElementById("re-vn-box");
        if (box && box.style.display === "none") box.style.display = "flex";

        if (prev) {
            // Hide prev on first page
            prev.style.opacity = this.vn.pageIdx > 0 ? "1" : "0";
            prev.style.pointerEvents = this.vn.pageIdx > 0 ? "auto" : "none";
        }
        if (next) {
            // Always show next (it acts as "Close" on last page)
            next.style.opacity = "1";
            next.style.pointerEvents = "auto";
            
            // Optional: Change icon on last page?
            // next.innerHTML = this.vn.pageIdx < this.vn.pages.length - 1 ? '<i class="fa-solid fa-chevron-right"></i>' : '<i class="fa-solid fa-xmark"></i>';
        }
    }

    scheduleAutoAdvance() {
        if (this.vn.autoTimer) clearTimeout(this.vn.autoTimer);
        const text = this.vn.pages[this.vn.pageIdx] || "";
        // reading speed: ~200 wpm -> ~3 words/sec. 
        // 20 words -> ~6-7 sec.
        // Formula: base 1s + words * 300ms
        const words = text.split(/\s+/).length;
        const delay = 1000 + (words * 300) + Number(this.vn.settings.speed) * 10;
        
        this.vn.autoTimer = setTimeout(() => {
            if (!this.vn.autoMode) return;
            this.advancePage();
        }, delay);
    }

    advancePage() {
        if (this.vn.pageIdx < this.vn.pages.length - 1) {
            this.vn.pageIdx++;
            this.renderVnPage();
        } else {
            // End of message
            // If auto mode, maybe we just hide?
            const box = document.getElementById("re-vn-box");
            if (box) box.style.display = "none";
        }
    }

    getLocationId() {
        const s = getSettings();
        ensureReality(s);
        const wsLoc = String(s?.worldState?.location || "").trim();
        const locId = slug(wsLoc || s.realityEngine.locationId || "unknown");
        s.realityEngine.locationId = locId;
        saveSettings();
        return locId;
    }

    applyBackground() {
        const s = getSettings();
        ensureReality(s);
        const locId = this.getLocationId();
        if (s.realityEngine.ui?.allowBg !== true) {
            try {
                const bgEl0 = document.getElementById("re-bg");
                if (bgEl0) bgEl0.style.backgroundImage = "";
            } catch (_) {}
            return;
        }
        let bg = "";
        try {
            const v3 = window.UIE_realityV3;
            if (v3 && typeof v3.getBackground === "function") bg = String(v3.getBackground(locId) || "").trim();
        } catch (_) {}
        if (!bg) bg = String(s.realityEngine.backgrounds?.[locId] || "").trim();
        const bgEl = document.getElementById("re-bg");
        if (bgEl) {
            if (bg) {
                bgEl.style.backgroundImage = `url("${bg}")`;
                bgEl.style.backgroundSize = "cover";
                bgEl.style.backgroundPosition = "center";
            } else {
                bgEl.style.backgroundImage = "";
            }
        }
    }

    updateSprite(charName, mood) {
        // ... (Legacy sprite function, logic moved to sprites.js but keeping for compatibility)
    }

    triggerShake() {
        try {
            if (typeof addTrauma === "function") {
                addTrauma(0.5);
                return;
            }
        } catch (_) {}

        const st = document.getElementById("reality-stage");
        if (!st) return;
        st.classList.remove("re-shake");
        void st.offsetWidth;
        st.classList.add("re-shake");
        setTimeout(() => { try { st.classList.remove("re-shake"); } catch (_) {} }, 520);
    }

    ensureAudioEl() {
        if (this.audio.el) return this.audio.el;
        const a = document.createElement("audio");
        a.preload = "auto";
        a.volume = 0.8;
        a.style.display = "none";
        document.body.appendChild(a);
        this.audio.el = a;
        return a;
    }

    playSound(tag) {
        const s = getSettings();
        ensureReality(s);
        if (s.realityEngine.audio?.enabled !== true) return;
        const key = slug(tag);
        if (!key) return;
        const baseUrl = String(window.UIE_BASEURL || "/scripts/extensions/third-party/universal-immersion-engine/").trim();
        const src = `${baseUrl}assets/audio/${key}.mp3`;
        const a = this.ensureAudioEl();
        a.src = src;
        a.currentTime = 0;
        a.play().catch(() => {});
    }

    updateHud() {
        const s = getSettings();
        ensureReality(s);
        const hp = Math.max(0, Number(s.hp || 0));
        const maxHp = Math.max(1, Number(s.maxHp || 1));
        const st = Math.max(0, Number(s.realityEngine.stress || 0));
        const maxSt = Math.max(1, Number(s.realityEngine.maxStress || 100));
        const hpPct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
        const stPct = Math.max(0, Math.min(100, (st / maxSt) * 100));
        const hpFill = document.getElementById("re-hp-fill");
        const stFill = document.getElementById("re-stress-fill");
        if (hpFill) hpFill.style.width = `${hpPct}%`;
        if (stFill) stFill.style.width = `${stPct}%`;
    }

    setView(view) {
        const s = getSettings();
        ensureReality(s);
        s.realityEngine.view = view === "map" ? "map" : "room";
        saveSettings();
        const canvas = document.getElementById("re-map");
        const sprites = document.getElementById("re-sprites-layer");
        const objs = document.getElementById("re-objects");
        const bg = document.getElementById("re-bg");
        if (canvas) canvas.style.display = s.realityEngine.view === "map" ? "block" : "none";
        if (sprites) sprites.style.display = s.realityEngine.view === "map" ? "none" : "block";
        if (objs) objs.style.display = s.realityEngine.view === "map" ? "none" : "";
        if (bg) bg.style.display = s.realityEngine.view === "map" ? "none" : "";
        if (s.realityEngine.view === "map") this.ensureMap();
    }

    async ensureMap() {
        const div = document.getElementById("re-map");
        if (!div) return;
        div.innerHTML = ""; // Clear
        const s = getSettings();
        if (s.map && s.map.image) {
             div.style.backgroundImage = `url("${s.map.image}")`;
             div.style.backgroundSize = "contain";
             div.style.backgroundRepeat = "no-repeat";
             div.style.backgroundPosition = "center";
        } else {
             div.innerHTML = `<div style="color:rgba(255,255,255,0.5); text-align:center; padding-top:40%;"><h2>World Map</h2><p>No map image set.</p></div>`;
        }
    }

    injectTravel(town) {
        const locId = String(town?.id || "").trim();
        if (!locId) return;
        const s = getSettings();
        ensureReality(s);
        if (!s.worldState || typeof s.worldState !== "object") s.worldState = {};

        const prevLoc = s.worldState.location || "Unknown";
        s.worldState.location = locId;
        saveSettings();

        try { window.UIE_realityV3?.setLocation?.(locId); } catch (_) {}
        try { this.applyBackground(); } catch (_) {}
        try { notify("success", `Moved to: ${locId}`, "Reality Engine", "api"); } catch (_) {}

        if (prevLoc !== locId) {
            injectRpEvent(`[System: Party traveled from ${prevLoc} to ${locId}.]`);
        }
    }

    startTypewriter(text, callback) {
        const el = document.getElementById("re-text");
        if (!el) return;
        if (this.typingTimer) clearInterval(this.typingTimer);
        try {
            const s = getSettings();
            ensureReality(s);
            if (s.realityEngine.ui?.vnInstant === true) {
                this.typingText = String(text || "");
                this.typingIdx = this.typingText.length;
                el.textContent = this.typingText;
                this.typingTimer = null;
                if (typeof callback === "function") callback();
                return;
            }
        } catch (_) {}
        this.typingText = String(text || "");
        this.typingIdx = 0;
        el.textContent = "";
        this.typingTimer = setInterval(() => {
            if (!el) return;
            el.textContent += this.typingText.charAt(this.typingIdx);
            this.typingIdx++;
            if (this.typingIdx >= this.typingText.length) {
                clearInterval(this.typingTimer);
                this.typingTimer = null;
                if (typeof callback === "function") callback();
            }
        }, Number(this.vn.settings.speed) || 20);
    }

    skipTypewriter() {
        const el = document.getElementById("re-text");
        if (!el) return;
        if (this.typingTimer) {
            clearInterval(this.typingTimer);
            this.typingTimer = null;
            el.textContent = this.typingText;
            if (this.vn.autoMode) this.scheduleAutoAdvance();
        }
    }

    updateFromChat(charName, messageText) {
        const speaker = document.getElementById("re-speaker");
        if (speaker) speaker.textContent = String(charName || "Story").slice(0, 80);
        const raw = String(messageText || "");
        const clean = stripTags(raw);

        // Track who is speaking for CSS styling
        this.vn.isUser = (String(charName || "").toLowerCase() === "you");

        // Show box and render
        const box = document.getElementById("re-vn-box");
        if (box) box.style.display = "flex";
        
        this.vn.text = clean;
        this.vn.pages = this.paginateText(clean);
        this.vn.pageIdx = 0;
        this.renderVnPage();

        // --- NEW UPDATES ---
        try {
            // IMMERSIVE HTML PARSER
            if (raw.includes("[[IMM_HTML]]")) {
                import("./reality.js").then(m => {
                    if (m.renderImmersiveOverlay) m.renderImmersiveOverlay(raw);
                });
            }
        } catch (_) {}

        const mood = extractTagValue(raw, "mood");
        // this.updateSprite(charName, mood || "neutral"); // Legacy

        // --- NEW UPDATES ---
        updateSpriteStage(raw, charName); // Handle Pos, Dist, Anim

        // Handle [Show: Name] tags to spawn other entities
        try {
            const showMatches = raw.matchAll(/\[(?:Show|Appear|Spawn)\s*:\s*([^\]]+)\]/gi);
            for (const m of showMatches) {
                const name = String(m[1] || "").trim();
                if (name) updateSpriteStage(raw, name);
            }
        } catch (_) {}

        // Handle [Hide: Name] tags to remove entities
        try {
            const hideMatches = raw.matchAll(/\[(?:Hide|Remove|Despawn)\s*:\s*([^\]]+)\]/gi);
            for (const m of hideMatches) {
                const name = String(m[1] || "").trim();
                if (name) hideSprite(name);
            }
        } catch (_) {}

        updateAtmosphere(raw);  // Handle Weather/Time
        // -------------------

        const vfx = extractTagValue(raw, "vfx");
        if (String(vfx).toLowerCase().includes("shake")) this.triggerShake();
        const snd = extractTagValue(raw, "sound");
        if (snd) this.playSound(snd);
        this.updateHud();
    }

    updateFromChatLog(messageTexts) {
        const speaker = document.getElementById("re-speaker");
        if (speaker) speaker.textContent = ""; // No "Name:" header in group log

        // Show box and render
        const box = document.getElementById("re-vn-box");
        if (box) box.style.display = "flex";

        const rawJoined = Array.isArray(messageTexts) ? messageTexts.join("\n\n") : String(messageTexts || "");
        const clean = stripTags(rawJoined);

        this.vn.isUser = false;
        this.vn.text = clean;
        this.vn.pages = this.paginateText(clean);
        this.vn.pageIdx = 0;
        this.renderVnPage();

        // For group chats, also refresh all member sprites
        try {
            import("./group_harmony.js").then(m => m.updateGroupChatSprites?.()).catch(() => {});
        } catch (_) {}
    }

    openForge() {
        const modal = document.getElementById("re-forge-modal");
        const prompt = document.getElementById("re-forge-prompt");
        const imgEl = document.getElementById("re-forge-img");
        const empty = document.getElementById("re-forge-empty");
        if (!modal || !prompt) return;
        const s = getSettings();
        ensureReality(s);
        try {
            const locId = this.getLocationId();
            const cur = String(s.realityEngine.backgrounds?.[locId] || "").trim();
            if (imgEl) {
                if (cur) {
                    imgEl.src = cur;
                    imgEl.style.display = "block";
                    if (empty) empty.style.display = "none";
                } else {
                    imgEl.style.display = "none";
                    if (empty) { empty.textContent = "No preview yet"; empty.style.display = "block"; }
                }
            }
        } catch (_) {}
        const ws = s.worldState || {};
        const hint = `Location: ${String(ws.location || "Unknown")}\nTime: ${String(ws.time || "")}\nWeather: ${String(ws.weather || "")}\n\nDescribe the scene background in detail.`;
        prompt.value = prompt.value ? String(prompt.value) : hint;
        modal.style.display = "flex";
    }

    closeForge() {
        const modal = document.getElementById("re-forge-modal");
        if (modal) modal.style.display = "none";
    }

    async forgeGenerate() {
        const prompt = document.getElementById("re-forge-prompt");
        if (!prompt) return;
        const text = String(prompt.value || "").trim();
        if (!text) return;
        const imgEl = document.getElementById("re-forge-img");
        const empty = document.getElementById("re-forge-empty");
        if (empty) empty.textContent = "Generating...";
        if (imgEl) imgEl.style.display = "none";
        let url = "";
        try {
            const mod = await import("./imageGen.js");
            url = await mod.generateImageAPI(`[UIE_LOCKED]\n${text}`);
        } catch (_) {
            url = "";
        }
        if (!url) {
            if (empty) empty.textContent = "Generation failed";
            return;
        }
        if (imgEl) {
            imgEl.src = url;
            imgEl.style.display = "block";
        }
        if (empty) empty.style.display = "none";
        const s = getSettings();
        ensureReality(s);
        s.realityEngine._pendingBg = url;
        saveSettings();
    }

    forgeBind() {
        const s = getSettings();
        ensureReality(s);
        const locId = this.getLocationId();
        const url = String(s.realityEngine._pendingBg || "").trim();
        if (!url) {
            try { notify("info", "Generate a preview first, then Save/Bind.", "World Forge", "api"); } catch (_) {}
            return;
        }
        s.realityEngine.backgrounds[locId] = url;
        delete s.realityEngine._pendingBg;
        try { window.UIE_realityV3?.setBackground?.(locId, url); } catch (_) {}
        saveSettings();
        this.applyBackground();
        this.closeForge();
        try { notify("success", "Background bound to this location.", "World Forge", "api"); } catch (_) {}
    }

    bindUi() {
        if (reBound) return;
        reBound = true;

        // Clean up old document-level listeners to prevent duplicates
        $(document).off(".realityEngine");

        const actGate = (() => {
            const last = new Map();
            return (key, ms = 450) => {
                const k = String(key || "");
                const now = Date.now();
                const prev = Number(last.get(k) || 0);
                if (now - prev < ms) return false;
                last.set(k, now);
                return true;
            };
        })();

        // --- NUCLEAR EVENT BLOCKER ---
    // Prevent events on our UI from bubbling up to SillyTavern's global listeners (which toggle drawers)
    const blockerEvents = "mousedown pointerdown touchstart click contextmenu dblclick";
    // We bind to specific containers instead of document for our own logic, so blocking at the container level is safe.
    // EXCLUDE .uie-settings-drawer if it exists to allow ST settings to work if they are somehow caught here (unlikely but safe).
    // ADDED: #uie-journal-window, #uie-party-window, #uie-databank-window, #uie-inventory-window, #uie-social-window
    // REMOVED: #uie-calendar-window, #uie-map-window (Handled internally to allow dragging)
    const getRoots = () => $("#reality-stage, #re-st-menu, #re-vn-box, #re-forge-modal, #uie-chatbox-window, #uie-sprites-window, .uie-window, #uie-journal-window, #uie-party-window, #uie-databank-window, #uie-inventory-window, #uie-social-window").not(".uie-settings-drawer").not("#uie-calendar-window").not("#uie-map-window");

    // Apply blocker to current roots
    // Note: We use a capture-like approach by binding early or just relying on bubble order.
    // Since we bind specific logic to these roots below, and handlers on the same element execute in order of binding,
    // we should bind the specific logic FIRST, then the blocker?
    // Actually, if we bind the blocker here, and it calls stopPropagation(), it stops bubbling to PARENTS.
    // It does NOT stop other listeners on the SAME element unless stopImmediatePropagation is used.
    // So this is safe for listeners bound to the same roots.
    // Use a delegating listener on body for robustness against dynamic addition?
    // No, that would be a document listener which is what we are trying to avoid.
    // Instead, we just bind to the elements themselves. Since they are persistent after load, this works.

    // BUT: If elements are re-created (like chatbox), we need to re-bind.
    // The chatbox is re-created or re-appended?
    // startup.js appends them once.

    getRoots().on(blockerEvents, (e) => {
        e.stopPropagation();
    });

    const $roots = getRoots();

        // VN Box Interaction
        $roots.on("pointerup click", "#re-vn-box", (e) => {
            if ($(e.target).closest("#re-vn-controls").length) return;
            if (!actGate("vnbox")) return;
            e.stopPropagation();
            this.skipTypewriter();
        });

        // Controls Blocker (Redundant but safe)
        $roots.on("pointerdown mousedown click", "#re-vn-controls, #re-vn-settings, #re-vn-edit", (e) => {
            e.stopPropagation();
        });

        // VN Edit (Triggers ST Edit)
        $roots.on("pointerup click", "#re-vn-edit", (e) => {
            e.preventDefault(); e.stopPropagation();
            const chat = document.getElementById("chat");
            if (!chat) return;
            const last = chat.querySelector(".mes:last-child");
            if (!last) return;
            const btn = last.querySelector(".mes_edit");
            if (btn) btn.click();
        });

        // VN Delete
        $roots.on("pointerup click", "#re-vn-del", (e) => {
            e.preventDefault(); e.stopPropagation();
            const chat = document.getElementById("chat");
            if (!chat) return;
            const last = chat.querySelector(".mes:last-child");
            if (!last) return;
            const btn = last.querySelector(".mes_del");
            if (btn) btn.click();
        });

        // VN Navigation
        $roots.on("pointerup click", "#re-vn-next", (e) => {
            if (!actGate("vnnext", 200)) return;
            e.preventDefault(); e.stopPropagation();
            if (this.typingTimer) {
                this.skipTypewriter();
            } else {
                if (this.vn.pageIdx < this.vn.pages.length - 1) {
                    this.vn.pageIdx++;
                    this.renderVnPage();
                } else {
                    // Close on last page
                    $("#re-vn-box").hide();
                    if (this.vn.autoTimer) clearTimeout(this.vn.autoTimer);
                }
            }
        });

        $roots.on("pointerup click", "#re-vn-prev", (e) => {
            if (!actGate("vnprev", 200)) return;
            e.preventDefault(); e.stopPropagation();
            if (this.vn.pageIdx > 0) {
                this.vn.pageIdx--;
                this.renderVnPage();
            }
        });

        // VN Auto Toggle
        $roots.on("pointerup click", "#re-vn-auto-toggle", (e) => {
            e.preventDefault(); e.stopPropagation();
            this.vn.autoMode = !this.vn.autoMode;
            this.saveVnSettings(); // Persist setting
            const btn = document.getElementById("re-vn-auto-toggle");
            if (btn) {
                btn.style.color = this.vn.autoMode ? "#cba35c" : "";
                btn.style.opacity = this.vn.autoMode ? "1" : "0.5";
            }
            if (this.vn.autoMode && !this.typingTimer) {
                this.scheduleAutoAdvance();
            } else if (!this.vn.autoMode) {
                if (this.vn.autoTimer) clearTimeout(this.vn.autoTimer);
            }
        });

        // VN Settings
        $roots.on("pointerup click", "#re-vn-settings", (e) => {
            e.preventDefault(); e.stopPropagation();
            const modal = document.getElementById("re-vn-settings-modal");
            if (modal) {
                modal.style.display = "flex";
                document.getElementById("re-vn-speed").value = this.vn.settings.speed;
                document.getElementById("re-vn-words").value = this.vn.settings.wordsPerBox;
                document.getElementById("re-vn-prompt").value = this.vn.settings.promptPrefix;
                const autoCheck = document.getElementById("re-vn-auto-check");
                if (autoCheck) autoCheck.checked = this.vn.autoMode;
            }
        });

        $(document).on("pointerup click", "#re-vn-save-settings", (e) => {
            e.preventDefault(); e.stopPropagation();
            const speed = parseInt(document.getElementById("re-vn-speed").value) || 30;
            const words = parseInt(document.getElementById("re-vn-words").value) || 50;
            const prompt = document.getElementById("re-vn-prompt").value || "";
            const autoCheck = document.getElementById("re-vn-auto-check");

            this.vn.settings.speed = speed;
            this.vn.settings.wordsPerBox = words;
            this.vn.settings.promptPrefix = prompt;
            
            if (autoCheck) {
                this.vn.autoMode = autoCheck.checked;
                // Update the toggle button UI too
                const btn = document.getElementById("re-vn-auto-toggle");
                if (btn) {
                    btn.style.color = this.vn.autoMode ? "#cba35c" : "";
                    btn.style.opacity = this.vn.autoMode ? "1" : "0.5";
                }
            }
            
            this.saveVnSettings();

            $("#re-vn-settings-modal").hide();
            this.vn.pages = this.paginateText(this.vn.text);
            this.vn.pageIdx = 0;
            this.renderVnPage();
        });

        // Dev Notice (one-time)
        const hideDev = () => { try { $("#re-dev-notice").hide(); } catch (_) {} };
        $roots.off("click.reDev pointerup.reDev", "#re-dev-ok").on("click.reDev pointerup.reDev", "#re-dev-ok", (e) => {
            e.preventDefault(); e.stopPropagation();
            const s = getSettings();
            markDevNoticeSeen(s);
            hideDev();
        });
        $roots.off("click.reDevBackdrop pointerup.reDevBackdrop", "#re-dev-notice").on("click.reDevBackdrop pointerup.reDevBackdrop", "#re-dev-notice", (e) => {
            if ($(e.target).closest("#re-dev-ok").length) return;
            if ($(e.target).closest("#re-dev-notice > div").length) return;
            const s = getSettings();
            markDevNoticeSeen(s);
            hideDev();
        });

        // Main UI Controls
        $roots.on("pointerup click", "#re-exit", (e) => {
            if (!actGate("exit")) return;
            e.preventDefault(); e.stopPropagation();
            const s = getSettings();
            ensureReality(s);
            s.realityEngine.enabled = false;
            saveSettings();
            setStageEnabled(false);
        });

        $roots.on("pointerup click", "#re-toggle-view", (e) => {
            if (!actGate("toggleview")) return;
            e.preventDefault(); e.stopPropagation();
            const s = getSettings();
            ensureReality(s);
            const next = s.realityEngine.view === "map" ? "room" : "map";
            this.setView(next);
        });

        // Input Handling
        $roots.on("keydown", "#re-user-input", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault(); e.stopPropagation();
                proxySend();
            }
        });

        $roots.on("pointerup click", "#re-q-send", (e) => {
            e.preventDefault(); e.stopPropagation();
            proxySend();
        });

        // UNIFIED PROJECTION BUTTON HANDLER
        $roots.on("pointerdown mousedown pointerup click contextmenu", ".re-qbtn", async (e) => {
            e.stopPropagation();
        });

    // --- GLOBAL UI HANDLERS (Document Level) ---
    // Force pointerup/click capture to bypass blockers
    window.reToggleMenu = (e) => {
        if(e) { try{e.preventDefault(); e.stopPropagation();}catch(_){} }
        
        // --- INJECTION: Ensure Menu Exists ---
        let m = document.getElementById("re-st-menu");
        if (!m) {
            console.warn("[UIE] Menu missing, injecting...");
            m = document.createElement("div");
            m.id = "re-st-menu";
            m.style.cssText = "position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); width:min(320px, 86vw); display:none; flex-direction:column; gap:8px; padding:10px; border-radius:16px; border:1px solid rgba(255,255,255,0.14); background:rgba(15,10,10,0.96); box-shadow:0 20px 40px rgba(0,0,0,0.75); z-index:2147483660; pointer-events:auto;";
            
            const items = [
                { id: "re-act-continue", icon: "fa-forward", label: "Continue" },
                { id: "re-act-regenerate", icon: "fa-rotate-right", label: "Regenerate" },
                { id: "re-act-stop", icon: "fa-stop", label: "Stop" },
                { sep: true },
                { id: "uie-btn-open-phone", icon: "fa-mobile-screen", label: "Phone" },
                { id: "re-act-impersonate", icon: "fa-user-pen", label: "Impersonate" },
                { id: "re-act-author", icon: "fa-pen-nib", label: "Author's Note" },
                { id: "re-act-cfg", icon: "fa-sliders", label: "CFG / Presets" },
                { id: "re-act-tokens", icon: "fa-chart-pie", label: "Token Probs" },
                { sep: true },
                { id: "re-act-forge", icon: "fa-wand-magic-sparkles", label: "Forge Background" },
                { id: "re-act-toggle-map", icon: "fa-map", label: "Toggle Map" },
                { sep: true },
                { id: "re-act-newchat", icon: "fa-comment", label: "Start New Chat" },
                { id: "re-act-manage", icon: "fa-folder-open", label: "Manage Chats" },
                { id: "re-act-delete", icon: "fa-trash", label: "Delete Messages" },
                { id: "re-act-closechat", icon: "fa-xmark", label: "Close Chat" }
            ];

            items.forEach(item => {
                if (item.sep) {
                    const sep = document.createElement("div");
                    sep.style.cssText = "height:1px; background:rgba(255,255,255,0.1); margin:4px 0;";
                    m.appendChild(sep);
                } else {
                    const el = document.createElement("div");
                    el.className = "re-menu-item";
                    el.id = item.id;
                    el.innerHTML = `<i class="fa-solid ${item.icon}"></i> ${item.label}`;
                    m.appendChild(el);
                }
            });

            document.body.appendChild(m);
        }
        // -----------------------------------------

        if (!m) {
            console.error("[UIE] Menu element #re-st-menu not found!");
            try { notify("error", "Menu element not found!", "UIE"); } catch (_) {}
            return;
        }
        
        // If hidden, show it
        const isHidden = window.getComputedStyle(m).display === "none";
        
        if (isHidden) {
            // First make it display flex but hidden to measure
            m.style.visibility = "hidden";
            m.style.display = "flex";
            m.style.zIndex = "2147483660"; // Force max z-index
            m.style.pointerEvents = "auto"; // Force clickable

            const isMobile = (() => {
                try { return window.matchMedia("(max-width: 768px), (pointer: coarse)").matches; } catch (_) { return window.innerWidth < 768; }
            })();

            if (isMobile) {
                // Mobile: always center
                m.style.position = "fixed";
                m.style.top = "50%";
                m.style.left = "50%";
                m.style.transform = "translate(-50%, -50%)";
            } else {
                // Desktop: position next to the launcher/quick menu button
                const anchor = document.getElementById("re-q-menu") || document.getElementById("uie-launcher");
                if (anchor) {
                    const btnRect = anchor.getBoundingClientRect();
                    const menuRect = m.getBoundingClientRect();
                    m.style.position = "fixed";
                    m.style.left = `${btnRect.right + 8}px`;
                    m.style.top = `${btnRect.top}px`;
                    m.style.transform = "none";

                    // Keep on screen
                    let left = parseFloat(m.style.left) || 0;
                    let top = parseFloat(m.style.top) || 0;

                    // If it doesn't fit to the right, place it on the left
                    if (left + menuRect.width > window.innerWidth - 10) {
                        left = btnRect.left - menuRect.width - 8;
                    }

                    // Clamp to viewport bounds (never off-screen)
                    left = Math.max(10, Math.min(left, window.innerWidth - menuRect.width - 10));
                    top = Math.max(10, Math.min(top, window.innerHeight - menuRect.height - 10));

                    m.style.left = `${left}px`;
                    m.style.top = `${top}px`;
                } else {
                    // Fallback to center
                    m.style.position = "fixed";
                    m.style.top = "50%";
                    m.style.left = "50%";
                    m.style.transform = "translate(-50%, -50%)";
                }
            }

            m.style.visibility = "visible";
            m.dataset.openTs = String(Date.now());
            // try { notify("info", "Menu Opened", "UIE"); } catch (_) {}
        } else {
            m.style.display = "none";
        }
    };

    const toggleMenu = window.reToggleMenu;

    // Nuclear Capture Listener to ensure click works
    window.addEventListener("click", (e) => {
        if (e.target.closest && e.target.closest("#re-q-menu")) {
            e.stopPropagation();
            e.preventDefault();
            if (window.reToggleMenu) window.reToggleMenu(e);
        }
    }, true);

    // Initial Menu Injection (Ensure it exists before click)
    try {
        if (!document.getElementById("re-st-menu")) {
             window.reToggleMenu(null); // Force inject
             // But hide it immediately if it shows up
             const m = document.getElementById("re-st-menu");
             if (m) m.style.display = "none";
        }
    } catch (_) {}

    // Bind to roots directly because body listener is blocked by stopPropagation
    $roots.on("pointerup click", "#re-q-menu", toggleMenu);

    // --- MAGNIFYING GLASS FIX ---
    $roots.on("pointerup click", "#re-q-scavenge", (e) => {
        e.preventDefault(); e.stopPropagation();
        spawnScavengeNodes();
    });

    // --- QUICK SKILLS/ITEMS FIX ---
    // Ensure clicks on the grid items are not blocked
    $roots.on("pointerup click", ".re-actbtn", (e) => {
        // Allow the native onclick to fire, but stop propagation to prevent stage clicks
        e.stopPropagation(); 
    });
    // Fix "Add" button if needed (Open Modal)
    $roots.on("pointerup click", "#re-q-add", (e) => {
        e.preventDefault(); e.stopPropagation();
        const modal = document.getElementById("re-quick-modal");
        if (modal) {
            modal.style.display = "flex";
            const l = document.getElementById("re-quick-label"); if(l) l.value = "";
            const i = document.getElementById("re-quick-icon"); if(i) i.value = "";
            const p = document.getElementById("re-quick-prompt"); if(p) p.value = "";
        }
    });

    
    // EXTRA ROBUST BINDING for Menu
    $(document).off("click.reMenu").on("click.reMenu", "#re-q-menu", toggleMenu);

    $roots.on("pointerup click", ".re-qbtn, .re-custom-btn", async (e) => {
            if (e.type === "contextmenu") {
                e.preventDefault();
                const el = e.currentTarget;
                if (el.classList.contains("re-custom-btn")) {
                    const idx = parseInt(el.dataset.idx);
                    const label = el.dataset.label || "Action";
                    if (confirm(`Delete button "${label}"?`)) {
                        const s = getSettings();
                        if (s.realityEngine?.quickButtons) {
                            s.realityEngine.quickButtons.splice(idx, 1);
                            saveSettings();
                            this.syncEnabled();
                        }
                    }
                }
                return;
            }

            if (e.type !== "click" && e.type !== "pointerup") return;
            // Skip if handled by global handler
            if (e.currentTarget.id === "re-q-menu") return;

            if (!actGate("qbtn_action_" + e.currentTarget.id, 450)) return;

            e.preventDefault();
            const el = e.currentTarget;
            const id = el.id;

            if (id === "re-q-chatbox") {
                try {
                    const openChat = async () => {
                        const win = $("#uie-chatbox-window");
                        if (win.length) {
                            win.show();
                            win.css("z-index", "2147483655");
                            try { (await import("./chatbox.js")).openChatbox?.(); } catch (_) {}
                        } else {
                            try { (await import("./chatbox.js")).openChatbox?.(); } catch (_) {}
                        }
                    };
                    if (document.getElementById("uie-chatbox-window")) { await openChat(); return; }
                    const baseUrl = String(window.UIE_BASEURL || "/scripts/extensions/third-party/universal-immersion-engine/").trim();
                    import("./templateFetch.js").then(async (m) => {
                        const fetchTemplateHtml = m?.fetchTemplateHtml;
                        if (typeof fetchTemplateHtml !== "function") { await openChat(); return; }
                        let html = "";
                        const urls = [`${baseUrl}src/templates/chatbox.html`, `/scripts/extensions/third-party/universal-immersion-engine/src/templates/chatbox.html`];
                        for (const u of urls) {
                            try { html = await fetchTemplateHtml(u); if (html) break; } catch (_) {}
                        }
                        if (html) $("body").append(html);
                        await openChat();
                    }).catch(async () => await openChat());
                } catch (_) {}
            }
            else if (id === "re-q-add") {
                const modal = document.getElementById("re-quick-modal");
                if (modal) {
                    modal.style.display = "flex";
                    // Reset fields
                    const l = document.getElementById("re-quick-label"); if(l) l.value = "";
                    const i = document.getElementById("re-quick-icon"); if(i) i.value = "";
                    const p = document.getElementById("re-quick-prompt"); if(p) p.value = "";
                }
            }
            else if (el.classList.contains("re-custom-btn")) {
                const text = el.dataset.text || "";
                const ta = document.getElementById("send_textarea");
                if (ta) {
                    const start = ta.selectionStart || ta.value.length;
                    const end = ta.selectionEnd || ta.value.length;
                    const val = ta.value;
                    ta.value = val.substring(0, start) + text + val.substring(end);
                    ta.selectionStart = ta.selectionEnd = start + text.length;
                    ta.dispatchEvent(new Event("input", { bubbles: true }));
                    ta.focus();
                }
            }
        });

        // Composer / Menu dismissal
        $roots.on("pointerup click", "#re-composer-wrap", (e) => {
            if ($(e.target).closest("#re-st-menu, #re-q-menu").length) return;
            const m = document.getElementById("re-st-menu");
            if (!m || m.style.display !== "flex") return;
            const openedAt = Number(m.dataset.openTs || 0);
            if (openedAt && Date.now() - openedAt < 250) return;
            m.style.display = "none";
        });

        // Menu Actions
        $roots.on("pointerup click", "#re-act-regenerate", (e) => {
            if (!actGate("regen")) return;
            e.preventDefault(); e.stopPropagation();
            const els = stEls(); if (els.regen) els.regen.click();
            $("#re-st-menu").hide();
        });
        $roots.on("pointerup click", "#re-act-continue", (e) => {
            if (!actGate("cont")) return;
            e.preventDefault(); e.stopPropagation();
            const els = stEls(); if (els.cont) els.cont.click();
            $("#re-st-menu").hide();
        });
        
        $roots.on("pointerup click", "#uie-btn-open-phone", (e) => {
            e.preventDefault(); e.stopPropagation();
            $("#re-st-menu").hide();
            // Try to find the phone button
            const btn = document.querySelector("#phone_button") || document.querySelector(".silly-phone-icon");
            if (btn) btn.click();
            else {
                try { notify("warn", "Phone extension not found", "UIE"); } catch (_) {}
            }
            // Try to boost phone z-index
            setTimeout(() => {
                const phone = document.querySelector("#silly_phone_container") || document.querySelector(".phone_shell");
                if (phone) {
                    phone.style.zIndex = "2147483660"; 
                    phone.style.position = "fixed";
                }
            }, 100);
        });

        $roots.on("pointerup click", "#re-act-impersonate", (e) => {
            if (!actGate("imp")) return;
            e.preventDefault(); e.stopPropagation();
            const els = stEls(); if (els.imp) els.imp.click();
            $("#re-st-menu").hide();
        });
        $roots.on("pointerup click", "#re-act-stop", (e) => {
            if (!actGate("stop")) return;
            e.preventDefault(); e.stopPropagation();
            const els = stEls(); if (els.stop) els.stop.click();
            $("#re-st-menu").hide();
        });
        $roots.on("pointerup click", "#re-act-forge", (e) => {
            if (!actGate("actforge")) return;
            e.preventDefault(); e.stopPropagation();
            this.openForge();
            $("#re-st-menu").hide();
        });
        $roots.on("pointerup click", "#re-act-toggle-map", (e) => {
            if (!actGate("actmap")) return;
            e.preventDefault(); e.stopPropagation();
            const s = getSettings(); ensureReality(s);
            const next = s.realityEngine.view === "map" ? "room" : "map";
            this.setView(next);
            $("#re-st-menu").hide();
        });

        const clickStOption = (re) => {
            try { stMenu.openNearWand(); } catch (_) {}
            setTimeout(() => { try { stMenu.clickItem(re); } catch (_) {} }, 20);
        };
        $roots.on("pointerup click", "#re-act-st-menu", (e) => {
            if (!actGate("stmenu")) return;
            e.preventDefault(); e.stopPropagation();
            try { stMenu.openNearWand(); } catch (_) {}
            $("#re-st-menu").hide();
        });
        $roots.on("pointerup click", "#re-act-author", (e) => {
            if (!actGate("author")) return;
            e.preventDefault(); e.stopPropagation();
            clickStOption(/author'?s\s+note/i);
            $("#re-st-menu").hide();
        });
        $roots.on("pointerup click", "#re-act-cfg", (e) => {
            if (!actGate("cfg")) return;
            e.preventDefault(); e.stopPropagation();
            clickStOption(/cfg\s*scale/i);
            $("#re-st-menu").hide();
        });
        $roots.on("pointerup click", "#re-act-tokens", (e) => {
            if (!actGate("tokens")) return;
            e.preventDefault(); e.stopPropagation();
            clickStOption(/token\s+probabilities/i);
            $("#re-st-menu").hide();
        });
        $roots.on("pointerup click", "#re-act-newchat", (e) => {
            if (!actGate("newchat")) return;
            e.preventDefault(); e.stopPropagation();
            clickStOption(/start\s+new\s+chat|new\s+chat/i);
            $("#re-st-menu").hide();
        });
        $roots.on("pointerup click", "#re-act-manage", (e) => {
            if (!actGate("manage")) return;
            e.preventDefault(); e.stopPropagation();
            clickStOption(/manage\s+chat\s+files|chat\s+files/i);
            $("#re-st-menu").hide();
        });
        $roots.on("pointerup click", "#re-act-delete", (e) => {
            if (!actGate("delete")) return;
            e.preventDefault(); e.stopPropagation();
            clickStOption(/delete\s+messages/i);
            $("#re-st-menu").hide();
        });
        $roots.on("pointerup click", "#re-act-closechat", (e) => {
            if (!actGate("closechat")) return;
            e.preventDefault(); e.stopPropagation();
            clickStOption(/close\s+chat/i);
            $("#re-st-menu").hide();
        });

        // Forge Handlers
        $roots.on("pointerup click", "#re-forge-btn", (e) => {
            if (!actGate("forgebtn")) return;
            e.preventDefault(); e.stopPropagation();
            this.openForge();
        });
        $roots.on("pointerup click", "#re-forge-close", (e) => {
            if (!actGate("forgeclose")) return;
            e.preventDefault(); e.stopPropagation();
            this.closeForge();
        });
        $roots.on("pointerup click", "#re-forge-modal", (e) => {
            if ($(e.target).closest("#re-forge-card").length) return;
            this.closeForge();
        });
        $roots.on("pointerup click", "#re-forge-generate", async (e) => {
            if (!actGate("forgegen", 900)) return;
            e.preventDefault(); e.stopPropagation();
            await this.forgeGenerate();
        });
        $roots.on("pointerup click", "#re-forge-bind", (e) => {
            if (!actGate("forgebind")) return;
            e.preventDefault(); e.stopPropagation();
            this.forgeBind();
        });

        $roots.on("pointerup", "#re-phone, #re-journal, #re-q-phone, #re-q-journal", (e) => {
            e.preventDefault(); e.stopPropagation();
        });

        // Helper for proxying text input
        const stEls = () => ({
            ta: document.querySelector("textarea#send_textarea") || document.querySelector("textarea#send_text") || document.querySelector("textarea"),
            send: document.querySelector("#send_but") || document.querySelector("[data-testid='send']"),
            regen: document.querySelector("#regenerate_but") || document.querySelector("#regenerate") || document.querySelector("[data-testid='regenerate']"),
            cont: document.querySelector("#continue_but") || document.querySelector("#continue") || document.querySelector("[data-testid='continue']"),
            imp: document.querySelector("#impersonate_but") || document.querySelector("#impersonate"),
            stop: document.querySelector("#stop_but") || document.querySelector("#stop")
        });

        const proxySend = () => {
            const ui = document.getElementById("re-user-input");
            if (!ui) return;
            let t = String(ui.value || "").trim();
            if (this.vn.settings.promptPrefix && t && !t.startsWith(this.vn.settings.promptPrefix)) {
                t = `${this.vn.settings.promptPrefix}\n${t}`;
            }
            const els = stEls();
            if (els.ta) {
                els.ta.value = t;
                els.ta.dispatchEvent(new Event("input", { bubbles: true }));
                els.ta.dispatchEvent(new Event("change", { bubbles: true }));
            }
            if (els.send) els.send.click();
            ui.value = "";
        };

        const stMenu = {
            btn() {
                const selectors = ["#options_button", "#options_button_sheld", "#chat_options_button", "#chat_options", "#options", "#three_dots"];
                for (const sel of selectors) {
                    const el = document.querySelector(sel);
                    if (el) return el;
                }
                return null;
            },
            findMenuRoot() {
                const candidates = ["#optionsMenu", "#options_menu", "#options-panel", ".context-menu", ".dropdown-menu.show", "#app_options", "#shadow_popup"];
                for (const sel of candidates) {
                    const el = document.querySelector(sel);
                    if (!el) continue;
                    const st = window.getComputedStyle(el);
                    if (st.display !== "none" && st.visibility !== "hidden" && st.opacity !== "0") return el;
                }
                // Fallback: Look for any visible element with high z-index that looks like a menu
                return null;
            },
            openNearWand() {
                const b = this.btn(); if (b) b.click();
                setTimeout(() => {
                    const m = this.findMenuRoot();
                    if (!m) return;
                    try { m.style.zIndex = "2147483647"; m.style.position = "fixed"; } catch (_) {}
                    try {
                        const wand = document.getElementById("re-q-menu");
                        const r = wand?.getBoundingClientRect?.();
                        if (!r) return;
                        const pad = 8;
                        const w = Math.min(360, Math.max(240, m.getBoundingClientRect().width || 300));
                        const h = Math.min(520, Math.max(240, m.getBoundingClientRect().height || 320));
                        const left = Math.max(pad, Math.min(window.innerWidth - w - pad, r.left));
                        const top = Math.max(pad, Math.min(window.innerHeight - h - pad, r.bottom + 6));
                        m.style.left = `${left}px`;
                        m.style.top = `${top}px`;
                    } catch (_) {}
                }, 0);
            },
            clickItem(textRe) {
                const root = this.findMenuRoot();
                if (!root) return false;
                const els = root.querySelectorAll("button, a, div, li, span");
                for (const el of els) {
                    const t = String(el.textContent || "").trim();
                    if (t && textRe.test(t)) { el.click(); return true; }
                }
                return false;
            }
        };
    }

    startChatObserver() {
        const chat = document.getElementById("chat");
        if (!chat) return;
        if (reObserver) reObserver.disconnect();
        let t = 0;
        reObserver = new MutationObserver(() => {
            const s = getSettings();
            ensureReality(s);
            if (s.realityEngine.enabled !== true) return;
            if (t) clearTimeout(t);
            t = setTimeout(() => {
                if (isGroupChatActive()) {
                    const texts = readRecentChatTexts(30);
                    if (!texts.length) return;
                    const sig = hash(texts.join("||").slice(-6000));
                    if (sig === reLastSig) return;
                    reLastSig = sig;
                    this.updateFromChatLog(texts);
                } else {
                    const last = readLastChatMessage();
                    if (!last) return;
                    const sig = hash(`${last.name}::${last.text}`.slice(-1600));
                    if (sig === reLastSig) return;
                    reLastSig = sig;
                    this.updateFromChat(last.name, last.text);
                }
            }, 900);
        });
        reObserver.observe(chat, { childList: true, subtree: true });
    }

    syncEnabled() {
        const s = getSettings();
        ensureReality(s);
        if (s.realityEngine.comingSoon === true) {
            setStageEnabled(false);
            return;
        }

        setStageEnabled(s.realityEngine.enabled === true);
        if (s.realityEngine.enabled) {
            this.applyBackground();
            this.bindUi();
            this.updateHud();
            this.setView(s.realityEngine.view);
            this.startChatObserver();

            // Show one-time dev notice (non-blocking)
            try {
                if (!hasSeenDevNotice(s)) {
                    const modal = document.getElementById("re-dev-notice");
                    if (modal) {
                        modal.style.display = "flex";
                    } else {
                        // If template missing, still mark as seen to avoid loops
                        markDevNoticeSeen(s);
                    }
                }
            } catch (_) {}

            // --- INITIALIZE SYNC MODULES ---
            try { initChatSync(); } catch (e) { console.error("ChatSync init failed", e); }
            try { initNavigation(); } catch (e) { console.error("Navigation init failed", e); }
            // -------------------------------

            try {
                ensureRealityV3().then((eng) => {
                    if (!eng) return;
                    try { eng.ensureLocationFromWorldState(); } catch (_) {}
                });
            } catch (_) {}

            try {
                const q = document.getElementById("re-quick");
                const grid = document.getElementById("re-action-grid");

                // CUSTOM QUICK BUTTONS LOGIC
                if (q && grid) {
                    // Do NOT clear q.innerHTML (System buttons are in HTML now)
                    // q.innerHTML = ""; 
                    grid.innerHTML = ""; // Clear Action Grid (Custom buttons only)

                    const s = getSettings();
                    if (!s.realityEngine.quickButtons) s.realityEngine.quickButtons = [];

                    const beforeCount = s.realityEngine.quickButtons.length;
                    // AGGRESSIVE CLEANUP: Remove banned buttons from settings permanently
                    const banList = ["work", "flirt", "chat", "shop", "talk", "actions"];
                    s.realityEngine.quickButtons = s.realityEngine.quickButtons.filter(btn => {
                        const lbl = String(btn.label || "").trim().toLowerCase();
                        return !banList.some(b => lbl.includes(b));
                    });

                    if (s.realityEngine.quickButtons.length !== beforeCount) {
                        saveSettings();
                    }

                    // IF NO BUTTONS, SHOW GUIDE TEXT
                    if (s.realityEngine.quickButtons.length === 0) {
                        const guide = document.createElement("div");
                        guide.style.cssText = "color:rgba(255,255,255,0.4); font-size:0.8em; text-align:center; padding:10px; width:100%; grid-column:1/-1; pointer-events:none; font-family:sans-serif;";
                        guide.innerText = "No Quick Buttons set. Use the + button to add them.";
                        grid.appendChild(guide);
                    }

                    // System Buttons are static in HTML. 
                    // We only need to bind specific dynamic behaviors if they aren't global.
                    // The event listeners in bindUi handle clicks.
                    // Note: Menu positioning (qMenuPos) logic for the button itself is deprecated in favor of CSS flow,
                    // but if users want floating menu button, that would need specific handling. 
                    // For now, we respect the HTML layout.

                    // 2. Render Custom Action Buttons -> #re-action-grid (Above)
                    s.realityEngine.quickButtons.forEach((btn, idx) => {
                        const el = document.createElement("button");
                        el.className = "re-actbtn"; // Larger Grid Button
                        el.innerHTML = `<i class="fa-solid ${btn.icon || 'fa-bolt'}"></i> ${btn.label}`;
                        el.title = btn.desc || "";
                        el.onclick = (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const ta = document.getElementById("send_textarea");
                            if (ta) {
                                const start = ta.selectionStart || ta.value.length;
                                const end = ta.selectionEnd || ta.value.length;
                                const val = ta.value;
                                const text = btn.text || "";
                                ta.value = val.substring(0, start) + text + val.substring(end);
                                ta.selectionStart = ta.selectionEnd = start + text.length;
                                ta.dispatchEvent(new Event("input", { bubbles: true }));
                                ta.focus();
                            }
                        };
                        el.oncontextmenu = (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if(confirm(`Delete button "${btn.label}"?`)) {
                                s.realityEngine.quickButtons.splice(idx, 1);
                                saveSettings();
                                this.syncEnabled();
                            }
                        };
                        grid.appendChild(el);
                    });

                    const show = s.realityEngine.ui?.showQuickButtons !== false;
                    
                    // Toggle visibility
                    if (!show) {
                        q.style.display = "none";
                        grid.style.display = "none";
                    } else {
                        q.style.display = "flex";
                        grid.style.display = "flex";
                    }
                }
            } catch (_) {}

            try {
                const hud = document.getElementById("re-hud");
                if (hud) hud.style.display = s.realityEngine.ui?.showHud === false ? "none" : "flex";
            } catch (_) {}
            if (isGroupChatActive()) {
                const texts = readRecentChatTexts(30);
                if (texts.length) this.updateFromChatLog(texts);
                // Ensure group sprites are shown when projection is enabled
                try { import("./group_harmony.js").then(m => m.updateGroupChatSprites?.()).catch(() => {}); } catch (_) {}
            } else {
                const last = readLastChatMessage();
                if (last) this.updateFromChat(last.name, last.text);
            }
        } else {
            this.closeForge();
        }
    }
}

export function initWorld() {
    const s = getSettings();
    $("#uie-world-id").text(s.worldSimId || "WAITING...");
    try {
        ensureReality(s);
        // Enable by default or keep previous state
        if (s.realityEngine.enabled) {
            setStageEnabled(true);
        }
    } catch (_) {}

    if (s.realityEngine.comingSoon === true) s.realityEngine.comingSoon = false;

    $(document).off("click.world");

    // --- INITIALIZE NEW MODULES ---
    try { initBackgroundManager(); } catch (e) { console.error(e); }
    try { initSprites(); } catch (e) { console.error(e); }
    try { initAtmosphere(); } catch (e) { console.error(e); }
    try { initScavenge(); } catch (e) { console.error(e); }
    try { initSpriteInteraction(); } catch (e) { console.error(e); }
    import("./interaction.js").then(m => m.initBackgroundInteraction?.()).catch(console.error);
    try { initGestures(); } catch (e) { console.error(e); }
    try { initRuneCasting(); } catch (e) { console.error(e); }
    try { initLockpicking(); } catch (e) { console.error(e); }
    try { initScratchCard(); } catch (e) { console.error(e); }
    try { initSensory(); } catch (e) { console.error(e); }
    try { initInputAssist(); } catch (e) { console.error(e); }
    try { initTrophies(); } catch (e) { console.error(e); }
    try { initHaptics(); } catch (e) { console.error(e); }
    try { initVisualPhysics(); } catch (e) { console.error(e); }
    try { initSimulation(); } catch (e) { console.error(e); }
    // ------------------------------

    const render = () => {
        const s2 = getSettings();
        try { ensureReality(s2); } catch (_) {}

        const ws = s2?.worldState || {};
        const container = $("#uie-world-content").empty();
        const content = $(document.getElementById("uie-world-state-view").content.cloneNode(true));

        content.find(".val-loc").text(ws.location || "Unknown");
        content.find(".val-time").text(ws.time || "Day");
        content.find(".val-weather").text(ws.weather || "Clear");
        content.find(".val-threat").text(ws.threat || "None");

        // Simulation Status
        let statusText = ws.status || "Normal";
        if (utilityAI) {
             const best = utilityAI.decide();
             if (best) statusText += ` (Agent wants to: ${best.name})`;
        }
        content.find(".val-status").text(statusText);

        if (ws.mapData && ws.mapData.nodes) {
            content.find(".val-loc").append(` <span style="opacity:0.5; font-size:0.8em;">[${ws.mapData.nodes.length} nodes]</span>`);
        }

        content.find("#uie-world-toggle-re").text(s2.realityEngine.enabled ? "Projector: ON" : "Projector: OFF");
        
        // Save Mode Toggle
        const saveMode = s2.realityEngine.saveMode || "local"; // Default to local per user request for "option" (usually local is better for immersion)
        // Actually, user said "give people the option".
        content.find("#uie-world-save-mode").prop("checked", saveMode === "local");

        content.find("#uie-world-hide-quick").prop("checked", s2.realityEngine.ui?.showQuickButtons === false);
        content.find("#uie-world-hide-hud").prop("checked", s2.realityEngine.ui?.showHud === false);
        content.find("#uie-world-show-st-ui").prop("checked", s2.realityEngine.ui?.hideStUi === false);

        container.append(content);
    };

    render();
    if (!reEngine) {
        reEngine = new RealityEngine();
        window.reForgeGenerate = (promptText) => {
            const el = document.getElementById("re-forge-prompt");
            if (el && promptText) el.value = promptText;
            reEngine.forgeGenerate();
        };
        // Add Skill to Quick Menu Helper
        window.UIE_addSkillToQuick = (skillName, skillIcon) => {
            const s = getSettings();
            if (!s.realityEngine) s.realityEngine = {};
            if (!s.realityEngine.quickButtons) s.realityEngine.quickButtons = [];
            
            // Check for duplicate
            if (s.realityEngine.quickButtons.some(b => b.label === skillName)) {
                try { notify("info", "Skill already in Quick Menu", "Skills"); } catch (_) {}
                return;
            }

            s.realityEngine.quickButtons.push({
                label: skillName,
                icon: skillIcon || "fa-bolt",
                text: `[Uses ${skillName}]`,
                desc: `Cast ${skillName}`
            });
            saveSettings();
            try { notify("success", "Added to Quick Menu", "Skills"); } catch (_) {}
            try { reEngine.syncEnabled(); } catch (_) {}
        };
    }
    try { reEngine.syncEnabled(); } catch (_) {}

    // --- UI EVENT BINDING ---
    // Replaced $(document).on with specific container bindings to support the Event Blocker.
    // We bind to #uie-world-window (if present) and #reality-stage (if present) or fall back to body but with selector context.
    // However, since we want to avoid document bubbling, we MUST bind to the container.
    // Since #uie-world-window is persistent in DOM after init, we can bind to it.

    const $worldWin = $("#uie-world-window");
    $worldWin.off(".uieWorld"); // Clear all namespaced events

    $worldWin.on("click.uieWorld", "#uie-world-gen", async (e) => {
        const now = Date.now();
        if (now - worldGenGateAt < 500) return;
        worldGenGateAt = now;
        e.preventDefault();
        e.stopPropagation();
        const input = String($("#uie-world-input").val() || "").trim();
        if(!input) return;

        const s = getSettings();
        s.worldSimId = input.toUpperCase().substring(0, 15);
        $("#uie-world-id").text(s.worldSimId);
        if (!s.worldState || typeof s.worldState !== "object") s.worldState = {};
        s.worldState.location = input.slice(0, 80);
        saveSettings();
        render();
        try {
            const eng = await ensureRealityV3();
            if (eng) {
                eng.ensureLocationFromWorldState();
                eng.ensureBackgroundOrRequest();
            }
        } catch (_) {}
        try { reEngine.syncEnabled(); } catch (_) {}
    });

    $worldWin.on("click.uieWorld", "#uie-world-update", async (e) => {
        e.stopPropagation();
        const btn = $("#uie-world-update");
        btn.addClass("fa-spin");
        try {
            await scanEverything();
            render();
        } catch(e) {}
        finally { btn.removeClass("fa-spin"); }
    });

    $worldWin.on("click.uieWorld", "#uie-world-projector, #uie-world-toggle-re", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const s2 = getSettings();
        ensureReality(s2);

        // Force enable if it was false
        if (!s2.realityEngine.enabled) {
             s2.realityEngine.enabled = true;
        } else {
             s2.realityEngine.enabled = false;
        }

        saveSettings();
        render();
        
        // SYNC VISIBILITY IMMEDIATELY
        setStageEnabled(s2.realityEngine.enabled);
        
        try { reEngine.syncEnabled(); } catch (_) {}
        
        if (s2.realityEngine.enabled) {
            try { notify("success", "Reality Stage enabled.", "Reality Engine", "api"); } catch (_) {}
        } else {
            try { notify("info", "Reality Stage disabled.", "Reality Engine", "api"); } catch (_) {}
        }
    });

    $worldWin.on("click.uieWorld", "#uie-world-toggle-room", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const s2 = getSettings();
        ensureReality(s2);
        if (s2.realityEngine.comingSoon === true) return;
        s2.realityEngine.view = "room";
        saveSettings();
        try { reEngine.syncEnabled(); } catch (_) {}
    });

    $worldWin.on("click.uieWorld", "#uie-world-toggle-map", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const s2 = getSettings();
        ensureReality(s2);
        if (s2.realityEngine.comingSoon === true) return;
        s2.realityEngine.view = "map";
        if (s2.realityEngine.enabled !== true) s2.realityEngine.enabled = true;
        saveSettings();
        render();
        try { reEngine.syncEnabled(); } catch (_) {}
    });

    $worldWin.on("change.uieWorld", "#uie-world-save-mode", (e) => {
        e.stopPropagation();
        const s2 = getSettings();
        ensureReality(s2);
        const isLocal = $("#uie-world-save-mode").prop("checked") === true;
        s2.realityEngine.saveMode = isLocal ? "local" : "global";
        saveSettings();
        // Trigger state reload
        try { (async () => {
            const { ensureChatStateLoaded } = await import("./core.js");
            ensureChatStateLoaded();
            render();
        })(); } catch (_) {}
    });

    $worldWin.on("change.uieWorld", "#uie-world-hide-quick", (e) => {
        e.stopPropagation();
        const s2 = getSettings();
        ensureReality(s2);
        s2.realityEngine.ui.showQuickButtons = !($("#uie-world-hide-quick").prop("checked") === true);
        saveSettings();
        try { reEngine.syncEnabled(); } catch (_) {}
    });

    $worldWin.on("change.uieWorld", "#uie-world-hide-hud", (e) => {
        e.stopPropagation();
        const s2 = getSettings();
        ensureReality(s2);
        s2.realityEngine.ui.showHud = !($("#uie-world-hide-hud").prop("checked") === true);
        saveSettings();
        try { reEngine.syncEnabled(); } catch (_) {}
    });

    $worldWin.on("change.uieWorld", "#uie-world-show-st-ui", (e) => {
        e.stopPropagation();
        const s2 = getSettings();
        ensureReality(s2);
        s2.realityEngine.ui.hideStUi = !($("#uie-world-show-st-ui").prop("checked") === true);
        saveSettings();
        try { reEngine.syncEnabled(); } catch (_) {}
    });

    $worldWin.on("click.uieWorld", "#uie-world-open-sprites", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
            if (!document.getElementById("uie-sprites-window")) {
                const baseUrl = String(window.UIE_BASEURL || "/scripts/extensions/third-party/universal-immersion-engine/").trim();
                const mod = await import("./templateFetch.js");
                const fetchTemplateHtml = mod?.fetchTemplateHtml;
                if (typeof fetchTemplateHtml === "function") {
                    let html = "";
                    for (const u of [`${baseUrl}src/templates/sprites.html`, `/scripts/extensions/third-party/universal-immersion-engine/src/templates/sprites.html`]) {
                        try { html = await fetchTemplateHtml(u); if (html) break; } catch (_) {}
                    }
                    if (html) $("body").append(html);
                }
            }
            if (window.UIE_forceOpenWindow) window.UIE_forceOpenWindow("#uie-sprites-window", "./sprites.js", "openSprites");
            else {
                const mod = await import("./sprites.js");
                if (mod.openSprites) mod.openSprites();
            }
        } catch (_) {}
    });

    $worldWin.on("click.uieWorld", "#uie-world-open-calendar", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openCalendar();
    });

    // Custom Button Handlers - Bound to document because the modal might be outside the window?
    // #re-quick-modal is appended to body in world.html.
    // So we bind to #re-quick-modal or document.
    // But #re-quick-modal is likely blocked by .uie-window blocker if it has class uie-window?
    // In world.html, it is: <div id="re-quick-modal" ...> (No class uie-window).
    // So document binding is safe for it.
    $(document).off("click.world"); // Clear old
    
    const $quickModal = $("#re-quick-modal");
    $quickModal.off("click.world").on("click.world", "#re-quick-save", (e) => {
        e.preventDefault(); e.stopPropagation();
        const label = $("#re-quick-label").val().trim();
        const icon = $("#re-quick-icon").val().trim();
        const text = $("#re-quick-prompt").val().trim();
        if (!label || !text) return;

        const s = getSettings();
        if (!s.realityEngine.quickButtons) s.realityEngine.quickButtons = [];
        s.realityEngine.quickButtons.push({ label, icon, text, desc: text.slice(0, 50) });
        saveSettings();
        $("#re-quick-modal").hide();
        if (reEngine) reEngine.syncEnabled();
    });

    $quickModal.on("click.world", "#re-quick-cancel", (e) => {
        e.preventDefault(); e.stopPropagation();
        $("#re-quick-modal").hide();
    });
}
