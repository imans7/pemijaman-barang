// SIPAM - client-side. Semua data diambil/disimpan lewat API server (bukan penyimpanan browser),
// supaya semua PC di jaringan LAN yang sama melihat data yang sama.

let state = {
  items: [],
  transactions: [],
  selectedItemId: null,
  view: 'idle',
  confirmingReturnCode: null,
  editingCode: null,
  selectedIds: new Set(),
  selectedHistoryCodes: new Set(),
  lastOperator: localStorage.getItem('sipam_lastOperator') || '',
  showDiscontinued: false
};

const API = {
  items: '/api/items',
  import: '/api/import',
  transactions: '/api/transactions',
  loans: '/api/loans',
  returns: (code) => '/api/returns/' + encodeURIComponent(code)
};

async function apiGet(url){
  const res = await fetch(url);
  if(res.status === 401){ redirectToLogin(); throw new Error('Sesi berakhir.'); }
  if(!res.ok) throw new Error('Gagal memuat data dari server.');
  return res.json();
}
async function apiSend(url, method, body){
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  if(res.status === 401){ redirectToLogin(); throw new Error('Sesi berakhir, silakan login lagi.'); }
  const data = await res.json().catch(() => ({}));
  if(!res.ok) throw new Error(data.error || 'Terjadi kesalahan pada server.');
  return data;
}

function redirectToLogin(){
  window.location.href = '/login.html';
}

async function checkAuthAndInit(){
  try{
    const res = await fetch('/api/me');
    if(!res.ok){ redirectToLogin(); return; }
    const data = await res.json();
    renderSessionBar(data.username);
    loadAll();
  }catch(e){
    redirectToLogin();
  }
}

function renderSessionBar(username){
  const el = document.getElementById('sessionBar');
  if(!el) return;
  el.innerHTML = 'Masuk sebagai <b>'+username+'</b> · <button class="logout-link" onclick="doLogout()">Keluar</button>';
}

async function doLogout(){
  try{ await fetch('/api/logout', { method:'POST' }); }catch(e){ /* tetap redirect walau gagal */ }
  redirectToLogin();
}

async function toggleShowDiscontinued(checked){
  state.showDiscontinued = checked;
  await loadAll();
}

async function loadAll(){
  try{
    const itemsUrl = API.items + (state.showDiscontinued ? '?includeDiscontinued=true' : '');
    const [items, transactions] = await Promise.all([
      apiGet(itemsUrl),
      apiGet(API.transactions)
    ]);
    state.items = items;
    state.transactions = transactions;
  }catch(e){
    console.error(e);
    showGlobalError('Tidak bisa terhubung ke server SIPAM. Pastikan server sedang berjalan.');
  }
  render();
}

function showGlobalError(msg){
  const el = document.getElementById('importStatus');
  if(el){ el.className = 'import-status err'; el.textContent = msg; }
}

/* ---------- Helpers ---------- */
function fmtDate(d){
  if(!d) return '-';
  const [y,m,day] = d.split('-');
  return day+'/'+m+'/'+y;
}
function todayStr(){ return new Date().toISOString().slice(0,10); }
function monthsAgoStr(n){
  const d = new Date();
  d.setMonth(d.getMonth()-n);
  return d.toISOString().slice(0,10);
}
function itemDetailLine(i){
  return 'Tempat '+i.tempat+' · Rak '+i.rak+' · Mata '+i.mata+' · Papan '+i.papan;
}

/* ---------- Import Excel ---------- */
document.getElementById('importFile').addEventListener('change', async function(e){
  const file = e.target.files[0];
  if(!file) return;
  const statusEl = document.getElementById('importStatus');
  statusEl.className = 'import-status';
  statusEl.textContent = 'Mengunggah & membaca file...';
  try{
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(API.import, { method:'POST', body: fd });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Gagal mengimpor file.');
    statusEl.className = 'import-status ok';
    statusEl.textContent = data.added+' pisau ditambahkan dari '+data.sheets+' sheet (data yang sudah ada, termasuk yang mirip, tidak ditimpa).';
    await loadAll();
  }catch(err){
    statusEl.className = 'import-status err';
    statusEl.textContent = err.message;
  }
  e.target.value = '';
});

/* ---------- Rendering ---------- */
function getFilteredItems(){
  const q = (document.getElementById('searchInput').value || '').toLowerCase();
  const loc = document.getElementById('locationFilter').value;
  const cust = document.getElementById('customerFilter').value;
  return state.items.filter(i=>{
    const matchQ = !q
      || i.name.toLowerCase().includes(q)
      || i.location.toLowerCase().includes(q)
      || (i.customer||'').toLowerCase().includes(q);
    const matchLoc = !loc || loc==='Semua lokasi' || i.location===loc;
    const matchCust = !cust || cust==='Semua customer' || i.customer===cust;
    return matchQ && matchLoc && matchCust;
  });
}

function renderStats(){
  const filtered = getFilteredItems();
  const filteredIds = new Set(filtered.map(i=>i.id));
  const total = filtered.reduce((s,i)=>s+i.stock,0);
  const tersedia = filtered.reduce((s,i)=>s+i.available,0);
  const dipinjamHariIni = state.transactions.filter(t=>t.date===todayStr() && t.status==='dipinjam' && filteredIds.has(t.itemId)).length;
  document.getElementById('statsRow').innerHTML = [
    ['Jenis pisau', filtered.length],
    ['Stok tersedia', tersedia+' / '+total],
    ['Dipinjam hari ini', dipinjamHariIni]
  ].map(([label,val])=>'<div class="stat"><b>'+val+'</b><span>'+label+'</span></div>').join('');
}

function renderLocationFilter(){
  const sel = document.getElementById('locationFilter');
  const locs = ['Semua lokasi', ...new Set(state.items.map(i=>i.location))].sort();
  const current = sel.value || 'Semua lokasi';
  sel.innerHTML = locs.map(r=>'<option value="'+r+'">'+r+'</option>').join('');
  sel.value = locs.includes(current) ? current : 'Semua lokasi';
}

function renderCustomerFilter(){
  const sel = document.getElementById('customerFilter');
  const custs = ['Semua customer', ...new Set(state.items.map(i=>i.customer).filter(c=>c))].sort();
  const current = sel.value || 'Semua customer';
  sel.innerHTML = custs.map(c=>'<option value="'+c+'">'+c+'</option>').join('');
  sel.value = custs.includes(current) ? current : 'Semua customer';
}

function renderCatalog(){
  const list = document.getElementById('catalogList');
  const filtered = getFilteredItems();
  if(filtered.length===0){
    list.innerHTML = '<div class="empty-state">Pisau tidak ditemukan. Coba ubah kata kunci/filter, atau tambah pisau baru.</div>';
    updateBulkBar();
    return;
  }
  list.innerHTML = filtered.map(i=>{
    const isDiscontinued = i.status === 'discontinued';
    const out = i.available <= 0 && !isDiscontinued;
    
    const sel = i.id === state.selectedItemId ? ' selected' : '';
    const cls = out ? ' out' : sel;
    
    const badge = isDiscontinued 
      ? '<span class="badge" style="background:var(--line);color:var(--ink-soft);">Discontinued</span>'
      : (out ? '<span class="badge out">Dipinjam</span>' : '<span class="badge avail">Tersedia</span>');
    
    let actionBtns = '';
    if (isDiscontinued) {
      actionBtns = '<button class="btn secondary small" style="color:var(--ok); border-color:var(--ok); margin-right:6px;" onclick="event.stopPropagation();reactivateItem(\''+i.id+'\')">Aktifkan</button>'
                 + '<button class="btn secondary small" style="color:var(--warn); border-color:var(--warn);" onclick="event.stopPropagation();deleteItemPermanently(\''+i.id+'\')">Hapus</button>';
    } else {
      actionBtns = '<button class="btn secondary small" style="margin-right:6px;" onclick="event.stopPropagation();viewItemHistory(\''+i.id+'\')">Riwayat / Edit</button>'
                 + '<button class="btn secondary small" style="color:var(--warn); border-color:var(--warn);" onclick="event.stopPropagation();promptManageItem(\''+i.id+'\')">Hapus / Discon</button>';
    }

    const clickAttr = (out || isDiscontinued) ? '' : ' onclick="selectItem(\''+i.id+'\')"';
    const checked = state.selectedIds.has(i.id) ? ' checked' : '';

    return '<div class="item-tag'+cls+'"'+clickAttr+'>'
      +'<input type="checkbox" class="item-checkbox"'+checked+' onclick="event.stopPropagation()" onchange="toggleItemCheckbox(\''+i.id+'\', this.checked)">'
      +'<div class="hole"></div>'
      +'<div class="info"><b>'+i.name+'</b><span>'+itemDetailLine(i)+(i.customer?' · Customer '+i.customer:'')+'</span></div>'
      +'<div class="nourut-box"><label>No Urut</label><div class="nourut-value">'+(i.manualNo||'-')+'</div></div>'
      +'<div class="side" style="align-items:flex-end;">'+badge+'<div style="display:flex; gap:6px; margin-top:8px;">'+actionBtns+'</div></div>'
      +'</div>';
  }).join('');
  updateBulkBar();
}

function toggleItemCheckbox(id, checked){
  if(checked) state.selectedIds.add(id); else state.selectedIds.delete(id);
  updateBulkBar();
}

function toggleSelectAll(checked){
  const filtered = getFilteredItems();
  filtered.forEach(i => {
    if(checked) state.selectedIds.add(i.id); else state.selectedIds.delete(i.id);
  });
  renderCatalog();
}

function updateBulkBar(){
  const filtered = getFilteredItems();
  const countEl = document.getElementById('bulkCount');
  const btn = document.getElementById('bulkDeleteBtn');
  const allCb = document.getElementById('selectAllCheckbox');
  const n = state.selectedIds.size;
  if(countEl) countEl.textContent = n>0 ? n+' pisau dipilih' : '';
  if(btn) btn.style.display = n>0 ? 'inline-block' : 'none';
  if(allCb) allCb.checked = filtered.length>0 && filtered.every(i=>state.selectedIds.has(i.id));
}

async function bulkDeleteSelected(){
  const ids = Array.from(state.selectedIds);
  if(ids.length===0) return;
  if(!confirm('Yakin ingin menghapus '+ids.length+' pisau yang dipilih dari katalog? Riwayat transaksinya tetap tersimpan.')) return;
  try{
    await apiSend('/api/items/bulk-delete', 'POST', { ids });
    state.selectedIds.clear();
    await loadAll();
  }catch(e){
    alert(e.message);
  }
}

function selectItem(id){
  const item = state.items.find(i=>i.id===id);
  if(!item || item.available<=0) return;
  state.selectedItemId = id;
  state.view = 'form';
  render();
}

function viewItemHistory(id){
  state.selectedItemId = id;
  state.view = 'history';
  render();
}

function cancelSelection(){
  state.selectedItemId = null;
  state.view = 'idle';
  render();
}

function openAddItemForm(){
  state.selectedItemId = null;
  state.view = 'add-item';
  render();
}

function promptManageItem(id){
  state.selectedItemId = id;
  state.view = 'manage-item';
  render();
}

async function deleteItemPermanently(id){
  const item = state.items.find(i=>i.id===id);
  if(!item) return;
  const activeLoan = item.available < item.stock;
  const msg = activeLoan
    ? 'Pisau "'+item.name+'" sedang dipinjam! Yakin ingin menghapus permanen? (Riwayat tetap ada)'
    : 'Yakin ingin menghapus pisau "'+item.name+'" secara PERMANEN? (Riwayat tetap ada)';
  if(!confirm(msg)) return;
  try{
    await apiSend(API.items+'/'+encodeURIComponent(id), 'DELETE');
    if(state.selectedItemId===id){ state.selectedItemId=null; state.view='idle'; }
    state.selectedIds.delete(id);
    await loadAll();
  }catch(e){
    alert(e.message);
  }
}

async function discontinueItem(id){
  try{
    await apiSend(API.items+'/'+encodeURIComponent(id)+'/discontinue', 'POST');
    if(state.selectedItemId===id){ state.selectedItemId=null; state.view='idle'; }
    state.selectedIds.delete(id);
    await loadAll();
  }catch(e){
    alert(e.message);
  }
}

async function reactivateItem(id){
  try{
    await apiSend(API.items+'/'+encodeURIComponent(id)+'/reactivate', 'POST');
    if(state.selectedItemId===id){ state.selectedItemId=null; state.view='idle'; }
    await loadAll();
  }catch(e){
    alert(e.message);
  }
}

async function submitAddItem(){
  const name = document.getElementById('aName').value.trim();
  const tempat = document.getElementById('aTempat').value.trim();
  const rak = document.getElementById('aRak').value.trim();
  const mata = document.getElementById('aMata').value.trim();
  const papan = document.getElementById('aPapan').value.trim();
  const customer = document.getElementById('aCustomer').value.trim();
  const manualNo = document.getElementById('aManualNo').value.trim();
  const errEl = document.getElementById('addItemErr');

  if(!name){ errEl.textContent='Nama pisau wajib diisi.'; errEl.style.display='block'; return; }
  if(!rak){ errEl.textContent='Rak wajib diisi.'; errEl.style.display='block'; return; }
  errEl.style.display='none';

  try{
    await apiSend(API.items, 'POST', { name, tempat, rak, mata, papan, customer, manualNo });
    state.view = 'idle';
    await loadAll();
  }catch(e){
    errEl.textContent = e.message;
    errEl.style.display='block';
  }
}

function openEditItemForm(id){
  state.selectedItemId = id;
  state.view = 'edit-item';
  render();
}

async function submitEditItem(){
  const item = state.items.find(i=>i.id===state.selectedItemId);
  if(!item) return;

  const name = document.getElementById('eName').value.trim();
  const tempat = document.getElementById('eTempat').value.trim();
  const rak = document.getElementById('eRak').value.trim();
  const mata = document.getElementById('eMata').value.trim();
  const papan = document.getElementById('ePapan').value.trim();
  const customer = document.getElementById('eCustomer').value.trim();
  const manualNo = document.getElementById('eManualNo').value.trim();
  const errEl = document.getElementById('editItemErr');

  if(!name){ errEl.textContent='Nama pisau wajib diisi.'; errEl.style.display='block'; return; }
  if(!rak){ errEl.textContent='Rak wajib diisi.'; errEl.style.display='block'; return; }
  errEl.style.display='none';

  try{
    await apiSend(API.items+'/'+encodeURIComponent(item.id), 'PATCH', { name, tempat, rak, mata, papan, customer, manualNo });
    state.view = 'history'; // Setelah edit, kembalikan ke panel riwayat/edit
    await loadAll();
  }catch(e){
    errEl.textContent = e.message;
    errEl.style.display='block';
  }
}

function renderOperatorPanel(){
  const body = document.getElementById('operatorBody');

  if(state.view === 'idle'){
    body.innerHTML = '<div class="empty-state">'
      +'<svg viewBox="0 0 24 24" fill="none" stroke-width="1.6"><rect x="3" y="7" width="18" height="13" rx="1"/><path d="M8 7V5a4 4 0 018 0v2"/></svg>'
      +'Pilih pisau dari katalog untuk mulai memproses peminjaman, atau klik "Riwayat" untuk melihat histori pinjam pisau tertentu.</div>';
    return;
  }

  if(state.view === 'add-item'){
    body.innerHTML =
      '<h3 style="font-size:15px;margin-bottom:14px;">Tambah pisau baru</h3>'
      +'<div class="field"><label>Nama pisau</label><input type="text" id="aName" placeholder="Contoh: Box Polos"></div>'
      +'<div class="row2">'
      +'<div class="field"><label>Rak</label><input type="text" id="aRak" placeholder="Contoh: 1, atau 5A"></div>'
      +'<div class="field"><label>Tempat</label><input type="text" id="aTempat" placeholder="Contoh: 84"></div>'
      +'</div>'
      +'<div class="row2">'
      +'<div class="field"><label>Mata</label><input type="text" id="aMata" placeholder="Jumlah mata pisau"></div>'
      +'<div class="field"><label>Papan</label><input type="text" id="aPapan" placeholder="Jumlah papan penyangga"></div>'
      +'</div>'
      +'<div class="field"><label>No Urut (opsional)</label><input type="text" id="aManualNo" placeholder="Nomor urut, jika ada"></div>'
      +'<div class="field"><label>Customer (opsional)</label><input type="text" id="aCustomer" placeholder="Customer tetap pisau ini"></div>'
      +'<div id="addItemErr" class="err" style="display:none;"></div>'
      +'<div class="btn-row"><button class="btn accent" onclick="submitAddItem()">Simpan pisau</button>'
      +'<button class="btn secondary" onclick="cancelSelection()">Batal</button></div>';
    return;
  }

  if(state.view === 'edit-item'){
    const item = state.items.find(i=>i.id===state.selectedItemId);
    if(!item){ state.view='idle'; render(); return; }
    body.innerHTML =
      '<h3 style="font-size:15px;margin-bottom:14px;">Edit Data Pisau</h3>'
      +'<div class="field"><label>Nama pisau</label><input type="text" id="eName" value="'+item.name+'"></div>'
      +'<div class="row2">'
      +'<div class="field"><label>Rak</label><input type="text" id="eRak" value="'+item.rak+'"></div>'
      +'<div class="field"><label>Tempat</label><input type="text" id="eTempat" value="'+item.tempat+'"></div>'
      +'</div>'
      +'<div class="row2">'
      +'<div class="field"><label>Mata</label><input type="text" id="eMata" value="'+item.mata+'"></div>'
      +'<div class="field"><label>Papan</label><input type="text" id="ePapan" value="'+item.papan+'"></div>'
      +'</div>'
      +'<div class="field"><label>No Urut</label><input type="text" id="eManualNo" value="'+(item.manualNo||'')+'"></div>'
      +'<div class="field"><label>Customer (opsional)</label><input type="text" id="eCustomer" value="'+(item.customer||'')+'"></div>'
      +'<div id="editItemErr" class="err" style="display:none;"></div>'
      +'<div class="btn-row"><button class="btn accent" onclick="submitEditItem()">Simpan Perubahan</button>'
      +'<button class="btn secondary" onclick="viewItemHistory(\''+item.id+'\')">Batal</button></div>';
    return;
  }

  if(state.view === 'manage-item'){
    const item = state.items.find(i=>i.id===state.selectedItemId);
    if(!item){ state.view='idle'; render(); return; }
    body.innerHTML = '<div class="detail-panel">'
      +'<h3>Kelola Pisau: '+item.name+'</h3>'
      +'<p style="font-size:13.5px;color:var(--ink-soft);margin:10px 0 16px;line-height:1.5;">'
      +'Silakan pilih tindakan:<br>'
      +'<b>• Discontinue:</b> Menyembunyikan pisau dari katalog agar tidak bisa dipinjam, namun data dan riwayat tidak terhapus.<br>'
      +'<b>• Hapus Permanen:</b> Menghapus data pisau dari sistem selamanya.'
      +'</p></div>'
      +'<div class="btn-row">'
      +'<button class="btn secondary" onclick="discontinueItem(\''+item.id+'\')">Discontinue (Sembunyikan)</button>'
      +'<button class="btn accent" style="background:var(--warn);border-color:var(--warn);" onclick="deleteItemPermanently(\''+item.id+'\')">Hapus Permanen</button>'
      +'<button class="link-btn" onclick="cancelSelection()">Batal</button></div>';
    return;
  }

  if(state.view === 'history'){
    const item = state.items.find(i=>i.id===state.selectedItemId);
    if(!item){ state.view='idle'; render(); return; }
    const fullList = state.transactions.filter(t=>t.itemId===item.id).sort((a,b)=> (b.date+b.time).localeCompare(a.date+a.time));
    const list = fullList.slice(0, 3);
    const detailGrid = '<div class="detail-grid">'
      +'<div><span>Tempat</span><b>'+item.tempat+'</b></div>'
      +'<div><span>Rak</span><b>'+item.rak+'</b></div>'
      +'<div><span>Mata</span><b>'+item.mata+'</b></div>'
      +'<div><span>Papan</span><b>'+item.papan+'</b></div>'
      +'<div><span>No Urut</span><b>'+(item.manualNo||'-')+'</b></div>'
      +'</div>';
    const histHtml = list.length===0
      ? '<div class="empty-state" style="padding:18px 0;">Belum pernah dipinjam.</div>'
      : list.map(t=>{
          const statusTxt = t.status==='dipinjam'
            ? '<span class="status-pill dipinjam">Dipinjam</span>'
            : '<span class="status-pill dikembalikan">Kembali '+fmtDate(t.returnDate)+' '+(t.returnTime||'')+'</span>';
          return '<div class="hist-row"><span class="who">'+t.customer+' <span style="color:var(--ink-soft);font-weight:400;">(oleh '+t.operator+')</span></span><span class="when">'+fmtDate(t.date)+' '+(t.time||'')+'</span>'+statusTxt+'</div>';
        }).join('')
        + (fullList.length > 3 ? '<div class="hint" style="margin-top:8px;">Menampilkan 3 peminjaman terbaru dari total '+fullList.length+'.</div>' : '');
    
    // UI digabung antara judul dan tombol "Edit Data"
    body.innerHTML = '<div class="detail-panel">'
      +'<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">'
      +'<h3 style="margin:0; font-size:16px;">'+item.name+'</h3>'
      +'<button class="btn secondary small" onclick="openEditItemForm(\''+item.id+'\')">Edit Data</button>'
      +'</div>'
      +detailGrid
      +'<h3 style="font-size:13px;color:var(--ink-soft);margin-bottom:6px;">Riwayat peminjaman</h3>'
      +histHtml
      +'</div>'
      +'<div class="btn-row">'
      +(item.available>0 && item.status!=='discontinued' ? '<button class="btn accent" onclick="selectItem(\''+item.id+'\')">Pinjam pisau ini</button>' : '')
      +'<button class="btn secondary" onclick="cancelSelection()">Tutup</button></div>';
    return;
  }

  if(state.view === 'form'){
    const item = state.items.find(i=>i.id===state.selectedItemId);
    if(!item){ state.view='idle'; render(); return; }
    const defaultCount = defaultVoucherCount(item);
    body.innerHTML =
      '<div class="selected-strip"><div class="row1"><span>Meminjamkan: <b>'+item.name+'</b></span>'
      +'<button class="link-btn" onclick="cancelSelection()">Ganti</button></div>'
      +'<span class="meta">Detail Pisau: '+itemDetailLine(item)+'</span>'
      +'<span class="meta">No Urut: '+(item.manualNo||'-')+'</span></div>'
      +'<div class="field"><label>Operator</label><input type="text" id="fOperator" value="'+(state.lastOperator||'')+'" placeholder="Nama operator yang menginput"></div>'
      +'<div class="row2">'
      +'<div class="field"><label>Customer</label><input type="text" id="fCustomer" value="'+(item.customer||'')+'" placeholder="Nama customer"></div>'
      +'<div class="field"><label>No. SPK</label><input type="text" id="fSpk" placeholder="Contoh: SPK-0231"></div>'
      +'</div>'
      +'<div class="field"><label>Nama Produk</label><input type="text" id="fProduct" value="'+item.name+'" placeholder="Produk yang akan di-pond"></div>'
      +'<div class="field"><label>Tanggal pinjam</label><input type="date" id="fDate" value="'+todayStr()+'"></div>'
      +'<div id="formErr" class="err" style="display:none;"></div>'
      +'<div class="btn-row" style="align-items:center;">'
      +'<label class="hint" style="margin:0;display:flex;align-items:center;gap:6px;">Jumlah voucher (per papan)<input type="number" id="fVoucherCount" min="1" value="'+defaultCount+'" style="width:64px;"></label>'
      +'<button class="btn accent" onclick="submitLoan()">Simpan &amp; cetak voucher</button>'
      +'<button class="btn secondary" onclick="cancelSelection()">Batal</button></div>';
    return;
  }

  if(state.view === 'voucher'){
    const tx = state.transactions.find(t=>t.code===state.lastCode);
    if(!tx){ state.view='idle'; render(); return; }
    body.innerHTML = renderVoucherHtml(tx, false)
      +'<div class="btn-row"><button class="btn accent" onclick="printVoucher(\''+tx.code+'\')">Cetak voucher</button>'
      +'<button class="btn secondary" onclick="cancelSelection()">Transaksi baru</button></div>';
  }
}

function renderVoucherHtml(tx, forPrint, copyLabel){
  return '<div class="voucher" style="'+(forPrint?'max-width:320px;':'')+'">'
    +(copyLabel ? '<div class="voucher-copy-label">'+copyLabel+'</div>' : '')
    +'<div class="vh"><b>SIPAM</b><span>Voucher peminjaman</span></div>'
    +'<div class="vrow"><span>Operator</span><span>'+tx.operator+'</span></div>'
    +'<div class="vrow"><span>Customer</span><span>'+tx.customer+'</span></div>'
    +'<div class="vrow"><span>No. SPK</span><span>'+tx.spk+'</span></div>'
    +'<div class="vrow"><span>Nama Produk</span><span>'+tx.product+'</span></div>'
    +'<div class="vrow"><span>Detail Pisau</span><span>'+tx.itemDetail+'</span></div>'
    +'<div class="vrow"><span>No Urut</span><span>'+(tx.manualNo||'-')+'</span></div>'
    +'<div class="vrow"><span>Tanggal pinjam</span><span>'+fmtDate(tx.date)+' '+(tx.time||'')+'</span></div>'
    +'<div class="code">'+tx.code+'</div>'
    +'</div>';
}

function defaultVoucherCount(item){
  const n = parseInt(item && item.papan, 10);
  return (n && n>0) ? n : 1;
}

function voucherCopiesHtml(tx){
  const n = tx.voucherCount || 1;
  let html = '';
  for(let i=1;i<=n;i++){
    html += '<div class="voucher-page">'+renderVoucherHtml(tx, true, 'Papan '+i+' dari '+n)+'</div>';
  }
  if(!tx.adminCopyPrinted){
    html += '<div class="voucher-page">'+renderVoucherHtml(tx, true, 'Lembar untuk Admin (Arsip)')+'</div>';
  }
  return html;
}

async function submitLoan(){
  const item = state.items.find(i=>i.id===state.selectedItemId);
  const operator = document.getElementById('fOperator').value.trim();
  const customer = document.getElementById('fCustomer').value.trim();
  const spk = document.getElementById('fSpk').value.trim();
  const product = document.getElementById('fProduct').value.trim();
  const date = document.getElementById('fDate').value;
  const voucherCount = parseInt(document.getElementById('fVoucherCount').value, 10) || 1;
  const errEl = document.getElementById('formErr');

  if(!operator){ errEl.textContent='Nama operator wajib diisi.'; errEl.style.display='block'; return; }
  if(!customer){ errEl.textContent='Nama customer wajib diisi.'; errEl.style.display='block'; return; }
  if(!spk){ errEl.textContent='Nomor SPK wajib diisi.'; errEl.style.display='block'; return; }
  if(!product){ errEl.textContent='Nama produk wajib diisi.'; errEl.style.display='block'; return; }
  if(!date){ errEl.textContent='Tanggal pinjam wajib diisi.'; errEl.style.display='block'; return; }
  if(voucherCount<1){ errEl.textContent='Jumlah voucher minimal 1.'; errEl.style.display='block'; return; }
  if(item.available<=0){ errEl.textContent='Pisau ini sedang tidak tersedia.'; errEl.style.display='block'; return; }
  errEl.style.display='none';

  try{
    const tx = await apiSend(API.loans, 'POST', { operator, customer, spk, product, itemId:item.id, date, voucherCount });
    state.lastOperator = operator;
    localStorage.setItem('sipam_lastOperator', operator);
    state.lastCode = tx.code;
    state.view = 'voucher';
    await loadAll();
    setTimeout(()=>printVoucher(tx.code), 200);
  }catch(e){
    errEl.textContent = e.message;
    errEl.style.display='block';
  }
}

async function markAdminCopyPrinted(code){
  try{ await apiSend('/api/loans/'+encodeURIComponent(code)+'/mark-admin-printed', 'POST'); }catch(e){ /* diamkan, tidak fatal */ }
}

async function printVoucher(code){
  const tx = state.transactions.find(t=>t.code===code);
  if(!tx) return;
  const includesAdminCopy = !tx.adminCopyPrinted;
  document.getElementById('printArea').innerHTML = '<div class="print-grid">'+voucherCopiesHtml(tx)+'</div>';
  window.print();
  if(includesAdminCopy){
    tx.adminCopyPrinted = true;
    await markAdminCopyPrinted(code);
  }
}

async function bulkPrintHistory(){
  const codes = Array.from(state.selectedHistoryCodes);
  if(codes.length===0) return;
  const txs = codes.map(c => state.transactions.find(t=>t.code===c)).filter(Boolean);
  if(txs.length===0) return;
  const codesNeedingAdminCopy = txs.filter(t => !t.adminCopyPrinted).map(t=>t.code);
  document.getElementById('printArea').innerHTML = '<div class="print-grid">'+txs.map(voucherCopiesHtml).join('')+'</div>';
  window.print();
  if(codesNeedingAdminCopy.length>0){
    txs.forEach(t => { if(codesNeedingAdminCopy.includes(t.code)) t.adminCopyPrinted = true; });
    await Promise.all(codesNeedingAdminCopy.map(markAdminCopyPrinted));
  }
}

function startReturnConfirm(code){
  state.confirmingReturnCode = code;
  state.editingCode = null;
  render();
}
function cancelReturnConfirm(){
  state.confirmingReturnCode = null;
  render();
}
async function confirmReturn(code){
  const input = document.getElementById('returnDateInput_'+code);
  const returnDate = input ? input.value : todayStr();
  try{
    await apiSend(API.returns(code), 'POST', { returnDate: returnDate || todayStr() });
    state.confirmingReturnCode = null;
    await loadAll();
  }catch(e){
    alert(e.message);
  }
}

function startEditLoan(code){
  state.editingCode = code;
  state.confirmingReturnCode = null;
  renderHistory();
}
function cancelEditLoan(){
  state.editingCode = null;
  renderHistory();
}
async function confirmEditLoan(code){
  const opInput = document.getElementById('editOperator_'+code);
  const dateInput = document.getElementById('editDate_'+code);
  const operator = opInput ? opInput.value.trim() : '';
  const date = dateInput ? dateInput.value : '';
  if(!operator){ alert('Nama operator wajib diisi.'); return; }
  if(!date){ alert('Tanggal pinjam wajib diisi.'); return; }
  try{
    await apiSend('/api/loans/'+encodeURIComponent(code), 'PATCH', { operator, date });
    state.editingCode = null;
    state.lastOperator = operator;
    localStorage.setItem('sipam_lastOperator', operator);
    await loadAll();
  }catch(e){
    alert(e.message);
  }
}

async function deleteTransaction(code){
  const tx = state.transactions.find(t=>t.code===code);
  if(!tx) return;
  const msg = tx.status === 'dipinjam'
    ? 'Menghapus riwayat ini akan membuat pisau "'+tx.product+'" kembali berstatus tersedia. Yakin ingin menghapus riwayat peminjaman ini?'
    : 'Yakin ingin menghapus riwayat peminjaman ini? Tindakan ini tidak bisa dibatalkan.';
  if(!confirm(msg)) return;
  try{
    await apiSend('/api/loans/'+encodeURIComponent(code), 'DELETE');
    state.selectedHistoryCodes.delete(code);
    await loadAll();
  }catch(e){
    alert(e.message);
  }
}

/* ---------- Riwayat (global) ---------- */
function initHistoryDateDefaults(){
  const fromEl = document.getElementById('historyDateFrom');
  const toEl = document.getElementById('historyDateTo');
  if(!fromEl.value) fromEl.value = monthsAgoStr(6);
  if(!toEl.value) toEl.value = todayStr();
}

function resetHistoryFilters(){
  document.getElementById('historySearch').value = '';
  document.getElementById('historyFilter').value = 'all';
  document.getElementById('historyCustomerFilter').value = 'Semua customer';
  document.getElementById('historyLocationFilter').value = 'Semua lokasi';
  document.getElementById('historyDateFrom').value = monthsAgoStr(6);
  document.getElementById('historyDateTo').value = todayStr();
  renderHistory();
}

function renderHistoryCustomerFilter(){
  const sel = document.getElementById('historyCustomerFilter');
  const custs = ['Semua customer', ...new Set(state.transactions.map(t=>t.customer).filter(c=>c))].sort();
  const current = sel.value || 'Semua customer';
  sel.innerHTML = custs.map(c=>'<option value="'+c+'">'+c+'</option>').join('');
  sel.value = custs.includes(current) ? current : 'Semua customer';
}

function renderHistoryLocationFilter(){
  const sel = document.getElementById('historyLocationFilter');
  const locs = ['Semua lokasi', ...new Set(state.transactions.map(t=>t.location).filter(l=>l))].sort();
  const current = sel.value || 'Semua lokasi';
  sel.innerHTML = locs.map(l=>'<option value="'+l+'">'+l+'</option>').join('');
  sel.value = locs.includes(current) ? current : 'Semua lokasi';
}

function renderHistory(){
  initHistoryDateDefaults();
  const q = (document.getElementById('historySearch').value || '').toLowerCase();
  const statusFilter = document.getElementById('historyFilter').value;
  const custFilter = document.getElementById('historyCustomerFilter').value;
  const locFilter = document.getElementById('historyLocationFilter').value;
  const dateFrom = document.getElementById('historyDateFrom').value;
  const dateTo = document.getElementById('historyDateTo').value;

  const rows = state.transactions.filter(t=>{
    const matchQ = !q
      || t.code.toLowerCase().includes(q)
      || (t.operator||'').toLowerCase().includes(q)
      || (t.customer||'').toLowerCase().includes(q)
      || (t.spk||'').toLowerCase().includes(q)
      || (t.product||'').toLowerCase().includes(q);
    const matchStatus = statusFilter==='all' || t.status===statusFilter;
    const matchCust = custFilter==='Semua customer' || t.customer===custFilter;
    const matchLoc = locFilter==='Semua lokasi' || t.location===locFilter;
    const matchFrom = !dateFrom || t.date >= dateFrom;
    const matchTo = !dateTo || t.date <= dateTo;
    return matchQ && matchStatus && matchCust && matchLoc && matchFrom && matchTo;
  });

  const body = document.getElementById('historyBody');
  state.lastHistoryRows = rows;
  if(rows.length===0){
    body.innerHTML = '<tr><td colspan="12" style="color:var(--ink-soft);text-align:center;padding:22px;">Tidak ada transaksi yang cocok dengan filter.</td></tr>';
    updateHistoryBulkBar();
    return;
  }
  body.innerHTML = rows.map(t=>{
    let actionCell;
    if(t.status==='dikembalikan'){
      actionCell = '<div class="action-cell">'
        +'<button class="action-btn act-reprint" onclick="printVoucher(\''+t.code+'\')">Cetak ulang</button>'
        +'<button class="action-btn act-delete" onclick="deleteTransaction(\''+t.code+'\')">Hapus</button>'
        +'</div>';
    } else if(state.editingCode === t.code){
      actionCell = '<div class="return-confirm">'
        +'<input type="text" id="editOperator_'+t.code+'" value="'+t.operator+'" placeholder="Nama operator" style="width:110px;">'
        +'<input type="date" id="editDate_'+t.code+'" value="'+t.date+'">'
        +'<button class="btn small accent" onclick="confirmEditLoan(\''+t.code+'\')">Simpan</button>'
        +'<button class="link-btn" onclick="cancelEditLoan()">Batal</button>'
        +'</div>';
    } else if(state.confirmingReturnCode === t.code){
      actionCell = '<div class="return-confirm">'
        +'<input type="date" id="returnDateInput_'+t.code+'" value="'+todayStr()+'">'
        +'<button class="btn small accent" onclick="confirmReturn(\''+t.code+'\')">OK</button>'
        +'<button class="link-btn" onclick="cancelReturnConfirm()">Batal</button>'
        +'</div>';
    } else {
      actionCell = '<div class="action-cell">'
        +'<button class="action-btn act-return" onclick="startReturnConfirm(\''+t.code+'\')">Tandai kembali</button>'
        +'<button class="action-btn act-edit" onclick="startEditLoan(\''+t.code+'\')">Edit</button>'
        +'<button class="action-btn act-delete" onclick="deleteTransaction(\''+t.code+'\')">Hapus</button>'
        +'</div>';
    }
    return '<tr>'
      +'<td><input type="checkbox" class="history-checkbox"'+(state.selectedHistoryCodes.has(t.code)?' checked':'')+' onchange="toggleHistoryCheckbox(\''+t.code+'\', this.checked)"></td>'
      +'<td class="mono">'+t.code+'</td>'
      +'<td>'+t.operator+'</td>'
      +'<td>'+t.customer+'</td>'
      +'<td class="mono">'+t.spk+'</td>'
      +'<td>'+t.product+'</td>'
      +'<td>'+(t.itemDetail||'-')+'</td>'
      +'<td class="mono">'+(t.manualNo||'-')+'</td>'
      +'<td>'+fmtDate(t.date)+' '+(t.time||'')+'</td>'
      +'<td>'+(t.returnDate ? fmtDate(t.returnDate)+' '+(t.time||'') : '-')+'</td>'
      +'<td><span class="status-pill '+t.status+'">'+(t.status==='dipinjam'?'Dipinjam':'Dikembalikan')+'</span></td>'
      +'<td>'+actionCell+'</td>'
      +'</tr>';
  }).join('');
  updateHistoryBulkBar();
}

function toggleHistoryCheckbox(code, checked){
  if(checked) state.selectedHistoryCodes.add(code); else state.selectedHistoryCodes.delete(code);
  updateHistoryBulkBar();
}

function toggleSelectAllHistory(checked){
  const rows = state.lastHistoryRows || [];
  rows.forEach(t => {
    if(checked) state.selectedHistoryCodes.add(t.code); else state.selectedHistoryCodes.delete(t.code);
  });
  renderHistory();
}

function updateHistoryBulkBar(){
  const rows = state.lastHistoryRows || [];
  const countEl = document.getElementById('historyBulkCount');
  const btn = document.getElementById('historyBulkPrintBtn');
  const allCb = document.getElementById('historySelectAllCheckbox');
  const n = state.selectedHistoryCodes.size;
  if(countEl) countEl.textContent = n>0 ? n+' transaksi dipilih' : '';
  if(btn) btn.style.display = n>0 ? 'inline-block' : 'none';
  if(allCb) allCb.checked = rows.length>0 && rows.every(t=>state.selectedHistoryCodes.has(t.code));
}

async function exportHistory(){
  const rows = state.lastHistoryRows || [];
  if(rows.length === 0){
    alert('Tidak ada data untuk diekspor sesuai filter saat ini.');
    return;
  }
  try{
    const res = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows })
    });
    if(!res.ok){
      const err = await res.json().catch(()=>({}));
      throw new Error(err.error || 'Gagal mengekspor data.');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'riwayat-peminjaman-'+todayStr()+'.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }catch(e){
    alert(e.message);
  }
}

/* ---------- Root render + wiring ---------- */
function render(){
  renderLocationFilter();
  renderCustomerFilter();
  renderStats();
  renderCatalog();
  renderOperatorPanel();
  renderHistoryCustomerFilter();
  renderHistoryLocationFilter();
  renderHistory();
}

function updateCatalogAndStats(){ renderStats(); renderCatalog(); }
document.getElementById('searchInput').addEventListener('input', updateCatalogAndStats);
document.getElementById('locationFilter').addEventListener('change', updateCatalogAndStats);
document.getElementById('customerFilter').addEventListener('change', updateCatalogAndStats);
document.getElementById('historyFilter').addEventListener('change', renderHistory);
document.getElementById('historySearch').addEventListener('input', renderHistory);
document.getElementById('historyCustomerFilter').addEventListener('change', renderHistory);
document.getElementById('historyLocationFilter').addEventListener('change', renderHistory);
document.getElementById('historyDateFrom').addEventListener('change', renderHistory);
document.getElementById('historyDateTo').addEventListener('change', renderHistory);

checkAuthAndInit();

setInterval(() => {
  if(state.view === 'form' || state.view === 'add-item' || state.view === 'manage-item' || state.view === 'edit-item') return;
  if(state.editingCode || state.confirmingReturnCode) return;
  loadAll();
}, 8000);
