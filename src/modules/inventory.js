import { getSettings, saveSettings } from "./core.js";
import { generateRaw, getContext } from "../../../../../script.js";

let currentTab = "items";
let selectedIdx = -1;

export function updateVitals() {
    const s = getSettings();
    $("#txt-hp").text(`${Math.floor(s.hp)}/${s.maxHp}`); $("#bar-hp").css("width", `${(s.hp/s.maxHp)*100}%`);
    $("#txt-mp").text(`${Math.floor(s.mp)}/${s.maxMp}`); $("#bar-mp").css("width", `${(s.mp/s.maxMp)*100}%`);
    $("#txt-ap").text(`${Math.floor(s.ap)}/${s.maxAp}`); $("#bar-ap").css("width", `${(s.ap/s.maxAp)*100}%`);
    
    if(s.shield > 0) $("#uie-shield-badge").show().find("#val-shield").text(s.shield); 
    else $("#uie-shield-badge").hide();
    
    $("#val-currency").text(s.currency);
    $("#uie-char-class").text(s.characterClass);
}

export function renderGrid() {
    const s = getSettings();
    $(".uie-grid-view").hide();
    
    if(currentTab === 'items') {
        const c = $("#uie-view-items");
        c.show().empty();
        s.inventory.items.forEach((item, idx) => {
            c.append(`<div class="uie-item-slot" data-idx="${idx}"><i class="fa-solid fa-flask"></i><div>${item.name}</div></div>`);
        });
        // Fill empty slots
        for(let i=0; i<(16-s.inventory.items.length); i++) c.append(`<div class="uie-item-slot empty"></div>`);
    }
}

async function generateItem() {
    const context = $("#uie-gen-input").val() || "Fantasy RPG";
    toastr.info("Forging item...");
    try {
        const prompt = `Generate 1 RPG item based on "${context}". Return JSON array: ["Item Name"].`;
        const res = await generateRaw({prompt, quietToLoud: false, skip_w_info: true});
        let clean = res.trim().replace(/```json|```/g, "").replace(/"/g, "").trim(); 
        
        // Basic JSON parsing attempt
        if(clean.startsWith('[')) {
            const arr = JSON.parse(clean);
            if(arr.length) clean = arr[0];
        }
        
        getSettings().inventory.items.push({name: clean});
        saveSettings();
        renderGrid();
        toastr.success(`Obtained: ${clean}`);
    } catch(e) { toastr.error("Generation Failed"); }
}

export function initInventoryListeners() {
    // Tabs
    $(document).on("click", ".uie-tab", function() {
        $(".uie-tab").removeClass("active"); 
        $(this).addClass("active"); 
        currentTab = $(this).data("tab"); 
        renderGrid(); 
    });

    // Item Click
    $(document).on("click", ".uie-item-slot[data-idx]", function() {
        selectedIdx = $(this).data("idx");
        const item = getSettings().inventory.items[selectedIdx];
        if(item) {
            $("#uie-action-title").text(item.name);
            $("#uie-item-actions").slideDown(100);
        }
    });

    // Actions
    $(document).on("click", "#uie-act-use", function() {
        if(selectedIdx === -1) return;
        const s = getSettings();
        const item = s.inventory.items[selectedIdx];
        
        // Simple logic
        if(item.name.toLowerCase().includes("potion")) s.hp = Math.min(s.hp+50, s.maxHp);
        
        s.inventory.items.splice(selectedIdx, 1);
        saveSettings();
        updateVitals();
        renderGrid();
        $("#uie-item-actions").slideUp();
    });

    $(document).on("click", "#uie-act-discard", function() {
        if(selectedIdx === -1) return;
        getSettings().inventory.items.splice(selectedIdx, 1);
        saveSettings();
        renderGrid();
        $("#uie-item-actions").slideUp();
    });

    // Generation
    $(document).on("click", "#uie-fab-sparkle", () => $("#uie-gen-modal").toggle());
    $(document).on("click", "#uie-gen-close", () => $("#uie-gen-modal").hide());
    $(document).on("click", "#uie-gen-item", generateItem);
}
