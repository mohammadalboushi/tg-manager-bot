const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const axios = require('axios'); // ضفنا هالمكتبة لعمل الزيارة

const token = process.env.BOT_TOKEN;
const adminId = process.env.ADMIN_ID;

const bot = new TelegramBot(token, { polling: true });
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('البوت شغال وصاحي 100% 🚀'));

app.listen(port, () => {
  console.log("Server is running on port " + port);
  
  // حركة الخباثة: السيرفر بيعمل زيارة لحاله كل 10 دقايق مشان ما ينام
  const RENDER_URL = "https://tg-manager-bot-zwuv.onrender.com"; 
  setInterval(() => {
    axios.get(RENDER_URL).then(() => {
      console.log("تمت الزيارة بنجاح، السيرفر صاحي.");
    }).catch(() => {});
  }, 10 * 60 * 1000); // 10 دقايق (600,000 ميلي ثانية)
});

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  
  if (chatId.toString() !== adminId) {
    return bot.sendMessage(chatId, "🔒 البوت مقفل.");
  }
  
  bot.sendMessage(chatId, "✅ أهلاً يا أبو فايز! السيرفر شغال وصاحي 24/7 ولغينا قصة الـ 50 ثانية للأبد. جاهز للتقيل وفك الـ ZIP؟");
});
