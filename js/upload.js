/**
 * upload.js — Admin · PIN · BOM + Store parsers
 * Secret: click O2 logo 5× in 3 sec  |  PIN: 2580
 *
 * ═══ BOM FILE STRUCTURE ═══════════════════════════════════════
 *
 *  Tab 1 — "Unique Part Numbers" (MASTER / COST DATA SOURCE)
 *    Columns: Part Number, Part Name, Part Description, HSN Code,
 *             Part Type, Rework Required, Rework Drawing Reference,
 *             Part Sub-Category, Part Category, Material of Construction,
 *             Revision No., Quantity (TOTAL), Unit of Measurement,
 *             Unit Rate (Vendor Currency), Vendor Currency, Exchange Rate,
 *             Unit Cost INR, Total Unit Cost, Custom Duty, Surcharge,
 *             Total Custom Duty, Surcharge %, Duty %, Freight Only,
 *             Other Expenses, Total Freight, Total Unit Landed Cost,
 *             Total BOM Cost, Supplier Name, Country, Lead Time, Finalized
 *
 *  Tabs 2+ — Sub-assembly tabs (MEMBERSHIP + SA-QTY SOURCE)
 *    Tab name = Sub-Assembly ID (e.g. O2C-EC-SA-001)
 *    Columns: Finalized, S.No., Photo, Part Number, Part Name,
 *             Part Description, HSN Code, Part Type, Rework Required,
 *             Rework Drawing Reference, Part Sub-Category, Part Category,
 *             Material of Construction, Revision No., Quantity (in THIS SA),
 *             Unit of Measurement
 *    → NO cost columns needed here; costs come from Tab 1
 *
 * ═══ STORAGE STRATEGY ═════════════════════════════════════════
 *  One DB row per UNIQUE PART (from Tab 1).
 *  SA membership + per-SA qty stored as JSON in sno field:
 *    sno = "TAB1QTY:<totalQty>|SAMAP:<json>|<realSno>"
 *    SAMAP json = [{id:"SA-001",qty:10},{id:"SA-005",qty:10},...]
 *  This encodes everything needed for the expandable breakdown
 *  without requiring any schema changes.
 */

var ADMIN_PIN = '2580';

/* ─── Column finder ──────────────────────────── */
function _norm(s) {
  return String(s || '').trim().toLowerCase().replace(/[\s_\-\(\)\/\|&\.#%]+/g, '');
}
function _makeFinder(sampleRow) {
  var keys = Object.keys(sampleRow);
  return function() {
    var cands = Array.prototype.slice.call(arguments);
    var i, n, found;
    for (i = 0; i < cands.length; i++) {
      n = _norm(cands[i]);
      found = keys.find(function(k) { return _norm(k) === n; });
      if (found) return found;
    }
    for (i = 0; i < cands.length; i++) {
      n = _norm(cands[i]);
      found = keys.find(function(k) { return _norm(k).startsWith(n); });
      if (found) return found;
    }
    for (i = 0; i < cands.length; i++) {
      n = _norm(cands[i]);
      if (n.length >= 5) {
        found = keys.find(function(k) { return _norm(k).includes(n); });
        if (found) return found;
      }
    }
    return null;
  };
}

/* ─── Logo tap ───────────────────────────────── */
var _tapN = 0, _tapT = null;
document.addEventListener('DOMContentLoaded', function() {
  var logo = document.getElementById('logo-block');
  if (!logo) return;
  logo.addEventListener('click', function() {
    _tapN++;
    logo.classList.add('tap-flash');
    setTimeout(function() { logo.classList.remove('tap-flash'); }, 250);
    clearTimeout(_tapT);
    _tapT = setTimeout(function() { _tapN = 0; }, 3000);
    if (_tapN >= 5) { _tapN = 0; clearTimeout(_tapT); openAdmin(); }
  });
});

/* ─── Admin overlay ──────────────────────────── */
function openAdmin() { _pinReset(); document.getElementById('admin-overlay').classList.add('open'); }
function closeAdmin() { document.getElementById('admin-overlay').classList.remove('open'); }
function handleAdminOverlayClick(e) { if (e.target.id === 'admin-overlay') closeAdmin(); }

/* ─── PIN ────────────────────────────────────── */
var _pin = '';
function pinKey(d) { if (_pin.length >= 4) return; _pin += d; _drawDots(); if (_pin.length === 4) setTimeout(_checkPin, 180); }
function pinDel()   { _pin = _pin.slice(0, -1); _drawDots(); }
function pinClear() { _pin = ''; _drawDots(); _pinErr(''); }
function _pinReset(){ _pin = ''; _drawDots(); _pinErr(''); _showPinScreen(); }
function _drawDots() { for (var i = 0; i < 4; i++) { var e = document.getElementById('pd' + i); if (e) e.classList.toggle('filled', i < _pin.length); } }
function _pinErr(m)  { var e = document.getElementById('pin-error'); if (e) e.textContent = m; }
function _checkPin() {
  if (_pin === ADMIN_PIN) { _pinErr(''); _showAdminBody(); adminRefreshStats(); }
  else {
    _pinErr('Incorrect PIN'); _pin = ''; _drawDots();
    var d = document.getElementById('pin-dots');
    if (d) { d.style.animation = 'none'; d.offsetHeight; d.style.animation = 'shake .3s ease'; setTimeout(function(){ d.style.animation = ''; }, 400); }
  }
}
function _showPinScreen(){ var p=document.getElementById('pin-screen'),b=document.getElementById('admin-body'); if(p)p.style.display='block'; if(b)b.classList.remove('visible'); }
function _showAdminBody(){ var p=document.getElementById('pin-screen'),b=document.getElementById('admin-body'); if(p)p.style.display='none'; if(b)b.classList.add('visible'); }
(function(){ var s=document.createElement('style'); s.textContent='@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}'; document.head.appendChild(s); })();

/* ─── Admin stats ────────────────────────────── */
async function adminRefreshStats() {
  try {
    var r = await Promise.all([BomDB.count('bom_parts'), BomDB.count('store_inventory'), BomDB.getMeta('bom_uploaded_at'), BomDB.getMeta('inv_uploaded_at')]);
    _setText('adb-parts', r[0] || '—'); _setText('adb-inv', r[1] || '—');
    _setText('adb-bom-ts', r[2] ? _fmtTs(r[2].updated_at) : 'Not loaded');
    _setText('adb-inv-ts', r[3] ? _fmtTs(r[3].updated_at) : 'Not loaded');
    if (r[0] > 0 && r[2]) { _showEl('uc-bom-ok'); _setText('uc-bom-ts', _fmtTs(r[2].updated_at)); }
    if (r[1] > 0 && r[3]) { _showEl('uc-inv-ok'); _setText('uc-inv-ts', _fmtTs(r[3].updated_at)); }
  } catch(e) { console.warn('adminRefreshStats:', e); }
}
async function adminClearAll() {
  if (!confirm('Clear ALL data from database? Cannot be undone.')) return;
  await BomDB.clearAll();
  showToast('All data cleared', 'info');
  adminRefreshStats();
  loadBomData([]); loadStoreData([]);
}

/* ─── Drag / drop / select ───────────────────── */
function ucDragOver(e, t) { e.preventDefault(); document.getElementById('uc-' + t).classList.add('dragover'); }
function ucDragLeave(t)   { document.getElementById('uc-' + t).classList.remove('dragover'); }
function ucDrop(e, t)     { e.preventDefault(); ucDragLeave(t); var f = e.dataTransfer.files[0]; if (f) _proc(f, t); }
function ucSelect(e, t)   { var f = e.target.files[0]; if (f) _proc(f, t); }
function _getMode()       { var e = document.getElementById('upload-mode'); return e ? e.value : 'replace'; }

/* ─── File processor ─────────────────────────── */
async function _proc(file, type) {
  if (typeof XLSX === 'undefined') { showToast('XLSX library missing', 'error'); return; }
  var ext = file.name.split('.').pop().toLowerCase();
  if (ext !== 'xlsx' && ext !== 'xls') { showToast('Upload .xlsx or .xls only', 'error'); return; }
  _showProg('Reading "' + file.name + '"…');
  var reader = new FileReader();
  reader.onerror = function() { showToast('Could not read file', 'error'); _hideProg(); };
  reader.onload  = async function(ev) {
    try {
      var wb   = XLSX.read(new Uint8Array(ev.target.result), { type: 'array', cellDates: true });
      var mode = _getMode();
      if (type === 'bom') {
        _setProgLbl('Parsing BOM sheets…');
        var parts = _parseBOM(wb);
        if (!parts.length) { showToast('No BOM rows found — check file structure', 'error'); _hideProg(); return; }
        _setProgLbl('Saving ' + parts.length + ' rows…');
        if (mode === 'replace') await BomDB.clearAndInsert('bom_parts', parts);
        else                    await BomDB.putAll('bom_parts', parts);
        await BomDB.setMeta('bom_uploaded_at', new Date().toISOString());
        _hideProg(); adminRefreshStats(); loadBomData(parts);
        showToast('✓ BOM saved — ' + parts.length + ' unique parts', 'success');
      } else if (type === 'inv') {
        _setProgLbl('Parsing Store Inventory…');
        var inv = _parseStore(wb);
        if (!inv.length) { showToast('No rows found', 'error'); _hideProg(); return; }
        _setProgLbl('Saving ' + inv.length + ' items…');
        if (mode === 'replace') await BomDB.clearAndInsert('store_inventory', inv);
        else                    await BomDB.putAll('store_inventory', inv);
        await BomDB.setMeta('inv_uploaded_at', new Date().toISOString());
        _hideProg(); adminRefreshStats(); loadStoreData(inv);
        showToast('✓ Store saved — ' + inv.length + ' items', 'success');
      }
    } catch(err) {
      console.error('Upload error:', err);
      showToast('Error: ' + err.message, 'error');
      _hideProg();
    }
  };
  reader.readAsArrayBuffer(file);
}

/* ═══════════════════════════════════════════════════════
   BOM PARSER
   ─────────────────────────────────────────────────────
   Tab 1 → master list: one row per unique part with ALL columns
            including all cost data, supplier, lead time, total qty

   Tabs 2+ → SA membership: tab name = SA ID
             Columns: Finalized, S.No., Photo, Part Number, Part Name,
             Part Description, HSN Code, Part Type, Rework Required,
             Rework Drawing Reference, Part Sub-Category, Part Category,
             Material of Construction, Revision No., Quantity (in THIS SA),
             Unit of Measurement
             → NO cost columns; costs from Tab 1 only

   One DB row per unique part.
   SA membership + per-SA qty packed into sno as:
     "TAB1QTY:<n>|SAMAP:<jsonArray>|<realSno>"
═══════════════════════════════════════════════════════ */
function _parseBOM(wb) {
  var sheets = wb.SheetNames;
  if (!sheets.length) return [];

  /* Column mapper reused across all tabs */
  function _mapCols(sr) {
    var f = _makeFinder(sr);
    return {
      f: f,
      finalized:    f('finalized','final'),
      sno:          f('s.no','sno','s no','serial no','sr no','sl no','no.'),
      pn:           f('part number','partno','part no','part#'),
      nm:           f('part name','name'),
      desc:         f('part description','description','desc'),
      hsn:          f('hsn code','hsn'),
      type:         f('part type','type'),
      rework:       f('rework required','rework req','rework'),
      reworkRef:    f('rework drawing reference','rework drawing','rework ref'),
      subCat:       f('part sub-category','part sub category','sub category','subcategory','sub-cat'),
      cat:          f('part category','category','cat'),
      material:     f('material of construction','material'),
      revNo:        f('revision no','revision no.','rev no','revision','rev'),
      qty:          f('quantity','qty'),
      uom:          f('unit of measurement','uom','unit'),
      unitRate:     f('unit rate in vendor currency','unit rate (in vendor currency)','unit rate','vendor rate','rate'),
      curr:         f('vendor currency','currency'),
      exRate:       f('exchange rate','ex rate','exrate','fx rate'),
      unitCostInr:  f('unit cost inr','unit cost','cost inr'),
      totalCost:    f('total unit cost','total cost','o2c unit cost'),
      customDuty:   f('custom duty'),
      surcharge:    f('surcharge'),
      totalDuty:    f('total custom duty','total duty'),
      surPct:       f('surcharge %','surcharge percent','surcharge%'),
      dutyPct:      f('duty %','duty percent','duty%'),
      freightOnly:  f('freight only','freight'),
      otherExp:     f('other expenses','other exp','other'),
      totalFreight: f('total freight'),
      landed:       f('total unit landed cost','total landed cost','landed cost','landed'),
      totalBom:     f('total bom cost','total bom','bom cost'),
      supplier:     f('supplier name','supplier'),
      country:      f('country'),
      lead:         f('lead time','lead'),
    };
  }

  /* ── Step 1: Parse Tab 1 (master) ── */
  var tab1Rows = XLSX.utils.sheet_to_json(wb.Sheets[sheets[0]], { defval: '', raw: true });
  if (!tab1Rows.length) { console.warn('BOM Tab 1 empty'); return []; }

  var t1c = _mapCols(tab1Rows[0]);
  if (!t1c.pn) { console.warn('Tab 1: cannot detect Part Number column'); return []; }

  // Build master map keyed by partNumber
  var masterMap = {};
  tab1Rows.forEach(function(row) {
    var pn = t1c.pn ? String(row[t1c.pn] || '').trim() : '';
    if (!pn || pn.toLowerCase() === 'part number') return;
    var gn = function(k) { return t1c[k] ? (parseFloat(row[t1c[k]]) || 0) : 0; };
    var gs = function(k) { return t1c[k] ? String(row[t1c[k]] || '').trim() : ''; };
    masterMap[pn] = {
      pn: pn, nm: gs('nm'), desc: gs('desc'), hsn: gs('hsn'),
      type: gs('type'), rework: gs('rework') || 'No', reworkRef: gs('reworkRef'),
      subCat: gs('subCat'), cat: gs('cat'), material: gs('material'), revNo: gs('revNo'),
      totalQty: gn('qty'), uom: gs('uom') || 'PCS',
      unitRate: gn('unitRate'), curr: gs('curr') || 'INR', exRate: gn('exRate') || 1,
      unitCostInr: gn('unitCostInr'), totalCost: gn('totalCost'),
      customDuty: gn('customDuty'), surcharge: gn('surcharge'), totalDuty: gn('totalDuty'),
      surPct: gn('surPct'), dutyPct: gn('dutyPct'),
      freightOnly: gn('freightOnly'), otherExp: gn('otherExp'), totalFreight: gn('totalFreight'),
      landed: gn('landed'), totalBom: gn('totalBom'),
      supplier: gs('supplier'), country: gs('country'),
      lead: gs('lead'), finalized: gs('finalized'), sno: gs('sno'),
    };
  });
  console.log('Tab 1: parsed', Object.keys(masterMap).length, 'unique parts');

  /* ── Step 2: Parse SA tabs → build saMap[pn] = [{id, qty, sno, finalized}] ── */
  var saMap = {}; // partNumber → array of {id, qty, sno, finalized}

  for (var si = 1; si < sheets.length; si++) {
    var saId   = sheets[si].trim();
    var saRows = XLSX.utils.sheet_to_json(wb.Sheets[saId], { defval: '', raw: true });
    if (!saRows.length) continue;

    var sc = _mapCols(saRows[0]);
    if (!sc.pn) { console.warn('SA tab "' + saId + '": no Part Number col, skipping'); continue; }

    saRows.forEach(function(row) {
      var pn = String(row[sc.pn] || '').trim();
      if (!pn || pn.toLowerCase() === 'part number') return;
      if (!saMap[pn]) saMap[pn] = [];
      saMap[pn].push({
        id:        saId,
        qty:       sc.qty ? (parseFloat(row[sc.qty]) || 0) : 0,
        sno:       sc.sno       ? String(row[sc.sno]       || '').trim() : '',
        finalized: sc.finalized ? String(row[sc.finalized] || '').trim() : '',
      });
    });
    console.log('SA tab "' + saId + '": ' + saRows.length + ' rows');
  }

  /* ── Step 3: Build one DB row per unique part ── */
  var result = [];
  Object.keys(masterMap).forEach(function(pn) {
    var m       = masterMap[pn];
    var saList  = saMap[pn] || [];         // may be empty if part not in any SA tab
    var leadRaw = m.lead;
    var leadDays= parseFloat(leadRaw) || 0;

    // Pack SA map + total qty into sno field
    var encoded = 'TAB1QTY:' + m.totalQty + '|SAMAP:' + JSON.stringify(saList) + '|' + m.sno;

    result.push({
      id:                  'PART__' + pn.replace(/[\s\/\\]/g, '_'),
      sno:                 encoded,
      finalized:           m.finalized,
      partNumber:          pn,
      partName:            m.nm,
      partDesc:            m.desc,
      hsnCode:             m.hsn,
      partType:            m.type,
      reworkRequired:      m.rework,
      reworkDrawingRef:    m.reworkRef,
      partSubCategory:     m.subCat,
      partCategory:        m.cat,
      material:            m.material,
      revisionNo:          m.revNo,
      quantity:            m.totalQty,    // total qty from Tab 1
      uom:                 m.uom,
      unitRateVendor:      m.unitRate,
      vendorCurrency:      m.curr,
      exchangeRate:        m.exRate,
      unitCostInr:         m.unitCostInr,
      totalUnitCost:       m.totalCost,
      customDuty:          m.customDuty,
      surcharge:           m.surcharge,
      totalCustomDuty:     m.totalDuty,
      surchargePercent:    m.surPct,
      dutyPercent:         m.dutyPct,
      freightOnly:         m.freightOnly,
      otherExpenses:       m.otherExp,
      totalFreight:        m.totalFreight,
      totalUnitLandedCost: m.landed,
      totalBomCost:        m.totalBom,
      supplierName:        m.supplier,
      country:             m.country,
      leadTime:            leadRaw,
      subAssemblyId:       saList.map(function(s) { return s.id; }).join(','),
      urgency:             leadDays > 60 ? 'critical' : leadDays > 30 ? 'high' : leadDays > 13 ? 'medium' : 'low',
    });
  });

  console.log('BOM: ' + result.length + ' unique parts across ' + (sheets.length - 1) + ' SA tabs');
  return result;
}

/* ═══════════════════════════════════════════════════════
   STORE INVENTORY PARSER — RAW PASSTHROUGH
═══════════════════════════════════════════════════════ */
function _parseStore(wb) {
  var rawRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: true });
  if (!rawRows.length) { console.warn('Store: empty sheet'); return []; }

  var allHeaders = Object.keys(rawRows[0]);
  var find       = _makeFinder(rawRows[0]);
  var pnCol      = find('part number','partno','item code','itemcode','code','part no','part#') || allHeaders[0];

  var parsed = rawRows.map(function(row) {
    var pn = String(row[pnCol] || '').trim();
    if (!pn || pn.toLowerCase() === 'part number' || pn === '-') return null;

    var gn = function(keys) {
      for (var i = 0; i < keys.length; i++) {
        var col = find(keys[i]);
        if (col && row[col] !== undefined && row[col] !== '') return parseFloat(row[col]) || 0;
      }
      return 0;
    };
    var gs = function(keys) {
      for (var i = 0; i < keys.length; i++) {
        var col = find(keys[i]);
        if (col && row[col] !== undefined && row[col] !== '') return String(row[col]).trim();
      }
      return '';
    };

    return {
      partNumber:    pn,
      _partName:     gs(['part name','name','item name']),
      _unitRate:     gn(['unit rate','rate','cost per pcs','cost','price']),
      _currency:     gs(['currency','vendor currency','curr']) || 'INR',
      _country:      gs(['country']),
      _quantity:     gn(['quantity','qty']),
      _unit:         gs(['unit of measurement','uom','unit']) || 'PCS',
      _storeInvQty:  gn(['store inventory','store inv','current stock','stock','store qty']),
      _prodLineQty:  gn(['production line','prod line','line stock','line qty']),
      _inventory128: gn(['inventory 128','inv 128','128 inventory','128','inv128']),
      _rawHeaders:   allHeaders,
      _rawRow:       row,
    };
  }).filter(Boolean);

  console.log('Store: ' + parsed.length + ' rows, ' + allHeaders.length + ' columns');
  return parsed;
}

/* ─── Progress / helpers / toast ────────────── */
function _showProg(m) { document.getElementById('prog-wrap').classList.add('visible'); _setProgLbl(m); }
function _hideProg()  { document.getElementById('prog-wrap').classList.remove('visible'); }
function _setProgLbl(m) { var e = document.getElementById('prog-label'); if (e) e.textContent = m; }
function _fmtTs(v) {
  if (!v) return '—';
  var d = new Date(v);
  return d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
    + ' ' + d.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
}
function _setText(id, v) { var e = document.getElementById(id); if (e) e.textContent = v; }
function _showEl(id)     { var e = document.getElementById(id); if (e) e.style.display = 'block'; }
function showToast(msg, type) {
  type = type || '';
  var t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast ' + type;
  void t.offsetHeight; t.classList.add('show');
  clearTimeout(t._timer); t._timer = setTimeout(function() { t.classList.remove('show'); }, 4500);
}