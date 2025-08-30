const {
  SlashCommandBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
} = require("discord.js");
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
    const fixed = raw.replace(/=/g, ":");
    return JSON.parse(fixed);
  } catch (e) {
    return [];
  }
}

// Mendapatkan nama item dari API_DETAIL_CATALOG
async function getItemName(code) {
  try {
    // Ganti URL API_DETAIL_CATALOG sesuai kebutuhan
    const url = `https://catalog.roblox.com/v1/assets/${code}/details?itemType=asset`;
    const res = await axios.get(url);
    if (res.status < 200 || res.status >= 300) return "Tidak ditemukan";
    const data = res.data;
    // Berdasarkan hasil data API, gunakan field 'name'
    return data.name || "Tidak ditemukan";
  } catch (e) {
    return "Tidak ditemukan";
  }
}

// Mendapatkan semua type unik dari data code
function getTypes(codes) {
  return [...new Set(codes.map((c) => c.type))];
}

const data = new SlashCommandBuilder()
  .setName("codes")
  .setDescription("Menampilkan list code asset Roblox berdasarkan type");

async function run({ interaction, client }) {
  // Use flags for ephemeral instead of deprecated option
  await interaction.deferReply({ flags: 1 << 6 });

  // Ambil data code dari data.json
  const codes = getCodes();

  if (!codes.length) {
    return interaction.editReply({
      content: "Data code tidak ditemukan.",
      flags: 1 << 6,
    });
  }

  // Ambil semua type unik
  const types = getTypes(codes);

  // Default type yang ditampilkan pertama
  let currentType = types[0];

  // Fungsi untuk membuat embed berdasarkan type
  async function makeEmbed(type) {
    // Filter code berdasarkan type
    const filtered = codes.filter((c) => c.type === type);

    // Discord embed fields max: 25
    // If more than 25, show only first 25 and add a note
    let limited = filtered.slice(0, 25);

    // Ambil nama item dari API untuk setiap code
    const fields = await Promise.all(
      limited.map(async (item) => {
        const name = await getItemName(item.code);
        return {
          name: `${name}`,
          value: `ID: \`${item.code}\``,
          inline: false,
        };
      })
    );

    let embed = new EmbedBuilder()
      .setColor("#ff0000")
      .setTitle(`Daftar Kode Asset Roblox - ${type.charAt(0).toUpperCase() + type.slice(1)}`)
      .setDescription(`Berikut adalah daftar kode untuk type **${type}**`)
      .addFields(fields)
      .setFooter({ text: "Data diambil dari data.json & API Roblox" });

    if (filtered.length > 25) {
      embed.setDescription(
        `Berikut adalah daftar kode untuk type **${type}** (hanya 25 kode pertama yang ditampilkan, gunakan filter untuk melihat lebih banyak)`
      );
    }

    return embed;
  }

  // Fungsi untuk membuat row button type
  function makeTypeRow(selectedType) {
    const row = new ActionRowBuilder();
    types.forEach((type) => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`type_${type}`)
          .setLabel(type.charAt(0).toUpperCase() + type.slice(1))
          .setStyle(type === selectedType ? ButtonStyle.Primary : ButtonStyle.Secondary)
      );
    });
    return row;
  }

  // Kirim embed awal
  const embed = await makeEmbed(currentType);
  const row = makeTypeRow(currentType);

  const reply = await interaction.editReply({
    embeds: [embed],
    components: [row],
    flags: 1 << 6,
  });

  // Buat collector untuk button type
  const collector = reply.createMessageComponentCollector({
    filter: (i) => i.user.id === interaction.user.id && i.customId.startsWith("type_"),
    time: 120000,
  });

  collector.on("collect", async (i) => {
    const selectedType = i.customId.replace("type_", "");
    currentType = selectedType;
    const newEmbed = await makeEmbed(selectedType);
    const newRow = makeTypeRow(selectedType);
    await i.update({
      embeds: [newEmbed],
      components: [newRow],
    });
  });

  collector.on("end", async () => {
    // Disable semua button setelah waktu habis
    const disabledRow = makeTypeRow(currentType);
    disabledRow.components.forEach((btn) => btn.setDisabled(true));
    await interaction.editReply({
      components: [disabledRow],
      flags: 1 << 6,
    });
  });
}

module.exports = { data, run };
