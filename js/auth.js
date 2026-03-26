/**
 * auth.js — Authentication & Role Management · On2Cook BOM Portal
 *
 * Roles:
 *   viewer  — read-only across all tabs
 *   editor  — edits specific tabs based on tab_permissions array
 *   admin   — full access to everything including upload panel + user management
 *
 * tab_permissions (only meaningful for role=editor):
 *   Stored as JSON-string in user_profiles.tab_permissions
 *   Possible values in array: "bom" | "store" | "procurement" | "all"
 *   Examples:
 *     ["bom"]                   → editor of BOM only
 *     ["store","procurement"]   → editor of Store + Procurement
 *     ["all"]                   → editor of all three tabs
 *
 * Required DB change:
 *   ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS tab_permissions TEXT DEFAULT '[]';
 */

var Auth = (function () {

  var SESSION_KEY = 'o2c_session';
  var state = { user: null, profile: null, accessToken: null, refreshToken: null };

  /* ── Request helpers ── */
  function _H(token) {
    return { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + (token || SUPABASE_KEY) };
  }
  async function _authReq(path, opts, token) {
    var res  = await fetch(SUPABASE_URL + path, Object.assign({}, opts, { headers: _H(token) }));
    var ct   = res.headers.get('content-type') || '';
    var body = ct.includes('json') ? await res.json() : {};
    if (!res.ok) throw new Error(body.error_description || body.msg || body.message || 'Auth error ' + res.status);
    return body;
  }
  async function _rest(path, opts, token) {
    var res  = await fetch(SUPABASE_URL + '/rest/v1/' + path, Object.assign({}, opts, { headers: _H(token) }));
    if (res.status === 204) return [];
    var ct   = res.headers.get('content-type') || '';
    var body = ct.includes('json') ? await res.json() : [];
    if (!res.ok) throw new Error(Array.isArray(body) ? 'DB error' : (body.message || body.error || JSON.stringify(body)));
    return body;
  }

  /* ── Session ── */
  function _save(data)  { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(data)); } catch(e){} }
  function _clear()     { try { sessionStorage.removeItem(SESSION_KEY); } catch(e){} }
  function _load()      { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch(e){ return null; } }
  function _applyTok(t) { window._authToken = t; }

  /* ── Permissions parser ── */
  function _perms(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try { return JSON.parse(raw); } catch(e) { return []; }
  }

  /* ── Profile CRUD ── */
  async function _getProfile(userId, token) {
    var rows = await _rest('user_profiles?user_id=eq.' + encodeURIComponent(userId) + '&select=*',
      { headers: Object.assign(_H(token), { 'Prefer': 'return=representation' }) }, token);
    if (!rows[0]) return null;
    rows[0].tab_permissions = _perms(rows[0].tab_permissions);
    return rows[0];
  }
  async function _makeProfile(userId, email, name, token) {
    await _rest('user_profiles', {
      method: 'POST',
      headers: Object.assign(_H(token), { 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({ user_id: userId, email, display_name: name || email.split('@')[0], role: 'viewer', tab_permissions: '[]' })
    }, token);
    return _getProfile(userId, token);
  }

  /* ══════════════════════════
     PUBLIC AUTH API
  ══════════════════════════ */
  async function signup(email, password, displayName) {
    var d = await _authReq('/auth/v1/signup', { method: 'POST', body: JSON.stringify({ email, password, data: { display_name: displayName } }) });
    if (!d.access_token || !d.user?.id) throw new Error('Signup incomplete — verify your email if required.');
    state.user = { id: d.user.id, email };
    state.accessToken = d.access_token;
    state.refreshToken = d.refresh_token;
    state.profile = await _makeProfile(d.user.id, email, displayName, d.access_token);
    _save({ user: state.user, profile: state.profile, accessToken: state.accessToken, refreshToken: state.refreshToken });
    _applyTok(d.access_token);
    return state;
  }

  async function login(email, password) {
    var d = await _authReq('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (!d.access_token || !d.user?.id) throw new Error('Login failed.');
    state.user = { id: d.user.id, email };
    state.accessToken = d.access_token;
    state.refreshToken = d.refresh_token;
    state.profile = await _getProfile(d.user.id, d.access_token) || await _makeProfile(d.user.id, email, d.user.user_metadata?.display_name, d.access_token);
    _save({ user: state.user, profile: state.profile, accessToken: state.accessToken, refreshToken: state.refreshToken });
    _applyTok(d.access_token);
    return state;
  }

  async function logout() {
    if (state.accessToken) try { await _authReq('/auth/v1/logout', { method: 'POST' }, state.accessToken); } catch(e){}
    state = { user: null, profile: null, accessToken: null, refreshToken: null };
    _clear(); _applyTok(null);
  }

  async function restoreSession() {
    var saved = _load();
    if (!saved?.accessToken) return false;
    try {
      var u = await _authReq('/auth/v1/user', {}, saved.accessToken);
      state.user = { id: u.id, email: u.email };
      state.accessToken = saved.accessToken;
      state.refreshToken = saved.refreshToken;
      state.profile = await _getProfile(u.id, saved.accessToken) || await _makeProfile(u.id, u.email, null, saved.accessToken);
      _save({ user: state.user, profile: state.profile, accessToken: state.accessToken, refreshToken: state.refreshToken });
      _applyTok(state.accessToken);
      return true;
    } catch(e) { _clear(); return false; }
  }

  /* ══════════════════════════
     ROLE / PERMISSION GETTERS
  ══════════════════════════ */
  function role()       { return state.profile?.role || 'viewer'; }
  function isAdmin()    { return role() === 'admin'; }
  function isEditor()   { return role() === 'editor' || role() === 'admin'; }
  function isLoggedIn() { return !!(state.user && state.accessToken); }
  function displayName(){ return state.profile?.display_name || state.user?.email || 'User'; }

  /**
   * canEditTab(tab) — 'bom' | 'store' | 'procurement'
   * Admin: always true. Viewer: always false.
   * Editor: true only if tab_permissions contains tab or 'all'.
   */
  function canEditTab(tab) {
    if (isAdmin()) return true;
    if (role() !== 'editor') return false;
    var p = state.profile?.tab_permissions || [];
    return p.includes('all') || p.includes(tab);
  }

  /** canEdit() — can the user edit at least one thing? */
  function canEdit()  { return isAdmin() || role() === 'editor'; }
  function canAdmin() { return isAdmin(); }

  /** tabPermissions() — the user's current tab_permissions array */
  function tabPermissions() {
    if (isAdmin()) return ['all'];
    return state.profile?.tab_permissions || [];
  }

  /* ══════════════════════════
     ADMIN: USER MANAGEMENT
  ══════════════════════════ */
  async function listUsers() {
    var rows = await _rest('user_profiles?select=*&order=created_at.asc',
      { headers: Object.assign(_H(state.accessToken), { 'Prefer': 'return=representation' }) }, state.accessToken);
    return rows.map(function(r) { r.tab_permissions = _perms(r.tab_permissions); return r; });
  }

  /**
   * updateUser(userId, newRole, newTabPerms)
   * newTabPerms: array — e.g. ['bom','store'] or ['all'] or []
   */
  async function updateUser(userId, newRole, newTabPerms) {
    if (!isAdmin()) throw new Error('Access denied.');
    var permsStr = JSON.stringify(Array.isArray(newTabPerms) ? newTabPerms : []);
    await _rest('user_profiles?user_id=eq.' + encodeURIComponent(userId), {
      method: 'PATCH',
      headers: Object.assign(_H(state.accessToken), { 'Prefer': 'return=minimal' }),
      body: JSON.stringify({ role: newRole, tab_permissions: permsStr, updated_at: new Date().toISOString() })
    }, state.accessToken);
  }

  return { signup, login, logout, restoreSession,
           role, isAdmin, isEditor, isLoggedIn, displayName,
           canEdit, canAdmin, canEditTab, tabPermissions,
           listUsers, updateUser, state };
})();

/* ════════════════════════════════════════════════
   AUTH SCREEN UI
════════════════════════════════════════════════ */
function renderAuthScreen(mode) {
  mode = mode || 'login';
  document.body.classList.add('auth-mode');  // Lock scroll, hide app

  var screen = document.getElementById('auth-screen');
  var app    = document.getElementById('app-screen');
  if (screen) screen.style.display = 'flex';
  if (app)    { app.style.display  = 'none'; app.setAttribute('aria-hidden', 'true'); }

  if (!screen) return;
  var isLogin = (mode === 'login');

  screen.innerHTML =
    '<div class="auth-wrap">' +
      '<div class="auth-brand">' +
        '<div class="auth-brand-inner">' +
          '<div class="auth-logo"></div>' +
          '<div class="auth-brand-name">ON2COOK</div>' +
          '<div class="auth-brand-tag">BOM PORTAL</div>' +
          '<div class="auth-divider"></div>' +
          '<div class="auth-brand-desc">Bill of Materials · Store Inventory · Procurement Management</div>' +
          '<div class="auth-brand-quote">"Precision engineering demands precision data."</div>' +
          '<div class="auth-brand-dots">' +
            '<span class="abd'+(isLogin?' active':'')+'" onclick="renderAuthScreen(\'login\')"></span>' +
            '<span class="abd'+(!isLogin?' active':'')+'" onclick="renderAuthScreen(\'signup\')"></span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="auth-form-panel">' +
        '<div class="auth-form-inner">' +
          '<div class="auth-form-eyebrow">'+(isLogin?'Welcome back':'Join the portal')+'</div>' +
          '<div class="auth-form-title">'+(isLogin?'Sign in to your account':'Create your account')+'</div>' +
          '<div id="auth-error" class="auth-error" style="display:none"></div>' +
          (isLogin ? _loginHTML() : _signupHTML()) +
          '<div class="auth-switch">'+(isLogin
            ? 'New user? <a href="#" onclick="renderAuthScreen(\'signup\');return false">Request access</a>'
            : 'Already have access? <a href="#" onclick="renderAuthScreen(\'login\');return false">Sign in</a>')+'</div>' +
          
        '</div>' +
      '</div>' +
    '</div>';
}

function _loginHTML() {
  return '<form class="auth-form" onsubmit="doLogin(event)">' +
    '<div class="af-group"><label class="af-label">Email address</label><input type="email" id="auth-email" class="af-input" placeholder="you@company.com" required autocomplete="email"></div>' +
    '<div class="af-group"><label class="af-label">Password</label><input type="password" id="auth-password" class="af-input" placeholder="Your password" required autocomplete="current-password"></div>' +
    '<button type="submit" class="af-btn" id="auth-submit">Sign In <span class="af-arrow">→</span></button>' +
    '</form>';
}
function _signupHTML() {
  return '<form class="auth-form" onsubmit="doSignup(event)">' +
    '<div class="af-group"><label class="af-label">Full name</label><input type="text" id="auth-name" class="af-input" placeholder="Your full name" required></div>' +
    '<div class="af-group"><label class="af-label">Email address</label><input type="email" id="auth-email" class="af-input" placeholder="you@company.com" required autocomplete="email"></div>' +
    '<div class="af-group"><label class="af-label">Password</label><input type="password" id="auth-password" class="af-input" placeholder="Min. 8 characters" required minlength="8" autocomplete="new-password"></div>' +
    '<button type="submit" class="af-btn" id="auth-submit">Create Account <span class="af-arrow">→</span></button>' +
    '<p style="font-size:11px;color:#999;margin-top:10px;line-height:1.6">New accounts start as Viewer. An admin assigns your role and tab permissions.</p>' +
    '</form>';
}

async function doLogin(e) {
  e.preventDefault();
  var btn = document.getElementById('auth-submit');
  btn.disabled = true; btn.textContent = 'Signing in…';
  _authErr('');
  try {
    await Auth.login(document.getElementById('auth-email').value.trim(), document.getElementById('auth-password').value);
    _bootApp();
  } catch(err) {
    _authErr(err.message);
    btn.disabled = false; btn.innerHTML = 'Sign In <span class="af-arrow">→</span>';
  }
}
async function doSignup(e) {
  e.preventDefault();
  var btn = document.getElementById('auth-submit');
  btn.disabled = true; btn.textContent = 'Creating account…';
  _authErr('');
  try {
    await Auth.signup(document.getElementById('auth-email').value.trim(), document.getElementById('auth-password').value, document.getElementById('auth-name').value.trim());
    _bootApp();
  } catch(err) {
    _authErr(err.message);
    btn.disabled = false; btn.innerHTML = 'Create Account <span class="af-arrow">→</span>';
  }
}
function _authErr(msg) {
  var el = document.getElementById('auth-error');
  if (!el) return;
  el.style.display = msg ? '' : 'none';
  el.textContent = msg;
}

/* ── Boot app after successful auth ── */
function _bootApp() {
  if (!Auth.isLoggedIn()) { renderAuthScreen('login'); return; }
  document.body.classList.remove('auth-mode');
  var auth = document.getElementById('auth-screen');
  var app  = document.getElementById('app-screen');
  if (auth) auth.style.display = 'none';
  if (app)  { app.style.display = 'flex'; app.removeAttribute('aria-hidden'); }
  _renderNavUser();
  if (typeof initMainApp === 'function') initMainApp();
}

function _renderNavUser() {
  var r  = Auth.role();
  var el = document.getElementById('nav-user-info');
  if (!el) return;
  el.innerHTML =
    '<span class="role-badge '+r+'">'+r.toUpperCase()+'</span>' +
    '<span class="nav-username">'+_esc(Auth.displayName())+'</span>' +
    (Auth.canAdmin() ? '<button class="nav-admin-btn" onclick="openAdmin()">⚙ Admin</button>' : '') +
    '<button class="nav-logout-btn" onclick="doLogout()">Sign Out</button>';
}

async function doLogout() {
  await Auth.logout();
  document.body.classList.add('auth-mode');
  var app  = document.getElementById('app-screen');
  var auth = document.getElementById('auth-screen');
  if (app)  app.style.display = 'none';
  if (auth) auth.style.display = 'flex';
  renderAuthScreen('login');
}

function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }