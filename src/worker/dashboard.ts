export function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Padel Auslastungs-Monitor</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f2f5;color:#222}
header{background:#1a1a2e;color:#fff;padding:14px 24px;display:flex;align-items:center;gap:12px}
header h1{font-size:1.1rem;font-weight:600}
.badge{background:#5c6bc0;color:#fff;border-radius:4px;padding:2px 8px;font-size:.75rem}
.container{max-width:1400px;margin:0 auto;padding:20px}
.topbar{display:flex;align-items:center;gap:16px;margin-bottom:20px;flex-wrap:wrap}
select{border:1px solid #ddd;border-radius:6px;padding:8px 12px;font-size:.9rem;background:#fff}
.btn{border:none;border-radius:6px;padding:8px 14px;font-size:.85rem;cursor:pointer;background:#5c6bc0;color:#fff}
.btn:hover{background:#3f51b5}
.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
@media(max-width:800px){.kpi-grid{grid-template-columns:1fr 1fr}}
.kpi{background:#fff;border-radius:10px;padding:16px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
.kpi-label{font-size:.7rem;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
.kpi-value{font-size:1.9rem;font-weight:700;color:#1a1a2e}
.kpi-sub{font-size:.7rem;color:#bbb;margin-top:3px}
.panel{background:#fff;border-radius:10px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,.08);margin-bottom:20px}
.panel-title{font-size:.78rem;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:.5px;margin-bottom:16px}
.notice{background:#fff8e1;border:1px solid #ffe082;border-radius:6px;padding:10px 14px;font-size:.82rem;margin-bottom:16px;color:#5d4037}
.heatmap-wrap{overflow-x:auto}
table.hm{border-collapse:separate;border-spacing:2px;font-size:.72rem}
.hm th{padding:2px 5px;color:#aaa;font-weight:500;min-width:28px;text-align:center}
.hm td.cell{width:28px;height:26px;border-radius:3px;cursor:pointer;transition:transform .1s}
.hm td.cell:hover{transform:scale(1.2);outline:2px solid #333;z-index:1;position:relative}
.hm td.day-label{font-weight:600;color:#555;padding-right:8px;text-align:right;cursor:default;white-space:nowrap}
.legend{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:.72rem;color:#888}
.legend-bar{width:100px;height:8px;border-radius:3px;background:linear-gradient(to right,#a5d6a7,#fff176,#ef5350)}
.bottom-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}
@media(max-width:900px){.bottom-grid{grid-template-columns:1fr}}
.chart-wrap{height:200px;position:relative}
.chart-hint{font-size:.72rem;color:#aaa;margin-top:6px}
</style>
</head>
<body>
<header>
  <h1>🎾 Padel Auslastungs-Monitor</h1>
  <span class="badge">PSP Schweinfurt</span>
</header>
<div class="container">
  <div class="topbar">
    <label style="font-weight:600;font-size:.9rem">Club:</label>
    <select id="clubSel"></select>
    <button class="btn" onclick="triggerEtl()">▶ ETL jetzt ausführen</button>
    <span id="etlStatus" style="font-size:.8rem;color:#888"></span>
  </div>

  <div id="notice" class="notice" style="display:none"></div>

  <div class="kpi-grid">
    <div class="kpi"><div class="kpi-label">Gesamtauslastung</div><div class="kpi-value" id="kpiTotal">–</div><div class="kpi-sub">bekannte Slots (booked/n)</div></div>
    <div class="kpi"><div class="kpi-label">Prime-Time Mo–Fr 18–22h</div><div class="kpi-value" id="kpiPrime">–</div><div class="kpi-sub">≈ 19–23 Uhr Berlin</div></div>
    <div class="kpi"><div class="kpi-label">Auswertungstage</div><div class="kpi-value" id="kpiDays">–</div><div class="kpi-sub">mit klassifizierten Slots</div></div>
    <div class="kpi"><div class="kpi-label">ETL-Zeitstempel</div><div class="kpi-value" id="kpiTs" style="font-size:1rem;padding-top:6px">–</div><div class="kpi-sub">letzter Rechenstand</div></div>
  </div>

  <div class="panel">
    <div class="panel-title">Auslastungs-Heatmap <span style="font-weight:400;color:#bbb">(Stunden in UTC — für Berlin +1h/+2h addieren)</span></div>
    <div class="heatmap-wrap" id="heatmap"></div>
    <div class="legend"><span>0%</span><div class="legend-bar"></div><span>100%</span><span style="margin-left:12px">⬜ = n&lt;5 (nicht aussagekräftig)</span></div>
  </div>

  <div class="bottom-grid">
    <div class="panel">
      <div class="panel-title">Buchungs-Vorlaufkurve</div>
      <div class="chart-wrap"><canvas id="fillChart"></canvas></div>
      <div class="chart-hint" id="fillHint">Auf Heatmap-Zelle klicken zum Anzeigen</div>
    </div>
    <div class="panel">
      <div class="panel-title">Opening-Poll-Abdeckung (letzte 30 Tage)</div>
      <div class="chart-wrap"><canvas id="qualChart"></canvas></div>
    </div>
  </div>
</div>

<script>
const DAYS=['Mo','Di','Mi','Do','Fr','Sa','So'];
const pct=v=>v==null?'–':(v*100).toFixed(0)+'%';

function util2color(v, confident) {
  if(!confident||v==null) return '#efefef';
  const hue=Math.round((1-v)*110);
  const l=Math.round(40+v*15);
  return 'hsl('+hue+',72%,'+l+'%)';
}

let fillChart=null, qualChart=null;

async function loadClubs(){
  const clubs=await fetch('/api/clubs').then(r=>r.json()).catch(()=>[]);
  const sel=document.getElementById('clubSel');
  clubs.forEach(c=>{
    const o=document.createElement('option');
    o.value=c.tenant_id;
    o.textContent=c.name+(c.city?' ('+c.city+')':'');
    sel.appendChild(o);
  });
  sel.addEventListener('change',()=>loadClub(sel.value));
  if(clubs.length) loadClub(clubs[0].tenant_id);
}

async function loadClub(tenantId){
  const [clubs,cells]=await Promise.all([
    fetch('/api/clubs').then(r=>r.json()),
    fetch('/api/clubs/'+tenantId+'/cells').then(r=>r.json())
  ]);
  const club=clubs.find(c=>c.tenant_id===tenantId)||{};

  document.getElementById('kpiTotal').textContent=pct(club.overall_util);
  document.getElementById('kpiPrime').textContent=pct(club.prime_util);
  document.getElementById('kpiDays').textContent=club.data_days??'0';
  document.getElementById('kpiTs').textContent=club.updated_at
    ?new Date(club.updated_at.endsWith('Z')?club.updated_at:club.updated_at+'Z').toLocaleString('de-DE',{timeZone:'Europe/Berlin'})
    :'–';

  const confCells=cells.filter(c=>c.confident).length;
  const notice=document.getElementById('notice');
  if(confCells<10){
    notice.style.display='';
    notice.textContent='⚠️ Cold-Start: Nur '+cells.filter(c=>c.n>0).length+' Zellen mit Daten, '+confCells+' davon aussagekräftig (n≥5). Dashboard füllt sich mit jedem weiteren Poll-Tag.';
  } else {
    notice.style.display='none';
  }

  renderHeatmap(cells, tenantId);
  loadQuality(tenantId);
}

function renderHeatmap(cells, tenantId){
  // Nur Stunden mit Daten anzeigen
  const activeHours=new Set(cells.filter(c=>c.n>0).map(c=>c.hour_utc));
  const hours=Array.from({length:24},(_,i)=>i).filter(h=>activeHours.has(h));

  const lookup={};
  cells.forEach(c=>{ lookup[c.weekday+'_'+c.hour_utc]=c; });

  let html='<table class="hm"><thead><tr><th></th>';
  hours.forEach(h=>{ html+='<th>'+h+'</th>'; });
  html+='</tr></thead><tbody>';

  DAYS.forEach((day,wd)=>{
    html+='<tr><td class="day-label">'+day+'</td>';
    hours.forEach(h=>{
      const c=lookup[wd+'_'+h];
      const bg=c?util2color(c.utilization,c.confident):'#f7f7f7';
      const tt=c?day+' '+h+'h UTC – '+pct(c.utilization)+' (n='+c.n+(c.confident?'':'⬜')+')':'';
      html+='<td class="cell" style="background:'+bg+'" title="'+tt+'" onclick="loadFillCurve(\''+tenantId+'\','+wd+','+h+')"></td>';
    });
    html+='</tr>';
  });
  html+='</tbody></table>';
  document.getElementById('heatmap').innerHTML=html;
}

async function loadFillCurve(tenantId, weekday, hour){
  const data=await fetch('/api/clubs/'+tenantId+'/fillcurve?weekday='+weekday+'&hour='+hour).then(r=>r.json());
  const sorted=[...data].sort((a,b)=>a.lead_days-b.lead_days);
  document.getElementById('fillHint').textContent=DAYS[weekday]+', '+hour+':00 UTC – '+sorted.length+' Datenpunkte';

  if(fillChart) fillChart.destroy();
  fillChart=new Chart(document.getElementById('fillChart'),{
    type:'bar',
    data:{
      labels:sorted.map(d=>d.lead_days+'T vorher'),
      datasets:[{
        label:'Buchungswahrsch. %',
        data:sorted.map(d=>+(d.p_booked*100).toFixed(1)),
        backgroundColor:sorted.map(d=>d.n>=3?'#5c6bc0':'#c5cae9'),
      }]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      scales:{y:{min:0,max:100,ticks:{callback:v=>v+'%'}}},
      plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>ctx.raw+'% (n='+sorted[ctx.dataIndex].n+')'}}}
    }
  });
}

async function loadQuality(tenantId){
  const data=await fetch('/api/quality').then(r=>r.json());
  const filtered=data.filter(d=>d.tenant_id===tenantId).slice(0,30).reverse();

  if(qualChart) qualChart.destroy();
  qualChart=new Chart(document.getElementById('qualChart'),{
    type:'bar',
    data:{
      labels:filtered.map(d=>d.local_date.slice(5)),
      datasets:[{
        label:'Opening-Polls',
        data:filtered.map(d=>d.opening_polls),
        backgroundColor:filtered.map(d=>d.usable?'#66bb6a':'#ef9a9a'),
      }]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:ctx=>{
          const d=filtered[ctx.dataIndex];
          return ctx.raw+' Polls'+(d.usable?' ✓':' (zu wenig)');
        }}}
      },
      scales:{y:{beginAtZero:true,title:{display:true,text:'Polls/Tag'}}}
    }
  });
}

async function triggerEtl(){
  const s=document.getElementById('etlStatus');
  s.textContent='ETL läuft…';
  try{
    const r=await fetch('/api/etl',{method:'POST'});
    const txt=await r.text();
    s.textContent='✓ '+txt.split('\\n').at(-2)||'fertig';
    setTimeout(()=>{ const sel=document.getElementById('clubSel'); loadClub(sel.value); },1000);
  }catch(e){ s.textContent='Fehler: '+e; }
}

loadClubs();
</script>
</body>
</html>`;
}
