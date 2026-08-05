const officeLabels = {
  minister: "Ministros/as",
  subsecretary: "Subsecretarios/as",
  seremi: "Seremis",
  national_director: "Direcciones nacionales",
  regional_director: "Direcciones regionales",
  deputy_director: "Subdirecciones",
  division_head: "Jefaturas",
  other: "Otros cargos"
};

const reasonLabels = {
  personal_reasons: "Razones personales",
  public_management_questioning: "Gestion cuestionada",
  judicial_or_formal_complaint: "Denuncia o causa formal",
  drug_test_or_compliance: "Test o cumplimiento",
  requirements_or_appointment: "Nombramiento o requisitos",
  internal_conflict: "Conflicto interno",
  not_specified: "Sin motivo detallado"
};

const exitTypeLabels = {
  voluntary_resignation: "Renuncia",
  resignation: "Renuncia",
  resignation_requested: "Renuncia pedida",
  removed: "Remocion",
  appointment_not_effective: "Nombramiento sin efecto",
  internal_movement: "Movimiento interno",
  unknown: "Salida"
};

const els = {
  updatedLabel: document.querySelector("#updatedLabel"),
  totalCount: document.querySelector("#totalCount"),
  latestTitle: document.querySelector("#latestTitle"),
  latestMeta: document.querySelector("#latestMeta"),
  latestSource: document.querySelector("#latestSource"),
  stats: document.querySelector("#stats"),
  officeBars: document.querySelector("#officeBars"),
  reasonBars: document.querySelector("#reasonBars"),
  officeHint: document.querySelector("#officeHint"),
  caseList: document.querySelector("#caseList"),
  searchInput: document.querySelector("#searchInput")
};

let cases = [];
let metadata = {};

function byCount(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || "unknown";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function sortByDateDesc(items) {
  return [...items].sort((a, b) => (b.exit_date || "").localeCompare(a.exit_date || ""));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(dateString) {
  if (!dateString) return "Sin fecha";
  return new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(`${dateString}T12:00:00`));
}

function renderStats(items) {
  const offices = byCount(items, "office_level");
  const cargos = byCount(items, "cargo_group");
  const regions = new Set(items.map((item) => item.region)).size;

  const stats = [
    ["Casos registrados", items.length],
    ["Seremis", metadata.seremi_count ?? offices.seremi ?? 0],
    ["Subsecretarios", cargos["Subsecretario/a"] ?? offices.subsecretary ?? 0],
    ["Ministros", cargos["Ministro/a"] ?? offices.minister ?? 0],
    ["Territorios", regions]
  ];

  els.stats.innerHTML = stats.map(([label, value]) => `
    <div class="stat">
      <strong>${value}</strong>
      <span>${escapeHtml(label)}</span>
    </div>
  `).join("");
}

function renderBars(container, counts, labels) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map((entry) => entry[1]), 1);

  container.innerHTML = entries.map(([key, value]) => `
    <div class="bar-row">
      <div class="bar-label">${escapeHtml(labels[key] || key)}</div>
      <div class="bar-track" aria-hidden="true">
        <div class="bar-fill" style="width:${(value / max) * 100}%"></div>
      </div>
      <div class="bar-count">${value}</div>
    </div>
  `).join("");
}

function renderCases(items) {
  const ordered = sortByDateDesc(items);

  els.caseList.innerHTML = ordered.map((item) => `
    <article class="case-card" id="${escapeHtml(item.case_id)}">
      <div class="case-date">${formatDate(item.exit_date)}</div>
      <div>
        <h3>${escapeHtml(item.person_name)}</h3>
        <div class="case-meta">${escapeHtml(item.office_title)} · ${escapeHtml(item.ministry)} · ${escapeHtml(item.region)}</div>
        <p class="case-reason">${escapeHtml(item.reason_summary)}</p>
      </div>
      <div class="badge-row">
        <span class="tag">${escapeHtml(item.cargo_group || officeLabels[item.office_level] || item.office_level)}</span>
        <span class="tag">${escapeHtml(exitTypeLabels[item.exit_type] || item.exit_type)}</span>
        ${item.has_judicial_or_formal_complaint ? '<span class="tag alert">Denuncia reportada</span>' : ""}
        ${sourceMarkup(item)}
      </div>
    </article>
  `).join("");
}

function sourceHref(item) {
  return item.source?.url || `data/cases.json#${encodeURIComponent(item.case_id)}`;
}

function sourceMarkup(item) {
  const source = item.source;
  const hasDirectUrl = Boolean(source?.url);
  const outlet = source?.outlet || "fuente";
  const label = hasDirectUrl ? `Abrir nota · ${outlet}` : `Ver dato · ${outlet}`;
  const title = hasDirectUrl
    ? (source.title || `Abrir fuente en ${outlet}`)
    : `Este caso no trae URL publica en la base; abre el registro de datos.`;

  return `<a class="source-link ${hasDirectUrl ? "" : "source-data"}" href="${escapeHtml(sourceHref(item))}" target="${hasDirectUrl ? "_blank" : "_self"}" rel="noopener" title="${escapeHtml(title)}">${escapeHtml(label)}</a>`;
}

function renderFiltered() {
  const query = els.searchInput.value.trim().toLowerCase();
  const filtered = cases.filter((item) => {
    const haystack = [
      item.person_name,
      item.office_title,
      item.ministry,
      item.region,
      item.reason_summary,
      item.source?.outlet,
      item.source?.title
    ].join(" ").toLowerCase();
    return haystack.includes(query);
  });

  renderCases(filtered);
}

async function boot() {
  const response = await fetch("data/cases.json");
  const payload = await response.json();
  metadata = payload.metadata || {};
  cases = sortByDateDesc(payload.cases);
  const latest = cases[0];

  els.updatedLabel.textContent = `Actualizado al ${formatDate(payload.metadata.updated_at)}`;
  els.totalCount.textContent = payload.metadata.case_count;
  els.latestTitle.textContent = latest.person_name;
  els.latestMeta.textContent = `${latest.office_title} · ${latest.region} · ${formatDate(latest.exit_date)}`;
  els.latestSource.href = sourceHref(latest);
  els.latestSource.textContent = latest.source?.url
    ? `Abrir nota · ${latest.source.outlet}`
    : `Ver dato · ${latest.source?.outlet || "fuente"}`;
  els.latestSource.target = latest.source?.url ? "_blank" : "_self";
  els.latestSource.title = latest.source?.title || "Abrir registro de datos";

  renderStats(cases);
  renderBars(els.officeBars, byCount(cases, "cargo_group"), {});
  renderBars(els.reasonBars, byCount(cases, "region_group"), {});
  els.officeHint.textContent = `${cases.length} casos`;
  renderCases(cases);

  els.searchInput.addEventListener("input", renderFiltered);
}

boot().catch((error) => {
  els.caseList.innerHTML = `<p>No se pudieron cargar los datos del tracker.</p>`;
  console.error(error);
});
