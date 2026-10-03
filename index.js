const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const axios = require('axios');
const AdmZip = require('adm-zip');

const token = process.env.BOT_TOKEN;
const adminId = process.env.ADMIN_ID;
const ghToken = process.env.GITHUB_TOKEN;
const ghUser = process.env.GITHUB_USERNAME;

const bot = new TelegramBot(token, { polling: true });
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('البوت شغال 100% 🚀'));
app.listen(port, () => {
  console.log("Server running on port " + port);
  setInterval(() => {
    axios.get("https://tg-manager-bot-zwuv.onrender.com").catch(() => {});
  }, 10 * 60 * 1000);
});

const ghHeaders = {
  "Authorization": `token ${ghToken}`,
  "Accept": "application/vnd.github.v3+json",
  "User-Agent": "TG-Node-Bot"
};

let userState = { repo: null, action: null, time: 0, path: "" };

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  if (chatId.toString() !== adminId) return bot.sendMessage(chatId, "🔒 مقفل.");
  userState = { repo: null, action: null, time: 0, path: "" };
  await sendReposMenu(chatId, 1);
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const msgId = query.message.message_id;
  const data = query.data;

  bot.answerCallbackQuery(query.id).catch(() => {});

  if (data.startsWith("page:")) {
    await sendReposMenu(chatId, parseInt(data.split(":")[1]), msgId);
  } 
  else if (data.startsWith("repo:")) {
    userState.repo = data.split(":")[1];
    userState.action = null;
    await sendRepoOptions(chatId, userState.repo, msgId);
  } 
  else if (data.startsWith("confirm_empty:")) {
    const targetRepo = data.split(":")[1];
    const confirmMenu = {
      inline_keyboard: [
        [{ text: "⚠️ نعم، احذف كل شيء نهائياً!", callback_data: `empty_repo:${targetRepo}` }],
        [{ text: "❌ تراجع وإلغاء", callback_data: `repo:${targetRepo}` }]
      ]
    };
    bot.editMessageText(`⚠️ **تأكيد فرمتة المستودع:** \`${targetRepo}\`\n\nهل أنت متأكد تماماً؟ سيتم مسح **جميع** الملفات والمجلدات ولا يمكن التراجع!`, {
      chat_id: chatId,
      message_id: msgId,
      parse_mode: "Markdown",
      reply_markup: confirmMenu
    });
  }
  else if (data.startsWith("empty_repo:")) {
    const targetRepo = data.split(":")[1];
    bot.editMessageText(`⏳ جاري مسح كافة المحتويات في \`${targetRepo}\`...`, { chat_id: chatId, message_id: msgId, parse_mode: "Markdown" });
    await emptyRepository(chatId, targetRepo, msgId);
  }
  else if (data.startsWith("act:")) {
    const parts = data.split(":");
    const action = parts[1];
    const repo = parts[2];

    userState.repo = repo;
    userState.action = action;
    userState.time = Date.now();

    if (action === "upload") {
      bot.sendMessage(chatId, `📌 **وضع الرفع المتعدد مفتوح الآن لمستودع:** \`${repo}\`\n\n👇 ابعت الملفات أو الصور مباشرة (دفعة وحدة أو ورا بعض). إذا بدك مجلد مخصص اكتب اسمه بالـ Caption.`, { parse_mode: "Markdown" });
    }
    else if (action === "zip") {
      bot.sendMessage(chatId, `📌 **رفع وفك ZIP** 📦 لمستودع: \`${repo}\`\n\n👇 ابعت ملف الـ ZIP مباشرة.`, { parse_mode: "Markdown" });
    }
    else if (action === "newfile") {
      bot.sendMessage(chatId, `📌 **إنشاء ملف كود** في: \`${repo}\`\n\n👇 اعمل رد (Reply) على هذه الرسالة واكتب:\nاسم_الملف.html\nالكود يبدأ من السطر الثاني`, { reply_markup: { force_reply: true } });
    }
    else if (action === "newdir") {
      bot.sendMessage(chatId, `📌 **إنشاء مجلد** في: \`${repo}\`\n\n👇 اعمل رد (Reply) على هذه الرسالة واكتب اسم المجلد.`, { reply_markup: { force_reply: true } });
    }
    else if (action === "delete") {
      bot.sendMessage(chatId, `📌 **حذف ملف أو مجلد** من: \`${repo}\`\n\n👇 اعمل رد (Reply) على هذه الرسالة واكتب مسار الملف أو المجلد لحذفه.`, { reply_markup: { force_reply: true } });
    }
  }
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  if (chatId.toString() !== adminId || msg.text === "/start") return;
  if (!userState.repo) return bot.sendMessage(chatId, "⚠️ اختار مستودع أولاً من /start");

  const repo = userState.repo;
  const isReply = msg.reply_to_message;
  let fileObj = msg.document || msg.video || msg.audio;
  if (msg.photo) fileObj = msg.photo[msg.photo.length - 1];

  try {
    // 1. معالجة ملفات ZIP
    if (fileObj && (userState.action === "zip" || (fileObj.file_name && fileObj.file_name.endsWith(".zip")))) {
      if (fileObj.file_size > 20971520) {
        return bot.sendMessage(chatId, `❌ حجم الملف تجاوز 20 ميغا (حد تيليغرام للبوتات).`);
      }
      const statusMsg = await bot.sendMessage(chatId, `⏳ جاري تحميل وفك الضغط...`);
      const fileUrl = await bot.getFileLink(fileObj.file_id);
      const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
      await bot.editMessageText(`⏳ جاري رفع الشجرة الكاملة إلى \`${repo}\`...`, { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" });
      await extractAndUploadZip(chatId, repo, response.data, statusMsg.message_id);
      return;
    }

    // 2. معالجة أي ملف عادي (دعم الرفع المباشر والمتعدد)
    if (fileObj) {
      if (fileObj.file_size > 20971520) {
        return bot.sendMessage(chatId, `❌ ملف \`${fileObj.file_name || 'الملف'}\` أكبر من 20 ميغا.`);
      }
      const customPath = (msg.caption || userState.path || "").trim();
      const rawFileName = fileObj.file_name || `file_${Date.now()}`;
      const finalPath = customPath ? `${customPath}/${rawFileName}` : rawFileName;

      const statusMsg = await bot.sendMessage(chatId, `⏳ جاري رفع \`${rawFileName}\`...`);
      const fileUrl = await bot.getFileLink(fileObj.file_id);
      const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
      const base64Content = Buffer.from(response.data).toString('base64');

      await executeGitHubAction(chatId, repo, finalPath, base64Content, "رفع ملف", statusMsg.message_id);
      return;
    }

    // 3. معالجة النصوص والردود
    if (isReply && msg.text) {
      const parent = isReply.text || "";
      if (parent.includes("إنشاء ملف كود")) {
        const lines = msg.text.split("\n");
        const path = lines[0].trim();
        const content = lines.slice(1).join("\n");
        const statusMsg = await bot.sendMessage(chatId, `⏳ جاري إنشاء \`${path}\`...`);
        await executeGitHubAction(chatId, repo, path, Buffer.from(content).toString('base64'), "إنشاء ملف جديد", statusMsg.message_id);
      }
      else if (parent.includes("إنشاء مجلد")) {
        const path = `${msg.text.trim()}/.gitkeep`;
        const statusMsg = await bot.sendMessage(chatId, `⏳ جاري إنشاء المجلد...`);
        await executeGitHubAction(chatId, repo, path, Buffer.from("").toString('base64'), "إنشاء مجلد", statusMsg.message_id);
      }
      else if (parent.includes("حذف ملف أو مجلد")) {
        const path = msg.text.trim();
        const statusMsg = await bot.sendMessage(chatId, `⏳ جاري فحص ومسح \`${path}\`...`);
        await processDelete(chatId, repo, path, statusMsg.message_id);
      }
    }
  } catch (err) {
    bot.sendMessage(chatId, `❌ خطأ: ${err.message}`);
  }
});

async function sendReposMenu(chatId, page, messageId = null) {
  try {
    const res = await axios.get(`https://api.github.com/users/${ghUser}/repos?sort=updated&per_page=100`, { headers: ghHeaders });
    const repos = res.data;
    const itemsPerPage = 10;
    const totalPages = Math.ceil(repos.length / itemsPerPage);
    const start = (page - 1) * itemsPerPage;
    const currentRepos = repos.slice(start, start + itemsPerPage);

    const keyboard = currentRepos.map(r => [{ text: `📁 ${r.name}`, callback_data: `repo:${r.name}` }]);
    
    let navButtons = [];
    if (page > 1) navButtons.push({ text: "◀️ السابق", callback_data: `page:${page - 1}` });
    navButtons.push({ text: `${page}/${totalPages}`, callback_data: "ignore" });
    if (page < totalPages) navButtons.push({ text: "التالي ▶️", callback_data: `page:${page + 1}` });
    if (navButtons.length > 0) keyboard.push(navButtons);

    const opts = { parse_mode: "Markdown", reply_markup: { inline_keyboard: keyboard } };
    if (messageId) bot.editMessageText("👇 **اختر المستودع للعمل عليه:**", { chat_id: chatId, message_id: messageId, ...opts });
    else bot.sendMessage(chatId, "👇 **اختر المستودع للعمل عليه:**", opts);
  } catch (e) {
    bot.sendMessage(chatId, "❌ تعذر جلب قائمة المستودعات.");
  }
}

async function sendRepoOptions(chatId, repoName, messageId) {
  const keyboard = [
    [{ text: "📤 رفع ملفات", callback_data: `act:upload:${repoName}` }, { text: "📦 رفع وفك ZIP", callback_data: `act:zip:${repoName}` }],
    [{ text: "📄 إنشاء ملف", callback_data: `act:newfile:${repoName}` }, { text: "📁 إنشاء مجلد", callback_data: `act:newdir:${repoName}` }],
    [{ text: "🗑️ حذف ملف/مجلد", callback_data: `act:delete:${repoName}` }],
    [{ text: "💣 فرمتة المستودع", callback_data: `confirm_empty:${repoName}` }],
    [{ text: "🔙 رجوع للقائمة", callback_data: `page:1` }]
  ];
  bot.editMessageText(`🛠️ **المستودع النشط:** \`${repoName}\`\nاختر العملية المطلوبة:`, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: keyboard }
  });
}

async function extractAndUploadZip(chatId, repo, zipBuffer, msgId) {
  try {
    const zip = new AdmZip(zipBuffer);
    const zipEntries = zip.getEntries();
    let tree = [];

    const repoInfo = await axios.get(`https://api.github.com/repos/${ghUser}/${repo}`, { headers: ghHeaders });
    const branch = repoInfo.data.default_branch || "main";
    const refInfo = await axios.get(`https://api.github.com/repos/${ghUser}/${repo}/git/refs/heads/${branch}`, { headers: ghHeaders });
    const baseCommitSha = refInfo.data.object.sha;

    for (let entry of zipEntries) {
      if (!entry.isDirectory && !entry.entryName.includes('__MACOSX') && !entry.entryName.includes('.DS_Store')) {
        const content = entry.getData().toString('base64');
        const blobRes = await axios.post(`https://api.github.com/repos/${ghUser}/${repo}/git/blobs`, { content, encoding: 'base64' }, { headers: ghHeaders });
        tree.push({ path: entry.entryName, mode: '100644', type: 'blob', sha: blobRes.data.sha });
      }
    }

    if (tree.length === 0) return bot.editMessageText(`❌ ملف ZIP لا يحتوي على ملفات صالحة.`, { chat_id: chatId, message_id: msgId });

    const treeRes = await axios.post(`https://api.github.com/repos/${ghUser}/${repo}/git/trees`, { base_tree: baseCommitSha, tree }, { headers: ghHeaders });
    const commitRes = await axios.post(`https://api.github.com/repos/${ghUser}/${repo}/git/commits`, { message: "📦 رفع مجلد عبر ملف ZIP", tree: treeRes.data.sha, parents: [baseCommitSha] }, { headers: ghHeaders });
    await axios.patch(`https://api.github.com/repos/${ghUser}/${repo}/git/refs/heads/${branch}`, { sha: commitRes.data.sha }, { headers: ghHeaders });

    bot.editMessageText(`✅ **تم فك الضغط ورفع (${tree.length}) ملف بنجاح!** 🚀`, {
      chat_id: chatId,
      message_id: msgId,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "🔙 رجوع", callback_data: `repo:${repo}` }]] }
    });
  } catch (e) {
    bot.editMessageText(`❌ فشلت معالجة ملف الـ ZIP: ${e.message}`, { chat_id: chatId, message_id: msgId });
  }
}

async function executeGitHubAction(chatId, repo, path, base64Content, commitMsg, msgId) {
  try {
    let sha = null;
    try {
      const checkRes = await axios.get(`https://api.github.com/repos/${ghUser}/${repo}/contents/${path}`, { headers: ghHeaders });
      sha = checkRes.data.sha;
    } catch (e) {}

    const payload = { message: commitMsg, content: base64Content };
    if (sha) payload.sha = sha;

    await axios.put(`https://api.github.com/repos/${ghUser}/${repo}/contents/${path}`, payload, { headers: ghHeaders });
    const liveUrl = `https://${ghUser}.github.io/${repo}/`;
    
    bot.editMessageText(`✅ **تم حفظ الملف بنجاح!**\n📄 \`${path}\`\n🌐 [معاينة في Pages](${liveUrl})`, {
      chat_id: chatId,
      message_id: msgId,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: [[{ text: "🔙 رجوع للمستودع", callback_data: `repo:${repo}` }]] }
    });
  } catch (e) {
    bot.editMessageText(`❌ فشل رفع الملف: ${e.message}`, { chat_id: chatId, message_id: msgId });
  }
}

async function processDelete(chatId, repo, path, msgId) {
  try {
    const checkRes = await axios.get(`https://api.github.com/repos/${ghUser}/${repo}/contents/${path}`, { headers: ghHeaders });
    const data = checkRes.data;

    if (Array.isArray(data)) {
      bot.editMessageText(`⏳ جاري تنظيف المجلد \`${path}\` وكل ما بداخله...`, { chat_id: chatId, message_id: msgId, parse_mode: "Markdown" });
      for (let item of data) await deleteRecursive(repo, item.path);
    } else {
      await axios.delete(`https://api.github.com/repos/${ghUser}/${repo}/contents/${path}`, {
        headers: ghHeaders,
        data: { message: `حذف ${path}`, sha: data.sha }
      });
    }
    bot.editMessageText(`✅ تم حذف \`${path}\` بنجاح! 🗑️`, {
      chat_id: chatId,
      message_id: msgId,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "🔙 رجوع للمستودع", callback_data: `repo:${repo}` }]] }
    });
  } catch (e) {
    bot.editMessageText(`❌ المسار غير موجود أو تعذر حذفه.`, { chat_id: chatId, message_id: msgId });
  }
}

async function deleteRecursive(repo, path) {
  try {
    const res = await axios.get(`https://api.github.com/repos/${ghUser}/${repo}/contents/${path}`, { headers: ghHeaders });
    const data = res.data;
    if (Array.isArray(data)) {
      for (let item of data) await deleteRecursive(repo, item.path);
    } else {
      await axios.delete(`https://api.github.com/repos/${ghUser}/${repo}/contents/${path}`, {
        headers: ghHeaders,
        data: { message: `Delete ${path}`, sha: data.sha }
      });
    }
  } catch (e) {}
}

async function emptyRepository(chatId, repo, msgId) {
  try {
    const contentsRes = await axios.get(`https://api.github.com/repos/${ghUser}/${repo}/contents`, { headers: ghHeaders });
    const files = contentsRes.data;

    if (!files || files.length === 0) {
      return bot.editMessageText(`ℹ️ المستودع فارغ بالفعل.`, {
        chat_id: chatId,
        message_id: msgId,
        reply_markup: { inline_keyboard: [[{ text: "🔙 رجوع", callback_data: `repo:${repo}` }]] }
      });
    }

    for (let item of files) {
      if (item.type === "dir") {
        await deleteRecursive(repo, item.path);
      } else {
        await axios.delete(`https://api.github.com/repos/${ghUser}/${repo}/contents/${item.path}`, {
          headers: ghHeaders,
          data: { message: `حذف نهائي: ${item.path}`, sha: item.sha }
        });
      }
    }

    bot.editMessageText(`💣 **تم تفريغ المستودع \`${repo}\` بالكامل بنجاح!**\nأصبح نظيفاً تماماً الآن.`, {
      chat_id: chatId,
      message_id: msgId,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "🔙 رجوع للمستودع", callback_data: `repo:${repo}` }]] }
    });
  } catch (e) {
    bot.editMessageText(`❌ فشلت عملية الفرمتة: ${e.message}`, { chat_id: chatId, message_id: msgId });
  }
}
