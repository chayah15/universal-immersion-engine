import { getSettings, saveSettings } from "./core.js";
import { notify } from "./notifications.js";
import { generateContent } from "./apiClient.js";

let uieImgCsrfCache = { t: 0, token: "" };
async function getCsrfToken() {
    const now = Date.now();
    if (uieImgCsrfCache.token && now - uieImgCsrfCache.t < 5 * 60 * 1000) return uieImgCsrfCache.token;
    try {
        const r = await fetch("/csrf-token", { method: "GET" });
        if (!r.ok) return "";
        const j = await r.json().catch(() => null);
        const tok = String(j?.csrfToken || j?.token || "").trim();
        if (tok) uieImgCsrfCache = { t: now, token: tok };
        return tok;
    } catch (_) {
        return "";
    }
}

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
    add(`/api/proxy/url?url=${enc}`);
    add(`/api/proxy-url?url=${enc}`);
    add(`/api/forward?url=${enc}`);
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

async function fetchWithCorsProxyFallback(targetUrl, options) {
    try {
        const r = await fetch(targetUrl, options);
        return { response: r, via: "direct", requestUrl: targetUrl };
    } catch (e) {
        if (!isFailedToFetchError(e)) throw e;
        const candidates = buildCorsProxyCandidates(targetUrl);
        let lastErr = e;

        // Try server-side proxies first to avoid CORS/Origin issues
        const tryServerForward = async (endpoint) => {
            try {
                const hdr = new Headers(options?.headers || {});
                hdr.set("Content-Type", "application/json");
                const payload = {
                    url: String(targetUrl || ""),
                    method: String(options?.method || "GET"),
                    headers: Object.fromEntries(hdr.entries()),
                    body: options?.body ?? null
                };
                const tok = await getCsrfToken();
                if (tok && !hdr.has("X-CSRF-Token")) hdr.set("X-CSRF-Token", tok);
                const r = await fetch(String(endpoint || ""), { method: "POST", headers: hdr, body: JSON.stringify(payload) });
                if (!r.ok) return null;
                return r;
            } catch (_) {
                return null;
            }
        };
        for (const ep of ["/api/forward", "/api/proxy", "/api/cors-proxy", "/api/corsProxy"]) {
            const r = await tryServerForward(ep);
            if (r) return { response: r, via: "server-forward", requestUrl: ep };
        }

        for (const proxyUrl of candidates) {
            try {
                const r = await fetch(proxyUrl, options);
                if (r.status === 404 || r.status === 405 || (r.status >= 500 && r.status <= 599)) continue;
                if (r.status === 403 || r.status === 401) {
                    const tok = await getCsrfToken();
                    if (tok) {
                        const h = new Headers(options?.headers || {});
                        if (!h.has("X-CSRF-Token")) h.set("X-CSRF-Token", tok);
                        const r2 = await fetch(proxyUrl, { ...options, headers: h });
                        if (r2.status === 404 || r2.status === 405 || (r2.status >= 500 && r2.status <= 599)) continue;
                        return { response: r2, via: "proxy", requestUrl: proxyUrl };
                    }
                }
                return { response: r, via: "proxy", requestUrl: proxyUrl };
            } catch (e2) {
                lastErr = e2;
                continue;
            }
        }
        throw lastErr;
    }
}

function normalizeEndpoint(x) {
    x = String(x || "").trim().replace(/\/+$/, "");
    if (/\/api\/v1$/i.test(x)) return `${x}/images/generations`;
    if (/\/v1$/i.test(x)) return `${x}/images/generations`;
    return x;
}

/**
 * Checks if an image should be generated based on context, then generates it.
 * @param {string} context - The text content (chat, item desc, etc.)
 * @param {string} feature - The feature key (map, doll, social, phoneBg, msg, party, items)
 * @returns {Promise<string|null>} - The image URL or null
 */
export async function checkAndGenerateImage(context, feature) {
    const s = getSettings();
    if (!s.image || !s.image.enabled) return null;
    if (s.image.features && s.image.features[feature] === false) return null;

    // 1. Ask AI if we need a photo
    const checkPrompt = `
Context: ${context.slice(0, 1000)}
Question: Does this context explicitly describe a visual scene, item, or character that needs a photo?
Answer (Yes/No):`;

    const checkRes = await generateContent(checkPrompt, "System Image Check");

    if (!checkRes) return null;
    const answer = String(checkRes).trim().toLowerCase();

    // Strict check for "yes"
    if (!answer.startsWith("yes")) return null;

    // 2. Generate the Image Prompt
    const promptGenPrompt = `
Context: ${context.slice(0, 2000)}
Task: Create a highly detailed, strict image generation prompt for DALL-E 3 based on the context.
Include style details (fantasy, realistic, etc) appropriate for the setting.
Return ONLY the prompt text.`;

    const imagePrompt = await generateContent(promptGenPrompt, "System Image Prompt");
    if (!imagePrompt) return null;

    // 3. Call Image API
    return await generateImageAPI(imagePrompt);
}

// --- PAYWALL HANDLER ---
function handleNanoPayment(data) {
    // Find Nano option
    const nano = data.accepts?.find(x => x.scheme === "nano" || x.network === "nano-mainnet");
    if (!nano) return;

    const amount = nano.maxAmountRequiredFormatted || "0.193 XNO";
    const address = nano.payTo;
    const usd = nano.maxAmountRequiredUSD || "0.00";
    
    // Create Modal
    const id = "uie-pay-modal";
    $(`#${id}`).remove();
    
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`nano:${address}?amount=${nano.maxAmountRequired}`)}`;

    const html = `
    <div id="${id}" style="position:fixed; inset:0; z-index:2147483660; background:rgba(0,0,0,0.85); display:flex; align-items:center; justify-content:center;">
        <div style="background:#1a1a1a; border:1px solid #f1c40f; padding:20px; border-radius:12px; width:min(400px, 90vw); color:#fff; text-align:center; font-family:sans-serif;">
            <h3 style="color:#f1c40f; margin-top:0;">Payment Required</h3>
            <div style="font-size:0.9em; color:#ccc; margin-bottom:15px;">
                NanoGPT requires a micro-payment for this request.
            </div>
            
            <div style="background:#fff; padding:10px; display:inline-block; border-radius:8px; margin-bottom:15px;">
                <img src="${qrUrl}" alt="QR Code" style="display:block; width:150px; height:150px;">
            </div>

            <div style="font-weight:bold; font-size:1.1em; margin-bottom:5px;">${amount}</div>
            <div style="font-size:0.8em; color:#888; margin-bottom:15px;">(approx $${usd})</div>

            <div style="background:#222; padding:10px; border-radius:6px; word-break:break-all; font-family:monospace; font-size:0.85em; user-select:all; border:1px solid #444; margin-bottom:15px; cursor:pointer;" onclick="navigator.clipboard.writeText('${address}'); toastr.success('Copied Address');">
                ${address}
            </div>

            <div style="font-size:0.8em; color:#aaa; margin-bottom:20px;">
                Send exactly this amount to continue. The request will retry automatically or you can close this and try again.
            </div>

            <button onclick="$('#${id}').remove()" style="background:#333; border:1px solid #555; color:#fff; padding:8px 20px; border-radius:6px; cursor:pointer;">Close</button>
        </div>
    </div>
    `;
    
    $("body").append(html);
}

/**
 * Direct call to Image API
 */
export async function generateImageAPI(prompt) {
    const s = getSettings();
    const endpoint = normalizeEndpoint(String(s.image.url || "https://api.openai.com/v1/images/generations"));
    const provider = String(s.image.provider || "").toLowerCase();
    const model = String(s.image.model || "dall-e-3").trim();
    const apiKey = String(s.image.key || "").trim();
    const negText = String(s.image.negativePrompt || "").trim();
    const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(endpoint);
    const isSdWebUi = provider === "sdwebui" || /\/sdapi\/v1\/txt2img\s*$/i.test(endpoint);
    const isComfy = (() => {
        if (provider === "comfy") return true;
        if (isSdWebUi) return false;
        if (/\/v1\/images\/generations\s*$/i.test(endpoint)) return false;
        if (/\/images\/generations\s*$/i.test(endpoint)) return false;
        if (/\/prompt\s*$/i.test(endpoint)) return true;
        if (/:(8188|8189)(\/|$)/i.test(endpoint)) return true;
        const wf = String(s.image?.comfy?.workflow || "").trim();
        return !!wf && isLocal;
    })();
    const isPollinations = provider === "pollinations";

    if (!apiKey && !isLocal && !isSdWebUi && !isComfy && !isPollinations) {
        console.warn("Image Gen: No API Key");
        try { window.toastr?.error?.("Image Gen: Missing API key."); } catch (_) {}
        return null;
    }

    if (window.toastr) toastr.info("Generating Image...", "AI Fabricator");

    const rawPrompt = String(prompt || "");
    const lockedPrompt = /^\[UIE_LOCKED\]/i.test(rawPrompt.trim());
    let finalPrompt = rawPrompt.replace(/^\s*\[UIE_LOCKED\]\s*/i, "").trim();

    if (!lockedPrompt) {
        try {
            const p = s?.generation?.promptPrefixes || {};
            const by = (p?.byType && typeof p.byType === "object") ? p.byType : {};
            const global = String(p?.global || "").trim();
            // const def = String(by?.default || "").trim();
            if (global) finalPrompt = `${global}, ${finalPrompt}`;
        } catch (_) {}
    }

    try {
        const startedAt = Date.now();

        if (isPollinations) {
             const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?nologo=true&width=1024&height=1024&seed=${Math.floor(Math.random() * 100000)}`;
             const fx = await fetchWithCorsProxyFallback(url, { method: "GET" });
             if (!fx.response.ok) throw new Error("Pollinations API failed");
             const blob = await fx.response.blob();
             const dataUrl = await new Promise(resolve => {
                 const r = new FileReader();
                 r.onload = () => resolve(r.result);
                 r.readAsDataURL(blob);
             });
             try { window.UIE_lastImage = { ok: true, ms: Date.now() - startedAt, endpoint: "pollinations", mode: "pollinations" }; } catch (_) {}
             return dataUrl;
        }

        if (isComfy) {
            const wfRaw = String(s.image?.comfy?.workflow || "").trim();
            if (!wfRaw) {
                console.warn("Image Gen: ComfyUI workflow missing");
                if (window.toastr) toastr.error("ComfyUI workflow is missing (paste it in settings).");
                return null;
            }
            const posId = String(s.image?.comfy?.positiveNodeId || "").trim();
            const negId = String(s.image?.comfy?.negativeNodeId || "").trim();
            const outId = String(s.image?.comfy?.outputNodeId || "").trim();
            const ckpt = String(s.image?.comfy?.checkpoint || "").trim();
            const out = await generateComfyUI({ endpoint, workflowRaw: wfRaw, promptText: finalPrompt, negativePrompt: negText, checkpoint: ckpt, positiveNodeId: posId, negativeNodeId: negId, outputNodeId: outId });
            try { window.UIE_lastImage = { ok: !!out, ms: Date.now() - startedAt, endpoint, mode: "comfy" }; } catch (_) {}
            return out;
        }

        if (isSdWebUi) {
             // SD Web UI Logic
             // Note: Original code for SDWebUI was cut off/corrupted in previous view. 
             // Reconstructing standard SD Web UI call
             const payload = {
                 prompt: finalPrompt,
                 negative_prompt: negText,
                 steps: 20,
                 width: 512,
                 height: 512,
                 cfg_scale: 7
             };
             const fx = await fetchWithCorsProxyFallback(`${endpoint}/sdapi/v1/txt2img`, {
                 method: "POST",
                 headers: { "Content-Type": "application/json" },
                 body: JSON.stringify(payload)
             });
             const res = fx.response;
             if (!res.ok) {
                 const err = await res.text();
                 try { window.UIE_lastImage = { ok: false, ms: Date.now() - startedAt, endpoint, mode: "sdwebui", status: res.status, error: String(err || "").slice(0, 280) }; } catch (_) {}
                 if (window.toastr) toastr.error("Image Generation Failed");
                 return null;
             }
             const data = await res.json();
             const img = Array.isArray(data?.images) ? String(data.images[0] || "") : "";
             if (!img) {
                 try { window.UIE_lastImage = { ok: false, ms: Date.now() - startedAt, endpoint, mode: "sdwebui", status: 200, error: "No image returned." }; } catch (_) {}
                 return null;
             }
             const out = img.startsWith("data:image") ? img : `data:image/png;base64,${img}`;
             try { window.UIE_lastImage = { ok: true, ms: Date.now() - startedAt, endpoint, mode: "sdwebui", status: 200 }; } catch (_) {}
             return out;
        }

        const headers = { "Content-Type": "application/json", "Accept": "application/json" };
        if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
        const fx = await fetchWithCorsProxyFallback(endpoint, {
            method: "POST",
            headers,
            body: JSON.stringify({
                model: model,
                prompt: finalPrompt,
                n: 1,
                size: "1024x1024",
                response_format: "url" // or b64_json
            })
        });
        const res = fx.response;

        if (res.status === 402) {
             // Payment Required (NanoGPT etc)
             try {
                 const data = await res.json();
                 handleNanoPayment(data);
             } catch (_) {}
             if (window.toastr) toastr.warning("Payment Required");
             return null;
        }

        if (!res.ok) {
            const err = await res.text();
            console.error("Image Gen Error:", err);
            if (window.toastr) toastr.error("Image Generation Failed");
            try { window.UIE_lastImage = { ok: false, ms: Date.now() - startedAt, endpoint, mode: "openai", status: res.status, error: String(err || "").slice(0, 280), via: fx?.via || "" }; } catch (_) {}
            return null;
        }

        const data = await res.json();
        const first = Array.isArray(data?.data) ? data.data[0] : null;
        const urlOut = String(first?.url || data?.url || "").trim();
        const b64 = String(first?.b64_json || first?.b64 || "").trim();
        if (urlOut) {
            try { window.UIE_lastImage = { ok: true, ms: Date.now() - startedAt, endpoint, mode: "openai", status: 200, via: fx?.via || "" }; } catch (_) {}
            return urlOut;
        }
        if (b64) {
            const out = b64.startsWith("data:image") ? b64 : `data:image/png;base64,${b64}`;
            try { window.UIE_lastImage = { ok: true, ms: Date.now() - startedAt, endpoint, mode: "openai", status: 200, via: fx?.via || "" }; } catch (_) {}
            return out;
        }
        try {
            window.UIE_lastImage = {
                ok: false,
                ms: Date.now() - startedAt,
                endpoint,
                mode: "openai",
                status: 200,
                error: "No data.url or data.b64_json returned.",
                via: fx?.via || ""
            };
        } catch (_) {}
        return null;

    } catch (e) {
        const msg = String(e?.message || e || "Image gen failed");
        try { console.error("Image Gen Exception:", { message: msg, endpoint, stack: String(e?.stack || "").slice(0, 3000) }); } catch (_) { console.error("Image Gen Exception:", msg); }
        try { notify("error", "Image Gen Error: " + msg.slice(0, 220), "UIE", "api"); } catch (_) {}
        try { window.UIE_lastImage = { ok: false, ms: 0, endpoint, mode: isComfy ? "comfy" : isSdWebUi ? "sdwebui" : "openai", status: 0, error: String(e?.message || e || "").slice(0, 280) }; } catch (_) {}
        return null;
    }
}

async function generateComfyUI({ endpoint, workflowRaw, promptText, negativePrompt, checkpoint, positiveNodeId, negativeNodeId, outputNodeId }) {
    try {
        const s = getSettings();
        const ez = s?.image?.comfy?.easy && typeof s.image.comfy.easy === "object" ? s.image.comfy.easy : null;
        const common = String(ez?.common || "").trim();
        const commonNeg = String(ez?.commonNeg || "").trim();
        if (common) promptText = `${common}\n${String(promptText || "")}`.trim();
        if (commonNeg) negativePrompt = `${commonNeg}\n${String(negativePrompt || "")}`.trim();
    } catch (_) {}

    const normalizeBase = (u) => String(u || "").trim().replace(/\/+$/, "").replace(/\/prompt$/i, "");
    const base = normalizeBase(endpoint);
    const promptUrl = `${base}/prompt`;
    const viewUrl = `${base}/view`;
    const historyUrl = `${base}/history`;

    const parseWorkflow = () => {
        const obj = JSON.parse(String(workflowRaw || ""));
        if (obj && typeof obj === "object" && obj.prompt && typeof obj.prompt === "object") return obj.prompt;
        return obj;
    };

    const deepReplace = (v) => {
        if (typeof v === "string") {
            return v
                .replace(/\{\{\s*(prompt|positive_prompt|positive)\s*\}\}/gi, String(promptText || ""))
                .replace(/\{\{\s*(negative_prompt|negative)\s*\}\}/gi, String(negativePrompt || ""))
                .replace(/\{\{\s*(checkpoint|ckpt|model)\s*\}\}/gi, String(checkpoint || ""));
        }
        if (Array.isArray(v)) return v.map(deepReplace);
        if (v && typeof v === "object") {
            const out = {};
            for (const [k, val] of Object.entries(v)) out[k] = deepReplace(val);
            return out;
        }
        return v;
    };

    const injectTextNodes = (graph) => {
        if (!graph || typeof graph !== "object") return graph;
        const g = graph;
        const setText = (nodeId, text) => {
            const n = g?.[nodeId];
            if (!n || typeof n !== "object") return false;
            if (!n.inputs || typeof n.inputs !== "object") n.inputs = {};
            if ("text" in n.inputs || n.class_type?.toLowerCase?.().includes("cliptextencode")) {
                n.inputs.text = String(text || "");
                return true;
            }
            return false;
        };

        let did = false;
        if (positiveNodeId) did = setText(positiveNodeId, promptText) || did;
        if (negativeNodeId) did = setText(negativeNodeId, negativePrompt) || did;
        if (did) return g;

        const clipNodes = Object.entries(g).filter(([_, n]) => {
            const ct = String(n?.class_type || "");
            return /CLIPTextEncode/i.test(ct);
        });
        if (clipNodes.length) {
            const [id1] = clipNodes[0];
            setText(id1, promptText);
            if (clipNodes.length > 1) {
                const [id2] = clipNodes[1];
                setText(id2, negativePrompt);
            }
        }
        return g;
    };

    let graph = parseWorkflow();
    graph = deepReplace(graph);
    graph = injectTextNodes(graph);

    try {
        const randSeed = () => Math.floor(Math.random() * 1e9);
        for (const n of Object.values(graph || {})) {
            const ct = String(n?.class_type || "");
            if (!/KSampler/i.test(ct)) continue;
            if (!n.inputs || typeof n.inputs !== "object") n.inputs = {};
            const sd = Number(n.inputs.seed);
            if (!Number.isFinite(sd) || sd < 0) n.inputs.seed = randSeed();
        }
    } catch (_) {}

    const client_id = `uie_${Date.now().toString(16)}_${Math.floor(Math.random() * 1e9).toString(16)}`;
    const fx = await fetchWithCorsProxyFallback(promptUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: graph, client_id })
    });
    const res = fx.response;
    if (!res.ok) {
        const err = await res.text();
        console.error("ComfyUI Error:", err);
        if (window.toastr) toastr.error("ComfyUI prompt failed");
        return null;
    }
    const data = await res.json();
    const prompt_id = String(data?.prompt_id || "");
    if (!prompt_id) return null;

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const deadline = Date.now() + 120_000;
    
    while (Date.now() < deadline) {
        await sleep(1000);
        let h;
        try {
            const hrFx = await fetchWithCorsProxyFallback(`${historyUrl}/${encodeURIComponent(prompt_id)}`, { method: "GET" });
            const hr = hrFx.response;
            if (!hr.ok) continue;
            h = await hr.json();
        } catch (_) {
            continue;
        }
        const job = h?.[prompt_id];
        const outputs = job?.outputs && typeof job.outputs === "object" ? job.outputs : null;
        if (!outputs) continue;

        const pickFromNode = (nodeId) => {
            const o = outputs?.[nodeId];
            const imgs = Array.isArray(o?.images) ? o.images : [];
            return imgs[0];
        };

        let target = null;
        if (outputNodeId) target = pickFromNode(outputNodeId);
        if (!target) {
            for (const k of Object.keys(outputs)) {
                target = pickFromNode(k);
                if (target) break;
            }
        }

        if (target) {
             const fname = target.filename;
             const sub = target.subfolder;
             const type = target.type;
             const query = `filename=${encodeURIComponent(fname)}&subfolder=${encodeURIComponent(sub)}&type=${encodeURIComponent(type)}`;
             const url = `${viewUrl}?${query}`;
             const r = await fetchWithCorsProxyFallback(url);
             const blob = await r.response.blob();
             return new Promise(resolve => {
                 const reader = new FileReader();
                 reader.onload = () => resolve(reader.result);
                 reader.readAsDataURL(blob);
             });
        }
    }
    return null;
}

export async function populateImageSettings(baseUrl, ckSel, saSel, scSel) {
    if (ckSel) ckSel.innerHTML = `<option value="">Loading…</option>`;
    if (saSel) saSel.innerHTML = `<option value="">Loading…</option>`;
    if (scSel) scSel.innerHTML = `<option value="">Loading…</option>`;

    const s = getSettings();
    const det = await detectBackend(baseUrl);

    if (det.type === "comfy") {
        const info = det.info;
        const checkpoints = getComfyEnum(info, "CheckpointLoaderSimple", "ckpt_name");
        const samplers = getComfyEnum(info, "KSampler", "sampler_name");
        const schedulers = getComfyEnum(info, "KSampler", "scheduler");

        fillSelect(ckSel, checkpoints, s.image?.comfy?.checkpoint);
        fillSelect(saSel, samplers, s.image?.comfy?.sampler);
        fillSelect(scSel, schedulers, s.image?.comfy?.scheduler);
        if (window.toastr) toastr.success("Connected to ComfyUI!");
        return;
    }

    if (det.type === "a1111") {
        const opts = await loadA1111(baseUrl);
        fillSelect(ckSel, opts.checkpoints, s.image?.comfy?.checkpoint);
        fillSelect(saSel, opts.samplers, s.image?.comfy?.sampler);
        fillSelect(scSel, opts.schedulers.length ? opts.schedulers : ["karras","sgm_uniform","exponential","ddim_uniform","normal","beta","beta57"], s.image?.comfy?.scheduler);
        if (window.toastr) toastr.success("Connected to A1111/SD.Next!");
        return;
    }

    // Unknown backend
    const errMsg = `<option value="">(Couldn’t detect backend)</option>`;
    if (ckSel) ckSel.innerHTML = errMsg;
    if (saSel) saSel.innerHTML = errMsg;
    if (scSel) scSel.innerHTML = errMsg;
    if (window.toastr) toastr.warning("Could not detect ComfyUI or A1111 at that URL.");
}

// Dummy Implementations for Missing Functions
async function detectBackend(url) {
    // Basic detection logic
    try {
        const r = await fetchWithCorsProxyFallback(`${url}/system_stats`);
        if(r.response.ok) return { type: "comfy", info: await fetchObjectInfo(url) };
    } catch(_) {}
    
    try {
        const r = await fetchWithCorsProxyFallback(`${url}/sdapi/v1/options`);
        if(r.response.ok) return { type: "a1111" };
    } catch(_) {}
    
    return { type: "unknown" };
}

async function fetchObjectInfo(url) {
    try {
        const r = await fetchWithCorsProxyFallback(`${url}/object_info`);
        return await r.response.json();
    } catch(e) { return {}; }
}

async function loadA1111(url) {
    const out = { checkpoints: [], samplers: [], schedulers: [] };
    try {
        const r1 = await fetchWithCorsProxyFallback(`${url}/sdapi/v1/sd-models`);
        const d1 = await r1.response.json();
        out.checkpoints = d1.map(x => x.title);
    } catch(_) {}
    try {
        const r2 = await fetchWithCorsProxyFallback(`${url}/sdapi/v1/samplers`);
        const d2 = await r2.response.json();
        out.samplers = d2.map(x => x.name);
    } catch(_) {}
    return out;
}

function getComfyEnum(info, classType, field) { 
    try {
        const def = info?.[classType]?.input?.required?.[field];
        if(Array.isArray(def) && Array.isArray(def[0])) return def[0];
    } catch(_) {}
    return []; 
}

function fillSelect(sel, items, selected) {
    if(!sel) return;
    sel.innerHTML = "";
    items.forEach(i => {
        const opt = document.createElement("option");
        opt.value = i;
        opt.textContent = i;
        if(i === selected) opt.selected = true;
        sel.appendChild(opt);
    });
}

export function initImageUi() {
    const refreshUi = () => {
        const val = $("#uie-img-provider").val();
        $("#uie-img-openai-block").hide();
        $("#uie-img-comfy-block").hide();
        $("#uie-img-sdwebui-block").hide();

        if (val === "comfy") $("#uie-img-comfy-block").show();
        else if (val === "sdwebui") $("#uie-img-sdwebui-block").show();
        else if (val === "openai") $("#uie-img-openai-block").show();
    };

    const applySettingsToInputs = () => {
        const s = getSettings();
        const img = s.image || {};
        if (typeof img.enabled === "boolean") $("#uie-img-enable").prop("checked", img.enabled);
        if (img.provider) $("#uie-img-provider").val(img.provider);
        if (img.url) $("#uie-img-url").val(img.url);
        if (img.key) $("#uie-img-key").val(img.key);
        if (img.model) {
            $("#uie-img-model").val(img.model);
            if ($("#uie-img-model-select option[value='" + img.model + "']").length) {
                $("#uie-img-model-select").val(img.model);
            }
        }
        if (img.negativePrompt) $("#uie-img-negative").val(img.negativePrompt);
        if (img.sdwebuiUrl) $("#uie-img-sdwebui-url").val(img.sdwebuiUrl);
        if (img.comfy) {
            if (img.comfy.base) $("#uie-img-comfy-base").val(img.comfy.base);
            if (img.comfy.key) $("#uie-img-comfy-key").val(img.comfy.key);
            if (img.comfy.checkpoint) $("#uie-img-comfy-ckpt").val(img.comfy.checkpoint);
            if (img.comfy.quality) $("#uie-img-comfy-quality").val(img.comfy.quality);
            if (img.comfy.sampler) $("#uie-img-comfy-sampler").val(img.comfy.sampler);
            if (img.comfy.scheduler) $("#uie-img-comfy-scheduler").val(img.comfy.scheduler);
            if (img.comfy.common) $("#uie-img-comfy-common").val(img.comfy.common);
            if (img.comfy.commonNeg) $("#uie-img-comfy-common-neg").val(img.comfy.commonNeg);
            if (img.comfy.workflow) $("#uie-img-comfy-workflow").val(img.comfy.workflow);
            if (img.comfy.positiveNodeId) $("#uie-img-comfy-posnode").val(img.comfy.positiveNodeId);
            if (img.comfy.negativeNodeId) $("#uie-img-comfy-negnode").val(img.comfy.negativeNodeId);
            if (img.comfy.outputNodeId) $("#uie-img-comfy-outnode").val(img.comfy.outputNodeId);
        }
        $("#uie-img-url-adv").val(img.url || "");
        $("#uie-img-key-adv").val(img.key || "");
        $("#uie-img-model-adv").val(img.model || "");
    };

    const syncSetting = (updater) => {
        const s = getSettings();
        if (!s.image) s.image = {};
        updater(s.image);
        saveSettings();
    };

    $(document).off("change.uieImg").on("change.uieImg", "#uie-img-provider", function() {
        syncSetting((img) => { img.provider = $(this).val(); });
        refreshUi();
    });

    $(document).off("change.uieImgEnable").on("change.uieImgEnable", "#uie-img-enable", function() {
        syncSetting((img) => { img.enabled = $(this).is(":checked"); });
    });

    $(document).off("input.uieImgUrl change.uieImgUrl").on("input.uieImgUrl change.uieImgUrl", "#uie-img-url, #uie-img-url-adv", function() {
        const val = String($(this).val() || "").trim();
        syncSetting((img) => { img.url = val; });
    });

    $(document).off("input.uieImgKey change.uieImgKey").on("input.uieImgKey change.uieImgKey", "#uie-img-key, #uie-img-key-adv", function() {
        const val = String($(this).val() || "").trim();
        syncSetting((img) => { img.key = val; });
    });

    $(document).off("change.uieImgModelSelect").on("change.uieImgModelSelect", "#uie-img-model-select", function() {
        const val = String($(this).val() || "").trim();
        if (val && val !== "__custom__") {
            $("#uie-img-model").val(val);
            syncSetting((img) => { img.model = val; });
        }
    });

    $(document).off("input.uieImgModel change.uieImgModel").on("input.uieImgModel change.uieImgModel", "#uie-img-model, #uie-img-model-adv", function() {
        const val = String($(this).val() || "").trim();
        syncSetting((img) => { img.model = val; });
    });

    $(document).off("input.uieImgNeg change.uieImgNeg").on("input.uieImgNeg change.uieImgNeg", "#uie-img-negative", function() {
        const val = String($(this).val() || "").trim();
        syncSetting((img) => { img.negativePrompt = val; });
    });

    $(document).off("input.uieImgSd change.uieImgSd").on("input.uieImgSd change.uieImgSd", "#uie-img-sdwebui-url", function() {
        const val = String($(this).val() || "").trim();
        syncSetting((img) => { img.sdwebuiUrl = val; });
    });

    $(document).off("input.uieImgComfy change.uieImgComfy").on("input.uieImgComfy change.uieImgComfy", "#uie-img-comfy-base, #uie-img-comfy-key, #uie-img-comfy-ckpt, #uie-img-comfy-quality, #uie-img-comfy-sampler, #uie-img-comfy-scheduler, #uie-img-comfy-common, #uie-img-comfy-common-neg, #uie-img-comfy-workflow, #uie-img-comfy-posnode, #uie-img-comfy-negnode, #uie-img-comfy-outnode", function() {
        const s = getSettings();
        if (!s.image) s.image = {};
        if (!s.image.comfy) s.image.comfy = {};
        s.image.comfy.base = String($("#uie-img-comfy-base").val() || "").trim();
        s.image.comfy.key = String($("#uie-img-comfy-key").val() || "").trim();
        s.image.comfy.checkpoint = String($("#uie-img-comfy-ckpt").val() || "").trim();
        s.image.comfy.quality = String($("#uie-img-comfy-quality").val() || "").trim();
        s.image.comfy.sampler = String($("#uie-img-comfy-sampler").val() || "").trim();
        s.image.comfy.scheduler = String($("#uie-img-comfy-scheduler").val() || "").trim();
        s.image.comfy.common = String($("#uie-img-comfy-common").val() || "").trim();
        s.image.comfy.commonNeg = String($("#uie-img-comfy-common-neg").val() || "").trim();
        s.image.comfy.workflow = String($("#uie-img-comfy-workflow").val() || "").trim();
        s.image.comfy.positiveNodeId = String($("#uie-img-comfy-posnode").val() || "").trim();
        s.image.comfy.negativeNodeId = String($("#uie-img-comfy-negnode").val() || "").trim();
        s.image.comfy.outputNodeId = String($("#uie-img-comfy-outnode").val() || "").trim();
        saveSettings();
    });

    $(document).off("click.uieImgRefresh").on("click.uieImgRefresh", "#uie-img-comfy-ckpt-refresh", function(e) {
        e.preventDefault();
        const url = $("#uie-img-comfy-base").val();
        if(!url) return toastr.warning("Enter ComfyUI URL first");
        populateImageSettings(url, 
            document.getElementById("uie-img-comfy-ckpt"),
            document.getElementById("uie-img-comfy-sampler"),
            document.getElementById("uie-img-comfy-scheduler")
        );
    });
    
    const applyImgPreset = () => {
        const p = $("#uie-img-preset").val();
        if(p === "nanogpt") {
            $("#uie-img-url").val("https://nano-gpt.com/api/v1/images/generations");
            $("#uie-img-model-select").val("hidream");
            $("#uie-img-model").val("hidream");
            $("#uie-img-key").val("");
            if(window.toastr) toastr.success("Applied NanoGPT Preset");
        } else if (p === "openai") {
            $("#uie-img-url").val("https://api.openai.com/v1/images/generations");
            $("#uie-img-model-select").val("dall-e-3");
            $("#uie-img-model").val("dall-e-3");
            if(window.toastr) toastr.success("Applied OpenAI Preset");
        }
        $("#uie-img-url").trigger("change");
    };

    $(document).off("click.uieImgPreset").on("click.uieImgPreset", "#uie-img-preset-apply", function(e) {
        e.preventDefault();
        e.stopPropagation();
        applyImgPreset();
    });
    // Auto-apply on change as well
    $(document).off("change.uieImgPreset").on("change.uieImgPreset", "#uie-img-preset", function(e) {
        e.preventDefault();
        e.stopPropagation();
        applyImgPreset();
    });
    
    // Initial State
    const s = getSettings();
    if (s.image?.provider) $("#uie-img-provider").val(s.image.provider);
    applySettingsToInputs();
    refreshUi();
}
