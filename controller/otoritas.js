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
    const { jid, sender, body, sessionId, isMaster, isMod } = context
    const args = body.trim().split(/\s+/)
    const cmd = args[1]?.toLowerCase()

    let targetJid = ""
    if (m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
        targetJid = clearJid(m.message.extendedTextMessage.contextInfo.mentionedJid[0])
    } else if (args[2] && !args[2].includes("@g.us")) {
        let cleanNum = args[2].replace(/[^0-9]/g, "")
        if (cleanNum) targetJid = `${cleanNum}@s.whatsapp.net`
    }

    // 1. Informasi Sistem Bot (-c info) - Master & Mod
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

    // 2. Registrasi Grup (-c reg) - Master & Mod
    if (cmd === "reg" && jid.endsWith("@g.us")) {
        const docId = `${sessionId}_${jid}`
        await GroupModel.findByIdAndUpdate(docId, { registered: true }, { upsert: true, returnDocument: 'after' })
        await sock.sendMessage(jid, { text: "✅ Grup ini berhasil didaftarkan secara permanen di sistem." }, { quoted: m })
        return true
    }

    // 3. Tambah Moderator (-c addmod) - KHUSUS MASTER
    if (cmd === "addmod") {
        if (!isMaster) {
            await sock.sendMessage(jid, { text: "⚠️ Hanya Master yang berhak mengangkat Moderator." }, { quoted: m })
            return true
        }
        if (!targetJid) {
            await sock.sendMessage(jid, { text: "⚠️ Format salah. Contoh: `-c addmod @user`" }, { quoted: m })
            return true
        }

        await RoleModel.findOneAndUpdate(
            { $or: [{ jid: targetJid }, { lid: targetJid }] },
            { jid: targetJid, role: 'mod', addedBy: sender, addedAt: new Date(), expiresAt: null },
            { upsert: true, returnDocument: 'after' }
        )
        await sock.sendMessage(jid, { text: `✅ Berhasil menetapkan ${targetJid} sebagai Moderator.` }, { quoted: m })
        return true
    }

    // 4. Turunkan Moderator (-c demod) - KHUSUS MASTER
    if (cmd === "demod") {
        if (!isMaster) {
            await sock.sendMessage(jid, { text: "⚠️ Hanya Master yang berhak menurunkan Moderator." }, { quoted: m })
            return true
        }
        if (!targetJid) {
            await sock.sendMessage(jid, { text: "⚠️ Masukkan target yang ingin diturunkan." }, { quoted: m })
            return true
        }

        await RoleModel.deleteOne({ $or: [{ jid: targetJid }, { lid: targetJid }], role: 'mod' })
        await sock.sendMessage(jid, { text: `✅ Berhasil mencabut status Moderator dari ${targetJid}.` }, { quoted: m })
        return true
    }

    // 5. Tambah Guest Berdurasi (-c addguest) - Master & Mod
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

    // 6. Tarik & Add Master/Mod ke Grup (-c addme <id_grup>) - Master & Mod
    if (cmd === "addme") {
        const targetGroupRaw = args[2]
        if (!targetGroupRaw) {
            await sock.sendMessage(jid, { text: "⚠️ Format salah. Contoh: `-c addme 120363123456789012`" }, { quoted: m })
            return true
        }

        const groupJid = formatGroupJid(targetGroupRaw)

        try {
            const response = await sock.groupParticipantsUpdate(groupJid, [sender], "add")
            const participantResult = response?.[0]
            if (participantResult && participantResult.status !== "200") {
                await sock.sendMessage(jid, { text: `⚠️ Gagal menambahkan Anda ke grup. Pastikan bot adalah Admin di grup tersebut dan ID grup benar. (Status: ${participantResult.status})` }, { quoted: m })
            } else {
                await sock.sendMessage(jid, { text: `✅ Berhasil menambahkan Anda ke grup ${groupJid}.` }, { quoted: m })
            }
        } catch (err) {
            await sock.sendMessage(jid, { text: `❌ Terjadi kesalahan saat mencoba menambahkan Anda: ${err.message}. Pastikan bot memiliki hak akses Admin di grup tujuan.` }, { quoted: m })
        }
        return true
    }

    // 7. Remote Chat ke Suatu Grup (-c rct <id_grup> <pesan>) - Master & Mod
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

    // 8. Broadcast ke Semua Grup Terdaftar (-c bc <pesan>) - Master & Mod
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
                    await sock.sendMessage(group.jid, { text: `📢 *PESAN SIARAN (BROADCAST)*\n\n${broadcastMessage}` })
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

    // 9. List Group (Murni Angka ID Saja, Max 25 per Page) - Master & Mod
    if (cmd === "listgroup") {
        const page = parseInt(args[2]) || 1
        const perPage = 25
        const skip = (page - 1) * perPage

        try {
            const totalGroups = await GroupModel.countDocuments({ sessionId })
            const totalPages = Math.ceil(totalGroups / perPage) || 1

            if (page > totalPages && totalPages > 0) {
                await sock.sendMessage(jid, { text: `⚠️ Halaman ${page} tidak ditemukan. Total halaman tersedia: ${totalPages}.` }, { quoted: m })
                return true
            }

            const groups = await GroupModel.find({ sessionId }).skip(skip).limit(perPage)

            if (groups.length === 0) {
                await sock.sendMessage(jid, { text: "⚠️ Belum ada grup yang tersimpan di database." }, { quoted: m })
                return true
            }

            let text = `📋 *DAFTAR ID GRUP (Page ${page} of ${totalPages})*\n\n`
            groups.forEach((g, index) => {
                const numericId = g.jid.split('@')[0]
                text += `${skip + index + 1}. \`${numericId}\`\n`
            })
            text += `\n_Gunakan -c listgroup [nomor_halaman] untuk melihat halaman lainnya._`

            await sock.sendMessage(jid, { text }, { quoted: m })
        } catch (err) {
            await sock.sendMessage(jid, { text: `❌ Gagal mengambil daftar grup: ${err.message}` }, { quoted: m })
        }
        return true
    }

    // 10. Informasi Detail Grup (-c gi <id_grup>) - Master & Mod
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
