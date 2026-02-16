const { Client, GatewayIntentBits, WebhookClient } = require("discord.js");
const http = require("http");
console.log("BOOT INSTANCE:", process.env.RAILWAY_SERVICE_NAME, process.env.RAILWAY_REPLICA_ID, new Date().toISOString());

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

// Prevent accidental double-processing
const seen = new Set();
setInterval(() => seen.clear(), 60_000);

client.once("clientReady", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || message.webhookId) return;
  if (!message.guild) return;

  // Duplicate guard
  if (seen.has(message.id)) return;
  seen.add(message.id);

  try {
    // Get or create webhook owned by this bot
    const webhooks = await message.channel.fetchWebhooks();
    let webhook = webhooks.find((w) => w.owner?.id === client.user.id);

    if (!webhook) {
      webhook = await message.channel.createWebhook({ name: "Mirror" });
    }

    // --------------------------
    // Build outgoing content
    // --------------------------
    let content = message.content || " ";

// Clean reply formatting with clickable header
if (message.reference?.messageId) {
  try {
    const replied = await message.channel.messages.fetch(
      message.reference.messageId
    );

    const author =
      replied.member?.displayName || replied.author.username;

    let base =
      replied.content?.trim()
        ? replied.content
        : (replied.attachments?.size ? "[attachment]" : "[message]");

    // Remove previous reply formatting from mirrored messages
    base = base
      .replace(/^.*Replying to.*\n?/gmi, "")
      .replace(/^https?:\/\/discord\.com\/channels\/\S+\n?/gmi, "")
      .replace(/^(>\s?.*\n)+/gm, "")
      .trim();

    const snippet = (base || "[message]")
      .replace(/\s+/g, " ")
      .slice(0, 120);

    // 🔥 Make the entire header clickable
    const header = `[↩ Replying to ${author}](${replied.url})`;

    content =
      `${header}\n` +
      `> ${snippet}\n\n` +
      content;

  } catch {}
}

    // --------------------------
    // Attachments (embed correctly)
    // --------------------------
    const files = [...message.attachments.values()].map((a) => ({
      attachment: a.url,
      name: a.name
    }));

    // --------------------------
    // Delete original safely
    // --------------------------
    await message.delete().catch((err) => {
      // 10008 = Unknown Message (already deleted)
      if (err?.code !== 10008) console.error(err);
    });

    // --------------------------
    // Send via webhook
    // --------------------------
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