# Search-engine and AI-agent visibility, generated at build time.
#
# Nothing here needs editing when a paper or a benchmark run is added: every
# value is read from front matter or from the benchmark data stores
# (assets/data/llm-benchmarks/, vlm-benchmarks/, cv-benchmarks/), the LLM and
# VLM ones through _plugins/bench_store.rb. That plugin also writes the
# combined files the explorers fetch — openzeka.com fetches
# /assets/data/benchmarks.json by that exact URL.
#
#   site.data["oz_llm"]      the LLM store (combined), plus per row: the sweep,
#                            Max C, capacity, and its explanation in each language
#   site.data["oz_cv"]       assets/data/cv-benchmarks/, flattened to one row per
#                            device × model
#   site.data["oz_vlm"]      the VLM store (combined), plus per row: Max
#                            Cameras at the default target and its explanation
#   site.data["oz_pages"]    every translated page (one entry per page_id) with
#                            its permalink per language — sitemap, feed, llms.txt
#   page.canonical_url       set on non-default-language pages, so og:url and the
#                            JSON-LD url carry the /tr/ prefix like the canonical
#                            link does (polyglot rewrites href= only)
#   page.oz_alternates       language → absolute URL, for the hreflang links

require "json"

module OzVisibility
  def self.read_json(path)
    File.exist?(path) ? JSON.parse(File.read(path, encoding: "utf-8")) : nil
  end

  # ── Capacity at the explorer's default targets ──
  # A line-for-line port of getMaxC() / memoryBudget() / sessionBytes() /
  # capacity() in assets/js/benchmark-table.js, which stays the reference;
  # DEFAULT_CONFIG mirrors the widget's, and the store's "config" overrides
  # it the same way. If the widget's formula changes, change this with it.
  DEFAULT_CONFIG = {
    "ttft_threshold_ms" => 1000, "tps_threshold" => 20,
    "chat_multiplier" => 4, "agentic_multiplier" => 1.5,
    "chat_context_tokens" => 16384, "agentic_context_tokens" => 65536,
    "engine_memory_discrete" => 0.95, "engine_memory_unified" => 0.85,
    "weights_kv_share" => 0.9,
  }.freeze

  def self.each_lang(site)
    site.config["languages"].to_a.each do |lang|
      t = ((site.data[lang] || {})["strings"] || {})["sentences"]
      yield lang, t if t
    end
  end

  def self.meets(p, cfg)
    !p["ttft_ms"].nil? && p["ttft_ms"] <= cfg["ttft_threshold_ms"] &&
      !p["tps"].nil? && p["tps"] >= cfg["tps_threshold"]
  end

  def self.max_c(e, cfg)
    (e["data_points"] || []).select { |p| meets(p, cfg) }.map { |p| p["c"].to_i }.max || 0
  end

  def self.parse_params(v)
    return (v.to_f.finite? ? v.to_f : nil) if v.is_a?(Numeric)
    return nil unless v.is_a?(String) && (m = v.match(/(\d+(?:\.\d+)?)\s*([KMBT]?)/i))
    { "T" => 1e12, "M" => 1e6, "K" => 1e3 }.fetch(m[2].to_s.upcase, 1e9) * m[1].to_f
  end

  def self.memory_budget(e, cfg, mem)
    return nil if mem.nil? || e["kv_bytes_per_token"].nil?
    base = e["device"].to_s.sub(/\A\d+×\s*/, "")
    gb = (mem["memory_gb"] || {})[base]
    bpp = (mem["weight_bytes_per_param"] || {})[e["quantization"]]
    params = parse_params(e["params"])
    total = !e["weights_gb"].nil? ? e["weights_gb"] * 1e9 : (bpp && params ? params * bpp : nil)
    return nil if gb.nil? || total.nil?
    tp = e["tp"] || 1; pp = e["pp"] || 1; dp = e["dp"] || 1
    unified = (mem["unified_memory"] || []).include?(base)
    budget = gb * 1e9 * (unified ? cfg["engine_memory_unified"] : cfg["engine_memory_discrete"]) * cfg["weights_kv_share"]
    kv = budget - total / (tp * pp)
    return nil unless kv > 0
    { kv: kv, tp: tp, pp: pp, dp: dp, per_value: mem["kv_cache_bytes_per_value"] || 1,
      split: e["kv_heads"] ? [tp, e["kv_heads"]].min : 1 }
  end

  def self.session_bytes(e, b, ctx)
    kv = (e["kv_bytes_per_token"] * ctx + e["kv_window_bytes"].to_f) * b[:per_value] / b[:split]
    copied = (e["kv_replicated_bytes_per_token"] || 0) * ctx * b[:per_value]
    (kv + copied) / b[:pp] + (e["kv_state_bytes"] || 0).to_f / (b[:tp] * b[:pp])
  end

  # { "shown" => users, "limit" => "perf" | "mem" | "tie" | "context", "at_least" => bool }
  def self.capacity(e, kind, cfg, mem)
    mc = max_c(e, cfg)
    ctx = cfg["#{kind}_context_tokens"]
    perf = (mc * cfg["#{kind}_multiplier"]).floor
    ceiling = mc > 0 && mc == ((e["data_points"] || []).map { |p| p["c"].to_i }.max || 0)
    if !e["model_context_length"].nil? && ctx > e["model_context_length"]
      return { "shown" => 0, "limit" => "context", "at_least" => false }
    end
    b = memory_budget(e, cfg, mem)
    memu = b ? (b[:kv] / session_bytes(e, b, ctx)).floor * b[:dp] : nil
    if memu.nil?
      shown, limit = perf, "perf"
    else
      shown = [perf, memu].min
      limit = perf < memu ? "perf" : memu < perf ? "mem" : "tie"
    end
    { "shown" => shown, "limit" => limit, "at_least" => ceiling && limit == "perf", "mem_known" => !memu.nil? }
  end

  # ── Sentences: one short paragraph per row, in every language ──
  # Templates are _data/<lang>/strings.yml "sentences"; the wording follows the
  # explorers' own how-to sections. Numbers are formatted per language
  # (1,5 and 1.024 in Turkish; 1.5 and 1,024 in English).
  def self.num(x, lang, dec = 0)
    return "" if x.nil?
    v = dec.zero? ? x.to_f.round.to_s : format("%.#{dec}f", x.to_f).sub(/\.?0+\z/, "")
    int, frac = v.split(".")
    sep, dot = lang == "tr" ? [".", ","] : [",", "."]
    int = int.reverse.scan(/\d{1,3}/).join(sep).reverse.then { |i| v.start_with?("-") ? "-#{i}" : i }
    frac ? "#{int}#{dot}#{frac}" : int
  end

  def self.tokens(n)
    return "#{n / 1_048_576}M" if n >= 1_048_576 && (n % 1_048_576).zero?
    return "#{n / 1024}K" if n >= 1024 && (n % 1024).zero?
    n.to_s
  end

  def self.fill(t, vars)
    vars.reduce(t.to_s) { |acc, (k, v)| acc.gsub("%#{k}%", v.to_s) }
  end

  def self.llm_text(r, cfg, t, lang)
    par = { "TP" => r["tp"], "DP" => r["dp"], "PP" => r["pp"] }.select { |_, v| v && v != 1 }.map { |k, v| "#{k}=#{v}" }.join(", ")
    c1 = r["oz_c1"] || {}
    params = lang == "tr" ? r["params"].to_s.gsub(/(\d)\.(\d)/, '\1,\2') : r["params"]
    out = [fill(t["llm_run"], "model" => r["model"], "params" => params, "quant" => r["quantization"],
                "engine" => r["engine"], "device" => r["device"],
                "spec" => r["mtp"] ? t["llm_spec"] : "", "par" => par.empty? ? "" : fill(t["llm_par"], "par" => par),
                "ttft" => num(c1["ttft_ms"], lang), "tps" => num(c1["tps"], lang, 1))]
    tv = { "ttft_t" => num(cfg["ttft_threshold_ms"], lang), "tps_t" => num(cfg["tps_threshold"], lang, 1) }
    ch, ag = r["oz_chat"], r["oz_agentic"]
    n = lambda { |k| k["at_least"] ? fill(t["cap_min_n"], "n" => num(k["shown"], lang)) : num(k["shown"], lang) }
    if r["oz_max_c"].zero?
      out << fill(t["cap_none"], tv)
    else
      basis = [ch, ag].any? { |k| k["limit"] != "context" && !k["mem_known"] } ? t["basis_speed"] : t["basis_both"]
      out << if ag["limit"] == "context" then fill(t["cap_chat_only"], "basis" => basis, "chat" => n.call(ch))
             elsif ch["shown"] == ag["shown"] && ch["at_least"] == ag["at_least"] then fill(t["cap_same"], "basis" => basis, "chat" => n.call(ch))
             else fill(t["cap_range"], "basis" => basis, "chat" => n.call(ch), "agentic" => n.call(ag)) end
      out << t["cap_min"] if ch["at_least"] || ag["at_least"]
      out << t["cap_single"] if (r["data_points"] || []).map { |p| p["c"].to_i }.uniq == [1]
    end
    out
  end

  # ── VLM: Max Cameras at the explorer's default target ──
  # A port of responseOf() / meetsTarget() / maxCams() in
  # assets/js/vlm-benchmark-table.js, which stays the reference. Response time
  # is the time to first token; each camera keeps one request in flight, so the
  # number of cameras is the concurrency. Only the mean TTFT counts (over the
  # requests that completed); a failed request does not affect a cell.
  VLM_DEFAULT_CONFIG = { "response_target_s" => 3 }.freeze
  VLM_DEFAULT_RES = "720p".freeze
  VLM_DEFAULT_IMAGES = 1
  VLM_SIZES = %w[480p 720p 1080p 2K].freeze

  def self.vlm_response(p, _cfg = nil)
    p.nil? || p["ttft_s"].nil? ? nil : p["ttft_s"].to_f
  end

  def self.vlm_meets(p, cfg)
    r = vlm_response(p)
    !r.nil? && r <= cfg["response_target_s"]
  end

  def self.vlm_points(e, res, images)
    (e["data_points"] || []).select { |p| p["res"] == res && p["images"].to_i == images }.sort_by { |p| p["c"].to_i }
  end

  def self.vlm_max_c(e, res, images, cfg)
    vlm_points(e, res, images).select { |p| vlm_meets(p, cfg) }.map { |p| p["c"].to_i }.max || 0
  end

  def self.vlm_text(r, vlm, cfg, res, images, t, lang)
    m = (vlm["models"] || {})[r["model"]] || {}
    pts = vlm_points(r, res, images)
    c1 = pts.find { |p| p["c"].to_i == 1 }
    params = lang == "tr" ? m["params"].to_s.gsub(/(\d)\.(\d)/, '\1,\2') : m["params"]
    out = []
    if c1
      out << fill(t["vlm_run"], "model" => r["model"], "params" => params, "quant" => r["quantization"],
                  "engine" => r["engine"], "device" => r["device"], "res" => res,
                  "resp" => num(vlm_response(c1), lang, 2), "tps" => num(c1["tps"], lang, 1))
    end
    singles = (r["data_points"] || []).select { |p| p["c"].to_i == 1 }
    many = singles.select { |p| p["res"] == res && p["images"].to_i > images }.max_by { |p| p["images"].to_i }
    big = singles.select { |p| p["images"].to_i == images }.max_by { |p| VLM_SIZES.index(p["res"]).to_i }
    parts = []
    parts << fill(t["vlm_cost_many"], "n" => many["images"], "res" => res, "resp" => num(vlm_response(many), lang, 2)) if many
    parts << fill(t["vlm_cost_big"], "res" => big["res"], "resp" => num(vlm_response(big), lang, 2)) if big && big["res"] != res
    out << parts.join(" ") unless parts.empty?
    mc = vlm_max_c(r, res, images, cfg)
    top = pts.map { |p| p["c"].to_i }.max || 0
    tv = { "target" => num(cfg["response_target_s"], lang, 1), "res" => res, "max" => mc }
    key = mc.zero? ? "vlm_cams_none" : mc == top ? "vlm_cams_open" : mc == 1 ? "vlm_cams_one" : "vlm_cams"
    out << fill(t[key], tv) unless pts.empty?
    out
  end

  def self.cv_text(row, target, src, t, lang)
    last = row["points"].last || {}
    maxc = row["points"].select { |p| p["fps_per_camera"].to_f >= target }.map { |p| p["cameras"].to_i }.max || 0
    out = [fill(t["cv_run"], "model" => row["model"], "prec" => row["precision"].to_s.empty? ? "" : fill(t["cv_prec"], "prec" => row["precision"]),
                "input" => row["input_resolution"], "device" => row["device"], "cams" => last["cameras"],
                "fps" => num(last["fps_per_camera"], lang, 1), "total" => num(last["fps_total"], lang, 1),
                "drop" => num([last["drop_pct"].to_f, 0].max, lang, 1))]
    out << fill(maxc.zero? ? t["cv_max_zero"] : t["cv_max"], "target" => num(target, lang, 1), "max" => maxc)
    out << fill(t["cv_open"], "src" => num(src, lang)) if last["fps_per_camera"].to_f >= src * 0.9
    [out.join(" "), maxc]
  end

  class DataGenerator < Jekyll::Generator
    # :low, not :lowest — _plugins/benchmark-pages.rb (:lowest) reads site.data["oz_llm"].
    priority :low

    def generate(site)
      base = File.join(site.source, "assets", "data")

      llm = OzBenchStore.load_llm(File.join(base, "llm-benchmarks"))
      if llm
        (llm["benchmarks"] || []).each do |r|
          pts = (r["data_points"] || []).sort_by { |p| p["c"].to_i }
          r["oz_c1"] = pts.find { |p| p["c"].to_i == 1 }
          r["oz_sweep"] = pts.map { |p| "C=#{p['c']}: #{p['ttft_ms'].to_f.round} ms / #{p['tps']} tok/s" }.join("; ")
          cfg = OzVisibility::DEFAULT_CONFIG.merge(llm["config"] || {})
          r["oz_max_c"] = OzVisibility.max_c(r, cfg)
          r["oz_max_c_open"] = r["oz_max_c"] > 0 && r["oz_max_c"] == pts.map { |p| p["c"].to_i }.max
          r["oz_chat"] = OzVisibility.capacity(r, "chat", cfg, llm["memory"])
          r["oz_agentic"] = OzVisibility.capacity(r, "agentic", cfg, llm["memory"])
        end
        llm["oz_config"] = OzVisibility::DEFAULT_CONFIG.merge(llm["config"] || {})
        OzVisibility.each_lang(site) do |lang, t|
          llm["benchmarks"].each do |r|
            parts = OzVisibility.llm_text(r, llm["oz_config"], t, lang)
            (r["oz_parts"] ||= {})[lang] = parts
            (r["oz_text"] ||= {})[lang] = parts.join(" ")
          end
        end
        site.data["oz_llm"] = llm
      end

      vlm = OzBenchStore.load_vlm(File.join(base, "vlm-benchmarks"))
      if vlm
        cfg = OzVisibility::VLM_DEFAULT_CONFIG.merge(vlm["config"] || {})
        res, images = OzVisibility::VLM_DEFAULT_RES, OzVisibility::VLM_DEFAULT_IMAGES
        vlm["oz_config"] = cfg.merge("resolution" => res, "images" => images)
        (vlm["benchmarks"] || []).each do |r|
          m = (vlm["models"] || {})[r["model"]] || {}
          r["oz_params"] = m["params"]
          r["oz_sweep"] = (r["data_points"] || []).group_by { |p| [p["res"], p["images"]] }.map do |(rs, n), pts|
            "#{rs} × #{n}: " + pts.sort_by { |p| p["c"].to_i }.map { |p| "#{p['c']} cam #{p['ttft_s']} s / #{p['tps']} tok/s#{p['failed'].to_i.positive? ? " (#{p['failed']} of #{p['requests']} failed)" : ''}" }.join("; ")
          end.join(" | ")
          pts = OzVisibility.vlm_points(r, res, images)
          r["oz_default_points"] = pts
          r["oz_max_c"] = OzVisibility.vlm_max_c(r, res, images, cfg)
          r["oz_max_c_open"] = r["oz_max_c"] > 0 && r["oz_max_c"] == (pts.map { |p| p["c"].to_i }.max || 0)
        end
        OzVisibility.each_lang(site) do |lang, t|
          vlm["benchmarks"].each do |r|
            parts = OzVisibility.vlm_text(r, vlm, cfg, res, images, t, lang)
            (r["oz_parts"] ||= {})[lang] = parts
            (r["oz_text"] ||= {})[lang] = parts.join(" ")
          end
        end
        site.data["oz_vlm"] = vlm
      end

      cv_dir = File.join(base, "cv-benchmarks")
      cv = OzVisibility.read_json(File.join(cv_dir, "index.json"))
      if cv
        rows = []
        (cv["devices"] || []).each do |d|
          (d["models"] || []).each do |m|
            md = OzVisibility.read_json(File.join(cv_dir, m["path"].to_s)) or next
            pts = (md["points"] || {}).values.sort_by { |p| p["cameras"].to_i }
            next if pts.empty?
            rows << {
              # The widget's own id (entryFrom() in cv-benchmark-table.js): the
              # file's path in the store, "/" → "-". _plugins/benchmark-pages.rb
              # builds each result's permanent page from "path".
              "id" => m["path"].to_s.sub(/\.json\z/, "").tr("/", "-"), "path" => m["path"].to_s.sub(/\.json\z/, ""),
              "device" => d["name"], "kind" => d["kind"], "model" => m["name"],
              "precision" => m["precision"], "input_resolution" => m["input_resolution"],
              "points" => pts,
              "sweep" => pts.map { |p| "#{p['cameras']} cam: #{p['fps_per_camera']} FPS/cam, drop #{p['drop_pct']}%" }.join("; "),
            }
          end
        end
        target = ((cv["config"] || {})["target_fps"] || 15).to_f
        src = (((cv["source_profiles"] || {})[cv["default_source_profile"]] || {})["fps"] || 20).to_f
        OzVisibility.each_lang(site) do |lang, t|
          rows.each { |row| (row["text"] ||= {})[lang], row["max_cameras"] = OzVisibility.cv_text(row, target, src, t, lang) }
        end
        cv["oz_rows"] = rows
        site.data["oz_cv"] = cv
      end

      site.data["oz_pages"] = OzVisibility.translated_pages(site)
    end
  end

  # One entry per page_id, with the permalink of every language that has the
  # page. Read from the source files' front matter rather than site.pages,
  # because polyglot hands each language pass only that language's pages.
  def self.translated_pages(site)
    default = site.config["default_lang"]
    by_id = {}
    Dir.glob("**/*.{md,html}", base: site.source).sort.each do |rel|
      next if rel.split("/").any? { |seg| seg.start_with?("_", ".") } || site.exclude.any? { |x| rel == x || rel.start_with?("#{x}/") }
      text = File.read(File.join(site.source, rel), encoding: "utf-8")
      next unless text =~ /\A---\s*\n(.*?)\n---\s*\n/m
      fm = SafeYAML.load(Regexp.last_match(1)) rescue next
      next unless fm.is_a?(Hash) && fm["page_id"] && fm["permalink"]
      lang = (fm["lang"] || default).to_s
      e = (by_id[fm["page_id"]] ||= { "page_id" => fm["page_id"], "langs" => {} })
      e["langs"][lang] = fm["permalink"]
      if lang == default || !e["title"]
        e.merge!("title" => fm["title"], "description" => fm["description"].to_s.strip,
                 "date" => fm["date"], "last_modified_date" => fm["last_modified_date"], "parent" => fm["parent"])
      end
    end
    by_id.values.each do |e|
      e["langs"] = ([default] + site.config["languages"].to_a).uniq.select { |l| e["langs"][l] }.map { |l| [l, e["langs"][l]] }.to_h
    end
  end

  def self.lang_url(site, lang, permalink)
    prefix = lang == site.config["default_lang"] ? "" : "/#{lang}"
    "#{site.config['url']}#{site.config['baseurl']}#{prefix}#{permalink}"
  end
end

Jekyll::Hooks.register :pages, :pre_render do |page, payload|
  site = page.site
  id = page.data["page_id"]
  next unless id && page.data["permalink"]
  entry = (site.data["oz_pages"] || []).find { |e| e["page_id"] == id } or next

  # payload["page"] is a copy taken before this hook, so set both.
  set = lambda { |k, v| page.data[k] = v; payload["page"][k] = v }

  active = site.config["active_lang"] || site.config["default_lang"]
  if active != site.config["default_lang"] && page.data["lang"] == active && page.data["canonical_url"].to_s.empty?
    set.call("canonical_url", OzVisibility.lang_url(site, active, page.data["permalink"]))
  end
  if entry["langs"].size > 1
    set.call("oz_alternates", entry["langs"].map { |l, pl| [l, OzVisibility.lang_url(site, l, pl)] }.to_h)
  end
end
