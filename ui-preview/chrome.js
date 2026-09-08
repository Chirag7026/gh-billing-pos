/* Golden Heera POS — static UI preview chrome.
   Injects the frameless titlebar + sidebar (mirrors TitleBar.tsx + Layout.tsx),
   highlights the active page, wires F1..F8 quick-launch and a demo exit dialog. */
(function () {
  var LINKS = [
    { to: 'dashboard.html', key: 'dashboard', label: 'Dashboard' },
    { to: 'sales-add.html', key: 'sales-add', label: 'Sales Add', kbd: 'F1' },
    { to: 'sales-display.html', key: 'sales-display', label: 'Sales Display', kbd: 'F2' },
    { to: 'product-add.html', key: 'product-add', label: 'Product Add', kbd: 'F3' },
    { to: 'product-display.html', key: 'product-display', label: 'Product Display', kbd: 'F4' },
    { to: 'purchase-add.html', key: 'purchase-add', label: 'Purchase Add', kbd: 'F5' },
    { to: 'purchase-display.html', key: 'purchase-display', label: 'Purchase Display', kbd: 'F6' },
    { to: 'supplier-add.html', key: 'supplier-add', label: 'Supplier Add', kbd: 'F7' },
    { to: 'supplier-display.html', key: 'supplier-display', label: 'Supplier Display', kbd: 'F8' },
    { to: 'stock-master.html', key: 'stock-master', label: 'Stock Master' },
    { to: 'stock-adjustment.html', key: 'stock-adjustment', label: 'Stock Adjustment' },
    { to: 'low-stock.html', key: 'low-stock', label: 'Low Stock' },
    { to: 'barcode-print.html', key: 'barcode-print', label: 'Barcode Print' },
    { to: 'sales-ledger.html', key: 'sales-ledger', label: 'Sales Ledger' },
    { to: 'purchase-ledger.html', key: 'purchase-ledger', label: 'Purchase Ledger' },
    { to: 'supplier-ledger.html', key: 'supplier-ledger', label: 'Supplier Ledger' },
    { to: 'settings.html', key: 'settings', label: 'Settings' }
  ];
  var FKEYS = { F1: 'sales-add.html', F2: 'sales-display.html', F3: 'product-add.html', F4: 'product-display.html', F5: 'purchase-add.html', F6: 'purchase-display.html', F7: 'supplier-add.html', F8: 'supplier-display.html' };

  function toast(msg) {
    var t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.hidden = true; }, 2600);
  }
  window.toast = toast;

  document.addEventListener('DOMContentLoaded', function () {
    var page = document.body.getAttribute('data-page');
    if (!page || page === 'bare') return; // login + gallery render their own shell

    // ---- titlebar ----
    var tb = document.createElement('div');
    tb.className = 'titlebar no-print';
    tb.innerHTML =
      '<span class="t-logo">G H <span>· GH Billing POS</span></span>' +
      '<span class="t-dot" title="Synced · 10s"></span>' +
      '<div class="t-right">' +
        '<span class="t-user" title="ADMIN">ADMIN · ADMIN</span>' +
        '<button class="t-btn" onclick="location.href=\'login.html\'" title="Switch User">Switch User</button>' +
        '<button class="t-btn" onclick="location.href=\'login.html\'" title="Logout">Logout</button>' +
        '<button class="t-win" title="Minimize" onclick="toast(\'Minimize (desktop only)\')">_</button>' +
        '<button class="t-win" title="Maximize" onclick="toast(\'Maximize (desktop only)\')">□</button>' +
        '<button class="t-win exit" title="Exit" id="t-exit">✕</button>' +
      '</div>';
    document.body.prepend(tb);
    document.getElementById('t-exit').addEventListener('click', showExitDialog);

    // ---- sidebar layout ----
    var main = document.querySelector('main.page');
    var layout = document.createElement('div');
    layout.className = 'layout';
    var aside = document.createElement('aside');
    aside.className = 'sidebar no-print';
    var nav = LINKS.map(function (l) {
      return '<a class="navlink' + (l.key === page ? ' active' : '') + '" href="' + l.to + '"><span>' +
        l.label + '</span>' + (l.kbd ? '<span class="kbd">' + l.kbd + '</span>' : '') + '</a>';
    }).join('');
    aside.innerHTML =
      '<div class="brand"><div class="b1">G H</div><div class="b2">Golden Heera POS</div></div>' +
      '<div><span class="sync-badge" title="Last sync OK"><span class="dot"></span>Synced · 10s</span></div>' +
      '<nav class="nav">' + nav + '</nav>' +
      '<div class="side-foot">Scanner: wedge-ready · 80mm ESC/POS</div>';
    if (main) {
      main.parentNode.insertBefore(layout, main);
      layout.appendChild(aside);
      layout.appendChild(main);
    }

    // ---- F1..F8 quick launch (mirrors Layout shortcuts) ----
    document.addEventListener('keydown', function (e) {
      var dest = FKEYS[e.key];
      if (!dest) return;
      var tag = (document.activeElement && document.activeElement.tagName) || '';
      if (/INPUT|SELECT|TEXTAREA|BUTTON/.test(tag)) return;
      e.preventDefault();
      location.href = dest;
    });
  });

  function showExitDialog() {
    if (document.getElementById('exit-modal')) return;
    var ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.id = 'exit-modal';
    ov.innerHTML =
      '<div class="card w-full max-w-md">' +
        '<h2 class="font-bold text-lg">Backup database before closing?</h2>' +
        '<p class="text-sm text-slate-400 mt-1">Sync flushes first either way; MongoDB stops cleanly after.</p>' +
        '<div class="flex gap-2 mt-4 flex-wrap">' +
          '<button class="btn btn-primary" id="ex-b">Quick Backup &amp; Exit</button>' +
          '<button class="btn btn-ghost" id="ex-n">Exit Without Backup</button>' +
          '<button class="btn btn-ghost" id="ex-c">Cancel</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    document.getElementById('ex-c').addEventListener('click', function () { ov.remove(); });
    document.getElementById('ex-n').addEventListener('click', function () { ov.remove(); toast('Exit Without Backup (demo — window stays open)'); });
    document.getElementById('ex-b').addEventListener('click', function () { ov.remove(); toast('Quick Backup & Exit (demo — window stays open)'); });
  }
})();
