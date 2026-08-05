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
  const judicial = items.filter((item) => item.has_judicial_or_formal_complaint).length;
  const regions = new Set(items.map((item) => item.region)).size;

  const stats = [
    ["Total", items.length],
    ["Seremis", offices.seremi || 0],
    ["Subsecretarios", offices.subsecretary || 0],
    ["Ministros", offices.minister || 0],
    ["Territorios", regions]
  ];

  els.stats.innerHTML = stats.map(([label, value]) => `
    <div class="stat">
      <strong>${value}</strong>
      <span>${label}</span>
    </div>
  `).join("");
}

function renderBars(container, counts, labels) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map((entry) => entry[1]), 1);

  container.innerHTML = entries.map(([key, value]) => `
    <div class="bar-row">
      <div class="bar-label">${labels[key] || key}</div>
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
    <article class="case-card">
      <div class="case-date">${formatDate(item.exit_date)}</div>
      <div>
        <h3>${item.person_name}</h3>
        <div class="case-meta">${item.office_title} · ${item.ministry} · ${item.region}</div>
        <p class="case-reason">${item.reason_summary}</p>
      </div>
      <div class="badge-row">
        <span class="tag">${officeLabels[item.office_level] || item.office_level}</span>
        <span class="tag">${exitTypeLabels[item.exit_type] || item.exit_type}</span>
        ${item.has_judicial_or_formal_complaint ? '<span class="tag alert">Denuncia reportada</span>' : ""}
        ${sourceMarkup(item.source)}
      </div>
    </article>
  `).join("");
}

function sourceMarkup(source) {
  if (!source) return '<span class="source-link source-static">Fuente</span>';
  if (source.url) {
    return `<a class="source-link" href="${source.url}" target="_blank" rel="noopener">${source.outlet}</a>`;
  }
  return `<span class="source-link source-static">${source.outlet}</span>`;
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
      item.source?.outlet
    ].join(" ").toLowerCase();
    return haystack.includes(query);
  });

  renderCases(filtered);
}

async function boot() {
  const response = await fetch("data/cases.json");
  const payload = await response.json();
  cases = sortByDateDesc(payload.cases);
  const latest = cases[0];

  els.updatedLabel.textContent = `Actualizado al ${formatDate(payload.metadata.updated_at)}`;
  els.totalCount.textContent = payload.metadata.case_count;
  els.latestTitle.textContent = latest.person_name;
  els.latestMeta.textContent = `${latest.office_title} · ${latest.region} · ${formatDate(latest.exit_date)}`;
  if (latest.source?.url) {
    els.latestSource.href = latest.source.url;
    els.latestSource.textContent = `Fuente: ${latest.source.outlet}`;
  } else {
    els.latestSource.removeAttribute("href");
    els.latestSource.textContent = `Fuente: ${latest.source?.outlet || "sin enlace publico"}`;
  }

  renderStats(cases);
  renderBars(els.officeBars, byCount(cases, "office_level"), officeLabels);
  renderBars(els.reasonBars, byCount(cases, "reason_category"), reasonLabels);
  els.officeHint.textContent = `${cases.length} casos`;
  renderCases(cases);

  els.searchInput.addEventListener("input", renderFiltered);
}

boot().catch((error) => {
  els.caseList.innerHTML = `<p>No se pudieron cargar los datos del tracker.</p>`;
  console.error(error);
});
