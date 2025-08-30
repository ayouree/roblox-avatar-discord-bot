const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

// Path ke data.json
const dataPath = path.join(__dirname, "..", "data.json");

// Fungsi untuk membaca data code dari data.json
function getCodes() {
  try {
    const raw = fs.readFileSync(dataPath, "utf8");
    if (!raw) return [];
    // Ganti = ke : jika format json salah
    // Ini mengasumsikan file mungkin disimpan dengan '=' bukan ':'
    const fixed = raw.replace(/=/g, ":");
    return JSON.parse(fixed);
  } catch (e) {
    console.error("Error reading data.json:", e);
    return [];
  }
}

// Fungsi untuk menyimpan data code ke data.json
function saveCodes(codes) {
  try {
    // Simpan sebagai JSON standar. Jika data.json sebelumnya menggunakan '=',
    // fungsi getCodes akan mengatasinya dengan replace saat membaca.
    const jsonString = JSON.stringify(codes, null, 2);
    fs.writeFileSync(dataPath, jsonString, "utf8");
  } catch (e) {
    console.error("Error writing to data.json:", e);
  }
}

// Mendapatkan detail item dari API_DETAIL_CATALOG
async function getItemDetails(code) {
  try {
    const url = `https://catalog.roblox.com/v1/catalog/items/${code}/details?itemType=asset`;
    const res = await axios.get(url);
    if (res.status < 200 || res.status >= 300) {
      return { error: "Gagal mengambil detail asset dari API." };
    }
    const data = res.data;
    if (!data || !data.name || !data.creatorName || !data.id) {
      return { error: "Detail asset tidak lengkap atau tidak ditemukan." };
    }
    return {
      name: data.name,
      creatorName: data.creatorName,
      id: data.id,
    };
  } catch (e) {
    console.error(`Error fetching item details for code ${code}:`, e.message);
    return { error: "Terjadi kesalahan saat menghubungi API Roblox." };
  }
}

const data = new SlashCommandBuilder()
  .setName("add")
  .setDescription("Menambahkan satu atau lebih kode asset Roblox baru")
  .addStringOption((option) =>
    option
      .setName("codes1") // Opsi pertama (wajib)
      .setDescription("ID asset Roblox (wajib, pisahkan dengan koma atau spasi jika lebih dari satu)")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("type1") // Tipe untuk opsi pertama (wajib)
      .setDescription("Tipe asset untuk codes1 (wajib)")
      .setRequired(true)
      .addChoices(
        { name: "Baju", value: "baju" },
        { name: "Celana", value: "celana" },
        { name: "Accessories", value: "accessories" },
        { name: "Misc", value: "misc" },
        { name: "Huge", value: "huge" }
      )
  );

// Tambahkan opsi codes dan type tambahan (opsional) hingga 5 pasang
for (let i = 2; i <= 5; i++) {
  data.addStringOption((option) =>
    option
      .setName(`codes${i}`)
      .setDescription(`ID asset Roblox tambahan (opsional, pisahkan dengan koma atau spasi)`)
      .setRequired(false)
  ).addStringOption((option) =>
    option
      .setName(`type${i}`)
      .setDescription(`Tipe asset untuk codes${i} (opsional)`)
      .setRequired(false)
      .addChoices(
        { name: "Baju", value: "baju" },
        { name: "Celana", value: "celana" },
        { name: "Accessories", value: "accessories" },
        { name: "Misc", value: "misc" },
        { name: "Huge", value: "huge" }
      )
  );
}

async function run({ interaction, client }) {
  await interaction.deferReply({ flags: 1 << 6 });

  const allInputItems = []; // Akan menyimpan { code, type } dari semua input
  const failedCodes = []; // Inisialisasi di sini untuk menangkap kegagalan awal

  // Loop melalui semua kemungkinan pasangan codes dan type (codes1/type1 hingga codes5/type5)
  for (let i = 1; i <= 5; i++) {
    const codesString = interaction.options.getString(`codes${i}`);
    const type = interaction.options.getString(`type${i}`);

    if (codesString) { // Jika ada string kode yang diberikan untuk pasangan ini
      const individualCodes = codesString
        .split(/[, ]+/)
        .map((c) => c.trim())
        .filter((c) => c.length > 0);

      if (type) { // Jika tipe juga diberikan, tambahkan ke daftar untuk diproses
        individualCodes.forEach(code => {
          allInputItems.push({ code, type });
        });
      } else { // Jika kode diberikan tetapi tipe tidak ada
        individualCodes.forEach(code => {
          failedCodes.push({ code, reason: `Tipe asset tidak diberikan untuk kode ini (codes${i}).` });
        });
      }
    }
    // Jika codesString tidak ada, abaikan pasangan ini karena opsional dan kosong
  }

  // Jika tidak ada kode yang valid untuk diproses sama sekali
  if (allInputItems.length === 0 && failedCodes.length === 0) {
    return interaction.editReply({
      content: "Mohon berikan setidaknya satu kode asset dan tipenya yang valid.",
      flags: 1 << 6,
    });
  }

  const existingCodes = getCodes(); // Baca data kode yang sudah ada sekali
  const addedCodes = [];
  const duplicateCodes = [];

  // Proses setiap item dari semua input yang terkumpul
  for (const { code, type } of allInputItems) {
    // Validasi kode harus berupa angka
    if (isNaN(code) || !/^\d+$/.test(code)) {
      failedCodes.push({ code, reason: "Kode asset harus berupa angka." });
      continue;
    }

    // Cek duplikasi: apakah kode dan tipe yang sama sudah ada
    const isDuplicate = existingCodes.some(
      (item) => item.code === code && item.type === type
    );
    if (isDuplicate) {
      duplicateCodes.push({
        code,
        reason: `Sudah ada dalam daftar dengan tipe \`${type}\`.`,
      });
      continue;
    }

    // Ambil detail item dari API Roblox
    const itemDetails = await getItemDetails(code);

    if (itemDetails.error) {
      failedCodes.push({ code, reason: itemDetails.error });
      continue;
    }

    // Tambahkan kode baru ke array existingCodes
    existingCodes.push({
      code: code,
      type: type,
      name: itemDetails.name,
      creator: itemDetails.creatorName,
      addedBy: interaction.user.tag,
      addedAt: new Date().toISOString(),
    });
    addedCodes.push({
      code: code,
      type: type,
      name: itemDetails.name,
      creator: itemDetails.creatorName,
      id: itemDetails.id,
    });
  }

  // Simpan array codes yang sudah diperbarui hanya jika ada penambahan baru
  if (addedCodes.length > 0) {
    saveCodes(existingCodes);
  }

  // Buat embed untuk pesan ringkasan
  const embed = new EmbedBuilder()
    .setTitle("Ringkasan Penambahan Asset Roblox")
    .setFooter({ text: `Diproses oleh ${interaction.user.tag}` })
    .setTimestamp();

  let description = "";

  if (addedCodes.length > 0) {
    embed.setColor("#00FF00"); // Hijau untuk sukses
    description += `✅ **${addedCodes.length} asset berhasil ditambahkan:**\n`;
    addedCodes.forEach((item) => {
      description += `- **${item.name}** (ID: \`${item.id}\`) tipe \`${item.type}\`\n`;
    });
  }

  if (duplicateCodes.length > 0) {
    if (addedCodes.length === 0) embed.setColor("#FFA500"); // Oranye jika hanya duplikat/gagal
    description += `\n⚠️ **${duplicateCodes.length} asset sudah ada:**\n`;
    duplicateCodes.forEach((item) => {
      description += `- \`${item.code}\`: ${item.reason}\n`;
    });
  }

  if (failedCodes.length > 0) {
    if (addedCodes.length === 0 && duplicateCodes.length === 0) embed.setColor("#FF0000"); // Merah jika hanya gagal
    else if (addedCodes.length > 0 || duplicateCodes.length > 0) embed.setColor("#FFA500"); // Oranye jika ada sukses/duplikat tapi juga gagal
    description += `\n❌ **${failedCodes.length} asset gagal ditambahkan:**\n`;
    failedCodes.forEach((item) => {
      description += `- \`${item.code}\`: ${item.reason}\n`;
    });
  }

  if (addedCodes.length === 0 && duplicateCodes.length === 0 && failedCodes.length === 0) {
    embed.setColor("#FF0000");
    description = "Tidak ada kode asset yang valid untuk diproses.";
  }

  embed.setDescription(description.substring(0, 4096)); // Pastikan deskripsi tidak melebihi batas Discord

  await interaction.editReply({
    embeds: [embed],
    flags: 1 << 6,
  });
}

module.exports = { data, run };
