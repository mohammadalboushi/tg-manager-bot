const axios = require('axios');

const userLinks = new Map();

async function handleMediaLink(bot, msg) {
  const chatId = msg.chat.id;
  const url = msg.text.trim();

  userLinks.set(chatId, url);

  const keyboard = [
    [{ text: "🎥 فيديو (MP4)", callback_data: `dl_video` }],
    [{ text: "🎵 صوت (MP3)", callback_data: `dl_audio` }]
  ];

  bot.sendMessage(chatId, `📌 **استلمت الرابط:**\nشو الصيغة اللي حابب تنزلها يا أبو فايز؟`, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: keyboard }
  });
}

async function handleCallback(bot, query) {
  const chatId = query.message.chat.id;
  const msgId = query.message.message_id;
  const data = query.data;

  const url = userLinks.get(chatId);
  if (!url) {
    return bot.editMessageText(`❌ الرابط مفقود، ارجع ابعته مرة تانية.`, { chat_id: chatId, message_id: msgId });
  }

  bot.editMessageText(`⏳ جاري سحب الميديا بمعالجة فائقة السرعة...`, { chat_id: chatId, message_id: msgId });

  try {
    const isAudio = data === "dl_audio";

    // استخدام سيرفر مجاني وقوي جداً يدعم كافة المنصات بدون مفاتيح
    const response = await axios.post('https://co.wukko.me/api/json', {
      url: url,
      isAudioOnly: isAudio,
      aFormat: "mp3"
    }, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      }
    });

    const downloadUrl = response.data.url;

    if (!downloadUrl) throw new Error("تعذر استخراج رابط التحميل.");

    bot.editMessageText(`🚀 جاري الإرسال لتليجرام...`, { chat_id: chatId, message_id: msgId });

    if (isAudio) {
      await bot.sendAudio(chatId, downloadUrl, { caption: "🎵 تم التحميل بواسطة بوت أبو فايز" });
    } else {
      await bot.sendVideo(chatId, downloadUrl, { caption: "🎥 تم التحميل بواسطة بوت أبو فايز" });
    }

    bot.deleteMessage(chatId, msgId).catch(() => {});

  } catch (error) {
    let errorMsg = "عذراً، فشل التحميل.";
    if (error.response && error.response.data && error.response.data.text) {
      errorMsg = error.response.data.text;
    } else if (error.message) {
      errorMsg = error.message;
    }
    bot.editMessageText(`❌ ${errorMsg}`, { chat_id: chatId, message_id: msgId });
  }
}

module.exports = { handleMediaLink, handleCallback };
