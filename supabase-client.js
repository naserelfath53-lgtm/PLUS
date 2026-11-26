// ==========================================
// SUPABASE CLIENT WRAPPER
// ==========================================
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
console.log('✅ supabase-client.js loaded');

let currentSession = null;
let currentProfile = null;
let currentLembaga = null;

// ==========================================
// AUTH
// ==========================================
async function sbSignUp(email, password, nama, username) {
    const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: { data: { nama, username } }
    });
    if (error) throw error;
    return data;
}

async function sbSignIn(email, password) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email, password
    });
    if (error) throw error;
    currentSession = data.session;
    await sbLoadProfile();
    return data;
}

async function sbSignOut() {
    await supabaseClient.auth.signOut();
    currentSession = null;
    currentProfile = null;
    currentLembaga = null;
}

async function sbLoadProfile() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return null;

    const { data: profile, error } = await supabaseClient
        .from('profiles')
        .select('*, lembaga(*)')
        .eq('id', user.id)
        .single();

    if (error) throw error;

    currentProfile = profile;
    currentLembaga = profile?.lembaga || null;
    return profile;
}

async function sbGetSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    currentSession = session;
    return session;
}

// ==========================================
// LEMBAGA
// ==========================================
async function sbDaftarLembaga(namaPondok, alamat = null, telepon = null) {
    const { data, error } = await supabaseClient.rpc('daftar_lembaga_baru', {
        p_nama_pondok: namaPondok,
        p_alamat: alamat,
        p_telepon: telepon
    });
    if (error) throw error;
    await sbLoadProfile();
    return data;
}

async function sbGabungLembaga(kodeUndangan) {
    const { data, error } = await supabaseClient.rpc('gabung_lembaga', {
        p_kode_undangan: kodeUndangan
    });
    if (error) throw error;
    await sbLoadProfile();
    return data;
}

// ==========================================
// SANTRI
// ==========================================
async function sbGetSantri() {
    const { data, error } = await supabaseClient
        .from('santri')
        .select('*')
        .order('nama', { ascending: true });
    if (error) throw error;
    return data || [];
}

async function sbTambahSantri(nama, panggilan, kamar, saldoAwal = 0) {
    const { data, error } = await supabaseClient
        .from('santri')
        .insert([{
            nama,
            panggilan,
            kamar: kamar.toUpperCase(),
            saldo: saldoAwal,
            lembaga_id: currentProfile.lembaga_id
        }])
        .select()
        .single();
    if (error) throw error;
    return data;
}

async function sbUpdateSantri(id, updates) {
    const { data, error } = await supabaseClient
        .from('santri')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
}

async function sbHapusSantri(id) {
    const { error } = await supabaseClient
        .from('santri')
        .delete()
        .eq('id', id);
    if (error) throw error;
}

// ==========================================
// TRANSAKSI
// ==========================================
async function sbProsesTransaksi(santriId, tipe, nominal, keterangan = null) {
    const { data, error } = await supabaseClient.rpc('proses_transaksi', {
        p_santri_id: santriId,
        p_tipe: tipe,
        p_nominal: nominal,
        p_keterangan: keterangan
    });
    if (error) throw error;
    return data;
}

async function sbProsesTransaksiBulk(santriIds, tipe, nominal, keterangan = null) {
    const { data, error } = await supabaseClient.rpc('proses_transaksi_bulk', {
        p_santri_ids: santriIds,
        p_tipe: tipe,
        p_nominal: nominal,
        p_keterangan: keterangan
    });
    if (error) throw error;
    return data;
}

// ==========================================
// RIWAYAT
// ==========================================
async function sbGetRiwayat(limit = 500) {
    const { data, error } = await supabaseClient
        .from('riwayat_mutasi')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) throw error;
    return data || [];
}

async function sbGetRiwayatSantri(santriId) {
    const { data, error } = await supabaseClient
        .from('riwayat_mutasi')
        .select('*')
        .eq('santri_id', santriId)
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

// ==========================================
// PETUGAS
// ==========================================
async function sbGetPetugas() {
    const { data, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
}

async function sbBuatUndangan(role = 'petugas', emailTarget = null) {
    const kode = 'INV-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { data, error } = await supabaseClient
        .from('undangan')
        .insert([{
            lembaga_id: currentProfile.lembaga_id,
            kode,
            role,
            email_target: emailTarget,
            expires_at: expiresAt.toISOString(),
            dibuat_oleh: currentProfile.id
        }])
        .select()
        .single();
    if (error) throw error;
    return data;
}

async function sbUpdatePetugas(id, updates) {
    const { data, error } = await supabaseClient
        .from('profiles')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
}

async function sbHapusPetugas(id) {
    const { error } = await supabaseClient
        .from('profiles')
        .delete()
        .eq('id', id);
    if (error) throw error;
}

// ==========================================
// PLATFORM ADMIN
// ==========================================
async function sbGetAllTenants() {
    const { data, error } = await supabaseClient.rpc('get_all_tenants');
    if (error) throw error;
    return data || [];
}

async function sbUpdateLangganan(lembagaId, updates) {
    const { data, error } = await supabaseClient
        .from('lembaga')
        .update(updates)
        .eq('id', lembagaId)
        .select()
        .single();
    if (error) throw error;
    return data;
}

// ==========================================
// REALTIME
// ==========================================
function sbSubscribeRealtime(onChange) {
    return supabaseClient
        .channel('plus-realtime')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'santri' },
            onChange)
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'riwayat_mutasi' },
            onChange)
        .subscribe();
}

// ==========================================
// ERROR HELPER
// ==========================================
function sbErrorMsg(err) {
    if (!err) return 'Terjadi kesalahan tidak diketahui';
    return err.message || err.error_description || String(err);
}