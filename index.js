const { Client, GatewayIntentBits, PermissionsBitField } = require("discord.js");
const fs = require("fs");

/* ================= CONFIG (INLINE, NO config.json) ================= */
const CONFIG = {
  triggerWords: ["67", "bc", "mc", "tmkc", "bkl", "terimakichut", "randi"],
  maxWarnings: 3,
  muteMinutes: 10,
  channelDeleteMinutes: 5,
};
/* =================================================================== */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const warnings = {}; // userId -> count

// Auto-delete warning channel
function scheduleChannelDelete(channel, minutes) {
  setTimeout(async () => {
    try {
      if (channel && channel.deletable) {
        await channel.delete("Auto-deleted warning channel");
      }
    } catch (err) {
      console.log("⚠️ Channel delete failed:", err.message);
    }
  }, minutes * 60 * 1000);
}

// Ready
client.once("clientReady", () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.guild) return;

    const content = message.content.toLowerCase();

    const hasBadWord = CONFIG.triggerWords.some(word =>
      content.includes(word)
    );
    if (!hasBadWord) return;

    // Delete message
    try {
      await message.delete();
    } catch {}

    const userId = message.author.id;
    warnings[userId] = (warnings[userId] || 0) + 1;

    // Safe channel name
    const safeUsername = message.author.username
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

    const channelName = `warning-${safeUsername}`;

    let warnChannel = message.guild.channels.cache.find(
      c => c.name === channelName
    );

    // Create private channel
    if (!warnChannel) {
      warnChannel = await message.guild.channels.create({
        name: channelName,
        type: 0,
        permissionOverwrites: [
          {
            id: message.guild.id,
            deny: [PermissionsBitField.Flags.ViewChannel],
          },
          {
            id: message.author.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
            ],
          },
          {
            id: client.user.id,
            allow: [PermissionsBitField.Flags.ViewChannel],
          },
        ],
      });

      scheduleChannelDelete(warnChannel, CONFIG.channelDeleteMinutes);
    }

    // Send warning + audio
    const audio = fs.existsSync("./audio.mp3") ? ["./audio.mp3"] : [];
    await warnChannel.send({
      content: `⚠️ **Warning ${warnings[userId]}/${CONFIG.maxWarnings}**\nYou used a prohibited word.`,
      files: audio,
    });

    // Mute logic
    if (warnings[userId] >= CONFIG.maxWarnings) {
      const member = await message.guild.members.fetch(userId);
      const botMember = message.guild.members.me;

      // Owner cannot be muted
      if (member.id === message.guild.ownerId) {
        await warnChannel.send(
          "⚠️ You reached max warnings, but server owners cannot be muted by Discord."
        );
        return;
      }

      const canMute =
        botMember.permissions.has(PermissionsBitField.Flags.ModerateMembers) &&
        botMember.roles.highest.position > member.roles.highest.position &&
        !member.permissions.has(PermissionsBitField.Flags.Administrator);

      if (!canMute) {
        await warnChannel.send(
          "⚠️ I cannot mute you due to role/permission limits."
        );
        return;
      }

      await member.timeout(
        CONFIG.muteMinutes * 60 * 1000,
        "Exceeded prohibited word limit"
      );

      await warnChannel.send(
        `🔇 You have been muted for ${CONFIG.muteMinutes} minutes.`
      );
    }
  } catch (err) {
    console.log("⚠️ Error:", err.message);
  }
});

/* ================= LOGIN (Railway ENV TOKEN) ================= */
client.login(process.env.TOKEN);
