const { Client, GatewayIntentBits, WebhookClient } = require("discord.js");
const http = require("http");

// ---------------------------
// Railway "health" server
// (keeps Railway networking happy)
// ---------------------------
const PORT = process.env.PORT || 3000;

http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
  })
  .listen(PORT, () => console.log(`Health server listening on ${PORT}`));

// ---------------------------
// Discord bot
// ---------------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Prevent accidental double-processing (reconnects / rare duplicates)
const seen = new Set();
setInterval(() => seen.clear(), 60_000);

client.once("clientReady", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  // Ignore bots + webhooks + DMs
  if (message.author.bot || message.webhookId) return;
  if (!message.guild) return;

  // Duplicate guard
  if (seen.has(message.id)) return;
  seen.add(message.id);

  try {
    // Fetch or create webhook owned by this bot
    const webhooks = await message.channel.fetchWebhooks();
    let webhook = webhooks.find((w) => w.owner?.id === client.user.id);

    if (!webhook) {
      webhook = await message.channel.createWebhook({ name: "Mirror" });
    }

    // ------------- Build content -------------
    let content = message.content || " ";

    // Clean reply formatting (with anti-nesting)
    if (message.reference?.messageId) {
      try {
        const replied = await message.channel.messages.fetch(
          message.reference.messageId
        );

        const author = replied.member?.displayName || replied.author.username;
        const jump = `<${replied.url}>`; // < > prevents link preview

        // If replied message has no text, show attachment placeholder
        let base =
          replied.content?.trim()
            ? replied.content
            : (replied.attachments?.size ? "[attachment]" : "[message]");

        // --- Anti-nesting cleanup ---
        // Remove OUR bot’s reply header + quote if the replied message is mirrored.
        // This stops: "Rentarou: > Panoli: ..."
        base = base
          .replace(/^↩️\s*\*\*Replying to.*\n?/m, "") // remove header line
          .replace(/^>\s.*\n?/m, "")                  // remove 1 quote line
          .trim();

        const snippet = (base || "[message]")
          .replace(/\s+/g, " ")
          .slice(0, 140);

        content =
          `↩️ **Replying to ${author}** · ${jump}\n` +
          `> ${snippet}\n\n` +
          content;
      } catch {
        // If we can’t fetch replied message, just send normal content
      }
    }

    // ------------- Attachments (embed correctly) -------------
    // IMPORTANT: capture BEFORE deletion
    const files = [...message.attachments.values()].map((a) => ({
      attachment: a.url,
      name: a.name
    }));

    // ------------- Delete original safely -------------
    await message.delete().catch((err) => {
      // 10008 = Unknown Message (already deleted)
      if (err?.code !== 10008) console.error(err);
    });

    // ------------- Send via webhook -------------
    const hook = new WebhookClient({ url: webhook.url });

    await hook.send({
      content,
      username: message.member?.displayName || message.author.username,
      avatarURL: message.author.displayAvatarURL(),
      files
    });
  } catch (err) {
    console.error(err);
  }
});

// Log crashes instead of silently dying
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

// Login with Railway variable
client.login(process.env.TOKEN);