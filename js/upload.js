
/* ══════════════════════════════════════════════
   ADMIN OVERLAY
══════════════════════════════════════════════ */
var _logoClicks = 0, _logoTimer = null;

document.addEventListener('DOMContentLoaded', function () {
  var logo = document.getElementById('logo-block');
  if (logo) {
    logo.addEventListener('click', function () {
      _logoClicks++;
      clearTimeout(_logoTimer);
      if (_logoClicks >= 5) { _logoClicks = 0; openAdmin(); return; }
      _logoTimer = setTimeout(function () { _logoClicks = 0; }, 1500);
      logo.classList.add('tap-flash');
      setTimeout(function () { logo.classList.remove('tap-flash'); }, 200);
    });
  }
});

var _pinVal = '', _pinCorrect = '1234', _adminUnlocked = false;

function openAdmin() {
  document.getElementById('admin-overlay').classList.add('open');
  if (!_adminUnlocked) {
    _pinVal = '';
    _renderPin();
    document.getElementById('pin-error').textContent = '';
    document.getElementById('pin-screen').style.display = '';
    document.getElementById('admin-body').classList.remove('visible');
  }
  adminRefreshStats();
}
function closeAdmin() { document.getElementById('admin-overlay').classList.remove('open'); }
function handleAdminOverlayClick(e) { if (e.target === document.getElementById('admin-overlay')) closeAdmin(); }

function pinKey(k) {
  if (_pinVal.length >= 4) return;
  _pinVal += k;
  _renderPin();
  if (_pinVal.length === 4) setTimeout(_checkPin, 140);
}
function pinDel()   { _pinVal = _pinVal.slice(0, -1); _renderPin(); }
function pinClear() { _pinVal = ''; _renderPin(); document.getElementById('pin-error').textContent = ''; }

function _renderPin() {
  for (var i = 0; i < 4; i++) {
    var d = document.getElementById('pd' + i);
    if (d) d.classList.toggle('filled', i < _pinVal.length);
  }
}

function _checkPin() {
  if (_pinVal === _pinCorrect) {
    _adminUnlocked = true;
    document.getElementById('pin-screen').style.display = 'none';
    document.getElementById('admin-body').classList.add('visible');
  } else {
    document.getElementById('pin-error').textContent = 'Incorrect PIN — try again.';
    _pinVal = ''; _renderPin();
  }
}

async function adminRefreshStats() {
  try {
    var bc = await BomDB.count('bom_parts');
    var ic = await BomDB.count('store_inventory');
    _t('adb-parts', bc || '0');
    _t('adb-inv',   ic || '0');
    var bm = await BomDB.getMeta('bom_uploaded_at');
    var im = await BomDB.getMeta('inv_uploaded_at');
    _t('adb-bom-ts', bm ? _fmtTs(bm.value) : 'Not loaded');
    _t('adb-inv-ts', im ? _fmtTs(im.value) : 'Not loaded');
  } catch (e) { /* silent */ }
}

function _fmtTs(iso) {
  try { return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch (e) { return iso || '—'; }
}

async function adminClearAll() {
  if (!confirm('Delete ALL data from the database?\nThis cannot be undone.')) return;
  try {
    _prog(true, 'Clearing database…');
    await BomDB.clearAll();
    loadBomData([]);
    loadStoreData([]);
    _dbUI('green', 'connected — no data yet');
    showToast('✓ All data cleared', 'success');
    await adminRefreshStats();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  } finally { _prog(false); }
}

/* ══════════════════════════════════════════════
   DRAG & DROP
══════════════════════════════════════════════ */
function ucDragOver(e, type)  { e.preventDefault(); document.getElementById('uc-' + type).classList.add('dragover'); }
function ucDragLeave(type)    { document.getElementById('uc-' + type).classList.remove('dragover'); }
function ucDrop(e, type)      { e.preventDefault(); ucDragLeave(type); var f = e.dataTransfer.files[0]; if (f) _processFile(f, type); }
function ucSelect(e, type)    { var f = e.target.files[0]; if (f) _processFile(f, type); e.target.value = ''; }

/* ══════════════════════════════════════════════
   FILE ENTRY POINT
══════════════════════════════════════════════ */
function _processFile(file, type) {
  if (!file.name.match(/\.(xlsx|xls)$/i)) {
    showToast('Please upload an Excel file (.xlsx or .xls)', 'error');
    return;
  }
  _prog(true, 'Reading file…');
  var reader = new FileReader();
  reader.onload = function (e) {
    try {
      var wb = XLSX.read(e.target.result, { type: 'binary', cellDates: true });
      if (type === 'bom')  _parseBom(wb);
      if (type === 'inv')  _parseInv(wb);
      if (type === 'proc') _parseProc(wb);
    } catch (err) {
      _prog(false);
      showToast('Parse error: ' + err.message, 'error');
      console.error(err);
    }
  };
  reader.onerror = function () { _prog(false); showToast('File read error', 'error'); };
  reader.readAsBinaryString(file);
}

/* ══════════════════════════════════════════════
   BOM PARSER — MULTI-SHEET
   ─────────────────────────────────────────────
   Tab 1  →  master part rows (cost data, totals)
   Tab 2+ →  sub-assembly tabs, each named by SA ID
             Columns: S.No, Finalized, Part Number,
             Part Name, Part Desc, HSN, Type, Rework,
             Material, Revision, Quantity (in this SA), UOM
══════════════════════════════════════════════ */
function _parseBom(wb) {
  var sheetNames = wb.SheetNames;
  if (!sheetNames.length) { showToast('Excel file appears empty', 'error'); _prog(false); return; }

  /* ── STEP 1: Parse Tab 1 (master) ── */
  _prog(true, 'Parsing Tab 1 — master parts…');
  var masterSheet = wb.Sheets[sheetNames[0]];
  var masterRows  = XLSX.utils.sheet_to_json(masterSheet, { defval: '' });

  if (!masterRows.length) { showToast('Tab 1 has no data rows', 'error'); _prog(false); return; }

  /* partMap: lowercase(partNumber) → part object */
  var partMap   = {};
  var partOrder = [];   // preserve Tab 1 order

  masterRows.forEach(function (row, idx) {
    var pn = _cv(row, ['part number', 'part_number', 'part no', 'part no.', 'partno', 'partnumber', 'part#']) || '';
    pn = String(pn).trim();
    if (!pn) return;   // skip blank rows

    var key = pn.toLowerCase();
    if (partMap[key]) return;   // deduplicate within Tab 1

    var part = {
      /* identity */
      id:                   key + '_' + Date.now() + '_' + idx,
      sno:                  String(_cv(row, ['s.no', 's.no.', 'sno', 's no', 'serial no', 'sl no', 'sr no']) || (idx + 1)),
      finalized:            String(_cv(row, ['finalized', 'finalised']) || 'No'),
      partNumber:           pn,
      partName:             String(_cv(row, ['part name', 'partname', 'name']) || ''),
      /* descriptive (also enriched from SA tabs) */
      partDesc:             String(_cv(row, ['part description', 'part desc', 'description', 'desc']) || ''),
      hsnCode:              String(_cv(row, ['hsn code', 'hsn', 'hsncode', 'hsn/sac']) || ''),
      partType:             String(_cv(row, ['part type', 'parttype', 'type', 'component type']) || ''),
      reworkRequired:       String(_cv(row, ['rework required', 'rework req', 'rework', 'rework req.']) || 'No'),
      reworkDrawingRef:     String(_cv(row, ['rework drawing ref', 'rework drawing reference', 'drawing ref']) || ''),
      partSubCategory:      String(_cv(row, ['part sub category', 'sub category', 'sub-category', 'subcategory']) || ''),
      partCategory:         String(_cv(row, ['part category', 'category']) || ''),
      material:             String(_cv(row, ['material', 'material of construction', 'material of const.']) || ''),
      revisionNo:           String(_cv(row, ['revision no', 'revision no.', 'rev no', 'revision']) || ''),
      /* quantities */
      quantity:             _cn(row, ['quantity', 'qty', 'total qty', 'total quantity', 'total qty (device)']),
      uom:                  String(_cv(row, ['uom', 'unit', 'unit of measurement', 'units']) || 'PCS'),
      /* cost columns */
      unitRateVendor:       _cn(row, ['unit rate', 'unit rate vendor', 'unit rate (vendor)', 'vendor rate', 'rate']),
      vendorCurrency:       String(_cv(row, ['vendor currency', 'currency', 'curr']) || 'INR').trim().toUpperCase(),
      exchangeRate:         _cn(row, ['exchange rate', 'ex rate', 'fx rate', 'exch rate']) || 1,
      unitCostInr:          _cn(row, ['unit cost inr', 'unit cost (inr)', 'cost inr', 'unit cost']),
      totalUnitCost:        _cn(row, ['total unit cost', 'total unit cost (o2c)', 'o2c unit cost', 'total cost']),
      customDuty:           _cn(row, ['custom duty', 'customs duty', 'custom duty (inr)']),
      surcharge:            _cn(row, ['surcharge']),
      totalCustomDuty:      _cn(row, ['total custom duty', 'total customs duty']),
      surchargePercent:     _cn(row, ['surcharge %', 'surcharge percent', 'surcharge%', 'surcharge (%)']),
      dutyPercent:          _cn(row, ['duty %', 'duty percent', 'duty%', 'duty (%)']),
      freightOnly:          _cn(row, ['freight only', 'freight', 'freight cost']),
      otherExpenses:        _cn(row, ['other expenses', 'other expense', 'other exp']),
      totalFreight:         _cn(row, ['total freight', 'freight total']),
      totalUnitLandedCost:  _cn(row, ['total unit landed cost', 'landed cost', 'total landed cost']),
      totalBomCost:         _cn(row, ['total bom cost', 'bom cost', 'total cost (bom)']),
      /* sourcing */
      supplierName:         String(_cv(row, ['supplier name', 'supplier', 'vendor name', 'vendor']) || ''),
      country:              String(_cv(row, ['country', 'country of origin']) || ''),
      leadTime:             String(_cv(row, ['lead time', 'lead time (days)', 'leadtime']) || ''),
      /* computed after parsing */
      urgency:              _calcUrgency(String(_cv(row, ['lead time', 'lead time (days)', 'leadtime']) || '')),
      subAssemblyId:        '',   // filled in Step 3
      saBreakdown:          [],   // filled in Step 2
      tab1Qty:              _cn(row, ['quantity', 'qty', 'total qty', 'total quantity']),
    };

    partMap[key]  = part;
    partOrder.push(key);
  });

  /* ── STEP 2: Parse sub-assembly tabs (Sheet[1+]) ── */
  var saCount = sheetNames.length - 1;
  _prog(true, 'Parsing ' + saCount + ' sub-assembly tab' + (saCount !== 1 ? 's' : '') + '…');

  for (var si = 1; si < sheetNames.length; si++) {
    var saName  = sheetNames[si].trim();   // e.g. "O2C-EC-SA-001"
    var saSheet = wb.Sheets[sheetNames[si]];
    var saRows  = XLSX.utils.sheet_to_json(saSheet, { defval: '' });

    saRows.forEach(function (row, ridx) {
      var pn = _cv(row, ['part number', 'part_number', 'part no', 'part no.', 'partno', 'partnumber', 'part#']) || '';
      pn = String(pn).trim();
      if (!pn) return;

      var key     = pn.toLowerCase();
      var qty     = _cn(row, ['quantity', 'qty', 'qty in sa', 'qty (in sa)']);
      var sno     = String(_cv(row, ['s.no', 's.no.', 'sno', 's no', 'serial no', 'sl no']) || (ridx + 1));
      var fin     = String(_cv(row, ['finalized', 'finalised']) || '—');

      if (partMap[key]) {
        /* ─ Part exists in Tab 1: enrich blanks + append SA entry ─ */
        var p = partMap[key];

        // Merge descriptive fields that Tab 1 may have left blank
        if (!p.partDesc)
          p.partDesc       = String(_cv(row, ['part description', 'part desc', 'description', 'desc']) || p.partDesc || '');
        if (!p.hsnCode)
          p.hsnCode        = String(_cv(row, ['hsn code', 'hsn', 'hsncode', 'hsn/sac']) || p.hsnCode || '');
        if (!p.partType)
          p.partType       = String(_cv(row, ['part type', 'parttype', 'type']) || p.partType || '');
        if (!p.reworkRequired || p.reworkRequired === 'No')
          p.reworkRequired = String(_cv(row, ['rework required', 'rework req', 'rework']) || p.reworkRequired || 'No');
        if (!p.material)
          p.material       = String(_cv(row, ['material', 'material of construction']) || p.material || '');
        if (!p.revisionNo)
          p.revisionNo     = String(_cv(row, ['revision no', 'rev no', 'revision']) || p.revisionNo || '');

        // Only add one entry per SA tab per part
        var alreadyIn = p.saBreakdown.some(function (s) { return s.id === saName; });
        if (!alreadyIn) {
          p.saBreakdown.push({ id: saName, qty: qty, sno: sno, finalized: fin });
        }

      } else {
        /* ─ Part only in SA tab, not in Tab 1 (stub row) ─ */
        var stub = {
          id:                   key + '_stub_sa' + si + '_' + ridx,
          sno:                  sno,
          finalized:            fin,
          partNumber:           pn,
          partName:             String(_cv(row, ['part name', 'partname', 'name']) || ''),
          partDesc:             String(_cv(row, ['part description', 'part desc', 'description']) || ''),
          hsnCode:              String(_cv(row, ['hsn code', 'hsn', 'hsncode']) || ''),
          partType:             String(_cv(row, ['part type', 'parttype', 'type']) || ''),
          reworkRequired:       String(_cv(row, ['rework required', 'rework req', 'rework']) || 'No'),
          reworkDrawingRef:     '',
          partSubCategory:      '',
          partCategory:         '',
          material:             String(_cv(row, ['material', 'material of construction']) || ''),
          revisionNo:           String(_cv(row, ['revision no', 'rev no']) || ''),
          quantity:             qty,
          uom:                  String(_cv(row, ['uom', 'unit']) || 'PCS'),
          unitRateVendor:       0, vendorCurrency: 'INR', exchangeRate: 1,
          unitCostInr: 0, totalUnitCost: 0, customDuty: 0, surcharge: 0, totalCustomDuty: 0,
          surchargePercent: 0, dutyPercent: 0, freightOnly: 0, otherExpenses: 0,
          totalFreight: 0, totalUnitLandedCost: 0, totalBomCost: 0,
          supplierName: '', country: '', leadTime: '', urgency: 'low',
          subAssemblyId: saName,
          saBreakdown:   [{ id: saName, qty: qty, sno: sno, finalized: fin }],
          tab1Qty:       qty,
        };
        partMap[key] = stub;
        partOrder.push(key);
      }
    });
  }

  /* ── STEP 3: Build subAssemblyId for each part ── */
  partOrder.forEach(function (key) {
    var p = partMap[key];
    if (!p) return;
    p.subAssemblyId = p.saBreakdown.map(function (s) { return s.id; }).join(',');
  });

  /* ── STEP 4: Assemble final array (Tab 1 order first, then SA-only stubs) ── */
  var parts = partOrder.map(function (k) { return partMap[k]; }).filter(Boolean);

  if (!parts.length) { showToast('No valid parts found — check that Tab 1 has a "Part Number" column', 'error'); _prog(false); return; }

  var saTabsFound    = sheetNames.slice(1).filter(function (n) { return n.trim(); }).length;
  var partsWithSA    = parts.filter(function (p) { return p.saBreakdown.length > 0; }).length;
  var partsMultiSA   = parts.filter(function (p) { return p.saBreakdown.length > 1; }).length;

  _prog(true, 'Saving ' + parts.length + ' parts to database…');

  var mode        = (document.getElementById('upload-mode') || {}).value || 'replace';
  var savePromise = (mode === 'replace')
    ? BomDB.clearAndInsert('bom_parts', parts)
    : BomDB.putAll('bom_parts', parts);

  savePromise.then(function () {
    loadBomData(parts);
    _ucOk('bom',
      parts.length + ' parts · '
      + saTabsFound + ' SA tab' + (saTabsFound !== 1 ? 's' : '')
      + ' · ' + partsWithSA + ' mapped'
    );
    showToast(
      '✓ BOM uploaded: ' + parts.length + ' parts · '
      + saTabsFound + ' sub-assembly tab' + (saTabsFound !== 1 ? 's' : '')
      + ' · ' + partsMultiSA + ' parts span multiple SAs',
      'success'
    );
    BomDB.setMeta('bom_uploaded_at', new Date().toISOString());
    adminRefreshStats();
    _prog(false);
  }).catch(function (err) {
    showToast('DB save error: ' + err.message, 'error');
    _prog(false);
  });
}

/* ══════════════════════════════════════════════
   STORE INVENTORY PARSER
   Single-sheet, all columns preserved verbatim.
══════════════════════════════════════════════ */
function _parseInv(wb) {
  var sheetNames = wb.SheetNames;
  if (!sheetNames.length) { showToast('Excel file appears empty', 'error'); _prog(false); return; }

  _prog(true, 'Parsing Store Inventory…');
  var sheet      = wb.Sheets[sheetNames[0]];
  var rawRows    = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  var rawHeaders = _extractHeaders(sheet);

  if (!rawRows.length) { showToast('No data rows found in Store sheet', 'error'); _prog(false); return; }

  var items = rawRows.map(function (row) {
    var pn   = _cv(row, ['part number', 'part_number', 'part no', 'part no.', 'partno', 'partnumber']) || '';
    var curr = String(_cv(row, ['currency', 'vendor currency', 'curr']) || 'INR').trim().toUpperCase();
    return {
      partNumber:    String(pn).trim(),
      _partName:     String(_cv(row, ['part name', 'partname', 'name']) || ''),
      _unitRate:     _cn(row, ['unit rate', 'rate', 'unitrate', 'unit price']),
      _currency:     curr || 'INR',
      _country:      String(_cv(row, ['country', 'country of origin']) || ''),
      _quantity:     _cn(row, ['quantity', 'qty', 'total qty']),
      _unit:         String(_cv(row, ['unit', 'uom', 'unit of measurement']) || 'PCS'),
      _storeInvQty:  _cn(row, ['store inventory', 'store inv', 'storeinventory', 'current stock', 'currentstock', 'stock']),
      _prodLineQty:  _cn(row, ['production line', 'prodline', 'prod line', 'prod. line']),
      _inventory128: _cn(row, ['inventory 128', 'inv 128', 'inventory128']),
      _rawRow:       row,
      _rawHeaders:   rawHeaders,
    };
  }).filter(function (i) { return i.partNumber; });

  if (!items.length) { showToast('No valid rows found — ensure sheet has a "Part Number" column', 'error'); _prog(false); return; }

  _prog(true, 'Saving ' + items.length + ' items…');

  var mode        = (document.getElementById('upload-mode') || {}).value || 'replace';
  var savePromise = (mode === 'replace')
    ? BomDB.clearAndInsert('store_inventory', items)
    : BomDB.putAll('store_inventory', items);

  savePromise.then(function () {
    loadStoreData(items);
    _ucOk('inv', items.length + ' items · ' + rawHeaders.length + ' columns');
    showToast('✓ Store uploaded: ' + items.length + ' items', 'success');
    BomDB.setMeta('inv_uploaded_at', new Date().toISOString());
    adminRefreshStats();
    _prog(false);
  }).catch(function (err) {
    showToast('DB save error: ' + err.message, 'error');
    _prog(false);
  });
}

/* ── Extract clean header row from sheet ────── */
function _extractHeaders(sheet) {
  if (!sheet['!ref']) return [];
  var range = XLSX.utils.decode_range(sheet['!ref']);
  var headers = [];
  for (var C = range.s.c; C <= range.e.c; C++) {
    var cell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c: C })];
    var h = cell ? String(cell.v || '').trim() : '';
    if (h) headers.push(h);
  }
  return headers;
}

/* ══════════════════════════════════════════════
   URGENCY — derived from lead time string
   "45 days" / "6 weeks" / "2 months" / "60"
      >60d  → critical
      >30d  → high
      >14d  → medium
      ≤14d  → low
══════════════════════════════════════════════ */
function _calcUrgency(lt) {
  if (!lt) return 'low';
  var days = _parseDays(lt);
  if (days === null) return 'low';
  if (days > 60)  return 'critical';
  if (days > 30)  return 'high';
  if (days > 14)  return 'medium';
  return 'low';
}

function _parseDays(lt) {
  lt = String(lt).toLowerCase().trim();
  var bare = parseFloat(lt);
  if (!isNaN(bare) && bare > 0) return bare;   // plain number = days
  var md = lt.match(/([\d.]+)\s*(?:day|days|d\b)/);   if (md)  return parseFloat(md[1]);
  var mw = lt.match(/([\d.]+)\s*(?:week|weeks|wk|w\b)/); if (mw) return parseFloat(mw[1]) * 7;
  var mm = lt.match(/([\d.]+)\s*(?:month|months|mo\b)/); if (mm) return parseFloat(mm[1]) * 30;
  return null;
}

/* ══════════════════════════════════════════════
   PROCUREMENT BASELINE PARSER
   Single-sheet upload to seed procurement_data.
   All MOQ columns mapped. Existing rows merged.
══════════════════════════════════════════════ */
function _parseProc(wb) {
  var sheetNames = wb.SheetNames;
  if (!sheetNames.length) { showToast('Excel file appears empty', 'error'); _prog(false); return; }

  _prog(true, 'Parsing Procurement Baseline…');
  var rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetNames[0]], { defval: '' });

  if (!rows.length) { showToast('No data rows found in sheet', 'error'); _prog(false); return; }

  var items = rows.map(function (row) {
    var pn = String(_cv(row, ['part number','part_number','part no','partno','part#']) || '').trim();
    if (!pn) return null;
    return {
      part_number:       pn,
      supplier_name:     String(_cv(row, ['supplier name','supplier','vendor name','vendor']) || ''),
      quantity:          _cn(row, ['quantity','qty','total qty']),
      uom:               String(_cv(row, ['uom','unit','unit of measurement']) || 'PCS'),
      unit_rate:         _cn(row, ['unit rate','rate','unitrate','unit price']),
      total_rm_cost:     _cn(row, ['total rm cost','total rm cost for bom','rm cost','total cost']),
      currency:          String(_cv(row, ['currency','curr','vendor currency']) || 'INR').trim().toUpperCase(),
      country:           String(_cv(row, ['country','country of origin']) || ''),
      /* MOQ 1000 */
      price_moq_1000:    _cn(row, ['price at moq 1000','price@moq1000','moq 1000','moq1000 price']),
      currency_moq_1000: String(_cv(row, ['currency for moq 1000','currency moq 1000','moq1000 currency']) || '').trim().toUpperCase() || 'INR',
      country_moq_1000:  String(_cv(row, ['country for moq 1000','country moq 1000','moq1000 country']) || ''),
      /* MOQ 3000 */
      price_moq_3000:    _cn(row, ['price at moq 3000','price@moq3000','moq 3000','moq3000 price']),
      currency_moq_3000: String(_cv(row, ['currency for moq 3000','currency moq 3000','moq3000 currency']) || '').trim().toUpperCase() || 'INR',
      country_moq_3000:  String(_cv(row, ['country for moq 3000','country moq 3000','moq3000 country']) || ''),
      /* MOQ 5000 */
      price_moq_5000:    _cn(row, ['price at moq 5000','price@moq5000','moq 5000','moq5000 price']),
      currency_moq_5000: String(_cv(row, ['currency for moq 5000','currency moq 5000','moq5000 currency']) || '').trim().toUpperCase() || 'INR',
      country_moq_5000:  String(_cv(row, ['country for moq 5000','country moq 5000','moq5000 country']) || ''),
      updated_at:        new Date().toISOString(),
    };
  }).filter(Boolean);

  if (!items.length) { showToast('No valid rows found — ensure sheet has a "Part Number" column', 'error'); _prog(false); return; }

  _prog(true, 'Saving ' + items.length + ' procurement rows…');

  /* Always merge (never wipe procurement data — admins seed, editors enrich) */
  _procUpsertAll(items).then(function () {
    /* Reload in Proc module if it's available */
    if (typeof Proc !== 'undefined' && typeof allBom !== 'undefined') Proc.load(allBom);
    _ucOk('proc', items.length + ' rows · ' + sheetNames[0]);
    showToast('✓ Procurement baseline uploaded: ' + items.length + ' rows', 'success');
    BomDB.setMeta('proc_uploaded_at', new Date().toISOString());
    adminRefreshStats();
    _prog(false);
  }).catch(function (err) {
    showToast('DB save error: ' + err.message, 'error');
    _prog(false);
  });
}

async function _procUpsertAll(items) {
  function _H() {
    return { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + (window._authToken || SUPABASE_KEY) };
  }
  var BATCH = 400;
  for (var i = 0; i < items.length; i += BATCH) {
    var res = await fetch(SUPABASE_URL + '/rest/v1/procurement_data', {
      method: 'POST',
      headers: Object.assign({}, _H(), { 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(items.slice(i, i + BATCH))
    });
    if (!res.ok) throw new Error('Procurement upsert error: ' + await res.text());
  }
}

/* ══════════════════════════════════════════════
   COLUMN LOOKUP HELPERS
══════════════════════════════════════════════ */

/**
 * _cv — Find a value from a row object using a list of possible column names.
 *       Tries exact match first, then normalised match.
 */
function _cv(row, keys) {
  // Build a normalised → original key map once per row call for performance
  var normMap = {};
  for (var rk in row) { normMap[_norm(rk)] = rk; }

  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    // Exact
    if (row[k] !== undefined && row[k] !== '') return row[k];
    // Normalised
    var nk = _norm(k);
    if (normMap[nk] !== undefined) {
      var orig = normMap[nk];
      if (row[orig] !== undefined && row[orig] !== '') return row[orig];
    }
  }
  return undefined;
}

/** _cn — Get a numeric value (0 if missing/non-numeric). */
function _cn(row, keys) {
  var v = _cv(row, keys);
  if (v === undefined || v === null || v === '') return 0;
  var n = parseFloat(String(v).replace(/[,₹$€£¥\s]/g, ''));
  return isNaN(n) ? 0 : n;
}

/* ══════════════════════════════════════════════
   UI HELPERS
══════════════════════════════════════════════ */
function _ucOk(type, msg) {
  var ok = document.getElementById('uc-' + type + '-ok');
  var ts = document.getElementById('uc-' + type + '-ts');
  if (ok) { ok.style.display = ''; ok.textContent = '✓ ' + msg; }
  if (ts) ts.textContent = new Date().toLocaleTimeString('en-IN');
}

function _prog(show, label) {
  var w = document.getElementById('prog-wrap');
  var l = document.getElementById('prog-label');
  if (w) w.classList.toggle('visible', !!show);
  if (l && label) l.textContent = label;
}

function showToast(msg, type) {
  var t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className   = 'toast show ' + (type || '');
  clearTimeout(t._timer);
  t._timer = setTimeout(function () { t.classList.remove('show'); }, 3800);
}