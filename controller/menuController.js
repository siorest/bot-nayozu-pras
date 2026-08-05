const { generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');
const MenuModel = require('../models/MenuModel');
const PREFIX = '.'; 

// Metadata menu umum grup Anda
const MENU_ITEMS = [
    { command: 'dl', description: 'Download video/audio dari platform', category: 'Utility' },
    { command: 'sticker', description: 'Ubah gambar/video menjadi stiker', category: 'Media' },
    { command: 'tourl', description: 'Ubah file/media menjadi link URL', category: 'Utility' },
    { command: 'hd', description: 'Tingkatkan kualitas resolusi gambar', category: 'Media' },
    { command: 'creimg', description: 'Generate gambar menggunakan AI', category: 'AI' },
    { command: 'sewa', description: 'Informasi harga sewa bot untuk grup', category: 'Sewa & Join' },
    { command: 'joinorg', description: 'Kirim undangan grup agar bot bergabung', category: 'Sewa & Join' }
];



 
async function menuController(sock, m, { jid, sender, body, isMaster }) {
    // 1. PARSING DATA REALTIME (Mengekstrak Command dan Args)
    const textStr = body.trim();
    if (!textStr.startsWith(PREFIX)) return false; // Abaikan jika tidak diawali titik "."

    const parts = textStr.slice(1).split(/\s+/);
    const cmd = parts[0].toLowerCase(); // Mengambil nama command murni (misal: "dl", "menu")
    const args = parts.slice(1); // Mengambil sisa argumen teks

    // === 2. PENCEGAT DATABASE REALTIME ===
    // Memeriksa apakah menu utama atau sub-menu yang diketik sedang dinonaktifkan
    if (cmd === "menu" || cmd === "m" || MENU_ITEMS.some(item => item.command === cmd)) {
        try {
            const menuConfig = await MenuModel.findOne({ command: cmd });
            
            // HAK ISTIMEWA: Jika status off (isActive: false) DAN yang akses BUKAN Master -> Blokir!
            // (Artinya Master tetap bisa pakai fitur yang mati untuk keperluan testing)
            if (menuConfig && !menuConfig.isActive && !isMaster) {
                await sock.sendMessage(jid, { 
                    text: ` [ *Menu nonaktif* ]\n\nMaaf, perintah \`${PREFIX}${cmd}\` saat ini sedang dinonaktifkan.\n\n *Reason :* ${menuConfig.disabledReason}` 
                }, { quoted: m });
                return true; // Menghentikan eksekusi (Blokir)
            }
        } catch (err) {
            console.error("Gagal cek realtime database:", err);
        }
    }

    // === 3. LOGIKA TAMPILAN UTAMA LIST MENU (.menu ATAU .m) ===
    if (cmd === "menu" || cmd === "m") {
        try {
            // Tarik seluruh data konfigurasi secara realtime dari DB untuk mendeteksi menu yang nonaktif
            const dbConfigs = await MenuModel.find({});
            const disabledMap = new Map(dbConfigs.map(c => [c.command, c.isActive]));

            // Mengelompokkan menu berdasarkan Kategori
            const categorizedMenu = {};
            MENU_ITEMS.forEach(item => {
                if (!categorizedMenu[item.category]) categorizedMenu[item.category] = [];
                categorizedMenu[item.category].push(item);
            });

            // Menyusun UI Teks Elegant Minimalist
            let menuMessage = `❖ ─── ⌈ *Nayozu bot* ⌋ ─── ❖\n\n`;
            menuMessage += `Halo, @${sender.split('@')[0]}! \nBerikut daftar fitur yang tersedia:\n\n`;

            for (const category in categorizedMenu) {
                menuMessage += `┌ ◦ *${category.toUpperCase()}*\n`;
                
                categorizedMenu[category].forEach((item, index, array) => {
                    const isItemActive = disabledMap.get(item.command) !== false; // Default true jika tidak ada di DB
                    const isLast = index === array.length - 1; // Deteksi apakah ini menu terakhir di kategori tersebut
                    
                    // Format Garis Penghubung Siku
                    const linePrefix = isLast ? '└' : '│';
                    const itemSymbol = isLast ? '➭' : '├';
                    const descPrefix = isLast ? ' ' : '│'; // Ruang kosong jika di akhir, garis vertikal jika belum akhir

                    if (isItemActive) {
                        menuMessage += `${linePrefix} ${itemSymbol} \`${PREFIX}${item.command}\`\n`;
                        menuMessage += `${descPrefix}    _└ ${item.description}_\n`;
                    } else {
                        // Tampilan coret jika dinonaktifkan secara global di DB
                        menuMessage += `${linePrefix} ${itemSymbol} ~${PREFIX}${item.command}~ _(Off)_\n`;
                        menuMessage += `${descPrefix}    _└ ${item.description}_\n`;
                    }
                });
                menuMessage += '\n'; // Jarak antar kategori
            }

            // Kirim pesan dengan parameter 'mentions' agar nomor user berubah jadi tag biru yang bisa diklik
            await sock.sendMessage(jid, { 
                text: menuMessage.trim(), 
                mentions: [sender] 
            }, { quoted: m });
            
            return true;
        } catch (e) {
            console.error("Gagal memuat menu:", e);
            return false;
        }
    }

    // === 4. LOGIKA INTEGRASI SUB-MENU (.dl, .sticker, DLL) ===
    const matchedMenu = MENU_ITEMS.find(item => item.command === cmd);
    if (matchedMenu) {
        // Pengecekan DB dilewati karena sudah divalidasi di Langkah 2 tadi.
        switch (cmd) {
            case 'dl':
                // Contoh:
                await sock.sendMessage(jid, { text: "⏳ Sedang memproses download..." }, { quoted: m });
                break;
            case 'sticker':
                // Tempatkan eksekusi modul stiker Anda di sini
                await sock.sendMessage(jid, { text: "⏳ Sedang membuat stiker..." }, { quoted: m });
                break;
            case 'tourl':
                break;
            case 'hd':
                break;
            case 'creimg':
                break;
                   case 'sewa':
    const nomorMod = "6285764554290";
    const pesanOtomatis = "Halo min, saya tertarik untuk menyewa Nayozu Bot untuk grup saya.";
    const linkWa = `https://wa.me/${nomorMod}?text=${encodeURIComponent(pesanOtomatis)}`;
    
    const sewaText = `❖ ─── ⌈ *Nayozu bot* ⌋ ─── ❖\n\n` +
                     `Anda ingin mengelola group wa lebih mudah?\n` +
                     `Kami menyediakan paket penyewaan dengan fitur lengkap, anti-delay, dan stabil.\n\n` +
                     `┌ ◦ *Fasilitas yang didapat :*\n` +
                     `│ ├ Helper group & akses menu\n` +
                     `│ ├ Only admin & hindari spam\n` +
                     `│ └ Dapatkan diskon jika tersedia\n` +
                     `└ > _Fitur web3 segera hadir._\n\n` +
      `> _Tekan gambar di atas & chat moderators_`;

    // 1. Download dulu gambarnya jadi buffer
    const { default: axios } = require('axios');
    const thumb = await axios.get('https://i.ibb.co.com/bRGL4C9r/IMG-20260804-WA0001.jpg', { responseType: 'arraybuffer' });

    await sock.sendMessage(jid, {
        text: sewaText,
        contextInfo: {
            externalAdReply: {
                title: "💼 Nayozu Bot Project",
                body: "Ketuk di sini untuk menghubungi moderator",
                thumbnail: thumb.data, // <-- KIRIM BUFFER DISINI
                sourceUrl: linkWa,
                mediaType: 2,
                renderLargerThumbnail: true,
                showAdAttribution: true
            }
        }
    })
       case 'joinorg':
                break;
        }
        return true; // Menandakan command berhasil ditangani sepenuhnya oleh menuController
    }

    return false; // Mengembalikan false agar dilempar estafet ke groupController (di index.js)
}

module.exports = { menuController };
