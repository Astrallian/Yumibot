const { Client, GatewayIntentBits, WebhookClient } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.on("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || message.webhookId) return;
  if (!message.guild) return;

  try {
    // Get or create webhook
    let webhooks = await message.channel.fetchWebhooks();
    let webhook = webhooks.find(w => w.owner?.id === client.user.id);

    if (!webhook) {
      webhook = await message.channel.createWebhook({
        name: "Mirror",
      });
    }

    // --- BUILD CONTENT (WITH REPLY SUPPORT) ---

    let content = message.content || " ";

    if (message.reference) {
      try {
        const replied = await message.channel.messages.fetch(
          message.reference.messageId
        );

        const author =
          replied.member?.displayName || replied.author.username;

        const snippet =
          (replied.content || "[attachment]").slice(0, 150);

        content = `> **${author}**: ${snippet}\n${content}`;
      } catch {}
    }

    // Attachments
    const files = [...message.attachments.values()].map(a => a.url);

    // Delete original
    await message.delete();

    // Send as webhook
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

client.login(process.env.TOKEN);