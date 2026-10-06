const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const axios = require('axios');

const github = require('./github');
const downloader = require('./downloader');

const token = process.env.BOT_TOKEN;
const adminId = process.env.ADMIN_ID;

const bot = new TelegramBot(token, { polling: true });
github.initGithub(bot);

bot.on("polling_error", (err) => {
  if (err.message && err.message.includes("409 Conflict")) return;
  console.log("Polling Error:", err.message);
});

const app = express();
const port = process.env.PORT || 3000;

app.use((req, res) => res.send("Bot is Alive 100%"));
app.listen(port, () => {
  console.log("Server running on port " + port);
  setInterval(() => {
    if(process.env.RENDER_EXTERNAL_HOSTNAME) {
      axios.get(`https://${process.env.RENDER_EXTERNAL_HOSTNAME}`).catch(() => {});
    }
  }, 10 * 60 * 1000);
});

// الأزرار الثابتة بأسفل الشاشة
const mainKeyboard = {
  reply_markup: {
    keyboard: [
      [{ text: "📁 إدارة جيت هوب" }, { text: "📥 تحميل وسائط" }]
    ],
    resize_keyboard: true
  }
};

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  if (adminId && chatId.toString() !== adminId) return bot.sendMessage(chatId, "🔒 مقفل.");
  await bot.sendMessage(chatId, "أهلاً يا أبو فايز، اختار شو بدك تعمل من الأزرار تحت 👇", mainKeyboard);
});

bot.on('callback_query', async (query) => {
  bot.answerCallbackQuery(query.id).catch(() => {});
  if (query.data.startsWith("dl_")) return downloader.handleCallback(bot, query);
  return github.handleCallback(query);
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  if (adminId && chatId.toString() !== adminId) return;
  if (msg.text === "/start") return;

  // الضغط على زر جيت هوب
  if (msg.text === "📁 إدارة جيت هوب") {
    return github.resetState(chatId);
  }

  // الضغط على زر تحميل وسائط
  if (msg.text === "📥 تحميل وسائط") {
    return bot.sendMessage(chatId, "👇 ابعت رابط الفيديو أو الريلز (فيسبوك، إنستا، تيك توك) لنجهزه فوراً:");
  }

  // فحص روابط الوسائط
  if (msg.text && /^https?:\/\//i.test(msg.text.trim()) && !msg.reply_to_message) {
    return downloader.handleMediaLink(bot, msg);
  }
  
  return github.handleMessage(msg);
});

process.on('uncaughtException', err => console.log('Exception: ', err.message));
process.on('unhandledRejection', reason => console.log('Rejection:', reason));
