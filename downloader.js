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
  bot.editMessageText(isAudio ? `⏳ جاري استخراج الصوت وتجهيزه بصيغة MP3...` : `⏳ جاري جلب الفيديو من السيرفر...`, { chat_id: chatId, message_id: msgId }).catch(()=>{});

  try {
    let downloadUrl = null;
    let mediaTitle = "صوتيات أبو فايز";

    // معالجة خاصة لروابط سمول (Smule) بدون الحاجة لـ RapidAPI
    if (url.includes('smule.com')) {
      const htmlRes = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 15000
      });
      const html = htmlRes.data;

      const audioMatch = html.match(/<meta\s+property="og:audio"\s+content="([^"]+)"/i) || html.match(/content="([^"]+)"\s+property="og:audio"/i);
      const videoMatch = html.match(/<meta\s+property="og:video"\s+content="([^"]+)"/i) || html.match(/content="([^"]+)"\s+property="og:video"/i);
      const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) || html.match(/content="([^"]+)"\s+property="og:title"/i);

      if (titleMatch) mediaTitle = titleMatch[1];

      if (isAudio && audioMatch) {
        downloadUrl = audioMatch[1];
      } else if (!isAudio && videoMatch) {
        downloadUrl = videoMatch[1];
      } else {
        downloadUrl = (audioMatch ? audioMatch[1] : null) || (videoMatch ? videoMatch[1] : null);
      }

      if (!downloadUrl) {
        const perfMatch = html.match(/"secure_url":"([^"]+)"/i);
        if (perfMatch) downloadUrl = perfMatch[1].replace(/\\u002F/g, '/');
      }

      if (!downloadUrl) throw new Error("تعذر استخراج ملف الصوت من سمول.");

    } else {
      // المنصات الأخرى عبر RapidAPI
      const options = {
        method: 'POST',
        url: 'https://social-download-all-in-one.p.rapidapi.com/v1/social/autolink',
        headers: {
          'content-type': 'application/json',
          'X-RapidAPI-Host': 'social-download-all-in-one.p.rapidapi.com',
          'X-RapidAPI-Key': '1aec64407fmsha5c87fdf0cdb4fdp1815a8jsn26a2b2e13f13'
        },
        data: { url: url },
        timeout: 15000
      };

      const response = await axios.request(options);
      const resData = response.data;

      if (resData && resData.medias && Array.isArray(resData.medias)) {
        if (isAudio) {
          const audio = resData.medias.find(m => m.type === 'audio' || m.extension === 'mp3' || m.quality === 'audio');
          downloadUrl = audio ? audio.url : resData.medias[0].url;
        } else {
          const video = resData.medias.find(m => (m.type === 'video' || m.extension === 'mp4') && m.quality !== 'audio');
          downloadUrl = video ? video.url : resData.medias[0].url;
        }
      } else if (resData && resData.url) {
        downloadUrl = resData.url;
      }

      if (resData && resData.title) mediaTitle = resData.title;
    }

    if (!downloadUrl) throw new Error("تعذر استخراج رابط التحميل.");

    bot.editMessageText(`🚀 جاري الإرسال لتليجرام...`, { chat_id: chatId, message_id: msgId }).catch(()=>{});

    const captionText = isAudio ? "🎵 تم التحميل بواسطة بوت أبو فايز" : "🎥 تم التحميل بواسطة بوت أبو فايز";

    if (isAudio) {
      const streamRes = await axios({
        url: downloadUrl,
        method: 'GET',
        responseType: 'stream',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      await bot.sendAudio(chatId, streamRes.data, {
        caption: captionText,
        title: mediaTitle.slice(0, 60),
        performer: "بوت أبو فايز"
      }, {
        filename: `audio_${Date.now()}.mp3`,
        contentType: 'audio/mpeg'
      });
    } else {
      try {
        await bot.sendVideo(chatId, downloadUrl, { caption: captionText });
      } catch (directErr) {
        const streamRes = await axios({
          url: downloadUrl,
          method: 'GET',
          responseType: 'stream',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        await bot.sendVideo(chatId, streamRes.data, { caption: captionText }, {
          filename: `video_${Date.now()}.mp4`,
          contentType: 'video/mp4'
        });
      }
    }

    bot.deleteMessage(chatId, msgId).catch(() => {});

  } catch (error) {
    let errorMsg = error.response?.data?.message || error.message || "حدث خطأ أثناء المعالجة";
    bot.editMessageText(`❌ فشل التحميل:\n${errorMsg}`, { chat_id: chatId, message_id: msgId }).catch(()=>{});
  }
}

module.exports = { handleMediaLink, handleCallback };
