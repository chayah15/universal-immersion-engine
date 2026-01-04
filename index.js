import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, generateRaw } from "../../../../script.js";

const extensionName = "universal-immersion-engine";
const basePath = `scripts/extensions/third-party/${extensionName}`;
const defaultSettings = { 
    enabled: true, posX: 100, posY: 100, 
    hp: 100, maxHp: 100, mp: 50, maxMp: 50, ap: 10, maxAp: 10, shield: 0,
    currency: 150, 
    inventory: { items: [], skills: [], assets: [] },
    uiScale: 1.0, characterClass: "Sanguine Shinobi"
};

let currentTab = "items";
let isDrag = false, dragTarget, ox, oy;

function sanitize() {
    if (!extension_settings[extensionName]) extension_settings[extensionName] = defaultSettings;
    const s = extension_settings[extensionName];
    if(!s.inventory) s.inventory = defaultSettings.inventory;
    saveSettingsDebounced();
}

function updateUI() {
    const s = extension_settings[extensionName];
    $("#txt-hp").text(`${Math.floor(s.hp)}/${s.maxHp}`); $("#bar-hp").css("width", `${(s.hp/s.maxHp)*100}%`);
    $("#txt-mp").text(`${Math.floor(s.mp)}/${s.maxMp}`); $("#bar-mp").css("width", `${(s.mp/s.maxMp)*100}%`);
    $("#txt-ap").text(`${Math.floor(s.ap)}/${s.maxAp}`); $("#bar-ap").css("width", `${(s.ap/s.maxAp)*100}%`);
    
    if(s.shield > 0) $("#uie-shield-badge").show().find("#val-shield").text(s.shield); 
    else $("#uie-shield-badge").hide();
    
    $("#val-currency").text(s.currency);
    $("#uie-char-class").text(s.characterClass);
    
    // Apply Scale
    $("#uie-inventory-modal, #uie-main-menu, #uie-debug-window").css("transform", `scale(${s.uiScale})`);
}

function renderGrid() {
    const s = extension_settings[extensionName];
    $(".uie-grid-view").hide();
    if(currentTab === 'items') {
        $("#uie-view-items").show().empty();
        s.inventory.items.forEach((item, idx) => {
            $("#uie-view-items").append(`<div class="uie-item-slot" data-idx="${idx}"><i class="fa-solid fa-flask"></i><div>${item.name}</div></div>`);
        });
        for(let i=0; i<(16-s.inventory.items.length); i++) $("#uie-view-items").append(`<div class="uie-item-slot empty"></div>`);
    }
}

// --- DIAGNOSTICS ---
function runDiagnostics() {
    const log = $("#uie-debug-log");
    log.empty();
    const add = (msg, type) => log.append(`<div class="log-${type}" style="margin-bottom:2px;">[${new Date().toLocaleTimeString()}] ${msg}</div>`);
    
    add("Running System Scan...", "info");
    
    // 1. Check Data
    if(extension_settings[extensionName]) add("✅ Settings Object: OK", "pass");
    else add("❌ Settings Object: MISSING", "fail");
    
    // 2. Check DOM Elements (Proof files loaded)
    const checks = [
        {id: "#uie-launcher", name: "Launcher"},
        {id: "#uie-main-menu", name: "Menu"},
        {id: "#uie-inventory-modal", name: "Inventory"},
        {id: "#uie-debug-window", name: "Debugger"}
    ];
    
    checks.forEach(c => {
        if($(c.id).length) add(`✅ ${c.name} Loaded`, "pass");
        else add(`❌ ${c.name} HTML Missing`, "fail");
    });
    
    add("Scan Complete.", "info");
}

// --- INIT ---
jQuery(async () => {
    $("<link>").attr({rel:"stylesheet", type:"text/css", href: `${basePath}/style.css?v=${Date.now()}`}).appendTo("head");
    $("#uie-launcher, #uie-main-menu, .uie-window").remove();
    sanitize();
    
    const files = ['launcher', 'menu', 'inventory', 'phone', 'debug'];
    for(const f of files) {
        try { $("body").append(await $.get(`${basePath}/src/templates/${f}.html`)); } catch(e){}
    }
    
    const s = extension_settings[extensionName];
    $("#uie-inventory-modal").css({top: s.posY, left: s.posX});

    // --- EVENTS & NAVIGATION ---
    
    // Launcher
    $(document).on("click", "#uie-launcher", (e) => { e.stopPropagation(); $("#uie-main-menu").toggle(); });
    
    // Main Menu Nav
    $(document).on("click", "#uie-btn-inventory", () => { $("#uie-main-menu").hide(); $("#uie-inventory-modal").show(); renderGrid(); });
    $(document).on("click", "#uie-btn-shop", () => { $("#uie-main-menu").hide(); alert("Shop feature coming soon!"); });
    
    // Misc Sub-Menu Logic
    $(document).on("click", "#uie-btn-misc", () => { 
        $("#uie-view-main").hide(); 
        $("#uie-view-misc").show(); 
    });
    
    $(document).on("click", "#uie-btn-back", () => { 
        $("#uie-view-misc").hide(); 
        $("#uie-view-main").show(); 
    });
    
    // Misc Menu Items
    $(document).on("click", "#uie-btn-open-phone", () => { $("#uie-main-menu").hide(); $("#uie-phone-window").show(); });
    $(document).on("click", "#uie-btn-debug", () => { $("#uie-main-menu").hide(); $("#uie-debug-window").show(); runDiagnostics(); });
    
    // Close Logic
    $(document).on("click", ".uie-close-btn", function() { $(this).closest(".uie-window").hide(); });
    $(document).on("click", "#uie-run-diag", runDiagnostics);

    // --- DRAGGING (TOUCH FIX) ---
    function getPos(e) { return e.touches ? {x:e.touches[0].clientX, y:e.touches[0].clientY} : {x:e.clientX, y:e.clientY}; }

    function handleStart(e) {
        // IGNORE clicks on buttons/inputs so they work!
        // This is crucial for the "Cannot click it off" fix
        if ($(e.target).closest("button, .uie-close-btn, .uie-tab, .uie-menu-item, input, i.fa-solid").length) return;

        const target = $(e.target);
        if(target.closest(".uie-inv-header").length) dragTarget = $("#uie-inventory-modal");
        else if(target.closest(".uie-menu-header, .uie-misc-header").length) dragTarget = $("#uie-main-menu");
        else if(target.closest(".uie-header").length) dragTarget = target.closest(".uie-window");
        else return;

        e.preventDefault(); // Only prevent default if we are actually dragging
        isDrag = true;
        const rect = dragTarget[0].getBoundingClientRect();
        const pos = getPos(e);
        ox = pos.x - rect.left;
        oy = pos.y - rect.top;
    }

    function handleMove(e) {
        if (!isDrag || !dragTarget) return;
        e.preventDefault();
        const pos = getPos(e);
        dragTarget.css({ top: pos.y - oy, left: pos.x - ox });
    }

    function handleEnd() {
        if (isDrag && dragTarget && dragTarget.attr('id') === 'uie-inventory-modal') {
            s.posX = parseFloat(dragTarget.css('left'));
            s.posY = parseFloat(dragTarget.css('top'));
            saveSettingsDebounced();
        }
        isDrag = false;
        dragTarget = null;
    }

    // Bind listeners
    document.addEventListener("mousedown", handleStart);
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleEnd);
    document.addEventListener("touchstart", handleStart, { passive: false });
    document.addEventListener("touchmove", handleMove, { passive: false });
    document.addEventListener("touchend", handleEnd);

    updateUI();
    console.log("[UIE] Sanguine V4 Loaded: Original Menu Restored.");
});

