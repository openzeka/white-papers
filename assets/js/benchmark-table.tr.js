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
    lang: "tr",

    loading: "Benchmark verileri yükleniyor…",
    loadFailed: "Benchmark verileri yüklenemedi: ",

    /* Controls */
    concurrency: "Eşzamanlılık (Concurrency)",
    device: "Cihaz",
    model: "Model",
    quant: "Kuantizasyon",
    engine: "Inference Engine",
    mtp: "MTP",
    all: "Tümü",
    showAll: "Tümünü Göster",
    searchModels: "Model ara…",
    noMtp: "MTP Yok",
    withMtp: "MTP Var",
    resetFilters: "Tüm Filtreleri Sıfırla",

    minTps: "Min. TPS",
    maxTtft: "Maks. TTFT",
    noLimit: "Sınırsız",
    minChatUsers: "Min. Chat Kullanıcı Kapasitesi (kişi)",
    minAgenticUsers: "Min. Agentic Kullanıcı Kapasitesi (kişi)",
    atC: function (c) { return " (C=" + c + ")"; },

    /* Performance targets / assumptions */
    targetsHeading: "Performans Hedefleri ve Kapasite Varsayımları",
    ttftThreshold: "Maksimum TTFT Hedefi (ms)",
    tpsThreshold: "Minimum TPS Hedefi (tok/s)",
    chatMultiplier: "Chat Kullanım Çarpanı",
    agenticMultiplier: "Agentic Kullanım Çarpanı",

    /* Table */
    colModel: "Model",
    colDevice: "Cihaz",
    colQuant: "Kuantizasyon",
    colTps: "TPS",
    colTtft: "TTFT",
    colMaxC: "Maks C",
    colChat: "Tahmini Chat Kapasitesi",
    colAgentic: "Tahmini Agentic Kapasitesi",
    colTp: "TP", colDp: "DP", colPp: "PP",
    colEngine: "Inference Engine",
    colMtp: "MTP",
    yes: "Evet",
    users: "kişi",
    matching: "Eşleşen Yapılandırmalar",
    matchingCount: function (shown, total) {
      return "<strong>" + total + "</strong> yapılandırmadan <strong>" + shown + "</strong> tanesi";
    },
    noMatch: "Mevcut filtrelerle eşleşen yapılandırma yok.",
    targetMet: "Hedef karşılanıyor — bu değer mevcut performans hedefinizi karşılıyor.",
    targetNotMet: "Hedef karşılanmıyor — bu değer mevcut performans hedefinizi karşılamıyor.",
    viewDetails: "Ayrıntıları Göster — bu yapılandırmanın tüm eşzamanlılık taramasını, grafiğini ve ek bilgilerini gösterir.",

    /* Expanded row */
    detailC: "C", detailTtft: "TTFT (ms)", detailTps: "TPS (tok/s)", detailStatus: "Durum",
    pass: "BAŞARILI", fail: "BAŞARISIZ",
    notes: "Notlar:",
    downloadChart: "Grafiği İndir",
    chartFileSuffix: "-grafik.png",
    tpsAxis: "TPS (tok/s)",
    aggAxis: "Toplam TPS (tok/s)",
    aggLabel: "Toplam TPS",
    leftAxis: " — sol eksen",
    rightAxis: " — sağ eksen",
    xTitle: "Eşzamanlı İstek Sayısı",

    /* TPS speed preview */
    previewHeading: "Bu hız nasıl görünür",
    previewSubtitle: function (n) { return "örnek metin yaklaşık " + n + " token/s hızında"; },
    previewDisclaimer: "Bu gösterim, seçilen TPS değerini görselleştirmek için hazırlanmış yaklaşık bir simülasyondur. Gerçek yanıt deneyimi TTFT, çıktı uzunluğu ve uygulama davranışına göre değişebilir.",
    sampleText: "Bir büyük dil modelini kendi donanımınızda çalıştırmak, yanıt hızının hızlandırıcıya, kuantizasyon biçimine ve sistemi aynı anda kaç kişinin kullandığına bağlı olması demektir. Düşük token hızlarında metin kelime kelime belirir ve bekleme fark edilir hâle gelir. Hız arttıkça yanıt, çoğu kişinin okuyabileceğinden daha çabuk geldiği için arayüz yavaş değil anlık hissettirmeye başlar.",

    /* Tooltips */
    tip: {
      model: "<strong>Model</strong><p>Benchmark'ta kullanılan LLM'yi gösterir.</p><p>Aynı model farklı kuantizasyon veya çalışma yapılandırmalarıyla test edilmişse tabloda birden fazla satırda görünebilir.</p>",
      device: "<strong>Cihaz</strong><p>Benchmark'ın çalıştırıldığı donanımı ve kullanılan cihaz sayısını gösterir.</p><p>Örneğin 4× DGX Spark, yapılandırmada dört DGX Spark kullanıldığı anlamına gelir.</p>",
      quant: "<strong>Kuantizasyon</strong><p>Model ağırlıklarının kullanılan hassasiyet veya kuantizasyon biçimini gösterir. Örneğin BF16, FP8 ve NVFP4.</p><p>Daha düşük hassasiyet genellikle daha düşük bellek kullanımı sağlar ve çıkarım performansını etkileyebilir.</p>",
      tps: "<strong>TPS — Tokens per Second</strong><p>Seçilen eşzamanlılık seviyesinde bir isteğin token üretim hızını gösterir.</p><p><em>Daha yüksek değer daha iyidir.</em></p><p>Eşzamanlılık seçimini değiştirdiğinizde bu sütundaki değer ilgili test noktasına göre güncellenir.</p>",
      ttft: "<strong>TTFT — Time to First Token</strong><p>Bir istek gönderildikten sonra ilk tokenın gelmesine kadar geçen süreyi gösterir.</p><p><em>Daha düşük değer daha iyidir.</em></p><p>Eşzamanlılık seçimini değiştirdiğinizde bu sütundaki değer ilgili test noktasına göre güncellenir.</p>",
      maxc: "<strong>Maksimum Desteklenen Eşzamanlılık</strong><p>Bu yapılandırmanın, performans hedeflerinizin ikisini de karşılamaya devam ederken <em>aynı anda</em> kaç isteğe hizmet verebildiğini gösterir.</p><p>Kişi sayısını değil, eşzamanlı istek sayısını ifade eder. Bir istek, o anda süren bir üretim demektir.</p><p>Hedefleri sıkılaştırmak bu sayıyı düşürür.</p>",
      chat: "<strong>Tahmini Chat Kapasitesi</strong><p>Bu yapılandırmayı etkileşimli sohbet için aynı anda yaklaşık kaç <em>kişinin</em> kullanabileceğini gösterir.</p><p>Maks C'den yüksektir: chat kullanıcıları zamanın çoğunda boştadır — okur, düşünür, yazar — bu yüzden birkaç kişi tek bir eşzamanlı istek yuvasını paylaşır.</p><p>Ölçülmüş bir değer değil, Chat Kullanım Çarpanınıza dayanan bir tahmindir.</p>",
      agentic: "<strong>Tahmini Agentic Kapasitesi</strong><p>Modelin çok adımlı görevleri ve araç çağrılarını kullanıcı adına yürüttüğü agentic kullanımda, bu yapılandırmanın yaklaşık kaç <em>kişiyi</em> destekleyebileceğini gösterir.</p><p>Chat değerinden düşüktür: bir agentic kullanıcı istek yuvasını çok daha uzun süre meşgul tutar.</p><p>Ölçülmüş bir değer değil, Agentic Kullanım Çarpanınıza dayanan bir tahmindir.</p>",
      par: "<strong>Paralellik Yapılandırması</strong><p>Modelin birden fazla GPU veya cihaz üzerinde nasıl çalıştırıldığını gösterir.</p><p><strong>TP — Tensor Parallelism:</strong> model hesaplamasını birden fazla GPU'ya dağıtır.</p><p><strong>DP — Data Parallelism:</strong> birden fazla model kopyasının farklı istekleri paralel olarak işlemesini sağlar.</p><p><strong>PP — Pipeline Parallelism:</strong> model katmanlarını farklı GPU veya cihazlara dağıtır.</p><p>— ilgili yöntemin kullanılmadığını gösterir.</p>",
      engine: "<strong>Inference Engine</strong><p>Modeli sunmak için kullanılan çıkarım motorunu gösterir. Örneğin vLLM veya SGLang.</p><p>Aynı model ve donanım farklı inference engine'lerle farklı performans gösterebilir.</p>",
      mtp: "<strong>MTP — Multi-Token Prediction</strong><p>Modelin bir adımda birden fazla token tahmini kullanarak üretimi hızlandırmasına yardımcı olan özelliği gösterir.</p><p>Açık ve kapalı sonuçları karşılaştırarak MTP'nin ilgili yapılandırmadaki etkisini görebilirsiniz.</p>",

      fConcurrency: "<strong>Eşzamanlılık (Concurrency)</strong><p><em>Aynı anda</em> işlenen istek sayısıdır. Kişi sayısı değil, bir yük seviyesidir.</p><p>Değeri artırarak sistemin daha yoğun eşzamanlı yük altında nasıl davrandığını görebilirsiniz.</p><p>Tabloda hangi TPS ve TTFT ölçümlerinin gösterileceğini belirler.</p>",
      fModel: "<strong>Model</strong><p>Tabloda görmek istediğiniz modelleri seçin.</p><p>Birden fazla model seçerek sonuçları yan yana karşılaştırabilirsiniz.</p>",
      fDevice: "<strong>Cihaz</strong><p>Benchmark sonuçlarını belirli donanım veya cihaz yapılandırmalarıyla sınırlar.</p><p>Birden fazla cihaz seçerek donanımları karşılaştırabilirsiniz.</p>",
      fQuant: "<strong>Kuantizasyon</strong><p>Yalnızca seçtiğiniz model hassasiyetlerini veya kuantizasyon biçimlerini gösterir.</p><p>Örneğin yalnızca FP8 ve NVFP4 sonuçlarını seçerek iki formatı karşılaştırabilirsiniz.</p>",
      fMtp: "<strong>MTP</strong><p>MTP kullanılan veya kullanılmayan yapılandırmaları filtreler.</p><p>Her ikisini seçerek MTP'nin performans üzerindeki etkisini karşılaştırabilirsiniz.</p>",
      fMinTps: "<strong>Minimum TPS</strong><p>Tabloda görmek istediğiniz en düşük token üretim hızını belirler.</p><p>Değeri artırdıkça filtre daha katı hâle gelir ve daha yavaş yapılandırmalar elenir.</p>",
      fMaxTtft: "<strong>Maksimum TTFT</strong><p>Kabul ettiğiniz en yüksek ilk token bekleme süresini belirler.</p><p>Değeri düşürdükçe filtre daha katı hâle gelir ve ilk yanıtı daha yavaş veren yapılandırmalar elenir.</p>",
      fMinChat: "<strong>Minimum Chat Kapasitesi</strong><p>En az bu kadar chat <em>kullanıcısına</em> hizmet veremeyen yapılandırmaları gizler.</p><p>Eşzamanlı istek sayısıyla değil, kişi sayısıyla ölçülür.</p>",
      fMinAgentic: "<strong>Minimum Agentic Kapasitesi</strong><p>En az bu kadar agentic <em>kullanıcıya</em> hizmet veremeyen yapılandırmaları gizler.</p><p>Eşzamanlı istek sayısıyla değil, kişi sayısıyla ölçülür.</p>",

      aTps: "<strong>Minimum TPS Hedefi</strong><p>Bir yapılandırmanın kabul edilebilir sayılması için sağlaması gereken minimum TPS değeridir.</p><p>Değeri artırmak performans kriterini sıkılaştırır ve Maks C değerini düşürebilir.</p>",
      aTtft: "<strong>Maksimum TTFT Hedefi</strong><p>Bir yapılandırmanın kabul edilebilir sayılması için aşmaması gereken TTFT değeridir.</p><p>Değeri düşürmek performans kriterini sıkılaştırır ve Maks C değerini düşürebilir.</p>",
      aChat: "<strong>Chat Kullanım Çarpanı</strong><p>Tek bir eşzamanlı istek yuvasını kaç chat kullanıcısının paylaşabileceğine dair varsayımınızdır.</p><p>Kullanıcılarınız seyrek istek gönderiyorsa artırın; sürekli aktiflerse azaltın.</p>",
      aAgentic: "<strong>Agentic Kullanım Çarpanı</strong><p>Tek bir eşzamanlı istek yuvasını kaç agentic kullanıcının paylaşabileceğine dair varsayımınızdır.</p><p>Agentic çalışma yuvayı daha uzun süre meşgul tuttuğu için genellikle chat değerinin altındadır.</p>",
      reset: "<strong>Tüm Filtreleri Sıfırla</strong><p>Bütün filtreleri temizler; performans hedeflerini ve kapasite çarpanlarını varsayılan değerlerine döndürür.</p>"
    }
  };

  /* ══════════════════════════════════════════════════════════════════════
     Everything below this line is language-independent.
     ══════════════════════════════════════════════════════════════════════ */

  var DEFAULT_CONFIG = {
    ttft_threshold_ms: 1000,
    tps_threshold: 20,
    chat_multiplier: 4,
    agentic_multiplier: 1.5
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
  var previewTimer = null;

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

  function getMaxC(entry) {
    var maxC = 0;
    for (var i = 0; i < entry.data_points.length; i++) {
      var dp = entry.data_points[i];
      if (
        dp.ttft_ms != null &&
        dp.ttft_ms < config.ttft_threshold_ms &&
        dp.tps > config.tps_threshold
      ) {
        if (dp.c > maxC) maxC = dp.c;
      }
    }
    return maxC;
  }

  function getChatUsers(entry) {
    return Math.floor(getMaxC(entry) * config.chat_multiplier);
  }

  function getAgenticUsers(entry) {
    return Math.floor(getMaxC(entry) * config.agentic_multiplier);
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
    html += buildFilters();
    html += buildTargets();
    html += "</div>";
    html += '<div class="bt-results-count" id="bt-results-count"></div>';
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

    var dev = '<div class="bt-filter-buttons" id="bt-filter-devices">';
    dev += '<button type="button" class="bt-btn bt-active" data-device="__all">' + escapeHTML(S.showAll) + "</button>";
    allDevices.forEach(function (d) {
      dev += '<button type="button" class="bt-btn" data-device="' + escapeHTML(d) + '">' + escapeHTML(d) + "</button>";
    });
    dev += "</div>";
    html += row(S.device, S.tip.fDevice, dev);

    var mod = '<div class="bt-model-filter">';
    mod += '<input type="text" class="bt-model-search" id="bt-model-search" placeholder="' + escapeHTML(S.searchModels) + '">';
    mod += '<div class="bt-model-list" id="bt-model-list">';
    mod += '<label class="bt-model-option"><input type="checkbox" id="bt-model-all" checked> ' + escapeHTML(S.all) + "</label>";
    allModels.forEach(function (m) {
      mod += '<label class="bt-model-option"><input type="checkbox" class="bt-model-cb" data-model="' + escapeHTML(m) + '" checked> ' + escapeHTML(m) + "</label>";
    });
    mod += "</div></div>";
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
    html += '<div class="bt-targets-heading">' + escapeHTML(S.targetsHeading) + "</div>";
    html += '<div class="bt-targets-grid">';
    html += targetItem(S.ttftThreshold, "ttft_threshold_ms", S.tip.aTtft, "");
    html += targetItem(S.tpsThreshold, "tps_threshold", S.tip.aTps, "");
    html += targetItem(S.chatMultiplier, "chat_multiplier", S.tip.aChat, "");
    html += targetItem(S.agenticMultiplier, "agentic_multiplier", S.tip.aAgentic, "");
    html += "</div>";
    html += '<div class="bt-tps-preview">';
    html += '<div class="bt-tps-preview-head"><span class="bt-tps-preview-title">' + escapeHTML(S.previewHeading) +
      '</span><span class="bt-preview-sub" id="bt-preview-sub"></span></div>';
    html += '<div class="bt-preview-text" id="bt-preview-text"></div>';
    html += '<p class="bt-preview-note">' + escapeHTML(S.previewDisclaimer) + "</p>";
    html += "</div>";
    html += "</div>";
    return html;
  }

  function targetItem(label, key, tipHtml, extra) {
    return '<div class="bt-target-item">' +
      '<label for="bt-assump-' + key + '">' + escapeHTML(label) + tip(tipHtml) + "</label>" +
      '<input type="number" id="bt-assump-' + key + '" value="' + config[key] + '" step="0.1" min="0">' +
      extra + "</div>";
  }

  /* ── Wiring ── */

  function wireTargets(container) {
    ["ttft_threshold_ms", "tps_threshold", "chat_multiplier", "agentic_multiplier"].forEach(function (key) {
      var input = container.querySelector("#bt-assump-" + key);
      input.addEventListener("input", function () {
        var v = parseFloat(input.value);
        if (isNaN(v) || v < 0) return;
        config[key] = v;
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

    ["#bt-min-tps", "#bt-max-ttft", "#bt-min-chat", "#bt-min-agentic"].forEach(function (sel) {
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

    resetConfig();
    ["ttft_threshold_ms", "tps_threshold", "chat_multiplier", "agentic_multiplier"].forEach(function (k) {
      container.querySelector("#bt-assump-" + k).value = config[k];
    });

    expanded = {};
    syncSliderLabels(container);
    renderTable(container);
  }

  /* ── Tooltips ── */

  function wireTooltips(container) {
    var tipEl = container.querySelector("#bt-tooltip");
    var openBtn = null;

    function show(btn) {
      tipEl.innerHTML = btn.getAttribute("data-tip");
      tipEl.hidden = false;
      var r = btn.getBoundingClientRect();
      var cr = container.getBoundingClientRect();
      tipEl.style.top = (r.bottom - cr.top + 8) + "px";
      var left = r.left - cr.left;
      /* keep the bubble inside the widget on narrow screens */
      var maxLeft = container.clientWidth - tipEl.offsetWidth - 8;
      if (left > maxLeft) left = Math.max(8, maxLeft);
      tipEl.style.left = left + "px";
      openBtn = btn;
    }

    function hide() {
      tipEl.hidden = true;
      openBtn = null;
    }

    /* Tap toggles on touch devices; hover and keyboard focus cover the rest. */
    container.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest(".bt-tip") : null;
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        if (openBtn === btn) hide();
        else show(btn);
        return;
      }
      if (!e.target.closest || !e.target.closest("#bt-tooltip")) hide();
    });

    container.addEventListener("mouseover", function (e) {
      var btn = e.target.closest ? e.target.closest(".bt-tip") : null;
      if (btn) show(btn);
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
    var input = container.querySelector("#bt-assump-tps_threshold");

    function currentTps() {
      var v = parseFloat(input.value);
      return (isNaN(v) || v <= 0) ? 1 : v;
    }

    /* The preview is always on: it restates the selected target as a speed the
       reader can feel, and restarts whenever that target changes. */
    function run() {
      var n = currentTps();
      container.querySelector("#bt-preview-sub").textContent =
        S.previewSubtitle(Math.round(n * 10) / 10);
      stream(container.querySelector("#bt-preview-text"), n);
    }

    input.addEventListener("input", run);
    run();
  }

  /* Approximate token streaming: chop the sample into word-sized pieces and
     reveal them at the selected rate. Not a real tokenizer — just enough that
     the difference between 5 and 50 tok/s is obvious. */
  function stream(el, tps) {
    if (previewTimer) { clearTimeout(previewTimer); previewTimer = null; }
    var tokens = S.sampleText.match(/\S+\s*/g) || [];
    var i = 0;
    el.textContent = "";
    el.classList.add("bt-streaming");
    var delay = 1000 / tps;

    function step() {
      /* Above ~60 tok/s a timer cannot keep up, so emit several tokens per
         tick instead of throttling. 100 tok/s then really does look near
         instant rather than capped at the timer floor. */
      var perTick = delay < 16 ? Math.ceil(16 / delay) : 1;
      for (var k = 0; k < perTick && i < tokens.length; k++) {
        el.textContent += tokens[i++];
      }
      if (i < tokens.length) {
        previewTimer = setTimeout(step, Math.max(16, delay));
      } else {
        /* hold the finished text briefly, then run it again */
        previewTimer = setTimeout(function () { stream(el, tps); }, 1600);
      }
    }
    step();
  }

  /* ── Filtering ── */

  function getFilteredEntries(container) {
    var minTps = parseInt(container.querySelector("#bt-min-tps").value, 10);
    var maxTtft = parseInt(container.querySelector("#bt-max-ttft").value, 10);
    var minChat = parseInt(container.querySelector("#bt-min-chat").value, 10);
    var minAgentic = parseInt(container.querySelector("#bt-min-agentic").value, 10);

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
      countEl.innerHTML = '<span class="bt-count-label">' + escapeHTML(S.matching) + "</span> " +
        S.matchingCount(entries.length, rawData.benchmarks.length);
    }

    var wrap = container.querySelector("#bt-table-wrap");
    if (entries.length === 0) {
      wrap.innerHTML = '<div class="bt-empty">' + escapeHTML(S.noMatch) + "</div>";
      return;
    }

    var c = state.concurrency;
    var cols = [
      { key: "model",        label: S.colModel,   t: S.tip.model,   sortable: true,  num: false },
      { key: "device",       label: S.colDevice,  t: S.tip.device,  sortable: true,  num: false },
      { key: "quantization", label: S.colQuant,   t: S.tip.quant,   sortable: true,  num: false },
      { key: "tps",          label: S.colTps + " @ C=" + c,  t: S.tip.tps,  sortable: true, num: true },
      { key: "ttft",         label: S.colTtft + " @ C=" + c, t: S.tip.ttft, sortable: true, num: true },
      { key: "maxc",         label: S.colMaxC,    t: S.tip.maxc,    sortable: true,  num: true  },
      { key: "chat",         label: S.colChat,    t: S.tip.chat,    sortable: true,  num: true  },
      { key: "agentic",      label: S.colAgentic, t: S.tip.agentic, sortable: true,  num: true  },
      { key: "tp",           label: S.colTp,      t: S.tip.par,     sortable: true,  num: true  },
      { key: "dp",           label: S.colDp,      t: S.tip.par,     sortable: true,  num: true  },
      { key: "pp",           label: S.colPp,      t: S.tip.par,     sortable: true,  num: true  },
      { key: "engine",       label: S.colEngine,  t: S.tip.engine,  sortable: true,  num: false },
      { key: "mtp",          label: S.colMtp,     t: S.tip.mtp,     sortable: true,  num: false },
      { key: "expand",       label: "",           t: null,          sortable: false, num: false }
    ];

    var html = '<table class="bt-table"><thead><tr>';
    cols.forEach(function (col) {
      var classes = [];
      if (col.sortable) {
        classes.push("bt-sortable");
        if (sortCol === col.key) classes.push(sortDir === "asc" ? "bt-sorted-asc" : "bt-sorted-desc");
      } else {
        classes.push("bt-no-sort");
      }
      if (col.num) classes.push("bt-th-num");
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

      html += "<td>" + escapeHTML(entry.model) + "</td>";
      html += "<td>" + escapeHTML(entry.device) + "</td>";
      html += "<td>" + escapeHTML(entry.quantization) + "</td>";

      var tpsCls = "bt-num", tpsTitle = "";
      if (tps !== null) {
        var tpsOk = tps >= config.tps_threshold;
        tpsCls += tpsOk ? " bt-good" : " bt-bad";
        tpsTitle = ' title="' + escapeHTML(tpsOk ? S.targetMet : S.targetNotMet) + '"';
      }
      html += '<td class="' + tpsCls + '"' + tpsTitle + ">" + fmt(tps, 2) + "</td>";

      var ttftCls = "bt-num", ttftTitle = "";
      if (ttft !== null) {
        var ttftOk = ttft < config.ttft_threshold_ms;
        ttftCls += ttftOk ? " bt-good" : " bt-bad";
        ttftTitle = ' title="' + escapeHTML(ttftOk ? S.targetMet : S.targetNotMet) + '"';
      }
      html += '<td class="' + ttftCls + '"' + ttftTitle + ">" + (ttft !== null ? fmt(ttft, 0) : "—") + "</td>";

      html += '<td class="bt-num">' + (maxC > 0 ? maxC : '<span class="bt-muted">0</span>') + "</td>";
      html += '<td class="bt-num">' + getChatUsers(entry) + "</td>";
      html += '<td class="bt-num">' + getAgenticUsers(entry) + "</td>";
      html += '<td class="bt-num">' + (entry.tp != null && entry.tp !== 1 ? entry.tp : '<span class="bt-muted">—</span>') + "</td>";
      html += '<td class="bt-num">' + (entry.dp != null && entry.dp !== 1 ? entry.dp : '<span class="bt-muted">—</span>') + "</td>";
      html += '<td class="bt-num">' + (entry.pp != null && entry.pp !== 1 ? entry.pp : '<span class="bt-muted">—</span>') + "</td>";
      html += "<td>" + escapeHTML(entry.engine) + "</td>";
      html += entry.mtp ? '<td class="bt-mtp-yes">' + escapeHTML(S.yes) + "</td>" : '<td class="bt-muted">—</td>';
      html += '<td class="bt-expand-cell">' + (isExpanded ? "&#9660;" : "&#9654;") + "</td>";
      html += "</tr>";

      if (isExpanded) {
        html += '<tr class="bt-detail-row"><td colspan="' + cols.length + '">';
        html += '<div class="bt-detail-content bt-visible">';
        html += '<table class="bt-detail-table"><thead><tr>';
        html += "<th>" + escapeHTML(S.detailC) + "</th><th>" + escapeHTML(S.detailTtft) +
                "</th><th>" + escapeHTML(S.detailTps) + "</th><th>" + escapeHTML(S.detailStatus) + "</th>";
        html += "</tr></thead><tbody>";

        entry.data_points.forEach(function (dp) {
          var passes = dp.ttft_ms != null && dp.ttft_ms < config.ttft_threshold_ms && dp.tps > config.tps_threshold;
          html += "<tr><td>" + dp.c + "</td>";
          html += "<td>" + (dp.ttft_ms != null ? fmt(dp.ttft_ms, 0) : "—") + "</td>";
          html += "<td>" + fmt(dp.tps, 2) + "</td>";
          html += '<td class="' + (passes ? "bt-detail-pass" : "bt-detail-fail") + '">' +
            escapeHTML(passes ? S.pass : S.fail) + "</td></tr>";
        });

        html += "</tbody></table>";

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
      if (expanded[entry.id]) renderChart(entry, container);
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
