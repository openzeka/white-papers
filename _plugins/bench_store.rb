# The LLM and VLM benchmark data stores, and the combined files built from them.
#
#   assets/data/llm-benchmarks/   index.json, <device>/device.json, <device>/<run id>.json
#   assets/data/vlm-benchmarks/   the same layout
#
# The explorers and openzeka.com read one combined file per explorer. This
# writes them into the built site at the URLs they have always had —
#
#   /assets/data/benchmarks.json        (openzeka.com fetches this exact URL)
#   /assets/data/vlm-benchmarks.json
#
# — once, in the default language's pass (polyglot builds the other languages
# into <dest>/<lang>/, and the data must never get a translated copy).
#
# load_llm / load_vlm follow the same rules as _tools/bench_store.py, which
# every Python tool uses; change the two together. _plugins/visibility.rb
# reads the data through them too.

require "json"

module OzBenchStore
  def self.read(path) = JSON.parse(File.read(path, encoding: "utf-8"))

  def self.dir(site, name) = File.join(site.source, "assets", "data", name)

  def self.runs(base, index)
    index["devices"].flat_map { |d| d["runs"].map { |r| read(File.join(base, r["path"])) } }
  end

  def self.load_llm(base)
    return nil unless File.exist?(File.join(base, "index.json"))
    index = read(File.join(base, "index.json"))
    devices = index["devices"].map { |d| read(File.join(base, d["path"])) }
    gb = devices.to_h { |d| [d["base"], d["memory_gb"]] }.sort.to_h
    unified = devices.select { |d| d["unified"] }.map { |d| d["base"] }.uniq.sort
    memory = {}
    index["memory"].each do |k, v|
      memory[k] = v
      memory.merge!("memory_gb" => gb, "unified_memory" => unified) if k == "note"
    end
    { "attribution" => index["attribution"], "config" => index["config"], "memory" => memory,
      "benchmarks" => runs(base, index) }
  end

  def self.load_vlm(base)
    return nil unless File.exist?(File.join(base, "index.json"))
    index = read(File.join(base, "index.json"))
    devices = index["devices"].to_h do |d|
      info = read(File.join(base, d["path"]))
      [d["name"], { "name" => info["product"], "memory_gb" => info["memory_gb"], "unified" => info["unified"] }]
    end
    out = index.slice("source", "config", "workload")
    out.merge("devices" => devices, "models" => index["models"], "benchmarks" => runs(base, index))
  end

  COMBINED = { "benchmarks.json" => ["llm-benchmarks", :load_llm],
               "vlm-benchmarks.json" => ["vlm-benchmarks", :load_vlm] }.freeze
end

Jekyll::Hooks.register :site, :post_write do |site|
  active = site.config["active_lang"] || site.config["default_lang"]
  next unless active == site.config["default_lang"]
  OzBenchStore::COMBINED.each do |file, (folder, loader)|
    data = OzBenchStore.public_send(loader, OzBenchStore.dir(site, folder)) or next
    out = File.join(site.dest, "assets", "data", file)
    FileUtils.mkdir_p(File.dirname(out))
    File.write(out, JSON.pretty_generate(data) + "\n")
  end
end
