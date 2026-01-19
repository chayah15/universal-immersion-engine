export function extractJsonText(input) {
    const raw = String(input || "").replace(/```json|```/g, "").trim();
    if (!raw) return "";
    const a = raw.indexOf("{");
    const b = raw.lastIndexOf("}");
    if (a >= 0 && b > a) return raw.slice(a, b + 1);
    const c = raw.indexOf("[");
    const d = raw.lastIndexOf("]");
    if (c >= 0 && d > c) return raw.slice(c, d + 1);
    return raw;
}

export function safeJsonParse(input) {
    const txt = extractJsonText(input);
    if (!txt) return null;
    try { return JSON.parse(txt); } catch (_) { return null; }
}

export function safeJsonParseObject(input) {
    const obj = safeJsonParse(input);
    if (obj && typeof obj === "object" && !Array.isArray(obj)) return obj;
    return null;
}

export function safeJsonParseArray(input) {
    const arr = safeJsonParse(input);
    if (Array.isArray(arr)) return arr;
    return null;
}

