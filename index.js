const EXT_ID = "universal-immersion-engine";
const basePathFallback = `scripts/extensions/third-party/${EXT_ID}`;
const baseUrl = (() => {
    try {
        const u = new URL(".", import.meta.url);
        return u.href.endsWith("/") ? u.href : `${u.href}/`;
    } catch (_) {
        const p = basePathFallback.startsWith("/") ? basePathFallback : `/${basePathFallback}`;
        return `${p}/`;
    }
})();
try {
    window.UIE_BASEURL = baseUrl;
    window.UIE_BASEPATH = baseUrl.replace(location.origin, "").replace(/\/$/, "");
} catch (_) {}

jQuery(async () => {
    try {
        if (window.UIE_DEBUG === true) console.log("[UIE] Initializing (Import Only Mode)...", { url: import.meta.url, baseUrl });
    } catch (_) {}

    const markInitError = (stage, e) => {
        try {
            window.UIE_lastInitError = {
                stage,
                message: String(e?.message || e || "Unknown error"),
                stack: String(e?.stack || ""),
                at: Date.now(),
                baseUrl,
                url: import.meta.url
            };
        } catch (_) {}
        try { window.toastr?.error?.(`UIE init failed (${stage}). Open console for details.`); } catch (_) {}
    };

    const safeImport = async (path, initFn, required = false) => {
        try {
            const m = await import(path);
            const fn = initFn ? m?.[initFn] : null;
            if (typeof fn === "function") await fn();
            return true;
        } catch (e) {
            console.error(`[UIE] Module failed: ${path}${initFn ? ` (${initFn})` : ""}`, e);
            try { window.toastr?.error?.(`UIE module failed: ${path.split("/").pop()}`); } catch (_) {}
            if (required) throw e;
            return false;
        }
    };

    // 1. Styles
    $("<link>").attr({rel: "stylesheet", type: "text/css", href: `${baseUrl}style.css?v=${Date.now()}`}).appendTo("head");
    
    // 2. Cleanup Old Elements
    $("#uie-launcher, #uie-main-menu, .uie-window, .uie-book-overlay, .uie-phone").remove();

    // 3. Import Core & Startup
    try {
        const Core = await import("./src/modules/core.js");
        const sleep = (ms) => new Promise(r => setTimeout(r, Math.max(0, ms | 0)));
        const ensureSanitized = async () => {
            let lastErr = null;
            for (let i = 0; i < 80; i++) {
                try {
                    Core.sanitizeSettings();
                    return true;
                } catch (e) {
                    lastErr = e;
                    const msg = String(e?.message || e || "");
                    const looksLikeSettingsNotReady =
                        msg.includes("universal-immersion-engine") ||
                        msg.toLowerCase().includes("extension_settings") ||
                        msg.toLowerCase().includes("cannot read properties of undefined");
                    if (!looksLikeSettingsNotReady) throw e;
                    await sleep(75);
                }
            }
            throw lastErr || new Error("sanitizeSettings failed");
        };
        await ensureSanitized();
        try { (await import("./src/modules/stateSubscriptions.js")).initStateSubscriptions?.(); } catch (_) {}
        
        const Startup = await import("./src/modules/startup.js");
        Startup.patchToastr();
        try {
            await Startup.loadTemplates();
        } catch (e) {
            markInitError("templates", e);
            throw e;
        }
        try {
            const ok = $("#uie-inventory-window").length > 0;
            if (!ok) {
                console.error("[UIE] Templates loaded but inventory window missing. BaseUrl likely wrong.", { baseUrl });
                window.alert?.("[UIE] Inventory template did not load. Check console for baseUrl/template errors.");
                throw new Error("Inventory template missing after loadTemplates()");
            }
        } catch (_) {}
        Startup.injectSettingsUI();
        
        // 4. Load Features (Modules)
        // These modules should self-initialize their event listeners
        await safeImport("./src/modules/dragging.js", "initDragging", true);
        await safeImport("./src/modules/interaction.js", "initInteractions", true);
        await safeImport("./src/modules/inventory.js", "initInventory", true);
        await safeImport("./src/modules/diary.js", "initDiary", false);
        await safeImport("./src/modules/diagnostics.js", "initDiagnostics", false);
        await safeImport("./src/modules/calendar.js", "initCalendar", false);
        await safeImport("./src/modules/databank.js", "initDatabank", false);
        await safeImport("./src/modules/battle.js", "initBattle", false);
        await safeImport("./src/modules/map.js", "initMap", false);
        await safeImport("./src/modules/party.js", "initParty", false);
        await safeImport("./src/modules/social.js", "initSocial", false);
        await safeImport("./src/modules/world.js", "initWorld", false);
        await safeImport("./src/modules/chatbox.js", "initChatbox", false);
        await safeImport("./src/modules/sprites.js", "initSprites", false);
        
        // Phone placeholder
        await safeImport("./src/modules/phone.js", "initPhone", false);

        // 5. Finalize
        Core.updateLayout();
        console.log("[UIE] Ready.");
        
    } catch (e) {
        console.error("[UIE] Critical Initialization Error:", e);
        markInitError("critical", e);
    }
});
