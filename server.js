// SIPAM - Server LAN untuk PT Inti Prima Karya
// Jalankan dengan: npm install && npm start
// Lalu buka http://localhost:3000 di PC ini, atau http://<ip-pc-ini>:3000 dari PC lain di jaringan yang sama.

const path = require('path');
const fs = require('fs');
const os = require('os');
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const XLSX = require('xlsx');
const { hashPassword, verifyPassword } = require('./auth');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const ITEMS_FILE = path.join(DATA_DIR, 'items.json');
const TX_FILE = path.join(DATA_DIR, 'transactions.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, 'utf8').trim();
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.error('Gagal membaca ' + file + ':', err.message);
    return fallback;
  }
}
function saveJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

let items = loadJson(ITEMS_FILE, []);
let transactions = loadJson(TX_FILE, []);

function persistItems() { saveJson(ITEMS_FILE, items); }
function persistTransactions() { saveJson(TX_FILE, transactions); }

const ITEM_STATUSES = ['tersedia', 'dipinjam', 'discontinued'];

function syncStatusFromAvailability(item) {
  if (item.status !== 'discontinued') {
    item.status = item.available > 0 ? 'tersedia' : 'dipinjam';
  }
  return item;
}

function migrateItemStatuses() {
  let changed = false;
  items.forEach(item => {
    if (!ITEM_STATUSES.includes(item.status)) {
      syncStatusFromAvailability(item);
      changed = true;
    }
  });
  if (changed) persistItems();
}
migrateItemStatuses();

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function nowTime() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0');
}
function fmtDateID(dateStr) {
  if (!dateStr) return '-';
  const [y, m, d] = dateStr.split('-');
  return d + '/' + m + '/' + y;
}

function dateCodeBase(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return String(y) + String(m) + String(d);
}
function nextCode(dateStr) {
  const base = dateCodeBase(dateStr);
  const clashes = transactions.filter(t => t.code === base || t.code.startsWith(base + '-'));
  if (clashes.length === 0) return base;
  return base + '-' + (clashes.length + 1);
}
let idCounter = 0;
function genId(prefix) {
  idCounter++;
  return prefix + '-' + Date.now() + '-' + idCounter + '-' + Math.floor(Math.random() * 100000);
}

function parseWorkbookToItems(workbook) {
  const result = [];
  workbook.SheetNames.forEach(sheetName => {
    const ws = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const headerIdx = rows.findIndex(r => r.some(c => String(c).trim().toLowerCase() === 'nama produk'));
    if (headerIdx === -1) return;
    const header = rows[headerIdx].map(h => String(h).trim().toLowerCase());
    const idx = {
      no: header.indexOf('no'),
      customer: header.indexOf('customer'),
      produk: header.indexOf('nama produk'),
      tempat: header.indexOf('tempat'),
      mata: header.indexOf('mata'),
      papan: header.indexOf('papan'),
      rak: header.indexOf('rak'),
      manualNo: header.findIndex(h => h.includes('urut baru'))
    };
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.every(c => c === '' || c === undefined || c === null)) continue;
      const produk = idx.produk > -1 ? String(r[idx.produk] || '').trim() : '';
      if (!produk) continue;
      const rakValue = idx.rak > -1 ? String(r[idx.rak] || '').trim() : '';
      result.push({
        id: genId('imp'),
        name: produk,
        location: rakValue,
        tempat: idx.tempat > -1 ? String(r[idx.tempat]) : '',
        mata: idx.mata > -1 ? String(r[idx.mata]) : '',
        papan: idx.papan > -1 ? String(r[idx.papan]) : '',
        rak: rakValue,
        manualNo: idx.manualNo > -1 ? String(r[idx.manualNo] || '').trim() : '',
        customer: idx.customer > -1 ? String(r[idx.customer] || '').trim() : '',
        stock: 1,
        available: 1,
        status: 'tersedia',
        unit: 'unit'
      });
    }
  });
  return result;
}

function resolveCustomerCasing(rawName) {
  const name = (rawName || '').toString().trim();
  if (!name) return '';
  const key = name.toLowerCase();
  const fromItem = items.find(i => (i.customer || '').toLowerCase() === key);
  if (fromItem) return fromItem.customer;
  const fromTx = transactions.find(t => (t.customer || '').toLowerCase() === key);
  if (fromTx) return fromTx.customer;
  return name;
}

const app = express();
app.use(express.json());

const crypto = require('crypto');
app.use(session({
  secret: crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 12 * 60 * 60 * 1000 }
}));

app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

app.post('/api/login', (req, res) => {
  const username = ((req.body && req.body.username) || '').trim();
  const password = (req.body && req.body.password) || '';
  const users = loadJson(USERS_FILE, []);
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Username atau password salah.' });
  }
  req.session.username = user.username;
  res.json({ username: user.username });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  if (req.session && req.session.username) {
    return res.json({ username: req.session.username });
  }
  return res.status(401).json({ error: 'Belum login.' });
});

function requireAuth(req, res, next) {
  if (req.session && req.session.username) return next();
  return res.status(401).json({ error: 'Sesi berakhir, silakan login lagi.' });
}
app.use('/api', requireAuth);

app.post('/api/items', (req, res) => {
  const b = req.body || {};
  const name = (b.name || '').trim();
  const rak = (b.rak || '').toString().trim();
  if (!name) return res.status(400).json({ error: 'Nama pisau wajib diisi.' });
  if (!rak) return res.status(400).json({ error: 'Rak wajib diisi.' });

  const location = rak;
  const newItem = {
    id: genId('manual'),
    name,
    location,
    tempat: (b.tempat || '').toString().trim(),
    mata: (b.mata || '').toString().trim(),
    papan: (b.papan || '').toString().trim(),
    rak,
    manualNo: (b.manualNo || '').toString().trim(),
    customer: resolveCustomerCasing(b.customer),
    stock: 1,
    available: 1,
    status: 'tersedia',
    unit: 'unit'
  };
  items.push(newItem);
  persistItems();
  res.status(201).json(newItem);
});

app.get('/api/items', (req, res) => {
  const includeDiscontinued = req.query.includeDiscontinued === 'true';
  const result = includeDiscontinued
    ? items
    : items.filter(i => i.status !== 'discontinued');
  res.json(result);
});

app.post('/api/items/:id/discontinue', (req, res) => {
  const item = items.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Pisau tidak ditemukan.' });
  if (item.status === 'dipinjam') {
    return res.status(400).json({ error: 'Pisau ini sedang dipinjam — tidak bisa di-discontinue sebelum dikembalikan.' });
  }
  if (item.status === 'discontinued') {
    return res.status(400).json({ error: 'Pisau ini sudah berstatus discontinued.' });
  }
  item.status = 'discontinued';
  persistItems();
  res.json(item);
});

app.post('/api/items/:id/reactivate', (req, res) => {
  const item = items.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Pisau tidak ditemukan.' });
  if (item.status !== 'discontinued') {
    return res.status(400).json({ error: 'Pisau ini sedang tidak berstatus discontinued.' });
  }
  // Pastikan status dikembalikan sesuai stok secara mutlak
  item.status = item.available > 0 ? 'tersedia' : 'dipinjam';
  persistItems();
  res.json(item);
});

app.patch('/api/items/:id', (req, res) => {
  const item = items.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Pisau tidak ditemukan.' });
  
  const b = req.body || {};
  if (b.name !== undefined) item.name = String(b.name).trim();
  if (b.rak !== undefined) {
    item.rak = String(b.rak).trim();
    item.location = item.rak;
  }
  if (b.tempat !== undefined) item.tempat = String(b.tempat).trim();
  if (b.mata !== undefined) item.mata = String(b.mata).trim();
  if (b.papan !== undefined) item.papan = String(b.papan).trim();
  if (b.manualNo !== undefined) item.manualNo = String(b.manualNo).trim();
  if (b.customer !== undefined) item.customer = resolveCustomerCasing(b.customer);
  
  if (!item.name || !item.rak) {
    return res.status(400).json({ error: 'Nama dan Rak wajib diisi.' });
  }
  
  persistItems();
  res.json(item);
});

app.delete('/api/items/:id', (req, res) => {
  const before = items.length;
  items = items.filter(i => i.id !== req.params.id);
  if (items.length === before) return res.status(404).json({ error: 'Pisau tidak ditemukan.' });
  persistItems();
  res.json({ ok: true });
});

app.post('/api/items/bulk-delete', (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
  if (ids.length === 0) return res.status(400).json({ error: 'Tidak ada pisau yang dipilih.' });
  const idSet = new Set(ids);
  const before = items.length;
  items = items.filter(i => !idSet.has(i.id));
  const deleted = before - items.length;
  persistItems();
  res.json({ deleted });
});

app.post('/api/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File tidak ditemukan.' });
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const parsed = parseWorkbookToItems(wb);
    if (parsed.length === 0) {
      return res.status(400).json({ error: 'Tidak ada baris yang bisa dibaca. Pastikan ada kolom "Nama Produk".' });
    }
    parsed.forEach(inc => {
      inc.customer = resolveCustomerCasing(inc.customer);
      items.push(inc);
    });
    persistItems();
    res.json({ ok: true, count: parsed.length, added: parsed.length, sheets: wb.SheetNames.length });
  } catch (err) {
    res.status(400).json({ error: 'Gagal membaca file: ' + err.message });
  }
});

app.get('/api/transactions', (req, res) => {
  res.json(transactions);
});

app.post('/api/loans', (req, res) => {
  const b = req.body || {};
  const operator = (b.operator || '').trim();
  const customer = resolveCustomerCasing(b.customer);
  const spk = (b.spk || '').trim();
  const product = (b.product || '').trim();
  const date = (b.date || '').trim();
  const itemId = b.itemId;

  if (!operator) return res.status(400).json({ error: 'Nama operator wajib diisi.' });
  if (!customer) return res.status(400).json({ error: 'Nama customer wajib diisi.' });
  if (!spk) return res.status(400).json({ error: 'Nomor SPK wajib diisi.' });
  if (!product) return res.status(400).json({ error: 'Nama produk wajib diisi.' });
  if (!date) return res.status(400).json({ error: 'Tanggal pinjam wajib diisi.' });

  const item = items.find(i => i.id === itemId);
  if (!item) return res.status(404).json({ error: 'Pisau tidak ditemukan.' });
  if (item.status === 'discontinued') return res.status(400).json({ error: 'Pisau ini sudah discontinued dan tidak bisa dipinjam.' });
  if (item.available <= 0) return res.status(400).json({ error: 'Pisau ini sedang tidak tersedia.' });

  const itemDetail = 'Tempat ' + item.tempat + ' · Rak ' + item.rak + ' · Mata ' + item.mata + ' · Papan ' + item.papan;
  let voucherCount = parseInt(b.voucherCount, 10);
  if (!voucherCount || voucherCount < 1) {
    const papanNum = parseInt(item.papan, 10);
    voucherCount = (papanNum && papanNum > 0) ? papanNum : 1;
  }
  const tx = {
    code: nextCode(date),
    operator, customer, spk, product,
    itemId: item.id,
    itemDetail,
    manualNo: item.manualNo || '',
    location: item.location,
    qty: 1, date, time: nowTime(),
    voucherCount,
    adminCopyPrinted: false,
    status: 'dipinjam',
    returnDate: null,
    returnTime: null
  };
  transactions.unshift(tx);
  item.available -= 1;
  syncStatusFromAvailability(item);
  persistItems();
  persistTransactions();
  res.status(201).json(tx);
});

app.post('/api/loans/:code/mark-admin-printed', (req, res) => {
  const tx = transactions.find(t => t.code === req.params.code);
  if (!tx) return res.status(404).json({ error: 'Transaksi tidak ditemukan.' });
  tx.adminCopyPrinted = true;
  persistTransactions();
  res.json(tx);
});

app.post('/api/returns/:code', (req, res) => {
  const tx = transactions.find(t => t.code === req.params.code);
  if (!tx) return res.status(404).json({ error: 'Transaksi tidak ditemukan.' });
  if (tx.status === 'dikembalikan') return res.status(400).json({ error: 'Transaksi sudah dikembalikan.' });

  const returnDate = (req.body && req.body.returnDate) || todayStr();
  tx.status = 'dikembalikan';
  tx.returnDate = returnDate;
  tx.returnTime = nowTime();
  const item = items.find(i => i.id === tx.itemId);
  if (item) {
    item.available = Math.min(item.stock, item.available + tx.qty);
    syncStatusFromAvailability(item);
  }
  persistItems();
  persistTransactions();
  res.json(tx);
});

app.patch('/api/loans/:code', (req, res) => {
  const tx = transactions.find(t => t.code === req.params.code);
  if (!tx) return res.status(404).json({ error: 'Transaksi tidak ditemukan.' });
  if (tx.status !== 'dipinjam') return res.status(400).json({ error: 'Hanya transaksi yang masih berstatus "dipinjam" yang bisa diedit.' });

  const operator = ((req.body && req.body.operator) || '').trim();
  const date = ((req.body && req.body.date) || '').trim();
  if (!operator) return res.status(400).json({ error: 'Nama operator wajib diisi.' });
  if (!date) return res.status(400).json({ error: 'Tanggal pinjam wajib diisi.' });

  tx.operator = operator;
  tx.date = date;
  persistTransactions();
  res.json(tx);
});

app.delete('/api/loans/:code', (req, res) => {
  const idx = transactions.findIndex(t => t.code === req.params.code);
  if (idx === -1) return res.status(404).json({ error: 'Transaksi tidak ditemukan.' });
  const tx = transactions[idx];
  if (tx.status === 'dipinjam') {
    const item = items.find(i => i.id === tx.itemId);
    if (item) {
      item.available = Math.min(item.stock, item.available + 1);
      syncStatusFromAvailability(item);
    }
    persistItems();
  }
  transactions.splice(idx, 1);
  persistTransactions();
  res.json({ ok: true });
});

app.post('/api/export', (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (rows.length === 0) return res.status(400).json({ error: 'Tidak ada data untuk diekspor.' });

  const header = [
    'Kode Peminjaman', 'Operator', 'Customer', 'No. SPK', 'Nama Produk',
    'Detail Pisau', 'No Urut', 'Tanggal Pinjam', 'Waktu Pinjam', 'Tanggal Kembali', 'Waktu Kembali', 'Status'
  ];
  const aoa = [header, ...rows.map(r => [
    r.code || '',
    r.operator || '',
    r.customer || '',
    r.spk || '',
    r.product || '',
    r.itemDetail || '',
    r.manualNo || '-',
    fmtDateID(r.date),
    r.time || '',
    r.returnDate ? fmtDateID(r.returnDate) : '-',
    r.returnTime || '-',
    r.status === 'dipinjam' ? 'Dipinjam' : 'Dikembalikan'
  ])];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = header.map(() => ({ wch: 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Riwayat Peminjaman');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const filename = 'riwayat-peminjaman-' + todayStr() + '.xlsx';
  res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  const addrs = [];
  Object.values(nets).forEach(list => (list || []).forEach(n => {
    if (n.family === 'IPv4' && !n.internal) addrs.push(n.address);
  }));
  console.log('');
  console.log('=================================================');
  console.log(' SIPAM - PT Inti Prima Karya');
  console.log(' Server berjalan di port ' + PORT);
  console.log('');
  console.log(' Buka di PC ini      : http://localhost:' + PORT);
  addrs.forEach(a => console.log(' Buka dari PC lain    : http://' + a + ':' + PORT));
  console.log('=================================================');
  console.log('');
});
