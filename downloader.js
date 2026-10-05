const axios = require('axios');

// تخزين الروابط مؤقتاً بالذاكرة بناءً على رقم الشات لتنفيذ التحميل
const userLinks = new Map();

async function handleMediaLink(bot, msg) {
  const chatId = msg.chat.id;
  const url = msg.text.trim();

  userLinks.set(chatId, url);

  const keyboard = [
    [{ text: "🎥 فيديو سريع (720p)", callback_data: `dl_video_720` }],
    [{ text: "🎬 فيديو عالي الدقة (1080p)", callback_data: `dl_video_1080` }],
    [{ text: "🎵 استخراج الصوت (MP3)", callback_data: `dl_audio` }]
  ];

  bot.sendMessage(chatId, `📌 **استلمت الرابط:**\nشو الصيغة اللي حابب تنزله فيها يا أبو فايز؟`, {
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
    return bot.editMessageText(`❌ الرابط قديم أو مفقود من الذاكرة، ابعته مرة تانية.`, { chat_id: chatId, message_id: msgId });
  }

  bot.editMessageText(`⏳ جاري سحب الملف وفك تشفيره...`, { chat_id: chatId, message_id: msgId });

  const isAudio = data === "dl_audio";
  const quality = data === "dl_video_1080" ? "1080" : "720";

  try {
    // استخدام API مجانية وسريعة جداً (Cobalt) لا تستهلك أي موارد من سيرفرك
    const response = await axios.post('https://api.cobalt.tools/api/json', {
      url: url,
      vQuality: quality,
      isAudioOnly: isAudio,
      aFormat: "mp3"
    }, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });

    const fileUrl = response.data.url;

    if (!fileUrl) throw new Error("لم أتمكن من استخراج الرابط المباشر للملف.");

    bot.editMessageText(`🚀 جاري الإرسال لتليجرام... (ثواني وبيوصلك)`, { chat_id: chatId, message_id: msgId });

    if (isAudio) {
      await bot.sendAudio(chatId, fileUrl, { caption: "🎵 تم التحميل بواسطة بوت أبو فايز" });
    } else {
      await bot.sendVideo(chatId, fileUrl, { caption: "🎥 تم التحميل بواسطة بوت أبو فايز" });
    }
    
    // مسح رسالة التحميل لتنظيف الشات بعد النجاح
    bot.deleteMessage(chatId, msgId).catch(()=>{});

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
