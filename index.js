const { Client, GatewayIntentBits, PermissionsBitField } = require("discord.js");
const fs = require("fs"); 
const config = require("./config.json");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const warnings = {}; // userId -> count

// Auto delete channel after X minutes
function scheduleChannelDelete(channel, minutes) {
  setTimeout(async () => {
    try {
      // Fetch channel from cache safely
      const fetchedChannel = channel.guild.channels.cache.get(channel.id);
      if (fetchedChannel && fetchedChannel.deletable) {
        await fetchedChannel.delete("Auto-deleted warning channel");
      }
    } catch (err) {
      console.log("⚠️ Channel delete failed:", err.message);
    }
  }, minutes * 60 * 1000);
}

// FIX: Changed "ready" to "clientReady" to remove the terminal warning
client.once("clientReady", () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.guild) return;

    // REMOVED: The bot will no longer ignore the server owner!
    // if (message.author.id === message.guild.ownerId) return;

    const content = message.content.toLowerCase();

    // Check prohibited words
    const hasBadWord = config.triggerWords.some(word =>
      content.includes(word)
    );
    if (!hasBadWord) return;

    // Try deleting message
    try {
      await message.delete();
    } catch {}

    const userId = message.author.id;
    warnings[userId] = (warnings[userId] || 0) + 1;

    // Sanitize username to prevent channel creation crashes
    const safeUsername = message.author.username.toLowerCase().replace(/[^a-z0-9]/g, "");
    const channelName = `warning-${safeUsername}`;
    
    let warnChannel = message.guild.channels.cache.find(
      c => c.name === channelName
    );

    // Create private channel if not exists
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

      scheduleChannelDelete(warnChannel, config.channelDeleteMinutes);
    }

    // Send warning + audio safely
    const audioFile = fs.existsSync("./audio.mp3") ? ["./audio.mp3"] : [];
    await warnChannel.send({
      content: `⚠️ **Warning ${warnings[userId]}/${config.maxWarnings}** \nYou used a prohibited word.`,
      files: audioFile,
    });

    // ---- SAFE MUTE LOGIC ----
    if (warnings[userId] >= config.maxWarnings) {
      const member = await message.guild.members.fetch(userId);
      const botMember = message.guild.members.me;

      // Special message just for your testing!
      if (message.author.id === message.guild.ownerId) {
        await warnChannel.send("⚠️ **Test Mode Note:** You reached max warnings! Since you are the Server Owner, Discord physically won't let me mute you. I would have muted a normal user though!");
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

      try {
        await member.timeout(
          config.muteMinutes * 60 * 1000,
          "Exceeded prohibited word limit"
        );

        await warnChannel.send(
          `🔇 You have been muted for ${config.muteMinutes} minutes.`
        );
      } catch (err) {
        console.log("⚠️ Timeout failed:", err.message);
      }
    }
  } catch (err) {
    console.log("⚠️ General error:", err.message);
  }
});

client.login(config.token);