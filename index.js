const { Client, GatewayIntentBits, WebhookClient } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Prevent accidental double-processing inside ONE process
const seen = new Set();
setInterval(() => seen.clear(), 60_000);

client.once("clientReady", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// Helpers
function cleanSnippet(text, max = 120) {
  return (text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function stripOurReplyFormatting(text) {
  if (!text) return "";
  return text
    // remove any "Replying to ..." lines (many styles)
    .replace(/^.*Replying to.*\n?/gmi, "")
    // remove any raw discord jump link lines
    .replace(/^https?:\/\/discord\.com\/channels\/\S+\n?/gmi, "")
    // remove leading quote blocks
    .replace(/^(>\s?.*\n)+/gm, "")
    .trim();
}

// Download attachment bytes and return { attachment: Buffer, name }
async function downloadAttachment(url, name, maxBytes) {
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to fetch attachment (${res.status})`);
  }

  // If server provides content-length, use it to pre-check size
  const lenHeader = res.headers.get("content-length");
  if (lenHeader) {
    const len = Number(lenHeader);
    if (Number.isFinite(len) && len > maxBytes) {
      return { tooBig: true, bytes: len };
    }
  }

  const ab = await res.arrayBuffer();
  const buf = Buffer.from(ab);

  if (buf.length > maxBytes) {
    return { tooBig: true, bytes: buf.length };
  }

  return { file: { attachment: buf, name } };
}

client.on("messageCreate", async (message) => {
  if (message.author.bot || message.webhookId) return;
  if (!message.guild) return;

  if (seen.has(message.id)) return;
  seen.add(message.id);

  try {
    // Fetch or create a webhook owned by this bot
    const webhooks = await message.channel.fetchWebhooks();
    let webhook = webhooks.find((w) => w.owner?.id === client.user.id);

    if (!webhook) {
      webhook = await message.channel.createWebhook({ name: "Mirror" });
    }

    // --------------------------
    // Build outgoing content
    // --------------------------
    let content = message.content || " ";

    // Clean reply formatting: clickable "Replying to X"
    if (message.reference?.messageId) {
      try {
        const replied = await message.channel.messages.fetch(message.reference.messageId);

        const author = replied.member?.displayName || replied.author.username;

        let base =
          replied.content?.trim()
            ? replied.content
            : (replied.attachments?.size ? "[attachment]" : "[message]");

        base = stripOurReplyFormatting(base);
        const snippet = cleanSnippet(base || "[message]", 140);

        // Make the header clickable (no raw URL line)
        const header = `[↩️ Replying to ${author}](${replied.url})`;

        content = `${header}\n> ${snippet}\n\n${content}`;
      } catch {
        // ignore if can't fetch
      }
    }

    // --------------------------
    // Download + upload attachments (reliable embeds)
    // --------------------------
    // Default cap: 20 MB. You can raise/lower via Railway variable MAX_UPLOAD_MB
    const maxBytes = (Number(process.env.MAX_UPLOAD_MB) || 20) * 1024 * 1024;

    const files = [];
    const fallbackLinks = [];

    for (const a of message.attachments.values()) {
      try {
        const result = await downloadAttachment(a.url, a.name, maxBytes);

        if (result.tooBig) {
          // Too big to upload; post link instead
          fallbackLinks.push(`📎 **${a.name}** (too large to reupload): <${a.url}>`);
        } else if (result.file) {
          files.push(result.file);
        }
      } catch (e) {
        // If download fails, post link instead
        fallbackLinks.push(`📎 **${a.name}**: <${a.url}>`);
      }
    }

    if (fallbackLinks.length) {
      content = `${content}\n\n${fallbackLinks.join("\n")}`;
    }

    // Delete original AFTER we've fetched everything
    await message.delete().catch((err) => {
      if (err?.code !== 10008) console.error(err);
    });

    // Send via webhook
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

// Keep crashes visible
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

client.login(process.env.TOKEN);