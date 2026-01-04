import { extension_settings } from "../../../../extensions.js";
import { saveSettingsDebounced } from "../../../../../script.js";

export const EXT_ID = "universal-immersion-engine";
export const SETTINGS_DEFAULT = { 
    enabled: true, posX: 100, posY: 100, 
    hp: 100, maxHp: 100, mp: 50, maxMp: 50, ap: 10, maxAp: 10, shield: 0,
    currency: 150, 
    inventory: { items: [], skills: [], assets: [], statuses: [] },
    uiScale: 1.0, characterClass: "Sanguine Shinobi"
};

// --- SETTINGS MGR ---
export function getSettings() {
    return extension_settings[EXT_ID];
}

export function saveSettings() {
    saveSettingsDebounced();
}

export function sanitizeSettings() {
    if (!extension_settings[EXT_ID]) extension_settings[EXT_ID] = SETTINGS_DEFAULT;
    // Deep merge defaults if missing
    const s = extension_settings[EXT_ID];
    if(!s.inventory) s.inventory = SETTINGS_DEFAULT.inventory;
    if(!s.inventory.statuses) s.inventory.statuses = [];
    saveSettings();
}

// --- DRAGGING ENGINE ---
let isDrag = false, dragTarget, ox, oy;

function getPos(e) { return e.touches ? {x:e.touches[0].clientX, y:e.touches[0].clientY} : {x:e.clientX, y:e.clientY}; }

export function initDragging() {
    function handleStart(e) {
        const target = $(e.target);
        // Ignore interactables
        if (target.closest("button, input, .uie-close-btn, .uie-tab, .uie-menu-item, .uie-item-slot").length) return;
        // Ignore content scrolling
        if (target.closest(".uie-content, .uie-inv-content, #uie-debug-log").length) return;

        // Detect Header
        if(target.closest(".uie-inv-header").length) dragTarget = $("#uie-inventory-modal");
        else if(target.closest(".uie-menu-header, .uie-misc-header").length) dragTarget = $("#uie-main-menu");
        else if(target.closest(".phone-status-bar").length) dragTarget = $("#uie-phone-window");
        else if(target.closest(".uie-header").length) dragTarget = target.closest(".uie-window");
        else return;

        e.preventDefault(); 
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
            const s = getSettings();
            s.posX = parseFloat(dragTarget.css('left'));
            s.posY = parseFloat(dragTarget.css('top'));
            saveSettings();
        }
        isDrag = false;
        dragTarget = null;
    }

    document.addEventListener("mousedown", handleStart);
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleEnd);
    document.addEventListener("touchstart", handleStart, { passive: false });
    document.addEventListener("touchmove", handleMove, { passive: false });
    document.addEventListener("touchend", handleEnd);
}
