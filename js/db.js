// js/db.js — Supabase client for On2Cook BOM Portal

const SUPABASE_URL = 'https://nnsafrmrvgyargwtydup.supabase.co';  // ← paste yours
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uc2Fmcm1ydmd5YXJnd3R5ZHVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4MjcyNDksImV4cCI6MjA4OTQwMzI0OX0.A6M-M6KB1NIe7L19tEfa1v55Ja4RHEUG0QLQxvWoWQM';                          // ← paste yours
/**

/* ─── HTTP helpers ─────────────────────────────────── */
const _H = () => ({
  'Content-Type':  'application/json',
  'apikey':        SUPABASE_KEY,
  'Authorization': 'Bearer ' + SUPABASE_KEY,
});
const _url = (table, qs = '') =>
  `${SUPABASE_URL}/rest/v1/${table}${qs ? '?' + qs : ''}`;

async function _req(url, opts = {}) {
  const res = await fetch(url, { headers: _H(), ...opts });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  if (res.status === 204) return [];
  const ct = res.headers.get('content-type') || '';
  return ct.includes('json') ? res.json() : [];
}

/* ─── Snake → Camel converters ─────────────────────── */

function _fromDbBom(r) {
  return {
    partNumber:       r.part_number,
    partName:         r.part_name        || '',
    partDesc:         r.part_desc        || '',
    hsnCode:          r.hsn_code         || '',
    partType:         r.part_type        || '',
    reworkRequired:   r.rework_required  || 'No',
    material:         r.material         || '',
    qty:              Number(r.qty)       || 0,
    uom:              r.uom              || 'PCS',
    vendorCurrency:   r.vendor_currency  || 'INR',
    vendorUnitRate:   Number(r.vendor_unit_rate)   || 0,
    totalUnitCost:    Number(r.total_unit_cost)     || 0,
    customDuty:       Number(r.custom_duty)         || 0,
    surchargePercent: Number(r.surcharge_percent)   || 0,
    dutyPercent:      Number(r.duty_percent)        || 0,
    totalFreight:     Number(r.total_freight)       || 0,
    landedCost:       Number(r.landed_cost)         || 0,
    supplierName:     r.supplier_name    || '',
    country:          r.country          || '',
    leadTimeDays:     Number(r.lead_time_days)      || 0,
    urgency:          r.urgency          || 'low',
    individualQty:    Number(r.individual_qty)      || 0,
    subAssemblies:    Array.isArray(r.sub_assemblies) ? r.sub_assemblies : [],
  };
}

function _fromDbInv(r) {
  return {
    itemCode:           r.item_code            || '',
    itemName:           r.item_name            || '',
    perUnitQty:         Number(r.per_unit_qty)          || 0,
    openingStock:       Number(r.opening_stock)         || 0,
    currentStock:       Number(r.current_stock)         || 0,
    lineStock:          Number(r.line_stock)            || 0,
    setProdOldPart:     r.set_produce_old_part  || '',
    setProdNewPart:     r.set_produce_new_part  || '',
    newParts:           r.new_parts            || '',
    stockAntunes:       Number(r.stock_at_antunes)      || 0,
    stockSentDubai:     Number(r.stock_sent_dubai)      || 0,
    stockReceiveDubai:  Number(r.stock_to_receive_dubai)|| 0,
    balanceLineStock1F: Number(r.balance_line_stock_1f) || 0,
    stock1FAndStore:    Number(r.stock_1f_and_store)    || 0,
    balanceAfter220Sets:Number(r.balance_after_220_sets)|| 0,
    leadTime:           r.lead_time            || '',
    reorderPoint:       Number(r.reorder_point)         || 0,
    stockStatus:        r.stock_status         || '',
    balanceAfter220Qty: Number(r.balance_after_220_qty) || 0,
    remark:             r.remark               || '',
    eta:                r.eta                  || '',
    materialStatus:     r.material_status      || '',
    materialComments:   r.material_comments    || '',
    shortfall100:       Number(r.shortfall_100_antunes) || 0,
    shortfall350:       Number(r.shortfall_350_antunes) || 0,
    shortfall250:       Number(r.shortfall_250_antunes) || 0,
    costPerPcs:         Number(r.cost_per_pcs)          || 0,
    balanceStockAmount: Number(r.balance_stock_amount)  || 0,
    remarks:            r.remarks              || '',
    updatedAt:          r.updated_at           || '',
  };
}

function _fromDbProd(r) {
  return {
    itemCode:       r.item_code       || '',
    itemName:       r.item_name       || '',
    perUnitQty:     Number(r.per_unit_qty)   || 0,
    stockLocation:  r.stock_location  || '',
    lineIssue:      Number(r.line_issue)     || 0,
    lineRejection:  Number(r.line_rejection) || 0,
    netConsumption: Number(r.net_consumption)|| 0,
    updatedAt:      r.updated_at      || '',
  };
}

/* ─── Camel → Snake converters (for saving to Supabase) */

function _toDbBom(p) {
  return {
    part_number: p.partNumber, part_name: p.partName, part_desc: p.partDesc,
    hsn_code: p.hsnCode, part_type: p.partType, rework_required: p.reworkRequired,
    material: p.material, qty: p.qty, uom: p.uom,
    vendor_currency: p.vendorCurrency, vendor_unit_rate: p.vendorUnitRate,
    total_unit_cost: p.totalUnitCost, custom_duty: p.customDuty,
    surcharge_percent: p.surchargePercent, duty_percent: p.dutyPercent,
    total_freight: p.totalFreight, landed_cost: p.landedCost,
    supplier_name: p.supplierName, country: p.country,
    lead_time_days: p.leadTimeDays, urgency: p.urgency,
    individual_qty: p.individualQty, sub_assemblies: p.subAssemblies,
    uploaded_at: new Date().toISOString(),
  };
}

function _toDbInv(i) {
  return {
    item_code: i.itemCode, item_name: i.itemName, per_unit_qty: i.perUnitQty,
    opening_stock: i.openingStock, current_stock: i.currentStock,
    line_stock: i.lineStock, set_produce_old_part: i.setProdOldPart,
    set_produce_new_part: i.setProdNewPart, new_parts: i.newParts,
    stock_at_antunes: i.stockAntunes, stock_sent_dubai: i.stockSentDubai,
    stock_to_receive_dubai: i.stockReceiveDubai,
    balance_line_stock_1f: i.balanceLineStock1F,
    stock_1f_and_store: i.stock1FAndStore,
    balance_after_220_sets: i.balanceAfter220Sets,
    lead_time: i.leadTime, reorder_point: i.reorderPoint,
    stock_status: i.stockStatus, balance_after_220_qty: i.balanceAfter220Qty,
    remark: i.remark, eta: i.eta, material_status: i.materialStatus,
    material_comments: i.materialComments,
    shortfall_100_antunes: i.shortfall100, shortfall_350_antunes: i.shortfall350,
    shortfall_250_antunes: i.shortfall250, cost_per_pcs: i.costPerPcs,
    balance_stock_amount: i.balanceStockAmount, remarks: i.remarks,
    updated_at: new Date().toISOString(),
  };
}

function _toDbProd(p) {
  return {
    item_code: p.itemCode, item_name: p.itemName, per_unit_qty: p.perUnitQty,
    stock_location: p.stockLocation, line_issue: p.lineIssue,
    line_rejection: p.lineRejection,
    updated_at: new Date().toISOString(),
  };
}

/* ─── Public API ───────────────────────────────────── */
const BomDB = (() => {

  async function open() { return true; } // no-op for Supabase

  /* getAll — returns camelCase objects */
  async function getAll(table) {
    const rows = await _req(_url(table, 'select=*&limit=5000'), {
      headers: { ..._H(), 'Prefer': 'return=representation' },
    });
    if (table === 'bom_parts')       return rows.map(_fromDbBom);
    if (table === 'store_inventory') return rows.map(_fromDbInv);
    if (table === 'production_line') return rows.map(_fromDbProd);
    return rows;
  }

  /* putAll — accepts camelCase objects, converts internally */
  async function putAll(table, items) {
    if (!items.length) return 0;
    let rows;
    if (table === 'bom_parts')       rows = items.map(_toDbBom);
    else if (table === 'store_inventory') rows = items.map(_toDbInv);
    else if (table === 'production_line') rows = items.map(_toDbProd);
    else rows = items;

    const BATCH = 400;
    for (let i = 0; i < rows.length; i += BATCH) {
      await _req(_url(table), {
        method: 'POST',
        headers: { ..._H(), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows.slice(i, i + BATCH)),
      });
    }
    return items.length;
  }

  /* clearAndInsert — wipe then insert */
  async function clearAndInsert(table, items) {
    await _deleteAll(table);
    if (!items.length) return 0;
    return putAll(table, items);
  }

  async function _deleteAll(table) {
    const filters = ['updated_at=gte.1970-01-01', 'uploaded_at=gte.1970-01-01'];
    for (const f of filters) {
      await fetch(_url(table, f), { method: 'DELETE', headers: _H() }).catch(() => {});
    }
  }

  async function count(table) {
    try {
      const res = await fetch(_url(table, 'select=*'), {
        headers: { ..._H(), 'Prefer': 'count=exact', 'Range-Unit': 'items', 'Range': '0-0' },
      });
      const cr = res.headers.get('content-range') || '';
      const n  = cr.split('/')[1];
      return (n && n !== '*') ? (parseInt(n) || 0) : 0;
    } catch { return 0; }
  }

  async function setMeta(key, value) {
    await _req(_url('bom_metadata'), {
      method: 'POST',
      headers: { ..._H(), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ key, value: String(value), updated_at: new Date().toISOString() }),
    });
  }

  async function getMeta(key) {
    try {
      const rows = await _req(
        _url('bom_metadata', `key=eq.${encodeURIComponent(key)}&select=*`),
        { headers: { ..._H(), 'Prefer': 'return=representation' } }
      );
      return rows[0] || null;
    } catch { return null; }
  }

  async function clearAll() {
    await Promise.all([
      _deleteAll('bom_parts'), _deleteAll('store_inventory'),
      _deleteAll('production_line'), _deleteAll('bom_metadata'),
    ]);
  }

  return { open, getAll, putAll, clearAndInsert, count, setMeta, getMeta, clearAll };
})();