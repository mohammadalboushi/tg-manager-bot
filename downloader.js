const axios = require('axios');

const userLinks = new Map();

async function handleMediaLink(bot, msg) {
  const chatId = msg.chat.id;
  const url = msg.text.trim();
  userLinks.set(chatId, url);

  const keyboard = [
    [{ text: "🎥 فيديو", callback_data: `dl_video` }],
    [{ text: "🎵 صوت", callback_data: `dl_audio` }]
  ];

  bot.sendMessage(chatId, `📌 **استلمت الرابط:**\nشو حابب تنزل يا أبو فايز؟`, {
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

  const isAudio = data === "dl_audio";
  bot.editMessageText(`⏳ جاري المعالجة وسحب الملف...`, { chat_id: chatId, message_id: msgId }).catch(()=>{});

  try {
    const response = await axios.post('https://api.cobalt.tools/api/json', {
      url: url,
      isAudioOnly: isAudio
    }, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const downloadUrl = response.data.url;
    if (!downloadUrl) throw new Error("لم يتم العثور على رابط");

    bot.editMessageText(`🚀 جاري الإرسال لتليجرام...`, { chat_id: chatId, message_id: msgId }).catch(()=>{});

    if (isAudio) {
      await bot.sendAudio(chatId, downloadUrl, { caption: "🎵 تم التحميل بواسطة بوت أبو فايز" });
    } else {
      await bot.sendVideo(chatId, downloadUrl, { caption: "🎥 تم التحميل بواسطة بوت أبو فايز" });
    }
    
    bot.deleteMessage(chatId, msgId).catch(() => {});
  } catch (error) {
    console.error(error.message);
    bot.editMessageText(`❌ فشل التحميل من السيرفر. جرب رابط تاني.`, { chat_id: chatId, message_id: msgId }).catch(()=>{});
  }
}

module.exports = { handleMediaLink, handleCallback };
