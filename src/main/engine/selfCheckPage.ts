/**
 * Trang tự kiểm mở làm tab đầu khi start profile (giống trang khởi động AdsPower).
 * Hiển thị thông tin profile + fingerprint mà Isola áp, đọc giá trị trình duyệt THẬT bằng JS
 * và đối chiếu, cùng kiểm IP egress sống. Dữ liệu người dùng được escape để tránh chèn mã.
 */
export interface SelfCheckData {
  name: string
  group: string | null
  serial: number
  id: string
  platform: string | null
  username: string | null
  lab: boolean
  notes: string | null
  proxy: { type: string; host: string; ip: string | null; country: string | null } | null
  kernelMajor: number
  kernelVersion: string
  os: string
  userAgent: string
  timezone: string
  language: string
  screen: { width: number; height: number }
  extensions: { name: string; version: string }[]
  startedAt: string
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** JSON an toàn để nhúng vào <script> (chặn thoát thẻ). */
function safeJson(v: unknown): string {
  return JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
}

const MARK = `<svg viewBox="0 0 100 100" width="30" height="30" aria-hidden="true"><circle cx="50" cy="50" r="46" fill="none" stroke="#3f8a9c" stroke-width="5"/><circle cx="50" cy="50" r="38" fill="#1e2f5f"/><path fill="#fff" d="M24 62 L39 43 L43.5 47.5 L57 27 L64 37.5 L61 39.5 L67.5 41.5 L76 62 Z"/><path fill="none" stroke="#1e2f5f" stroke-width="2.2" stroke-linecap="round" d="M51 37 L41 54"/><path fill="#fff" d="M26 69.5 Q41 61.5 57 67 Q66 70 72 67 Q63 77 46 72.5 Q36 70 29 74 Z"/></svg>`

export function renderSelfCheckPage(d: SelfCheckData): string {
  const data = {
    proxyIp: d.proxy?.ip ?? null,
    proxyCountry: d.proxy?.country ?? null,
    expUserAgent: d.userAgent,
    expTimezone: d.timezone,
    expLanguage: d.language
  }
  const proxyLine = d.proxy
    ? `${esc(d.proxy.type.toUpperCase())} · ${esc(d.proxy.host)}`
    : d.lab
      ? '<span data-i="noProxyLab"></span>'
      : '<span data-i="noProxy"></span>'
  const val = (s: string | null) => (s && s.trim() ? esc(s) : '—')

  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Isola · Self-check</title>
<style>
  :root{--bg:#141518;--panel:#1b1d22;--panel2:#22252c;--border:#2b2f37;--text:#e8eaed;--muted:#9aa0a8;--navy:#1e2f5f;--teal:#3f8a9c;--ok:#3fb950;--warn:#d29922}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--text);font-family:Segoe UI,system-ui,Arial,sans-serif;font-size:14px}
  .banner{background:linear-gradient(135deg,#1e2f5f,#2a4a8c);padding:26px 16px;text-align:center;position:relative}
  .banner .ip{font-size:26px;font-weight:800;letter-spacing:.3px;display:flex;gap:10px;align-items:center;justify-content:center}
  .banner .loc{color:#c7d2e8;margin-top:4px;font-size:13px}
  .brand{position:absolute;left:16px;top:16px;display:flex;align-items:center;gap:8px;font-weight:800;letter-spacing:1px}
  .lang{position:absolute;right:16px;top:18px;display:flex;gap:4px}
  .lang button{background:rgba(255,255,255,.12);color:#fff;border:0;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:12px}
  .lang button.on{background:#fff;color:var(--navy);font-weight:700}
  .wrap{max-width:860px;margin:22px auto;padding:0 16px}
  .card{background:var(--panel);border:1px solid var(--border);border-radius:12px;margin-bottom:18px;overflow:hidden}
  .card h2{margin:0;padding:14px 18px;font-size:14px;border-left:3px solid var(--teal);background:var(--panel2)}
  .row{display:grid;grid-template-columns:200px 1fr;gap:12px;padding:11px 18px;border-top:1px solid var(--border);align-items:center}
  .row .k{color:var(--muted)}
  .row .v{word-break:break-word;font-variant-ligatures:none}
  .mono{font-family:ui-monospace,Consolas,monospace;font-size:13px}
  .note{white-space:pre-wrap;max-height:160px;overflow:auto;font-size:13px;line-height:1.5}
  .muted{color:var(--muted)}
  .badge{display:inline-block;margin-left:8px;font-size:11px;padding:1px 7px;border-radius:20px;vertical-align:middle}
  .badge.ok{background:rgba(63,185,80,.15);color:var(--ok)}
  .badge.warn{background:rgba(210,153,34,.15);color:var(--warn)}
  .badge.wait{background:rgba(154,160,168,.15);color:var(--muted)}
  @media(max-width:560px){.row{grid-template-columns:1fr;gap:3px}}
</style></head>
<body>
  <div class="banner">
    <div class="brand">${MARK}<span>ISOLA</span></div>
    <div class="lang"><button data-l="vi" class="on">VI</button><button data-l="en">EN</button></div>
    <div class="ip"><span id="liveIp">…</span></div>
    <div class="loc" id="liveLoc"></div>
  </div>
  <div class="wrap">
    <div class="card">
      <h2 data-i="secAccount"></h2>
      <div class="row"><div class="k" data-i="name"></div><div class="v">${val(d.name)}</div></div>
      <div class="row"><div class="k" data-i="group"></div><div class="v">${val(d.group)}</div></div>
      <div class="row"><div class="k" data-i="profileId"></div><div class="v mono">${d.serial}/${esc(d.id)}</div></div>
      <div class="row"><div class="k" data-i="platform"></div><div class="v">${val(d.platform)}</div></div>
      <div class="row"><div class="k" data-i="username"></div><div class="v">${val(d.username)}</div></div>
      <div class="row"><div class="k" data-i="proxy"></div><div class="v">${proxyLine}</div></div>
      <div class="row"><div class="k" data-i="notes"></div><div class="v note">${val(d.notes)}</div></div>
      <div class="row"><div class="k" data-i="startedAt"></div><div class="v mono">${esc(d.startedAt)}</div></div>
    </div>
    <div class="card">
      <h2 data-i="secFp"></h2>
      <div class="row"><div class="k" data-i="kernel"></div><div class="v mono">${d.kernelMajor} · ${esc(d.kernelVersion)}</div></div>
      <div class="row"><div class="k">OS</div><div class="v">${esc(d.os)}</div></div>
      <div class="row"><div class="k">User-Agent</div><div class="v mono" id="ua"></div></div>
      <div class="row"><div class="k" data-i="language"></div><div class="v mono" id="lang"></div></div>
      <div class="row"><div class="k">Timezone</div><div class="v mono" id="tz"></div></div>
      <div class="row"><div class="k" data-i="resolution"></div><div class="v mono" id="res"></div></div>
      <div class="row"><div class="k" data-i="egressIp"></div><div class="v mono" id="egress">…</div></div>
    </div>
    <div class="card">
      <h2 data-i="secExt"></h2>
      ${
        d.extensions.length
          ? d.extensions
              .map(
                (e) =>
                  `<div class="row"><div class="k">${esc(e.name)}</div><div class="v mono">${esc(e.version)}</div></div>`
              )
              .join('')
          : `<div class="row"><div class="v muted" data-i="noExt"></div></div>`
      }
    </div>
  </div>
<script>
const DATA = ${safeJson(data)};
const T = {
  secAccount:['Thông tin profile','Account information'],
  name:['Tên','Name'], group:['Nhóm','Group'], profileId:['No./ID','No./ID'],
  platform:['Platform','Platform'], username:['Tên đăng nhập','User name'], proxy:['Proxy','Proxy'],
  notes:['Ghi chú','Notes'],
  startedAt:['Thời điểm mở','Startup time'], secFp:['Fingerprint','Fingerprint information'],
  kernel:['Kernel','Kernel version'], language:['Ngôn ngữ','Language'], resolution:['Độ phân giải','Resolution'],
  egressIp:['IP egress (trình duyệt)','Egress IP (browser)'],
  secExt:['Extension','Extensions'], noExt:['Không có extension nào','No extensions'],
  noProxy:['Không proxy','No proxy'], noProxyLab:['Không proxy (lab)','No proxy (lab)'],
  match:['khớp','match'], diff:['khác Isola áp','differs from Isola'], checking:['đang kiểm…','checking…'],
  failed:['không lấy được','unavailable']
};
let lang = 'vi';
function tr(k){ return (T[k]||['',''])[lang==='vi'?0:1]; }
function badge(cls,key){ return ' <span class="badge '+cls+'">'+tr(key)+'</span>'; }
// giá trị trình duyệt thật
const liveUA = navigator.userAgent;
const liveTz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
const liveLang = navigator.language || '';
const liveRes = screen.width + 'x' + screen.height;
function cmp(live, exp){ return live===exp ? badge('ok','match') : badge('warn','diff'); }
function paint(){
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i]').forEach(function(el){ el.textContent = tr(el.getAttribute('data-i')); });
  document.querySelectorAll('[data-l]').forEach(function(b){ b.classList.toggle('on', b.getAttribute('data-l')===lang); });
  document.getElementById('ua').innerHTML = liveUA + cmp(liveUA, DATA.expUserAgent);
  document.getElementById('lang').innerHTML = liveLang + cmp(liveLang.toLowerCase(), (DATA.expLanguage||'').toLowerCase());
  document.getElementById('tz').innerHTML = liveTz + cmp(liveTz, DATA.expTimezone);
  document.getElementById('res').textContent = liveRes;
  document.getElementById('liveLoc').textContent = DATA.proxyCountry ? DATA.proxyCountry : '';
}
document.querySelectorAll('[data-l]').forEach(function(b){ b.onclick=function(){ lang=b.getAttribute('data-l'); paint(); }; });
paint();
// kiểm IP egress sống qua trình duyệt (đi qua proxy của profile)
(async function(){
  try{
    const ctl = new AbortController(); setTimeout(function(){ctl.abort();}, 12000);
    const r = await fetch('https://api.ipify.org?format=json', {signal:ctl.signal, cache:'no-store'});
    const j = await r.json();
    const ip = j.ip || '';
    document.getElementById('liveIp').textContent = ip;
    const same = DATA.proxyIp ? (ip===DATA.proxyIp) : null;
    document.getElementById('egress').innerHTML = ip + (same===null ? '' : (same?badge('ok','match'):badge('warn','diff')));
  }catch(e){
    document.getElementById('liveIp').textContent = '—';
    document.getElementById('egress').innerHTML = badge('warn','failed');
  }
})();
</script>
</body></html>`
}
