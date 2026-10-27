# A permanent page for every benchmark result, generated at build time.
#
#   /llm-inference-benchmarks/<model>/<device>/<config>/    every LLM run
#   /cv-inference-benchmarks/<device>/<model>/              every CV result
#   /vlm-inference-benchmarks/<model>/<device>/<quant>-<engine>/   every VLM run
#   /custom-engine-vlm-benchmarks/<device>/<vlm>/   every Custom Engine VLM configuration
#
# (in every language). The CV URL is the result's file in the data store,
# assets/data/cv-benchmarks/<device>/<model>.json, which the benchmark tool's
# export names; the page then carries the widget's data-cvbt-only instead. The
# Custom Engine VLM URL is built the same way from its store
# (assets/data/custom-engine-vlm-benchmarks/<device>/<vlm>.json, data-cevbt-only).
#
# The explorer addresses a run only by a #fragment, which search engines and AI
# agents do not treat as a page of its own; this gives every run its own URL,
# title and description. The page shows exactly what the explorer shows for
# that row, opened: the widget itself draws it (data-bt-only), and until it has,
# the same row and sweep are there as plain HTML for readers without scripts.
# Built from site.data["oz_llm"] (_plugins/visibility.rb) and the `bench_page`
# block of _data/<lang>/strings.yml, so a new run gets its page with no edit.
#
# The URL is built from the run's fields, never from its position: model, device,
# then number format, engine, parallelism and speculative decoding. Two runs
# that agree on all of those get the extra tail of their `id` (see slugs()).
# Published URLs are permanent — do not change how a slug is formed.

require "cgi"

module OzBenchPages
  BASE = "/llm-inference-benchmarks".freeze

  def self.slug(s)
    s.to_s.downcase.tr("×", "x").gsub(/[^a-z0-9]+/, "-").gsub(/\A-|-\z/, "")
  end

  def self.config_slug(r)
    s = "#{slug(r['quantization'])}-#{slug(r['engine'])}-tp#{r['tp'] || 1}"
    s += "-dp#{r['dp']}" if (r["dp"] || 1) > 1
    s += "-pp#{r['pp']}" if (r["pp"] || 1) > 1
    s += (r["mtp_k"] ? "-spec#{r['mtp_k']}" : "-spec") if r["mtp"]
    s
  end

  # Sets r["oz_permalink"] on every run. When several runs share a path, the
  # shortest id keeps it and the others append the part of their id beyond that
  # one (…_tp8 and …_tp8_1m → …-tp8-spec5 and …-tp8-spec5-1m).
  def self.slugs(rows)
    rows.group_by { |r| [slug(r["model"]), slug(r["device"]), config_slug(r)] }.each do |(m, d, c), group|
      first = group.min_by { |r| [r["id"].length, r["id"]] }
      group.each do |r|
        tail = r.equal?(first) ? "" : slug(r["id"].delete_prefix(first["id"]))
        tail = slug(r["id"]) if !r.equal?(first) && tail.empty?
        r["oz_permalink"] = "#{BASE}/#{m}/#{d}/#{c}#{tail.empty? ? '' : "-#{tail}"}/"
      end
    end
  end

  def self.h(s) = CGI.escapeHTML(s.to_s)

  # "FP8, SGLang, TP4" — the run's settings, for the title.
  def self.config_label(r, b)
    par = { "TP" => r["tp"] || 1, "DP" => r["dp"], "PP" => r["pp"] }.select { |k, v| v && (k == "TP" || v != 1) }.map { |k, v| "#{k}#{v}" }
    spec = r["mtp"] ? [r["mtp_k"] ? "#{b['spec_short']} k=#{r['mtp_k']}" : b["spec_short"]] : []
    ([r["quantization"], r["engine"]] + par + spec).join(", ")
  end

  def self.title(r, b)
    OzVisibility.fill(b["title_run"], "model" => r["model"], "device" => r["device"], "config" => config_label(r, b))
  end

  def self.cap(k)
    k["limit"] == "context" ? "—" : "#{k['shown']}#{k['at_least'] ? '+' : ''}"
  end

  # The explorer's row and its opened sweep, as plain HTML. The widget replaces
  # it; it holds nothing the explorer does not show.
  def self.fallback(r, cfg, b, lang)
    dash = ->(v) { v && v != 1 ? v : "—" }
    facts = [
      [b["model"], r["model"]], [b["params"], r["params"]],
      [b["intel"], r["intelligence_index"] || "—"], [b["agentic_idx"], r["agentic_index"] || "—"],
      [b["device"], r["device"]], [b["quant"], r["quantization"]],
      [b["maxc"], "#{r['oz_max_c']}#{r['oz_max_c_open'] ? '+' : ''}"],
      [b["chat"], cap(r["oz_chat"])], [b["agentic"], cap(r["oz_agentic"])],
      ["TP", dash.(r["tp"])], ["DP", dash.(r["dp"])], ["PP", dash.(r["pp"])],
      [b["engine"], r["engine"]], [b["spec"], r["mtp"] ? b["spec_yes"] : "—"],
    ]
    out = +%(<div class="bt-static">\n<table>\n<tbody>\n)
    facts.each { |k, v| out << "<tr><th scope=\"row\">#{h k}</th><td>#{h v}</td></tr>\n" }
    out << "</tbody>\n</table>\n<table>\n<thead><tr>"
    %w[col_c col_ttft col_tps col_status].each { |k| out << "<th>#{h b[k]}</th>" }
    out << "</tr></thead>\n<tbody>\n"
    (r["data_points"] || []).each do |p|
      out << "<tr><td>#{p['c']}</td><td>#{p['ttft_ms'].nil? ? '—' : p['ttft_ms'].round}</td>" \
             "<td>#{format('%.2f', p['tps'].to_f)}</td><td>#{OzVisibility.meets(p, cfg) ? 'PASS' : 'FAIL'}</td></tr>\n"
    end
    out << "</tbody>\n</table>\n"
    (r["oz_parts"] || {})[lang].to_a.each { |p| out << "<p>#{h p}</p>\n" }
    out << "<p><strong>#{h b['notes']}</strong> #{h r['notes']}</p>\n" unless r["notes"].to_s.strip.empty?
    out << "</div>\n"
  end

  def self.page_html(r, cfg, b, lang)
    js = lang == "en" ? "benchmark-table.js" : "benchmark-table.#{lang}.js"
    out = +%(<p class="oz-crumb"><a href="#{BASE}/">#{h b['crumb']}</a></p>\n)
    out << "<h1>#{h title(r, b)}</h1>\n"
    out << %(<p><a href="#{BASE}/##{h r['id']}">#{h b['open_explorer']}</a></p>\n)
    out << %(<link rel="stylesheet" href="/assets/css/benchmark-table.css">\n)
    out << %(<div data-bt-src="/assets/data/benchmarks.json" data-bt-logo="/assets/images/benchmark-logo.png" data-bt-only="#{h r['id']}">\n)
    out << fallback(r, cfg, b, lang) << "</div>\n"
    out << %(<p class="bt-attribution">#{b['attribution']}</p>\n)
    # The widget reads the explanation from here, as on the explorer page.
    out << %(<div class="bt-explained-src" hidden><div data-bt-explained="#{h r['id']}">)
    (r["oz_parts"] || {})[lang].to_a.each { |p| out << "<p>#{h p}</p>" }
    out << "</div></div>\n"
    %w[https://cdn.jsdelivr.net/npm/chart.js@4 https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2
       https://cdn.jsdelivr.net/npm/html2canvas@1].each { |s| out << %(<script src="#{s}"></script>\n) }
    out << %(<script src="/assets/js/#{js}"></script>\n)
  end

  CV_BASE = "/cv-inference-benchmarks".freeze

  def self.cv_permalink(row)
    "#{CV_BASE}/#{row['path'].split('/').map { |x| slug(x) }.join('/')}/"
  end

  def self.cv_name(row) = [row["model"], row["precision"]].reject { |x| x.to_s.empty? }.join(" ")

  def self.cv_title(row, b)
    OzVisibility.fill(b["cv_title"], "model" => cv_name(row), "device" => row["device"])
  end

  # The CV explorer's row and its opened sweep, as plain HTML (see fallback()).
  def self.cv_fallback(row, target, b)
    pts = row["points"]
    last = pts.last || {}
    maxc = pts.select { |p| p["fps_per_camera"].to_f >= target }.map { |p| p["cameras"].to_i }.max || 0
    t = target == target.round ? target.round : target
    facts = [[b["cv_model"], cv_name(row)], [b["cv_input"], row["input_resolution"]], [b["cv_device"], row["device"]],
             [b["cv_cameras"], last["cameras"]], [b["cv_percam"], format("%.1f", last["fps_per_camera"].to_f)],
             [b["cv_total"], format("%.1f", last["fps_total"].to_f)], [b["cv_drop"], format("%.2f", last["drop_pct"].to_f)],
             [OzVisibility.fill(b["cv_maxcams"], "target" => t), maxc]]
    out = +%(<div class="bt-static">\n<table>\n<tbody>\n)
    facts.each { |k, v| out << "<tr><th scope=\"row\">#{h k}</th><td>#{h v}</td></tr>\n" }
    out << "</tbody>\n</table>\n<table>\n<thead><tr>"
    %w[cv_cameras cv_percam cv_total cv_drop cv_status].each { |k| out << "<th>#{h b[k]}</th>" }
    out << "</tr></thead>\n<tbody>\n"
    pts.each do |p|
      ok = p["fps_per_camera"].to_f >= target
      out << "<tr><td>#{p['cameras']}</td><td>#{format('%.1f', p['fps_per_camera'].to_f)}</td>" \
             "<td>#{format('%.1f', p['fps_total'].to_f)}</td><td>#{format('%.2f', p['drop_pct'].to_f)}</td>" \
             "<td>#{h(ok ? b['cv_pass'] : b['cv_fail'])}</td></tr>\n"
    end
    out << "</tbody>\n</table>\n</div>\n"
  end

  def self.cv_page_html(row, target, b, lang)
    js = lang == "en" ? "cv-benchmark-table.js" : "cv-benchmark-table.#{lang}.js"
    out = +%(<p class="oz-crumb"><a href="#{CV_BASE}/">#{h b['cv_crumb']}</a></p>\n)
    out << "<h1>#{h cv_title(row, b)}</h1>\n"
    out << %(<p><a href="#{CV_BASE}/##{h row['id']}">#{h b['cv_open_explorer']}</a></p>\n)
    out << %(<link rel="stylesheet" href="/assets/css/benchmark-table.css">\n<link rel="stylesheet" href="/assets/css/cv-benchmark-table.css">\n)
    out << %(<div data-cvbt-src="/assets/data/cv-benchmarks/index.json" data-cvbt-video="/assets/video/cv-preview.mp4" data-cvbt-only="#{h row['id']}">\n)
    out << cv_fallback(row, target, b) << "</div>\n"
    out << %(<script src="/assets/js/#{js}"></script>\n)
  end

  VLM_BASE = "/vlm-inference-benchmarks".freeze

  # Model, device, then number format and engine — the settings that tell the
  # VLM runs apart. Two runs that agree on all of them get the extra tail of
  # their id, as in slugs(). Published URLs are permanent.
  def self.vlm_slugs(rows)
    rows.group_by { |r| [slug(r["model"]), slug(r["device"]), "#{slug(r['quantization'])}-#{slug(r['engine'])}"] }.each do |(m, d, c), group|
      first = group.min_by { |r| [r["id"].length, r["id"]] }
      group.each do |r|
        tail = r.equal?(first) ? "" : slug(r["id"].delete_prefix(first["id"]))
        tail = slug(r["id"]) if !r.equal?(first) && tail.empty?
        r["oz_permalink"] = "#{VLM_BASE}/#{m}/#{d}/#{c}#{tail.empty? ? '' : "-#{tail}"}/"
      end
    end
  end

  def self.vlm_title(r, b)
    OzVisibility.fill(b["vlm_title"], "model" => r["model"], "device" => r["device"],
                      "config" => "#{r['quantization']}, #{r['engine']}")
  end

  def self.sec(x) = x.nil? ? "—" : format(x.to_f < 10 ? "%.2f" : "%.1f", x.to_f)

  # The VLM explorer's row and its opened sweep at the default image size, as
  # plain HTML (see fallback()).
  def self.vlm_fallback(r, vlm, b, lang)
    cfg = vlm["oz_config"]
    res = cfg["resolution"]
    t = cfg["response_target_s"] == cfg["response_target_s"].round ? cfg["response_target_s"].round : cfg["response_target_s"]
    m = (vlm["models"] || {})[r["model"]] || {}
    facts = [[b["model"], r["model"]], [b["params"], m["params"] || "—"]]
    facts += [[b["device"], r["device"]], [b["quant"], r["quantization"]], [b["vlm_res"], res],
              [b["vlm_images"], cfg["images"]],
              [OzVisibility.fill(b["vlm_maxcams"], "target" => t),
               r["oz_max_c"].zero? ? OzVisibility.fill(b["vlm_over"], "target" => t) : "#{r['oz_max_c']}#{r['oz_max_c_open'] ? '+' : ''}"],
              [b["engine"], r["engine"]]]
    out = +%(<div class="bt-static">\n<table>\n<tbody>\n)
    facts.each { |k, v| out << "<tr><th scope=\"row\">#{h k}</th><td>#{h v}</td></tr>\n" }
    out << "</tbody>\n</table>\n<table>\n<thead><tr>"
    [b["vlm_cams"], b["vlm_resp"], b["vlm_tps"], b["vlm_status"]].each { |k| out << "<th>#{h k}</th>" }
    out << "</tr></thead>\n<tbody>\n"
    (r["oz_default_points"] || []).each do |p|
      out << "<tr><td>#{p['c']}</td><td>#{sec(p['ttft_s'])}</td><td>#{format('%.1f', p['tps'].to_f)}</td>" \
             "<td>#{h OzVisibility.fill(b[OzVisibility.vlm_meets(p, cfg) ? 'vlm_within' : 'vlm_over'], 'target' => t)}</td></tr>\n"
    end
    # the level at which a request failed closes the sweep, as in the widget
    fail = ((r["limits"] || {})["cameras"] || {})[res]
    out << "<tr><td>#{fail}</td><td>—</td><td>—</td><td>#{h b['vlm_failed']}</td></tr>\n" if fail && cfg["images"].to_i == 1
    out << "</tbody>\n</table>\n"
    # then images per request with one camera, closed by the count that failed, as in the widget
    imgs = (r["data_points"] || []).select { |p| p["res"] == res && p["c"].to_i == 1 }.sort_by { |p| p["images"].to_i }
    if imgs.size > 1
      out << "<table>\n<thead><tr>"
      [b["vlm_imgs"], b["vlm_resp"], b["vlm_tps"], b["vlm_status"]].each { |k| out << "<th>#{h k}</th>" }
      out << "</tr></thead>\n<tbody>\n"
      imgs.each do |p|
        out << "<tr><td>#{p['images']}</td><td>#{sec(p['ttft_s'])}</td><td>#{format('%.1f', p['tps'].to_f)}</td>" \
               "<td>#{h OzVisibility.fill(b[OzVisibility.vlm_meets(p, cfg) ? 'vlm_within' : 'vlm_over'], 'target' => t)}</td></tr>\n"
      end
      ifail = ((r["limits"] || {})["images"] || {})[res]
      out << "<tr><td>#{ifail}</td><td>—</td><td>—</td><td>#{h b['vlm_failed']}</td></tr>\n" if ifail
      out << "</tbody>\n</table>\n"
    end
    (r["oz_parts"] || {})[lang].to_a.each { |p| out << "<p>#{h p}</p>\n" }
    out << "</div>\n"
  end

  def self.vlm_page_html(r, vlm, b, lang)
    js = lang == "en" ? "vlm-benchmark-table.js" : "vlm-benchmark-table.#{lang}.js"
    out = +%(<p class="oz-crumb"><a href="#{VLM_BASE}/">#{h b['vlm_crumb']}</a></p>\n)
    out << "<h1>#{h vlm_title(r, b)}</h1>\n"
    out << %(<p><a href="#{VLM_BASE}/##{h r['id']}">#{h b['vlm_open_explorer']}</a></p>\n)
    out << %(<link rel="stylesheet" href="/assets/css/benchmark-table.css">\n<link rel="stylesheet" href="/assets/css/vlm-benchmark-table.css">\n)
    out << %(<div data-vlmbt-src="/assets/data/vlm-benchmarks.json" data-vlmbt-logo="/assets/images/benchmark-logo.png" data-vlmbt-only="#{h r['id']}">\n)
    out << vlm_fallback(r, vlm, b, lang) << "</div>\n"
    # The widget reads the explanation from here, as on the explorer page.
    out << %(<div class="bt-explained-src" hidden><div data-vlmbt-explained="#{h r['id']}">)
    (r["oz_parts"] || {})[lang].to_a.each { |p| out << "<p>#{h p}</p>" }
    out << "</div></div>\n"
    %w[https://cdn.jsdelivr.net/npm/chart.js@4 https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2
       https://cdn.jsdelivr.net/npm/html2canvas@1].each { |s| out << %(<script src="#{s}"></script>\n) }
    out << %(<script src="/assets/js/#{js}"></script>\n)
  end

  CEVLM_BASE = "/custom-engine-vlm-benchmarks".freeze

  def self.cevlm_permalink(row)
    "#{CEVLM_BASE}/#{row['path'].split('/').map { |x| slug(x) }.join('/')}/"
  end

  def self.cevlm_title(row, b)
    OzVisibility.fill(b["cevlm_title"], "device" => row["device"], "model" => "#{row['model']} #{row['quantization']}")
  end

  def self.cevlm_frames(k, b) = k == "auto" ? b["cevlm_auto"] : k

  # Half up on the value as the store writes it, as fmt() in the widget does:
  # 2.295 is 2.30 on both.
  def self.cevlm_num(x, d)
    return "—" if x.nil?
    format("%.#{d}f", (x.to_f * 10**d + (x.to_f.negative? ? -1e-7 : 1e-7)).round / 10.0**d)
  end

  def self.cevlm_sec(x) = x.nil? ? "—" : cevlm_num(x, x.to_f < 10 ? 2 : 1)

  # The explorer's row and its opened sweep at the default frames, then Max
  # cameras for every frames count, as plain HTML (see fallback()).
  def self.cevlm_fallback(row, target, b, lang)
    t = target == target.round ? target.round : target
    over = OzVisibility.fill(b["cevlm_over"], "target" => t)
    maxc = ->(m, open) { m.zero? ? over : "#{m}#{open ? '+' : ''}" }
    sw = row["sweeps"][row["oz_frames"]]
    last = sw["points"].last || {}
    facts = [[b["cevlm_device"], row["device"]],
             [b["cevlm_vlm"], "#{row['model']} · #{row['quantization']} · #{row['engine']} · #{row['server']}"],
             [b["cevlm_frames"], cevlm_frames(row["oz_frames"], b)], [b["cevlm_cams"], last["cameras"]],
             [b["cevlm_interval"], cevlm_sec(OzVisibility.cevlm_interval(last))],
             [b["cevlm_answers"], cevlm_num(last["answers_per_min"], 0)],
             [b["cevlm_cpu"], cevlm_num(last["engine_cpu_pct"].to_f / 100, 1)],
             [OzVisibility.fill(b["cevlm_maxcams"], "target" => t), maxc.(row["oz_max"], row["oz_open"])]]
    out = +%(<div class="bt-static">\n<table>\n<tbody>\n)
    facts.each { |k, v| out << "<tr><th scope=\"row\">#{h k}</th><td>#{h v}</td></tr>\n" }
    out << "</tbody>\n</table>\n<table>\n<thead><tr>"
    %w[cevlm_cams cevlm_interval cevlm_slowest cevlm_answers cevlm_cpu cevlm_status].each { |k| out << "<th>#{h b[k]}</th>" }
    out << "</tr></thead>\n<tbody>\n"
    sw["points"].each do |p|
      ok = OzVisibility.cevlm_meets(p, target)
      out << "<tr><td>#{p['cameras']}</td><td>#{cevlm_sec(p['interval_s'])}</td><td>#{cevlm_sec(p['interval_slowest_s'])}</td>" \
             "<td>#{cevlm_num(p['answers_per_min'], 0)}</td><td>#{cevlm_num(p['engine_cpu_pct'].to_f / 100, 1)}</td>" \
             "<td>#{h OzVisibility.fill(b[ok ? 'cevlm_within' : 'cevlm_over'], 'target' => t)}</td></tr>\n"
    end
    # the count at which not every camera came up closes the sweep, as in the widget
    if (f = row["oz_failure"])
      out << "<tr><td>#{f['cameras']}</td><td>—</td><td>—</td><td>—</td><td>—</td>" \
             "<td>#{h OzVisibility.fill(b['cevlm_failed'], 'started' => f['started'], 'n' => f['cameras'])}</td></tr>\n"
    end
    out << "</tbody>\n</table>\n<table>\n<thead><tr><th>#{h b['cevlm_frames']}</th>" \
           "<th>#{h OzVisibility.fill(b['cevlm_maxcams'], 'target' => t)}</th></tr></thead>\n<tbody>\n"
    row["oz_frames_max"].each { |k, (m, open)| out << "<tr><td>#{h cevlm_frames(k, b)}</td><td>#{h maxc.(m, open)}</td></tr>\n" }
    out << "</tbody>\n</table>\n"
    (row["oz_parts"] || {})[lang].to_a.each { |x| out << "<p>#{h x}</p>\n" }
    out << "</div>\n"
  end

  def self.cevlm_page_html(row, target, b, lang)
    js = lang == "en" ? "custom-engine-vlm-benchmark-table.js" : "custom-engine-vlm-benchmark-table.#{lang}.js"
    out = +%(<p class="oz-crumb"><a href="#{CEVLM_BASE}/">#{h b['cevlm_crumb']}</a></p>\n)
    out << "<h1>#{h cevlm_title(row, b)}</h1>\n"
    out << %(<p><a href="#{CEVLM_BASE}/##{h row['id']}">#{h b['cevlm_open_explorer']}</a></p>\n)
    out << %(<link rel="stylesheet" href="/assets/css/benchmark-table.css">\n<link rel="stylesheet" href="/assets/css/cv-benchmark-table.css">\n)
    out << %(<link rel="stylesheet" href="/assets/css/custom-engine-vlm-benchmark-table.css">\n)
    out << %(<div data-cevbt-src="/assets/data/custom-engine-vlm-benchmarks/index.json" data-cevbt-only="#{h row['id']}">\n)
    out << cevlm_fallback(row, target, b, lang) << "</div>\n"
    # The widget reads the explanation from here, as on the explorer page.
    out << %(<div class="bt-explained-src" hidden><div data-cevbt-explained="#{h row['id']}">)
    (row["oz_parts"] || {})[lang].to_a.each { |x| out << "<p>#{h x}</p>" }
    out << "</div></div>\n"
    out << %(<script src="/assets/js/#{js}"></script>\n)
  end

  class Generator < Jekyll::Generator
    priority :lowest

    def generate(site)
      llm = site.data["oz_llm"] or return
      rows = llm["benchmarks"] || []
      OzBenchPages.slugs(rows)
      langs = site.config["languages"].to_a
      cv = site.data["oz_cv"] || {}
      cv_rows = cv["oz_rows"] || []
      cv_rows.each { |row| row["oz_permalink"] = OzBenchPages.cv_permalink(row) }
      cv_target = ((cv["config"] || {})["target_fps"] || 15).to_f
      vlm = site.data["oz_vlm"] || {}
      vlm_rows = vlm["benchmarks"] || []
      OzBenchPages.vlm_slugs(vlm_rows)
      ce = site.data["oz_cevlm"] || {}
      ce_rows = ce["oz_rows"] || []
      ce_rows.each { |row| row["oz_permalink"] = OzBenchPages.cevlm_permalink(row) }
      ce_target = ((ce["oz_config"] || {})["target_s"] || 3).to_f
      # For sitemap.xml: every result page, built in every language.
      site.data["oz_bench_pages"] = (rows + cv_rows + vlm_rows + ce_rows).map { |r| { "permalink" => r["oz_permalink"], "langs" => langs } }

      lang = site.config["active_lang"] || site.config["default_lang"]
      b = (site.data[lang] || {}).dig("strings", "bench_page") or return
      rows.each do |r|
        add(site, r["oz_permalink"], OzBenchPages.title(r, b), ((r["oz_parts"] || {})[lang] || []).first.to_s,
            lang, langs, OzBenchPages.page_html(r, llm["oz_config"], b, lang))
      end
      cv_rows.each do |row|
        desc = (row["text"] || {})[lang].to_s.split(/(?<=\.) /).first.to_s
        add(site, row["oz_permalink"], OzBenchPages.cv_title(row, b), desc, lang, langs,
            OzBenchPages.cv_page_html(row, cv_target, b, lang))
      end
      vlm_rows.each do |r|
        add(site, r["oz_permalink"], OzBenchPages.vlm_title(r, b), ((r["oz_parts"] || {})[lang] || []).first.to_s,
            lang, langs, OzBenchPages.vlm_page_html(r, vlm, b, lang))
      end
      ce_rows.each do |row|
        add(site, row["oz_permalink"], OzBenchPages.cevlm_title(row, b), ((row["oz_parts"] || {})[lang] || []).first.to_s,
            lang, langs, OzBenchPages.cevlm_page_html(row, ce_target, b, lang))
      end
    end

    def add(site, permalink, title, desc, lang, langs, html)
      page = Jekyll::PageWithoutAFile.new(site, site.source, permalink.delete_prefix("/"), "index.html")
      alternates = langs.map { |l| [l, OzVisibility.lang_url(site, l, permalink)] }.to_h
      page.data.merge!(
        "layout" => "default", "title" => title, "description" => desc, "lang" => lang,
        "permalink" => permalink, "nav_exclude" => true, "search_exclude" => true, "toc" => false,
        "oz_alternates" => alternates, "canonical_url" => alternates[lang],
      )
      page.content = html
      site.pages << page
    end
  end
end
