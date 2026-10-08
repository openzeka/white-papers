/* ── Device Advisor — vanilla JS, zero dependencies ──
 *
 * Answers one question from measured data: "I have N cameras of this size and
 * I want to run this vision-language model — which device, and what does the
 * stream actually look like?"
 *
 * Two halves:
 *
 *   The advisor reads /assets/data/vlm-benchmarks.json (the same combined file
 *   the VLM explorer reads, built by _plugins/bench_store.rb) and ranks the
 *   devices that were measured with the chosen model at the chosen workload.
 *
 *   The stage then plays that answer back as a timeline, lane per camera. The
 *   timeline is the Cordatus watch-room monitor (custom_engine_vlm/monitor)
 *   with its event source replaced: instead of a live SSE feed it is driven by
 *   a scheduler built from the measurement. Nothing is running behind it — it
 *   is a projection of numbers already on this site, drawn at wall-clock speed.
 *
 * Unlike the explorers' three-file split, this file carries all three
 * languages in one I18N table. The timeline code it is built on already did,
 * and triplicating ~1200 lines so the same strings could drift apart in three
 * places would be the worse trade. The page passes its language in
 * data-da-lang.
 */
(function () {
  "use strict";

  /* ══════════════════════════════════════════════════════════════════════
     UI STRINGS — the only block that differs between languages.
     ══════════════════════════════════════════════════════════════════════ */

  var I18N = {
    en: {
      loading: "Loading benchmarks…",
      loadFailed: "Failed to load benchmark data: ",

      lblModel: "Model",
      lblRes: "Image size",
      lblCams: "Cameras",
      lblMore: "More options",
      lblFewer: "Fewer options",
      lblFrames: "Frames per request",
      lblTarget: "Response target",
      lblFps: "Camera frame rate",
      unitS: "s",
      unitFps: "FPS",

      noteOneCameraBoth: "2K, and requests carrying more than one frame, were measured with one camera only — the camera count is held at 1.",
      noteOneCamera2K: "2K was measured with one camera only, so the camera count is held at 1.",
      noteOneCameraFrames: "Requests carrying more than one frame were measured with one camera only, so the camera count is held at 1.",
      noteNoMulti: "This model has no measurement beyond {n} cameras at this image size.",

      kickerBest: "Recommended device",
      kickerShown: "Showing",
      kickerNone: "Nothing meets your target",
      verdictOk: "The smallest device measured with this model that answers every camera within {target} s.",
      verdictFail: "No device measured with this model answers {cams} cameras within {target} s at this image size. The closest is shown; raise the target or lower the camera count.",
      verdictShown: "Not the recommendation — you picked this one.",
      noRuns: "No run of {model} was measured at {res} with {cams} {camWord}. Try another image size or fewer cameras.",

      statStart: "Answer starts after",
      statCycle: "Answer every",
      statPerCam: "Per camera",
      statTotal: "All {n} cameras",
      statCoverage: "Frames the model sees",
      perMin: "/min",
      answersPerMin: "answers{perMin}",
      coverage: "1 in {n}",
      coverageSub: "of {fps} captured each second",
      startSub: "time to first token",
      cycleSub: "wait + writing {n} tokens",

      devicesTitle: "Devices measured with this model",
      devicesHint: "Smallest device that meets the target first. Click one to play its flow.",
      tagEst: "est.",
      tagBest: "pick",
      devPass: "within target",
      devFail: "over target",
      devEstWhy: "interpolated between {a} and {b} cameras",
      devExactWhy: "measured at {n} {camWord}",
      camera: "camera",
      cameras: "cameras",

      stageTitle: "Projected flow",
      stageSub: "{model} · {device} · {res} · {cams} {camWord}",
      pauseLive: "Pause",
      pausePaused: "Resume",
      animLabel: "Animation",
      full: "Fullscreen",
      exitFull: "Exit fullscreen",
      colCamera: "Camera",
      camName: "Camera {n}",
      laneMeta: "{res} · {n}/req",

      hWait: "Answer starts after",
      hCycle: "Answer every",
      hRate: "Answers/min",
      hFrames: "Frames/req",

      legendRowVlm: "Upper row · model",
      legendRowCollect: "Lower row · camera",
      legendActive: "Dark: up to the first token (TTFT)",
      legendWriting: "Light: writing the answer, {n} tokens",
      legendDone: "Finished",
      legendLate: "Answer later than the target",
      legendCollect: "Frames piling up for the next request",
      legendArrow: "Frames picked and sent to the model",
      rowVlm: "Model",
      rowCollect: "Frames",
      engineName: "Model engine",
      clientName: "Client",
      ready: "idle",
      processing: "working…"
    },

    tr: {
      loading: "Ölçümler yükleniyor…",
      loadFailed: "Ölçüm verisi yüklenemedi: ",

      lblModel: "Model",
      lblRes: "Görüntü boyutu",
      lblCams: "Kamera",
      lblMore: "Diğer seçenekler",
      lblFewer: "Seçenekleri gizle",
      lblFrames: "İstek başına kare",
      lblTarget: "Yanıt hedefi",
      lblFps: "Kamera kare hızı",
      unitS: "sn",
      unitFps: "FPS",

      noteOneCameraBoth: "2K ve birden fazla kare taşıyan istekler yalnızca tek kamerayla ölçüldü — kamera sayısı 1'de tutuluyor.",
      noteOneCamera2K: "2K yalnızca tek kamerayla ölçüldü; bu yüzden kamera sayısı 1'de tutuluyor.",
      noteOneCameraFrames: "Birden fazla kare taşıyan istekler yalnızca tek kamerayla ölçüldü; bu yüzden kamera sayısı 1'de tutuluyor.",
      noteNoMulti: "Bu modelin bu görüntü boyutunda {n} kameradan fazlası için ölçümü yok.",

      kickerBest: "Önerilen cihaz",
      kickerShown: "Gösterilen",
      kickerNone: "Hedefi tutan cihaz yok",
      verdictOk: "Bu modelle ölçülmüş, her kamerayı {target} sn içinde yanıtlayan en küçük cihaz.",
      verdictFail: "Bu modelle ölçülen hiçbir cihaz, bu görüntü boyutunda {cams} kamerayı {target} sn içinde yanıtlamıyor. En yakını gösteriliyor; hedefi yükseltin ya da kamera sayısını düşürün.",
      verdictShown: "Öneri değil — bunu siz seçtiniz.",
      noRuns: "{model} modelinin {res} boyutunda {cams} kamerayla ölçümü yok. Başka bir görüntü boyutu ya da daha az kamera deneyin.",

      statStart: "Yanıt şu süre sonra başlar",
      statCycle: "Yanıt sıklığı",
      statPerCam: "Kamera başına",
      statTotal: "{n} kameranın toplamı",
      statCoverage: "Modele ulaşan kare",
      perMin: "/dk",
      answersPerMin: "yanıt{perMin}",
      coverage: "{n} karede 1",
      coverageSub: "saniyede yakalanan {fps} karenin",
      startSub: "ilk token süresi",
      cycleSub: "bekleme + {n} token yazma",

      devicesTitle: "Bu modelle ölçülmüş cihazlar",
      devicesHint: "Hedefi tutan en küçük cihaz başta. Akışını oynatmak için birine tıklayın.",
      tagEst: "tahmini",
      tagBest: "öneri",
      devPass: "hedef içinde",
      devFail: "hedefin üstünde",
      devEstWhy: "{a} ve {b} kamera arasından hesaplandı",
      devExactWhy: "{n} {camWord} ile ölçüldü",
      camera: "kamera",
      cameras: "kamera",

      stageTitle: "Beklenen akış",
      stageSub: "{model} · {device} · {res} · {cams} {camWord}",
      pauseLive: "Duraklat",
      pausePaused: "Devam et",
      animLabel: "Animasyon",
      full: "Tam ekran",
      exitFull: "Tam ekrandan çık",
      colCamera: "Kamera",
      camName: "Kamera {n}",
      laneMeta: "{res} · {n}/istek",

      hWait: "Yanıt şu süre sonra başlar",
      hCycle: "Yanıt sıklığı",
      hRate: "Yanıt/dk",
      hFrames: "Kare/istek",

      legendRowVlm: "Üst satır · model",
      legendRowCollect: "Alt satır · kamera",
      legendActive: "Koyu: ilk token'a kadar (TTFT)",
      legendWriting: "Açık: yanıtın yazılması, {n} token",
      legendDone: "Tamamlandı",
      legendLate: "Yanıt hedeften geç geldi",
      legendCollect: "Sonraki istek için kareler birikiyor",
      legendArrow: "Seçilen kareler modele gönderildi",
      rowVlm: "Model",
      rowCollect: "Kare",
      engineName: "Model motoru",
      clientName: "İstemci",
      ready: "boşta",
      processing: "işliyor…"
    },

    nl: {
      loading: "Metingen laden…",
      loadFailed: "Laden van de meetgegevens is mislukt: ",

      lblModel: "Model",
      lblRes: "Beeldformaat",
      lblCams: "Camera's",
      lblMore: "Meer opties",
      lblFewer: "Minder opties",
      lblFrames: "Frames per verzoek",
      lblTarget: "Responsdoel",
      lblFps: "Beeldsnelheid camera",
      unitS: "s",
      unitFps: "FPS",

      noteOneCameraBoth: "2K, en verzoeken met meer dan één frame, zijn alleen met één camera gemeten — het aantal camera's blijft op 1.",
      noteOneCamera2K: "2K is alleen met één camera gemeten, dus het aantal camera's blijft op 1.",
      noteOneCameraFrames: "Verzoeken met meer dan één frame zijn alleen met één camera gemeten, dus het aantal camera's blijft op 1.",
      noteNoMulti: "Voor dit model is er bij dit beeldformaat geen meting boven {n} camera's.",

      kickerBest: "Aanbevolen apparaat",
      kickerShown: "Weergegeven",
      kickerNone: "Niets haalt uw doel",
      verdictOk: "Het kleinste met dit model gemeten apparaat dat elke camera binnen {target} s antwoordt.",
      verdictFail: "Geen met dit model gemeten apparaat antwoordt {cams} camera's binnen {target} s bij dit beeldformaat. Het dichtstbijzijnde staat hier; verhoog het doel of neem minder camera's.",
      verdictShown: "Niet de aanbeveling — u koos dit zelf.",
      noRuns: "Er is geen meting van {model} bij {res} met {cams} {camWord}. Probeer een ander beeldformaat of minder camera's.",

      statStart: "Antwoord begint na",
      statCycle: "Antwoord elke",
      statPerCam: "Per camera",
      statTotal: "Alle {n} camera's",
      statCoverage: "Frames die het model ziet",
      perMin: "/min",
      answersPerMin: "antwoorden{perMin}",
      coverage: "1 op {n}",
      coverageSub: "van {fps} per seconde vastgelegd",
      startSub: "tijd tot eerste token",
      cycleSub: "wachten + {n} tokens schrijven",

      devicesTitle: "Met dit model gemeten apparaten",
      devicesHint: "Het kleinste apparaat dat het doel haalt staat vooraan. Klik er een aan om de stroom te spelen.",
      tagEst: "schatting",
      tagBest: "keuze",
      devPass: "binnen het doel",
      devFail: "boven het doel",
      devEstWhy: "geïnterpoleerd tussen {a} en {b} camera's",
      devExactWhy: "gemeten bij {n} {camWord}",
      camera: "camera",
      cameras: "camera's",

      stageTitle: "Verwachte stroom",
      stageSub: "{model} · {device} · {res} · {cams} {camWord}",
      pauseLive: "Pauzeren",
      pausePaused: "Doorgaan",
      animLabel: "Animatie",
      full: "Volledig scherm",
      exitFull: "Volledig scherm sluiten",
      colCamera: "Camera",
      camName: "Camera {n}",
      laneMeta: "{res} · {n}/verz.",

      hWait: "Antwoord begint na",
      hCycle: "Antwoord elke",
      hRate: "Antwoorden/min",
      hFrames: "Frames/verz.",

      legendRowVlm: "Bovenste rij · model",
      legendRowCollect: "Onderste rij · camera",
      legendActive: "Donker: tot het eerste token (TTFT)",
      legendWriting: "Licht: het antwoord schrijven, {n} tokens",
      legendDone: "Voltooid",
      legendLate: "Antwoord later dan het doel",
      legendCollect: "Frames stapelen zich op voor het volgende verzoek",
      legendArrow: "Gekozen frames naar het model gestuurd",
      rowVlm: "Model",
      rowCollect: "Frames",
      engineName: "Modelmotor",
      clientName: "Client",
      ready: "inactief",
      processing: "bezig…"
    }
  };

  var LANG = "en";
  function t(key) {
    var pack = I18N[LANG] || I18N.en;
    var v = pack[key];
    return v === undefined ? (I18N.en[key] === undefined ? key : I18N.en[key]) : v;
  }
  /* t("x", {n: 3}) — {n} placeholders, so a sentence keeps its word order in
     every language instead of being glued together from fragments. */
  function tf(key, vars) {
    return t(key).replace(/\{(\w+)\}/g, function (m, k) {
      return vars && vars[k] !== undefined ? String(vars[k]) : m;
    });
  }
  function camWord(n) { return n === 1 ? t("camera") : t("cameras"); }

  /* ══════════════════════════════════════════════════════════════════════
     Constants and small helpers
     ══════════════════════════════════════════════════════════════════════ */

  var RES_ORDER = ["480p", "720p", "1080p", "2K"];
  var FRAME_CHOICES = [1, 3, 5];
  var DEFAULT_RES = "720p";
  var DEFAULT_TARGET_S = 3;
  var DEFAULT_MAX_TOKENS = 128;
  /* The cameras' own frame rate is not something the VLM benchmark measures —
     it only ever sent still images. It is an input here because it is what
     turns "one request every 4 s" into "the model sees one frame in eighty",
     and 20 FPS is the rate the CV benchmark's live cameras stream at. */
  var DEFAULT_CAMERA_FPS = 20;
  var MAX_CAMERAS = 16;

  /* Smallest first. "Recommended" means the least hardware that does the job,
     which is the question someone choosing a device is actually asking.
     
     Derived from the data rather than from a list of device names: `unified`
     marks the embedded modules, which are a class below any discrete card, and
     memory size orders within a class. A hardcoded list was wrong within a week
     — the devices gained their memory sizes in their names upstream
     ("Jetson AGX Orin" became "Jetson AGX Orin 32GB") and every renamed device
     silently sorted last, which is the one failure the reader cannot see.
     
     Equal class and equal memory (the two RTX PRO 6000 editions) is left as a
     tie for the caller to break on response time. */
  function deviceRank(name) {
    var d = DATA && DATA.devices ? DATA.devices[name] : null;
    if (!d) return { klass: 2, mem: Infinity };
    return {
      klass: d.unified ? 0 : 1,
      mem: typeof d.memory_gb === "number" ? d.memory_gb : Infinity
    };
  }
  function compareDevices(a, b) {
    var ra = deviceRank(a), rb = deviceRank(b);
    return (ra.klass - rb.klass) || (ra.mem - rb.mem);
  }

  function escapeHTML(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  /* Seconds here span 0.05 to 100: two decimals where they carry information,
     one where they would only be noise. */
  function fmtS(v) {
    if (v === null || v === undefined || !isFinite(v)) return "—";
    return Number(v).toFixed(v < 10 ? (v < 1 ? 2 : 1) : 0);
  }
  function fmtN(v, d) {
    if (v === null || v === undefined || !isFinite(v)) return "—";
    return Number(v).toFixed(d === undefined ? 1 : d);
  }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  /* ══════════════════════════════════════════════════════════════════════
     Reading a measurement
     ══════════════════════════════════════════════════════════════════════ */

  /* Every point of one run at one image size and one frame count, by camera
     count. The sweep is 1, 2, 4, 8, 16 where it exists at all. */
  function sweepOf(run, res, images) {
    var pts = [];
    for (var i = 0; i < run.data_points.length; i++) {
      var p = run.data_points[i];
      if (p.res === res && p.images === images) pts.push(p);
    }
    pts.sort(function (a, b) { return a.c - b.c; });
    return pts;
  }

  /* The run's response time and token rate at `cams`.
   *
   * An exact measurement is used as it stands. Between two measured camera
   * counts the figures are interpolated on a log2 axis, because that is the
   * axis the sweep was taken on (1, 2, 4, 8, 16) and response time grows
   * roughly linearly along it.
   *
   * Outside the measured range it returns null rather than extrapolating. A
   * device's behaviour past the last count it was tested at is exactly the
   * thing this page must not invent — that is what the measurement was for. */
  function readAt(run, res, images, cams) {
    var pts = sweepOf(run, res, images);
    if (!pts.length) return null;
    for (var i = 0; i < pts.length; i++) {
      if (pts[i].c === cams) {
        return { ttft: pts[i].ttft_s, tps: pts[i].tps, exact: true, lo: cams, hi: cams, max: pts[pts.length - 1].c };
      }
    }
    if (cams < pts[0].c || cams > pts[pts.length - 1].c) return null;
    var a = pts[0], b = pts[pts.length - 1];
    for (var j = 0; j < pts.length - 1; j++) {
      if (pts[j].c < cams && pts[j + 1].c > cams) { a = pts[j]; b = pts[j + 1]; break; }
    }
    var w = (Math.log(cams) - Math.log(a.c)) / (Math.log(b.c) - Math.log(a.c));
    return {
      ttft: a.ttft_s + (b.ttft_s - a.ttft_s) * w,
      tps: a.tps + (b.tps - a.tps) * w,
      exact: false, lo: a.c, hi: b.c, max: pts[pts.length - 1].c
    };
  }

  /* The highest camera count any run of this model was measured at, for this
     image size and frame count — the honest ceiling of the camera slider. */
  function measuredCeiling(runs, res, images) {
    var top = 0;
    for (var i = 0; i < runs.length; i++) {
      var pts = sweepOf(runs[i], res, images);
      if (pts.length && pts[pts.length - 1].c > top) top = pts[pts.length - 1].c;
    }
    return top;
  }

  /* What one camera actually gets, derived from one reading.
   *
   * A camera sends its next request as soon as the previous one is answered —
   * the assumption the benchmark itself was taken under, and the reason the
   * camera count is also the number of requests in flight. So one cycle is the
   * wait for the answer to start plus the time to write it. */
  function project(reading, maxTokens, cams, images, fps, targetS) {
    var write = maxTokens / reading.tps;
    var cycle = reading.ttft + write;
    return {
      ttft: reading.ttft,
      tps: reading.tps,
      write: write,
      cycle: cycle,
      perMin: 60 / cycle,
      totalPerMin: (60 / cycle) * cams,
      /* One request carries `images` frames out of everything the camera
         captured while the previous answer was being produced. */
      framesCaptured: cycle * fps,
      coverage: Math.max(1, Math.round((cycle * fps) / images)),
      meets: reading.ttft <= targetS,
      exact: reading.exact,
      lo: reading.lo, hi: reading.hi
    };
  }

  /* ══════════════════════════════════════════════════════════════════════
     State
     ══════════════════════════════════════════════════════════════════════ */

  var DATA = null;          // the combined vlm-benchmarks.json
  var MAX_TOKENS = DEFAULT_MAX_TOKENS;
  var RES_DIMS = {};        // "720p" -> "1280×720"
  var MODELS = [];          // model names that have at least one run, sorted

  var sel = {
    model: null,
    res: DEFAULT_RES,
    cams: 4,
    /* What the reader last asked for, as opposed to what the measurements
       currently allow. Peeking at 2K pins the count at 1; without this,
       coming back to 720p would leave it there and look like the lock had
       stuck. */
    camsWanted: 4,
    images: 1,
    target: DEFAULT_TARGET_S,
    fps: DEFAULT_CAMERA_FPS,
    device: null,           // null = follow the recommendation
    advanced: false
  };

  var root = null;          // [data-da-src] container
  var elPanel, elVerdict, elDevices, elStage;
  var current = null;       // the ranked list + the chosen candidate, after rank()

  function runsForModel(model) {
    var out = [];
    for (var i = 0; i < DATA.benchmarks.length; i++) {
      if (DATA.benchmarks[i].model === model) out.push(DATA.benchmarks[i]);
    }
    return out;
  }

  /* ══════════════════════════════════════════════════════════════════════
     Ranking the devices
     ══════════════════════════════════════════════════════════════════════ */

  /* One candidate per device: of that device's runs of this model, the one
     that answers soonest at the selected workload. (A model is often served on
     the same device at two quantizations or under two engines, and the reader
     is choosing a device, not a build — so the device is represented by its
     best showing, with the build it came from named on the card.)
  
     Ordering: everything that meets the target first, smallest device first,
     because the useful recommendation is the least hardware that does the job
     rather than the fastest machine in the lab. Everything that misses follows,
     soonest answer first, so a near miss is visible. */
  function rank() {
    var runs = runsForModel(sel.model);
    var byDevice = {};

    for (var i = 0; i < runs.length; i++) {
      var run = runs[i];
      var reading = readAt(run, sel.res, sel.images, sel.cams);
      if (!reading) continue;
      var p = project(reading, MAX_TOKENS, sel.cams, sel.images, sel.fps, sel.target);
      var cand = { run: run, device: run.device, proj: p };
      var held = byDevice[run.device];
      if (!held || p.ttft < held.proj.ttft) byDevice[run.device] = cand;
    }

    var list = [];
    for (var d in byDevice) if (byDevice.hasOwnProperty(d)) list.push(byDevice[d]);

    list.sort(function (a, b) {
      if (a.proj.meets !== b.proj.meets) return a.proj.meets ? -1 : 1;
      if (a.proj.meets) {
        var byDevice = compareDevices(a.device, b.device);
        if (byDevice) return byDevice;
      }
      return a.proj.ttft - b.proj.ttft;
    });

    var chosen = null;
    if (sel.device) {
      for (var k = 0; k < list.length; k++) if (list[k].device === sel.device) { chosen = list[k]; break; }
    }
    var isPick = false;
    if (!chosen) { chosen = list[0] || null; isPick = true; }

    current = { list: list, chosen: chosen, chosenIsRecommendation: isPick, recommended: list[0] || null };
    return current;
  }

  /* ══════════════════════════════════════════════════════════════════════
     The question
     ══════════════════════════════════════════════════════════════════════ */

  /* Image sizes and frame counts a model has any multi-camera measurement for.
     2K and multi-frame requests were only ever taken with one camera, so
     picking them pins the camera count at 1 rather than silently showing a
     one-camera figure under a sixteen-camera label. */
  function multiCameraAllowed() { return sel.images === 1 && sel.res !== "2K"; }
  /* Say which of the two limits is actually biting. One combined sentence read
     as a 2K warning to anyone who had not picked 2K. */
  function oneCameraReason() {
    if (sel.res === "2K" && sel.images > 1) return t("noteOneCameraBoth");
    if (sel.res === "2K") return t("noteOneCamera2K");
    return t("noteOneCameraFrames");
  }

  function buildPanel() {
    elPanel.innerHTML = "";

    /* ── model ── */
    var rowModel = el("div", "da-row");
    rowModel.appendChild(el("span", "da-label", escapeHTML(t("lblModel"))));
    var fModel = el("div", "da-field");
    var selModel = el("select", "da-select");
    selModel.setAttribute("aria-label", t("lblModel"));
    for (var i = 0; i < MODELS.length; i++) {
      var o = document.createElement("option");
      o.value = MODELS[i];
      var meta = DATA.models[MODELS[i]];
      o.textContent = MODELS[i] + (meta && meta.params ? " · " + meta.params : "");
      if (MODELS[i] === sel.model) o.selected = true;
      selModel.appendChild(o);
    }
    selModel.addEventListener("change", function () {
      sel.model = selModel.value;
      sel.device = null;        // the recommendation is for the new model, not the old device
      clampCameras();
      render();
    });
    fModel.appendChild(selModel);
    rowModel.appendChild(fModel);
    elPanel.appendChild(rowModel);

    /* ── image size ── */
    var runs = runsForModel(sel.model);
    var rowRes = el("div", "da-row");
    rowRes.appendChild(el("span", "da-label", escapeHTML(t("lblRes"))));
    var fRes = el("div", "da-field");
    RES_ORDER.forEach(function (res) {
      var b = el("button", "da-btn");
      b.type = "button";
      b.textContent = res + (RES_DIMS[res] ? " · " + RES_DIMS[res] : "");
      if (res === sel.res) b.classList.add("da-active");
      /* Dimmed means: no run of this model was measured at this size with the
         current frame count. Still clickable — the dimming is the answer. */
      if (!measuredCeiling(runs, res, sel.images)) b.classList.add("da-na");
      b.addEventListener("click", function () {
        sel.res = res; sel.device = null; clampCameras(); render();
      });
      fRes.appendChild(b);
    });
    rowRes.appendChild(fRes);
    elPanel.appendChild(rowRes);

    /* ── cameras ── */
    var ceiling = Math.min(MAX_CAMERAS, measuredCeiling(runs, sel.res, sel.images) || 1);
    var rowCams = el("div", "da-row");
    rowCams.appendChild(el("span", "da-label", escapeHTML(t("lblCams"))));
    var fCams = el("div", "da-cams");
    var slider = document.createElement("input");
    slider.type = "range";
    slider.min = "1";
    slider.max = String(Math.max(1, ceiling));
    slider.step = "1";
    slider.value = String(sel.cams);
    slider.disabled = ceiling <= 1;
    slider.setAttribute("aria-label", t("lblCams"));
    var out = el("span", "da-cams-value mono", String(sel.cams));
    slider.addEventListener("input", function () {
      sel.cams = sel.camsWanted = parseInt(slider.value, 10);
      out.textContent = String(sel.cams);
    });
    /* Redraw on release, not on every pixel of the drag: each change rebuilds
       the lanes and reseeds the timeline, which is not a per-frame job. */
    slider.addEventListener("change", function () {
      sel.cams = sel.camsWanted = parseInt(slider.value, 10);
      sel.device = null;
      render();
    });
    fCams.appendChild(slider);
    fCams.appendChild(out);
    rowCams.appendChild(fCams);
    if (!multiCameraAllowed()) {
      rowCams.appendChild(el("p", "da-note da-note-warn", escapeHTML(oneCameraReason())));
    } else if (ceiling < MAX_CAMERAS) {
      rowCams.appendChild(el("p", "da-note", escapeHTML(tf("noteNoMulti", { n: ceiling }))));
    }
    elPanel.appendChild(rowCams);

    /* ── everything else, folded away ── */
    var rowMore = el("div", "da-row");
    var toggle = el("button", "da-adv-toggle");
    toggle.type = "button";
    toggle.textContent = sel.advanced ? t("lblFewer") : t("lblMore");
    toggle.setAttribute("aria-expanded", sel.advanced ? "true" : "false");
    toggle.addEventListener("click", function () { sel.advanced = !sel.advanced; render(); });
    rowMore.appendChild(toggle);
    elPanel.appendChild(rowMore);

    if (!sel.advanced) return;

    var rowFrames = el("div", "da-row");
    rowFrames.appendChild(el("span", "da-label", escapeHTML(t("lblFrames"))));
    var fFrames = el("div", "da-field");
    FRAME_CHOICES.forEach(function (n) {
      var b = el("button", "da-btn");
      b.type = "button";
      b.textContent = String(n);
      if (n === sel.images) b.classList.add("da-active");
      if (!measuredCeiling(runs, sel.res, n)) b.classList.add("da-na");
      b.addEventListener("click", function () {
        sel.images = n; sel.device = null; clampCameras(); render();
      });
      fFrames.appendChild(b);
    });
    rowFrames.appendChild(fFrames);
    elPanel.appendChild(rowFrames);

    var rowTarget = el("div", "da-row");
    rowTarget.appendChild(el("span", "da-label", escapeHTML(t("lblTarget"))));
    var fTarget = el("div", "da-field");
    var inTarget = document.createElement("input");
    inTarget.type = "number"; inTarget.className = "da-num";
    inTarget.min = "0.1"; inTarget.step = "0.5"; inTarget.value = String(sel.target);
    inTarget.setAttribute("aria-label", t("lblTarget"));
    inTarget.addEventListener("change", function () {
      var v = parseFloat(inTarget.value);
      if (isFinite(v) && v > 0) { sel.target = v; sel.device = null; render(); }
      else inTarget.value = String(sel.target);
    });
    fTarget.appendChild(inTarget);
    fTarget.appendChild(el("span", "da-unit", escapeHTML(t("unitS"))));
    rowTarget.appendChild(fTarget);
    elPanel.appendChild(rowTarget);

    var rowFps = el("div", "da-row");
    rowFps.appendChild(el("span", "da-label", escapeHTML(t("lblFps"))));
    var fFps = el("div", "da-field");
    var inFps = document.createElement("input");
    inFps.type = "number"; inFps.className = "da-num";
    inFps.min = "1"; inFps.max = "120"; inFps.step = "1"; inFps.value = String(sel.fps);
    inFps.setAttribute("aria-label", t("lblFps"));
    inFps.addEventListener("change", function () {
      var v = parseInt(inFps.value, 10);
      if (isFinite(v) && v > 0) { sel.fps = v; render(); }
      else inFps.value = String(sel.fps);
    });
    fFps.appendChild(inFps);
    fFps.appendChild(el("span", "da-unit", escapeHTML(t("unitFps"))));
    rowFps.appendChild(fFps);
    elPanel.appendChild(rowFps);
  }

  function clampCameras() {
    if (!multiCameraAllowed()) { sel.cams = 1; return; }
    var ceiling = Math.min(MAX_CAMERAS, measuredCeiling(runsForModel(sel.model), sel.res, sel.images) || 1);
    /* Come back up to what was asked for, as far as this selection was
       measured — never past it. */
    sel.cams = Math.max(1, Math.min(sel.camsWanted, ceiling));
  }

  /* ══════════════════════════════════════════════════════════════════════
     The answer
     ══════════════════════════════════════════════════════════════════════ */

  function buildVerdict(r) {
    elVerdict.innerHTML = "";
    if (!r.chosen) {
      elVerdict.setAttribute("data-ok", "0");
      elVerdict.appendChild(el("p", "da-verdict-line", escapeHTML(tf("noRuns", {
        model: sel.model, res: sel.res, cams: sel.cams, camWord: camWord(sel.cams)
      }))));
      return;
    }

    var c = r.chosen, p = c.proj;
    elVerdict.setAttribute("data-ok", p.meets ? "1" : "0");

    var head = el("div", "da-verdict-head");
    var kicker = r.chosenIsRecommendation
      ? (p.meets ? t("kickerBest") : t("kickerNone"))
      : t("kickerShown");
    head.appendChild(el("span", "da-verdict-kicker", escapeHTML(kicker)));
    head.appendChild(el("span", "da-verdict-device", escapeHTML(c.device)));
    head.appendChild(el("span", "da-verdict-spec",
      escapeHTML(c.run.quantization + " · " + c.run.engine)));
    elVerdict.appendChild(head);

    var line;
    if (!r.chosenIsRecommendation) line = t("verdictShown");
    else if (p.meets) line = tf("verdictOk", { target: fmtS(sel.target) });
    else line = tf("verdictFail", { cams: sel.cams, target: fmtS(sel.target) });
    elVerdict.appendChild(el("p", "da-verdict-line", escapeHTML(line)));

    /* The five numbers the page exists to produce. */
    var stats = el("div", "da-stats");
    stats.appendChild(stat(t("statStart"), fmtS(p.ttft) + " " + t("unitS"),
      t("startSub"), p.meets ? "ok" : "bad"));
    stats.appendChild(stat(t("statCycle"), fmtS(p.cycle) + " " + t("unitS"),
      tf("cycleSub", { n: MAX_TOKENS }), null));
    stats.appendChild(stat(t("statPerCam"), fmtN(p.perMin, p.perMin < 10 ? 1 : 0),
      tf("answersPerMin", { perMin: t("perMin") }), null));
    stats.appendChild(stat(tf("statTotal", { n: sel.cams }), fmtN(p.totalPerMin, p.totalPerMin < 10 ? 1 : 0),
      tf("answersPerMin", { perMin: t("perMin") }), null));
    stats.appendChild(stat(t("statCoverage"), tf("coverage", { n: p.coverage }),
      tf("coverageSub", { fps: sel.fps }), null));
    elVerdict.appendChild(stats);
  }

  function stat(k, v, sub, tone) {
    var s = el("div", "da-stat");
    if (tone) s.setAttribute("data-tone", tone);
    s.appendChild(el("span", "da-stat-k", escapeHTML(k)));
    s.appendChild(el("span", "da-stat-v", escapeHTML(v)));
    if (sub) s.appendChild(el("span", "da-stat-sub", escapeHTML(sub)));
    return s;
  }

  function buildDevices(r) {
    elDevices.innerHTML = "";
    if (!r.list.length) return;

    var head = el("div", "da-devices-head");
    head.appendChild(el("span", "da-devices-title", escapeHTML(t("devicesTitle"))));
    head.appendChild(el("span", "da-devices-hint", escapeHTML(t("devicesHint"))));
    elDevices.appendChild(head);

    var grid = el("div", "da-devices");
    r.list.forEach(function (c, i) {
      var p = c.proj;
      var b = el("button", "da-device");
      b.type = "button";
      b.setAttribute("data-pass", p.meets ? "1" : "0");
      b.setAttribute("aria-pressed", c === r.chosen ? "true" : "false");

      var name = el("div", "da-device-name");
      name.appendChild(el("span", "da-device-rank", String(i + 1)));
      name.appendChild(document.createTextNode(c.device));
      if (c === r.recommended && p.meets) {
        name.appendChild(el("span", "da-tag da-tag-best", escapeHTML(t("tagBest"))));
      }
      if (!p.exact) name.appendChild(el("span", "da-tag da-tag-est", escapeHTML(t("tagEst"))));
      b.appendChild(name);

      b.appendChild(el("div", "da-device-spec",
        escapeHTML(c.run.quantization + " · " + c.run.engine)));
      b.appendChild(el("div", "da-device-figure",
        escapeHTML(fmtS(p.ttft) + " " + t("unitS") + " · " + (p.meets ? t("devPass") : t("devFail")))));
      b.appendChild(el("div", "da-device-why", escapeHTML(p.exact
        ? tf("devExactWhy", { n: sel.cams, camWord: camWord(sel.cams) })
        : tf("devEstWhy", { a: p.lo, b: p.hi }))));

      b.addEventListener("click", function () { sel.device = c.device; render(); });
      grid.appendChild(b);
    });
    elDevices.appendChild(grid);
  }

  /* ══════════════════════════════════════════════════════════════════════
     The stage
     ─────────────────────────────────────────────────────────────────────
     The watch-room monitor's timeline, with its SSE feed replaced by the
     scheduler at the bottom of this section. Everything is positioned in
     "elapsed seconds since the stage was reset": the ruler and every lane
     share one transform, so a band's left edge is simply t × PX.
     ══════════════════════════════════════════════════════════════════════ */

  /* Vertical geometry of one lane, duplicated from the stylesheet because
     elements are positioned by hand. Upper sub-row = the model working,
     lower sub-row = the camera's frames piling up. */
  var Y_BAND_CENTER = 22;    // .da-band top 11 + height 22 / 2
  var Y_ICON_CENTER = 50;    // .da-frame-track top 42 + height 17 / 2
  var ARROW_TOP = 9;         // must match .da-arrow's top
  var ARROW_BOX_W = 30, ARROW_BOX_H = 48;
  /* Where in that box the arrowhead's tip lands, i.e. how far left of the
     dispatch instant the element has to be placed for the tip to sit on it. */
  var ARROW_ANCHOR = 20;
  /* Where the batch comes to rest inside the band, as px right of its left
     edge — sized so the arrowhead's tip meets the bundle's left edge. */
  var BUNDLE_INSET = 15;
  var RIGHT_MARGIN = 56;     // must match .da-now-line's right offset

  var ARROW_GEO = {
    x0: 2,                          // tail, well left of the dispatch instant,
                                    // so the curve reads as an S rather than a
                                    // near-straight diagonal
    y0: Y_ICON_CENTER - ARROW_TOP,  // exactly the frame icons' centreline
    cx: 12,                         // both control points share this x, giving
                                    // horizontal tangents at both ends: the
                                    // curve leaves and arrives along the time
                                    // axis and never doubles back
    x1: 24,
    y1: Y_BAND_CENTER - ARROW_TOP,  // the vertical middle of the band it feeds
    tipX: 28, headBack: 23, headHalf: 4.2
  };
  var ARROW_SVG = (function (g) {
    return '<svg viewBox="0 0 ' + ARROW_BOX_W + ' ' + ARROW_BOX_H + '" width="' + ARROW_BOX_W +
      '" height="' + ARROW_BOX_H + '" fill="none" aria-hidden="true">' +
      '<path d="M' + g.x0 + ' ' + g.y0 + ' C' + g.cx + ' ' + g.y0 + ' ' + g.cx + ' ' + g.y1 +
        ' ' + g.x1 + ' ' + g.y1 + '" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/>' +
      '<path d="M' + g.headBack + ' ' + (g.y1 - g.headHalf) + ' L' + g.tipX + ' ' + g.y1 +
        ' L' + g.headBack + ' ' + (g.y1 + g.headHalf) + ' Z" fill="currentColor"/></svg>';
  })(ARROW_GEO);

  var FRAME_SVG = '<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" stroke-width="2"/><circle cx="8" cy="10" r="1.6" fill="currentColor"/><path d="M4 17l5-5 3 3 4-4 4 4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ANSWER_SVG = '<svg viewBox="0 0 24 24" fill="none"><path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-4 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" fill="none"/><path d="M7 9h10M7 12.5h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

  /* px per second. Geometric, and the starting rung is chosen per
     configuration rather than fixed: a cycle here can be 0.3 s (a small model
     on an RTX PRO 6000) or 50 s (a large one on a Jetson at 1080p), and no
     single scale makes both legible. */
  var ZOOM_LEVELS = [2, 4, 8, 16, 32, 64, 100, 160, 250];
  var PX = 16, zoomIdx = 5;

  var FLIGHT_MS = 620, FLIGHT_LEAD_MS = 180;
  var FLIGHT_STAGGER_MS = 55, FLIGHT_STAGGER_TOTAL_MS = 340, FLIGHT_CURVE_STEPS = 10;
  var ENGINE_PACKET_DELAY_MS = 300;
  /* Above this many lanes the flights stop telling a story and become noise —
     and measurable work, since every dispatch spawns several. The in-flight cap
     is a second, finer budget: four lanes on a 1.7 s cycle put about fifteen
     packets in the air at once, so a lower cap simply switched the animation
     off and left it off. */
  var ANIM_MAX_LANES = 8, ANIM_MAX_INFLIGHT = 24;
  var animUserOn = true;
  var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var MIN_FRAME_ICON_GAP = 18;
  /* Both labels are monospace, so their width is the character count: ~7.5px
     per character at the inside size, ~5.4px at the small one above the band,
     plus a little air. */
  var INSIDE_CH_PX = 7.5, INSIDE_PAD_PX = 16;
  var ABOVE_CH_PX = 5.4, ABOVE_PAD_PX = 8;
  /* What the resting batch icon claims at the band's left edge — wider when it
     carries a ×N badge. Measured off BUNDLE_INSET and the icon's own size. */
  var BUNDLE_RESERVE = 26, BUNDLE_RESERVE_BADGED = 56;
  var CULL_MS = 220;

  /* Stage DOM, created once and kept across configuration changes. */
  var st = {
    built: false, rootEl: null, headSub: null, lanesEl: null,
    rulerTrack: null, rulerViewport: null, nowClock: null,
    zoomLabel: null, zoomOut: null, zoomIn: null,
    pauseBtn: null, pauseLabel: null, animBtn: null, fullBtn: null,
    engineDock: null, engineChip: null, engineState: null,
    clientChip: null, clientState: null, shellEl: null, pipeSvg: null,
    health: {}, overlay: null,
    vpWidth: 900, vpMeasuresLeft: 3,
    originMs: 0, frozenAt: null,
    pruneBehindSec: 300,
    lanes: {},        // camId -> lane state
    camIds: [],
    hiddenFreeze: false,   // frozen because the tab is hidden, not by the reader
    sim: null,        // the scheduler, see resetSim()
    busyCount: 0,
    tickPool: [], tickRangeStart: null
  };
  var TICK_STEP = 5;

  function virtualNowMs() { return st.frozenAt !== null ? st.frozenAt : Date.now(); }
  function elapsedSec() { return (virtualNowMs() - st.originMs) / 1000; }
  function visibleSpanSec() { return Math.max(1, (st.vpWidth - RIGHT_MARGIN) / PX); }
  /* How much history to keep in the DOM.
   *
   * The old rule — whatever the most zoomed-out rung could ever put on screen —
   * was written when the zoom spanned 36 to 80 px/s. Against a 2 px/s rung it
   * asks for about forty minutes, which for a 1.7 s cycle is some thirty
   * thousand nodes that nothing ever paints.
   *
   * So the budget is counted in cycles instead of seconds: forty minutes is six
   * requests for one configuration and two thousand for another, and only the
   * second one fills the browser. Floor is whatever is on screen right now, so
   * zooming out never blanks the lane you are looking at. */
  /* Thirty cycles is about ten times what the default zoom shows and still
     covers three rungs of zooming out, which is as far as anyone goes before
     the bands stop being readable anyway. Sixty put sixteen lanes near eight
     thousand nodes for history nobody was going to look at. */
  var KEEP_CYCLES = 30;
  function historyWindowSec() {
    var reachable = (st.vpWidth - RIGHT_MARGIN) / ZOOM_LEVELS[0] * 1.15;
    var cycle = st.sim && st.sim.proj ? st.sim.proj.cycle : 0;
    var byCycles = cycle > 0 ? KEEP_CYCLES * cycle : reachable;
    return Math.max(visibleSpanSec() * 1.3, Math.min(reachable, byCycles));
  }
  /* The backstop the time ceiling cannot be: a half-second cycle outruns any
     window wide enough to be useful to a two-minute one. Elements are held in
     time order, so this is a drop from the front. */
  var MAX_ELEMENTS_PER_LANE = 300;

  /* ── building the stage shell ── */

  function buildStage() {
    if (st.built) return;
    elStage.className = "da-stage";
    elStage.innerHTML =
      '<div class="da-stage-head">' +
        '<span class="da-stage-title">' + escapeHTML(t("stageTitle")) +
          '<span class="da-stage-sub"></span></span>' +
        '<div class="da-zoom">' +
          '<button type="button" class="da-zoom-out" aria-label="−">−</button>' +
          '<span class="da-zoom-label mono"></span>' +
          '<button type="button" class="da-zoom-in" aria-label="+">+</button>' +
        '</div>' +
        '<button type="button" class="da-ctl da-anim" data-on="1"><span class="dot"></span>' +
          escapeHTML(t("animLabel")) + '</button>' +
        '<button type="button" class="da-ctl da-pause" data-paused="false"><span class="dot"></span>' +
          '<span class="da-pause-label">' + escapeHTML(t("pauseLive")) + '</span></button>' +
        '<button type="button" class="da-ctl da-full">' + escapeHTML(t("full")) + '</button>' +
      '</div>' +
      '<div class="da-health">' +
        chip("cams", t("lblCams")) + chip("wait", t("hWait")) + chip("cycle", t("hCycle")) +
        chip("rate", t("hRate")) + chip("frames", t("hFrames")) +
      '</div>' +
      '<div class="da-legend">' +
        '<span class="da-legend-label">' + escapeHTML(t("legendRowVlm")) + '</span>' +
        '<span class="item"><span class="da-swatch is-active"></span>' + escapeHTML(t("legendActive")) + '</span>' +
        '<span class="item"><span class="da-swatch is-writing"></span>' +
          escapeHTML(tf("legendWriting", { n: MAX_TOKENS })) + '</span>' +
        '<span class="item"><span class="da-swatch is-done"></span>' + escapeHTML(t("legendDone")) + '</span>' +
        '<span class="item"><span class="da-swatch is-late"></span>' + escapeHTML(t("legendLate")) + '</span>' +
        '<span class="da-legend-label">' + escapeHTML(t("legendRowCollect")) + '</span>' +
        '<span class="item"><span class="da-swatch is-collect"></span>' + escapeHTML(t("legendCollect")) + '</span>' +
        '<span class="item"><span class="da-legend-arrow">' +
          '<svg viewBox="0 0 40 26" fill="none" aria-hidden="true">' +
          '<path d="M4 21 C17 21 17 6 24 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/>' +
          '<path d="M22.4 1.8 L31 6 L22.4 10.2 Z" fill="currentColor"/></svg></span>' +
          escapeHTML(t("legendArrow")) + '</span>' +
      '</div>' +
      '<div class="da-shell">' +
        '<div class="da-timeline">' +
          '<div class="da-row-grid da-ruler">' +
            '<div class="da-ruler-gutter">' + escapeHTML(t("colCamera")) + '</div>' +
            '<div class="da-ruler-viewport">' +
              '<div class="da-ruler-track"></div>' +
              '<div class="da-now-line"></div>' +
              '<div class="da-now-clock mono">--:--:--</div>' +
            '</div>' +
          '</div>' +
          '<div class="da-lanes"></div>' +
        '</div>' +
        '<div class="da-dock da-dock-engine">' +
          '<div class="da-dock-chip">VLM</div>' +
          '<span class="da-dock-name">' + escapeHTML(t("engineName")) + '</span>' +
          '<span class="da-dock-state">' + escapeHTML(t("ready")) + '</span>' +
        '</div>' +
        '<div class="da-dock da-dock-client">' +
          '<div class="da-dock-chip">' + ANSWER_SVG + '</div>' +
          '<span class="da-dock-name">' + escapeHTML(t("clientName")) + '</span>' +
          '<span class="da-dock-state">' + escapeHTML(t("ready")) + '</span>' +
        '</div>' +
        '<svg class="da-pipes"></svg>' +
      '</div>';

    var q = function (s) { return elStage.querySelector(s); };
    st.rootEl = elStage;
    st.headSub = q(".da-stage-sub");
    st.lanesEl = q(".da-lanes");
    st.rulerTrack = q(".da-ruler-track");
    st.rulerViewport = q(".da-ruler-viewport");
    st.nowClock = q(".da-now-clock");
    st.zoomLabel = q(".da-zoom-label");
    st.zoomOut = q(".da-zoom-out");
    st.zoomIn = q(".da-zoom-in");
    st.pauseBtn = q(".da-pause");
    st.pauseLabel = q(".da-pause-label");
    st.animBtn = q(".da-anim");
    st.fullBtn = q(".da-full");
    st.engineDock = q(".da-dock-engine");
    st.engineChip = q(".da-dock-engine .da-dock-chip");
    st.engineState = q(".da-dock-engine .da-dock-state");
    st.clientChip = q(".da-dock-client .da-dock-chip");
    st.clientState = q(".da-dock-client .da-dock-state");
    st.shellEl = q(".da-shell");
    st.pipeSvg = q(".da-pipes");
    ["cams", "wait", "cycle", "rate", "frames"].forEach(function (k) {
      st.health[k] = elStage.querySelector('[data-chip="' + k + '"] .v');
    });

    if (!st.overlay) {
      st.overlay = el("div", "da-packets");
      document.body.appendChild(st.overlay);
    }

    st.zoomOut.addEventListener("click", function () { zoomIdx = Math.max(0, zoomIdx - 1); applyZoom(); });
    st.zoomIn.addEventListener("click", function () { zoomIdx = Math.min(ZOOM_LEVELS.length - 1, zoomIdx + 1); applyZoom(); });

    /* Pause freezes elapsedSec() only. Every element is anchored to a real
       instant, so nothing needs shifting on resume. */
    st.pauseBtn.addEventListener("click", function () {
      if (st.frozenAt === null) {
        st.frozenAt = Date.now();
        st.hiddenFreeze = false;   // theirs now, not the tab's
        st.pauseBtn.setAttribute("data-paused", "true");
        st.pauseLabel.textContent = t("pausePaused");
      } else {
        /* Carry the origin forward by however long the pause lasted, so the
           timeline resumes where it stopped rather than jumping. */
        st.originMs += Date.now() - st.frozenAt;
        st.frozenAt = null;
        st.hiddenFreeze = false;
        st.pauseBtn.setAttribute("data-paused", "false");
        st.pauseLabel.textContent = t("pauseLive");
      }
    });

    st.animBtn.addEventListener("click", function () {
      if (!animAutoAllowed()) return;
      animUserOn = !animUserOn;
      renderAnimBtn();
    });

    st.fullBtn.addEventListener("click", function () {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (elStage.requestFullscreen) elStage.requestFullscreen();
    });
    document.addEventListener("fullscreenchange", function () {
      st.fullBtn.textContent = document.fullscreenElement === elStage ? t("exitFull") : t("full");
      /* The viewport changed size by a lot; everything measured from it is now
         wrong until it is read again. */
      setTimeout(onResize, 80);
    });

    window.addEventListener("resize", function () {
      clearTimeout(st.resizeT);
      st.resizeT = setTimeout(onResize, 120);
    });

    /* A hidden tab stops servicing requestAnimationFrame, so the simulation
       stops advancing — but wall-clock time does not, and prune() runs on a
       timer against it. Left alone, a minute spent in another tab moves the
       cutoff past every element in the lane and you come back to a timeline
       that has been emptied and has no history to rebuild from.
       So hidden is treated exactly as paused: the clock freezes (which the
       prune timer already skips over), and the origin carries forward on
       return so each lane continues where it stopped instead of jumping. */
    document.addEventListener("visibilitychange", syncVisibility);
    /* Called once here too, not only on the event: a page opened in a
       background tab — a middle-click, a restored session — is hidden from the
       first frame and never fires visibilitychange at all. */
    syncVisibility();

    /* These outlive a teardown — the stage is rebuilt whenever the selection
       stops and starts matching again, and each of them must be registered
       exactly once for the life of the page. */
    if (!st.loopStarted) {
      st.loopStarted = true;
      setInterval(cullOffscreen, CULL_MS);
      setInterval(function () { if (st.frozenAt === null) prune(); }, 4000);
      requestAnimationFrame(frameLoop);
    }

    st.built = true;
  }

  function chip(key, label) {
    return '<span class="da-hchip" data-chip="' + key + '"><span class="k">' +
      escapeHTML(label) + '</span><span class="v">—</span></span>';
  }

  function syncVisibility() {
    if (document.hidden) {
      if (st.frozenAt === null) { st.frozenAt = Date.now(); st.hiddenFreeze = true; }
    } else if (st.hiddenFreeze) {
      st.hiddenFreeze = false;
      if (st.frozenAt !== null) {
        st.originMs += Date.now() - st.frozenAt;
        st.frozenAt = null;
      }
    }
  }

  function onResize() {
    measureViewport();
    st.pruneBehindSec = historyWindowSec();
    ensureTickPool();
    layoutTicks(true);
    cullOffscreen();
    drawPipes();
  }

  function measureViewport() {
    var w = st.rulerViewport ? st.rulerViewport.clientWidth : 0;
    if (w > 0) st.vpWidth = w;
  }

  /* ── ruler ──
     A recycled pool covering just the visible window. Building a tick per 5 s
     of the next hour would make the track tens of thousands of px wide, past
     any GPU texture limit, and force a re-raster on every frame of scrolling. */

  function p2(n) { return (n < 10 ? "0" : "") + n; }
  function makeTick() {
    var e = el("div", "da-tick", '<span class="bar"></span><span class="sec"></span>');
    st.rulerTrack.appendChild(e);
    return { el: e, sec: e.children[1], secOffset: null, isMinute: null };
  }
  function ensureTickPool() {
    var need = Math.ceil((st.vpWidth / PX) / TICK_STEP) + 3;
    while (st.tickPool.length < need) st.tickPool.push(makeTick());
    while (st.tickPool.length > need) {
      var gone = st.tickPool.pop();
      if (gone.el.parentNode) gone.el.parentNode.removeChild(gone.el);
    }
  }
  function layoutTicks(force) {
    var leftSec = elapsedSec() - visibleSpanSec();
    var start = Math.floor(leftSec / TICK_STEP) * TICK_STEP - TICK_STEP;
    /* The early-out that makes calling this every frame free: the pool only
       needs rewriting once the window has advanced a whole tick. */
    if (!force && start === st.tickRangeStart) return;
    st.tickRangeStart = start;
    for (var i = 0; i < st.tickPool.length; i++) {
      var tk = st.tickPool[i];
      var secOffset = start + i * TICK_STEP;
      var d = new Date(st.originMs + secOffset * 1000);
      var secOfMin = d.getSeconds();
      var isMinute = secOfMin === 0;
      tk.el.style.left = (secOffset * PX) + "px";
      if (tk.secOffset !== secOffset) {
        tk.sec.textContent = isMinute ? p2(d.getHours()) + ":" + p2(d.getMinutes()) : String(secOfMin);
        tk.secOffset = secOffset;
      }
      if (tk.isMinute !== isMinute) { tk.el.classList.toggle("minute", isMinute); tk.isMinute = isMinute; }
    }
  }

  /* ── lanes ── */

  function makeLane(camId, label, meta) {
    var row = el("div", "da-row-grid da-lane");
    row.innerHTML =
      '<div class="da-lane-sidebar">' +
        '<span class="da-lane-name"></span>' +
        '<span class="da-lane-meta"></span>' +
        '<span class="da-subrow-tag is-vlm">' + escapeHTML(t("rowVlm")) + '</span>' +
        '<span class="da-subrow-tag is-collect">' + escapeHTML(t("rowCollect")) + '</span>' +
      '</div>' +
      '<div class="da-lane-viewport">' +
        '<div class="da-subrow-divider"></div>' +
        '<div class="da-lane-track"></div>' +
        '<div class="da-now-line"></div>' +
      '</div>';
    /* textContent, never interpolated markup: these strings are built from
       data, and the habit is what keeps the next one safe too. */
    row.querySelector(".da-lane-name").textContent = label;
    row.querySelector(".da-lane-meta").textContent = meta;
    st.lanesEl.appendChild(row);

    st.lanes[camId] = {
      track: row.querySelector(".da-lane-track"),
      viewport: row.querySelector(".da-lane-viewport"),
      elements: [], frameBatches: [], seq: 0,
      elBand: null, elTimer: null, timerText: null, waitSec: 0,
      activeAt: null, lastDoneBand: null, lastDoneBandStart: null,
      elCollect: null, collectStartAt: null
    };
    st.camIds.push(camId);
    return st.lanes[camId];
  }

  function makeEl(camId, cls, styles) {
    var e = document.createElement("div");
    e.className = cls;
    if (styles) for (var k in styles) if (styles.hasOwnProperty(k)) e.style[k] = styles[k];
    st.lanes[camId].track.appendChild(e);
    return e;
  }

  /* Icons sit strictly inside (ws, we), never on an edge: cycle N's window
     ends exactly where N+1's begins, and an icon on that edge would put two
     cycles' frames on the identical pixel. */
  function uniformTimestamps(ws, we, n) {
    var step = (we - ws) / n, out = [];
    for (var k = 0; k < n; k++) out.push(ws + step * (k + 0.5));
    return out;
  }
  /* Once a batch's icons would sit closer together than an icon is wide, draw
     one icon badged with the count instead of N overlapping ones. */
  function groupFrameTimestamps(ws, we, n, px) {
    if (n <= 0) return [];
    if (n === 1) return [{ t: ws + (we - ws) / 2, count: 1 }];
    if (Math.max(0, we - ws) * px / n >= MIN_FRAME_ICON_GAP) {
      return uniformTimestamps(ws, we, n).map(function (ts) { return { t: ts, count: 1 }; });
    }
    return [{ t: ws + (we - ws) / 2, count: n }];
  }

  function makeFrameMini(camId, tSec, color, count, seq) {
    var isGroup = count > 1;
    /* Fixed size regardless of count — the ×N badge already says how many;
       growing the icon on top of that only spends lane height. */
    var size = isGroup ? 16 : 14, anchor = size / 2;
    var w = makeEl(camId, "da-frame-mini" + (isGroup ? " is-group" : ""), {
      left: (tSec * PX - anchor) + "px", top: (Y_ICON_CENTER - anchor) + "px",
      width: size + "px", height: size + "px", color: color
    });
    w.dataset.anchor = anchor;
    w.dataset.seq = seq;
    w.innerHTML = FRAME_SVG + (isGroup ? '<span class="da-icon-badge">×' + count + "</span>" : "");
    return w;
  }
  /* The batch at rest in the upper row. Offset by a fixed pixel inset rather
     than by time: the whole batch entered the model at one instant, so it
     stays welded to the band's left edge at every zoom level. */
  function makeBandBundle(camId, tSec, color, count, seq, delayMs) {
    var isGroup = count > 1;
    var size = isGroup ? 16 : 14;
    /* applyZoom repositions by left = t × PX − anchor, so folding the inset
       into the anchor keeps this element on the same code path as the rest. */
    var anchor = size / 2 - BUNDLE_INSET;
    var w = makeEl(camId, "da-frame-mini is-bundle" + (isGroup ? " is-group" : ""), {
      left: (tSec * PX - anchor) + "px", top: (Y_BAND_CENTER - size / 2) + "px",
      width: size + "px", height: size + "px", color: color, animationDelay: delayMs + "ms"
    });
    w.dataset.anchor = anchor;
    w.dataset.seq = seq;
    w.innerHTML = FRAME_SVG + (isGroup ? '<span class="da-icon-badge">×' + count + "</span>" : "");
    return w;
  }

  /* pending = this batch is about to fly up the arrow, so its icons start
     solid and dim as they depart. Every other caller is redrawing history
     (a zoom rebuild), where the flight already happened — those are ghosts
     from birth, with no animation replayed. */
  function renderFrameBatch(s, camId, seq, ws, we, n, color, pending) {
    var els = groupFrameTimestamps(ws, we, n, PX).map(function (g) {
      var m = makeFrameMini(camId, g.t, color, g.count, seq);
      if (!pending) m.classList.add("is-sent");
      s.elements.push({ el: m, t: g.t });
      return m;
    });
    return { ws: ws, we: we, n: n, seq: seq, color: color, els: els };
  }

  /* Retire the in-progress collection window, and drop it from s.elements so
     neither prune() nor applyZoom() keeps walking a detached node. */
  function dropCollect(s) {
    if (!s.elCollect) return;
    var gone = s.elCollect;
    if (gone.parentNode) gone.parentNode.removeChild(gone);
    s.elements = s.elements.filter(function (it) { return it.el !== gone; });
    s.elCollect = null;
    s.collectStartAt = null;
  }

  /* Where a band's duration label goes.
   *
   * Inside the band, big enough to read, whenever the band is wide enough to
   * hold it; above it in the small type when it is not; gone when even that
   * would collide with the neighbouring band's label. A band's width follows
   * its latency rather than the zoom — a 0.3 s request is narrow at every
   * rung — so this is decided per band, on every reposition.
   *
   * `reserve` is the strip at the band's left edge the resting batch icon and
   * its ×N badge already occupy — the label is centred on the band either way,
   * so the icon decides whether it can go inside at all, not where it sits.
   *
   * The two decisions answer two different questions, which is why they use
   * different measurements. Whether the label fits INSIDE is about the band's
   * own width. Whether it fits ABOVE is about the distance to the NEXT band's
   * label — `gap`, one full cycle — because that is the only thing an outside
   * label can collide with. Judging the outside case by the band's width was
   * wrong: a camera answered in 0.27 s every 1.7 s has a 27px band with 170px
   * of clear space around it, and the label was being hidden as if crowded. */
  function placeTimer(e, startSec, durSec) {
    if (!e) return;
    var w = durSec * PX;
    var reserve = parseFloat(e.dataset.reserve) || 0;
    var chars = (e.textContent || "").length;
    var needed = chars * INSIDE_CH_PX + INSIDE_PAD_PX;
    var place;
    /* Centred on the band, and it has to clear the batch icon on the left to
       stay centred — so the band must be wide enough for the icon, the label,
       and the icon's width again on the other side. Shifting the label right
       to make it fit would mean it was no longer in the middle of anything. */
    if (w >= 2 * reserve + needed) {
      place = "in";
    } else {
      /* No gap recorded (a lane drawn outside the simulator) — fall back to
         the band's own width, which is the pessimistic reading. */
      var gapPx = (parseFloat(e.dataset.gap) || durSec) * PX;
      place = gapPx >= chars * ABOVE_CH_PX + ABOVE_PAD_PX ? "above" : "none";
    }
    if (e.dataset.place !== place) e.dataset.place = place;
    e.style.left = ((startSec + durSec / 2) * PX) + "px";
  }

  /* The two elements per lane that grow with the clock. Split out of the frame
     loop because applyZoom needs it too: neither carries a data-dur for the
     generic pass to resize them from. */
  function sizeLiveElements() {
    var now = elapsedSec();
    for (var c = 0; c < st.camIds.length; c++) {
      var s = st.lanes[st.camIds[c]];
      if (s.elBand && s.activeAt !== null) {
        var w = Math.max(0, now - s.activeAt);
        s.elBand.style.width = (w * PX) + "px";
        /* Still inside the wait: the whole band is the waiting fill. Past it,
           the boundary is wherever the first token arrived. */
        s.elBand.style.setProperty("--wait-pct",
          (w > 0 ? Math.min(1, s.waitSec / w) * 100 : 100).toFixed(1) + "%");
        if (s.elTimer) {
          /* The label carries one decimal, so at 60 fps five writes in six
             would set the identical string; textContent is the costly part. */
          var txt = fmtS(w) + "s";
          if (txt !== s.timerText) { s.elTimer.textContent = txt; s.timerText = txt; }
          placeTimer(s.elTimer, s.activeAt, w);
        }
      }
      /* The window keeps filling even after the band above it closes: frames
         go on accumulating between the answer arriving and the next request. */
      if (s.elCollect && s.collectStartAt !== null) {
        s.elCollect.style.width = (Math.max(0, now - s.collectStartAt) * PX) + "px";
      }
    }
  }

  /* ── geometry, pipes and flying packets ── */

  function pointFor(e) {
    var r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  /* Everything leaving a lane for the model engine leaves from the upper
     sub-row. x comes from the ruler, not the lane: every lane shares the
     ruler's grid column, and a lane skipped by content-visibility has no
     meaningful width of its own. Its top is still exact. */
  function launchPoint(camId) {
    var r = st.lanes[camId].viewport.getBoundingClientRect();
    return { x: st.rulerViewport.getBoundingClientRect().right - RIGHT_MARGIN, y: r.top + Y_BAND_CENTER };
  }
  /* A lane the reader cannot see is not rendered, so measuring inside it
     returns zeros — and an animation launched from those coordinates would
     fly in from the top-left corner of the page. */
  function laneOnScreen(camId) {
    var lane = st.lanes[camId];
    if (!lane) return false;
    var r = lane.viewport.getBoundingClientRect();
    if (r.width <= 0) return false;
    var host = st.lanesEl.getBoundingClientRect();
    var top = Math.max(0, host.top), bottom = Math.min(window.innerHeight, host.bottom);
    return r.bottom > top && r.top < bottom;
  }
  function curveControlPoints(from, to) {
    var cx = (from.x + to.x) / 2;
    return { p0: from, c1: { x: cx, y: from.y }, c2: { x: cx, y: to.y }, p3: to };
  }
  function bezierPoint(cp, t) {
    var mt = 1 - t;
    return {
      x: mt * mt * mt * cp.p0.x + 3 * mt * mt * t * cp.c1.x + 3 * mt * t * t * cp.c2.x + t * t * t * cp.p3.x,
      y: mt * mt * mt * cp.p0.y + 3 * mt * mt * t * cp.c1.y + 3 * mt * t * t * cp.c2.y + t * t * t * cp.p3.y
    };
  }

  function drawPipes() {
    if (!st.shellEl) return;
    var sr = st.shellEl.getBoundingClientRect();
    if (!sr.width) return;
    st.pipeSvg.setAttribute("width", sr.width);
    st.pipeSvg.setAttribute("height", sr.height);
    function rel(p) { return (p.x - sr.left) + "," + (p.y - sr.top); }
    function pathFor(cp) {
      return '<path d="M' + rel(cp.p0) + " C" + rel(cp.c1) + " " + rel(cp.c2) + " " + rel(cp.p3) +
        '" style="fill:none;stroke:var(--border-strong);stroke-width:1.6;stroke-dasharray:2 6;stroke-linecap:round;"/>';
    }
    var parts = [];
    for (var i = 0; i < st.camIds.length; i++) {
      parts.push(pathFor(curveControlPoints(launchPoint(st.camIds[i]), pointFor(st.engineChip))));
    }
    parts.push(pathFor(curveControlPoints(pointFor(st.engineChip), pointFor(st.clientChip))));
    st.pipeSvg.innerHTML = parts.join("");
  }

  function animAutoAllowed() { return st.camIds.length <= ANIM_MAX_LANES && !reducedMotion; }
  function animEnabled() { return animUserOn && animAutoAllowed(); }
  /* Counted off the overlay rather than tracked in a variable. The budget is
     "how many packets are on screen", which the DOM already knows exactly; a
     hand-kept counter incremented in two places and decremented in three (the
     finish handler, the background-tab safety timer, and their race) can drift
     either way, and drifting up silently disables every later flight. */
  function animSlotFree() { return st.overlay.childElementCount < ANIM_MAX_INFLIGHT; }
  /* Coordinates are read when a flight is planned but used when it launches,
     up to half a second later, and a resize or a rebuild in between leaves them
     describing a layout that no longer exists. A packet drawn from stale
     numbers streaks off across the page, so a path that does not start and end
     on screen is not drawn at all. */
  function inViewport(pt) {
    return !!pt && isFinite(pt.x) && isFinite(pt.y) &&
      pt.x >= -40 && pt.x <= window.innerWidth + 40 &&
      pt.y >= -40 && pt.y <= window.innerHeight + 40;
  }
  function renderAnimBtn() {
    if (!st.animBtn) return;
    var on = animEnabled();
    st.animBtn.setAttribute("data-on", on ? "1" : "0");
    st.animBtn.disabled = !animAutoAllowed();
    st.animBtn.style.opacity = animAutoAllowed() ? "" : ".6";
  }

  function spawnIconPacketOnCurve(from, to, svg, color, count, duration, onDone) {
    /* onDone still runs: it is the chip pulse, which is the part that carries
       the meaning. Only the drawing is skipped. */
    if (!inViewport(from) || !inViewport(to)) { if (onDone) onDone(); return; }
    var size = 18 + (count ? Math.min(count, 8) * 2.6 : 0);
    var cp = curveControlPoints(from, to);
    var p = el("div", "da-packet");
    p.style.width = size + "px"; p.style.height = size + "px"; p.style.color = color;
    p.innerHTML = svg + (count ? '<span class="da-icon-badge">×' + count + "</span>" : "");
    st.overlay.appendChild(p);
    var STEPS = 12, frames = [];

    for (var i = 0; i <= STEPS; i++) {
      var tt = i / STEPS;
      var pt = bezierPoint(cp, tt);
      var op = tt < 0.06 ? tt / 0.06 : (tt > 0.85 ? (1 - tt) / 0.15 : 1);
      var sc = tt < 0.06 ? 0.75 + 0.25 * (tt / 0.06) : (tt > 0.8 ? 1 - 0.6 * ((tt - 0.8) / 0.2) : 1);
      frames.push({
        transform: "translate(" + (pt.x - size / 2) + "px," + (pt.y - size / 2) + "px) scale(" + sc.toFixed(3) + ")",
        opacity: Math.max(0, Math.min(1, op))
      });
    }
    var anim = p.animate(frames, { duration: duration || 680, easing: "cubic-bezier(.4,.05,.2,1)" });
    anim.onfinish = function () { p.remove(); if (onDone) onDone(); };
    /* A background tab may never deliver the finish event; take the packet off
       the overlay on a timer so it cannot sit there holding a slot. */
    setTimeout(function () { p.remove(); }, (duration || 680) + 400);
  }

  function animateAlongPoints(pts, html, color, size, duration, delay, driftPxPerSec) {
    /* Keyframe offsets follow arc length rather than index: the first leg (a
       glide along the collection row) is often many times longer than any one
       sample of the curve, and with evenly spaced offsets the icon would shoot
       sideways and then crawl upwards. */
    var cum = [0], total = 0;
    for (var i = 1; i < pts.length; i++) {
      total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      cum.push(total);
    }
    var frames = pts.map(function (p, i) {
      var tt = total > 0 ? cum[i] / total : i / Math.max(1, pts.length - 1);
      /* The track keeps scrolling left for the whole flight. These points were
         measured against where things are now, so without this the icons would
         land where the band used to be. Exact, because the animation is linear:
         offset tt corresponds to time tt × duration. */
      var drift = (driftPxPerSec || 0) * ((delay || 0) + tt * duration) / 1000;
      /* Full size right to the end: the icon lands ON the resting bundle and
         is absorbed by it, rather than evaporating short of its destination. */
      var sc = tt > 0.88 ? 1 - 0.25 * ((tt - 0.88) / 0.12) : 1;
      return {
        offset: tt,
        transform: "translate(" + (p.x - drift - size / 2) + "px," + (p.y - size / 2) + "px) scale(" + sc.toFixed(3) + ")",
        opacity: tt > 0.88 ? Math.max(0, (1 - tt) / 0.12) : 1
      };
    });
    /* Created when it launches rather than animated with a delay: a delayed
       animation holds its first keyframe on screen meanwhile, parking a
       motionless copy on top of the original icon. */
    setTimeout(function () {
      var p = el("div", "da-packet");
      p.style.width = size + "px"; p.style.height = size + "px"; p.style.color = color;
      p.innerHTML = html;
      st.overlay.appendChild(p);
      var anim = p.animate(frames, { duration: duration, easing: "linear" });
      anim.onfinish = function () { p.remove(); };
      setTimeout(function () { p.remove(); }, duration + 400);
    }, delay || 0);
  }

  /* The frames do not just get announced as sent — they ride the arrow. Each
     icon glides right along the collection row to the arrow's tail, climbs the
     very S-curve the arrow draws, and dissolves into the band it feeds. A
     dimmed ghost stays behind, because which frames were picked out of which
     window is a permanent fact about that cycle. */
  function flyFramesToBand(arrowEl, iconEls, color) {
    if (!iconEls.length) return;
    var g = ARROW_GEO;
    var ar = arrowEl.getBoundingClientRect();
    function L(x, y) { return { x: ar.left + x, y: ar.top + y }; }
    var tail = L(g.x0, g.y0);
    var head = L(g.x1, g.y1);
    if (!inViewport(tail) || !inViewport(head)) return;
    var cp = { p0: tail, c1: L(g.cx, g.y0), c2: L(g.cx, g.y1), p3: head };
    var curve = [];
    for (var i = 1; i <= FLIGHT_CURVE_STEPS; i++) curve.push(bezierPoint(cp, i / FLIGHT_CURVE_STEPS));
    /* Past the arrowhead, onto the resting bundle's centre — the same
       expression makeBandBundle uses, read off the arrow's own box. */
    curve.push(L(ARROW_ANCHOR + BUNDLE_INSET, g.y1));

    /* The stagger total is capped, not the per-icon step: a five-frame batch
       must not take five times longer to hand over than a one-frame one. */
    var stagger = Math.min(FLIGHT_STAGGER_MS, FLIGHT_STAGGER_TOTAL_MS / iconEls.length);
    var drift = st.frozenAt !== null ? 0 : PX;
    iconEls.forEach(function (icon, idx) {
      var start = pointFor(icon);
      if (!inViewport(start)) return;
      var pts = [start];
      if (tail.x - start.x > 4) pts.push(tail);
      var delay = FLIGHT_LEAD_MS + idx * stagger;
      animateAlongPoints(pts.concat(curve), icon.innerHTML, color, icon.offsetWidth || 14, FLIGHT_MS, delay, drift);
      /* Ghost the original just after its copy leaves, not before, or the icon
         dims while it is still visibly sitting there. */
      setTimeout(function () { icon.classList.add("is-sent"); }, delay + 60);
    });
  }

  function pulseChip() {
    st.engineChip.animate([{ transform: "scale(1)" }, { transform: "scale(1.1)" }, { transform: "scale(1)" }],
      { duration: 260, easing: "ease-out" });
  }
  function pulseClient() {
    st.clientChip.classList.remove("flash");
    void st.clientChip.offsetWidth;
    st.clientChip.classList.add("flash");
  }
  function setEngineBusy(delta) {
    st.busyCount = Math.max(0, st.busyCount + delta);
    st.engineDock.classList.toggle("active", st.busyCount > 0);
    st.engineState.textContent = st.busyCount > 0 ? t("processing") : t("ready");
  }

  /* ══════════════════════════════════════════════════════════════════════
     Drawing one cycle
     ─────────────────────────────────────────────────────────────────────
     Same two entry points as the live monitor's, so the drawing code is
     unchanged by where the events come from. `live` is false while the stage
     is being seeded with history, which skips every animation — a hundred
     backfilled cycles must not all play their hand-off at once.
     ══════════════════════════════════════════════════════════════════════ */

  function onDispatch(camId, at, windowStart, seq, nFrames, color, live, gapSec, waitSec) {
    var s = st.lanes[camId];
    s.seq = seq;

    if (s.lastDoneBand) {
      /* Snap the previous band's right edge onto this one's left edge: the
         measured latency stops a hair short of "until the next request
         actually went out", and without this there is a hairline gap. */
      var closed = Math.max(0, at - s.lastDoneBandStart);
      s.lastDoneBand.style.width = (closed * PX) + "px";
      s.lastDoneBand.dataset.dur = closed;
    }
    s.lastDoneBand = null; s.lastDoneBandStart = null;
    s.elBand = null; s.elTimer = null; s.activeAt = null; s.timerText = null;

    s.elBand = makeEl(camId, "da-band da-band-wait", { left: (at * PX) + "px", width: "0px" });
    s.elBand.style.setProperty("--phase-color", color);
    /* The band covers the whole request — the wait for the first token AND the
       time to write the answer — because that is how long the model is busy
       with this camera, and it is the gap before its next request. Drawing only
       the wait left the writing time as white space the eye read as idle, and
       the next dispatch then stretched the band over it without relabelling it.
       The two phases are one element split by a gradient: --wait-pct moves as
       the band grows, so the boundary is where the answer started. */
    s.waitSec = waitSec || 0;
    s.elBand.style.setProperty("--wait-pct", "100%");
    s.elements.push({ el: s.elBand, t: at });
    s.activeAt = at;

    /* Above the band rather than inside it, so it never fights the frame icons
       for the same pixels — but tracking the band's midpoint as it widens. */
    s.elTimer = makeEl(camId, "da-band-timer", { left: (at * PX) + "px" });
    s.elTimer.textContent = "0.0s";
    s.elTimer.dataset.center = "1";
    s.elTimer.dataset.dur = 0;
    s.elTimer.dataset.reserve = nFrames > 1 ? BUNDLE_RESERVE_BADGED : BUNDLE_RESERVE;
    /* How far it is to the next band's label: one cycle of this lane. */
    s.elTimer.dataset.gap = gapSec || 0;
    placeTimer(s.elTimer, at, 0);
    s.elements.push({ el: s.elTimer, t: at });

    /* Lower sub-row: close the window this request drains. Its span is the
       region under the PREVIOUS band — these frames accumulated while that
       call was in flight. */
    dropCollect(s);
    var trackDur = Math.max(0, at - windowStart);
    var track = makeEl(camId, "da-frame-track", {
      left: (windowStart * PX) + "px", width: (trackDur * PX) + "px"
    });
    track.style.setProperty("--phase-color", color);
    track.dataset.dur = trackDur;
    track.dataset.seq = seq;
    s.elements.push({ el: track, t: windowStart });

    /* The camera captured continuously across the whole window; the icons are
       only the frames actually picked for this request. Drawing them ON the
       window keeps the gaps between them from reading as "nothing happened". */
    var batch = renderFrameBatch(s, camId, seq, windowStart, at, nFrames, color, live);
    s.frameBatches.push(batch);

    /* The hand-off sits exactly on the dispatch instant, which is both the
       right edge of the window above and the left edge of the band it feeds. */
    var arrow = makeEl(camId, "da-arrow", { left: (at * PX - ARROW_ANCHOR) + "px" });
    arrow.style.setProperty("--phase-color", color);
    arrow.dataset.anchor = ARROW_ANCHOR;
    arrow.dataset.seq = seq;
    arrow.innerHTML = ARROW_SVG;
    s.elements.push({ el: arrow, t: at });

    /* Deliberately NOT part of batch.els: applyZoom tears those down and
       rebuilds them, which would replay this element's entry animation on
       every zoom click. This one only ever needs repositioning. */
    var bundle = makeBandBundle(camId, at, color, nFrames, seq, FLIGHT_LEAD_MS + FLIGHT_MS - 150);
    s.elements.push({ el: bundle, t: at });

    if (live && animEnabled() && animSlotFree() && laneOnScreen(camId)) {
      flyFramesToBand(arrow, batch.els, color);
    }

    /* Lower sub-row: open the next window. It grows with the clock until the
       next request closes it, and carries no seq yet — the batch it will feed
       does not exist. */
    s.elCollect = makeEl(camId, "da-frame-track is-collecting", { left: (at * PX) + "px", width: "0px" });
    s.elCollect.style.setProperty("--phase-color", color);
    s.collectStartAt = at;
    s.elements.push({ el: s.elCollect, t: at });

    if (live) {
      setEngineBusy(1);
      setTimeout(function () {
        if (!animEnabled() || !animSlotFree() || !laneOnScreen(camId)) { pulseChip(); return; }
        spawnIconPacketOnCurve(launchPoint(camId), pointFor(st.engineChip), FRAME_SVG,
          color, nFrames, 680, pulseChip);
      }, ENGINE_PACKET_DELAY_MS);
    }
  }

  function onResponse(camId, at, latency, live) {
    var s = st.lanes[camId];
    if (!s.elBand) return;
    s.elBand.style.width = (latency * PX) + "px";
    s.elBand.dataset.dur = latency;
    /* A fraction, not a length — it needs no recomputing when the zoom changes. */
    s.elBand.style.setProperty("--wait-pct",
      (latency > 0 ? Math.min(1, s.waitSec / latency) * 100 : 100).toFixed(1) + "%");
    s.elBand.classList.add("da-band-done");
    if (s.elTimer) {
      s.elTimer.textContent = fmtS(latency) + "s";
      s.elTimer.dataset.dur = latency;
      s.elTimer.classList.add("is-done");
      placeTimer(s.elTimer, s.activeAt, latency);
    }
    s.lastDoneBand = s.elBand;
    s.lastDoneBandStart = s.activeAt;
    s.elBand = null; s.elTimer = null; s.activeAt = null; s.timerText = null;

    if (live) {
      setEngineBusy(-1);
      if (animEnabled() && animSlotFree()) {
        spawnIconPacketOnCurve(pointFor(st.engineChip), pointFor(st.clientChip),
          ANSWER_SVG, "var(--rule)", null, 560, pulseClient);
      } else pulseClient();
    }
  }

  /* ── zoom, culling, pruning, the frame loop ── */

  function applyZoom() {
    PX = ZOOM_LEVELS[zoomIdx];
    st.zoomLabel.textContent = (PX < 1 ? PX.toFixed(1) : PX) + "px/s";
    st.zoomOut.disabled = zoomIdx === 0;
    st.zoomIn.disabled = zoomIdx === ZOOM_LEVELS.length - 1;
    renderAnimBtn();

    ensureTickPool();
    layoutTicks(true);

    for (var c = 0; c < st.camIds.length; c++) {
      var camId = st.camIds[c], s = st.lanes[camId];
      /* Grouping is a function of px-per-second — icons distinct at the old
         zoom can start overlapping or vice versa — so rebuild each batch's
         icons from scratch rather than repositioning them. */
      var stale = [];
      s.frameBatches.forEach(function (b) { stale = stale.concat(b.els); });
      if (stale.length) {
        s.elements = s.elements.filter(function (it) { return stale.indexOf(it.el) === -1; });
        stale.forEach(function (e) { if (e.parentNode) e.parentNode.removeChild(e); });
        s.frameBatches = s.frameBatches.map(function (b) {
          return renderFrameBatch(s, camId, b.seq, b.ws, b.we, b.n, b.color, false);
        });
        /* The rebuilt icons were appended, so the list is no longer in time
           order — and prune() drops the oldest by taking from the front. */
        s.elements.sort(function (a, b) { return a.t - b.t; });
      }
      s.elements.forEach(function (it) {
        if (it.el.dataset.center !== undefined) {
          /* band timer: placed against its band, not anchored at t. A new zoom
             is a new band width, so it can change sides as well as position. */
          placeTimer(it.el, it.t, parseFloat(it.el.dataset.dur) || 0);
          return;
        }
        it.el.style.left = (it.t * PX - (parseFloat(it.el.dataset.anchor) || 0)) + "px";
        if (it.el.dataset.dur !== undefined) {
          it.el.style.width = (parseFloat(it.el.dataset.dur) * PX) + "px";
        }
      });
    }
    st.pruneBehindSec = historyWindowSec();
    sizeLiveElements();
    cullOffscreen();
  }

  /* The lane viewports never scroll horizontally — the only way to see the
     past is the transform the frame loop applies — so anything outside the
     visible window is unreachable rather than merely scrolled away.
     display:none takes it out of layout, paint and the layer's bounds. */
  var MAX_ELEMENT_SEC = 300;
  function cullOffscreen() {
    if (!st.camIds.length) return;
    var now = elapsedSec();
    var leftSec = now - visibleSpanSec();
    var pad = 60 / PX;
    var rightSec = now + RIGHT_MARGIN / PX + pad;
    var farLeft = leftSec - MAX_ELEMENT_SEC;
    leftSec -= pad;
    for (var c = 0; c < st.camIds.length; c++) {
      var items = st.lanes[st.camIds[c]].elements;
      for (var i = 0; i < items.length; i++) {
        var it = items[i], vis;
        if (it.t < farLeft || it.t > rightSec) vis = false;
        else if (it.t >= leftSec) vis = true;
        /* Only in the narrow strip just left of the viewport does the
           element's own width decide it, and only there do we pay the read. */
        else vis = (it.t + (parseFloat(it.el.dataset.dur) || 0)) >= leftSec;
        if (vis === it.vis) continue;
        it.vis = vis;
        it.el.classList.toggle("da-culled", !vis);
      }
    }
  }

  function prune() {
    var cutoff = elapsedSec() - st.pruneBehindSec;
    for (var c = 0; c < st.camIds.length; c++) {
      var s = st.lanes[st.camIds[c]];
      var excess = Math.max(0, s.elements.length - MAX_ELEMENTS_PER_LANE);
      var i = 0;
      s.elements = s.elements.filter(function (it) {
        if (i++ < excess || it.t < cutoff) {
          if (it.el.parentNode) it.el.parentNode.removeChild(it.el);
          if (it.el === s.elCollect) { s.elCollect = null; s.collectStartAt = null; }
          return false;
        }
        return true;
      });
      /* A batch lives exactly as long as its icons do — otherwise a zoom change
         would rebuild icons for cycles whose every other element is gone, and
         put back the nodes this just removed. */
      s.frameBatches = s.frameBatches.filter(function (b) {
        return b.we >= cutoff && b.els.length && b.els[0].parentNode;
      });
    }
  }

  var lastClockSec = null;
  function frameLoop() {
    requestAnimationFrame(frameLoop);
    if (!st.camIds.length) return;
    if (st.vpMeasuresLeft > 0) {
      st.vpMeasuresLeft--;
      var before = st.vpWidth;
      measureViewport();
      if (st.vpWidth !== before) { ensureTickPool(); layoutTicks(true); }
    }
    var now = elapsedSec();
    if (st.frozenAt === null) pump(now);

    var d = new Date(virtualNowMs());
    var sec = d.getSeconds();
    if (sec !== lastClockSec) {
      lastClockSec = sec;
      st.nowClock.textContent = p2(d.getHours()) + ":" + p2(d.getMinutes()) + ":" + p2(sec);
    }
    layoutTicks(false);

    var translate = (st.vpWidth - RIGHT_MARGIN) - now * PX;
    var tr = "translateX(" + translate + "px)";
    st.rulerTrack.style.transform = tr;
    for (var i = 0; i < st.camIds.length; i++) st.lanes[st.camIds[i]].track.style.transform = tr;
    if (st.frozenAt === null) sizeLiveElements();
    updateHealth();
  }

  /* ══════════════════════════════════════════════════════════════════════
     The scheduler — what replaces the live feed
     ─────────────────────────────────────────────────────────────────────
     A camera sends its next request the moment the previous one is answered,
     which is the assumption the benchmark was taken under. So each lane is a
     loop of: dispatch, wait `latency`, respond, dispatch again.

     Two things are not read off a measurement, and both are stated on the
     page: the lanes are spread across one cycle, because real cameras do not
     start in lockstep, and each lane's cycle is varied by a few percent
     around the measured mean, because a column of identical bands reads as a
     drawing rather than a system. The figures above the stage are the means
     themselves, untouched.
     ══════════════════════════════════════════════════════════════════════ */

  function resetSim(proj, label) {
    /* Tear the old lanes out — a configuration change is a different system,
       not a continuation of this one. */
    st.lanesEl.innerHTML = "";
    st.lanes = {};
    st.camIds = [];
    st.busyCount = 0;
    setEngineBusy(0);
    st.originMs = Date.now();
    st.frozenAt = null;
    st.hiddenFreeze = false;
    st.pauseBtn.setAttribute("data-paused", "false");
    st.pauseLabel.textContent = t("pauseLive");
    syncVisibility();
    st.headSub.textContent = label;

    /* Pick the rung that fits roughly three cycles across the viewport, so
       both a 0.3 s and a 50 s cycle land somewhere readable. */
    measureViewport();
    var want = (st.vpWidth - RIGHT_MARGIN) / Math.max(0.2, proj.cycle * 3);
    zoomIdx = 0;
    for (var z = 0; z < ZOOM_LEVELS.length; z++) if (ZOOM_LEVELS[z] <= want) zoomIdx = z;
    PX = ZOOM_LEVELS[zoomIdx];
    st.pruneBehindSec = historyWindowSec();

    var color = proj.meets ? "var(--ok-fill)" : "var(--late-fill)";
    var cams = [];
    for (var i = 0; i < sel.cams; i++) {
      /* Deterministic, so the same configuration always draws the same
         picture: the golden angle spreads the offsets evenly without a
         random number generator the reader cannot reason about. */
      var jitter = 1 + 0.045 * Math.sin(i * 2.39996323);
      var cycle = proj.cycle * jitter;
      makeLane("cam" + i, tf("camName", { n: i + 1 }),
        tf("laneMeta", { res: sel.res, n: sel.images }));
      cams.push({
        id: "cam" + i,
        /* The request is over when the answer is complete, which is also the
           instant the camera sends the next one — so latency and cycle are the
           same number here, and the lane is a continuous chain of requests with
           no idle gap between them. The wait for the first token is a phase
           inside that, not the whole of it. */
        wait: proj.ttft * jitter,
        latency: cycle,
        cycle: cycle,
        /* Start each lane a slice of a cycle apart, then back far enough that
           the whole visible window is already full of history on arrival. */
        nextAt: (i / sel.cams) * proj.cycle - (visibleSpanSec() + cycle),
        prevAt: (i / sel.cams) * proj.cycle - (visibleSpanSec() + 2 * cycle),
        inFlight: false, respAt: 0, seq: 0
      });
    }
    st.sim = { cams: cams, color: color, nFrames: sel.images, proj: proj };

    /* Show every lane where that fits on a screen, and scroll past that. A
       fixed height left four cameras floating above a third of a screen of
       nothing, and sixteen pushed the controls out of reach. The lane height
       is measured rather than restated from the stylesheet — getting it a
       pixel wrong puts a scrollbar on a list that fits. */
    var firstLane = st.lanesEl.firstChild;
    var laneH = firstLane ? firstLane.getBoundingClientRect().height : 67;
    st.lanesEl.style.height = Math.ceil(laneH * Math.min(sel.cams, 8)) + "px";

    ensureTickPool();
    layoutTicks(true);
    /* Fast-forward from the seed point to now with the animations suppressed:
       a hundred backfilled cycles must not all play their hand-off at once. */
    pump(elapsedSec(), false);
    applyZoom();
    requestAnimationFrame(function () { requestAnimationFrame(drawPipes); });
  }

  /* Advance every lane up to `now`. `live` false while seeding history.
     The per-call cap is a backstop: a sub-second cycle over a wide viewport
     is thousands of cycles, and prune() would throw most of them away again
     the moment they were drawn. */
  var PUMP_MAX_EVENTS = 600;
  function pump(now, live) {
    if (!st.sim) return;
    if (live === undefined) live = true;
    var cams = st.sim.cams;
    for (var i = 0; i < cams.length; i++) {
      var c = cams[i], guard = 0;
      while (guard++ < PUMP_MAX_EVENTS) {
        if (!c.inFlight && c.nextAt <= now) {
          c.seq++;
          onDispatch(c.id, c.nextAt, c.prevAt, c.seq, st.sim.nFrames, st.sim.color, live, c.cycle, c.wait);
          c.inFlight = true;
          c.respAt = c.nextAt + c.latency;
          continue;
        }
        if (c.inFlight && c.respAt <= now) {
          onResponse(c.id, c.respAt, c.latency, live);
          c.inFlight = false;
          c.prevAt = c.nextAt;
          /* The next request goes out as soon as this answer is complete:
             the wait plus the time to write it, i.e. one full cycle. */
          c.nextAt = c.nextAt + c.cycle;
          continue;
        }
        break;
      }
      /* Blew the cap while seeding — jump the lane forward rather than
         spending the rest of the frame on cycles nobody will ever see. */
      if (guard >= PUMP_MAX_EVENTS && c.nextAt < now) {
        c.nextAt = now;
        c.prevAt = now - c.cycle;
        c.inFlight = false;
      }
    }
  }

  var lastHealthSec = null;
  function updateHealth() {
    var sec = Math.floor(virtualNowMs() / 500);
    if (sec === lastHealthSec) return;   // twice a second is plenty
    lastHealthSec = sec;
    var p = st.sim ? st.sim.proj : null;
    if (!p) return;
    setChip("cams", String(sel.cams), null);
    setChip("wait", fmtS(p.ttft) + " " + t("unitS"), p.meets ? "ok" : "late");
    setChip("cycle", fmtS(p.cycle) + " " + t("unitS"), null);
    setChip("rate", fmtN(p.totalPerMin, p.totalPerMin < 10 ? 1 : 0), null);
    setChip("frames", String(sel.images), null);
  }
  function setChip(key, value, tone) {
    var v = st.health[key];
    if (!v) return;
    if (v.textContent !== value) v.textContent = value;
    var host = v.parentNode;
    var want = tone || "";
    if (host.getAttribute("data-tone") !== want) {
      if (want) host.setAttribute("data-tone", want); else host.removeAttribute("data-tone");
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
     Render and boot
     ══════════════════════════════════════════════════════════════════════ */

  function render() {
    var r = rank();
    buildPanel();
    buildVerdict(r);
    buildDevices(r);

    if (!r.chosen) {
      elStage.innerHTML = "";
      elStage.className = "";
      st.built = false;
      st.camIds = [];
      st.sim = null;
      return;
    }
    buildStage();
    resetSim(r.chosen.proj, tf("stageSub", {
      model: sel.model, device: r.chosen.device, res: sel.res,
      cams: sel.cams, camWord: camWord(sel.cams)
    }));
  }

  function init() {
    root = document.querySelector("[data-da-src]");
    if (!root) return;
    LANG = root.getAttribute("data-da-lang") || "en";
    if (!I18N[LANG]) LANG = "en";

    root.innerHTML = '<div class="da-loading"></div>';
    root.firstChild.textContent = t("loading");

    fetch(root.getAttribute("data-da-src"))
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        DATA = data;
        if (data.workload) {
          if (data.workload.max_tokens) MAX_TOKENS = data.workload.max_tokens;
          if (data.workload.sizes) RES_DIMS = data.workload.sizes;
        }
        if (data.config && data.config.response_target_s) sel.target = data.config.response_target_s;

        var seen = {};
        for (var i = 0; i < data.benchmarks.length; i++) seen[data.benchmarks[i].model] = true;
        MODELS = Object.keys(seen).sort();
        if (!MODELS.length) throw new Error("no runs");
        /* Open on a model every device was measured with, so the first thing
           the reader sees is a real comparison rather than a single card. */
        sel.model = MODELS.indexOf("Qwen3-VL-8B-Instruct") >= 0 ? "Qwen3-VL-8B-Instruct" : MODELS[0];
        clampCameras();

        root.innerHTML = "";
        root.className = "da-container";
        elPanel = el("div", "da-panel");
        elVerdict = el("div", "da-verdict");
        elDevices = el("div", "da-devices-block");
        elStage = el("div");
        root.appendChild(elPanel);
        root.appendChild(elVerdict);
        root.appendChild(elDevices);
        root.appendChild(elStage);
        render();
      })
      .catch(function (err) {
        root.className = "da-container";
        root.innerHTML = '<div class="da-error"></div>';
        root.firstChild.textContent = t("loadFailed") + err.message;
      });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
