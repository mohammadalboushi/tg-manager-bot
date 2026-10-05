const youtubedl = require('youtube-dl-exec');

const userLinks = new Map();

async function handleMediaLink(bot, msg) {
  const chatId = msg.chat.id;
  const url = msg.text.trim();

  userLinks.set(chatId, url);

  const keyboard = [
    [{ text: "🎥 فيديو (أفضل جودة)", callback_data: `dl_video` }],
    [{ text: "🎵 صوت فقط", callback_data: `dl_audio` }]
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

  bot.editMessageText(`⏳ جاري المعالجة داخلياً وفك التشفير (ثواني بس)...`, { chat_id: chatId, message_id: msgId });

  try {
    const isAudio = data === "dl_audio";
    
    // إعدادات السحب (صوت أو فيديو)
    const options = {
      dumpSingleJson: true,
      noWarnings: true,
      format: isAudio ? 'bestaudio' : 'best'
    };

    // استخراج الرابط المباشر للميديا
    const info = await youtubedl(url, options);
    let downloadUrl = info.url;

    if (!downloadUrl && info.requested_downloads) {
      downloadUrl = info.requested_downloads[0].url;
    }

    if (!downloadUrl) throw new Error("تعذر سحب الرابط المباشر من هذا الموقع.");

    bot.editMessageText(`🚀 جاري الإرسال لتليجرام...`, { chat_id: chatId, message_id: msgId });

    if (isAudio) {
      await bot.sendAudio(chatId, downloadUrl, { caption: "🎵 تم التحميل بواسطة بوت أبو فايز" });
    } else {
      await bot.sendVideo(chatId, downloadUrl, { caption: "🎥 تم التحميل بواسطة بوت أبو فايز" });
    }

    bot.deleteMessage(chatId, msgId).catch(() => {});

  } catch (error) {
    // التقاط الخطأ وعرض أول سطر منه فقط ليكون واضح
    const errMsg = error.message ? error.message.split('\n')[0] : "فشل التحميل";
    bot.editMessageText(`❌ عذراً، صار مشكلة: ${errMsg}`, { chat_id: chatId, message_id: msgId });
  }
}

module.exports = { handleMediaLink, handleCallback };
