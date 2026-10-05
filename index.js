const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const axios = require('axios');

// استدعاء ملفات المشاريع المنفصلة
const github = require('./github');
const downloader = require('./downloader');

const token = process.env.BOT_TOKEN;
const adminId = process.env.ADMIN_ID;

const bot = new TelegramBot(token, { polling: true });

// تمرير البوت لملف غيتهوب ليتعرف عليه
github.initGithub(bot);

bot.on("polling_error", (err) => {
  if (err.message && err.message.includes("409 Conflict")) return;
  console.log("Polling Error:", err.message);
});

bot.deleteWebHook().catch(() => {});

const app = express();
const port = process.env.PORT || 3000;

app.use((req, res) => res.send("Bot is Alive 100%"));
app.listen(port, () => {
  console.log("Server running on port " + port);
  setInterval(() => {
    axios.get("https://tg-manager-bot-zwwv.onrender.com").catch(() => {});
  }, 10 * 60 * 1000);
});

// توجيه أمر البداية إلى غيتهوب
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  if (chatId.toString() !== adminId) return bot.sendMessage(chatId, "🔒 مقفل.");
  await github.resetState(chatId);
});

// موزع الأزرار
bot.on('callback_query', async (query) => {
  bot.answerCallbackQuery(query.id).catch(() => {});
  
  if (query.data.startsWith("dl_")) {
    // إذا الزر للتحميل، وجهه لملف الصوتيات
    return downloader.handleCallback(bot, query);
  } else {
    // باقي الأزرار وجهها لملف غيتهوب
    return github.handleCallback(query);
  }
});

// موزع الرسائل
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  if (chatId.toString() !== adminId || msg.text === "/start") return;

  // التقاط أي رسالة عبارة عن رابط وتحويلها لملف التحميل فوراً
  if (msg.text && /^https?:\/\//i.test(msg.text.trim()) && !msg.reply_to_message) {
    return downloader.handleMediaLink(bot, msg);
  }

  // باقي الرسائل (ملفات وردود) وجهها لملف غيتهوب
  return github.handleMessage(msg);
});

process.on('uncaughtException', function (err) {
  console.log('تم منع جلطة بالسيرفر (Exception): ', err.message);
});
process.on('unhandledRejection', (reason, promise) => {
  console.log('تم منع جلطة بالسيرفر (Rejection):', reason);
});
