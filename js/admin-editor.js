/**
 * admin-editor.js
 * Inline data editor for admin panel.
 * Allows viewing, editing, and deleting records directly from the browser.
 * Changes are saved to supabase immediately.
 */

/* ═══════════════════════════════════════════════════════
   STATE
════════════════════════════════════════════════════════ */
var _editorDataset = null;   // 'bom' | 'inventory' | 'production'
var _editorData    = [];     // current dataset copy
var _editorSearch  = '';
var _editorPage    = 0;
var _editorPageSize = 50;
var _hiddenCols    = {};     // { dataset: Set of field names }
var _editingRow    = null;   // currently editing row object (copy)

/* ═══════════════════════════════════════════════════════
   OPEN / CLOSE EDITOR
════════════════════════════════════════════════════════ */
function editorOpen(dataset) {
  _editorDataset = dataset;
  _editorPage    = 0;
  _editorSearch  = '';

  if (dataset === 'bom')        _editorData = JSON.parse(JSON.stringify(allParts));
  else if (dataset === 'inventory') _editorData = JSON.parse(JSON.stringify(allInventory));
  else if (dataset === 'production') _editorData = JSON.parse(JSON.stringify(allProduction));

  if (!_hiddenCols[dataset]) _hiddenCols[dataset] = new Set();

  document.getElementById('editor-overlay').classList.add('open');
  _editorRender();
}

function editorClose() {
  document.getElementById('editor-overlay').classList.remove('open');
  _editingRow = null;
}

/* ═══════════════════════════════════════════════════════
   COLUMN DEFINITIONS
════════════════════════════════════════════════════════ */
var _colDefs = {
  bom: [
    { key: 'partNumber',       label: 'Part Number',       type: 'text',   readonly: true },
    { key: 'partName',         label: 'Part Name',         type: 'text'   },
    { key: 'partDesc',         label: 'Description',       type: 'text'   },
    { key: 'hsnCode',          label: 'HSN Code',          type: 'text'   },
    { key: 'partType',         label: 'Part Type',         type: 'text'   },
    { key: 'reworkRequired',   label: 'Rework Required',   type: 'select', opts: ['No','Yes'] },
    { key: 'material',         label: 'Material',          type: 'text'   },
    { key: 'qty',              label: 'Quantity',          type: 'number' },
    { key: 'uom',              label: 'UOM',               type: 'text'   },
    { key: 'vendorCurrency',   label: 'Currency',          type: 'select', opts: ['INR','USD','EUR','GBP','JPY','SGD','TWD'] },
    { key: 'vendorUnitRate',   label: 'Vendor Rate',       type: 'number' },
    { key: 'totalUnitCost',    label: 'Unit Cost (₹)',     type: 'number' },
    { key: 'customDuty',       label: 'Custom Duty',       type: 'number' },
    { key: 'surchargePercent', label: 'Surcharge %',       type: 'number' },
    { key: 'dutyPercent',      label: 'Duty %',            type: 'number' },
    { key: 'totalFreight',     label: 'Total Freight',     type: 'number' },
    { key: 'landedCost',       label: 'Landed Cost',       type: 'number' },
    { key: 'supplierName',     label: 'Supplier',          type: 'text'   },
    { key: 'country',          label: 'Country',           type: 'text'   },
    { key: 'leadTimeDays',     label: 'Lead Time (days)',  type: 'number' },
    { key: 'urgency',          label: 'Urgency',           type: 'select', opts: ['low','medium','high','critical'] },
  ],
  inventory: [
    { key: 'itemCode',           label: 'Item Code',          type: 'text',   readonly: true },
    { key: 'itemName',           label: 'Item Name',          type: 'text'   },
    { key: 'perUnitQty',         label: 'Per Unit Qty',       type: 'number' },
    { key: 'openingStock',       label: 'Opening Stock',      type: 'number' },
    { key: 'currentStock',       label: 'Current Stock',      type: 'number' },
    { key: 'lineStock',          label: 'Line Stock',         type: 'number' },
    { key: 'totalStock',         label: 'Total Stock',        type: 'number' },
    { key: 'stockAntunes',       label: 'Stock @ Antunes',    type: 'number' },
    { key: 'stockSentDubai',     label: 'Sent to Dubai',      type: 'number' },
    { key: 'stockReceiveDubai',  label: 'Receive Dubai',      type: 'number' },
    { key: 'balanceLineStock1F', label: 'Bal Line 1F',        type: 'number' },
    { key: 'stock1FAndStore',    label: '1F & Store',         type: 'number' },
    { key: 'balanceAfter220Sets',label: 'Bal after 220 Sets', type: 'number' },
    { key: 'leadTime',           label: 'Lead Time',          type: 'text'   },
    { key: 'reorderPoint',       label: 'Reorder Point',      type: 'number' },
    { key: 'stockStatus',        label: 'Stock Status',       type: 'text'   },
    { key: 'balanceAfter220Qty', label: 'Bal 220 Qty',        type: 'number' },
    { key: 'shortfall100',       label: 'Shortfall 100',      type: 'number' },
    { key: 'shortfall250',       label: 'Shortfall 250',      type: 'number' },
    { key: 'shortfall350',       label: 'Shortfall 350',      type: 'number' },
    { key: 'costPerPcs',         label: 'Cost/Pcs',           type: 'number' },
    { key: 'balanceStockAmount', label: 'Stock Value',        type: 'number' },
    { key: 'eta',                label: 'ETA',                type: 'text'   },
    { key: 'materialStatus',     label: 'Material Status',    type: 'text'   },
    { key: 'materialComments',   label: 'Material Comments',  type: 'text'   },
    { key: 'remark',             label: 'Remark',             type: 'text'   },
    { key: 'remarks',            label: 'Remarks',            type: 'text'   },
    { key: 'setProdOldPart',     label: 'Set Prod Old Part',  type: 'text'   },
    { key: 'setProdNewPart',     label: 'Set Prod New Part',  type: 'text'   },
    { key: 'newParts',           label: 'New Parts',          type: 'text'   },
  ],
  production: [
    { key: 'itemCode',       label: 'Item Code',    type: 'text',   readonly: true },
    { key: 'itemName',       label: 'Item Name',    type: 'text'   },
    { key: 'perUnitQty',     label: 'Per Unit Qty', type: 'number' },
    { key: 'stockLocation',  label: 'Location',     type: 'text'   },
    { key: 'lineIssue',      label: 'Line Issue',   type: 'number' },
    { key: 'lineRejection',  label: 'Line Rejection',type:'number' },
    { key: 'netConsumption', label: 'Net Consumed', type: 'number', readonly: true },
  ],
};

function _getKey(dataset) {
  return dataset === 'bom' ? 'partNumber' : 'itemCode';
}
function _getTable(dataset) {
  if (dataset === 'bom')        return 'bom_parts';
  if (dataset === 'inventory')  return 'store_inventory';
  if (dataset === 'production') return 'production_line';
}

/* ═══════════════════════════════════════════════════════
   RENDER EDITOR
════════════════════════════════════════════════════════ */
function _editorRender() {
  var panel = document.getElementById('editor-panel');
  if (!panel) return;

  var cols   = _colDefs[_editorDataset] || [];
  var hidden = _hiddenCols[_editorDataset] || new Set();
  var visCols = cols.filter(function (c) { return !hidden.has(c.key); });
  var keyField = _getKey(_editorDataset);

  // Filter data
  var src = _editorData.filter(function (r) {
    if (!_editorSearch) return true;
    var kv = String(r[keyField] || '').toLowerCase();
    var nv = String(r[cols[1] ? r[cols[1].key] || '' : ''] || '').toLowerCase();
    return kv.includes(_editorSearch) || nv.includes(_editorSearch);
  });

  var total  = src.length;
  var pages  = Math.ceil(total / _editorPageSize) || 1;
  _editorPage = Math.min(_editorPage, pages - 1);
  var start  = _editorPage * _editorPageSize;
  var slice  = src.slice(start, start + _editorPageSize);

  var dsLabels = { bom: 'BOM Parts', inventory: 'Store Inventory', production: 'Production Line' };
  var colToggleHtml = cols.map(function (c) {
    var on = !hidden.has(c.key);
    return '<label style="display:inline-flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;margin:2px 4px;white-space:nowrap">'
      + '<input type="checkbox"' + (on ? ' checked' : '') + ' onchange="editorToggleCol(\'' + c.key + '\')" style="cursor:pointer">'
      + _esc(c.label) + '</label>';
  }).join('');

  var tbody = slice.map(function (row) {
    var cells = visCols.map(function (col) {
      var v = row[col.key];
      var display = (v === null || v === undefined || v === '') ? '—' : v;
      return '<td style="padding:8px 12px;font-size:12px;border-right:1px solid #EEE;white-space:nowrap;max-width:160px;overflow:hidden;text-overflow:ellipsis" title="' + _esc(String(display)) + '">'
        + (col.key === keyField ? '<span style="font-family:var(--font-mono);color:var(--red);font-size:11.5px">' + _esc(String(display)) + '</span>' : _esc(String(display)))
        + '</td>';
    }).join('');
    var k = row[keyField];
    return '<tr style="border-bottom:1px solid var(--gray-2);cursor:pointer" onclick="editorEditRow(\'' + _esc(String(k)) + '\')" title="Click to edit">'
      + cells
      + '<td style="padding:8px 10px;white-space:nowrap">'
      + '<button onclick="event.stopPropagation();editorDeleteRow(\'' + _esc(String(k)) + '\')" style="background:#8B0000;color:white;border:none;padding:3px 9px;font-size:11px;cursor:pointer;font-family:var(--font-h);letter-spacing:.5px">DEL</button>'
      + '</td>'
      + '</tr>';
  }).join('');

  var thead = visCols.map(function (c) {
    return '<th style="background:var(--black-3);color:white;padding:9px 12px;font-family:var(--font-h);font-size:11px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;white-space:nowrap;border-right:1px solid #3D3D3D">'
      + _esc(c.label) + '</th>';
  }).join('') + '<th style="background:var(--black-3);color:white;padding:9px 12px;font-family:var(--font-h);font-size:11px;border-right:1px solid #3D3D3D">ACTIONS</th>';

  panel.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 22px;background:var(--black-2);border-bottom:1px solid var(--black-3)">'
    +   '<div style="display:flex;align-items:center;gap:10px">'
    +     '<div style="width:32px;height:32px;background:var(--red);display:flex;align-items:center;justify-content:center"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></div>'
    +     '<div>'
    +       '<div style="font-family:var(--font-h);font-size:20px;font-weight:800;color:white;letter-spacing:1px;text-transform:uppercase">Data Editor — ' + dsLabels[_editorDataset] + '</div>'
    +       '<div style="font-size:11px;color:var(--gray-4);margin-top:2px">' + total + ' records · Click any row to edit · Changes save to database immediately</div>'
    +     '</div>'
    +   '</div>'
    +   '<button onclick="editorClose()" style="width:32px;height:32px;background:rgba(255,255,255,.08);border:none;color:var(--gray-3);font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center">✕</button>'
    + '</div>'

    // Toolbar
    + '<div style="padding:12px 18px;background:var(--gray-1);border-bottom:1px solid var(--gray-2);display:flex;gap:10px;align-items:center;flex-wrap:wrap">'
    +   '<input type="text" placeholder="Search…" value="' + _esc(_editorSearch) + '" oninput="editorSearch(this.value)" style="padding:8px 12px;border:1.5px solid var(--gray-2);font-size:13px;background:white;outline:none;width:220px">'
    +   '<span style="font-family:var(--font-mono);font-size:11px;color:var(--gray-5)">Showing ' + start+1 + '–' + Math.min(start+_editorPageSize, total) + ' of ' + total + '</span>'
    +   '<div style="margin-left:auto;display:flex;gap:8px">'
    +     '<button onclick="editorPrevPage()" style="padding:6px 12px;background:var(--gray-2);border:none;cursor:pointer;font-size:12px" ' + (_editorPage===0?'disabled style="opacity:.4;cursor:default;padding:6px 12px;background:var(--gray-2);border:none"':'') + '>← Prev</button>'
    +     '<span style="padding:6px 8px;font-family:var(--font-mono);font-size:12px">' + (_editorPage+1) + ' / ' + pages + '</span>'
    +     '<button onclick="editorNextPage()" style="padding:6px 12px;background:var(--gray-2);border:none;cursor:pointer;font-size:12px" ' + (_editorPage>=pages-1?'disabled style="opacity:.4;cursor:default;padding:6px 12px;background:var(--gray-2);border:none"':'') + '>Next →</button>'
    +     '<button onclick="editorAddRow()" style="padding:6px 14px;background:var(--c-ok);color:white;border:none;cursor:pointer;font-family:var(--font-h);font-size:12px;font-weight:700;letter-spacing:.5px">+ ADD ROW</button>'
    +   '</div>'
    + '</div>'

    // Column visibility
    + '<details style="border-bottom:1px solid var(--gray-2)">'
    +   '<summary style="padding:8px 18px;font-size:11.5px;font-weight:600;cursor:pointer;color:var(--gray-5);letter-spacing:.5px;text-transform:uppercase;background:white">▸ Show / Hide Columns (' + visCols.length + ' of ' + cols.length + ' visible)</summary>'
    +   '<div style="padding:10px 18px 12px;background:white;border-top:1px solid var(--gray-2)">' + colToggleHtml + '</div>'
    + '</details>'

    // Table
    + '<div style="overflow-x:auto;overflow-y:auto;max-height:calc(100vh - 340px)">'
    +   '<table style="width:100%;border-collapse:collapse;font-size:12.5px">'
    +     '<thead><tr>' + thead + '</tr></thead>'
    +     '<tbody id="editor-tbody">' + tbody + '</tbody>'
    +   '</table>'
    + '</div>';
}

/* ═══════════════════════════════════════════════════════
   SEARCH / PAGINATION / COLUMN TOGGLE
════════════════════════════════════════════════════════ */
function editorSearch(val) { _editorSearch = val.trim().toLowerCase(); _editorPage = 0; _editorRender(); }
function editorPrevPage()  { if (_editorPage > 0) { _editorPage--; _editorRender(); } }
function editorNextPage()  {
  var pages = Math.ceil(_editorData.length / _editorPageSize);
  if (_editorPage < pages - 1) { _editorPage++; _editorRender(); }
}
function editorToggleCol(key) {
  var h = _hiddenCols[_editorDataset] || new Set();
  if (h.has(key)) h.delete(key); else h.add(key);
  _hiddenCols[_editorDataset] = h;
  _editorRender();
}

/* ═══════════════════════════════════════════════════════
   ROW EDIT MODAL
════════════════════════════════════════════════════════ */
function editorEditRow(key) {
  var keyField = _getKey(_editorDataset);
  var row = _editorData.find(function (r) { return String(r[keyField]) === String(key); });
  if (!row) return;
  _editingRow = JSON.parse(JSON.stringify(row)); // copy
  _openEditModal(false);
}

function editorAddRow() {
  var cols = _colDefs[_editorDataset] || [];
  var blank = {};
  cols.forEach(function (c) { blank[c.key] = c.type === 'number' ? 0 : ''; });
  _editingRow = blank;
  _openEditModal(true);
}

function _openEditModal(isNew) {
  var cols    = _colDefs[_editorDataset] || [];
  var modal   = document.getElementById('edit-row-modal');
  var content = document.getElementById('edit-row-content');
  if (!modal || !content) return;

  var dsLabels = { bom: 'BOM Part', inventory: 'Inventory Item', production: 'Production Item' };

  var fields = cols.map(function (col) {
    var v = _editingRow[col.key];
    if (v === null || v === undefined) v = '';
    var input;
    if (col.readonly && !isNew) {
      input = '<div style="padding:9px 12px;background:var(--gray-1);font-family:var(--font-mono);font-size:13px;border:1.5px solid var(--gray-2)">' + _esc(String(v)) + '</div>';
    } else if (col.type === 'select') {
      var opts = (col.opts || []).map(function (o) {
        return '<option value="' + _esc(o) + '"' + (String(v) === o ? ' selected' : '') + '>' + _esc(o) + '</option>';
      }).join('');
      input = '<select id="ef-' + col.key + '" style="width:100%;padding:9px 12px;border:1.5px solid var(--gray-2);font-size:13px;background:white;outline:none">' + opts + '</select>';
    } else if (col.type === 'number') {
      input = '<input type="number" id="ef-' + col.key + '" value="' + _esc(String(v)) + '" step="any" style="width:100%;padding:9px 12px;border:1.5px solid var(--gray-2);font-size:13px;outline:none" onfocus="this.style.borderColor=\'var(--red)\'" onblur="this.style.borderColor=\'var(--gray-2)\'">';
    } else {
      input = '<input type="text" id="ef-' + col.key + '" value="' + _esc(String(v)) + '" style="width:100%;padding:9px 12px;border:1.5px solid var(--gray-2);font-size:13px;outline:none" onfocus="this.style.borderColor=\'var(--red)\'" onblur="this.style.borderColor=\'var(--gray-2)\'">';
    }
    return '<div style="margin-bottom:12px">'
      + '<div style="font-size:11px;font-weight:600;color:var(--gray-5);letter-spacing:.5px;text-transform:uppercase;margin-bottom:5px">'
      + _esc(col.label) + (col.readonly && !isNew ? ' <span style="color:var(--gray-4)">(read-only)</span>' : '') + '</div>'
      + input + '</div>';
  }).join('');

  content.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 22px;background:var(--black-2)">'
    +   '<div style="font-family:var(--font-h);font-size:18px;font-weight:800;color:white;letter-spacing:1px;text-transform:uppercase">'
    +     (isNew ? 'New ' : 'Edit ') + dsLabels[_editorDataset]
    +   '</div>'
    +   '<button onclick="editorCloseModal()" style="width:30px;height:30px;background:rgba(255,255,255,.1);border:none;color:white;font-size:18px;cursor:pointer">✕</button>'
    + '</div>'
    + '<div style="padding:22px;overflow-y:auto;max-height:calc(100vh - 200px)">'
    +   '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 20px">' + fields + '</div>'
    +   '<div style="display:flex;gap:10px;margin-top:18px;padding-top:14px;border-top:1px solid var(--gray-2)">'
    +     '<button onclick="editorSaveRow(' + (isNew?'true':'false') + ')" style="padding:10px 24px;background:var(--red);color:white;border:none;font-family:var(--font-h);font-size:14px;font-weight:700;letter-spacing:1px;text-transform:uppercase;cursor:pointer">💾 Save to database</button>'
    +     '<button onclick="editorCloseModal()" style="padding:10px 20px;background:var(--gray-2);color:var(--black);border:none;font-family:var(--font-h);font-size:13px;font-weight:700;cursor:pointer">Cancel</button>'
    +     (!isNew ? '<button onclick="editorDeleteRow(\'' + _esc(String(_editingRow[_getKey(_editorDataset)])) + '\')" style="padding:10px 20px;background:#8B0000;color:white;border:none;font-family:var(--font-h);font-size:13px;font-weight:700;cursor:pointer;margin-left:auto">🗑 Delete Row</button>' : '')
    +   '</div>'
    + '</div>';

  modal.style.display = 'flex';
}

function editorCloseModal() {
  var modal = document.getElementById('edit-row-modal');
  if (modal) modal.style.display = 'none';
  _editingRow = null;
}

/* ═══════════════════════════════════════════════════════
   SAVE ROW
════════════════════════════════════════════════════════ */
async function editorSaveRow(isNew) {
  var cols     = _colDefs[_editorDataset] || [];
  var keyField = _getKey(_editorDataset);
  var table    = _getTable(_editorDataset);
  var updated  = {};

  cols.forEach(function (col) {
    var el = document.getElementById('ef-' + col.key);
    if (!el) {
      // readonly field — keep original
      updated[col.key] = _editingRow[col.key];
      return;
    }
    var v = el.value;
    updated[col.key] = col.type === 'number' ? (parseFloat(v) || 0) : v;
  });

  if (!updated[keyField]) {
    showToast('Primary key (' + keyField + ') cannot be empty', 'error');
    return;
  }

  try {
    await BomDB.putAll(table, [updated]);

    // Update in-memory arrays
    var key = String(updated[keyField]);
    if (_editorDataset === 'bom') {
      var idx = allParts.findIndex(function (p) { return String(p.partNumber) === key; });
      if (idx >= 0) allParts[idx] = updated; else allParts.push(updated);
      loadPartsData(allParts);
    } else if (_editorDataset === 'inventory') {
      var idx = allInventory.findIndex(function (i) { return String(i.itemCode) === key; });
      if (idx >= 0) allInventory[idx] = updated; else allInventory.push(updated);
      loadInventoryData(allInventory);
    } else if (_editorDataset === 'production') {
      var idx = allProduction.findIndex(function (p) { return String(p.itemCode) === key; });
      if (idx >= 0) allProduction[idx] = updated; else allProduction.push(updated);
      loadProductionData(allProduction);
    }

    // Refresh editor data
    if (_editorDataset === 'bom')        _editorData = JSON.parse(JSON.stringify(allParts));
    else if (_editorDataset === 'inventory')  _editorData = JSON.parse(JSON.stringify(allInventory));
    else if (_editorDataset === 'production') _editorData = JSON.parse(JSON.stringify(allProduction));

    editorCloseModal();
    _editorRender();
    showToast('✓ ' + (isNew ? 'Row added' : 'Changes saved') + ' to database', 'success');
  } catch (e) {
    showToast('Save error: ' + e.message, 'error');
    console.error('editorSaveRow:', e);
  }
}

/* ═══════════════════════════════════════════════════════
   DELETE ROW
════════════════════════════════════════════════════════ */
async function editorDeleteRow(key) {
  if (!confirm('Delete this row permanently from database?')) return;

  var keyField = _getKey(_editorDataset);
  var table    = _getTable(_editorDataset);

  try {
    // Delete via supabase REST
    var filter = keyField === 'partNumber' ? 'part_number' : 'item_code';
    await fetch(
      BomDB._url ? BomDB._url(table, filter + '=eq.' + encodeURIComponent(key))
                 : (supabase_URL + '/rest/v1/' + table + '?' + filter + '=eq.' + encodeURIComponent(key)),
      {
        method: 'DELETE',
        headers: {
          'apikey': supabase_KEY,
          'Authorization': 'Bearer ' + supabase_KEY,
        },
      }
    );

    // Remove from in-memory
    if (_editorDataset === 'bom') {
      allParts = allParts.filter(function (p) { return String(p[keyField]) !== String(key); });
      _editorData = JSON.parse(JSON.stringify(allParts));
      loadPartsData(allParts);
    } else if (_editorDataset === 'inventory') {
      allInventory = allInventory.filter(function (i) { return String(i[keyField]) !== String(key); });
      _editorData = JSON.parse(JSON.stringify(allInventory));
      loadInventoryData(allInventory);
    } else if (_editorDataset === 'production') {
      allProduction = allProduction.filter(function (i) { return String(i[keyField]) !== String(key); });
      _editorData = JSON.parse(JSON.stringify(allProduction));
      loadProductionData(allProduction);
    }

    editorCloseModal();
    _editorRender();
    showToast('✓ Row deleted from database', 'success');
  } catch (e) {
    showToast('Delete error: ' + e.message, 'error');
    console.error('editorDeleteRow:', e);
  }
}

/* ═══════════════════════════════════════════════════════
   HELPER
════════════════════════════════════════════════════════ */
function _esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}