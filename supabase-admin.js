/* ============================================================================
 * supabase-admin.js
 *
 * In-app admin panel for editing the Supabase-backed noise source + Rw libraries.
 *
 * Auth: Supabase magic-link (OTP via email). On successful login, the access
 * token is stored in sessionStorage and used as the Authorization header for
 * subsequent PostgREST writes. The server-side RLS policy only accepts writes
 * from users whose JWT email appears in the `app_admins` table.
 *
 * Triggered by clicking the library status badge in the header.
 *
 * Requires:
 *   window.SUPABASE_CONFIG   (url + publishable key)
 *   window.ResonateLib.load  (re-fetch libraries after a successful edit)
 * ========================================================================== */
(function () {
  'use strict';

  var SESSION_KEY = 'resonate_admin_session';
  var panelEl = null;
  var authState = { token: null, email: null, expiresAt: 0 };

  /* ───── Session persistence ───── */
  function loadSession() {
    try {
      var raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return;
      var s = JSON.parse(raw);
      if (s && s.token && s.expiresAt && s.expiresAt > Date.now() / 1000) {
        authState = s;
      } else {
        sessionStorage.removeItem(SESSION_KEY);
      }
    } catch (e) { /* ignore */ }
  }
  function saveSession() {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(authState));
  }
  function clearSession() {
    authState = { token: null, email: null, expiresAt: 0 };
    sessionStorage.removeItem(SESSION_KEY);
  }

  /* ───── Capture magic-link redirect (token in URL hash) ───── */
  function consumeHashTokens() {
    if (!window.location.hash) return false;
    var h = window.location.hash.replace(/^#/, '');
    if (!/access_token=/.test(h)) return false;
    var params = {};
    h.split('&').forEach(function (kv) {
      var i = kv.indexOf('=');
      if (i > -1) params[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1));
    });
    if (!params.access_token) return false;
    var expiresIn = parseInt(params.expires_in, 10) || 3600;
    var payload = parseJwtPayload(params.access_token) || {};
    authState = {
      token:     params.access_token,
      email:     payload.email || null,
      expiresAt: Math.floor(Date.now() / 1000) + expiresIn
    };
    saveSession();
    // Clean the hash so refreshing doesn't re-consume it
    try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch (e) {}
    return true;
  }
  function parseJwtPayload(tok) {
    try {
      var parts = tok.split('.');
      if (parts.length < 2) return null;
      var b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      return JSON.parse(atob(b64));
    } catch (e) { return null; }
  }

  /* ───── Supabase REST helpers (authenticated) ───── */
  function cfg() { return window.SUPABASE_CONFIG; }
  function baseUrl() { return cfg().url.replace(/\/+$/, ''); }
  function apiHeaders(extra) {
    var h = {
      'apikey':        cfg().publishable,
      'Authorization': 'Bearer ' + (authState.token || cfg().publishable),
      'Content-Type':  'application/json',
      'Accept':        'application/json'
    };
    if (extra) for (var k in extra) h[k] = extra[k];
    return h;
  }

  function rest(method, path, body, preferReturn) {
    var url = baseUrl() + '/rest/v1' + path;
    var opts = { method: method, headers: apiHeaders() };
    if (preferReturn) opts.headers['Prefer'] = 'return=representation';
    if (body !== undefined) opts.body = JSON.stringify(body);
    return fetch(url, opts).then(function (r) {
      if (!r.ok) {
        return r.text().then(function (t) {
          throw new Error('HTTP ' + r.status + ' ' + method + ' ' + path + ' — ' + t.slice(0, 300));
        });
      }
      return r.status === 204 ? null : r.json();
    });
  }

  function sendMagicLink(email) {
    var url = baseUrl() + '/auth/v1/otp';
    return fetch(url, {
      method: 'POST',
      headers: {
        'apikey':       cfg().publishable,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: email,
        create_user: false,
        email_redirect_to: window.location.origin + window.location.pathname
      })
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error('HTTP ' + r.status + ' — ' + t.slice(0, 200)); });
      return r.json();
    });
  }

  /* ───── Library schema (drives the CRUD forms) ───── */
  var OCTAVE_BANDS = [63, 125, 250, 500, 1000, 2000, 4000, 8000];

  var LIB_SPECS = {
    'point': {
      label: 'Point sources (Lw)',
      table: 'reference_noise_sources',
      filter: 'source_kind=eq.point',
      listCols: ['name', 'display_group', 'height_m'],
      defaults: { source_kind: 'point', data_type: 'sound-power', per_unit: null, review_status: 'reviewed', import_source: 'resonate-admin-ui' },
      fields: [
        { key: 'name',          label: 'Name',          type: 'text',   required: true },
        { key: 'display_group', label: 'Dropdown group', type: 'text' },
        { key: 'height_m',      label: 'Height (m)',    type: 'number' },
        { key: 'level_descriptor', label: 'Lmax flag',  type: 'select', options: [
            { value: '',     label: '— (Leq)' },
            { value: 'Lmax', label: 'Lmax' }
        ]},
        { key: 'source_description', label: 'Source/citation', type: 'text' }
      ],
      octaveKeys: ['hz_63','hz_125','hz_250','hz_500','hz_1000','hz_2000','hz_4000','hz_8000']
    },
    'line': {
      label: 'Line sources (Lw/m)',
      table: 'reference_noise_sources',
      filter: 'source_kind=eq.line',
      listCols: ['name', 'display_group', 'height_m'],
      defaults: { source_kind: 'line', data_type: 'sound-power', per_unit: 'per m', review_status: 'reviewed', import_source: 'resonate-admin-ui' },
      fields: [
        { key: 'name',          label: 'Name',          type: 'text',   required: true },
        { key: 'display_group', label: 'Dropdown group', type: 'text' },
        { key: 'height_m',      label: 'Height (m)',    type: 'number' },
        { key: 'source_description', label: 'Source/citation', type: 'text' }
      ],
      octaveKeys: ['hz_63','hz_125','hz_250','hz_500','hz_1000','hz_2000','hz_4000','hz_8000']
    },
    'area': {
      label: 'Area sources (Lw/m²)',
      table: 'reference_noise_sources',
      filter: 'source_kind=eq.area',
      listCols: ['name', 'display_group', 'height_m'],
      defaults: { source_kind: 'area', data_type: 'sound-power', per_unit: 'per m²', review_status: 'reviewed', import_source: 'resonate-admin-ui' },
      fields: [
        { key: 'name',          label: 'Name',          type: 'text',   required: true },
        { key: 'display_group', label: 'Dropdown group', type: 'text' },
        { key: 'height_m',      label: 'Height (m)',    type: 'number' },
        { key: 'source_description', label: 'Source/citation', type: 'text' }
      ],
      octaveKeys: ['hz_63','hz_125','hz_250','hz_500','hz_1000','hz_2000','hz_4000','hz_8000']
    },
    'building': {
      label: 'Building Lp',
      table: 'reference_noise_sources',
      filter: 'source_kind=eq.building',
      listCols: ['name', 'display_group'],
      defaults: { source_kind: 'building', data_type: 'sound-pressure', per_unit: null, review_status: 'reviewed', import_source: 'resonate-admin-ui' },
      fields: [
        { key: 'name',          label: 'Name',           type: 'text', required: true },
        { key: 'display_group', label: 'Dropdown group', type: 'text' },
        { key: 'source_description', label: 'Source/citation', type: 'text' }
      ],
      octaveKeys: ['hz_63','hz_125','hz_250','hz_500','hz_1000','hz_2000','hz_4000','hz_8000']
    },
    'construction': {
      label: 'Constructions (Rw)',
      table: 'reference_constructions',
      filter: null,
      listCols: ['kind', 'name', 'rw'],
      defaults: {},
      fields: [
        { key: 'name',          label: 'Name',          type: 'text',   required: true },
        { key: 'kind',          label: 'Kind',          type: 'select', required: true, options: [
            { value: 'walls',    label: 'Walls' },
            { value: 'roof',     label: 'Roof'  },
            { value: 'openings', label: 'Openings' }
        ]},
        { key: 'rw',            label: 'Rw (dB)',       type: 'number', required: true },
        { key: 'notes',         label: 'Notes',         type: 'text' }
      ],
      octaveKeys: ['63','125','250','500','1000','2000','4000','8000'],
      octaveParent: 'octave_r'   // nested under jsonb column 'octave_r'
    }
  };

  /* ───── DOM helpers ───── */
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'style') e.setAttribute('style', attrs[k]);
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k.indexOf('on') === 0) e[k] = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    if (children) children.forEach(function (c) {
      if (c == null) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  /* ───── UI: main modal ───── */
  function openPanel() {
    if (panelEl) { panelEl.style.display = 'flex'; renderPanel(); return; }
    panelEl = el('div', {
      id: 'resonateAdminPanel',
      style: 'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;'
    });
    panelEl.addEventListener('click', function (e) { if (e.target === panelEl) closePanel(); });
    document.body.appendChild(panelEl);
    renderPanel();
  }
  function closePanel() {
    if (panelEl) panelEl.style.display = 'none';
  }

  function renderPanel() {
    clear(panelEl);
    var card = el('div', {
      style: 'background:#fff;border-radius:12px;width:min(960px, 94vw);max-height:90vh;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.3);display:flex;flex-direction:column;'
    });
    // Header
    var hdr = el('div', {
      style: 'display:flex;align-items:center;justify-content:space-between;padding:12px 18px;border-bottom:1px solid #e5e7eb;background:#f9fafb;'
    }, [
      el('div', { style: 'font-size:14px;font-weight:700;color:#111827;' }, ['Library admin']),
      el('div', { style: 'display:flex;gap:8px;align-items:center;' }, [
        authState.token
          ? el('span', { style: 'font-size:11px;color:#166534;background:#dcfce7;padding:2px 8px;border-radius:999px;' }, ['Signed in as ' + (authState.email || '?')])
          : null,
        authState.token
          ? el('button', { style: buttonStyle('secondary'), onclick: onLogout }, ['Sign out'])
          : null,
        el('button', { style: buttonStyle('secondary'), onclick: closePanel }, ['Close'])
      ])
    ]);
    card.appendChild(hdr);

    // Body
    var body = el('div', { style: 'flex:1;overflow:auto;padding:16px 20px;' });
    if (!authState.token) {
      body.appendChild(renderLogin());
    } else {
      body.appendChild(renderBrowser());
    }
    card.appendChild(body);
    panelEl.appendChild(card);
  }

  function buttonStyle(variant) {
    var base = 'font-size:12px;padding:6px 12px;border-radius:6px;cursor:pointer;border:1px solid #d1d5db;';
    if (variant === 'primary') return base + 'background:#2563eb;color:#fff;border-color:#2563eb;';
    if (variant === 'danger')  return base + 'background:#dc2626;color:#fff;border-color:#dc2626;';
    return base + 'background:#fff;color:#374151;';
  }
  function inputStyle() { return 'width:100%;padding:6px 8px;font-size:12px;border:1px solid #d1d5db;border-radius:4px;box-sizing:border-box;'; }

  /* ───── Login view ───── */
  function renderLogin() {
    var box = el('div', { style: 'max-width:420px;margin:20px auto;text-align:center;' });
    box.appendChild(el('div', { style: 'font-size:14px;font-weight:600;margin-bottom:6px;color:#111827;' }, ['Sign in to edit the library']));
    box.appendChild(el('div', { style: 'font-size:12px;color:#6b7280;margin-bottom:16px;line-height:1.5;' }, [
      'Supabase will email you a one-time sign-in link. Your email must be listed in the app_admins table for writes to succeed.'
    ]));
    var emailInput = el('input', { type: 'email', placeholder: 'you@example.com', style: inputStyle() + 'margin-bottom:10px;' });
    var msg = el('div', { style: 'font-size:11px;margin-top:10px;min-height:16px;' });
    var btn = el('button', {
      style: buttonStyle('primary') + 'width:100%;padding:8px 12px;',
      onclick: function () {
        var email = (emailInput.value || '').trim();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          msg.textContent = 'Enter a valid email address.';
          msg.style.color = '#b91c1c';
          return;
        }
        btn.disabled = true;
        msg.textContent = 'Sending…';
        msg.style.color = '#6b7280';
        sendMagicLink(email).then(function () {
          msg.innerHTML = '✓ Magic link sent to <b>' + email + '</b>.<br>Click it in your email — you\'ll come back signed in.';
          msg.style.color = '#166534';
        }).catch(function (err) {
          msg.textContent = 'Failed: ' + err.message;
          msg.style.color = '#b91c1c';
          btn.disabled = false;
        });
      }
    }, ['Send magic link']);
    box.appendChild(emailInput);
    box.appendChild(btn);
    box.appendChild(msg);
    return box;
  }

  function onLogout() {
    clearSession();
    renderPanel();
  }

  /* ───── Browser view (tabs + list + form) ───── */
  var currentKind = 'point';
  function renderBrowser() {
    var wrap = el('div');
    var tabs = el('div', { style: 'display:flex;gap:4px;margin-bottom:14px;border-bottom:1px solid #e5e7eb;' });
    Object.keys(LIB_SPECS).forEach(function (kind) {
      var active = (kind === currentKind);
      var tab = el('button', {
        style: 'padding:8px 12px;font-size:12px;border:none;background:none;cursor:pointer;border-bottom:2px solid ' +
               (active ? '#2563eb' : 'transparent') + ';color:' + (active ? '#2563eb' : '#6b7280') + ';font-weight:' + (active ? '600' : '500') + ';',
        onclick: function () { currentKind = kind; renderPanel(); }
      }, [LIB_SPECS[kind].label]);
      tabs.appendChild(tab);
    });
    wrap.appendChild(tabs);

    var content = el('div', { id: 'adminContent' });
    wrap.appendChild(content);

    loadList().then(function (rows) {
      renderList(content, rows);
    }).catch(function (err) {
      content.appendChild(el('div', { style: 'color:#b91c1c;font-size:12px;padding:20px;' }, ['Failed to load: ' + err.message]));
    });

    return wrap;
  }

  function loadList() {
    var spec = LIB_SPECS[currentKind];
    var q = '?select=*' + (spec.filter ? '&' + spec.filter : '') + '&order=name.asc';
    return rest('GET', '/' + spec.table + q);
  }

  function renderList(container, rows) {
    clear(container);
    var spec = LIB_SPECS[currentKind];
    var header = el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;' }, [
      el('div', { style: 'font-size:11px;color:#6b7280;' }, [rows.length + ' records']),
      el('button', { style: buttonStyle('primary'), onclick: function () { renderForm(container, null); } }, ['+ New'])
    ]);
    container.appendChild(header);

    var tableWrap = el('div', { style: 'border:1px solid #e5e7eb;border-radius:6px;max-height:60vh;overflow:auto;' });
    var table = el('table', { style: 'width:100%;border-collapse:collapse;font-size:12px;' });
    var thead = el('thead', { style: 'background:#f9fafb;position:sticky;top:0;' });
    var trh = el('tr');
    spec.listCols.forEach(function (c) {
      trh.appendChild(el('th', { style: 'text-align:left;padding:8px 10px;border-bottom:1px solid #e5e7eb;font-weight:600;color:#374151;' }, [c]));
    });
    trh.appendChild(el('th', { style: 'padding:8px 10px;border-bottom:1px solid #e5e7eb;' }, ['']));
    thead.appendChild(trh);
    table.appendChild(thead);

    var tbody = el('tbody');
    rows.forEach(function (row) {
      var tr = el('tr', { style: 'border-bottom:1px solid #f3f4f6;' });
      spec.listCols.forEach(function (c) {
        tr.appendChild(el('td', { style: 'padding:6px 10px;' }, [String(row[c] == null ? '' : row[c])]));
      });
      var actions = el('td', { style: 'padding:4px 10px;text-align:right;white-space:nowrap;' });
      actions.appendChild(el('button', {
        style: buttonStyle('secondary') + 'padding:3px 8px;margin-right:4px;',
        onclick: function () { renderForm(container, row); }
      }, ['Edit']));
      actions.appendChild(el('button', {
        style: buttonStyle('danger') + 'padding:3px 8px;',
        onclick: function () { confirmDelete(row, container); }
      }, ['Delete']));
      tr.appendChild(actions);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    container.appendChild(tableWrap);
  }

  function confirmDelete(row, container) {
    if (!confirm('Delete "' + row.name + '"? This cannot be undone.')) return;
    var spec = LIB_SPECS[currentKind];
    rest('DELETE', '/' + spec.table + '?id=eq.' + encodeURIComponent(row.id)).then(function () {
      refreshLibrariesFromSupabase();
      loadList().then(function (rows) { renderList(container, rows); });
    }).catch(function (err) { alert('Delete failed: ' + err.message); });
  }

  function renderForm(container, editing) {
    clear(container);
    var spec = LIB_SPECS[currentKind];
    var isEdit = !!editing;
    var title = isEdit ? 'Edit record' : 'New ' + spec.label;
    container.appendChild(el('div', { style: 'font-size:13px;font-weight:600;margin-bottom:10px;color:#111827;' }, [title]));

    var form = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px;' });
    var inputs = {};

    spec.fields.forEach(function (f) {
      var row = el('div', { style: f.key === 'name' ? 'grid-column:1 / -1;' : '' });
      row.appendChild(el('label', { style: 'display:block;font-size:11px;color:#6b7280;margin-bottom:3px;' }, [f.label + (f.required ? ' *' : '')]));
      var input;
      if (f.type === 'select') {
        input = el('select', { style: inputStyle() });
        (f.options || []).forEach(function (o) {
          input.appendChild(el('option', { value: o.value }, [o.label]));
        });
        input.value = (editing && editing[f.key] != null) ? editing[f.key] : '';
      } else {
        input = el('input', { type: f.type === 'number' ? 'number' : 'text', style: inputStyle() });
        if (f.type === 'number') input.setAttribute('step', 'any');
        if (editing && editing[f.key] != null) input.value = editing[f.key];
      }
      inputs[f.key] = input;
      row.appendChild(input);
      form.appendChild(row);
    });

    // Octave-band grid
    var bandHeader = el('div', { style: 'grid-column:1 / -1;font-size:11px;color:#6b7280;margin-top:8px;' }, [
      currentKind === 'construction' ? 'Octave-band Rw (dB)' : 'Octave-band spectrum (dB, unweighted)'
    ]);
    form.appendChild(bandHeader);
    var bandGrid = el('div', { style: 'grid-column:1 / -1;display:grid;grid-template-columns:repeat(8,1fr);gap:4px;' });
    var bandInputs = {};
    spec.octaveKeys.forEach(function (k, i) {
      var cell = el('div');
      cell.appendChild(el('div', { style: 'font-size:10px;color:#6b7280;text-align:center;margin-bottom:2px;' }, [OCTAVE_BANDS[i] + ' Hz']));
      var inp = el('input', { type: 'number', step: 'any', style: inputStyle() + 'text-align:center;' });
      // Preload from editing row
      if (editing) {
        var existing;
        if (spec.octaveParent) {
          var parent = editing[spec.octaveParent];
          if (typeof parent === 'string') { try { parent = JSON.parse(parent); } catch (e) {} }
          existing = parent && parent[k];
        } else {
          existing = editing[k];
        }
        if (existing != null) inp.value = existing;
      }
      bandInputs[k] = inp;
      cell.appendChild(inp);
      bandGrid.appendChild(cell);
    });
    form.appendChild(bandGrid);

    container.appendChild(form);

    var errBox = el('div', { style: 'color:#b91c1c;font-size:11px;margin-top:8px;min-height:14px;' });
    container.appendChild(errBox);

    var actions = el('div', { style: 'display:flex;justify-content:flex-end;gap:8px;margin-top:16px;' });
    actions.appendChild(el('button', {
      style: buttonStyle('secondary'),
      onclick: function () {
        loadList().then(function (rows) { renderList(container, rows); });
      }
    }, ['Cancel']));
    actions.appendChild(el('button', {
      style: buttonStyle('primary'),
      onclick: function () {
        var payload = {};
        // Defaults
        for (var dk in spec.defaults) payload[dk] = spec.defaults[dk];
        var missing = false;
        spec.fields.forEach(function (f) {
          var v = inputs[f.key].value;
          if (f.required && (v === '' || v == null)) { missing = true; return; }
          if (v === '') v = null;
          if (f.type === 'number' && v !== null) v = Number(v);
          payload[f.key] = v;
        });
        if (missing) { errBox.textContent = 'Fill all required (*) fields.'; return; }

        // Octave data
        if (spec.octaveParent) {
          var obj = {};
          spec.octaveKeys.forEach(function (k) {
            var raw = bandInputs[k].value;
            if (raw !== '') obj[k] = Number(raw);
          });
          payload[spec.octaveParent] = obj;
        } else {
          spec.octaveKeys.forEach(function (k) {
            var raw = bandInputs[k].value;
            payload[k] = raw === '' ? null : Number(raw);
          });
        }

        errBox.textContent = '';
        var promise;
        if (isEdit) {
          promise = rest('PATCH', '/' + spec.table + '?id=eq.' + encodeURIComponent(editing.id), payload, true);
        } else {
          promise = rest('POST',  '/' + spec.table, payload, true);
        }
        promise.then(function () {
          refreshLibrariesFromSupabase();
          loadList().then(function (rows) { renderList(container, rows); });
        }).catch(function (err) {
          errBox.textContent = 'Save failed: ' + err.message;
        });
      }
    }, [isEdit ? 'Save changes' : 'Create']));
    container.appendChild(actions);
  }

  /* ───── Re-run the loader after a write so the app-side caches refresh ───── */
  function refreshLibrariesFromSupabase() {
    if (window.ResonateLib && typeof window.ResonateLib.load === 'function') {
      window.ResonateLib.load().then(function () {
        if (typeof window.rebuildAllLibraries === 'function') window.rebuildAllLibraries();
      });
    }
  }

  /* ───── Wire up the badge click ───── */
  function wire() {
    loadSession();
    consumeHashTokens();
    var badge = document.getElementById('resonateLibBadge');
    if (badge) {
      badge.addEventListener('click', openPanel);
      badge.title = authState.token ? ('Library admin — signed in as ' + authState.email) : 'Click to open library admin';
    }
    // If we just consumed a magic-link token, auto-open the panel
    if (authState.token && window.location.pathname.indexOf('admin') === -1) {
      // Only auto-open if we captured a fresh token this pageload
      var captured = sessionStorage.getItem('resonate_admin_opened_after_login');
      if (!captured) {
        sessionStorage.setItem('resonate_admin_opened_after_login', '1');
        setTimeout(openPanel, 250);
      }
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire, { once: true });
  } else {
    wire();
  }
})();
