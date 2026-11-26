/* ========================================== */
/* 0. THEME                                    */
/* ========================================== */
function initTheme() {
    const saved = localStorage.getItem('themePLUS') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    updateThemeIcon();
}
function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('themePLUS', next);
    updateThemeIcon();
    if (trendChartInstance) renderChart();
}
function updateThemeIcon() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    document.querySelectorAll('.theme-icon').forEach(function(el) {
        el.className = 'theme-icon fa-solid ' + (isDark ? 'fa-sun' : 'fa-moon');
    });
}

/* ========================================== */
/* 1. TOAST                                    */
/* ========================================== */
function toast(message, type, duration) {
    type = type || 'success';
    duration = duration || 3000;
    var container = document.getElementById('toast-container');
    if (!container) { alert(message); return; }
    var icons = {
        success: 'fa-circle-check',
        error: 'fa-circle-xmark',
        warning: 'fa-triangle-exclamation',
        info: 'fa-circle-info'
    };
    var el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = '<i class="toast-icon fa-solid ' + (icons[type] || icons.info) + '"></i><span class="toast-message">' + message + '</span>';
    container.appendChild(el);
    setTimeout(function() {
        el.style.animation = 'slideOut .3s ease forwards';
        setTimeout(function() { el.remove(); }, 300);
    }, duration);
}

/* ========================================== */
/* 2. STATE                                    */
/* ========================================== */
var dataSantri = [];
var dataPetugas = [];
var riwayatMutasi = [];
var santriAktif = null;
var tipeTransaksi = '';
var trendChartInstance = null;
var chartMode = 'mutasi';
var selectedSantri = new Set();
var filterTanggal = { from: '', to: '' };
var currentQRData = { santri: null, dataURL: null };

/* ========================================== */
/* 3. LOGIN / LOGOUT                           */
/* ========================================== */
async function prosesLogin() {
    var email = document.getElementById('login-username').value.trim();
    var password = document.getElementById('login-password').value;
    var errorEl = document.getElementById('login-error');
    if (!email || !password) {
        errorEl.textContent = 'Email dan password wajib diisi.';
        errorEl.classList.remove('hidden');
        return;
    }
    errorEl.classList.add('hidden');
    try {
        await sbSignIn(email, password);
        if (!currentProfile || !currentProfile.lembaga_id) {
            errorEl.textContent = 'Akun belum terdaftar di lembaga. Hubungi admin.';
            errorEl.classList.remove('hidden');
            await sbSignOut();
            return;
        }
        document.getElementById('login-username').value = '';
        document.getElementById('login-password').value = '';
        await masukKeAplikasi();
        toast('Selamat datang, ' + currentProfile.nama + '!', 'success');
    } catch (err) {
        errorEl.textContent = sbErrorMsg(err);
        errorEl.classList.remove('hidden');
    }
}

async function prosesLogout() {
    try { await sbSignOut(); } catch (e) {}
    location.reload();
}

async function masukKeAplikasi() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('main-screen').classList.remove('hidden');
    document.getElementById('info-user').innerText = currentProfile.nama;
    var roleEl = document.querySelector('.user-role');
    if (roleEl) roleEl.innerText = currentProfile.role === 'super_admin' ? 'Super Admin' : 'Petugas';
    var brandSub = document.querySelector('.brand-subtitle');
    if (brandSub && currentLembaga) brandSub.innerText = currentLembaga.nama_pondok;
    await muatDataAwal();
}

async function muatDataAwal() {
    try {
        var results = await Promise.all([sbGetSantri(), sbGetRiwayat(1000)]);
        dataSantri = results[0];
        riwayatMutasi = results[1];
        inisialisasiFilterKamar();
        renderTampilan();
        renderChart();
    } catch (err) {
        toast('Gagal memuat: ' + sbErrorMsg(err), 'error');
    }
}

async function cekSesi() {
    try {
        var session = await sbGetSession();
        if (session) {
            await sbLoadProfile();
            if (currentProfile && currentProfile.lembaga_id) await masukKeAplikasi();
        }
    } catch (err) { console.error('Cek sesi:', err); }
}

/* ========================================== */
/* 4. HELPERS                                  */
/* ========================================== */
function formatRupiah(n) { return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID'); }
function formatId(id) { return id ? 'SRT-' + String(id).substring(0, 6).toUpperCase() : '-'; }
function getPanggilan(s) { return s.panggilan || (s.nama || '').split(' ')[0] || '-'; }
function getInitials(nama) {
    var p = (nama || '').trim().split(/\s+/);
    return ((p[0] && p[0][0] || '') + (p[1] && p[1][0] || '')).toUpperCase() || '?';
}
function hitungMutasiPerSantri(santriId) {
    var setor = 0, tarik = 0;
    riwayatMutasi.forEach(function(r) {
        if (r.santri_id === santriId) {
            if (r.tipe === 'SETOR') setor += Number(r.nominal);
            else tarik += Number(r.nominal);
        }
    });
    return { setor: setor, tarik: tarik };
}
function hitungTotalSaldo() {
    return dataSantri.reduce(function(a, s) { return a + Number(s.saldo || 0); }, 0);
}

/* ========================================== */
/* 5. RENDER UTAMA                             */
/* ========================================== */
function renderTampilan() {
    var validIds = new Set(dataSantri.map(function(s) { return s.id; }));
    selectedSantri = new Set([...selectedSantri].filter(function(id) { return validIds.has(id); }));
    var searchQuery = document.getElementById('search-input').value.toLowerCase();
    var filterKamar = document.getElementById('filter-kamar').value;
    renderTopStats();
    renderKamarStats();
    renderChartSummary();
    var container = document.getElementById('daftar-santri');
    var filtered = dataSantri.filter(function(s) {
        var q = searchQuery;
        var matchName = !q || s.nama.toLowerCase().indexOf(q) !== -1 || getPanggilan(s).toLowerCase().indexOf(q) !== -1 || formatId(s.id).toLowerCase().indexOf(q) !== -1 || (s.kamar || '').toLowerCase().indexOf(q) !== -1;
        return matchName && (filterKamar === 'ALL' || s.kamar === filterKamar);
    });
    if (!filtered.length) {
        container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-user-slash" style="font-size:32px;margin-bottom:10px;display:block;opacity:.4;"></i>Tidak ada santri yang cocok.</div>';
        document.getElementById('selected-count').innerText = selectedSantri.size;
        return;
    }
    container.innerHTML = filtered.map(function(s) {
        var mutasi = hitungMutasiPerSantri(s.id);
        var isChecked = selectedSantri.has(s.id) ? 'checked' : '';
        return '<div class="santri-card">' +
            '<div class="card-top">' +
                '<div class="card-top-left">' +
                    '<input type="checkbox" class="card-checkbox" ' + isChecked + ' onchange="toggleSelect(\'' + s.id + '\', this.checked)">' +
                    '<div class="avatar-circle">' + getInitials(s.nama) + '</div>' +
                    '<div class="card-info">' +
                        '<span class="card-name">' + s.nama + '</span>' +
                        '<span class="card-nick">Panggilan: ' + getPanggilan(s) + '</span>' +
                        '<div class="card-meta"><span class="tag-kamar"><i class="fa-solid fa-door-open" style="margin-right:3px;"></i>' + s.kamar + '</span></div>' +
                    '</div>' +
                '</div>' +
                '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">' +
                    '<span class="card-id">' + formatId(s.id) + '</span>' +
                    '<div class="card-action-icons">' +
                        '<button class="icon-mini" onclick="bukaQR(\'' + s.id + '\')" title="QR"><i class="fa-solid fa-qrcode"></i></button>' +
                        '<button class="icon-mini" onclick="editSantri(\'' + s.id + '\')" title="Edit"><i class="fa-solid fa-pen"></i></button>' +
                        '<button class="icon-mini danger" onclick="hapusSantri(\'' + s.id + '\')" title="Hapus"><i class="fa-solid fa-trash"></i></button>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="saldo-inner-card">' +
                '<div class="saldo-inner-label">SALDO LAJUR UANG SANTRI</div>' +
                '<div class="saldo-inner-amount">' + formatRupiah(s.saldo) + '</div>' +
                '<div class="saldo-inner-meta">' +
                    '<span>Masuk: <span class="in">+' + formatRupiah(mutasi.setor) + '</span></span>' +
                    '<span>Keluar: <span class="out">-' + formatRupiah(mutasi.tarik) + '</span></span>' +
                '</div>' +
            '</div>' +
            '<div class="card-actions">' +
                '<button class="card-btn card-btn-setor" onclick="bukaModal(\'' + s.id + '\', \'SETOR\')"><i class="fa-solid fa-arrow-down"></i> Setor</button>' +
                '<button class="card-btn card-btn-tarik" onclick="bukaModal(\'' + s.id + '\', \'TARIK\')"><i class="fa-solid fa-arrow-up"></i> Tarik</button>' +
                '<button class="card-btn card-btn-riwayat" onclick="lihatRiwayatSantri(\'' + s.id + '\')"><i class="fa-solid fa-clock-rotate-left"></i> Riwayat</button>' +
            '</div>' +
        '</div>';
    }).join('');
    document.getElementById('selected-count').innerText = selectedSantri.size;
    var allCbs = container.querySelectorAll('.card-checkbox');
    document.getElementById('select-all').checked = allCbs.length > 0 && Array.from(allCbs).every(function(cb) { return cb.checked; });
}

function renderTopStats() {
    document.getElementById('top-total-saldo').innerText = formatRupiah(hitungTotalSaldo());
    document.getElementById('top-total-santri').innerText = dataSantri.length + ' Santri';
    var kamarSet = new Set(dataSantri.map(function(s) { return s.kamar; }));
    document.getElementById('top-total-kamar').innerText = kamarSet.size + ' Unit';
}

function renderKamarStats() {
    var grid = document.getElementById('kamar-stats-grid');
    var map = {};
    dataSantri.forEach(function(s) {
        if (!map[s.kamar]) map[s.kamar] = { count: 0, total: 0 };
        map[s.kamar].count++;
        map[s.kamar].total += Number(s.saldo || 0);
    });
    var kamarList = Object.keys(map).sort();
    if (!kamarList.length) {
        grid.innerHTML = '<p style="color:#94a3b8;font-size:12px;padding:10px;">Belum ada kamar.</p>';
        return;
    }
    grid.innerHTML = kamarList.map(function(k) {
        return '<div class="kamar-stat-card" onclick="filterKamarCepat(\'' + k.replace(/'/g, "\\'") + '\')">' +
            '<div class="kamar-stat-name">' + k.toUpperCase() + '<i class="fa-solid fa-chevron-down"></i></div>' +
            '<div class="kamar-stat-count">' + map[k].count + ' Santri</div>' +
            '<div class="kamar-stat-total">Total ' + formatRupiah(map[k].total) + '</div>' +
        '</div>';
    }).join('');
}

function renderChartSummary() {
    var setor = 0, tarik = 0;
    riwayatMutasi.forEach(function(r) {
        if (r.tipe === 'SETOR') setor += Number(r.nominal);
        else tarik += Number(r.nominal);
    });
    document.getElementById('chart-total-setor').innerText = formatRupiah(setor);
    document.getElementById('chart-total-tarik').innerText = formatRupiah(tarik);
    document.getElementById('chart-total-saldo').innerText = formatRupiah(hitungTotalSaldo());
}

/* ========================================== */
/* 6. CHART                                    */
/* ========================================== */
function setChartMode(mode, btn) {
    chartMode = mode;
    document.querySelectorAll('.chart-btn').forEach(function(el) { el.classList.remove('active'); });
    btn.classList.add('active');
    renderChart();
}

function getChartPeriod() {
    var el = document.getElementById('chart-period');
    var period = el ? el.value : 'all';
    if (period === 'all') return null;
    var now = new Date();
    if (period === '1m') return new Date(now.getFullYear(), now.getMonth(), 1);
    if (period === '3m') return new Date(now.getFullYear(), now.getMonth() - 3, 1);
    if (period === '6m') return new Date(now.getFullYear(), now.getMonth() - 6, 1);
    return null;
}

function renderChart() {
    var canvas = document.getElementById('trendChart');
    if (!canvas) return;
    var cutoff = getChartPeriod();
    var filteredRiwayat = cutoff ? riwayatMutasi.filter(function(r) { return new Date(r.created_at) >= cutoff; }) : riwayatMutasi;
    var monthSetor = {}, monthTarik = {}, monthNet = {}, monthLabel = {};
    filteredRiwayat.forEach(function(r) {
        var d = new Date(r.created_at);
        var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        if (!monthSetor[key]) {
            monthSetor[key] = 0;
            monthTarik[key] = 0;
            monthNet[key] = 0;
            monthLabel[key] = d.toLocaleString('id-ID', { month: 'short', year: 'numeric' });
        }
        var n = Number(r.nominal);
        if (r.tipe === 'SETOR') { monthSetor[key] += n; monthNet[key] += n; }
        else { monthTarik[key] += n; monthNet[key] -= n; }
    });
    var allKeys = Object.keys(monthSetor).sort();
    var keys = allKeys.slice(-6);
    var labels = keys.map(function(k) { return monthLabel[k]; });
    if (trendChartInstance) trendChartInstance.destroy();
    if (chartMode === 'mutasi') {
        trendChartInstance = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    { label: 'Setoran (+)', data: keys.map(function(k) { return monthSetor[k]; }), backgroundColor: '#10b981', borderRadius: 6, maxBarThickness: 40 },
                    { label: 'Penarikan (-)', data: keys.map(function(k) { return monthTarik[k]; }), backgroundColor: '#f43f5e', borderRadius: 6, maxBarThickness: 40 }
                ]
            },
            options: chartOptions()
        });
    } else {
        var saldoByMonth = {};
        var running = hitungTotalSaldo();
        for (var i = allKeys.length - 1; i >= 0; i--) {
            saldoByMonth[allKeys[i]] = running;
            running -= monthNet[allKeys[i]];
        }
        trendChartInstance = new Chart(canvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Saldo Total',
                    data: keys.map(function(k) { return saldoByMonth[k] || 0; }),
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245,158,11,0.15)',
                    fill: true,
                    tension: 0.35,
                    pointBackgroundColor: '#f59e0b',
                    pointRadius: 5,
                    pointHoverRadius: 7
                }]
            },
            options: chartOptions()
        });
    }
}

function chartOptions() {
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    var textColor = isDark ? '#cbd5e1' : '#64748b';
    var gridColor = isDark ? '#2a3446' : '#e2e8f0';
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 }, color: textColor } },
            tooltip: { callbacks: { label: function(ctx) { return ctx.dataset.label + ': ' + formatRupiah(ctx.parsed.y); } } }
        },
        scales: {
            y: { beginAtZero: true, ticks: { callback: function(v) { return (v / 1000000).toFixed(0) + ' jt'; }, font: { size: 10 }, color: textColor }, grid: { color: gridColor } },
            x: { grid: { display: false }, ticks: { font: { size: 10 }, color: textColor } }
        }
    };
}

/* ========================================== */
/* 7. FILTER & SELECT                          */
/* ========================================== */
function inisialisasiFilterKamar() {
    var kamarUnik = [];
    dataSantri.forEach(function(s) {
        if (kamarUnik.indexOf(s.kamar) === -1) kamarUnik.push(s.kamar);
    });
    kamarUnik.sort();
    var opts = '<option value="ALL">Kamar: Semua ' + kamarUnik.length + ' Kamar</option>';
    var headerOpts = '<option value="ALL">Semua Kamar</option>';
    kamarUnik.forEach(function(k) {
        opts += '<option value="' + k + '">Kamar ' + k + '</option>';
        headerOpts += '<option value="' + k + '">' + k + '</option>';
    });
    document.getElementById('filter-kamar').innerHTML = opts;
    document.getElementById('header-filter-kamar').innerHTML = headerOpts;
}

function syncFilterKamar(val) {
    document.getElementById('filter-kamar').value = val;
    document.getElementById('header-filter-kamar').value = val;
    renderTampilan();
}
function filterKamarCepat(kamar) {
    syncFilterKamar(kamar);
    document.getElementById('daftar-santri').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function toggleSelect(id, checked) {
    if (checked) selectedSantri.add(id);
    else selectedSantri.delete(id);
    document.getElementById('selected-count').innerText = selectedSantri.size;
}
function toggleSelectAll() {
    var cb = document.getElementById('select-all');
    if (cb.checked) {
        document.querySelectorAll('.santri-card').forEach(function(card) {
            var el = card.querySelector('.card-checkbox');
            if (!el) return;
            var m = (el.getAttribute('onchange') || '').match(/toggleSelect\('([^']+)'/);
            if (m) selectedSantri.add(m[1]);
        });
        document.querySelectorAll('.card-checkbox').forEach(function(el) { el.checked = true; });
    } else {
        document.querySelectorAll('.card-checkbox').forEach(function(el) { el.checked = false; });
        selectedSantri.clear();
    }
    document.getElementById('selected-count').innerText = selectedSantri.size;
}

/* ========================================== */
/* 8. TRANSAKSI SINGLE                         */
/* ========================================== */
function bukaModal(id, tipe) {
    santriAktif = dataSantri.find(function(s) { return s.id === id; });
    if (!santriAktif) return;
    tipeTransaksi = tipe;
    document.getElementById('modal-transaksi').classList.remove('hidden');
    document.getElementById('modal-nama').innerText = santriAktif.nama;
    document.getElementById('input-nominal').value = '';
    document.getElementById('input-keterangan').value = '';
    var header = document.getElementById('modal-header');
    header.innerText = tipe === 'SETOR' ? 'Setor Uang (Masuk)' : 'Tarik Uang (Keluar)';
    header.style.backgroundColor = tipe === 'SETOR' ? '#059669' : '#e11d48';
}
function tutupModal() {
    document.getElementById('modal-transaksi').classList.add('hidden');
    santriAktif = null;
}
async function prosesTransaksi() {
    var nominal = parseInt(document.getElementById('input-nominal').value);
    if (!nominal || nominal <= 0) { toast('Nominal tidak valid', 'error'); return; }
    var keterangan = document.getElementById('input-keterangan').value.trim();
    try {
        await sbProsesTransaksi(santriAktif.id, tipeTransaksi, nominal, keterangan);
        await muatDataAwal();
        tutupModal();
        toast((tipeTransaksi === 'SETOR' ? 'Setoran' : 'Penarikan') + ' ' + formatRupiah(nominal) + ' berhasil!', 'success');
    } catch (err) {
        toast(sbErrorMsg(err), 'error');
    }
}

/* ========================================== */
/* 9. TRANSAKSI BULK                           */
/* ========================================== */
function bukaModalBulk(tipe) {
    if (!selectedSantri.size) { toast('Pilih santri dulu dengan checkbox.', 'warning'); return; }
    tipeTransaksi = tipe;
    document.getElementById('modal-bulk').classList.remove('hidden');
    document.getElementById('modal-bulk-count').innerText = selectedSantri.size + ' santri terpilih';
    document.getElementById('input-nominal-bulk').value = '';
    document.getElementById('input-keterangan-bulk').value = '';
    var header = document.getElementById('modal-bulk-header');
    header.innerText = tipe === 'SETOR' ? 'Setor Masal' : 'Tarik Masal';
    header.style.backgroundColor = tipe === 'SETOR' ? '#059669' : '#e11d48';
    updateBulkPreview();
}
function tutupModalBulk() { document.getElementById('modal-bulk').classList.add('hidden'); }
function updateBulkPreview() {
    var nominal = parseInt(document.getElementById('input-nominal-bulk').value) || 0;
    var total = nominal * selectedSantri.size;
    document.getElementById('modal-bulk-preview').innerHTML =
        '<div class="bulk-preview-row"><span>Jumlah santri</span><strong>' + selectedSantri.size + '</strong></div>' +
        '<div class="bulk-preview-row"><span>Nominal per santri</span><strong>' + formatRupiah(nominal) + '</strong></div>' +
        '<div class="bulk-preview-row total ' + (tipeTransaksi === 'TARIK' ? 'tarik' : '') + '"><span>Total</span><strong>' + formatRupiah(total) + '</strong></div>';
}
async function prosesTransaksiBulk() {
    var nominal = parseInt(document.getElementById('input-nominal-bulk').value);
    if (!nominal || nominal <= 0) { toast('Nominal tidak valid', 'error'); return; }
    var keterangan = document.getElementById('input-keterangan-bulk').value.trim();
    try {
        var result = await sbProsesTransaksiBulk(Array.from(selectedSantri), tipeTransaksi, nominal, keterangan);
        await muatDataAwal();
        selectedSantri.clear();
        document.getElementById('select-all').checked = false;
        tutupModalBulk();
        if (result.gagal && result.gagal.length > 0) {
            toast(result.berhasil + ' berhasil, ' + result.gagal.length + ' gagal.', 'warning', 5000);
        } else {
            toast(result.berhasil + ' transaksi berhasil!', 'success');
        }
    } catch (err) {
        toast(sbErrorMsg(err), 'error');
    }
}

/* ========================================== */
/* 10. CRUD SANTRI                             */
/* ========================================== */
async function tambahSantriManual() {
    var nama = prompt('Nama Santri Baru:');
    if (!nama || !nama.trim()) return;
    var panggilan = prompt('Nama Panggilan (opsional):') || nama.split(' ')[0];
    var kamar = prompt("Nama Kamar (Contoh: SYAFI'I):");
    if (!kamar) return;
    try {
        await sbTambahSantri(nama.trim(), panggilan.trim(), kamar.toUpperCase(), 0);
        await muatDataAwal();
        toast('Santri berhasil ditambahkan!', 'success');
    } catch (err) {
        toast('Gagal: ' + sbErrorMsg(err), 'error');
    }
}
async function editSantri(id) {
    var s = dataSantri.find(function(x) { return x.id === id; });
    if (!s) return;
    var nama = prompt('Nama Santri:', s.nama);
    if (nama === null) return;
    var kamar = prompt('Kamar:', s.kamar);
    if (kamar === null) return;
    try {
        await sbUpdateSantri(id, { nama: nama.trim() || s.nama, kamar: kamar.toUpperCase().trim() || s.kamar });
        await muatDataAwal();
        toast('Data diperbarui.', 'success');
    } catch (err) {
        toast('Gagal: ' + sbErrorMsg(err), 'error');
    }
}
async function hapusSantri(id) {
    var s = dataSantri.find(function(x) { return x.id === id; });
    if (!s) return;
    if (!confirm('Hapus santri "' + s.nama + '"?\n\nRiwayat tetap tersimpan.')) return;
    try {
        await sbHapusSantri(id);
        selectedSantri.delete(id);
        await muatDataAwal();
        toast('Santri ' + s.nama + ' dihapus.', 'success');
    } catch (err) {
        toast('Gagal: ' + sbErrorMsg(err), 'error');
    }
}

/* ========================================== */
/* 11. QR CODE                                 */
/* ========================================== */
function bukaQR(id) {
    var s = dataSantri.find(function(x) { return x.id === id; });
    if (!s) return;
    currentQRData.santri = s;
    currentQRData.dataURL = null;
    document.getElementById('modal-qr').classList.remove('hidden');
    document.getElementById('qr-image').style.display = 'none';
    document.getElementById('qr-loading').style.display = 'block';
    document.getElementById('qr-info').innerHTML = '';
    var qrContent = JSON.stringify({ app: 'PLUS', id: s.id, kode: formatId(s.id), nama: s.nama, kamar: s.kamar });
    if (typeof QRCode === 'undefined') {
        document.getElementById('qr-loading').innerHTML = 'QR library gagal dimuat.';
        return;
    }
    QRCode.toDataURL(qrContent, { width: 400, margin: 2, color: { dark: '#0f172a', light: '#ffffff' }, errorCorrectionLevel: 'M' })
        .then(function(url) {
            currentQRData.dataURL = url;
            document.getElementById('qr-image').src = url;
            document.getElementById('qr-image').style.display = 'block';
            document.getElementById('qr-loading').style.display = 'none';
            document.getElementById('qr-info').innerHTML =
                '<strong>' + s.nama + '</strong>' +
                '<span>' + formatId(s.id) + ' · Kamar ' + s.kamar + '</span>' +
                '<span style="display:block;margin-top:6px;font-weight:700;color:var(--green-600);">' + formatRupiah(s.saldo) + '</span>';
        })
        .catch(function(err) {
            document.getElementById('qr-loading').innerHTML = 'Gagal: ' + err.message;
        });
}
function tutupQR() {
    document.getElementById('modal-qr').classList.add('hidden');
    currentQRData = { santri: null, dataURL: null };
}
function downloadQR() {
    if (!currentQRData.dataURL || !currentQRData.santri) { toast('QR belum siap.', 'warning'); return; }
    var a = document.createElement('a');
    a.href = currentQRData.dataURL;
    a.download = 'qr_' + formatId(currentQRData.santri.id) + '.png';
    a.click();
    toast('QR di-download.', 'success');
}
function cetakKartuQR() {
    if (!currentQRData.dataURL || !currentQRData.santri) { toast('QR belum siap.', 'warning'); return; }
    var s = currentQRData.santri;
    var namaPondok = currentLembaga ? currentLembaga.nama_pondok : 'Pondok Pesantren';
    var html = '<!DOCTYPE html><html><head><title>Kartu Santri</title><style>' +
        'body{font-family:Arial;margin:20px;display:flex;justify-content:center}' +
        '.kartu{width:340px;border:2px solid #0f172a;border-radius:16px;overflow:hidden;background:#fff}' +
        '.kartu-header{background:linear-gradient(135deg,#081321,#162a45);color:#fff;padding:16px;text-align:center}' +
        '.kartu-header h1{font-size:18px;letter-spacing:2px;margin:0 0 2px}' +
        '.kartu-header p{font-size:10px;color:#94a3b8;margin:0}' +
        '.kartu-body{padding:20px;display:flex;flex-direction:column;align-items:center;gap:10px}' +
        '.kartu-body strong{font-size:16px;color:#0f172a}' +
        '.kartu-body span{font-size:11px;color:#64748b}' +
        '.kartu-footer{background:#a3e635;color:#0f172a;text-align:center;padding:8px;font-size:10px;font-weight:bold}' +
        '</style></head><body>' +
        '<div class="kartu">' +
            '<div class="kartu-header"><h1>PLUS</h1><p>' + namaPondok + '</p></div>' +
            '<div class="kartu-body">' +
                '<strong>' + s.nama + '</strong>' +
                '<span>' + formatId(s.id) + ' · ' + s.kamar + '</span>' +
                '<img src="' + currentQRData.dataURL + '" width="180" height="180">' +
            '</div>' +
            '<div class="kartu-footer">KARTU SANTRI DIGITAL</div>' +
        '</div></body></html>';
    var w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    setTimeout(function() { w.print(); }, 500);
}

/* ========================================== */
/* 12. RIWAYAT + FILTER                        */
/* ========================================== */
function renderRiwayatItem(item) {
    var waktu = new Date(item.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
    var cls = item.tipe === 'SETOR' ? 'setor' : 'tarik';
    var sign = item.tipe === 'SETOR' ? '+' : '-';
    var ket = item.keterangan ? ' - ' + item.keterangan : '';
    return '<div class="riwayat-item">' +
        '<div style="flex:1;">' +
            '<strong>' + (item.santri_nama || 'Santri dihapus') + '</strong>' +
            '<span class="tag-kamar">' + (item.santri_kamar || '-') + '</span>' +
            '<p>' + waktu + ket + ' · Petugas: ' + (item.petugas_nama || '-') + '</p>' +
        '</div>' +
        '<div class="riwayat-right">' +
            '<span class="riwayat-nominal ' + cls + '">' + sign + ' ' + formatRupiah(item.nominal) + '</span>' +
            '<button class="icon-mini" onclick="cetakStruk(\'' + item.id + '\')" title="Cetak"><i class="fa-solid fa-print"></i></button>' +
        '</div>' +
    '</div>';
}
function getFilteredRiwayat(santriId) {
    var list = santriId ? riwayatMutasi.filter(function(r) { return r.santri_id === santriId; }) : riwayatMutasi.slice();
    if (filterTanggal.from) {
        var f = new Date(filterTanggal.from);
        f.setHours(0, 0, 0, 0);
        list = list.filter(function(r) { return new Date(r.created_at) >= f; });
    }
    if (filterTanggal.to) {
        var t = new Date(filterTanggal.to);
        t.setHours(23, 59, 59, 999);
        list = list.filter(function(r) { return new Date(r.created_at) <= t; });
    }
    return list;
}
function renderFilterRiwayatHTML() {
    return '<div class="riwayat-filter">' +
        '<label>Dari</label>' +
        '<input type="date" id="filter-tgl-from" value="' + filterTanggal.from + '" onchange="applyFilterTanggal()">' +
        '<label>s/d</label>' +
        '<input type="date" id="filter-tgl-to" value="' + filterTanggal.to + '" onchange="applyFilterTanggal()">' +
        '<button onclick="resetFilterTanggal()"><i class="fa-solid fa-rotate-left"></i> Reset</button>' +
    '</div>';
}
function applyFilterTanggal() {
    filterTanggal.from = document.getElementById('filter-tgl-from').value;
    filterTanggal.to = document.getElementById('filter-tgl-to').value;
    renderRiwayat();
}
function resetFilterTanggal() {
    filterTanggal = { from: '', to: '' };
    renderRiwayat();
}
function renderRiwayat() {
    var container = document.getElementById('riwayat-area');
    var list = getFilteredRiwayat(null);
    container.innerHTML =
        '<div class="riwayat-toolbar">' +
            '<h3>Semua Mutasi (' + list.length + ' dari ' + riwayatMutasi.length + ')</h3>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
                renderFilterRiwayatHTML() +
                '<button class="btn-green-solid btn-sm" onclick="exportRiwayatCSV()"><i class="fa-solid fa-download"></i> Export</button>' +
            '</div>' +
        '</div>' +
        (list.length ? list.map(renderRiwayatItem).join('') : '<div class="riwayat-kosong">Tidak ada transaksi.</div>');
}
function lihatRiwayatSantri(id) {
    var s = dataSantri.find(function(x) { return x.id === id; });
    if (!s) return;
    document.querySelectorAll('.sub-nav-link').forEach(function(el) { el.classList.remove('active'); });
    var links = document.querySelectorAll('.sub-nav-link');
    if (links[1]) links[1].classList.add('active');
    document.getElementById('daftar-santri').classList.add('hidden');
    document.getElementById('riwayat-area').classList.remove('hidden');
    document.querySelectorAll('.search-bar, .bulk-bar').forEach(function(el) { el.classList.add('hidden'); });
    var list = getFilteredRiwayat(id);
    document.getElementById('riwayat-area').innerHTML =
        '<div class="riwayat-toolbar">' +
            '<h3>Riwayat ' + s.nama + ' (' + list.length + ')</h3>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
                renderFilterRiwayatHTML() +
                '<button class="btn-green-solid btn-sm" onclick="exportRiwayatCSV(\'' + id + '\')"><i class="fa-solid fa-download"></i> Export</button>' +
            '</div>' +
        '</div>' +
        (list.length ? list.map(renderRiwayatItem).join('') : '<div class="riwayat-kosong">Belum ada transaksi.</div>');
}

/* ========================================== */
/* 13. EXPORT CSV                              */
/* ========================================== */
function exportRiwayatCSV(santriId) {
    var list = getFilteredRiwayat(santriId);
    if (!list.length) { toast('Tidak ada data untuk di-export.', 'warning'); return; }
    var header = ['Tanggal', 'Nama Santri', 'Kamar', 'Tipe', 'Nominal', 'Keterangan', 'Petugas'];
    var rows = list.map(function(r) {
        var tgl = new Date(r.created_at).toLocaleString('id-ID');
        return [tgl, r.santri_nama || '-', r.santri_kamar || '-', r.tipe, r.nominal, (r.keterangan || '').replace(/"/g, '""'), r.petugas_nama || '-']
            .map(function(v) { return '"' + v + '"'; }).join(',');
    });
    var csv = '\uFEFF' + header.join(',') + '\n' + rows.join('\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'riwayat_' + new Date().toISOString().split('T')[0] + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast(list.length + ' baris di-export.', 'success');
}

/* ========================================== */
/* 14. PENGATURAN                              */
/* ========================================== */
function bukaPengaturan() {
    document.getElementById('modal-pengaturan').classList.remove('hidden');
    switchTab('password', document.querySelector('.modal-tab[data-tab="password"]'));
    document.getElementById('input-old-password').value = '';
    document.getElementById('input-new-password').value = '';
    document.getElementById('input-confirm-password').value = '';
}
function tutupPengaturan() {
    document.getElementById('modal-pengaturan').classList.add('hidden');
}
function switchTab(tabName, btn) {
    document.querySelectorAll('.modal-tab').forEach(function(el) { el.classList.remove('active'); });
    document.querySelectorAll('.modal-tab-content').forEach(function(el) { el.classList.add('hidden'); });
    if (btn) btn.classList.add('active');
    document.getElementById('tab-' + tabName).classList.remove('hidden');
    if (tabName === 'petugas') renderPetugasList();
}
async function prosesGantiPassword() {
    var oldPass = document.getElementById('input-old-password').value;
    var newPass = document.getElementById('input-new-password').value;
    var confirmPass = document.getElementById('input-confirm-password').value;
    if (newPass.length < 6) { toast('Password minimal 6 karakter.', 'warning'); return; }
    if (newPass !== confirmPass) { toast('Konfirmasi tidak cocok!', 'error'); return; }
    try {
        var userRes = await supabaseClient.auth.getUser();
        var email = userRes.data.user.email;
        await supabaseClient.auth.signInWithPassword({ email: email, password: oldPass });
        var upd = await supabaseClient.auth.updateUser({ password: newPass });
        if (upd.error) throw upd.error;
        tutupPengaturan();
        toast('Password berhasil diubah!', 'success');
    } catch (err) {
        toast('Gagal: ' + sbErrorMsg(err), 'error');
    }
}

/* ========================================== */
/* 15. PETUGAS (via undangan)                  */
/* ========================================== */
async function renderPetugasList() {
    var container = document.getElementById('petugas-list');
    container.innerHTML = '<p style="color:var(--text-muted);font-size:12px;">Memuat...</p>';
    try {
        dataPetugas = await sbGetPetugas();
        container.innerHTML = dataPetugas.map(function(a) {
            return '<div class="petugas-item">' +
                '<div class="pi-info">' +
                    '<strong>' + a.nama + '</strong>' +
                    '<span>@' + a.username + ' ' + (a.id === currentProfile.id ? '<span class="pi-badge">Anda</span>' : '') + '</span>' +
                    '<span style="font-size:10px;color:var(--text-muted);">Role: ' + a.role + '</span>' +
                '</div>' +
            '</div>';
        }).join('');
    } catch (err) {
        container.innerHTML = '<p style="color:#ef4444;font-size:12px;">Gagal: ' + sbErrorMsg(err) + '</p>';
    }
}
async function tambahPetugas() {
    if (currentProfile.role !== 'super_admin') {
        toast('Hanya Super Admin bisa membuat undangan.', 'error');
        return;
    }
    var roleEl = document.getElementById('petugas-role');
    var role = roleEl ? roleEl.value : 'petugas';
    try {
        var undangan = await sbBuatUndangan(role);
        alert('KODE UNDANGAN BERHASIL DIBUAT!\n\n' +
              'Kode: ' + undangan.kode + '\n' +
              'Role: ' + undangan.role + '\n\n' +
              'Bagikan kode ini ke calon petugas.\n' +
              'Mereka buka halaman Register, pilih "Gabung dengan Kode", dan masukkan kode ini.');
        toast('Kode undangan dibuat.', 'success');
    } catch (err) {
        toast('Gagal: ' + sbErrorMsg(err), 'error');
    }
}

/* ========================================== */
/* 16. BACKUP                                  */
/* ========================================== */
function backupData() {
    var backup = {
        lembaga: currentLembaga,
        dataSantri: dataSantri,
        riwayatMutasi: riwayatMutasi,
        exportedAt: new Date().toISOString(),
        version: '2.0'
    };
    var blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'backup_PLUS_' + new Date().toISOString().split('T')[0] + '.json';
    a.click();
    URL.revokeObjectURL(url);
    toast('Backup berhasil.', 'success');
}

async function resetSemuaData() {
    if (currentProfile.role !== 'super_admin') {
        toast('Hanya Super Admin bisa reset data.', 'error');
        return;
    }
    if (!confirm('HAPUS SEMUA SANTRI & RIWAYAT?\n\nTidak bisa dibatalkan!\n\nBackup dulu disarankan.')) return;
    if (!confirm('Yakin 100%?')) return;
    try {
        await supabaseClient.from('riwayat_mutasi').delete().eq('lembaga_id', currentProfile.lembaga_id);
        await supabaseClient.from('santri').delete().eq('lembaga_id', currentProfile.lembaga_id);
        await muatDataAwal();
        toast('Semua data dihapus.', 'success');
    } catch (err) {
        toast('Gagal: ' + sbErrorMsg(err), 'error');
    }
}

/* ========================================== */
/* 17. CETAK                                   */
/* ========================================== */
function cetakStruk(itemId) {
    var item = riwayatMutasi.find(function(r) { return r.id === itemId; });
    if (!item) { toast('Transaksi tidak ditemukan.', 'error'); return; }
    var waktu = new Date(item.created_at).toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' });
    var isSetor = item.tipe === 'SETOR';
    var namaPondok = currentLembaga ? currentLembaga.nama_pondok : 'Pondok Pesantren';
    var html = '<!DOCTYPE html><html><head><title>Struk</title><style>' +
        "body{font-family:'Courier New',monospace;max-width:380px;margin:20px auto;padding:24px;border:1px dashed #333}" +
        '.header{text-align:center;border-bottom:2px double #333;padding-bottom:12px;margin-bottom:12px}' +
        '.header h2{font-size:20px;letter-spacing:3px;margin:0}' +
        '.header p{font-size:10px;color:#666;margin:2px 0}' +
        'hr{border:none;border-top:1px dashed #999;margin:10px 0}' +
        '.row{display:flex;justify-content:space-between;margin:6px 0;font-size:12px;gap:10px}' +
        '.row span:first-child{color:#666}' +
        '.nominal{font-size:24px;text-align:center;margin:20px 0;font-weight:bold;padding:10px;border-radius:8px}' +
        '.setor{color:#059669;background:#ecfdf5;border:1px solid #a7f3d0}' +
        '.tarik{color:#dc2626;background:#fef2f2;border:1px solid #fecaca}' +
        '.footer{text-align:center;font-size:10px;color:#999;margin-top:20px;border-top:1px dashed #999;padding-top:10px}' +
        '</style></head><body>' +
        '<div class="header"><h2>PLUS</h2><p>' + namaPondok + '</p></div>' +
        '<div class="row"><span>Tanggal</span><span>' + waktu + '</span></div>' +
        '<div class="row"><span>Kode</span><span>SRT-' + String(item.id).substring(0, 6).toUpperCase() + '</span></div>' +
        '<div class="row"><span>Nama</span><span><b>' + (item.santri_nama || '-') + '</b></span></div>' +
        '<div class="row"><span>Kamar</span><span>' + (item.santri_kamar || '-') + '</span></div>' +
        '<div class="row"><span>Tipe</span><span>' + item.tipe + '</span></div>' +
        (item.keterangan ? '<div class="row"><span>Ket.</span><span>' + item.keterangan + '</span></div>' : '') +
        '<hr><div class="nominal ' + (isSetor ? 'setor' : 'tarik') + '">' + (isSetor ? '+ ' : '- ') + formatRupiah(item.nominal) + '</div><hr>' +
        '<div class="footer">Petugas: ' + (item.petugas_nama || '-') + '<br>Terima kasih</div>' +
        '</body></html>';
    var w = window.open('', '_blank', 'width=420,height=680');
    w.document.write(html);
    w.document.close();
    setTimeout(function() { w.print(); }, 400);
}

function cetakMasal() {
    if (!dataSantri.length) { toast('Belum ada data santri.', 'warning'); return; }
    var total = hitungTotalSaldo();
    var namaPondok = currentLembaga ? currentLembaga.nama_pondok : 'Pondok Pesantren';
    var rows = dataSantri.map(function(s, i) {
        return '<tr><td style="text-align:center;">' + (i + 1) + '</td><td>' + s.nama + '</td><td>' + s.kamar + '</td><td style="text-align:right;">' + formatRupiah(s.saldo) + '</td></tr>';
    }).join('');
    var html = '<!DOCTYPE html><html><head><title>Laporan Saldo</title><style>' +
        'body{font-family:Arial;margin:32px}' +
        '.kop{text-align:center;border-bottom:3px double #0f172a;padding-bottom:12px;margin-bottom:20px}' +
        '.kop h1{font-size:20px;letter-spacing:4px;margin:0 0 4px}' +
        '.kop h2{font-size:14px;margin:0;font-weight:600}' +
        'table{width:100%;border-collapse:collapse;margin-top:16px}' +
        'th,td{border:1px solid #444;padding:8px 10px;font-size:12px}' +
        'th{background:#e2e8f0;text-align:left}' +
        'tr.total-row{background:#f0f0f0;font-weight:bold}' +
        '</style></head><body>' +
        '<div class="kop"><h1>PLUS</h1><h2>' + namaPondok + '</h2>' +
        '<p style="font-size:11px;color:#666;">Laporan Saldo Santri · ' + new Date().toLocaleString('id-ID') + '</p></div>' +
        '<table><thead><tr><th style="width:40px;text-align:center;">No</th><th>Nama</th><th>Kamar</th><th style="text-align:right;">Saldo</th></tr></thead>' +
        '<tbody>' + rows + '<tr class="total-row"><td colspan="3" style="text-align:right;">TOTAL</td><td style="text-align:right;">' + formatRupiah(total) + '</td></tr></tbody></table>' +
        '</body></html>';
    var w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    setTimeout(function() { w.print(); }, 500);
}

/* ========================================== */
/* 18. NAVIGASI                                */
/* ========================================== */
function bukaMenu(menuId, elemen) {
    document.querySelectorAll('.sub-nav-link').forEach(function(el) { el.classList.remove('active'); });
    document.querySelectorAll('.mbn-item').forEach(function(el) { el.classList.remove('active'); });
    if (elemen) elemen.classList.add('active');
    var daftar = document.getElementById('daftar-santri');
    var riwayat = document.getElementById('riwayat-area');
    document.querySelectorAll('.search-bar, .bulk-bar').forEach(function(el) { el.classList.remove('hidden'); });
    if (menuId === 'overview') {
        daftar.classList.remove('hidden');
        riwayat.classList.add('hidden');
        renderTampilan();
    } else {
        daftar.classList.add('hidden');
        riwayat.classList.remove('hidden');
        document.querySelectorAll('.search-bar, .bulk-bar').forEach(function(el) { el.classList.add('hidden'); });
        renderRiwayat();
    }
}

/* ========================================== */
/* 19. BOOTSTRAP                               */
/* ========================================== */
initTheme();
cekSesi();