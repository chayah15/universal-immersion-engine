import { getSettings } from "./core.js";

function log(msg, type="info") {
    const ts = new Date().toLocaleTimeString();
    const el = $("#uie-debug-log");
    if(el.length) el.append(`<div class="log-${type}" style="margin-bottom:2px; padding-left:5px; border-left:3px solid ${type=='pass'?'#3fb950':type=='fail'?'#f85149':'#58a6ff'}">[${ts}] ${msg}</div>`);
}

export function runDiagnostics() {
    $("#uie-debug-log").empty();
    log("Scanning System...", "info");

    // 1. Settings
    const s = getSettings();
    if(s) log("Settings: OK", "pass"); else log("Settings: MISSING", "fail");

    // 2. DOM
    const els = ["#uie-launcher", "#uie-main-menu", "#uie-inventory-modal", "#uie-phone-window", "#uie-journal-window"];
    els.forEach(id => {
        if($(id).length) log(`${id} Loaded`, "pass");
        else log(`${id} MISSING`, "fail");
    });

    // 3. Styles
    if($("#uie-inventory-modal").css("position") === "fixed") log("CSS Loaded", "pass");
    else log("CSS Logic Missing", "fail");
}

export function initDiagnostics() {
    $(document).on("click", "#uie-run-diag", runDiagnostics);
    
    // Catch global errors
    window.onerror = function(msg, url, line) {
        log(`CRASH: ${msg} :${line}`, "fail");
    };
}
