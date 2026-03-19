/**
 * upload.js — Admin panel, PIN, Excel parsers for BOM / Inventory / Production
 *
 * SECRET ADMIN ACCESS : click the "O2" logo 5 times within 3 seconds
 * Default PIN         : 2580  (change ADMIN_PIN constant below)
 */
/**
 * upload.js — Admin panel · PIN · Excel parsers
 * Secret access: click "O2" logo 5× in 3 seconds
 * Default PIN: 2580
 */

const ADMIN_PIN = '2580';

/* ─── Column finder (exact → starts-with → contains) ── */
function _norm(s) {
  return String(s || '').trim().toLowerCase().replace(/[\s_\-\(\)\/\|&]+/g, '');
}
function _fc(row, ...cands) {
  const keys = Object.keys(row);
  for (const c of cands) { const n=_norm(c); const f=keys.find(k=>_norm(k)===n); if(f) return f; }
  for (const c of cands) { const n=_norm(c); const f=keys.find(k=>_norm(k).startsWith(n)); if(f) return f; }
  for (const c of cands) { const n=_norm(c); if(n.length>=5){ const f=keys.find(k=>_norm(k).includes(n)); if(f) return f; } }
  return null;
}

/* ─── Logo tap (5× = admin) ──────────────────────────── */
let _tc=0,_tt=null;
document.getElementById('logo-block').addEventListener('click', ()=>{
  _tc++;
  const el=document.getElementById('logo-block');
  el.classList.add('tap-flash'); setTimeout(()=>el.classList.remove('tap-flash'),250);
  clearTimeout(_tt); _tt=setTimeout(()=>{_tc=0;},3000);
  if(_tc>=5){_tc=0;clearTimeout(_tt);openAdmin();}
});

/* ─── Admin overlay ──────────────────────────────────── */
function openAdmin()  { _pinReset(); document.getElementById('admin-overlay').classList.add('open'); }
function closeAdmin() { document.getElementById('admin-overlay').classList.remove('open'); }
function handleAdminOverlayClick(e){ if(e.target.id==='admin-overlay') closeAdmin(); }

/* ─── PIN ─────────────────────────────────────────────── */
let _pin='';
function pinKey(d){ if(_pin.length>=4) return; _pin+=d; _dd(); if(_pin.length===4) setTimeout(_cp,180); }
function pinDel()  { _pin=_pin.slice(0,-1); _dd(); }
function pinClear(){ _pin=''; _dd(); _pe(''); }
function _pinReset(){ _pin=''; _dd(); _pe(''); _showPin(); }
function _dd(){ for(let i=0;i<4;i++) document.getElementById('pd'+i).classList.toggle('filled',i<_pin.length); }
function _pe(m){ document.getElementById('pin-error').textContent=m; }
function _cp(){
  if(_pin===ADMIN_PIN){ _pe(''); _showBody(); adminRefreshStats(); }
  else{
    _pe('Incorrect PIN — try again'); _pin=''; _dd();
    const d=document.getElementById('pin-dots');
    d.style.animation='none'; d.offsetHeight; d.style.animation='shake .3s ease';
    setTimeout(()=>{d.style.animation='';},400);
  }
}
function _showPin()  { document.getElementById('pin-screen').style.display='block'; document.getElementById('admin-body').classList.remove('visible'); }
function _showBody() { document.getElementById('pin-screen').style.display='none';  document.getElementById('admin-body').classList.add('visible'); }
const _ks=document.createElement('style');
_ks.textContent='@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}';
document.head.appendChild(_ks);

/* ─── Admin stats ─────────────────────────────────────── */
async function adminRefreshStats(){
  try{
    const [bC,iC,pC,bM,iM,pM,sM]=await Promise.all([
      BomDB.count('bom_parts'), BomDB.count('store_inventory'),
      BomDB.count('production_line'), BomDB.getMeta('bom_uploaded_at'),
      BomDB.getMeta('inv_uploaded_at'), BomDB.getMeta('prod_uploaded_at'),
      BomDB.getMeta('bom_sa_count'),
    ]);
    _s('adb-parts',bC||'—'); _s('adb-inv',iC||'—'); _s('adb-prod',pC||'—'); _s('adb-sa',sM?sM.value:'—');
    _s('adb-bom-ts',  bM?_fmtTs(bM.updated_at||bM.ts):'Not loaded');
    _s('adb-inv-ts',  iM?_fmtTs(iM.updated_at||iM.ts):'Not loaded');
    _s('adb-prod-ts', pM?_fmtTs(pM.updated_at||pM.ts):'Not loaded');
    _s('adb-sa-ts',   bM?_fmtTs(bM.updated_at||bM.ts):'—');
    if(bC>0&&bM){_show('uc-bom-ok');  _s('uc-bom-ts', _fmtTs(bM.updated_at||bM.ts));}
    if(iC>0&&iM){_show('uc-inv-ok');  _s('uc-inv-ts', _fmtTs(iM.updated_at||iM.ts));}
    if(pC>0&&pM){_show('uc-prod-ok'); _s('uc-prod-ts',_fmtTs(pM.updated_at||pM.ts));}
  }catch(e){console.warn('adminRefreshStats:',e);}
}

async function adminClearAll(){
  if(!confirm('Clear ALL data from Supabase? Cannot be undone.')) return;
  try{
    await BomDB.clearAll(); showToast('All data cleared','info');
    adminRefreshStats(); loadPartsData([]); loadInventoryData([]); loadProductionData([]);
  }catch(e){showToast('Error: '+e.message,'error');}
}

/* ─── Drag/drop/select ───────────────────────────────── */
function ucDragOver(e,t) { e.preventDefault(); document.getElementById('uc-'+t).classList.add('dragover'); }
function ucDragLeave(t)  { document.getElementById('uc-'+t).classList.remove('dragover'); }
function ucDrop(e,t)     { e.preventDefault(); ucDragLeave(t); const f=e.dataTransfer.files[0]; if(f)_proc(f,t); }
function ucSelect(e,t)   { const f=e.target.files[0]; if(f)_proc(f,t); }
function _mode()         { return (document.getElementById('upload-mode')||{}).value||'replace'; }

/* ─── File processor ─────────────────────────────────── */
async function _proc(file,type){
  if(typeof XLSX==='undefined'){ showToast('XLSX library not loaded — place js/xlsx.min.js in js/ folder','error'); return; }
  if(!['xlsx','xls'].includes(file.name.split('.').pop().toLowerCase())){ showToast('Upload .xlsx or .xls only','error'); return; }
  _pg(`Reading "${file.name}"…`);
  const reader=new FileReader();
  reader.onerror=()=>{ showToast('Could not read file','error'); _hp(); };
  reader.onload=async(e)=>{
    try{
      const wb=XLSX.read(new Uint8Array(e.target.result),{type:'array',cellDates:true});
      const mode=_mode();
      if(type==='bom'){
        _pg('Parsing BOM…');
        const parts=_parseBOM(wb); if(!parts.length){showToast('No parts found','error');_hp();return;}
        _pg(`Saving ${parts.length} parts to Supabase…`);
        mode==='replace'?await BomDB.clearAndInsert('bom_parts',parts):await BomDB.putAll('bom_parts',parts);
        const saSet=new Set(); parts.forEach(p=>(p.subAssemblies||[]).forEach(s=>saSet.add(s.id)));
        await BomDB.setMeta('bom_uploaded_at',new Date().toISOString());
        await BomDB.setMeta('bom_sa_count',saSet.size);
        _hp(); adminRefreshStats(); loadPartsData(parts);
        showToast(`✓ BOM saved — ${parts.length} parts (${mode})`,'success');
      } else if(type==='inv'){
        _pg('Parsing inventory…');
        const inv=_parseInv(wb); if(!inv.length){showToast('No inventory rows found — check console for column log','error');_hp();return;}
        _pg(`Saving ${inv.length} items to Supabase…`);
        mode==='replace'?await BomDB.clearAndInsert('store_inventory',inv):await BomDB.putAll('store_inventory',inv);
        await BomDB.setMeta('inv_uploaded_at',new Date().toISOString());
        _hp(); adminRefreshStats(); loadInventoryData(inv);
        showToast(`✓ Inventory saved — ${inv.length} items (${mode})`,'success');
      } else if(type==='prod'){
        _pg('Parsing production line…');
        const prod=_parseProd(wb); if(!prod.length){showToast('No production rows found','error');_hp();return;}
        _pg(`Saving ${prod.length} items to Supabase…`);
        mode==='replace'?await BomDB.clearAndInsert('production_line',prod):await BomDB.putAll('production_line',prod);
        await BomDB.setMeta('prod_uploaded_at',new Date().toISOString());
        _hp(); adminRefreshStats(); loadProductionData(prod);
        showToast(`✓ Production line saved — ${prod.length} items (${mode})`,'success');
      }
    }catch(err){console.error('Upload error:',err); showToast('Error: '+err.message,'error'); _hp();}
  };
  reader.readAsArrayBuffer(file);
}

/* ─── BOM parser ─────────────────────────────────────── */
function _parseBOM(wb){
  const sheets=wb.SheetNames; if(!sheets.length) return [];
  const masterRows=XLSX.utils.sheet_to_json(wb.Sheets[sheets[0]],{defval:''});
  const s0=masterRows[0]||{};
  const mPN=_fc(s0,'part number','partno'); const mNm=_fc(s0,'part name','name'); const mQty=_fc(s0,'quantity','qty');
  const masterMap={};
  masterRows.forEach(row=>{ const pn=mPN?String(row[mPN]||'').trim():''; if(!pn)return; masterMap[pn]={partNumber:pn,partName:mNm?String(row[mNm]||'').trim():pn,qty:mQty?(parseFloat(row[mQty])||0):0}; });

  const saData={};
  for(let i=1;i<sheets.length;i++){
    const saId=sheets[i].trim(); const saRows=XLSX.utils.sheet_to_json(wb.Sheets[saId],{defval:''}); if(!saRows.length) continue;
    const sr=saRows[0]; const c=(...a)=>_fc(sr,...a);
    const col={pn:c('part number','partno'),nm:c('part name','name'),desc:c('part description','description'),hsn:c('hsn code','hsn'),type:c('part type','type'),rework:c('rework required','rework'),mtl:c('material of construction','material'),qty:c('quantity','qty'),uom:c('unit of measurement','uom','unit'),curr:c('currency','vendor currency'),rate:c('vendor rate','unit rate','vendor unit rate'),cost:c('total unit cost','o2c unit cost'),duty:c('custom duty','duty'),surch:c('surcharge %','surcharge'),dutyp:c('duty %','duty percent'),freight:c('total freight','freight'),landed:c('total unit landed cost','landed cost'),supp:c('supplier name','supplier'),ctry:c('country'),lead:c('lead time','leadtime')};
    saData[saId]=saRows.map(row=>{ const pn=col.pn?String(row[col.pn]||'').trim():''; if(!pn)return null; const g=(k,d='')=>col[k]?(typeof d==='number'?(parseFloat(row[col[k]])||0):String(row[col[k]]||'').trim()):d; return{partNumber:pn,partName:g('nm'),partDesc:g('desc'),hsnCode:g('hsn'),partType:g('type'),reworkRequired:g('rework')||'No',material:g('mtl'),qty:g('qty',0),uom:g('uom')||'PCS',vendorCurrency:g('curr')||'INR',vendorUnitRate:g('rate',0),totalUnitCost:g('cost',0),customDuty:g('duty',0),surchargePercent:g('surch',0),dutyPercent:g('dutyp',0),totalFreight:g('freight',0),landedCost:g('landed',0),supplierName:g('supp'),country:g('ctry'),leadTimeDays:g('lead',0)};}).filter(Boolean);
  }
  const blank=()=>({partDesc:'',hsnCode:'',partType:'',reworkRequired:'No',material:'',vendorCurrency:'INR',vendorUnitRate:0,totalUnitCost:0,customDuty:0,surchargePercent:0,dutyPercent:0,totalFreight:0,landedCost:0,supplierName:'',country:'',leadTimeDays:0,subAssemblies:[],individualQty:0});
  const pm={};
  Object.values(masterMap).forEach(m=>{pm[m.partNumber]=Object.assign(blank(),m);});
  Object.entries(saData).forEach(([saId,rows])=>{rows.forEach(row=>{if(!pm[row.partNumber])pm[row.partNumber]=Object.assign(blank(),{partNumber:row.partNumber,partName:row.partName||row.partNumber,qty:0}); const p=pm[row.partNumber]; ['partName','partDesc','hsnCode','partType','reworkRequired','material','vendorCurrency','vendorUnitRate','totalUnitCost','customDuty','surchargePercent','dutyPercent','totalFreight','landedCost','supplierName','country','leadTimeDays'].forEach(f=>{if(!p[f]&&row[f])p[f]=row[f];}); p.subAssemblies.push({id:saId,name:saId,qty:row.qty});});});
  return Object.values(pm).map(p=>{const st=p.subAssemblies.reduce((s,sa)=>s+sa.qty,0); p.individualQty=Math.max(0,(p.qty||0)-st); p.urgency=_urg(p.leadTimeDays||0); return p;});
}

/* ─── Inventory parser (your actual columns) ─────────── */
function _parseInv(wb){
  const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''}); if(!rows.length) return [];
  const sr=rows[0]; const fc=(...a)=>_fc(sr,...a);
  const cols={
    itemCode:fc('item code','itemcode','part number','partno'),
    itemName:fc('item name','itemname','part name','name'),
    perUnitQty:fc('per unit qty','perunitqty','per unit'),
    openingStock:fc('opening stock','openingstock'),
    currentStock:fc('current stock','currentstock'),
    lineStock:fc('line stock','linestock'),
    setProdOldPart:fc('old part'),
    setProdNewPart:fc('new part'),
    newParts:fc('new parts','newparts'),
    stockAntunes:fc('stock at antunes','antunes'),
    stockSentDubai:fc('stock sent to dubai','sent to dubai'),
    stockReceiveDubai:fc('stock to be received','to be received'),
    balanceLineStock1F:fc('balance line stock in 1st','balance line stock'),
    stock1FAndStore:fc('stock at 1st floor','1st floor'),
    balanceAfter220Sets:fc('balance stock after issuing 220','balance stock after'),
    leadTime:fc('lead time','leadtime'),
    reorderPoint:fc('reorder point','reorderpoint'),
    stockStatus:fc('stock status','stockstatus'),
    balanceAfter220Qty:fc('balance after 220 qty','balance after 220'),
    remark:fc('remark'),
    eta:fc('eta'),
    materialStatus:fc('material status','materialstatus'),
    materialComments:fc('material received comments','material received'),
    shortfall100:fc('shortfall for 100','shortfall100'),
    shortfall350:fc('shortfall for 350','shortfall350'),
    shortfall250:fc('shortfall for 250','shortfall250'),
    costPerPcs:fc('cost per pcs','costperpcs'),
    balanceStockAmount:fc('balance stock amount'),
    remarks:fc('remarks'),
  };
  console.group('Inventory column detection'); Object.entries(cols).forEach(([k,v])=>console.log(k.padEnd(22),'→',v||'⚠ NOT FOUND')); console.groupEnd();
  const gn=(row,k)=>cols[k]?(parseFloat(row[cols[k]])||0):0;
  const gs=(row,k)=>cols[k]?String(row[cols[k]]||'').trim():'';
  const parsed=rows.map(row=>{ const code=cols.itemCode?String(row[cols.itemCode]||'').trim():''; if(!code)return null; return{itemCode:code,itemName:gs(row,'itemName'),perUnitQty:gn(row,'perUnitQty'),openingStock:gn(row,'openingStock'),currentStock:gn(row,'currentStock'),lineStock:gn(row,'lineStock'),setProdOldPart:gs(row,'setProdOldPart'),setProdNewPart:gs(row,'setProdNewPart'),newParts:gs(row,'newParts'),stockAntunes:gn(row,'stockAntunes'),stockSentDubai:gn(row,'stockSentDubai'),stockReceiveDubai:gn(row,'stockReceiveDubai'),balanceLineStock1F:gn(row,'balanceLineStock1F'),stock1FAndStore:gn(row,'stock1FAndStore'),balanceAfter220Sets:gn(row,'balanceAfter220Sets'),leadTime:gs(row,'leadTime'),reorderPoint:gn(row,'reorderPoint'),stockStatus:gs(row,'stockStatus'),balanceAfter220Qty:gn(row,'balanceAfter220Qty'),remark:gs(row,'remark'),eta:gs(row,'eta'),materialStatus:gs(row,'materialStatus'),materialComments:gs(row,'materialComments'),shortfall100:gn(row,'shortfall100'),shortfall350:gn(row,'shortfall350'),shortfall250:gn(row,'shortfall250'),costPerPcs:gn(row,'costPerPcs'),balanceStockAmount:gn(row,'balanceStockAmount'),remarks:gs(row,'remarks')};}).filter(Boolean);
  console.log(`Inventory parsed: ${parsed.length} rows`); return parsed;
}

/* ─── Production parser ──────────────────────────────── */
function _parseProd(wb){
  const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''}); if(!rows.length) return [];
  const sr=rows[0]; const fc=(...a)=>_fc(sr,...a);
  const cols={itemCode:fc('item code','itemcode','part number','partno'),itemName:fc('item name','itemname','part name','name'),perUnitQty:fc('per unit qty','perunitqty','per unit'),stockLocation:fc('location','stock location','loc'),lineIssue:fc('line issue','lineissue','issued','issue'),lineRejection:fc('line rejection','linerejection','rejection','rejected')};
  console.log('Production columns detected:',cols);
  return rows.map(row=>{ const code=cols.itemCode?String(row[cols.itemCode]||'').trim():''; if(!code)return null; const gn=k=>cols[k]?(parseFloat(row[cols[k]])||0):0; const gs=k=>cols[k]?String(row[cols[k]]||'').trim():''; const li=gn('lineIssue'),lr=gn('lineRejection'); return{itemCode:code,itemName:gs('itemName'),perUnitQty:gn('perUnitQty'),stockLocation:gs('stockLocation'),lineIssue:li,lineRejection:lr,netConsumption:li-lr};}).filter(Boolean);
}

/* ─── Status pills ───────────────────────────────────── */
function updateInventoryStatus(items){ const p=document.getElementById('inv-pill'),t=document.getElementById('inv-pill-text'); if(!p)return; if(items&&items.length){p.className='inv-pill loaded';t.textContent=`${items.length} items`;}else{p.className='inv-pill not-loaded';t.textContent='Not loaded';} }
function updateProductionStatus(items){ const p=document.getElementById('prod-pill'),t=document.getElementById('prod-pill-text'); if(!p)return; if(items&&items.length){p.className='inv-pill loaded';t.textContent=`${items.length} items`;}else{p.className='inv-pill not-loaded';t.textContent='Not loaded';} }

/* ─── Progress ───────────────────────────────────────── */
function _pg(m){ document.getElementById('prog-wrap').classList.add('visible'); _pl(m); }
function _hp()  { document.getElementById('prog-wrap').classList.remove('visible'); }
function _pl(m) { document.getElementById('prog-label').textContent=m; }

/* ─── Helpers ────────────────────────────────────────── */
function _urg(d){ return d>60?'critical':d>30?'high':d>13?'medium':'low'; }
function _fmtTs(v){ if(!v)return'—'; const d=new Date(typeof v==='number'?v:v); return d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})+' '+d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}); }
function _s(id,v){ const e=document.getElementById(id); if(e)e.textContent=v; }
function _show(id){ const e=document.getElementById(id); if(e)e.style.display='block'; }

/* ─── Toast ──────────────────────────────────────────── */
function showToast(msg,type=''){
  const t=document.getElementById('toast'); t.textContent=msg; t.className='toast '+type;
  void t.offsetHeight; t.classList.add('show'); clearTimeout(t._timer);
  t._timer=setTimeout(()=>t.classList.remove('show'),4200);
}

/* ═══════════════════════════════════════════════════════
   DRAG & DROP / SELECT
════════════════════════════════════════════════════════ */
function ucDragOver(e,t)  { e.preventDefault(); document.getElementById('uc-'+t).classList.add('dragover'); }
function ucDragLeave(t)   { document.getElementById('uc-'+t).classList.remove('dragover'); }
function ucDrop(e,t)      { e.preventDefault(); ucDragLeave(t); const f=e.dataTransfer.files[0]; if(f) _proc(f,t); }
function ucSelect(e,t)    { const f=e.target.files[0]; if(f) _proc(f,t); }
function _mode()          { return (document.getElementById('upload-mode')||{}).value || 'replace'; }

/* ═══════════════════════════════════════════════════════
   MAIN PROCESSOR
════════════════════════════════════════════════════════ */
async function _proc(file, type) {
  if (typeof XLSX === 'undefined') {
    showToast('Excel library not loaded — place js/xlsx.min.js in your js/ folder', 'error');
    return;
  }
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['xlsx','xls'].includes(ext)) { showToast('Upload .xlsx or .xls only', 'error'); return; }

  _pg(`Reading "${file.name}"…`);
  const reader = new FileReader();
  reader.onerror = () => { showToast('Could not read file', 'error'); _hp(); };

  reader.onload = async (e) => {
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type:'array', cellDates:true });
      const mode = _mode();

      if (type === 'bom') {
        _pg('Parsing BOM…');
        const parts = _parseBOM(wb);
        if (!parts.length) { showToast('No parts found in BOM', 'error'); _hp(); return; }
        _pg(`Saving ${parts.length} parts…`);
        const rows = parts.map(_bomToDb);
        mode === 'replace' ? await BomDB.clearAndInsert('bom_parts', rows) : await BomDB.putAll('bom_parts', rows);
        const saSet = new Set(); parts.forEach(p => (p.subAssemblies||[]).forEach(s => saSet.add(s.id)));
        await BomDB.setMeta('bom_uploaded_at', new Date().toISOString());
        await BomDB.setMeta('bom_sa_count', saSet.size);
        _hp(); adminRefreshStats(); loadPartsData(parts);
        showToast(`✓ BOM saved — ${parts.length} parts (${mode})`, 'success');

      } else if (type === 'inv') {
        _pg('Parsing inventory…');
        const inv = _parseInventory(wb);
        if (!inv.length) { showToast('No inventory rows found — check console for column detection log', 'error'); _hp(); return; }
        _pg(`Saving ${inv.length} inventory items…`);
        const rows = inv.map(_invToDb);
        mode === 'replace' ? await BomDB.clearAndInsert('store_inventory', rows) : await BomDB.putAll('store_inventory', rows);
        await BomDB.setMeta('inv_uploaded_at', new Date().toISOString());
        _hp(); adminRefreshStats(); updateInventoryStatus(inv);
        showToast(`✓ Inventory saved — ${inv.length} items (${mode})`, 'success');

      } else if (type === 'prod') {
        _pg('Parsing production line…');
        const prod = _parseProd(wb);
        if (!prod.length) { showToast('No production rows found', 'error'); _hp(); return; }
        _pg(`Saving ${prod.length} production items…`);
        const rows = prod.map(_prodToDb);
        mode === 'replace' ? await BomDB.clearAndInsert('production_line', rows) : await BomDB.putAll('production_line', rows);
        await BomDB.setMeta('prod_uploaded_at', new Date().toISOString());
        _hp(); adminRefreshStats(); updateProductionStatus(prod);
        showToast(`✓ Production line saved — ${prod.length} items (${mode})`, 'success');
      }
    } catch (err) {
      console.error('Upload error:', err);
      showToast('Error: ' + err.message, 'error');
      _hp();
    }
  };
  reader.readAsArrayBuffer(file);
}

/* ═══════════════════════════════════════════════════════
   BOM PARSER  (Tab 1 = master, Tabs 2+ = sub-assemblies)
════════════════════════════════════════════════════════ */
function _parseBOM(wb) {
  const sheets = wb.SheetNames;
  if (!sheets.length) return [];
  const masterRows = XLSX.utils.sheet_to_json(wb.Sheets[sheets[0]], { defval:'' });
  const s0 = masterRows[0]||{};
  const fc = (...a) => _findCol(s0, ...a);
  const mPN = fc('part number','partno'); const mNm = fc('part name','name'); const mQty = fc('quantity','qty');
  const masterMap = {};
  masterRows.forEach(row => {
    const pn = mPN ? String(row[mPN]||'').trim() : ''; if (!pn) return;
    masterMap[pn] = { partNumber:pn, partName:mNm?String(row[mNm]||'').trim():pn, qty:mQty?(parseFloat(row[mQty])||0):0 };
  });

  const saData = {};
  for (let i=1;i<sheets.length-3;i++) {
    const saId=sheets[i].trim(); const saRows=XLSX.utils.sheet_to_json(wb.Sheets[saId],{defval:''}); if(!saRows.length) continue;
    const sr=saRows[0]; const c=(...a)=>_findCol(sr,...a);
    const col={ pn:c('part number','partno'), nm:c('part name','name'), desc:c('part description','description'),
      hsn:c('hsn code','hsn'), type:c('part type','type'), rework:c('rework required','rework'),
      mtl:c('material of construction','material'), qty:c('quantity','qty'), uom:c('unit of measurement','uom','unit'),
      curr:c('currency','vendor currency'), rate:c('vendor rate','unit rate','vendor unit rate'),
      cost:c('total unit cost','o2c unit cost'), duty:c('custom duty','duty'),
      surch:c('surcharge %','surcharge'), dutyp:c('duty %','duty percent'),
      freight:c('total freight','freight'), landed:c('total unit landed cost','landed cost'),
      supp:c('supplier name','supplier'), ctry:c('country'), lead:c('lead time','leadtime') };
    saData[saId] = saRows.map(row => {
      const pn=col.pn?String(row[col.pn]||'').trim():''; if(!pn) return null;
      const g=(k,d='')=>col[k]?(typeof d==='number'?(parseFloat(row[col[k]])||0):String(row[col[k]]||'').trim()):d;
      return { partNumber:pn, partName:g('nm'), partDesc:g('desc'), hsnCode:g('hsn'), partType:g('type'),
        reworkRequired:g('rework')||'No', material:g('mtl'), qty:g('qty',0), uom:g('uom')||'PCS',
        vendorCurrency:g('curr')||'INR', vendorUnitRate:g('rate',0), totalUnitCost:g('cost',0),
        customDuty:g('duty',0), surchargePercent:g('surch',0), dutyPercent:g('dutyp',0),
        totalFreight:g('freight',0), landedCost:g('landed',0), supplierName:g('supp'),
        country:g('ctry'), leadTimeDays:g('lead',0) };
    }).filter(Boolean);
  }

  const blank=()=>({ partDesc:'',hsnCode:'',partType:'',reworkRequired:'No',material:'',vendorCurrency:'INR',
    vendorUnitRate:0,totalUnitCost:0,customDuty:0,surchargePercent:0,dutyPercent:0,totalFreight:0,
    landedCost:0,supplierName:'',country:'',leadTimeDays:0,subAssemblies:[],individualQty:0 });
  const pm={};
  Object.values(masterMap).forEach(m=>{ pm[m.partNumber]=Object.assign(blank(),m); });
  Object.entries(saData).forEach(([saId,rows])=>{ rows.forEach(row=>{ if(!pm[row.partNumber]) pm[row.partNumber]=Object.assign(blank(),{partNumber:row.partNumber,partName:row.partName||row.partNumber,qty:0}); const p=pm[row.partNumber]; ['partName','partDesc','hsnCode','partType','reworkRequired','material','vendorCurrency','vendorUnitRate','totalUnitCost','customDuty','surchargePercent','dutyPercent','totalFreight','landedCost','supplierName','country','leadTimeDays'].forEach(f=>{if(!p[f]&&row[f])p[f]=row[f];}); p.subAssemblies.push({id:saId,name:saId,qty:row.qty}); }); });
  return Object.values(pm).map(p=>{ const st=p.subAssemblies.reduce((s,sa)=>s+sa.qty,0); p.individualQty=Math.max(0,(p.qty||0)-st); p.urgency=_urg(p.leadTimeDays||0); return p; });
}

/* ═══════════════════════════════════════════════════════
   INVENTORY PARSER
   Actual columns (your sheet):
   Per Unit Qty | Item Code | Item Name | Opening Stock Sept 2025 |
   Current Stock | Line Stock | Set produce before 250 (Old/New) |
   New Parts | Stock at Antunes | Stock sent to Dubai |
   Stock to be received- Dubai | Balance Line Stock in 1st Floor |
   Stock at 1st Floor & Store | Balance Stock after issuing 220 Sets |
   Lead Time | Reorder Point | Stock Status |
   Balance after 220 Qty of Production | Remark | ETA |
   Material Status | Material received comments |
   Shortfall for 100/350/250 Set for Antunes |
   Cost per pcs | Balance Stock Amount | Remarks
════════════════════════════════════════════════════════ */
function _parseInventory(wb) {
  // Use first sheet
  const sheetName = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
  if (!rows.length) { console.warn('Inventory sheet is empty'); return []; }

  const sr = rows[0];
  const fc = (...a) => _findCol(sr, ...a);

  // Detect each column — most specific name first so exact match wins
  const cols = {
    itemCode:           fc('item code', 'itemcode', 'part number', 'partno'),
    itemName:           fc('item name', 'itemname', 'part name', 'name'),
    perUnitQty:         fc('per unit qty', 'perunitqty', 'per unit'),
    openingStock:       fc('opening stock', 'openingstock'),
    currentStock:       fc('current stock', 'currentstock'),      // ← exact before fuzzy 'stock'
    lineStock:          fc('line stock', 'linestock'),
    setProdOldPart:     fc('old part', 'set produce before', 'setproduce'),
    setProdNewPart:     fc('new part'),
    newParts:           fc('new parts', 'newparts'),
    stockAntunes:       fc('stock at antunes', 'antunes'),
    stockSentDubai:     fc('stock sent to dubai', 'sent to dubai', 'sentdubai'),
    stockReceiveDubai:  fc('stock to be received', 'to be received', 'receivedubai'),
    balanceLineStock1F: fc('balance line stock in 1st', 'balance line stock'),
    stock1FAndStore:    fc('stock at 1st floor', '1st floor & store'),
    balanceAfter220Sets:fc('balance stock after issuing 220', 'balance stock after'),
    leadTime:           fc('lead time', 'leadtime'),
    reorderPoint:       fc('reorder point', 'reorderpoint', 'reorder'),
    stockStatus:        fc('stock status', 'stockstatus'),
    balanceAfter220Qty: fc('balance after 220 qty', 'balance after 220'),
    remark:             fc('remark'),                              // single 'remark'
    eta:                fc('eta'),
    materialStatus:     fc('material status', 'materialstatus'),
    materialComments:   fc('material received comments', 'material received', 'materialcomments'),
    shortfall100:       fc('shortfall for 100', 'shortfall100'),
    shortfall350:       fc('shortfall for 350', 'shortfall350'),
    shortfall250:       fc('shortfall for 250', 'shortfall250'),
    costPerPcs:         fc('cost per pcs', 'costperpcs', 'cost per piece'),
    balanceStockAmount: fc('balance stock amount', 'balancestockamount'),
    remarks:            fc('remarks'),                             // plural 'remarks'
  };

  // Log detected columns so you can debug in browser console
  console.group('Inventory column detection');
  Object.entries(cols).forEach(([k,v]) => console.log(`${k.padEnd(22)} →`, v || '⚠️ NOT FOUND'));
  console.groupEnd();

  const gn = (row, k) => cols[k] ? (parseFloat(row[cols[k]]) || 0) : 0;
  const gs = (row, k) => cols[k] ? String(row[cols[k]] || '').trim() : '';

  const parsed = rows.map(row => {
    const code = cols.itemCode ? String(row[cols.itemCode] || '').trim() : '';
    if (!code) return null;

    return {
      itemCode:           code,
      itemName:           gs(row, 'itemName'),
      perUnitQty:         gn(row, 'perUnitQty'),
      openingStock:       gn(row, 'openingStock'),
      currentStock:       gn(row, 'currentStock'),
      lineStock:          gn(row, 'lineStock'),
      setProdOldPart:     gs(row, 'setProdOldPart'),
      setProdNewPart:     gs(row, 'setProdNewPart'),
      newParts:           gs(row, 'newParts'),
      stockAntunes:       gn(row, 'stockAntunes'),
      stockSentDubai:     gn(row, 'stockSentDubai'),
      stockReceiveDubai:  gn(row, 'stockReceiveDubai'),
      balanceLineStock1F: gn(row, 'balanceLineStock1F'),
      stock1FAndStore:    gn(row, 'stock1FAndStore'),
      balanceAfter220Sets:gn(row, 'balanceAfter220Sets'),
      leadTime:           gs(row, 'leadTime'),
      reorderPoint:       gn(row, 'reorderPoint'),
      stockStatus:        gs(row, 'stockStatus'),
      balanceAfter220Qty: gn(row, 'balanceAfter220Qty'),
      remark:             gs(row, 'remark'),
      eta:                gs(row, 'eta'),
      materialStatus:     gs(row, 'materialStatus'),
      materialComments:   gs(row, 'materialComments'),
      shortfall100:       gn(row, 'shortfall100'),
      shortfall350:       gn(row, 'shortfall350'),
      shortfall250:       gn(row, 'shortfall250'),
      costPerPcs:         gn(row, 'costPerPcs'),
      balanceStockAmount: gn(row, 'balanceStockAmount'),
      remarks:            gs(row, 'remarks'),
    };
  }).filter(Boolean);

  console.log(`Inventory parsed: ${parsed.length} rows. Sample:`, parsed[0]);
  return parsed;
}

/* ═══════════════════════════════════════════════════════
   PRODUCTION LINE PARSER
   Columns: Location | Per Unit Qty | Item Code | Item Name |
            Line Issue | Line Rejection
════════════════════════════════════════════════════════ */
function _parseProd(wb) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval:'' });
  if (!rows.length) return [];
  const sr = rows[0];
  const fc = (...a) => _findCol(sr, ...a);
  const cols = {
    itemCode:      fc('item code','itemcode','part number','partno'),
    itemName:      fc('item name','itemname','part name','name'),
    perUnitQty:    fc('per unit qty','perunitqty','per unit'),
    stockLocation: fc('location','stock location','loc'),
    lineIssue:     fc('line issue','lineissue','issued','issue'),
    lineRejection: fc('line rejection','linerejection','rejection','rejected'),
  };
  console.log('Production columns detected:', cols);
  return rows.map(row => {
    const code = cols.itemCode ? String(row[cols.itemCode]||'').trim() : ''; if (!code) return null;
    const gn = k => cols[k] ? (parseFloat(row[cols[k]])||0) : 0;
    const gs = k => cols[k] ? String(row[cols[k]]||'').trim() : '';
    const li=gn('lineIssue'), lr=gn('lineRejection');
    return { itemCode:code, itemName:gs('itemName'), perUnitQty:gn('perUnitQty'),
      stockLocation:gs('stockLocation'), lineIssue:li, lineRejection:lr, netConsumption:li-lr };
  }).filter(Boolean);
}

/* ═══════════════════════════════════════════════════════
   DB MAPPERS  — JS objects → Supabase snake_case rows
════════════════════════════════════════════════════════ */
function _bomToDb(p) {
  return { part_number:p.partNumber, part_name:p.partName, part_desc:p.partDesc, hsn_code:p.hsnCode,
    part_type:p.partType, rework_required:p.reworkRequired, material:p.material, qty:p.qty, uom:p.uom,
    vendor_currency:p.vendorCurrency, vendor_unit_rate:p.vendorUnitRate, total_unit_cost:p.totalUnitCost,
    custom_duty:p.customDuty, surcharge_percent:p.surchargePercent, duty_percent:p.dutyPercent,
    total_freight:p.totalFreight, landed_cost:p.landedCost, supplier_name:p.supplierName,
    country:p.country, lead_time_days:p.leadTimeDays, urgency:p.urgency,
    individual_qty:p.individualQty, sub_assemblies:p.subAssemblies,
    uploaded_at:new Date().toISOString() };
}

function _invToDb(i) {
  return {
    item_code:             i.itemCode,
    item_name:             i.itemName,
    per_unit_qty:          i.perUnitQty,
    opening_stock:         i.openingStock,
    current_stock:         i.currentStock,
    line_stock:            i.lineStock,
    set_produce_old_part:  i.setProdOldPart,
    set_produce_new_part:  i.setProdNewPart,
    new_parts:             i.newParts,
    stock_at_antunes:      i.stockAntunes,
    stock_sent_dubai:      i.stockSentDubai,
    stock_to_receive_dubai:i.stockReceiveDubai,
    balance_line_stock_1f: i.balanceLineStock1F,
    stock_1f_and_store:    i.stock1FAndStore,
    balance_after_220_sets:i.balanceAfter220Sets,
    lead_time:             i.leadTime,
    reorder_point:         i.reorderPoint,
    stock_status:          i.stockStatus,
    balance_after_220_qty: i.balanceAfter220Qty,
    remark:                i.remark,
    eta:                   i.eta,
    material_status:       i.materialStatus,
    material_comments:     i.materialComments,
    shortfall_100_antunes: i.shortfall100,
    shortfall_350_antunes: i.shortfall350,
    shortfall_250_antunes: i.shortfall250,
    cost_per_pcs:          i.costPerPcs,
    balance_stock_amount:  i.balanceStockAmount,
    remarks:               i.remarks,
    updated_at:            new Date().toISOString(),
  };
}

function _prodToDb(p) {
  return { item_code:p.itemCode, item_name:p.itemName, per_unit_qty:p.perUnitQty,
    stock_location:p.stockLocation, line_issue:p.lineIssue, line_rejection:p.lineRejection,
    updated_at:new Date().toISOString() };
}

/* ═══════════════════════════════════════════════════════
   STATUS PILLS
════════════════════════════════════════════════════════ */
function updateInventoryStatus(items) {
  const p=document.getElementById('inv-pill'), t=document.getElementById('inv-pill-text');
  if (!p) return;
  if (items&&items.length) { p.className='inv-pill loaded'; t.textContent=`${items.length} items`; }
  else                     { p.className='inv-pill not-loaded'; t.textContent='Not loaded'; }
}
function updateProductionStatus(items) {
  const p=document.getElementById('prod-pill'), t=document.getElementById('prod-pill-text');
  if (!p) return;
  if (items&&items.length) { p.className='inv-pill loaded'; t.textContent=`${items.length} items`; }
  else                     { p.className='inv-pill not-loaded'; t.textContent='Not loaded'; }
}

/* ═══════════════════════════════════════════════════════
   PROGRESS / HELPERS
════════════════════════════════════════════════════════ */
function _pg(m) { document.getElementById('prog-wrap').classList.add('visible'); _pl(m); }
function _hp()  { document.getElementById('prog-wrap').classList.remove('visible'); }
function _pl(m) { document.getElementById('prog-label').textContent = m; }
function _urg(d){ return d>60?'critical':d>30?'high':d>13?'medium':'low'; }
function _ts(v) {
  if (!v) return '—';
  const d = new Date(typeof v==='number' ? v : v);
  return d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})
        +' '+d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
}
function _s(id,v){ const e=document.getElementById(id); if(e) e.textContent=v; }
function _show(id){ const e=document.getElementById(id); if(e) e.style.display='block'; }

/* ═══════════════════════════════════════════════════════
   TOAST  (shared across all files)
════════════════════════════════════════════════════════ */
function showToast(msg, type='') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast '+type;
  void t.offsetHeight; t.classList.add('show');
  clearTimeout(t._timer); t._timer = setTimeout(()=>t.classList.remove('show'), 4200);
}
