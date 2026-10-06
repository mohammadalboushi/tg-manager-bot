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

  bot.sendMessage(chatId, `📌 **استلمت الرابط:**\nشو حابب تجهز يا أبو فايز؟`, {
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
  bot.editMessageText(`⏳ جاري استخراج رابط التحميل الصافي...`, { chat_id: chatId, message_id: msgId }).catch(()=>{});

  try {
    const options = {
      method: 'POST',
      url: 'https://social-download-all-in-one.p.rapidapi.com/v1/social/autolink',
      headers: {
        'content-type': 'application/json',
        'X-RapidAPI-Host': 'social-download-all-in-one.p.rapidapi.com',
        'X-RapidAPI-Key': '1aec64407fmsha5c87fdf0cdb4fdp1815a8jsn26a2b2e13f13'
      },
      data: { url: url }
    };

    const response = await axios.request(options);
    const resData = response.data;
    let downloadUrl = null;

    if (resData && resData.medias && Array.isArray(resData.medias)) {
      if (isAudio) {
        const audio = resData.medias.find(m => m.type === 'audio' || m.extension === 'mp3');
        downloadUrl = audio ? audio.url : resData.medias[0].url;
      } else {
        const video = resData.medias.find(m => (m.type === 'video' || m.extension === 'mp4') && m.quality !== 'audio');
        downloadUrl = video ? video.url : resData.medias[0].url;
      }
    } else if (resData && resData.url) {
      downloadUrl = resData.url;
    }

    if (!downloadUrl) throw new Error("تعذر سحب الرابط من السيرفر.");

    const titleText = resData.title ? `📌 **العنوان:** ${resData.title}\n\n` : '';

    await bot.editMessageText(`${titleText}✅ **تم تجهيز الرابط بنجاح!**\n👇 اضغط على الزر ليبدأ التحميل فوراً بجهازك:`, {
      chat_id: chatId,
      message_id: msgId,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: isAudio ? "🎵 اضغط لتحميل الصوت (MP3)" : "🎥 اضغط لتحميل الفيديو (MP4)", url: downloadUrl }]
        ]
      }
    });

  } catch (error) {
    let errorMsg = error.response?.data?.message || error.message || "حدث خطأ غير معروف";
    bot.editMessageText(`❌ فشل استخراج الرابط:\n${errorMsg}`, { chat_id: chatId, message_id: msgId }).catch(()=>{});
  }
}

module.exports = { handleMediaLink, handleCallback };
