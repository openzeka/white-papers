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
    lang: "tr",

    loading: "Benchmark verileri yükleniyor…",
    loadFailed: "Benchmark verileri yüklenemedi: ",

    /* Controls */
    concurrency: "Kamera",
    resolution: "Görüntü Boyutu",
    device: "Cihaz",
    model: "Model",
    quant: "Kuantizasyon",
    engine: "Inference Engine",
    all: "Tümü",
    showAll: "Tümünü Göster",
    searchModels: "Model ara…",
    resetFilters: "Tüm Filtreleri Sıfırla",

    minParams: "Min. Parametre",
    maxResponse: "Maks. Yanıt Süresi",
    noLimit: "Sınırsız",
    paramsAll: "Tüm boyutlar",
    minCameras: "Min. Kamera",
    cameras: "kamera",
    atC: function (c, res, n) { return " (" + c + " kamera, " + res + ", " + n + " görüntü)"; },

    /* Performance target / assumptions */
    targetsHeading: "Performans Hedefi ve Varsayımlar",
    targetsIntro: "Bu değerler kabul edilebilir performansı ve her kameranın ne gönderdiğini belirler. Satır gizlemezler; her satırın yanıt süresini, Maks. kamera değerini ve Yanıt sütununun yeşil ve kırmızı renklendirmesini yeniden hesaplarlar.",
    groupResponse: "Yanıt süresi",
    groupResponseIntro: "Her kamera, önceki isteği yanıtlanır yanıtlanmaz sıradaki isteğini gönderir; bu yüzden kamera sayısı, işlenmekte olan istek sayısıdır. Maks. kamera, her kameranın yanıtının hedef süre içinde başladığı en yüksek ölçülmüş kamera sayısıdır.",
    responseTarget: "Maksimum Yanıt Süresi Hedefi (sn)",
    imagesAssumption: "Kamera Başına Görüntü",

    /* Table */
    colModel: "Model",
    colParams: "Parametre",
    colDevice: "Cihaz",
    colQuant: "Kuantizasyon",
    colTps: "TPS",
    colResponse: "Yanıt",
    colMaxCams: "Maks. kamera",
    colEngine: "Inference Engine",
    atCol: function (c) { return " @ " + c + " kam."; },
    secUnit: " (sn)",
    matching: "Eşleşen Yapılandırmalar",
    matchingCount: function (shown, total) {
      return "<strong>" + total + "</strong> yapılandırmadan <strong>" + shown + "</strong> tanesi";
    },
    noMatch: "Mevcut filtrelerle eşleşen yapılandırma yok.",
    notMeasured: "Bu görüntü boyutu, kamera sayısı ve kamera başına görüntü birleşimiyle ölçülmüş bir yapılandırma yok. Birden fazla kamera, 480p, 720p ve 1080p'de kamera başına bir görüntüyle ölçüldü; 2K ve kamera başına birden fazla görüntü yalnızca tek kamerayla. Soluk düğmeler ölçümü olmayan birleşimleri gösterir.",
    targetMet: "Hedef Karşılandı — yanıt, yanıt süresi hedefiniz içinde başlar.",
    targetNotMet: "Hedef Karşılanmadı — yanıtın başlaması, yanıt süresi hedefinizden uzun sürer.",
    viewDetails: "Ayrıntıları Görüntüle — bu yapılandırmanın kamera sayısına göre ölçümlerini, sonuçların açıklamasını ve grafiğini gösterir.",
    maxAtLeast: function (c) { return "En az " + c + ": test edilen en yüksek sayı olan " + c + " kamerada bile her kamera zamanında yanıt aldı; gerçek üst sınıra ulaşılmadı."; },

    /* Expanded row */
    detailC: "Kamera", detailTps: "TPS (tok/s)", detailResponse: "Yanıt (sn)", detailStatus: "Durum",
    pass: "BAŞARILI", fail: "BAŞARISIZ",
    sweepAt: function (res, dims, n) { return "Kamera başına " + (n === 1 ? "bir " + res + " görüntü" : n + " adet " + res + " görüntü") + " (" + dims + ")"; },
    explainedHeading: "Benchmark sonuçlarının açıklaması",
    oneOnly: "Yalnızca tek kamerayla ölçüldü; bu yüzden değer 1'den yüksek olamaz — cihaz daha fazlasına hizmet edebilir.",
    downloadChart: "Grafiği İndir",
    chartFileSuffix: "-grafik.png",
    chartTitle: function (n) { return "Kamera eklendikçe yanıt süresi · kamera başına " + n + " görüntü"; },
    chartTarget: function (t) { return "Hedef " + t + " sn"; },
    yTitle: "Yanıt süresi (sn)",
    xTitle: "Kamera sayısı",


    /* Tooltips */
    tip: {
      model: "<strong>Model</strong><p>Sunulan görüntü-dil modeli.</p><p>Bir satır bir kurulumun tamamıdır; bu yüzden aynı model farklı donanım, biçim ya da engine ile birkaç satırda görünür.</p>",
      params: "<strong>Parametre</strong><p>Görüntü kodlayıcı dahil, modelin yayımlanmış toplam ağırlık sayısı.</p><p>Mixture-of-experts modellerde bu, her token için etkin olan kısım değil toplamdır; çünkü tamamı bellekte tutulur.</p>",
      device: "<strong>Cihaz</strong><p>Çalıştırmanın kullandığı donanım: bir Jetson modülü ya da bir RTX PRO 6000 Blackwell iş istasyonu GPU'su. Max-Q sürümü aynı çipin 300 W'lık sürümüdür.</p><p>Jetson Orin NX'te 16 GB, Jetson AGX Orin'de 32 GB bellek vardır ve CPU ile GPU tarafından paylaşılır; RTX PRO 6000'de 96 GB vardır.</p>",
      quant: "<strong>Kuantizasyon</strong><p>Ağırlıkların saklandığı sayı biçimi.</p><p>BF16 tam hassasiyettir, FP8 8 bit, NVFP4 4 bit kullanır. Q8_0, Q4_K_M ve Q4_0, llama.cpp için ağırlık başına yaklaşık 8 ve 4 bitlik GGUF biçimleridir. Daha az bit, daha az bellek ve genellikle daha çok hız demektir; kalitede bir miktar risk taşır.</p>",
      engine: "<strong>Inference Engine</strong><p>Modeli yükleyip istekleri zamanlayan sunucu yazılımı: Hugging Face checkpoint'leri için vLLM, GGUF dosyaları için llama.cpp.</p><p>Hıza donanım kadar etki eder: aynı model aynı cihazda engine'ler arasında ölçülebilir biçimde farklılaşabilir.</p>",
      tps: "<strong>TPS — saniyedeki token</strong><p>Seçili kamera sayısında, başladıktan sonra bir kameranın yanıtının yazılma hızı. Bir token kabaca bir kelimenin dörtte üçüdür.</p><p>Toplam değil, kamera başınadır. Maks. kamera yanıt süresine göre belirlenir; TPS ise daha uzun bir yanıtın ardından ne kadar süreceğini gösterir. Yüksek olması iyidir.</p>",
      response: "<strong>Yanıt süresi</strong><p>Seçili kamera sayısında, görüntü boyutunda ve görüntü sayısında bir kameranın yanıtı başlayana kadar beklediği süre, saniye cinsinden. İlk token süresi (TTFT) olarak ölçülür.</p><p>Bir görüntü-dil modelinde bu sürenin çoğu görüntüleri okumaktır; bu yüzden görüntülerin boyutu ve sayısıyla, cihazı paylaşan kamera sayısıyla birlikte artar. Yeşil, hedefinizin içinde demektir. Düşük olması iyidir.</p>",
      maxCams: "<strong>Maks. kamera</strong><p>Seçili görüntü boyutunda ve görüntü sayısında, yanıt süresinin hedefinizi karşıladığı en yüksek ölçülmüş kamera sayısı.</p><p>Her kamera, önceki isteği yanıtlanır yanıtlanmaz sıradaki isteğini gönderir; yani her zaman işlenmekte olan bir isteği vardır: eşzamanlı istek sayısı kamera sayısıdır.</p><p>Artı işareti (16+), test edilen en yüksek sayının bile hedefi karşıladığı, gerçek üst sınırın daha yüksek olduğu anlamına gelir. 0, tek bir kameranın bile zamanında yanıt almadığı demektir.</p>",

      fConcurrency: "<strong>Kamera</strong><p>Aynı anda istek gönderen kamera sayısı — sistemin ölçüldüğü eşzamanlılık.</p><p>Yanıt ve TPS sütunlarının hangi ölçümü göstereceğini seçer. Bu sayıda ölçülmemiş satırlar gizlenir.</p>",
      fResolution: "<strong>Görüntü Boyutu</strong><p>Bir kameranın gönderdiği her görüntünün boyutu: 480p 854×480, 720p 1280×720, 1080p 1920×1080, 2K 2560×1440.</p><p>Maks. kamera dahil tablodaki her sayı bu boyutta okunur. Büyük görüntülerin okunması daha uzun sürer. Bu boyutta ölçülmemiş satırlar gizlenir.</p>",
      fModel: "<strong>Model filtresi</strong><p>Yalnızca seçilen modelleri gösterir. Yan yana karşılaştırmak için birkaçını seçin.</p>",
      fMinParams: "<strong>Minimum Parametre</strong><p>Toplam parametre sayısı bundan küçük olan modelleri gizler.</p><p>Buradaki modeller 2B ile 35B arasında değiştiği için ölçek logaritmiktir.</p>",
      fDevice: "<strong>Cihaz filtresi</strong><p>Yalnızca seçilen donanımdaki çalıştırmaları gösterir. Cihazları doğrudan karşılaştırmak için birkaçını seçin.</p>",
      fQuant: "<strong>Kuantizasyon filtresi</strong><p>Yalnızca seçilen ağırlık biçimlerini gösterir. Karşılaştırmak için ikisini seçin.</p>",
      fEngine: "<strong>Engine filtresi</strong><p>Yalnızca seçilen engine ile sunulan çalıştırmaları gösterir.</p>",
      fMaxResp: "<strong>Maksimum Yanıt Süresi</strong><p>Seçili kamera sayısında, görüntü boyutunda ve görüntü sayısında yanıtı bundan geç başlayan yapılandırmaları gizler.</p>",
      fMinCams: "<strong>Minimum Kamera</strong><p>Yanıt süresi hedefinizde bundan az kameraya yetişen yapılandırmaları gizler.</p>",

      aImages: "<strong>Kamera Başına Görüntü</strong><p>Her isteğin kaç görüntü taşıdığı — tek bir anlık görüntü ya da aynı kameranın birlikte gönderilen birkaç karesi; video, görüntü-dil modellerine çoğu zaman böyle gönderilir. Varsayılan 1.</p><p>Yanıt başlamadan önce her görüntü okunur; bu yüzden daha fazla görüntü daha uzun yanıt süresi demektir. İstek başına birden fazla görüntü yalnızca tek kamerayla ölçüldü.</p>",
      aResponse: "<strong>Maksimum Yanıt Süresi Hedefi</strong><p>Bir kameranın yanıtının başlaması için bekleyebileceği en uzun süre, saniye cinsinden.</p><p>Düşürmek Maks. kamera değerini düşürebilir.</p>",
      reset: "<strong>Tüm Filtreleri Sıfırla</strong><p>Bütün filtreleri temizler; görüntü boyutunu, kamera sayısını, hedefi ve kamera başına görüntü sayısını varsayılana döndürür.</p>"
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
    "Jetson Orin NX": 0,
    "Jetson AGX Orin": 1,
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

    /* The image size and the number of cameras frame every number in the
       table, the way concurrency does in the LLM explorer. */
    var work = '<div class="bt-filter-row bt-filter-row-perf">';
    work += '<span class="bt-filter-label">' + escapeHTML(S.resolution) + tip(S.tip.fResolution) + "</span>";
    work += singleGroup("bt-filter-res", "res", allRes, state.res, function (r) { return r; });
    work += "</div>";
    html += work;
    html += row(S.concurrency, S.tip.fConcurrency,
      singleGroup("bt-filter-concurrency", "conc", allConcurrency, state.concurrency, function (c) { return String(c); }));

    var sliders = '<div class="bt-filter-row bt-filter-row-perf">';
    sliders += '<div class="bt-perf-item"><span class="bt-filter-label bt-inline-label">' +
      escapeHTML(S.maxResponse) + tip(S.tip.fMaxResp) + "</span>" +
      '<div class="bt-slider-group bt-slider-perf"><span class="bt-slider-value" id="bt-max-resp-val"></span>' +
      '<input type="range" id="bt-max-resp" min="1" max="' + RESP_SLIDER_MAX + '" value="' + RESP_SLIDER_MAX + '" step="1"></div></div>';
    sliders += '<div class="bt-perf-item"><span class="bt-filter-label bt-inline-label">' +
      escapeHTML(S.minCameras) + tip(S.tip.fMinCams) + "</span>" +
      '<div class="bt-slider-group bt-slider-perf"><span class="bt-slider-value" id="bt-min-cams-val"></span>' +
      '<input type="range" id="bt-min-cams" min="0" max="' + (allConcurrency[allConcurrency.length - 1] || 16) +
      '" value="0" step="1"></div></div>';
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
    container.querySelector("#bt-min-cams-val").textContent =
      container.querySelector("#bt-min-cams").value + " " + S.cameras;
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
    container.querySelector("#bt-min-cams").value = 0;
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

  var SLIDERS = ["#bt-max-resp", "#bt-min-cams", "#bt-min-params"];

  function getFilteredEntries(container) {
    if (only) return rawData.benchmarks.filter(function (e) { return e.id === only; });
    var maxResp = sliderToResp(parseInt(container.querySelector("#bt-max-resp").value, 10));
    var minCams = parseInt(container.querySelector("#bt-min-cams").value, 10);
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
      if (maxCams(entry) < minCams) return false;
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
