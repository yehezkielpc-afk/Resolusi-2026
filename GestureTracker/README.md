# Gesture Tracker 3D

Platform web: gerakan tangan di depan webcam membentuk dan mengendalikan bangun ruang
atau huruf 3D (Three.js untuk rendering, MediaPipe HandLandmarker untuk deteksi tangan).
Tidak butuh build step — hanya file statis.

## Menjalankan

Browser memblokir `import` ES module dari `file://`, jadi jalankan lewat server lokal
(server bawaan Node, tanpa dependency apa pun):

```bash
node serve.js
```

Lalu buka `http://localhost:5173` di Chrome/Edge (perlu kamera + koneksi internet,
karena Three.js dan MediaPipe dimuat dari CDN). Izinkan akses kamera saat diminta.

## Gestur

**Satu tangan**
- Jempol ke atas → objek berikutnya (A→B→C)
- Jempol ke bawah → objek sebelumnya (Z→Y→X)
- Telunjuk + jari tengah menyilang → ganti mode (bangun ruang ⇄ huruf)
- Telunjuk + jari tengah terbuka, tidak menyilang → ganti warna
- Mengepal → geser objek yang sedang dikendalikan (belum permanen)
- Semua jari terbuka → rotasi objek yang sedang dikendalikan

**Dua tangan**
- Ibu jari + telunjuk terbuka (jari lain menekuk) di kedua tangan, saling menjauh → perbesar
- Ibu jari + telunjuk terbuka di kedua tangan, saling mendekat → perkecil
- Kedua tangan terbuka, tidak menyilang → tempatkan objek jadi permanen
- Kedua tangan terbuka, menyilang → hapus objek permanen terakhir

## Kontrol keyboard (untuk uji tanpa kamera / kalibrasi)

`WASD` geser · `Q/E` rotasi Y · `R/F` rotasi X · `Z/X` skala · `↑/↓` ganti objek ·
`Tab` ganti mode · `C` ganti warna · `Space` tempatkan · `Backspace` hapus objek terakhir.

## Menyesuaikan sensitivitas

Semua ambang batas (hold frames, cooldown, sudut jari, kecepatan drag/rotasi/skala)
ada di satu tempat: `js/config.js`. Panel kamera kecil di pojok kiri bawah menampilkan
skeleton tangan + gestur yang terdeteksi per tangan — pakai ini untuk kalibrasi ulang
sesuai pencahayaan/kamera Anda.

## Struktur

- `index.html`, `style.css` — shell halaman + HUD
- `js/handTracker.js` — wrapper MediaPipe HandLandmarker + akses webcam
- `js/gestureEngine.js` — klasifikasi gestur dari landmark tangan
- `js/vec3.js` — helper vektor 3D (sudut, jarak, dll.)
- `js/sceneManager.js` — scene Three.js, objek terkendali vs. objek permanen
- `js/shapeDefs.js` — geometri bangun ruang
- `js/letterUtil.js` — geometri huruf 3D (font typeface.json)
- `js/hud.js` — overlay UI + gambar skeleton debug
- `js/main.js` — state machine yang menghubungkan semuanya
- `js/config.js` — semua nilai yang bisa disetel
- `serve.js` — server statis tanpa dependency
