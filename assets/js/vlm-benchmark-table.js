/* ── VLM Benchmark Table — vanilla JS, zero dependencies ── */
(function () {
  "use strict";

  /* ──────────────────────────────────────────────────────────────────────
     UI STRINGS — the ONLY block that differs between vlm-benchmark-table.js,
     vlm-benchmark-table.tr.js and vlm-benchmark-table.nl.js. Everything below
     this object is byte-identical in all three. When changing behaviour, edit
     one file and copy the body across; when changing wording, edit only this
     object.
     ────────────────────────────────────────────────────────────────────── */
  var S = {
    lang: "en",

    loading: "Loading benchmarks…",
    loadFailed: "Failed to load benchmark data: ",

    /* Controls */
    concurrency: "Cameras",
    resolution: "Image Size",
    device: "Device",
    model: "Model",
    quant: "Quantization",
    engine: "Engine",
    all: "All",
    showAll: "Show All",
    searchModels: "Search models…",
    resetFilters: "Reset All Filters",

    minParams: "Min Parameters",
    maxResponse: "Max Response Time",
    noLimit: "No limit",
    paramsAll: "All sizes",
    atC: function (c, res, n) { return " at " + c + (c === 1 ? " camera, " : " cameras, ") + res + ", " + n + (n === 1 ? " image" : " images"); },

    /* Performance target / assumptions */
    targetsHeading: "Performance Target and Assumptions",
    targetsIntro: "These values define acceptable performance and what each camera sends. They do not hide rows; they recalculate every row's response time, Max Cameras and the green and red colouring of Response.",
    groupResponse: "Response time",
    groupResponseIntro: "Each camera sends its next request as soon as the previous one is answered, so the number of cameras is the number of requests in flight. Max Cameras is the highest measured number of cameras at which every camera's answer starts within the target.",
    responseTarget: "Maximum Response Time Target (s)",
    imagesAssumption: "Images per Camera",

    /* Table */
    colModel: "Model",
    colParams: "Parameters",
    colDevice: "Device",
    colQuant: "Quantization",
    colTps: "TPS",
    colResponse: "Response",
    colMaxCams: "Max Cameras",
    colEngine: "Engine",
    atCol: function (c) { return " @ " + c + (c === 1 ? " cam" : " cams"); },
    secUnit: " (s)",
    matching: "Matching Configurations",
    matchingCount: function (shown, total) {
      return "<strong>" + shown + "</strong> of <strong>" + total + "</strong>";
    },
    noMatch: "No configurations match the current filters.",
    notMeasured: "No configuration was measured with this combination of image size, number of cameras and images per camera. Several cameras were measured with one image per camera at 480p, 720p and 1080p; 2K and several images per camera with one camera only. Dimmed buttons mark the combinations that have no measurement.",
    targetMet: "Target Met — the answer starts within your response time target.",
    targetNotMet: "Target Not Met — the answer takes longer than your response time target to start.",
    viewDetails: "View Details — shows the measurements by number of cameras, the results explained and a chart for this configuration.",
    maxAtLeast: function (c) { return "At least " + c + ": every camera was still answered in time at " + c + (c === 1 ? " camera" : " cameras") + ", the highest number tested, so the real maximum was not reached."; },

    /* Expanded row */
    detailC: "Cameras", detailTps: "TPS (tok/s)", detailResponse: "Response (s)", detailStatus: "Status",
    pass: "PASS", fail: "FAIL",
    sweepAt: function (res, dims, n) { return (n === 1 ? "One " + res + " image" : n + " " + res + " images") + " (" + dims + ") per camera"; },
    explainedHeading: "Benchmark results explained",
    oneOnly: "Measured with one camera only, so the figure cannot be higher than 1 — the device may well serve more.",
    downloadChart: "Download Chart",
    chartFileSuffix: "-chart.png",
    chartTitle: function (n) { return "Response time as cameras are added · " + n + (n === 1 ? " image" : " images") + " per camera"; },
    chartTarget: function (t) { return "Target " + t + " s"; },
    yTitle: "Response time (s)",
    xTitle: "Number of cameras",


    /* Tooltips */
    tip: {
      model: "<strong>Model</strong><p>The vision-language model being served.</p><p>A row is a whole deployment, so the same model appears in several rows with different hardware, format or engine.</p>",
      params: "<strong>Parameters</strong><p>The model's total number of weights, vision encoder included, as published.</p><p>For mixture-of-experts models this is the total, not the part active for each token, because all of it is held in memory.</p>",
      device: "<strong>Device</strong><p>The hardware the run used: a Jetson module, or an RTX PRO 6000 Blackwell workstation GPU. The Max-Q edition is the 300 W version of the same chip.</p><p>A Jetson's name carries the memory measured, which CPU and GPU share; both modules also come in other memory sizes. RTX PRO 6000 has 96 GB.</p>",
      quant: "<strong>Quantization</strong><p>The number format the weights are stored in.</p><p>BF16 is full precision, FP8 uses 8 bits and NVFP4 4 bits. Q8_0, Q4_K_M and Q4_0 are GGUF formats for llama.cpp with about 8 and 4 bits per weight. Fewer bits means less memory and usually more speed, at some risk to quality.</p>",
      engine: "<strong>Inference Engine</strong><p>The server software that loads the model and schedules requests: vLLM for Hugging Face checkpoints, llama.cpp for GGUF files.</p><p>It affects speed as much as the hardware does: the same model on the same device can differ measurably between engines.</p>",
      tps: "<strong>TPS — tokens per second</strong><p>How fast one camera's answer is written once it has started, at the selected number of cameras. A token is about three quarters of a word.</p><p>Per camera, not in total. Max Cameras is decided by the response time; TPS tells you how long a longer answer then takes. Higher is better.</p>",
      response: "<strong>Response time</strong><p>How long a camera waits until its answer starts, at the selected number of cameras, image size and image count, in seconds. Measured as the time to first token (TTFT).</p><p>For a vision-language model this is mostly reading the images, so it grows with their size and number, and with the number of cameras sharing the device. Green is within your target. Lower is better.</p>",
      maxCams: "<strong>Max Cameras</strong><p>The highest measured number of cameras at which the response time meets your target, at the selected image size and image count.</p><p>Each camera sends its next request as soon as the previous one is answered, so it always has one request in flight: the number of concurrent requests is the number of cameras.</p><p>A plus (16+) means even the highest number tested met the target, so the real maximum is higher. 0 means not even one camera is answered in time.</p>",

      fConcurrency: "<strong>Cameras</strong><p>The number of cameras sending requests at the same moment — the concurrency the system was measured at.</p><p>Chooses which measurement the Response and TPS columns show. Rows not measured at this number are hidden.</p>",
      fResolution: "<strong>Image Size</strong><p>The size of each image a camera sends: 480p is 854×480, 720p 1280×720, 1080p 1920×1080, 2K 2560×1440.</p><p>Every number in the table, Max Cameras included, is read at this size. Larger images take longer to read. Rows not measured at this size are hidden.</p>",
      fModel: "<strong>Model filter</strong><p>Shows only the chosen models. Pick several to compare them side by side.</p>",
      fMinParams: "<strong>Minimum Parameters</strong><p>Hides models whose total parameter count is below this.</p><p>The scale is logarithmic, because the models here range from 2B to 35B.</p>",
      fDevice: "<strong>Device filter</strong><p>Shows only runs on the chosen hardware. Pick several to compare devices directly.</p>",
      fQuant: "<strong>Quantization filter</strong><p>Shows only the chosen weight formats. Pick two to compare them.</p>",
      fEngine: "<strong>Engine filter</strong><p>Shows only runs served with the chosen engine.</p>",
      fMaxResp: "<strong>Maximum Response Time</strong><p>Hides configurations whose answer takes longer than this to start at the selected number of cameras, image size and image count.</p><p>It works with the Cameras selector: select the number of cameras you need and set this to your target to see only the configurations that keep up with them.</p>",

      aImages: "<strong>Images per Camera</strong><p>How many images each request carries — one snapshot, or several frames of the same camera sent together, as video is often sent to a vision-language model. Default 1.</p><p>Every image is read before the answer starts, so more images mean a longer response time. Several images per request were measured with one camera only.</p>",
      aResponse: "<strong>Maximum Response Time Target</strong><p>The longest a camera may wait for its answer to start, in seconds.</p><p>Lowering it can lower Max Cameras.</p>",
      reset: "<strong>Reset All Filters</strong><p>Clears every filter and returns image size, number of cameras, the target and images per camera to their defaults.</p>"
    }
  };

  /* ══════════════════════════════════════════════════════════════════════
     Everything below this line is language-independent.
     ══════════════════════════════════════════════════════════════════════ */

  /* Response time is the time to first token: how long a camera waits until
     its answer starts. Max Cameras is the highest measured number of cameras
     (= concurrent requests: each camera has one in flight) whose response
     time meets the target. */
  var DEFAULT_CONFIG = {
    response_target_s: 3,
    images: 1
  };
  var DEFAULT_RES = "720p";
  var RES_ORDER = ["480p", "720p", "1080p", "2K"];
  var RES_COLORS = { "480p": "#7cb342", "720p": "#2196F3", "1080p": "#FF6D00", "2K": "#8e24aa" };
  var TARGET_COLOR = "#c8102e";

  var DEVICE_ORDER = {
    "Jetson Orin NX 16GB": 0,
    "Jetson AGX Orin 32GB": 1,
    "RTX PRO 6000 Max-Q": 2,
    "RTX PRO 6000": 3
  };

  var rawData = null;
  var fileConfig = {};
  var config = {};
  var state = {
    devices: [],
    quants: [],
    engines: [],
    concurrency: 1,
    res: DEFAULT_RES
  };
  var sortCol = "response";
  var sortDir = "asc";
  var expanded = {};
  var chartInstances = {};
  var logoPath = null;
  var repaint = {};
  /* Set from data-vlmbt-only: the id of the one run a permanent result page
     shows. The row is then drawn opened, with no filters or collapsing. */
  var only = null;

  var allDevices = [];
  var allModels = [];
  var allQuants = [];
  var allEngines = [];
  var allConcurrency = [];
  var allRes = [];
  var allImages = [];

  function init(src) {
    var container = document.querySelector("[data-vlmbt-src]");
    if (!container) return;
    var dataSource = src || container.getAttribute("data-vlmbt-src");
    only = container.getAttribute("data-vlmbt-only");
    logoPath = container.getAttribute("data-vlmbt-logo") || "logo.png";

    container.innerHTML = '<div class="bt-loading">' + escapeHTML(S.loading) + "</div>";

    fetch(dataSource)
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        rawData = data;
        fileConfig = {};
        for (var k in DEFAULT_CONFIG) {
          if (DEFAULT_CONFIG.hasOwnProperty(k)) fileConfig[k] = DEFAULT_CONFIG[k];
        }
        if (data.config) {
          for (var k2 in data.config) {
            if (data.config.hasOwnProperty(k2)) fileConfig[k2] = data.config[k2];
          }
        }
        resetConfig();
        deriveFilterOptions();

        if (typeof Chart !== "undefined" && typeof ChartDataLabels !== "undefined") {
          Chart.register(ChartDataLabels);
        }

        buildUI(container);
        if (only) return;
        /* Carried over by the site's language switcher (window.ozCarry), so
           switching language keeps the reader's filters, target and open rows. */
        if (window.ozCarry && window.ozCarry.vlmbt) restore(container, window.ozCarry.vlmbt);
        handleHashOnLoad(container);
        window.addEventListener("hashchange", function () {
          handleHashChange(container);
        });
      })
      .catch(function (err) {
        container.innerHTML =
          '<div class="bt-error">' + escapeHTML(S.loadFailed) +
          escapeHTML(err.message) + "</div>";
      });
  }

  function resetConfig() {
    config = {};
    for (var k in fileConfig) {
      if (fileConfig.hasOwnProperty(k)) config[k] = fileConfig[k];
    }
  }

  /* ── Utilities ── */

  function escapeHTML(s) {
    if (s === null || s === undefined) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmt(n, decimals) {
    if (n === null || n === undefined) return "—";
    if (decimals === undefined) decimals = 2;
    return Number(n).toFixed(decimals);
  }

  /* Seconds span 0.05 to 100 here: two decimals where they matter, one where
     they would only be noise. */
  function fmtS(v) {
    if (v === null || v === undefined) return "—";
    return Number(v).toFixed(v < 10 ? 2 : 1);
  }

  /* As in the LLM explorer: the Parameters column prints the value verbatim;
     this reads it back only for sorting and the size filter. */
  function parseParams(v) {
    if (typeof v === "number") return isFinite(v) ? v : null;
    if (typeof v !== "string") return null;
    var m = v.match(/(\d+(?:\.\d+)?)\s*([KMBT]?)/i);
    if (!m) return null;
    var num = parseFloat(m[1]);
    if (!isFinite(num)) return null;
    var unit = (m[2] || "B").toUpperCase();
    var mult = unit === "T" ? 1e12 : unit === "M" ? 1e6 : unit === "K" ? 1e3 : 1e9;
    return num * mult;
  }

  function formatThreshold(n) {
    var b = n / 1e9;
    return (b < 10 ? b.toFixed(1) : String(Math.round(b))) + "B";
  }

  /* An index over a logarithmic scale, as in the LLM explorer; 0 is off. */
  var PARAM_SLIDER_STEPS = 100;
  var PARAM_SLIDER_MIN_B = 2;
  var PARAM_SLIDER_MAX_B = 40;

  function sliderToParams(idx) {
    if (idx <= 0) return 0;
    var t = (idx - 1) / (PARAM_SLIDER_STEPS - 1);
    return PARAM_SLIDER_MIN_B * Math.pow(PARAM_SLIDER_MAX_B / PARAM_SLIDER_MIN_B, t) * 1e9;
  }

  /* The response slider counts quarter seconds; its top end means no limit. */
  var RESP_SLIDER_MAX = 80;
  function sliderToResp(idx) { return idx >= RESP_SLIDER_MAX ? null : idx / 4; }

  function tip(html) {
    return '<button type="button" class="bt-tip" aria-label="info" data-tip="' +
      escapeHTML(html) + '">i</button>';
  }

  function modelOf(entry) {
    return (rawData.models && rawData.models[entry.model]) || {};
  }

  function dims(res) {
    var s = rawData.workload && rawData.workload.sizes;
    return (s && s[res]) || res;
  }

  /* ── The measurement and the target ── */

  /* The measured cells at one image size and image count, by number of
     cameras. */
  function pointsAt(entry, res, images) {
    return (entry.data_points || []).filter(function (p) {
      return p.res === res && p.images === images;
    }).sort(function (a, b) { return a.c - b.c; });
  }

  function pointAt(entry, res, images, c) {
    var pts = entry.data_points || [];
    for (var i = 0; i < pts.length; i++) {
      if (pts[i].res === res && pts[i].images === images && pts[i].c === c) return pts[i];
    }
    return null;
  }

  function current(entry) {
    return pointAt(entry, state.res, config.images, state.concurrency);
  }

  /* Response time is the time to first token. */
  function responseOf(p) {
    return p && p.ttft_s != null ? p.ttft_s : null;
  }

  /* The one definition of "meets the target", behind Max Cameras, PASS/FAIL
     and every green or red cell. Inclusive: 3.00 s meets a 3 s target. Only
     the mean time to first token counts: it is the mean of the requests that
     completed, so a failed request (a benchmarking error) does not affect it. */
  function responseMeets(r) {
    return r !== null && r <= config.response_target_s;
  }

  function meetsTarget(p) {
    return responseMeets(responseOf(p));
  }

  function maxCams(entry, res, images) {
    var pts = pointsAt(entry, res || state.res, images || config.images), max = 0;
    for (var i = 0; i < pts.length; i++) if (meetsTarget(pts[i]) && pts[i].c > max) max = pts[i].c;
    return max;
  }

  function highestTested(entry, res, images) {
    var pts = pointsAt(entry, res || state.res, images || config.images);
    return pts.length ? pts[pts.length - 1].c : 0;
  }

  function deriveFilterOptions() {
    var dSet = {}, mSet = {}, qSet = {}, eSet = {}, cSet = {}, rSet = {}, iSet = {};
    rawData.benchmarks.forEach(function (b) {
      dSet[b.device] = mSet[b.model] = qSet[b.quantization] = eSet[b.engine] = true;
      (b.data_points || []).forEach(function (p) { cSet[p.c] = rSet[p.res] = iSet[p.images] = true; });
    });
    allDevices = Object.keys(dSet).sort(function (a, b) {
      return (DEVICE_ORDER[a] != null ? DEVICE_ORDER[a] : 99) - (DEVICE_ORDER[b] != null ? DEVICE_ORDER[b] : 99);
    });
    allModels = Object.keys(mSet).sort(function (a, b) { return a.toLowerCase().localeCompare(b.toLowerCase()); });
    allQuants = Object.keys(qSet).sort();
    allEngines = Object.keys(eSet).sort();
    allConcurrency = Object.keys(cSet).map(Number).sort(function (a, b) { return a - b; });
    allImages = Object.keys(iSet).map(Number).sort(function (a, b) { return a - b; });
    allRes = RES_ORDER.filter(function (r) { return rSet[r]; });
  }

  /* ── UI Construction ── */

  function buildUI(container) {
    container.className = "bt-container vlmbt-container";

    if (only) {
      container.innerHTML = '<div class="bt-table-wrap bt-single" id="bt-table-wrap"></div>' +
        '<div class="bt-tooltip" id="bt-tooltip" role="tooltip" hidden></div>';
      wireTooltips(container);
      renderTable(container);
      return;
    }

    var html = '<div class="bt-controls">';
    html += buildTargets();
    html += buildFilters();
    html += "</div>";
    html += '<div class="bt-results-count bt-results-split" id="bt-results-count"></div>';
    html += '<div class="bt-table-wrap" id="bt-table-wrap"></div>';
    html += '<div class="bt-tooltip" id="bt-tooltip" role="tooltip" hidden></div>';
    container.innerHTML = html;

    wireTargets(container);
    wireFilters(container);
    wireTooltips(container);
    renderTable(container);
  }

  function row(label, tipHtml, body, extraClass) {
    return '<div class="bt-filter-row' + (extraClass ? " " + extraClass : "") + '">' +
      '<span class="bt-filter-label">' + escapeHTML(label) + tip(tipHtml) + "</span>" +
      body + "</div>";
  }

  function pillGroup(id, attr, values) {
    var h = '<div class="bt-filter-buttons" id="' + id + '">';
    h += '<button type="button" class="bt-btn bt-active" data-' + attr + '="__all">' + escapeHTML(S.showAll) + "</button>";
    values.forEach(function (v) {
      h += '<button type="button" class="bt-btn" data-' + attr + '="' + escapeHTML(v) + '">' + escapeHTML(v) + "</button>";
    });
    return h + "</div>";
  }

  /* A single-choice pill row: image size, images per camera, cameras. */
  function singleGroup(id, attr, values, selected, label) {
    var h = '<div class="bt-filter-buttons" id="' + id + '">';
    values.forEach(function (v) {
      h += '<button type="button" class="bt-btn' + (v === selected ? " bt-active" : "") +
        '" data-' + attr + '="' + escapeHTML(v) + '">' + escapeHTML(label(v)) + "</button>";
    });
    return h + "</div>";
  }

  function buildFilters() {
    var html = '<div class="bt-filters" id="bt-filters">';

    html += row(S.device, S.tip.fDevice, pillGroup("bt-filter-devices", "device", allDevices));

    var mod = '<div class="bt-model-row">';
    mod += '<div class="bt-model-filter">';
    mod += '<input type="text" class="bt-model-search" id="bt-model-search" placeholder="' + escapeHTML(S.searchModels) + '">';
    mod += '<div class="bt-model-list" id="bt-model-list">';
    mod += '<label class="bt-model-option"><input type="checkbox" id="bt-model-all" checked> ' + escapeHTML(S.all) + "</label>";
    allModels.forEach(function (m) {
      mod += '<label class="bt-model-option"><input type="checkbox" class="bt-model-cb" data-model="' + escapeHTML(m) + '" checked> ' + escapeHTML(m) + "</label>";
    });
    mod += "</div></div>";
    mod += '<div class="bt-perf-item"><span class="bt-filter-label bt-inline-label">' +
      escapeHTML(S.minParams) + tip(S.tip.fMinParams) + "</span>" +
      '<div class="bt-slider-group bt-slider-perf"><span class="bt-slider-value" id="bt-min-params-val"></span>' +
      '<input type="range" id="bt-min-params" min="0" max="' + PARAM_SLIDER_STEPS + '" value="0" step="1"></div></div>';
    mod += "</div>";
    html += row(S.model, S.tip.fModel, mod);

    html += row(S.quant, S.tip.fQuant, pillGroup("bt-filter-quants", "quant", allQuants));
    html += row(S.engine, S.tip.fEngine, pillGroup("bt-filter-engines", "engine", allEngines));

    /* The number of cameras and the image size frame every number in the
       table, the way concurrency does in the LLM explorer. With the response
       time they form one group, ruled off above and below. */
    html += row(S.concurrency, S.tip.fConcurrency,
      singleGroup("bt-filter-concurrency", "conc", allConcurrency, state.concurrency, function (c) { return String(c); }),
      "bt-filter-row-perf vlmbt-no-rule vlmbt-group-start");
    html += row(S.resolution, S.tip.fResolution,
      singleGroup("bt-filter-res", "res", allRes, state.res, function (r) { return r; }),
      "bt-filter-row-perf vlmbt-no-rule");

    var sliders = '<div class="bt-filter-row bt-filter-row-perf">';
    sliders += '<div class="bt-perf-item"><span class="bt-filter-label bt-inline-label">' +
      escapeHTML(S.maxResponse) + tip(S.tip.fMaxResp) + "</span>" +
      '<div class="bt-slider-group bt-slider-perf"><span class="bt-slider-value" id="bt-max-resp-val"></span>' +
      '<input type="range" id="bt-max-resp" min="1" max="' + RESP_SLIDER_MAX + '" value="' + RESP_SLIDER_MAX + '" step="1"></div></div>';
    sliders += "</div>";
    html += sliders;

    html += '<div class="bt-filter-row bt-reset-row">' +
      '<button type="button" class="bt-reset" id="bt-reset">' + escapeHTML(S.resetFilters) + "</button>" +
      tip(S.tip.reset) + "</div>";

    html += "</div>";
    return html;
  }

  /* The target sits apart from the filters on purpose: filters decide which
     rows are shown, the target decides what counts as acceptable. */
  function buildTargets() {
    var html = '<div class="bt-targets" id="bt-targets">';
    html += '<button type="button" class="bt-targets-toggle" id="bt-targets-toggle" aria-expanded="false">' +
      '<span class="bt-arrow">&#9654;</span> ' + escapeHTML(S.targetsHeading) + "</button>";
    html += '<div class="bt-targets-body" id="bt-targets-body" hidden>';
    html += '<p class="bt-targets-intro">' + escapeHTML(S.targetsIntro) + "</p>";
    html += '<div class="bt-targets-group"><div class="bt-targets-group-title">' + escapeHTML(S.groupResponse) + "</div>";
    html += '<p class="bt-targets-group-intro">' + escapeHTML(S.groupResponseIntro) + "</p>";
    html += '<div class="bt-targets-grid">';
    html += '<div class="bt-target-item">' +
      '<label for="bt-assump-response_target_s">' + escapeHTML(S.responseTarget) + tip(S.tip.aResponse) + "</label>" +
      '<input type="number" id="bt-assump-response_target_s" value="' + config.response_target_s +
      '" step="0.5" min="0.5"></div>';
    html += '<div class="bt-target-item">' +
      '<label for="bt-assump-images">' + escapeHTML(S.imagesAssumption) + tip(S.tip.aImages) + "</label>" +
      '<select id="bt-assump-images">' + imageOptions() + "</select></div>";
    html += "</div></div>";
    html += "</div></div>";
    return html;
  }

  function imageOptions() {
    return allImages.map(function (n) {
      return '<option value="' + n + '"' + (n === config.images ? " selected" : "") + ">" + n + "</option>";
    }).join("");
  }

  /* ── Wiring ── */

  function wireTargets(container) {
    var toggle = container.querySelector("#bt-targets-toggle");
    var body = container.querySelector("#bt-targets-body");
    toggle.addEventListener("click", function () {
      var open = body.hidden;
      body.hidden = !open;
      toggle.classList.toggle("bt-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });

    var input = container.querySelector("#bt-assump-response_target_s");
    input.addEventListener("input", function () {
      var v = parseFloat(input.value);
      if (isNaN(v) || v <= 0) return;
      config.response_target_s = v;
      renderTable(container);
    });
    /* Snap back once the reader leaves the field, so it never shows a number
       the table is not using. */
    input.addEventListener("change", function () {
      if (input.value !== String(config.response_target_s)) input.value = String(config.response_target_s);
    });

    var images = container.querySelector("#bt-assump-images");
    images.addEventListener("change", function () {
      config.images = parseInt(images.value, 10);
      paintSingle(container);
      syncSliderLabels(container);
      renderTable(container);
    });
  }

  function syncSliderLabels(container) {
    var at = S.atC(state.concurrency, state.res, config.images);
    var resp = sliderToResp(parseInt(container.querySelector("#bt-max-resp").value, 10));
    container.querySelector("#bt-max-resp-val").textContent = (resp === null ? S.noLimit : resp + " s") + at;
    var pIdx = parseInt(container.querySelector("#bt-min-params").value, 10);
    container.querySelector("#bt-min-params-val").textContent =
      pIdx <= 0 ? S.paramsAll : "≥ " + formatThreshold(sliderToParams(pIdx));
  }

  function wireButtonGroup(container, attr, stateKey) {
    var selector = "[data-" + attr + "]";
    var buttons = container.querySelectorAll(selector);
    var allBtn = container.querySelector(selector + "[data-" + attr + '="__all"]');

    function paint() {
      buttons.forEach(function (b) { b.classList.remove("bt-active"); });
      if (state[stateKey].length === 0) {
        if (allBtn) allBtn.classList.add("bt-active");
      } else {
        state[stateKey].forEach(function (v) {
          var el = container.querySelector(selector + "[data-" + attr + '="' + CSS.escape(v) + '"]');
          if (el) el.classList.add("bt-active");
        });
      }
    }

    if (allBtn) {
      allBtn.addEventListener("click", function () {
        state[stateKey] = [];
        paint();
        renderTable(container);
      });
    }

    buttons.forEach(function (btn) {
      if (btn.getAttribute("data-" + attr) === "__all") return;
      btn.addEventListener("click", function () {
        var val = btn.getAttribute("data-" + attr);
        var idx = state[stateKey].indexOf(val);
        if (idx > -1) state[stateKey].splice(idx, 1);
        else state[stateKey].push(val);
        paint();
        renderTable(container);
      });
    });

    return paint;
  }

  function wireSingle(container, attr, apply) {
    container.querySelectorAll("[data-" + attr + "]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        apply(btn.getAttribute("data-" + attr));
        paintSingle(container);
        syncSliderLabels(container);
        renderTable(container);
      });
    });
  }

  /* Whether any run measured this cell. */
  function measured(res, images, c) {
    return rawData.benchmarks.some(function (b) { return !!pointAt(b, res, images, c); });
  }

  /* Marks the selected buttons, and dims the ones that would combine with the
     other two selections into a cell no run measured. */
  function paintSingle(container) {
    container.querySelectorAll("[data-res]").forEach(function (b) {
      var v = b.getAttribute("data-res");
      b.classList.toggle("bt-active", v === state.res);
      b.classList.toggle("vlmbt-na", !measured(v, config.images, state.concurrency));
    });
    container.querySelectorAll("[data-conc]").forEach(function (b) {
      var v = parseInt(b.getAttribute("data-conc"), 10);
      b.classList.toggle("bt-active", v === state.concurrency);
      b.classList.toggle("vlmbt-na", !measured(state.res, config.images, v));
    });
  }

  function wireFilters(container) {
    repaint.device = wireButtonGroup(container, "device", "devices");
    repaint.quant = wireButtonGroup(container, "quant", "quants");
    repaint.engine = wireButtonGroup(container, "engine", "engines");
    wireSingle(container, "res", function (v) { state.res = v; });
    wireSingle(container, "conc", function (v) { state.concurrency = parseInt(v, 10); });
    paintSingle(container);

    var searchInput = container.querySelector("#bt-model-search");
    var modelList = container.querySelector("#bt-model-list");
    var allCb = container.querySelector("#bt-model-all");
    var modelCbs = container.querySelectorAll(".bt-model-cb");

    searchInput.addEventListener("input", function () {
      var term = searchInput.value.toLowerCase();
      modelList.querySelectorAll(".bt-model-option").forEach(function (label) {
        if (label.querySelector("#bt-model-all")) { label.style.display = ""; return; }
        label.style.display = term === "" || label.textContent.toLowerCase().indexOf(term) > -1 ? "" : "none";
      });
    });

    allCb.addEventListener("change", function () {
      var checked = allCb.checked;
      modelCbs.forEach(function (cb) { cb.checked = checked; });
      renderTable(container);
    });

    modelCbs.forEach(function (cb) {
      cb.addEventListener("change", function () {
        var allChecked = true;
        modelCbs.forEach(function (c) { if (!c.checked) allChecked = false; });
        allCb.checked = allChecked;
        renderTable(container);
      });
    });

    SLIDERS.forEach(function (sel) {
      container.querySelector(sel).addEventListener("input", function () {
        syncSliderLabels(container);
        renderTable(container);
      });
    });

    container.querySelector("#bt-reset").addEventListener("click", function () {
      resetAll(container);
    });

    syncSliderLabels(container);
  }

  function resetAll(container) {
    state.devices = [];
    state.quants = [];
    state.engines = [];
    state.concurrency = 1;
    state.res = DEFAULT_RES;
    repaint.device();
    repaint.quant();
    repaint.engine();
    paintSingle(container);

    container.querySelector("#bt-model-search").value = "";
    container.querySelector("#bt-model-all").checked = true;
    container.querySelectorAll(".bt-model-cb").forEach(function (cb) { cb.checked = true; });
    container.querySelectorAll(".bt-model-option").forEach(function (l) { l.style.display = ""; });

    container.querySelector("#bt-max-resp").value = RESP_SLIDER_MAX;
    container.querySelector("#bt-min-params").value = 0;

    resetConfig();
    container.querySelector("#bt-assump-response_target_s").value = String(config.response_target_s);
    container.querySelector("#bt-assump-images").value = String(config.images);
    paintSingle(container);

    expanded = {};
    syncSliderLabels(container);
    renderTable(container);
  }

  /* ── Tooltips (as in the LLM explorer) ── */

  function wireTooltips(container) {
    var tipEl = container.querySelector("#bt-tooltip");
    var openBtn = null;
    var openedByTap = false;

    function show(btn) {
      tipEl.innerHTML = btn.getAttribute("data-tip");
      tipEl.hidden = false;
      var r = btn.getBoundingClientRect();
      var w = tipEl.offsetWidth, h = tipEl.offsetHeight;
      var left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
      var top = r.bottom + 8;
      if (top + h > window.innerHeight - 8 && r.top - h - 8 > 0) top = r.top - h - 8;
      tipEl.style.left = left + "px";
      tipEl.style.top = top + "px";
      openBtn = btn;
    }

    function hide() {
      tipEl.hidden = true;
      openBtn = null;
      openedByTap = false;
    }

    var reanchorQueued = false;
    function reanchor() {
      if (!openBtn || tipEl.hidden || reanchorQueued) return;
      reanchorQueued = true;
      requestAnimationFrame(function () {
        reanchorQueued = false;
        if (!openBtn || tipEl.hidden) return;
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
        e.stopPropagation();
        if (openBtn === btn && openedByTap) hide();
        else { show(btn); openedByTap = true; }
        return;
      }
      if (!e.target.closest || !e.target.closest("#bt-tooltip")) hide();
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

  /* ── Filtering ── */

  var SLIDERS = ["#bt-max-resp", "#bt-min-params"];

  function getFilteredEntries(container) {
    if (only) return rawData.benchmarks.filter(function (e) { return e.id === only; });
    var maxResp = sliderToResp(parseInt(container.querySelector("#bt-max-resp").value, 10));
    var minParams = sliderToParams(parseInt(container.querySelector("#bt-min-params").value, 10));

    var allCb = container.querySelector("#bt-model-all");
    var filterByModel = !allCb.checked;
    var selectedModels = [];
    if (filterByModel) {
      container.querySelectorAll(".bt-model-cb").forEach(function (cb) {
        if (cb.checked) selectedModels.push(cb.getAttribute("data-model"));
      });
    }

    return rawData.benchmarks.filter(function (entry) {
      if (state.devices.length > 0 && state.devices.indexOf(entry.device) === -1) return false;
      if (state.quants.length > 0 && state.quants.indexOf(entry.quantization) === -1) return false;
      if (state.engines.length > 0 && state.engines.indexOf(entry.engine) === -1) return false;
      if (filterByModel && selectedModels.indexOf(entry.model) === -1) return false;
      var ep = parseParams(modelOf(entry).params);
      if (minParams > 0 && ep !== null && ep < minParams) return false;

      var p = current(entry);
      if (!p) return false;
      if (maxResp !== null && responseOf(p) > maxResp) return false;
      return true;
    });
  }


  /* ── Rendering ── */

  function sortValue(entry, col) {
    var p = current(entry);
    if (col === "tps") return p ? p.tps : null;
    if (col === "response") return responseOf(p);
    if (col === "maxcams") return maxCams(entry);
    if (col === "params") return parseParams(modelOf(entry).params);
    if (col === "device") return DEVICE_ORDER[entry.device] != null ? DEVICE_ORDER[entry.device] : 99;
    return undefined;
  }

  function sortEntries(entries) {
    entries.sort(function (a, b) {
      var va = sortValue(a, sortCol), vb = sortValue(b, sortCol);
      if (va === undefined) {
        va = a[sortCol] || ""; vb = b[sortCol] || "";
        return sortDir === "asc" ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
      }
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return sortDir === "asc" ? va - vb : vb - va;
    });
  }

  function columns() {
    var c = S.atCol(state.concurrency);
    return [
      { key: "model", label: S.colModel, t: S.tip.model, left: true },
      { key: "params", label: S.colParams, t: S.tip.params, num: true },
      { key: "device", label: S.colDevice, t: S.tip.device, left: true },
      { key: "quantization", label: S.colQuant, t: S.tip.quant },
      { key: "response", label: S.colResponse + c + S.secUnit, t: S.tip.response, num: true },
      { key: "maxcams", label: S.colMaxCams, t: S.tip.maxCams, num: true },
      { key: "tps", label: S.colTps + c, t: S.tip.tps, num: true },
      { key: "engine", label: S.colEngine, t: S.tip.engine, left: true },
      { key: "expand", label: "", t: null, nosort: true }
    ];
  }

  function renderTable(container) {
    var entries = getFilteredEntries(container);
    sortEntries(entries);

    var countEl = container.querySelector("#bt-results-count");
    if (countEl) {
      countEl.innerHTML = '<span class="bt-count"><span class="bt-count-label">' + escapeHTML(S.matching) + "</span> " +
        S.matchingCount(entries.length, rawData.benchmarks.length) + "</span>";
    }

    var wrap = container.querySelector("#bt-table-wrap");
    if (entries.length === 0) {
      wrap.innerHTML = '<div class="bt-empty">' +
        escapeHTML(measured(state.res, config.images, state.concurrency) ? S.noMatch : S.notMeasured) + "</div>";
      return;
    }

    var cols = columns();
    var html = '<table class="bt-table"><thead><tr>';
    cols.forEach(function (col) {
      var classes = [];
      if (col.nosort) classes.push("bt-no-sort");
      else {
        classes.push("bt-sortable");
        if (sortCol === col.key) classes.push(sortDir === "asc" ? "bt-sorted-asc" : "bt-sorted-desc");
      }
      if (col.num) classes.push("bt-th-num");
      if (col.left) classes.push("bt-th-left");
      html += '<th class="' + classes.join(" ") + '" data-col="' + escapeHTML(col.key) + '">' +
        escapeHTML(col.label) + (col.t ? tip(col.t) : "") + "</th>";
    });
    html += "</tr></thead><tbody>";

    entries.forEach(function (entry) {
      html += entryRow(entry, cols);
      if (only || expanded[entry.id]) html += detailRow(entry, cols.length);
    });
    html += "</tbody></table>";
    wrap.innerHTML = html;

    wrap.querySelectorAll("th[data-col]").forEach(function (th) {
      if (th.classList.contains("bt-no-sort")) return;
      th.addEventListener("click", function (e) {
        if (e.target.closest(".bt-tip")) return;
        var col = th.getAttribute("data-col");
        if (sortCol === col) sortDir = sortDir === "asc" ? "desc" : "asc";
        else { sortCol = col; sortDir = "asc"; }
        renderTable(container);
      });
    });

    function toggleRow(id) {
      expanded[id] = !expanded[id];
      if (!expanded[id]) destroyChart(id);
      if (expanded[id]) history.replaceState(null, "", "#" + id);
      else history.replaceState(null, "", window.location.pathname + window.location.search);
      renderTable(container);
      var back = container.querySelector('[data-id="' + CSS.escape(id) + '"]');
      if (back) back.focus();
    }

    if (!only) wrap.querySelectorAll("tr.bt-row").forEach(function (tr) {
      tr.addEventListener("click", function (e) {
        if (e.target.closest("a, button, input, label")) return;
        toggleRow(tr.getAttribute("data-id"));
      });
      tr.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
          e.preventDefault();
          toggleRow(tr.getAttribute("data-id"));
        }
      });
    });

    entries.forEach(function (entry) {
      if (only || expanded[entry.id]) {
        renderChart(entry, container);
      }
    });

    wrap.querySelectorAll("[data-download]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        downloadChart(btn.getAttribute("data-download"), container);
      });
    });
  }

  /* A plus when the highest number of cameras tested still passed. Where only
     one camera was tested, a plus would claim nothing, so the figure carries a
     star and the title says why it stops at 1. */
  function maxCell(entry, res, images) {
    var max = maxCams(entry, res, images);
    var top = highestTested(entry, res, images);
    if (top === 1) return { text: String(max), title: S.oneOnly, single: true };
    var open = max > 0 && max === top;
    return open ? { text: max + "+", title: S.maxAtLeast(max) } : { text: String(max), title: "" };
  }

  function entryRow(entry, cols) {
    var m = modelOf(entry);
    var p = current(entry);
    var isExpanded = only ? true : !!expanded[entry.id];
    var html = only ? '<tr class="bt-row" data-id="' + escapeHTML(entry.id) + '">' :
      '<tr class="bt-row" data-id="' + escapeHTML(entry.id) + '" tabindex="0" role="button" aria-expanded="' +
      (isExpanded ? "true" : "false") + '" title="' + escapeHTML(S.viewDetails) + '">';

    cols.forEach(function (col) {
      var k = col.key;
      if (k === "model") html += '<td class="bt-left">' + escapeHTML(entry.model) + "</td>";
      else if (k === "params") html += '<td class="bt-num">' + escapeHTML(m.params || "—") + "</td>";
      else if (k === "device") html += '<td class="bt-left">' + escapeHTML(entry.device) + "</td>";
      else if (k === "quantization") html += "<td>" + escapeHTML(entry.quantization) + "</td>";
      else if (k === "response") {
        var ok = p && meetsTarget(p);
        var title = ok ? S.targetMet : S.targetNotMet;
        html += '<td class="bt-num ' + (ok ? "bt-good" : "bt-bad") + '" title="' + escapeHTML(title) + '">' +
          fmtS(responseOf(p)) + "</td>";
      } else if (k === "maxcams") {
        var mc = maxCell(entry);
        html += '<td class="bt-num"' + (mc.title ? ' title="' + escapeHTML(mc.title) + '"' : "") + ">" +
          (mc.text === "0" ? '<span class="bt-muted">0</span>' : mc.text) + (mc.single ? "*" : "") + "</td>";
      } else if (k === "tps") html += '<td class="bt-num">' + (p ? fmt(p.tps, 1) : "—") + "</td>";
      else if (k === "engine") html += '<td class="bt-left">' + escapeHTML(entry.engine) + "</td>";
      else if (k === "expand") html += '<td class="bt-expand-cell">' + (only ? "" : isExpanded ? "&#9660;" : "&#9654;") + "</td>";
    });
    return html + "</tr>";
  }

  /* The opened row: the measurements by number of cameras on the left, the
     results explained on the right, the chart below. */
  function detailRow(entry, span) {
    var html = '<tr class="bt-detail-row"><td colspan="' + span + '">';
    html += '<div class="bt-detail-content bt-visible">';
    var expl = explanation(entry);
    html += '<div class="bt-detail-pair vlmbt-pair"><div class="bt-detail-pair-col">' + sweepTable(entry) + "</div>" +
      '<div class="bt-detail-pair-col">' + (expl ? '<div class="bt-explained">' +
      '<div class="bt-capacity-title">' + escapeHTML(S.explainedHeading) + "</div>" + expl + "</div>" : "") + "</div></div>";
    html += chartCard(entry);
    html += '<button type="button" class="bt-chart-download" data-download="' + escapeHTML(entry.id) + '">' +
      escapeHTML(S.downloadChart) + "</button>";
    return html + "</div></td></tr>";
  }

  function sweepTable(entry) {
    var html = '<div class="vlmbt-sweep"><div class="vlmbt-pane-title">' +
      escapeHTML(S.sweepAt(state.res, dims(state.res), config.images)) + "</div>";
    html += '<table class="bt-detail-table"><thead><tr>' +
      "<th>" + escapeHTML(S.detailC) + "</th><th>" + escapeHTML(S.detailResponse) + "</th><th>" +
      escapeHTML(S.detailTps) + "</th><th>" + escapeHTML(S.detailStatus) + "</th></tr></thead><tbody>";
    pointsAt(entry, state.res, config.images).forEach(function (p) {
      var ok = meetsTarget(p);
      var why = ok ? S.targetMet : S.targetNotMet;
      html += "<tr>";
      html += "<td>" + p.c + "</td>";
      html += '<td class="' + (responseMeets(responseOf(p)) ? "bt-dp-good" : "bt-dp-bad") + '">' + fmtS(responseOf(p)) + "</td>";
      html += "<td>" + fmt(p.tps, 1) + "</td>";
      html += '<td class="' + (ok ? "bt-detail-pass" : "bt-detail-fail") + '" title="' + escapeHTML(why) + '">' +
        escapeHTML(ok ? S.pass : S.fail) + "</td></tr>";
    });
    return html + "</tbody></table></div>";
  }

  /* Written into the page at build time, one per row at the default settings
     (_includes/vlm-benchmark-explained.html, _plugins/visibility.rb), so the
     text is in the HTML for search engines and agents; the widget moves it
     into view. */
  function explanation(entry) {
    var el = document.querySelector('[data-vlmbt-explained="' + CSS.escape(entry.id) + '"]');
    return el ? el.innerHTML : "";
  }

  /* ── Chart: response time as cameras are added, one line per image size,
     at the selected image count, with the target ── */

  function chartSizes(entry) {
    return RES_ORDER.filter(function (r) { return pointsAt(entry, r, config.images).length > 1; });
  }

  function chartCard(entry) {
    var sizes = chartSizes(entry);
    if (!sizes.length) return "";
    var head = [entry.model, entry.device, entry.quantization, entry.engine].map(escapeHTML).join(" &middot; ");
    var html = '<div class="bt-chart-card" id="bt-chart-card-' + escapeHTML(entry.id) + '">';
    html += '<div class="bt-chart-header">' + head + "<br><span class=\"bt-muted\">" + escapeHTML(S.chartTitle(config.images)) + "</span></div>";
    html += '<div class="bt-chart-legend">';
    sizes.forEach(function (r) {
      html += '<span class="bt-legend-item"><span class="bt-legend-swatch" style="background:' + RES_COLORS[r] + '"></span> ' +
        escapeHTML(r) + "</span>";
    });
    html += '<span class="bt-legend-item"><span class="bt-legend-swatch" style="background:' + TARGET_COLOR + '"></span> ' +
      escapeHTML(S.chartTarget(config.response_target_s)) + "</span>";
    html += "</div>";
    html += '<div class="bt-chart-axis-titles"><span class="bt-axis-title-left">' + escapeHTML(S.yTitle) + "</span></div>";
    html += '<div class="bt-chart-canvas-wrap"><canvas id="bt-chart-' + escapeHTML(entry.id) + '"></canvas></div>';
    html += '<div class="bt-chart-x-title">' + escapeHTML(S.xTitle) + "</div>";
    html += '<div class="bt-chart-footer"><span></span>';
    html += '<span class="bt-chart-logo"><img src="' + escapeHTML(logoPath) + '" alt="" class="bt-chart-logo-img" style="height:72px;width:auto;"></span>';
    return html + "</div></div>";
  }

  function renderChart(entry, container) {
    var canvas = container.querySelector("#bt-chart-" + CSS.escape(entry.id));
    if (!canvas || typeof Chart === "undefined") return;
    destroyChart(entry.id);
    var sizes = chartSizes(entry);
    var cs = [];
    sizes.forEach(function (r) {
      pointsAt(entry, r, config.images).forEach(function (p) { if (cs.indexOf(p.c) === -1) cs.push(p.c); });
    });
    cs.sort(function (a, b) { return a - b; });
    var datasets = sizes.map(function (r) {
      var sel = r === state.res;
      return {
        label: r, res: r,
        data: cs.map(function (c) { var p = pointAt(entry, r, config.images, c); return p ? responseOf(p) : null; }),
        borderColor: RES_COLORS[r], backgroundColor: RES_COLORS[r],
        borderWidth: sel ? 3 : 1.5, pointRadius: sel ? 5 : 3, pointHoverRadius: 7, tension: 0, spanGaps: true,
        /* PASS and FAIL on the points themselves: filled within the target. */
        pointBackgroundColor: cs.map(function (c) {
          var p = pointAt(entry, r, config.images, c);
          return p && meetsTarget(p) ? RES_COLORS[r] : "#ffffff";
        })
      };
    });
    datasets.push({
      label: S.chartTarget(config.response_target_s), data: cs.map(function () { return config.response_target_s; }),
      borderColor: TARGET_COLOR, borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0, tension: 0
    });
    chartInstances[entry.id] = new Chart(canvas, {
      type: "line",
      data: { labels: cs.map(String), datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        scales: {
          x: { type: "category", grid: { color: "#eeeeee" }, ticks: { font: { size: 12 } } },
          y: { type: "logarithmic", grid: { color: "#eeeeee" }, ticks: { font: { size: 12 },
               callback: function (v) { var s = String(v); return /^[125]/.test(s) || v < 1 && /^0\.[125]/.test(s) ? v : ""; } } }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            filter: function (item) { return item.dataset.res; },
            callbacks: { label: function (ctx) { return ctx.dataset.label + ": " + fmtS(ctx.parsed.y) + " s"; } }
          },
          datalabels: {
            display: function (ctx) { return ctx.dataset.res === state.res; },
            align: "top",
            anchor: "end",
            color: function (ctx) { return RES_COLORS[ctx.dataset.res] || "#333"; },
            font: { weight: "bold", size: 11 },
            formatter: function (v) { return v == null ? "" : fmtS(v); }
          }
        }
      }
    });
  }

  function destroyChart(id) {
    if (chartInstances[id]) {
      chartInstances[id].destroy();
      delete chartInstances[id];
    }
  }

  function downloadChart(entryId, container) {
    var card = container.querySelector("#bt-chart-card-" + CSS.escape(entryId));
    if (!card) return;
    var save = function (canvas) {
      var link = document.createElement("a");
      link.download = entryId + S.chartFileSuffix;
      link.href = canvas.toDataURL("image/png");
      link.click();
    };
    if (typeof html2canvas === "undefined") {
      var c = container.querySelector("#bt-chart-" + CSS.escape(entryId));
      if (c) save(c);
      return;
    }
    html2canvas(card, { backgroundColor: "#ffffff", scale: 4 }).then(save);
  }

  /* ── Carrying the view across a language switch ── */

  function snapshot() {
    var container = document.querySelector(".vlmbt-container");
    if (!container || only || !rawData) return null;
    var sliders = {};
    SLIDERS.forEach(function (sel) { sliders[sel] = container.querySelector(sel).value; });
    var models = null;
    if (!container.querySelector("#bt-model-all").checked) {
      models = [];
      container.querySelectorAll(".bt-model-cb").forEach(function (cb) {
        if (cb.checked) models.push(cb.getAttribute("data-model"));
      });
    }
    var open = [];
    for (var id in expanded) if (expanded.hasOwnProperty(id) && expanded[id]) open.push(id);
    return {
      devices: state.devices.slice(), quants: state.quants.slice(), engines: state.engines.slice(),
      concurrency: state.concurrency, res: state.res,
      sortCol: sortCol, sortDir: sortDir, expanded: open,
      config: JSON.parse(JSON.stringify(config)), sliders: sliders, models: models,
      search: container.querySelector("#bt-model-search").value,
      targetsOpen: !container.querySelector("#bt-targets-body").hidden
    };
  }

  function restore(container, s) {
    try {
      state.devices = s.devices || []; state.quants = s.quants || []; state.engines = s.engines || [];
      state.concurrency = allConcurrency.indexOf(s.concurrency) > -1 ? s.concurrency : 1;
      state.res = allRes.indexOf(s.res) > -1 ? s.res : DEFAULT_RES;
      if (s.sortCol) { sortCol = s.sortCol; sortDir = s.sortDir || "asc"; }
      repaint.device(); repaint.quant(); repaint.engine();
      paintSingle(container);
      SLIDERS.forEach(function (sel) {
        if (s.sliders && s.sliders[sel] != null) container.querySelector(sel).value = s.sliders[sel];
      });
      container.querySelector("#bt-model-all").checked = !s.models;
      container.querySelectorAll(".bt-model-cb").forEach(function (cb) {
        cb.checked = !s.models || s.models.indexOf(cb.getAttribute("data-model")) > -1;
      });
      var search = container.querySelector("#bt-model-search");
      search.value = s.search || "";
      search.dispatchEvent(new Event("input"));
      if (s.config) for (var k in s.config) if (config.hasOwnProperty(k)) config[k] = s.config[k];
      container.querySelector("#bt-assump-response_target_s").value = String(config.response_target_s);
      container.querySelector("#bt-assump-images").value = String(config.images);
      paintSingle(container);
      if (s.targetsOpen && container.querySelector("#bt-targets-body").hidden) {
        container.querySelector("#bt-targets-toggle").click();
      }
      expanded = {};
      (s.expanded || []).forEach(function (id) { expanded[id] = true; });
      syncSliderLabels(container);
      renderTable(container);
    } catch (e) { /* a stale or foreign snapshot: keep the defaults */ }
  }

  /* ── Deep Linking ── */

  function isRow(id) {
    return rawData.benchmarks.some(function (b) { return b.id === id; });
  }

  function scrollToRow(container, id) {
    setTimeout(function () {
      var row = container.querySelector('[data-id="' + CSS.escape(id) + '"]');
      if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 200);
  }

  function handleHashOnLoad(container) {
    var hash = decodeURIComponent(window.location.hash.substring(1));
    if (!hash || !isRow(hash)) return;
    expanded[hash] = true;
    renderTable(container);
    scrollToRow(container, hash);
  }

  function handleHashChange(container) {
    var hash = decodeURIComponent(window.location.hash.substring(1));
    /* A hash that is not a row id belongs to something else on the page — a
       heading anchor. Leave the table alone. */
    if (hash && !isRow(hash)) return;
    for (var id in expanded) {
      if (expanded.hasOwnProperty(id) && expanded[id] && id !== hash) {
        expanded[id] = false;
        destroyChart(id);
      }
    }
    if (hash) expanded[hash] = true;
    renderTable(container);
    if (hash) scrollToRow(container, hash);
  }

  /* ── Bootstrap ── */

  if (typeof window !== "undefined") {
    window.VlmBenchmarkTable = { init: init, snapshot: snapshot };
  }

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", function () {
      init();
    });
  }
})();
