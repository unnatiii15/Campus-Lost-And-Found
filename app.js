
const API_URL =
    "https://nx4myenwb6.execute-api.ap-southeast-2.amazonaws.com/prod/items";

const form = document.getElementById("itemForm");
const message = document.getElementById("message");
const records = document.getElementById("records");
const empty = document.getElementById("empty");
const search = document.getElementById("search");
const filter = document.getElementById("filter");
const photoInput = document.getElementById("photo");

let items = [];

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

async function loadItems() {
    try {
        const response = await fetch(API_URL);

        if (!response.ok) {
            throw new Error("AWS returned status " + response.status);
        }

        const data = await response.json();
        items = Array.isArray(data)
            ? data
            : Array.isArray(data.body)
                ? data.body
                : typeof data.body === "string"
                    ? JSON.parse(data.body)
                    : [];

        renderItems();
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
        const created = escapeHTML(item.created_at || "");
        const photoURL = typeof item.photo_url === "string"
            ? item.photo_url
            : "";

        const photoHTML = photoURL
            ? `<img class="item-photo" src="${escapeHTML(photoURL)}" alt="${title}" loading="lazy">`
            : "";

        return `
            <article class="item">
                <span class="status-badge ${status.toLowerCase()}">${escapeHTML(status)}</span>
                ${photoHTML}
                <h3>${title}</h3>
                <p>${description}</p>
                <p><strong>Category:</strong> ${category}</p>
                <p><strong>Location:</strong> ${location}</p>
                ${created ? `<small>Reported: ${created}</small>` : ""}
            </article>
        `;
    }).join("");

    if (empty) {
        empty.style.display = visibleItems.length ? "none" : "block";
    }
}

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
        showMessage("Submitting report to AWS...");

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

const closeButton = document.getElementById("close");

if (closeButton) {
    closeButton.addEventListener("click", () => {
        const dialog = document.getElementById("dialog");
        if (dialog?.close) dialog.close();
    });
}

loadItems();
