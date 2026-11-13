# The changelog: _data/changelog.yml, resolved for the language being built into
# site.data["oz_changelog"] and read by _includes/changelog.html (the
# /changelog/ page and the home-page block).
#
# The entries are written by hand; this only turns each entry's reference into
# a link in the reader's language: page (a page_id) → that page's title and
# permalink, run → the LLM run's permanent page, vlm → the VLM run's page, cv →
# the CV result's page. An
# id that does not resolve fails the build, so no link can point nowhere.
#
# Runs at :site, :pre_render — after every generator, so the run pages
# (_plugins/benchmark-pages.rb) already carry oz_permalink — and once per
# language, because polyglot builds each language as its own pass.

module OzChangelog
  TYPES = %w[paper benchmarks vlm cv].freeze
  # The reference each type needs.
  NEEDS = { "paper" => "page", "benchmarks" => "run", "vlm" => "vlm", "cv" => "cv" }.freeze

  def self.build(site)
    lang = site.active_lang || site.config["default_lang"]
    pages = {}
    site.pages.each do |p|
      id = p.data["page_id"]
      pages[id] = p if id && (p.data["lang"] || site.config["default_lang"]) == lang
    end
    llm = ((site.data["oz_llm"] || {})["benchmarks"] || []).to_h { |r| [r["id"], r] }
    cv = ((site.data["oz_cv"] || {})["oz_rows"] || []).to_h { |r| [r["id"], r] }
    vlm = ((site.data["oz_vlm"] || {})["benchmarks"] || []).to_h { |r| [r["id"], r] }

    seen = Hash.new(0)
    (site.data["changelog"] || []).each_with_index.map do |e, i|
      where = "_data/changelog.yml entry #{i + 1} (#{e['date']})"
      raise "#{where}: type must be one of #{TYPES.join(', ')}" unless TYPES.include?(e["type"])
      text = (e["text"] || {})[lang].to_s.strip
      raise "#{where}: no #{lang} text" if text.empty?
      link =
        if e["run"]
          r = llm[e["run"]] or raise "#{where}: run #{e['run'].inspect} is not in the LLM store (assets/data/llm-benchmarks/)"
          { "title" => "#{r['model']} — #{r['device']}", "url" => r["oz_permalink"] }
        elsif e["vlm"]
          r = vlm[e["vlm"]] or raise "#{where}: VLM run #{e['vlm'].inspect} is not in the VLM store (assets/data/vlm-benchmarks/)"
          { "title" => "#{r['model']} — #{r['device']}", "url" => r["oz_permalink"] }
        elsif e["cv"]
          r = cv[e["cv"]] or raise "#{where}: CV result #{e['cv'].inspect} is not in assets/data/cv-benchmarks/"
          { "title" => "#{[r['model'], r['precision']].compact.join(' ')} — #{r['device']}", "url" => r["oz_permalink"] }
        elsif e["page"]
          p = pages[e["page"]] or raise "#{where}: page_id #{e['page'].inspect} has no #{lang} page"
          { "title" => p.data["title"], "url" => p.data["permalink"] }
        end
      raise "#{where}: a #{e['type']} entry needs #{NEEDS[e['type']]}" if link.nil?
      date = Date.parse(e["date"].to_s)
      key = "#{date.strftime('%Y-%m-%d')}-#{e['type']}"
      seen[key] += 1
      { "date" => date.to_time, "type" => e["type"], "text" => text, "link" => link,
        "anchor" => "c-#{key}#{seen[key] > 1 ? "-#{seen[key]}" : ''}" }
    end
  end
end

Jekyll::Hooks.register :site, :pre_render do |site, payload|
  list = OzChangelog.build(site)
  site.data["oz_changelog"] = list
  payload["site"]["data"]["oz_changelog"] = list if payload["site"] && payload["site"]["data"]
end
