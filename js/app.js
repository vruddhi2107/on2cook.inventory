/**
 * app.js — On2Cook BOM Portal · Role-aware rendering
 * Roles: viewer (read-only) | editor (edit data) | admin (full)
 */

var allBom       = [];
var allStore     = [];
var bomFiltered  = [];
var bomSearch    = '';
var bomSAFilter  = '';
var bomTypeFilter= '';
var bomUrgFilter = '';
var bomSortKey   = 'partNumber';
var bomSortDir   = 'asc';
storeSort = '';
storeSort = 'asc';
var storeSearch       = '';
var storeCurrFilter   = '';   // filter by currency code
var storeCntryFilter  = '';   // filter by country
var bomExpanded  = {};
var fxRates      = { USD:84, CNY:12, EUR:91, GBP:107 };
var storeConvertCol = {};

/* ════════════════════════════════════════
   DATA LOADERS
════════════════════════════════════════ */
function loadBomData(rows) {
  allBom = rows || []; bomExpanded = {};
  _populateBomFilters(); _applyBomFilters(); _renderBomStats();
  _renderAccessBanner('bom');
}
function loadStoreData(rows) {
  allStore = rows || [];
  _renderStore();
  _renderAccessBanner('store');
}

/**
 * _renderAccessBanner(tab)
 * Shows a subtle permission ribbon on the tab panel header area.
 * Editors see which tabs they can edit. Viewers see read-only notice.
 */
function _renderAccessBanner(tab) {
  var bannerId = 'access-banner-' + tab;
  var existing = document.getElementById(bannerId);
  if (existing) existing.remove();

  if (typeof Auth === 'undefined' || !Auth.isLoggedIn()) return;

  var r       = Auth.role();
  var canEdit = Auth.canEditTab(tab);
  var panel   = document.getElementById('panel-' + tab);
  if (!panel) return;

  var banner = document.createElement('div');
  banner.id  = bannerId;

  if (r === 'admin') {
    /* Admins: no banner needed — they have full access */
    return;
  } else if (r === 'editor' && canEdit) {
    banner.style.cssText = 'display:flex;align-items:center;gap:8px;background:#EAFBEA;border:1px solid #A0E0A0;border-left:4px solid #1A7A1A;padding:8px 14px;margin-bottom:12px;font-size:12px;color:#1A5A1A';
    banner.innerHTML = '<span style="font-size:14px">✏️</span><span><strong>Editor access</strong> — you can edit data in this tab and save changes to the database.</span>';
  } else if (r === 'editor' && !canEdit) {
    banner.style.cssText = 'display:flex;align-items:center;gap:8px;background:#FFF8E1;border:1px solid #FFE082;border-left:4px solid #F9A825;padding:8px 14px;margin-bottom:12px;font-size:12px;color:#7A5800';
    banner.innerHTML = '<span style="font-size:14px">🔒</span><span><strong>View only</strong> — your editor access does not include this tab. Contact an admin to request edit permission.</span>';
  } else if (r === 'viewer') {
    banner.style.cssText = 'display:flex;align-items:center;gap:8px;background:var(--g1);border:1px solid var(--g2);border-left:4px solid var(--g4);padding:8px 14px;margin-bottom:12px;font-size:12px;color:var(--g5)';
    banner.innerHTML = '<span style="font-size:14px">👁</span><span><strong>Read-only access</strong> — you can view all data but cannot make edits.</span>';
  } else {
    return;
  }

  panel.insertBefore(banner, panel.firstChild);
}

/* ════════════════════════════════════════
   DEVICE BOM
════════════════════════════════════════ */
function handleBomSearch(v) { bomSearch = v.trim().toLowerCase(); _applyBomFilters(); }

function _applyBomFilters() {
  bomFiltered = allBom.filter(function (p) {
    if (bomSearch && !(p.partNumber + ' ' + p.partName).toLowerCase().includes(bomSearch)) return false;
    if (bomSAFilter) {
      var ids = (p.subAssemblyId || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      if (!ids.includes(bomSAFilter)) return false;
    }
    if (bomTypeFilter && p.partType !== bomTypeFilter) return false;
    if (bomUrgFilter  && p.urgency  !== bomUrgFilter)  return false;
    return true;
  });
  _sortBom(); _renderBomTable(); _renderBomStats();
}

function _sortBom() {
  var urgO = { critical:0, high:1, medium:2, low:3 };
  bomFiltered.sort(function (a, b) {
    var av = a[bomSortKey] !== undefined ? a[bomSortKey] : '';
    var bv = b[bomSortKey] !== undefined ? b[bomSortKey] : '';
    if (bomSortKey === 'urgency') { av = urgO[av]||4; bv = urgO[bv]||4; }
    if (typeof av === 'number' && typeof bv === 'number') return bomSortDir==='asc' ? av-bv : bv-av;
    return bomSortDir==='asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  });
}

function bomSort(key) {
  bomSortDir = bomSortKey === key ? (bomSortDir==='asc'?'desc':'asc') : 'asc';
  bomSortKey = key;
  _sortBom(); _renderBomTable();
  document.querySelectorAll('#bom-head th[data-k]').forEach(function (th) {
    th.classList.remove('sa','sd');
    if (th.getAttribute('data-k') === key) th.classList.add(bomSortDir==='asc'?'sa':'sd');
  });
}

function storeSort(key) {
  // Toggle direction if same key, else default to asc
  storeSort = (storeSort === key) ? (storeSort === 'asc' ? 'desc' : 'asc') : 'asc';
  storeSort = key;

  allStore.sort(function(a, b) {
    // Get values from the rawRow or the processed properties
    var av = (a._rawRow && a._rawRow[key] !== undefined) ? a._rawRow[key] : (a[key] || '');
    var bv = (b._rawRow && b._rawRow[key] !== undefined) ? b._rawRow[key] : (b[key] || '');

    // Handle Numeric sorting
    var an = parseFloat(av);
    var bn = parseFloat(bv);
    if (!isNaN(an) && !isNaN(bn)) {
       return storeSort === 'asc' ? an - bn : bn - an;
    }

    // Handle String sorting
    av = String(av).toLowerCase();
    bv = String(bv).toLowerCase();
    if (av < bv) return storeSort === 'asc' ? -1 : 1;
    if (av > bv) return storeSort === 'asc' ? 1 : -1;
    return 0;
  });

  _renderStore(); // Re-render the UI with sorted data
}

function clearBomFilters() {
  bomSearch=''; bomSAFilter=''; bomTypeFilter=''; bomUrgFilter='';
  ['bom-search','bom-sa','bom-type','bom-urg'].forEach(function (id) {
    var e = document.getElementById(id); if (e) e.value = '';
  });
  _applyBomFilters();
}

function toggleBomRow(pn) {
  bomExpanded[pn] = !bomExpanded[pn];
  var row = document.getElementById('bom-exp-' + _eid(pn));
  var btn = document.getElementById('bom-btn-' + _eid(pn));
  if (row) row.style.display = bomExpanded[pn] ? '' : 'none';
  if (btn) {
    btn.textContent = bomExpanded[pn] ? '▲ hide' : '▼ breakdown';
    btn.style.background = bomExpanded[pn] ? 'var(--red)' : '#444';
  }
}

function _populateBomFilters() {
  var saSet = new Set(), typeSet = new Set();
  allBom.forEach(function (p) {
    (p.subAssemblyId || '').split(',').forEach(function (s) { var t = s.trim(); if (t) saSet.add(t); });
    if (p.partType) typeSet.add(p.partType);
  });
  _fillSel('bom-sa',   Array.from(saSet).sort(),   'All Sub-Assemblies');
  _fillSel('bom-type', Array.from(typeSet).sort(),  'All Part Types');
}

function _renderBomStats() {
  var saSet = new Set();
  allBom.forEach(function (p) { (p.subAssemblyId||'').split(',').forEach(function (s) { var t=s.trim(); if(t) saSet.add(t); }); });
  var tv = allBom.reduce(function (s, p) { return s + (p.totalUnitLandedCost||0); }, 0);
  _t('bs-total', allBom.length || '—');
  _t('bs-crit',  allBom.filter(function (p) { return p.urgency==='critical'; }).length || '—');
  _t('bs-high',  allBom.filter(function (p) { return p.urgency==='high'; }).length || '—');
  _t('bs-sa',    saSet.size || '—');
  _t('bs-val',   tv ? ('₹' + _fmtN(tv,0)) : '—');
  _t('bom-count', bomFiltered.length + ' of ' + allBom.length + ' parts');
}

/* ── BOM Table ── */
function _renderBomTable() {
  var tbody = document.getElementById('bom-tbody');
  var empty = document.getElementById('bom-empty');

  if (!allBom.length) {
    if (tbody) tbody.innerHTML = '';
    if (empty) empty.style.display = 'block';
    _t('bom-meta', 'No data'); return;
  }
  if (empty) empty.style.display = 'none';
  _t('bom-meta', bomFiltered.length + ' unique parts');
  if (!tbody) return;

  var urgBg = { critical:'#FFEAEA', high:'#FFF3EA', medium:'#FFFBEA', low:'#EAFBEA' };
  var urgFg = { critical:'#C80000', high:'#D46000', medium:'#B89000', low:'#2A7D2A' };
  var urgBr = { critical:'#FFBBBB', high:'#FFD0A0', medium:'#FFE97A', low:'#A0E0A0' };
  var COL   = 21;

  var numericKeys = [
    null, null, null, null, null, null, null,
    'unitRateVendor', 'quantity', null,
    'totalUnitCost', 'customDuty', 'surchargePercent', 'dutyPercent',
    'totalFreight', 'totalUnitLandedCost',
    null, null, null, null, null,
  ];

  var colTotals = numericKeys.map(function (key) {
    if (!key) return null;
    return bomFiltered.reduce(function (acc, p) {
      var v = p[key]; return acc + (typeof v === 'number' ? v : 0);
    }, 0);
  });

  tbody.innerHTML = bomFiltered.map(function (p) {
    var uc  = p.urgency || 'low';
    var fn  = function (n) { return (typeof n==='number' && n!==0) ? _fmtN(n,2) : '—'; };
    var fI  = function (n) { return (typeof n==='number' && n!==0) ? '₹' + _fmtN(n,2) : '—'; };
    var fP  = function (n) { return (typeof n==='number' && n!==0) ? _fmtN(n,2) + '%' : '—'; };

    var saList  = p.saBreakdown || [];
    var pnSafe  = _eid(p.partNumber);
    var isExp   = !!bomExpanded[p.partNumber];

    var saCell;
    if (!saList.length) {
      saCell = '<span style="color:#AAA;font-size:10px;font-family:var(--FM)">no SA data</span>';
    } else {
      var first = saList[0];
      saCell = '<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">' +
        '<span style="background:#1E1E1E;color:white;padding:2px 7px;font-family:var(--FM);font-size:9.5px;white-space:nowrap">' +
        _e(first.id) + ': <strong>' + _fmtN(first.qty,2) + '</strong></span>' +
        (saList.length > 1
          ? '<button id="bom-btn-' + pnSafe + '" onclick="toggleBomRow(\'' + _ea(p.partNumber) + '\')" ' +
            'style="background:' + (isExp?'var(--red)':'#444') + ';color:white;border:none;padding:2px 8px;font-family:var(--FH);font-size:10px;font-weight:700;cursor:pointer">' +
            (isExp ? '▲ hide' : '▼ breakdown') +
            ' <span style="opacity:.6;font-size:9px">+' + (saList.length-1) + '</span></button>'
          : '') +
        '</div>';
    }

    var urgBadge = '<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;font-family:var(--FH);font-size:10px;font-weight:700;background:' + urgBg[uc] + ';color:' + urgFg[uc] + ';border:1px solid ' + urgBr[uc] + '">' +
      '<span style="width:5px;height:5px;border-radius:50%;background:' + urgFg[uc] + '"></span>' +
      uc.charAt(0).toUpperCase() + uc.slice(1) + '</span>';

    var rwOk = (p.reworkRequired==='Yes'||p.reworkRequired==='YES'||p.reworkRequired==='Y');
    var rwBadge = rwOk
      ? '<span style="background:#FFF0F0;color:#C80000;padding:2px 7px;font-family:var(--FH);font-size:10px;font-weight:700">YES</span>'
      : '<span style="background:var(--g1);color:#999;padding:2px 7px;font-family:var(--FH);font-size:10px">No</span>';

    var rateCell = '<div style="text-align:right">' +
      '<div style="font-family:var(--FM);font-size:11.5px;font-weight:600">' + fn(p.unitRateVendor) + '</div>' +
      '<div style="font-size:9px;color:#999;margin-top:1px;font-family:var(--FM)">' + _e(p.vendorCurrency) + '</div>' +
      '</div>';

    var mainRow = '<tr onmouseover="this.style.background=\'#FFF7F7\'" onmouseout="this.style.background=\'\'">' +
      _td('<span style="font-family:var(--FM);font-size:11.5px;color:var(--red);font-weight:600">' + _e(p.partNumber) + '</span>') +
      _td('<strong style="font-size:12px">' + _e(p.partName) + '</strong>', '', 160) +
      _td(_e(p.partDesc)||'—', 'color:#666;font-size:11px', 160) +
      _td('<span style="font-family:var(--FM);font-size:11px">' + (_e(p.hsnCode)||'—') + '</span>') +
      _td(p.partType ? '<span style="background:#EEF2FF;color:#3344AA;padding:2px 7px;font-family:var(--FH);font-size:10px;font-weight:600">' + _e(p.partType) + '</span>' : '—') +
      _td(rwBadge) +
      _td(_e(p.material)||'—', 'font-size:11px', 120) +
      '<td style="padding:8px 10px;border-right:1px solid #EEE;vertical-align:middle">' + rateCell + '</td>' +
      _tdr('<strong style="font-size:13px">' + fn(p.quantity) + '</strong>') +
      _td('<span style="font-family:var(--FM);font-size:11px">' + (_e(p.uom)||'—') + '</span>') +
      _tdr(fI(p.totalUnitCost)) +
      _tdr(fI(p.customDuty)) +
      _tdr(fP(p.surchargePercent)) +
      _tdr(fP(p.dutyPercent)) +
      _tdr(fI(p.totalFreight)) +
      _tdr('<strong>' + fI(p.totalUnitLandedCost) + '</strong>') +
      _td(_e(p.supplierName)||'—', 'font-size:11px', 130) +
      _td(_e(p.country)||'—', 'font-size:11px') +
      '<td style="padding:8px 10px;border-right:1px solid #EEE;vertical-align:middle">' +
        '<span style="font-family:var(--FM);font-size:11px">' + (_e(p.leadTime)||'—') + '</span>' +
      '</td>' +
      _td(urgBadge) +
      '<td style="padding:8px 10px;border-right:1px solid #EEE;vertical-align:middle;min-width:170px">' + saCell + '</td>' +
      '</tr>';

    var expRow = '';
    if (saList.length > 1) {
      var sumSA = saList.reduce(function (s, r) { return s + (r.qty||0); }, 0);
      var saRowsHtml = saList.map(function (r, idx) {
        return '<tr style="background:' + (idx%2===0?'#EEEEF8':'#E6E6F2') + '">' +
          '<td style="padding:6px 12px 6px 32px;border-right:1px solid #CCC;font-family:var(--FM);font-size:10.5px;white-space:nowrap">' +
          '<span style="width:5px;height:5px;border-radius:50%;background:var(--red);display:inline-block;margin-right:6px;vertical-align:middle"></span>' +
          _e(r.id) + '</td>' +
          '<td style="padding:6px 14px;border-right:1px solid #CCC;text-align:right;font-family:var(--FM);font-size:12.5px;font-weight:700;color:#0060A0">' + _fmtN(r.qty||0,2) + '</td>' +
          '<td style="padding:6px 14px;border-right:1px solid #CCC;font-family:var(--FM);font-size:10px;color:#888">' + (_e(r.finalized)||'—') + '</td>' +
          '<td style="padding:6px 14px;font-family:var(--FM);font-size:10px;color:#999">' + (_e(r.sno)||'—') + '</td>' +
          '</tr>';
      }).join('');

      expRow = '<tr id="bom-exp-' + pnSafe + '" style="display:' + (isExp?'':'none') + '">' +
        '<td colspan="' + COL + '" style="padding:0;border-bottom:2px solid #AAAACC">' +
        '<div style="background:#22223A">' +
        '<div style="padding:5px 12px 5px 32px;font-family:var(--FH);font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#8888BB">Sub-Assembly Breakdown — ' + _e(p.partNumber) + '</div>' +
        '<table style="width:100%;border-collapse:collapse">' +
        '<thead><tr style="background:#2A2A4A">' +
        '<th style="padding:6px 12px 6px 32px;color:#7070A0;font-family:var(--FH);font-size:10px;letter-spacing:.8px;text-transform:uppercase;text-align:left">Sub-Assembly</th>' +
        '<th style="padding:6px 14px;color:#7070A0;font-family:var(--FH);font-size:10px;letter-spacing:.8px;text-transform:uppercase;text-align:right">Qty in SA</th>' +
        '<th style="padding:6px 14px;color:#7070A0;font-family:var(--FH);font-size:10px;letter-spacing:.8px;text-transform:uppercase;text-align:left">Finalized</th>' +
        '<th style="padding:6px 14px;color:#7070A0;font-family:var(--FH);font-size:10px;letter-spacing:.8px;text-transform:uppercase;text-align:left">S.No.</th>' +
        '</tr></thead><tbody>' + saRowsHtml +
        '<tr style="background:#22223A">' +
        '<td style="padding:6px 12px 6px 32px;font-family:var(--FH);font-size:10px;color:#666;text-transform:uppercase;letter-spacing:.5px">' + saList.length + ' sub-assemblies</td>' +
        '<td style="padding:6px 14px;text-align:right;font-family:var(--FM);font-size:12px;font-weight:700;color:white">' + _fmtN(sumSA,2) +
        ' <span style="font-size:9px;color:#555;font-weight:400">/ ' + _fmtN(p.quantity||0,2) + ' total</span></td>' +
        '<td colspan="2"></td></tr>' +
        '</tbody></table></div></td></tr>';
    }

    return mainRow + expRow;
  }).join('') + _buildBomTotalRow(colTotals, COL);
}

function _buildBomTotalRow(colTotals, totalCols) {
  if (!bomFiltered.length) return '';
  var fI = function (n) { return n ? '₹' + _fmtN(n,2) : '—'; };
  var fn = function (n) { return n ? _fmtN(n,2) : '—'; };
  var BASE = 'padding:9px 10px;border-right:1px solid #3D3D3D;vertical-align:middle;white-space:nowrap;border-top:2px solid var(--red)';
  var NUM  = BASE + ';text-align:right;font-family:var(--FM);font-size:12px';

  var cells = [
    '<td style="' + BASE + ';background:#1A1A1A"><span style="font-family:var(--FH);font-size:13px;font-weight:800;letter-spacing:1.5px;color:white;text-transform:uppercase">TOTAL</span><div style="font-size:9px;color:#888;font-family:var(--FM);margin-top:2px">' + bomFiltered.length + ' parts</div></td>',
    '<td style="' + BASE + ';background:#1C1C1C"></td>',
    '<td style="' + BASE + ';background:#1C1C1C"></td>',
    '<td style="' + BASE + ';background:#1C1C1C"></td>',
    '<td style="' + BASE + ';background:#1C1C1C"></td>',
    '<td style="' + BASE + ';background:#1C1C1C"></td>',
    '<td style="' + BASE + ';background:#1C1C1C"></td>',
    '<td style="' + NUM + ';background:#1C1C1C"><span style="color:#CCC">' + fn(colTotals[7]) + '</span><div style="font-size:9px;color:#666;margin-top:1px">sum</div></td>',
    '<td style="' + NUM + ';background:#1A1A1A"><strong style="font-size:14px;color:white">' + fn(colTotals[8]) + '</strong></td>',
    '<td style="' + BASE + ';background:#1C1C1C"></td>',
    '<td style="' + NUM + ';background:#1A1A1A"><strong style="color:#7ABFFF">' + fI(colTotals[10]) + '</strong></td>',
    '<td style="' + NUM + ';background:#1A1A1A"><strong style="color:#7ABFFF">' + fI(colTotals[11]) + '</strong></td>',
    '<td style="' + NUM + ';background:#1A1A1A">' + (bomFiltered.length ? '<span style="color:#AAA">' + _fmtN(colTotals[12]/bomFiltered.length,2) + '%</span><div style="font-size:9px;color:#666;margin-top:1px">avg</div>' : '—') + '</td>',
    '<td style="' + NUM + ';background:#1A1A1A">' + (bomFiltered.length ? '<span style="color:#AAA">' + _fmtN(colTotals[13]/bomFiltered.length,2) + '%</span><div style="font-size:9px;color:#666;margin-top:1px">avg</div>' : '—') + '</td>',
    '<td style="' + NUM + ';background:#1A1A1A"><strong style="color:#7ABFFF">' + fI(colTotals[14]) + '</strong></td>',
    '<td style="' + NUM + ';background:#111;border-left:2px solid var(--red)"><strong style="font-size:13px;color:white">' + fI(colTotals[15]) + '</strong><div style="font-size:9px;color:#888;margin-top:2px">total landed</div></td>',
    '<td style="' + BASE + ';background:#1C1C1C"></td>',
    '<td style="' + BASE + ';background:#1C1C1C"></td>',
    '<td style="' + BASE + ';background:#1C1C1C"></td>',
    '<td style="' + BASE + ';background:#1C1C1C"></td>',
    '<td style="' + BASE + ';background:#1C1C1C"></td>',
  ];
  return '<tr>' + cells.join('') + '</tr>';
}

function exportBOM() {
  if (!bomFiltered.length) { showToast('No BOM data to export', 'info'); return; }
  var data = bomFiltered.map(function (p) {
    return {
      'Part Number': p.partNumber, 'Part Name': p.partName, 'Part Description': p.partDesc,
      'HSN Code': p.hsnCode, 'Part Type': p.partType, 'Rework Required': p.reworkRequired,
      'Material': p.material, 'Vendor Currency': p.vendorCurrency, 'Unit Rate (Vendor)': p.unitRateVendor,
      'Total Qty': p.quantity, 'UOM': p.uom,
      'Total Unit Cost (O2C)': p.totalUnitCost, 'Custom Duty': p.customDuty,
      'Surcharge %': p.surchargePercent, 'Duty %': p.dutyPercent,
      'Total Freight': p.totalFreight, 'Total Unit Landed Cost': p.totalUnitLandedCost,
      'Supplier Name': p.supplierName, 'Country': p.country, 'Lead Time': p.leadTime, 'Urgency': p.urgency,
      'Sub-Assemblies': p.subAssemblyId||'',
      'SA Breakdown': (p.saBreakdown||[]).map(function (s) { return s.id+':'+s.qty; }).join(' | '),
    };
  });

  /* TOTAL row */
  var numCols = ['Unit Rate (Vendor)','Total Qty','Total Unit Cost (O2C)','Custom Duty','Total Freight','Total Unit Landed Cost'];
  var totalRow = { 'Part Number': 'TOTAL' };
  numCols.forEach(function (col) {
    totalRow[col] = data.reduce(function (s, r) { var v = r[col]; return s + (typeof v === 'number' ? v : 0); }, 0);
  });
  data.push(totalRow);

  var ws = XLSX.utils.json_to_sheet(data);
  var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Device BOM');
  XLSX.writeFile(wb, 'On2Cook_Device_BOM.xlsx');
  showToast('✓ Exported ' + (data.length-1) + ' BOM rows + TOTAL', 'success');
}

/* ════════════════════════════════════════
   STORE INVENTORY
════════════════════════════════════════ */
function handleStoreSearch(v)     { storeSearch      = v.trim().toLowerCase(); _renderStore(); }
function handleStoreCurrFilter(v) { storeCurrFilter  = v; _renderStore(); }
function handleStoreCntryFilter(v){ storeCntryFilter = v; _renderStore(); }
function clearStoreFilters() {
  storeSearch=''; storeCurrFilter=''; storeCntryFilter='';
  var si = document.getElementById('store-search-inp');
  var sc = document.getElementById('store-curr-sel');
  var sn = document.getElementById('store-cntry-sel');
  if(si) si.value=''; if(sc) sc.value=''; if(sn) sn.value='';
  _renderStore();
}
function toggleStoreConvert(curr) { storeConvertCol[curr] = !storeConvertCol[curr]; _renderStore(); }
function updateStoreFxRate(curr, v) { fxRates[curr] = parseFloat(v) || fxRates[curr]; _renderStore(); }

function _renderStore() {
  var area = document.getElementById('store-area');
  if (!area) return;

  if (!allStore.length) {
    area.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><div class="empty-title">No Store Inventory Data</div><div class="empty-sub">Admin must upload the Store Inventory file</div></div>';
    return;
  }

  var rawHeaders = (allStore[0]._rawHeaders && allStore[0]._rawHeaders.length)
    ? allStore[0]._rawHeaders : Object.keys(allStore[0]._rawRow || {});

  /* Collect all unique currencies and countries from dataset */
  var allCurrencies = [], allCountries = [];
  allStore.forEach(function(i){
    var c = i._currency;
    if (c && allCurrencies.indexOf(c) === -1) allCurrencies.push(c);
    var n = String((i._rawRow && (i._rawRow['Country'] || i._rawRow['country'])) || i._country || '').trim();
    if (n && allCountries.indexOf(n) === -1) allCountries.push(n);
  });
  allCurrencies.sort(); allCountries.sort();

  /* Non-INR currencies for the FX panel */
  var fxCurrencies = allCurrencies.filter(function(c){ return c !== 'INR'; });

  /* Apply all filters */
  var filtered = allStore.filter(function(i) {
    var matchSearch  = !storeSearch  || (i.partNumber + ' ' + (i._partName||'')).toLowerCase().includes(storeSearch);
    var matchCurr    = !storeCurrFilter  || i._currency === storeCurrFilter;
    var rawCountry   = String((i._rawRow && (i._rawRow['Country'] || i._rawRow['country'])) || i._country || '').trim();
    var matchCountry = !storeCntryFilter || rawCountry === storeCntryFilter;
    return matchSearch && matchCurr && matchCountry;
  });

  /* ── FX Panel ── */
  var fxPanel = '';
  if (fxCurrencies.length) {
    /* Build per-currency converted totals for summary card */
    var convSummary = {};
    fxCurrencies.forEach(function(curr){
      if (!storeConvertCol[curr]) return;
      var rate = fxRates[curr] || 1;
      var total = 0;
      filtered.forEach(function(item){
        if (item._currency !== curr) return;
        rawHeaders.forEach(function(h){
          var sv = String((item._rawRow||{})[h] || '');
          var cn = _norm(h);
          var isMoney = cn.includes('rate')||cn.includes('cost')||cn.includes('value')||cn.includes('amount')||cn.includes('price');
          if (isMoney && sv !== '' && !isNaN(parseFloat(sv))) total += parseFloat(sv) * rate;
        });
      });
      convSummary[curr] = total;
    });

    fxPanel = '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:16px;align-items:flex-start">' +
      /* FX conversion toggles */
      '<div style="flex:1;min-width:280px;background:white;border:1px solid #E6C84A;padding:16px 20px;box-shadow:var(--sh-sm)">' +
        '<div style="font-family:var(--FH);font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#7A5A00;margin-bottom:6px">💱 Currency Conversion</div>' +
        '<div style="font-size:11.5px;color:#888;margin-bottom:12px">Toggle converts display <strong>and</strong> export values. Rate is editable.</div>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
        fxCurrencies.map(function(curr){
          var isOn  = !!storeConvertCol[curr];
          var count = allStore.filter(function(i){ return i._currency===curr; }).length;
          return '<div style="background:'+(isOn?'#FFFBEA':'#F5F5F5')+';border:1.5px solid '+(isOn?'#E6C84A':'#DDD')+';padding:12px 16px;min-width:185px">' +
            '<div style="font-family:var(--FH);font-size:12px;font-weight:700;color:#555;margin-bottom:8px">'+_e(curr)+' <span style="font-weight:400;color:#AAA;font-size:10px">('+count+' items)</span></div>' +
            '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">' +
              '<span style="font-size:11px;color:#888">1 '+_e(curr)+' =</span>' +
              '<input type="number" value="'+(fxRates[curr]||'')+'" min="0" step="0.01" oninput="updateStoreFxRate(\''+_e(curr)+'\',this.value)" ' +
              'style="width:70px;padding:5px 8px;border:1.5px solid #DDD;font-family:var(--FM);font-size:12px;font-weight:700;outline:none;background:white">' +
              '<span style="font-size:11px;font-weight:600;color:#888">INR</span>' +
            '</div>' +
            '<button onclick="toggleStoreConvert(\''+_e(curr)+'\')" ' +
            'style="width:100%;padding:6px;background:'+(isOn?'var(--red)':'var(--black-3)')+';color:white;border:none;font-family:var(--FH);font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;cursor:pointer">' +
            (isOn?'✓ ON — also in export':'Convert → INR')+'</button>' +
          '</div>';
        }).join('') +
        '</div>' +
      '</div>' +

      /* Converted totals summary card (only when at least one currency is ON) */
      (Object.keys(storeConvertCol).some(function(k){ return storeConvertCol[k]; })
        ? '<div style="min-width:200px;background:white;border:1px solid var(--g2);padding:16px 20px;box-shadow:var(--sh-sm)">' +
            '<div style="font-family:var(--FH);font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--g5);margin-bottom:12px">₹ Converted Totals</div>' +
            Object.keys(convSummary).map(function(curr){
              return '<div style="margin-bottom:10px">' +
                '<div style="font-family:var(--FM);font-size:10px;color:var(--g4);margin-bottom:2px">'+_e(curr)+' → INR @ '+_e(String(fxRates[curr]||1))+'</div>' +
                '<div style="font-family:var(--FM);font-size:16px;font-weight:700;color:#0060A0">₹'+_fmtN(convSummary[curr],2)+'</div>' +
              '</div>';
            }).join('') +
            (Object.keys(convSummary).length===0 ? '<p style="font-size:11px;color:var(--g4);font-style:italic">No converted rows in current filter.</p>' : '') +
          '</div>'
        : '') +

    '</div>';
  }

  /* ── Stats ── */
  var statsRow = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:16px">' +
    _sCard('s-total','Total Items',allStore.length,'Unique parts') +
    _sCard('s-vendor','Currencies',allCurrencies.length||'INR only','In dataset') +
    _sCard('s-sub','Filtered',filtered.length,'After filters') +
    _sCard('s-high','Columns',rawHeaders.length,'From upload') +
  '</div>';

  /* ── Toolbar with search + currency filter + country filter ── */
  var fSel = 'padding:8px 10px;border:1.5px solid var(--g2);font-size:12px;font-family:var(--FB);background:var(--g1);outline:none;cursor:pointer;height:36px';
  var hasActiveFilters = storeSearch || storeCurrFilter || storeCntryFilter;

  var toolbar = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap;background:white;border:1px solid var(--g2);padding:10px 14px;box-shadow:var(--sh-sm)">' +
    /* Search */
    '<div style="position:relative;flex:1;min-width:180px;max-width:240px">' +
      '<svg style="position:absolute;left:10px;top:50%;transform:translateY(-50%);width:13px;height:13px;color:#999" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
      '<input id="store-search-inp" type="text" placeholder="Search part or name…" oninput="handleStoreSearch(this.value)" value="'+_e(storeSearch)+'" ' +
      'style="width:100%;padding:8px 12px 8px 32px;border:1.5px solid var(--g2);font-size:12.5px;background:var(--g1);outline:none;height:36px">' +
    '</div>' +

    /* Currency filter */
    (allCurrencies.length > 1
      ? '<select id="store-curr-sel" style="'+fSel+'" onchange="handleStoreCurrFilter(this.value)" title="Filter by currency">' +
          '<option value="">All Currencies</option>' +
          allCurrencies.map(function(c){ return '<option value="'+_e(c)+'"'+(storeCurrFilter===c?' selected':'')+'>'+_e(c)+'</option>'; }).join('') +
        '</select>'
      : '') +

    /* Country filter */
    (allCountries.length > 1
      ? '<select id="store-cntry-sel" style="'+fSel+'" onchange="handleStoreCntryFilter(this.value)" title="Filter by country">' +
          '<option value="">All Countries</option>' +
          allCountries.map(function(c){ return '<option value="'+_e(c)+'"'+(storeCntryFilter===c?' selected':'')+'>'+_e(c)+'</option>'; }).join('') +
        '</select>'
      : '') +

    /* Clear filters button */
    (hasActiveFilters
      ? '<button onclick="clearStoreFilters()" style="padding:7px 12px;background:var(--red);color:white;border:none;font-family:var(--FH);font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;cursor:pointer;height:36px">✕ Clear</button>'
      : '') +

    '<span style="font-family:var(--FM);font-size:11px;color:#666;margin-left:auto"><strong>'+filtered.length+'</strong> / <strong>'+allStore.length+'</strong></span>' +
    '<button onclick="exportStore()" style="display:inline-flex;align-items:center;gap:5px;padding:7px 14px;background:white;color:var(--black-3);border:1.5px solid var(--g3);font-family:var(--FH);font-size:12px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;cursor:pointer;height:36px" onmouseover="this.style.background=\'#111\';this.style.color=\'white\'" onmouseout="this.style.background=\'white\';this.style.color=\'var(--black-3)\'">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Export</button>' +
  '</div>';

  /* ── Table head ── */
  /* ── Table head with Sorting ── */
var thBase = 'background:var(--black-3);color:white;padding:10px;font-family:var(--FH);font-size:10.5px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;white-space:nowrap;border-right:1px solid #3D3D3D;position:sticky;top:0;z-index:20;text-align:left;cursor:pointer;user-select:none;';

var thead = rawHeaders.map(function(h) {
  var arrow = '';
  if (storeSortKey === h) {
    arrow = storeSortDir === 'asc' ? ' <span style="color:var(--red)">↑</span>' : ' <span style="color:var(--red)">↓</span>';
  }
  // Added onclick and hover style via inline attribute
  return '<th style="' + thBase + '" onclick="storeSort(\'' + _ea(h) + '\')" onmouseover="this.style.background=\'#444\'" onmouseout="this.style.background=\'var(--black-3)\'">' + 
         _e(h) + arrow + '</th>';
}).join('');

  /* ── Per-column totals (tracks DISPLAY value — converted if active) ── */
  var storeTotals = {};
  rawHeaders.forEach(function(h){
    var cn = _norm(h);
    var isMoney = cn.includes('rate')||cn.includes('cost')||cn.includes('value')||cn.includes('amount')||cn.includes('price');
    var isQty   = cn.includes('qty')||cn.includes('quantity')||cn.includes('stock')||cn.includes('inv');
    if (isMoney || isQty) storeTotals[h] = 0;
  });
  /* Also track which money columns have mixed currencies (can't sum meaningfully) */
  var moneyColHasMix = {};

  /* ── Table body ── */
  var tbody = filtered.map(function(item){
    var rawRow = item._rawRow || {};
    var curr   = item._currency || 'INR';
    var isConv = (curr !== 'INR') && !!storeConvertCol[curr];
    var rate   = fxRates[curr] || 1;

    var cells = rawHeaders.map(function(h){
      var val = rawRow[h];
      if (val === undefined || val === null || val === '') {
        var nh = _norm(h);
        if      (nh==='partnumber'||nh==='partno') val = item.partNumber;
        else if (nh==='partname'||nh==='name')     val = item._partName;
        else if (nh==='unitrate'||nh==='rate')     val = item._unitRate;
        else if (nh==='currency'||nh==='curr')     val = item._currency;
        else if (nh==='country')                   val = item._country;
        else if (nh==='quantity'||nh==='qty')      val = item._quantity;
        else if (nh==='unit'||nh==='uom')          val = item._unit;
        else if (nh.includes('storeinv'))          val = item._storeInvQty;
        else if (nh.includes('prodline'))          val = item._prodLineQty;
        else if (nh.includes('128'))               val = item._inventory128;
      }

      var cn       = _norm(h);
      var sv       = String(val !== undefined && val !== null ? val : '');
      var isNum    = sv !== '' && !isNaN(parseFloat(sv)) && isFinite(sv);
      var isMoney  = isNum && (cn.includes('rate')||cn.includes('cost')||cn.includes('value')||cn.includes('amount')||cn.includes('price'));
      var isCurrCol= cn==='currency'||cn==='vendorcurrency'||cn==='curr';

      /* Accumulate totals using DISPLAY value (converted if active) */
      if (isNum && storeTotals[h] !== undefined) {
        var addVal = (isMoney && isConv) ? parseFloat(sv) * rate : parseFloat(sv);
        storeTotals[h] = +(storeTotals[h] + addVal).toFixed(2);
        /* flag if this money column has rows with different conversion states */
        if (isMoney && curr !== 'INR') moneyColHasMix[h] = true;
      }

      var display;
      if (isCurrCol) {
        var cv = sv.trim();
        var fc = cv==='USD'?'#1A5276':cv==='CNY'||cv==='RMB'?'#922B21':cv==='EUR'?'#1F618D':cv==='GBP'?'#145A32':'#555';
        display = '<span style="font-family:var(--FM);font-size:11px;font-weight:700;color:'+fc+'">'+_e(cv||'—')+'</span>' +
                  (isConv ? '<span style="font-size:9px;color:var(--red);margin-left:3px">→INR</span>' : '');
      } else if (isMoney && isConv) {
        var orig = parseFloat(sv);
        display = '<span style="font-family:var(--FM);font-size:11.5px;color:#0060A0;font-weight:700">₹'+_fmtN(orig*rate,2)+'</span>' +
                  '<div style="font-size:9px;color:#AAA;line-height:1.2">'+_e(curr)+' '+_fmtN(orig,2)+'</div>';
      } else if (isNum) {
        display = '<span style="font-family:var(--FM);font-size:11.5px">'+_fmtN(parseFloat(sv),2)+'</span>';
      } else if (!sv.trim()) {
        display = '<span style="color:#DDD">—</span>';
      } else if (cn==='partnumber'||cn==='partno') {
        display = '<span style="font-family:var(--FM);font-size:11.5px;color:var(--red);font-weight:500">'+_e(sv)+'</span>';
      } else if (sv.length > 55) {
        display = '<span title="'+_e(sv)+'" style="font-size:11px;color:#444;display:block;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+_e(sv)+'</span>';
      } else {
        display = '<span style="font-size:11.5px">'+_e(sv)+'</span>';
      }
      return '<td style="padding:7px 10px;border-right:1px solid #EEE;vertical-align:middle;white-space:nowrap">'+display+'</td>';
    }).join('');

    return '<tr onmouseover="this.style.background=\'#F8FBFF\'" onmouseout="this.style.background=\'\'">' + cells + '</tr>';
  }).join('');

  /* ── Store TOTAL row (uses display values already accumulated) ── */
  var BASE_T = 'padding:9px 10px;border-right:1px solid #3D3D3D;vertical-align:middle;white-space:nowrap;border-top:2px solid var(--red)';
  var anyConvActive = Object.keys(storeConvertCol).some(function(k){ return storeConvertCol[k]; });

  var storeTotalCells = rawHeaders.map(function(h, idx){
    if (idx === 0) {
      return '<td style="'+BASE_T+';background:#1A1A1A">' +
        '<span style="font-family:var(--FH);font-size:13px;font-weight:800;letter-spacing:1.5px;color:white;text-transform:uppercase">TOTAL</span>' +
        '<div style="font-size:9px;color:#888;font-family:var(--FM);margin-top:2px">' + filtered.length + ' items' +
          (anyConvActive ? ' · <span style="color:#E6C84A">incl. converted</span>' : '') +
        '</div></td>';
    }
    if (storeTotals[h] !== undefined) {
      var cn = _norm(h);
      var isMoney = cn.includes('rate')||cn.includes('cost')||cn.includes('value')||cn.includes('amount')||cn.includes('price');
      /* If money column has conversions active, prefix with ₹ */
      var prefix = (isMoney && anyConvActive) ? '₹' : '';
      var disp = prefix
        ? '<strong style="color:#7ABFFF;font-family:var(--FM);font-size:12px">'+prefix+_fmtN(storeTotals[h],2)+'</strong>'
        : '<strong style="color:white;font-family:var(--FM);font-size:12px">'+_fmtN(storeTotals[h],2)+'</strong>';
      return '<td style="'+BASE_T+';background:#1A1A1A;text-align:right">'+disp+'</td>';
    }
    return '<td style="'+BASE_T+';background:#1C1C1C"></td>';
  }).join('');

  var storeTotalRow = filtered.length ? '<tr>' + storeTotalCells + '</tr>' : '';

  area.innerHTML = statsRow + fxPanel + toolbar +
    '<div class="table-card">' +
    '<div class="tc-header"><div class="tc-title">Store Inventory</div>' +
    '<div class="tc-meta">' + filtered.length + ' items · ' + rawHeaders.length + ' columns' +
      (anyConvActive ? ' · <span style="color:#E6C84A">conversion active</span>' : '') +
      (storeCurrFilter || storeCntryFilter ? ' · <span style="color:var(--red)">filtered</span>' : '') +
    '</div></div>' +
    '<div style="overflow-x:auto;overflow-y:auto;max-height:calc(100vh - 380px);min-height:420px">' +
    '<table style="width:100%;border-collapse:collapse;font-size:12.5px">' +
    '<thead><tr>' + thead + '</tr></thead>' +
    '<tbody>' + tbody + storeTotalRow + '</tbody>' +
    '</table></div></div>';
}

function exportStore() {
  if (!allStore.length) { showToast('No store data to export', 'info'); return; }
  var rawHeaders = (allStore[0]._rawHeaders && allStore[0]._rawHeaders.length)
    ? allStore[0]._rawHeaders : Object.keys(allStore[0]._rawRow || {});

  var data = allStore.map(function (item) {
    var rawRow = item._rawRow || {};
    var curr   = item._currency || 'INR';
    var isConv = (curr !== 'INR') && !!storeConvertCol[curr];
    var rate   = fxRates[curr] || 1;
    var row    = {};
    rawHeaders.forEach(function (h) {
      var val = rawRow[h];
      if (val === undefined || val === null) {
        var nh = _norm(h);
        if (nh==='partnumber') val = item.partNumber;
        else if (nh==='partname') val = item._partName;
        else if (nh==='unitrate') val = item._unitRate;
        else if (nh==='currency') val = item._currency;
        else if (nh==='country')  val = item._country;
      }
      var colNorm = _norm(h);
      var sv = String(val !== undefined && val !== null ? val : '');
      var isNum = sv !== '' && !isNaN(parseFloat(sv)) && isFinite(sv);
      var isMoney = isNum && (colNorm.includes('rate')||colNorm.includes('cost')||colNorm.includes('value')||colNorm.includes('amount')||colNorm.includes('price'));
      if (isMoney && isConv) {
        row[h + ' (INR)'] = parseFloat(sv) * rate;
        row[h + ' (' + curr + ')'] = parseFloat(sv);
      } else {
        row[h] = (val !== undefined && val !== null) ? val : '';
      }
    });
    if (isConv) row['_conversion'] = '1 ' + curr + ' = ' + rate + ' INR';
    return row;
  });

  /* TOTAL row */
  var firstKey = rawHeaders[0] || 'Part Number';
  var totalRow = {};
  totalRow[firstKey] = 'TOTAL';
  rawHeaders.forEach(function (h) {
    var colNorm = _norm(h);
    var isMoney = colNorm.includes('rate')||colNorm.includes('cost')||colNorm.includes('value')||colNorm.includes('amount')||colNorm.includes('price');
    var isQty   = colNorm.includes('qty')||colNorm.includes('quantity')||colNorm.includes('stock')||colNorm.includes('inv');
    if (isMoney || isQty) {
      totalRow[h] = allStore.reduce(function (sum, item) {
        var sv = String((item._rawRow||{})[h] || '');
        return sum + (sv !== '' && !isNaN(parseFloat(sv)) ? parseFloat(sv) : 0);
      }, 0);
    }
  });
  data.push(totalRow);

  var ws  = XLSX.utils.json_to_sheet(data);
  var wb2 = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb2, ws, 'Store Inventory');
  XLSX.writeFile(wb2, 'On2Cook_Store_Inventory.xlsx');
  showToast('✓ Exported with TOTAL row', 'success');
}

/* ════════════════════════════════════════
   SHARED HELPERS
════════════════════════════════════════ */
function _sCard(cls, lbl, val, sub, vc) {
  var vs = String(val);
  return '<div class="stat-card ' + cls + '"><div class="sc-label">' + lbl + '</div>' +
    '<div class="sc-value" style="font-size:' + (vs.length>7?'20px':vs.length>4?'28px':'40px') + (vc?';color:'+vc:'') + '">' + (vs||'—') + '</div>' +
    '<div class="sc-sub">' + sub + '</div></div>';
}
function _td(v, s, mw) {
  var st = 'padding:8px 10px;border-right:1px solid #EEE;vertical-align:middle;white-space:nowrap';
  if (s)  st += ';' + s;
  if (mw) st += ';max-width:' + mw + 'px;overflow:hidden;text-overflow:ellipsis';
  return '<td style="' + st + '">' + v + '</td>';
}
function _tdr(v, s) {
  var st = 'padding:8px 10px;border-right:1px solid #EEE;text-align:right;font-family:var(--FM);font-size:12px;white-space:nowrap;vertical-align:middle';
  if (s) st += ';' + s;
  return '<td style="' + st + '">' + v + '</td>';
}
function _t(id, v)   { var e = document.getElementById(id); if (e) e.textContent = v; }
function _e(s)       { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
function _norm(s)    { return String(s||'').trim().toLowerCase().replace(/[\s_\-\(\)\/\|&\.#%]+/g,''); }
function _fmtN(n,d)  { return Number(n).toLocaleString('en-IN',{maximumFractionDigits:d||0}); }
function _eid(s)     { return String(s||'').replace(/[^a-zA-Z0-9_-]/g,'_'); }
function _ea(s)      { return String(s||'').replace(/'/g,"\\'").replace(/"/g,'&quot;'); }
function _fillSel(id, vals, ph) {
  var e = document.getElementById(id); if (!e) return;
  e.innerHTML = '<option value="">' + ph + '</option>';
  vals.forEach(function (v) { var o = document.createElement('option'); o.value = v; o.textContent = v; e.appendChild(o); });
}
function _dbUI(cls, txt) {
  var d = document.getElementById('db-dot'); if (d) d.className = 'db-dot ' + cls;
  var t = document.getElementById('db-status-text'); if (t) t.textContent = txt;
}
function showToast(msg, type) {
  var t = document.getElementById('toast'); if (!t) return;
  t.textContent = msg; t.className = 'toast show ' + (type||'');
  clearTimeout(t._timer);
  t._timer = setTimeout(function () { t.classList.remove('show'); }, 3800);
}