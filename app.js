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
  ministryFilter: document.querySelector("#ministryFilter"),
  regionFilter: document.querySelector("#regionFilter"),
  searchInput: document.querySelector("#searchInput")
};

let cases = [];
let metadata = {};
let regionGeo = null;
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
  const featuresByRegion = new Map((regionGeo?.features || []).map((feature) => [feature.region, feature]));
  const orderedFeatures = regionMapOrder
    .map(([region]) => featuresByRegion.get(region))
    .filter(Boolean);

  els.regionMapHint.textContent = `Excluye ${centralCount} casos de Gobierno central`;
  if (!regionGeo || orderedFeatures.length === 0) {
    els.regionMap.innerHTML = `<p class="map-note">No se pudo cargar la geometría regional.</p>`;
    return;
  }

  els.regionMap.innerHTML = `
    <div class="map-figure">
      <svg class="chile-map-svg" viewBox="${escapeHtml(regionGeo.viewBox)}" role="img" aria-label="Mapa de Chile por cantidad de salidas regionales">
        <title>Salidas regionales por región</title>
        ${orderedFeatures.map((feature) => {
          const region = feature.region;
          const count = counts[region] || 0;
          const level = regionLevel(count, max);
          return `
            <path class="map-region level-${level}" d="${escapeHtml(feature.path)}" tabindex="0">
              <title>${escapeHtml(region)}: ${count} casos</title>
            </path>
          `;
        }).join("")}
      </svg>
      <div class="map-summary">
        <strong>${totalRegional}</strong>
        <span>casos regionales mapeados</span>
        <div class="map-list">
          ${regionMapOrder.map(([region]) => [region, counts[region] || 0]).map(([region, count]) => `
            <div><span>${escapeHtml(region)}</span><strong>${count}</strong></div>
          `).join("")}
        </div>
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
    <p class="map-note">Geometría regional simplificada a partir de mapas vectoriales BCN.</p>
  `;
}

function renderCases(items) {
  const ordered = sortByDateDesc(items);

  if (ordered.length === 0) {
    els.caseList.innerHTML = `<p class="empty-state">No hay casos para esta combinación de filtros.</p>`;
    return;
  }

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

function populateRegistryFilters() {
  const ministries = [...new Set(cases.map((item) => item.ministerio_master || item.ministry).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "es"));
  const regions = [
    "Gobierno central",
    ...regionMapOrder.map(([region]) => region)
  ];

  els.ministryFilter.innerHTML = `
    <option value="">Todos los ministerios</option>
    ${ministries.map((ministry) => `<option value="${escapeHtml(ministry)}">${escapeHtml(ministry)}</option>`).join("")}
  `;
  els.regionFilter.innerHTML = `
    <option value="">Todas las regiones y Gobierno central</option>
    ${regions.map((region) => `<option value="${escapeHtml(region)}">${escapeHtml(region)}</option>`).join("")}
  `;
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
  const ministryFilter = els.ministryFilter.value;
  const regionFilter = els.regionFilter.value;
  const filtered = cases.filter((item) => {
    if (activeRoleFilter && roleFilterKey(item) !== activeRoleFilter) {
      return false;
    }

    if (ministryFilter && (item.ministerio_master || item.ministry) !== ministryFilter) {
      return false;
    }

    if (regionFilter && item.region_group !== regionFilter) {
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
  const [response, geoResponse] = await Promise.all([
    fetch("data/cases.json"),
    fetch("assets/geo/chile-regions-paths.json")
  ]);
  const payload = await response.json();
  regionGeo = await geoResponse.json();
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
  populateRegistryFilters();
  updateRoleFilterCounts();
  updateRoleFilterState();
  renderCases(cases);

  els.searchInput.addEventListener("input", renderFiltered);
  els.ministryFilter.addEventListener("change", renderFiltered);
  els.regionFilter.addEventListener("change", renderFiltered);
  bindRoleFilters();
}

boot().catch((error) => {
  els.caseList.innerHTML = `<p>No se pudieron cargar los datos del tracker.</p>`;
  console.error(error);
});
