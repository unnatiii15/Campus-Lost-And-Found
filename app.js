
const API_URL =
  "https://nx4myenwb6.execute-api.ap-southeast-2.amazonaws.com/prod/items";

const form = document.getElementById("itemForm");
const message = document.getElementById("message");
const records = document.getElementById("records");
const empty = document.getElementById("empty");
const search = document.getElementById("search");
const filter = document.getElementById("filter");

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

async function loadItems() {
  try {
    const response = await fetch(API_URL);

    if (!response.ok) {
      throw new Error("AWS returned status " + response.status);
    }

    const data = await response.json();
    items = Array.isArray(data)
      ? data
      : typeof data.body === "string"
        ? JSON.parse(data.body)
        : data.body || [];

    renderItems();
  } catch (error) {
    console.error("Loading items failed:", error);
    showMessage(
      "Could not load items from AWS. Please refresh and try again.",
      true
    );
  }
}

function renderItems() {
  const query = (search?.value || "").trim().toLowerCase();
  const selectedStatus = (filter?.value || "ALL").toUpperCase();

  const visibleItems = items.filter((item) => {
    const searchableText = [
      item.title,
      item.description,
      item.location,
      item.status
    ].join(" ").toLowerCase();

    const matchesSearch = searchableText.includes(query);
    const matchesStatus =
      selectedStatus === "ALL" ||
      selectedStatus === item.status;

    return matchesSearch && matchesStatus;
  });

  if (records) {
    records.innerHTML = visibleItems.map((item) => {
      const status = String(item.status || "LOST").toUpperCase();

      return `
        <article class="item-card">
          <span class="item-status">${escapeHTML(status)}</span>
          <h3>${escapeHTML(item.title || "Untitled item")}</h3>
          <p>${escapeHTML(item.description || "No description provided.")}</p>
          <p><strong>Location:</strong> ${escapeHTML(item.location || "Not specified")}</p>
          <p class="item-date">
            Reported: ${escapeHTML(
              item.created_at
                ? new Date(item.created_at).toLocaleString()
                : "Date unavailable"
            )}
          </p>
        </article>
      `;
    }).join("");
  }

  if (empty) {
    empty.hidden = visibleItems.length > 0;
  }

  const lost = items.filter(
    item => String(item.status).toUpperCase() === "LOST"
  ).length;

  const found = items.filter(
    item => String(item.status).toUpperCase() === "FOUND"
  ).length;

  const lostCount = document.getElementById("lostCount");
  const foundCount = document.getElementById("foundCount");
  const returnedCount = document.getElementById("returnedCount");
  const count = document.getElementById("count");

  if (lostCount) lostCount.textContent = lost;
  if (foundCount) foundCount.textContent = found;
  if (returnedCount) returnedCount.textContent = 0;
  if (count) count.textContent = visibleItems.length;
}

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const title = document.getElementById("name")?.value.trim();
    const status = document.getElementById("type")?.value.toUpperCase();
    const description =
      document.getElementById("description")?.value.trim() || "";
    const location =
      document.getElementById("location")?.value.trim() || "";

    if (!title) {
      showMessage("Please enter the item name.", true);
      return;
    }

    if (!["LOST", "FOUND"].includes(status)) {
      showMessage("Please select Lost or Found.", true);
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
          status
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
        "Could not submit the report. Check the API and try again.",
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
