import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, generateRaw } from "../../../../script.js";

const extensionName = "universal-immersion-engine";
const basePath = `scripts/extensions/third-party/${extensionName}`;
const defaultSettings = { 
    enabled: true, posX: 100, posY: 100, 
    hp: 100, maxHp: 100, mp: 50, maxMp: 50, ap: 10, maxAp: 10, shield: 0,
    currency: 150, 
    inventory: { items: [], skills: [], assets: [], statuses: [] },
    equipment: {}, 
    uiScale: 1.0, characterClass: "Sanguine Shinobi"
};

let currentTab = "items";
let selectedItemIndex = -1;

// --- UTILS ---
function getEventPos(e) {
    if (e.touches && e.touches.length > 0) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    return { x: e.clientX, y: e.clientY };
}

function sanitize() {
    if (!extension_settings[extensionName]) extension_settings[extensionName] = defaultSettings;
    const s = extension_settings[extensionName];
    // Ensure vital defaults
    if(!s.inventory) s.inventory = defaultSettings.inventory;
    if(!s.equipment) s.equipment = {};
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
    
    // Scale Application
    $("#uie-inventory-modal, #uie-main-menu, #uie-debug-window").css("transform", `scale(${s.uiScale})`);
    $("#uie-scale-display").text(s.uiScale);
}

// --- RENDERERS ---
function renderGrid() {
    const s = extension_settings[extensionName];
    $(".uie-grid-view, #uie-view-equip, #uie-view-status").hide();
    
    if(currentTab === 'items') {
        $("#uie-view-items").show().empty();
        s.inventory.items.forEach((item, idx) => {
            $("#uie-view-items").append(`<div class="uie-item-slot" data-idx="${idx}"><i class="fa-solid fa-flask"></i><div>${item.name}</div></div>`);
        });
        for(let i=0; i<(16-s.inventory.items.length); i++) $("#uie-view-items").append(`<div class="uie-item-slot empty"></div>`);
    } 
    else if(currentTab === 'equip') {
        $("#uie-view-equip").show();
        $(".uie-equip-slot").each(function() {
            const slot = $(this).data("slot");
            const item = s.equipment[slot];
            if(item) $(this).addClass("filled").html(`<i class="fa-solid fa-shield-cat"></i><br>${item}`);
            else $(this).removeClass("filled").html(slot.replace('_', ' '));
        });
    }
}

// --- INIT & EVENTS ---
jQuery(async () => {
    $("<link>").attr({rel:"stylesheet", type:"text/css", href: `${basePath}/style.css?v=${Date.now()}`}).appendTo("head");
    $("#uie-launcher, #uie-main-menu, .uie-window, .uie-phone").remove();
    sanitize();
    
    // Load Templates
    const tpls = ['launcher', 'menu', 'inventory', 'phone', 'debug'];
    for(const t of tpls) {
        try { $("body").append(await $.get(`${basePath}/src/templates/${t}.html`)); } catch(e){}
    }
    
    // Inject Settings
    setInterval(async()=>{
        if($("#extensions_settings, #extensions_settings_panel").length && !$("#uie-scale-slider").length) {
            $("#extensions_settings, #extensions_settings_panel").append(await $.get(`${basePath}/src/templates/settings.html`));
            $("#uie-scale-slider").on("input", function(){ 
                extension_settings[extensionName].uiScale=$(this).val(); 
                saveSettingsDebounced(); updateUI(); 
            });
        }
    }, 2000);

    const s = extension_settings[extensionName];
    $("#uie-inventory-modal").css({top: s.posY, left: s.posX});

    // --- BUTTONS ---
    $(document).on("click", "#uie-launcher", (e) => { e.stopPropagation(); $("#uie-main-menu").toggle(); });
    
    $(document).on("click", "#uie-btn-inventory", () => { $("#uie-main-menu").hide(); $("#uie-inventory-modal").show(); renderGrid(); });
    $(document).on("click", "#uie-btn-phone", () => { $("#uie-main-menu").hide(); $("#uie-phone-window").show(); });
    $(document).on("click", "#uie-btn-debug", () => { $("#uie-main-menu").hide(); $("#uie-debug-window").show(); });
    
    $(document).on("click", ".uie-close-btn, #uie-phone-close", function() { $(this).closest(".uie-window, .uie-phone").hide(); });
    $(document).on("click", ".uie-tab", function(){ $(".uie-tab").removeClass("active"); $(this).addClass("active"); currentTab=$(this).data("tab"); renderGrid(); });
    $(document).on("click", "#uie-fab-sparkle", () => $("#uie-gen-modal").toggle());
    $(document).on("click", "#uie-gen-close", () => $("#uie-gen-modal").hide());

    // --- DRAGGING LOGIC (TOUCH FIXED) ---
    let isDrag = false, t, ox, oy;

    function handleStart(e) {
        // Identify target (Menu or Window Header or Phone StatusBar)
        const target = $(e.target);
        if(target.closest(".uie-inv-header").length) t = $("#uie-inventory-modal");
        else if(target.closest(".phone-status-bar").length) t = $("#uie-phone-window");
        else if(target.closest("#uie-menu-drag").length) t = $("#uie-main-menu");
        else if(target.closest(".uie-header").length) t = target.closest(".uie-window");
        else return;

        e.preventDefault(); // Stop scrolling while dragging
        isDrag = true;
        const rect = t[0].getBoundingClientRect();
        const pos = getEventPos(e);
        ox = pos.x - rect.left;
        oy = pos.y - rect.top;
    }

    function handleMove(e) {
        if (!isDrag || !t) return;
        e.preventDefault();
        const pos = getEventPos(e);
        t.css({ top: pos.y - oy, left: pos.x - ox });
    }

    function handleEnd() {
        if (isDrag && t && t.attr('id') === 'uie-inventory-modal') {
            s.posX = parseFloat(t.css('left'));
            s.posY = parseFloat(t.css('top'));
            saveSettingsDebounced();
        }
        isDrag = false;
        t = null;
    }

    // Attach to Document for global dragging
    document.addEventListener("mousedown", handleStart);
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleEnd);
    
    // Mobile Touch Listeners (Passive: false allows preventDefault)
    document.addEventListener("touchstart", handleStart, { passive: false });
    document.addEventListener("touchmove", handleMove, { passive: false });
    document.addEventListener("touchend", handleEnd);

    updateUI();
    console.log("[UIE] System V3.1: Mobile Dragging & Responsive Layout Active.");
});
