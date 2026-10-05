const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

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

  const isAudio = data === "dl_audio";
  bot.editMessageText(`⏳ جاري المعالجة والتحميل...`, { chat_id: chatId, message_id: msgId }).catch(()=>{});

  const fileName = `media_${Date.now()}`;
  const ext = isAudio ? 'mp3' : 'mp4';
  const filePath = path.join(__dirname, `${fileName}.${ext}`);

  const ytArgs = '--extractor-args "youtube:player_client=android"';
  
  let command = '';
  if (isAudio) {
    command = `yt-dlp ${ytArgs} -x --audio-format mp3 -o "${filePath}" "${url}"`;
  } else {
    command = `yt-dlp ${ytArgs} -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" -o "${filePath}" "${url}"`;
  }

  exec(command, async (error, stdout, stderr) => {
    if (error) {
      console.error(`yt-dlp error: ${error.message}`);
      return bot.editMessageText(`❌ فشل التحميل بسبب حماية يوتيوب.`, { chat_id: chatId, message_id: msgId }).catch(()=>{});
    }

    bot.editMessageText(`🚀 جاري الإرسال لتليجرام...`, { chat_id: chatId, message_id: msgId }).catch(()=>{});

    try {
      if (isAudio) {
        await bot.sendAudio(chatId, filePath, { caption: "🎵 تم التحميل بواسطة بوت أبو فايز" });
      } else {
        await bot.sendVideo(chatId, filePath, { caption: "🎥 تم التحميل بواسطة بوت أبو فايز" });
      }
      
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      bot.deleteMessage(chatId, msgId).catch(() => {});
    } catch (sendError) {
      console.error(sendError);
      bot.editMessageText(`❌ فشل إرسال الملف.`, { chat_id: chatId, message_id: msgId }).catch(()=>{});
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  });
}

module.exports = { handleMediaLink, handleCallback };
