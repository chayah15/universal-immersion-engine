function buildCorsProxyCandidates(targetUrl) {
    const u = String(targetUrl || "").trim();
    if (!u) return [];
    const enc = encodeURIComponent(u);
    const out = [];
    const add = (x) => { if (x && !out.includes(x)) out.push(x); };
    add(`/api/proxy?url=${enc}`);
    add(`/proxy?url=${enc}`);
    add(`/api/cors-proxy?url=${enc}`);
    add(`/cors-proxy?url=${enc}`);
    add(`/api/corsProxy?url=${enc}`);
    add(`/corsProxy?url=${enc}`);
    add(`/api/proxy/${enc}`);
    add(`/proxy/${enc}`);
    add(`/api/cors-proxy/${enc}`);
    add(`/cors-proxy/${enc}`);
    add(`/api/corsProxy/${enc}`);
    add(`/corsProxy/${enc}`);
    return out;
}

function isFailedToFetchError(e) {
    const m = String(e?.message || e || "").toLowerCase();
    return m.includes("failed to fetch") || m.includes("networkerror") || m.includes("load failed");
}

export function normalizeBaseUrl(url) {
    return String(url || "").trim().replace(/\/+$/, "");
}

export async function tryFetch(url, options = {}) {
    try {
        const r = await fetch(url, { method: "GET", ...options });
        return r;
    } catch (e) {
        if (!isFailedToFetchError(e)) throw e;
        for (const proxyUrl of buildCorsProxyCandidates(url)) {
            try {
                const r2 = await fetch(proxyUrl, { method: "GET", ...options });
                return r2;
            } catch (_) {}
        }
        throw e;
    }
}

export async function tryJson(url, options = {}) {
    try {
        const r = await tryFetch(url, options);
        if (!r || !r.ok) return null;
        return await r.json().catch(() => null);
    } catch (_) {
        return null;
    }
}

export function createTtlCache({ defaultTtlMs = 5 * 60 * 1000, maxEntries = 80 } = {}) {
    const map = new Map();
    const prune = () => {
        if (map.size <= maxEntries) return;
        const entries = Array.from(map.entries()).sort((a, b) => Number(a[1]?.t || 0) - Number(b[1]?.t || 0));
        const drop = Math.max(0, entries.length - maxEntries);
        for (let i = 0; i < drop; i++) map.delete(entries[i][0]);
    };
    return {
        get(key) {
            const k = String(key || "");
            if (!k) return null;
            const v = map.get(k);
            if (!v) return null;
            const ttl = Number(v.ttlMs ?? defaultTtlMs);
            const age = Date.now() - Number(v.t || 0);
            if (ttl > 0 && age > ttl) return null;
            return v.value;
        },
        set(key, value, ttlMs = defaultTtlMs) {
            const k = String(key || "");
            if (!k) return;
            map.set(k, { value, ttlMs: Number(ttlMs ?? defaultTtlMs), t: Date.now() });
            prune();
        },
        async getOrLoad(key, loader, ttlMs = defaultTtlMs) {
            const k = String(key || "");
            const hit = this.get(k);
            if (hit !== null && hit !== undefined) return hit;
            const v = await loader();
            if (v !== null && v !== undefined) this.set(k, v, ttlMs);
            return v;
        }
    };
}

