# A permanent page for every LLM benchmark run, generated at build time.
#
#   /llm-inference-benchmarks/<model>/<device>/<config>/    in every language
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

  class Generator < Jekyll::Generator
    priority :lowest

    def generate(site)
      llm = site.data["oz_llm"] or return
      rows = llm["benchmarks"] || []
      OzBenchPages.slugs(rows)
      langs = site.config["languages"].to_a
      # For sitemap.xml: every run page, built in every language.
      site.data["oz_bench_pages"] = rows.map { |r| { "permalink" => r["oz_permalink"], "langs" => langs } }

      lang = site.config["active_lang"] || site.config["default_lang"]
      b = (site.data[lang] || {}).dig("strings", "bench_page") or return
      rows.each do |r|
        page = Jekyll::PageWithoutAFile.new(site, site.source, r["oz_permalink"].delete_prefix("/"), "index.html")
        alternates = langs.map { |l| [l, OzVisibility.lang_url(site, l, r["oz_permalink"])] }.to_h
        page.data.merge!(
          "layout" => "default", "title" => OzBenchPages.title(r, b),
          "description" => ((r["oz_parts"] || {})[lang] || []).first.to_s, "lang" => lang,
          "permalink" => r["oz_permalink"], "nav_exclude" => true, "search_exclude" => true, "toc" => false,
          "oz_alternates" => alternates, "canonical_url" => alternates[lang],
        )
        page.content = OzBenchPages.page_html(r, llm["oz_config"], b, lang)
        site.pages << page
      end
    end
  end
end
