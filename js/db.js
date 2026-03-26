
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
function _H() {
  return { 'Content-Type':'application/json', 'apikey':SUPABASE_KEY, 'Authorization':'Bearer '+SUPABASE_KEY };
}
function _url(table, qs) { return SUPABASE_URL + '/rest/v1/' + table + (qs ? '?' + qs : ''); }

async function _req(url, opts) {
  opts = opts || {};
  var headers = Object.assign({}, _H(), opts.headers || {});
  var res = await fetch(url, Object.assign({}, opts, { headers: headers }));
  if (!res.ok) throw new Error('Supabase ' + res.status + ': ' + await res.text());
  if (res.status === 204) return [];
  var ct = res.headers.get('content-type') || '';
  return ct.includes('json') ? res.json() : [];
}

/* ── Decode sno encoding ── */
function _decodeSno(raw) {
  // Format: "TAB1QTY:<n>|SAMAP:<json>|<realSno>"
  var out = { tab1Qty: null, saMap: [], realSno: raw };
  if (!raw) return out;
  var m = raw.match(/^TAB1QTY:([^|]*)\|SAMAP:(\[.*?\])\|(.*)$/s);
  if (m) {
    out.tab1Qty = m[1] !== '' ? parseFloat(m[1]) : null;
    try { out.saMap = JSON.parse(m[2]); } catch(e) { out.saMap = []; }
    out.realSno = m[3];
  }
  return out;
}

/* ── BOM row: DB → app ── */
function _dbToBom(r) {
  var dec = _decodeSno(r.sno || '');
  return {
    id:                  r.id || '',
    sno:                 dec.realSno,
    tab1Qty:             dec.tab1Qty,   // total qty from Tab 1
    saBreakdown:         dec.saMap,     // [{id,qty,sno,finalized}, ...]
    finalized:           r.finalized || '',
    partNumber:          r.part_number || '',
    partName:            r.part_name || '',
    partDesc:            r.part_desc || '',
    hsnCode:             r.hsn_code || '',
    partType:            r.part_type || '',
    reworkRequired:      r.rework_required || 'No',
    reworkDrawingRef:    r.rework_drawing_ref || '',
    partSubCategory:     r.part_sub_category || '',
    partCategory:        r.part_category || '',
    material:            r.material || '',
    revisionNo:          r.revision_no || '',
    quantity:            +(r.quantity) || 0,
    uom:                 r.uom || 'PCS',
    unitRateVendor:      +(r.unit_rate_vendor) || 0,
    vendorCurrency:      r.vendor_currency || 'INR',
    exchangeRate:        +(r.exchange_rate) || 1,
    unitCostInr:         +(r.unit_cost_inr) || 0,
    totalUnitCost:       +(r.total_unit_cost) || 0,
    customDuty:          +(r.custom_duty) || 0,
    surcharge:           +(r.surcharge) || 0,
    totalCustomDuty:     +(r.total_custom_duty) || 0,
    surchargePercent:    +(r.surcharge_percent) || 0,
    dutyPercent:         +(r.duty_percent) || 0,
    freightOnly:         +(r.freight_only) || 0,
    otherExpenses:       +(r.other_expenses) || 0,
    totalFreight:        +(r.total_freight) || 0,
    totalUnitLandedCost: +(r.total_unit_landed_cost) || 0,
    totalBomCost:        +(r.total_bom_cost) || 0,
    supplierName:        r.supplier_name || '',
    country:             r.country || '',
    leadTime:            r.lead_time || '',
    subAssemblyId:       r.sub_assembly_id || '',
    urgency:             r.urgency || 'low',
  };
}

/* ── BOM row: app → DB ── */
function _bomToDb(p) {
  // Encode tab1Qty + saBreakdown into sno
  var encoded = 'TAB1QTY:' + (p.tab1Qty !== null && p.tab1Qty !== undefined ? p.tab1Qty : p.quantity)
    + '|SAMAP:' + JSON.stringify(p.saBreakdown || [])
    + '|' + (p.sno || '');
  return {
    id:                    p.id,
    sno:                   encoded,
    finalized:             p.finalized,
    part_number:           p.partNumber,
    part_name:             p.partName,
    part_desc:             p.partDesc,
    hsn_code:              p.hsnCode,
    part_type:             p.partType,
    rework_required:       p.reworkRequired,
    rework_drawing_ref:    p.reworkDrawingRef,
    part_sub_category:     p.partSubCategory,
    part_category:         p.partCategory,
    material:              p.material,
    revision_no:           p.revisionNo,
    quantity:              p.quantity,
    uom:                   p.uom,
    unit_rate_vendor:      p.unitRateVendor,
    vendor_currency:       p.vendorCurrency,
    exchange_rate:         p.exchangeRate,
    unit_cost_inr:         p.unitCostInr,
    total_unit_cost:       p.totalUnitCost,
    custom_duty:           p.customDuty,
    surcharge:             p.surcharge,
    total_custom_duty:     p.totalCustomDuty,
    surcharge_percent:     p.surchargePercent,
    duty_percent:          p.dutyPercent,
    freight_only:          p.freightOnly,
    other_expenses:        p.otherExpenses,
    total_freight:         p.totalFreight,
    total_unit_landed_cost:p.totalUnitLandedCost,
    total_bom_cost:        p.totalBomCost,
    supplier_name:         p.supplierName,
    country:               p.country,
    lead_time:             p.leadTime,
    sub_assembly_id:       p.subAssemblyId || '',
    urgency:               p.urgency,
    uploaded_at:           new Date().toISOString(),
  };
}

/* ── Store: DB → app ── */
function _dbToInv(r) {
  var rawRow = {}, rawHeaders = [];
  try { rawRow     = r['_rawRow']     ? (typeof r['_rawRow']     === 'object' ? r['_rawRow']     : JSON.parse(r['_rawRow']))     : {}; } catch(e){}
  try { rawHeaders = r['_rawHeaders'] ? (typeof r['_rawHeaders'] === 'object' ? r['_rawHeaders'] : JSON.parse(r['_rawHeaders'])) : []; } catch(e){}
  return {
    partNumber:    r.part_number  || '',
    _partName:     r.part_name    || '',
    _unitRate:     +(r.unit_rate) || 0,
    _currency:     r.currency     || 'INR',
    _country:      r.country      || '',
    _quantity:     +(r.quantity)  || 0,
    _unit:         r.unit         || 'PCS',
    _storeInvQty:  +(r.store_inv_qty)   || 0,
    _prodLineQty:  +(r.prod_line_qty)   || 0,
    _inventory128: +(r.inventory_128)   || 0,
    _rawRow:       rawRow,
    _rawHeaders:   rawHeaders,
    updatedAt:     r.updated_at   || '',
  };
}

/* ── Store: app → DB ── */
function _invToDb(i) {
  return {
    part_number:   i.partNumber,
    part_name:     i._partName    || '',
    unit_rate:     i._unitRate    || 0,
    currency:      i._currency    || 'INR',
    country:       i._country     || '',
    quantity:      i._quantity    || 0,
    unit:          i._unit        || 'PCS',
    store_inv_qty: i._storeInvQty || 0,
    prod_line_qty: i._prodLineQty || 0,
    inventory_128: i._inventory128|| 0,
    '_rawRow':     i._rawRow      || {},
    '_rawHeaders': i._rawHeaders  || [],
    updated_at:    new Date().toISOString(),
  };
}

/* ── Public API ── */
var BomDB = (function() {
  async function open() { return true; }

  async function getAll(table) {
    var rows = await _req(_url(table, 'select=*&limit=10000'), { headers: { 'Prefer':'return=representation' } });
    if (table === 'bom_parts')       return rows.map(_dbToBom);
    if (table === 'store_inventory') return rows.map(_dbToInv);
    return rows;
  }

  async function putAll(table, items) {
    if (!items.length) return 0;
    var rows = table === 'bom_parts'       ? items.map(_bomToDb)
             : table === 'store_inventory' ? items.map(_invToDb) : items;
    var BATCH = 400;
    for (var i = 0; i < rows.length; i += BATCH) {
      await _req(_url(table), {
        method: 'POST',
        headers: { 'Prefer':'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows.slice(i, i + BATCH)),
      });
    }
    return items.length;
  }

  async function clearAndInsert(table, items) {
    await _deleteAll(table);
    if (!items.length) return 0;
    return putAll(table, items);
  }

  async function _deleteAll(table) {
    await fetch(_url(table, 'uploaded_at=gte.1970-01-01'), { method:'DELETE', headers:_H() }).catch(function(){});
    await fetch(_url(table, 'updated_at=gte.1970-01-01'),  { method:'DELETE', headers:_H() }).catch(function(){});
  }

  async function count(table) {
    try {
      var res = await fetch(_url(table, 'select=*'), {
        headers: Object.assign({}, _H(), { 'Prefer':'count=exact', 'Range-Unit':'items', 'Range':'0-0' }),
      });
      var cr = res.headers.get('content-range') || '';
      var n  = cr.split('/')[1];
      return (n && n !== '*') ? (+n || 0) : 0;
    } catch(e) { return 0; }
  }

  async function setMeta(key, value) {
    await _req(_url('bom_metadata'), {
      method: 'POST',
      headers: { 'Prefer':'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ key:key, value:String(value), updated_at:new Date().toISOString() }),
    });
  }

  async function getMeta(key) {
    try {
      var rows = await _req(_url('bom_metadata', 'key=eq.'+encodeURIComponent(key)+'&select=*'), { headers:{'Prefer':'return=representation'} });
      return rows[0] || null;
    } catch(e) { return null; }
  }

  async function clearAll() {
    await Promise.all([_deleteAll('bom_parts'), _deleteAll('store_inventory'), _deleteAll('bom_metadata')]);
  }

  return { open, getAll, putAll, clearAndInsert, count, setMeta, getMeta, clearAll, _url };
})();

window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_KEY = SUPABASE_KEY;