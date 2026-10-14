// ============================================================================
//  Campus Lost & Found - frontend
//  Hosted on GitHub Pages. Talks to API Gateway -> Lambda -> DynamoDB / S3.
//  Matching (text + photo comparison) runs here in the browser over the
//  reports returned by the API, so it needs no extra AWS service or cost.
// ============================================================================

const API_URL = "https://nx4myenwb6.execute-api.ap-southeast-2.amazonaws.com/prod/items";

// ---------------------------------------------------------------------------
//  MATCHING SETTINGS  (change these to tune the matcher - weights add up to 1)
// ---------------------------------------------------------------------------
const MATCH_CONFIG = {
    weights: {
        image: 0.40,        // how alike the two PHOTOS look
        category: 0.10,     // same category
        title: 0.15,        // words shared by the two item names
        description: 0.10,  // words shared by the two descriptions
        location: 0.15,     // same / overlapping place
        date: 0.10          // found on or soon after the lost date
    },
    threshold: 45,          // minimum score (0-100) to show a potential match
    minTextSignal: 0.15,    // name/description similarity that counts as a text signal
    minImageSignal: 0.50,   // photo similarity (0-1) that counts as a signal on its own
    dateWindowDays: 14,     // date score falls to 0 after this many days apart
    maxShown: 10,           // most matches displayed

    // Photo comparison. The four image measures are blended, then stretched so that
    // `low` (or less) = unrelated photos = 0 and `high` (or more) = near-identical = 1.
    image: {
        size: 64,           // photos are shrunk to size x size before measuring
        maxPhotos: 40,      // most photos analysed per page load
        wColor: 0.40,       // colour make-up of the object
        wLayout: 0.15,      // where the colours sit in the picture
        wEdge: 0.20,        // outline / pattern directions
        wTexture: 0.15,     // smooth object vs. detailed object
        wHash: 0.10,        // coarse brightness fingerprint
        low: 0.60,
        high: 0.90
    }
};

// Shown in the match dialog. No student contact details are ever stored or shown.
const NEXT_STEP_TEXT =
    "To claim or return this item, visit the campus Lost & Found desk with your student ID " +
    "and quote the reference codes below. Staff will verify ownership before releasing the item.";

const form = document.getElementById("itemForm");
const message = document.getElementById("message");
const records = document.getElementById("records");
const empty = document.getElementById("empty");
const search = document.getElementById("search");
const filter = document.getElementById("filter");
const photoInput = document.getElementById("photo");
const matchesBox = document.getElementById("matches");
const noMatches = document.getElementById("noMatches");

let items = [];
let currentMatches = [];

// A small status line above the matches ("Comparing photos... 3/8")
const photoNote = document.createElement("p");
photoNote.id = "photoNote";
photoNote.className = "matches-intro";
if (matchesBox && matchesBox.parentNode) matchesBox.parentNode.insertBefore(photoNote, matchesBox);

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function showMessage(text, isError = false) {
    if (!message) return;
    message.textContent = text;
    message.style.color = isError ? "#dc2626" : "#15803d";
}

function formatDate(value) {
    if (!value) return "";
    const d = new Date(value);
    if (isNaN(d)) return String(value);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function shortCode(id) {
    return String(id || "").slice(0, 8).toUpperCase();
}

// ---------------------------------------------------------------------------
//  PHOTO READING (browser side; the backend validates again)
// ---------------------------------------------------------------------------
function readPhotoAsBase64(file) {
    return new Promise((resolve, reject) => {
        if (!file) {
            resolve(null);
            return;
        }

        const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

        if (!allowedTypes.includes(file.type)) {
            reject(new Error("Please choose a JPEG, PNG, or WebP image."));
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            reject(new Error("Photo must be smaller than 5 MB."));
            return;
        }

        const reader = new FileReader();

        reader.onload = () => {
            const result = String(reader.result);
            resolve({
                data: result.split(",")[1],
                type: file.type
            });
        };

        reader.onerror = () => {
            reject(new Error("Could not read the selected photo."));
        };

        reader.readAsDataURL(file);
    });
}

// If a photo link fails to load (expired / missing), swap in a neutral placeholder.
// "error" events do not bubble, so this listens in the capture phase.
document.addEventListener("error", (event) => {
    const img = event.target;
    if (img && img.tagName === "IMG" && img.classList.contains("js-photo")) {
        const box = document.createElement("div");
        box.className = img.classList.contains("match-photo")
            ? "photo-missing match-photo"
            : "photo-missing";
        box.textContent = "Photo unavailable";
        img.replaceWith(box);
    }
}, true);

function photoMarkup(item, extraClass = "") {
    const url = typeof item.photo_url === "string" ? item.photo_url : "";
    if (!url) {
        return `<div class="photo-missing ${extraClass}">No photo</div>`;
    }
    const cls = extraClass ? `item-photo js-photo ${extraClass}` : "item-photo js-photo";
    return `<img class="${cls}" src="${escapeHTML(url)}" alt="${escapeHTML(item.title || "Item photo")}" loading="lazy">`;
}

// ---------------------------------------------------------------------------
//  PHOTO COMPARISON
//  Each photo is shrunk to 64x64 and turned into five small "fingerprints":
//    1. colour make-up   - which colours the OBJECT has (plain background ignored)
//    2. colour layout    - average colour in a 4x4 grid (where the colours sit)
//    3. edge directions  - outline / pattern directions (gradient directions)
//    4. texture          - how detailed the surface is (smooth apple vs. layered rose)
//    5. brightness hash  - a 64-bit light/dark pattern
//  Two photos are compared by comparing their fingerprints. This does NOT recognise
//  what the object is; it measures how alike the two pictures look.
// ---------------------------------------------------------------------------
const COLOR_BINS = 52;                  // 4 grey levels + 12 hues x 2 saturations x 2 brightnesses
const CACHE_PREFIX = "lf_photo_v2_";    // browser cache so photos are not re-analysed every visit
const imageFeatures = new Map();        // item_id -> fingerprints, or null if the photo could not be read
const photoErrors = new Map();         // item_id -> "blocked" (network/CORS) or "link" (HTTP error)

function colorBin(r, g, b) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    const v = max / 255;
    const s = max === 0 ? 0 : d / max;

    if (v < 0.25) return 0;                           // black / very dark: hue is unreliable here
    if (s < 0.18) return v < 0.5 ? 1 : v < 0.8 ? 2 : 3;   // grey / white

    let h;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;

    const hueBin = Math.floor(h / 30) % 12;
    return 4 + hueBin * 4 + (s < 0.5 ? 0 : 2) + (v < 0.5 ? 0 : 1);
}

// Spread each colour a little into the neighbouring hues, so "red" at 359 degrees and
// "red" at 1 degree are not treated as different colours.
function smoothHues(hist) {
    const out = hist.slice();
    for (let h = 0; h < 12; h++) {
        for (let k = 0; k < 4; k++) {
            const here = 4 + h * 4 + k;
            const prev = 4 + ((h + 11) % 12) * 4 + k;
            const next = 4 + ((h + 1) % 12) * 4 + k;
            out[here] = 0.5 * hist[here] + 0.25 * hist[prev] + 0.25 * hist[next];
        }
    }
    return out;
}

function round4(list) {
    return Array.from(list, (n) => Math.round(n * 10000) / 10000);
}

// data = RGBA pixels of a size x size image
function extractFeatures(data) {
    const N = MATCH_CONFIG.image.size;
    const gray = new Float32Array(N * N);
    const bins = new Uint8Array(N * N);
    const grid = new Float32Array(48);
    const gridCount = new Float32Array(16);
    const cellSize = N / 4;

    for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
            const i = y * N + x;
            const p = i * 4;
            const r = data[p], g = data[p + 1], b = data[p + 2];
            gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
            bins[i] = colorBin(r, g, b);
            const cell = Math.floor(y / cellSize) * 4 + Math.floor(x / cellSize);
            grid[cell * 3] += r / 255;
            grid[cell * 3 + 1] += g / 255;
            grid[cell * 3 + 2] += b / 255;
            gridCount[cell]++;
        }
    }
    for (let c = 0; c < 16; c++) {
        for (let k = 0; k < 3; k++) grid[c * 3 + k] /= gridCount[c];
    }

    // --- background: if one colour family fills most of the picture's border, it is the backdrop.
    //     (all shades of one hue count together, so a wooden table in dim or bright light is still "table")
    const groupOf = (bin) => (bin < 4 ? bin : 4 + Math.floor((bin - 4) / 4));
    const border = new Float32Array(16);
    let borderTotal = 0;
    const ring = Math.max(2, Math.round(N / 16));
    for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
            if (x < ring || y < ring || x >= N - ring || y >= N - ring) {
                border[groupOf(bins[y * N + x])]++;
                borderTotal++;
            }
        }
    }
    let bg = -1, bgMax = 0;
    for (let g = 0; g < 16; g++) {
        if (border[g] > bgMax) { bgMax = border[g]; bg = g; }
    }
    if (bgMax / borderTotal < 0.35) bg = -1;

    // --- colour make-up, centre pixels count more, backdrop colour left out ---
    const all = new Float32Array(COLOR_BINS);
    const object = new Float32Array(COLOR_BINS);
    let allTotal = 0, objectTotal = 0;
    const sigma = 0.35;
    for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
            const dx = (x + 0.5) / N - 0.5;
            const dy = (y + 0.5) / N - 0.5;
            const weight = 0.4 + Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
            const bin = bins[y * N + x];
            all[bin] += weight;
            allTotal += weight;
            if (groupOf(bin) !== bg) {
                object[bin] += weight;
                objectTotal += weight;
            }
        }
    }
    const useObject = bg >= 0 && objectTotal > 0.05 * allTotal;
    const source = useObject ? object : all;
    const sourceTotal = useObject ? objectTotal : allTotal;
    const hist = smoothHues(Array.from(source, (n) => n / sourceTotal));

    // --- edge directions (Sobel), 8 directions x 4 quadrants ---
    const edges = new Float32Array(32);
    let strongEdges = 0;
    for (let y = 1; y < N - 1; y++) {
        for (let x = 1; x < N - 1; x++) {
            const a = gray[(y - 1) * N + x - 1], b = gray[(y - 1) * N + x], c = gray[(y - 1) * N + x + 1];
            const d = gray[y * N + x - 1], f = gray[y * N + x + 1];
            const g = gray[(y + 1) * N + x - 1], h = gray[(y + 1) * N + x], i = gray[(y + 1) * N + x + 1];
            const gx = (c + 2 * f + i) - (a + 2 * d + g);
            const gy = (g + 2 * h + i) - (a + 2 * b + c);
            const mag = Math.hypot(gx, gy);
            if (mag < 24) continue;                       // ignore noise / flat areas
            strongEdges++;
            let angle = Math.atan2(gy, gx);
            if (angle < 0) angle += Math.PI;
            const dir = Math.min(7, Math.floor((angle / Math.PI) * 8));
            const quadrant = (y < N / 2 ? 0 : 2) + (x < N / 2 ? 0 : 1);
            edges[quadrant * 8 + dir] += mag;
        }
    }
    let norm = 0;
    for (let k = 0; k < 32; k++) norm += edges[k] * edges[k];
    norm = Math.sqrt(norm) || 1;
    for (let k = 0; k < 32; k++) edges[k] /= norm;

    // --- brightness hash: 8x8 blocks, 1 if brighter than the picture's average ---
    const block = N / 8;
    const means = new Float32Array(64);
    let sum = 0;
    for (let by = 0; by < 8; by++) {
        for (let bx = 0; bx < 8; bx++) {
            let s = 0;
            for (let y = 0; y < block; y++) {
                for (let x = 0; x < block; x++) s += gray[(by * block + y) * N + bx * block + x];
            }
            means[by * 8 + bx] = s / (block * block);
            sum += means[by * 8 + bx];
        }
    }
    const avg = sum / 64;
    const hash = Array.from(means, (m) => (m > avg ? 1 : 0));

    const texture = strongEdges / ((N - 2) * (N - 2));   // share of pixels that sit on an edge

    return { hist: round4(hist), grid: round4(grid), edges: round4(edges), texture: Math.round(texture * 10000) / 10000, hash };
}

function photoSimilarityParts(a, b) {
    let color = 0;
    for (let i = 0; i < a.hist.length; i++) color += Math.min(a.hist[i], b.hist[i]);

    let diff = 0;
    for (let i = 0; i < a.grid.length; i++) diff += Math.abs(a.grid[i] - b.grid[i]);
    const layout = Math.max(0, 1 - (2.5 * diff) / a.grid.length);

    let edge = 0;
    for (let i = 0; i < a.edges.length; i++) edge += a.edges[i] * b.edges[i];

    let same = 0;
    for (let i = 0; i < a.hash.length; i++) if (a.hash[i] === b.hash[i]) same++;
    const hash = same / a.hash.length;

    const texture = (Math.min(a.texture, b.texture) + 0.02) / (Math.max(a.texture, b.texture) + 0.02);

    return { color, layout, edge, texture, hash };
}

// 0 = clearly different pictures, 1 = (nearly) the same picture
function photoSimilarity(a, b) {
    const c = MATCH_CONFIG.image;
    const p = photoSimilarityParts(a, b);
    const raw = c.wColor * p.color + c.wLayout * p.layout + c.wEdge * p.edge + c.wTexture * p.texture + c.wHash * p.hash;
    return Math.max(0, Math.min(1, (raw - c.low) / (c.high - c.low)));
}

async function featuresFromUrl(url) {
    // fetch() + blob keeps the pixels same-origin, so the canvas is never "tainted".
    // This needs the S3 bucket's CORS rule to allow this website (see instructions).
    const response = await fetch(url, { mode: "cors", cache: "no-store" });
    if (!response.ok) throw new Error("Photo download failed: HTTP " + response.status);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    const N = MATCH_CONFIG.image.size;
    const canvas = document.createElement("canvas");
    canvas.width = N;
    canvas.height = N;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#ffffff";                         // transparent PNGs become white
    ctx.fillRect(0, 0, N, N);
    const side = Math.min(bitmap.width, bitmap.height);   // centre-crop to a square
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, N, N);
    if (bitmap.close) bitmap.close();
    return extractFeatures(ctx.getImageData(0, 0, N, N).data);
}

function readCachedFeatures(item) {
    try {
        const saved = JSON.parse(localStorage.getItem(CACHE_PREFIX + item.item_id) || "null");
        if (saved && saved.key === item.photo_key && saved.f && saved.f.hist && saved.f.texture !== undefined) return saved.f;
    } catch (e) { /* storage unavailable - just analyse again */ }
    return null;
}

function saveCachedFeatures(item, features) {
    try {
        localStorage.setItem(CACHE_PREFIX + item.item_id, JSON.stringify({ key: item.photo_key, f: features }));
    } catch (e) { /* storage full or blocked - ignore */ }
}

function photoTargets() {
    return items
        .filter((i) => ["LOST", "FOUND"].includes(String(i.status).toUpperCase()))
        .filter((i) => typeof i.photo_url === "string" && i.photo_url)
        .slice(0, MATCH_CONFIG.image.maxPhotos);
}

function updatePhotoNote() {
    const targets = photoTargets();
    if (!targets.length) { photoNote.textContent = ""; return; }

    const pending = targets.filter((i) => !imageFeatures.has(i.item_id)).length;
    const failed = targets.filter((i) => imageFeatures.get(i.item_id) === null).length;
    const ok = targets.length - pending - failed;

    if (pending) {
        photoNote.textContent = `Comparing photos... ${targets.length - pending}/${targets.length} analysed.`;
    } else if (failed) {
        const blocked = targets.filter((i) => photoErrors.get(i.item_id) === "blocked").length;
        photoNote.textContent =
            `Photo comparison is active for ${ok} photo(s). ${failed} photo(s) could not be read, ` +
            `so those reports were matched on text only.` +
            (blocked ? " The storage bucket must allow this website to read photos (see setup notes)." : "");
    } else {
        photoNote.textContent = `Photo comparison active - ${ok} photo(s) analysed.`;
    }
}

let analysisRunning = false;
let analysisAgain = false;

async function analyzePhotos() {
    if (analysisRunning) { analysisAgain = true; return; }
    analysisRunning = true;
    try {
        do {
            analysisAgain = false;
            const todo = [];
            for (const item of photoTargets()) {
                if (imageFeatures.has(item.item_id)) continue;
                const cached = readCachedFeatures(item);
                if (cached) imageFeatures.set(item.item_id, cached);
                else todo.push(item);
            }
            updatePhotoNote();

            let next = 0;
            const worker = async () => {
                while (next < todo.length) {
                    const item = todo[next++];
                    try {
                        const features = await featuresFromUrl(item.photo_url);
                        imageFeatures.set(item.item_id, features);
                        saveCachedFeatures(item, features);
                    } catch (error) {
                        console.warn("Photo comparison skipped for", item.item_id, error);
                        photoErrors.set(item.item_id, error instanceof TypeError ? "blocked" : "link");
                        imageFeatures.set(item.item_id, null);
                    }
                    updatePhotoNote();
                }
            };
            await Promise.all([worker(), worker(), worker()]);
        } while (analysisAgain);
    } finally {
        analysisRunning = false;
        updatePhotoNote();
        renderMatches();
    }
}

// ---------------------------------------------------------------------------
//  MATCHING ENGINE
//  Compares every LOST report with every FOUND report (never LOST-LOST or
//  FOUND-FOUND), scores each pair out of 100 and explains the score.
// ---------------------------------------------------------------------------
const STOPWORDS = new Set((
    "a an the and or of in on at to for with my your is it its was were be been this that " +
    "near by from has have had i me we our left lost found item very some one"
).split(" "));

// Words that mean the same thing are mapped to one word before comparing.
const SYNONYM_GROUPS = [
    ["phone", "mobile", "cellphone", "smartphone", "iphone", "android"],
    ["bag", "backpack", "rucksack", "handbag", "satchel", "sack"],
    ["wallet", "purse", "billfold"],
    ["laptop", "macbook", "notebook-computer"],
    ["bottle", "flask", "tumbler"],
    ["key", "keychain", "keyring"],
    ["glasses", "spectacles", "eyeglasses", "specs"],
    ["earphone", "earbud", "headphone", "airpod", "headset"],
    ["charger", "adapter", "adaptor"],
    ["watch", "smartwatch", "wristwatch"],
    ["umbrella", "brolly"],
    ["flower", "rose", "tulip", "lily", "sunflower", "daisy"]
];
const SYNONYMS = {};
SYNONYM_GROUPS.forEach((group) => group.forEach((word) => { SYNONYMS[word] = group[0]; }));

function canonicalWord(word) {
    if (SYNONYMS[word]) return SYNONYMS[word];
    const singular = word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;
    return SYNONYMS[singular] || singular;
}

function tokenize(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .split(" ")
        .filter((w) => w.length > 1 && !STOPWORDS.has(w))
        .map(canonicalWord);
}

function intersect(a, b) {
    const setB = new Set(b);
    return [...new Set(a)].filter((w) => setB.has(w));
}

// Dice coefficient: 2*shared / (size A + size B). 1 = same words, 0 = nothing shared.
function diceSimilarity(a, b) {
    const setA = new Set(a);
    const setB = new Set(b);
    if (!setA.size || !setB.size) return 0;
    const shared = [...setA].filter((w) => setB.has(w)).length;
    return (2 * shared) / (setA.size + setB.size);
}

// Overlap coefficient: shared / smaller set. "library" vs "library second floor" = 1.
function overlapSimilarity(a, b) {
    const setA = new Set(a);
    const setB = new Set(b);
    if (!setA.size || !setB.size) return 0;
    const shared = [...setA].filter((w) => setB.has(w)).length;
    return shared / Math.min(setA.size, setB.size);
}

function parseDay(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 : null;
}

// Found on the same day or after the loss scores best; falls to 0 at dateWindowDays.
// A found date more than 1 day BEFORE the lost date is impossible, so it scores 0.
function dateScore(lostDate, foundDate) {
    const lostDay = parseDay(lostDate);
    const foundDay = parseDay(foundDate);
    if (lostDay === null || foundDay === null) return { score: 0, days: null };
    const gap = foundDay - lostDay;
    if (gap < -1) return { score: 0, days: gap };
    const score = Math.max(0, 1 - Math.abs(gap) / MATCH_CONFIG.dateWindowDays);
    return { score, days: gap };
}

function scorePair(lost, found) {
    const w = MATCH_CONFIG.weights;

    // Photo comparison only counts when BOTH reports have an analysed photo.
    // Otherwise its weight is shared out among the other signals, so text-only
    // reports are still scored out of 100.
    const featuresA = imageFeatures.get(lost.item_id);
    const featuresB = imageFeatures.get(found.item_id);
    const imageCompared = !!(featuresA && featuresB);
    const imageSim = imageCompared ? photoSimilarity(featuresA, featuresB) : 0;
    const scale = imageCompared ? 1 : 1 / (1 - w.image);

    const titleA = tokenize(lost.title), titleB = tokenize(found.title);
    const titleShared = intersect(titleA, titleB);
    const titleSim = diceSimilarity(titleA, titleB);

    const descA = tokenize(lost.description), descB = tokenize(found.description);
    const descShared = intersect(descA, descB);
    const descSim = diceSimilarity(descA, descB);

    const locA = tokenize(lost.location);
    const locB = tokenize(found.location);
    const locShared = intersect(locA, locB);
    const locSim = overlapSimilarity(locA, locB);

    const sameCategory =
        String(lost.category || "").trim().toLowerCase() ===
        String(found.category || "").trim().toLowerCase() &&
        String(lost.category || "").trim() !== "";
    const catSim = sameCategory ? 1 : 0;

    const date = dateScore(lost.date, found.date);

    const part = (weight, similarity, extra = {}) => ({
        weight, similarity, points: weight * similarity * 100, ...extra
    });

    const parts = {
        image: part(imageCompared ? w.image : 0, imageSim, { compared: imageCompared }),
        category: part(w.category * scale, catSim),
        title: part(w.title * scale, titleSim, { shared: titleShared }),
        description: part(w.description * scale, descSim, { shared: descShared }),
        location: part(w.location * scale, locSim, { shared: locShared }),
        date: part(w.date * scale, date.score, { days: date.days })
    };

    const total = Object.values(parts).reduce((sum, p) => sum + p.points, 0);

    return {
        score: Math.round(total),
        parts,
        hasTextSignal: Math.max(titleSim, descSim) >= MATCH_CONFIG.minTextSignal,
        hasImageSignal: imageCompared && imageSim >= MATCH_CONFIG.minImageSignal
    };
}

function matchLabel(score) {
    if (score >= 75) return "Strong match";
    if (score >= 60) return "Likely match";
    return "Possible match";
}

function explain(parts) {
    const reasons = [];
    if (parts.image.compared) {
        const pct = Math.round(parts.image.similarity * 100);
        if (parts.image.similarity >= 0.5) reasons.push(`photos look alike (${pct}%)`);
        else if (parts.image.similarity >= 0.2) reasons.push(`photos look somewhat alike (${pct}%)`);
        else reasons.push("photos look different");
    }
    if (parts.category.similarity === 1) reasons.push("same category");
    if (parts.title.shared.length) reasons.push("name words in common: " + parts.title.shared.join(", "));
    if (parts.description.shared.length) reasons.push("description words in common: " + parts.description.shared.join(", "));
    if (parts.location.shared.length) reasons.push("similar location: " + parts.location.shared.join(" "));
    if (parts.date.days !== null && parts.date.similarity > 0) {
        const d = Math.abs(parts.date.days);
        reasons.push(d === 0 ? "reported on the same day" : `reported ${d} day${d === 1 ? "" : "s"} apart`);
    }
    return reasons;
}

function computeMatches(allItems) {
    const active = allItems.filter((i) => ["LOST", "FOUND"].includes(String(i.status).toUpperCase()));
    const lostItems = active.filter((i) => String(i.status).toUpperCase() === "LOST");
    const foundItems = active.filter((i) => String(i.status).toUpperCase() === "FOUND");

    const matches = [];

    // Every LOST x FOUND pair is visited exactly once, so no duplicates and no self-matches.
    for (const lost of lostItems) {
        for (const found of foundItems) {
            if (lost.item_id && lost.item_id === found.item_id) continue;
            const result = scorePair(lost, found);
            // Category + place + date alone is not enough: need shared words OR alike photos.
            if (!result.hasTextSignal && !result.hasImageSignal) continue;
            if (result.score < MATCH_CONFIG.threshold) continue;
            matches.push({ lost, found, score: result.score, parts: result.parts, reasons: explain(result.parts) });
        }
    }

    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, MATCH_CONFIG.maxShown);
}

// ---------------------------------------------------------------------------
//  RENDERING
// ---------------------------------------------------------------------------
function sideMarkup(item, label, cls) {
    return `
        <div class="match-side ${cls}">
            <span class="item-status ${cls}">${label}</span>
            ${photoMarkup(item, "match-photo")}
            <h4>${escapeHTML(item.title || "Untitled item")}</h4>
            <p><strong>Where:</strong> ${escapeHTML(item.location || "Not specified")}</p>
            <p><strong>Date:</strong> ${escapeHTML(formatDate(item.date) || "Not specified")}</p>
        </div>`;
}

function renderMatches() {
    if (!matchesBox) return;

    currentMatches = computeMatches(items);

    const hasLost = items.some((i) => String(i.status).toUpperCase() === "LOST");
    const hasFound = items.some((i) => String(i.status).toUpperCase() === "FOUND");

    if (!currentMatches.length) {
        matchesBox.innerHTML = "";
        if (noMatches) {
            noMatches.style.display = "block";
            noMatches.innerHTML = !hasLost || !hasFound
                ? "<b>No matches yet</b><p>Matches appear once there is at least one LOST and one FOUND report.</p>"
                : `<b>No potential matches found</b><p>No LOST and FOUND pair scores ${MATCH_CONFIG.threshold} or more yet. Try adding more detail or a clear photo to the reports.</p>`;
        }
        return;
    }

    if (noMatches) noMatches.style.display = "none";

    matchesBox.innerHTML = currentMatches.map((m, index) => `
        <article class="match-card">
            <div class="match-head">
                <span class="score-badge">${m.score}% &middot; ${matchLabel(m.score)}</span>
                <button type="button" class="btn-secondary" data-match="${index}">Review match</button>
            </div>
            <div class="match-grid">
                ${sideMarkup(m.lost, "LOST", "lost")}
                ${sideMarkup(m.found, "FOUND", "found")}
            </div>
            <p class="match-why"><strong>Why:</strong> ${escapeHTML(m.reasons.join(" · ") || "weak signals only")}</p>
        </article>
    `).join("");
}

function openMatchDetail(index) {
    const m = currentMatches[index];
    const dialog = document.getElementById("dialog");
    const detail = document.getElementById("detail");
    if (!m || !dialog || !detail) return;

    const p = m.parts;
    const row = (label, part) =>
        `<tr><td>${label}</td><td>${Math.round(part.points)} / ${Math.round(part.weight * 100)}</td></tr>`;
    const photoRow = p.image.compared
        ? row("Photo similarity", p.image)
        : `<tr><td>Photo similarity</td><td>not compared</td></tr>`;

    detail.innerHTML = `
        <h3>${escapeHTML(matchLabel(m.score))} &mdash; ${m.score}%</h3>
        <div class="match-grid">
            ${sideMarkup(m.lost, "LOST", "lost")}
            ${sideMarkup(m.found, "FOUND", "found")}
        </div>
        <p><strong>Lost description:</strong> ${escapeHTML(m.lost.description || "-")}</p>
        <p><strong>Found description:</strong> ${escapeHTML(m.found.description || "-")}</p>
        <table class="score-table">
            <tr><th>Signal</th><th>Points</th></tr>
            ${photoRow}
            ${row("Category", p.category)}
            ${row("Item name", p.title)}
            ${row("Description", p.description)}
            ${row("Location", p.location)}
            ${row("Date", p.date)}
            <tr><th>Total</th><th>${m.score} / 100</th></tr>
        </table>
        <p class="note">Photo similarity measures how alike the two pictures look (colours, layout and
        outlines). It does not identify what the object is, so a person should always compare the
        photos by eye before anything is handed over.</p>
        <p><strong>Next step:</strong> ${escapeHTML(NEXT_STEP_TEXT)}</p>
        <p class="codes">Lost ref: <b>${escapeHTML(shortCode(m.lost.item_id))}</b> &nbsp;|&nbsp;
        Found ref: <b>${escapeHTML(shortCode(m.found.item_id))}</b></p>
    `;

    if (dialog.showModal) dialog.showModal();
}

async function loadItems() {
    try {
        const response = await fetch(API_URL);

        if (!response.ok) {
            throw new Error("AWS returned status " + response.status);
        }

        const data = await response.json();

        items = Array.isArray(data)
            ? data
            : Array.isArray(data.items)
                ? data.items
                : Array.isArray(data.body)
                    ? data.body
                    : typeof data.body === "string"
                        ? JSON.parse(data.body)
                        : [];

        renderItems();
        renderMatches();          // text-based matches show immediately...
        analyzePhotos();          // ...then photo comparison refines them when it finishes
    } catch (error) {
        console.error("Loading reports failed:", error);
        showMessage("Could not load reports from AWS. Please refresh and try again.", true);
    }
}

function renderItems() {
    if (!records) return;

    const query = (search?.value || "").trim().toLowerCase();
    const selectedFilter = filter?.value || "ALL";

    const visibleItems = items.filter((item) => {
        const status = String(item.status || "LOST").toUpperCase();

        const matchesStatus =
            selectedFilter === "ALL" || status === selectedFilter;

        const searchableText = [
            item.title,
            item.description,
            item.location,
            item.category
        ].join(" ").toLowerCase();

        return matchesStatus && searchableText.includes(query);
    });

    const lost = items.filter(
        (item) => String(item.status).toUpperCase() === "LOST"
    ).length;

    const found = items.filter(
        (item) => String(item.status).toUpperCase() === "FOUND"
    ).length;

    const returned = items.filter(
        (item) => String(item.status).toUpperCase() === "RETURNED"
    ).length;

    const lostCount = document.getElementById("lostCount");
    const foundCount = document.getElementById("foundCount");
    const returnedCount = document.getElementById("returnedCount");
    const count = document.getElementById("count");

    if (lostCount) lostCount.textContent = lost;
    if (foundCount) foundCount.textContent = found;
    if (returnedCount) returnedCount.textContent = returned;
    if (count) count.textContent = `${visibleItems.length} items`;

    records.innerHTML = visibleItems.map((item) => {
        const status = String(item.status || "LOST").toUpperCase();
        const title = escapeHTML(item.title || "Untitled item");
        const description = escapeHTML(item.description || "");
        const location = escapeHTML(item.location || "Not specified");
        const category = escapeHTML(item.category || "Other");
        const reported = escapeHTML(formatDate(item.created_at));

        return `
            <article class="item-card">
                <span class="item-status ${status.toLowerCase()}">${escapeHTML(status)}</span>
                ${photoMarkup(item)}
                <h3>${title}</h3>
                <p>${description}</p>
                <p><strong>Category:</strong> ${category}</p>
                <p><strong>Location:</strong> ${location}</p>
                ${reported ? `<p class="item-date">Reported: ${reported}</p>` : ""}
            </article>
        `;
    }).join("");

    if (empty) {
        empty.style.display = visibleItems.length ? "none" : "block";
    }
}

// ---------------------------------------------------------------------------
//  FORM SUBMIT
// ---------------------------------------------------------------------------
if (form) {
    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const title =
            document.getElementById("name")?.value.trim() || "";

        const status =
            document.getElementById("type")?.value.toUpperCase() || "LOST";

        const description =
            document.getElementById("description")?.value.trim() || "";

        const location =
            document.getElementById("location")?.value.trim() || "";

        const category =
            document.getElementById("category")?.value || "Other";

        const date =
            document.getElementById("date")?.value || "";

        if (!title) {
            showMessage("Please enter the item name.", true);
            return;
        }

        if (!["LOST", "FOUND"].includes(status)) {
            showMessage("Please select Lost or Found.", true);
            return;
        }

        let photo = null;

        try {
            photo = await readPhotoAsBase64(photoInput?.files?.[0]);
        } catch (error) {
            showMessage(error.message, true);
            return;
        }

        const submitButton = form.querySelector(
            'button[type="submit"], input[type="submit"]'
        );

        if (submitButton) submitButton.disabled = true;
        showMessage(photo ? "Uploading photo and saving report..." : "Submitting report to AWS...");

        try {
            const response = await fetch(API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    title,
                    description,
                    location,
                    category,
                    date,
                    status,
                    photo
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || "Request failed");
            }

            form.reset();
            showMessage("Report saved successfully in AWS!");
            await loadItems();
        } catch (error) {
            console.error("Submitting report failed:", error);
            showMessage(
                error.message || "Could not submit the report. Please try again.",
                true
            );
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });
}

if (search) search.addEventListener("input", renderItems);
if (filter) filter.addEventListener("change", renderItems);

if (matchesBox) {
    matchesBox.addEventListener("click", (event) => {
        const button = event.target.closest("[data-match]");
        if (button) openMatchDetail(Number(button.dataset.match));
    });
}

const closeButton = document.getElementById("close");

if (closeButton) {
    closeButton.addEventListener("click", () => {
        const dialog = document.getElementById("dialog");
        if (dialog?.close) dialog.close();
    });
}

loadItems();
