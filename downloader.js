const { execSync } = require('child_process');
const youtubedl = require('youtube-dl-exec');

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

  bot.editMessageText(`⏳ جاري المعالجة وسحب الملف...`, { chat_id: chatId, message_id: msgId });

  try {
    const isAudio = data === "dl_audio";
    
    // سحب الرابط المباشر بأحدث إعدادات متوافقة
    const output = await youtubedl(url, {
      dumpSingleJson: true,
      noWarnings: true,
      noCheckCertificates: true,
      preferFreeFormats: true,
      format: isAudio ? 'bestaudio' : 'best'
    });

    let downloadUrl = output.url;
    if (!downloadUrl && output.requested_downloads) {
      downloadUrl = output.requested_downloads[0].url;
    }

    if (!downloadUrl) throw new Error("تعذر استخراج الرابط المباشر.");

    bot.editMessageText(`🚀 جاري الإرسال لتليجرام...`, { chat_id: chatId, message_id: msgId });

    if (isAudio) {
      await bot.sendAudio(chatId, downloadUrl, { caption: "🎵 تم التحميل بواسطة بوت أبو فايز" });
    } else {
      await bot.sendVideo(chatId, downloadUrl, { caption: "🎥 تم التحميل بواسطة بوت أبو فايز" });
    }

    bot.deleteMessage(chatId, msgId).catch(() => {});

  } catch (error) {
    let errMsg = error.message ? error.message.split('\n')[0] : "فشل التحميل";
    bot.editMessageText(`❌ عذراً: ${errMsg}`, { chat_id: chatId, message_id: msgId });
  }
}

module.exports = { handleMediaLink, handleCallback };
