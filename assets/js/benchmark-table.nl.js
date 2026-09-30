/* ── Benchmark Table — vanilla JS, zero dependencies ── */
(function () {
  "use strict";

  /* ──────────────────────────────────────────────────────────────────────
     UI STRINGS — the ONLY block that differs between benchmark-table.js and
     benchmark-table.nl.js. Everything below this object is byte-identical in
     both files. When changing behaviour, edit one file and copy the body
     across; when changing wording, edit only this object.
     ────────────────────────────────────────────────────────────────────── */
  var S = {
    lang: "nl",

    loading: "Benchmarks laden…",
    loadFailed: "Benchmarkgegevens konden niet worden geladen: ",

    /* Controls */
    concurrency: "Gelijktijdigheid",
    device: "Apparaat",
    model: "Model",
    quant: "Kwantisatie",
    engine: "Engine",
    mtp: "Speculatieve decodering",
    all: "Alle",
    showAll: "Alles tonen",
    searchModels: "Modellen zoeken…",
    noMtp: "Uit",
    withMtp: "Aan",
    resetFilters: "Alle filters resetten",

    minTps: "Min. TPS",
    minParams: "Min. parameters",
    maxTtft: "Max. TTFT",
    noLimit: "Geen limiet",
    paramsAll: "Alle groottes",
    minChatUsers: "Min. chatcapaciteit (gebruikers)",
    minAgenticUsers: "Min. agentische capaciteit (gebruikers)",
    atC: function (c) { return " bij C=" + c; },

    /* Performance targets / assumptions */
    targetsHeading: "Prestatiedoelen en capaciteitsaannames",
    targetsIntro: "Deze waarden bepalen wat acceptabele prestaties zijn en hoe de capaciteit wordt geschat. Ze verbergen geen rijen; ze berekenen voor elke rij Max C en de capaciteit opnieuw, en ook de groene en rode kleuring van TPS en TTFT.",
    ttftThreshold: "Maximaal TTFT-doel (ms)",
    tpsThreshold: "Minimaal TPS-doel (tok/s)",
    chatMultiplier: "Gebruiksfactor chat",
    agenticMultiplier: "Gebruiksfactor agentisch",
    groupSpeed: "Snelheidslimiet",
    groupSpeedIntro: "Hoe snel elk verzoek moet zijn. Max C is de hoogste gemeten gelijktijdigheid die aan beide doelen voldoet; de gebruiksfactoren zetten die om in personen.",
    groupMemory: "KV-cachegeheugenlimiet",
    groupMemoryIntro: "Hoeveel gebruikerssessies van de onderstaande lengte passen in de KV-cache die naast de modelgewichten overblijft.",
    chatContext: "Contextlengte chat (tokens)",
    agenticContext: "Contextlengte agentisch (tokens)",
    engineMemDiscrete: "Geheugentoewijzing engine — discrete GPU (%)",
    engineMemUnified: "Geheugentoewijzing engine — unified memory (%)",
    weightsKvShare: "Aandeel gewichten en KV-cache (%)",

    /* Table */
    colModel: "Model",
    colParams: "Parameters",
    colIntel: "Intelligence Index",
    colAgenticIdx: "Agentic Index",
    colDevice: "Apparaat",
    colQuant: "Kwantisatie",
    colTps: "TPS",
    colTtft: "TTFT",
    colMaxC: "Max C",
    colChat: "Chatcapaciteit",
    colAgentic: "Agentische capaciteit",
    colTp: "TP", colDp: "DP", colPp: "PP",
    colEngine: "Engine",
    colMtp: "Speculatieve decodering",
    yes: "Ja",
    users: "gebruikers",
    matching: "Overeenkomende configuraties",
    matchingCount: function (shown, total) {
      return "<strong>" + shown + "</strong> van <strong>" + total + "</strong>";
    },
    noMatch: "Geen configuraties komen overeen met de huidige filters.",
    targetMet: "Doel gehaald — deze waarde voldoet aan uw huidige prestatiedoel.",
    targetNotMet: "Doel niet gehaald — deze waarde voldoet niet aan uw huidige prestatiedoel.",
    viewDetails: "Details bekijken — toont de volledige gelijktijdigheidsreeks, de grafiek en aanvullende informatie voor deze configuratie.",

    /* Capacity: which of the two limits set the number */
    legendLead: "Capaciteit bepaald door:",
    legendPerf: "snelheidsdoelen",
    legendMem: "KV-cachegeheugen",
    legendShortCtx: "sessie langer dan het contextvenster van het model",
    capPerf: function (mem, ctx) { return "Bepaald door de snelheidsdoelen. Het KV-cachegeheugen zou plaats bieden aan " + mem + " sessies van " + ctx + " tokens."; },
    capMem: function (perf, ctx) { return "Bepaald door het KV-cachegeheugen: er passen zoveel sessies van " + ctx + " tokens in. De snelheidsdoelen zouden " + perf + " toestaan."; },
    capTie: function (ctx) { return "De snelheidsdoelen en het KV-cachegeheugen (sessies van " + ctx + " tokens) staan hetzelfde aantal toe."; },
    capUnchecked: function (why) { return "Bepaald door de snelheidsdoelen. " + why; },
    whyUnsupported: "De KV-cachegeheugenlimiet wordt voor dit model nog niet berekend, omdat de indeling van de cache niet is gemodelleerd; dit cijfer berust daarom alleen op de snelheidsmetingen.",
    whyWeights: "De KV-cachegeheugenlimiet kan voor deze run niet worden berekend: de modelgewichten alleen zijn al groter dan het geheugen dat deze schatting als beschikbaar aanneemt. De run paste kennelijk wel, wat meestal betekent dat de engine meer geheugen kreeg dan die standaardtoewijzing, of dat een deel van het model of van de KV-cache in het CPU-geheugen of op schijf werd gehouden. Dit cijfer berust daarom alleen op de snelheidsmetingen.",
    whyUnknown: "De KV-cachegeheugenlimiet kan niet worden berekend, omdat de hardware of de precisie van de gewichten ontbreekt in de geheugentabel; dit cijfer berust daarom alleen op de snelheidsmetingen.",
    capShortCtx: function (len, ctx) { return "Een sessie van " + ctx + " tokens is langer dan het contextvenster van dit model (" + len + " tokens, het maximum dat het kan bevatten), dus het kan geen sessies van die lengte bedienen. Kies een kortere contextlengte om een cijfer te zien."; },
    capCeiling: function (c) { return " Het snelheidscijfer is een ondergrens: de run haalde uw doelen nog bij C=" + c + ", het hoogste geteste niveau."; },
    maxcAtLeast: function (c) { return "Minstens " + c + ": de run haalde uw doelen bij C=" + c + ", het hoogste geteste niveau, dus het werkelijke maximum werd niet bereikt."; },
    capHeading: "Details van de capaciteitsschatting",
    explainedHeading: "Benchmarkresultaten toegelicht",
    capChatRow: function (ctx) { return "Chat"; },
    capAgenticRow: function (ctx) { return "Agentisch"; },
    capUsers: function (n) { return n + (n === 1 ? " gebruiker" : " gebruikers"); },
    capByPerf: "bepaald door de snelheidsdoelen",
    capByMem: "bepaald door het KV-cachegeheugen",
    capByTie: "snelheidsdoelen en KV-cachegeheugen komen overeen",
    capByContext: "langer dan het contextvenster van het model",
    capSpeedAllows: function (n, atLeast) { return "Snelheidsdoelen staan " + (atLeast ? "minstens " : "") + n + " toe"; },
    capMemFits: function (n) { return "KV-cachegeheugen biedt plaats aan " + n; },
    capMemNa: "KV-cachegeheugen niet berekend",
    capKvSummary: function (kv, w, unit, prec) { return "Nadat de modelgewichten zijn geladen (" + w + " GB per " + unit + "), blijft er ongeveer " + kv + " GB per " + unit + " over voor de KV-cache, waarbij wordt aangenomen dat die in " + prec + " wordt opgeslagen."; },
    capWeightsEstimated: "Het checkpoint dat deze run serveerde is niet vastgelegd, dus de grootte van de gewichten is geschat op basis van het aantal parameters.",
    capShortCtxLine: function (len) { return "Het contextvenster van dit model is " + len + " tokens, dus het kan geen sessie bevatten die zo lang is als die in de aannames."; },
    unitGpu: "GPU",
    unitNode: "node",
    unitModule: "module",

    /* Expanded row */
    detailC: "C", detailTtft: "TTFT (ms)", detailTps: "TPS (tok/s)", detailStatus: "Status",
    pass: "PASS", fail: "FAIL",
    notes: "Opmerkingen:",
    downloadChart: "Grafiek downloaden",
    chartFileSuffix: "-grafiek.png",
    tpsAxis: "TPS (tok/s)",
    aggAxis: "Geaggregeerde TPS (tok/s)",
    aggLabel: "Geaggregeerde TPS",
    leftAxis: " — linkeras",
    rightAxis: " — rechteras",
    xTitle: "Aantal gelijktijdige verzoeken",

    /* TPS speed preview */
    previewHeading: "Hoe deze snelheid eruitziet",
    previewSubtitle: function (n) { return "voorbeeldtekst bij ongeveer " + n + " tokens/s"; },
    previewStopped: "gestopt — het TPS-doel is 0",
    previewRowHeading: "Hoe deze snelheid eruitziet",
    previewRowSub: function (c, n) { return "C=" + c + " · ongeveer " + n + " tokens/s"; },
    previewPick: "Kies een gemeten gelijktijdigheid om de daar vastgelegde snelheid te bekijken.",
    previewRowLabel: function (c) { return "Bekijk de snelheid gemeten bij C=" + c; },
    previewDisclaimer: "Dit is een benaderende simulatie die de gekozen TPS-waarde zichtbaar maakt. De werkelijke responservaring kan verschillen, afhankelijk van TTFT, uitvoerlengte en het gedrag van de applicatie.",
    sampleText: "Wie een groot taalmodel op eigen hardware draait, merkt dat de responssnelheid afhangt van de accelerator, het kwantisatieformaat en het aantal mensen dat het systeem tegelijk gebruikt. Bij lage tokensnelheden verschijnt de tekst woord voor woord en wordt het wachten merkbaar, zodat de interface lijkt hardop na te denken. Naarmate de snelheid toeneemt, komt het antwoord sneller binnen dan de meeste mensen kunnen lezen, en verandert de ervaring volledig van karakter: in plaats van toe te kijken hoe het antwoord wordt opgebouwd, leest u het gewoon. Ergens tussen die twee uitersten ligt het punt waarop een chatassistent niet langer aanvoelt als een machine waarop u wacht, maar als een hulpmiddel dat u bijhoudt. Waar dat punt precies ligt, hangt af van de taak. Het doorlezen van een kort antwoord verdraagt veel minder snelheid dan het lezen van een lange technische uitleg, en een achtergrondtaak waar niemand naar kijkt verdraagt nog minder.",

    /* Tooltips */
    tip: {
      model: "<strong>Model</strong><p>Het grote taalmodel dat wordt geserveerd.</p><p>Een rij is een volledige deployment, dus hetzelfde model komt in meerdere rijen voor met andere hardware, een ander formaat, een andere engine of ander parallellisme.</p>",
      params: "<strong>Parameters</strong><p>Het totale aantal gewichten van het model, zoals gepubliceerd.</p><p>Voor mixture-of-experts-modellen is dit het totaal, niet het deel dat per token actief is, omdat alles in het geheugen wordt gehouden.</p>",
      intel: "<strong>Intelligence Index</strong><p>De vaardigheidsscore van Artificial Analysis, die evaluaties van redeneren, programmeren, wetenschap en werk met lange context combineert. Hoger is beter.</p><p>De score beschrijft het model, niet deze run, dus elke rij van het model toont dezelfde waarde. Waar meerdere instellingen voor redeneerinspanning zijn beoordeeld, wordt de hoogste getoond; een streepje betekent dat er geen score is gepubliceerd.</p><p>Bron: Artificial Analysis.</p>",
      agenticIdx: "<strong>Agentic Index</strong><p>De score van Artificial Analysis voor agentisch werk: taken in meerdere stappen, tool calls en zonder toezicht op koers blijven. Hoger is beter.</p><p>De score meet wat het model kan; Agentische capaciteit, verderop in de rij, schat hoeveel personen de hardware kan bedienen. Een streepje betekent dat er geen score is gepubliceerd, wat hier vaak voorkomt.</p><p>Bron: Artificial Analysis.</p>",
      device: "<strong>Apparaat</strong><p>De hardware die de run gebruikte, en hoeveel eenheden het model samen serveerden.</p><p>4× DGX Spark betekent vier machines die één model als één systeem serveren.</p>",
      quant: "<strong>Kwantisatie</strong><p>Het getalformaat waarin de gewichten zijn opgeslagen.</p><p>Minder bits per gewicht betekent minder geheugen en meestal meer snelheid, met enig risico voor de kwaliteit. BF16 en FP16 zijn volledige precisie, FP8 en MXFP8 gebruiken 8 bits, en NVFP4, MXFP4, FP4, INT4 en AWQ gebruiken er 4.</p>",
      tps: "<strong>TPS — tokens per seconde</strong><p>Hoe snel het antwoord op één verzoek wordt geproduceerd bij de gekozen gelijktijdigheid. Een token is ongeveer driekwart woord.</p><p>Per verzoek, niet in totaal: bij C=8 krijgt elk van de acht verzoeken deze snelheid. Gemiddelde van tien rondes met prompts en antwoorden van 128 tokens. Hoger is beter.</p>",
      ttft: "<strong>TTFT — time to first token</strong><p>Hoe lang een verzoek bij de gekozen gelijktijdigheid op zijn eerste token wacht, in milliseconden.</p><p>Gemiddelde van tien rondes met prompts van 128 tokens; langere prompts duren ongeveer evenredig langer. Lager is beter.</p>",
      maxc: "<strong>Max C — maximaal ondersteunde gelijktijdigheid</strong><p>De hoogste gemeten gelijktijdigheid waarbij zowel uw TTFT-doel als uw TPS-doel wordt gehaald. Het telt gelijktijdige verzoeken, geen personen.</p><p>Het volgt uw doelen: maak er één strenger en Max C kan dalen. 0 betekent dat geen enkel gemeten niveau slaagt.</p><p>Een plus (64+) betekent dat zelfs het hoogste geteste niveau slaagde, dus het werkelijke maximum ligt hoger dan gemeten.</p>",
      chat: "<strong>Chatcapaciteit</strong><p>Ongeveer hoeveel personen deze configuratie tegelijk voor chat kunnen gebruiken — de kleinste van twee schattingen:</p><p><strong>Snelheid:</strong> Max C × Gebruiksfactor chat, omdat chatgebruikers het grootste deel van hun tijd lezen en typen.<br><strong>Geheugen:</strong> hoeveel sessies van de Contextlengte chat in de KV-cache passen.</p><p>Een plus (256+) markeert een snelheidscijfer van een run die uw doelen nooit miste: het is een minimum, omdat de snelheidslimiet niet werd bereikt.</p><p>Het pictogram toont welke van de twee het cijfer bepaalde. Een schatting, geen gemeten aantal gebruikers.</p>",
      agentic: "<strong>Agentische capaciteit</strong><p>Ongeveer hoeveel personen deze configuratie tegelijk kunnen gebruiken voor agentisch werk, waarbij het model taken in meerdere stappen en tool calls uitvoert — de kleinste van twee schattingen:</p><p><strong>Snelheid:</strong> Max C × Gebruiksfactor agentisch, lager dan voor chat omdat een agent verzoeken blijft sturen zolang hij werkt.<br><strong>Geheugen:</strong> hoeveel sessies van de Contextlengte agentisch in de KV-cache passen.</p><p>Een plus (256+) markeert een snelheidscijfer van een run die uw doelen nooit miste: het is een minimum, omdat de snelheidslimiet niet werd bereikt.</p><p>Het pictogram toont welke van de twee het cijfer bepaalde. Een schatting, geen gemeten aantal gebruikers.</p>",
      par: "<strong>Parallellisme — TP / DP / PP</strong><p>Hoe het model over GPU's of machines is verdeeld.</p><p><strong>TP</strong> verdeelt het werk binnen elke laag, <strong>PP</strong> plaatst verschillende lagen op verschillende apparaten, en <strong>DP</strong> draait volledige kopieën die elk hun eigen verzoeken bedienen. — betekent niet gebruikt.</p>",
      engine: "<strong>Inferentie-engine</strong><p>De serversoftware die het model laadt en verzoeken inplant, zoals vLLM of SGLang.</p><p>De engine beïnvloedt de snelheid evenveel als de hardware: hetzelfde model op dezelfde hardware kan tussen engines meetbaar verschillen.</p>",
      mtp: "<strong>Speculatieve decodering</strong><p>Het model maakt een concept van enkele tokens vooruit en controleert ze in één pass; geaccepteerde tokens blijven behouden, zodat dezelfde uitvoer eerder binnenkomt.</p><p>Ja betekent dat de run het gebruikte. Het mechanisme — MTP, een draftmodel of DSpark — en hoe ver vooruit het concept reikte, staan in de opmerkingen van de rij.</p>",

      fConcurrency: "<strong>Gelijktijdigheid</strong><p>Het aantal verzoeken dat op hetzelfde moment wordt verwerkt — een belastingsniveau, geen aantal personen.</p><p>Bepaalt welke meting de kolommen TPS en TTFT tonen. Rijen die niet op dit niveau zijn gemeten, worden verborgen.</p>",
      fModel: "<strong>Modelfilter</strong><p>Toont alleen de gekozen modellen. Kies er meerdere om ze naast elkaar te vergelijken.</p>",
      fMinParams: "<strong>Minimum aantal parameters</strong><p>Verbergt modellen waarvan het totale aantal parameters hieronder ligt.</p><p>De schaal is logaritmisch, omdat de modellen hier variëren van 4B tot 2.8T.</p>",
      fDevice: "<strong>Apparaatfilter</strong><p>Toont alleen runs op de gekozen hardware. Kies er meerdere om apparaten direct te vergelijken.</p>",
      fQuant: "<strong>Kwantisatiefilter</strong><p>Toont alleen de gekozen gewichtsformaten. Kies FP8 en NVFP4 samen om die twee te vergelijken.</p>",
      fMtp: "<strong>Filter speculatieve decodering</strong><p>Toont runs met speculatieve decodering aan, uit of beide. Kies beide om te zien wat het oplevert.</p>",
      fMinTps: "<strong>Minimale TPS</strong><p>Verbergt configuraties waarvan de snelheid per verzoek bij de gekozen gelijktijdigheid hieronder ligt.</p>",
      fMaxTtft: "<strong>Maximale TTFT</strong><p>Verbergt configuraties waarvan het eerste token bij de gekozen gelijktijdigheid langer duurt dan dit.</p>",
      fMinChat: "<strong>Minimale chatcapaciteit</strong><p>Verbergt configuraties die naar schatting minder chatgebruikers bedienen dan dit. Geteld in personen.</p>",
      fMinAgentic: "<strong>Minimale agentische capaciteit</strong><p>Verbergt configuraties die naar schatting minder agentische gebruikers bedienen dan dit. Geteld in personen.</p>",

      aTps: "<strong>Minimaal TPS-doel</strong><p>De laagste snelheid per verzoek die u accepteert, in tokens per seconde.</p><p>Verhogen kan Max C en de capaciteitscijfers verlagen.</p>",
      aTtft: "<strong>Maximaal TTFT-doel</strong><p>De langste wachttijd op het eerste token die u accepteert, in milliseconden.</p><p>Verlagen kan Max C en de capaciteitscijfers verlagen.</p>",
      aChat: "<strong>Gebruiksfactor chat</strong><p>Hoeveel chatgebruikers gemiddeld één verzoekplaats delen, omdat elk van hen het grootste deel van de tijd leest en typt. De standaardwaarde 4 betekent dat een gebruiker ongeveer een kwart van de tijd een verzoek heeft lopen.</p><p>Verhoog de waarde voor lichter gebruik, verlaag hem voor zwaarder gebruik.</p>",
      aAgentic: "<strong>Gebruiksfactor agentisch</strong><p>Hetzelfde voor agentische gebruikers. De standaardwaarde 1.5 betekent dat een agent ongeveer twee derde van de tijd een verzoek heeft lopen, omdat hij zijn aanroepen aan elkaar koppelt.</p><p>Verlaag de waarde voor agents die vrijwel continu draaien.</p>",
      aChatCtx: "<strong>Contextlengte chat</strong><p>Hoeveel tokens één chatsessie bevat: de geschiedenis, geplakte tekst en antwoorden.</p><p>De geheugenlimiet telt hoeveel sessies van deze lengte in de KV-cache passen; een verdubbeling halveert dat aantal ongeveer.</p>",
      aAgenticCtx: "<strong>Contextlengte agentisch</strong><p>Hetzelfde voor een agentische sessie, die ook tool calls en hun resultaten bevat en daardoor meestal enkele malen langer is.</p>",
      aEngineDiscrete: "<strong>Geheugentoewijzing engine — discrete GPU</strong><p>Het deel van het geheugen van elke GPU dat aan de inferentie-engine wordt gegeven, wat vLLM <code>gpu_memory_utilization</code> noemt.</p><p>Geldt voor DGX B300 en RTX PRO 6000.</p>",
      aEngineUnified: "<strong>Geheugentoewijzing engine — unified memory</strong><p>Hetzelfde aandeel waar CPU en GPU uit één geheugenpool putten. Het besturingssysteem draait ook in die pool, dus de standaardwaarde is lager.</p><p>Geldt voor DGX Spark en Jetson Thor.</p>",
      aShare: "<strong>Aandeel gewichten en KV-cache</strong><p>Het deel van het geheugen van de engine dat de gewichten en de KV-cache bevat; de rest is werkgeheugen voor activaties.</p><p>KV-cache = geheugen × toewijzing × dit aandeel − gewichten.</p>",
      reset: "<strong>Alle filters resetten</strong><p>Wist elk filter en zet de doelen en aannames terug op hun standaardwaarden.</p>"
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
    chat_context_tokens: 16384,
    agentic_context_tokens: 65536,
    engine_memory_discrete: 0.95,
    engine_memory_unified: 0.85,
    weights_kv_share: 0.9
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
  /* Set from data-bt-only: the id of the one run a permanent result page shows.
     The row is then drawn opened, with no filters, targets or collapsing. */
  var only = null;


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
    only = container.getAttribute("data-bt-only");

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
        if (only) return;
        /* Carried over by the site's language switcher (window.ozCarry), so
           switching language keeps the reader's filters, targets and open rows. */
        if (window.ozCarry && window.ozCarry.bt) restore(container, window.ozCarry.bt);
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
    /* Speed set the figure but the run never failed the targets: the true
       figure is at least this, so the cell marks it with a plus. */
    r.atLeast = r.ceiling && r.limit === "perf";
    return r;
  }

  function getChatUsers(entry) {
    return capacity(entry, "chat").shown;
  }

  function getAgenticUsers(entry) {
    return capacity(entry, "agentic").shown;
  }

  /* 16384 -> "16K", 1048576 -> "1M": the power-of-two convention context
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
    var shown = r.limit === "context" ? '<span class="bt-muted">—</span>' : r.shown + (r.atLeast ? "+" : "");
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

  /* The explanation, left of the capacity box. The whitepapers site writes one per
     row into the page at build time (a hidden [data-bt-explained] element per
     id), so the text is in the HTML for search engines and agents; the widget
     only moves it into view. A page without them — the openzeka.com embed —
     shows the capacity box alone. */
  function explanation(entry) {
    var el = document.querySelector('[data-bt-explained="' + CSS.escape(entry.id) + '"]');
    return el ? el.innerHTML : "";
  }

  function detailPair(entry) {
    var expl = explanation(entry);
    if (!expl) return capBreakdown(entry);
    return '<div class="bt-detail-pair"><div class="bt-detail-pair-col"><div class="bt-explained">' +
      '<div class="bt-capacity-title">' + escapeHTML(S.explainedHeading) + "</div>" + expl + "</div></div>" +
      '<div class="bt-detail-pair-col">' + capBreakdown(entry) + "</div></div>";
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
        "<strong>" + (r.limit === "context" ? "—" : escapeHTML(S.capUsers(r.atLeast ? r.shown + "+" : "~" + r.shown))) + "</strong>" +
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

    if (only) {
      container.innerHTML = '<div class="bt-table-wrap bt-single" id="bt-table-wrap"></div>' +
        '<div class="bt-tooltip" id="bt-tooltip" role="tooltip" hidden></div>';
      wireTooltips(container);
      renderTable(container);
      return;
    }

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
    if (only) return rawData.benchmarks.filter(function (e) { return e.id === only; });
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
      var isExpanded = only ? true : !!expanded[entry.id];

      html += only ? '<tr class="bt-row" data-id="' + escapeHTML(entry.id) + '">' :
        '<tr class="bt-row" data-id="' + escapeHTML(entry.id) + '" tabindex="0" role="button" aria-expanded="' +
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

      /* A plus when even the highest tested level met the targets: the real
         maximum was not reached, so Max C is a minimum. */
      var maxCOpen = maxC > 0 && maxC === highestTestedC(entry);
      html += maxCOpen ?
        '<td class="bt-num" title="' + escapeHTML(S.maxcAtLeast(maxC)) + '">' + maxC + "+</td>" :
        '<td class="bt-num">' + (maxC > 0 ? maxC : '<span class="bt-muted">0</span>') + "</td>";
      html += capCell(entry, "chat");
      html += capCell(entry, "agentic");
      html += '<td class="bt-num">' + (entry.tp != null && entry.tp !== 1 ? entry.tp : '<span class="bt-muted">—</span>') + "</td>";
      html += '<td class="bt-num">' + (entry.dp != null && entry.dp !== 1 ? entry.dp : '<span class="bt-muted">—</span>') + "</td>";
      html += '<td class="bt-num">' + (entry.pp != null && entry.pp !== 1 ? entry.pp : '<span class="bt-muted">—</span>') + "</td>";
      html += '<td class="bt-left">' + escapeHTML(entry.engine) + "</td>";
      html += entry.mtp ? '<td class="bt-mtp-yes">' + escapeHTML(S.yes) + "</td>" : '<td class="bt-muted">—</td>';
      html += '<td class="bt-expand-cell">' + (only ? "" : isExpanded ? "&#9660;" : "&#9654;") + "</td>";
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

        html += detailPair(entry);

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

  /* ── Carrying the view across a language switch ── */

  /* Everything the reader has set, as plain data. The site's language switcher
     stores it before leaving and hands it to the other language's page as
     window.ozCarry.bt; restore() puts it back. */
  var SLIDERS = ["#bt-min-tps", "#bt-max-ttft", "#bt-min-chat", "#bt-min-agentic", "#bt-min-params"];

  function snapshot() {
    var container = document.querySelector(".bt-container");
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
      devices: state.devices.slice(), quants: state.quants.slice(), mtp: state.mtp,
      concurrency: state.concurrency, sortCol: sortCol, sortDir: sortDir, expanded: open,
      config: JSON.parse(JSON.stringify(config)), sliders: sliders, models: models,
      search: container.querySelector("#bt-model-search").value,
      targetsOpen: !container.querySelector("#bt-targets-body").hidden
    };
  }

  function restore(container, s) {
    try {
      state.devices = s.devices || []; state.quants = s.quants || [];
      state.mtp = s.mtp || "all"; state.concurrency = s.concurrency || 1;
      if (s.sortCol) { sortCol = s.sortCol; sortDir = s.sortDir || "desc"; }
      repaint.device(); repaint.quant();
      container.querySelectorAll("[data-mtp]").forEach(function (b) {
        b.classList.toggle("bt-active", b.getAttribute("data-mtp") === state.mtp);
      });
      container.querySelectorAll("[data-conc]").forEach(function (b) {
        b.classList.toggle("bt-active", b.getAttribute("data-conc") === String(state.concurrency));
      });
      SLIDERS.forEach(function (sel) {
        if (s.sliders && s.sliders[sel] != null) container.querySelector(sel).value = s.sliders[sel];
      });
      var allCb = container.querySelector("#bt-model-all");
      allCb.checked = !s.models;
      container.querySelectorAll(".bt-model-cb").forEach(function (cb) {
        cb.checked = !s.models || s.models.indexOf(cb.getAttribute("data-model")) > -1;
      });
      var search = container.querySelector("#bt-model-search");
      search.value = s.search || "";
      search.dispatchEvent(new Event("input"));
      if (s.config) for (var k in s.config) if (config.hasOwnProperty(k)) config[k] = s.config[k];
      NUMBER_TARGETS.forEach(function (k) { container.querySelector("#bt-assump-" + k).value = shownTarget(k); });
      CONTEXT_TARGETS.forEach(function (k) {
        var sel = container.querySelector("#bt-assump-" + k);
        if (!sel.querySelector('option[value="' + config[k] + '"]')) {
          var o = document.createElement("option");
          o.value = config[k]; o.textContent = fmtTokens(config[k]) + " (" + fmtInt(config[k]) + ")";
          sel.appendChild(o);
        }
        sel.value = String(config[k]);
      });
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
    window.BenchmarkTable = { init: init, snapshot: snapshot };
  }

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", function () {
      init();
    });
  }
})();
