#!/usr/bin/env python3
"""Keep each model's Hugging Face data in the repo, and derive the table's
KV-cache and weight fields from it.

    python3 _tools/kv_geometry.py fetch-model "<model>" <publisher/repo>   # new model
    python3 _tools/kv_geometry.py fetch-checkpoint <served/repo>           # new served checkpoint
    python3 _tools/kv_geometry.py record-run <row-id> <result-folder>      # keep the run's models.json
    python3 _tools/kv_geometry.py show "<model>"                           # what the config gives
    python3 _tools/kv_geometry.py apply                                    # write benchmarks.json
    python3 _tools/kv_geometry.py verify [--online]                        # check the stored data

Everything is stored under _tools/model_meta/ (see its README.md):

    models/<model>/config.json       the model's config.json, byte-identical to Hugging Face
    models/<model>/model.json        repo, pinned revision, sha256 of config.json, HF model info
    checkpoints/<org>--<name>.json   a served checkpoint: pinned revision, files and sizes, quantization
    runs/<row-id>/models.json        the benchmark tool's record of what the run served

Nothing in the kv_* fields or weights_gb is typed by hand. `apply` derives them
from these files and _tools/validate.py recomputes every value and fails on a
mismatch; `verify` checks the files themselves (sha256, completeness) and, with
--online, that Hugging Face still serves the same bytes at the pinned revision.

Set HF_TOKEN in the environment for gated repositories.

The fields, per model (identical on every row of that model):
  kv_bytes_per_token             grows with context; divided over min(tp, kv_heads) GPUs
  kv_window_bytes                sliding-window layers, fixed per session; divided the same way
  kv_heads                       KV heads of the full-attention layers; null = copied to every GPU
  kv_replicated_bytes_per_token  single-head index keys, copied to every GPU
  kv_state_bytes                 recurrent / convolution state of linear-attention, Mamba and
                                 KDA layers, fixed per session; divided over tp
  model_context_length           the model's own context window
The first, second and fourth are at one byte per stored value (FP8); the page
scales them by memory.kv_cache_bytes_per_value. kv_state_bytes is in the
precision the engine keeps that state in, which does not follow the KV cache.

Per row: served_repo (the checkpoint the run loaded) and weights_gb (its size).
"""
import argparse, hashlib, json, os, re, shutil, sys, urllib.error, urllib.parse, urllib.request
from collections import OrderedDict
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "assets/data/benchmarks.json")
META = os.path.join(ROOT, "_tools/model_meta")
MODELS = os.path.join(META, "models")
CHECKPOINTS = os.path.join(META, "checkpoints")
RUNS = os.path.join(META, "runs")

# vLLM keeps two recurrent-state pages per request when prefix caching is on
# (its default): MambaSpec.max_memory_usage_bytes, mamba_cache_mode "align".
STATE_PAGES = 2
BF16 = 2
DTYPE_BYTES = {"float32": 4, "fp32": 4, "bfloat16": 2, "bf16": 2, "float16": 2, "fp16": 2}


class Unsupported(Exception):
    """The config describes a cache layout this file does not model."""


# ------------------------------------------------------------ Hugging Face I/O

def _get(url, raw=False):
    req = urllib.request.Request(url)
    if os.environ.get("HF_TOKEN"):
        req.add_header("Authorization", "Bearer " + os.environ["HF_TOKEN"])
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            body = r.read()
    except urllib.error.HTTPError as exc:
        hint = " (gated or private: set HF_TOKEN)" if exc.code in (401, 403) else ""
        raise SystemExit(f"Hugging Face refused {url}: HTTP {exc.code}{hint}")
    return body if raw else json.loads(body)


def _api(repo, revision=None, blobs=False):
    path = f"https://huggingface.co/api/models/{repo}"
    if revision:
        path += "/revision/" + urllib.parse.quote(revision, safe="")
    return _get(path + ("?blobs=true" if blobs else ""))


def _today():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _dump(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(json.dumps(obj, ensure_ascii=False, indent=2) + "\n")


def _load(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def _sha(path):
    with open(path, "rb") as fh:
        return hashlib.sha256(fh.read()).hexdigest()


# ---------------------------------------------------------------- storage

def slug(model):
    return re.sub(r"[^a-z0-9.]+", "-", model.lower()).strip("-")


def model_dir(model):
    return os.path.join(MODELS, slug(model))


def checkpoint_path(repo):
    return os.path.join(CHECKPOINTS, repo.replace("/", "--") + ".json")


def load_meta(model):
    """model.json plus the parsed config.json, or None when not fetched."""
    d = model_dir(model)
    if not os.path.exists(os.path.join(d, "model.json")):
        return None
    meta = _load(os.path.join(d, "model.json"))
    meta["config"] = _load(os.path.join(d, "config.json"))
    return meta


def load_checkpoints():
    out = {}
    if os.path.isdir(CHECKPOINTS):
        for f in sorted(os.listdir(CHECKPOINTS)):
            if f.endswith(".json"):
                ck = _load(os.path.join(CHECKPOINTS, f))
                out[ck["repo"]] = ck
    return out


def _model_info(info):
    """The HF model-info fields worth keeping: identity, dates, lineage, size."""
    card = info.get("cardData") or {}
    st = info.get("safetensors") or {}
    return OrderedDict([
        ("created", info.get("createdAt")), ("last_modified", info.get("lastModified")),
        ("gated", info.get("gated")), ("license", card.get("license")),
        ("base_model", card.get("base_model")), ("library", info.get("library_name")),
        ("pipeline_tag", info.get("pipeline_tag")),
        ("safetensors_parameters", st.get("total")), ("parameters_by_dtype", st.get("parameters")),
    ])


def fetch_model(model, repo, revision=None):
    info = _api(repo, revision)
    rev = info["sha"]
    raw = _get(f"https://huggingface.co/{repo}/resolve/{rev}/config.json", raw=True)
    json.loads(raw)                                      # must parse
    d = model_dir(model)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "config.json"), "wb") as fh:
        fh.write(raw)                                    # byte-identical, never re-serialised
    _dump(os.path.join(d, "model.json"), OrderedDict([
        ("model", model), ("repo", repo), ("revision", rev),
        ("config_sha256", hashlib.sha256(raw).hexdigest()), ("fetched", _today()),
        ("hf", _model_info(info))]))
    return rev


def fetch_checkpoint(repo, revision=None):
    """Size of the checkpoint a run loaded: its top-level .safetensors files.
    Subfolders are left out, since some repos carry a second copy of the
    weights (gpt-oss: original/)."""
    info = _api(repo, revision, blobs=True)
    rev = info["sha"]
    files = [OrderedDict(path=s["rfilename"], size=s.get("size") or 0)
             for s in info.get("siblings", [])
             if s["rfilename"].endswith(".safetensors") and "/" not in s["rfilename"]]
    if not files:
        raise SystemExit(f"{repo}: no top-level .safetensors files — cannot size it")
    quant = {}
    try:
        cfg = _get(f"https://huggingface.co/{repo}/resolve/{rev}/config.json")
        qc = cfg.get("quantization_config") or _text(cfg).get("quantization_config") or {}
        quant = OrderedDict(method=qc.get("quant_method"),
                            kv_cache=qc.get("kv_cache_quant_algo") or qc.get("kv_cache_scheme"))
    except SystemExit:
        pass
    _dump(checkpoint_path(repo), OrderedDict([
        ("repo", repo), ("revision", rev), ("fetched", _today()),
        ("safetensors_bytes", sum(f["size"] for f in files)), ("quantization", quant),
        ("hf", _model_info(info)), ("files", files)]))
    return rev, sum(f["size"] for f in files)


def cmd_fetch_model(a):
    rev = fetch_model(a.model, a.repo, a.revision)
    print(f"saved {os.path.relpath(model_dir(a.model), ROOT)}/  ({a.repo} @ {rev[:10]})")
    return _show(a.model)


def cmd_fetch_checkpoint(a):
    rev, size = fetch_checkpoint(a.repo, a.revision)
    print(f"saved {os.path.relpath(checkpoint_path(a.repo), ROOT)}  ({rev[:10]}, {size / 1e9:.2f} GB)")
    return 0


def cmd_record_run(a):
    src = os.path.join(a.folder, "models.json")
    if not os.path.exists(src):
        raise SystemExit(f"{a.folder} has no models.json — the served repo must then be confirmed by the user")
    dst = os.path.join(RUNS, a.id, "models.json")
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copyfile(src, dst)
    print(f"saved {os.path.relpath(dst, ROOT)}")
    return 0


def run_served_repo(row_id):
    """The repo a run's stored models.json says it served, or None."""
    p = os.path.join(RUNS, row_id, "models.json")
    if not os.path.exists(p):
        return None
    d = _load(p)
    return ((d.get("data") or [{}])[0]).get("id")


def verify(online=False):
    """Problems with the stored files, as a list of strings. Online also re-reads
    Hugging Face at the pinned revisions."""
    problems = []
    if not os.path.isdir(MODELS):
        return ["_tools/model_meta/models/ is missing"]
    for name in sorted(os.listdir(MODELS)):
        d = os.path.join(MODELS, name)
        if not os.path.exists(os.path.join(d, "model.json")) or not os.path.exists(os.path.join(d, "config.json")):
            problems.append(f"models/{name}: needs both model.json and config.json")
            continue
        m = _load(os.path.join(d, "model.json"))
        if slug(m["model"]) != name:
            problems.append(f"models/{name}: model.json names {m['model']!r}, whose folder would be {slug(m['model'])}")
        if _sha(os.path.join(d, "config.json")) != m.get("config_sha256"):
            problems.append(f"models/{name}/config.json does not match its recorded sha256 — edited by hand?")
        if online:
            raw = _get(f"https://huggingface.co/{m['repo']}/resolve/{m['revision']}/config.json", raw=True)
            if hashlib.sha256(raw).hexdigest() != m["config_sha256"]:
                problems.append(f"models/{name}: Hugging Face serves different config bytes at {m['revision'][:10]}")
    for repo, ck in load_checkpoints().items():
        if ck["safetensors_bytes"] != sum(f["size"] for f in ck.get("files", [])):
            problems.append(f"checkpoints/{repo}: safetensors_bytes is not the sum of its files")
        if online:
            info = _api(repo, ck["revision"], blobs=True)
            size = sum(s.get("size") or 0 for s in info.get("siblings", [])
                       if s["rfilename"].endswith(".safetensors") and "/" not in s["rfilename"])
            if size != ck["safetensors_bytes"]:
                problems.append(f"checkpoints/{repo}: Hugging Face now reports {size} bytes at {ck['revision'][:10]}")
    return problems


def cmd_verify(a):
    problems = verify(a.online)
    for p in problems:
        print("  ✗", p)
    n_models = len(os.listdir(MODELS)) if os.path.isdir(MODELS) else 0
    print(f"{n_models} models, {len(load_checkpoints())} checkpoints"
          f"{' checked against Hugging Face' if a.online else ''}: "
          f"{'OK' if not problems else str(len(problems)) + ' problem(s)'}")
    return 1 if problems else 0


# -------------------------------------------------------------- the geometry

def _text(cfg):
    return cfg.get("text_config", cfg)


def _num(x):
    return int(x) if float(x) == int(x) else round(x, 4)


def nlayers(c):
    n = c.get("num_hidden_layers") or len(c.get("layers_block_type") or c.get("layer_types") or [])
    if not n:
        raise Unsupported("the config gives no layer count")
    return n


def layer_kinds(c):
    """One of full / sliding / linear / none per decoder layer."""
    n = nlayers(c)
    if c.get("layer_types"):
        m = {"full_attention": "full", "deepseek_sparse_attention": "full", "attention": "full",
             "sliding_attention": "sliding", "linear_attention": "linear"}
        kinds = [m.get(t) for t in c["layer_types"][:n]]
        if None in kinds:
            raise Unsupported(f"layer type(s) {sorted({t for t in c['layer_types'] if t not in m})}")
        return kinds
    if c.get("layers_block_type"):                      # Nemotron-H: mamba / moe / attention
        return ["full" if t == "attention" else "linear" if t == "mamba" else "none"
                for t in c["layers_block_type"]]
    la = c.get("linear_attn_config") or {}
    if la.get("full_attn_layers"):                      # Kimi-Linear: 1-based layer numbers
        full = set(la["full_attn_layers"])
        return ["full" if i + 1 in full else "linear" for i in range(n)]
    if "local_layer_ids" in c:                          # Inkling
        return ["sliding" if i in set(c["local_layer_ids"]) else "full" for i in range(n)]
    if "hybrid_layer_pattern" in c:                     # MiMo: 1 = sliding, 0 = full
        return ["sliding" if p == 1 else "full" for p in c["hybrid_layer_pattern"][:n]]
    if c.get("attn_type_list"):                         # MiniMax: 1 = softmax, 0 = lightning
        if any(t != 1 for t in c["attn_type_list"]):
            raise Unsupported("MiniMax lightning-attention layers")
        return ["full"] * n
    if c.get("hybrid_override_pattern"):                # Nemotron-H: M mamba, * attention, - / E MLP
        m = {"M": "linear", "*": "full", "-": "none", "E": "none"}
        pat = c["hybrid_override_pattern"]
        if any(ch not in m for ch in pat):
            raise Unsupported(f"hybrid_override_pattern symbols {sorted(set(pat) - set(m))}")
        return [m[ch] for ch in pat]
    if c.get("full_attention_interval") and ("linear_num_value_heads" in c or "linear_conv_kernel_dim" in c):
        k = c["full_attention_interval"]                # Qwen3-Next style: every k-th layer is full
        return ["full" if (i + 1) % k == 0 else "linear" for i in range(n)]
    if c.get("sliding_window_pattern") and c.get("sliding_window"):
        k = c["sliding_window_pattern"]                 # older Gemma configs: every k-th layer global
        return ["full" if (i + 1) % k == 0 else "sliding" for i in range(n)]
    # No explicit layout: all full attention -- but only if nothing in the config
    # hints at another layer kind. A hint we cannot place is refused rather than
    # silently counted as full attention, which would overstate the cache.
    hints = [k for k in c if re.search(r"linear_|mamba|ssm|hybrid|layer_pattern|attn_layer|"
                                         r"attention_interval|kda|deltanet|lightning|local_attention|attention_chunk_size", k)
             and c[k] not in (None, False, 0, [], "")]
    if hints:
        raise Unsupported(f"no layer layout this tool can read, but config has {sorted(hints)}")
    ctx = c.get("max_position_embeddings") or c.get("model_max_length") or 0
    if c.get("sliding_window") and c.get("use_sliding_window") is not False \
            and c["sliding_window"] < ctx:
        raise Unsupported("a sliding_window without a per-layer layout")
    return ["full"] * n


def indexer_owners(c, n):
    """Which layers keep their own sparse-attention index keys. Models with
    shared indexers reuse an earlier layer's selection and store none."""
    if c.get("indexer_types"):
        return [t == "full" for t in c["indexer_types"][:n]]
    if c.get("index_topk_pattern"):
        return [p != "S" for p in c["index_topk_pattern"][:n]]
    freq = c.get("index_topk_freq") or 1
    off = c.get("index_skip_topk_offset", 2)
    return [max(i - off + 1, 0) % freq == 0 for i in range(n)]


def state_bytes(c, kinds):
    """Recurrent + convolution state per session at TP=1, as vLLM keeps it:
    convolution state in BF16, recurrent state in the model's declared dtype."""
    nlin = kinds.count("linear")
    if not nlin:
        return 0
    k = None
    if "linear_num_value_heads" in c:                   # Gated DeltaNet (Qwen3.5 onwards)
        kd, vd = c["linear_key_head_dim"], c["linear_value_head_dim"]
        nk, nv = c["linear_num_key_heads"], c["linear_num_value_heads"]
        conv = (kd * nk * 2 + vd * nv) * (c["linear_conv_kernel_dim"] - 1) * BF16
        rec = nv * vd * kd * DTYPE_BYTES.get(str(c.get("mamba_ssm_dtype")), BF16)
        k = conv + rec
    elif c.get("model_type") == "nemotron_h" or "mamba_num_heads" in c:   # Mamba2
        h, d, s = c["mamba_num_heads"], c["mamba_head_dim"], c["ssm_state_size"]
        conv = (h * d + 2 * c["n_groups"] * s) * (c["conv_kernel"] - 1) * BF16
        rec = h * d * s * DTYPE_BYTES.get(str(c.get("mamba_ssm_cache_dtype", "float32")), 4)
        k = conv + rec
    elif (c.get("linear_attn_config") or {}).get("kda_layers"):          # KDA
        la = c["linear_attn_config"]
        h, d = la["num_heads"], la["head_dim"]
        conv = 3 * h * d * (la["short_conv_kernel_size"] - 1) * BF16
        rec = h * d * d * 4                             # vLLM keeps KDA state in FP32
        k = conv + rec
    if k is None:
        raise Unsupported("linear-attention layers whose state is not modelled")
    return nlin * k * STATE_PAGES


def geometry(cfg):
    """The six model fields from a config.json. Raises Unsupported rather than
    guess, which leaves the model on its speed limit alone."""
    c = _text(cfg)
    n = nlayers(c)
    out = OrderedDict(kv_bytes_per_token=0, kv_window_bytes=0, kv_heads=None,
                      kv_replicated_bytes_per_token=0, kv_state_bytes=0)
    window = c.get("sliding_window") or c.get("sliding_window_size")

    if c.get("compress_ratios"):
        # DeepSeek V4 family: one shared K=V latent per token (head_dim values),
        # a sliding window on every layer, compressed latents at 1/ratio, and index
        # keys on the ratio-4 layers (V4) or on kv_source_layer_ids (V4.1). Counted
        # as stored values, from DeepSeek's reference inference code.
        hd, ih = c["head_dim"], c["index_head_dim"]
        ratios = c["compress_ratios"][:n]
        sources = c.get("kv_source_layer_ids")
        bpt = 0.0
        for i, r in enumerate(ratios):
            if sources is not None:
                if i in sources:
                    bpt += (hd + ih) / r
            elif r:
                bpt += hd / r + (ih / r if r == 4 else 0)
        out["kv_bytes_per_token"] = _num(bpt)
        out["kv_window_bytes"] = n * c["sliding_window"] * hd
        out["model_context_length"] = c.get("max_position_embeddings")
        return out

    kinds = layer_kinds(c)
    if c.get("kv_lora_rank"):
        # MLA: one compressed latent per token per layer, copied to every TP rank,
        # plus sparse-attention index keys on the layers that own an indexer.
        latent = c["kv_lora_rank"] + (c.get("qk_rope_head_dim") or 0)
        idx = c.get("index_head_dim") or 0
        if idx and c.get("index_kpool_compress"):
            idx /= c["index_kpool"]
        owners = indexer_owners(c, n) if idx else [False] * n
        bpt = sum(latent + (idx if own else 0)
                  for kind, own in zip(kinds, owners) if kind == "full")
        if "sliding" in kinds:
            raise Unsupported("MLA with sliding-window layers")
        out["kv_bytes_per_token"] = _num(bpt)
    else:
        kvh = c["num_key_value_heads"]
        hd = c.get("head_dim") or c["hidden_size"] // c["num_attention_heads"]
        full_h = c.get("num_global_key_value_heads", kvh)
        full_k = c.get("global_head_dim", hd)
        full_v = c.get("v_head_dim", full_k) if "global_head_dim" not in c else full_k
        swa_h = c.get("swa_num_key_value_heads", kvh)
        swa_k = c.get("swa_head_dim", hd)
        swa_v = c.get("swa_v_head_dim", c.get("v_head_dim", swa_k))
        nfull, nswa = kinds.count("full"), kinds.count("sliding")
        if nswa and not window:
            raise Unsupported("sliding layers without a window size")
        out["kv_bytes_per_token"] = nfull * full_h * (full_k + full_v)
        out["kv_window_bytes"] = nswa * swa_h * (swa_k + swa_v) * (window or 0)
        out["kv_heads"] = full_h
        # Single-head index keys (Qwen QSA indexer, MiniMax sparse attention): one
        # head cannot be split, so every TP rank keeps all of it.
        if c.get("indexer_head_dim"):
            out["kv_replicated_bytes_per_token"] = _num(
                nfull * c["indexer_head_dim"] * c.get("indexer_kv_heads", 1)
                / c.get("indexer_compress_ratio", 1))
        sa = c.get("sparse_attention_config") or {}
        if sa.get("use_sparse_attention"):
            out["kv_replicated_bytes_per_token"] = sum(sa["sparse_attention_freq"][:n]) \
                * sa["sparse_index_dim"]
    out["kv_state_bytes"] = state_bytes(c, kinds)
    out["model_context_length"] = c.get("max_position_embeddings") or c.get("model_max_length")
    return out


NULL_GEOMETRY = OrderedDict(kv_bytes_per_token=None, kv_window_bytes=None, kv_heads=None,
                            kv_replicated_bytes_per_token=None, kv_state_bytes=None)


def expected_model_fields(model):
    """(fields, reason). fields is None when the model has no stored metadata."""
    meta = load_meta(model)
    if meta is None:
        return None, "no _tools/model_meta/models entry"
    try:
        return geometry(meta["config"]), None
    except Unsupported as exc:
        g = OrderedDict(NULL_GEOMETRY)
        c = _text(meta["config"])
        g["model_context_length"] = c.get("max_position_embeddings") or c.get("model_max_length")
        return g, f"unsupported cache layout: {exc}"


def expected_weights_gb(entry, checkpoints):
    ck = checkpoints.get(entry.get("served_repo") or "")
    return round(ck["safetensors_bytes"] / 1e9, 2) if ck else None


def _show(model):
    g, why = expected_model_fields(model)
    if g is None:
        sys.exit(f"{model}: {why} — run fetch-model first")
    meta = load_meta(model)
    print(f"  {'config':30s} {meta['repo']} @ {meta['revision'][:10]}")
    for k, v in g.items():
        print(f"  {k:30s} {v}")
    if why:
        print(f"  NOTE {why} — the row will show its speed limit only")
    return 0


def cmd_show(a):
    return _show(a.model)


def cmd_apply(a):
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from bench_import import load_data, write_data, FIELDS
    doc = load_data()
    ck = load_checkpoints()
    cache, changed = {}, 0
    for e in doc["benchmarks"]:
        if e["model"] not in cache:
            g, why = expected_model_fields(e["model"])
            if g is None:
                sys.exit(f"{e['model']}: {why} — run: python3 _tools/kv_geometry.py "
                         f"fetch-model \"{e['model']}\" <publisher/repo>")
            cache[e["model"]] = g
        new = dict(cache[e["model"]])
        new["weights_gb"] = expected_weights_gb(e, ck)
        if e.get("served_repo") and new["weights_gb"] is None:
            sys.exit(f"{e['id']}: {e['served_repo']} is not recorded — run: "
                     f"python3 _tools/kv_geometry.py fetch-checkpoint {e['served_repo']}")
        for k, v in new.items():
            if e.get(k, "absent") != v:
                e[k] = v
                changed += 1
        for k in [k for k in FIELDS if k not in e]:
            e[k] = None
        ordered = OrderedDict((k, e[k]) for k in FIELDS)
        e.clear()
        e.update(ordered)
    write_data(doc)
    print(f"{changed} value(s) written across {len(doc['benchmarks'])} rows")
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fetch-model", help="store a model's config.json and HF info")
    f.add_argument("model"); f.add_argument("repo"); f.add_argument("--revision")
    f.set_defaults(fn=cmd_fetch_model)
    c = sub.add_parser("fetch-checkpoint", help="store a served checkpoint's files and size")
    c.add_argument("repo"); c.add_argument("--revision"); c.set_defaults(fn=cmd_fetch_checkpoint)
    r = sub.add_parser("record-run", help="keep a result folder's models.json for a row")
    r.add_argument("id"); r.add_argument("folder"); r.set_defaults(fn=cmd_record_run)
    w = sub.add_parser("show", help="print what a model's config gives")
    w.add_argument("model"); w.set_defaults(fn=cmd_show)
    p = sub.add_parser("apply", help="write the generated fields into benchmarks.json")
    p.set_defaults(fn=cmd_apply)
    v = sub.add_parser("verify", help="check the stored Hugging Face data")
    v.add_argument("--online", action="store_true", help="also re-read Hugging Face")
    v.set_defaults(fn=cmd_verify)
    a = ap.parse_args()
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
