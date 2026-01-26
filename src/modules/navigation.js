
import { getSettings, saveSettings } from "./core.js";
import { notify } from "./notifications.js";
import { clearAllSprites } from "./sprites.js";

// --- SPATIAL NAVIGATION MODULE (v4.0) ---

export function initNavigation() {
    renderNavHud();
    updateNavVisibility();
}

function renderNavHud() {
    if (document.getElementById("re-nav-arrows")) return;

    const layer = document.createElement("div");
    layer.id = "re-nav-arrows";
    layer.style.cssText = "position:absolute; inset:0; pointer-events:none; z-index:100;"; // Lower z-index to avoid overlapping menus

    const isMobile = (() => {
        try { return window.matchMedia("(max-width: 768px), (pointer: coarse)").matches; } catch (_) { return window.innerWidth < 768; }
    })();
    const size = isMobile ? 44 : 60;
    const fontSize = isMobile ? 18 : 24;

    const arrows = [
        { dir: "north", icon: "fa-chevron-up", style: isMobile ? "top:20px; left:50%; transform:translateX(-50%);" : "top:60px; left:50%; transform:translateX(-50%);" },
        { dir: "south", icon: "fa-chevron-down", style: isMobile ? "bottom:28vh; left:50%; transform:translateX(-50%);" : "bottom:25vh; left:50%; transform:translateX(-50%);" }, // Moved up from 110px to 25vh (~270px on 1080p)
        { dir: "west", icon: "fa-chevron-left", style: isMobile ? "left:12px; top:50%; transform:translateY(-50%);" : "left:20px; top:50%; transform:translateY(-50%);" },
        { dir: "east", icon: "fa-chevron-right", style: isMobile ? "right:12px; top:50%; transform:translateY(-50%);" : "right:20px; top:50%; transform:translateY(-50%);" }
    ];

    arrows.forEach(a => {
        const btn = document.createElement("div");
        btn.className = `re-nav-arrow re-nav-${a.dir}`;
        btn.innerHTML = `<i class="fa-solid ${a.icon}"></i>`;
        btn.style.cssText = `
            position: absolute;
            width: ${size}px; height: ${size}px;
            background: rgba(0,0,0,0.4);
            border: 1px solid rgba(255,255,255,0.2);
            border-radius: 50%;
            color: #fff;
            font-size: ${fontSize}px;
            display: grid; place-items: center;
            cursor: pointer;
            pointer-events: auto;
            transition: all 0.2s;
            touch-action: manipulation;
            ${a.style}
        `;

        btn.onpointerdown = (e) => {
            e.stopPropagation();
        };
        btn.ontouchstart = (e) => {
            e.preventDefault();
            e.stopPropagation();
        };
        btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
            moveDirectionSilent(a.dir);
        };

        btn.onmouseenter = () => {
            btn.style.background = "rgba(255,255,255,0.2)";
            btn.style.transform = `${btn.style.transform} scale(1.1)`;
            showTooltip(a.dir);
        };

        btn.onmouseleave = () => {
            btn.style.background = "rgba(0,0,0,0.4)";
            btn.style.transform = btn.style.transform.replace(" scale(1.1)", "");
            hideTooltip();
        };

        layer.appendChild(btn);
    });

    // Tooltip
    const tip = document.createElement("div");
    tip.id = "re-nav-tooltip";
    tip.style.cssText = "position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); background:rgba(0,0,0,0.8); padding:8px 12px; border-radius:8px; color:#fff; font-weight:bold; display:none; pointer-events:none;";
    layer.appendChild(tip);

    const bg = document.getElementById("re-bg");
    if (bg) bg.parentElement.appendChild(layer);
}

function updateNavVisibility() {
    // In a real roguelite, we check exits. For now, assume open world or check grid.
    // We can hide arrows if at edge of map?
    // User requirement: "Only show an arrow if an exit exists... If CurrentRoom.exits.north exists"
    // Since we are building the system, let's assume all directions are open for generation unless blocked.
    // We'll leave them visible for the "Infinite Generation" feel requested.
}

function showTooltip(dir) {
    const tip = document.getElementById("re-nav-tooltip");
    if (!tip) return;

    // Calculate next coord
    const s = getSettings();
    const x = s.worldState?.x || 0;
    const y = s.worldState?.y || 0;
    let nx = x, ny = y;
    if (dir === "north") ny--;
    if (dir === "south") ny++;
    if (dir === "west") nx--;
    if (dir === "east") nx++;

    const key = `${nx},${ny}`;
    const known = s.realityEngine?.backgrounds?.[key] ? "Known Location" : "Unknown Area";

    tip.textContent = `To ${dir.toUpperCase()} (${known})`;
    tip.style.display = "block";
}

function hideTooltip() {
    const tip = document.getElementById("re-nav-tooltip");
    if (tip) tip.style.display = "none";
}

export async function moveDirectionSilent(dir) {
    const s = getSettings();
    if (!s.worldState) s.worldState = { x: 0, y: 0 };
    if (typeof s.worldState.x !== "number") s.worldState.x = 0;
    if (typeof s.worldState.y !== "number") s.worldState.y = 0;

    // Transition Effect
    const bg = document.getElementById("re-bg");
    const spritesLayer = document.getElementById("re-sprites-layer");
    if (bg) {
        bg.style.transition = "transform 0.5s, opacity 0.5s";
        bg.style.transform = "scale(1.5)";
        bg.style.opacity = "0";
    }
    // Keep sprites "following" the player on movement (never leave screen)
    // This is purely visual; it does not generate assistant narration.
    if (spritesLayer) {
        spritesLayer.style.transition = "transform 0.45s ease, opacity 0.45s ease";
        spritesLayer.style.opacity = "0";
        // small directional slide for VN/RPG feel
        const dx = dir === "east" ? -40 : dir === "west" ? 40 : 0;
        const dy = dir === "south" ? -20 : dir === "north" ? 20 : 0;
        spritesLayer.style.transform = `translate(${dx}px, ${dy}px)`;
    }
    // Location change => new scene by default
    clearAllSprites({ remove: true });

    // Update Coords
    if (dir === "north") s.worldState.y--;
    if (dir === "south") s.worldState.y++;
    if (dir === "west") s.worldState.x--;
    if (dir === "east") s.worldState.x++;

    const locId = `${s.worldState.x},${s.worldState.y}`;
    s.worldState.location = locId;
    saveSettings();

    setTimeout(async () => {
        // Apply new background
        if (bg) {
            bg.classList.remove("re-moving-forward", "re-moving-backward");
            // Clean up inline styles if any remained (though we use classes now)
            bg.style.transform = "";
            bg.style.opacity = "";

            // Check if exists
            const savedBg = s.realityEngine?.backgrounds?.[locId];
            if (savedBg) {
                bg.style.backgroundImage = `url("${savedBg}")`;
                notify("info", `Arrived at ${locId}`, "Navigation");
            } else {
                bg.style.backgroundImage = "";
                notify("info", `New Area: ${locId}. Generating...`, "Navigation");
                // Do not auto-trigger assistant/system narration or auto-generation here.
                // Background generation is handled by the Reality Engine background manager when needed.
            }
        }

        // Fade sprites back in cleanly
        if (spritesLayer) {
            spritesLayer.style.opacity = "1";
            spritesLayer.style.transform = "none";
        }
    }, 500);
}

// Backwards compatibility for older callers inside this module
async function moveDirection(dir) {
    return await moveDirectionSilent(dir);
}
