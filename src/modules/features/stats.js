
import { getSettings, saveSettings } from "../core.js";
import { notify } from "../notifications.js";

export function initStats() {
    // Bind global events or window specific events
    // Scope to main menu
    $("#uie-main-menu").off("click.uieStats").on("click.uieStats", "#uie-btn-stats", () => {
        renderStats();
    });

    // Bind "+" buttons
    // Scope to stats window
    $("#uie-stats-window").off("click.uieStatUp").on("click.uieStatUp", ".uie-stat-up-btn", function(e) {
        e.preventDefault();
        e.stopPropagation();
        const stat = $(this).data("stat");
        upgradeStat(stat);
    });

    // Bind refresh/render on window show
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
          const target = mutation.target;
          if (target.style.display !== 'none') {
            renderStats();
          }
        }
      });
    });

    const win = document.getElementById("uie-stats-window");
    if (win) observer.observe(win, { attributes: true });
}

export function renderStats() {
    const s = getSettings();
    if (!s.character) s.character = {};
    if (!s.character.stats) s.character.stats = {};

    // Check if elements exist
    if ($("#uie-stats-list").length === 0) {
        console.warn("[UIE] Stats window elements missing. Template not loaded?");
        return;
    }

    // 1. Portrait & Basic Info
    const name = s.character.name || "Unknown";
    const cls = s.character.className || "Adventurer";
    const lvl = s.character.level || 1;
    const pts = s.character.statPoints || 0;
    const portrait = s.character.portrait || s.character.avatar || "";

    $("#uie-stats-name").text(name);
    $("#uie-stats-class").text(`${cls} - Lv. ${lvl}`);

    if (portrait) {
        $("#uie-stats-portrait").attr("src", portrait).show();
        $("#uie-stats-portrait-fallback").hide();
    } else {
        $("#uie-stats-portrait").hide();
        $("#uie-stats-portrait-fallback").show();
    }

    const ptsEl = $("#uie-stats-points");
    // Always show the container but change text
    if (pts > 0) {
        ptsEl.addClass("uie-char-points").text(`Points: ${pts}`);
    } else {
        ptsEl.removeClass("uie-char-points").text("");
    }

    // Reset Button
    $("#uie-stats-reset-btn").show().off("click").on("click", resetStats);

    // 2. Attributes
    const statsList = $("#uie-stats-list");
    statsList.empty();

    // Settings has: str, dex, con, int, wis, cha, per, luk, agi, vit, end, spi
    const keys = ["str", "dex", "con", "int", "wis", "cha", "per", "luk", "agi", "vit", "end", "spi"];
    const STAT_NAMES = {
        str: "Strength", dex: "Dexterity", con: "Constitution",
        int: "Intelligence", wis: "Wisdom", cha: "Charisma",
        per: "Perception", luk: "Luck", agi: "Agility",
        vit: "Vitality", end: "Endurance", spi: "Spirit"
    };

    keys.forEach(key => {
        const val = s.character.stats[key] || 0;
        const label = STAT_NAMES[key] || key.toUpperCase();

        let btnHtml = "";
        if (pts > 0) {
            btnHtml = `<div class="uie-stat-up-btn" data-stat="${key}">+</div>`;
        }

        const html = `
            <div class="uie-stat-card">
                <div class="uie-stat-label">${label}</div>
                <div style="display:flex; align-items:center;">
                    <div class="uie-stat-val">${val}</div>
                    ${btnHtml}
                </div>
            </div>
        `;
        statsList.append(html);
    });

    // 3. Vitals (Bars)
    const vitalsEl = $("#uie-stats-vitals");
    vitalsEl.empty();

    const renderBar = (label, cur, max, type) => {
        const c = Math.round(cur || 0);
        const m = Math.round(max || 0);
        const pct = m > 0 ? Math.max(0, Math.min(100, (c / m) * 100)) : 0;
        return `
            <div class="uie-bar-container">
                <div class="uie-bar-labels">
                    <span>${label}</span>
                    <span>${c} / ${m}</span>
                </div>
                <div class="uie-bar-track">
                    <div class="uie-bar-fill uie-bar-${type}" style="width:${pct}%;"></div>
                </div>
            </div>
        `;
    };

    vitalsEl.append(renderBar("Health", s.hp, s.maxHp, "hp"));
    vitalsEl.append(renderBar("Mana", s.mp, s.maxMp, "mp"));
    vitalsEl.append(renderBar("Stamina", s.ap, s.maxAp, "ap"));
    vitalsEl.append(renderBar("Experience", s.xp, s.maxXp, "xp"));
}

function resetStats() {
    if (!confirm("Reset all stats to 10 and refund points?")) return;
    const s = getSettings();
    const keys = ["str", "dex", "con", "int", "wis", "cha", "per", "luk", "agi", "vit", "end", "spi"];

    let refunded = 0;
    keys.forEach(k => {
        const val = s.character.stats[k] || 0;
        if (val > 10) {
            refunded += (val - 10);
            s.character.stats[k] = 10;
        }
    });

    s.character.statPoints = (s.character.statPoints || 0) + refunded;
    saveSettings();
    renderStats();
    import("../inventory.js").then(mod => {
        if (mod && mod.updateVitals) mod.updateVitals();
    });
    notify("success", `Reset complete. Refunded ${refunded} points.`, "Stats");
    injectRpEvent(`[System: Stats reset. Refunded ${refunded} points.]`);
}

function upgradeStat(key) {
    const s = getSettings();
    if (!s.character.statPoints || s.character.statPoints <= 0) return;

    if (!s.character.stats) s.character.stats = {};
    s.character.stats[key] = (s.character.stats[key] || 0) + 1;
    s.character.statPoints--;

    saveSettings();
    renderStats();
    import("../inventory.js").then(mod => {
        if (mod && mod.updateVitals) mod.updateVitals();
    });
    notify("success", `Upgraded ${key.toUpperCase()}`, "Stats");
}
