import { generateRaw } from "../../../../../../script.js";
import { getSettings } from "./core.js";
import { getContext } from "../../../../../extensions.js";
import { buildSystemPrompt, consumePendingSystemEvents, validateResponse } from "./logicEnforcer.js";
import { notify } from "./notifications.js";

function ensureConfirmModal() {
    if ($("#uie-ai-confirm").length) return;
    $("body").append(`
        <div id="uie-ai-confirm" style="display:none; position:fixed; inset:0; z-index:2147483647; background:rgba(0,0,0,0.65); align-items:center; justify-content:center;">
            <div style="width:min(560px, 92vw); border-radius:16px; border:1px solid rgba(241,196,15,0.35); background:rgba(15,10,8,0.95); color:#f6e7c8; padding:14px; box-sizing:border-box;">
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
                    <div style="font-weight:900; letter-spacing:0.6px; color:#f1c40f;">Confirm Generation</div>
                    <div style="margin-left:auto; font-size:12px; opacity:0.85;">This may spend credits.</div>
                </div>
                <div style="display:grid; grid-template-columns: 1fr; gap:10px;">
                    <div style="display:flex; gap:10px; flex-wrap:wrap;">
                        <div style="flex:1; min-width:180px; border:1px solid rgba(255,255,255,0.12); border-radius:12px; padding:10px; background:rgba(0,0,0,0.25);">
                            <div style="font-weight:900; opacity:0.85; margin-bottom:4px;">What</div>
                            <div id="uie-ai-confirm-what" style="font-weight:800;"></div>
                        </div>
                        <div style="flex:1; min-width:180px; border:1px solid rgba(255,255,255,0.12); border-radius:12px; padding:10px; background:rgba(0,0,0,0.25);">
                            <div style="font-weight:900; opacity:0.85; margin-bottom:4px;">Provider/Model</div>
                            <div id="uie-ai-confirm-model" style="font-weight:800;"></div>
                        </div>
                    </div>
                    <div style="border:1px solid rgba(255,255,255,0.12); border-radius:12px; padding:10px; background:rgba(0,0,0,0.25);">
                        <div style="font-weight:900; opacity:0.85; margin-bottom:6px;">Preview</div>
                        <div id="uie-ai-confirm-preview" style="font-size:12px; opacity:0.9; white-space:pre-wrap; max-height:160px; overflow:auto;"></div>
                    </div>
                </div>
                <div style="display:flex; gap:10px; margin-top:12px; flex-wrap:wrap;">
                    <button id="uie-ai-confirm-cancel" style="flex:1; min-width:180px; height:40px; border-radius:12px; border:1px solid rgba(255,255,255,0.12); background:rgba(0,0,0,0.25); color:#fff; font-weight:900; cursor:pointer;">Cancel</button>
                    <button id="uie-ai-confirm-go" style="flex:1; min-width:180px; height:40px; border-radius:12px; border:1px solid rgba(241,196,15,0.35); background:rgba(241,196,15,0.18); color:#f1c40f; font-weight:900; cursor:pointer;">Generate</button>
                </div>
            </div>
        </div>
    `);
}

function chatLogCheck() {
    try {
        let raw = "";
        const $txt = $(".chat-msg-txt");
        if ($txt.length) {
            $txt.slice(-20).each(function () { raw += $(this).text() + "\n"; });
            return raw.trim().slice(0, 2600);
        }
        const chatEl = document.querySelector("#chat");
        if (!chatEl) return "";
        const msgs = Array.from(chatEl.querySelectorAll(".mes")).slice(-20);
        for (const m of msgs) {
            const isUser =
                m.classList?.contains("is_user") ||
                m.getAttribute("is_user") === "true" ||
                m.getAttribute("data-is-user") === "true" ||
                m.dataset?.isUser === "true";
            const t =
                m.querySelector(".mes_text")?.textContent ||
                m.querySelector(".mes-text")?.textContent ||
                m.textContent ||
                "";
            raw += `${isUser ? "You" : "Story"}: ${String(t || "").trim()}\n`;
        }
        return raw.trim().slice(0, 2600);
    } catch (_) {
        return "";
    }
}

function loreCheck() {
    try {
        const ctx = getContext?.();
        const maybe = ctx?.world_info || ctx?.lorebook || ctx?.lore || ctx?.worldInfo;
        const keys = [];
        if (Array.isArray(maybe)) {
            for (const it of maybe) {
                const k = it?.key || it?.name || it?.title;
                if (k) keys.push(String(k));
            }
        }
        return Array.from(new Set(keys)).slice(0, 80).join(", ");
    } catch (_) {
        return "";
    }
}

function characterCheck() {
    try {
        const ctx = getContext?.();
        const out = {
            user: ctx?.name1,
            character: ctx?.name2,
            chatId: ctx?.chatId,
            characterId: ctx?.characterId,
            groupId: ctx?.groupId
        };
        return JSON.stringify(out);
    } catch (_) {
        return "{}";
    }
}

function userCheck() {
    try {
        const ctx = getContext?.();
        return String(ctx?.name1 || "You");
    } catch (_) {
        return "You";
    }
}

function inventoryAudit() {
    try {
        const s = getSettings();
        const inv = s?.inventory || {};
        const items = Array.isArray(inv.items) ? inv.items : [];
        const equipped = Array.isArray(inv.equipped) ? inv.equipped : [];
        const lines = [];
        lines.push(`[Inventory_Items_Count = ${items.length}]`);
        lines.push(`[Inventory_Equipped_Count = ${equipped.length}]`);
        const tail = items.slice(0, 60).map(it => {
            const name = String(it?.name || "Item").slice(0, 60);
            const qty = it?.qty !== undefined ? Number(it.qty) : "";
            const type = String(it?.type || it?.slotCategory || "").slice(0, 30);
            const fx = Array.isArray(it?.statusEffects) ? it.statusEffects.slice(0, 4).join(", ") : "";
            return `- ${name}${qty !== "" ? ` x${qty}` : ""}${type ? ` [Type=${type}]` : ""}${fx ? ` [Effects=${fx}]` : ""}`;
        });
        lines.push(...tail);
        if (equipped.length) {
            lines.push(`---`);
            equipped.slice(0, 30).forEach(e => {
                const slot = String(e?.slotId || "").slice(0, 30);
                const name = String(e?.name || "Equipped").slice(0, 60);
                lines.push(`- [Slot=${slot}] ${name}`);
            });
        }
        return lines.join("\n").slice(0, 3800);
    } catch (_) {
        return "";
    }
}

function temporalAnchor() {
    try {
        const s = getSettings();
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "local";
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, "0");
        const d = String(now.getDate()).padStart(2, "0");
        const todayKey = `${y}-${m}-${d}`;
        const events = s?.calendar?.events && typeof s.calendar.events === "object" ? s.calendar.events[todayKey] : null;
        const ev = Array.isArray(events) ? events.slice(0, 8).map(e => `- ${String(e?.title || "Event").slice(0, 80)}`) : [];
        return [
            `[Timezone = ${tz}]`,
            `[Local_Time = ${now.toLocaleString()}]`,
            `[Calendar_Today = ${todayKey}]`,
            ev.length ? `[Calendar_Events_Today]` : `[Calendar_Events_Today = None]`,
            ...ev
        ].join("\n");
    } catch (_) {
        return "";
    }
}

function digitalStateCheck() {
    try {
        const s = getSettings();
        const phoneActive = $("#uie-phone-window").is(":visible");
        const unread = Number(s?.phone?.unreadCount || 0);
        const newSms = unread > 0;
        return [
            `[Phone_Active = ${phoneActive ? "True" : "False"}]`,
            `[New_SMS_Detected = ${newSms ? "True" : "False"}]`,
            newSms ? `[Unread_SMS_Count = ${unread}]` : `[Unread_SMS_Count = 0]`
        ].join("\n");
    } catch (_) {
        return `[Phone_Active = False]\n[New_SMS_Detected = False]\n[Unread_SMS_Count = 0]`;
    }
}

function retrieveMemories(seedText) {
    try {
        const s = getSettings();
        const db = Array.isArray(s?.databank) ? s.databank : [];
        if (!db.length) return "";

        const blob = String(seedText || "").toLowerCase();
        const words = Array.from(new Set(blob.split(/[^a-z0-9]+/g).filter(w => w.length >= 5))).slice(0, 18);
        if (!words.length) return "";

        const scored = db.map(m => {
            const t = `${String(m?.title || "")} ${String(m?.summary || "")}`.toLowerCase();
            let score = 0;
            for (const w of words) if (t.includes(w)) score++;
            return { m, score };
        }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);

        if (!scored.length) return "";
        return scored.map(x => `- ${String(x.m?.title || "Memory").slice(0, 80)}: ${String(x.m?.summary || "").slice(0, 240)}`).join("\n");
    } catch (_) {
        return "";
    }
}

function rootProtocolBlock(seedText) {
    const chat = chatLogCheck();
    const lore = loreCheck();
    const who = userCheck();
    const char = characterCheck();
    const inv = inventoryAudit();
    const digital = digitalStateCheck();
    const temporal = temporalAnchor();
    const mem = retrieveMemories(`${seedText}\n${chat}`);
    return `
[SYSTEM OVERRIDE: IMMERSION_PROTOCOL_V26]
[CRITICAL PRIORITY: HIGHEST]

/// EXECUTION MANDATE ///
Before generating output, the AI MUST execute the following Reality Check sequence.
Failure to connect these data points is a system failure.

1) CHAT LOG SYNC (MANDATORY)
Scan the last 20 messages.
Current action MUST flow logically from recent events.
Do not reset the scene.
--- CHAT LOG (last messages) ---
${chat}

2) INVENTORY AUDIT
Scan user's current inventory. If user attempts to use an unowned item -> NARRATE FAILURE.
If user uses an item -> describe it based on its properties/tags.
--- INVENTORY ---
${inv}

3) DIGITAL STATE CHECK (Conditional)
${digital}

4) TEMPORAL ANCHOR
${temporal}

5) LOREBOOK INDEX (Names Only)
[Lore_Keys = ${lore}]

6) IDENTITIES (Hard Facts)
[User = ${who}]
[Character_Context = ${char}]

7) ARCHIVE RETRIEVAL
Integrate any injected memories as absolute facts.
${mem ? `--- INJECTED MEMORIES ---\n${mem}` : `[INJECTED MEMORIES = None]`}
`.trim();
}

async function confirmAICall({ what, providerModel, preview }) {
    ensureConfirmModal();
    $("#uie-ai-confirm-what").text(String(what || "Generation"));
    $("#uie-ai-confirm-model").text(String(providerModel || "Unknown"));
    $("#uie-ai-confirm-preview").text(String(preview || ""));

    return await new Promise((resolve) => {
        const $m = $("#uie-ai-confirm");
        const cancel = () => {
            cleanup();
            resolve(false);
        };
        const go = () => {
            cleanup();
            resolve(true);
        };
        const cleanup = () => {
            $(document).off("keydown.uieAiConfirm");
            $("#uie-ai-confirm-cancel").off("click.uieAiConfirm");
            $("#uie-ai-confirm-go").off("click.uieAiConfirm");
            $m.hide();
        };

        $("#uie-ai-confirm-cancel").off("click.uieAiConfirm").on("click.uieAiConfirm", cancel);
        $("#uie-ai-confirm-go").off("click.uieAiConfirm").on("click.uieAiConfirm", go);
        $(document).off("keydown.uieAiConfirm").on("keydown.uieAiConfirm", (e) => {
            if (e.key === "Escape") cancel();
        });

        $m.css("display", "flex");
        setTimeout(() => $("#uie-ai-confirm-cancel").trigger("focus"), 0);
    });
}

async function generateTurbo(prompt, systemPrompt) {
    const s = getSettings();
    const t = s.turbo || {};
    
    const rawUrl = String(t.url || "").trim();
    const rawKey = String(t.key || "").trim();
    if (!rawUrl) return null;
    const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(rawUrl);
    if (!rawKey && !isLocal) return null;

    const normalizeTurboUrl = (u) => {
        const raw = String(u || "").trim();
        if (!raw) return "";
        const m = raw.match(/^([^?#]+)([?#].*)?$/);
        let base = String(m?.[1] || raw).trim().replace(/\/+$/g, "");
        const suffix = String(m?.[2] || "");

        if (/\/v1$/i.test(base)) return `${base}/chat/completions${suffix}`;
        if (/\/chat$/i.test(base)) return `${base}/completions${suffix}`;
        if (/\/completions$/i.test(base) && !/\/chat\/completions$/i.test(base)) return `${base.replace(/\/completions$/i, "")}/chat/completions${suffix}`;
        if (/\/chat\/completions$/i.test(base)) return `${base}${suffix}`;

        if (base.endsWith("/")) base = base.slice(0, -1);
        return `${base}/v1/chat/completions${suffix}`;
    };

    const url = normalizeTurboUrl(rawUrl);
    if (!url) return null;

    try {
        const headers = { 
            "Content-Type": "application/json",
            "Accept": "application/json",
            "HTTP-Referer": "https://github.com/SillyTavern/SillyTavern",
            "X-Title": "UIE"
        };
        if (rawKey) headers.Authorization = `Bearer ${rawKey}`;
        const response = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify({ 
                model: String(t.model || "google/gemini-2.0-flash-exp"), 
                messages: [
                    ...(systemPrompt ? [{ role: "system", content: String(systemPrompt) }] : []),
                    { role: "user", content: String(prompt || "") }
                ],
                temperature: 0.5, 
                max_tokens: 1000,
                stream: false
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`API Error ${response.status}: ${String(errText || "").slice(0, 240)}`);
        }

        const data = await response.json();
        if (!data.choices || !data.choices[0]) throw new Error("Invalid API Response");
        return data.choices[0].message.content;

    } catch (e) { 
        try { console.warn("[UIE] Turbo request failed:", e); } catch (_) {}
        return null; 
    }
}

export async function generateContent(prompt, type) {
    const s = getSettings();
    const useTurbo = s.turbo && s.turbo.enabled;

    if (type === "Logic" || type === "JSON") type = "System Check";

    const displayType = type === "System Check" ? "System Check" : (type === "Shop" ? "Gathering list!" : type);

    const customSystem = String(s?.generation?.customSystemPrompt || "").trim();
    const logicSystem = String(buildSystemPrompt ? buildSystemPrompt() : "").trim();

    let system = "";
    if(type === "Webpage") system = "You are a UI Engine. Output ONLY raw valid HTML code. Start immediately with <style> or <div class='app-container'>. Do not include markdown ``` blocks. Do not write conversational text.";
    if(type === "System Check" || type === "Shop") system = "You are a Logic Engine. Output ONLY valid JSON.";
    if(type === "Phone Call") system = "You are speaking on a phone call. Output ONLY the words spoken (dialogue only). No narration, no actions, no stage directions, no quotes, no markdown, one short line.";
    system = [customSystem, logicSystem, system].filter(Boolean).join("\n\n");

    const providerModel = useTurbo
        ? `Turbo: ${String((s.turbo && s.turbo.model) || "unknown")}`
        : "Main API";

    const rawBase = String(prompt || "").trim();
    const lockedPrompt = /^\[UIE_LOCKED\]/i.test(rawBase);
    const base = rawBase.replace(/^\[UIE_LOCKED\]\s*/i, "").trim();
    const prefixes = (() => {
        try {
            const typeKey = String(type || "").trim();
            if (lockedPrompt) return "";
            if (typeKey === "Creating World" || typeKey === "Map" || typeKey === "Map Names") return "";
            const p = s?.generation?.promptPrefixes || {};
            const global = String(p?.global || "").trim();
            const by = (p?.byType && typeof p.byType === "object") ? p.byType : {};
            const def = String(by?.default || "").trim();
            let typed = String(by?.[typeKey] || "").trim();
            if (!typed && typeKey === "Shop") typed = String(by?.["System Check"] || "").trim();
            const combined = [global, def, typed].filter(Boolean).join("\n\n").trim();
            if (!combined) return "";
            return `UIE CUSTOM PROMPT:\n${combined}\n\n---\n\n`;
        } catch (_) {
            return "";
        }
    })();
    const pending = String(consumePendingSystemEvents ? consumePendingSystemEvents() : "").trim();
    const baseWithCustom = `${prefixes}${base}`.trim();
    const finalPrompt = `${rootProtocolBlock(baseWithCustom)}\n\n${baseWithCustom}${pending ? `\n\n[SYSTEM EVENT]\n${pending}` : ""}`.slice(0, 12000);

    if (s.generation?.aiConfirm) {
        const ok = await confirmAICall({
            what: displayType || "Generation",
            providerModel,
            preview: String(finalPrompt || "").slice(0, 900)
        });
        if (!ok) return null;
    }

    notify("info", useTurbo ? `⚡ ${displayType}` : `📝 ${displayType}`, undefined, "api");

    let out = null;
    if (useTurbo) {
        const ctxBlock = (() => {
            try {
                const chatEl = document.querySelector("#chat");
                if (!chatEl) return "";
                const msgs = Array.from(chatEl.querySelectorAll(".mes")).slice(-18);
                let ctx = "";
                for (const m of msgs) {
                    const isUser =
                        m.classList?.contains("is_user") ||
                        m.getAttribute("is_user") === "true" ||
                        m.getAttribute("data-is-user") === "true" ||
                        m.dataset?.isUser === "true";
                    const t =
                        m.querySelector(".mes_text")?.textContent ||
                        m.querySelector(".mes-text")?.textContent ||
                        m.textContent ||
                        "";
                    const line = `${isUser ? "You" : "Story"}: ${String(t || "").trim()}`;
                    if (!line.trim()) continue;
                    ctx += line.slice(0, 420) + "\n";
                }
                ctx = ctx.trim();
                return ctx ? `[CHAT CONTEXT]\n${ctx}` : "";
            } catch (_) {
                return "";
            }
        })();
        const turboPrompt = ctxBlock ? `${ctxBlock}\n\n${finalPrompt}` : finalPrompt;
        out = await generateTurbo(turboPrompt, system);
    }
    if (!out) {
        try {
            if (useTurbo) {
                notify("error", "Turbo failed — main API fallback disabled.", "UIE", "api");
                return null;
            }
            out = await generateRaw({ prompt: `${system}\n\n${finalPrompt}`, quietToLoud: false, skip_w_info: true });
        } catch (e) { return null; }
    }
    if (!out) return null;
    try {
        const vr = validateResponse ? validateResponse(out) : null;
        const issues = Array.isArray(vr?.issues) ? vr.issues : [];
        if (issues.length) console.warn("[UIE] LogicEnforcer issues:", issues);
        return String(vr?.text ?? out);
    } catch (_) {
        return out;
    }
}

export function cleanOutput(text) {
    if (!text) return "";
    return text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
}

/* UIE turbo switch (extension-only) */
function uieTurboEnabled() {
  try {
    const st = window?.UIE?.getSettings?.() || null;
    if (!st) return false;
    return !!(st.uieTurbo && st.uieTurbo.enabled && st.uieTurbo.key);
  } catch (_) {
    return false;
  }
}
