# Prasasti - AI Documentation Assistant for IFS ERP

**Prasasti** adalah ekstensi VS Code yang dirancang khusus untuk Technical Consultant IFS ERP. Ekstensi ini mengotomatisasi proses dokumentasi kode legacy (PL/SQL) dengan menggunakan kekuatan **Google Gemini AI** dan **Git Forensic Analysis**.

Tidak perlu lagi menulis History Header atau Docstring secara manual. Prasasti membaca perubahan Git (`diff`), menganalisis dampaknya, dan menulis dokumentasi untuk Anda.

---

## 🚀 Key Features

### 🧠 1. Smart Fallback Strategy (Hybrid Engine)

Prasasti memiliki kecerdasan adaptif untuk menangani berbagai ukuran file:

-   **Strategy A: Full Rewrite (Untuk File Kecil/Sedang)**
    -   AI menulis ulang seluruh file, merapikan format, dan menambahkan dokumentasi lengkap.
    -   Menghasilkan kode yang sangat bersih dan konsisten.
-   **Strategy B: Surgical Patching (Untuk File Besar/Raksasa)**
    -   Jika file terlalu besar (menyebabkan limit `MAX_TOKENS`), sistem otomatis beralih ke mode _Surgical Patching_.
    -   AI hanya menganalisis history dan mengembalikan data ringkas (format TOML).
    -   Ekstensi menyuntikkan (_inject_) baris history baru ke header tanpa menyentuh logika kode asli. **100% Aman dari kode terpotong.**

### 🔍 2. Git Forensic Analysis

-   Menganalisis commit Git terbaru sejak terakhir kali file didokumentasikan.
-   Secara cerdas membedakan antara perubahan logika (kode) vs perubahan kosmetik (spasi/komentar).
-   Menghindari duplikasi history header.

### 🛡️ 3. Robust & Resilient

-   **Auto Retry:** Otomatis mencoba ulang jika terkena Rate Limit Google API (HTTP 429).
-   **Safety Bypass:** Dikonfigurasi untuk tidak memblokir kode SQL (perintah `DROP`, `GRANT`, `EXECUTE`) yang sering dianggap "berbahaya" oleh filter AI standar.
-   **Defensive Parsing:** Menangani respon AI yang tidak konsisten (Array vs Object) agar ekstensi tidak crash.

### ⚡ 4. Batch Processing

-   **Generate All:** Mendeteksi seluruh file di workspace yang dokumentasinya _outdated_ atau _missing header_, lalu memprosesnya satu per satu dengan progress bar visual.

---

## ⚙️ How It Works

1.  **Scan:** Ekstensi memindai workspace mencari file `.plsql`, `.plsvc`, atau `.views`.
2.  **Audit:** Membandingkan tanggal di Header File (`-- YYMMDD`) dengan tanggal commit terakhir di Git.
3.  **Generate:**
    -   Mengambil _diff_ dari commit-commit baru.
    -   Mengirim _prompt_ ke Google Gemini.
    -   Jika file besar, otomatis menggunakan mode hemat token (TOML/JSON).
4.  **Apply:**
    -   Jika `autoApply: true`, file langsung disimpan.
    -   Jika `autoApply: false`, membuka tampilan "Diff View" untuk review manual.

---

## 📦 Installation & Setup

1.  Install ekstensi di VS Code.
2.  Dapatkan **Google Gemini API Key** (Gratis via Google AI Studio).
3.  Buka **Settings** (`Ctrl+,`) -> Cari **Prasasti**.
4.  Masukkan API Key Anda di kolom `Prasasti > Ai: Api Key`.

---

## 🔧 Configuration

Berikut adalah pengaturan yang tersedia di `settings.json`:

| ID                               | Default                  | Deskripsi                                                                               |
| :------------------------------- | :----------------------- | :-------------------------------------------------------------------------------------- |
| `prasasti.ai.apiKey`             | `""`                     | **(Wajib)** Google Gemini API Key.                                                      |
| `prasasti.ai.model`              | `gemini-1.5-flash`       | Model AI yang digunakan (flash lebih cepat & murah).                                    |
| `prasasti.files.include`         | `**/*.{plsql,plsvc}`     | Glob pattern untuk file yang akan di-scan.                                              |
| `prasasti.files.gitSkipKeywords` | `["Docs Only", "Typos"]` | Daftar kata kunci commit message yang akan diabaikan (dianggap sudah didokumentasikan). |
| `prasasti.behavior.autoApply`    | `true`                   | `true`: Langsung timpa file. `false`: Buka Diff View.                                   |
| `prasasti.network.maxRetries`    | `3`                      | Jumlah percobaan ulang jika koneksi gagal/rate limit.                                   |

---

## 🎮 Commands

Buka **Command Palette** (`Ctrl+Shift+P`) dan ketik:

-   `Prasasti: Refresh List`: Memindai ulang workspace untuk mencari file yang outdated.
-   `Prasasti: Generate All Docs`: Memproses semua file yang bermasalah secara batch.
-   `Prasasti: Regenerate Single Doc`: (Klik kanan pada file di Sidebar Prasasti) Memproses satu file spesifik.

---

## ⚠️ Requirements

-   **Git** harus terinstall dan terdaftar di PATH system Anda.
-   Project harus berada dalam repositori Git.

---

## 📝 Release Notes

### 2.0.0

-   Initial release with Smart Fallback Strategy.
-   Support for TOML/JSON patching for large files.
-   Robust Error Handling & Retry Mechanism.
-   Batch Processing support.

---

**Enjoy coding, let AI handle the docs!** 🚀
