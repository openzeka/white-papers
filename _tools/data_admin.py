#!/usr/bin/env python3
"""
Yayınlanmış CV benchmark verisini görmek ve silmek için yerel araç.

    python3 _tools/data_admin.py            → http://127.0.0.1:4001
    docker compose up                       → Jekyll'in yanında kendiliğinden kalkar

Neden bir sunucu: site statik, statik bir sayfa kendi dosyasını silemez. Bu
yüzden silme işini küçük bir yerel servis yapıyor.

Neden `_tools/` altında: Jekyll alt çizgiyle başlayan yolları derlemeye almaz,
yani bu sayfa canlı siteye **hiçbir zaman** çıkmaz. Sunucu da yalnızca
127.0.0.1'e bağlanır (compose'da port eşlemesi de öyle yapılır).

Sildikten sonra `index.json` yeniden üretilir — tarayıcı klasör listeleyemediği
için ağaçta ne olduğunu söyleyen tek dosya odur; güncellenmezse sayfa var
olmayan bir dosyayı istemeye devam eder.

Uyarı olarak gösterilir, koda gömülü değildir: bir ölçümün kaynağı hâlâ
benchmark aracının `data/results/<koşu>/` klasöründeyse, bir sonraki aktarımda
buraya geri yazılır. Kalıcı silmek için o koşuyu da kaldırmak gerekir.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List, Optional

# Bir slug hem dosya adı hem URL parçası; yolun dışına çıkmaya çalışan her şey
# reddedilir.
SAFE = re.compile(r"^[A-Za-z0-9._-]{1,80}$")

DATA_DIR = Path("assets/data/cv-benchmarks")


class AdminError(Exception):
    """Mesajı arayüzde gösterilmeye uygun."""


# ---------------------------------------------------------------------------
# Ağaç
# ---------------------------------------------------------------------------


def read_json(path: Path) -> Optional[Dict[str, Any]]:
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


def write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")


def resolve(data_dir: Path, *parts: str) -> Path:
    """Doğrulanmış slug'lardan veri klasörünün içinde kalan bir yol üretir."""
    for part in parts:
        if not SAFE.match(part or ""):
            raise AdminError(f"Geçersiz ad: {part!r}")
    path = data_dir.joinpath(*parts)
    try:
        path.resolve().relative_to(data_dir.resolve())
    except ValueError:
        raise AdminError("Veri klasörünün dışına çıkan yol reddedildi")
    return path


def tree(data_dir: Path) -> Dict[str, Any]:
    """Ağaçta ne varsa - arayüzün listelediği envanter."""
    devices = []
    for device_dir in sorted(p for p in data_dir.iterdir() if p.is_dir()):
        device = read_json(device_dir / "device.json")
        if device is None:
            continue
        models = []
        for model_file in sorted(device_dir.glob("*.json")):
            if model_file.name == "device.json":
                continue
            model = read_json(model_file)
            if model is None:
                continue
            points = model.get("points") or {}
            models.append({
                "file": model_file.name,
                "name": model.get("name") or model_file.stem,
                "precision": model.get("precision", ""),
                "input_resolution": model.get("input_resolution", ""),
                "deepstream": model.get("deepstream", ""),
                "runs": model.get("runs") or [],
                "cameras": sorted((int(c) for c in points), key=int),
                "bytes": model_file.stat().st_size,
            })
        devices.append({
            "slug": device_dir.name,
            "name": device.get("name") or device_dir.name,
            "kind": device.get("kind", ""),
            "gpu": device.get("gpu", ""),
            "jetpack": device.get("jetpack", ""),
            "models": models,
        })
    return {"data_dir": str(data_dir), "devices": devices}


def reindex(data_dir: Path) -> Dict[str, Any]:
    """`devices` listesini ağacı tarayarak yeniden yazar.

    Üstteki alanlar (config, source_profiles, attribution) korunur: onları
    benchmark aracının exporter'ı üretir, burası yalnızca neyin var olduğunu
    günceller. Biçim değişirse iki yerde de güncellenmeli -
    benchmark/export_explorer.py içindeki build_index() ile aynı şekli üretir.
    """
    index_file = data_dir / "index.json"
    index = read_json(index_file) or {}
    devices = []
    for device in tree(data_dir)["devices"]:
        models = [{
            "name": m["name"],
            "precision": m["precision"],
            "input_resolution": m["input_resolution"],
            "path": f"{device['slug']}/{m['file']}",
            "cameras": m["cameras"],
        } for m in device["models"] if m["cameras"]]
        if models:
            devices.append({
                "name": device["name"],
                "slug": device["slug"],
                "kind": device["kind"],
                "path": f"{device['slug']}/device.json",
                "models": models,
            })
    index["devices"] = devices
    write_json(index_file, index)
    return index


# ---------------------------------------------------------------------------
# Silme
# ---------------------------------------------------------------------------


def delete(data_dir: Path, kind: str, device: str, file: str = "",
           cameras: str = "") -> str:
    if kind == "device":
        target = resolve(data_dir, device)
        if not target.is_dir():
            raise AdminError(f"{device} bulunamadı")
        shutil.rmtree(target)
        return f"{device} cihazı ve altındaki bütün model dosyaları silindi"

    if kind == "model":
        target = resolve(data_dir, device, file)
        if not target.is_file():
            raise AdminError(f"{device}/{file} bulunamadı")
        target.unlink()
        return f"{device}/{file} silindi"

    if kind == "point":
        target = resolve(data_dir, device, file)
        model = read_json(target)
        if model is None:
            raise AdminError(f"{device}/{file} okunamadı")
        points = model.get("points") or {}
        if str(cameras) not in points:
            raise AdminError(f"{cameras} kameralı ölçüm bu dosyada yok")
        del points[str(cameras)]
        # Son ölçüm de gidince dosyanın kalması anlamsız; boş bir model dosyası
        # index'e girmez ama ağaçta kafa karıştırır.
        if not points:
            target.unlink()
            return f"{cameras} kameralı ölçüm silindi — dosyada başka ölçüm kalmadığı için {file} de kaldırıldı"
        write_json(target, model)
        return f"{device}/{file}: {cameras} kameralı ölçüm silindi"

    raise AdminError(f"Bilinmeyen silme türü: {kind}")


# ---------------------------------------------------------------------------
# Sunucu
# ---------------------------------------------------------------------------


class Handler(BaseHTTPRequestHandler):
    data_dir = DATA_DIR

    def _send(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status: int, payload: Dict[str, Any]) -> None:
        self._send(status, json.dumps(payload, ensure_ascii=False).encode(),
                   "application/json; charset=utf-8")

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler'ın adı
        if self.path.split("?")[0] == "/":
            self._send(200, PAGE.encode(), "text/html; charset=utf-8")
        elif self.path.split("?")[0] == "/api/tree":
            try:
                self._json(200, {"ok": True, **tree(self.data_dir)})
            except OSError as exc:
                self._json(500, {"ok": False, "error": str(exc)})
        else:
            self._json(404, {"ok": False, "error": "yok"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path.split("?")[0] != "/api/delete":
            self._json(404, {"ok": False, "error": "yok"})
            return
        length = int(self.headers.get("Content-Length") or 0)
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            self._json(400, {"ok": False, "error": "geçersiz istek"})
            return
        try:
            message = delete(self.data_dir, body.get("kind", ""), body.get("device", ""),
                             body.get("file", ""), str(body.get("cameras", "")))
            reindex(self.data_dir)
        except AdminError as exc:
            self._json(400, {"ok": False, "error": str(exc)})
            return
        except OSError as exc:
            self._json(500, {"ok": False, "error": str(exc)})
            return
        self._json(200, {"ok": True, "message": message, **tree(self.data_dir)})

    def log_message(self, fmt: str, *args: Any) -> None:
        # Varsayılan günlük her istek için bir satır basıyor; compose çıktısını
        # Jekyll ile paylaştığı için yalnızca silmeleri yazıyoruz.
        if self.command == "POST":
            super().log_message(fmt, *args)


PAGE = """<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CV benchmark verisi — yerel yönetim</title>
<style>
  :root { --fg:#1b1f23; --muted:#5b6670; --line:#e3e6ea; --green:#76b900; --red:#c0392b; --bg:#fff; }
  *{box-sizing:border-box}
  body{margin:0;padding:0 0 60px;background:#f6f7f8;color:var(--fg);
       font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;line-height:1.55}
  header{background:var(--bg);border-bottom:1px solid var(--line);padding:18px 28px}
  h1{margin:0;font-size:19px}
  .sub{margin:4px 0 0;font-size:13px;color:var(--muted)}
  main{max-width:1060px;margin:22px auto;padding:0 20px}
  .note{background:#fffbe6;border:1px solid #f0e0a0;border-radius:8px;padding:11px 14px;
        font-size:13px;color:#7a5c00;margin-bottom:18px}
  .device{background:var(--bg);border:1px solid var(--line);border-radius:10px;margin-bottom:16px;overflow:hidden}
  .device-head{display:flex;align-items:center;justify-content:space-between;gap:12px;
               padding:13px 16px;border-bottom:1px solid var(--line);background:#fafbfc}
  .device-head h2{margin:0;font-size:15px}
  .device-head .meta{font-size:12px;color:var(--muted);font-weight:400;margin-left:8px}
  .model{padding:13px 16px;border-bottom:1px solid var(--line)}
  .model:last-child{border-bottom:0}
  .model-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap}
  .model-name{font-weight:650}
  .model-meta{font-size:12px;color:var(--muted)}
  .cams{display:flex;flex-wrap:wrap;gap:5px;margin-top:9px}
  .cam{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--line);border-radius:14px;
       padding:2px 6px 2px 9px;font-size:12px;background:#fff}
  .cam button{border:0;background:none;color:var(--muted);cursor:pointer;font-size:13px;line-height:1;padding:0 2px}
  .cam button:hover{color:var(--red)}
  .runs{margin-top:8px;font-size:11.5px;color:var(--muted);font-family:ui-monospace,Menlo,Consolas,monospace}
  button.del{border:1px solid var(--line);background:#fff;border-radius:6px;padding:4px 10px;
             font-size:12.5px;color:var(--red);cursor:pointer}
  button.del:hover{background:#fdf0ee;border-color:#f0c4bd}
  .empty{padding:28px;text-align:center;color:var(--muted)}
  #msg{position:fixed;left:50%;transform:translateX(-50%);bottom:22px;background:#1b1f23;color:#fff;
       padding:10px 16px;border-radius:8px;font-size:13px;opacity:0;transition:opacity .2s;pointer-events:none;max-width:70ch}
  #msg.show{opacity:1}
  #msg.err{background:var(--red)}
</style>
</head>
<body>
<header>
  <h1>CV benchmark verisi — yerel yönetim</h1>
  <p class="sub">Yayınlanmış ölçüm deposunu gösterir ve siler. Bu sayfa siteye dahil değildir
  (<code>_tools/</code> altında, Jekyll derlemeye almaz) ve yalnızca bu makineden erişilebilir.</p>
</header>
<main>
  <div class="note">Silmek dosyayı kaldırır ve <code>index.json</code>'u tazeler. Ölçümün kaynağı
  hâlâ benchmark aracının <code>data/results/&lt;koşu&gt;/</code> klasöründeyse, bir sonraki
  <b>Explorer'a aktar</b> işleminde geri gelir — kalıcı silmek için o koşuyu da kaldırın
  (her modelin altında hangi koşulardan geldiği yazıyor).</div>
  <div id="tree"><div class="empty">Yükleniyor…</div></div>
</main>
<div id="msg"></div>
<script>
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let tree = null;

function toast(text, err) {
  const el = document.getElementById("msg");
  el.textContent = text;
  el.className = "show" + (err ? " err" : "");
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = ""; }, 5000);
}

async function load() {
  const res = await fetch("/api/tree");
  render(await res.json());
}

function render(data) {
  tree = data;
  const host = document.getElementById("tree");
  if (!data.devices || !data.devices.length) {
    host.innerHTML = '<div class="empty">Depo boş.</div>';
    return;
  }
  host.innerHTML = data.devices.map(d => `
    <section class="device">
      <div class="device-head">
        <h2>${esc(d.name)}<span class="meta">${esc(d.kind)}${d.gpu ? " · " + esc(d.gpu) : ""}${d.jetpack ? " · JetPack " + esc(d.jetpack) : ""} · ${esc(d.slug)}/</span></h2>
        <button class="del" data-kind="device" data-device="${esc(d.slug)}">Cihazı sil</button>
      </div>
      ${d.models.map(m => `
        <div class="model">
          <div class="model-head">
            <div>
              <span class="model-name">${esc(m.name)}</span>
              <span class="model-meta">${[m.precision, m.input_resolution, m.deepstream && "DS " + m.deepstream].filter(Boolean).map(esc).join(" · ")}
                · ${m.cameras.length} ölçüm · ${esc(m.file)}</span>
            </div>
            <button class="del" data-kind="model" data-device="${esc(d.slug)}" data-file="${esc(m.file)}">Modeli sil</button>
          </div>
          <div class="cams">${m.cameras.map(c => `
            <span class="cam">${c} kamera
              <button title="${c} kameralı ölçümü sil" data-kind="point" data-device="${esc(d.slug)}" data-file="${esc(m.file)}" data-cameras="${c}">×</button>
            </span>`).join("")}</div>
          ${m.runs.length ? `<div class="runs">koşular: ${m.runs.map(esc).join(", ")}</div>` : ""}
        </div>`).join("")}
    </section>`).join("");
}

document.addEventListener("click", async e => {
  const btn = e.target.closest("[data-kind]");
  if (!btn) return;
  const { kind, device, file, cameras } = btn.dataset;
  const what = kind === "device" ? `"${device}" cihazının tamamı (altındaki bütün modeller)`
             : kind === "model"  ? `"${device}/${file}" model dosyası`
             : `${device}/${file} içindeki ${cameras} kameralı ölçüm`;
  if (!confirm(`Silinecek: ${what}\\n\\nDevam edilsin mi?`)) return;
  const res = await fetch("/api/delete", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, device, file, cameras }),
  });
  const data = await res.json();
  if (!data.ok) { toast(data.error, true); return; }
  toast(data.message + " · index.json tazelendi");
  render(data);
});

load();
</script>
</body>
</html>
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data", type=Path, default=DATA_DIR)
    parser.add_argument("--port", type=int, default=4001)
    parser.add_argument("--host", default="127.0.0.1",
                        help="container içinde 0.0.0.0 gerekir; port eşlemesi 127.0.0.1'e bağlanır")
    args = parser.parse_args()

    data_dir = args.data.resolve()
    if not data_dir.is_dir():
        raise SystemExit(f"Veri klasörü bulunamadı: {data_dir}")

    Handler.data_dir = data_dir
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"CV benchmark veri yönetimi → http://127.0.0.1:{args.port}  ({data_dir})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
