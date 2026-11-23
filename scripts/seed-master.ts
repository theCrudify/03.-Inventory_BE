// Master data: every label, option list, BC type rule, CEISA stage and setting the app reads.
// Changing any of these in the database (or via the Referensi page) changes the app; no code edit needed.
type RefRow = { type: string; code: string; name: string; meta?: Record<string, unknown>; sort?: number };
const list = (type: string, rows: [string, string, Record<string, unknown>?][]): RefRow[] =>
  rows.map(([code, name, meta], i) => ({ type, code, name, meta, sort: i }));

/** Registry: which reference lists exist, whether admins may edit them, and their extra fields. */
const registry = list('tipe_referensi', [
  ['hs', 'HS Code & Tarif', { editable: true, fields: [{ name: 'bm', label: 'BM (%)' }, { name: 'ppn', label: 'PPN (%)' }, { name: 'pph', label: 'PPh 22 (%)' }] }],
  ['valuta', 'Valuta & Kurs', { editable: true, fields: [{ name: 'kurs', label: 'Kurs Pajak (Rp)' }] }],
  ['negara', 'Negara', { editable: true }],
  ['pelabuhan', 'Pelabuhan', { editable: true }],
  ['kantor', 'Kantor Pabean', { editable: true }],
  ['satuan', 'Satuan', { editable: true }],
  ['kemasan', 'Kemasan', { editable: true }],
  ['incoterm', 'Incoterm', { editable: true }],
  ['jenis_dokumen', 'Jenis Dokumen Pelengkap', { editable: true }],
  ['cara_angkut', 'Cara Angkut', { editable: true }],
  ['ukuran_kontainer', 'Ukuran Kontainer', { editable: true }],
  ['tipe_kontainer', 'Tipe Kontainer', { editable: true }],
  ['jenis_jaminan', 'Jenis Jaminan', { editable: true }],
  ['kategori_barang', 'Kategori Barang', { editable: false }],
  ['jenis_mitra', 'Jenis Mitra', { editable: false }],
  ['jenis_bc', 'Jenis Dokumen BC', { editable: false }],
  ['jenis_sumber', 'Jenis Sumber Dokumen', { editable: false }],
  ['arah_dokumen', 'Arah Dokumen', { editable: false }],
  ['perlakuan_pungutan', 'Perlakuan Pungutan', { editable: false }],
  ['sumber_mutasi', 'Sumber Mutasi Stok', { editable: false }],
  ['status_dokumen', 'Status Dokumen', { editable: false }],
  ['tahap_ceisa', 'Tahap Respon CEISA', { editable: false }],
  ['role', 'Role Pengguna', { editable: false }],
]);

const bc = (code: string, label: string, m: Record<string, unknown>): [string, string, Record<string, unknown>] => [code, label, m];
const jenisBc = list('jenis_bc', [
  bc('23', 'BC 2.3', { title: 'Impor Barang untuk Ditimbun di TPB', direction: 'in', partnerKind: 'supplier', ceisaCode: '23', slug: 'bc-2-3', international: true, defaultOffice: '040300', approvalCode: 'SPPB', approvalMessage: 'Surat Persetujuan Pengeluaran Barang (SPPB) diterbitkan', duty: 'ditangguhkan', sourceDoc: 'po' }),
  bc('262', 'BC 2.6.2', { title: 'Pemasukan Kembali Barang dari TLDDP', direction: 'in', partnerKind: 'subkontraktor', ceisaCode: '262', slug: 'bc-2-6-2', defaultOffice: '050900', approvalCode: 'SPPB', approvalMessage: 'Persetujuan pemasukan kembali, jaminan dikembalikan', duty: 'tidak_dipungut', sourceDoc: 'po' }),
  bc('27in', 'BC 2.7 Masuk', { title: 'Pemasukan Barang dari TPB Lain', direction: 'in', partnerKind: 'supplier', ceisaCode: '27', slug: 'bc-2-7-masuk', defaultOffice: '050900', approvalCode: 'SPPB', approvalMessage: 'Persetujuan pemasukan barang antar TPB', duty: 'ditangguhkan', sourceDoc: 'po' }),
  bc('40', 'BC 4.0', { title: 'Pemasukan Barang Asal TLDDP', direction: 'in', partnerKind: 'supplier', ceisaCode: '40', slug: 'bc-4-0', defaultOffice: '050900', approvalCode: 'SPPB', approvalMessage: 'Persetujuan pemasukan barang asal tempat lain dalam daerah pabean', duty: 'tidak_dipungut', sourceDoc: 'po' }),
  bc('25', 'BC 2.5', { title: 'Pengeluaran Barang dari TPB ke TLDDP', direction: 'out', partnerKind: 'customer', ceisaCode: '25', slug: 'bc-2-5', defaultOffice: '050900', approvalCode: 'SPPB', approvalMessage: 'SPPB TPB diterbitkan, pungutan telah dilunasi', duty: 'dibayar', sourceDoc: 'invoice' }),
  bc('261', 'BC 2.6.1', { title: 'Pengeluaran Sementara dengan Jaminan', direction: 'out', partnerKind: 'subkontraktor', ceisaCode: '261', slug: 'bc-2-6-1', defaultOffice: '050900', approvalCode: 'SPPJ', approvalMessage: 'Surat Persetujuan Pengeluaran dengan Jaminan diterbitkan', duty: 'ditangguhkan', sourceDoc: 'invoice', requiresGuarantee: true }),
  bc('27out', 'BC 2.7 Keluar', { title: 'Pengeluaran Barang ke TPB Lain', direction: 'out', partnerKind: 'customer', ceisaCode: '27', slug: 'bc-2-7-keluar', defaultOffice: '050900', approvalCode: 'SPPB', approvalMessage: 'Persetujuan pengeluaran barang antar TPB', duty: 'ditangguhkan', sourceDoc: 'invoice' }),
  bc('30', 'BC 3.0', { title: 'Pemberitahuan Ekspor Barang (PEB)', direction: 'out', partnerKind: 'customer', ceisaCode: '30', slug: 'bc-3-0', international: true, defaultOffice: '040300', approvalCode: 'NPE', approvalMessage: 'Nota Pelayanan Ekspor (NPE) diterbitkan', duty: 'tidak_dipungut', sourceDoc: 'invoice' }),
  bc('41', 'BC 4.1', { title: 'Pengeluaran Kembali Barang Asal TLDDP', direction: 'out', partnerKind: 'customer', ceisaCode: '41', slug: 'bc-4-1', defaultOffice: '050900', approvalCode: 'SPPB', approvalMessage: 'Persetujuan pengeluaran kembali barang asal TLDDP', duty: 'tidak_dipungut', sourceDoc: 'invoice' }),
]);

export const MASTER_REFS: RefRow[] = [
  ...registry,
  ...jenisBc,
  ...list('jenis_sumber', [
    ['po', 'Purchase Order', { slug: 'po', partnerKind: 'supplier', documentType: 'PO', description: 'Pesanan pembelian bahan baku sebagai dasar dokumen pemasukan.' }],
    ['invoice', 'Commercial Invoice', { slug: 'invoice', partnerKind: 'customer', documentType: 'INV', description: 'Invoice penjualan sebagai dasar dokumen pengeluaran.' }],
  ]),
  // The document lifecycle is these flags; the code never refers to a status by name.
  ...list('status_dokumen', [
    ['draft', 'Draft', { tone: 'gray', initial: true, editable: true }],
    ['terkirim', 'Terkirim', { tone: 'blue', inFlight: true }],
    ['diterima', 'Diterima CEISA', { tone: 'amber', inFlight: true }],
    ['tervalidasi', 'Tervalidasi', { tone: 'violet', inFlight: true, registered: true }],
    ['disetujui', 'Disetujui', { tone: 'green', registered: true, approved: true }],
    ['ditolak', 'Ditolak', { tone: 'red', editable: true, rejected: true }],
  ]),
  ...list('arah_dokumen', [
    ['in', 'Dokumen Pemasukan', { sign: 1, partyLabel: 'Pengirim', shortLabel: 'masuk', tone: 'teal', countryField: 'negaraAsal', countryLabel: 'Negara Asal' }],
    ['out', 'Dokumen Pengeluaran', { sign: -1, partyLabel: 'Penerima', shortLabel: 'keluar', tone: 'amber', countryField: 'negaraTujuan', countryLabel: 'Negara Tujuan' }],
  ]),
  ...list('perlakuan_pungutan', [
    ['ditangguhkan', 'Ditangguhkan', { charged: true }], ['dibayar', 'Dibayar', { charged: true }], ['tidak_dipungut', 'Tidak dipungut', { charged: false }],
  ]),
  ...list('sumber_mutasi', [
    ['dokumen_bc', 'Dokumen BC', { fromDocument: true }], ['produksi', 'Produksi'], ['penyesuaian', 'Penyesuaian / Stock Opname', { adjustment: true }],
  ]),
  // Approval stage code/message come from each BC type (SPPB, NPE, SPPJ…).
  ...list('tahap_ceisa', [
    ['100', 'Dokumen berhasil dikirim ke CEISA', { status: 'terkirim', afterSec: 0 }],
    ['110', 'Dokumen diterima, menunggu validasi', { status: 'diterima', afterSec: 5 }],
    ['200', 'Validasi berhasil, nomor pendaftaran diberikan', { status: 'tervalidasi', afterSec: 12 }],
    ['900', 'Penolakan', { status: 'ditolak', afterSec: 12 }],
    ['APPROVAL', 'Persetujuan', { status: 'disetujui', afterSec: 25 }],
  ]),
  ...list('kategori_barang', [
    ['bahan_baku', 'Bahan Baku & Penolong', { report: 'Laporan Mutasi Bahan Baku dan Bahan Penolong', slug: 'bahan-baku' }],
    ['barang_jadi', 'Barang Jadi', { report: 'Laporan Mutasi Barang Jadi', slug: 'barang-jadi' }],
    ['mesin', 'Mesin & Peralatan', { report: 'Laporan Mutasi Mesin dan Peralatan', slug: 'mesin' }],
    ['scrap', 'Sisa & Scrap', { report: 'Laporan Mutasi Barang Reject dan Scrap', slug: 'scrap' }],
  ]),
  ...list('jenis_mitra', [['supplier', 'Pemasok'], ['customer', 'Pembeli'], ['subkontraktor', 'Subkontraktor'], ['ppjk', 'PPJK'], ['pengangkut', 'Pengangkut']]),
  ...list('role', [
    ['admin', 'Administrator', { tone: 'violet', description: 'Akses penuh termasuk pengguna, referensi, dan audit log', canWrite: true, isAdmin: true }],
    ['operator', 'Operator', { tone: 'teal', description: 'Membuat dan mengirim dokumen BC', canWrite: true }],
    ['viewer', 'Viewer', { tone: 'gray', description: 'Hanya membaca (auditor)' }],
  ]),
  ...list('negara', [['ID', 'Indonesia'], ['CN', 'China'], ['JP', 'Jepang'], ['VN', 'Vietnam'], ['US', 'Amerika Serikat'], ['DE', 'Jerman'], ['KR', 'Korea Selatan'], ['SG', 'Singapura'], ['TH', 'Thailand'], ['AU', 'Australia']]),
  ...list('pelabuhan', [['IDTPP', 'Tanjung Priok, Jakarta'], ['IDTPE', 'Tanjung Perak, Surabaya'], ['IDSRG', 'Tanjung Emas, Semarang'], ['CNSHA', 'Shanghai'], ['CNNGB', 'Ningbo'], ['JPTYO', 'Tokyo'], ['VNSGN', 'Ho Chi Minh'], ['SGSIN', 'Singapore'], ['USLAX', 'Los Angeles'], ['DEHAM', 'Hamburg'], ['AUSYD', 'Sydney']]),
  ...list('satuan', [['PCE', 'Piece'], ['KGM', 'Kilogram'], ['MTR', 'Meter'], ['YRD', 'Yard'], ['ROL', 'Roll'], ['SET', 'Set'], ['UNT', 'Unit'], ['CON', 'Cone']]),
  ...list('kemasan', [['CT', 'Carton'], ['RO', 'Roll'], ['PX', 'Pallet'], ['BG', 'Bag'], ['BX', 'Box'], ['CS', 'Case']]),
  ...list('valuta', [['USD', 'US Dollar', { kurs: 16250 }], ['JPY', 'Yen Jepang', { kurs: 108.4 }], ['CNY', 'Yuan China', { kurs: 2245 }], ['EUR', 'Euro', { kurs: 17620 }], ['IDR', 'Rupiah', { kurs: 1 }]]),
  ...list('kantor', [['040300', 'KPU Bea dan Cukai Tipe A Tanjung Priok'], ['050500', 'KPPBC TMP A Bekasi'], ['050900', 'KPPBC TMP Cikarang'], ['070100', 'KPU Bea dan Cukai Tipe B Batam']]),
  ...list('incoterm', [['EXW', 'Ex Works'], ['FOB', 'Free On Board'], ['CFR', 'Cost and Freight'], ['CIF', 'Cost, Insurance and Freight'], ['DAP', 'Delivered At Place']]),
  ...list('jenis_dokumen', [['INV', 'Invoice'], ['PL', 'Packing List'], ['BL', 'Bill of Lading'], ['AWB', 'Airway Bill'], ['COO', 'Certificate of Origin (Form E)'], ['FP', 'Faktur Pajak'], ['SJ', 'Surat Jalan'], ['KTR', 'Kontrak Subkontrak'], ['BKG', 'Booking Confirmation'], ['PO', 'Purchase Order']]),
  ...list('cara_angkut', [['1', 'Laut', { usesPort: true, usesContainer: true }], ['4', 'Udara', { usesPort: true }], ['3', 'Darat', { usesPlate: true }]]),
  ...list('ukuran_kontainer', [['20', "20'"], ['40', "40'"], ['40HC', "40' High Cube"]]),
  ...list('tipe_kontainer', [['FCL', 'Full Container Load'], ['LCL', 'Less than Container Load']]),
  ...list('jenis_jaminan', [['CB', 'Customs Bond'], ['BG', 'Bank Garansi'], ['TN', 'Tunai']]),
  ...list('hs', [
    ['5208.52.00', 'Kain tenun kapas, dicetak, berat ≤ 200 g/m²', { bm: 10, ppn: 11, pph: 2.5 }],
    ['5407.61.90', 'Kain tenun filamen poliester tidak bertekstur', { bm: 10, ppn: 11, pph: 2.5 }],
    ['5204.11.10', 'Benang jahit dari kapas, belum disiapkan untuk penjualan eceran', { bm: 5, ppn: 11, pph: 2.5 }],
    ['9606.21.00', 'Kancing dari plastik, tidak ditutup bahan tekstil', { bm: 15, ppn: 11, pph: 2.5 }],
    ['4821.10.90', 'Label kertas, dicetak', { bm: 5, ppn: 11, pph: 2.5 }],
    ['3923.21.99', 'Kantong plastik dari polimer etilena', { bm: 10, ppn: 11, pph: 2.5 }],
    ['5807.10.00', 'Label tenun dari bahan tekstil', { bm: 10, ppn: 11, pph: 2.5 }],
    ['6205.20.90', 'Kemeja pria dari kapas, selain batik', { bm: 25, ppn: 11, pph: 2.5 }],
    ['6204.62.00', 'Celana panjang wanita dari kapas', { bm: 25, ppn: 11, pph: 2.5 }],
    ['6109.10.10', 'Kaos T-shirt dari kapas, rajutan', { bm: 25, ppn: 11, pph: 2.5 }],
    ['8452.21.00', 'Mesin jahit industri, unit otomatis', { bm: 0, ppn: 11, pph: 2.5 }],
    ['6310.10.90', 'Potongan kain sisa produksi (majun)', { bm: 5, ppn: 11, pph: 2.5 }],
  ]),
];

export const DEMO_PASSWORD = 'demo1234';

export const MASTER_SETTINGS = {
  company: {
    name: 'PT Arunika Tekstil Nusantara',
    npwp: '01.234.567.8-412.000',
    izinKb: '120345',
    companyId: '120345',
    address: 'Kawasan Industri Jababeka II Blok F-12, Cikarang, Bekasi',
    city: 'Cikarang',
    timezone: 'Asia/Jakarta',
    signatory: { name: 'Rina Kusuma', title: 'Manajer Ekspor-Impor' },
  },
  app: {
    name: 'Arunika IT Inventory',
    subtitle: 'Kawasan Berikat',
    tagline: 'IT Inventory Kawasan Berikat yang terhubung ke CEISA 4.0',
    description: 'Kelola dokumen BC 2.3 hingga 4.1, pantau respon Bea Cukai secara real-time, dan hasilkan laporan mutasi barang sesuai ketentuan Kawasan Berikat.',
    features: ['9 jenis dokumen BC', 'Respon CEISA bertahap', 'Laporan mutasi otomatis', 'Role & audit log'],
    environmentLabel: 'Mode Demo · CEISA Sandbox (mock)',
    footnote: 'Prototype portofolio. Data perusahaan & transaksi bersifat fiktif.',
    printHeader: 'KEMENTERIAN KEUANGAN REPUBLIK INDONESIA · DIREKTORAT JENDERAL BEA DAN CUKAI',
    printFootnote: 'Dicetak dari Arunika IT Inventory (prototype · respon CEISA disimulasikan).',
    demo: {
      password: DEMO_PASSWORD,
      accounts: [
        { email: 'admin@arunika.demo', label: 'Admin', description: 'Akses penuh + pengguna & audit log' },
        { email: 'operator@arunika.demo', label: 'Operator', description: 'Buat & kirim dokumen BC' },
        { email: 'viewer@arunika.demo', label: 'Viewer', description: 'Read-only (auditor)' },
      ],
    },
  },
};
