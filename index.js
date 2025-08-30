const { Client, ActivityType } = require("discord.js");
const { CommandKit } = require("commandkit");
const antiCrash = require("./anticrash");
require("dotenv").config();

antiCrash
  .init()
  .then(() => {
    const client = new Client({
      intents: [
        "Guilds",
        "GuildMembers",
        "GuildMessages",
        "MessageContent",
        "GuildVoiceStates",
      ],
    });

    const commandKit = new CommandKit({
      client,
      commandsPath: `${__dirname}/commands`,
      bulkRegister: true,
    });

    client.on("ready", () => {
      client.user.setPresence({
        activities: [
          { name: "Avatar Roblox", type: ActivityType.Watching }
        ],
        status: "online",
      });
      console.log(`Bot siap sebagai ${client.user.tag}`);
    });

    client.login(process.env.BOT_TOKEN).catch((error) => {
      console.error("Gagal login bot:", error);
    });
  })
  .catch((error) => {
    console.error("Gagal inisialisasi antiCrash module:", error);
  });
