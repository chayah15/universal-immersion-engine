
import { getSettings, saveSettings } from "../core.js";
import { notify } from "../notifications.js";
import { injectRpEvent } from "./rp_log.js";

let timer = null;
let currentActivity = null; // { id, name, startTime, duration, type }

const DEFAULT_ACTIVITIES = [
    { id: "training_str", name: "Strength Training", duration: 60, stats: { str: 1, xp: 10 } },
    { id: "training_dex", name: "Agility Drills", duration: 60, stats: { dex: 1, xp: 10 } },
    { id: "meditation", name: "Meditation", duration: 60, stats: { spi: 1, mp: 5, xp: 10 } },
    { id: "rest", name: "Rest", duration: 30, stats: { hp: 10, xp: 5 } },
    { id: "study", name: "Study", duration: 120, stats: { int: 1, xp: 20 } }
];

function ensureActivities(s) {
    if (!s) return;
    if (!s.activities) s.activities = {};
    if (!Array.isArray(s.activities.custom)) s.activities.custom = [];
    if (!s.activities.history) s.activities.history = [];
}

function getActivitiesList() {
    const s = getSettings();
    ensureActivities(s);
    return [...DEFAULT_ACTIVITIES, ...s.activities.custom];
}

function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
}

function getActivityIcon(name) {
    const n = String(name || "").toLowerCase();
    if (n.includes("train") || n.includes("str") || n.includes("lift")) return "fa-dumbbell";
    if (n.includes("run") || n.includes("dex") || n.includes("agi") || n.includes("speed")) return "fa-person-running";
    if (n.includes("medit") || n.includes("spi") || n.includes("mana") || n.includes("magic")) return "fa-om";
    if (n.includes("study") || n.includes("read") || n.includes("int") || n.includes("learn")) return "fa-book-open";
    if (n.includes("rest") || n.includes("sleep") || n.includes("nap")) return "fa-bed";
    if (n.includes("work") || n.includes("job") || n.includes("craft")) return "fa-briefcase";
    if (n.includes("swim")) return "fa-person-swimming";
    if (n.includes("climb")) return "fa-mountain";
    return "fa-person-walking";
}

export function render() {
    const $win = $("#uie-activities-window");
    if (!$win.is(":visible")) return;

    const s = getSettings();
    const list = getActivitiesList();
    const $list = $("#uie-activities-list");
    $list.empty();

    // Clear inline styles if any (from previous version)
    $list.removeAttr("style");

    const template = document.getElementById("uie-activity-card-template");

    list.forEach(act => {
        const icon = getActivityIcon(act.name);
        const isActive = currentActivity && currentActivity.id === act.id;

        const clone = template.content.cloneNode(true);
        const $el = $(clone).find(".uie-sim-card");

        if (isActive) $el.addClass("active");

        const $icon = $el.find(".uie-sim-icon");
        if (act.img) {
            const img = document.createElement("img");
            img.src = act.img;
            Object.assign(img.style, {width:"100%", height:"100%", objectFit:"cover", borderRadius:"50%"});
            $icon.append(img);
        } else {
            const i = document.createElement("i");
            i.className = `fa-solid ${icon}`;
            $icon.append(i);
        }

        $el.find(".uie-sim-name").text(act.name);
        $el.find(".duration-text").text(formatTime(act.duration));

        const rewardsContainer = $el.find(".uie-sim-rewards");
        const tmplStat = document.getElementById("uie-template-activity-stat");
        if (tmplStat) {
            const stats = Object.entries(act.stats || {});
            stats.forEach(([k, v], idx) => {
                if (idx > 0) rewardsContainer.append(document.createTextNode(" • "));
                const sClone = tmplStat.content.cloneNode(true);
                const label = sClone.querySelector(".uie-stat-label");
                const val = sClone.querySelector(".uie-stat-val");
                if (label) label.textContent = k.toUpperCase();
                if (val) val.textContent = `+${v}`;
                rewardsContainer.append(sClone);
            });
        }

        const $action = $el.find(".uie-sim-action");
        if (isActive) {
            const tmplActive = document.getElementById("uie-template-activity-active-label");
            if (tmplActive) {
                $action.empty().append(tmplActive.content.cloneNode(true));
            }
        } else {
            // Keep default icon
        }

        if (String(act.id).startsWith("custom_")) {
            const $del = $el.find(".uie-sim-del");
            $del.attr("data-id", act.id).show();
            if (!isActive) {
                $del.on("click", (e) => {
                    e.stopPropagation();
                    deleteActivity(act.id);
                });
            }
        }

        if (!isActive) {
            $el.find(".uie-sim-action, .uie-sim-info, .uie-sim-icon").on("click", () => startActivity(act));
        }

        $list.append($el);
    });

    updateCurrentUI();
}

function deleteActivity(id) {
    if (!confirm("Delete this activity?")) return;
    const s = getSettings();
    if (s.activities && Array.isArray(s.activities.custom)) {
        s.activities.custom = s.activities.custom.filter(x => x.id !== id);
        saveSettings();
        render();
        notify("success", "Activity deleted", "Activities");
    }
}

function updateCurrentUI() {
    const $display = $("#uie-activity-current-display");
    const $prog = $("#uie-activity-progress");
    const $timer = $("#uie-activity-timer");
    const $stop = $("#uie-activity-stop");

    if (!currentActivity) {
        $display.text("Free Time");
        $prog.css("width", "0%");
        $timer.text("--:--");
        $stop.hide();
        return;
    }

    $display.text(currentActivity.name);
    $stop.show();

    const elapsed = (Date.now() - currentActivity.startTime) / 1000;
    const total = currentActivity.duration;
    const pct = Math.min(100, (elapsed / total) * 100);
    const remain = Math.max(0, total - elapsed);

    $prog.css("width", `${pct}%`);
    $timer.text(formatTime(Math.ceil(remain)));

    if (elapsed >= total) {
        completeActivity();
    }
}

function startActivity(act) {
    if (currentActivity) {
        notify("warning", "Finish your current activity first!", "Activities");
        return;
    }

    currentActivity = {
        ...act,
        startTime: Date.now()
    };

    notify("info", `Started: ${act.name}`, "Activities");
    injectRpEvent(`[System: User started activity: ${act.name}.]`);

    if (timer) clearInterval(timer);
    timer = setInterval(updateCurrentUI, 1000);
    render(); // Re-render to show active state on card
}

function stopActivity() {
    if (!currentActivity) return;
    notify("info", `Stopped: ${currentActivity.name}`, "Activities");
    currentActivity = null;
    if (timer) clearInterval(timer);
    render();
}

function completeActivity() {
    if (!currentActivity) return;
    const act = currentActivity;
    currentActivity = null;
    if (timer) clearInterval(timer);
    render();

    const s = getSettings();
    // Grant Rewards
    if (act.stats) {
        if (!s.character) s.character = {};
        if (!s.character.stats) s.character.stats = {};

        let msg = [];
        if (act.stats.xp) {
            s.xp = (s.xp || 0) + act.stats.xp;
            msg.push(`${act.stats.xp} XP`);
        }
        if (act.stats.hp) s.hp = Math.min(s.maxHp || 100, (s.hp || 0) + act.stats.hp);
        if (act.stats.mp) s.mp = Math.min(s.maxMp || 100, (s.mp || 0) + act.stats.mp);

        // Stats
        ["str", "dex", "con", "int", "wis", "cha"].forEach(stat => {
            if (act.stats[stat]) {
                s.character.stats[stat] = (s.character.stats[stat] || 10) + act.stats[stat];
                msg.push(`${stat.toUpperCase()} +${act.stats[stat]}`);
            }
        });

        // Grant Items/Skills
        if (act.rewards) {
            if (Array.isArray(act.rewards.items)) {
                if (!s.inventory.items) s.inventory.items = [];
                act.rewards.items.forEach(it => {
                    s.inventory.items.push({ ...it, qty: it.qty || 1 });
                    msg.push(`Item: ${it.name}`);
                });
            }
            if (Array.isArray(act.rewards.skills)) {
                if (!s.inventory.skills) s.inventory.skills = [];
                act.rewards.skills.forEach(sk => {
                    // Check duplicate
                    if (!s.inventory.skills.find(x => x.name === sk.name)) {
                        s.inventory.skills.push(sk);
                        msg.push(`Skill: ${sk.name}`);
                    }
                });
            }
        }

        notify("success", `Completed ${act.name}! Gained: ${msg.join(", ")}`, "Activities");
        injectRpEvent(`[System: User completed ${act.name}. Gained: ${msg.join(", ")}.]`);

        // Trigger Level Up check
        import("../inventory.js").then(mod => {
            if (mod.applyLevelingProgress) mod.applyLevelingProgress(s);
            mod.updateVitals();
        });
    }

    saveSettings();
}

function createCustomActivity() {
    const name = $("#uie-activity-new-name").val();
    if (!name) return;

    const s = getSettings();
    ensureActivities(s);

    const newAct = {
        id: "custom_" + Date.now(),
        name: name,
        duration: 60, // Default 1 min
        stats: { xp: 5 } // Default reward
    };

    s.activities.custom.push(newAct);
    saveSettings();

    $("#uie-activity-new-name").val("");
    render();
    notify("success", `Created activity: ${name}`, "Activities");
}

export function initActivities() {
    const $win = $("#uie-activities-window");
    
    $win.off("click.uieAct", "#uie-activity-stop").on("click.uieAct", "#uie-activity-stop", stopActivity);
    $win.off("click.uieAct", "#uie-activity-create").on("click.uieAct", "#uie-activity-create", createCustomActivity);

    $win.off("click.uieAct", "#uie-activity-sparkle").on("click.uieAct", "#uie-activity-sparkle", () => {
        if (window.UIE_openCreateStation) {
            window.UIE_openCreateStation();
        } else {
            console.warn("[UIE] openCreateStation not available");
        }
    });

    // Open/Close handlers are in HTML onclick or managed globally,
    // but let's ensure we render when opened.
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.target.id === "uie-activities-window" &&
                mutation.target.style.display !== "none") {
                render();
            }
        });
    });

    const win = document.getElementById("uie-activities-window");
    if (win) {
        observer.observe(win, { attributes: true, attributeFilter: ["style"] });
        // Initial render if visible or to populate defaults
        render();
    }

    // Hook into Gear Menu to open Activities
    // Scope to body as this might be in various places
    $("body").off("click.uieOpenAct").on("click.uieOpenAct", "#uie-open-activities", () => {
        $("#uie-activities-window").show();
        render();
    });
}
