/* ── Benchmark Table — vanilla JS, zero dependencies ── */
(function () {
  "use strict";

  var rawData = null;
  var config = {
    ttft_threshold_ms: 1000,
    tps_threshold: 20,
    chat_multiplier: 4,
    agentic_multiplier: 1.5,
  };
  var state = {
    devices: [],       // active device filters (empty = all)
    quants: [],         // active quant filters (empty = all)
    mtp: "all",         // "all" | "none" | "with"
    concurrency: 1,
    min_tps: 0,
    max_ttft: 99999,
    min_chat: 0,
    min_agentic: 0,
  };
  var sortCol = "tps";
  var sortDir = "desc";
  var expanded = {};
  var chartInstances = {};
  var logoPath = null;

  var allDevices = [];
  var allModels = [];
  var allQuants = [];
  var allConcurrency = [];

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

    container.innerHTML = '<div class="bt-loading">Benchmark verileri yükleniyor…</div>';

    fetch(dataSource)
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        rawData = data;
        if (data.config) {
          for (var k in data.config) {
            if (data.config.hasOwnProperty(k)) config[k] = data.config[k];
          }
        }
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
          '<div class="bt-error">Benchmark verileri yüklenemedi: ' +
          escapeHTML(err.message) +
          "</div>";
      });
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
      var deviceOrder = {
        "Thor": 0,
        "1× DGX Spark": 1,
        "2× DGX Spark": 2,
        "3× DGX Spark": 3,
        "4× DGX Spark": 4,
        "8× DGX Spark": 5,
        "RTX PRO 6000": 6,
        "DGX B300": 7
      };
      return (deviceOrder[a] != null ? deviceOrder[a] : 99) - (deviceOrder[b] != null ? deviceOrder[b] : 99);
    });
    allModels = Object.keys(mSet).sort();
    allQuants = Object.keys(qSet).sort();
    allConcurrency = Object.keys(cSet).map(Number).sort(function (a, b) { return a - b; });
  }

  /* ── UI Construction ── */

  function buildUI(container) {
    container.className = "bt-container";
    container.innerHTML = "";

    var html = "";

    /* ── Assumptions Panel ── */
    html += '<div class="bt-assumptions" id="bt-assumptions">';
    html += '<button class="bt-assumptions-toggle" id="bt-assumptions-toggle"><span class="bt-arrow">&#9654;</span> Varsayımlar</button>';
    html += '<div class="bt-assumptions-body" id="bt-assumptions-body">';
    html += buildAssumptionItem("TTFT eşiği (ms)", "ttft_threshold_ms", config.ttft_threshold_ms);
    html += buildAssumptionItem("TPS eşiği (tok/s)", "tps_threshold", config.tps_threshold);
    html += buildAssumptionItem("Chat çarpanı", "chat_multiplier", config.chat_multiplier);
    html += buildAssumptionItem("Agentic çarpanı", "agentic_multiplier", config.agentic_multiplier);
    html += '<div class="bt-assumptions-hint">Bu değerlerin değiştirilmesi, her satırın Maks C, Chat Kapasitesi ve Agentic Kapasitesi değerlerini anında yeniden hesaplar.</div>';
    html += "</div></div>";

    /* ── Filters ── */
    html += '<div class="bt-filters" id="bt-filters">';
    html += buildFilters();
    html += "</div>";

    /* ── Results + Table ── */
    html += '<div class="bt-results-count" id="bt-results-count"></div>';
    html += '<div class="bt-table-wrap" id="bt-table-wrap"></div>';

    container.innerHTML = html;

    wireAssumptions(container);
    wireFilters(container);
    renderTable(container);
  }

  function buildAssumptionItem(label, key, val) {
    return (
      '<div class="bt-assumption-item">' +
      "<label>" + label + "</label>" +
      '<input type="number" id="bt-assump-' + key + '" value="' + val + '" step="0.1" min="0">' +
      "</div>"
    );
  }

  function buildFilters() {
    var html = "";

    /* ── Device filter with "All" ── */
    html += '<div class="bt-filter-row">';
    html += '<span class="bt-filter-label">Cihaz</span>';
    html += '<div class="bt-filter-buttons" id="bt-filter-devices">';
    html += '<button class="bt-btn bt-active" data-device="__all">Tümü</button>';
    allDevices.forEach(function (d) {
      html += '<button class="bt-btn" data-device="' + escapeHTML(d) + '">' + escapeHTML(d) + "</button>";
    });
    html += "</div></div>";

    /* ── Model search + checkbox list ── */
    html += '<div class="bt-filter-row">';
    html += '<span class="bt-filter-label">Model</span>';
    html += '<div class="bt-model-filter">';
    html += '<input type="text" class="bt-model-search" id="bt-model-search" placeholder="Model ara…">';
    html += '<div class="bt-model-list" id="bt-model-list">';
    html += '<label class="bt-model-option"><input type="checkbox" id="bt-model-all" checked> Tümü</label>';
    allModels.forEach(function (m) {
      html += '<label class="bt-model-option"><input type="checkbox" class="bt-model-cb" data-model="' + escapeHTML(m) + '" checked> ' + escapeHTML(m) + "</label>";
    });
    html += "</div></div></div>";

    /* ── Quant filter with "All" ── */
    html += '<div class="bt-filter-row">';
    html += '<span class="bt-filter-label">Kuantizasyon</span>';
    html += '<div class="bt-filter-buttons" id="bt-filter-quants">';
    html += '<button class="bt-btn bt-active" data-quant="__all">Tümü</button>';
    allQuants.forEach(function (q) {
      html += '<button class="bt-btn" data-quant="' + escapeHTML(q) + '">' + escapeHTML(q) + "</button>";
    });
    html += "</div></div>";

    /* ── MTP filter ── */
    html += '<div class="bt-filter-row">';
    html += '<span class="bt-filter-label">MTP</span>';
    html += '<div class="bt-filter-buttons" id="bt-filter-mtp">';
    html += '<button class="bt-btn bt-active" data-mtp="all">Tümü</button>';
    html += '<button class="bt-btn" data-mtp="none">MTP Yok</button>';
    html += '<button class="bt-btn" data-mtp="with">MTP Var</button>';
    html += "</div></div>";

    /* ── Merged: Concurrency + TPS + TTFT in one row ── */
    html += '<div class="bt-filter-row bt-filter-row-perf">';
    html += '<span class="bt-filter-label">Eşzamanlılık</span>';
    html += '<div class="bt-filter-buttons" id="bt-filter-concurrency">';
    allConcurrency.forEach(function (c) {
      var cls = c === 1 ? "bt-btn bt-active" : "bt-btn";
      html += '<button class="' + cls + '" data-conc="' + c + '">C=' + c + "</button>";
    });
    html += "</div>";
    html += '<div class="bt-slider-group bt-slider-perf">';
    html += '<span class="bt-slider-value" id="bt-min-tps-val">C=1 için Min TPS: 0</span>';
    html += '<input type="range" id="bt-min-tps" min="0" max="300" value="0" step="1">';
    html += "</div>";
    html += '<div class="bt-slider-group bt-slider-perf">';
    html += '<span class="bt-slider-value" id="bt-max-ttft-val">C=1 için Maks TTFT: Sınırsız</span>';
    html += '<input type="range" id="bt-max-ttft" min="100" max="10000" value="10000" step="100">';
    html += "</div>";
    html += "</div>";

    /* ── Chat + Agentic sliders ── */
    html += '<div class="bt-filter-row">';
    html += '<span class="bt-filter-label">Min Chat</span>';
    html += '<div class="bt-slider-group">';
    html += '<span class="bt-slider-value" id="bt-min-chat-val">0</span>';
    html += '<input type="range" id="bt-min-chat" min="0" max="200" value="0" step="1">';
    html += "</div>";
    html += '<span class="bt-filter-label">Min Agentic</span>';
    html += '<div class="bt-slider-group">';
    html += '<span class="bt-slider-value" id="bt-min-agentic-val">0</span>';
    html += '<input type="range" id="bt-min-agentic" min="0" max="100" value="0" step="1">';
    html += "</div>";
    html += "</div>";

    return html;
  }

  /* ── Wiring ── */

  function wireAssumptions(container) {
    var toggle = container.querySelector("#bt-assumptions-toggle");
    var body = container.querySelector("#bt-assumptions-body");
    toggle.addEventListener("click", function () {
      toggle.classList.toggle("bt-open");
      body.classList.toggle("bt-visible");
    });

    var keys = ["ttft_threshold_ms", "tps_threshold", "chat_multiplier", "agentic_multiplier"];
    keys.forEach(function (key) {
      var input = container.querySelector("#bt-assump-" + key);
      input.addEventListener("input", function () {
        var v = parseFloat(input.value);
        if (isNaN(v) || v < 0) return;
        config[key] = v;
        renderTable(container);
      });
    });
  }

  function wireButtonGroup(container, selector, stateKey, allLabel) {
    var buttons = container.querySelectorAll(selector);

    // "All" button click
    var allBtn = container.querySelector(selector + '[data-' + stateKey + '="__all"]');
    if (allBtn) {
      allBtn.addEventListener("click", function () {
        buttons.forEach(function (b) {
          b.classList.remove("bt-active");
        });
        allBtn.classList.add("bt-active");
        if (stateKey === "device") state.devices = [];
        else if (stateKey === "quant") state.quants = [];
        renderTable(container);
      });
    }

    // Individual buttons
    buttons.forEach(function (btn) {
      if (btn.getAttribute("data-" + stateKey) === "__all") return;
      btn.addEventListener("click", function () {
        var val = btn.getAttribute("data-" + stateKey);
        if (stateKey === "device") {
          var idx = state.devices.indexOf(val);
          if (idx > -1) state.devices.splice(idx, 1);
          else state.devices.push(val);
        } else if (stateKey === "quant") {
          var idx2 = state.quants.indexOf(val);
          if (idx2 > -1) state.quants.splice(idx2, 1);
          else state.quants.push(val);
        }
        // Update button active states
        buttons.forEach(function (b) { b.classList.remove("bt-active"); });
        var activeArr = stateKey === "device" ? state.devices : state.quants;
        if (activeArr.length === 0) {
          if (allBtn) allBtn.classList.add("bt-active");
        } else {
          activeArr.forEach(function (v) {
            var sel = selector + '[data-' + stateKey + '="' + CSS.escape(v) + '"]';
            var el = container.querySelector(sel);
            if (el) el.classList.add("bt-active");
          });
        }
        renderTable(container);
      });
    });
  }

  function wireFilters(container) {
    /* Device buttons */
    wireButtonGroup(container, "[data-device]", "device");

    /* Quant buttons */
    wireButtonGroup(container, "[data-quant]", "quant");

    /* Model search + checkboxes */
    var searchInput = container.querySelector("#bt-model-search");
    var modelList = container.querySelector("#bt-model-list");
    var allCb = container.querySelector("#bt-model-all");
    var modelCbs = container.querySelectorAll(".bt-model-cb");

    searchInput.addEventListener("input", function () {
      var term = searchInput.value.toLowerCase();
      modelList.querySelectorAll(".bt-model-option").forEach(function (label) {
        var text = label.textContent.toLowerCase();
        if (label.querySelector("#bt-model-all")) {
          label.style.display = "";
          return;
        }
        label.style.display = term === "" || text.indexOf(term) > -1 ? "" : "none";
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

    /* MTP buttons */
    container.querySelectorAll("[data-mtp]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        container.querySelectorAll("[data-mtp]").forEach(function (b) {
          b.classList.remove("bt-active");
        });
        btn.classList.add("bt-active");
        state.mtp = btn.getAttribute("data-mtp");
        renderTable(container);
      });
    });

    /* Concurrency buttons */
    container.querySelectorAll("[data-conc]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        container.querySelectorAll("[data-conc]").forEach(function (b) {
          b.classList.remove("bt-active");
        });
        btn.classList.add("bt-active");
        state.concurrency = parseInt(btn.getAttribute("data-conc"), 10);

        /* Update slider labels with selected C */
        var c = state.concurrency;
        var tpsVal = container.querySelector("#bt-min-tps").value;
        var ttftVal = container.querySelector("#bt-max-ttft").value;
        container.querySelector("#bt-min-tps-val").textContent =
          "C=" + c + " için Min TPS: " + tpsVal;
        container.querySelector("#bt-max-ttft-val").textContent =
          "C=" + c + " için Maks TTFT: " + (parseInt(ttftVal, 10) >= 10000 ? "Sınırsız" : ttftVal + " ms");

        renderTable(container);
      });
    });

    /* TPS slider */
    var minTpsSlider = container.querySelector("#bt-min-tps");
    var minTpsVal = container.querySelector("#bt-min-tps-val");
    minTpsSlider.addEventListener("input", function () {
      var v = parseInt(minTpsSlider.value, 10);
      minTpsVal.textContent = "C=" + state.concurrency + " için Min TPS: " + v;
      renderTable(container);
    });

    /* TTFT slider */
    var maxTtftSlider = container.querySelector("#bt-max-ttft");
    var maxTtftVal = container.querySelector("#bt-max-ttft-val");
    maxTtftSlider.addEventListener("input", function () {
      var v = parseInt(maxTtftSlider.value, 10);
      maxTtftVal.textContent = "C=" + state.concurrency + " için Maks TTFT: " + (v >= 10000 ? "Sınırsız" : v + " ms");
      renderTable(container);
    });

    /* Chat slider */
    var minChatSlider = container.querySelector("#bt-min-chat");
    var minChatVal = container.querySelector("#bt-min-chat-val");
    minChatSlider.addEventListener("input", function () {
      minChatVal.textContent = minChatSlider.value;
      renderTable(container);
    });

    /* Agentic slider */
    var minAgenticSlider = container.querySelector("#bt-min-agentic");
    var minAgenticVal = container.querySelector("#bt-min-agentic-val");
    minAgenticSlider.addEventListener("input", function () {
      minAgenticVal.textContent = minAgenticSlider.value;
      renderTable(container);
    });
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
        va = getMaxC(a);
        vb = getMaxC(b);
      } else if (sortCol === "chat") {
        va = getChatUsers(a);
        vb = getChatUsers(b);
      } else if (sortCol === "agentic") {
        va = getAgenticUsers(a);
        vb = getAgenticUsers(b);
      } else if (sortCol === "tp") {
        va = a.tp || 0;
        vb = b.tp || 0;
      } else if (sortCol === "dp") {
        va = a.dp || 0;
        vb = b.dp || 0;
      } else if (sortCol === "pp") {
        va = a.pp || 0;
        vb = b.pp || 0;
      } else if (sortCol === "device") {
        var deviceOrder = {
          "Thor": 0,
          "1× DGX Spark": 1,
          "2× DGX Spark": 2,
          "3× DGX Spark": 3,
          "4× DGX Spark": 4,
          "8× DGX Spark": 5,
          "RTX PRO 6000": 6,
          "DGX B300": 7
        };
        va = deviceOrder[a.device] != null ? deviceOrder[a.device] : 99;
        vb = deviceOrder[b.device] != null ? deviceOrder[b.device] : 99;
      } else {
        va = a[sortCol] || "";
        vb = b[sortCol] || "";
        return sortDir === "asc"
          ? String(va).localeCompare(String(vb))
          : String(vb).localeCompare(String(va));
      }
      return sortDir === "asc" ? va - vb : vb - va;
    });

    var countEl = container.querySelector("#bt-results-count");
    if (countEl) {
      countEl.innerHTML =
        "<strong>" + rawData.benchmarks.length + "</strong> yapılandırmadan <strong>" +
        entries.length + "</strong> tanesi gösteriliyor";
    }

    var wrap = container.querySelector("#bt-table-wrap");
    if (entries.length === 0) {
      wrap.innerHTML = '<div class="bt-empty">Mevcut filtrelerle eşleşen yapılandırma yok.</div>';
      return;
    }

    var c = state.concurrency;
    var cols = [
      { key: "model",        label: "Model",              sortable: true,  num: false },
      { key: "device",       label: "Cihaz",              sortable: true,  num: false },
      { key: "quantization", label: "Kuantizasyon",       sortable: true,  num: false },
      { key: "tps",          label: "TPS @ C=" + c,       sortable: true,  num: true  },
      { key: "ttft",         label: "TTFT @ C=" + c,     sortable: true,  num: true  },
      { key: "maxc",         label: "Maks C",             sortable: true,  num: true  },
      { key: "chat",         label: "Chat Kapasitesi",    sortable: true,  num: true  },
      { key: "agentic",      label: "Agentic Kapasitesi", sortable: true,  num: true  },
      { key: "tp",           label: "TP",                 sortable: true,  num: true  },
      { key: "dp",           label: "DP",                 sortable: true,  num: true  },
      { key: "pp",           label: "PP",                 sortable: true,  num: true  },
      { key: "engine",       label: "Motor",              sortable: true,  num: false },
      { key: "mtp",          label: "MTP",                sortable: true,  num: false },
      { key: "expand",       label: "",                   sortable: false, num: false },
    ];

    var html = '<table class="bt-table"><thead><tr>';
    cols.forEach(function (col) {
      var classes = [];
      if (col.sortable) {
        classes.push("bt-sortable");
        if (sortCol === col.key) {
          classes.push(sortDir === "asc" ? "bt-sorted-asc" : "bt-sorted-desc");
        }
      } else {
        classes.push("bt-no-sort");
      }
      if (col.num) classes.push("bt-th-num");
      html += '<th class="' + classes.join(" ") + '" data-col="' + col.key + '">' + col.label + "</th>";
    });
    html += "</tr></thead><tbody>";

    entries.forEach(function (entry) {
      var maxC = getMaxC(entry);
      var tps = getMetricAtC(entry, c, "tps");
      var ttft = getMetricAtC(entry, c, "ttft_ms");
      var chat = getChatUsers(entry);
      var agentic = getAgenticUsers(entry);
      var isExpanded = expanded[entry.id];

      html += '<tr data-id="' + escapeHTML(entry.id) + '">';

      /* Model */
      html += "<td>" + escapeHTML(entry.model) + "</td>";
      /* Device */
      html += "<td>" + escapeHTML(entry.device) + "</td>";
      /* Quant */
      html += "<td>" + escapeHTML(entry.quantization) + "</td>";

      /* TPS */
      var tpsCls = "bt-num";
      if (tps !== null && tps >= config.tps_threshold) tpsCls += " bt-good";
      else if (tps !== null && tps < config.tps_threshold) tpsCls += " bt-bad";
      html += '<td class="' + tpsCls + '">' + fmt(tps, 2) + "</td>";

      /* TTFT */
      var ttftCls = "bt-num";
      if (ttft !== null && ttft < config.ttft_threshold_ms) ttftCls += " bt-good";
      else if (ttft !== null && ttft >= config.ttft_threshold_ms) ttftCls += " bt-bad";
      html += '<td class="' + ttftCls + '">' + (ttft !== null ? fmt(ttft, 0) : "—") + "</td>";

      /* Max C */
      html += '<td class="bt-num">' + (maxC > 0 ? maxC : '<span class="bt-muted">0</span>') + "</td>";

      /* Chat Capacity */
      html += '<td class="bt-num">' + chat + "</td>";

      /* Agentic Capacity */
      html += '<td class="bt-num">' + agentic + "</td>";

      /* TP */
      html += '<td class="bt-num">' + (entry.tp != null && entry.tp !== 1 ? entry.tp : '<span class="bt-muted">—</span>') + "</td>";

      /* DP */
      html += '<td class="bt-num">' + (entry.dp != null && entry.dp !== 1 ? entry.dp : '<span class="bt-muted">—</span>') + "</td>";

      /* PP */
      html += '<td class="bt-num">' + (entry.pp != null && entry.pp !== 1 ? entry.pp : '<span class="bt-muted">—</span>') + "</td>";

      /* Engine */
      html += "<td>" + escapeHTML(entry.engine) + "</td>";

      /* MTP */
      html += entry.mtp
        ? '<td class="bt-mtp-yes">Evet</td>'
        : '<td class="bt-muted">—</td>';

      /* Expand */
      html += '<td class="bt-expand-cell" data-expand="' + escapeHTML(entry.id) + '">' + (isExpanded ? "&#9660;" : "&#9654;") + "</td>";

      html += "</tr>";

      /* Expanded detail row */
      if (isExpanded) {
        html += '<tr class="bt-detail-row"><td colspan="' + cols.length + '">';
        html += '<div class="bt-detail-content bt-visible">';
        html += '<table class="bt-detail-table"><thead><tr>';
        html += "<th>C</th><th>TTFT (ms)</th><th>TPS (tok/s)</th><th>Durum</th>";
        html += "</tr></thead><tbody>";

        entry.data_points.forEach(function (dp) {
          var passes = dp.ttft_ms != null && dp.ttft_ms < config.ttft_threshold_ms && dp.tps > config.tps_threshold;
          html += "<tr>";
          html += "<td>" + dp.c + "</td>";
          html += "<td>" + (dp.ttft_ms != null ? fmt(dp.ttft_ms, 0) : "—") + "</td>";
          html += "<td>" + fmt(dp.tps, 2) + "</td>";
          html += '<td class="' + (passes ? "bt-detail-pass" : "bt-detail-fail") + '">' + (passes ? "BAŞARILI" : "BAŞARISIZ") + "</td>";
          html += "</tr>";
        });

        html += "</tbody></table>";

        /* Chart card */
        var deviceStr = escapeHTML(entry.device);
        if (entry.tp != null && entry.tp !== 1) {
          deviceStr += " (TP=" + entry.tp;
          if (entry.dp != null && entry.dp !== 1) {
            deviceStr += ", DP=" + entry.dp;
          }
          deviceStr += ")";
        } else if (entry.dp != null && entry.dp !== 1) {
          deviceStr += " (DP=" + entry.dp + ")";
        }
        var headerParts = [
          escapeHTML(entry.model),
          deviceStr,
          escapeHTML(entry.quantization),
          escapeHTML(entry.engine),
        ];
        if (entry.mtp) headerParts.push("MTP");

        html += '<div class="bt-chart-card" id="bt-chart-card-' + escapeHTML(entry.id) + '">';
        html += '<div class="bt-chart-header">' + headerParts.join(" &middot; ") + "</div>";
        html += '<div class="bt-chart-legend">';
        html += '<span class="bt-legend-item"><span class="bt-legend-swatch" style="background:#2196F3"></span> TPS (tok/s) &mdash; sol eksen</span>';
        html += '<span class="bt-legend-item"><span class="bt-legend-swatch" style="background:#FF6D00"></span> Toplam TPS (tok/s) &mdash; sağ eksen</span>';
        html += "</div>";
        html += '<div class="bt-chart-axis-titles">';
        html += '<span class="bt-axis-title-left" style="color:#2196F3">TPS (tok/s)</span>';
        html += '<span class="bt-axis-title-right" style="color:#FF6D00">Toplam TPS (tok/s)</span>';
        html += "</div>";
        html += '<div class="bt-chart-canvas-wrap">';
        html += '<canvas id="bt-chart-' + escapeHTML(entry.id) + '"></canvas>';
        html += "</div>";
        html += '<div class="bt-chart-x-title">Eşzamanlı İstek Sayısı</div>';
        html += '<div class="bt-chart-footer">';
        html += '<span></span>';
        html += '<span class="bt-chart-logo"><img src="' + (logoPath || "logo.png") + '" alt="OpenZeka" class="bt-chart-logo-img" style="height:72px;width:auto;"></span>';
        html += "</div>";
        html += "</div>";

        if (entry.notes) {
          html += '<div class="bt-detail-notes"><strong>Notlar:</strong> ' + escapeHTML(entry.notes) + "</div>";
        }

        html += '<button class="bt-chart-download" data-download="' + escapeHTML(entry.id) + '">Grafiği İndir</button>';

        html += "</div></td></tr>";
      }
    });

    html += "</tbody></table>";
    wrap.innerHTML = html;

    /* Wire sort headers */
    wrap.querySelectorAll("th[data-col]").forEach(function (th) {
      if (th.classList.contains("bt-no-sort")) return;
      th.addEventListener("click", function () {
        var col = th.getAttribute("data-col");
        if (sortCol === col) {
          sortDir = sortDir === "asc" ? "desc" : "asc";
        } else {
          sortCol = col;
          sortDir = "asc";
        }
        renderTable(container);
      });
    });

    /* Wire expand cells */
    wrap.querySelectorAll("[data-expand]").forEach(function (cell) {
      cell.addEventListener("click", function () {
        var id = cell.getAttribute("data-expand");
        expanded[id] = !expanded[id];
        if (expanded[id]) {
          history.replaceState(null, "", "#" + id);
        } else {
          history.replaceState(null, "", window.location.pathname + window.location.search);
        }
        renderTable(container);
      });
    });

    /* Render charts for expanded rows */
    entries.forEach(function (entry) {
      if (expanded[entry.id]) {
        renderChart(entry, container);
      }
    });

    /* Wire download buttons */
    wrap.querySelectorAll("[data-download]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        var id = btn.getAttribute("data-download");
        downloadChart(id, container);
      });
    });
  }

  /* ── Chart Rendering ── */

  function renderChart(entry, container) {
    var canvas = container.querySelector("#bt-chart-" + CSS.escape(entry.id));
    if (!canvas) return;
    if (typeof Chart === "undefined") return;

    if (chartInstances[entry.id]) {
      chartInstances[entry.id].destroy();
    }

    var cValues = entry.data_points.map(function (dp) {
      return dp.c;
    });

    var tpsData = entry.data_points.map(function (dp) {
      return dp.tps;
    });

    var aggData = entry.data_points.map(function (dp) {
      return dp.tps * dp.c;
    });

    var tpsColor = "#2196F3";
    var aggColor = "#FF6D00";

    chartInstances[entry.id] = new Chart(canvas, {
      type: "line",
      data: {
        labels: cValues.map(function(c) { return "C=" + c; }),
        datasets: [
          {
            label: "TPS",
            data: tpsData,
            yAxisID: "y_tps",
            borderColor: tpsColor,
            backgroundColor: tpsColor,
            pointRadius: 5,
            pointHoverRadius: 7,
            tension: 0,
          },
          {
            label: "Toplam TPS",
            data: aggData,
            yAxisID: "y_agg",
            borderColor: aggColor,
            backgroundColor: aggColor,
            pointRadius: 5,
            pointHoverRadius: 7,
            tension: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false,
        },
        scales: {
          x: {
            type: "category",
            grid: { color: "#eeeeee" },
            ticks: { font: { size: 12 } },
          },
          y_tps: {
            position: "left",
            beginAtZero: true,
            ticks: { color: tpsColor, font: { size: 12 } },
            grid: { color: "#eeeeee" },
            title: { display: false },
          },
          y_agg: {
            position: "right",
            beginAtZero: true,
            ticks: { color: aggColor, font: { size: 12 } },
            grid: { drawOnChartArea: false },
            title: { display: false },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                var label = ctx.dataset.label || "";
                if (label === "TPS") {
                  return "TPS: " + ctx.parsed.y.toFixed(2) + " tok/s";
                } else {
                  return "Toplam TPS: " + Math.round(ctx.parsed.y) + " tok/s";
                }
              },
            },
          },
          datalabels: {
            align: "bottom",
            anchor: "end",
            color: function (ctx) {
              return ctx.datasetIndex === 0 ? tpsColor : aggColor;
            },
            font: { weight: "bold", size: 11 },
            formatter: function (value, ctx) {
              if (value === null) return "";
              return ctx.datasetIndex === 0
                ? value.toFixed(1)
                : Math.round(value);
            },
          },
        },
      },
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
      link.download = entryId + "-grafik.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
      return;
    }

    html2canvas(card, {
      backgroundColor: "#ffffff",
      scale: 4,
    }).then(function (canvas) {
      var link = document.createElement("a");
      link.download = entryId + "-grafik.png";
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
    /* Collapse rows not matching hash */
    for (var id in expanded) {
      if (expanded.hasOwnProperty(id) && expanded[id] && id !== hash) {
        expanded[id] = false;
        destroyChart(id);
      }
    }
    /* Expand hash-matched row */
    if (hash) {
      var found = rawData.benchmarks.some(function (b) { return b.id === hash; });
      if (found) {
        expanded[hash] = true;
      }
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
