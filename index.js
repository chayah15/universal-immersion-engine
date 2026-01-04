import { EXT_ID, sanitizeSettings, initDragging, getSettings } from "./src/modules/core.js";
import { initInventoryListeners, updateVitals, renderGrid } from "./src/modules/inventory.js";
import { initDiagnostics, runDiagnostics } from "./src/modules/diagnostics.js";

const basePath = `scripts/extensions/third-party/${EXT_ID}`;

jQuery(async () => {
    // 1. Load Styles
    $("<link>").attr({rel:"stylesheet", type:"text/css", href: `${basePath}/style.css?v=${Date.now()}`}).appendTo("head");
    
    // 2. Cleanup Old
    $("#uie-launcher, #uie-main-menu, .uie-window, .uie-book-overlay, .uie-phone").remove();
    
    // 3. Initialize Data
    sanitizeSettings();
    
    // 4. Load HTML Templates
    const files = ['launcher', 'menu', 'inventory', 'phone', 'debug', 'journal', 'social', 'diary'];
    for(const f of files) {
        try { 
            const html = await $.get(`${basePath}/src/templates/${f}.html`);
            $("body").append(html);
        } catch(e) { console.error(`[UIE] Failed to load ${f}`); }
    }
    
    // 5. Apply Position & Scale
    const s = getSettings();
    $("#uie-inventory-modal").css({top: s.posY, left: s.posX});
    $(".uie-window, #uie-main-menu").css("transform", `scale(${s.uiScale})`);

    // 6. Init Modules
    initDragging();
    initInventoryListeners();
    initDiagnostics();
    updateVitals();

    // --- MAIN NAVIGATION LOGIC ---
    
    // Launcher
    $(document).on("click", "#uie-launcher", (e) => { e.stopPropagation(); $("#uie-main-menu").toggle(); });

    // Menu Routing
    $(document).on("click", "#uie-btn-inventory", () => { $("#uie-main-menu").hide(); $("#uie-inventory-modal").show(); renderGrid(); });
    $(document).on("click", "#uie-btn-phone", () => { $("#uie-main-menu").hide(); $("#uie-phone-window").show(); });
    $(document).on("click", "#uie-btn-journal", () => { $("#uie-main-menu").hide(); $("#uie-journal-window").show(); });
    $(document).on("click", "#uie-btn-diary", () => { $("#uie-main-menu").hide(); $("#uie-diary-window").show(); });
    $(document).on("click", "#uie-btn-social", () => { $("#uie-main-menu").hide(); $("#uie-social-window").show(); });
    $(document).on("click", "#uie-btn-debug", () => { $("#uie-main-menu").hide(); $("#uie-debug-window").show(); runDiagnostics(); });

    // Sub-menus
    $(document).on("click", "#uie-btn-misc", () => { $("#uie-view-main").hide(); $("#uie-view-misc").show(); });
    $(document).on("click", "#uie-btn-back", () => { $("#uie-view-misc").hide(); $("#uie-view-main").show(); });

    // Global Close
    $(document).on("click", ".uie-close-btn, #uie-phone-close", function() { 
        $(this).closest(".uie-window, .uie-book-overlay, .uie-phone").hide(); 
    });

    console.log("[UIE] Modular System V5 Loaded.");
});
