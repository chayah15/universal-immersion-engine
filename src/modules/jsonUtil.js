
/**
 * Safely parses a JSON string, handling markdown code blocks.
 * @param {string} text 
 * @returns {any|null}
 */
function parse(text) {
    try {
        let str = String(text || "").trim();
        // Remove markdown code blocks if present
        if (str.startsWith("```")) {
            str = str.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
        }
        return JSON.parse(str);
    } catch (e) {
        return null;
    }
}

/**
 * Parses JSON and ensures it is a non-null object (not array).
 * @param {string} text 
 * @returns {object|null}
 */
export function safeJsonParseObject(text) {
    const res = parse(text);
    return (res && typeof res === "object" && !Array.isArray(res)) ? res : null;
}

/**
 * Parses JSON and ensures it is an array.
 * @param {string} text 
 * @returns {Array|null}
 */
export function safeJsonParseArray(text) {
    const res = parse(text);
    return Array.isArray(res) ? res : null;
}
