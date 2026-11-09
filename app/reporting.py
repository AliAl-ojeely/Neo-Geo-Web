"""Standalone local compatibility dashboard; no CDN or binary ROM data."""

import json
from . import compatibility as c


# Embed saved compatibility summaries in a local HTML dashboard and return the written report path.
def dashboard():
    matrix = c.load(
        c.REPORTS / "game_boot_matrix_v014.json", {"games": [], "summary": {}}
    )
    audit = c.load(c.REPORTS / "rom_library_manifest_v014.json", {})
    stability = c.load(c.REPORTS / "stability_v014.json", {})
    data = {
        "matrix": matrix,
        "audit": audit.get("summary", {}),
        "stability": stability.get("summary", {}),
    }
    payload = json.dumps(data, ensure_ascii=False).replace("<", "\\u003c")
    html = """<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>Neo-Geo Compatibility v0.1.4</title><style>body{font:16px system-ui;background:#101827;color:#eef3fa;margin:28px}input,select,button{font:inherit;padding:9px;margin:6px;background:#25334a;color:white;border:1px solid #718199}table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:9px;text-align:right;border-bottom:1px solid #3a4961}a{color:#9bc9ff}.stats{display:flex;flex-wrap:wrap;gap:12px}.stat{background:#22314a;padding:16px;min-width:160px}.PASS{color:#8fe5b0}.BLOCKED{color:#ffd88a}.FAIL{color:#ffaaaa}small{display:block;color:#afbed4}</style><h1>توافق مكتبة Neo Geo</h1><p>نتائج فعلية محفوظة لكل لعبة. نجاح الإقلاع منفصل عن توافق اللعب والاستقرار والتحكم. لا يعني عداد الإطارات وحده نجاح اللعبة.</p><div class="stats" id="stats"></div><p id="timestamp"></p><input id="query" placeholder="اسم اللعبة أو Driver"><select id="status"><option value="">كل النتائج</option><option>PASS</option><option>FAIL</option><option>BLOCKED</option><option>NOT VERIFIED</option></select><select id="category"><option value="">كل الفئات</option></select><button onclick="location.reload()">تحديث التقرير</button><table><thead><tr><th>اللعبة / Driver</th><th>الفئة</th><th>الإقلاع</th><th>توافق اللعب</th><th>الصوت الرقمي</th><th>دورات التشغيل/ث</th><th>العائق / الدليل</th></tr></thead><tbody id="rows"></tbody></table><script>const data=PAYLOAD;
const rows=document.getElementById('rows'),query=document.getElementById('query'),statusFilter=document.getElementById('status'),category=document.getElementById('category'),stats=document.getElementById('stats'),timestamp=document.getElementById('timestamp');const m=data.matrix,s={...m.summary,bios_problems:m.games.filter(g=>g.failure_class==='BIOS_MISSING').length,rom_problems:m.games.filter(g=>['ROM_MISSING','CRC_MISMATCH','PARENT_ROM_MISSING','SIZE_MISMATCH'].includes(g.failure_class)).length,driver_problems:m.games.filter(g=>g.failure_class==='GAME_DRIVER_NOT_FOUND').length,runtime_problems:m.games.filter(g=>g.boot_status==='FAIL').length};const labels={total_games:'الألعاب',boot_tested:'تم اختبارها',boot_passed:'إقلاع ناجح',boot_failed:'فشل',boot_blocked:'محجوبة بمتطلب',not_tested:'غير مختبرة',coverage_percent:'تغطية الاختبار %',success_among_tested_percent:'نجاح بين المختبر %',game_compatibility_pass:'توافق لعب مثبت',bios_problems:'عوائق BIOS',rom_problems:'عوائق ROM',driver_problems:'Driver غير مدعوم',runtime_problems:'أخطاء تشغيل'};for(const [k,l]of Object.entries(labels)){const box=document.createElement('div');box.className='stat';box.textContent=l+': '+(typeof s[k]==='number'?Math.round(s[k]*100)/100:s[k]??'NOT VERIFIED');stats.append(box)}timestamp.textContent='آخر تحديث: '+m.updated_at+' | أرشيفات مدققة: '+(data.audit.integrity_pass??0)+' | اختبارات استقرار ناجحة: '+(data.stability.pass??0);for(const c of new Set(m.games.map(g=>g.category))){const o=document.createElement('option');o.value=o.textContent=c;category.append(o)}function render(){rows.textContent='';const q=query.value.toLowerCase();for(const g of m.games){if(statusFilter.value&&g.boot_status!==statusFilter.value||category.value&&g.category!==category.value||q&&!JSON.stringify([g.filename,g.title,g.driver]).toLowerCase().includes(q))continue;const tr=document.createElement('tr');const values=[g.title+' / '+g.filename+' / '+g.driver,g.category,g.boot_status,g.game_compatibility,g.digital_audio??'NOT VERIFIED',g.boot_status==='PASS'?(g.performance?.emulated_fps?.toFixed(1)??'NOT VERIFIED'):'NOT VERIFIED',g.failure_class??''];values.forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.append(td)});tr.children[2].className=g.boot_status;if(g.evidence){const a=document.createElement('a');a.textContent=' صورة اللعبة';a.href='/diagnostics/evidence/'+g.evidence.split('/').pop()+'/frame-after.png';a.target='_blank';tr.lastChild.append(a)}rows.append(tr)}}query.oninput=statusFilter.onchange=category.onchange=render;render();</script></html>""".replace(
        "PAYLOAD", payload
    )
    path = c.REPORTS / "compatibility_dashboard_v014.html"
    path.write_text(html, encoding="utf-8")
    return path
