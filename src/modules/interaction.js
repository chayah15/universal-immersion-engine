
import { getSettings, saveSettings, updateLayout } from "./core.js";
import { injectRpEvent } from "./features/rp_log.js";
import { notify } from "./notifications.js";

// --- SCAVENGE & INTERACTION MODULE ---

export function initInteractions() {
    initScavenge();
    initSpriteInteraction();
    initLauncher();
}

function initLauncher() {
    const btn = document.getElementById("uie-launcher");
    if (!btn) return;

    // Block Context Menu (Right Click) to prevent ST Menu interference
    $(btn).off("contextmenu.uieLauncher").on("contextmenu.uieLauncher", function(e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
    });

    // Block Mousedown/Pointerdown propagation to prevent ST from hijacking the drag
    // But allow default so dragging.js can handle it (dragging.js attaches directly)
    $(btn).off("mousedown.uieLauncher pointerdown.uieLauncher").on("mousedown.uieLauncher pointerdown.uieLauncher", function(e) {
        e.stopPropagation();
        e.stopImmediatePropagation();
    });

    // Remove old listener if any
    $(btn).off("click.uieLauncher").on("click.uieLauncher", function(e) {
        // dragging.js handles capture phase stopImmediatePropagation if dragged
        // If we get here, it's a click
        e.preventDefault();
        e.stopPropagation();

        const menu = $("#uie-main-menu");
        if (!menu.length) return;

        if (menu.is(":visible")) {
            menu.hide();
        } else {
            menu.show();
            // Ensure proper Z-index
            menu.css("z-index", "2147483650");

            // Position next to the launcher each time
            try {
                const btnRect = btn.getBoundingClientRect();
                const menuRect = menu[0].getBoundingClientRect();
                menu.css({ position: "fixed", transform: "none" });
                menu.css({ left: btnRect.right + 8, top: btnRect.top });

                // Keep on screen (clamp to viewport)
                let left = parseFloat(menu.css("left")) || 0;
                let top = parseFloat(menu.css("top")) || 0;
                if (left + menuRect.width > window.innerWidth - 10) {
                    left = btnRect.left - menuRect.width - 8;
                }
                if (top + menuRect.height > window.innerHeight - 10) {
                    top = window.innerHeight - menuRect.height - 10;
                }
                if (top < 10) top = 10;
                if (left < 10) left = 10;
                menu.css({ left, top });
            } catch (_) {
                // Fallback to center if positioning fails
                menu.css({ top: "50%", left: "50%", transform: "translate(-50%, -50%)" });
            }
        }
    });

    // Also init Menu Tabs here since it's menu related?
    // Or maybe separate initMenu()? For now, let's stick to launcher.
    initMenuTabs();
    initMenuButtons();
    initGenericHandlers();
}

function initGenericHandlers() {
    // Generic Close Button for any UIE Window
    // Added pointerup for better responsiveness
    // COMPREHENSIVE LIST OF CLOSE BUTTONS
    const selectors = [
        ".uie-close-btn", ".uie-inv-close", ".uie-window-close", ".uie-p-close",
        "#uie-world-close", "#re-forge-close",
        "#uie-party-close", "#uie-party-member-close",
        "#cal-modal-close", "#cal-rp-modal-close", ".uie-sim-close",
        "#uie-social-close", "#books-reader-close", "#uie-phone-sticker-close",
        "#uie-sprites-close", "#uie-map-card-close", ".uie-sticker-close",
        "#uie-chatbox-close", "#uie-chatbox-options-close",
        ".uie-rpg-close", ".uie-create-close", "#uie-inv-editor-close", "#uie-fx-close",
        "#life-create-close", "#life-edit-close", "#life-template-close",
        "#uie-k-pick-close", "#uie-item-modal-close", "#uie-battle-close",
        "#uie-launcher-opt-close",
        "#uie-create-overlay-exit", "#uie-kitchen-exit", "#life-create-cancel",
        "#uie-diary-close"
    ].join(", ");

    let lastPointerTime = 0;
    // SCOPED FIX: Use body instead of document to catch events before they hit the document-level blocker
    $("body").off("click.uieGenericClose pointerup.uieGenericClose", selectors).on("click.uieGenericClose pointerup.uieGenericClose", selectors, function(e) {
        // Mobile Double-Click Fix: De-dup pointerup vs click
        if (e.type === "pointerup") {
            lastPointerTime = Date.now();
        } else if (e.type === "click" && Date.now() - lastPointerTime < 300) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        e.preventDefault();
        e.stopPropagation();
        const win = $(this).closest(".uie-window");
        if (win.length) {
            // Some templates had display:flex !important; enforce hide
            try { win[0].style.setProperty("display", "none", "important"); } catch (_) { win.hide(); }
        } else {
            // Fallback for overlays that might not be .uie-window
            // Added .uie-book-overlay for Diary
            const parent = $(this).closest(".uie-overlay, .uie-modal, #uie-inventory-window, .uie-full-modal, .uie-book-overlay, #uie-diary-window");
            if (parent.length) {
                try { parent[0].style.setProperty("display", "none", "important"); } catch (_) { parent.hide(); }
            }
            // Also handle specific parents if closest fails
            if (this.id === "re-forge-close") $("#re-forge-modal").hide();
            if (this.id === "uie-map-card-close") $("#uie-map-card").hide();
        }
    });

    // Explicit close for stats/activities buttons to override any inline display rules
    $("body").off("click.uieForceCloseStats pointerup.uieForceCloseStats", ".uie-rpg-close, .uie-sim-close").on("click.uieForceCloseStats pointerup.uieForceCloseStats", ".uie-rpg-close, .uie-sim-close", function(e) {
        e.preventDefault();
        e.stopPropagation();
        const win = $(this).closest(".uie-window");
        if (win.length) {
            try { win[0].style.setProperty("display", "none", "important"); } catch (_) { win.hide(); }
        }
    });
}

function openWindow(selector) {
    const win = $(selector);
    if (!win.length) return;
    const isMobile = (() => {
        try { return window.matchMedia("(max-width: 768px), (pointer: coarse)").matches; } catch (_) { return window.innerWidth < 768; }
    })();
    const isInventory = win.is("#uie-inventory-window");

    // Hide other UIE windows
    try {
        document.querySelectorAll(".uie-window").forEach(el => {
            try { el.style.setProperty("display", "none", "important"); } catch (_) {}
        });
    } catch (_) {
        $(".uie-window").hide();
    }

    // Show this window
    try { win[0].style.setProperty("display", "flex", "important"); } catch (_) { win.show(); }
    
    // Dynamic Z-Index Handling: Bring to front
    const isVisibleEl = (el) => {
        try {
            const st = getComputedStyle(el);
            return st.display !== "none" && st.visibility !== "hidden" && st.opacity !== "0";
        } catch (_) {
            return false;
        }
    };
    const visibleWins = Array.from(document.querySelectorAll(".uie-window")).filter(isVisibleEl);
    const highestZ = Math.max(2147483650, ...visibleWins.map(el => Number(getComputedStyle(el).zIndex) || 0));
    
    win.css("z-index", highestZ + 1);
    
    // Ensure it's a direct child of body to avoid stacking context traps
    if (win[0].parentElement !== document.body) {
        document.body.appendChild(win[0]);
    }
    
    try { win[0].style.setProperty("display", "flex", "important"); } catch (_) { win.css("display", "flex"); } // Most windows use flex

    // Mobile: do not force position; allow drag anywhere
    if (isMobile && !isInventory) {
        try {
            win[0].style.setProperty("position", "fixed", "important");
            win[0].style.setProperty("max-width", "94vw", "important");
            win[0].style.setProperty("max-height", "90vh", "important");
        } catch (_) {}
    }
    
    // Ensure on-screen (Center if off-screen)
    const rect = win[0].getBoundingClientRect();
    if (rect.top < 0 || rect.left < 0 || rect.bottom > window.innerHeight || rect.right > window.innerWidth) {
        win.css({ 
            top: "50%", 
            left: "50%", 
            transform: "translate(-50%, -50%)",
            position: "fixed" 
        });
    }

    // Close main menu
    $("#uie-main-menu").hide();
}

function initWindowLayering() {
    // Bring window to front on click
    $("body").off("mousedown.uieWindowLayering pointerdown.uieWindowLayering").on("mousedown.uieWindowLayering pointerdown.uieWindowLayering", ".uie-window", function() {
        const isVisibleEl = (el) => {
            try {
                const st = getComputedStyle(el);
                return st.display !== "none" && st.visibility !== "hidden" && st.opacity !== "0";
            } catch (_) {
                return false;
            }
        };
        const visibleWins = Array.from(document.querySelectorAll(".uie-window")).filter(isVisibleEl);
        const highestZ = Math.max(2147483650, ...visibleWins.map(el => Number(getComputedStyle(el).zIndex) || 0));
        
        const current = Number($(this).css("z-index")) || 0;
        const isPhone = $(this).is("#uie-phone-window");
        
        // Phone always wins
        if (isPhone) {
            $(this).css("z-index", 2147483670);
        } else if (current <= highestZ) {
            // Standard window
            $(this).css("z-index", highestZ + 1);
        }
    });
}

function initMenuButtons() {
    initWindowLayering();
    const $menu = $("#uie-main-menu");

    async function ensureWindowTemplate(windowId, templateFile) {
        if (document.getElementById(windowId)) return true;
        try {
            const baseUrl = String(window.UIE_BASEURL || "/scripts/extensions/third-party/universal-immersion-engine/").trim();
            const mod = await import("./templateFetch.js");
            const fetchTemplateHtml = mod?.fetchTemplateHtml;
            if (typeof fetchTemplateHtml !== "function") return false;
            const urls = [
                `${baseUrl}src/templates/${templateFile}`,
                `/scripts/extensions/third-party/universal-immersion-engine/src/templates/${templateFile}`,
            ];
            let html = "";
            for (const u of urls) {
                try { html = await fetchTemplateHtml(u); if (html) break; } catch (_) {}
            }
            if (!html) return false;
            $("body").append(html);
            return !!document.getElementById(windowId);
        } catch (_) {
            return false;
        }
    }
    
    // Inventory
    $menu.off("click.uieMenuInv").on("click.uieMenuInv", "#uie-btn-inventory", function() {
        openWindow("#uie-inventory-window");
        // Ensure items tab is active by default if not set
        const root = document.getElementById("uie-inventory-window");
        if (root && !root.dataset.activeTab) {
             $("#uie-inventory-window #tabs [data-tab='items']").trigger("click");
        }
    });

    // Shop
    $menu.off("click.uieMenuShop").on("click.uieMenuShop", "#uie-btn-shop", async function() {
        openWindow("#uie-shop-window");
        try { (await import("./shop.js")).initShop?.(); } catch (_) {}
    });

    // Journal
    $menu.off("click.uieMenuJournal").on("click.uieMenuJournal", "#uie-btn-journal", async function() {
        openWindow("#uie-journal-window");
        try { (await import("./journal.js")).initJournal?.(); } catch (_) {}
    });

    // Party
    $menu.off("click.uieMenuParty").on("click.uieMenuParty", "#uie-btn-party", async function() {
        openWindow("#uie-party-window");
        try { (await import("./party.js")).initParty?.(); } catch (_) {}
    });

    // Diary
    $menu.off("click.uieMenuDiary").on("click.uieMenuDiary", "#uie-btn-diary", async function() {
        openWindow("#uie-diary-window");
        try { (await import("./diary.js")).initDiary?.(); } catch (_) {}
    });

    // Social
    $menu.off("click.uieMenuSocial").on("click.uieMenuSocial", "#uie-btn-social", async function() {
        openWindow("#uie-social-window");
        try { (await import("./social.js")).initSocial?.(); } catch (_) {}
    });

    // Stats (Might be inventory tab or separate)
    $menu.off("click.uieMenuStats").on("click.uieMenuStats", "#uie-btn-stats", async function() {
        await ensureWindowTemplate("uie-stats-window", "stats.html");
        openWindow("#uie-stats-window");
        try { (await import("./features/stats.js")).initStats?.(); } catch (_) {}
        try { (await import("./features/stats.js")).renderStats?.(); } catch (_) {}
    });

    // Activities
    $menu.off("click.uieMenuActivities").on("click.uieMenuActivities", "#uie-btn-activities", async function() {
        await ensureWindowTemplate("uie-activities-window", "activities.html");
        openWindow("#uie-activities-window");
        try { (await import("./features/activities.js")).initActivities?.(); } catch (_) {}
        try { (await import("./features/activities.js")).render?.(); } catch (_) {}
    });

    // Phone
    $menu.off("click.uieMenuPhone").on("click.uieMenuPhone", "#uie-btn-open-phone", async function() {
        // Phone usually has its own toggle
        try { 
            const mod = await import("./phone.js");
            if (mod.initPhone) mod.initPhone(); // Ensure logic is bound and visuals loaded
            mod.togglePhone?.(); 
        } catch (e) { console.error("Phone load error:", e); }
        $("#uie-main-menu").hide();
    });

    // Map
    $menu.off("click.uieMenuMap").on("click.uieMenuMap", "#uie-btn-open-map", async function() {
        openWindow("#uie-map-window");
        try { (await import("./map.js")).initMap?.(); } catch (_) {}
    });

    // World
    $menu.off("click.uieMenuWorld").on("click.uieMenuWorld", "#uie-btn-open-world", async function() {
        openWindow("#uie-world-window");
        try { (await import("./world.js")).initWorld?.(); } catch (e) { console.error(e); }
    });

    // Calendar
    $menu.off("click.uieMenuCalendar").on("click.uieMenuCalendar", "#uie-btn-open-calendar", async function() {
        openWindow("#uie-calendar-window");
        try { (await import("./calendar.js")).initCalendar?.(); } catch (_) {}
    });

    // Databank
    $menu.off("click.uieMenuDatabank").on("click.uieMenuDatabank", "#uie-btn-databank", async function() {
        openWindow("#uie-databank-window");
        try { (await import("./databank.js")).initDatabank?.(); } catch (_) {}
    });

    // Battle
    $menu.off("click.uieMenuBattle").on("click.uieMenuBattle", "#uie-btn-battle", async function() {
        openWindow("#uie-battle-window");
        try { (await import("./battle.js")).initBattle?.(); } catch (_) {}
    });

    // Settings
    $menu.off("click.uieMenuSettings").on("click.uieMenuSettings", "#uie-btn-open-settings", function() {
        openWindow("#uie-settings-window");
    });

    // Debug
    $menu.off("click.uieMenuDebug").on("click.uieMenuDebug", "#uie-btn-debug", async function() {
        openWindow("#uie-debug-window");
        try { (await import("./diagnostics.js")).initDiagnostics?.(); } catch (_) {}
    });

    // Help
    $menu.off("click.uieMenuHelp").on("click.uieMenuHelp", "#uie-btn-help", function() {
        window.open("https://github.com/SillyTavern/SillyTavern/blob/release/public/scripts/extensions/third-party/universal-immersion-engine-main/README.md", "_blank");
    });

    // Chatbox (Reality Engine Projection)
    $menu.off("click.uieMenuChatbox").on("click.uieMenuChatbox", "#uie-btn-chatbox", async function() {
        const win = $("#uie-chatbox-window");
        if (win.length) {
            win.show();
            win.css("z-index", "2147483655");
            try { (await import("./chatbox.js")).openChatbox?.(); } catch (_) {}
            $("#uie-main-menu").hide();
        } else {
             try { (await import("./chatbox.js")).openChatbox?.(); } catch (_) {}
             $("#uie-main-menu").hide();
        }
    });
}

function initMenuTabs() {
    const $menu = $("#uie-main-menu");
    $menu.off("click.uieMenuTabs").on("click.uieMenuTabs", ".uie-menu-tab", function() {
        const tab = $(this).data("tab");
        const target = $("#uie-tab-" + tab);
        if (!target.length) return;

        $(".uie-menu-tab").removeClass("active").css("border-bottom-color", "transparent");
        $(this).addClass("active").css("border-bottom-color", "#f1c40f");

        $(".uie-menu-page").hide();
        target.show();
    });

    // Menu Buttons - Delegate
    // We can add the specific open handlers here or let the specific modules handle them.
    // Ideally, specific modules should bind their buttons.
    // But basic "Close" or similar?
}

export function initScavenge() {
    // Scavenge logic initialized
    // Button injection removed as per user request ("remove quick buttons")
}

export function spawnScavengeNodes() {
    let bg = document.getElementById("re-bg");
    if (!bg) {
        // Fallback to body if re-bg (Reality Engine) is not present
        bg = document.body;
    }

    // Clear existing
    document.querySelectorAll(".div-sparkle").forEach(e => e.remove());

    const count = 3 + Math.floor(Math.random() * 3); // 3-5 nodes
    for (let i = 0; i < count; i++) {
        const sparkle = document.createElement("div");
        sparkle.className = "div-sparkle";

        // Random Position
        const top = 20 + Math.random() * 60; // Keep somewhat central
        const left = 10 + Math.random() * 80;

        sparkle.style.cssText = `
            position: fixed;
            top: ${top}%;
            left: ${left}%;
            width: 30px;
            height: 30px;
            background: radial-gradient(circle, #ffd700 0%, transparent 70%);
            border-radius: 50%;
            cursor: pointer;
            z-index: 2147483661;
            animation: pulse-gold 1.5s infinite;
        `;

        sparkle.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            sparkle.remove();

            // Ding Sound
            const audio = new Audio("/scripts/extensions/third-party/universal-immersion-engine-main/assets/audio/ding.mp3");
            audio.volume = 0.5;
            audio.play().catch(()=>{});

            // Loot Logic
            handleLoot();
        };

        bg.appendChild(sparkle);
    }


    // Inject animation style if not exists
    if (!document.getElementById("re-sparkle-style")) {
        const style = document.createElement("style");
        style.id = "re-sparkle-style";
        style.textContent = `
            @keyframes pulse-gold {
                0% { transform: scale(0.8); opacity: 0.6; box-shadow: 0 0 5px #ffd700; }
                50% { transform: scale(1.2); opacity: 1; box-shadow: 0 0 15px #ffd700; }
                100% { transform: scale(0.8); opacity: 0.6; box-shadow: 0 0 5px #ffd700; }
            }
        `;
        document.head.appendChild(style);
    }
    
    // Smart Context Notification
    const s = getSettings();
    const loc = s.worldState?.location || "Unknown";
    notify("info", `Searching ${loc}...`, "Scavenge");
    
    setTimeout(() => {
        document.querySelectorAll(".div-sparkle").forEach(e => e.remove());
    }, 8000);
}

async function handleLoot() {
    const s = getSettings();
    const loc = s.worldState?.location || "Unknown Place";
    
    let item = "Strange Pebble";
    
    try {
        // Dynamic Story-Based Loot
        const { generateContent } = await import("./apiClient.js");
        const prompt = `Location: ${loc}.
The user searches the area. Generate ONE small, tangible item name that fits this specific story location.
Examples: "Rusty Key", "Cyberdeck Chip", "Dragon Scale", "Metro Ticket".
Return ONLY the item name. No punctuation.`;
        
        const res = await generateContent(prompt, "Loot");
        if (res) {
            item = res.replace(/["\.]/g, "").trim();
            // Safety cap length
            if (item.length > 30) item = item.substring(0, 30);
        }
    } catch (e) {
        console.warn("Loot Gen Failed", e);
        // Fallback logic
        const isLifeSim = s.rpg?.mode === "life_sim";
        const items = isLifeSim 
            ? ["Lost Coin", "Grocery Coupon", "Shiny Marble", "Wild Flower", "Old Ticket", "Cool Rock", "Pen", "Lighter"]
            : ["Old Coin", "Strange Pebble", "Rusty Key", "Medicinal Herb", "Scrap Metal", "Gemstone", "Lost Note", "Small Potion"];
        item = items[Math.floor(Math.random() * items.length)];
    }

    // Add to Inventory
    if (!s.inventory) s.inventory = {};
    if (!s.inventory.items) s.inventory.items = [];

    const existing = s.inventory.items.find(x => x.name === item);
    if (existing) existing.qty = (existing.qty || 1) + 1;
    else s.inventory.items.push({ name: item, qty: 1, type: "Material" });

    saveSettings();

    notify("success", `Found: ${item}`, "Scavenge");
    injectRpEvent(`[System: You found a ${item}.]`);
}

export function initSpriteInteraction() {
    $("body").off("pointerup.reSprite");
    $("body").on("pointerup.reSprite", ".re-sprite", function (e) {
        e.preventDefault();
        e.stopPropagation();
        
        const el = this;
        const charName = el.getAttribute("alt") || "Character";
        
        spawnContextMenu(e.clientX, e.clientY, charName, [
            {
                label: "Look",
                icon: "fa-solid fa-eye",
                action: () => {
                    injectRpEvent(`[System: You look closely at ${charName}. Describe their appearance and demeanor.]`);
                    notify("info", `Looking at ${charName}`, "Interaction");
                }
            },
            {
                label: "Talk",
                icon: "fa-solid fa-comment",
                action: () => {
                    injectRpEvent(`[System: You approach ${charName} to speak.]`);
                }
            },
            {
                label: "Touch",
                icon: "fa-solid fa-hand",
                action: () => {
                    injectRpEvent(`[System: You reach out to touch ${charName}.]`);
                }
            },
            {
                label: "Inspect",
                icon: "fa-solid fa-magnifying-glass",
                action: () => {
                    injectRpEvent(`[System: You inspect ${charName} for any unusual details.]`);
                }
            }
        ]);
    });
}

export function initBackgroundInteraction() {
    // Context menu for the background (Look Around, Investigate, Relax)
    // Bind to body to catch clicks even if passing through pointer-events:none layers
    $("body").off("contextmenu.reBg").on("contextmenu.reBg", function(e) {
        // Exclude ST UI and our UI
        if ($(e.target).closest(".re-sprite, .re-btn, .re-qbtn, .uie-window, .mes, .drawer-content, #chat, textarea, input, button, a").length) return;
        
        // Only active if Reality Engine is enabled? 
        // Or if we are just in the global scope? User wants interactivity.
        // Let's assume always active but maybe check if RE is enabled if we want to be strict.
        // For now, allow it as a general feature since it injects RP events.

        e.preventDefault();
        
        spawnContextMenu(e.clientX, e.clientY, "Area", [
            {
                label: "Look Around",
                icon: "fa-solid fa-eye",
                action: () => {
                    injectRpEvent(`[System: You look around the area. Describe the surroundings in detail.]`);
                    notify("info", "Observing surroundings...", "Interaction");
                }
            },
            {
                label: "Investigate",
                icon: "fa-solid fa-magnifying-glass",
                action: () => {
                    // Trigger scavenge
                    handleLoot();
                }
            },
            {
                label: "Relax",
                icon: "fa-solid fa-chair",
                action: () => {
                    injectRpEvent(`[System: You take a moment to relax and soak in the atmosphere.]`);
                }
            }
        ]);
    });
}

function spawnContextMenu(x, y, title, options) {
    // Remove existing
    $(".re-context-menu").remove();
    
    const menu = document.createElement("div");
    menu.className = "re-context-menu";
    menu.style.left = x + "px";
    menu.style.top = y + "px";
    
    const header = document.createElement("div");
    header.className = "re-ctx-header";
    header.textContent = title;
    menu.appendChild(header);
    
    options.forEach(opt => {
        const item = document.createElement("div");
        item.className = "re-ctx-item";
        item.innerHTML = `<i class="${opt.icon}"></i> ${opt.label}`;
        item.onclick = (e) => {
            e.stopPropagation();
            opt.action();
            menu.remove();
        };
        menu.appendChild(item);
    });
    
    document.body.appendChild(menu);
    
    // Close on click outside
    setTimeout(() => {
        $(document).one("click.reCtx", () => menu.remove());
    }, 10);
    
    // Bounds check
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 10) + "px";
    if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 10) + "px";
}
