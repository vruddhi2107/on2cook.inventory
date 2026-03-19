/**
 * app.js — Main application state + BOM, Inventory, Production Line tab rendering
 * Global state: allParts, allInventory, allProduction
 */

/* ═══ GLOBAL STATE ══════════════════════════════════════ */
let allParts      = [];
let allInventory  = [];
let allProduction = [];
let filtered      = [];
let sortKey       = 'leadTimeDays';
let sortDir       = 'desc';
let expandedRows  = new Set();
let searchTerm    = '';

/* ═══ INIT ══════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  _dbUI('yellow', 'Connecting to Supabase…');
  try {
    await BomDB.open();
    const [parts, inv, prod] = await Promise.all([
      BomDB.getAll('bom_parts'),
      BomDB.getAll('store_inventory'),
      BomDB.getAll('production_line'),
    ]);
    loadPartsData(parts);
    loadInventoryData(inv);
    loadProductionData(prod);
    const total = parts.length + inv.length + prod.length;
    _dbUI('green', `Supabase · ${parts.length}p / ${inv.length}i / ${prod.length}pl`);
    if (total > 0) showToast(`✓ Loaded ${parts.length} BOM · ${inv.length} inventory · ${prod.length} production`, 'success');
    else _dbUI('green', 'Supabase connected — no data yet');
  } catch (err) {
    _dbUI('', 'Connection Error');
    console.error('DB init:', err);
    showToast('Supabase error: ' + err.message, 'error');
  }
});

function _dbUI(cls, txt) {
  const d = document.getElementById('db-dot'); if (d) d.className = 'db-dot ' + cls;
  const t = document.getElementById('db-status-text'); if (t) t.textContent = txt;
}

/* ═══ DATA LOADERS ══════════════════════════════════════ */
function loadPartsData(parts) {
  allParts = parts || [];
  expandedRows.clear();
  populateFilters();
  applyFilters();
  updateBomStats();
  renderAnalysis();
}

function loadInventoryData(inv) {
  allInventory = inv || [];
  updateInventoryStatus(allInventory);
  renderInventoryTable();
  renderAnalysis();
}

function loadProductionData(prod) {
  allProduction = prod || [];
  updateProductionStatus(allProduction);
  renderProductionTable();
  renderAnalysis();
}

/* ═══ TAB SWITCHING ══════════════════════════════════════ */
function switchTab(name) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('panel-' + name).classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
  if (name === 'planning') runFeasibility();
  if (name === 'analysis') renderAnalysis();
}

/* ═══════════════════════════════════════════════════════
   BOM TAB
═══════════════════════════════════════════════════════ */
function handleSearch(val) { searchTerm = val.trim().toLowerCase(); applyFilters(); }

function applyFilters() {
  const type=document.getElementById('filter-type').value;
  const urg=document.getElementById('filter-urgency').value;
  const supp=document.getElementById('filter-supplier').value;
  const ctry=document.getElementById('filter-country').value;
  const sa=document.getElementById('filter-sa').value;
  const rw=document.getElementById('filter-rework').value;
  filtered = allParts.filter(p => {
    if (searchTerm && !((p.partNumber||'')+(p.partName||'')).toLowerCase().includes(searchTerm)) return false;
    if (type && p.partType!==type) return false;
    if (urg  && p.urgency!==urg) return false;
    if (supp && p.supplierName!==supp) return false;
    if (ctry && p.country!==ctry) return false;
    if (rw   && p.reworkRequired!==rw) return false;
    if (sa   && !(p.subAssemblies||[]).some(s=>s.id===sa)) return false;
    return true;
  });
  sortFiltered(); renderBomTable(); updateActiveCount();
}

function clearFilters() {
  document.getElementById('search-input').value='';
  ['filter-type','filter-urgency','filter-supplier','filter-country','filter-sa','filter-rework']
    .forEach(id=>{document.getElementById(id).value='';});
  searchTerm='';
  clearFxRate();
  applyFilters();
}

function updateActiveCount() {
  const el=document.getElementById('active-count'); if(!el)return;
  const total=allParts.length, shown=filtered.length;
  if(!total){el.innerHTML='';return;}
  el.innerHTML=shown<total?`Showing <strong>${shown}</strong> of <strong>${total}</strong> parts`:`<strong>${total}</strong> parts`;
}

function sortCol(key) {
  sortDir=(sortKey===key)?(sortDir==='asc'?'desc':'asc'):(key==='leadTimeDays'?'desc':'asc');
  sortKey=key; sortFiltered(); renderBomTable(); _sortHdrs();
}

function sortFiltered() {
  const uo={critical:0,high:1,medium:2,low:3};
  filtered.sort((a,b)=>{
    let av=a[sortKey]??(sortKey==='urgency'?99:''), bv=b[sortKey]??(sortKey==='urgency'?99:'');
    if(sortKey==='urgency'){av=uo[av]??4;bv=uo[bv]??4;}
    if(typeof av==='number'&&typeof bv==='number') return sortDir==='asc'?av-bv:bv-av;
    return sortDir==='asc'?String(av).localeCompare(String(bv)):String(bv).localeCompare(String(av));
  });
}

function _sortHdrs() {
  document.querySelectorAll('#bom-table thead th').forEach(th=>{
    th.classList.remove('sort-asc','sort-desc');
    if(th.getAttribute('onclick')===`sortCol('${sortKey}')`) th.classList.add(sortDir==='asc'?'sort-asc':'sort-desc');
  });
}

function renderBomTable() {
  const tbody=document.getElementById('bom-tbody');
  const noData=!allParts.length, noMatch=allParts.length>0&&filtered.length===0;
  document.getElementById('bom-table').style.display=filtered.length?'table':'none';
  const es=document.getElementById('empty-state');
  if(noData){es.style.display='block';es.querySelector('.empty-title').textContent='No BOM Data';es.querySelector('.empty-sub').textContent='Ask admin to upload BOM file';}
  else if(noMatch){es.style.display='block';es.querySelector('.empty-title').textContent='No Matching Parts';es.querySelector('.empty-sub').textContent='Adjust search or filters';}
  else es.style.display='none';
  document.getElementById('tbl-meta').textContent=filtered.length?`${filtered.length} part${filtered.length!==1?'s':''}`:noData?'No data loaded':'';
  tbody.innerHTML=filtered.map(p=>_bomRow(p)).join('');
  tbody.querySelectorAll('.expand-btn').forEach(btn=>btn.addEventListener('click',()=>toggleExpand(btn.dataset.pn)));
  _sortHdrs();
}

function _bomRow(p) {
  const urg=p.urgency||'low', hasDet=(p.subAssemblies&&p.subAssemblies.length)||p.individualQty>0, isOpen=expandedRows.has(p.partNumber);
  const isFx=_isFxPart(p);
  const fmt=n=>(typeof n==='number'&&n>0)?'₹'+n.toLocaleString('en-IN',{maximumFractionDigits:2}):'—';
  const fmtR=pt=>{
    const fx=_fxVendorRate(pt);
    if(!fx)return'—';
    const sym=fx.currency==='USD'?'$':fx.currency==='EUR'?'€':fx.currency==='GBP'?'£':fx.currency==='INR'?'₹':fx.currency;
    if(fx.converted){
      return`<span>₹${fx.rate.toLocaleString('en-IN',{maximumFractionDigits:2})}<span class="fx-badge">FX</span></span>`;
    }
    return sym+pt.vendorUnitRate.toLocaleString('en-IN',{maximumFractionDigits:2});
  };
  const fP=n=>n>0?n+'%':'—', fD=d=>d>0?d+' days':'—';
  const mr=`<tr data-pn="${e(p.partNumber)}" data-urgency="${urg}" class="${isOpen?'row-expanded':''}" style="${isFx?'background:#FFFDF0':''}">
  <td class="col-expand">${hasDet?`<button class="expand-btn ${isOpen?'open':''}" data-pn="${e(p.partNumber)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg></button>`:'<span style="width:26px;display:inline-block"></span>'}</td>
  <td class="col-pno"><span class="cell-pno">${e(p.partNumber)}</span></td>
  <td><span class="cell-name">${e(p.partName)}</span></td>
  <td title="${e(p.partDesc)}"><span class="cell-desc">${e(p.partDesc)||'—'}</span></td>
  <td><span style="font-family:var(--font-mono);font-size:11.5px">${e(p.hsnCode)||'—'}</span></td>
  <td>${p.partType?`<span class="tag tag-type">${e(p.partType)}</span>`:'—'}</td>
  <td>${_rwBadge(p.reworkRequired)}</td>
  <td title="${e(p.material)}" style="max-width:160px;overflow:hidden;text-overflow:ellipsis">${e(p.material)||'—'}</td>
  <td class="cell-num">${p.qty>0?p.qty:'—'}</td>
  <td style="font-family:var(--font-mono);font-size:11.5px">${e(p.uom)||'—'}</td>
  <td class="cell-num">${fmtR(p)}</td>
  <td class="cell-num" style="font-weight:600">${fmt(p.totalUnitCost)}</td>
  <td class="cell-num">${fmt(p.customDuty)}</td>
  <td class="cell-num">${fP(p.surchargePercent)}</td>
  <td class="cell-num">${fP(p.dutyPercent)}</td>
  <td class="cell-num">${fmt(p.totalFreight)}</td>
  <td class="cell-num" style="font-weight:700">${fmt(p.landedCost)}</td>
  <td title="${e(p.supplierName)}" style="max-width:170px;overflow:hidden;text-overflow:ellipsis">${e(p.supplierName)||'—'}</td>
  <td>${e(p.country)||'—'}</td>
  <td style="font-family:var(--font-mono);font-size:12px">${fD(p.leadTimeDays)}</td>
  <td>${_urgBadge(urg)}</td>
</tr>`;
  const er=hasDet?`<tr class="expansion-row ${isOpen?'open':''}" data-exp="${e(p.partNumber)}"><td colspan="21">${_expansion(p)}</td></tr>`:'';
  return mr+er;
}

function _expansion(p) {
  const tot=(p.subAssemblies||[]).reduce((s,sa)=>s+sa.qty,0), grand=tot+(p.individualQty||0);
  let rows=(p.subAssemblies||[]).map(sa=>`<tr><td><span class="sa-badge">${e(sa.id)}</span></td><td>${e(sa.name)}</td><td class="cell-num" style="font-weight:600">${sa.qty}</td><td>${e(p.uom||'PCS')}</td></tr>`).join('');
  if(p.individualQty>0) rows+=`<tr><td><span class="sa-ind-badge">INDIVIDUAL</span></td><td>Direct use — not part of any sub-assembly</td><td class="cell-num" style="font-weight:600">${p.individualQty}</td><td>${e(p.uom||'PCS')}</td></tr>`;
  return `<div class="exp-inner"><div class="exp-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>Sub-Assembly Breakdown — ${e(p.partNumber)}</div><div class="sa-table-wrap"><table class="sa-table"><thead><tr><th style="min-width:160px">Sub-Assembly ID</th><th style="min-width:240px">Name</th><th style="min-width:80px;text-align:right">Qty Used</th><th style="min-width:70px">UOM</th></tr></thead><tbody>${rows}<tr class="sa-total-row"><td colspan="2" style="font-family:var(--font-h);text-transform:uppercase;letter-spacing:.5px">TOTAL QTY REQUIRED</td><td style="text-align:right;font-size:14px">${grand}</td><td>${e(p.uom||'PCS')}</td></tr></tbody></table></div></div>`;
}

function toggleExpand(pn) {
  const safe=CSS.escape(pn);
  const mr=document.querySelector(`tr[data-pn="${safe}"]`), er=document.querySelector(`tr[data-exp="${safe}"]`), btn=document.querySelector(`.expand-btn[data-pn="${safe}"]`);
  if(!er)return;
  if(expandedRows.has(pn)){expandedRows.delete(pn);er.classList.remove('open');mr?.classList.remove('row-expanded');btn?.classList.remove('open');}
  else{expandedRows.add(pn);er.classList.add('open');mr?.classList.add('row-expanded');btn?.classList.add('open');}
}

function updateBomStats() {
  if(!allParts.length){['stat-total','stat-crit','stat-high','stat-sa','stat-vendors'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent='—';});return;}
  _s('stat-total',allParts.length);
  _s('stat-crit',allParts.filter(p=>p.urgency==='critical').length);
  _s('stat-high',allParts.filter(p=>p.urgency==='high').length);
  _s('stat-vendors',new Set(allParts.map(p=>p.supplierName).filter(Boolean)).size);
  const ss=new Set(); allParts.forEach(p=>(p.subAssemblies||[]).forEach(sa=>ss.add(sa.id)));
  _s('stat-sa',ss.size);
}

function populateFilters() {
  _popSel('filter-type',_uv('partType'),'All Part Types');
  _popSel('filter-supplier',_uv('supplierName'),'All Suppliers');
  _popSel('filter-country',_uv('country'),'All Countries');
  const sm={};
  allParts.forEach(p=>(p.subAssemblies||[]).forEach(sa=>{sm[sa.id]=true;}));
  const el=document.getElementById('filter-sa'); if(!el)return;
  el.innerHTML='<option value="">All Sub-Assemblies</option>';
  Object.keys(sm).sort().forEach(id=>{const o=document.createElement('option');o.value=id;o.textContent=id;el.appendChild(o);});
}
function _uv(f){return[...new Set(allParts.map(p=>p[f]).filter(Boolean))].sort();}
function _popSel(id,vals,ph){const el=document.getElementById(id);if(!el)return;el.innerHTML=`<option value="">${ph}</option>`;vals.forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v;el.appendChild(o);});}

/* ═══════════════════════════════════════════════════════
   INVENTORY TAB
═══════════════════════════════════════════════════════ */
let invSearch='', invStatusFilter='';

function handleInvSearch(val){ invSearch=val.trim().toLowerCase(); renderInventoryTable(); }
function filterInvStatus(val){ invStatusFilter=val; renderInventoryTable(); }

function renderInventoryTable() {
  const area=document.getElementById('inv-table-area'); if(!area)return;
  if(!allInventory.length){
    area.innerHTML=`<div class="empty-state"><div class="empty-icon">📦</div><div class="empty-title">No Inventory Data</div><div class="empty-sub">Ask admin to upload the Store Inventory file</div></div>`;
    return;
  }
  let data=allInventory;
  if(invSearch) data=data.filter(i=>(i.itemCode+' '+i.itemName).toLowerCase().includes(invSearch));
  if(invStatusFilter) data=data.filter(i=>i.stockStatus===invStatusFilter);

  // Summary cards
  const totalVal=allInventory.reduce((s,i)=>s+(i.balanceStockAmount||0),0);
  const shortfallItems=allInventory.filter(i=>i.shortfall250>0).length;
  const outOfStock=allInventory.filter(i=>(i.stockStatus||'').toLowerCase().includes('out')).length;
  const lowStock=allInventory.filter(i=>(i.stockStatus||'').toLowerCase().includes('low')).length;

  const statuses=[...new Set(allInventory.map(i=>i.stockStatus).filter(Boolean))];

  area.innerHTML=`
  <div class="stats-grid" style="margin-bottom:18px">
    <div class="stat-card s-total"><div class="sc-label">Total Items</div><div class="sc-value">${allInventory.length}</div><div class="sc-sub">Unique Item Codes</div></div>
    <div class="stat-card" style="border-top:3px solid #0060A0"><div class="sc-label">Inventory Value</div><div class="sc-value" style="font-size:24px;color:#0060A0">₹${totalVal.toLocaleString('en-IN',{maximumFractionDigits:0})}</div><div class="sc-sub">Balance Stock Amount</div></div>
    <div class="stat-card s-crit"><div class="sc-label">Out of Stock</div><div class="sc-value">${outOfStock}</div><div class="sc-sub">Items at zero</div></div>
    <div class="stat-card s-high"><div class="sc-label">Low Stock</div><div class="sc-value">${lowStock}</div><div class="sc-sub">Below reorder point</div></div>
    <div class="stat-card" style="border-top:3px solid #8B0000"><div class="sc-label">Shortfall (250 sets)</div><div class="sc-value" style="color:#8B0000">${shortfallItems}</div><div class="sc-sub">Items with deficit</div></div>
  </div>
  <div class="toolbar" style="margin-bottom:14px">
    <div class="search-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><input type="text" placeholder="Search Item Code or Name…" oninput="handleInvSearch(this.value)" value="${invSearch}"></div>
    <div class="tb-div"></div>
    <select class="filter-sel" onchange="filterInvStatus(this.value)">
      <option value="">All Statuses</option>
      ${statuses.map(s=>`<option value="${e(s)}" ${invStatusFilter===s?'selected':''}>${e(s)}</option>`).join('')}
    </select>
    <div class="tb-div"></div>
    <span class="active-count"><strong>${data.length}</strong> of <strong>${allInventory.length}</strong> items</span>
  </div>
  <div class="table-card">
    <div class="tc-header">
      <div class="tc-title">Store Inventory</div>
      <div style="display:flex;align-items:center;gap:10px">
        <div class="tc-meta">${data.length} items</div>
        <button class="btn-export" onclick="exportInventory()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export
        </button>
      </div>
    </div>
    <div class="tbl-scroll">
      <table style="min-width:2400px">
        <thead><tr>
          <th style="min-width:140px">Item Code</th>
          <th style="min-width:200px">Item Name</th>
          <th style="min-width:90px;text-align:right">Per Unit Qty</th>
          <th style="min-width:110px;text-align:right">Opening Stock</th>
          <th style="min-width:110px;text-align:right">Current Stock</th>
          <th style="min-width:100px;text-align:right">Line Stock</th>
          <th style="min-width:110px;text-align:right">Stock @ Antunes</th>
          <th style="min-width:110px;text-align:right">Sent to Dubai</th>
          <th style="min-width:120px;text-align:right">Receive Dubai</th>
          <th style="min-width:130px;text-align:right">Bal Line 1F</th>
          <th style="min-width:130px;text-align:right">1F & Store</th>
          <th style="min-width:130px;text-align:right">Bal after 220 Sets</th>
          <th style="min-width:100px">Lead Time</th>
          <th style="min-width:110px;text-align:right">Reorder Pt</th>
          <th style="min-width:120px">Stock Status</th>
          <th style="min-width:120px;text-align:right">Shortfall 100</th>
          <th style="min-width:120px;text-align:right">Shortfall 250</th>
          <th style="min-width:120px;text-align:right">Shortfall 350</th>
          <th style="min-width:110px;text-align:right">Cost/Pcs</th>
          <th style="min-width:140px;text-align:right">Stock Value</th>
          <th style="min-width:100px">ETA</th>
          <th style="min-width:120px">Material Status</th>
          <th style="min-width:180px">Remarks</th>
        </tr></thead>
        <tbody>
          ${data.map(i=>{
            const ss=i.stockStatus||'';
            const ssColor=ss.toLowerCase().includes('out')?'var(--c-def)':ss.toLowerCase().includes('low')?'var(--c-high)':ss.toLowerCase().includes('ok')||ss.toLowerCase().includes('sufficient')?'var(--c-ok)':'var(--gray-5)';
            const n=(v,dec=0)=>typeof v==='number'&&v!==0?v.toLocaleString('en-IN',{maximumFractionDigits:dec}):'—';
            const sf=(v)=>v>0?`<span style="color:var(--c-def);font-weight:700;font-family:var(--font-mono)">${v}</span>`:'<span style="color:var(--c-ok)">—</span>';
            return `<tr>
              <td><span class="cell-pno">${e(i.itemCode)}</span></td>
              <td style="font-weight:600;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${e(i.itemName)}">${e(i.itemName)}</td>
              <td class="cell-num">${n(i.perUnitQty)}</td>
              <td class="cell-num">${n(i.openingStock)}</td>
              <td class="cell-num" style="font-weight:700">${n(i.currentStock)}</td>
              <td class="cell-num">${n(i.lineStock)}</td>
              <td class="cell-num">${n(i.stockAntunes)}</td>
              <td class="cell-num">${n(i.stockSentDubai)}</td>
              <td class="cell-num">${n(i.stockReceiveDubai)}</td>
              <td class="cell-num">${n(i.balanceLineStock1F)}</td>
              <td class="cell-num">${n(i.stock1FAndStore)}</td>
              <td class="cell-num" style="font-weight:600">${n(i.balanceAfter220Sets)}</td>
              <td style="font-family:var(--font-mono);font-size:11.5px">${e(i.leadTime)||'—'}</td>
              <td class="cell-num">${n(i.reorderPoint)}</td>
              <td><span style="font-size:11.5px;font-weight:600;color:${ssColor}">${e(ss)||'—'}</span></td>
              <td class="cell-num">${sf(i.shortfall100)}</td>
              <td class="cell-num">${sf(i.shortfall250)}</td>
              <td class="cell-num">${sf(i.shortfall350)}</td>
              <td class="cell-num">₹${n(i.costPerPcs,2)}</td>
              <td class="cell-num" style="font-weight:700">₹${n(i.balanceStockAmount,0)}</td>
              <td style="font-family:var(--font-mono);font-size:11px">${e(i.eta)||'—'}</td>
              <td style="font-size:11.5px">${e(i.materialStatus)||'—'}</td>
              <td style="font-size:11.5px;color:var(--gray-5);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${e(i.remarks||i.remark)}">${e(i.remarks||i.remark)||'—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

/* ═══════════════════════════════════════════════════════
   PRODUCTION LINE TAB
═══════════════════════════════════════════════════════ */
let prodSearch='';
function handleProdSearch(val){ prodSearch=val.trim().toLowerCase(); renderProductionTable(); }

function renderProductionTable() {
  const area=document.getElementById('prod-line-area'); if(!area)return;
  if(!allProduction.length){
    area.innerHTML=`<div class="empty-state"><div class="empty-icon">🏭</div><div class="empty-title">No Production Line Data</div><div class="empty-sub">Ask admin to upload the Production Line file</div></div>`;
    return;
  }
  let data=allProduction;
  if(prodSearch) data=data.filter(i=>(i.itemCode+' '+i.itemName).toLowerCase().includes(prodSearch));

  const totalIssued=allProduction.reduce((s,i)=>s+(i.lineIssue||0),0);
  const totalRejected=allProduction.reduce((s,i)=>s+(i.lineRejection||0),0);
  const netConsumed=totalIssued-totalRejected;
  const rejRate=totalIssued>0?((totalRejected/totalIssued)*100).toFixed(1):0;

  area.innerHTML=`
  <div class="stats-grid" style="margin-bottom:18px;grid-template-columns:repeat(4,1fr)">
    <div class="stat-card s-total"><div class="sc-label">Total Items</div><div class="sc-value">${allProduction.length}</div><div class="sc-sub">On Production Line</div></div>
    <div class="stat-card" style="border-top:3px solid var(--c-high)"><div class="sc-label">Total Issued</div><div class="sc-value" style="color:var(--c-high)">${totalIssued.toLocaleString('en-IN')}</div><div class="sc-sub">Line Issue qty</div></div>
    <div class="stat-card" style="border-top:3px solid var(--c-ok)"><div class="sc-label">Net Consumed</div><div class="sc-value" style="color:var(--c-ok)">${netConsumed.toLocaleString('en-IN')}</div><div class="sc-sub">Issue − Rejection</div></div>
    <div class="stat-card s-crit"><div class="sc-label">Rejection Rate</div><div class="sc-value">${rejRate}%</div><div class="sc-sub">${totalRejected.toLocaleString('en-IN')} units rejected</div></div>
  </div>
  <div class="toolbar" style="margin-bottom:14px">
    <div class="search-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><input type="text" placeholder="Search Item Code or Name…" oninput="handleProdSearch(this.value)" value="${prodSearch}"></div>
    <div class="tb-div"></div>
    <span class="active-count"><strong>${data.length}</strong> items</span>
  </div>
  <div class="table-card">
    <div class="tc-header">
      <div class="tc-title">Production Line</div>
      <div style="display:flex;align-items:center;gap:10px">
        <div class="tc-meta">${data.length} items</div>
        <button class="btn-export" onclick="exportProductionLine()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export
        </button>
      </div>
    </div>
    <div class="tbl-scroll">
      <table style="min-width:900px">
        <thead><tr>
          <th style="min-width:150px">Item Code</th>
          <th style="min-width:220px">Item Name</th>
          <th style="min-width:100px;text-align:right">Per Unit Qty</th>
          <th style="min-width:140px">Location</th>
          <th style="min-width:110px;text-align:right">Line Issue</th>
          <th style="min-width:110px;text-align:right">Rejection</th>
          <th style="min-width:130px;text-align:right">Net Consumed</th>
          <th style="min-width:110px;text-align:right">Rejection %</th>
        </tr></thead>
        <tbody>
          ${data.map(i=>{
            const rejPct=i.lineIssue>0?((i.lineRejection/i.lineIssue)*100).toFixed(1):0;
            const rejColor=rejPct>10?'var(--c-def)':rejPct>5?'var(--c-high)':'var(--c-ok)';
            return `<tr>
              <td><span class="cell-pno">${e(i.itemCode)}</span></td>
              <td style="font-weight:600">${e(i.itemName)}</td>
              <td class="cell-num">${i.perUnitQty||'—'}</td>
              <td style="font-family:var(--font-mono);font-size:11.5px;color:var(--gray-5)">${e(i.stockLocation)||'—'}</td>
              <td class="cell-num" style="color:var(--c-high);font-weight:600">${(i.lineIssue||0).toLocaleString('en-IN')}</td>
              <td class="cell-num" style="color:var(--c-def)">${(i.lineRejection||0).toLocaleString('en-IN')}</td>
              <td class="cell-num" style="font-weight:700">${(i.netConsumption||0).toLocaleString('en-IN')}</td>
              <td class="cell-num"><span style="color:${rejColor};font-weight:700">${rejPct}%</span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

/* ═══════════════════════════════════════════════════════
   ANALYSIS TAB
═══════════════════════════════════════════════════════ */
function renderAnalysis() {
  const area=document.getElementById('analysis-area'); if(!area)return;
  if(!allParts.length&&!allInventory.length){
    area.innerHTML=`<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-title">No Data for Analysis</div><div class="empty-sub">Upload BOM and Inventory files first</div></div>`;
    return;
  }

  /* Urgency breakdown */
  const urgCounts={critical:0,high:0,medium:0,low:0};
  allParts.forEach(p=>{ if(urgCounts[p.urgency]!==undefined) urgCounts[p.urgency]++; });

  /* Top 10 critical lead-time parts */
  const topCrit=[...allParts].sort((a,b)=>(b.leadTimeDays||0)-(a.leadTimeDays||0)).slice(0,10);

  /* Stock status breakdown */
  const ssCounts={};
  allInventory.forEach(i=>{ const s=i.stockStatus||'Unknown'; ssCounts[s]=(ssCounts[s]||0)+1; });

  /* Shortfall summary */
  const shItems=allInventory.filter(i=>i.shortfall250>0).slice(0,10);

  /* Inventory value by item (top 10) */
  const topVal=[...allInventory].filter(i=>i.balanceStockAmount>0).sort((a,b)=>b.balanceStockAmount-a.balanceStockAmount).slice(0,10);

  /* Total inventory value */
  const totalInvVal=allInventory.reduce((s,i)=>s+(i.balanceStockAmount||0),0);

  /* Production rejection leaders */
  const topRej=[...allProduction].filter(i=>i.lineRejection>0).sort((a,b)=>b.lineRejection-a.lineRejection).slice(0,8);

  const urgColors={critical:'#C80000',high:'#D46000',medium:'#B89000',low:'#2A7D2A'};
  const urgBar=(key)=>{const pct=allParts.length?Math.round((urgCounts[key]/allParts.length)*100):0;return`<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:12px;font-weight:600;color:${urgColors[key]};text-transform:capitalize">${key}</span><span style="font-family:var(--font-mono);font-size:12px">${urgCounts[key]} (${pct}%)</span></div><div style="height:8px;background:var(--gray-2);overflow:hidden"><div style="height:100%;background:${urgColors[key]};width:${pct}%"></div></div></div>`;};

  area.innerHTML=`
  <!-- KPI Row -->
  <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin-bottom:22px">
    <div class="stat-card s-total"><div class="sc-label">BOM Parts</div><div class="sc-value">${allParts.length}</div><div class="sc-sub">Unique parts</div></div>
    <div class="stat-card" style="border-top:3px solid #0060A0"><div class="sc-label">Inventory Value</div><div class="sc-value" style="font-size:22px;color:#0060A0">₹${(totalInvVal/100000).toFixed(1)}L</div><div class="sc-sub">₹${totalInvVal.toLocaleString('en-IN',{maximumFractionDigits:0})}</div></div>
    <div class="stat-card s-crit"><div class="sc-label">Critical Parts</div><div class="sc-value">${urgCounts.critical}</div><div class="sc-sub">Lead time &gt;60 days</div></div>
    <div class="stat-card" style="border-top:3px solid #8B0000"><div class="sc-label">Shortfall (250 sets)</div><div class="sc-value" style="color:#8B0000">${allInventory.filter(i=>i.shortfall250>0).length}</div><div class="sc-sub">Items in deficit</div></div>
    <div class="stat-card s-high"><div class="sc-label">Rejection Rate</div><div class="sc-value">${allProduction.length?(((allProduction.reduce((s,i)=>s+(i.lineRejection||0),0)/Math.max(1,allProduction.reduce((s,i)=>s+(i.lineIssue||0),0)))*100).toFixed(1))+'%':'—'}</div><div class="sc-sub">Line rejection</div></div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:18px">

    <!-- Urgency breakdown -->
    <div class="table-card">
      <div class="tc-header"><div class="tc-title">BOM Parts by Lead-Time Urgency</div></div>
      <div style="padding:20px 24px">
        ${['critical','high','medium','low'].map(urgBar).join('')}
      </div>
    </div>

    <!-- Stock status breakdown -->
    <div class="table-card">
      <div class="tc-header"><div class="tc-title">Inventory Stock Status</div></div>
      <div style="padding:20px 24px">
        ${Object.entries(ssCounts).length?Object.entries(ssCounts).sort((a,b)=>b[1]-a[1]).map(([s,c])=>{const tot=allInventory.length; const pct=Math.round((c/tot)*100); const col=s.toLowerCase().includes('out')?'var(--c-def)':s.toLowerCase().includes('low')?'var(--c-high)':s.toLowerCase().includes('ok')||s.toLowerCase().includes('suf')?'var(--c-ok)':'var(--gray-4)'; return`<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:12px;font-weight:600;color:${col}">${e(s)}</span><span style="font-family:var(--font-mono);font-size:12px">${c} (${pct}%)</span></div><div style="height:8px;background:var(--gray-2);overflow:hidden"><div style="height:100%;background:${col};width:${pct}%"></div></div></div>`;}).join(''):`<div style="color:var(--gray-4);font-size:13px;padding:12px 0">No inventory data loaded</div>`}
      </div>
    </div>

  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:18px">

    <!-- Top 10 critical parts -->
    <div class="table-card">
      <div class="tc-header"><div class="tc-title">Top 10 Longest Lead Times</div></div>
      <div style="overflow-x:auto">
        <table style="min-width:0;width:100%">
          <thead><tr>
            <th style="min-width:140px">Part Number</th>
            <th style="min-width:160px">Part Name</th>
            <th style="min-width:100px;text-align:right">Lead Time</th>
            <th style="min-width:100px">Urgency</th>
          </tr></thead>
          <tbody>
            ${topCrit.map(p=>`<tr>
              <td><span class="cell-pno">${e(p.partNumber)}</span></td>
              <td style="font-size:12px;font-weight:600;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e(p.partName)}</td>
              <td class="cell-num">${p.leadTimeDays} days</td>
              <td>${_urgBadge(p.urgency)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Top shortfall items -->
    <div class="table-card">
      <div class="tc-header"><div class="tc-title">Shortfall Items — 250 Sets</div></div>
      ${shItems.length?`<div style="overflow-x:auto"><table style="min-width:0;width:100%">
        <thead><tr>
          <th style="min-width:140px">Item Code</th>
          <th style="min-width:160px">Item Name</th>
          <th style="min-width:110px;text-align:right">Shortfall</th>
          <th style="min-width:100px">Status</th>
        </tr></thead>
        <tbody>
          ${shItems.map(i=>{const ss=i.stockStatus||''; const col=ss.toLowerCase().includes('out')?'var(--c-def)':ss.toLowerCase().includes('low')?'var(--c-high)':'var(--gray-5)'; return`<tr>
            <td><span class="cell-pno">${e(i.itemCode)}</span></td>
            <td style="font-size:12px;font-weight:600;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e(i.itemName)}</td>
            <td class="cell-num"><span style="color:var(--c-def);font-weight:700">${i.shortfall250}</span></td>
            <td><span style="font-size:11px;font-weight:600;color:${col}">${e(ss)||'—'}</span></td>
          </tr>`;}).join('')}
        </tbody>
      </table></div>`:`<div style="padding:24px 20px;color:var(--gray-4);font-size:13px">No shortfalls for 250 sets — inventory is sufficient</div>`}
    </div>

  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px">

    <!-- Top inventory value items -->
    <div class="table-card">
      <div class="tc-header"><div class="tc-title">Top 10 by Stock Value</div></div>
      ${topVal.length?`<div style="overflow-x:auto"><table style="min-width:0;width:100%">
        <thead><tr>
          <th style="min-width:140px">Item Code</th>
          <th style="min-width:160px">Item Name</th>
          <th style="min-width:130px;text-align:right">Stock Value</th>
          <th style="min-width:100px;text-align:right">Current Stock</th>
        </tr></thead>
        <tbody>
          ${topVal.map(i=>`<tr>
            <td><span class="cell-pno">${e(i.itemCode)}</span></td>
            <td style="font-size:12px;font-weight:600;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e(i.itemName)}</td>
            <td class="cell-num" style="font-weight:700;color:#0060A0">₹${i.balanceStockAmount.toLocaleString('en-IN',{maximumFractionDigits:0})}</td>
            <td class="cell-num">${i.currentStock}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>`:`<div style="padding:24px 20px;color:var(--gray-4);font-size:13px">No inventory data loaded</div>`}
    </div>

    <!-- Production rejection leaders -->
    <div class="table-card">
      <div class="tc-header"><div class="tc-title">Production — Rejection Leaders</div></div>
      ${topRej.length?`<div style="overflow-x:auto"><table style="min-width:0;width:100%">
        <thead><tr>
          <th style="min-width:140px">Item Code</th>
          <th style="min-width:160px">Item Name</th>
          <th style="min-width:100px;text-align:right">Issued</th>
          <th style="min-width:100px;text-align:right">Rejected</th>
          <th style="min-width:90px;text-align:right">Rate</th>
        </tr></thead>
        <tbody>
          ${topRej.map(i=>{const r=i.lineIssue>0?((i.lineRejection/i.lineIssue)*100).toFixed(1):0; const col=r>10?'var(--c-def)':r>5?'var(--c-high)':'var(--c-ok)'; return`<tr>
            <td><span class="cell-pno">${e(i.itemCode)}</span></td>
            <td style="font-size:12px;font-weight:600;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e(i.itemName)}</td>
            <td class="cell-num">${(i.lineIssue||0).toLocaleString('en-IN')}</td>
            <td class="cell-num" style="color:var(--c-def)">${(i.lineRejection||0).toLocaleString('en-IN')}</td>
            <td class="cell-num"><span style="font-weight:700;color:${col}">${r}%</span></td>
          </tr>`;}).join('')}
        </tbody>
      </table></div>`:`<div style="padding:24px 20px;color:var(--gray-4);font-size:13px">No production rejection data</div>`}
    </div>

  </div>`;
}

/* ═══ SHARED HELPERS ═════════════════════════════════ */
function _urgBadge(u){const l={critical:'Critical',high:'High',medium:'Medium',low:'Low'};return`<span class="urg urg-${u}"><span class="urg-dot"></span>${l[u]||u}</span>`;}
function _rwBadge(r){const v=String(r||'').trim();return(v==='Yes'||v==='YES'||v==='Y')?'<span class="tag tag-rw-yes">Required</span>':'<span class="tag tag-rw-no">—</span>';}
function _s(id,v){const el=document.getElementById(id);if(el)el.textContent=v;}
function e(str){return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}

/* ═══ CURRENCY / FX RATE ════════════════════════════ */

// Map: country → typical vendor currency
const _countryCurrency = {
  'china': 'USD', 'usa': 'USD', 'united states': 'USD', 'us': 'USD',
  'germany': 'EUR', 'france': 'EUR', 'italy': 'EUR', 'spain': 'EUR',
  'uk': 'GBP', 'united kingdom': 'GBP', 'britain': 'GBP',
  'japan': 'JPY', 'korea': 'KRW', 'south korea': 'KRW',
  'taiwan': 'TWD', 'singapore': 'SGD',
  'india': 'INR',
};

// Current FX override: { country, currency, rate }
let _fxOverride = null;

function showFxPanel() {
  const country = document.getElementById('filter-country').value;
  const panel   = document.getElementById('fx-panel');
  if (!panel) return;

  if (!country) {
    panel.classList.remove('visible');
    _fxOverride = null;
    renderBomTable();
    return;
  }

  // Detect currency: first from BOM parts data for that country, then from map
  const partsForCountry = allParts.filter(p =>
    (p.country || '').trim().toLowerCase() === country.trim().toLowerCase()
  );
  let currency = 'USD'; // default
  if (partsForCountry.length) {
    const c = partsForCountry.find(p => p.vendorCurrency && p.vendorCurrency !== 'INR');
    if (c) currency = c.vendorCurrency;
  } else {
    currency = _countryCurrency[country.toLowerCase()] || 'USD';
  }

  document.getElementById('fx-country-label').textContent = country;
  document.getElementById('fx-curr-label').textContent    = currency;
  document.getElementById('fx-affected').textContent      =
    `${partsForCountry.length} part${partsForCountry.length !== 1 ? 's' : ''} affected`;

  // Restore previously set rate if country is the same
  if (_fxOverride && _fxOverride.country === country) {
    document.getElementById('fx-rate').value = _fxOverride.rate;
  } else {
    document.getElementById('fx-rate').value = '';
    _fxOverride = null;
  }

  panel.classList.add('visible');
  if (currency === 'INR') {
    document.getElementById('fx-affected').textContent += ' (already in INR)';
  }
}

function applyFxRate() {
  const country  = document.getElementById('filter-country').value;
  const rate     = parseFloat(document.getElementById('fx-rate').value);
  const currency = document.getElementById('fx-curr-label').textContent;
  if (!country || !rate || rate <= 0) { _fxOverride = null; renderBomTable(); return; }
  _fxOverride = { country: country.trim().toLowerCase(), currency, rate };
  renderBomTable();
}

function clearFxRate() {
  document.getElementById('fx-rate').value = '';
  _fxOverride = null;
  renderBomTable();
  const panel = document.getElementById('fx-panel');
  if (panel) panel.classList.remove('visible');
}

// Returns converted cost — if this part's country matches FX override AND currency matches, apply rate
function _fxCost(p, fieldName) {
  const val = p[fieldName] || 0;
  if (!_fxOverride || !val) return val;
  const pCountry = (p.country || '').trim().toLowerCase();
  if (pCountry !== _fxOverride.country) return val;
  if (p.vendorCurrency === 'INR' || p.vendorCurrency === '') return val;
  if (p.vendorCurrency !== _fxOverride.currency) return val;
  // vendorUnitRate is in foreign currency — convert. Other ₹ fields scale proportionally.
  if (fieldName === 'vendorUnitRate') return val; // show original rate, calc total separately
  return val; // cost fields in BOM are usually already in INR; if yours are in foreign currency, adjust here
}

// Get display vendor rate with FX applied
function _fxVendorRate(p) {
  if (!p.vendorUnitRate) return null;
  if (_fxOverride) {
    const pCountry = (p.country || '').trim().toLowerCase();
    if (pCountry === _fxOverride.country && p.vendorCurrency !== 'INR') {
      return { rate: p.vendorUnitRate * _fxOverride.rate, currency: 'INR', converted: true };
    }
  }
  return { rate: p.vendorUnitRate, currency: p.vendorCurrency, converted: false };
}

// Is this part affected by current FX override?
function _isFxPart(p) {
  if (!_fxOverride) return false;
  return (p.country || '').trim().toLowerCase() === _fxOverride.country && p.vendorCurrency !== 'INR';
}

/* ═══ EXPORTS ════════════════════════════════════════ */

function exportBOM() {
  if (!filtered.length) { showToast('No BOM data to export', 'info'); return; }

  const fxNote = _fxOverride
    ? ` [FX: 1 ${_fxOverride.currency}=${_fxOverride.rate} INR for ${_fxOverride.country}]`
    : '';

  const data = filtered.map(p => {
    const fx = _fxVendorRate(p);
    const inrRate = fx ? (fx.converted ? fx.rate : (p.vendorCurrency === 'INR' ? p.vendorUnitRate : p.vendorUnitRate)) : 0;
    const calcUnitCost = (fx && fx.converted) ? (p.qty * inrRate) : p.totalUnitCost;

    return {
      'Part Number':       p.partNumber,
      'Part Name':         p.partName,
      'Description':       p.partDesc,
      'HSN Code':          p.hsnCode,
      'Part Type':         p.partType,
      'Rework Required':   p.reworkRequired,
      'Material':          p.material,
      'Quantity':          p.qty,
      'UOM':               p.uom,
      'Vendor Currency':   p.vendorCurrency,
      [`Vendor Rate (${fx?.converted ? 'INR conv.' : p.vendorCurrency})`]: fx ? fx.rate.toFixed(2) : '',
      'O2C Unit Cost (₹)': fx?.converted ? calcUnitCost.toFixed(2) : p.totalUnitCost,
      'Custom Duty (₹)':   p.customDuty,
      'Surcharge %':       p.surchargePercent,
      'Duty %':            p.dutyPercent,
      'Total Freight (₹)': p.totalFreight,
      'Landed Cost/Unit (₹)': p.landedCost,
      'Supplier':          p.supplierName,
      'Country':           p.country,
      'Lead Time (days)':  p.leadTimeDays,
      'Urgency':           p.urgency,
      'Sub-Assemblies':    (p.subAssemblies || []).map(s => `${s.id}(${s.qty})`).join(', '),
      'Individual Qty':    p.individualQty,
    };
  });

  const ws = XLSX.utils.json_to_sheet(data);
  // Auto column widths
  const cols = Object.keys(data[0] || {});
  ws['!cols'] = cols.map(k => ({ wch: Math.min(40, Math.max(k.length + 2, 12)) }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'BOM Parts');
  XLSX.writeFile(wb, `On2Cook_BOM${fxNote.replace(/[\[\]:*?/\\]/g,'_')}.xlsx`);
  showToast(`✓ Exported ${filtered.length} BOM parts`, 'success');
}

function exportInventory() {
  const src = (() => {
    let d = allInventory;
    if (invSearch)       d = d.filter(i => (i.itemCode+' '+i.itemName).toLowerCase().includes(invSearch));
    if (invStatusFilter) d = d.filter(i => i.stockStatus === invStatusFilter);
    return d;
  })();
  if (!src.length) { showToast('No inventory data to export', 'info'); return; }

  const data = src.map(i => ({
    'Item Code':                i.itemCode,
    'Item Name':                i.itemName,
    'Per Unit Qty':             i.perUnitQty,
    'Opening Stock':            i.openingStock,
    'Current Stock':            i.currentStock,
    'Line Stock':               i.lineStock,
    'Set Produce - Old Part':   i.setProdOldPart,
    'Set Produce - New Part':   i.setProdNewPart,
    'New Parts':                i.newParts,
    'Stock at Antunes':         i.stockAntunes,
    'Stock Sent to Dubai':      i.stockSentDubai,
    'Stock to Receive - Dubai': i.stockReceiveDubai,
    'Bal Line Stock 1F':        i.balanceLineStock1F,
    'Stock 1F & Store':         i.stock1FAndStore,
    'Bal after 220 Sets':       i.balanceAfter220Sets,
    'Lead Time':                i.leadTime,
    'Reorder Point':            i.reorderPoint,
    'Stock Status':             i.stockStatus,
    'Bal after 220 Qty':        i.balanceAfter220Qty,
    'Remark':                   i.remark,
    'ETA':                      i.eta,
    'Material Status':          i.materialStatus,
    'Material Comments':        i.materialComments,
    'Shortfall - 100 Sets':     i.shortfall100,
    'Shortfall - 250 Sets':     i.shortfall250,
    'Shortfall - 350 Sets':     i.shortfall350,
    'Cost per Pcs (₹)':        i.costPerPcs,
    'Balance Stock Amount (₹)': i.balanceStockAmount,
    'Remarks':                  i.remarks,
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = Object.keys(data[0] || {}).map(k => ({ wch: Math.min(36, Math.max(k.length + 2, 12)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Store Inventory');
  XLSX.writeFile(wb, 'On2Cook_Store_Inventory.xlsx');
  showToast(`✓ Exported ${src.length} inventory items`, 'success');
}

function exportProductionLine() {
  const src = (() => {
    let d = allProduction;
    if (prodSearch) d = d.filter(i => (i.itemCode+' '+i.itemName).toLowerCase().includes(prodSearch));
    return d;
  })();
  if (!src.length) { showToast('No production data to export', 'info'); return; }

  const data = src.map(i => ({
    'Item Code':       i.itemCode,
    'Item Name':       i.itemName,
    'Per Unit Qty':    i.perUnitQty,
    'Location':        i.stockLocation,
    'Line Issue':      i.lineIssue,
    'Line Rejection':  i.lineRejection,
    'Net Consumed':    i.netConsumption,
    'Rejection %':     i.lineIssue > 0 ? ((i.lineRejection / i.lineIssue) * 100).toFixed(1) + '%' : '0%',
  }));

  const totalIssued    = src.reduce((s, i) => s + (i.lineIssue     || 0), 0);
  const totalRejected  = src.reduce((s, i) => s + (i.lineRejection || 0), 0);

  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = Object.keys(data[0] || {}).map(k => ({ wch: Math.min(32, Math.max(k.length + 2, 12)) }));

  // Add summary row at bottom
  XLSX.utils.sheet_add_aoa(ws, [
    [],
    ['TOTAL', '', '', '', totalIssued, totalRejected, totalIssued - totalRejected,
     totalIssued > 0 ? ((totalRejected / totalIssued) * 100).toFixed(1) + '%' : '0%'],
  ], { origin: -1 });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Production Line');
  XLSX.writeFile(wb, 'On2Cook_Production_Line.xlsx');
  showToast(`✓ Exported ${src.length} production items`, 'success');
}