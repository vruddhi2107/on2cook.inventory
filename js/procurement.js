/**
 * procurement.js — Procurement / Purchase Manager · On2Cook BOM Portal
 *
 * Vendor Classification (auto-derived from part numbers):
 *   "O2C-EL-RM-001" → segment[1] after O2C- determines type
 *   EL → Electrical | HW → Hardware | EC → Electronics
 *   ME → Mechanical | SA → Sub-Assembly
 *   Category + Country = majority value across the vendor's parts.
 *
 * Notes: persisted via bom_metadata key 'vendor_notes_v1' as JSON blob.
 * Filters: category dropdown + country dropdown, both derived from live data.
 */

var Proc = (function () {

  /* ══ STATE ═══════════════════════════════════════════ */
  var _data        = {};
  var _bom         = [];
  var _expanded    = {};
  var _search      = '';
  var _catFilter   = '';
  var _cntryFilter = '';
  var _editBuf     = {};
  var _notes       = {};
  var _NOTES_KEY   = 'vendor_notes_v1';

  /* ══ DB ══════════════════════════════════════════════ */
  function _H() {
    return { 'Content-Type':'application/json', 'apikey':SUPABASE_KEY,
             'Authorization':'Bearer '+(window._authToken||SUPABASE_KEY) };
  }
  function _procUrl(qs) { return SUPABASE_URL+'/rest/v1/procurement_data'+(qs?'?'+qs:''); }

  async function _fetchProc() {
    var res = await fetch(_procUrl('select=*&limit=10000'), { headers:_H() });
    if (!res.ok) throw new Error('procurement_data: '+await res.text());
    var rows = await res.json();
    _data = {};
    rows.forEach(function(r){ _data[r.part_number] = r; });
  }
  async function _upsert(row) {
    row.updated_at = new Date().toISOString();
    var res = await fetch(_procUrl(), {
      method:'POST',
      headers:Object.assign({},_H(),{'Prefer':'resolution=merge-duplicates,return=minimal'}),
      body:JSON.stringify(row)
    });
    if (!res.ok) throw new Error('Save failed: '+await res.text());
  }
  async function _loadNotes() {
    try {
      var row = await BomDB.getMeta(_NOTES_KEY);
      _notes = row ? JSON.parse(row.value||'{}') : {};
    } catch(e) { _notes = {}; }
  }
  async function _persistNotes() {
    try { await BomDB.setMeta(_NOTES_KEY, JSON.stringify(_notes)); } catch(e) {}
  }

  /* ══ VENDOR CLASSIFICATION ═══════════════════════════ */
  var _TYPE_MAP = {
    el:'Electrical', hw:'Hardware', ec:'Electronics',
    me:'Mechanical', sa:'Sub-Assembly'
  };

  function _partTypeCode(pn) {
    if (!pn) return null;
    var m = String(pn).toLowerCase().match(/^o2c[-_]([a-z]+)[-_]/);
    return m ? m[1] : null;
  }

  function _majorityOf(arr) {
    if (!arr.length) return null;
    var counts = {};
    arr.forEach(function(v){ if(v) counts[v]=(counts[v]||0)+1; });
    var keys = Object.keys(counts);
    if (!keys.length) return null;
    keys.sort(function(a,b){ return counts[b]-counts[a]; });
    return keys[0];
  }

  function _vendorCategory(parts) {
    var codes = parts.map(function(p){ return _partTypeCode(p.partNumber); }).filter(Boolean);
    var majority = _majorityOf(codes);
    if (!majority) return 'General';
    return _TYPE_MAP[majority] || majority.toUpperCase();
  }

  function _vendorCountry(parts) {
    var countries = parts.map(function(p){
      var pd = _data[p.partNumber];
      return (pd && pd.country) || p.country || '';
    }).filter(Boolean);
    return _majorityOf(countries) || '—';
  }

  /* ══ FIELD DEFINITIONS ═══════════════════════════════ */
  var FIELDS = [
    { key:'quantity',          label:'Quantity',             type:'num', w:90,  src:'bom' },
    { key:'uom',               label:'UOM',                  type:'txt', w:60,  src:'bom' },
    { key:'unit_rate',         label:'Unit Rate',            type:'num', w:100, src:'proc' },
    { key:'total_rm_cost',     label:'Total RM Cost (BOM)',  type:'num', w:130, src:'proc', computed:true },
    { key:'currency',          label:'Currency',             type:'txt', w:75,  src:'proc' },
    { key:'country',           label:'Country',              type:'txt', w:95,  src:'proc' },
    { key:'price_moq_1000',    label:'Price @ MOQ 1000',     type:'num', w:115, src:'proc' },
    { key:'currency_moq_1000', label:'Currency (MOQ 1K)',    type:'txt', w:95,  src:'proc' },
    { key:'country_moq_1000',  label:'Country (MOQ 1K)',     type:'txt', w:105, src:'proc' },
    { key:'price_moq_3000',    label:'Price @ MOQ 3000',     type:'num', w:115, src:'proc' },
    { key:'currency_moq_3000', label:'Currency (MOQ 3K)',    type:'txt', w:95,  src:'proc' },
    { key:'country_moq_3000',  label:'Country (MOQ 3K)',     type:'txt', w:105, src:'proc' },
    { key:'price_moq_5000',    label:'Price @ MOQ 5000',     type:'num', w:115, src:'proc' },
    { key:'currency_moq_5000', label:'Currency (MOQ 5K)',    type:'txt', w:95,  src:'proc' },
    { key:'country_moq_5000',  label:'Country (MOQ 5K)',     type:'txt', w:105, src:'proc' },
    { key:'diff_1000',         label:'Diff (MOQ 1K − Rate)', type:'num', w:135, src:'computed', computed:true },
    { key:'diff_3000',         label:'Diff (MOQ 3K − Rate)', type:'num', w:135, src:'computed', computed:true },
    { key:'diff_5000',         label:'Diff (MOQ 5K − Rate)', type:'num', w:135, src:'computed', computed:true },
  ];

  /* ══ LOAD ════════════════════════════════════════════ */
  async function load(bomRows) {
    _bom = bomRows||[];
    _data = {};
    try { await _fetchProc(); } catch(e){ console.warn('procurement_data:', e.message); }
    await _loadNotes();
    render();
  }

  /* ══ MAIN RENDER ═════════════════════════════════════ */
  function render() {
    var area = document.getElementById('proc-area');
    if (!area) return;

    if (!_bom.length) {
      area.innerHTML = _empty('📦','No BOM Data','Upload Device BOM first to see vendor groupings.'); return;
    }

    /* Build vendor map */
    var vendorMap = {};
    _bom.forEach(function(p){
      var v = (p.supplierName||'Unknown Vendor').trim();
      if (!vendorMap[v]) vendorMap[v]=[];
      vendorMap[v].push(p);
    });

    /* Derive meta for each vendor */
    var vendorMeta = {};
    Object.keys(vendorMap).forEach(function(v){
      vendorMeta[v] = { category:_vendorCategory(vendorMap[v]), country:_vendorCountry(vendorMap[v]) };
    });

    var vendors = Object.keys(vendorMap).sort();

    /* Collect unique values for filter dropdowns */
    var allCats = [], allCntries = [];
    vendors.forEach(function(v){
      var c = vendorMeta[v].category, n = vendorMeta[v].country;
      if (c && allCats.indexOf(c)===-1) allCats.push(c);
      if (n && n!=='—' && allCntries.indexOf(n)===-1) allCntries.push(n);
    });
    allCats.sort(); allCntries.sort();

    /* Filter */
    var filtered = vendors.filter(function(v){
      if (_search){
        var hit = v.toLowerCase().includes(_search) ||
          vendorMap[v].some(function(p){ return (p.partNumber+' '+p.partName).toLowerCase().includes(_search); });
        if (!hit) return false;
      }
      if (_catFilter   && vendorMeta[v].category !== _catFilter)   return false;
      if (_cntryFilter && vendorMeta[v].country  !== _cntryFilter) return false;
      return true;
    });

    /* Stats */
    var quotedV  = vendors.filter(function(v){
      return vendorMap[v].some(function(p){ return _data[p.partNumber]&&_data[p.partNumber].quote_pdf_name; });
    }).length;
    var covered  = _bom.filter(function(p){ return !!_data[p.partNumber]; }).length;

    /* Filter dropdown base styles */
    var fSel = 'padding:7px 11px;border:1.5px solid var(--g2);font-size:12px;font-family:var(--FB);background:var(--g1);outline:none;cursor:pointer;min-width:130px';
    var fFocus = "onfocus=\"this.style.borderColor='var(--red)'\" onblur=\"this.style.borderColor='var(--g2)'\"";

    var html =
      /* Stats row */
      '<div class="proc-stats">' +
        _stat('Vendors',   vendors.length,  'Unique suppliers') +
        _stat('BOM Parts', _bom.length,     'Across all vendors') +
        _stat('Quoted',    quotedV,         'Vendors with final quote') +
        _stat('Covered',   covered,         'Parts with data') +
      '</div>' +

      /* Toolbar */
      '<div class="proc-toolbar" style="gap:8px;flex-wrap:wrap">' +
        /* Search */
        '<div class="sw" style="max-width:260px;flex-shrink:0">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
          '<input type="text" placeholder="Search vendor or part…" oninput="Proc.setSearch(this.value)" value="'+_esc(_search)+'">' +
        '</div>' +

        /* Category filter */
        '<div style="display:flex;flex-direction:column;gap:2px">' +
          '<label style="font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--g4)">Category</label>' +
          '<select style="'+fSel+'" '+fFocus+' onchange="Proc.setFilter(\'cat\',this.value)">' +
            '<option value="">All</option>' +
            allCats.map(function(c){ return '<option value="'+_esc(c)+'"'+(_catFilter===c?' selected':'')+'>'+_esc(c)+'</option>'; }).join('') +
          '</select>' +
        '</div>' +

        /* Country filter */
        '<div style="display:flex;flex-direction:column;gap:2px">' +
          '<label style="font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--g4)">Country</label>' +
          '<select style="'+fSel+'" '+fFocus+' onchange="Proc.setFilter(\'country\',this.value)">' +
            '<option value="">All</option>' +
            allCntries.map(function(c){ return '<option value="'+_esc(c)+'"'+(_cntryFilter===c?' selected':'')+'>'+_esc(c)+'</option>'; }).join('') +
          '</select>' +
        '</div>' +

        (_catFilter||_cntryFilter
          ? '<div style="display:flex;align-items:flex-end"><button style="padding:7px 12px;background:var(--red);color:white;border:none;font-family:var(--FH);font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;cursor:pointer;height:35px" onclick="Proc.clearFilters()">✕ Clear</button></div>'
          : '') +

        '<span style="margin-left:auto;font-family:var(--FM);font-size:11px;color:#888;align-self:flex-end;padding-bottom:1px">' +
          '<strong>'+filtered.length+'</strong> of <strong>'+vendors.length+'</strong> vendors</span>' +

        (Auth.canEditTab('procurement')
          ? '<div style="align-self:flex-end"><button class="btn-s btn-red" onclick="Proc.saveAll()">💾 Save All Changes</button></div>'
          : '') +
      '</div>' +

      /* Vendor cards */
      (filtered.length
        ? filtered.map(function(v){ return _renderVendorSection(v, vendorMap[v], vendorMeta[v]); }).join('')
        : '<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-title">No vendors match</div><div class="empty-sub">Try clearing the filters</div></div>');

    area.innerHTML = html;
  }

  /* ══ VENDOR SECTION ══════════════════════════════════ */
  function _renderVendorSection(vendor, parts, meta) {
    var isExp   = !!_expanded[vendor];
    var sid     = _sid(vendor);
    var covered = parts.filter(function(p){ return !!_data[p.partNumber]; }).length;
    var hasQuote = parts.some(function(p){ return _data[p.partNumber]&&_data[p.partNumber].quote_pdf_name; });
    var quoteName = parts.reduce(function(a,p){ return a||(_data[p.partNumber]&&_data[p.partNumber].quote_pdf_name)||''; },'');
    var note    = _notes[vendor]||'';

    /* Category colour map */
    var CAT_COLOR = {
      'Electrical':  {bg:'#EAF3FF',fg:'#0060A0',br:'#AACCFF'},
      'Hardware':    {bg:'#FFF3EA',fg:'#B85000',br:'#FFD0A0'},
      'Electronics': {bg:'#F0E8FF',fg:'#6600AA',br:'#D0A8FF'},
      'Mechanical':  {bg:'#EAFBEA',fg:'#1A6A1A',br:'#A0E0A0'},
      'Sub-Assembly':{bg:'#FFEAEA',fg:'#C00000',br:'#FFB0B0'},
      'General':     {bg:'#F5F5F5',fg:'#666',   br:'#CCC'},
    };
    var cc = CAT_COLOR[meta.category]||CAT_COLOR['General'];

    var catTag = '<span style="padding:3px 10px;font-family:var(--FH);font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;background:'+cc.bg+';color:'+cc.fg+';border:1px solid '+cc.br+'">'+_esc(meta.category)+'</span>';
    var cntryTag = (meta.country&&meta.country!=='—')
      ? '<span style="padding:3px 10px;font-family:var(--FM);font-size:10.5px;background:var(--g1);color:var(--g5);border:1px solid var(--g2)">🌍 '+_esc(meta.country)+'</span>'
      : '';

    return '<div class="vendor-section" id="vs-'+sid+'">' +

      /* Header */
      '<div class="vendor-hdr" onclick="Proc.toggleVendor(\''+_esc(vendor)+'\')">' +
        '<div class="vendor-hdr-left">' +
          '<div class="vendor-chevron">'+(isExp?'▼':'▶')+'</div>' +
          '<div class="vendor-logo-block">'+_initials(vendor)+'</div>' +
          '<div>' +
            '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
              '<span class="vendor-name">'+_esc(vendor)+'</span>' +
              catTag + cntryTag +
            '</div>' +
            '<div class="vendor-meta" style="margin-top:4px">' +
              parts.length+' part'+(parts.length!==1?'s':'')+
              ' · '+covered+' with data' +
              (note?' · <span style="color:#B87300;font-size:10px">📝 note</span>':'') +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="vendor-hdr-right" onclick="event.stopPropagation()">' +
          (hasQuote
            ? '<a class="quote-pill quoted" href="#" onclick="Proc.downloadQuote(\''+_esc(vendor)+'\');return false">📎 '+_esc(quoteName)+'</a>'
            : '<span class="quote-pill no-quote">No quote uploaded</span>') +
          (Auth.canEditTab('procurement')
            ? '<label class="quote-upload-btn"><input type="file" accept=".pdf" onchange="Proc.uploadQuote(\''+_esc(vendor)+'\',this)" style="display:none">'+(hasQuote?'↺ Replace Quote':'＋ Upload Quote (.pdf)')+'</label>'
            : '') +
        '</div>' +
      '</div>' +

      /* Body */
      '<div class="vendor-body" id="vb-'+sid+'" style="display:'+(isExp?'':'none')+'">' +
        _renderTable(vendor, parts) +
        _renderNotes(vendor, note) +
      '</div>' +

    '</div>';
  }

  function _renderNotes(vendor, note) {
    var canEdit = Auth.canEditTab('procurement');
    return '<div style="padding:14px 20px;border-top:1px solid var(--g2);background:var(--g1)">' +
      '<div style="font-family:var(--FH);font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--g5);margin-bottom:8px">📝 Notes / Remarks</div>' +
      (canEdit
        ? '<textarea id="note-'+_sid(vendor)+'" rows="3" placeholder="Negotiation notes, contact info, remarks…" ' +
          'style="width:100%;padding:10px 12px;border:1.5px solid var(--g2);font-family:var(--FB);font-size:12.5px;resize:vertical;outline:none;background:white;line-height:1.6;box-sizing:border-box" ' +
          'onfocus="this.style.borderColor=\'var(--red)\'" ' +
          'onblur="this.style.borderColor=\'var(--g2)\';Proc.saveNote(\''+_esc(vendor)+'\',this.value)">' +
          _esc(note)+'</textarea>'
        : (note
            ? '<p style="font-size:12.5px;color:var(--g5);line-height:1.6;white-space:pre-wrap;background:white;padding:10px 12px;border:1px solid var(--g2)">'+_esc(note)+'</p>'
            : '<p style="font-size:12px;color:var(--g4);font-style:italic">No notes added.</p>')) +
    '</div>';
  }

  function _renderTable(vendor, parts) {
    var canEdit  = Auth.canEditTab('procurement');
    var TH = 'background:var(--black-3);color:white;padding:9px 10px;font-family:var(--FH);font-size:10px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;white-space:nowrap;border-right:1px solid #3D3D3D';
    var thead = '<th style="'+TH+'">Part Number</th><th style="'+TH+'">Part Name</th>' +
      FIELDS.map(function(f){ return '<th style="'+TH+(f.type==='num'?';text-align:right':'')+'">'+f.label+'</th>'; }).join('') +
      '<th style="'+TH+'">Final Quote (PDF)</th>';

    /* Totals accumulator */
    var totals = {};
    FIELDS.forEach(function(f){ if(f.type==='num'&&!f.computed) totals[f.key]=0; });

    var rows = parts.map(function(p){
      var pd  = _data[p.partNumber]||{};
      var buf = _editBuf[p.partNumber]||{};
      var qty = p.quantity||0;
      var ur  = _n(buf.unit_rate!==undefined?buf.unit_rate:pd.unit_rate);
      var rm  = +(ur*qty).toFixed(2);
      var d1k = _n(buf.price_moq_1000!==undefined?buf.price_moq_1000:pd.price_moq_1000) - ur;
      var d3k = _n(buf.price_moq_3000!==undefined?buf.price_moq_3000:pd.price_moq_3000) - ur;
      var d5k = _n(buf.price_moq_5000!==undefined?buf.price_moq_5000:pd.price_moq_5000) - ur;

      FIELDS.forEach(function(f){
        if(f.type==='num'&&!f.computed&&totals[f.key]!==undefined){
          totals[f.key] = +(totals[f.key]+_n(buf[f.key]!==undefined?buf[f.key]:pd[f.key])).toFixed(2);
        }
      });

      var cells = FIELDS.map(function(f){
        var val;
        if(f.src==='bom')         val = f.key==='quantity'?qty:(p.uom||'PCS');
        else if(f.key==='total_rm_cost') val = rm;
        else if(f.key==='diff_1000') val = d1k;
        else if(f.key==='diff_3000') val = d3k;
        else if(f.key==='diff_5000') val = d5k;
        else { val = buf[f.key]!==undefined?buf[f.key]:(pd[f.key]!==undefined?pd[f.key]:''); }

        var isRO = f.src==='bom'||f.computed;
        var num  = f.type==='num'&&val!==''&&val!==null&&val!==undefined ? +val : null;

        /* Diff cells — coloured arrow */
        if(f.key.startsWith('diff_')){
          var dsp = num!==null&&num!==0
            ? '<span style="color:'+(num<0?'#C80000':'#1A7A1A')+';font-family:var(--FM);font-size:11.5px;font-weight:600">'+(num<0?'▼ ':'▲ ')+Math.abs(num).toLocaleString('en-IN',{maximumFractionDigits:2})+'</span>'
            : '<span style="color:#CCC;font-size:10px">—</span>';
          return '<td style="padding:7px 10px;border-right:1px solid #EEE;white-space:nowrap;text-align:right">'+dsp+'</td>';
        }

        var inp;
        if(!isRO&&canEdit){
          inp = '<input class="cell-input" type="'+(f.type==='num'?'number':'text')+'" value="'+_esc(val!==null&&val!==undefined?val:'')+'" '+
            'data-pn="'+_esc(p.partNumber)+'" data-field="'+f.key+'" oninput="Proc.bufEdit(this)" '+
            'style="width:'+(f.w-20)+'px;padding:5px 7px;border:1.5px solid #DDD;font-family:var(--FM);font-size:11.5px;background:white;outline:none" '+
            'onfocus="this.style.borderColor=\'var(--red)\'" onblur="this.style.borderColor=\'#DDD\'">';
        } else {
          var s = num!==null?num.toLocaleString('en-IN',{maximumFractionDigits:2}):(val||'—');
          inp = '<span style="font-family:var(--FM);font-size:11.5px;color:'+(isRO?'#555':'#111')+'">'+_esc(String(s))+'</span>';
        }
        return '<td style="padding:7px 10px;border-right:1px solid #EEE;white-space:nowrap;'+(f.type==='num'?'text-align:right;':'')+(f.key==='total_rm_cost'?'background:#F8F0FF;':'')+'">'+inp+'</td>';
      });

      var pdfCell = '<td style="padding:7px 10px;border-right:1px solid #EEE;white-space:nowrap">' +
        (pd.quote_pdf_name ? '<span style="font-size:10px;color:#555;font-family:var(--FM)">📎 '+_esc(pd.quote_pdf_name)+'</span>' : '<span style="color:#CCC;font-size:10px">—</span>') +
        '</td>';

      return '<tr onmouseover="this.style.background=\'#FAFAFA\'" onmouseout="this.style.background=\'\'">' +
        '<td style="padding:7px 10px;border-right:1px solid #EEE;white-space:nowrap"><span style="font-family:var(--FM);font-size:11.5px;color:var(--red);font-weight:600">'+_esc(p.partNumber)+'</span></td>' +
        '<td style="padding:7px 10px;border-right:1px solid #EEE;white-space:nowrap;max-width:160px;overflow:hidden;text-overflow:ellipsis"><strong style="font-size:11.5px">'+_esc(p.partName)+'</strong></td>' +
        cells.join('')+pdfCell+'</tr>';
    }).join('');

    /* Total footer row */
    var TB = 'padding:7px 10px;border-right:1px solid #3D3D3D;background:#1A1A1A;white-space:nowrap;';
    var totCols = [
      '<td style="'+TB+'">' +
        '<span style="font-family:var(--FH);font-size:13px;font-weight:800;letter-spacing:1px;color:white;text-transform:uppercase">TOTAL</span>' +
        '<div style="font-size:9px;color:#666;font-family:var(--FM)">'+parts.length+' parts</div>' +
      '</td>',
      '<td style="'+TB+'background:#111"></td>',
    ].concat(FIELDS.map(function(f){
      if(f.type==='num'&&!f.computed&&totals[f.key]!==undefined){
        return '<td style="'+TB+'text-align:right;font-family:var(--FM);font-size:11.5px;color:white;font-weight:700">'+totals[f.key].toLocaleString('en-IN',{maximumFractionDigits:2})+'</td>';
      }
      return '<td style="'+TB+'background:#111"></td>';
    })).concat(['<td style="'+TB+'background:#111"></td>']);

    return '<div style="overflow-x:auto">' +
      '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
      '<thead><tr>'+thead+'</tr></thead>' +
      '<tbody>'+rows+'<tr>'+totCols.join('')+'</tr></tbody>' +
      '</table></div>';
  }

  /* ══ PUBLIC API ═══════════════════════════════════════ */
  function setSearch(v)  { _search = v.trim().toLowerCase(); render(); }
  function search(v)     { setSearch(v); }
  function setFilter(type, val) {
    if(type==='cat')     _catFilter   = val;
    if(type==='country') _cntryFilter = val;
    render();
  }
  function clearFilters() { _catFilter=''; _cntryFilter=''; render(); }

  function toggleVendor(vendor) { _expanded[vendor]=!_expanded[vendor]; render(); }

  function bufEdit(input) {
    var pn=input.getAttribute('data-pn'), field=input.getAttribute('data-field');
    if(!pn||!field) return;
    if(!_editBuf[pn]) _editBuf[pn]={};
    _editBuf[pn][field] = input.type==='number' ? (parseFloat(input.value)||0) : input.value;
  }

  async function saveAll() {
    if(!Auth.canEditTab('procurement')){ showToast('Access denied — no Procurement edit permission','error'); return; }
    var keys = Object.keys(_editBuf);
    if(!keys.length){ showToast('No changes to save','info'); return; }
    try {
      for(var i=0;i<keys.length;i++){
        var pn  = keys[i];
        var row = Object.assign({},_data[pn]||{},_editBuf[pn],{part_number:pn});
        if(!row.supplier_name){
          var bp = _bom.find(function(p){ return p.partNumber===pn; });
          if(bp) row.supplier_name = bp.supplierName||'';
        }
        await _upsert(row); _data[pn]=row;
      }
      _editBuf = {};
      showToast('✓ Saved '+keys.length+' procurement rows','success');
      render();
    } catch(e){ showToast('Save error: '+e.message,'error'); }
  }

  async function saveNote(vendor, text) {
    _notes[vendor] = text.trim();
    await _persistNotes();
    /* update the note indicator badge inline */
    var sid = _sid(vendor);
    var metaEl = document.querySelector('#vs-'+sid+' .vendor-meta');
    if(metaEl&&_notes[vendor]&&!metaEl.innerHTML.includes('📝')){
      metaEl.innerHTML += ' · <span style="color:#B87300;font-size:10px">📝 note</span>';
    }
  }

  function uploadQuote(vendor, input) {
    var file = input.files[0];
    if(!file) return;
    if(file.size>8*1024*1024){ showToast('PDF must be under 8 MB','error'); return; }
    var reader = new FileReader();
    reader.onload = async function(ev){
      var b64 = ev.target.result.split(',')[1];
      var vp  = _bom.filter(function(p){ return (p.supplierName||'Unknown Vendor').trim()===vendor; });
      try {
        for(var i=0;i<vp.length;i++){
          var pn  = vp[i].partNumber;
          var row = Object.assign({},_data[pn]||{},{
            part_number:pn, supplier_name:vendor,
            quote_pdf_b64:b64, quote_pdf_name:file.name,
            quote_uploaded_at:new Date().toISOString()
          });
          if(!row.quantity) row.quantity=vp[i].quantity||0;
          await _upsert(row); _data[pn]=row;
        }
        showToast('✓ Quote uploaded for '+vendor,'success'); render();
      } catch(e){ showToast('Upload error: '+e.message,'error'); }
    };
    reader.readAsDataURL(file);
  }

  function downloadQuote(vendor) {
    var vp = _bom.filter(function(p){ return (p.supplierName||'Unknown Vendor').trim()===vendor; });
    var row = null;
    for(var i=0;i<vp.length;i++){ var d=_data[vp[i].partNumber]; if(d&&d.quote_pdf_b64){row=d;break;} }
    if(!row){ showToast('No quote found','info'); return; }
    var bytes=atob(row.quote_pdf_b64), arr=new Uint8Array(bytes.length);
    for(var j=0;j<bytes.length;j++) arr[j]=bytes.charCodeAt(j);
    var blob=new Blob([arr],{type:'application/pdf'}), url=URL.createObjectURL(blob);
    var a=document.createElement('a'); a.href=url; a.download=row.quote_pdf_name||'quote.pdf'; a.click();
    URL.revokeObjectURL(url);
  }

  /* ══ HELPERS ══════════════════════════════════════════ */
  function _n(v){ var n=parseFloat(v); return isNaN(n)?0:n; }
  function _esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
  function _sid(s){ return String(s||'').replace(/[^a-zA-Z0-9_-]/g,'_'); }
  function _initials(s){ return String(s||'').trim().split(/\s+/).slice(0,2).map(function(w){return w[0]||'';}).join('').toUpperCase()||'??'; }
  function _stat(lbl,val,sub){
    return '<div class="proc-stat"><div class="proc-stat-val">'+val+'</div><div class="proc-stat-lbl">'+lbl+'</div><div class="proc-stat-sub">'+sub+'</div></div>';
  }
  function _empty(icon,title,sub){
    return '<div class="empty-state"><div class="empty-icon">'+icon+'</div><div class="empty-title">'+title+'</div><div class="empty-sub">'+sub+'</div></div>';
  }

  return { load, render, search, setSearch, setFilter, clearFilters,
           toggleVendor, bufEdit, saveAll, saveNote, uploadQuote, downloadQuote };
})();