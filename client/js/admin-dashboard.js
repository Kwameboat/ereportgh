(function () {
  const token = () => localStorage.getItem('admin_token');
  if (!token()) location.href = 'login.html';
  const esc = (v) =>
    String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  async function api(path, opts) {
    opts = opts || {};
    const headers = Object.assign({}, opts.headers || {}, { Authorization: 'Bearer ' + token() });
    if (opts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const res = await fetch(path, Object.assign({}, opts, { headers: headers }));
    if (res.status === 401) {
      localStorage.removeItem('admin_token');
      location.href = 'login.html';
      throw new Error('Unauthorized');
    }
    return res;
  }
  function setLastSync() {
    const el = document.getElementById('lastSync');
    if (!el) return;
    el.textContent = 'Last sync: ' + new Date().toLocaleTimeString();
  }
  let toastTimer = null;
  function toast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => t.classList.remove('show'), 1800);
  }

  document.getElementById('logout').onclick = function () {
    localStorage.removeItem('admin_token');
    location.href = 'login.html';
  };

  async function loadStats() {
    const res = await api('/api/admin/analytics');
    const d = await res.json();
    const el = document.getElementById('stats');
    el.innerHTML = [
      card('Students', d.students),
      card('PINs unused', d.pins.unused),
      card('PINs used', d.pins.used),
      card('Revenue (paid)', d.payments.revenue + ' (' + d.payments.successful + ' tx)'),
    ].join('');
  }
  function card(t, v) {
    return (
      '<div class="metric-card"><p class="metric-title">' +
      esc(t) +
      '</p><p class="metric-value">' +
      esc(v) +
      '</p></div>'
    );
  }

  var page = 1;
  var lastStudents = [];
  var studentsTotal = 0;
  var pageSize = 20;
  var selectedStudentRef = '';
  var allPins = [];
  var allPayments = [];
  var allSchools = [];
  var lastPinsFilterUsed = null;
  async function loadStudents() {
    const q = document.getElementById('search').value.trim();
    var u = '/api/admin/students?page=' + page + (q ? '&q=' + encodeURIComponent(q) : '');
    const res = await api(u);
    const d = await res.json();
    lastStudents = d.students || [];
    studentsTotal = d.total || 0;
    pageSize = d.pageSize || pageSize;
    const tb = document.getElementById('stuBody');
    tb.innerHTML = d.students
      .map(function (s) {
        return (
          '<tr>' +
          '<td>' +
          esc(s.id) +
          '</td>' +
          '<td class="mono">' +
          esc(s.student_id) +
          '</td>' +
          '<td class="mono">' +
          esc(s.school_ref || '-') +
          '</td>' +
          '<td>' +
          esc(s.name) +
          '</td>' +
          '<td>' +
          esc(s.class_name || '') +
          '</td>' +
          '<td>' +
          esc(s.term || '') +
          ' / ' +
          esc(s.year || '') +
          '</td>' +
          '<td><a href="' +
          esc(s.pdf_url || '#') +
          '" target="_blank">link</a></td>' +
          '<td><button type="button" data-id="' +
          esc(s.id) +
          '" class="view-btn link-btn">View</button></td>' +
          '</tr>'
        );
      })
      .join('');
    const from = d.students.length ? (page - 1) * pageSize + 1 : 0;
    const to = (page - 1) * pageSize + d.students.length;
    const pages = Math.max(1, Math.ceil((studentsTotal || 0) / pageSize));
    document.getElementById('studentsMeta').textContent =
      'Showing ' + from + '-' + to + ' of ' + studentsTotal + ' students';
    document.getElementById('pageInfo').textContent = 'Page ' + page + ' / ' + pages;
    document.getElementById('btnPrevPage').disabled = page <= 1;
    document.getElementById('btnNextPage').disabled = page >= pages;
  }

  document.getElementById('btnSearch').onclick = function () {
    page = 1;
    loadStudents();
  };
  document.getElementById('search').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      page = 1;
      loadStudents();
    }
  });
  document.getElementById('btnPrevPage').onclick = function () {
    if (page <= 1) return;
    page -= 1;
    loadStudents();
  };
  document.getElementById('btnNextPage').onclick = function () {
    const pages = Math.max(1, Math.ceil((studentsTotal || 0) / pageSize));
    if (page >= pages) return;
    page += 1;
    loadStudents();
  };
  document.getElementById('btnExportStudents').onclick = function () {
    if (!lastStudents.length) {
      toast('No students to export');
      return;
    }
    const rows = [
      ['id', 'student_ref', 'school_ref', 'name', 'class', 'term', 'year', 'pdf_url'],
    ].concat(
      lastStudents.map(function (s) {
        return [
          s.id,
          s.student_id || '',
          s.school_ref || '',
          s.name || '',
          s.class_name || '',
          s.term || '',
          s.year || '',
          s.pdf_url || '',
        ];
      })
    );
    const csv = rows
      .map(function (r) {
        return r
          .map(function (v) {
            return '"' + String(v).replace(/"/g, '""') + '"';
          })
          .join(',');
      })
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'students-page-' + page + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('Student CSV exported');
  };

  var selectedId = null;
  document.getElementById('stuBody').addEventListener('click', async function (e) {
    const b = e.target.closest('.view-btn');
    if (!b) return;
    selectedId = b.dataset.id;
    const res = await api('/api/admin/students/' + selectedId);
    const d = await res.json();
    document.getElementById('detail').classList.remove('hidden');
    document.getElementById('emptyDetail').classList.add('hidden');
    document.getElementById('detailPre').textContent = JSON.stringify(d, null, 2);
    document.getElementById('btnPdf').href = d.student.pdf_url || '#';
    selectedStudentRef = d.student.student_id || '';
  });

  document.getElementById('btnRegen').onclick = async function () {
    if (!selectedId) return;
    const res = await api('/api/admin/students/' + selectedId + '/regenerate-pdf', { method: 'POST' });
    const d = await res.json();
    alert('PDF: ' + d.pdfUrl);
    loadStudents();
  };
  document.getElementById('btnDel').onclick = async function () {
    if (!selectedId || !confirm('Delete this student and all results?')) return;
    await api('/api/admin/students/' + selectedId, { method: 'DELETE' });
    document.getElementById('detail').classList.add('hidden');
    document.getElementById('emptyDetail').classList.remove('hidden');
    loadStudents();
    loadStats();
  };
  document.getElementById('btnCopyStudent').onclick = async function () {
    if (!selectedStudentRef) return;
    try {
      await navigator.clipboard.writeText(selectedStudentRef);
      toast('Student reference copied');
    } catch {
      toast('Clipboard unavailable');
    }
  };

  async function loadPins(used) {
    lastPinsFilterUsed = used;
    var u = '/api/admin/pins';
    if (used === true) u += '?used=1';
    if (used === false) u += '?used=0';
    const res = await api(u);
    const d = await res.json();
    allPins = d.pins || [];
    renderPins();
  }
  function renderPins() {
    const filter = document.getElementById('pinsFilter').value.trim().toLowerCase();
    const visible = allPins.filter(function (p) {
      if (!filter) return true;
      return (
        String(p.pin_code || '').toLowerCase().includes(filter) ||
        String(p.student_id_bound || '').toLowerCase().includes(filter) ||
        String(p.used_by_student_id || '').toLowerCase().includes(filter)
      );
    });
    document.getElementById('pinsOut').textContent = visible
      .map(function (p) {
        return (
          p.pin_code +
          ' | ' +
          (p.is_used ? 'USED ' + (p.used_by_student_id || '') : 'free') +
          ' | bound:' +
          (p.student_id_bound || '-')
        );
      })
      .join('\n');
    return visible;
  }
  document.getElementById('pinsAll').onclick = function () {
    loadPins(null);
  };
  document.getElementById('pinsUnused').onclick = function () {
    loadPins(false);
  };
  document.getElementById('pinsUsed').onclick = function () {
    loadPins(true);
  };
  document.getElementById('pinsFilter').addEventListener('input', renderPins);
  document.getElementById('btnCopyPins').onclick = async function () {
    const visible = renderPins();
    if (!visible.length) {
      toast('No visible PINs to copy');
      return;
    }
    const text = visible
      .map(function (p) {
        return p.pin_code;
      })
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast('Visible PINs copied');
    } catch {
      toast('Clipboard unavailable');
    }
  };

  document.getElementById('btnPins').onclick = async function () {
    const count = parseInt(document.getElementById('pinCount').value, 10);
    const batchNote = document.getElementById('pinNote').value;
    const res = await api('/api/admin/pins/bulk', {
      method: 'POST',
      body: JSON.stringify({ count: count, batchNote: batchNote }),
    });
    const d = await res.json();
    const pr = document.getElementById('pinGenResult');
    pr.classList.remove('hidden');
    pr.textContent = d.pins.join('\n');
    loadPins(lastPinsFilterUsed);
    loadStats();
    toast('PIN batch generated: ' + d.pins.length);
  };

  async function loadPayments() {
    if (!allPayments.length) {
      const res = await api('/api/admin/payments');
      const d = await res.json();
      allPayments = d.payments || [];
    }
    const status = document.getElementById('payStatusFilter').value;
    const term = document.getElementById('paySearch').value.trim().toLowerCase();
    const filtered = allPayments.filter(function (p) {
      const okStatus = status === 'all' ? true : String(p.status || '').toLowerCase() === status;
      if (!okStatus) return false;
      if (!term) return true;
      return (
        String(p.reference || '').toLowerCase().includes(term) ||
        String(p.email || '').toLowerCase().includes(term)
      );
    });
    document.getElementById('payOut').innerHTML =
      '<table><thead><tr><th>Ref</th><th>Email</th><th>Amt</th><th>Status</th></tr></thead><tbody>' +
      filtered
        .map(function (p) {
          return (
            '<tr><td class="mono">' +
            esc(p.reference) +
            '</td><td>' +
            esc(p.email || '') +
            '</td><td>' +
            esc(p.amount) +
            ' ' +
            esc(p.currency) +
            '</td><td class="' +
            (p.status === 'success' ? 'ok' : '') +
            '">' +
            esc(p.status) +
            '</td></tr>'
          );
        })
        .join('') +
      '</tbody></table>';
  }
  document.getElementById('payStatusFilter').addEventListener('change', loadPayments);
  document.getElementById('paySearch').addEventListener('input', loadPayments);

  async function refreshAll(opts) {
    opts = opts || {};
    allPayments = [];
    await Promise.all([loadStats(), loadStudents(), loadPins(lastPinsFilterUsed), loadPayments(), loadSchools()]);
    setLastSync();
    if (!opts.silent) toast('Dashboard refreshed');
  }
  document.getElementById('btnRefreshAll').onclick = function () {
    refreshAll();
  };

  let autoTimer = null;
  let me = null;
  function isSuperadmin() {
    return me && me.role === 'superadmin';
  }
  function toggleSuperadminUI() {
    const superOnlyIds = [
      'newUserName',
      'newUserPass',
      'newUserRole',
      'btnCreateUser',
      'usersBody',
      'setMaxAdmins',
      'setPinBatch',
      'setAutoRefresh',
      'setPaymentAmountGhs',
      'btnSaveSettings',
    ];
    const disabled = !isSuperadmin();
    superOnlyIds.forEach(function (id) {
      const el = document.getElementById(id);
      if (!el) return;
      if ('disabled' in el) el.disabled = disabled;
    });
    if (disabled) {
      const usersBody = document.getElementById('usersBody');
      if (usersBody) usersBody.innerHTML = '<tr><td colspan="5">Superadmin required</td></tr>';
    }
  }
  function setAutoRefresh(seconds) {
    if (autoTimer) window.clearInterval(autoTimer);
    autoTimer = null;
    if (!seconds || seconds < 1) return;
    autoTimer = window.setInterval(function () {
      refreshAll({ silent: true });
    }, seconds * 1000);
  }
  const autoSelect = document.getElementById('autoRefreshEvery');
  autoSelect.addEventListener('change', function () {
    setAutoRefresh(parseInt(autoSelect.value, 10) || 0);
    toast(autoSelect.value === '0' ? 'Auto refresh off' : 'Auto refresh every ' + autoSelect.value + 's');
  });

  async function loadMe() {
    const res = await api('/api/admin/me');
    const d = await res.json();
    me = d.admin || null;
    toggleSuperadminUI();
    if (typeof window.execAdminSetUser === 'function') window.execAdminSetUser(me);
  }

  async function loadUsers() {
    if (!isSuperadmin()) return;
    const res = await api('/api/admin/users');
    const d = await res.json();
    const body = document.getElementById('usersBody');
    body.innerHTML = (d.users || [])
      .map(function (u) {
        return (
          '<tr>' +
          '<td>' + esc(u.id) + '</td>' +
          '<td>' + esc(u.username) + '</td>' +
          '<td>' +
          '<select class="user-role" data-id="' + esc(u.id) + '">' +
          '<option value="admin"' + (u.role === 'admin' ? ' selected' : '') + '>admin</option>' +
          '<option value="superadmin"' + (u.role === 'superadmin' ? ' selected' : '') + '>superadmin</option>' +
          '</select>' +
          '</td>' +
          '<td>' + (u.is_active ? 'Active' : 'Disabled') + '</td>' +
          '<td>' +
          '<button type="button" class="btn btn-sm user-toggle" data-id="' + esc(u.id) + '" data-active="' + (u.is_active ? '1' : '0') + '">' +
          (u.is_active ? 'Disable' : 'Enable') +
          '</button> ' +
          '<button type="button" class="btn btn-sm user-pass" data-id="' + esc(u.id) + '">Reset pass</button>' +
          '</td>' +
          '</tr>'
        );
      })
      .join('');
  }

  async function loadSettings() {
    if (!isSuperadmin()) return;
    const res = await api('/api/admin/settings');
    const d = await res.json();
    const s = d.settings || {};
    document.getElementById('setMaxAdmins').value = s.max_admin_users || '5';
    document.getElementById('setPinBatch').value = s.default_pin_batch_count || '10';
    document.getElementById('setAutoRefresh').value = s.dashboard_auto_refresh_sec || autoSelect.value || '60';
    if (s.dashboard_auto_refresh_sec != null) {
      autoSelect.value = String(s.dashboard_auto_refresh_sec);
      setAutoRefresh(parseInt(autoSelect.value, 10) || 0);
    }
    if (s.default_pin_batch_count != null) {
      document.getElementById('pinCount').value = String(s.default_pin_batch_count);
    }
    const paySub = parseInt(s.payment_amount_subunit, 10);
    const payEl = document.getElementById('setPaymentAmountGhs');
    if (payEl && Number.isFinite(paySub) && paySub >= 100) {
      payEl.value = (paySub / 100).toFixed(2);
    } else if (payEl) {
      payEl.value = '10.00';
    }
  }

  async function loadPaystackSettings() {
    const res = await api('/api/admin/settings/paystack');
    const d = await res.json();
    if (!res.ok) {
      toast(d.error || 'Failed to load Paystack settings');
      return;
    }
    const p = d.paystack || {};
    document.getElementById('paystackCallback').value = p.callbackUrl || '';
    document.getElementById('paystackSecret').value = '';
    document.getElementById('paystackState').textContent = p.hasSecretKey
      ? 'Paystack status: secret key configured (' + (p.secretKeyMasked || 'hidden') + ')'
      : 'Paystack status: secret key not configured';
  }

  document.getElementById('btnCreateUser').onclick = async function () {
    const username = document.getElementById('newUserName').value.trim();
    const password = document.getElementById('newUserPass').value;
    const role = document.getElementById('newUserRole').value;
    const res = await api('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({ username: username, password: password, role: role }),
    });
    const d = await res.json();
    if (!res.ok) {
      toast(d.error || 'Failed to create user');
      return;
    }
    document.getElementById('newUserName').value = '';
    document.getElementById('newUserPass').value = '';
    toast('User created');
    await Promise.all([loadUsers(), loadSettings()]);
  };

  document.getElementById('usersBody').addEventListener('click', async function (e) {
    const toggleBtn = e.target.closest('.user-toggle');
    if (toggleBtn) {
      const id = toggleBtn.dataset.id;
      const active = toggleBtn.dataset.active === '1';
      const res = await api('/api/admin/users/' + id, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !active }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast(d.error || 'Failed to update user');
        return;
      }
      toast('User updated');
      await loadUsers();
      return;
    }
    const passBtn = e.target.closest('.user-pass');
    if (passBtn) {
      const id = passBtn.dataset.id;
      const p = window.prompt('Enter new password (min 8 chars):');
      if (!p) return;
      const res = await api('/api/admin/users/' + id, {
        method: 'PATCH',
        body: JSON.stringify({ password: p }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast(d.error || 'Failed to reset password');
        return;
      }
      toast('Password reset');
    }
  });
  document.getElementById('usersBody').addEventListener('change', async function (e) {
    const roleSelect = e.target.closest('.user-role');
    if (!roleSelect) return;
    const id = roleSelect.dataset.id;
    const res = await api('/api/admin/users/' + id, {
      method: 'PATCH',
      body: JSON.stringify({ role: roleSelect.value }),
    });
    const d = await res.json();
    if (!res.ok) {
      toast(d.error || 'Failed to update role');
      return;
    }
    toast('Role updated');
    await loadUsers();
  });

  document.getElementById('btnSaveSettings').onclick = async function () {
    const body = {
      maxAdminUsers: parseInt(document.getElementById('setMaxAdmins').value, 10),
      defaultPinBatchCount: parseInt(document.getElementById('setPinBatch').value, 10),
      dashboardAutoRefreshSec: parseInt(document.getElementById('setAutoRefresh').value, 10),
      paymentAmountGhs: parseFloat(document.getElementById('setPaymentAmountGhs').value),
    };
    const res = await api('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    const d = await res.json();
    if (!res.ok) {
      toast(d.error || 'Failed to save settings');
      return;
    }
    autoSelect.value = String(body.dashboardAutoRefreshSec);
    setAutoRefresh(body.dashboardAutoRefreshSec);
    document.getElementById('pinCount').value = String(body.defaultPinBatchCount);
    toast('Settings saved');
  };

  document.getElementById('btnSavePaystack').onclick = async function () {
    const secretKey = document.getElementById('paystackSecret').value;
    const callbackUrl = document.getElementById('paystackCallback').value.trim();
    const res = await api('/api/admin/settings/paystack', {
      method: 'PUT',
      body: JSON.stringify({ secretKey: secretKey, callbackUrl: callbackUrl }),
    });
    const d = await res.json();
    if (!res.ok) {
      toast(d.error || 'Failed to save Paystack settings');
      return;
    }
    toast('Paystack settings saved');
    await loadPaystackSettings();
  };

  async function loadSchools() {
    const res = await api('/api/admin/schools');
    const d = await res.json();
    allSchools = d.schools || [];
    const body = document.getElementById('schoolsBody');
    body.innerHTML = allSchools
      .map(function (s) {
        return (
          '<tr>' +
          '<td><strong>' + esc(s.name) + '</strong><br><span class="muted-note">' + esc(s.contact_email || s.contact_phone || '') + '</span></td>' +
          '<td class="mono">' + esc(s.school_ref) + '</td>' +
          '<td>' + (s.is_active ? '<span class="ok">Active</span>' : 'Disabled') + '</td>' +
          '<td>' +
          '<button type="button" class="btn btn-sm school-copy-ref" data-ref="' + esc(s.school_ref) + '">Copy ref</button> ' +
          '<button type="button" class="btn btn-sm school-reg-key" data-id="' + esc(s.id) + '">New key</button> ' +
          '<button type="button" class="btn btn-sm school-toggle" data-id="' + esc(s.id) + '" data-active="' + (s.is_active ? '1' : '0') + '">' +
          (s.is_active ? 'Disable' : 'Enable') +
          '</button>' +
          '</td>' +
          '</tr>'
        );
      })
      .join('');
  }

  document.getElementById('btnAddSchool').onclick = async function () {
    const name = document.getElementById('schoolName').value.trim();
    const contactEmail = document.getElementById('schoolEmail').value.trim();
    const contactPhone = document.getElementById('schoolPhone').value.trim();
    const address = document.getElementById('schoolAddress').value.trim();
    const res = await api('/api/admin/schools', {
      method: 'POST',
      body: JSON.stringify({ name: name, contactEmail: contactEmail, contactPhone: contactPhone, address: address }),
    });
    const d = await res.json();
    if (!res.ok) {
      toast(d.error || 'Failed to create school');
      return;
    }
    document.getElementById('schoolName').value = '';
    document.getElementById('schoolEmail').value = '';
    document.getElementById('schoolPhone').value = '';
    document.getElementById('schoolAddress').value = '';
    const school = d.school || {};
    const msg = 'School created\nRef: ' + (school.schoolRef || '-') + '\nAPI key: ' + (school.apiKey || '-');
    window.alert(msg);
    toast('School created and reference generated');
    await loadSchools();
  };

  document.getElementById('schoolsBody').addEventListener('click', async function (e) {
    const copyBtn = e.target.closest('.school-copy-ref');
    if (copyBtn) {
      try {
        await navigator.clipboard.writeText(copyBtn.dataset.ref || '');
        toast('School reference copied');
      } catch {
        toast('Clipboard unavailable');
      }
      return;
    }
    const toggleBtn = e.target.closest('.school-toggle');
    if (toggleBtn) {
      const id = toggleBtn.dataset.id;
      const isActive = toggleBtn.dataset.active === '1';
      const res = await api('/api/admin/schools/' + id, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !isActive }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast(d.error || 'Failed to update school');
        return;
      }
      toast('School status updated');
      await loadSchools();
      return;
    }
    const keyBtn = e.target.closest('.school-reg-key');
    if (keyBtn) {
      const id = keyBtn.dataset.id;
      if (!window.confirm('Generate a new API key for this school? Old key will stop working.')) return;
      const res = await api('/api/admin/schools/' + id, {
        method: 'PATCH',
        body: JSON.stringify({ regenerateApiKey: true }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast(d.error || 'Failed to regenerate key');
        return;
      }
      window.alert('New API key:\n' + ((d.school && d.school.apiKey) || ''));
      toast('School API key regenerated');
    }
  });

  Promise.resolve()
    .then(loadMe)
    .then(function () {
      return Promise.all([refreshAll({ silent: true }), loadUsers(), loadSettings(), loadSchools(), loadPaystackSettings()]);
    })
    .catch(function () {
      // no-op
    });
  setAutoRefresh(parseInt(autoSelect.value, 10) || 0);
})();
