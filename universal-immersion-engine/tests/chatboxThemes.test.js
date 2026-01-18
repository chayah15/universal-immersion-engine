import assert from "node:assert/strict";

const THEMES = {
    visual_novel: ["--cb-bg","--cb-card","--cb-border","--cb-accent","--cb-text","--cb-muted"],
    rpg: ["--cb-bg","--cb-card","--cb-border","--cb-accent","--cb-text","--cb-muted"],
    magic_shop: ["--cb-bg","--cb-card","--cb-border","--cb-accent","--cb-text","--cb-muted"],
    classroom: ["--cb-bg","--cb-card","--cb-border","--cb-accent","--cb-text","--cb-muted"],
};

for (const [k, vars] of Object.entries(THEMES)) {
    assert.ok(k.length > 0);
    assert.ok(Array.isArray(vars));
    for (const v of vars) assert.ok(v.startsWith("--"));
}

console.log("chatboxThemes tests: OK");

