/* ── Benchmark Table — vanilla JS, zero dependencies ── */
(function () {
  "use strict";

  /* ──────────────────────────────────────────────────────────────────────
     UI STRINGS — the ONLY block that differs between benchmark-table.js and
     benchmark-table.tr.js. Everything below this object is byte-identical in
     both files. When changing behaviour, edit one file and copy the body
     across; when changing wording, edit only this object.
     ────────────────────────────────────────────────────────────────────── */
  var S = {
    lang: "en",

    loading: "Loading benchmarks…",
    loadFailed: "Failed to load benchmark data: ",

    /* Controls */
    concurrency: "Concurrency",
    device: "Device",
    model: "Model",
    quant: "Quantization",
    engine: "Engine",
    mtp: "Speculative Decoding",
    all: "All",
    showAll: "Show All",
    searchModels: "Search models…",
    noMtp: "Off",
    withMtp: "On",
    resetFilters: "Reset All Filters",

    minTps: "Min TPS",
    minParams: "Min Parameters",
    maxTtft: "Max TTFT",
    noLimit: "No limit",
    paramsAll: "All sizes",
    minChatUsers: "Min. Chat User Capacity (users)",
    minAgenticUsers: "Min. Agentic User Capacity (users)",
    atC: function (c) { return " at C=" + c; },

    /* Performance targets / assumptions */
    targetsHeading: "Performance Targets and Capacity Assumptions",
    targetsIntro: "These values define acceptable performance and how capacity is estimated. They do not hide rows; they recalculate every row's Max C and capacity, and the green and red colouring of TPS and TTFT.",
    ttftThreshold: "Maximum TTFT Target (ms)",
    tpsThreshold: "Minimum TPS Target (tok/s)",
    chatMultiplier: "Chat Usage Multiplier",
    agenticMultiplier: "Agentic Usage Multiplier",
    groupSpeed: "Speed limit",
    groupSpeedIntro: "How fast each request must be. Max C is the highest measured concurrency that meets both targets; the multipliers turn it into people.",
    groupMemory: "KV cache memory limit",
    groupMemoryIntro: "How many users' sessions of the length below fit in the KV cache left beside the model weights.",
    chatContext: "Chat Context Length (tokens)",
    agenticContext: "Agentic Context Length (tokens)",
    engineMemDiscrete: "Engine Memory Allocation — Discrete GPU (%)",
    engineMemUnified: "Engine Memory Allocation — Unified Memory (%)",
    weightsKvShare: "Weights and KV Cache Share (%)",

    /* Table */
    colModel: "Model",
    colParams: "Parameters",
    colIntel: "Intelligence Index",
    colAgenticIdx: "Agentic Index",
    colDevice: "Device",
    colQuant: "Quantization",
    colTps: "TPS",
    colTtft: "TTFT",
    colMaxC: "Max C",
    colChat: "Chat Capacity",
    colAgentic: "Agentic Capacity",
    colTp: "TP", colDp: "DP", colPp: "PP",
    colEngine: "Engine",
    colMtp: "Speculative Decoding",
    yes: "Yes",
    users: "users",
    matching: "Matching Configurations",
    matchingCount: function (shown, total) {
      return "<strong>" + shown + "</strong> of <strong>" + total + "</strong>";
    },
    noMatch: "No configurations match the current filters.",
    targetMet: "Target Met — this value meets your current performance target.",
    targetNotMet: "Target Not Met — this value does not meet your current performance target.",
    viewDetails: "View Details — shows the complete concurrency sweep, chart and additional information for this configuration.",

    /* Capacity: which of the two limits set the number */
    legendLead: "Capacity set by:",
    legendPerf: "speed targets",
    legendMem: "KV cache memory",
    legendShortCtx: "session longer than the model's context window",
    capPerf: function (mem, ctx) { return "Set by the speed targets. KV cache memory would fit " + mem + " sessions of " + ctx + " tokens."; },
    capMem: function (perf, ctx) { return "Set by KV cache memory: this many " + ctx + "-token sessions fit. The speed targets would allow " + perf + "."; },
    capTie: function (ctx) { return "The speed targets and KV cache memory (" + ctx + "-token sessions) allow the same number."; },
    capUnchecked: function (why) { return "Set by the speed targets. " + why; },
    whyUnsupported: "The KV cache memory limit is not calculated for this model yet, because its cache layout is not modelled, so this figure rests on the speed measurements alone.",
    whyWeights: "The KV cache memory limit cannot be calculated for this run: the model weights alone are larger than the memory this estimate assumes is available to it. The run evidently fitted, which usually means it gave the engine more memory than that standard allocation, or kept part of the model or its KV cache in CPU memory or on disk. This figure therefore rests on the speed measurements alone.",
    whyUnknown: "The KV cache memory limit cannot be calculated, because the hardware or the weight precision is missing from the memory table, so this figure rests on the speed measurements alone.",
    capShortCtx: function (len, ctx) { return "A " + ctx + "-token session is longer than this model's " + len + "-token context window — the most it can hold — so it cannot serve sessions that long. Choose a shorter context length to see a figure."; },
    capCeiling: function (c) { return " The speed figure is a lower bound: the run still met your targets at C=" + c + ", the highest level tested."; },
    capHeading: "Capacity",
    capChatRow: function (ctx) { return "Chat · " + ctx + "-token sessions"; },
    capAgenticRow: function (ctx) { return "Agentic · " + ctx + "-token sessions"; },
    capUsers: function (n) { return n + (n === 1 ? " user" : " users"); },
    capByPerf: "set by the speed targets",
    capByMem: "set by KV cache memory",
    capByTie: "speed targets and KV cache memory agree",
    capByContext: "longer than the model's context window",
    capSpeedAllows: function (n, atLeast) { return "Speed targets allow " + (atLeast ? "at least " : "") + n; },
    capMemFits: function (n) { return "KV cache memory fits " + n; },
    capMemNa: "KV cache memory not calculated",
    capKvSummary: function (kv, w, unit, prec) { return "Once the model weights are loaded (" + w + " GB per " + unit + "), about " + kv + " GB per " + unit + " is left for the KV cache, assumed stored at " + prec + "."; },
    capWeightsEstimated: "The checkpoint this run served is not recorded, so its weight size is estimated from the parameter count.",
    capShortCtxLine: function (len) { return "This model's context window is " + len + " tokens, so it cannot hold a session as long as the one set in the assumptions."; },
    unitGpu: "GPU",
    unitNode: "node",
    unitModule: "module",

    /* Expanded row */
    detailC: "C", detailTtft: "TTFT (ms)", detailTps: "TPS (tok/s)", detailStatus: "Status",
    pass: "PASS", fail: "FAIL",
    notes: "Notes:",
    downloadChart: "Download Chart",
    chartFileSuffix: "-chart.png",
    tpsAxis: "TPS (tok/s)",
    aggAxis: "Aggregate TPS (tok/s)",
    aggLabel: "Aggregate TPS",
    leftAxis: " — left axis",
    rightAxis: " — right axis",
    xTitle: "Number of Concurrent Requests",

    /* TPS speed preview */
    previewHeading: "What this speed looks like",
    previewSubtitle: function (n) { return "sample text at approximately " + n + " tokens/s"; },
    previewStopped: "stopped — the TPS target is 0",
    previewRowHeading: "What this speed looks like",
    previewRowSub: function (c, n) { return "C=" + c + " · approximately " + n + " tokens/s"; },
    previewPick: "Pick any measured concurrency to preview the speed recorded there.",
    previewRowLabel: function (c) { return "Preview the speed measured at C=" + c; },
    previewDisclaimer: "This is an approximate simulation designed to visualize the selected TPS value. Actual response experience may vary depending on TTFT, output length, and application behavior.",
    sampleText: "Running a large language model on your own hardware means the response speed depends on the accelerator, the quantization format and how many people are using the system at the same time. At low token rates the text appears word by word and the wait becomes noticeable, so the interface feels like it is thinking out loud. As the rate increases the reply arrives faster than most people can read it, and the experience changes character entirely: instead of watching the answer being assembled, you simply read it. Somewhere between those two extremes is the point where a chat assistant stops feeling like a machine you are waiting on and starts feeling like a tool that keeps up with you. Where exactly that point falls depends on the task. Skimming a short answer tolerates far less speed than reading a long technical explanation, and a background job that nobody watches tolerates less still.",

    /* Tooltips */
    tip: {
      model: "<strong>Model</strong><p>The large language model being served.</p><p>A row is a whole deployment, so the same model appears in several rows with different hardware, format, engine or parallelism.</p>",
      params: "<strong>Parameters</strong><p>The model's total number of weights, as published.</p><p>For mixture-of-experts models this is the total, not the part active for each token, because all of it is held in memory.</p>",
      intel: "<strong>Intelligence Index</strong><p>Artificial Analysis’ capability score, combining evaluations of reasoning, coding, science and long-context work. Higher is better.</p><p>It describes the model, not this run, so every row of the model shows the same value. Where several reasoning-effort settings are scored, the highest is shown; a dash means no score is published.</p><p>Source: Artificial Analysis.</p>",
      agenticIdx: "<strong>Agentic Index</strong><p>Artificial Analysis’ score for agentic work: multi-step tasks, tool calls and staying on course without supervision. Higher is better.</p><p>It measures what the model can do; Agentic Capacity, further along the row, estimates how many people the hardware can serve. A dash means no score is published, which is common here.</p><p>Source: Artificial Analysis.</p>",
      device: "<strong>Device</strong><p>The hardware the run used, and how many units served the model together.</p><p>4× DGX Spark means four machines serving one model as a single system.</p>",
      quant: "<strong>Quantization</strong><p>The number format the weights are stored in.</p><p>Fewer bits per weight means less memory and usually more speed, at some risk to quality. BF16 and FP16 are full precision, FP8 and MXFP8 use 8 bits, and NVFP4, MXFP4, FP4, INT4 and AWQ use 4.</p>",
      tps: "<strong>TPS — tokens per second</strong><p>How fast one request’s reply is produced at the selected concurrency. A token is about three quarters of a word.</p><p>Per request, not in total: at C=8, each of the eight requests gets this rate. Mean of ten rounds with 128-token prompts and replies. Higher is better.</p>",
      ttft: "<strong>TTFT — time to first token</strong><p>How long a request waits for its first token at the selected concurrency, in milliseconds.</p><p>Mean of ten rounds with 128-token prompts; longer prompts take roughly proportionally longer. Lower is better.</p>",
      maxc: "<strong>Max C — maximum supported concurrency</strong><p>The highest measured concurrency at which both your TTFT and your TPS target are met. It counts simultaneous requests, not people.</p><p>It follows your targets: tighten one and Max C can fall. 0 means no measured level passes.</p>",
      chat: "<strong>Chat Capacity</strong><p>Roughly how many people can use this configuration for chat at once — the smaller of two estimates:</p><p><strong>Speed:</strong> Max C × Chat Usage Multiplier, because chat users spend most of their time reading and typing.<br><strong>Memory:</strong> how many sessions of the Chat Context Length fit in the KV cache.</p><p>The icon shows which one set the figure. An estimate, not a measured user count.</p>",
      agentic: "<strong>Agentic Capacity</strong><p>Roughly how many people can use this configuration at once for agentic work, where the model carries out multi-step tasks and tool calls — the smaller of two estimates:</p><p><strong>Speed:</strong> Max C × Agentic Usage Multiplier, lower than for chat because an agent keeps sending requests while it works.<br><strong>Memory:</strong> how many sessions of the Agentic Context Length fit in the KV cache.</p><p>The icon shows which one set the figure. An estimate, not a measured user count.</p>",
      par: "<strong>Parallelism — TP / DP / PP</strong><p>How the model is split across GPUs or machines.</p><p><strong>TP</strong> divides the work inside each layer, <strong>PP</strong> places different layers on different devices, and <strong>DP</strong> runs full copies that each serve their own requests. — means not used.</p>",
      engine: "<strong>Inference Engine</strong><p>The server software that loads the model and schedules requests, such as vLLM or SGLang.</p><p>It affects speed as much as the hardware does: the same model on the same hardware can differ measurably between engines.</p>",
      mtp: "<strong>Speculative Decoding</strong><p>The model drafts several tokens ahead and checks them in one pass; accepted tokens are kept, so the same output arrives sooner.</p><p>Yes means the run used it. The mechanism — MTP, a draft model or DSpark — and how far ahead it drafted are in the row’s notes.</p>",

      fConcurrency: "<strong>Concurrency</strong><p>The number of requests being processed at the same moment — a load level, not a number of people.</p><p>Chooses which measurement the TPS and TTFT columns show. Rows not measured at this level are hidden.</p>",
      fModel: "<strong>Model filter</strong><p>Shows only the chosen models. Pick several to compare them side by side.</p>",
      fMinParams: "<strong>Minimum Parameters</strong><p>Hides models whose total parameter count is below this.</p><p>The scale is logarithmic, because the models here range from 4B to 2.8T.</p>",
      fDevice: "<strong>Device filter</strong><p>Shows only runs on the chosen hardware. Pick several to compare devices directly.</p>",
      fQuant: "<strong>Quantization filter</strong><p>Shows only the chosen weight formats. Pick FP8 and NVFP4 together to compare the two.</p>",
      fMtp: "<strong>Speculative Decoding filter</strong><p>Shows runs with speculative decoding on, off or both. Choose both to see what it gains.</p>",
      fMinTps: "<strong>Minimum TPS</strong><p>Hides configurations whose per-request speed at the selected concurrency is below this.</p>",
      fMaxTtft: "<strong>Maximum TTFT</strong><p>Hides configurations whose first token takes longer than this at the selected concurrency.</p>",
      fMinChat: "<strong>Minimum Chat Capacity</strong><p>Hides configurations estimated to serve fewer chat users than this. Counted in people.</p>",
      fMinAgentic: "<strong>Minimum Agentic Capacity</strong><p>Hides configurations estimated to serve fewer agentic users than this. Counted in people.</p>",

      aTps: "<strong>Minimum TPS Target</strong><p>The slowest per-request speed you accept, in tokens per second.</p><p>Raising it can lower Max C and the capacity figures.</p>",
      aTtft: "<strong>Maximum TTFT Target</strong><p>The longest wait for the first token you accept, in milliseconds.</p><p>Lowering it can lower Max C and the capacity figures.</p>",
      aChat: "<strong>Chat Usage Multiplier</strong><p>How many chat users share one request slot on average, since each spends most of the time reading and typing. The default of 4 means a user has a request running about a quarter of the time.</p><p>Raise it for lighter use, lower it for heavier.</p>",
      aAgentic: "<strong>Agentic Usage Multiplier</strong><p>The same for agentic users. The default of 1.5 means an agent has a request running about two thirds of the time, because it chains its calls.</p><p>Lower it for agents that run almost continuously.</p>",
      aChatCtx: "<strong>Chat Context Length</strong><p>How many tokens one chat session holds: its history, pasted text and replies.</p><p>The memory limit counts how many sessions of this length fit in the KV cache; doubling it roughly halves that number.</p>",
      aAgenticCtx: "<strong>Agentic Context Length</strong><p>The same for an agentic session, which also holds tool calls and their results, so it is usually several times longer.</p>",
      aEngineDiscrete: "<strong>Engine Memory Allocation — Discrete GPU</strong><p>The share of each GPU’s memory given to the inference engine, what vLLM calls <code>gpu_memory_utilization</code>.</p><p>Applies to DGX B300 and RTX PRO 6000.</p>",
      aEngineUnified: "<strong>Engine Memory Allocation — Unified Memory</strong><p>The same share where the CPU and GPU draw on one memory pool. The operating system runs in that pool too, so the default is lower.</p><p>Applies to DGX Spark and Jetson Thor.</p>",
      aShare: "<strong>Weights and KV Cache Share</strong><p>The part of the engine’s memory that holds the weights and the KV cache; the rest is working memory for activations.</p><p>KV cache = memory × allocation × this share − weights.</p>",
      reset: "<strong>Reset All Filters</strong><p>Clears every filter and returns the targets and assumptions to their defaults.</p>"
    }
  };

  /* ══════════════════════════════════════════════════════════════════════
     Everything below this line is language-independent.
     ══════════════════════════════════════════════════════════════════════ */

  var DEFAULT_CONFIG = {
    ttft_threshold_ms: 1000,
    tps_threshold: 20,
    chat_multiplier: 4,
    agentic_multiplier: 1.5,
    chat_context_tokens: 32768,
    agentic_context_tokens: 131072,
    engine_memory_discrete: 0.95,
    engine_memory_unified: 0.8,
    weights_kv_share: 0.8
  };

  var rawData = null;
  var fileConfig = {};
  var config = {};
  var state = {
    devices: [],
    quants: [],
    mtp: "all",
    concurrency: 1
  };
  var sortCol = "tps";
  var sortDir = "desc";
  var expanded = {};
  var chartInstances = {};
  var logoPath = null;
  var repaint = {};


  var allDevices = [];
  var allModels = [];
  var allQuants = [];
  var allConcurrency = [];

  var DEVICE_ORDER = {
    "Thor": 0,
    "1× DGX Spark": 1,
    "2× DGX Spark": 2,
    "3× DGX Spark": 3,
    "4× DGX Spark": 4,
    "8× DGX Spark": 5,
    "RTX PRO 6000": 6,
    "DGX B300": 7
  };

  function init(src) {
    var containers = document.querySelectorAll("[data-bt-src]");
    if (containers.length === 0) return;
    var container = containers[0];
    var dataSource = src || container.getAttribute("data-bt-src");

    /* Logo path: an explicit data-bt-logo wins, so a CMS that keeps images and
       scripts in separate folders can point at the real location. Otherwise
       fall back to the directory this script was loaded from. */
    logoPath = container.getAttribute("data-bt-logo");
    if (!logoPath) {
      var scripts = document.querySelectorAll("script[src]");
      for (var i = 0; i < scripts.length; i++) {
        var s = scripts[i].getAttribute("src");
        if (s && s.indexOf("benchmark-table") > -1) {
          var slash = s.lastIndexOf("/");
          /* No slash means the script sits beside the page, so keep the path
             relative — substring(0, -1) would resolve logo.png to the site root. */
          logoPath = slash > -1 ? s.substring(0, slash) + "/logo.png" : "logo.png";
          break;
        }
      }
    }
    if (!logoPath) logoPath = "logo.png";

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

        /* Register Chart.js plugins if available */
        if (typeof Chart !== "undefined" && typeof ChartDataLabels !== "undefined") {
          Chart.register(ChartDataLabels);
        }

        buildUI(container);
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

  /* The Parameters column prints entry.params verbatim, exactly as the Model
     and Quantization columns print theirs. Nothing rounds or reformats it — the
     value in benchmarks.json is the value on screen, so a wrong figure is fixed
     by editing the data, not this file.

     Sorting and the size filter still need a number, so the written value is
     read back once per comparison. "27B" -> 2.7e10, "1.65T" -> 1.65e12. A bare
     number is taken as a literal parameter count, and anything unrecognised
     returns null, which sorts last and is never hidden by the size filter —
     a malformed entry stays visible instead of silently vanishing. */
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

  /* Labels the size slider — a threshold the user picked, not a model's figure,
     so this one is computed. */
  function formatThreshold(n) {
    if (n === null || n === undefined) return "—";
    var b = n / 1e9;
    if (b >= 1000) return (b / 1000).toFixed(2) + "T";
    return Math.round(b) + "B";
  }

  /* The slider is an index, not a parameter count: a linear scale over this
     range would spend nine tenths of its travel above 300B, where only a
     handful of models live. Index 0 is the off position. */
  var PARAM_SLIDER_STEPS = 100;
  var PARAM_SLIDER_MIN_B = 4;
  var PARAM_SLIDER_MAX_B = 5000;

  function sliderToParams(idx) {
    if (idx <= 0) return 0;
    var t = (idx - 1) / (PARAM_SLIDER_STEPS - 1);
    return PARAM_SLIDER_MIN_B * Math.pow(PARAM_SLIDER_MAX_B / PARAM_SLIDER_MIN_B, t) * 1e9;
  }

  /* An info affordance carrying its own tooltip copy. The copy comes from S,
     never from data, so it is safe to store as markup. */
  function tip(html) {
    return '<button type="button" class="bt-tip" aria-label="info" data-tip="' +
      escapeHTML(html) + '">i</button>';
  }

  function getMetricAtC(entry, c, metric) {
    for (var i = 0; i < entry.data_points.length; i++) {
      if (entry.data_points[i].c === c) return entry.data_points[i][metric];
    }
    return null;
  }

  /* One definition of "meets the target" per metric, driving every coloured
     cell in both tables as well as Max C. A minimum of 20 tok/s is met by
     exactly 20, and a maximum of 1000 ms is met by exactly 1000, so both
     bounds are inclusive. They used to disagree: a cell could be green while
     its own sweep row read FAIL. */
  function ttftMeets(ttft) {
    return ttft != null && ttft <= config.ttft_threshold_ms;
  }

  function tpsMeets(tps) {
    return tps != null && tps >= config.tps_threshold;
  }

  function meetsTargets(dp) {
    return ttftMeets(dp.ttft_ms) && tpsMeets(dp.tps);
  }

  function getMaxC(entry) {
    var maxC = 0;
    for (var i = 0; i < entry.data_points.length; i++) {
      var dp = entry.data_points[i];
      if (meetsTargets(dp) && dp.c > maxC) maxC = dp.c;
    }
    return maxC;
  }

  function highestTestedC(entry) {
    var c = 0;
    for (var i = 0; i < entry.data_points.length; i++) {
      if (entry.data_points[i].c > c) c = entry.data_points[i].c;
    }
    return c;
  }

  /* ── Capacity: the smaller of two independent estimates ──

     Speed side, unchanged: floor(Max C × usage multiplier).
     Memory side: how many full-length sessions fit in the KV cache. It carries
     no multiplier — chat and agentic differ only in their context length.

     One GPU (or Spark node) stands for all of them, because the weights and
     the cache are split evenly across the run's tp × pp devices; each of the
     dp copies serves its own users, so the result is multiplied by dp. The
     memory tables come from benchmarks.json; the per-model KV sizes are the
     entry's kv_* fields, generated by _tools/kv_geometry.py from the model's
     config.json. The weights are the served checkpoint's size (weights_gb)
     when the row records it, else parameters × bytes per parameter. */

  function deviceBase(device) {
    return String(device).replace(/^\d+×\s*/, "");
  }

  /* Everything the memory side needs that does not depend on context length:
     the KV budget on one device, or the reason there is none. */
  function memoryBudget(entry) {
    var mem = rawData.memory;
    if (!mem || entry.kv_bytes_per_token == null) return { status: "unsupported" };
    var base = deviceBase(entry.device);
    var gb = mem.memory_gb ? mem.memory_gb[base] : null;
    var bpp = mem.weight_bytes_per_param ? mem.weight_bytes_per_param[entry.quantization] : null;
    var params = parseParams(entry.params);
    var measured = entry.weights_gb != null;
    var total = measured ? entry.weights_gb * 1e9 : bpp && params !== null ? params * bpp : null;
    if (!gb || total === null) return { status: "unknown" };
    var tp = entry.tp || 1, pp = entry.pp || 1, dp = entry.dp || 1;
    /* Bytes per stored KV value: 1 = FP8, assumed for every row. An FP8 cache
       is an engine setting, available whatever precision the weights use. */
    var perValue = mem.kv_cache_bytes_per_value || 1;
    var unified = (mem.unified_memory || []).indexOf(base) > -1;
    var alloc = unified ? config.engine_memory_unified : config.engine_memory_discrete;
    /* Both reserves come off the physical memory before the weights do. */
    var budget = gb * 1e9 * alloc * config.weights_kv_share;
    var weights = total / (tp * pp);
    return {
      status: budget - weights > 0 ? "ok" : "weights",
      base: base, gb: gb, alloc: alloc, weights: weights, kv: budget - weights,
      tp: tp, pp: pp, dp: dp, perValue: perValue, measured: measured,
      /* GQA heads divide across TP down to one head per GPU; a cache with no
         kv_heads (MLA and other compressed layouts) is copied to every GPU. */
      split: entry.kv_heads ? Math.min(tp, entry.kv_heads) : 1
    };
  }

  /* One session on one device. The KV cache splits over min(tp, kv_heads);
     single-head index keys cannot split and sit on every GPU; the fixed
     recurrent state of linear-attention layers splits over all tp GPUs and is
     already in the precision the engine keeps it in. */
  function sessionBytes(entry, b, ctx) {
    var kv = (entry.kv_bytes_per_token * ctx + entry.kv_window_bytes) * b.perValue / b.split;
    var copied = (entry.kv_replicated_bytes_per_token || 0) * ctx * b.perValue;
    return (kv + copied) / b.pp + (entry.kv_state_bytes || 0) / (b.tp * b.pp);
  }

  /* The single source for every capacity figure on screen: the cell, its
     title, the sort, the minimum-capacity filters and the row breakdown. */
  function capacity(entry, kind) {
    var maxC = getMaxC(entry);
    var ctx = config[kind + "_context_tokens"];
    var b = memoryBudget(entry);
    var r = {
      kind: kind, maxC: maxC, ctx: ctx, budget: b, window: entry.model_context_length,
      perf: Math.floor(maxC * config[kind + "_multiplier"]),
      mem: null, session: null, limit: "perf",
      ceiling: maxC > 0 && maxC === highestTestedC(entry),
      /* A session longer than the model's own context window cannot be
         served at all, whatever the hardware. */
      tooLong: entry.model_context_length != null && ctx > entry.model_context_length
    };
    if (b.status === "ok") {
      r.session = sessionBytes(entry, b, ctx);
      r.mem = Math.floor(b.kv / r.session) * b.dp;
    }
    if (r.tooLong) {
      r.shown = 0;
      r.limit = "context";
    } else if (r.mem === null) {
      /* No memory figure: the speed estimate stands on its own, and the
         title and breakdown say why. */
      r.shown = r.perf;
    } else {
      r.shown = Math.min(r.perf, r.mem);
      r.limit = r.perf < r.mem ? "perf" : r.mem < r.perf ? "mem" : "tie";
    }
    return r;
  }

  function getChatUsers(entry) {
    return capacity(entry, "chat").shown;
  }

  function getAgenticUsers(entry) {
    return capacity(entry, "agentic").shown;
  }

  /* 32768 -> "32K", 1048576 -> "1M": the power-of-two convention context
     lengths are quoted in. */
  function fmtTokens(n) {
    if (n >= 1048576 && n % 1048576 === 0) return n / 1048576 + "M";
    if (n >= 1024 && n % 1024 === 0) return n / 1024 + "K";
    return String(n);
  }

  /* Digit groups separated by a thin space, which reads the same in English
     and Turkish — a comma or a dot would each mean a decimal in one of them. */
  function fmtInt(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f");
  }

  function fmtGB(bytes) {
    var g = bytes / 1e9;
    return g >= 100 ? g.toFixed(0) : g >= 10 ? g.toFixed(1) : g.toFixed(2);
  }

  function limitWhy(r) {
    return r.budget.status === "weights" ? S.whyWeights :
      r.budget.status === "unknown" ? S.whyUnknown : S.whyUnsupported;
  }

  var CAP_ICON = {
    perf: '<path d="M9.5 1 3 9h4.2L6.5 15 13 7H8.8z" fill="currentColor"/>',
    mem: '<rect x="2" y="4.5" width="12" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
      '<path d="M5 11.5V14M8 11.5V14M11 11.5V14M5 2v2.5M8 2v2.5M11 2v2.5" stroke="currentColor" stroke-width="1.4"/>',
    shortctx: '<path d="M8 1.8 15 14.2H1z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>' +
      '<path d="M8 6.2v3.9M8 11.5v1.1" stroke="currentColor" stroke-width="1.6"/>'
  };

  function capIcon(name, label) {
    return '<svg class="bt-cap-icon bt-cap-' + name + '" viewBox="0 0 16 16" width="16" height="16" role="img" aria-label="' +
      escapeHTML(label) + '">' + CAP_ICON[name] + "</svg>";
  }

  function capIcons(r) {
    var h = "";
    if (r.limit === "perf" || r.limit === "tie") h += capIcon("perf", S.legendPerf);
    if (r.limit === "mem" || r.limit === "tie") h += capIcon("mem", S.legendMem);
    if (r.limit === "context") h += capIcon("shortctx", S.legendShortCtx);
    return h;
  }

  function capTitle(r) {
    var ctx = fmtTokens(r.ctx);
    if (r.limit === "context") return S.capShortCtx(fmtTokens(r.window), ctx);
    var t = r.mem === null ? S.capUnchecked(limitWhy(r)) :
      r.limit === "perf" ? S.capPerf(r.mem, ctx) :
      r.limit === "mem" ? S.capMem(r.perf, ctx) : S.capTie(ctx);
    if (r.ceiling && r.limit !== "mem") t += S.capCeiling(r.maxC);
    return t;
  }

  function capCell(entry, kind) {
    var r = capacity(entry, kind);
    var shown = r.limit === "context" ? '<span class="bt-muted">—</span>' : r.shown;
    return '<td class="bt-num bt-cap" title="' + escapeHTML(capTitle(r)) + '">' + shown + capIcons(r) + "</td>";
  }

  /* The context-window marker only appears once a context length long enough
     to trigger it is chosen, so its legend entry only appears then too. */
  function capLegend(entries) {
    var tooLong = entries.some(function (e) {
      return capacity(e, "chat").tooLong || capacity(e, "agentic").tooLong;
    });
    return '<span class="bt-cap-legend"><span class="bt-cap-legend-lead">' + escapeHTML(S.legendLead) + "</span>" +
      '<span class="bt-cap-legend-item">' + capIcon("perf", S.legendPerf) + escapeHTML(S.legendPerf) + "</span>" +
      '<span class="bt-cap-legend-item">' + capIcon("mem", S.legendMem) + escapeHTML(S.legendMem) + "</span>" +
      (tooLong ? '<span class="bt-cap-legend-item">' + capIcon("shortctx", S.legendShortCtx) +
        escapeHTML(S.legendShortCtx) + "</span>" : "") +
      "</span>";
  }

  /* A short, plain summary of both capacity cells for the expanded row: the
     figure, which limit set it, what each limit allows, and one sentence of
     context. The method itself is explained on the page, not here. */
  function capBreakdown(entry) {
    var rows = [capacity(entry, "chat"), capacity(entry, "agentic")];
    var b = rows[0].budget;
    var html = '<div class="bt-capacity"><div class="bt-capacity-title">' + escapeHTML(S.capHeading) + "</div>";
    html += '<div class="bt-capacity-grid">';
    rows.forEach(function (r) {
      var label = r.kind === "chat" ? S.capChatRow(fmtTokens(r.ctx)) : S.capAgenticRow(fmtTokens(r.ctx));
      var by = r.limit === "context" ? S.capByContext :
        r.limit === "mem" ? S.capByMem : r.limit === "tie" ? S.capByTie : S.capByPerf;
      var detail = S.capSpeedAllows(r.perf, r.ceiling) + " · " +
        (r.mem === null ? S.capMemNa : S.capMemFits(r.mem));
      html += '<span class="bt-cap-label">' + escapeHTML(label) + "</span>";
      html += '<span class="bt-cap-result" title="' + escapeHTML(capTitle(r)) + '">' +
        "<strong>" + (r.limit === "context" ? "—" : escapeHTML(S.capUsers(r.shown))) + "</strong>" +
        capIcons(r) + ' <span class="bt-cap-by">' + escapeHTML(by) + "</span>" +
        '<span class="bt-cap-detail">' + escapeHTML(detail) + "</span></span>";
    });
    html += "</div>";

    var notes = [];
    if (b.status === "ok") {
      var unit = b.base === "DGX Spark" ? S.unitNode : b.base === "Thor" ? S.unitModule : S.unitGpu;
      notes.push(S.capKvSummary(fmtGB(b.kv), fmtGB(b.weights), unit, b.perValue === 2 ? "BF16" : "FP8"));
      if (!b.measured) notes.push(S.capWeightsEstimated);
    } else {
      notes.push(limitWhy(rows[0]));
      if (b.status === "weights" && !b.measured) notes.push(S.capWeightsEstimated);
    }
    if (rows[0].tooLong || rows[1].tooLong) notes.push(S.capShortCtxLine(fmtTokens(entry.model_context_length)));
    html += notes.map(function (l) { return '<p class="bt-capacity-note">' + escapeHTML(l) + "</p>"; }).join("");
    html += "</div>";
    return html;
  }


  function deriveFilterOptions() {
    var dSet = {}, mSet = {}, qSet = {}, cSet = {};
    for (var i = 0; i < rawData.benchmarks.length; i++) {
      var b = rawData.benchmarks[i];
      dSet[b.device] = true;
      mSet[b.model] = true;
      qSet[b.quantization] = true;
      for (var j = 0; j < b.data_points.length; j++) {
        cSet[b.data_points[j].c] = true;
      }
    }
    allDevices = Object.keys(dSet).sort(function (a, b) {
      return (DEVICE_ORDER[a] != null ? DEVICE_ORDER[a] : 99) -
             (DEVICE_ORDER[b] != null ? DEVICE_ORDER[b] : 99);
    });
    allModels = Object.keys(mSet).sort();
    allQuants = Object.keys(qSet).sort();
    allConcurrency = Object.keys(cSet).map(Number).sort(function (a, b) { return a - b; });
  }

  /* ── UI Construction ── */

  function buildUI(container) {
    container.className = "bt-container";

    var html = "";
    html += '<div class="bt-controls">';
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
    wirePreview(container);
    renderTable(container);
  }

  function row(label, tipHtml, body, extraClass) {
    return '<div class="bt-filter-row' + (extraClass ? " " + extraClass : "") + '">' +
      '<span class="bt-filter-label">' + escapeHTML(label) + tip(tipHtml) + "</span>" +
      body + "</div>";
  }

  function buildFilters() {
    var html = '<div class="bt-filters" id="bt-filters">';


    var dev = '<div class="bt-filter-buttons" id="bt-filter-devices">';
    dev += '<button type="button" class="bt-btn bt-active" data-device="__all">' + escapeHTML(S.showAll) + "</button>";
    allDevices.forEach(function (d) {
      dev += '<button type="button" class="bt-btn" data-device="' + escapeHTML(d) + '">' + escapeHTML(d) + "</button>";
    });
    dev += "</div>";
    html += row(S.device, S.tip.fDevice, dev);

    /* Size sits beside the search box rather than on its own row: both answer
       "which models am I looking at", and the two together still fit one row. */
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
      '<input type="range" id="bt-min-params" min="0" max="' + PARAM_SLIDER_STEPS +
      '" value="0" step="1"></div></div>';
    mod += "</div>";
    html += row(S.model, S.tip.fModel, mod);

    var qua = '<div class="bt-filter-buttons" id="bt-filter-quants">';
    qua += '<button type="button" class="bt-btn bt-active" data-quant="__all">' + escapeHTML(S.showAll) + "</button>";
    allQuants.forEach(function (q) {
      qua += '<button type="button" class="bt-btn" data-quant="' + escapeHTML(q) + '">' + escapeHTML(q) + "</button>";
    });
    qua += "</div>";
    html += row(S.quant, S.tip.fQuant, qua);

    var mtp = '<div class="bt-filter-buttons" id="bt-filter-mtp">';
    mtp += '<button type="button" class="bt-btn bt-active" data-mtp="all">' + escapeHTML(S.all) + "</button>";
    mtp += '<button type="button" class="bt-btn" data-mtp="none">' + escapeHTML(S.noMtp) + "</button>";
    mtp += '<button type="button" class="bt-btn" data-mtp="with">' + escapeHTML(S.withMtp) + "</button>";
    mtp += "</div>";
    html += row(S.mtp, S.tip.fMtp, mtp);

    /* Concurrency leads — it frames every number in the table — and the two
       performance sliders read against it, so they share a row. */
    var perf = '<div class="bt-filter-row bt-filter-row-perf">';
    perf += '<span class="bt-filter-label">' + escapeHTML(S.concurrency) + tip(S.tip.fConcurrency) + "</span>";
    perf += '<div class="bt-filter-buttons" id="bt-filter-concurrency">';
    allConcurrency.forEach(function (c) {
      perf += '<button type="button" class="bt-btn' + (c === 1 ? " bt-active" : "") +
        '" data-conc="' + c + '">C=' + c + "</button>";
    });
    perf += "</div>";
    /* label and slider travel together so the row wraps cleanly */
    perf += '<div class="bt-perf-item"><span class="bt-filter-label bt-inline-label">' +
      escapeHTML(S.minTps) + tip(S.tip.fMinTps) + "</span>" +
      '<div class="bt-slider-group bt-slider-perf"><span class="bt-slider-value" id="bt-min-tps-val"></span>' +
      '<input type="range" id="bt-min-tps" min="0" max="300" value="0" step="1"></div></div>';
    perf += '<div class="bt-perf-item"><span class="bt-filter-label bt-inline-label">' +
      escapeHTML(S.maxTtft) + tip(S.tip.fMaxTtft) + "</span>" +
      '<div class="bt-slider-group bt-slider-perf"><span class="bt-slider-value" id="bt-max-ttft-val"></span>' +
      '<input type="range" id="bt-max-ttft" min="100" max="10000" value="10000" step="100"></div></div>';
    perf += "</div>";
    html += perf;

    html += row(S.minChatUsers, S.tip.fMinChat,
      '<div class="bt-slider-group"><span class="bt-slider-value" id="bt-min-chat-val"></span>' +
      '<input type="range" id="bt-min-chat" min="0" max="200" value="0" step="1"></div>');

    html += row(S.minAgenticUsers, S.tip.fMinAgentic,
      '<div class="bt-slider-group"><span class="bt-slider-value" id="bt-min-agentic-val"></span>' +
      '<input type="range" id="bt-min-agentic" min="0" max="100" value="0" step="1"></div>');

    html += '<div class="bt-filter-row bt-reset-row">' +
      '<button type="button" class="bt-reset" id="bt-reset">' + escapeHTML(S.resetFilters) + "</button>" +
      tip(S.tip.reset) + "</div>";

    html += "</div>";
    return html;
  }

  /* Targets sit apart from filters on purpose: filters decide which rows are
     shown, targets decide what counts as acceptable and how capacity is
     estimated. */
  function buildTargets() {
    var html = '<div class="bt-targets" id="bt-targets">';
    html += '<button type="button" class="bt-targets-toggle" id="bt-targets-toggle" aria-expanded="false">' +
      '<span class="bt-arrow">&#9654;</span> ' + escapeHTML(S.targetsHeading) + "</button>";
    html += '<div class="bt-targets-body" id="bt-targets-body" hidden>';
    html += '<p class="bt-targets-intro">' + escapeHTML(S.targetsIntro) + "</p>";
    html += '<div class="bt-targets-group"><div class="bt-targets-group-title">' + escapeHTML(S.groupSpeed) + "</div>";
    html += '<p class="bt-targets-group-intro">' + escapeHTML(S.groupSpeedIntro) + "</p>";
    html += '<div class="bt-targets-grid">';
    html += targetItem(S.ttftThreshold, "ttft_threshold_ms", S.tip.aTtft, "");
    html += targetItem(S.tpsThreshold, "tps_threshold", S.tip.aTps, "");
    html += targetItem(S.chatMultiplier, "chat_multiplier", S.tip.aChat, "");
    html += targetItem(S.agenticMultiplier, "agentic_multiplier", S.tip.aAgentic, "");
    html += "</div>";
    /* The preview streams at the TPS target, so it belongs with the speed
       settings rather than after the memory ones. */
    html += '<div class="bt-tps-preview">';
    html += '<div class="bt-tps-preview-head"><span class="bt-tps-preview-title">' + escapeHTML(S.previewHeading) +
      '</span><span class="bt-preview-sub" id="bt-preview-sub"></span></div>';
    html += '<div class="bt-preview-text" id="bt-preview-text"></div>';
    html += '<p class="bt-preview-note">' + escapeHTML(S.previewDisclaimer) + "</p>";
    html += "</div>";
    html += "</div>";
    html += '<div class="bt-targets-group"><div class="bt-targets-group-title">' + escapeHTML(S.groupMemory) + "</div>";
    html += '<p class="bt-targets-group-intro">' + escapeHTML(S.groupMemoryIntro) + "</p>";
    html += '<div class="bt-targets-grid">';
    html += contextItem(S.chatContext, "chat_context_tokens", S.tip.aChatCtx);
    html += contextItem(S.agenticContext, "agentic_context_tokens", S.tip.aAgenticCtx);
    html += targetItem(S.engineMemDiscrete, "engine_memory_discrete", S.tip.aEngineDiscrete, "");
    html += targetItem(S.engineMemUnified, "engine_memory_unified", S.tip.aEngineUnified, "");
    html += targetItem(S.weightsKvShare, "weights_kv_share", S.tip.aShare, "");
    html += "</div></div>";
    html += "</div>";
    html += "</div>";
    return html;
  }

  /* A millisecond target and a tokens-per-second target are whole positive
     counts; the multipliers are genuinely fractional (1.5 by default). */
  var WHOLE_NUMBER_TARGETS = { ttft_threshold_ms: true, tps_threshold: true };

  /* Stored as fractions (0.95) because that is how an engine takes them, and
     shown as percentages (95) because that is how a person reads them. */
  var PERCENT_TARGETS = { engine_memory_discrete: true, engine_memory_unified: true, weights_kv_share: true };

  var NUMBER_TARGETS = ["ttft_threshold_ms", "tps_threshold", "chat_multiplier", "agentic_multiplier",
    "engine_memory_discrete", "engine_memory_unified", "weights_kv_share"];
  var CONTEXT_TARGETS = ["chat_context_tokens", "agentic_context_tokens"];

  /* Powers of two, the sizes context lengths are actually configured in. A
     free number would invite values no deployment uses. */
  var CONTEXT_CHOICES = [4096, 8192, 16384, 32768, 65536, 131072, 262144, 524288, 1048576];

  function shownTarget(key) {
    return PERCENT_TARGETS[key] ? String(Math.round(config[key] * 1000) / 10) : String(config[key]);
  }

  function targetItem(label, key, tipHtml, extra) {
    var whole = WHOLE_NUMBER_TARGETS[key] || PERCENT_TARGETS[key];
    return '<div class="bt-target-item">' +
      '<label for="bt-assump-' + key + '">' + escapeHTML(label) + tip(tipHtml) + "</label>" +
      '<input type="number" id="bt-assump-' + key + '" value="' + shownTarget(key) +
      '" step="' + (whole ? "1" : "0.1") + '" min="' + (whole ? "1" : "0") + '"' +
      (PERCENT_TARGETS[key] ? ' max="100"' : "") +
      (whole ? ' inputmode="numeric"' : "") + ">" +
      extra + "</div>";
  }

  function contextItem(label, key, tipHtml) {
    var choices = CONTEXT_CHOICES.slice();
    if (choices.indexOf(config[key]) === -1) choices.push(config[key]);
    choices.sort(function (a, b) { return a - b; });
    var html = '<div class="bt-target-item">' +
      '<label for="bt-assump-' + key + '">' + escapeHTML(label) + tip(tipHtml) + "</label>" +
      '<select id="bt-assump-' + key + '">';
    choices.forEach(function (n) {
      html += '<option value="' + n + '"' + (n === config[key] ? " selected" : "") + ">" +
        fmtTokens(n) + " (" + fmtInt(n) + ")</option>";
    });
    return html + "</select></div>";
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
      /* the preview only animates while it is on screen */
      if (open) startPreview(container); else stopPreview();
    });

    NUMBER_TARGETS.forEach(function (key) {
      var input = container.querySelector("#bt-assump-" + key);
      input.addEventListener("input", function () {
        var v = parseFloat(input.value);
        if (isNaN(v)) return;
        if (PERCENT_TARGETS[key]) {
          if (v <= 0 || v > 100) return;
          v = v / 100;
        } else if (WHOLE_NUMBER_TARGETS[key]) {
          if (v < 1 || v !== Math.floor(v)) return;
        } else if (v < 0) {
          return;
        }
        config[key] = v;
        renderTable(container);
      });
      /* Snap the field back once the reader leaves it, so it can never sit
         there showing a number the table is not actually using. */
      input.addEventListener("change", function () {
        if (input.value !== shownTarget(key)) input.value = shownTarget(key);
      });
    });

    CONTEXT_TARGETS.forEach(function (key) {
      var select = container.querySelector("#bt-assump-" + key);
      select.addEventListener("change", function () {
        config[key] = parseInt(select.value, 10);
        renderTable(container);
      });
    });
  }

  function syncSliderLabels(container) {
    var c = state.concurrency;
    var tps = container.querySelector("#bt-min-tps").value;
    var ttft = parseInt(container.querySelector("#bt-max-ttft").value, 10);
    container.querySelector("#bt-min-tps-val").textContent = tps + S.atC(c);
    container.querySelector("#bt-max-ttft-val").textContent =
      (ttft >= 10000 ? S.noLimit : ttft + " ms") + S.atC(c);
    container.querySelector("#bt-min-chat-val").textContent =
      container.querySelector("#bt-min-chat").value + " " + S.users;
    container.querySelector("#bt-min-agentic-val").textContent =
      container.querySelector("#bt-min-agentic").value + " " + S.users;
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

  function wireFilters(container) {
    repaint.device = wireButtonGroup(container, "device", "devices");
    repaint.quant = wireButtonGroup(container, "quant", "quants");

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

    /* "All" is a select-all / clear-all toggle. Unchecking it empties the
       selection so the user can then tick just the models they want. */
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

    container.querySelectorAll("[data-mtp]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        container.querySelectorAll("[data-mtp]").forEach(function (b) { b.classList.remove("bt-active"); });
        btn.classList.add("bt-active");
        state.mtp = btn.getAttribute("data-mtp");
        renderTable(container);
      });
    });

    container.querySelectorAll("[data-conc]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        container.querySelectorAll("[data-conc]").forEach(function (b) { b.classList.remove("bt-active"); });
        btn.classList.add("bt-active");
        state.concurrency = parseInt(btn.getAttribute("data-conc"), 10);
        syncSliderLabels(container);
        renderTable(container);
      });
    });

    ["#bt-min-tps", "#bt-max-ttft", "#bt-min-chat", "#bt-min-agentic", "#bt-min-params"].forEach(function (sel) {
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

  /* One reset for everything. A separate "reset assumptions" action would make
     the user reason about which of two buttons they need. */
  function resetAll(container) {
    state.devices = [];
    state.quants = [];
    state.mtp = "all";
    state.concurrency = 1;
    repaint.device();
    repaint.quant();

    container.querySelectorAll("[data-mtp]").forEach(function (b) {
      b.classList.toggle("bt-active", b.getAttribute("data-mtp") === "all");
    });
    container.querySelectorAll("[data-conc]").forEach(function (b) {
      b.classList.toggle("bt-active", b.getAttribute("data-conc") === "1");
    });

    container.querySelector("#bt-model-search").value = "";
    container.querySelector("#bt-model-all").checked = true;
    container.querySelectorAll(".bt-model-cb").forEach(function (cb) { cb.checked = true; });
    container.querySelectorAll(".bt-model-option").forEach(function (l) { l.style.display = ""; });

    container.querySelector("#bt-min-tps").value = 0;
    container.querySelector("#bt-max-ttft").value = 10000;
    container.querySelector("#bt-min-chat").value = 0;
    container.querySelector("#bt-min-agentic").value = 0;
    container.querySelector("#bt-min-params").value = 0;

    resetConfig();
    NUMBER_TARGETS.forEach(function (k) {
      container.querySelector("#bt-assump-" + k).value = shownTarget(k);
    });
    CONTEXT_TARGETS.forEach(function (k) {
      container.querySelector("#bt-assump-" + k).value = String(config[k]);
    });

    /* The preview is driven by the TPS input, not by config, so it has to be
       told the value changed — otherwise it keeps streaming at the old rate
       and the panel looks like it did not reset. */
    if (container.querySelector("#bt-targets-body").hidden) stopPreview();
    else startPreview(container);

    expanded = {};
    syncSliderLabels(container);
    renderTable(container);
  }

  /* ── Tooltips ── */

  function wireTooltips(container) {
    var tipEl = container.querySelector("#bt-tooltip");
    var openBtn = null;
    /* Touch browsers send a synthetic mouseover before the click, so by the
       time the click lands the bubble is already open and a plain toggle would
       close what the tap was meant to open. Only a second tap should close. */
    var openedByTap = false;

    function show(btn) {
      tipEl.innerHTML = btn.getAttribute("data-tip");
      tipEl.hidden = false;
      /* Positioned against the viewport rather than the container: the
         container is not a positioned ancestor, so absolute coordinates
         resolved against something further up the tree and the bubble landed
         well above the icon. */
      var r = btn.getBoundingClientRect();
      var w = tipEl.offsetWidth, h = tipEl.offsetHeight;
      var left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
      var top = r.bottom + 8;
      /* flip above the icon when there is no room below */
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

    /* The bubble is position:fixed, so it does not travel with the page. A
       tooltip held open by keyboard focus or a tap would sit still while its
       icon scrolled away, so re-anchor it — and drop it once the icon leaves
       the viewport, where there is nothing left to point at. */
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
    /* capture, so a scroll inside the table wrapper counts too */
    window.addEventListener("scroll", reanchor, { capture: true, passive: true });
    window.addEventListener("resize", reanchor);

    /* Tap toggles on touch devices; hover and keyboard focus cover the rest. */
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

  /* ── TPS speed preview ── */

  function wirePreview(container) {
    container.querySelector("#bt-assump-tps_threshold").addEventListener("input", function () {
      if (!container.querySelector("#bt-targets-body").hidden) startPreview(container);
    });
  }

  function startPreview(container) {
    /* config, not the input: a half-typed or rejected value would otherwise
       demonstrate a speed the table is not using. */
    var v = config.tps_threshold;
    var sub = container.querySelector("#bt-preview-sub");
    var el = container.querySelector("#bt-preview-text");
    /* A target of zero means no speed to demonstrate: stop rather than
       silently substituting some other rate. */
    if (isNaN(v) || v <= 0) {
      stopStream(el);
      sub.textContent = S.previewStopped;
      el.textContent = "";
      el.classList.remove("bt-streaming");
      return;
    }
    sub.textContent = S.previewSubtitle(Math.round(v * 10) / 10);
    stream(el, v);
  }

  function stopPreview() {
    stopStream(document.querySelector("#bt-preview-text"));
  }

  function stopStream(el) {
    if (!el) return;
    if (el.btTimer) { clearTimeout(el.btTimer); el.btTimer = null; }
    el.classList.remove("bt-streaming");
  }

  /* Speed preview inside an expanded row. Defaults to the concurrency the
     table is currently showing, so it opens on the number the reader was
     already looking at. */
  function wireRowPreview(entry, container) {
    var textEl = container.querySelector('[data-rowtext="' + CSS.escape(entry.id) + '"]');
    var subEl = container.querySelector('[data-rowsub="' + CSS.escape(entry.id) + '"]');
    if (!textEl || !subEl) return;
    var detail = textEl.closest(".bt-detail-content");
    var dpRows = detail.querySelectorAll("tr.bt-dp-row");

    function pick(tr) {
      dpRows.forEach(function (r) { r.classList.remove("bt-dp-active"); });
      tr.classList.add("bt-dp-active");
      var tps = parseFloat(tr.getAttribute("data-tps"));
      var c = tr.getAttribute("data-c");
      subEl.textContent = S.previewRowSub(c, Math.round(tps * 10) / 10);
      /* Match the colour of the TPS cell it came from, so the heading does not
         read as approval of a speed the table just marked red. */
      subEl.classList.toggle("bt-sub-bad", !tpsMeets(tps));
      if (isNaN(tps) || tps <= 0) { stopStream(textEl); textEl.textContent = ""; return; }
      stream(textEl, tps);
    }

    dpRows.forEach(function (tr) {
      tr.addEventListener("click", function () { pick(tr); });
      tr.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") { e.preventDefault(); pick(tr); }
      });
    });

    var start = null;
    dpRows.forEach(function (tr) {
      if (tr.getAttribute("data-c") === String(state.concurrency)) start = tr;
    });
    if (!start && dpRows.length) start = dpRows[0];
    if (start) pick(start);
  }

  /* One emitted piece is a whole word, but this page defines a token as
     roughly three quarters of a word, so a word is about 1.33 tokens.
     Releasing words at the token rate ran a third too fast. */
  var WORDS_PER_TOKEN = 0.75;

  /* Approximate token streaming: chop the sample into word-sized pieces and
     reveal them at the selected rate. Not a real tokenizer — but the average
     rate it plays at is the rate on the label. */
  function stream(el, tps) {
    stopStream(el);
    /* Every filter, sort or target change rebuilds the table markup, which
       detaches the preview box of any expanded row. Without this guard the
       timer chain below keeps running against that orphaned node for the life
       of the page — one more chain per re-render, none ever collected. */
    if (!document.contains(el)) return;
    var pieces = S.sampleText.match(/\S+\s*/g) || [];
    var wordsPerSec = tps * WORDS_PER_TOKEN;
    if (!(wordsPerSec > 0) || !pieces.length) return;
    var interval = 1000 / wordsPerSec;

    /* Show the first word at once, then time everything after it, so the box
       never sits blank waiting for the first tick at low rates. */
    el.textContent = pieces[0];
    el.classList.add("bt-streaming");
    var i = 1;
    var base = 1;
    var t0 = Date.now();

    function step() {
      /* Same reason as above: the node may have been replaced since the last
         tick, and this is the only place that can notice. */
      if (!document.contains(el)) { el.btTimer = null; return; }
      /* Release however many words the elapsed time has earned, rather than a
         fixed count per tick. A whole number of words against a 16 ms floor
         snapped the rate to multiples of 62.5/s — 70 tok/s played at 125.
         Reading the clock also self-corrects when the browser throttles
         timers, and the cap stops a backgrounded tab dumping its backlog in
         one frame. */
      var due = base + Math.floor((Date.now() - t0) / 1000 * wordsPerSec);
      if (due > i + 240) due = i + 240;
      while (i < due && i < pieces.length) el.textContent += pieces[i++];
      /* the box is a fixed size, so follow the tail instead of growing */
      el.scrollTop = el.scrollHeight;
      if (i < pieces.length) {
        el.btTimer = setTimeout(step, Math.max(16, interval));
      } else {
        /* hold the finished text briefly, then run it again */
        el.btTimer = setTimeout(function () { stream(el, tps); }, 1600);
      }
    }
    el.btTimer = setTimeout(step, Math.max(16, interval));
  }

  /* ── Filtering ── */

  function getFilteredEntries(container) {
    var minTps = parseInt(container.querySelector("#bt-min-tps").value, 10);
    var maxTtft = parseInt(container.querySelector("#bt-max-ttft").value, 10);
    var minChat = parseInt(container.querySelector("#bt-min-chat").value, 10);
    var minAgentic = parseInt(container.querySelector("#bt-min-agentic").value, 10);
    var minParams = sliderToParams(parseInt(container.querySelector("#bt-min-params").value, 10));

    /* "All" checked means no model filter at all. Once it is off we filter to
       exactly the ticked models — including when that is none, which must show
       an empty table rather than every row. */
    var allCb = container.querySelector("#bt-model-all");
    var modelCbs = container.querySelectorAll(".bt-model-cb");
    var filterByModel = !allCb.checked;
    var selectedModels = [];
    if (filterByModel) {
      modelCbs.forEach(function (cb) {
        if (cb.checked) selectedModels.push(cb.getAttribute("data-model"));
      });
    }

    return rawData.benchmarks.filter(function (entry) {
      if (state.devices.length > 0 && state.devices.indexOf(entry.device) === -1) return false;
      if (state.quants.length > 0 && state.quants.indexOf(entry.quantization) === -1) return false;
      if (filterByModel && selectedModels.indexOf(entry.model) === -1) return false;
      var ep = parseParams(entry.params);
      if (minParams > 0 && ep !== null && ep < minParams) return false;
      if (state.mtp === "none" && entry.mtp) return false;
      if (state.mtp === "with" && !entry.mtp) return false;

      var tps = getMetricAtC(entry, state.concurrency, "tps");
      var ttft = getMetricAtC(entry, state.concurrency, "ttft_ms");
      if (tps === null) return false;
      if (tps < minTps) return false;
      if (ttft !== null && ttft > (maxTtft >= 10000 ? 99999 : maxTtft)) return false;

      if (getChatUsers(entry) < minChat) return false;
      if (getAgenticUsers(entry) < minAgentic) return false;

      return true;
    });
  }

  /* Artificial Analysis leaves both indexes null for models it has not scored,
     and the Agentic Index is null far more often than the Intelligence one.
     Render that as the same em dash the TP/DP/PP columns use for "not
     applicable", rather than a 0 that would sort and read as a real score. */
  function idxCell(v) {
    return v == null ? '<span class="bt-muted">—</span>' : fmt(v, 1);
  }

  /* ── Rendering ── */

  function renderTable(container) {
    var entries = getFilteredEntries(container);

    entries.sort(function (a, b) {
      var va, vb;
      if (sortCol === "tps") {
        va = getMetricAtC(a, state.concurrency, "tps");
        vb = getMetricAtC(b, state.concurrency, "tps");
        if (va === null) va = -1;
        if (vb === null) vb = -1;
      } else if (sortCol === "ttft") {
        va = getMetricAtC(a, state.concurrency, "ttft_ms");
        vb = getMetricAtC(b, state.concurrency, "ttft_ms");
        if (va === null) va = 99999;
        if (vb === null) vb = 99999;
      } else if (sortCol === "params") {
        va = parseParams(a.params); vb = parseParams(b.params);
        if (va === null) va = -1;
        if (vb === null) vb = -1;
      } else if (sortCol === "intelligence_index" || sortCol === "agentic_index") {
        /* Null means Artificial Analysis publishes no score, which is not the
           same as zero. Sink those rows to the bottom in both directions, so
           flipping the sort never parks the blanks at the top. */
        va = a[sortCol]; vb = b[sortCol];
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
      } else if (sortCol === "maxc") {
        va = getMaxC(a); vb = getMaxC(b);
      } else if (sortCol === "chat") {
        va = getChatUsers(a); vb = getChatUsers(b);
      } else if (sortCol === "agentic") {
        va = getAgenticUsers(a); vb = getAgenticUsers(b);
      } else if (sortCol === "tp") {
        va = a.tp || 0; vb = b.tp || 0;
      } else if (sortCol === "dp") {
        va = a.dp || 0; vb = b.dp || 0;
      } else if (sortCol === "pp") {
        va = a.pp || 0; vb = b.pp || 0;
      } else if (sortCol === "device") {
        va = DEVICE_ORDER[a.device] != null ? DEVICE_ORDER[a.device] : 99;
        vb = DEVICE_ORDER[b.device] != null ? DEVICE_ORDER[b.device] : 99;
      } else {
        va = a[sortCol] || ""; vb = b[sortCol] || "";
        return sortDir === "asc"
          ? String(va).localeCompare(String(vb))
          : String(vb).localeCompare(String(va));
      }
      return sortDir === "asc" ? va - vb : vb - va;
    });

    var countEl = container.querySelector("#bt-results-count");
    if (countEl) {
      countEl.innerHTML = '<span class="bt-count"><span class="bt-count-label">' + escapeHTML(S.matching) + "</span> " +
        S.matchingCount(entries.length, rawData.benchmarks.length) + "</span>" + capLegend(entries);
    }

    var wrap = container.querySelector("#bt-table-wrap");
    if (entries.length === 0) {
      wrap.innerHTML = '<div class="bt-empty">' + escapeHTML(S.noMatch) + "</div>";
      return;
    }

    var c = state.concurrency;
    var cols = [
      { key: "model",        label: S.colModel,   t: S.tip.model,   sortable: true,  num: false, left: true },
      { key: "params",       label: S.colParams,  t: S.tip.params,  sortable: true,  num: true },
      { key: "intelligence_index", label: S.colIntel, t: S.tip.intel, sortable: true, num: true },
      { key: "agentic_index",  label: S.colAgenticIdx, t: S.tip.agenticIdx, sortable: true, num: true },
      { key: "device",       label: S.colDevice,  t: S.tip.device,  sortable: true,  num: false, left: true },
      { key: "quantization", label: S.colQuant,   t: S.tip.quant,   sortable: true,  num: false },
      { key: "tps",          label: S.colTps + " @ C=" + c,  t: S.tip.tps,  sortable: true, num: true },
      { key: "ttft",         label: S.colTtft + " @ C=" + c, t: S.tip.ttft, sortable: true, num: true },
      { key: "maxc",         label: S.colMaxC,    t: S.tip.maxc,    sortable: true,  num: true  },
      { key: "chat",         label: S.colChat,    t: S.tip.chat,    sortable: true,  num: true  },
      { key: "agentic",      label: S.colAgentic, t: S.tip.agentic, sortable: true,  num: true  },
      { key: "tp",           label: S.colTp,      t: S.tip.par,     sortable: true,  num: true  },
      { key: "dp",           label: S.colDp,      t: S.tip.par,     sortable: true,  num: true  },
      { key: "pp",           label: S.colPp,      t: S.tip.par,     sortable: true,  num: true  },
      { key: "engine",       label: S.colEngine,  t: S.tip.engine,  sortable: true,  num: false, left: true },
      { key: "mtp",          label: S.colMtp,     t: S.tip.mtp,     sortable: true,  num: false },
      { key: "expand",       label: "",           t: null,          sortable: false, num: false }
    ];

    var html = '<table class="bt-table"><thead><tr>';
    cols.forEach(function (col, i) {
      var classes = [];
      if (col.sortable) {
        classes.push("bt-sortable");
        if (sortCol === col.key) classes.push(sortDir === "asc" ? "bt-sorted-asc" : "bt-sorted-desc");
      } else {
        classes.push("bt-no-sort");
      }
      if (col.num) classes.push("bt-th-num");
      /* The four columns whose values are names, not numbers. Flagged on the
         column definition rather than matched by position, so reordering the
         table cannot silently re-align the wrong column. */
      if (col.left) classes.push("bt-th-left");
      html += '<th class="' + classes.join(" ") + '" data-col="' + col.key + '">' +
        escapeHTML(col.label) + (col.t ? tip(col.t) : "") + "</th>";
    });
    html += "</tr></thead><tbody>";

    entries.forEach(function (entry) {
      var maxC = getMaxC(entry);
      var tps = getMetricAtC(entry, c, "tps");
      var ttft = getMetricAtC(entry, c, "ttft_ms");
      var isExpanded = !!expanded[entry.id];

      html += '<tr class="bt-row" data-id="' + escapeHTML(entry.id) + '" tabindex="0" role="button" aria-expanded="' +
        (isExpanded ? "true" : "false") + '" title="' + escapeHTML(S.viewDetails) + '">';

      html += '<td class="bt-left">' + escapeHTML(entry.model) + "</td>";
      html += '<td class="bt-num">' + escapeHTML(entry.params) + "</td>";
      html += '<td class="bt-num">' + idxCell(entry.intelligence_index) + "</td>";
      html += '<td class="bt-num">' + idxCell(entry.agentic_index) + "</td>";
      html += '<td class="bt-left">' + escapeHTML(entry.device) + "</td>";
      html += "<td>" + escapeHTML(entry.quantization) + "</td>";

      var tpsCls = "bt-num", tpsTitle = "";
      if (tps !== null) {
        var tpsOk = tpsMeets(tps);
        tpsCls += tpsOk ? " bt-good" : " bt-bad";
        tpsTitle = ' title="' + escapeHTML(tpsOk ? S.targetMet : S.targetNotMet) + '"';
      }
      html += '<td class="' + tpsCls + '"' + tpsTitle + ">" + fmt(tps, 2) + "</td>";

      var ttftCls = "bt-num", ttftTitle = "";
      if (ttft !== null) {
        var ttftOk = ttftMeets(ttft);
        ttftCls += ttftOk ? " bt-good" : " bt-bad";
        ttftTitle = ' title="' + escapeHTML(ttftOk ? S.targetMet : S.targetNotMet) + '"';
      }
      html += '<td class="' + ttftCls + '"' + ttftTitle + ">" + (ttft !== null ? fmt(ttft, 0) : "—") + "</td>";

      html += '<td class="bt-num">' + (maxC > 0 ? maxC : '<span class="bt-muted">0</span>') + "</td>";
      html += capCell(entry, "chat");
      html += capCell(entry, "agentic");
      html += '<td class="bt-num">' + (entry.tp != null && entry.tp !== 1 ? entry.tp : '<span class="bt-muted">—</span>') + "</td>";
      html += '<td class="bt-num">' + (entry.dp != null && entry.dp !== 1 ? entry.dp : '<span class="bt-muted">—</span>') + "</td>";
      html += '<td class="bt-num">' + (entry.pp != null && entry.pp !== 1 ? entry.pp : '<span class="bt-muted">—</span>') + "</td>";
      html += '<td class="bt-left">' + escapeHTML(entry.engine) + "</td>";
      html += entry.mtp ? '<td class="bt-mtp-yes">' + escapeHTML(S.yes) + "</td>" : '<td class="bt-muted">—</td>';
      html += '<td class="bt-expand-cell">' + (isExpanded ? "&#9660;" : "&#9654;") + "</td>";
      html += "</tr>";

      if (isExpanded) {
        html += '<tr class="bt-detail-row"><td colspan="' + cols.length + '">';
        html += '<div class="bt-detail-content bt-visible">';
        html += '<div class="bt-detail-top">';
        html += '<table class="bt-detail-table"><thead><tr>';
        html += "<th>" + escapeHTML(S.detailC) + "</th><th>" + escapeHTML(S.detailTtft) +
                "</th><th>" + escapeHTML(S.detailTps) + "</th><th>" + escapeHTML(S.detailStatus) + "</th>";
        html += "</tr></thead><tbody>";

        entry.data_points.forEach(function (dp) {
          var passes = meetsTargets(dp);
          /* Focusable and Enter/Space-activated, so it has to announce itself
             as a control. The label carries the concurrency, because one
             shared title on every row tells a screen reader nothing. */
          html += '<tr class="bt-dp-row" data-tps="' + dp.tps + '" data-c="' + dp.c +
            '" tabindex="0" role="button" aria-label="' +
            escapeHTML(S.previewRowLabel(dp.c)) + '">';
          /* Colour each metric on its own, so a FAIL shows which of the two
             caused it rather than only that one of them did. The title gives
             the same answer in words, because colour alone would not. */
          var dpTtftOk = ttftMeets(dp.ttft_ms);
          var dpTpsOk = tpsMeets(dp.tps);
          html += "<td>" + dp.c + "</td>";
          html += '<td class="' + (dpTtftOk ? "bt-dp-good" : "bt-dp-bad") + '" title="' +
            escapeHTML(dpTtftOk ? S.targetMet : S.targetNotMet) + '">' +
            (dp.ttft_ms != null ? fmt(dp.ttft_ms, 0) : "—") + "</td>";
          html += '<td class="' + (dpTpsOk ? "bt-dp-good" : "bt-dp-bad") + '" title="' +
            escapeHTML(dpTpsOk ? S.targetMet : S.targetNotMet) + '">' +
            fmt(dp.tps, 2) + "</td>";
          html += '<td class="' + (passes ? "bt-detail-pass" : "bt-detail-fail") + '">' +
            escapeHTML(passes ? S.pass : S.fail) + "</td></tr>";
        });

        html += "</tbody></table>";

        /* The same speed preview as the targets panel, but driven by whichever
           measured point the reader picks — so the number in the table turns
           into something they can feel. */
        html += '<div class="bt-detail-preview">';
        html += '<div class="bt-tps-preview-head"><span class="bt-tps-preview-title">' +
          escapeHTML(S.previewRowHeading) + '</span>' +
          '<span class="bt-preview-sub" data-rowsub="' + escapeHTML(entry.id) + '"></span></div>';
        html += '<div class="bt-preview-text" data-rowtext="' + escapeHTML(entry.id) + '"></div>';
        html += '<p class="bt-preview-note">' + escapeHTML(S.previewPick) + "</p>";
        html += "</div>";
        html += "</div>";

        html += capBreakdown(entry);

        var deviceStr = escapeHTML(entry.device);
        if (entry.tp != null && entry.tp !== 1) {
          deviceStr += " (TP=" + entry.tp;
          if (entry.dp != null && entry.dp !== 1) deviceStr += ", DP=" + entry.dp;
          deviceStr += ")";
        } else if (entry.dp != null && entry.dp !== 1) {
          deviceStr += " (DP=" + entry.dp + ")";
        }
        var headerParts = [escapeHTML(entry.model), deviceStr, escapeHTML(entry.quantization), escapeHTML(entry.engine)];
        if (entry.mtp) headerParts.push("MTP");

        html += '<div class="bt-chart-card" id="bt-chart-card-' + escapeHTML(entry.id) + '">';
        html += '<div class="bt-chart-header">' + headerParts.join(" &middot; ") + "</div>";
        html += '<div class="bt-chart-legend">';
        html += '<span class="bt-legend-item"><span class="bt-legend-swatch" style="background:#2196F3"></span> ' + escapeHTML(S.tpsAxis + S.leftAxis) + "</span>";
        html += '<span class="bt-legend-item"><span class="bt-legend-swatch" style="background:#FF6D00"></span> ' + escapeHTML(S.aggAxis + S.rightAxis) + "</span>";
        html += "</div>";
        html += '<div class="bt-chart-axis-titles">';
        html += '<span class="bt-axis-title-left" style="color:#2196F3">' + escapeHTML(S.tpsAxis) + "</span>";
        html += '<span class="bt-axis-title-right" style="color:#FF6D00">' + escapeHTML(S.aggAxis) + "</span>";
        html += "</div>";
        html += '<div class="bt-chart-canvas-wrap"><canvas id="bt-chart-' + escapeHTML(entry.id) + '"></canvas></div>';
        html += '<div class="bt-chart-x-title">' + escapeHTML(S.xTitle) + "</div>";
        html += '<div class="bt-chart-footer"><span></span>';
        html += '<span class="bt-chart-logo"><img src="' + (logoPath || "logo.png") + '" alt="OpenZeka" class="bt-chart-logo-img" style="height:72px;width:auto;"></span>';
        html += "</div></div>";

        if (entry.notes) {
          html += '<div class="bt-detail-notes"><strong>' + escapeHTML(S.notes) + "</strong> " + escapeHTML(entry.notes) + "</div>";
        }

        html += '<button type="button" class="bt-chart-download" data-download="' + escapeHTML(entry.id) + '">' + escapeHTML(S.downloadChart) + "</button>";
        html += "</div></td></tr>";
      }
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

    /* The whole row is the control, not just the arrow at the end. */
    function toggleRow(id) {
      expanded[id] = !expanded[id];
      /* Chart.js keeps a live registry entry and resize hook per instance, so
         a chart whose row just closed has to be told to let go. */
      if (!expanded[id]) destroyChart(id);
      if (expanded[id]) history.replaceState(null, "", "#" + id);
      else history.replaceState(null, "", window.location.pathname + window.location.search);
      renderTable(container);
      var back = container.querySelector('[data-id="' + CSS.escape(id) + '"]');
      if (back) back.focus();
    }

    wrap.querySelectorAll("tr.bt-row").forEach(function (tr) {
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
      if (expanded[entry.id]) {
        renderChart(entry, container);
        wireRowPreview(entry, container);
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

  /* ── Chart Rendering ── */

  function renderChart(entry, container) {
    var canvas = container.querySelector("#bt-chart-" + CSS.escape(entry.id));
    if (!canvas) return;
    if (typeof Chart === "undefined") return;

    if (chartInstances[entry.id]) chartInstances[entry.id].destroy();

    var cValues = entry.data_points.map(function (dp) { return dp.c; });
    var tpsData = entry.data_points.map(function (dp) { return dp.tps; });
    var aggData = entry.data_points.map(function (dp) { return dp.tps * dp.c; });

    var tpsColor = "#2196F3";
    var aggColor = "#FF6D00";

    chartInstances[entry.id] = new Chart(canvas, {
      type: "line",
      data: {
        labels: cValues.map(function (c) { return "C=" + c; }),
        datasets: [
          { label: "TPS", data: tpsData, yAxisID: "y_tps", borderColor: tpsColor,
            backgroundColor: tpsColor, pointRadius: 5, pointHoverRadius: 7, tension: 0 },
          { label: S.aggLabel, data: aggData, yAxisID: "y_agg", borderColor: aggColor,
            backgroundColor: aggColor, pointRadius: 5, pointHoverRadius: 7, tension: 0 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        scales: {
          x: { type: "category", grid: { color: "#eeeeee" }, ticks: { font: { size: 12 } } },
          y_tps: { position: "left", beginAtZero: true, ticks: { color: tpsColor, font: { size: 12 } },
                   grid: { color: "#eeeeee" }, title: { display: false } },
          y_agg: { position: "right", beginAtZero: true, ticks: { color: aggColor, font: { size: 12 } },
                   grid: { drawOnChartArea: false }, title: { display: false } }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                var label = ctx.dataset.label || "";
                if (label === "TPS") return "TPS: " + ctx.parsed.y.toFixed(2) + " tok/s";
                return S.aggLabel + ": " + Math.round(ctx.parsed.y) + " tok/s";
              }
            }
          },
          datalabels: {
            align: "bottom",
            anchor: "end",
            color: function (ctx) { return ctx.datasetIndex === 0 ? tpsColor : aggColor; },
            font: { weight: "bold", size: 11 },
            formatter: function (value, ctx) {
              if (value === null) return "";
              return ctx.datasetIndex === 0 ? value.toFixed(1) : Math.round(value);
            }
          }
        }
      }
    });
  }

  function destroyChart(entryId) {
    if (chartInstances[entryId]) {
      chartInstances[entryId].destroy();
      delete chartInstances[entryId];
    }
  }

  function downloadChart(entryId, container) {
    var card = container.querySelector("#bt-chart-card-" + CSS.escape(entryId));
    if (!card) return;

    if (typeof html2canvas === "undefined") {
      /* Fallback: download just the canvas */
      var canvas = container.querySelector("#bt-chart-" + CSS.escape(entryId));
      if (!canvas) return;
      var link = document.createElement("a");
      link.download = entryId + S.chartFileSuffix;
      link.href = canvas.toDataURL("image/png");
      link.click();
      return;
    }

    html2canvas(card, { backgroundColor: "#ffffff", scale: 4 }).then(function (canvas) {
      var link = document.createElement("a");
      link.download = entryId + S.chartFileSuffix;
      link.href = canvas.toDataURL("image/png");
      link.click();
    });
  }

  /* ── Deep Linking ── */

  function handleHashOnLoad(container) {
    var hash = window.location.hash.substring(1);
    if (!hash) return;
    var found = rawData.benchmarks.some(function (b) { return b.id === hash; });
    if (found) {
      expanded[hash] = true;
      renderTable(container);
      setTimeout(function () {
        var row = container.querySelector('[data-id="' + CSS.escape(hash) + '"]');
        if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 200);
    }
  }

  function handleHashChange(container) {
    var hash = window.location.hash.substring(1);
    /* A hash that is not one of our entry ids belongs to something else on the
       page — a just-the-docs heading anchor, for example. Leave the table alone
       rather than collapsing whatever the reader has open. */
    if (hash && !rawData.benchmarks.some(function (b) { return b.id === hash; })) {
      return;
    }
    for (var id in expanded) {
      if (expanded.hasOwnProperty(id) && expanded[id] && id !== hash) {
        expanded[id] = false;
        destroyChart(id);
      }
    }
    if (hash) {
      var found = rawData.benchmarks.some(function (b) { return b.id === hash; });
      if (found) expanded[hash] = true;
    }
    renderTable(container);
    if (hash) {
      setTimeout(function () {
        var row = container.querySelector('[data-id="' + CSS.escape(hash) + '"]');
        if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 200);
    }
  }

  /* ── Bootstrap ── */

  if (typeof window !== "undefined") {
    window.BenchmarkTable = { init: init };
  }

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", function () {
      init();
    });
  }
})();
