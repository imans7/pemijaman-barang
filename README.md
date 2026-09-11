# SIPAM — PT Inti Prima Karya

Aplikasi peminjaman pisau mesin pond, dijalankan dari **satu PC di jaringan
LAN kantor**, dan bisa dibuka lewat browser dari PC/laptop operator lain di
jaringan yang sama. Tidak ada sistem login/hak akses — nama operator diisi
manual di form tiap kali transaksi (sesuai permintaan).

Semua data (katalog pisau & riwayat peminjaman) disimpan di **satu PC
server** dalam bentuk file (`data/items.json` dan `data/transactions.json`),
supaya mudah di-backup (tinggal copy foldernya) dan tidak perlu instalasi
database terpisah.

---

## 1. Yang perlu disiapkan

- **Satu PC** di kantor yang akan berperan sebagai "server" — nyala terus
  selama jam kerja, dan terhubung ke LAN kantor yang sama dengan PC operator
  lainnya (bisa lewat kabel LAN atau WiFi kantor, yang penting satu jaringan).
- **Node.js** versi 18 ke atas terpasang di PC server itu. Unduh di
  https://nodejs.org (pilih versi **LTS**). Instalasinya tinggal
  next-next-finish seperti install program biasa.

PC operator lain **tidak perlu install apa-apa** — cukup browser (Chrome,
Edge, Firefox) yang sudah pasti ada di semua PC/laptop kantor.

---

## 2. Instalasi (sekali saja, di PC server)

1. Salin folder `sipam-server` ini ke PC server, misalnya ke `D:\sipam-server`.
2. Buka Command Prompt / Terminal, masuk ke folder tersebut:
   ```
   cd D:\sipam-server
   ```
3. Install dependency (butuh koneksi internet saat langkah ini saja):
   ```
   npm install
   ```
4. **Buat akun login** (wajib, sebelum aplikasi bisa dipakai). Ini satu-satunya
   cara membuat akun — **tidak ada tombol daftar di aplikasinya**, sengaja
   supaya hanya kamu yang bisa membuat akun, langsung dari PC server:
   ```
   node create-account.js <username> <password>
   ```
   Contoh:
   ```
   node create-account.js admin rahasia123
   ```
   Password minimal 6 karakter. Perintah ini bisa dijalankan berkali-kali
   untuk menambah akun lain (operator kedua, ketiga, dst — semua akun
   punya akses yang sama persis, tidak ada bedanya admin/operator) atau
   untuk mengganti password akun yang sudah ada (jalankan lagi dengan
   username yang sama, password baru).
5. Jalankan servernya:
   ```
   npm start
   ```
6. Kalau berhasil, akan muncul tulisan seperti ini di layar:
   ```
   =================================================
    SIPAM - PT Inti Prima Karya
    Server berjalan di port 3000

    Buka di PC ini      : http://localhost:3000
    Buka dari PC lain    : http://192.168.1.23:3000
   =================================================
   ```
   Alamat `http://192.168.1.23:3000` itu (angkanya menyesuaikan PC kamu)
   yang dipakai untuk dibuka dari PC operator lain.

**Biarkan jendela Command Prompt ini tetap terbuka** selama aplikasi mau
dipakai — kalau ditutup, servernya ikut berhenti. Kalau mau dijalankan
otomatis setiap PC menyala tanpa perlu ketik manual, tim IT bisa bantu
buatkan shortcut startup atau pakai tool seperti `pm2` / Task Scheduler
Windows (di luar cakupan panduan ini, tanya IT support kalau perlu).

### Kalau Windows Firewall muncul pop-up
Saat pertama kali `npm start` dijalankan, Windows biasanya menampilkan
pop-up "Windows Defender Firewall has blocked some features of Node.js".
Klik **Allow access**, minimal untuk jaringan **Private**. Kalau ini
ter-skip/ditolak, PC lain tidak akan bisa mengakses aplikasinya.

---

## 3. Cara operator membuka aplikasinya

Dari PC/laptop operator mana pun yang **satu jaringan LAN/WiFi kantor**
dengan PC server, buka browser lalu ketik alamat yang muncul di layar server
tadi, contoh:

```
http://192.168.1.23:3000
```

Disarankan alamat ini disimpan sebagai bookmark di tiap PC operator, atau
dibuatkan shortcut di desktop, biar tidak perlu ketik ulang tiap hari.

Yang pertama muncul adalah **halaman login**. Masukkan username & password
yang sudah kamu buatkan lewat `create-account.js` (lihat bagian 2). Semua
akun punya akses yang sama persis — begitu berhasil masuk, bisa langsung
pakai semua fitur (tambah/hapus pisau, proses peminjaman, dll).

Sesi login berlaku 12 jam sejak login, atau sampai server di-restart —
mana yang lebih dulu. Kalau sesi habis, aplikasi otomatis mengarahkan
kembali ke halaman login.

> **Catatan:** Alamat IP PC server (`192.168.1.23` pada contoh) bisa berubah
> kalau router kantor mengatur ulang alamat secara otomatis (DHCP). Supaya
> alamatnya tetap sama terus, minta tim IT untuk mengatur **IP statis** atau
> **DHCP reservation** untuk PC server ini di router kantor.

---

## 4. Pemakaian sehari-hari

Fitur yang tersedia persis seperti versi prototipe sebelumnya:

- **Tambah / hapus pisau** langsung dari aplikasi (tombol di atas katalog),
  tidak wajib pakai Excel.
- **Hapus banyak pisau sekaligus** — centang beberapa pisau di katalog
  (atau klik "Pilih semua yang tampil" untuk mencentang semua hasil
  filter/pencarian saat itu), lalu klik "Hapus yang dipilih". Tidak perlu
  hapus satu-satu lagi.
- **Import dari Excel** — upload file `.xlsx`/`.xls`/`.csv` yang punya
  kolom `No`, `Customer`, `Nama Produk`, `Tempat`, `Mata`, `Papan`, `Rak`,
  `No Urut Baru`. **Lokasi rak mengikuti isi kolom "Rak"** (bukan nama
  sheet/tab-nya). Setiap baris di Excel **selalu ditambahkan sebagai
  pisau baru** — kalau ada pisau lain yang deskripsinya persis sama
  (nama, rak, dst), datanya **tidak ditimpa**, keduanya tetap tersimpan
  sebagai dua entri terpisah. Data yang sudah ada di aplikasi (termasuk
  yang ditambah manual) juga tidak disentuh sama sekali oleh proses
  import — import hanya menambah, tidak pernah menghapus/mengubah yang
  lain.

  > **Perhatian:** karena tidak ada penimpaan data, meng-import file Excel
  > yang sama dua kali akan membuat pisau-pisau di dalamnya **tergandakan**
  > (dua entri untuk pisau yang sama). Kalau itu terjadi tanpa sengaja,
  > pakai fitur **"Hapus banyak pisau sekaligus"** untuk membersihkan
  > duplikatnya.
- **Nama customer otomatis disamakan besar-kecil hurufnya** — misalnya
  "Campuran", "CAMPURAN", dan "campuran" akan dianggap satu customer yang
  sama (memakai penulisan yang pertama kali tersimpan di sistem), supaya
  tidak muncul sebagai dua data customer berbeda di filter/pencarian.
  Berlaku otomatis baik saat import Excel, tambah pisau manual, maupun
  saat mengisi customer di form peminjaman.
- **Cari & filter** pisau berdasarkan nama, lokasi rak, atau customer.
- Pisau yang sedang dipinjam otomatis ditandai **merah**.
- **Form peminjaman**: operator (isi manual), customer, no. SPK, nama
  produk, tanggal pinjam — lalu voucher tercetak otomatis (tanpa barcode,
  tanpa nama karyawan, tanpa jumlah barang karena tiap pisau dianggap satu
  unit). Voucher menampilkan: operator, customer, no. SPK, nama produk,
  detail pisau, no urut, tanggal pinjam, dan kode peminjaman. Waktu pinjam
  (jam:menit:detik) dan waktu kembali tercatat otomatis secara real-time.
- **Voucher selalu tercetak 2 lembar** — satu berlabel "Lembar untuk
  Karyawan" (dibawa bersama pisau), satu lagi "Lembar untuk Admin
  (Arsip)" untuk disimpan.
- **Tata letak cetak berbentuk grid** — voucher disusun **dari kiri ke
  kanan, lalu turun ke baris berikutnya**, supaya sebanyak mungkin
  voucher muat dalam satu kertas HVS A4 (misalnya 2 voucher per baris di
  posisi Portrait). Halaman baru cuma dipakai kalau memang sudah tidak
  muat lagi — tidak ada lagi satu voucher satu kertas. Tulisan di voucher
  dibuat lebih tebal khusus saat dicetak, supaya tetap jelas terbaca di
  printer laser jet.
- **Cetak ulang banyak voucher sekaligus** — di tabel riwayat, centang
  beberapa transaksi (atau klik "Pilih semua yang tampil"), lalu klik
  "Cetak ulang yang dipilih". Semua voucher yang dicentang (2 lembar per
  transaksi) tersusun dalam grid yang sama, jadi satu proses cetak bisa
  menghasilkan puluhan voucher dengan kertas seminimal mungkin.
- **Hapus riwayat peminjaman** — tombol "Hapus" juga tersedia di tiap
  baris tabel riwayat (fiturnya sama seperti hapus pisau di katalog: ada
  konfirmasi dulu). Kalau transaksi yang dihapus masih berstatus
  "Dipinjam", pisaunya otomatis kembali berstatus tersedia.
- **Kode transaksi** dibuat otomatis dari tanggal transaksi, format
  tahun+bulan+tanggal tanpa angka nol di depan (contoh: 9 September 2026
  jadi `202699`). Kalau ada lebih dari satu transaksi di tanggal yang sama,
  otomatis ditambah akhiran `-2`, `-3`, dst supaya tetap unik.
- **Riwayat**: per pisau (klik "Riwayat" di kartu pisau — menampilkan
  maksimal 3 peminjaman terbaru) maupun riwayat transaksi keseluruhan
  (bawah halaman) dengan filter tanggal (default 6 bulan terakhir), status,
  customer, lokasi, dan pencarian bebas.
- **Edit operator & tanggal pinjam** — untuk transaksi yang masih berstatus
  "Dipinjam", ada tombol "Edit" di tabel riwayat (sebelah "Tandai kembali")
  untuk mengoreksi nama operator dan/atau tanggal pinjam. Berguna kalau
  operator yang jaga berganti orang setelah pisau sudah terlanjur dicatat
  dipinjam. Kode peminjaman tidak ikut berubah walau tanggalnya diedit,
  supaya tetap sesuai dengan voucher yang sudah dicetak.
- **Export ke Excel** — tombol "Export ke Excel" di atas tabel riwayat.
  Yang diekspor persis sesuai isi tabel yang sedang ditampilkan/difilter
  saat itu — misalnya kalau kolom pencarian diisi nama seorang customer,
  file yang ter-export cuma berisi transaksi customer itu beserta pisau
  yang pernah dipinjam untuknya.
- Karena semua operator mengakses **server yang sama**, data yang diinput
  satu operator langsung terlihat oleh operator lain (halaman akan
  menyegarkan diri otomatis tiap beberapa detik).

---

## 5. Kelola akun login

- **Tambah akun baru** (operator lain, dsb): jalankan lagi di PC server,
  ```
  node create-account.js <username-baru> <password>
  ```
- **Ganti/reset password** akun yang sudah ada: jalankan perintah yang
  sama dengan username yang sama, password barunya akan menimpa yang lama:
  ```
  node create-account.js <username-yang-sama> <password-baru>
  ```
- Tidak ada batasan jumlah akun, dan semua akun aksesnya sama persis
  (tidak ada admin/operator terpisah).
- Untuk **menghapus akun**, sementara ini cukup buka file
  `data/users.json` dengan teks editor, hapus baris akun yang
  bersangkutan, lalu simpan (server perlu di-restart setelah itu, atau
  minta bantuan lagi kalau mau dibuatkan script khusus untuk ini).
- Daftar akun & password (dalam bentuk ter-hash, bukan teks asli)
  tersimpan di `data/users.json` — perlakukan folder `data/` sebagai data
  sensitif, jangan dibagikan sembarangan.

---

## 6. Backup data

Semua data ada di folder `data/` (`items.json`, `transactions.json`, dan
`users.json`). Untuk backup, cukup:
- Copy folder `data/` itu secara berkala (misalnya tiap akhir minggu) ke
  flashdisk, drive lain, atau cloud (Google Drive/OneDrive yang sinkron
  otomatis ke folder itu juga bisa).
- Kalau suatu saat butuh pindah ke PC server baru, tinggal copy folder
  `sipam-server` beserta isi folder `data/`-nya ke PC baru, lalu ulangi
  langkah instalasi di atas (tidak perlu `create-account.js` lagi kalau
  `data/users.json` ikut disalin).

---

## 7. Troubleshooting

**"Tidak bisa terhubung ke server SIPAM" muncul di aplikasi**
→ Server belum dijalankan (`npm start`), atau jendela Command Prompt-nya
sudah tertutup. Buka lagi dan jalankan `npm start`.

**PC operator lain tidak bisa buka alamat `http://192.168.x.x:3000`**
→ Cek PC itu benar-benar satu jaringan (WiFi/LAN) dengan PC server. Cek juga
Windows Firewall di PC server sudah mengizinkan Node.js (lihat bagian 2).

**Port 3000 sudah dipakai aplikasi lain**
→ Jalankan dengan port lain, misalnya:
  ```
  set PORT=8080
  npm start
  ```
  (di Mac/Linux pakai `PORT=8080 npm start`), lalu akses pakai
  `http://<ip-server>:8080`.

**Ingin tahu alamat IP PC server secara manual**
→ Di Command Prompt Windows, ketik `ipconfig` dan lihat baris "IPv4
Address". Di Mac/Linux, ketik `ifconfig` atau `ip addr`.

**"Username atau password salah" padahal sudah benar**
→ Cek lagi huruf besar/kecil pada username & password (case-sensitive).
Kalau masih gagal, reset saja passwordnya lewat `node create-account.js
<username> <password-baru>` di PC server.

**Semua orang tiba-tiba harus login ulang**
→ Wajar terjadi setiap kali server di-restart (`npm start` dijalankan
ulang) — ini bukan error, memang begitu desainnya untuk aplikasi internal
seperti ini.

---

## 8. Rencana pengembangan lanjutan

Versi ini memakai penyimpanan file JSON di server — cukup andal untuk
skala satu PT dengan beberapa operator. Kalau ke depannya kebutuhan makin
besar (banyak transaksi per hari, butuh laporan kompleks, dsb.), langkah
lanjutannya ada di bagian 6 dokumen `rancangan-sistem-peminjaman-barang.md`
(migrasi ke database seperti MySQL/PostgreSQL, sistem login per operator,
dsb.) — tinggal minta bantuan lagi kalau saatnya sudah dibutuhkan.
