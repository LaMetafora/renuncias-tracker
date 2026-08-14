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

const regionMapOrder = [
  ["Arica y Parinacota", "Arica"],
  ["Tarapacá", "Tarapacá"],
  ["Antofagasta", "Antofagasta"],
  ["Atacama", "Atacama"],
  ["Coquimbo", "Coquimbo"],
  ["Valparaíso", "Valparaíso"],
  ["Región Metropolitana", "Metropolitana"],
  ["O'Higgins", "O'Higgins"],
  ["Maule", "Maule"],
  ["Ñuble", "Ñuble"],
  ["Biobío", "Biobío"],
  ["La Araucanía", "Araucanía"],
  ["Los Ríos", "Los Ríos"],
  ["Los Lagos", "Los Lagos"],
  ["Aysén", "Aysén"],
  ["Magallanes", "Magallanes"]
];

const regionShapes = [
  [76, 8, 42, 18],
  [70, 30, 48, 20],
  [64, 54, 54, 28],
  [60, 86, 50, 26],
  [54, 116, 48, 24],
  [50, 144, 42, 20],
  [45, 168, 44, 18],
  [42, 190, 42, 18],
  [38, 212, 42, 20],
  [34, 236, 40, 18],
  [30, 258, 42, 20],
  [27, 282, 38, 22],
  [23, 308, 34, 20],
  [20, 332, 32, 30],
  [16, 366, 30, 42],
  [8, 412, 42, 26]
];

const els = {
  updatedLabel: document.querySelector("#updatedLabel"),
  totalCount: document.querySelector("#totalCount"),
  latestTitle: document.querySelector("#latestTitle"),
  latestMeta: document.querySelector("#latestMeta"),
  latestSource: document.querySelector("#latestSource"),
  stats: document.querySelector("#stats"),
  officeBars: document.querySelector("#officeBars"),
  regionMap: document.querySelector("#regionMap"),
  regionMapHint: document.querySelector("#regionMapHint"),
  officeHint: document.querySelector("#officeHint"),
  caseList: document.querySelector("#caseList"),
  roleFilters: document.querySelector("#roleFilters"),
  searchInput: document.querySelector("#searchInput")
};

let cases = [];
let metadata = {};
let activeRoleFilter = "";

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

  const stats = [
    ["Casos registrados", items.length],
    ["Ministros", cargos["Ministro/a"] ?? offices.minister ?? 0],
    ["Subsecretarios", cargos["Subsecretario/a"] ?? offices.subsecretary ?? 0],
    ["Seremis", metadata.seremi_count ?? offices.seremi ?? 0]
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

function regionLevel(value, max) {
  if (value === 0) return 0;
  return Math.max(1, Math.ceil((value / Math.max(max, 1)) * 5));
}

function renderRegionMap(items) {
  const counts = byCount(
    items.filter((item) => item.region_group !== "Gobierno central"),
    "region_group"
  );
  const centralCount = items.filter((item) => item.region_group === "Gobierno central").length;
  const values = regionMapOrder.map(([region]) => counts[region] || 0);
  const max = Math.max(...values, 1);
  const totalRegional = values.reduce((sum, value) => sum + value, 0);

  els.regionMapHint.textContent = `Excluye ${centralCount} casos de Gobierno central`;
  els.regionMap.innerHTML = `
    <div class="map-figure">
      <svg class="chile-map-svg" viewBox="0 0 270 452" role="img" aria-label="Mapa de Chile por cantidad de salidas regionales">
        <title>Salidas regionales por región</title>
        ${regionMapOrder.map(([region], index) => {
          const [x, y, width, height] = regionShapes[index];
          const count = counts[region] || 0;
          const level = regionLevel(count, max);
          const labelY = y + height / 2 + 4;
          return `
            <g class="map-region-group">
              <rect class="map-region level-${level}" x="${x}" y="${y}" width="${width}" height="${height}" rx="3">
                <title>${escapeHtml(region)}: ${count} casos</title>
              </rect>
              <text class="map-region-count" x="${x + width / 2}" y="${labelY}">${count}</text>
              <line class="map-leader" x1="${x + width + 5}" y1="${labelY - 4}" x2="128" y2="${labelY - 4}"></line>
              <text class="map-label" x="136" y="${labelY}">${escapeHtml(regionMapOrder[index][1])}</text>
            </g>
          `;
        }).join("")}
      </svg>
      <div class="map-summary">
        <strong>${totalRegional}</strong>
        <span>casos regionales mapeados</span>
      </div>
    </div>
    <div class="map-legend" aria-label="Escala de color">
      <span>Menos</span>
      <i class="level-1"></i>
      <i class="level-2"></i>
      <i class="level-3"></i>
      <i class="level-4"></i>
      <i class="level-5"></i>
      <span>Más</span>
    </div>
  `;
}

function renderCases(items) {
  const ordered = sortByDateDesc(items);

  els.caseList.innerHTML = ordered.map((item) => `
    <article class="case-card" id="${escapeHtml(item.case_id)}">
      <div class="case-date">${formatDate(item.exit_date)}</div>
      <div>
        <h3>${escapeHtml(item.person_name)}</h3>
        <div class="case-meta">${escapeHtml(item.office_title)} · ${escapeHtml(item.ministerio_master || item.ministry)} · ${escapeHtml(item.region)}</div>
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

function roleFilterKey(item) {
  if (item.office_level === "minister") return "minister";
  if (item.office_level === "seremi") return "seremi";
  if (item.office_level === "subsecretary") return "subsecretary";

  if (item.cargo_group === "Ministro/a") return "minister";
  if (item.cargo_group === "Seremi") return "seremi";
  if (item.cargo_group === "Subsecretario/a") return "subsecretary";

  return "other";
}

function updateRoleFilterCounts() {
  const counts = byCount(cases.map((item) => ({ role_filter: roleFilterKey(item) })), "role_filter");
  els.roleFilters.querySelectorAll("button").forEach((button) => {
    const key = button.dataset.roleFilter;
    const count = key === "all" ? cases.length : counts[key] || 0;
    const countSlot = button.querySelector("span");
    countSlot.textContent = count;
  });
}

function updateRoleFilterState() {
  els.roleFilters.querySelectorAll("button").forEach((button) => {
    const key = button.dataset.roleFilter;
    const isActive = key === "all" ? activeRoleFilter === "" : key === activeRoleFilter;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function sourceHref(item) {
  return item.source?.url || "";
}

function sourceMarkup(item) {
  const source = item.source;
  const hasDirectUrl = Boolean(source?.url);
  const outlet = source?.outlet || "fuente";
  const title = source?.title || `Fuente: ${outlet}`;

  if (!hasDirectUrl) {
    return `<span class="source-link source-static" title="${escapeHtml(title)}">Sin URL publica · ${escapeHtml(outlet)}</span>`;
  }

  return `<a class="source-link" href="${escapeHtml(sourceHref(item))}" target="_blank" rel="noopener" title="${escapeHtml(title)}">Abrir nota · ${escapeHtml(outlet)}</a>`;
}

function renderFiltered() {
  const query = els.searchInput.value.trim().toLowerCase();
  const filtered = cases.filter((item) => {
    if (activeRoleFilter && roleFilterKey(item) !== activeRoleFilter) {
      return false;
    }

    const haystack = [
      item.person_name,
      item.office_title,
      item.ministerio_master || item.ministry,
      item.region,
      item.reason_summary,
      item.source?.outlet,
      item.source?.title
    ].join(" ").toLowerCase();
    return haystack.includes(query);
  });

  renderCases(filtered);
}

function bindRoleFilters() {
  els.roleFilters.querySelectorAll("button[data-role-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextFilter = button.dataset.roleFilter;
      activeRoleFilter = nextFilter === "all" || activeRoleFilter === nextFilter ? "" : nextFilter;
      updateRoleFilterState();
      renderFiltered();
    });
  });
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
  if (latest.source?.url) {
    els.latestSource.href = sourceHref(latest);
    els.latestSource.textContent = `Abrir nota · ${latest.source.outlet}`;
    els.latestSource.target = "_blank";
    els.latestSource.title = latest.source?.title || `Abrir fuente en ${latest.source.outlet}`;
  } else {
    els.latestSource.removeAttribute("href");
    els.latestSource.removeAttribute("target");
    els.latestSource.textContent = `Sin URL publica · ${latest.source?.outlet || "fuente"}`;
    els.latestSource.title = latest.source?.title || "Este caso no trae URL publica en la base.";
    els.latestSource.classList.add("source-static");
  }

  renderStats(cases);
  renderBars(els.officeBars, byCount(cases, "ministerio_master"), {});
  renderRegionMap(cases);
  els.officeHint.textContent = `${cases.length} casos`;
  updateRoleFilterCounts();
  updateRoleFilterState();
  renderCases(cases);

  els.searchInput.addEventListener("input", renderFiltered);
  bindRoleFilters();
}

boot().catch((error) => {
  els.caseList.innerHTML = `<p>No se pudieron cargar los datos del tracker.</p>`;
  console.error(error);
});
