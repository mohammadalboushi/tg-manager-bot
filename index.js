const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const axios = require('axios');

const github = require('./github');
const downloader = require('./downloader');

const token = process.env.BOT_TOKEN;
const adminId = process.env.ADMIN_ID;

const bot = new TelegramBot(token, { polling: true });
github.initGithub(bot);

// تسجيل الأوامر بالقائمة الجانبية (Menu) تبع تليجرام
bot.setMyCommands([
  { command: 'start', description: 'بدء المحادثة' },
  { command: 'github', description: 'إدارة جيت هوب' },
  { command: 'download', description: 'تحميل وسائط' }
]).catch(() => {});

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

// بدء المحادثة (رسالة ترحيب نظيفة بدون أزرار)
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  if (adminId && chatId.toString() !== adminId) return bot.sendMessage(chatId, "🔒 مقفل.");
  
  await bot.sendMessage(chatId, "أهلاً يا أبو فايز 👋\n\nاضغط على زر القائمة (Menu) اللي تحت على اليسار لتختار شو بدك تعمل.", {
    reply_markup: { remove_keyboard: true } // تنظيف الشاشة من أي كيبورد قديم
  });
});

// أمر جيت هوب
bot.onText(/\/github/, async (msg) => {
  const chatId = msg.chat.id;
  if (adminId && chatId.toString() !== adminId) return;
  await github.resetState(chatId);
});

// أمر التحميل
bot.onText(/\/download/, async (msg) => {
  const chatId = msg.chat.id;
  if (adminId && chatId.toString() !== adminId) return;
  await bot.sendMessage(chatId, "👇 ابعت رابط الفيديو أو الريلز (فيسبوك، إنستا، تيك توك):");
});

bot.on('callback_query', async (query) => {
  bot.answerCallbackQuery(query.id).catch(() => {});
  if (query.data.startsWith("dl_")) return downloader.handleCallback(bot, query);
  return github.handleCallback(query);
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  if (adminId && chatId.toString() !== adminId) return;
  
  // تجاهل الأوامر لتجنب التكرار
  if (msg.text && msg.text.startsWith("/")) return; 

  // فحص روابط الوسائط
  if (msg.text && /^https?:\/\//i.test(msg.text.trim()) && !msg.reply_to_message) {
    return downloader.handleMediaLink(bot, msg);
  }
  
  return github.handleMessage(msg);
});

process.on('uncaughtException', err => console.log('Exception: ', err.message));
process.on('unhandledRejection', reason => console.log('Rejection:', reason));
