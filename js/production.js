/**
 * production.js — Production Planning tab
 * Uses: allParts (camelCase), allInventory (camelCase), allProduction (camelCase)
 */

let _plan = [];

async function runFeasibility() {
  const units = parseInt(document.getElementById('prod-units').value) || 250;
  const area  = document.getElementById('prod-content-area');

  if (!allParts.length) {
    area.innerHTML = _n('🏭','No BOM Data','Upload the BOM file first');
    document.getElementById('feas-banner').style.display = 'none';
    document.getElementById('inv-value-card').style.display = 'none';
    return;
  }

  // Use in-memory data (already loaded by app.js on init)
  // Re-fetch from database to get latest
  let invMap = {}, prodMap = {}, invLoaded = false, prodLoaded = false;
  try {
    const invRows = allInventory.length ? allInventory : await BomDB.getAll('store_inventory');
    if (invRows.length) { invLoaded=true; invRows.forEach(r=>{ invMap[r.itemCode]=r; }); }
    const pRows = allProduction.length ? allProduction : await BomDB.getAll('production_line');
    if (pRows.length) { prodLoaded=true; pRows.forEach(r=>{ prodMap[r.itemCode]=r; }); }
  } catch(e) { console.warn('Feasibility data load:', e); }

  updateInventoryStatus(allInventory);
  updateProductionStatus(allProduction);

  _plan = allParts.map(p => {
    const pn = p.partNumber;
    const bomQtyUnit = p.qty || 0;
    const required   = bomQtyUnit * units;

    const inv  = invMap[pn]  || null;
    const prod = prodMap[pn] || null;

    const currentStock  = inv  ? (Number(inv.currentStock)   || 0) : null;
    const lineIssue     = prod ? (Number(prod.lineIssue)     || 0) : 0;
    const lineRejection = prod ? (Number(prod.lineRejection) || 0) : 0;
    const netConsumed   = lineIssue - lineRejection;
    const effectiveAvail = currentStock !== null ? (currentStock - netConsumed) : null;
    const gap            = effectiveAvail !== null ? (effectiveAvail - required) : null;

    const landedCost = p.landedCost || 0;
    const stockValue = currentStock !== null ? currentStock * landedCost : null;

    let status='unknown', action=null;
    if (invLoaded && effectiveAvail !== null) {
      if      (gap >  0) { status='excess';  action=`Return ${gap} to store`; }
      else if (gap === 0) { status='exact';   action='Exact — use all'; }
      else                { status='deficit'; action=`Procure / Borrow ${Math.abs(gap)}`; }
    }

    return {
      partNumber: pn, partName: p.partName, uom: p.uom||'PCS',
      bomQtyUnit, required, currentStock, lineIssue, lineRejection,
      netConsumed, effectiveAvail, gap, status, action,
      landedCost, stockValue,
      reorderPoint: inv?.reorderPoint ?? null,
      stockStatus:  inv?.stockStatus  ?? '',
      leadTime:     inv?.leadTime     ?? '',
      location:     prod?.stockLocation ?? '',
      shortfall250: inv?.shortfall250 ?? null,
    };
  });

  _banner(units, invLoaded);
  _valueCard(invLoaded);
  _table(units, invLoaded, prodLoaded);
}

function _banner(units, invLoaded) {
  const b=document.getElementById('feas-banner');
  b.style.display='flex'; b.style.flexDirection='column';
  const ok =_plan.filter(r=>r.status==='exact'||r.status==='excess').length;
  const exc=_plan.filter(r=>r.status==='excess').length;
  const def=_plan.filter(r=>r.status==='deficit').length;
  const ok2=invLoaded&&def===0;
  if(!invLoaded){
    _st('feas-icon','📦'); _st('feas-verdict','INVENTORY NEEDED');
    _st('feas-sub',`Required quantities for ${units} units calculated`);
    _st('feas-ok','—');_st('feas-exc','—');_st('feas-def','—');
    document.getElementById('feas-verdict').className='feas-verdict';
  } else {
    _st('feas-icon',ok2?'✅':'❌');
    _st('feas-verdict',ok2?'FEASIBLE':'NOT FEASIBLE');
    _st('feas-sub',`${units} units · ${def} part${def!==1?'s':''} in deficit`);
    _st('feas-ok',ok); _st('feas-exc',exc); _st('feas-def',def);
    document.getElementById('feas-verdict').className='feas-verdict '+(ok2?'yes':'no');
  }
}

function _valueCard(invLoaded) {
  const card=document.getElementById('inv-value-card'); if(!card)return;
  if(!invLoaded){card.style.display='none';return;}
  const total=_plan.reduce((s,r)=>s+(r.stockValue||0),0);
  const matched=_plan.filter(r=>r.stockValue!==null).length;
  card.style.display='block';
  _st('inv-value-total','₹'+total.toLocaleString('en-IN',{maximumFractionDigits:0}));
  _st('inv-value-sub',`${matched} of ${_plan.length} parts matched with landed cost`);
}

function _table(units, invLoaded, prodLoaded) {
  const area=document.getElementById('prod-content-area'); if(!area)return;
  if(!_plan.length){area.innerHTML=_n('🏭','No Data','Load BOM first');return;}

  const warn=(!invLoaded||!prodLoaded)?`<div style="background:#FFFBEA;border:1px solid #FFE97A;padding:11px 16px;margin-bottom:14px;font-size:12px;display:flex;gap:10px;align-items:flex-start">
    <span style="font-size:16px;flex-shrink:0">⚠️</span>
    <span>${!invLoaded?'<strong>Store Inventory not loaded</strong> — In Store / Gap / Status columns show "—". ':''} ${!prodLoaded?'<strong>Production Line not loaded</strong> — Line Issue / Rejection show 0. ':''} Open admin (tap logo 5×) to upload.</span></div>`:'';

  const rows=_plan.map(r=>{
    const no=v=>`<span class="no-inv">${v}</span>`;
    const cs=r.currentStock!==null?r.currentStock:no('—');
    const ea=r.effectiveAvail!==null?r.effectiveAvail:no('—');
    const li=prodLoaded?r.lineIssue:no('—');
    const lr=prodLoaded?r.lineRejection:no('—');
    const gapH=r.gap!==null?(r.gap>0?`<span style="color:var(--c-exc);font-weight:700;font-family:var(--font-mono)">+${r.gap}</span>`:r.gap<0?`<span style="color:var(--c-def);font-weight:700;font-family:var(--font-mono)">${r.gap}</span>`:`<span style="color:var(--c-ok);font-weight:700;font-family:var(--font-mono)">0</span>`):no('—');
    const sb=r.status==='excess'?`<span class="status-exc"><span class="status-dot"></span>EXCESS</span>`:r.status==='deficit'?`<span class="status-def"><span class="status-dot"></span>DEFICIT</span>`:r.status==='exact'?`<span class="status-ok"><span class="status-dot"></span>EXACT</span>`:no('—');
    const ah=r.status==='excess'?`<span class="action-pill action-return">↩ ${r.action}</span>`:r.status==='deficit'?`<span class="action-pill action-borrow">⬆ ${r.action}</span>`:r.status==='exact'?`<span class="action-pill action-exact">✓ ${r.action}</span>`:no('—');
    const vH=r.stockValue!==null?`<span style="font-family:var(--font-mono);font-size:11px">₹${r.stockValue.toLocaleString('en-IN',{maximumFractionDigits:0})}</span>`:no('—');
    const ssColor=(r.stockStatus||'').toLowerCase().includes('out')?'var(--c-def)':(r.stockStatus||'').toLowerCase().includes('low')?'var(--c-high)':'var(--c-ok)';
    const sf250=r.shortfall250!==null&&r.shortfall250>0?`<span style="color:var(--c-def);font-weight:700;font-family:var(--font-mono)">${r.shortfall250}</span>`:no('—');
    return `<tr data-pstatus="${r.status}">
      <td><span class="cell-pno">${_e(r.partNumber)}</span></td>
      <td style="font-weight:600;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${_e(r.partName)}">${_e(r.partName)}</td>
      <td class="cell-num" style="font-family:var(--font-mono);font-size:11.5px">${r.bomQtyUnit}</td>
      <td class="cell-num" style="font-family:var(--font-mono);font-weight:700">${r.required}</td>
      <td class="cell-num" style="font-family:var(--font-mono)">${cs}</td>
      <td class="cell-num" style="font-family:var(--font-mono)">${li}</td>
      <td class="cell-num" style="font-family:var(--font-mono)">${lr}</td>
      <td class="cell-num" style="font-family:var(--font-mono);font-weight:700">${ea}</td>
      <td style="text-align:right">${gapH}</td>
      <td>${sb}</td>
      <td>${ah}</td>
      <td>${sf250}</td>
      <td><span style="font-size:11px;font-weight:600;color:${ssColor}">${_e(r.stockStatus)||'—'}</span></td>
      <td>${vH}</td>
      <td style="font-family:var(--font-mono);font-size:11px;color:var(--gray-5)">${_e(r.location)||'—'}</td>
    </tr>`;
  }).join('');

  area.innerHTML=warn+`<div class="prod-table-card">
    <div class="tc-header"><div class="tc-title">Production Plan — ${units} Units</div><div class="tc-meta">${_plan.length} parts</div></div>
    <div class="prod-tbl-scroll"><table class="prod-tbl">
      <thead><tr>
        <th style="min-width:145px">Part Number</th>
        <th style="min-width:170px">Part Name</th>
        <th style="min-width:80px;text-align:right">BOM Qty<br><span style="font-size:9px;opacity:.6">per unit</span></th>
        <th style="min-width:100px;text-align:right">Required<br><span style="font-size:9px;opacity:.6">for ${units} units</span></th>
        <th style="min-width:110px;text-align:right">Current Stock</th>
        <th style="min-width:90px;text-align:right">Line Issue</th>
        <th style="min-width:90px;text-align:right">Rejection</th>
        <th style="min-width:120px;text-align:right">Effective Avail<br><span style="font-size:9px;opacity:.6">stock − net consumed</span></th>
        <th style="min-width:80px;text-align:right">Gap</th>
        <th style="min-width:110px">Status</th>
        <th style="min-width:190px">Action</th>
        <th style="min-width:110px;text-align:right">Shortfall 250</th>
        <th style="min-width:110px">Stock Status</th>
        <th style="min-width:120px;text-align:right">Stock Value</th>
        <th style="min-width:120px">Location</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </div>`;
}

function exportProdPlan() {
  if(!_plan.length){showToast('Run feasibility check first','info');return;}
  const units=parseInt(document.getElementById('prod-units').value)||250;
  const data=_plan.map(r=>({'Part Number':r.partNumber,'Part Name':r.partName,'UOM':r.uom,'BOM Qty (per unit)':r.bomQtyUnit,[`Required (${units}u)`]:r.required,'Current Stock':r.currentStock??'','Line Issue':r.lineIssue,'Line Rejection':r.lineRejection,'Net Consumed':r.netConsumed,'Effective Available':r.effectiveAvail??'','Gap':r.gap??'','Status':r.status.toUpperCase(),'Action':r.action||'','Shortfall 250 Sets':r.shortfall250??'','Stock Status':r.stockStatus||'','Stock Value (₹)':r.stockValue??'','Location':r.location||''}));
  const ws=XLSX.utils.json_to_sheet(data); const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,`Plan_${units}u`);
  XLSX.writeFile(wb,`On2Cook_Prod_Plan_${units}units.xlsx`);
  showToast('Plan exported','success');
}

function _n(icon,title,sub){return`<div class="prod-notice"><div class="prod-notice-icon">${icon}</div><div class="prod-notice-title">${title}</div><div class="prod-notice-sub">${sub}</div></div>`;}
function _st(id,v){const el=document.getElementById(id);if(el)el.textContent=v;}
function _e(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}