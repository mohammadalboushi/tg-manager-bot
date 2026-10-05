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
    // استخدام سيرفر بديل ومستقر لخدمة Cobalt
    const response = await axios.post('https://co.wuk.sh/api/json', {
      url: url,
      isAudioOnly: isAudio
    }, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    const resData = response.data;
    let downloadUrl = resData.url || (resData.picker && resData.picker[0] && resData.picker[0].url);

    if (!downloadUrl) throw new Error("لم يتم العثور على رابط التحميل");

    bot.editMessageText(`🚀 جاري الإرسال لتليجرام...`, { chat_id: chatId, message_id: msgId }).catch(()=>{});

    if (isAudio) {
      await bot.sendAudio(chatId, downloadUrl, { caption: "🎵 تم التحميل بواسطة بوت أبو فايز" });
    } else {
      await bot.sendVideo(chatId, downloadUrl, { caption: "🎥 تم التحميل بواسطة بوت أبو فايز" });
    }
    
    bot.deleteMessage(chatId, msgId).catch(() => {});
  } catch (error) {
    console.error(error.message);
    bot.editMessageText(`❌ فشل التحميل. تأكد من الرابط وجرب مرة ثانية.`, { chat_id: chatId, message_id: msgId }).catch(()=>{});
  }
}

module.exports = { handleMediaLink, handleCallback };
