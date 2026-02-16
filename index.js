const { Client, GatewayIntentBits, WebhookClient } = require("discord.js");
const http = require("http");

// ---------------------------
// Railway Health Server Fix
// ---------------------------

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("ok");
}).listen(PORT, () => {
  console.log(`Health server listening on ${PORT}`);
});

// ---------------------------
// Discord Bot
// ---------------------------

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Prevent accidental double-processing
const seen = new Set();
setInterval(() => seen.clear(), 60_000);

client.once("clientReady", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || message.webhookId) return;
  if (!message.guild) return;

  if (seen.has(message.id)) return;
  seen.add(message.id);

  try {
    // Fetch or create webhook
    let webhooks = await message.channel.fetchWebhooks();
    let webhook = webhooks.find(w => w.owner?.id === client.user.id);

    if (!webhook) {
      webhook = await message.channel.createWebhook({
        name: "Mirror",
      });
    }

    // --------------------------
    // Build message content
    // --------------------------

    let content = message.content || " ";

    // Reply support
    if (message.reference) {
      try {
        const replied = await message.channel.messages.fetch(
          message.reference.messageId
        );

        const author =
          replied.member?.displayName || replied.author.username;

        const snippet =
          (replied.content || "[attachment]").slice(0, 150);

        const link = replied.url;

        content = `> **${author}**: ${snippet}\n🔗 ${link}\n${content}`;
      } catch {}
    }

    // --------------------------
    // Collect attachments BEFORE delete
    // --------------------------

    const files = [...message.attachments.values()].map(a => ({
      attachment: a.url,
      name: a.name
    }));

    // Safe delete (ignore already-deleted)
    await message.delete().catch((err) => {
      if (err?.code !== 10008) console.error(err);
    });

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

// Safety logging
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

// Login
client.login(process.env.TOKEN);