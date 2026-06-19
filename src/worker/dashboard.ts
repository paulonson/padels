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
/* Tabs */
.tabs{display:flex;gap:0;border-bottom:2px solid #e0e0e0;margin-bottom:20px}
.tab{padding:10px 22px;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px;font-size:.9rem;color:#666;user-select:none;transition:color .15s}
.tab:hover{color:#3f51b5}
.tab.active{color:#5c6bc0;border-bottom-color:#5c6bc0;font-weight:600}
/* Vergleich */
.compare-bar-wrap{height:240px;position:relative}
.rank-table{width:100%;border-collapse:collapse;font-size:.85rem}
.rank-table th{text-align:left;padding:8px 12px;border-bottom:2px solid #eee;color:#888;font-size:.72rem;text-transform:uppercase;letter-spacing:.4px;cursor:pointer;user-select:none;white-space:nowrap}
.rank-table th:hover{color:#3f51b5}
.rank-table td{padding:9px 12px;border-bottom:1px solid #f0f0f0}
.rank-table tr:last-child td{border-bottom:none}
.rank-table tr:hover td{background:#fafafa}
.util-chip{display:inline-block;padding:2px 8px;border-radius:10px;font-weight:600;font-size:.82rem}
.vorlauf-selectors{display:flex;gap:12px;align-items:center;margin-bottom:16px;flex-wrap:wrap}
.vorlauf-selectors label{font-size:.82rem;color:#666}
.vorlauf-chart-wrap{height:220px;position:relative}
</style>
</head>
<body>
<header>
  <h1>🎾 Padel Auslastungs-Monitor</h1>
  <span class="badge">PSP Schweinfurt</span>
</header>
<div class="container">

  <div class="tabs">
    <div class="tab active" id="tabBtnSingle" onclick="switchTab('single')">Einzelclub</div>
    <div class="tab" id="tabBtnCompare" onclick="switchTab('compare')">Vergleich</div>
  </div>

  <!-- ===== EINZELCLUB-TAB ===== -->
  <div id="tabSingle">
    <div class="topbar">
      <label style="font-weight:600;font-size:.9rem">Club:</label>
      <select id="clubSel"></select>
      <button class="btn" onclick="triggerEtl()">&#9654; ETL jetzt ausführen</button>
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

  <!-- ===== VERGLEICHS-TAB ===== -->
  <div id="tabCompare" style="display:none">

    <div class="panel">
      <div class="panel-title">Ranking aller Klubs</div>
      <div id="rankTableWrap"><p style="color:#aaa;font-size:.85rem">Wird geladen…</p></div>
    </div>

    <div class="panel">
      <div class="panel-title">Auslastung im Vergleich</div>
      <div class="compare-bar-wrap"><canvas id="compareBarChart"></canvas></div>
    </div>

    <div class="panel">
      <div class="panel-title">Buchungsvorlauf-Vergleich</div>
      <div class="vorlauf-selectors">
        <label>Wochentag:</label>
        <select id="cmpWeekday">
          <option value="0">Montag</option>
          <option value="1">Dienstag</option>
          <option value="2">Mittwoch</option>
          <option value="3">Donnerstag</option>
          <option value="4" selected>Freitag</option>
          <option value="5">Samstag</option>
          <option value="6">Sonntag</option>
        </select>
        <label>Stunde (UTC):</label>
        <select id="cmpHour">
          ${Array.from({length: 24}, (_, i) => `<option value="${i}"${i === 17 ? ' selected' : ''}>${i}:00 UTC (≈${(i + 2) % 24}:00 Berlin)</option>`).join('')}
        </select>
      </div>
      <div class="vorlauf-chart-wrap"><canvas id="compareVorlaufChart"></canvas></div>
    </div>

  </div>

</div>

<script>
const DAYS=['Mo','Di','Mi','Do','Fr','Sa','So'];
const CLUB_COLORS=['#5c6bc0','#ef5350','#66bb6a','#ffa726'];
const pct=v=>v==null?'–':(v*100).toFixed(0)+'%';

function util2color(v, confident) {
  if(!confident||v==null) return '#efefef';
  const hue=Math.round((1-v)*110);
  const l=Math.round(40+v*15);
  return 'hsl('+hue+',72%,'+l+'%)';
}

function utilChipColor(v) {
  if(v==null) return '#eee';
  if(v>=0.7) return '#ef9a9a';
  if(v>=0.4) return '#fff176';
  return '#a5d6a7';
}

let fillChart=null, qualChart=null, compareBarChart=null, compareVorlaufChart=null;
let compareLoaded=false;

function switchTab(name) {
  document.getElementById('tabSingle').style.display = name==='single' ? '' : 'none';
  document.getElementById('tabCompare').style.display = name==='compare' ? '' : 'none';
  document.getElementById('tabBtnSingle').className = 'tab'+(name==='single'?' active':'');
  document.getElementById('tabBtnCompare').className = 'tab'+(name==='compare'?' active':'');
  if(name==='compare' && !compareLoaded) {
    compareLoaded=true;
    loadCompare();
  }
}

// ===== EINZELCLUB =====

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
      html+='<td class="cell" style="background:'+bg+'" title="'+tt+'" onclick="loadFillCurve(\\''+tenantId+'\\','+wd+','+h+')"></td>';
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

// ===== VERGLEICH =====

let allClubs=[];

async function loadCompare(){
  allClubs=await fetch('/api/clubs').then(r=>r.json()).catch(()=>[]);
  renderRankTable(allClubs, 'overall_util', false);
  renderCompareBar(allClubs);
  await loadCompareVorlauf();
  document.getElementById('cmpWeekday').addEventListener('change', loadCompareVorlauf);
  document.getElementById('cmpHour').addEventListener('change', loadCompareVorlauf);
}

let rankSortCol='overall_util', rankSortAsc=false;

function renderRankTable(clubs, sortCol, asc) {
  rankSortCol=sortCol; rankSortAsc=asc;
  const sorted=[...clubs].sort((a,b)=>{
    const va=a[sortCol]??-1, vb=b[sortCol]??-1;
    return asc ? va-vb : vb-va;
  });

  const arrow=col=>col===sortCol?(asc?' ▲':' ▼'):'';
  let html='<table class="rank-table"><thead><tr>';
  html+='<th onclick="rankSort(\\'name\\')">Klub'+arrow('name')+'</th>';
  html+='<th onclick="rankSort(\\'overall_util\\')">Gesamtauslastung'+arrow('overall_util')+'</th>';
  html+='<th onclick="rankSort(\\'prime_util\\')">Prime-Time'+arrow('prime_util')+'</th>';
  html+='<th onclick="rankSort(\\'data_days\\')">Auswertungstage'+arrow('data_days')+'</th>';
  html+='</tr></thead><tbody>';

  sorted.forEach(c=>{
    const bg1=utilChipColor(c.overall_util);
    const bg2=utilChipColor(c.prime_util);
    html+='<tr>';
    html+='<td><strong>'+c.name+'</strong><br><span style="font-size:.75rem;color:#aaa">'+( c.city||'' )+'</span></td>';
    html+='<td><span class="util-chip" style="background:'+bg1+'">'+pct(c.overall_util)+'</span></td>';
    html+='<td><span class="util-chip" style="background:'+bg2+'">'+pct(c.prime_util)+'</span></td>';
    html+='<td>'+(c.data_days??'–')+'</td>';
    html+='</tr>';
  });
  html+='</tbody></table>';
  document.getElementById('rankTableWrap').innerHTML=html;
}

function rankSort(col) {
  const asc = rankSortCol===col ? !rankSortAsc : false;
  renderRankTable(allClubs, col, asc);
}

function renderCompareBar(clubs) {
  const labels=clubs.map(c=>c.name);
  if(compareBarChart) compareBarChart.destroy();
  compareBarChart=new Chart(document.getElementById('compareBarChart'),{
    type:'bar',
    data:{
      labels,
      datasets:[
        {
          label:'Gesamtauslastung',
          data:clubs.map(c=>c.overall_util!=null?+(c.overall_util*100).toFixed(1):null),
          backgroundColor:clubs.map((_,i)=>CLUB_COLORS[i%CLUB_COLORS.length]+'cc'),
          borderColor:clubs.map((_,i)=>CLUB_COLORS[i%CLUB_COLORS.length]),
          borderWidth:1,
        },
        {
          label:'Prime-Time Mo–Fr 18–22h',
          data:clubs.map(c=>c.prime_util!=null?+(c.prime_util*100).toFixed(1):null),
          backgroundColor:clubs.map((_,i)=>CLUB_COLORS[i%CLUB_COLORS.length]+'55'),
          borderColor:clubs.map((_,i)=>CLUB_COLORS[i%CLUB_COLORS.length]),
          borderWidth:1,
          borderDash:[4,3],
        }
      ]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      scales:{y:{min:0,max:100,ticks:{callback:v=>v+'%'},title:{display:true,text:'Auslastung %'}}},
      plugins:{tooltip:{callbacks:{label:ctx=>ctx.dataset.label+': '+(ctx.raw??'–')+'%'}}}
    }
  });
}

async function loadCompareVorlauf(){
  const weekday=document.getElementById('cmpWeekday').value;
  const hour=document.getElementById('cmpHour').value;
  const data=await fetch('/api/compare/fillcurve?weekday='+weekday+'&hour='+hour).then(r=>r.json()).catch(()=>[]);

  // Gruppiere nach Klub
  const byClub={};
  data.forEach(row=>{
    if(!byClub[row.tenant_id]) byClub[row.tenant_id]={name:row.name,points:[]};
    byClub[row.tenant_id].points.push(row);
  });

  const clubEntries=Object.entries(byClub);
  const allLeadDays=[...new Set(data.map(r=>r.lead_days))].sort((a,b)=>a-b);

  const datasets=clubEntries.map(([tid,club],i)=>{
    const byLead={};
    club.points.forEach(p=>{ byLead[p.lead_days]=p; });
    return {
      label:club.name,
      data:allLeadDays.map(d=>byLead[d]!=null?+(byLead[d].p_booked*100).toFixed(1):null),
      borderColor:CLUB_COLORS[i%CLUB_COLORS.length],
      backgroundColor:'transparent',
      pointBackgroundColor:CLUB_COLORS[i%CLUB_COLORS.length],
      tension:0.3,
      spanGaps:true,
    };
  });

  if(compareVorlaufChart) compareVorlaufChart.destroy();
  compareVorlaufChart=new Chart(document.getElementById('compareVorlaufChart'),{
    type:'line',
    data:{
      labels:allLeadDays.map(d=>d+'T vorher'),
      datasets,
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      scales:{y:{min:0,max:100,ticks:{callback:v=>v+'%'},title:{display:true,text:'Buchungswahrsch. %'}}},
      plugins:{tooltip:{callbacks:{label:ctx=>ctx.dataset.label+': '+(ctx.raw??'–')+'%'}}}
    }
  });
}

loadClubs();
</script>
</body>
</html>`;
}
