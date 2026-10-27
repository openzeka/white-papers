/* ── Cordatus Custom Engine VLM Benchmark Explorer — vanilla JS, zero dependencies ── */
(function () {
  "use strict";

  /* ──────────────────────────────────────────────────────────────────────
     UI STRINGS — the ONLY block that differs between this file and
     custom-engine-vlm-benchmark-table.tr.js / .nl.js. Everything below is
     byte-identical in all three.
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
    frames: "Frames per request",
    framesHint: "Auto lets the engine choose; a number fixes it for every request.",
    framesAuto: "Auto",
    framesValue: function (k) { return k === "auto" ? "Auto" : k + (k === "1" ? " frame" : " frames"); },
    filters: "Filters",
    searchVlms: "Search VLM servers…",
    device: "Device",
    vlm: "VLM server",
    all: "All",
    showAll: "Show All",
    target: "Target interval",
    targetHint: "Sets the status below and the Max cameras column above.",
    targetValue: function (s) { return s + " s"; },
    resetFilters: "Reset All Filters",
    matching: "Matching Configurations",
    matchingCount: function (shown, total) {
      return "<strong>" + shown + "</strong> of <strong>" + total + "</strong>";
    },

    colDevice: "Device",
    colVlm: "VLM server",
    colAtCameras: "Cameras",
    colInterval: "Interval (s)",
    colAnswers: "Answers / min",
    colCpu: "Engine CPU (cores)",
    colRam: "RAM / camera (MB)",
    colMaxCams: function (t) { return "Max cameras (≤ " + t + " s)"; },

    dCameras: "Cameras",
    dInterval: "Interval (s)",
    dSlowest: "Slowest camera (s)",
    dRequest: "Request (s)",
    dFrames: "Frames / request",
    dAnswers: "Answers / min",
    dTap: "Frames in / s",
    dCpu: "Engine CPU (cores)",
    dDeviceCpu: "Device CPU %",
    dRam: "RAM / camera (MB)",
    dStatus: "Target",
    within: function (t) { return "≤" + t + " s"; },
    over: function (t) { return ">" + t + " s"; },
    failedTip: "Some requests failed at this camera count, which fails the target whatever the interval.",
    notReady: function (started, n, timeout) {
      return "Failed: " + started + " of " + n + " cameras started" + (timeout ? " within " + timeout + " s" : "");
    },
    sweepTitle: function (k) { return "Camera sweep — " + S.framesValue(k).toLowerCase(); },
    serverTitle: "On the VLM server, per request",
    sPrompt: "Prompt tokens",
    sOutput: "Output tokens",
    sTtft: "TTFT (s)",
    sQueue: "Queue (s)",
    sKv: "KV cache %",
    sRunning: "Running (max)",
    sOther: "Other traffic %",
    framesTitle: "Frames per request",
    fFrames: "Frames",
    fMax: function (t) { return "Max cameras (≤ " + t + " s)"; },
    fOne: "Interval at 1 camera (s)",
    fPrompt: "Prompt tokens at 1 camera",
    fPick: "Pick a row to show that sweep in the whole table.",
    explainedHeading: "Benchmark results explained",
    openPlus: "+",
    openTip: "The highest camera count measured still met the target, so the real limit is higher than this.",

    notMeasured: "nothing measured at or below this camera count",
    atCamerasTip: function (n, limit) {
      return "Measured at " + n + (n === 1 ? " camera" : " cameras") +
        " — the highest count measured for this configuration at or below your limit of " +
        limit + ".";
    },
    targetMet: "Target Met — every camera got a fresh answer within the target, on average.",
    targetNotMet: "Target Not Met — the slowest camera waits longer than the target.",
    viewDetails: "View Details — full camera sweep, the curve and the VLM server's side of it.",

    chartTitle: "Interval and answers vs. camera count",
    chartSlowest: "Interval, slowest camera (s)",
    chartMean: "Interval, mean (s)",
    chartAnswers: "Answers / min",
    xTitle: "Cameras",
    hardware: "Device:",
    pipeline: "Pipeline:",
    pipelineText: function (se, w) {
      return "Cordatus Stream Engine " + se + " with custom_engine_vlm; " + w.tap_fps +
        " frames per second taken from each camera at " + w.tap_width + " px wide, " +
        "software decode, alarms off; prompt “" + w.prompt + "”";
    },
    server: "VLM server:",
    serverText: function (v) {
      return v.model + (v.params ? " (" + v.params + ")" : "") + ", " + v.quantization + ", " +
        v.engine + (v.engine_version ? " " + v.engine_version : "") + " on " + v.server;
    },
    measuredFor: function (s) { return "Measured for " + s + " s per camera count."; },
    runs: "Runs:",

    /* Tooltips */
    tip: {
      device: "<strong>Device</strong><p>The board the cameras and the custom engine ran on — the stream engine decodes every camera here and the engine sends its frames to the VLM server from here.</p><p>The VLM itself does not run on this device.</p>",
      vlm: "<strong>VLM server</strong><p>The vision-language model the engine asks, its number format and serving engine, and the GPU it ran on.</p><p>All the devices on this page asked the same server, so the device is the only thing that changes between their rows.</p>",
      atCameras: "<strong>Cameras</strong><p>The number of simultaneous cameras this row’s numbers were measured at.</p><p>Each row reports the heaviest load it was measured under at or below the camera limit in the filter panel, so rows can differ here.</p>",
      interval: "<strong>Interval</strong><p>How long a camera waits between two answers, on average — for the <em>slowest</em> camera at that count. This is how stale the newest answer about a camera can get.</p><p>Green meets your target interval, red does not.</p><p><em>Lower is better.</em></p>",
      answers: "<strong>Answers / min</strong><p>Answers the engine received per minute, all cameras together — the throughput of the whole chain.</p><p>Where it stops growing as cameras are added, the chain has reached its limit.</p>",
      cpu: "<strong>Engine CPU</strong><p>CPU the stream engine and the custom engine use together, in cores: 1.0 is one core fully busy. It covers decoding every camera, preparing the frames and the requests.</p><p>Decoding runs on the CPU, so this is what grows with the camera count on the device.</p>",
      ram: "<strong>RAM / camera</strong><p>The engine process’s memory, divided by the number of cameras.</p><p>The engine uses no GPU memory on the device.</p>",
      maxCams: "<strong>Max cameras</strong><p>The highest <em>measured</em> camera count at which every camera still got a fresh answer within your target interval, on average, with no failed request — up to the camera limit in the filter panel.</p><p>Taken from the measured points only; nothing is extrapolated. A + means the highest count measured still met the target, so the real limit is higher.</p>",

      fCameras: "<strong>Camera limit</strong><p>An upper bound on the camera count, not a selection. Everything measured above it is hidden.</p><p>Each row then reports the heaviest load it was measured at up to this number, and the sweep and chart follow.</p>",
      fFrames: "<strong>Frames per request</strong><p>How many video frames the engine sends with each question. <em>Auto</em> is the engine’s own choice — up to three for this prompt, fewer when fewer new frames have arrived since the last answer. A number fixes it.</p><p>More frames give the model more to see and make every request heavier.</p>",
      fDevice: "<strong>Device filter</strong><p>The board the cameras and the engine ran on.</p><p>Pick several to compare devices directly.</p>",
      fVlm: "<strong>VLM server filter</strong><p>The model and server the engine asked.</p>",
      target: "<strong>Target interval</strong><p>The longest a camera may wait between two answers, on average, for you to call it kept up with.</p><p>It decides the status in the sweep, the colouring of Interval and the Max cameras column. Lowering it makes the requirement stricter and can lower Max cameras.</p>",
      reset: "<strong>Reset All Filters</strong><p>Clears every filter, returns the camera limit to its maximum, the frames to Auto and the target to its default.</p>",
    },
  };

  /* ══════════════════════════════════════════════════════════════════════
     Everything below this line is language-independent.
     ══════════════════════════════════════════════════════════════════════ */

  var PALETTE = ["#76b900", "#0071c5", "#f2a900", "#c8102e", "#7a5cff", "#00a3a3"];

  var data = null;
  /* Set from data-cevbt-only: the id of the one result a permanent result page
     shows. The row is then drawn opened, with no filters and no collapsing. */
  var only = null;
  var state = {
    /* An upper bound, not a selection, as in the CV explorer: every row then
       reports its own highest measurement at or below it. */
    camerasMax: null,
    /* One sweep for the whole table: the rows are only comparable when they
       sent the same number of frames with every request. */
    frames: null,
    devices: [],            // empty = all
    vlms: {},               // VLM label -> ticked; every one starts ticked
    sortCol: "device",
    sortDir: "asc",
    targetS: null,
    expanded: {},
  };

  function escapeHTML(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* Half up on the value as the store writes it: 2.295 is 2.30, as on the
     permanent pages and in the explanations, not the 2.29 its binary form
     would round to. */
  function fmt(v, digits) {
    if (v === null || v === undefined || v === "") return "—";
    var n = Number(v), d = digits === undefined ? 1 : digits, f = Math.pow(10, d);
    return isNaN(n) ? "—" : (Math.round(n * f + (n < 0 ? -1e-7 : 1e-7)) / f).toFixed(d);
  }

  function sec(v) {
    if (v === null || v === undefined) return "—";
    return fmt(v, Number(v) < 10 ? 2 : 1);
  }

  function cores(pct) { return pct == null ? "—" : fmt(pct / 100, 1); }

  /* An info affordance carrying its own tooltip copy. The copy comes from S,
     never from data, so it is safe to store as markup. */
  function tip(html) {
    return '<button type="button" class="bt-tip" aria-label="info" data-tip="' +
      escapeHTML(html) + '">i</button>';
  }

  /* ── Data helpers ── */

  function framesOrder(a, b) {
    if (a === b) return 0;
    if (a === "auto") return -1;
    if (b === "auto") return 1;
    return Number(a) - Number(b);
  }

  function allFrames() {
    var seen = {};
    data.benchmarks.forEach(function (b) { Object.keys(b.sweeps).forEach(function (k) { seen[k] = true; }); });
    return Object.keys(seen).sort(framesOrder);
  }

  function allCameraCounts() {
    var seen = {};
    data.benchmarks.forEach(function (b) {
      Object.keys(b.sweeps).forEach(function (k) {
        b.sweeps[k].points.forEach(function (p) { seen[p.cameras] = true; });
      });
    });
    return Object.keys(seen).map(Number).sort(function (a, b) { return a - b; });
  }

  function uniq(field) {
    var seen = {};
    data.benchmarks.forEach(function (b) { if (b[field]) seen[b[field]] = true; });
    return Object.keys(seen).sort();
  }

  function sweepOf(entry, frames) {
    return entry.sweeps[frames === undefined ? state.frames : frames] || null;
  }

  /* Everything at or below the camera limit, which is what the table, the
     sweep and the chart all work from. */
  function pointsWithin(entry, frames) {
    var sw = sweepOf(entry, frames);
    return sw ? sw.points.filter(function (p) { return p.cameras <= state.camerasMax; }) : [];
  }

  /* The heaviest load this configuration was measured at, within the limit -
     the row's headline numbers come from here. */
  function shownPoint(entry) {
    var points = pointsWithin(entry);
    return points.length ? points[points.length - 1] : null;
  }

  /* The interval the target is judged on: the slowest camera's mean, so that
     "within the target" holds for every camera, as in the benchmark tool. */
  function intervalOf(p) {
    return p.interval_slowest_s != null ? p.interval_slowest_s : p.interval_s;
  }

  function meets(p) {
    var v = intervalOf(p);
    return v != null && v <= state.targetS && !(p.failed_pct > 0);
  }

  /* The highest measured camera count that holds the target. Taken from the
     measured points only - nothing here is extrapolated. */
  function maxCameras(entry, frames) {
    var best = 0;
    pointsWithin(entry, frames).forEach(function (p) {
      if (meets(p) && p.cameras > best) best = p.cameras;
    });
    return best;
  }

  /* The count at which not every camera came up, closing the sweep - the
     lowest one above the last measurement, within the limit. */
  function closingFailure(entry, frames) {
    var sw = sweepOf(entry, frames);
    if (!sw) return null;
    var pts = pointsWithin(entry, frames);
    var top = pts.length ? pts[pts.length - 1].cameras : 0;
    var hit = null;
    sw.failures.forEach(function (f) {
      if (f.cameras > top && f.cameras <= state.camerasMax && (!hit || f.cameras < hit.cameras)) hit = f;
    });
    return hit;
  }

  /* Still within the target at the highest count measured, with nothing
     above it that failed: the real limit was never reached. */
  function openEnded(entry, frames) {
    var pts = pointsWithin(entry, frames);
    var max = maxCameras(entry, frames);
    return max > 0 && max === pts[pts.length - 1].cameras && !closingFailure(entry, frames);
  }

  function visibleEntries() {
    if (only) return data.benchmarks.filter(function (b) { return b.id === only; });
    return data.benchmarks.filter(function (b) {
      if (state.devices.length && state.devices.indexOf(b.device) === -1) return false;
      if (!state.vlms[b.vlm_label]) return false;
      return pointsWithin(b).length > 0;
    });
  }

  /* ── Rendering ── */

  function buildUI(container) {
    container.className = "bt-container cvbt-container cevbt-container";
    if (only) return buildSingle(container);
    var cameras = allCameraCounts();
    var maxCams = cameras.length ? cameras[cameras.length - 1] : 1;

    /* The same layout as the CV explorer: filters beside the table, sticking
       while it scrolls (cv-benchmark-table.css). */
    var html = '<div class="cvbt-layout">';
    html += '<div class="cvbt-main">';
    html += '<div class="bt-results-count" id="cevbt-count"></div>';
    html += '<div class="bt-table-wrap" id="cevbt-table"></div>';
    html += "</div>";

    html += '<aside class="cvbt-side"><div class="cvbt-side-inner">';
    html += '<div class="cvbt-side-title">' + escapeHTML(S.filters) + "</div>";
    html += '<div class="cvbt-side-group"><span class="bt-filter-label">' +
      escapeHTML(S.cameras) + tip(S.tip.fCameras) + "</span>" +
      '<div class="bt-slider-group cvbt-slider">' +
      '<input type="range" id="cevbt-cameras" min="' + cameras[0] + '" max="' + maxCams +
      '" step="1" value="' + state.camerasMax + '" aria-label="' + escapeHTML(S.cameras) + '">' +
      '<span class="bt-slider-value" id="cevbt-cameras-value">' +
      escapeHTML(S.camerasValue(state.camerasMax)) + "</span></div>" +
      '<p class="cvbt-side-hint">' + escapeHTML(S.camerasHint(maxCams)) + "</p></div>";
    html += '<div class="cvbt-side-group"><span class="bt-filter-label">' +
      escapeHTML(S.frames) + tip(S.tip.fFrames) + "</span>" + frameButtons() +
      '<p class="cvbt-side-hint">' + escapeHTML(S.framesHint) + "</p></div>";
    html += '<div class="cvbt-side-group"><span class="bt-filter-label">' +
      escapeHTML(S.device) + tip(S.tip.fDevice) + "</span>" + deviceButtons() + "</div>";
    html += '<div class="cvbt-side-group"><span class="bt-filter-label">' +
      escapeHTML(S.vlm) + tip(S.tip.fVlm) + "</span>" + vlmList() + "</div>";
    html += '<div class="cvbt-reset-row">' +
      '<button type="button" class="bt-btn cvbt-reset" id="cevbt-reset">' +
      escapeHTML(S.resetFilters) + "</button>" + tip(S.tip.reset) + "</div>";
    html += "</div></aside></div>";
    /* Outside the table and the panel, both of which are redrawn: the bubble
       is position:fixed and follows whichever icon opened it. */
    html += '<div class="bt-tooltip" id="cevbt-tooltip" role="tooltip" hidden></div>';
    container.innerHTML = html;

    /* Delegated listeners live on the container, which survives a reset -
       only its contents are rebuilt - so they are attached once. */
    if (!container.cevbtWired) {
      wire(container);
      wireTooltips(container);
      container.cevbtWired = true;
    }
    wireCameras(container);
    renderTable(container);
  }

  /* A permanent result page: the table with its one row, opened. */
  function buildSingle(container) {
    container.innerHTML = '<div class="bt-table-wrap bt-single" id="cevbt-table"></div>' +
      '<div class="bt-tooltip" id="cevbt-tooltip" role="tooltip" hidden></div>';
    if (!container.cevbtWired) {
      wire(container);
      wireTooltips(container);
      container.cevbtWired = true;
    }
    renderTable(container);
  }

  /* One choice, not a set: pill buttons that behave like radio buttons. */
  function frameButtons() {
    var html = '<div class="bt-filter-buttons" id="cevbt-frames" role="radiogroup" aria-label="' +
      escapeHTML(S.frames) + '">';
    allFrames().forEach(function (k) {
      html += '<button type="button" class="bt-btn' + (k === state.frames ? " bt-active" : "") +
        '" data-frames="' + escapeHTML(k) + '" role="radio" aria-checked="' + (k === state.frames) + '">' +
        escapeHTML(k === "auto" ? S.framesAuto : k) + "</button>";
    });
    return html + "</div>";
  }

  function paintFrames(container) {
    Array.prototype.forEach.call(container.querySelectorAll("[data-frames]"), function (b) {
      var on = b.getAttribute("data-frames") === state.frames;
      b.classList.toggle("bt-active", on);
      b.setAttribute("aria-checked", on);
    });
  }

  function deviceButtons() {
    var html = '<div class="bt-filter-buttons" id="cevbt-devices">';
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

  function allVlmsTicked() {
    return uniq("vlm_label").every(function (m) { return state.vlms[m]; });
  }

  function tickAllVlms(on) {
    state.vlms = {};
    if (on) uniq("vlm_label").forEach(function (m) { state.vlms[m] = true; });
  }

  function vlmList() {
    var html = '<div class="bt-model-filter">';
    html += '<input type="text" class="bt-model-search cvbt-search" id="cevbt-vlm-search" placeholder="' +
      escapeHTML(S.searchVlms) + '" aria-label="' + escapeHTML(S.searchVlms) + '">';
    html += '<div class="bt-model-list" id="cevbt-vlm-list">';
    html += '<label class="bt-model-option"><input type="checkbox" id="cevbt-vlm-all"' +
      (allVlmsTicked() ? " checked" : "") + "> " + escapeHTML(S.all) + "</label>";
    uniq("vlm_label").forEach(function (m) {
      html += '<label class="bt-model-option"><input type="checkbox" class="cevbt-vlm-cb" value="' +
        escapeHTML(m) + '"' + (state.vlms[m] ? " checked" : "") + "> " + escapeHTML(m) + "</label>";
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
      if (btn && btn.id === "cevbt-reset") { reset(container); return; }

      var fr = e.target.closest("[data-frames]");
      if (fr) {
        state.frames = fr.getAttribute("data-frames");
        paintFrames(container);
        renderTable(container);
        return;
      }

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

      /* A row of the frames table switches the whole table to that sweep. */
      var fp = e.target.closest(".cevbt-frames-row");
      if (fp) {
        state.frames = fp.dataset.frames;
        paintFrames(container);
        renderTable(container);
        return;
      }

      var row = e.target.closest(".bt-row");
      if (row && !only) {
        var id = row.dataset.id;
        state.expanded[id] = !state.expanded[id];
        /* The address bar carries the opened row, as in the other explorers,
           so the link can be copied and opens that row. */
        if (state.expanded[id]) history.replaceState(null, "", "#" + id);
        else if (location.hash === "#" + id) history.replaceState(null, "", location.pathname + location.search);
        renderTable(container);
      }
    });

    container.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var target = e.target.closest ? e.target.closest(".cevbt-frames-row, .bt-row") : null;
      if (!target) return;
      e.preventDefault();
      target.click();
    });

    /* The target slider lives inside each expanded row, in the part of the DOM
       renderTable() replaces, so the value follows the thumb live and the
       table catches up on `change` - when the drag ends or a key is pressed. */
    container.addEventListener("input", function (e) {
      var el = e.target;
      if (!el.classList || !el.classList.contains("cevbt-target")) return;
      state.targetS = Number(el.value);
      var label = el.parentNode.querySelector(".cevbt-target-value");
      if (label) label.textContent = S.targetValue(state.targetS);
    });
    container.addEventListener("change", function (e) {
      var el = e.target;
      if (el.classList && el.classList.contains("cevbt-target")) {
        renderTable(container);
        return;
      }
      if (el.id === "cevbt-vlm-all") {
        tickAllVlms(el.checked);
        Array.prototype.forEach.call(container.querySelectorAll(".cevbt-vlm-cb"), function (cb) {
          cb.checked = el.checked;
        });
        renderTable(container);
        return;
      }
      if (el.classList && el.classList.contains("cevbt-vlm-cb")) {
        if (el.checked) state.vlms[el.value] = true; else delete state.vlms[el.value];
        container.querySelector("#cevbt-vlm-all").checked = allVlmsTicked();
        renderTable(container);
      }
    });

    container.addEventListener("input", function (e) {
      if (e.target.id !== "cevbt-vlm-search") return;
      var term = e.target.value.trim().toLowerCase();
      Array.prototype.forEach.call(
        container.querySelectorAll("#cevbt-vlm-list .bt-model-option"), function (label) {
          if (label.querySelector("#cevbt-vlm-all")) return;
          label.style.display =
            !term || label.textContent.toLowerCase().indexOf(term) > -1 ? "" : "none";
        });
    });
  }

  function wireCameras(container) {
    var camerasEl = container.querySelector("#cevbt-cameras");
    camerasEl.addEventListener("input", function () {
      state.camerasMax = Number(camerasEl.value);
      container.querySelector("#cevbt-cameras-value").textContent =
        S.camerasValue(state.camerasMax);
      renderTable(container);
    });
  }

  function wireTooltips(container) {
    var tipEl = function () { return container.querySelector("#cevbt-tooltip"); };
    var openBtn = null;
    /* Touch browsers send a synthetic mouseover before the click; only a
       second tap should close what the first one opened. */
    var openedByTap = false;

    function show(btn) {
      var el = tipEl();
      el.innerHTML = btn.getAttribute("data-tip");
      el.hidden = false;
      var r = btn.getBoundingClientRect();
      var w = el.offsetWidth, h = el.offsetHeight;
      var left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
      var top = r.bottom + 8;
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
    window.addEventListener("scroll", reanchor, { capture: true, passive: true });
    window.addEventListener("resize", reanchor);

    container.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest(".bt-tip") : null;
      if (btn) {
        e.preventDefault();
        if (openBtn === btn && openedByTap) hide();
        else { show(btn); openedByTap = true; }
        return;
      }
      if (!e.target.closest || !e.target.closest("#cevbt-tooltip")) hide();
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

  function defaultFrames() {
    var frames = allFrames();
    var want = String((data.config || {}).frames || "auto");
    return frames.indexOf(want) > -1 ? want : frames[0];
  }

  function reset(container) {
    state.devices = [];
    tickAllVlms(true);
    state.targetS = Number(data.config.target_s) || 3;
    state.frames = defaultFrames();
    state.expanded = {};
    var cams = allCameraCounts();
    state.camerasMax = cams.length ? cams[cams.length - 1] : 1;
    buildUI(container);
  }

  /* `left` marks the columns whose values are names, not numbers. */
  var COLUMNS = [
    { key: "device",   label: function () { return S.colDevice; },     t: "device",    left: true },
    { key: "vlm",      label: function () { return S.colVlm; },        t: "vlm",       left: true },
    { key: "cameras",  label: function () { return S.colAtCameras; },  t: "atCameras" },
    { key: "interval", label: function () { return S.colInterval; },   t: "interval" },
    { key: "answers",  label: function () { return S.colAnswers; },    t: "answers" },
    { key: "cpu",      label: function () { return S.colCpu; },        t: "cpu" },
    { key: "ram",      label: function () { return S.colRam; },        t: "ram" },
    { key: "maxcams",  label: function () { return S.colMaxCams(state.targetS); }, t: "maxCams" },
    { key: "expand",   label: function () { return ""; } },
  ];

  /* The value a column sorts on. Null means the row has nothing there. */
  function sortValue(entry, col) {
    var p = shownPoint(entry);
    switch (col) {
      case "device":   return entry.device;
      case "vlm":      return entry.vlm_label + " " + entry.vlm.server;
      case "cameras":  return p ? p.cameras : null;
      case "interval": return p ? intervalOf(p) : null;
      case "answers":  return p ? p.answers_per_min : null;
      case "cpu":      return p ? p.engine_cpu_pct : null;
      case "ram":      return p ? p.engine_ram_mb_per_camera : null;
      case "maxcams":  return maxCameras(entry);
    }
    return null;
  }

  /* Rows with nothing to sort on sink to the bottom in both directions. Ties
     keep the load order, because Array.prototype.sort is stable. */
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
    var countEl = container.querySelector("#cevbt-count");
    if (countEl) countEl.innerHTML =
      '<span class="bt-count-label">' + escapeHTML(S.matching) + "</span> " +
      S.matchingCount(entries.length, data.benchmarks.length);

    var wrap = container.querySelector("#cevbt-table");
    if (!entries.length) {
      wrap.innerHTML = '<div class="bt-empty">' + escapeHTML(S.noMatch) + "</div>";
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
      if (only || state.expanded[entry.id]) html += detailRow(entry);
    });
    wrap.innerHTML = html + "</tbody></table>";
  }

  function maxCell(entry, frames) {
    var max = maxCameras(entry, frames);
    if (!max) return '<span class="bt-bad">' + escapeHTML(S.over(state.targetS)) + "</span>";
    return max + (openEnded(entry, frames) ? '<span class="bt-muted" title="' +
      escapeHTML(S.openTip) + '">' + S.openPlus + "</span>" : "");
  }

  function entryRow(entry) {
    var point = shownPoint(entry);
    var expanded = only ? true : !!state.expanded[entry.id];
    var html = only ? '<tr class="bt-row" data-id="' + escapeHTML(entry.id) + '">' :
      '<tr class="bt-row" data-id="' + escapeHTML(entry.id) + '" tabindex="0" role="button"' +
      ' aria-expanded="' + expanded + '" title="' + escapeHTML(S.viewDetails) + '">';

    html += '<td class="bt-left">' + escapeHTML(entry.device) + "</td>";
    /* The server's settings ride with the model name, as precision does in
       the CV explorer: they are never sorted on on their own. */
    html += '<td class="bt-left">' + escapeHTML(entry.vlm.model) + ' <span class="cvbt-sub">' +
      escapeHTML([entry.vlm.quantization, entry.vlm.engine, entry.vlm.server].filter(Boolean).join(" · ")) +
      "</span></td>";

    html += '<td class="bt-num"' + (point ? ' title="' +
      escapeHTML(S.atCamerasTip(point.cameras, state.camerasMax)) + '"' : "") + ">" +
      (point ? point.cameras : '<span class="bt-muted">—</span>') + "</td>";

    if (!point) {
      html += '<td class="bt-muted" colspan="4" title="' + escapeHTML(S.notMeasured) + '">—</td>';
    } else {
      var ok = meets(point);
      html += '<td class="bt-num ' + (ok ? "bt-good" : "bt-bad") + '" title="' +
        escapeHTML(ok ? S.targetMet : S.targetNotMet) + '">' + sec(intervalOf(point)) + "</td>";
      html += '<td class="bt-num">' + fmt(point.answers_per_min, 0) + "</td>";
      html += '<td class="bt-num">' + cores(point.engine_cpu_pct) + "</td>";
      html += '<td class="bt-num">' + fmt(point.engine_ram_mb_per_camera, 0) + "</td>";
    }

    html += '<td class="bt-num">' + maxCell(entry) + "</td>";
    html += '<td class="bt-expand-cell">' + (only ? "" : expanded ? "&#9660;" : "&#9654;") + "</td>";
    return html + "</tr>";
  }

  function detailRow(entry) {
    var html = '<tr class="bt-detail-row"><td colspan="' + COLUMNS.length + '">';
    html += '<div class="bt-detail-content bt-visible">';

    html += '<div class="cvbt-target-row">' +
      '<span class="bt-filter-label">' + escapeHTML(S.target) + tip(S.tip.target) + "</span>" +
      '<div class="bt-slider-group">' +
      '<input type="range" class="cevbt-target" min="0.5" max="10" step="0.5" value="' +
      state.targetS + '" aria-label="' + escapeHTML(S.target) + '">' +
      '<span class="bt-slider-value cevbt-target-value">' + escapeHTML(S.targetValue(state.targetS)) +
      "</span></div>" +
      '<span class="cvbt-target-hint">' + escapeHTML(S.targetHint) + "</span></div>";

    html += sweepTable(entry);
    html += serverTable(entry);

    /* The whitepapers site writes each configuration's explanation into the
       page ([data-cevbt-explained]), ending in a link to its permanent page.
       It sits beside the frames table, as the VLM explorer puts its own
       beside the sweep. */
    var expl = document.querySelector('[data-cevbt-explained="' + CSS.escape(entry.id) + '"]');
    html += '<div class="bt-detail-pair cevbt-pair"><div class="bt-detail-pair-col">' + framesTable(entry) +
      '</div><div class="bt-detail-pair-col">' + (expl ? '<div class="bt-explained">' +
      '<div class="bt-capacity-title">' + escapeHTML(S.explainedHeading) + "</div>" + expl.innerHTML +
      "</div>" : "") + "</div></div>";

    var plot = chart(entry);
    if (plot) html += '<div class="bt-chart-card"><div class="bt-chart-header">' +
      escapeHTML(S.chartTitle) + "</div>" + plot + "</div>";

    var facts = [entry.device_product, entry.gpu];
    if (entry.ram_gb) facts.push(Math.round(entry.ram_gb) + " GB");
    if (entry.jetpack) facts.push("JetPack " + entry.jetpack);
    if (entry.l4t) facts.push("L4T " + entry.l4t);
    if (entry.cuda) facts.push("CUDA " + entry.cuda);
    html += '<div class="bt-detail-notes"><strong>' + escapeHTML(S.hardware) + "</strong> " +
      facts.filter(Boolean).map(escapeHTML).join(" · ");
    html += "<br><strong>" + escapeHTML(S.pipeline) + "</strong> " +
      escapeHTML(S.pipelineText(entry.stream_engine, entry.workload));
    html += "<br><strong>" + escapeHTML(S.server) + "</strong> " + escapeHTML(S.serverText(entry.vlm));
    var m = measureOf(entry);
    if (m) html += "<br>" + escapeHTML(S.measuredFor(m));
    if (entry.runs && entry.runs.length) {
      html += "<br><strong>" + escapeHTML(S.runs) + "</strong> " + escapeHTML(entry.runs.join(", "));
    }
    html += "</div>";
    return html + "</div></td></tr>";
  }

  /* One measuring window per count in a sweep; the rare sweep measured for
     longer says so through its own points. */
  function measureOf(entry) {
    var pts = pointsWithin(entry);
    var seen = {};
    pts.forEach(function (p) { if (p.measure_s) seen[p.measure_s] = true; });
    return Object.keys(seen).sort(function (a, b) { return a - b; }).join(" / ");
  }

  function sweepTable(entry) {
    var t = state.targetS;
    var html = '<div class="cevbt-block"><div class="cevbt-block-title">' +
      escapeHTML(S.sweepTitle(state.frames)) + "</div>";
    html += '<div class="cevbt-scroll"><table class="bt-detail-table"><thead><tr>' +
      /* The status sits beside the slowest camera it is judged on, so it
         stays in view when the rest of the row has to scroll. */
      [S.dCameras, S.dInterval, S.dSlowest, S.dStatus, S.dRequest, S.dFrames, S.dAnswers, S.dTap,
       S.dCpu, S.dDeviceCpu, S.dRam].map(function (h) {
        return "<th>" + escapeHTML(h) + "</th>";
      }).join("") + "</tr></thead><tbody>";
    pointsWithin(entry).forEach(function (p) {
      var ok = meets(p);
      html += "<tr><td>" + p.cameras + "</td><td>" + sec(p.interval_s) + "</td><td>" +
        sec(p.interval_slowest_s) + '</td><td class="' + (ok ? "bt-detail-pass" : "bt-detail-fail") + '"' +
        (p.failed_pct > 0 ? ' title="' + escapeHTML(S.failedTip) + '"' : "") + ">" +
        escapeHTML(ok ? S.within(t) : S.over(t)) + "</td><td>" + sec(p.request_s) + "</td><td>" +
        fmt(p.frames_per_request, 2) + "</td><td>" + fmt(p.answers_per_min, 0) + "</td><td>" +
        fmt(p.tap_fps, 2) + "</td><td>" + cores(p.engine_cpu_pct) + "</td><td>" +
        fmt(p.device_cpu_pct, 0) + "</td><td>" + fmt(p.engine_ram_mb_per_camera, 0) + "</td></tr>";
    });
    var f = closingFailure(entry);
    if (f) {
      /* No numbers at this count, only the reason: it takes the whole row. */
      html += "<tr><td>" + f.cameras + '</td><td colspan="10" class="bt-detail-fail">' +
        escapeHTML(S.notReady(f.started, f.cameras, f.ready_timeout_s)) + "</td></tr>";
    }
    return html + "</tbody></table></div></div>";
  }

  function serverTable(entry) {
    var html = '<div class="cevbt-block"><div class="cevbt-block-title">' +
      escapeHTML(S.serverTitle) + "</div>";
    html += '<div class="cevbt-scroll"><table class="bt-detail-table"><thead><tr>' +
      [S.dCameras, S.sPrompt, S.sOutput, S.sTtft, S.sQueue, S.sKv, S.sRunning, S.sOther].map(function (h) {
        return "<th>" + escapeHTML(h) + "</th>";
      }).join("") + "</tr></thead><tbody>";
    pointsWithin(entry).forEach(function (p) {
      html += "<tr><td>" + p.cameras + "</td><td>" + fmt(p.vlm_prompt_tokens, 0) + "</td><td>" +
        fmt(p.vlm_output_tokens, 0) + "</td><td>" + sec(p.vlm_ttft_s) + "</td><td>" +
        sec(p.vlm_queue_s) + "</td><td>" + fmt(p.vlm_kv_pct, 1) + "</td><td>" +
        (p.vlm_running_max == null ? "—" : p.vlm_running_max) + "</td><td>" +
        fmt(p.vlm_other_traffic_pct, 1) + "</td></tr>";
    });
    return html + "</tbody></table></div></div>";
  }

  function framesTable(entry) {
    var t = state.targetS;
    var html = '<div class="cevbt-block cevbt-frames"><div class="cevbt-block-title">' +
      escapeHTML(S.framesTitle) + "</div>";
    /* Every frames count, each with its own Max cameras: what sending more
       frames with every question costs, in cameras. */
    html += '<table class="bt-detail-table"><thead><tr><th>' + escapeHTML(S.fFrames) + "</th><th>" +
      escapeHTML(S.fMax(t)) + "</th><th>" + escapeHTML(S.fOne) + "</th><th>" +
      escapeHTML(S.fPrompt) + "</th></tr></thead><tbody>";
    Object.keys(entry.sweeps).sort(framesOrder).forEach(function (k) {
      var one = (entry.sweeps[k].points[0] || {}).cameras === 1 ? entry.sweeps[k].points[0] : null;
      html += '<tr class="bt-dp-row cevbt-frames-row' + (k === state.frames ? " bt-dp-active" : "") +
        '" data-frames="' + escapeHTML(k) + '" tabindex="0" role="button" title="' +
        escapeHTML(S.fPick) + '"><td>' + escapeHTML(k === "auto" ? S.framesAuto : k) + "</td><td>" +
        maxCell(entry, k) + "</td><td>" + (one ? sec(intervalOf(one)) : "—") + "</td><td>" +
        (one ? fmt(one.vlm_prompt_tokens, 0) : "—") + "</td></tr>";
    });
    return html + '</tbody></table><p class="bt-preview-note">' + escapeHTML(S.fPick) + "</p></div>";
  }

  /* Inline SVG rather than a charting library, as in the CV explorer: three
     series, a handful of points. */
  function chart(entry) {
    var W = 720, H = 260, padL = 52, padR = 52, padT = 16, padB = 34;
    var pts = pointsWithin(entry);
    if (pts.length < 2) return "";

    var xs = pts.map(function (p) { return p.cameras; });
    var xMin = Math.min.apply(null, xs), xMax = Math.max.apply(null, xs);
    var sMax = Math.max.apply(null, pts.map(function (p) { return intervalOf(p) || 0; }).concat([state.targetS]));
    var aMax = Math.max.apply(null, pts.map(function (p) { return p.answers_per_min || 0; }));
    sMax = Math.ceil((sMax || 1) * 1.15);
    aMax = Math.ceil((aMax || 1) * 1.15);

    var pw = W - padL - padR, ph = H - padT - padB;
    /* Camera counts double from one measurement to the next, so the axis is
       logarithmic; a linear one would crowd 1-16 into the first sixth. */
    var lx = function (v) { return Math.log(v) / Math.LN2; };
    var X = function (v) { return padL + (xMax === xMin ? 0 : (lx(v) - lx(xMin)) / (lx(xMax) - lx(xMin)) * pw); };
    var Yl = function (v) { return padT + ph - (v / sMax) * ph; };
    var Yr = function (v) { return padT + ph - (v / aMax) * ph; };

    var svg = '<svg class="bt-chart-svg" viewBox="0 0 ' + W + " " + H +
      '" preserveAspectRatio="xMidYMid meet" font-size="11" font-family="inherit">';
    for (var i = 0; i <= 4; i++) {
      var y = padT + ph - (i / 4) * ph;
      svg += '<line x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (W - padR) +
        '" y2="' + y.toFixed(1) + '" stroke="currentColor" stroke-opacity=".12"/>';
      svg += '<text x="' + (padL - 8) + '" y="' + (y + 4).toFixed(1) +
        '" text-anchor="end" fill="' + PALETTE[0] + '">' + (sMax * i / 4).toFixed(sMax < 8 ? 1 : 0) + "</text>";
      svg += '<text x="' + (W - padR + 8) + '" y="' + (y + 4).toFixed(1) +
        '" fill="' + PALETTE[1] + '">' + (aMax * i / 4).toFixed(0) + "</text>";
    }
    // The target line is the whole point of the interval series.
    svg += '<line x1="' + padL + '" y1="' + Yl(state.targetS).toFixed(1) + '" x2="' +
      (W - padR) + '" y2="' + Yl(state.targetS).toFixed(1) +
      '" stroke="' + PALETTE[3] + '" stroke-dasharray="4 4" stroke-opacity=".8"/>';
    xs.forEach(function (x) {
      svg += '<text x="' + X(x).toFixed(1) + '" y="' + (H - padB + 18) +
        '" text-anchor="middle" fill="currentColor" fill-opacity=".6">' + x + "</text>";
    });

    [[intervalOf, Yl, PALETTE[0], ""], [function (p) { return p.interval_s; }, Yl, PALETTE[0], "4 3"],
     [function (p) { return p.answers_per_min; }, Yr, PALETTE[1], ""]].forEach(function (series) {
      var get = series[0], Y = series[1], color = series[2], dash = series[3];
      var d = pts.map(function (p, i) {
        return (i ? "L" : "M") + X(p.cameras).toFixed(1) + "," + Y(get(p) || 0).toFixed(1);
      }).join(" ");
      svg += '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2"' +
        (dash ? ' stroke-dasharray="' + dash + '" stroke-opacity=".7"' : "") + "/>";
      if (dash) return;
      pts.forEach(function (p) {
        svg += '<circle cx="' + X(p.cameras).toFixed(1) + '" cy="' + Y(get(p) || 0).toFixed(1) +
          '" r="3.5" fill="' + color + '"><title>' + p.cameras + " → " +
          fmt(get(p), Y === Yl ? 2 : 0) + "</title></circle>";
      });
    });
    svg += '<text x="' + (padL + pw / 2) + '" y="' + (H - 2) +
      '" text-anchor="middle" fill="currentColor" fill-opacity=".6">' +
      escapeHTML(S.xTitle) + "</text></svg>";

    return svg + '<div class="bt-chart-legend">' +
      '<span class="bt-legend-item"><span class="bt-legend-swatch" style="background:' +
      PALETTE[0] + '"></span>' + escapeHTML(S.chartSlowest) + "</span>" +
      '<span class="bt-legend-item"><span class="bt-legend-swatch cevbt-swatch-dash" style="border-color:' +
      PALETTE[0] + '"></span>' + escapeHTML(S.chartMean) + "</span>" +
      '<span class="bt-legend-item"><span class="bt-legend-swatch" style="background:' +
      PALETTE[1] + '"></span>' + escapeHTML(S.chartAnswers) + "</span></div>";
  }

  /* ── The folder store ──
     assets/data/custom-engine-vlm-benchmarks/
       index.json                 what exists
       <device>/device.json       the board, written once per device
       <device>/<vlm>.json        frames per request -> measurements keyed by camera count

     Written a little at a time, like the CV store; a browser cannot list a
     directory, which is why index.json exists. */

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
      (device.configs || []).forEach(function (cfg) {
        jobs.push(Promise.all([
          getJSON(base + device.path),
          getJSON(base + cfg.path),
        ]).then(function (pair) {
          return entryFrom(index, pair[0], pair[1], cfg.path);
        }).catch(function (err) {
          /* A file the index names but that is gone: drop that row and show
             the rest rather than blanking the page. */
          if (window.console) console.warn("custom-engine-vlm-benchmarks: " + err.message);
          return null;
        }));
      });
    });

    return Promise.all(jobs).then(function (entries) {
      if (jobs.length && !entries.filter(Boolean).length) throw new Error(S.storeUnreadable);
      return {
        config: index.config || {},
        source: index.source || {},
        benchmarks: entries.filter(Boolean).sort(function (a, b) {
          return a.device.localeCompare(b.device) || a.vlm_label.localeCompare(b.vlm_label);
        }),
      };
    });
  }

  function byCameras(obj) {
    return Object.keys(obj || {}).map(function (k) { return obj[k]; })
      .sort(function (a, b) { return a.cameras - b.cameras; });
  }

  function entryFrom(index, device, cfg, path) {
    var sweeps = {};
    Object.keys(cfg.sweeps || {}).forEach(function (k) {
      var points = byCameras(cfg.sweeps[k].points);
      if (points.length) sweeps[k] = { points: points, failures: byCameras(cfg.sweeps[k].failures) };
    });
    if (!Object.keys(sweeps).length) return null;
    var vlm = cfg.vlm || {};
    var model = (index.models || {})[vlm.model] || {};
    return {
      id: path.replace(/\.json$/, "").replace(/\//g, "-"),
      device: device.name || device.slug || "",
      device_product: device.product || "",
      gpu: device.gpu || "",
      ram_gb: device.ram_gb,
      jetpack: device.jetpack || "",
      l4t: device.l4t || "",
      cuda: device.cuda || "",
      vlm: {
        model: vlm.model || "", params: vlm.params || model.params || "",
        quantization: vlm.quantization || "", engine: vlm.engine || "",
        engine_version: vlm.engine_version || "", server: vlm.server || "",
      },
      vlm_label: [vlm.model, vlm.quantization].filter(Boolean).join(" "),
      stream_engine: cfg.stream_engine || "",
      workload: cfg.workload || {},
      notes: cfg.notes || "",
      runs: cfg.runs || [],
      sweeps: sweeps,
    };
  }

  /* ── Boot ── */

  function init() {
    var container = document.querySelector("[data-cevbt-src]");
    if (!container) return;
    only = container.getAttribute("data-cevbt-only");
    container.innerHTML = '<div class="bt-loading">' + escapeHTML(S.loading) + "</div>";

    var src = container.getAttribute("data-cevbt-src");
    getJSON(src)
      .then(function (index) { return loadStore(src, index); })
      .then(function (payload) {
        data = payload;
        state.targetS = Number((data.config || {}).target_s) || 3;
        state.frames = defaultFrames();
        tickAllVlms(true);
        var cams = allCameraCounts();
        /* Opens showing everything measured; the slider only ever narrows. */
        state.camerasMax = cams.length ? cams[cams.length - 1] : 1;
        /* Carried over by the site's language switcher (window.ozCarry), so
           switching language keeps the reader's filters and open rows. */
        var carried = window.ozCarry && window.ozCarry.cevbt;
        if (carried) for (var k in carried) if (state.hasOwnProperty(k)) state[k] = carried[k];
        openFromHash();
        buildUI(container);
        if (!only) {
          scrollToHash(container);
          window.addEventListener("hashchange", function () {
            if (openFromHash()) { renderTable(container); scrollToHash(container); }
          });
        }
      })
      .catch(function (err) {
        container.innerHTML = '<div class="bt-error">' + escapeHTML(S.loadFailed + err.message) + "</div>";
      });
  }

  /* ── Deep links: #<id> opens that result ── */

  function hashId() {
    var id = decodeURIComponent(location.hash.slice(1));
    return id && data.benchmarks.some(function (b) { return b.id === id; }) ? id : null;
  }

  function openFromHash() {
    var id = hashId();
    if (id) state.expanded[id] = true;
    return !!id;
  }

  function scrollToHash(container) {
    var id = hashId();
    if (!id) return;
    setTimeout(function () {
      var row = container.querySelector('tr.bt-row[data-id="' + CSS.escape(id) + '"]');
      if (row) row.scrollIntoView({ behavior: "instant", block: "center" });
    }, 200);
  }

  /* The reader's view as plain data, for the language switcher. */
  window.CevlmBenchmarkTable = {
    snapshot: function () { return data ? JSON.parse(JSON.stringify(state)) : null; }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
