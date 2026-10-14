// ============================================================================
//  Campus Lost & Found - frontend
//  Hosted on GitHub Pages. Talks to API Gateway -> Lambda -> DynamoDB / S3.
//  Matching runs here in the browser over the reports returned by the API.
// ============================================================================

const API_URL = "https://nx4myenwb6.execute-api.ap-southeast-2.amazonaws.com/prod/items";
// ---------------------------------------------------------------------------
//  MATCHING SETTINGS  (change these to tune the matcher - weights add up to 1)
// ---------------------------------------------------------------------------
const MATCH_CONFIG = {
    weights: {
        category: 0.20,     // same category
        title: 0.30,        // words shared by the two item names
        description: 0.20,  // words shared by the two descriptions
        location: 0.20,     // same / overlapping place
        date: 0.10          // found on or soon after the lost date
    },
    threshold: 45,          // minimum score (0-100) to show a potential match
    minTextSignal: 0.15,    // at least one of title/description must be this similar
    dateWindowDays: 14,     // date score falls to 0 after this many days apart
    maxShown: 10            // most matches displayed
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
    const rawUrl = typeof item.photo_url === "string" ? item.photo_url : "";
    const url = rawUrl.match(/https?:\/\/[^\s)\]]+/)?.[0] || "";

    if (!url) {
        return `<div class="photo-missing ${extraClass}">No photo</div>`;
    }
    const cls = extraClass ? `item-photo js-photo ${extraClass}` : "item-photo js-photo";
    return `<img class="${cls}" src="${escapeHTML(url)}" alt="${escapeHTML(item.title || "Item photo")}" loading="lazy">`;
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

function tokenize(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .split(" ")
        .filter((w) => w.length > 1 && !STOPWORDS.has(w))
        .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
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

    const titleShared = intersect(tokenize(lost.title), tokenize(found.title));
    const titleSim = diceSimilarity(tokenize(lost.title), tokenize(found.title));

    const descShared = intersect(tokenize(lost.description), tokenize(found.description));
    const descSim = diceSimilarity(tokenize(lost.description), tokenize(found.description));

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

    const parts = {
        category: { weight: w.category, similarity: catSim, points: w.category * catSim * 100 },
        title: { weight: w.title, similarity: titleSim, points: w.title * titleSim * 100, shared: titleShared },
        description: { weight: w.description, similarity: descSim, points: w.description * descSim * 100, shared: descShared },
        location: { weight: w.location, similarity: locSim, points: w.location * locSim * 100, shared: locShared },
        date: { weight: w.date, similarity: date.score, points: w.date * date.score * 100, days: date.days }
    };

    const total = Object.values(parts).reduce((sum, p) => sum + p.points, 0);

    return {
        score: Math.round(total),
        parts,
        hasTextSignal: Math.max(titleSim, descSim) >= MATCH_CONFIG.minTextSignal
    };
}

function matchLabel(score) {
    if (score >= 75) return "Strong match";
    if (score >= 60) return "Likely match";
    return "Possible match";
}

function explain(parts) {
    const reasons = [];
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
            if (!result.hasTextSignal) continue;            // category + place alone is not enough
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
                : `<b>No potential matches found</b><p>No LOST and FOUND pair scores ${MATCH_CONFIG.threshold} or more yet. Try adding more detail to the reports.</p>`;
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
            ${row("Category", p.category)}
            ${row("Item name", p.title)}
            ${row("Description", p.description)}
            ${row("Location", p.location)}
            ${row("Date", p.date)}
            <tr><th>Total</th><th>${m.score} / 100</th></tr>
        </table>
        <p class="note">Scores come from text, category, place and date only. The photos are shown for
        you to compare by eye; the system does not compare them automatically.</p>
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
        renderMatches();
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
