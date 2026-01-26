
export function parseJsonLoose(text) {
    try {
        let str = String(text || "").trim();
        if (str.startsWith("```")) {
            str = str.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
        }
        return JSON.parse(str);
    } catch (e) {
        return null;
    }
}

export function normalizeDatabankArrayInPlace(arr, opts) {
    if (!Array.isArray(arr)) return false;
    let changed = false;
    const now = opts?.now || Date.now();
    const makeId = opts?.makeId || (() => Date.now().toString());

    arr.forEach(entry => {
        if (!entry.id) {
            entry.id = makeId();
            changed = true;
        }
        if (!entry.created) {
            entry.created = now;
            changed = true;
        }
    });
    return changed;
}

export function toDatabankDisplayEntries(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.map(entry => ({
        id: entry.id,
        title: entry.title || "Entry",
        body: entry.summary || entry.content || "",
        date: entry.date || new Date(entry.created || Date.now()).toLocaleDateString(),
        type: (entry.tags && entry.tags.includes("lore")) ? "lore" : "memory"
    }));
}
