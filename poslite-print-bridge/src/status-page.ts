/** The bridge's own page on this PC (P1-5): the pairing code, the printers, a test print, and why the last jobs failed. */
export interface StatusInput {
  version: string;
  pairing: { code: string; expiresAt: number };
  printers: string[];
  errors: { at: string; printer: string; error: string }[];
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function statusPage(input: StatusInput): string {
  const printers = input.printers.length > 0 ? input.printers : [];
  const rows = input.errors.map((e) => `<tr><td>${escape(e.at)}</td><td>${escape(e.printer)}</td><td>${escape(e.error)}</td></tr>`).join("");
  const options = printers.map((p) => `<option>${escape(p)}</option>`).join("");
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>POSLite Print Bridge</title>
<style>body{font-family:system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem;color:#0f172a}
.code{font-size:3rem;font-weight:700;letter-spacing:.3em;text-align:center;background:#eef2ff;border-radius:1rem;padding:1rem}
table{width:100%;border-collapse:collapse;font-size:.9rem}td,th{border-bottom:1px solid #e2e8f0;padding:.3rem;text-align:left}
input,select,button{font-size:1rem;padding:.4rem}</style></head><body>
<h1>POSLite Print Bridge ${escape(input.version)}</h1>
<h2>Kode pairing</h2>
<p>Di POS: Printer → Print Bridge → masukkan kode ini. Kode berganti tiap 5 menit dan hanya untuk satu perangkat.</p>
<p class="code">${escape(input.pairing.code)}</p>
<h2>Printer</h2>
<p>${printers.length > 0 ? printers.map(escape).join(", ") : "Semua alamat IPv4 lokal (atur BRIDGE_PRINTERS untuk membatasi)."}</p>
<form id="test"><label>Test print ke <input name="printer" list="printers" placeholder="192.168.1.50:9100" required></label>
<datalist id="printers">${options}</datalist> <button>Cetak test</button> <span id="result"></span></form>
<h2>Error terakhir</h2>
${rows ? `<table><tr><th>Waktu</th><th>Printer</th><th>Error</th></tr>${rows}</table>` : "<p>Tidak ada.</p>"}
<script>document.getElementById("test").addEventListener("submit",async(e)=>{e.preventDefault();
const r=await fetch("/test-print",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({printer:e.target.printer.value})});
document.getElementById("result").textContent=r.ok?"Terkirim":"Gagal: "+(await r.json()).error});</script>
</body></html>`;
}
