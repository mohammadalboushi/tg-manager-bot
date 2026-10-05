const axios = require('axios');

const userLinks = new Map();

const RAPID_API_KEY = "1aec64407fmsha5c87fdf0cdb4fdp1815a8jsn26a2b2e13f13";
const RAPID_API_HOST = "zm-api.p.rapidapi.com";

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

  bot.editMessageText(`⏳ جاري تجهيز الرابط وسحب الميديا...`, { chat_id: chatId, message_id: msgId });

  try {
    const options = {
      method: 'GET',
      url: `https://${RAPID_API_HOST}/download`,
      params: { url: url },
      headers: {
        'x-rapidapi-key': RAPID_API_KEY,
        'x-rapidapi-host': RAPID_API_HOST
      }
    };

    const response = await axios.request(options);
    const resData = response.data;

    let downloadUrl = null;
    const isAudio = data === "dl_audio";

    if (isAudio) {
      if (resData.medias && Array.isArray(resData.medias)) {
        const audioItem = resData.medias.find(m => m.type === "audio") || resData.medias.find(m => m.extension === "mp3");
        if (audioItem) downloadUrl = audioItem.url;
      }
      if (!downloadUrl && resData.audio) downloadUrl = resData.audio;
    }

    if (!downloadUrl && resData.medias && Array.isArray(resData.medias)) {
      const videoItem = resData.medias.find(m => m.type === "video") || resData.medias[0];
      if (videoItem) downloadUrl = videoItem.url;
    }

    if (!downloadUrl) {
      downloadUrl = resData.url || resData.download_url;
    }

    if (!downloadUrl) throw new Error("تعذر استخراج رابط التحميل من هذا الرابط.");

    bot.editMessageText(`🚀 جاري الإرسال لتليجرام...`, { chat_id: chatId, message_id: msgId });

    if (isAudio) {
      await bot.sendAudio(chatId, downloadUrl, { caption: "🎵 تم التحميل بواسطة بوت أبو فايز" });
    } else {
      await bot.sendVideo(chatId, downloadUrl, { caption: "🎥 تم التحميل بواسطة بوت أبو فايز" });
    }

    bot.deleteMessage(chatId, msgId).catch(() => {});

  } catch (error) {
    let errorMsg = "عذراً، فشل التحميل.";
    if (error.response && error.response.data && error.response.data.message) {
      errorMsg = error.response.data.message;
    } else if (error.message) {
      errorMsg = error.message;
    }
    bot.editMessageText(`❌ ${errorMsg}`, { chat_id: chatId, message_id: msgId });
  }
}

module.exports = { handleMediaLink, handleCallback };
