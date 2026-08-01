const RoleModel = require('../models/RoleModel')
const GroupModel = require('../models/GroupModel')

function clearJid(jid) {
    if (!jid) return ""
    if (jid.includes("@lid")) {
        const parts = jid.split("@")
        const user = parts[0].split(":")[0]
        return `${user}@lid`
    }
    const parts = jid.split("@")
    const user = parts[0].split(":")[0]
    const domain = parts[1] || "s.whatsapp.net"
    return `${user}@${domain}`
}

function formatGroupJid(id) {
    let clean = id.trim()
    if (!clean.endsWith("@g.us")) {
        clean = `${clean}@g.us`
    }
    return clean
}

module.exports = async (sock, m, context) => {
    const { jid, sender, body, sessionId, isMaster, isMod, isGroup } = context
    const args = body.trim().split(/\s+/)
    const cmd = args[1]?.toLowerCase()

    let targetJid = ""
    if (m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
        targetJid = clearJid(m.message.extendedTextMessage.contextInfo.mentionedJid[0])
    } else if (args[2] && !args[2].includes("@g.us")) {
        let cleanNum = args[2].replace(/[^0-9]/g, "")
        if (cleanNum) targetJid = `${cleanNum}@s.whatsapp.net`
    }

    if (cmd === "help" || !cmd) {
        let helpText = `🛡️ *NAYOZU BOT - ADMINISTRATOR HELP*\n\n` +
            `> *Daftar Perintah Pengelolaan & Kontrol Bot*\n\n` +
            `*   \`-c info\` - Menampilkan informasi status sistem bot.\n` +
            `*   \`-c reg\` - Mendaftarkan grup ke sistem database (di dalam grup atau via \`-c reg <id_grup>\`).\n` +
            `*   \`-c addguest @user [durasi]\` - Memberikan akses guest sementara (cth: \`2h\` atau \`1d\`).\n` +
            `*   \`-c addme <id_grup>\` - Menarik & menambahkan diri Anda ke grup tujuan.\n` +
            `*   \`-c rct <id_grup> <pesan>\` - Mengirim pesan remote secara langsung ke suatu grup.\n` +
            `*   \`-c bc <pesan>\` - Melakukan siaran/broadcast ke seluruh grup terdaftar.\n` +
            `*   \`-c listgr [page]\` - Melihat daftar ID grup yang sudah *Registered*.\n` +
            `*   \`-c listgs [page]\` - Melihat daftar ID grup *Saved* (belum terdaftar).\n` +
            `*   \`-c gi <id_grup>\` - Melihat informasi detail suatu grup.\n`

        await sock.sendMessage(jid, { text: helpText }, { quoted: m })
        return true
    }

    // 2. Informasi Sistem Bot (-c info) - Master & Mod
    if (cmd === "info") {
        try {
            const totalGroups = await GroupModel.countDocuments({ sessionId })
            const regGroups = await GroupModel.countDocuments({ sessionId, registered: true })
            const modsCount = await RoleModel.countDocuments({ role: 'mod' })
            const guestsCount = await RoleModel.countDocuments({ role: 'guest' })

            const infoText = `🤖 *NAYOZU BOT - SYSTEM INFO*\n\n` +
                `📦 *Session ID:* ${sessionId}\n` +
                `📊 *Total Grup Tersimpan:* ${totalGroups}\n` +
                `✅ *Grup Terdaftar (Registered):* ${regGroups}\n` +
                `🛡️ *Total Moderator:* ${modsCount}\n` +
                `⏱️ *Total Guest Aktif:* ${guestsCount}\n` +
                `👑 *Akses Peran Anda:* ${isMaster ? 'Master' : 'Moderator'}`

            await sock.sendMessage(jid, { text: infoText }, { quoted: m })
        } catch (err) {
            await sock.sendMessage(jid, { text: `❌ Gagal memuat info sistem: ${err.message}` }, { quoted: m })
        }
        return true
    }

    // 3. Registrasi Grup (-c reg) - Bisa dari dalam grup atau lewat privat chat (-c reg <id_grup>)
    if (cmd === "reg") {
        let targetRegJid = jid
        if (!isGroup) {
            const targetGroupRaw = args[2]
            if (!targetGroupRaw) {
                await sock.sendMessage(jid, { text: "⚠️ Format salah jika dikirim di privat chat. Contoh: `-c reg 120363123456789012`" }, { quoted: m })
                return true
            }
            targetRegJid = formatGroupJid(targetGroupRaw)
        }

        const docId = `${sessionId}_${targetRegJid}`
        await GroupModel.findByIdAndUpdate(docId, { registered: true }, { upsert: true, returnDocument: 'after' })
        await sock.sendMessage(jid, { text: `✅ Grup \`${targetRegJid.split('@')[0]}\` berhasil didaftarkan secara permanen di sistem.` }, { quoted: m })
        return true
    }

    // 5. Add Mod (-c addmod) - Menyimpan JID & LID secara bersamaan
    if (cmd === "addmod") {
        let rawTarget = null;

        // Ambil target dari pesan yang di-reply (mencakup semua variasi struktur Baileys)
        if (m.quoted) {
            rawTarget = m.quoted.sender || 
                        m.quoted.participant || 
                        m.quoted.key?.participant || 
                        m.msg?.contextInfo?.participant ||
                        m.message?.extendedTextMessage?.contextInfo?.participant;
        }

        // Ambil dari mention (@tag)
        if (!rawTarget && m.mentionedJid && m.mentionedJid.length > 0) {
            rawTarget = m.mentionedJid[0];
        } else if (!rawTarget && m.msg?.contextInfo?.mentionedJid?.length > 0) {
            rawTarget = m.msg.contextInfo.mentionedJid[0];
        }

        // Ambil dari argumen teks manual (Nomor / JID / LID)
        if (!rawTarget && args[2]) {
            const inputArg = args[2].trim();
            if (inputArg.includes("@")) {
                rawTarget = inputArg;
            } else {
                const cleanNum = inputArg.replace(/[^0-9]/g, "");
                if (cleanNum.length >= 5) {
                    rawTarget = cleanNum + "@s.whatsapp.net";
                }
            }
        }

        if (!rawTarget) {
            await sock.sendMessage(jid, { 
                text: "⚠️ Format salah.\n\nGunakan salah satu cara:\n1. Reply pesan target lalu ketik `-c addmod`\n2. Mention target: `-c addmod @user`\n3. Masukkan nomor: `-c addmod 628xxx`" 
            }, { quoted: m });
            return true;
        }

        // Ambil metadata grup untuk memetakan pasangan JID dan LID yang valid
        let groupMeta = null;
        try {
            groupMeta = await sock.groupMetadata(jid);
        } catch (e) {}

        let realJid = "";
        let realLid = "";

        if (groupMeta && groupMeta.participants) {
            const participant = groupMeta.participants.find(p => 
                p.id === rawTarget || p.lid === rawTarget
            );

            if (participant) {
                // Ekstraksi JID telepon asli (@s.whatsapp.net)
                if (participant.id && participant.id.endsWith("@s.whatsapp.net")) {
                    realJid = participant.id;
                } else if (participant.lid && participant.lid.endsWith("@s.whatsapp.net")) {
                    realJid = participant.lid;
                }

                // Ekstraksi LID (@lid)
                if (participant.lid && participant.lid.endsWith("@lid")) {
                    realLid = participant.lid;
                } else if (participant.id && participant.id.endsWith("@lid")) {
                    realLid = participant.id;
                }
            }
        }

        // Fallback jika tidak ditemukan di metadata grup
        if (!realJid && rawTarget.endsWith("@s.whatsapp.net")) {
            realJid = rawTarget;
        }
        if (!realLid && rawTarget.endsWith("@lid")) {
            realLid = rawTarget;
        }

        // Validasi keamanan: JID wajib berformat nomor telepon asli (@s.whatsapp.net)
        if (!realJid || realJid.includes("@lid") || !realJid.endsWith("@s.whatsapp.net")) {
            await sock.sendMessage(jid, { 
                text: `⚠️ Gagal: Tidak dapat menemukan JID nomor telepon asli (@s.whatsapp.net) untuk target (\`${rawTarget}\`). Pastikan target berada di dalam grup yang sama.` 
            }, { quoted: m });
            return true;
        }

        try {
            // SIMPAN KEDUANYA (jid & lid) ke database MongoDB secara bersamaan
            await RoleModel.findOneAndUpdate(
                { jid: realJid },
                { 
                    jid: realJid, 
                    lid: realLid || "", 
                    role: "mod", 
                    addedAt: new Date(),
                    addedBy: sender
                },
                { upsert: true, new: true }
            );

            await sock.sendMessage(jid, { 
                text: `✅ Berhasil menyimpan Moderator dengan data lengkap!\n\n• **JID (Telepon)**: \`${realJid}\`\n• **LID**: \`${realLid || "Tidak terdeteksi"}\`` 
            }, { quoted: m });

        } catch (err) {
            await sock.sendMessage(jid, { text: `❌ Gagal menyimpan ke database: ${err.message}` }, { quoted: m });
        }

        return true;
    }


    // 6. Demod (-c demod) - Mendukung Reply, Mention, atau Input Manual & Cross-reference
    if (cmd === "demod") {
    if (!isMaster) {  await sock.sendMessage(jid, { text: "Hanya master yang berhak"}, { quoted: m })
    return true
    }
        let rawTarget = null;
        // Skenario 1: Mengambil target dari pesan yang di-reply
        if (m.quoted && m.quoted.sender) {
            rawTarget = m.quoted.sender;
        } 
        // Skenario 2: Mengambil target dari mention (@tag) di argumen
        else if (m.mentionedJid && m.mentionedJid.length > 0) {
            rawTarget = m.mentionedJid[0];
        } 
        // Skenario 3: Mengambil dari teks/argumen langsung (Nomor atau JID)
        else if (args[2]) {
            const inputArg = args[2].trim();
            if (inputArg.includes("@")) {
                rawTarget = inputArg;
            } else {
                const cleanNum = inputArg.replace(/[^0-9]/g, "");
                if (cleanNum.length >= 5) {
                    rawTarget = cleanNum + "@s.whatsapp.net";
                }
            }
        }

        if (!rawTarget) {
            await sock.sendMessage(jid, { 
                text: "⚠️ Format salah.\n\nGunakan salah satu cara berikut untuk mencabut Mod:\n1. Reply pesan target lalu ketik `-c demod`\n2. Mention target: `-c demod @user`\n3. Masukkan nomor: `-c demod 628xxx`" 
            }, { quoted: m });
            return true;
        }

        // Ambil metadata grup untuk cross-reference pemetaan JID dan LID
        let groupMeta = null;
        try {
            groupMeta = await sock.groupMetadata(jid);
        } catch (e) {
            // Abaikan jika tidak di grup atau bot tidak punya akses
        }

        let realJid = "";
        let realLid = "";

        if (rawTarget.endsWith("@lid")) {
            realLid = rawTarget;
            if (groupMeta && groupMeta.participants) {
                const found = groupMeta.participants.find(p => p.lid === rawTarget || p.id === rawTarget);
                if (found && found.id && found.id.endsWith("@s.whatsapp.net")) {
                    realJid = found.id;
                }
            }
        } else if (rawTarget.endsWith("@s.whatsapp.net")) {
            realJid = rawTarget;
            if (groupMeta && groupMeta.participants) {
                const found = groupMeta.participants.find(p => p.id === rawTarget);
                if (found && found.lid) {
                    realLid = found.lid;
                }
            }
        }

        // Fallback pengaman jika groupMeta gagal/tidak ada
        if (!realJid && rawTarget.endsWith("@s.whatsapp.net")) realJid = rawTarget;
        if (!realLid && rawTarget.endsWith("@lid")) realLid = rawTarget;

        try {
            // Kumpulkan berbagai kemungkinan format penyimpanan di database untuk dihapus
            const orConditions = [{ role: "mod" }];
            const targetIdentifiers = [];
            
            if (realJid) targetIdentifiers.push(realJid);
            if (realLid) targetIdentifiers.push(realLid);
            if (rawTarget) targetIdentifiers.push(rawTarget);

            // Buat query pencarian fleksibel berdasarkan field jid atau lid
            const deleteQuery = {
                role: "mod",
                $or: [
                    { jid: { $in: targetIdentifiers } },
                    { lid: { $in: targetIdentifiers } }
                ]
            };

            const deletedRecord = await RoleModel.findOneAndDelete(deleteQuery);

            if (!deletedRecord) {
                await sock.sendMessage(jid, { 
                    text: `⚠️ Gagal: Target (\`${rawTarget}\`) tidak ditemukan di dalam daftar Moderator database.` 
                }, { quoted: m });
                return true;
            }

            await sock.sendMessage(jid, { 
                text: `✅ Berhasil mencabut status Moderator dari target yang cocok dengan (\`${rawTarget}\`).` 
            }, { quoted: m });

        } catch (err) {
            await sock.sendMessage(jid, { text: `❌ Terjadi kesalahan saat menghapus dari database: ${err.message}` }, { quoted: m });
        }

        return true;
    }

    

    // 6. Tambah Guest Berdurasi (-c addguest) - Master & Mod
    if (cmd === "addguest") {
        const durationArg = args[3] || "1h"
        if (!targetJid) {
            await sock.sendMessage(jid, { text: "⚠️ Format salah. Contoh: `-c addguest @user 2h` atau `1d`" }, { quoted: m })
            return true
        }

        let ms = 60 * 60 * 1000
        if (durationArg.endsWith('h')) {
            ms = parseInt(durationArg) * 60 * 60 * 1000
        } else if (durationArg.endsWith('d')) {
            ms = parseInt(durationArg) * 24 * 60 * 60 * 1000
        }

        const expiresAt = new Date(Date.now() + ms)

        await RoleModel.findOneAndUpdate(
            { $or: [{ jid: targetJid }, { lid: targetJid }] },
            { jid: targetJid, role: 'guest', addedBy: sender, addedAt: new Date(), expiresAt },
            { upsert: true, returnDocument: 'after' }
        )
        await sock.sendMessage(jid, { text: `✅ Berhasil memberikan akses Guest kepada ${targetJid} selama ${durationArg}.` }, { quoted: m })
        return true
  }

    // 7. Tarik & Add Master/Mod ke Grup (-c addme <id_grup>) - Master & Mod
    if (cmd === "addme") {
        const targetGroupRaw = args[2]
        if (!targetGroupRaw) {
            await sock.sendMessage(jid, { text: "⚠️ Format salah. Contoh: `-c addme 120363123456789012`" }, { quoted: m })
            return true
        }

        const groupJid = formatGroupJid(targetGroupRaw)

        try {
            const roleRecord = await RoleModel.findOne({
                $or: [
                    { jid: sender },
                    { lid: sender }
                ]
            })

            if (!roleRecord || !roleRecord.jid) {
                await sock.sendMessage(jid, { text: `⚠️ Gagal: Identitas Anda tidak ditemukan di database RoleModel.` }, { quoted: m })
                return true
            }

            let validParticipantJid = roleRecord.jid

            // PENGAMANAN: Blokir JID berbasis LID (@lid) atau format non-nomor telepon 
            // agar tidak mengirim payload rusak ke WhatsApp yang dapat memicu penangguhan grup (Group Suspension).
            if (validParticipantJid.includes("@lid") || !validParticipantJid.endsWith("@s.whatsapp.net")) {
                await sock.sendMessage(jid, { text: `⚠️ Gagal: Akun Anda terdeteksi menggunakan format LID (@lid). Fitur -c addme hanya dapat digunakan oleh akun yang memiliki JID nomor telepon asli (@s.whatsapp.net).` }, { quoted: m })
                return true
            }

            const response = await sock.groupParticipantsUpdate(groupJid, [validParticipantJid], "add")
            const participantResult = response?.[0]

            if (participantResult && participantResult.status !== "200") {
                await sock.sendMessage(jid, { text: `⚠️ Gagal menambahkan Anda ke grup. Pastikan bot adalah Admin di grup tersebut dan ID grup benar. (Status: ${participantResult.status})` }, { quoted: m })
            } else {
                await sock.sendMessage(jid, { text: `✅ Berhasil menambahkan Anda (\`${validParticipantJid}\`) ke grup ${groupJid}.` }, { quoted: m })
            }
        } catch (err) {
            await sock.sendMessage(jid, { text: `❌ Terjadi kesalahan: ${err.message}. Pastikan bot memiliki hak akses Admin di grup tujuan.` }, { quoted: m })
        }
        return true
    }


    // 8. Remote Chat ke Suatu Grup (-c rct <id_grup> <pesan>) - Master & Mod
    if (cmd === "rct") {
        const targetGroupRaw = args[2]
        const messageText = args.slice(3).join(" ")

        if (!targetGroupRaw || !messageText) {
            await sock.sendMessage(jid, { text: "⚠️ Format salah. Contoh: `-c rct 120363123456789012 Halo semua!`" }, { quoted: m })
            return true
        }

        const groupJid = formatGroupJid(targetGroupRaw)

        try {
            await sock.sendMessage(groupJid, { text: messageText })
            await sock.sendMessage(jid, { text: `✅ Pesan berhasil dikirim secara remote ke grup ${groupJid}.` }, { quoted: m })
        } catch (err) {
            await sock.sendMessage(jid, { text: `❌ Gagal mengirim pesan ke grup: ${err.message}` }, { quoted: m })
        }
        return true
    }

    // 9. Broadcast ke Semua Grup Terdaftar (-c bc <pesan>) - Master & Mod
    if (cmd === "bc") {
        const broadcastMessage = args.slice(2).join(" ")

        if (!broadcastMessage) {
            await sock.sendMessage(jid, { text: "⚠️ Format salah. Contoh: `-c bc Halo, ini pengumuman resmi bot.`" }, { quoted: m })
            return true
        }

        try {
            const registeredGroups = await GroupModel.find({ sessionId, registered: true })

            if (!registeredGroups || registeredGroups.length === 0) {
                await sock.sendMessage(jid, { text: "⚠️ Tidak ada grup yang terdaftar (`registered: true`) di sistem untuk dibroadcast." }, { quoted: m })
                return true
            }

            let successCount = 0
            let failCount = 0

            for (const group of registeredGroups) {
                try {
                    await sock.sendMessage(group.jid, { text: ` 📢 *PESAN SIARAN (BROADCAST)*\n\n${broadcastMessage}` })
                    successCount++
                    await new Promise(resolve => setTimeout(resolve, 1000))
                } catch (e) {
                    failCount++
                }
            }

            await sock.sendMessage(jid, { text: `✅ Broadcast selesai!\n- Berhasil terkirim: ${successCount} grup\n- Gagal: ${failCount} grup` }, { quoted: m })
        } catch (err) {
            await sock.sendMessage(jid, { text: `❌ Terjadi kesalahan saat melakukan broadcast: ${err.message}` }, { quoted: m })
        }
        return true
    }

    // 10A. List Group Registered (-c listgr [page]) - Master & Mod
    if (cmd === "listgr") {
        const page = parseInt(args[2]) || 1
        const perPage = 25
        const skip = (page - 1) * perPage

        try {
            const totalGroups = await GroupModel.countDocuments({ sessionId, registered: true })
            const totalPages = Math.ceil(totalGroups / perPage) || 1

            if (page > totalPages && totalPages > 0) {
                await sock.sendMessage(jid, { text: `⚠️ Halaman ${page} tidak ditemukan. Total halaman tersedia: ${totalPages}.` }, { quoted: m })
                return true
            }

            const groups = await GroupModel.find({ sessionId, registered: true }).skip(skip).limit(perPage)

            if (groups.length === 0) {
                await sock.sendMessage(jid, { text: "⚠️ Belum ada grup yang terdaftar (`registered: true`) di database." }, { quoted: m })
                return true
            }

            let text = `📋 *DAFTAR GRUP TERDAFTAR (Page ${page} of ${totalPages})*\n\n`
            groups.forEach((g, index) => {
                const numericId = g.jid.split('@')[0]
                text += `${skip + index + 1}. \`${numericId}\`\n`
            })
            text += `\n_Gunakan -c listgr [halaman] untuk melihat halaman lainnya._`

            await sock.sendMessage(jid, { text }, { quoted: m })
        } catch (err) {
            await sock.sendMessage(jid, { text: `❌ Gagal mengambil daftar grup terdaftar: ${err.message}` }, { quoted: m })
        }
        return true
    }

    // 10B. List Group Saved / Belum Terdaftar (-c listgs [page]) - Master & Mod
    if (cmd === "listgs") {
        const page = parseInt(args[2]) || 1
        const perPage = 25
        const skip = (page - 1) * perPage

        try {
            const totalGroups = await GroupModel.countDocuments({ sessionId, registered: { $ne: true } })
            const totalPages = Math.ceil(totalGroups / perPage) || 1

            if (page > totalPages && totalPages > 0) {
                await sock.sendMessage(jid, { text: `⚠️ Halaman ${page} tidak ditemukan. Total halaman tersedia: ${totalPages}.` }, { quoted: m })
                return true
            }

            const groups = await GroupModel.find({ sessionId, registered: { $ne: true } }).skip(skip).limit(perPage)

            if (groups.length === 0) {
                await sock.sendMessage(jid, { text: "⚠️ Tidak ada grup tersimpan yang belum terdaftar." }, { quoted: m })
                return true
            }

            let text = `📋 *DAFTAR GRUP TERHIMPUN / SAVED (Page ${page} of ${totalPages})*\n\n`
            groups.forEach((g, index) => {
                const numericId = g.jid.split('@')[0]
                text += `${skip + index + 1}. \`${numericId}\`\n`
            })
            text += `\n_Gunakan -c listgs [halaman] untuk melihat halaman lainnya._`

            await sock.sendMessage(jid, { text }, { quoted: m })
        } catch (err) {
            await sock.sendMessage(jid, { text: `❌ Gagal mengambil daftar grup saved: ${err.message}` }, { quoted: m })
        }
        return true
    }

    // 11. Informasi Detail Grup (-c gi <id_grup>) - Master & Mod
    if (cmd === "gi") {
        const targetGroupRaw = args[2]
        if (!targetGroupRaw) {
            await sock.sendMessage(jid, { text: "⚠️ Format salah. Contoh: `-c gi 120363123456789012`" }, { quoted: m })
            return true
        }

        const groupJid = formatGroupJid(targetGroupRaw)

        try {
            const metadata = await sock.groupMetadata(groupJid)
            const subject = metadata.subject
            const totalMembers = metadata.participants.length
            const admins = metadata.participants.filter(v => v.admin === "admin" || v.admin === "superadmin")
            const adminCount = admins.length
            const regularCount = totalMembers - adminCount

            const infoText = `📊 *INFORMASI DETAIL GRUP*\n\n` +
                `📌 *Nama Grup:* ${subject}\n` +
                `🆔 *ID Grup:* \`${groupJid.split('@')[0]}\`\n` +
                `👥 *Total Member:* ${totalMembers}\n` +
                `🛡️ *Jumlah Admin:* ${adminCount}\n` +
                `👤 *Member Biasa:* ${regularCount}`

            await sock.sendMessage(jid, { text: infoText }, { quoted: m })
        } catch (err) {
            await sock.sendMessage(jid, { text: `❌ Gagal mengambil informasi grup. Pastikan ID benar dan bot berada di dalam grup tersebut. (${err.message})` }, { quoted: m })
        }
        return true
    }

    return false
}
