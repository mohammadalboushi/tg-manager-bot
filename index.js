const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

// التوكنات رح نحطها بإعدادات Render مشان الأمان وما تنكشف بالكود
const token = process.env.BOT_TOKEN;
const adminId = process.env.ADMIN_ID;

const bot = new TelegramBot(token, { polling: true });
const app = express();
const port = process.env.PORT || 3000;

// هاد السطر ضروري جداً لـ Render مشان يضل السيرفر شغال وما يعطيك خطأ
app.get('/', (req, res) => res.send('البوت شغال 100% 🚀'));
app.listen(port, () => console.log(Server is running on port ${port}));

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  
  if (chatId.toString() !== adminId) {
    return bot.sendMessage(chatId, "🔒 البوت مقفل.");
  }
  
  bot.sendMessage(chatId, "✅ أهلاً يا معلم! السيرفر شغال على Node.js بنجاح. جاهزين للتقيل ورفع المجلدات.");
});