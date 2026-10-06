/* =========================================================
   Lost & Found Sekolah - script.js
   CRUD sederhana + localStorage
   ========================================================= */

(function () {
  "use strict";

  /* ---------- Konstanta ---------- */
  const STORAGE_KEY = "lostfound_laporan_sekolah_v1";

  const CATEGORIES = [
    "Elektronik",
    "Alat Tulis",
    "Pakaian",
    "Aksesoris",
    "Buku",
    "Dompet",
    "Kunci",
    "Lainnya",
  ];

  const STATUS = {
    belum: { label: "Belum ditemukan", cls: "st-belum" },
    ditemukan: { label: "Ditemukan", cls: "st-ditemukan" },
    diambil: { label: "Sudah diambil", cls: "st-diambil" },
  };

  const MONTHS = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];

  /* ---------- State ---------- */
  let reports = [];
  let editingId = null;
  let pendingDeleteId = null;
  let currentPhoto = null; // dataURL hasil kompresi

  /* ---------- Elemen DOM ---------- */
  const el = (id) => document.getElementById(id);
  const grid = el("itemsGrid");
  const emptyState = el("emptyState");
  const resultInfo = el("resultInfo");
  const searchInput = el("searchInput");
  const filterType = el("filterType");
  const filterCategory = el("filterCategory");
  const filterStatus = el("filterStatus");
  const form = el("reportForm");
  const formModal = el("formModal");
  const detailModal = el("detailModal");
  const confirmModal = el("confirmModal");
  const toastWrap = el("toastWrap");

  /* =========================================================
     UTIL
     ========================================================= */

  function esc(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function uid() {
    return (
      Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8)
    );
  }

  function formatDate(iso) {
    if (!iso) return "-";
    const parts = String(iso).split("-");
    if (parts.length !== 3) return iso;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (isNaN(y) || isNaN(m) || isNaN(d) || !MONTHS[m]) return iso;
    return `${d} ${MONTHS[m]} ${y}`;
  }

  function todayISO() {
    const n = new Date();
    const pad = (v) => String(v).padStart(2, "0");
    return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
  }

  function showToast(message, type = "success") {
    const icons = {
      success: "fa-circle-check",
      error: "fa-circle-exclamation",
      info: "fa-circle-info",
    };
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><span>${esc(message)}</span>`;
    toastWrap.appendChild(toast);
    setTimeout(() => {
      toast.classList.add("out");
      setTimeout(() => toast.remove(), 320);
    }, 3000);
  }

  /* =========================================================
     FOTO: placeholder SVG + kompresi gambar
     ========================================================= */

  function placeholderPhoto(title, category) {
    const palettes = {
      Elektronik: ["#2563EB", "#60A5FA"],
      "Alat Tulis": ["#0EA5E9", "#38BDF8"],
      Pakaian: ["#8B5CF6", "#C4B5FD"],
      Aksesoris: ["#F59E0B", "#FCD34D"],
      Buku: ["#22C55E", "#86EFAC"],
      Dompet: ["#EF4444", "#FCA5A5"],
      Kunci: ["#64748B", "#CBD5E1"],
      Lainnya: ["#2563EB", "#38BDF8"],
    };
    const pair = palettes[category] || palettes["Lainnya"];
    const initial = (title || "B").trim().charAt(0).toUpperCase();
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0%" stop-color="${pair[0]}"/><stop offset="100%" stop-color="${pair[1]}"/>` +
      `</linearGradient></defs>` +
      `<rect width="800" height="500" fill="url(#g)"/>` +
      `<circle cx="400" cy="230" r="115" fill="rgba(255,255,255,0.18)"/>` +
      `<text x="400" y="272" font-family="Inter, Arial, sans-serif" font-size="120" font-weight="700" fill="#ffffff" text-anchor="middle">${esc(initial)}</text>` +
      `<text x="400" y="420" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="600" fill="rgba(255,255,255,0.92)" text-anchor="middle">${esc(title || "Barang")}</text>` +
      `</svg>`;
    return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
  }

  function photoOf(item) {
    return item.photo || placeholderPhoto(item.name, item.category);
  }

  /** Kompres & resize gambar sebelum disimpan ke localStorage */
  function compressImage(file) {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith("image/")) {
        reject(new Error("File harus berupa gambar."));
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Gagal membaca file."));
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = () => reject(new Error("Gambar tidak valid."));
        img.onload = () => {
          const MAX = 900;
          let { width, height } = img;
          if (width > MAX || height > MAX) {
            if (width >= height) {
              height = Math.round((height * MAX) / width);
              width = MAX;
            } else {
              width = Math.round((width * MAX) / height);
              height = MAX;
            }
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.7));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* =========================================================
     DATA: localStorage + data contoh
     ========================================================= */

  function seedData() {
    return [
      {
        id: uid(),
        type: "hilang",
        name: "Dompet hitam",
        category: "Dompet",
        description:
          "Dompet kulit hitam berisi KTP, kartu pelajar, dan uang saku. Hilang setelah jam istirahat kedua.",
        location: "Kantin lantai 1",
        date: "2026-09-28",
        reporter: "Rani Ayu (XI TKJ 1)",
        contact: "0812-3456-7890",
        status: "belum",
        photo: null,
        createdAt: "2026-09-28T08:15:00.000Z",
      },
      {
        id: uid(),
        type: "ditemukan",
        name: "Tumbler biru",
        category: "Lainnya",
        description:
          "Tumbler biru merek Universal, ada stiker bintang di bagian bawah. Ditemukan di dekat lab komputer.",
        location: "Lab komputer lantai 2",
        date: "2026-09-30",
        reporter: "Bagas Pratama (XII RPL 2)",
        contact: "0857-9911-2233",
        status: "ditemukan",
        photo: null,
        createdAt: "2026-09-30T10:05:00.000Z",
      },
      {
        id: uid(),
        type: "hilang",
        name: "Kunci motor",
        category: "Kunci",
        description:
          "Kunci motor Honda Beat dengan gantungan kunci boneka warna kuning. Tertinggal di rak parkir.",
        location: "Parkiran samping aula",
        date: "2026-10-01",
        reporter: "Andi Saputra (X TKJ 1)",
        contact: "0813-7788-4455",
        status: "belum",
        photo: null,
        createdAt: "2026-10-01T07:40:00.000Z",
      },
      {
        id: uid(),
        type: "ditemukan",
        name: "Jaket sekolah",
        category: "Pakaian",
        description:
          "Jaket almamater ukuran M warna navy dengan nama bordir 'Dimas' di dada kiri. Tertinggal di lapangan.",
        location: "Lapangan upacara",
        date: "2026-10-02",
        reporter: "Siti Rahma (XI AKL 1)",
        contact: "0821-6677-8899",
        status: "diambil",
        photo: null,
        createdAt: "2026-10-02T13:20:00.000Z",
      },
      {
        id: uid(),
        type: "hilang",
        name: "Buku matematika",
        category: "Buku",
        description:
          "Buku matematika kelas X jilid 1, halaman depan ditulis nama pemilik. Hilang setelah kegiatan belajar.",
        location: "Ruang kelas X-4",
        date: "2026-10-03",
        reporter: "Fajar Nugroho (X-4)",
        contact: "0895-1234-5678",
        status: "ditemukan",
        photo: null,
        createdAt: "2026-10-03T09:00:00.000Z",
      },
    ];
  }

  function loadReports() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const seed = seedData();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
        return seed;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error("Format data tidak valid");
      return parsed;
    } catch (err) {
      console.warn("Gagal memuat data, pakai data contoh.", err);
      return seedData();
    }
  }

  function saveReports() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
      return true;
    } catch (err) {
      console.error(err);
      showToast(
        "Penyimpanan penuh! Coba hapus laporan lain atau gunakan foto lebih kecil.",
        "error",
      );
      return false;
    }
  }

  /* =========================================================
     FILTER + RENDER
     ========================================================= */

  function getFiltered() {
    const q = searchInput.value.trim().toLowerCase();
    const t = filterType.value;
    const c = filterCategory.value;
    const s = filterStatus.value;

    return reports.filter((r) => {
      const matchQ =
        !q ||
        r.name.toLowerCase().includes(q) ||
        (r.description || "").toLowerCase().includes(q) ||
        (r.location || "").toLowerCase().includes(q);
      const matchT = t === "semua" || r.type === t;
      const matchC = c === "semua" || r.category === c;
      const matchS = s === "semua" || r.status === s;
      return matchQ && matchT && matchC && matchS;
    });
  }

  function renderStats() {
    const total = reports.length;
    const lost = reports.filter((r) => r.type === "hilang").length;
    const found = reports.filter((r) => r.type === "ditemukan").length;
    el("statTotal").textContent = total;
    el("statLost").textContent = lost;
    el("statFound").textContent = found;
  }

  function typeBadge(type) {
    return type === "hilang"
      ? '<span class="type-badge hilang"><i class="fa-solid fa-circle-question"></i> Hilang</span>'
      : '<span class="type-badge ditemukan"><i class="fa-solid fa-hand-sparkles"></i> Ditemukan</span>';
  }

  function statusBadge(status) {
    const st = STATUS[status] || STATUS.belum;
    return `<span class="status-badge ${st.cls}">${st.label}</span>`;
  }

  function cardHTML(r) {
    return `
      <article class="item-card" data-id="${esc(r.id)}">
        <div class="item-media">
          <img src="${esc(photoOf(r))}" alt="Foto ${esc(r.name)}" loading="lazy">
          ${typeBadge(r.type)}
        </div>
        <div class="item-body">
          <span class="cat-chip"><i class="fa-solid fa-tag"></i> ${esc(r.category)}</span>
          <h3>${esc(r.name)}</h3>
          <ul class="item-meta">
            <li><i class="fa-solid fa-location-dot"></i> ${esc(r.location)}</li>
            <li><i class="fa-regular fa-calendar"></i> ${esc(formatDate(r.date))}</li>
          </ul>
          <div class="item-foot">
            ${statusBadge(r.status)}
            <div class="item-actions">
              <button class="btn btn-primary" data-action="detail" data-id="${esc(r.id)}">
                <i class="fa-regular fa-eye"></i> Lihat Detail
              </button>
              <button class="btn btn-ghost act-edit" data-action="edit" data-id="${esc(r.id)}" title="Edit laporan">
                <i class="fa-solid fa-pen"></i>
              </button>
              <button class="btn btn-ghost act-delete" data-action="delete" data-id="${esc(r.id)}" title="Hapus laporan">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </div>
        </div>
      </article>`;
  }

  function renderCards() {
    const list = getFiltered();
    grid.innerHTML = list.map(cardHTML).join("");
    emptyState.classList.toggle("hidden", list.length > 0);
    grid.classList.toggle("hidden", list.length === 0);

    const total = reports.length;
    if (list.length === total) {
      resultInfo.textContent = `Menampilkan ${total} laporan`;
    } else {
      resultInfo.textContent = `Menampilkan ${list.length} dari ${total} laporan`;
    }
  }

  function renderAll() {
    renderStats();
    renderCards();
  }

  /* =========================================================
     MODAL
     ========================================================= */

  function openModal(node) {
    node.classList.add("open");
    node.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeModal(node) {
    node.classList.remove("open");
    node.setAttribute("aria-hidden", "true");
    const anyOpen = document.querySelector(".modal-overlay.open");
    if (!anyOpen) document.body.style.overflow = "";
  }

  function closeAllModals() {
    document.querySelectorAll(".modal-overlay.open").forEach(closeModal);
  }

  /* =========================================================
     FORM (TAMBAH / EDIT)
     ========================================================= */

  function setType(type) {
    el("fType").value = type;
    document.querySelectorAll("#typeSegment button").forEach((b) => {
      b.classList.toggle("active", b.dataset.type === type);
    });
  }

  function clearErrors() {
    form
      .querySelectorAll(".invalid")
      .forEach((n) => n.classList.remove("invalid"));
    form.querySelectorAll(".field-error").forEach((n) => {
      n.textContent = "";
      n.classList.remove("show");
    });
  }

  function setError(fieldId, message) {
    const input = el(fieldId);
    const box = form.querySelector(`[data-error-for="${fieldId}"]`);
    if (input) input.classList.add("invalid");
    if (box) {
      box.textContent = message;
      box.classList.add("show");
    }
  }

  function validate() {
    clearErrors();
    let ok = true;

    const checks = [
      ["fName", "Nama barang wajib diisi."],
      ["fCategory", "Kategori wajib dipilih."],
      ["fDesc", "Deskripsi barang wajib diisi."],
      ["fLocation", "Lokasi wajib diisi."],
      ["fDate", "Tanggal wajib diisi."],
      ["fReporter", "Nama pelapor wajib diisi."],
      ["fContact", "Kontak pelapor wajib diisi."],
    ];

    checks.forEach(([id, msg]) => {
      const node = el(id);
      if (!node || !node.value.trim()) {
        setError(id, msg);
        ok = false;
      }
    });

    const name = el("fName").value.trim();
    if (name && name.length < 2) {
      setError("fName", "Nama barang minimal 2 karakter.");
      ok = false;
    }
    const contact = el("fContact").value.trim();
    if (contact && contact.length < 5) {
      setError("fContact", "Kontak minimal 5 karakter.");
      ok = false;
    }

    if (!ok) {
      const first = form.querySelector(".invalid");
      if (first) first.focus();
      showToast("Lengkapi field yang masih kosong.", "error");
    }
    return ok;
  }

  function resetForm() {
    form.reset();
    editingId = null;
    currentPhoto = null;
    clearErrors();
    setType("hilang");
    el("fStatus").value = "belum";
    el("fDate").value = todayISO();
    el("photoPreview").classList.add("hidden");
    el("uploadBox").classList.remove("hidden");
    el("fPhoto").value = "";
  }

  function openForm(type, id) {
    resetForm();
    if (type) setType(type);

    if (id) {
      const item = reports.find((r) => r.id === id);
      if (!item) return;
      editingId = item.id;
      el("formModalTitle").innerHTML =
        '<i class="fa-solid fa-pen"></i> Edit Laporan';
      el("saveBtn").innerHTML =
        '<i class="fa-solid fa-floppy-disk"></i> Perbarui Laporan';
      setType(item.type);
      el("fName").value = item.name;
      el("fCategory").value = item.category;
      el("fDesc").value = item.description || "";
      el("fLocation").value = item.location || "";
      el("fDate").value = item.date || todayISO();
      el("fReporter").value = item.reporter || "";
      el("fContact").value = item.contact || "";
      el("fStatus").value = item.status || "belum";
      if (item.photo) {
        currentPhoto = item.photo;
        el("photoPreviewImg").src = item.photo;
        el("photoPreview").classList.remove("hidden");
        el("uploadBox").classList.add("hidden");
      }
    } else {
      el("formModalTitle").innerHTML =
        '<i class="fa-solid fa-plus"></i> Tambah Laporan';
      el("saveBtn").innerHTML =
        '<i class="fa-solid fa-floppy-disk"></i> Simpan Laporan';
    }

    openModal(formModal);
    setTimeout(() => el("fName").focus(), 220);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;

    const data = {
      type: el("fType").value === "ditemukan" ? "ditemukan" : "hilang",
      name: el("fName").value.trim(),
      category: el("fCategory").value,
      description: el("fDesc").value.trim(),
      location: el("fLocation").value.trim(),
      date: el("fDate").value,
      reporter: el("fReporter").value.trim(),
      contact: el("fContact").value.trim(),
      status: el("fStatus").value,
      photo: currentPhoto,
    };

    const saveBtn = el("saveBtn");
    const originalHTML = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML =
      '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan…';

    setTimeout(() => {
      if (editingId) {
        // EDIT: perbarui data lama, jangan buat data baru
        const idx = reports.findIndex((r) => r.id === editingId);
        if (idx !== -1) {
          reports[idx] = Object.assign({}, reports[idx], data, {
            updatedAt: new Date().toISOString(),
          });
        }
      } else {
        // TAMBAH: data baru
        reports.unshift(
          Object.assign(
            { id: uid(), createdAt: new Date().toISOString() },
            data,
          ),
        );
      }

      const saved = saveReports();
      saveBtn.disabled = false;
      saveBtn.innerHTML = originalHTML;

      if (!saved) return;

      renderAll();
      closeModal(formModal);
      showToast(
        editingId
          ? "Laporan berhasil diperbarui."
          : "Laporan berhasil ditambahkan.",
      );
      resetForm();
    }, 350);
  }

  /* =========================================================
     DETAIL
     ========================================================= */

  function openDetail(id) {
    const r = reports.find((x) => x.id === id);
    if (!r) return;

    el("detailBody").innerHTML = `
      <img class="detail-photo" src="${esc(photoOf(r))}" alt="Foto ${esc(r.name)}">
      <div class="detail-top">
        <h4>${esc(r.name)}</h4>
        <span class="badge-pill ${r.type === "hilang" ? "hilang" : "ditemukan"}">
          ${
            r.type === "hilang"
              ? '<i class="fa-solid fa-circle-question"></i> Hilang'
              : '<i class="fa-solid fa-hand-sparkles"></i> Ditemukan'
          }
        </span>
      </div>
      <div class="detail-desc">${esc(r.description || "Tidak ada deskripsi.")}</div>
      <div class="detail-grid">
        <div class="detail-item">
          <span><i class="fa-solid fa-tag"></i> Kategori</span>
          <strong>${esc(r.category)}</strong>
        </div>
        <div class="detail-item">
          <span><i class="fa-regular fa-calendar"></i> Tanggal</span>
          <strong>${esc(formatDate(r.date))}</strong>
        </div>
        <div class="detail-item full">
          <span><i class="fa-solid fa-location-dot"></i> Lokasi</span>
          <strong>${esc(r.location)}</strong>
        </div>
        <div class="detail-item">
          <span><i class="fa-solid fa-user"></i> Nama pelapor</span>
          <strong>${esc(r.reporter)}</strong>
        </div>
        <div class="detail-item">
          <span><i class="fa-solid fa-phone"></i> Kontak</span>
          <strong>${esc(r.contact)}</strong>
        </div>
        <div class="detail-item full">
          <span><i class="fa-solid fa-flag"></i> Status</span>
          <strong>${statusBadge(r.status)}</strong>
        </div>
      </div>`;

    el("detailEditBtn").dataset.id = r.id;
    openModal(detailModal);
  }

  /* =========================================================
     HAPUS
     ========================================================= */

  function askDelete(id) {
    pendingDeleteId = id;
    openModal(confirmModal);
  }

  function doDelete() {
    if (!pendingDeleteId) return;
    const before = reports.length;
    reports = reports.filter((r) => r.id !== pendingDeleteId);
    if (reports.length === before) {
      showToast("Data tidak ditemukan.", "error");
      return;
    }
    saveReports();
    renderAll();
    closeModal(confirmModal);
    pendingDeleteId = null;
    showToast("Laporan berhasil dihapus.", "info");
  }

  /* =========================================================
     EVENT LISTENERS
     ========================================================= */

  function bindEvents() {
    // Tombol buka form (hero, navbar, empty state, section head)
    document.querySelectorAll("[data-open-form]").forEach((btn) => {
      btn.addEventListener("click", () => {
        openForm(btn.dataset.openForm || "hilang", null);
        document.getElementById("navMenu").classList.remove("open");
      });
    });

    // Tutup modal
    document.querySelectorAll("[data-close]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = el(btn.dataset.close);
        if (target) closeModal(target);
      });
    });

    // Klik area luar modal
    document.querySelectorAll(".modal-overlay").forEach((overlay) => {
      overlay.addEventListener("mousedown", (e) => {
        if (e.target === overlay) closeModal(overlay);
      });
    });

    // Tombol ESC
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const open = document.querySelector(".modal-overlay.open");
        if (open) closeModal(open);
      }
    });

    // Jenis laporan (segmented)
    document.querySelectorAll("#typeSegment button").forEach((btn) => {
      btn.addEventListener("click", () => setType(btn.dataset.type));
    });

    // Submit form
    form.addEventListener("submit", handleSubmit);

    // Upload foto
    el("fPhoto").addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        currentPhoto = await compressImage(file);
        el("photoPreviewImg").src = currentPhoto;
        el("photoPreview").classList.remove("hidden");
        el("uploadBox").classList.add("hidden");
        showToast("Foto berhasil dimuat & dikompres.", "info");
      } catch (err) {
        showToast(err.message || "Gagal memproses gambar.", "error");
        e.target.value = "";
      }
    });

    // Hapus foto
    el("removePhoto").addEventListener("click", () => {
      currentPhoto = null;
      el("fPhoto").value = "";
      el("photoPreview").classList.add("hidden");
      el("uploadBox").classList.remove("hidden");
    });

    // Aksi pada card (delegasi)
    grid.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const id = btn.dataset.id;
      if (btn.dataset.action === "detail") openDetail(id);
      else if (btn.dataset.action === "edit") openForm(null, id);
      else if (btn.dataset.action === "delete") askDelete(id);
    });

    // Edit dari modal detail
    el("detailEditBtn").addEventListener("click", () => {
      const id = el("detailEditBtn").dataset.id;
      closeModal(detailModal);
      openForm(null, id);
    });

    // Konfirmasi hapus
    el("confirmDeleteBtn").addEventListener("click", doDelete);

    // Pencarian & filter realtime
    [searchInput, filterType, filterCategory, filterStatus].forEach((node) => {
      node.addEventListener("input", renderCards);
      node.addEventListener("change", renderCards);
    });

    // Reset filter
    el("resetFilter").addEventListener("click", () => {
      searchInput.value = "";
      filterType.value = "semua";
      filterCategory.value = "semua";
      filterStatus.value = "semua";
      renderCards();
      showToast("Filter sudah direset.", "info");
    });

    // Hamburger
    el("navToggle").addEventListener("click", () => {
      const menu = el("navMenu");
      const open = menu.classList.toggle("open");
      el("navToggle").setAttribute("aria-expanded", String(open));
    });

    // Tutup menu saat klik link
    document.querySelectorAll(".nav-link").forEach((link) => {
      link.addEventListener("click", () => {
        el("navMenu").classList.remove("open");
        document
          .querySelectorAll(".nav-link")
          .forEach((l) => l.classList.remove("active"));
        link.classList.add("active");
      });
    });

    // Validasi real-time saat mengetik
    form.querySelectorAll("input, select, textarea").forEach((node) => {
      node.addEventListener("input", () => {
        node.classList.remove("invalid");
        const box = form.querySelector(`[data-error-for="${node.id}"]`);
        if (box) {
          box.textContent = "";
          box.classList.remove("show");
        }
      });
    });
  }

  /* =========================================================
     INIT
     ========================================================= */

  function init() {
    // Isi filter kategori
    CATEGORIES.forEach((c) => {
      const o1 = document.createElement("option");
      o1.value = c;
      o1.textContent = c;
      filterCategory.appendChild(o1);

      const o2 = document.createElement("option");
      o2.value = c;
      o2.textContent = c;
      el("fCategory").appendChild(o2);
    });

    reports = loadReports();
    bindEvents();
    renderAll();

    // Sembunyikan loading
    setTimeout(() => {
      el("pageLoader").classList.add("done");
    }, 450);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
