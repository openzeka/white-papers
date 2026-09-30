/* ── CV Inference Benchmark Explorer — vanilla JS, zero dependencies ── */
(function () {
  "use strict";

  /* ──────────────────────────────────────────────────────────────────────
     UI STRINGS — the ONLY block that differs between this file and
     cv-benchmark-table.js. Everything below is byte-identical in both.
     ────────────────────────────────────────────────────────────────────── */
  var S = {
    lang: "nl",

    loading: "Benchmarks laden…",
    loadFailed: "Benchmarkgegevens konden niet worden geladen: ",
    storeUnreadable: "geen van de bestanden die de index vermeldt kon worden gelezen",
    noMatch: "Geen configuraties komen overeen met de huidige filters.",

    cameras: "Tot hoeveel camera's",
    camerasHint: function (max) {
      return "Verbergt metingen boven dit aantal; de schuifregelaar stopt bij " + max +
        ", het hoogste aantal camera's dat tot nu toe is gemeten.";
    },
    camerasValue: function (n) { return n + (n === 1 ? " camera" : " camera's"); },
    filters: "Filters",
    searchModels: "Modellen zoeken…",
    device: "Apparaat",
    model: "Model",
    all: "Alle",
    showAll: "Alles tonen",
    targetFps: "Doel-FPS per camera",
    targetHint: "Bepaalt PASS / FAIL hieronder en de kolom Max. camera's hierboven.",
    resetFilters: "Alle filters resetten",
    matching: "Overeenkomende configuraties",
    matchingCount: function (shown, total) {
      return "<strong>" + shown + "</strong> van <strong>" + total + "</strong>";
    },

    colModel: "Model",
    colInput: "Input",
    colPrecision: "Precisie",
    colDevice: "Apparaat",
    colKind: "Type",
    colAtCameras: "Camera's",
    colPerCam: "FPS / camera",
    colTotal: "Totale FPS",
    colDrop: "Drop %",
    colMaxCams: "Max. camera's",
    colDeepStream: "DeepStream",

    detailCameras: "Camera's",
    detailPerCam: "FPS / camera",
    detailTotal: "Totale FPS",
    detailDrop: "Drop %",
    detailStatus: "Status",
    pass: "PASS",
    fail: "FAIL",

    notMeasured: "niets gemeten bij of onder dit aantal camera's",
    atCamerasTip: function (n, limit) {
      return "Gemeten bij " + n + (n === 1 ? " camera" : " camera's") +
        " — het hoogste aantal dat voor deze configuratie is gemeten bij of onder uw limiet van " +
        limit + ".";
    },
    targetMet: "Doel gehaald — deze configuratie houdt het gekozen aantal camera's bij.",
    targetNotMet: "Doel niet gehaald — de framerate zakt hier onder uw doel.",
    viewDetails: "Details bekijken — de volledige reeks over het aantal camera's en de curve voor deze configuratie.",
    sourceLimited: "Bronbeperkt",
    sourceLimitedTip: function (fps) {
      return "De camera's zelf streamen met " + fps + " FPS, en deze configuratie " +
        "leverde bij het hoogste getoonde aantal camera's nog bijna die snelheid — haar eigen " +
        "limiet werd dus niet bereikt. Het cijfer is een ondergrens, geen bovengrens.";
    },
    saturatedTip: "De eigen limiet van het apparaat werd bereikt: de framerate per camera zakte duidelijk onder de snelheid waarmee de camera's streamen.",

    previewTitle: "Hoe deze stream eruitziet",
    previewSub: function (cameras, fps) {
      return cameras + (cameras === 1 ? " camera" : " camera's") + " · " + fps + " FPS per camera";
    },
    previewPick: "Kies een gemeten aantal camera's om de daar vastgelegde framerate te bekijken.",
    previewSource: "Camerabron",
    previewThis: "Deze configuratie",
    previewMatches: "houdt de bron bij",
    previewNote: "Beide vensters tonen dezelfde clip: het linker met de eigen snelheid van de camera, " +
      "het rechter met de snelheid die deze configuratie volhield. Het is een clip van een vaste camera met " +
      "snel rijdende voertuigen, gekozen omdat de framerate het makkelijkst te beoordelen is bij snelle beweging — " +
      "het zijn geen beelden uit een benchmarkrun, en er wordt geen detectie op uitgevoerd.",
    previewStill: "Animatie uitgeschakeld door de instelling voor beperkte beweging van uw systeem.",

    chartTitle: "Framerate tegenover aantal camera's",
    chartPerCam: "FPS per camera",
    chartTotal: "Totale FPS",
    xTitle: "Camera's",
    runs: "Runs:",
    measuredFor: function (s) { return "Gemeten gedurende " + s + " s per aantal camera's."; },
    hardware: "Hardware:",

    /* Tooltips */
    tip: {
      model: "<strong>Model</strong><p>Het detectiemodel dat wordt uitgevoerd, met de numerieke precisie waarmee de engine ervan is gebouwd (INT8, FP16…) naast de naam, waar die is vastgelegd.</p><p>Een rij is een volledige deploymentconfiguratie, geen model, dus hetzelfde model verschijnt één keer voor elk apparaat waarop het is gemeten.</p>",
      input: "<strong>Inputresolutie</strong><p>Het formaat in pixels waarnaar elk frame wordt geschaald voordat het model het ziet — breedte × hoogte.</p><p>Dit is de eigen input van het model, niet die van de camera: de camera's streamen in 1080p. Een grotere input kost meer rekenwerk per frame.</p>",
      device: "<strong>Apparaat</strong><p>De hardware waarop de pipeline draaide — een Jetson-module, een DGX Spark op basis van GB10 of een GeForce-desktop-GPU.</p><p>De details van hardware en software staan in de uitgeklapte rij.</p>",
      atCameras: "<strong>Camera's</strong><p>Het aantal gelijktijdige camerastreams waarbij de cijfers van deze rij zijn gemeten.</p><p>Elke rij toont de zwaarste belasting waaronder ze is gemeten, bij of onder de cameralimiet in het filterpaneel, dus rijen kunnen hier verschillen. Lees de framerates samen met het aantal ernaast.</p>",
      perCam: "<strong>FPS / camera</strong><p>Hoeveel frames per seconde er voor <em>elke</em> camera worden verwerkt, bij dat aantal camera's. Dit is het getal voor de vraag „houdt dit mijn camera's bij”.</p><p>De camera's zelf streamen met 20 FPS, dus 20 is het plafond. Groen haalt uw doel-FPS, rood niet.</p><p><em>Hoger is beter.</em></p>",
      total: "<strong>Totale FPS</strong><p>Frames per seconde die over alle camera's samen worden verwerkt — ongeveer FPS per camera × aantal camera's.</p><p>De totale doorvoer van de pipeline. Waar die niet meer groeit wanneer er camera's bijkomen, heeft het apparaat zijn limiet bereikt.</p>",
      drop: "<strong>Drop %</strong><p>Frames die de pipeline binnenkwamen maar er niet uitkwamen, als aandeel van de input, bij dat aantal camera's.</p><p>Kleine negatieve waarden betekenen dat er tijdens het meetvenster iets meer frames uit dan in zijn geteld; lees ze als nul. Drop % heeft geen invloed op PASS / FAIL of Max. camera's.</p><p><em>Bijna nul is gezond.</em></p>",
      maxCams: "<strong>Max. camera's</strong><p>Het hoogste <em>gemeten</em> aantal camera's waarbij deze configuratie uw doel-FPS per camera nog haalt, tot de cameralimiet in het filterpaneel.</p><p>Alleen afgeleid uit de gemeten punten — er wordt niets geëxtrapoleerd — en de waarde is 0 als geen daarvan het doel haalt. Ze verandert wanneer u het doel wijzigt.</p><p>Een ≥ betekent dat het apparaat bij het hoogste getoonde aantal nog de eigen framerate van de camera's leverde, binnen 10%: de werkelijke limiet werd niet bereikt, dus het cijfer is een ondergrens.</p>",

      fCameras: "<strong>Cameralimiet</strong><p>Een bovengrens voor het aantal camera's, geen selectie. Alles wat daarboven is gemeten, wordt verborgen.</p><p>Elke rij toont dan de zwaarste belasting waarbij ze tot dit aantal is gemeten, en de reeks, de grafiek en de preview volgen. Een configuratie zonder metingen zo laag verdwijnt uit de tabel totdat de limiet wordt verhoogd.</p>",
      fDevice: "<strong>Apparaatfilter</strong><p>De hardware waarop een configuratie draaide.</p><p>Kies er meerdere om apparaten direct te vergelijken.</p>",
      fModel: "<strong>Modelfilter</strong><p>Het detectiemodel dat wordt uitgevoerd.</p><p>Kies er meerdere om ze naast elkaar te vergelijken.</p>",
      target: "<strong>Doel-FPS per camera</strong><p>De framerate per camera die u acceptabel vindt.</p><p>Deze bepaalt PASS / FAIL in de reeks, de groene en rode kleuring van FPS / camera, en de kolom Max. camera's. Verhogen maakt de eis strenger en kan Max. camera's verlagen.</p><p>De camera's streamen met 20 FPS, dus een doel boven 20 kan in deze metingen niet worden gehaald.</p>",
      reset: "<strong>Alle filters resetten</strong><p>Wist elk filter en zet de cameralimiet terug op het maximum en de doel-FPS op de standaardwaarde.</p>",
    },
  };

  /* ══════════════════════════════════════════════════════════════════════
     Everything below this line is language-independent.
     ══════════════════════════════════════════════════════════════════════ */

  var PALETTE = ["#76b900", "#0071c5", "#f2a900", "#c8102e", "#7a5cff", "#00a3a3"];

  var data = null;
  var previewVideoUrl = "";
  var state = {
    /* An upper bound, not a selection: "show me what happens up to N cameras".
       Every row then reports its own highest measurement at or below it, so
       configurations measured at different camera counts stay comparable. */
    camerasMax: null,
    devices: [],            // empty = all
    models: {},             // model -> ticked; every model starts ticked
    sortCol: "model",
    sortDir: "asc",
    targetFps: null,
    expanded: {},
    previewAt: {},           // entry id -> camera count driving its preview
  };

  function escapeHTML(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function fmt(v, digits) {
    if (v === null || v === undefined || v === "") return "—";
    var n = Number(v);
    return isNaN(n) ? "—" : n.toFixed(digits === undefined ? 1 : digits);
  }

  /* An info affordance carrying its own tooltip copy. The copy comes from S,
     never from data, so it is safe to store as markup. */
  function tip(html) {
    return '<button type="button" class="bt-tip" aria-label="info" data-tip="' +
      escapeHTML(html) + '">i</button>';
  }

  /* ── Data helpers ── */

  function allCameraCounts() {
    var seen = {};
    data.benchmarks.forEach(function (b) {
      b.data_points.forEach(function (p) { seen[p.cameras] = true; });
    });
    return Object.keys(seen).map(Number).sort(function (a, b) { return a - b; });
  }

  function uniq(field) {
    var seen = {};
    data.benchmarks.forEach(function (b) { if (b[field]) seen[b[field]] = true; });
    return Object.keys(seen).sort();
  }

  /* Everything below the camera limit, which is what the table, the sweep, the
     chart and the preview all work from. */
  function pointsWithin(entry) {
    return entry.data_points.filter(function (p) { return p.cameras <= state.camerasMax; });
  }

  function pointAt(entry, cameras) {
    for (var i = 0; i < entry.data_points.length; i++) {
      if (entry.data_points[i].cameras === cameras) return entry.data_points[i];
    }
    return null;
  }

  /* The heaviest load this configuration was measured at, within the limit -
     the row's headline numbers come from here. */
  function shownPoint(entry) {
    var points = pointsWithin(entry);
    return points.length ? points[points.length - 1] : null;
  }

  /* The highest measured camera count that still holds the target frame rate.
     Taken from the measured points only - nothing here is extrapolated. */
  function maxCameras(entry) {
    var best = 0;
    pointsWithin(entry).forEach(function (p) {
      if (p.fps_per_camera >= state.targetFps && p.cameras > best) best = p.cameras;
    });
    return best;
  }

  function sourceFps(entry) {
    return Number(entry.source_fps) || Number((data.source_profile || {}).fps) || 20;
  }

  /* A camera cannot be processed faster than it streams, so a configuration
     still hitting the source's own frame rate at its largest camera count
     never found its own limit. Derived here rather than stored, so it follows
     the data when a bigger camera count is published later. */
  function saturated(entry) {
    var last = shownPoint(entry);
    var per = last && last.fps_per_camera;
    return !!(per && per < sourceFps(entry) * 0.9);
  }

  function visibleEntries() {
    return data.benchmarks.filter(function (b) {
      if (state.devices.length && state.devices.indexOf(b.device) === -1) return false;
      /* Unticking "All" empties the selection, which must show an empty
         table rather than every row - the same rule as the LLM widget. */
      if (!state.models[b.model]) return false;
      /* Nothing measured within the limit means the row has nothing to say at
         this load; it comes back when the limit is raised. */
      return pointsWithin(b).length > 0;
    });
  }

  /* ── Rendering ── */

  function buildUI(container) {
    container.className = "bt-container cvbt-container";
    var cameras = allCameraCounts();
    var maxCams = cameras.length ? cameras[cameras.length - 1] : 1;

    /* Filters sit beside the table rather than above it, and stay put while
       the table scrolls: with a sweep expanded the table runs several screens
       long, and a control you have to scroll back up to find is a control you
       stop using. */
    var html = '<div class="cvbt-layout">';
    html += '<div class="cvbt-main">';
    html += '<div class="bt-results-count" id="cvbt-count"></div>';
    html += '<div class="bt-table-wrap" id="cvbt-table"></div>';
    html += "</div>";

    html += '<aside class="cvbt-side"><div class="cvbt-side-inner">';
    html += '<div class="cvbt-side-title">' + escapeHTML(S.filters) + "</div>";
    html += '<div class="cvbt-side-group"><span class="bt-filter-label">' +
      escapeHTML(S.cameras) + tip(S.tip.fCameras) + "</span>" +
      '<div class="bt-slider-group cvbt-slider">' +
      '<input type="range" id="cvbt-cameras" min="' + cameras[0] + '" max="' + maxCams +
      '" step="1" value="' + state.camerasMax + '" aria-label="' + escapeHTML(S.cameras) + '">' +
      '<span class="bt-slider-value" id="cvbt-cameras-value">' +
      escapeHTML(S.camerasValue(state.camerasMax)) + "</span></div>" +
      '<p class="cvbt-side-hint">' + escapeHTML(S.camerasHint(maxCams)) + "</p></div>";
    html += '<div class="cvbt-side-group"><span class="bt-filter-label">' +
      escapeHTML(S.device) + tip(S.tip.fDevice) + "</span>" + deviceButtons() + "</div>";
    html += '<div class="cvbt-side-group"><span class="bt-filter-label">' +
      escapeHTML(S.model) + tip(S.tip.fModel) + "</span>" + modelList() + "</div>";
    html += '<div class="cvbt-reset-row">' +
      '<button type="button" class="bt-btn cvbt-reset" id="cvbt-reset">' +
      escapeHTML(S.resetFilters) + "</button>" + tip(S.tip.reset) + "</div>";
    html += "</div></aside></div>";
    /* Outside the table and the panel, both of which are redrawn: the bubble
       is position:fixed and follows whichever icon opened it. */
    html += '<div class="bt-tooltip" id="cvbt-tooltip" role="tooltip" hidden></div>';
    /* The clip lives here, not inside a row: the table is re-rendered on every
       click and slider step, and a video element inside it would restart from
       the first frame each time. Off-screen rather than display:none, which
       browsers may treat as "not worth decoding". */
    if (previewVideoUrl) {
      html += '<video class="cvbt-preview-src" id="cvbt-video" src="' +
        escapeHTML(previewVideoUrl) + '" muted loop playsinline preload="auto" ' +
        'aria-hidden="true" tabindex="-1"></video>';
    }
    container.innerHTML = html;

    var video = container.querySelector("#cvbt-video");
    if (video) {
      video.muted = true;                  // attribute alone is not enough in every browser
      video.addEventListener("loadeddata", function () {
        previews.panes.forEach(function (p) { paintPreview(p, false); });
      });
      var started = video.play();
      if (started && started.catch) started.catch(function () { /* fallback scene stays */ });
    }

    /* Delegated listeners live on the container, which survives a reset -
       only its contents are rebuilt - so they are attached once. Attaching
       them again on every build made each click toggle a row twice. */
    if (!container.cvbtWired) {
      wire(container);
      wireTooltips(container);
      container.cvbtWired = true;
    }
    wireCameras(container);
    renderTable(container);
  }

  /* The same controls as the LLM widget: pill buttons for devices, which
     stay a short list, and a searchable checklist with an "All" toggle for
     models, which grow with every run published. */
  function deviceButtons() {
    var html = '<div class="bt-filter-buttons" id="cvbt-devices">';
    html += '<button type="button" class="bt-btn' + (state.devices.length ? "" : " bt-active") +
      '" data-device="__all">' + escapeHTML(S.showAll) + "</button>";
    uniq("device").forEach(function (d) {
      html += '<button type="button" class="bt-btn' +
        (state.devices.indexOf(d) > -1 ? " bt-active" : "") + '" data-device="' +
        escapeHTML(d) + '">' + escapeHTML(d) + "</button>";
    });
    return html + "</div>";
  }

  function paintDevices(container) {
    Array.prototype.forEach.call(container.querySelectorAll("[data-device]"), function (b) {
      var v = b.getAttribute("data-device");
      b.classList.toggle("bt-active",
        v === "__all" ? !state.devices.length : state.devices.indexOf(v) > -1);
    });
  }

  function allModelsTicked() {
    return uniq("model").every(function (m) { return state.models[m]; });
  }

  function tickAllModels(on) {
    state.models = {};
    if (on) uniq("model").forEach(function (m) { state.models[m] = true; });
  }

  function modelList() {
    var html = '<div class="bt-model-filter">';
    html += '<input type="text" class="bt-model-search cvbt-search" id="cvbt-model-search" placeholder="' +
      escapeHTML(S.searchModels) + '" aria-label="' + escapeHTML(S.searchModels) + '">';
    html += '<div class="bt-model-list" id="cvbt-model-list">';
    html += '<label class="bt-model-option"><input type="checkbox" id="cvbt-model-all"' +
      (allModelsTicked() ? " checked" : "") + "> " + escapeHTML(S.all) + "</label>";
    uniq("model").forEach(function (m) {
      html += '<label class="bt-model-option"><input type="checkbox" class="cvbt-model-cb" value="' +
        escapeHTML(m) + '"' + (state.models[m] ? " checked" : "") + "> " + escapeHTML(m) + "</label>";
    });
    return html + "</div></div>";
  }

  function wire(container) {
    container.addEventListener("click", function (e) {
      if (!e.target.closest) return;
      /* The info icons sit inside the headers and the filter labels; opening
         one must not also sort the column or toggle anything. */
      if (e.target.closest(".bt-tip")) return;

      var btn = e.target.closest(".bt-btn");
      if (btn && btn.id === "cvbt-reset") { reset(container); return; }

      var dev = e.target.closest("[data-device]");
      if (dev) {
        var v = dev.getAttribute("data-device");
        if (v === "__all") {
          state.devices = [];
        } else {
          var at = state.devices.indexOf(v);
          if (at > -1) state.devices.splice(at, 1); else state.devices.push(v);
        }
        paintDevices(container);
        renderTable(container);
        return;
      }

      var th = e.target.closest("th[data-col]");
      if (th) {
        var col = th.getAttribute("data-col");
        if (state.sortCol === col) state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        else { state.sortCol = col; state.sortDir = "asc"; }
        renderTable(container);
        return;
      }

      var dp = e.target.closest(".bt-dp-row");
      if (dp) {
        state.previewAt[dp.dataset.entry] = Number(dp.dataset.cameras);
        renderTable(container);
        return;
      }

      var row = e.target.closest(".bt-row");
      if (row) {
        state.expanded[row.dataset.id] = !state.expanded[row.dataset.id];
        renderTable(container);
      }
    });

    container.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var target = e.target.closest ? e.target.closest(".bt-dp-row, .bt-row") : null;
      if (!target) return;
      e.preventDefault();
      target.click();
    });

    /* The target slider lives inside each expanded row, which means it sits in
       the part of the DOM renderTable() replaces. Re-rendering on every `input`
       would tear the element out from under the drag, so the value follows the
       thumb live and the table catches up on `change` - i.e. when the drag ends
       or an arrow key is pressed. */
    container.addEventListener("input", function (e) {
      var el = e.target;
      if (!el.classList || !el.classList.contains("cvbt-target")) return;
      state.targetFps = Number(el.value);
      var label = el.parentNode.querySelector(".cvbt-target-value");
      if (label) label.textContent = state.targetFps + " FPS";
    });
    container.addEventListener("change", function (e) {
      var el = e.target;
      if (el.classList && el.classList.contains("cvbt-target")) {
        renderTable(container);
        return;
      }
      /* "All" is a select-all / clear-all toggle. Unticking it empties the
         selection so the reader can then tick just the models they want. */
      if (el.id === "cvbt-model-all") {
        tickAllModels(el.checked);
        Array.prototype.forEach.call(container.querySelectorAll(".cvbt-model-cb"), function (cb) {
          cb.checked = el.checked;
        });
        renderTable(container);
        return;
      }
      if (el.classList && el.classList.contains("cvbt-model-cb")) {
        if (el.checked) state.models[el.value] = true; else delete state.models[el.value];
        container.querySelector("#cvbt-model-all").checked = allModelsTicked();
        renderTable(container);
      }
    });

    /* Typing filters the list in place - the ticked boxes stay ticked even
       while hidden, so a search cannot silently drop a selection. "All"
       always stays visible. */
    container.addEventListener("input", function (e) {
      if (e.target.id !== "cvbt-model-search") return;
      var term = e.target.value.trim().toLowerCase();
      Array.prototype.forEach.call(
        container.querySelectorAll("#cvbt-model-list .bt-model-option"), function (label) {
          if (label.querySelector("#cvbt-model-all")) return;
          label.style.display =
            !term || label.textContent.toLowerCase().indexOf(term) > -1 ? "" : "none";
        });
    });
  }

  /* This slider is outside the table, so re-rendering on every step cannot
     interrupt the drag - unlike the target slider inside a row. It is rebuilt
     with the panel, so it is wired on every build. */
  function wireCameras(container) {
    var camerasEl = container.querySelector("#cvbt-cameras");
    camerasEl.addEventListener("input", function () {
      state.camerasMax = Number(camerasEl.value);
      container.querySelector("#cvbt-cameras-value").textContent =
        S.camerasValue(state.camerasMax);
      renderTable(container);
    });
  }

  function wireTooltips(container) {
    var tipEl = function () { return container.querySelector("#cvbt-tooltip"); };
    var openBtn = null;
    /* Touch browsers send a synthetic mouseover before the click, so by the
       time the click lands the bubble is already open and a plain toggle would
       close what the tap was meant to open. Only a second tap should close. */
    var openedByTap = false;

    function show(btn) {
      var el = tipEl();
      el.innerHTML = btn.getAttribute("data-tip");
      el.hidden = false;
      /* Positioned against the viewport: the bubble is position:fixed. */
      var r = btn.getBoundingClientRect();
      var w = el.offsetWidth, h = el.offsetHeight;
      var left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
      var top = r.bottom + 8;
      /* flip above the icon when there is no room below */
      if (top + h > window.innerHeight - 8 && r.top - h - 8 > 0) top = r.top - h - 8;
      el.style.left = left + "px";
      el.style.top = top + "px";
      openBtn = btn;
    }

    function hide() {
      var el = tipEl();
      if (el) el.hidden = true;
      openBtn = null;
      openedByTap = false;
    }

    /* A tooltip held open by keyboard focus or a tap would sit still while its
       icon scrolled away, so re-anchor it - and drop it once the icon leaves
       the viewport or the table redraw has removed it. */
    var reanchorQueued = false;
    function reanchor() {
      if (!openBtn || reanchorQueued) return;
      reanchorQueued = true;
      requestAnimationFrame(function () {
        reanchorQueued = false;
        if (!openBtn) return;
        if (!document.contains(openBtn)) { hide(); return; }
        var r = openBtn.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) { hide(); return; }
        show(openBtn);
      });
    }
    /* capture, so a scroll inside the table wrapper or the panel counts too */
    window.addEventListener("scroll", reanchor, { capture: true, passive: true });
    window.addEventListener("resize", reanchor);

    /* Tap toggles on touch devices; hover and keyboard focus cover the rest. */
    container.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest(".bt-tip") : null;
      if (btn) {
        e.preventDefault();
        if (openBtn === btn && openedByTap) hide();
        else { show(btn); openedByTap = true; }
        return;
      }
      if (!e.target.closest || !e.target.closest("#cvbt-tooltip")) hide();
    });
    container.addEventListener("mouseover", function (e) {
      var btn = e.target.closest ? e.target.closest(".bt-tip") : null;
      if (btn && openBtn !== btn) { show(btn); openedByTap = false; }
    });
    container.addEventListener("mouseout", function (e) {
      var btn = e.target.closest ? e.target.closest(".bt-tip") : null;
      if (btn && openBtn === btn) hide();
    });
    container.addEventListener("focusin", function (e) {
      if (e.target.classList && e.target.classList.contains("bt-tip")) show(e.target);
    });
    container.addEventListener("focusout", function (e) {
      if (e.target.classList && e.target.classList.contains("bt-tip")) hide();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") hide();
    });
  }

  function reset(container) {
    state.devices = [];
    tickAllModels(true);
    state.targetFps = Number(data.config.target_fps) || 15;
    state.expanded = {};
    state.previewAt = {};
    var cams = allCameraCounts();
    state.camerasMax = cams.length ? cams[cams.length - 1] : 1;
    buildUI(container);
  }

  /* `left` marks the columns whose values are names, not numbers. */
  var COLUMNS = [
    { key: "model",   label: function () { return S.colModel; },     t: "model",     left: true },
    { key: "input",   label: function () { return S.colInput; },     t: "input" },
    { key: "device",  label: function () { return S.colDevice; },    t: "device",    left: true },
    { key: "cameras", label: function () { return S.colAtCameras; }, t: "atCameras" },
    { key: "percam",  label: function () { return S.colPerCam; },    t: "perCam" },
    { key: "total",   label: function () { return S.colTotal; },     t: "total" },
    { key: "drop",    label: function () { return S.colDrop; },      t: "drop" },
    { key: "maxcams", label: function () { return S.colMaxCams + " (≥ " + state.targetFps + " FPS)"; },
      t: "maxCams" },
    { key: "expand",  label: function () { return ""; } },
  ];

  function pixels(res) {
    var m = /^(\d+)\s*x\s*(\d+)$/i.exec(res || "");
    return m ? Number(m[1]) * Number(m[2]) : null;
  }

  /* The value a column sorts on. Null means the row has nothing there. */
  function sortValue(entry, col) {
    var p = shownPoint(entry);
    switch (col) {
      case "model":   return entry.model + " " + entry.precision;
      case "device":  return entry.device;
      case "input":   return pixels(entry.input_resolution);
      case "cameras": return p ? p.cameras : null;
      case "percam":  return p ? p.fps_per_camera : null;
      case "total":   return p ? p.fps_total : null;
      case "drop":    return p ? p.drop_pct : null;
      case "maxcams": return maxCameras(entry);
    }
    return null;
  }

  /* Rows with nothing to sort on sink to the bottom in both directions, so
     flipping the sort never parks the blanks at the top. Ties keep the load
     order - model, then device - because Array.prototype.sort is stable. */
  function sortEntries(entries) {
    var col = state.sortCol, dir = state.sortDir === "asc" ? 1 : -1;
    return entries.slice().sort(function (a, b) {
      var va = sortValue(a, col), vb = sortValue(b, col);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "string") return dir * va.localeCompare(vb);
      return dir * (va - vb);
    });
  }

  function renderTable(container) {
    var entries = sortEntries(visibleEntries());
    container.querySelector("#cvbt-count").innerHTML =
      '<span class="bt-count-label">' + escapeHTML(S.matching) + "</span> " +
      S.matchingCount(entries.length, data.benchmarks.length);

    var wrap = container.querySelector("#cvbt-table");
    if (!entries.length) {
      wrap.innerHTML = '<div class="bt-empty">' + escapeHTML(S.noMatch) + "</div>";
      startPreviews(container);   // clears any loop the old rows left running
      return;
    }

    var html = '<table class="bt-table"><thead><tr>';
    COLUMNS.forEach(function (col) {
      var classes = [];
      if (col.t) {
        classes.push("bt-sortable");
        if (state.sortCol === col.key) {
          classes.push(state.sortDir === "asc" ? "bt-sorted-asc" : "bt-sorted-desc");
        }
      } else {
        classes.push("bt-no-sort");
      }
      if (col.left) classes.push("bt-th-left");
      html += '<th class="' + classes.join(" ") + '"' +
        (col.t ? ' data-col="' + col.key + '"' : "") + ">" +
        escapeHTML(col.label()) + (col.t ? tip(S.tip[col.t]) : "") + "</th>";
    });
    html += "</tr></thead><tbody>";

    entries.forEach(function (entry) {
      html += entryRow(entry);
      if (state.expanded[entry.id]) html += detailRow(entry);
    });
    wrap.innerHTML = html + "</tbody></table>";
    startPreviews(container);
  }

  function entryRow(entry) {
    var point = shownPoint(entry);
    var expanded = !!state.expanded[entry.id];
    var html = '<tr class="bt-row" data-id="' + escapeHTML(entry.id) + '" tabindex="0" role="button"' +
      ' aria-expanded="' + expanded + '" title="' + escapeHTML(S.viewDetails) + '">';

    /* Precision rides with the model name rather than holding a column of its
       own: it is a property of that model as built, it is never sorted on, and
       the width it cost pushed the last column out of the table. */
    html += '<td class="bt-left">' + escapeHTML(entry.model) +
      (entry.precision ? ' <span class="cvbt-sub">' + escapeHTML(entry.precision) + "</span>" : "") +
      "</td>";
    html += '<td class="bt-num">' + escapeHTML(entry.input_resolution || "—") + "</td>";
    html += '<td class="bt-left">' + escapeHTML(entry.device) + "</td>";

    /* Rows can report at different camera counts - each shows the heaviest
       load it was measured at within the limit - so the count has to travel
       with the numbers or they are not comparable. */
    html += '<td class="bt-num"' + (point ? ' title="' +
      escapeHTML(S.atCamerasTip(point.cameras, state.camerasMax)) + '"' : "") + ">" +
      (point ? point.cameras : '<span class="bt-muted">—</span>') + "</td>";

    if (!point) {
      html += '<td class="bt-muted" colspan="3" title="' + escapeHTML(S.notMeasured) + '">—</td>';
    } else {
      var ok = point.fps_per_camera >= state.targetFps;
      html += '<td class="bt-num ' + (ok ? "bt-good" : "bt-bad") + '" title="' +
        escapeHTML(ok ? S.targetMet : S.targetNotMet) + '">' + fmt(point.fps_per_camera) + "</td>";
      html += '<td class="bt-num">' + fmt(point.fps_total) + "</td>";
      html += '<td class="bt-num">' + fmt(point.drop_pct, 2) + "</td>";
    }

    var max = maxCameras(entry);
    var limited = !saturated(entry);
    html += '<td class="bt-num"' +
      (limited ? ' title="' + escapeHTML(S.sourceLimitedTip(sourceFps(entry))) + '"'
               : ' title="' + escapeHTML(S.saturatedTip) + '"') + ">" +
      (max > 0 ? max : '<span class="bt-muted">0</span>') +
      (limited ? ' <span class="bt-muted">≥</span>' : "") + "</td>";
    html += '<td class="bt-expand-cell">' + (expanded ? "&#9660;" : "&#9654;") + "</td>";
    return html + "</tr>";
  }

  function detailRow(entry) {
    var html = '<tr class="bt-detail-row"><td colspan="' + COLUMNS.length + '">';
    html += '<div class="bt-detail-content bt-visible">';

    var shown = previewPoint(entry);
    html += '<div class="cvbt-target-row">' +
      '<span class="bt-filter-label">' + escapeHTML(S.targetFps) + tip(S.tip.target) + "</span>" +
      '<div class="bt-slider-group">' +
      '<input type="range" class="cvbt-target" min="1" max="30" step="1" value="' +
      state.targetFps + '" aria-label="' + escapeHTML(S.targetFps) + '">' +
      '<span class="bt-slider-value cvbt-target-value">' + state.targetFps + " FPS</span></div>" +
      '<span class="cvbt-target-hint">' + escapeHTML(S.targetHint) + "</span></div>";
    html += '<div class="bt-detail-top">';
    html += '<table class="bt-detail-table"><thead><tr>' +
      "<th>" + escapeHTML(S.detailCameras) + "</th>" +
      "<th>" + escapeHTML(S.detailPerCam) + "</th>" +
      "<th>" + escapeHTML(S.detailTotal) + "</th>" +
      "<th>" + escapeHTML(S.detailDrop) + "</th>" +
      "<th>" + escapeHTML(S.detailStatus) + "</th></tr></thead><tbody>";
    pointsWithin(entry).forEach(function (p) {
      var ok = p.fps_per_camera >= state.targetFps;
      /* Each measurement drives the preview beside it, so the row is a
         control: focusable, Enter/Space-activated, and labelled with its own
         camera count rather than one title shared by every row. */
      html += '<tr class="bt-dp-row' + (shown && p.cameras === shown.cameras ? " bt-dp-active" : "") +
        '" data-entry="' + escapeHTML(entry.id) + '" data-cameras="' + p.cameras +
        '" tabindex="0" role="button" title="' +
        escapeHTML(S.previewSub(p.cameras, fmt(p.fps_per_camera))) + '">' +
        "<td>" + p.cameras + "</td><td>" + fmt(p.fps_per_camera) + "</td><td>" +
        fmt(p.fps_total) + "</td><td>" + fmt(p.drop_pct, 2) + '</td><td class="' +
        (ok ? "bt-detail-pass" : "bt-detail-fail") + '">' +
        escapeHTML(ok ? S.pass : S.fail) + "</td></tr>";
    });
    html += "</tbody></table>";
    html += previewPanel(entry, shown);
    html += "</div>";

    html += '<div class="bt-chart-card"><div class="bt-chart-header">' +
      escapeHTML(S.chartTitle) + "</div>" + chart(entry) + "</div>";

    var facts = [];
    if (entry.deepstream) facts.push("DeepStream " + escapeHTML(entry.deepstream));
    if (entry.device_kind) facts.push(escapeHTML(entry.device_kind));
    if (entry.device_detail) facts.push(escapeHTML(entry.device_detail));
    if (entry.gpu_memory) facts.push(escapeHTML(entry.gpu_memory));
    if (entry.jetpack) facts.push("JetPack " + escapeHTML(entry.jetpack));
    if (entry.l4t) facts.push("L4T " + escapeHTML(entry.l4t));
    if (entry.cuda) facts.push("CUDA " + escapeHTML(entry.cuda));
    if (entry.cpu) facts.push(escapeHTML(entry.cpu));
    html += '<div class="bt-detail-notes"><strong>' + escapeHTML(S.hardware) + "</strong> " +
      facts.join(" · ");
    if (entry.measure_s) html += "<br>" + escapeHTML(S.measuredFor(entry.measure_s));
    if (entry.runs && entry.runs.length) {
      html += "<br><strong>" + escapeHTML(S.runs) + "</strong> " +
        escapeHTML(entry.runs.join(", "));
    }
    html += "</div>";

    return html + "</div></td></tr>";
  }

  /* ── Stream preview ──
     A number in a table does not tell anyone what 7 FPS looks like. This draws
     the same synthetic camera scene twice - once stepped at the camera's own
     frame rate, once at the rate this configuration sustained - so the gap
     between them is visible rather than inferred. Nothing here is footage:
     it is a simulation of a frame rate, and the note under it says so. */

  function previewPoint(entry) {
    var picked = state.previewAt[entry.id];
    var point = picked ? pointAt(entry, picked) : null;
    /* A pick above the current limit is out of view, so fall back to the row's
       own headline point - the heaviest load measured within the limit. */
    if (point && point.cameras > state.camerasMax) point = null;
    return point || shownPoint(entry);
  }

  function previewPanel(entry, point) {
    if (!point) return "";
    var srcFps = sourceFps(entry);
    var fps = Number(point.fps_per_camera) || 0;
    var keepsUp = fps >= srcFps * 0.95;

    var html = '<div class="bt-detail-preview">';
    html += '<div class="bt-tps-preview-title">' + escapeHTML(S.previewTitle) + "</div>";
    html += '<div class="bt-preview-sub' + (keepsUp ? "" : " bt-sub-bad") + '">' +
      escapeHTML(S.previewSub(point.cameras, fmt(fps))) +
      (keepsUp ? " · " + escapeHTML(S.previewMatches) : "") + "</div>";
    /* 1280x400 backing store for a box that is rarely wider than 640 CSS px:
       the panes stay sharp on a 2x display and the clip maps close to 1:1. */
    html += '<canvas class="cvbt-preview" width="1280" height="400" role="img" aria-label="' +
      escapeHTML(S.previewTitle + " — " + S.previewSub(point.cameras, fmt(fps))) +
      '" data-fps="' + fps + '" data-source-fps="' + srcFps + '"></canvas>';
    html += '<p class="bt-preview-note">' + escapeHTML(S.previewPick) + " " +
      escapeHTML(S.previewNote) + "</p>";
    return html + "</div>";
  }

  function reducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  var previews = { raf: null, panes: [] };

  function startPreviews(container) {
    if (previews.raf) { cancelAnimationFrame(previews.raf); previews.raf = null; }
    var clip = container.querySelector("#cvbt-video");
    previews.panes = Array.prototype.map.call(
      container.querySelectorAll("canvas.cvbt-preview"), function (canvas) {
        return {
          ctx: canvas.getContext("2d"),
          w: canvas.width, h: canvas.height,
          /* Until the clip has decoded a frame the synthetic scene shows in its
             place, so an unplayable or still-loading video costs nothing. */
          video: clip,
          left: { fps: Number(canvas.dataset.sourceFps) || 20, phase: 0, last: 0, frames: 0 },
          right: { fps: Number(canvas.dataset.fps) || 1, phase: 0, last: 0, frames: 0 },
        };
      });
    /* Nothing expanded means nothing to draw: stop decoding rather than
       leaving a hidden clip running for the life of the page. */
    if (clip) {
      if (previews.panes.length) {
        var resumed = clip.play();
        if (resumed && resumed.catch) resumed.catch(function () { /* fallback scene */ });
      } else {
        clip.pause();
      }
    }
    if (!previews.panes.length) return;

    /* Paint one frame synchronously before asking for any animation frames.
       requestAnimationFrame does not fire in a background tab and can be
       throttled or absent entirely; without this the panel would sit as an
       empty black rectangle in exactly those cases. */
    var still = reducedMotion();
    previews.panes.forEach(function (p) {
      p.left.phase = 0.45;
      p.right.phase = 0.30;
      p.left.frames = 9;
      p.right.frames = Math.max(1, Math.round(9 * p.right.fps / p.left.fps));
      paintPreview(p, still);
    });
    if (still) return;
    var t0 = 0;
    (function tick(now) {
      if (!t0) t0 = now;
      var t = (now - t0) / 1000;
      previews.panes.forEach(function (p) {
        /* Each pane is repainted only when it samples. Repainting both
           together would hand the slower pane a fresh frame every time the
           faster one ticked - it would hold the right FPS in its counter
           while moving at the wrong one on screen. Holding the old pixels
           between samples IS the stutter this panel exists to show. */
        if (stepPane(p.left, t)) paintPane(p, "left", false);
        if (stepPane(p.right, t)) paintPane(p, "right", false);
      });
      previews.raf = requestAnimationFrame(tick);
    })(0);
  }

  var CROSSING_S = 5;   // seconds for the subject to cross the frame

  function stepPane(pane, t) {
    var period = 1 / Math.max(pane.fps, 0.5);
    if (t - pane.last < period) return 0;
    /* Advance the deadline by exactly one period rather than to the tick that
       happened to cross it: a 20 FPS pane driven by 60 Hz frames would
       otherwise lose the remainder every step and animate at 16 FPS while
       claiming 20. Falling more than a few periods behind (a hidden tab) is
       resynced instead of replayed. */
    pane.last = (t - pane.last > period * 3) ? t : pane.last + period;
    /* Both panes read the same clock, so the subject is at the same place in
       both - the only difference is how often each one is allowed to look. */
    pane.phase = (t % CROSSING_S) / CROSSING_S;
    pane.frames++;
    return 1;
  }

  var PANE_GAP = 8;

  function paintPane(p, side, still) {
    var half = p.w / 2;
    if (side === "left") {
      drawPane(p.ctx, 0, 0, half - PANE_GAP / 2, p.h, p.left, S.previewSource, p, still);
    } else {
      drawPane(p.ctx, half + PANE_GAP / 2, 0, half - PANE_GAP / 2, p.h, p.right,
               S.previewThis, p, still);
    }
  }

  function paintPreview(p, still) {
    paintPane(p, "left", still);
    paintPane(p, "right", still);
  }

  function videoReady(video) {
    return !!video && video.readyState >= 2 && video.videoWidth > 0;
  }

  function drawPane(ctx, x, y, w, h, pane, caption, owner, still) {
    var s = h / 200;                       // every size below is authored at h=200
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();

    if (videoReady(owner.video)) {
      drawVideoFrame(ctx, owner.video, w, h);
    } else {
      drawSyntheticScene(ctx, w, h, pane, s);
    }
    drawOverlay(ctx, w, h, pane, caption, s, still);

    ctx.strokeStyle = "rgba(255,255,255,.14)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    ctx.restore();
  }

  /* Cover-crop, like CSS object-fit: cover - the clip fills the pane and the
     overflow is trimmed, so neither pane letterboxes or distorts. */
  function drawVideoFrame(ctx, video, w, h) {
    var vw = video.videoWidth, vh = video.videoHeight;
    var scale = Math.max(w / vw, h / vh);
    var sw = w / scale, sh = h / scale;
    ctx.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, w, h);
  }

  /* Shown until the clip has a frame, and whenever it cannot be played at all.
     Same subject, same stepping - only the pixels are cheaper. */
  function drawSyntheticScene(ctx, w, h, pane, s) {
    var sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#182029");
    sky.addColorStop(1, "#0c1116");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    var horizon = h * 0.42;
    ctx.fillStyle = "#151c24";
    ctx.fillRect(0, horizon, w, h - horizon);
    ctx.strokeStyle = "rgba(255,255,255,.06)";
    ctx.lineWidth = 1;
    for (var i = 1; i < 6; i++) {
      var ly = horizon + Math.pow(i / 6, 1.8) * (h - horizon);
      ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(w, ly); ctx.stroke();
    }

    var px = 14 * s + pane.phase * (w - 60 * s);
    var bob = Math.sin(pane.phase * Math.PI * 12) * 2 * s;
    var bodyH = h * 0.30, bodyW = bodyH * 0.38;
    var baseY = h * 0.86 + bob;
    ctx.fillStyle = "#c7d2dd";
    ctx.fillRect(px, baseY - bodyH, bodyW, bodyH);
    ctx.beginPath();
    ctx.arc(px + bodyW / 2, baseY - bodyH - bodyW * 0.42, bodyW * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }

  /* The camera OSD: what makes the two panes readable as the same stream at
     two frame rates. The frame counter is the tell - it climbs nearly three
     times faster on the left when the right one is at 7 FPS. */
  function drawOverlay(ctx, w, h, pane, caption, s, still) {
    var grad = ctx.createLinearGradient(0, h - 34 * s, 0, h);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,.72)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, h - 34 * s, w, 34 * s);
    ctx.fillStyle = "rgba(0,0,0,.45)";
    ctx.fillRect(0, 0, w, 22 * s);

    ctx.font = "600 " + (9 * s).toFixed(1) + "px ui-monospace,Menlo,Consolas,monospace";
    ctx.fillStyle = "rgba(255,255,255,.75)";
    ctx.fillText("CAM 01", 8 * s, 14 * s);
    ctx.textAlign = "right";
    ctx.fillStyle = "#76b900";
    ctx.fillText(pane.fps.toFixed(1) + " FPS", w - 8 * s, 14 * s);
    ctx.fillStyle = "rgba(255,255,255,.6)";
    ctx.fillText("frame " + pane.frames, w - 8 * s, h - 9 * s);
    ctx.textAlign = "left";

    ctx.font = "700 " + (10 * s).toFixed(1) + "px -apple-system,Segoe UI,system-ui,sans-serif";
    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.fillText(caption, 8 * s, h - 9 * s);

    if (still) {
      ctx.fillStyle = "rgba(0,0,0,.55)";
      ctx.fillRect(0, h / 2 - 11 * s, w, 22 * s);
      ctx.fillStyle = "rgba(255,255,255,.8)";
      ctx.font = (10 * s).toFixed(1) + "px -apple-system,Segoe UI,system-ui,sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(S.previewStill, w / 2, h / 2 + 4 * s);
      ctx.textAlign = "left";
    }
  }

  /* Inline SVG rather than a charting library: two series, a handful of points,
     and it has to survive being printed and read without JavaScript running. */
  function chart(entry) {
    var W = 720, H = 260, padL = 52, padR = 52, padT = 16, padB = 34;
    var pts = pointsWithin(entry);
    if (pts.length < 2) return "";

    var xs = pts.map(function (p) { return p.cameras; });
    var xMin = Math.min.apply(null, xs), xMax = Math.max.apply(null, xs);
    var perMax = Math.max.apply(null, pts.map(function (p) { return p.fps_per_camera || 0; }));
    var totMax = Math.max.apply(null, pts.map(function (p) { return p.fps_total || 0; }));
    perMax = Math.ceil((perMax || 1) * 1.15);
    totMax = Math.ceil((totMax || 1) * 1.15);

    var pw = W - padL - padR, ph = H - padT - padB;
    var X = function (v) { return padL + (xMax === xMin ? 0 : (v - xMin) / (xMax - xMin) * pw); };
    var Yl = function (v) { return padT + ph - (v / perMax) * ph; };
    var Yr = function (v) { return padT + ph - (v / totMax) * ph; };

    var svg = '<svg class="bt-chart-svg" viewBox="0 0 ' + W + " " + H +
      '" preserveAspectRatio="xMidYMid meet" font-size="11" font-family="inherit">';
    for (var i = 0; i <= 4; i++) {
      var y = padT + ph - (i / 4) * ph;
      svg += '<line x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (W - padR) +
        '" y2="' + y.toFixed(1) + '" stroke="currentColor" stroke-opacity=".12"/>';
      svg += '<text x="' + (padL - 8) + '" y="' + (y + 4).toFixed(1) +
        '" text-anchor="end" fill="' + PALETTE[0] + '">' + (perMax * i / 4).toFixed(0) + "</text>";
      svg += '<text x="' + (W - padR + 8) + '" y="' + (y + 4).toFixed(1) +
        '" fill="' + PALETTE[1] + '">' + (totMax * i / 4).toFixed(0) + "</text>";
    }
    // The target line is the whole point of the per-camera series.
    if (state.targetFps <= perMax) {
      svg += '<line x1="' + padL + '" y1="' + Yl(state.targetFps).toFixed(1) + '" x2="' +
        (W - padR) + '" y2="' + Yl(state.targetFps).toFixed(1) +
        '" stroke="' + PALETTE[3] + '" stroke-dasharray="4 4" stroke-opacity=".8"/>';
    }
    xs.forEach(function (x) {
      svg += '<text x="' + X(x).toFixed(1) + '" y="' + (H - padB + 18) +
        '" text-anchor="middle" fill="currentColor" fill-opacity=".6">' + x + "</text>";
    });

    [["fps_per_camera", Yl, PALETTE[0]], ["fps_total", Yr, PALETTE[1]]].forEach(function (series) {
      var key = series[0], Y = series[1], color = series[2];
      var d = pts.map(function (p, i) {
        return (i ? "L" : "M") + X(p.cameras).toFixed(1) + "," + Y(p[key] || 0).toFixed(1);
      }).join(" ");
      svg += '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2"/>';
      pts.forEach(function (p) {
        svg += '<circle cx="' + X(p.cameras).toFixed(1) + '" cy="' + Y(p[key] || 0).toFixed(1) +
          '" r="3.5" fill="' + color + '"><title>' + p.cameras + " → " +
          fmt(p[key]) + "</title></circle>";
      });
    });
    svg += '<text x="' + (padL + pw / 2) + '" y="' + (H - 2) +
      '" text-anchor="middle" fill="currentColor" fill-opacity=".6">' +
      escapeHTML(S.xTitle) + "</text></svg>";

    return svg + '<div class="bt-chart-legend">' +
      '<span class="bt-legend-item"><span class="bt-legend-swatch" style="background:' +
      PALETTE[0] + '"></span>' + escapeHTML(S.chartPerCam) + "</span>" +
      '<span class="bt-legend-item"><span class="bt-legend-swatch" style="background:' +
      PALETTE[1] + '"></span>' + escapeHTML(S.chartTotal) + "</span></div>";
  }

  /* ── The folder store ──
     assets/data/cv-benchmarks/
       index.json                 what exists
       <device>/device.json       the GPU, written once per device
       <device>/<model>.json      measurements, keyed by camera count

     The store is written a little at a time - a device, a model, one re-run
     camera count - so nothing here assumes a file was produced in one go. A
     browser cannot list a directory, which is why index.json exists; every
     other file is reached through it. */

  function getJSON(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url.split("/").pop() + ": HTTP " + r.status);
      return r.json();
    });
  }

  function loadStore(indexUrl, index) {
    var base = indexUrl.replace(/[^/]*$/, "");
    var jobs = [];
    (index.devices || []).forEach(function (device) {
      (device.models || []).forEach(function (model) {
        jobs.push(Promise.all([
          getJSON(base + device.path),
          getJSON(base + model.path),
        ]).then(function (pair) {
          return entryFrom(index, pair[0], pair[1], model.path);
        }).catch(function (err) {
          /* A file the index names but that is no longer there - someone
             deleted a device or a model and the index was not rebuilt. That
             row is missing, which is not a reason to blank the whole page:
             drop it and show the rest. */
          if (window.console) console.warn("cv-benchmarks: " + err.message);
          return null;
        }));
      });
    });

    return Promise.all(jobs).then(function (entries) {
      if (jobs.length && !entries.filter(Boolean).length) {
        throw new Error(S.storeUnreadable);
      }
      return {
        config: index.config || {},
        source_profiles: index.source_profiles || {},
        attribution: index.attribution || {},
        benchmarks: entries.filter(Boolean).sort(function (a, b) {
          return a.model.localeCompare(b.model) || a.device.localeCompare(b.device);
        }),
      };
    });
  }

  function entryFrom(index, device, model, path) {
    var points = Object.keys(model.points || {})
      .map(function (k) { return model.points[k]; })
      .sort(function (a, b) { return a.cameras - b.cameras; });
    if (!points.length) return null;

    var profiles = index.source_profiles || {};
    var profile = profiles[model.source_profile || index.default_source_profile] || {};
    return {
      id: path.replace(/\.json$/, "").replace(/\//g, "-"),
      model: model.name || model.model_id || "",
      model_id: model.model_id || "",
      task: model.task || "",
      classes: model.classes,
      input_resolution: model.input_resolution || "",
      precision: model.precision || "",
      device: device.name || device.slug || "",
      device_kind: device.kind || "",
      device_detail: device.device_model || "",
      gpu_memory: device.gpu_memory || "",
      cpu: device.cpu || "",
      jetpack: device.jetpack || "",
      l4t: device.l4t || "",
      cuda: device.cuda || "",
      deepstream: model.deepstream || "",
      measure_s: model.measure_s,
      notes: model.notes || "",
      runs: model.runs || [],
      source_fps: Number(profile.fps) || 20,
      data_points: points,
    };
  }

  /* ── Boot ── */

  function init() {
    var container = document.querySelector("[data-cvbt-src]");
    if (!container) return;
    previewVideoUrl = container.getAttribute("data-cvbt-video") || "";
    container.innerHTML = '<div class="bt-loading">' + escapeHTML(S.loading) + "</div>";

    var src = container.getAttribute("data-cvbt-src");
    getJSON(src)
      .then(function (payload) {
        /* Two shapes are accepted: an index describing the folder store, or a
           single file with a `benchmarks` array. The store is what the tool
           writes; the flat file is kept working because it is one fetch and
           makes the widget trivial to embed elsewhere. */
        return payload.devices ? loadStore(src, payload) : payload;
      })
      .then(function (payload) {
        data = payload;
        data.benchmarks = data.benchmarks || [];
        state.targetFps = Number((data.config || {}).target_fps) || 15;
        tickAllModels(true);
        var cams = allCameraCounts();
        /* Opens showing everything measured; the slider only ever narrows. */
        state.camerasMax = cams.length ? cams[cams.length - 1] : 1;
        /* Carried over by the site's language switcher (window.ozCarry), so
           switching language keeps the reader's filters and open rows. */
        var carried = window.ozCarry && window.ozCarry.cvbt;
        if (carried) for (var k in carried) if (state.hasOwnProperty(k)) state[k] = carried[k];
        buildUI(container);
      })
      .catch(function (err) {
        container.innerHTML = '<div class="bt-error">' + escapeHTML(S.loadFailed + err.message) + "</div>";
      });
  }

  /* A hidden tab still decodes video while its animation frames are throttled
     to a crawl, so the clip would burn power to produce frames nobody sees. */
  document.addEventListener("visibilitychange", function () {
    var clip = document.querySelector("#cvbt-video");
    if (!clip) return;
    if (document.hidden) {
      clip.pause();
    } else if (previews.panes.length) {
      var resumed = clip.play();
      if (resumed && resumed.catch) resumed.catch(function () { /* fallback scene */ });
    }
  });

  /* The reader's view as plain data, for the language switcher. */
  window.CvBenchmarkTable = {
    snapshot: function () { return data ? JSON.parse(JSON.stringify(state)) : null; }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
