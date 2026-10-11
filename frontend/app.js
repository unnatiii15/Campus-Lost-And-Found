const API_URL = "https://nx4myenwb6.execute-api.ap-southeast-2.amazonaws.com/prod/items";

const $ = id => document.getElementById(id);
let items = [];

async function loadItems() {
  try {
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error("API request failed");
    const data = await response.json();
    items = typeof data.body === "string" ? JSON.parse(data.body) : data;
    render();
  } catch (error) {
    console.error(error);
    $("count").textContent = "Could not load AWS items. Please refresh.";
  }
}

function render() {
  $("lostCount").textContent = items.filter(x => x.status === "LOST" && x.status !== "RETURNED").length;
  $("foundCount").textContent = items.filter(x => x.status === "FOUND" && x.status !== "RETURNED").length;
  $("returnedCount").textContent = items.filter(x => x.status === "RETURNED").length;

  const q = $("search").value.toLowerCase().trim();
  const filter = $("filter").value;
  const rows = items.filter(x =>
    (filter === "ALL" || x.status === filter) &&
    [x.title, x.description, x.location, x.category].some(v => String(v || "").toLowerCase().includes(q))
  );

  $("count").textContent = `${rows.length} item${rows.length === 1 ? "" : "s"}`;
  $("records").innerHTML = rows.map(x =>
    `<article class="item"><h3>${escapeHtml(x.title)}</h3><p>${escapeHtml(x.description || "")}</p><span>${escapeHtml(x.status)}</span></article>`
  ).join("");
  $("empty").hidden = rows.length > 0;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

$("search").addEventListener("input", render);
$("filter").addEventListener("change", render);
loadItems();
