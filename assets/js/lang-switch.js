/* Language switcher: keep the reader where they were.
 *
 * The EN / TR / NL links (_includes/nav_footer_custom.html) already point at
 * the same page in the other language. On click, this also stores what the
 * reader had on screen: the heading or benchmark row at the top of the
 * viewport, which <details> blocks were open, and the state of an explorer
 * widget (filters, targets, open rows — each widget's own snapshot()). The
 * next page reads it back once, and only if it is the page the link opened.
 *
 * Headings are matched by position, not id: ids are made from the translated
 * heading text and differ per language, while the twins share one structure.
 * An explorer table scrolls inside its own box (.bt-table-wrap); its place is
 * kept as the first row showing in that box, matched by the row's data-id,
 * which is the same in every language.
 */
(function () {
  var KEY = "oz-lang-carry";
  var ANCHORS = "h1, h2, h3, h4, h5, h6, .bt-table-wrap";
  var carry = null;
  try {
    carry = JSON.parse(sessionStorage.getItem(KEY) || "null");
    sessionStorage.removeItem(KEY);
  } catch (e) { carry = null; }
  if (carry && carry.path !== location.pathname) carry = null;
  /* Read by the explorer widgets while they initialise. */
  window.ozCarry = carry ? carry.widgets || {} : null;

  function main() { return document.getElementById("main-content") || document.body; }

  function anchors() {
    return Array.prototype.slice.call(main().querySelectorAll(ANCHORS)).filter(function (el) {
      return el.offsetParent !== null;
    });
  }

  /* Anchors of one kind, in page order: "h" headings, "w" table boxes. */
  function ofKind(list, kind) {
    return list.filter(function (x) { return x.matches(".bt-table-wrap") === (kind === "w"); });
  }

  function keyOf(el, list) {
    var kind = el.matches(".bt-table-wrap") ? "w" : "h";
    return kind + ":" + ofKind(list, kind).indexOf(el);
  }

  function find(key) {
    return ofKind(anchors(), key.charAt(0))[parseInt(key.slice(2), 10)] || null;
  }

  /* The anchor at the top of the screen, or failing that the first one below it. */
  function position() {
    if (window.scrollY < 40) return null;
    var list = anchors(), best = null;
    list.forEach(function (el) { if (el.getBoundingClientRect().top <= 90) best = el; });
    if (!best) best = list[0];
    if (!best) return null;
    return { key: keyOf(best, list), offset: best.getBoundingClientRect().top };
  }

  /* For each table box: the first row showing in it, and how far down the box. */
  function boxes() {
    return Array.prototype.map.call(main().querySelectorAll(".bt-table-wrap"), function (w) {
      var top = w.getBoundingClientRect().top, first = null;
      Array.prototype.some.call(w.querySelectorAll("tr[data-id]"), function (tr) {
        if (tr.getBoundingClientRect().bottom > top + 1) { first = tr; return true; }
        return false;
      });
      return {
        id: first ? first.getAttribute("data-id") : null,
        offset: first ? first.getBoundingClientRect().top - top : 0,
        left: w.scrollLeft
      };
    });
  }

  function restoreBoxes(saved) {
    Array.prototype.forEach.call(main().querySelectorAll(".bt-table-wrap"), function (w, i) {
      var b = saved && saved[i];
      if (!b) return;
      w.scrollLeft = b.left || 0;
      if (!b.id) return;
      var tr = w.querySelector('tr[data-id="' + CSS.escape(b.id) + '"]');
      if (tr) w.scrollTop += tr.getBoundingClientRect().top - w.getBoundingClientRect().top - b.offset;
    });
  }

  function snapshot(name) {
    var w = window[name];
    try { return w && w.snapshot ? w.snapshot() : null; } catch (e) { return null; }
  }

  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest(".lang-switcher a[href]");
    if (!a) return;
    var url = new URL(a.getAttribute("href"), location.href);
    var rowHash = location.hash && document.querySelector('tr.bt-row[data-id="' +
      CSS.escape(decodeURIComponent(location.hash.slice(1))) + '"]') ? location.hash : "";
    try {
      sessionStorage.setItem(KEY, JSON.stringify({
        path: url.pathname,
        hash: rowHash,
        pos: position(),
        boxes: boxes(),
        details: Array.prototype.map.call(main().querySelectorAll("details"), function (d) { return d.open; }),
        widgets: { bt: snapshot("BenchmarkTable"), cvbt: snapshot("CvBenchmarkTable") }
      }));
    } catch (err) { /* storage unavailable: switch without carrying anything */ }
  });

  if (!carry) return;

  /* The explorers draw their table after fetching data, so the anchor may not
     exist yet: apply again for a short while, and stop as soon as the reader
     scrolls on their own. */
  var stopped = false, applied = false;
  ["wheel", "touchstart", "keydown", "mousedown"].forEach(function (ev) {
    window.addEventListener(ev, function () { stopped = true; }, { passive: true, once: true });
  });

  function apply() {
    if (stopped) return;
    if (!applied && carry.details) {
      Array.prototype.forEach.call(main().querySelectorAll("details"), function (d, i) {
        if (carry.details[i] != null) d.open = carry.details[i];
      });
      applied = true;
    }
    restoreBoxes(carry.boxes);
    if (!carry.pos) return;
    var el = find(carry.pos.key);
    /* instant: the theme sets smooth scrolling, which would animate every re-apply */
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - carry.pos.offset, behavior: "instant" });
  }

  document.addEventListener("DOMContentLoaded", apply);
  window.addEventListener("load", function () {
    apply();
    [200, 500, 1000, 1600].forEach(function (t) { setTimeout(apply, t); });
    /* Put a benchmark row's link back in the address bar without scrolling. */
    setTimeout(function () {
      if (carry.hash && !location.hash) history.replaceState(null, "", location.pathname + location.search + carry.hash);
    }, 1700);
  });
})();
