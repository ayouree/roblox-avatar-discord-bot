const {
  SlashCommandBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
} = require("discord.js");
const fs = require("fs");
const path = require("path");

const dataPath = path.join(__dirname, "..", "data.json");
const ITEMS_PER_PAGE = 5;

function getCodes() {
  try {
    const raw = fs.readFileSync(dataPath, "utf8");
    if (!raw) return [];
    const fixed = raw.replace(/=/g, ":");
    return JSON.parse(fixed);
  } catch (e) {
    console.error("Error reading data.json:", e);
    return [];
  }
}

function getTypes(codes) {
  return [...new Set(codes.map((c) => c.type))];
}

const data = new SlashCommandBuilder()
  .setName("codes")
  .setDescription("Menampilkan list code asset Roblox berdasarkan type");

async function run({ interaction, client }) {
  await interaction.deferReply({ flags: 1 << 6 });

  const allCodes = getCodes();

  if (!allCodes.length) {
    return interaction.editReply({
      content: "Data code tidak ditemukan.",
      flags: 1 << 6,
    });
  }

  const types = getTypes(allCodes);
  let currentType = types[0];
  let currentPage = 0;

  async function makeEmbed(filteredCodes, page, type) {
    const totalPages = Math.ceil(filteredCodes.length / ITEMS_PER_PAGE);
    const startIndex = page * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const codesForPage = filteredCodes.slice(startIndex, endIndex);

    const fields = codesForPage.map((item) => {
      const name = item.name || "Tidak ditemukan";
      const creator = item.creator || "Tidak diketahui";
      const addedBy = item.addedBy || 'N/A';
      return {
        name: `${name} (oleh ${creator})`,
        value: `ID: \`${item.code}\` | Ditambahkan oleh: ${addedBy}`,
        inline: false,
      };
    });

    let embed = new EmbedBuilder()
      .setColor("#ff0000")
      .setTitle(`Daftar Kode Asset Roblox - ${type.charAt(0).toUpperCase() + type.slice(1)}`)
      .setDescription(`Berikut adalah daftar kode untuk type **${type}**.\n\n**Halaman ${page + 1} dari ${totalPages || 1}**`)
      .addFields(fields)
      .setFooter({ text: "BOT Created By 4Youree | Roblox Avatar Discord Bot" });

    if (!filteredCodes.length) {
      embed.setDescription(`Tidak ada kode untuk type **${type}**.`);
    }

    return embed;
  }

  function makeTypeRow(allTypes, selectedType) {
    const row = new ActionRowBuilder();
    allTypes.forEach((type) => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`type_${type}`)
          .setLabel(type.charAt(0).toUpperCase() + type.slice(1))
          .setStyle(type === selectedType ? ButtonStyle.Primary : ButtonStyle.Secondary)
      );
    });
    return row;
  }

  function makePaginationRow(page, totalPages) {
    const row = new ActionRowBuilder();
    row.addComponents(
      new ButtonBuilder()
        .setCustomId("prev_page")
        .setLabel("Previous")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId("next_page")
        .setLabel("Next")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1 || totalPages === 0)
    );
    return row;
  }

  async function updateInteractionReply(interactionToUpdate) {
    const filteredCodes = allCodes.filter((c) => c.type === currentType);
    const totalPages = Math.ceil(filteredCodes.length / ITEMS_PER_PAGE);

    if (currentPage >= totalPages && totalPages > 0) {
      currentPage = totalPages - 1;
    } else if (totalPages === 0) {
      currentPage = 0;
    }

    const embed = await makeEmbed(filteredCodes, currentPage, currentType);
    const typeRow = makeTypeRow(types, currentType);
    const paginationRow = makePaginationRow(currentPage, totalPages);

    // Mengembalikan objek pesan yang diperbarui agar collector dapat dibuat di atasnya
    const message = await interactionToUpdate.editReply({
      embeds: [embed],
      components: [typeRow, paginationRow],
      flags: 1 << 6,
    });
    return message;
  }

  // Tangkap objek pesan dari balasan awal untuk membuat collector
  const initialReplyMessage = await updateInteractionReply(interaction);

  // Buat collector pada objek pesan yang dikirim, bukan pada channel
  const collector = initialReplyMessage.createMessageComponentCollector({
    filter: (i) => i.user.id === interaction.user.id && (i.customId.startsWith("type_") || i.customId === "prev_page" || i.customId === "next_page"),
    time: 120000,
  });

  collector.on("collect", async (i) => {
    await i.deferUpdate();

    if (i.customId.startsWith("type_")) {
      currentType = i.customId.replace("type_", "");
      currentPage = 0;
    } else if (i.customId === "prev_page") {
      currentPage--;
    } else if (i.customId === "next_page") {
      currentPage++;
    }

    // Panggil updateInteractionReply dengan interaksi komponen untuk memperbarui pesan
    await updateInteractionReply(i);
  });

  collector.on("end", async () => {
    const filteredCodes = allCodes.filter((c) => c.type === currentType);
    const totalPages = Math.ceil(filteredCodes.length / ITEMS_PER_PAGE);

    const disabledTypeRow = makeTypeRow(types, currentType);
    disabledTypeRow.components.forEach((btn) => btn.setDisabled(true));

    const disabledPaginationRow = makePaginationRow(currentPage, totalPages);
    disabledPaginationRow.components.forEach((btn) => btn.setDisabled(true));

    await interaction.editReply({
      components: [disabledTypeRow, disabledPaginationRow],
      flags: 1 << 6,
    });
  });
}

module.exports = { data, run };
