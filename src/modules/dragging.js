import { getSettings, saveSettings, isMobileUI, updateLayout } from "./core.js";

let launcherState = { active: false, startX: 0, startY: 0, startTime: 0, moved: false };
let windowState = { pending: false, active: false, target: null, startX: 0, startY: 0, ox: 0, oy: 0, prevOrigin: "", prevTransform: "" };
let touchBlocker = false;
let launcherMouse = { active: false, ox: 0, oy: 0, moved: false, movedAt: 0 };
let launcherSaveT = 0;

export function initDragging() {
    if (window.uie_drag_controller) window.uie_drag_controller.abort();
    window.uie_drag_controller = new AbortController();
    const signal = window.uie_drag_controller.signal;

    const launcher = document.getElementById("uie-launcher");
    if (launcher) {
        launcher.style.touchAction = "none";

        launcher.addEventListener("touchstart", (e) => {
            const touch = e.touches[0];
            launcherState = { active: true, startX: touch.clientX, startY: touch.clientY, startTime: Date.now(), moved: false };
        }, { passive: true, signal });

        launcher.addEventListener("touchmove", (e) => {
            if (!launcherState.active) return;
            const touch = e.touches[0];
            if (Math.abs(touch.clientX - launcherState.startX) > 10 || Math.abs(touch.clientY - launcherState.startY) > 10) {
                launcherState.moved = true;
                if (e.cancelable) e.preventDefault();
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const r = launcher.getBoundingClientRect();
                const w = r.width || launcher.offsetWidth || 60;
                const h = r.height || launcher.offsetHeight || 60;
                let left = touch.clientX - (w / 2);
                let top = touch.clientY - (h / 2);
                left = Math.max(0, Math.min(left, vw - w));
                top = Math.max(0, Math.min(top, vh - h));
                launcher.style.left = `${left}px`;
                launcher.style.top = `${top}px`;

                const s = getSettings();
                s.launcherX = left;
                s.launcherY = top;
                if (launcherSaveT) clearTimeout(launcherSaveT);
                launcherSaveT = setTimeout(() => {
                    try { saveSettings(); } catch (_) {}
                }, 180);
            }
        }, { passive: false, signal });

        launcher.addEventListener("touchend", (e) => {
            if (!launcherState.active) return;
            launcherState.active = false;

            if (launcherState.moved) {
                const s = getSettings();
                s.launcherX = parseFloat(launcher.style.left) || 0;
                s.launcherY = parseFloat(launcher.style.top) || 0;
                saveSettings();
                touchBlocker = true;
                setTimeout(() => { touchBlocker = false; }, 450);
            }
        }, { signal });

        launcher.addEventListener("click", (e) => {
            if (touchBlocker) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                return;
            }
            if (launcherMouse.moved && Date.now() - launcherMouse.movedAt < 320) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
            }
        }, { capture: true, signal });

        launcher.addEventListener("mousedown", (e) => {
            if (typeof e.button === "number" && e.button !== 0) return;
            if (touchBlocker) return;
            const rect = launcher.getBoundingClientRect();
            launcherMouse = { active: true, ox: e.clientX - rect.left, oy: e.clientY - rect.top, moved: false, movedAt: 0 };
            e.preventDefault();
        }, { signal });

        document.addEventListener("mousemove", (e) => {
            if (!launcherMouse.active) return;
            if (typeof e.buttons === "number" && e.buttons !== 1) {
                launcherMouse.active = false;
                return;
            }
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const r = launcher.getBoundingClientRect();
            const w = r.width || launcher.offsetWidth || 60;
            const h = r.height || launcher.offsetHeight || 60;
            let left = e.clientX - launcherMouse.ox;
            let top = e.clientY - launcherMouse.oy;
            left = Math.max(0, Math.min(left, vw - w));
            top = Math.max(0, Math.min(top, vh - h));
            launcher.style.left = `${left}px`;
            launcher.style.top = `${top}px`;
            launcherMouse.moved = true;
            launcherMouse.movedAt = Date.now();
            e.preventDefault();
        }, { signal });

        document.addEventListener("mouseup", () => {
            if (!launcherMouse.active) return;
            launcherMouse.active = false;
            if (!launcherMouse.moved) return;
            const s = getSettings();
            s.launcherX = parseFloat(launcher.style.left) || 0;
            s.launcherY = parseFloat(launcher.style.top) || 0;
            saveSettings();
        }, { signal });
    }

    const onWinStart = (e) => {
        if (launcherState.active) return;
        if (e.type === "mousedown" && typeof e.button === "number" && e.button !== 0) return;
        const t = $(e.target);

        const inStatsHeader = t.closest(".uie-rpg-header").length > 0;
        const inActivitiesHeader = t.closest(".uie-sim-header").length > 0;
        const inDragHeader = inStatsHeader || inActivitiesHeader;
        const inHeaderButton = t.closest("button, .uie-rpg-close, .uie-sim-close").length > 0;
        const inAnyWindow = t.closest(".uie-window").length > 0;
        const inMainMenu = t.closest("#uie-main-menu").length > 0;
        const allowMobileFreeDrag = isMobileUI() && (inAnyWindow || inMainMenu);

        // CRITICAL: Check for buttons and clickable elements FIRST, before any drag logic
        // Allow dragging when clicking the stats/activities header background.
        if ((!inDragHeader || inHeaderButton) && !allowMobileFreeDrag) {
            if (t.is("button") || 
                t.is("i") && t.closest("button").length ||
                t.closest("button").length ||
                t.closest(".uie-close-btn, .uie-rpg-close, .uie-sim-close, .uie-inv-close, #uie-phone-close, #uie-settings-close, #uie-party-member-close, #uie-party-member-bg-edit, .phone-back-btn, .uie-controls, .uie-dropdown, .uie-dd-item, .uie-menu-tab, .uie-inv-icon, .fa-wand-magic-sparkles, [id*='sparkle'], #uie-activity-sparkle, input, select, textarea, option, optgroup, a, label, .tab, .uie-tab, .uie-set-tab, .uie-settings-tab, [onclick], [role='button'], .uie-btn-accept, .uie-btn-deny, .uie-btn-complete, .uie-btn-fail, .uie-codex-add, .uie-codex-edit, .uie-codex-del, #re-st-menu, #re-q-menu, #uie-journal-menu, .menu, .popup, .dropdown-menu, .range-slider, .checkbox, .radio, .toggle, .re-qbtn, .re-menu-item, .re-forge-btn, .vn-dialogue-box, .re-bar, .re-hud-btn, .uie-social-card, .uie-p-close, .uie-inv-tabs, .uie-journal-sidebar, .uie-journal-list, #uie-world-content, .no-drag, .clickable, .re-actbtn, #re-action-grid, #re-composer, .re-obj, #re-phone, #re-journal, #re-ui button, #re-ui input, #re-ui textarea, #uie-stats-window .uie-rpg-close, #uie-activities-window .uie-sim-close").length) {
                return;
            }
        }

        // Global Z-Index Safety Check: If clicking something with high z-index (likely popup), don't drag
        try {
            const z = window.getComputedStyle(e.target).zIndex;
            // Exception for UIE Main Menu which has very high z-index
            const isMenu = t.closest("#uie-main-menu").length > 0;
            if (!isMenu && z && z !== "auto" && Number(z) > 20050) return;
        } catch (_) {}

        // Heuristic: If it looks clickable (pointer cursor), don't drag
        // Skip this heuristic for stats/activities headers (they are drag handles)
        if (!inDragHeader && !allowMobileFreeDrag) {
            try {
                const cursor = window.getComputedStyle(e.target).cursor;
                if (cursor === "pointer" || cursor === "text") return;
            } catch (_) {}
        }

        if (t.closest("#uie-inv-drag").length && t.closest(".uie-inv-actions, .uie-inv-currency, #uie-inv-pencil-menu, #uie-inv-sparkle-menu").length) {
            return;
        }

        let target = null;
        if (t.closest(".uie-diary-header").length) target = $("#uie-diary-window");
        else if (t.closest("#uie-inv-drag").length) target = $("#uie-inventory-window");
        else if (t.closest("#uie-main-menu").length) target = $("#uie-main-menu");
        else if (t.closest(".phone-status-bar").length) target = $("#uie-phone-window");
        else if (t.closest(".uie-p-header").length) target = $("#uie-social-overlay .uie-paper-box");
        else if (t.closest(".uie-party-member-header").length) target = $("#uie-party-member-card");
        else if (t.closest(".uie-rpg-header").length) target = $("#uie-stats-window");
        else if (t.closest(".uie-sim-header").length) target = $("#uie-activities-window");
        else if (t.closest(".uie-header").length) target = t.closest(".uie-window");

        if (!target || !target.length) return;
        if (isMobileUI() && (target.attr("id") || "") === "uie-inventory-window") return;
        if (isMobileUI() && t.closest(".uie-party-member-header").length) return;

        const pos = e.touches ? e.touches[0] : e;
        try { window.UIE_isDragging = true; } catch (_) {}
        windowState = {
            pending: true,
            active: true,
            target,
            startX: pos.clientX,
            startY: pos.clientY,
            ox: 0,
            oy: 0,
            prevOrigin: target.css("transform-origin"),
            prevTransform: target.css("transform")
        };
    };

    const onWinMove = (e) => {
        if (!windowState.active || !windowState.target) return;
        if (e.type === "mousemove" && typeof e.buttons === "number" && e.buttons !== 1) {
            windowState.active = false;
            windowState.target = null;
            return;
        }
        const pos = e.touches ? e.touches[0] : e;
        if (windowState.pending) {
            const dx = Math.abs(pos.clientX - windowState.startX);
            const dy = Math.abs(pos.clientY - windowState.startY);
            if (dx < 6 && dy < 6) return;
            windowState.pending = false;
            const rect = windowState.target[0].getBoundingClientRect();
            const winId = windowState.target.attr("id") || "";
            const isDesktop = window.innerWidth >= 768;
            const isFullScreenWindow = isDesktop && (winId === "uie-stats-window" || winId === "uie-activities-window");
            
            // For desktop full-screen windows, ensure we use pixel values from current position
            // Don't reset position if it's already correctly positioned
            if (isFullScreenWindow) {
                // Get current computed position
                const currentLeft = rect.left;
                const currentTop = rect.top;
                windowState.ox = pos.clientX - currentLeft;
                windowState.oy = pos.clientY - currentTop;
                // Set position in pixels (not viewport units) for dragging
                // Remove transform that was used for centering
                windowState.target.css({ 
                    left: `${currentLeft}px`, 
                    top: `${currentTop}px`, 
                    transformOrigin: "top left",
                    transform: "none"
                });
            } else {
                windowState.ox = pos.clientX - rect.left;
                windowState.oy = pos.clientY - rect.top;
                windowState.target.css({ left: rect.left, top: rect.top, transformOrigin: "top left" });
                windowState.target.css({ transform: "none" });
            }
        }
        // Only prevent default if we're actually dragging (not just pending)
        if (!windowState.pending && e.cancelable) e.preventDefault();
        // Use pixel values for dragging
        windowState.target.css({ left: `${pos.clientX - windowState.ox}px`, top: `${pos.clientY - windowState.oy}px` });
    };

    const onWinEnd = () => {
        if (windowState.active && windowState.target && windowState.target.length) {
            if (windowState.pending) {
                windowState.active = false;
                windowState.pending = false;
                windowState.target = null;
                return;
            }
            const rect = windowState.target[0].getBoundingClientRect();
            const s = getSettings();
            const id = windowState.target.attr("id") || "";
            const isDesktop = window.innerWidth >= 768;
            const isFullScreenWindow = isDesktop && (id === "uie-stats-window" || id === "uie-activities-window");
            
            if (id === "uie-inventory-window") {
                s.posX = rect.left;
                s.posY = rect.top;
                saveSettings();
            }
            if (id === "uie-main-menu") {
                s.menuX = rect.left;
                s.menuY = rect.top;
                saveSettings();
            }
            if (id === "uie-phone-window") {
                if (!s.phone) s.phone = {};
                s.phone.windowPos = { x: rect.left, y: rect.top };
                saveSettings();
            }
            
            // For desktop full-screen windows, keep pixel values for dragging but allow CSS media queries to handle initial positioning
            // Only override if window was actually dragged (not just clicked)
            if (isFullScreenWindow) {
                // Save the dragged position but don't force it on next open - let CSS media query handle initial position
                // The inline style from dragging will persist until window is closed/reopened
                windowState.target.css({ transform: "none", transformOrigin: windowState.prevOrigin || "" });
            } else {
                windowState.target.css({ transform: "none", transformOrigin: windowState.prevOrigin || "" });
            }
            updateLayout();
        }
        try { window.UIE_isDragging = false; } catch (_) {}
        windowState.active = false;
        windowState.pending = false;
        windowState.target = null;
    };

    // Use capture phase but allow buttons to work
    document.addEventListener("mousedown", (e) => {
        const t = $(e.target);
        // If clicking a button or icon inside button, don't interfere
        if (t.is("button") || t.is("i") && t.closest("button").length || t.closest("button").length) {
            return; // Let the button's onclick handler work
        }
        onWinStart(e);
    }, { capture: true, signal });
    document.addEventListener("mousemove", onWinMove, { signal });
    document.addEventListener("mouseup", onWinEnd, { signal });
    window.addEventListener("blur", onWinEnd, { signal });

    document.addEventListener("touchstart", (e) => {
        const t = $(e.target);
        // If clicking a button or icon inside button, don't interfere
        // Also check for close buttons specifically
        if (t.is("button") || 
            t.is("i") && t.closest("button").length || 
            t.closest("button").length ||
            t.closest(".uie-close-btn, .uie-rpg-close, .uie-sim-close").length) {
            return; // Let the button's onclick handler work
        }
        onWinStart(e);
    }, { capture: true, passive: false, signal });
    document.addEventListener("touchmove", onWinMove, { passive: false, signal });
    document.addEventListener("touchend", onWinEnd, { signal });
}
