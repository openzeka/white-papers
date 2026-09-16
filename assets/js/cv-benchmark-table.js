/* ── CV Inference Benchmark Explorer — vanilla JS, zero dependencies ── */
(function () {
  "use strict";

  /* ──────────────────────────────────────────────────────────────────────
     UI STRINGS — the ONLY block that differs between this file and
     cv-benchmark-table.tr.js. Everything below is byte-identical in both.
     ────────────────────────────────────────────────────────────────────── */
  var S = {
    lang: "en",

    loading: "Loading benchmarks…",
    loadFailed: "Failed to load benchmark data: ",
    storeUnreadable: "none of the files the index lists could be read",
    noMatch: "No configurations match the current filters.",

    cameras: "Up to how many cameras",
    camerasHint: function (max) {
      return "Hides measurements above this count; the slider stops at " + max +
        ", the largest camera count measured so far.";
    },
    camerasValue: function (n) { return n + (n === 1 ? " camera" : " cameras"); },
    filters: "Filters",
    search: "Search…",
    selectedCount: function (n) { return n + " selected"; },
    allShown: "all shown",
    clear: "clear",
    noMatchInList: "No match.",
    device: "Device",
    model: "Model",
    showAll: "Show All",
    targetFps: "Target FPS per camera",
    targetHint: "Sets PASS / FAIL below and the Max cameras column above.",
    resetFilters: "Reset All Filters",
    matching: "Matching Configurations",
    matchingCount: function (shown, total) {
      return "<strong>" + shown + "</strong> of <strong>" + total + "</strong>";
    },

    colModel: "Model",
    colInput: "Input",
    colPrecision: "Precision",
    colDevice: "Device",
    colKind: "Type",
    colAtCameras: "Cameras",
    colPerCam: "FPS / camera",
    colTotal: "Total FPS",
    colDrop: "Drop %",
    colMaxCams: "Max cameras",
    colDeepStream: "DeepStream",

    detailCameras: "Cameras",
    detailPerCam: "FPS / camera",
    detailTotal: "Total FPS",
    detailDrop: "Drop %",
    detailStatus: "Status",
    pass: "PASS",
    fail: "FAIL",

    notMeasured: "nothing measured at or below this camera count",
    atCamerasTip: function (n, limit) {
      return "Measured at " + n + (n === 1 ? " camera" : " cameras") +
        " — the highest count measured for this configuration at or below your limit of " +
        limit + ".";
    },
    targetMet: "Target Met — this configuration keeps up at the selected camera count.",
    targetNotMet: "Target Not Met — frame rate falls below your target here.",
    viewDetails: "View Details — full camera sweep and the curve for this configuration.",
    sourceLimited: "Source-limited",
    sourceLimitedTip: function (fps) {
      return "The cameras themselves stream at " + fps + " FPS, and this configuration " +
        "was still delivering that at the largest camera count tested — so its own limit " +
        "was never reached. The figure is a floor, not a ceiling.";
    },
    saturatedTip: "The device's own limit was reached: per-camera frame rate fell below the source rate.",

    previewTitle: "What this stream looks like",
    previewSub: function (cameras, fps) {
      return cameras + (cameras === 1 ? " camera" : " cameras") + " · " + fps + " FPS per camera";
    },
    previewPick: "Pick any measured camera count to preview the frame rate recorded there.",
    previewSource: "Camera source",
    previewThis: "This configuration",
    previewMatches: "keeping up with the source",
    previewNote: "Both panes sample the same clip: the left one at the camera's own rate, " +
      "the right one at the rate this configuration sustained. It is a fixed-camera clip of " +
      "fast-moving vehicles, chosen because frame rate is easiest to judge on fast motion — " +
      "it is not footage from a benchmark run, and no detection is being performed on it.",
    previewStill: "Animation disabled by your system's reduced-motion setting.",

    chartTitle: "Frame rate vs. camera count",
    chartPerCam: "FPS per camera",
    chartTotal: "Total FPS",
    xTitle: "Cameras",
    runs: "Runs:",
    measuredFor: function (s) { return "Measured for " + s + " s per camera count."; },
    hardware: "Hardware:",
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
    devices: {},            // empty object = all
    models: {},
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

  function activeKeys(map) {
    return Object.keys(map).filter(function (k) { return map[k]; });
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
    var devices = activeKeys(state.devices), models = activeKeys(state.models);
    return data.benchmarks.filter(function (b) {
      if (devices.length && devices.indexOf(b.device) === -1) return false;
      if (models.length && models.indexOf(b.model) === -1) return false;
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
    html += '<div class="cvbt-side-group"><label class="bt-filter-label" for="cvbt-cameras">' +
      escapeHTML(S.cameras) + "</label>" +
      '<div class="bt-slider-group cvbt-slider">' +
      '<input type="range" id="cvbt-cameras" min="' + cameras[0] + '" max="' + maxCams +
      '" step="1" value="' + state.camerasMax + '">' +
      '<span class="bt-slider-value" id="cvbt-cameras-value">' +
      escapeHTML(S.camerasValue(state.camerasMax)) + "</span></div>" +
      '<p class="cvbt-side-hint">' + escapeHTML(S.camerasHint(maxCams)) + "</p></div>";
    html += '<div class="cvbt-side-group"><span class="bt-filter-label">' +
      escapeHTML(S.device) + "</span>" + checkboxes("device", uniq("device")) + "</div>";
    html += '<div class="cvbt-side-group"><span class="bt-filter-label">' +
      escapeHTML(S.model) + "</span>" + checkboxes("model", uniq("model")) + "</div>";
    html += '<button type="button" class="bt-btn cvbt-reset" id="cvbt-reset">' +
      escapeHTML(S.resetFilters) + "</button>";
    html += "</div></aside></div>";
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

    wire(container);
    renderTable(container);
  }

  /* Checkboxes rather than a row of buttons: both lists grow with every device
     and model added, and a button row reflows the whole panel as it does. A
     list keeps its height, scrolls, and shows what is selected without the
     reader having to decode which buttons are the active ones. The search box
     appears only once a list is long enough to need it. */
  var SEARCHABLE_FROM = 8;

  function checkboxes(group, values) {
    var map = group === "device" ? state.devices : state.models;
    var selected = activeKeys(map).length;

    var html = '<div class="cvbt-list-head">' +
      '<span class="cvbt-list-count">' +
      escapeHTML(selected ? S.selectedCount(selected) : S.allShown) + "</span>" +
      (selected ? '<button type="button" class="cvbt-clear" data-clear="' + group + '">' +
        escapeHTML(S.clear) + "</button>" : "") + "</div>";

    if (values.length >= SEARCHABLE_FROM) {
      html += '<input type="search" class="bt-model-search cvbt-search" data-search="' + group +
        '" placeholder="' + escapeHTML(S.search) + '" aria-label="' + escapeHTML(S.search) + '">';
    }

    html += '<div class="bt-model-list" data-group="' + group + '">';
    values.forEach(function (v) {
      html += '<label class="bt-model-option"><input type="checkbox" value="' + escapeHTML(v) +
        '"' + (map[v] ? " checked" : "") + "> " + escapeHTML(v) + "</label>";
    });
    return html + "</div>";
  }

  function wire(container) {
    container.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest(".bt-btn") : null;
      if (btn && btn.id === "cvbt-reset") { reset(container); return; }

      var clear = e.target.closest ? e.target.closest(".cvbt-clear") : null;
      if (clear) {
        var map = clear.dataset.clear === "device" ? state.devices : state.models;
        Object.keys(map).forEach(function (k) { delete map[k]; });
        refreshFilters(container);
        renderTable(container);
        return;
      }

      var dp = e.target.closest ? e.target.closest(".bt-dp-row") : null;
      if (dp) {
        state.previewAt[dp.dataset.entry] = Number(dp.dataset.cameras);
        renderTable(container);
        return;
      }

      var row = e.target.closest ? e.target.closest(".bt-row") : null;
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
    /* This slider is outside the table, so re-rendering on every step cannot
       interrupt the drag - unlike the target slider inside a row. */
    var camerasEl = container.querySelector("#cvbt-cameras");
    camerasEl.addEventListener("input", function () {
      state.camerasMax = Number(camerasEl.value);
      container.querySelector("#cvbt-cameras-value").textContent =
        S.camerasValue(state.camerasMax);
      renderTable(container);
    });

    container.addEventListener("input", function (e) {
      var el = e.target;
      if (!el.classList || !el.classList.contains("cvbt-target")) return;
      state.targetFps = Number(el.value);
      var label = el.parentNode.querySelector(".cvbt-target-value");
      if (label) label.textContent = state.targetFps + " FPS";
    });
    container.addEventListener("change", function (e) {
      if (e.target.classList && e.target.classList.contains("cvbt-target")) {
        renderTable(container);
        return;
      }
      var box = e.target;
      if (box.type !== "checkbox" || !box.parentNode.parentNode.dataset.group) return;
      var group = box.parentNode.parentNode.dataset.group;
      var map = group === "device" ? state.devices : state.models;
      if (box.checked) map[box.value] = true; else delete map[box.value];
      /* Only the counter and the clear link change; the checkboxes are left
         alone so the one just clicked keeps focus. */
      refreshFilters(container);
      renderTable(container);
    });

    /* Typing filters the list in place - the checked boxes stay checked even
       while hidden, so a search cannot silently drop a selection. */
    container.addEventListener("input", function (e) {
      var field = e.target;
      if (!field.classList || !field.classList.contains("cvbt-search")) return;
      var needle = field.value.trim().toLowerCase();
      var list = container.querySelector('.bt-model-list[data-group="' +
        field.dataset.search + '"]');
      var shown = 0;
      Array.prototype.forEach.call(list.querySelectorAll(".bt-model-option"), function (opt) {
        var hit = opt.textContent.trim().toLowerCase().indexOf(needle) !== -1;
        opt.hidden = !hit;
        if (hit) shown++;
      });
      var empty = list.querySelector(".cvbt-list-empty");
      if (!shown && !empty) {
        list.insertAdjacentHTML("beforeend",
          '<p class="cvbt-list-empty">' + escapeHTML(S.noMatchInList) + "</p>");
      } else if (shown && empty) {
        empty.remove();
      }
    });
  }

  /* The counter and the clear link, redrawn without touching the inputs. */
  function refreshFilters(container) {
    ["device", "model"].forEach(function (group) {
      var head = container.querySelector('.bt-model-list[data-group="' + group + '"]')
        .parentNode.querySelector(".cvbt-list-head");
      var map = group === "device" ? state.devices : state.models;
      var selected = activeKeys(map).length;
      head.innerHTML = '<span class="cvbt-list-count">' +
        escapeHTML(selected ? S.selectedCount(selected) : S.allShown) + "</span>" +
        (selected ? '<button type="button" class="cvbt-clear" data-clear="' + group + '">' +
          escapeHTML(S.clear) + "</button>" : "");
    });
  }

  function reset(container) {
    state.devices = {};
    state.models = {};
    state.targetFps = Number(data.config.target_fps) || 15;
    state.expanded = {};
    state.previewAt = {};
    var cams = allCameraCounts();
    state.camerasMax = cams.length ? cams[cams.length - 1] : 1;
    buildUI(container);
  }

  var COLUMNS = [
    { label: function () { return S.colModel; }, left: true },
    { label: function () { return S.colInput; } },
    { label: function () { return S.colDevice; }, left: true },
    { label: function () { return S.colAtCameras; } },
    { label: function () { return S.colPerCam; } },
    { label: function () { return S.colTotal; } },
    { label: function () { return S.colDrop; } },
    { label: function () { return S.colMaxCams + " (≥ " + state.targetFps + " FPS)"; } },
    { label: function () { return ""; } },
  ];

  function renderTable(container) {
    var entries = visibleEntries();
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
      html += '<th class="bt-no-sort' + (col.left ? " bt-th-left" : "") + '">' +
        escapeHTML(col.label()) + "</th>";
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
      '<span class="bt-filter-label">' + escapeHTML(S.targetFps) + "</span>" +
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
        var cams = allCameraCounts();
        /* Opens showing everything measured; the slider only ever narrows. */
        state.camerasMax = cams.length ? cams[cams.length - 1] : 1;
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
