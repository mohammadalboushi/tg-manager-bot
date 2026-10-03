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

// نظام إبقاء السيرفر مستيقظ
app.get('/', (req, res) => res.send('البوت شغال وصاحي 100% 🚀'));
app.listen(port, () => {
  console.log("Server running on port " + port);
  setInterval(() => {
    axios.get("https://tg-manager-bot-zwuv.onrender.com").catch(() => {});
  }, 10 * 60 * 1000);
});

// إعدادات غيتهوب العامة
const ghHeaders = {
  "Authorization": `token ${ghToken}`,
  "Accept": "application/vnd.github.v3+json",
  "User-Agent": "TG-Node-Bot"
};

let userState = { repo: null, action: null };

// ================== الأوامر الأساسية ================== //

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  if (chatId.toString() !== adminId) return bot.sendMessage(chatId, "🔒 مقفل.");
  userState = { repo: null, action: null };
  await sendReposMenu(chatId, 1);
});

// ================== معالجة القوائم (Callback Queries) ================== //

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const msgId = query.message.message_id;
  const data = query.data;

  bot.answerCallbackQuery(query.id).catch(()=>{});

  if (data.startsWith("page:")) {
    await sendReposMenu(chatId, parseInt(data.split(":")[1]), msgId);
  } 
  else if (data.startsWith("repo:")) {
    userState.repo = data.split(":")[1];
    await sendRepoOptions(chatId, userState.repo, msgId);
  } 
  else if (data.startsWith("confirm_empty:")) {
    const confirmMenu = {
      inline_keyboard: [
        [{ text: "✅ نعم، دمر كل شيء!", callback_data: `empty_repo:${userState.repo}` }],
        [{ text: "❌ إلغاء", callback_data: `repo:${userState.repo}` }]
      ]
    };
    bot.editMessageText(`⚠️ **تحذير خطير!**\nمتأكد بدك تحذف كل شي بمستودع \`${userState.repo}\`؟`, { chat_id: chatId, message_id: msgId, parse_mode: "Markdown", reply_markup: confirmMenu });
  }
  else if (data.startsWith("empty_repo:")) {
    bot.editMessageText(`⏳ جاري فرمتة \`${userState.repo}\`...`, { chat_id: chatId, message_id: msgId, parse_mode: "Markdown" });
    await emptyRepository(chatId, userState.repo, msgId);
  }
  else if (data.startsWith("act:")) {
    const action = data.split(":")[1];
    userState.action = action;

    let replyMsg = "";
    if (action === "upload") replyMsg = `📌 **رفع ملفات عادية**\nالمستودع: ${userState.repo}\n👇 ابعت الملفات أو الصور مباشرة. (إذا بدك ياها بمجلد، اكتب مساره بالوصف Caption).`;
    else if (action === "zip") replyMsg = `📌 **رفع وفك ZIP** 📦\nالمستودع: ${userState.repo}\n👇 ابعت ملف الـ ZIP ليتم فرده بالكامل داخل المستودع.`;
    else if (action === "newfile") replyMsg = `📌 **إنشاء ملف كود**\nالمستودع: ${userState.repo}\n👇 اعمل رد (Reply) واكتب:\nاسم_الملف.html\n(السطر التاني الكود)`;
    else if (action === "newdir") replyMsg = `📌 **إنشاء مجلد**\nالمستودع: ${userState.repo}\n👇 اعمل رد (Reply) واكتب اسم المجلد فقط.`;
    else if (action === "delete") replyMsg = `📌 **حذف ملف/مجلد**\nالمستودع: ${userState.repo}\n👇 اعمل رد (Reply) واكتب المسار الكامل للحذف.`;

    bot.sendMessage(chatId, replyMsg, { reply_markup: { force_reply: true } });
  }
});

// ================== استقبال الملفات والنصوص ================== //

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  if (chatId.toString() !== adminId || msg.text === "/start") return;
  if (!userState.repo) return bot.sendMessage(chatId, "⚠️ اختار مستودع أولاً من /start");

  const repo = userState.repo;
  const isReply = msg.reply_to_message;
  let fileObj = msg.document || msg.video || msg.audio;
  if (msg.photo) fileObj = msg.photo[msg.photo.length - 1];

  try {
    // 1. التعامل مع ملف ZIP وفرده (النواة التقيلة)
    if (userState.action === "zip" && fileObj && fileObj.mime_type === "application/zip") {
      const statusMsg = await bot.sendMessage(chatId, `⏳ عم اسحب ملف الـ ZIP...`);
      const fileUrl = await bot.getFileLink(fileObj.file_id);
      const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
      await bot.editMessageText(`⏳ جاري فك الضغط ورفع الشجرة لـ \`${repo}\`...`, { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" });
      await extractAndUploadZip(chatId, repo, response.data, statusMsg.message_id);
      userState.action = null;
      return;
    }

    // 2. الرفع العادي
    if (fileObj) {
      const customPath = (msg.caption || "").trim();
      const rawFileName = fileObj.file_name || `file_${Date.now()}`;
      const finalPath = customPath ? `${customPath}/${rawFileName}` : rawFileName;
      
      const statusMsg = await bot.sendMessage(chatId, `⏳ جاري رفع \`${rawFileName}\`...`);
      const fileUrl = await bot.getFileLink(fileObj.file_id);
      const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
      const base64Content = Buffer.from(response.data).toString('base64');
      
      await executeGitHubAction(chatId, repo, finalPath, base64Content, "رفع ملف", statusMsg.message_id);
      return;
    }

    // 3. معالجة النصوص (إنشاء/حذف)
    if (isReply && msg.text) {
      const action = userState.action;
      if (action === "newfile") {
        const lines = msg.text.split("\n");
        const path = lines[0].trim();
        const content = lines.slice(1).join("\n");
        const statusMsg = await bot.sendMessage(chatId, `⏳ جاري إنشاء \`${path}\`...`);
        await executeGitHubAction(chatId, repo, path, Buffer.from(content).toString('base64'), "إنشاء ملف", statusMsg.message_id);
      } 
      else if (action === "newdir") {
        const path = `${msg.text.trim()}/.gitkeep`;
        const statusMsg = await bot.sendMessage(chatId, `⏳ جاري إنشاء مجلد...`);
        await executeGitHubAction(chatId, repo, path, Buffer.from("").toString('base64'), "إنشاء مجلد", statusMsg.message_id);
      }
      else if (action === "delete") {
        const path = msg.text.trim();
        const statusMsg = await bot.sendMessage(chatId, `⏳ جاري فحص \`${path}\` للحذف...`);
        await processDelete(chatId, repo, path, statusMsg.message_id);
      }
      userState.action = null; // تفريغ الحالة بعد التنفيذ
    }

  } catch (err) {
    bot.sendMessage(chatId, `❌ صار خطأ: ${err.message}`);
  }
});

// ================== الدوال الجوهرية (GitHub API) ================== //

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
    if (page > 1) navButtons.push({ text: "◀️", callback_data: `page:${page - 1}` });
    navButtons.push({ text: `${page}/${totalPages}`, callback_data: "ignore" });
    if (page < totalPages) navButtons.push({ text: "▶️", callback_data: `page:${page + 1}` });
    if (navButtons.length > 0) keyboard.push(navButtons);

    const opts = { parse_mode: "Markdown", reply_markup: { inline_keyboard: keyboard } };
    if (messageId) bot.editMessageText("👇 **اختر المستودع:**", { chat_id: chatId, message_id: messageId, ...opts });
    else bot.sendMessage(chatId, "👇 **اختر المستودع:**", opts);
  } catch (e) {
    bot.sendMessage(chatId, "❌ فشل جلب المستودعات.");
  }
}

async function sendRepoOptions(chatId, repoName, messageId) {
  const keyboard = [
    [{ text: "📤 رفع ملفات", callback_data: `act:upload` }, { text: "📦 رفع وفك ZIP", callback_data: `act:zip` }],
    [{ text: "📄 إنشاء ملف", callback_data: `act:newfile` }, { text: "📁 إنشاء مجلد", callback_data: `act:newdir` }],
    [{ text: "🗑️ حذف ملف/مجلد", callback_data: `act:delete` }],
    [{ text: "💣 فرمتة المستودع", callback_data: `confirm_empty` }],
    [{ text: "🔙 رجوع للقائمة", callback_data: `page:1` }]
  ];
  bot.editMessageText(`🛠️ **مستودع:** \`${repoName}\`\nاختار العملية:`, { chat_id: chatId, message_id: messageId, parse_mode: "Markdown", reply_markup: { inline_keyboard: keyboard } });
}

// السحر الحقيقي: رفع ملف ZIP كشجرة كاملة بـ Commit واحد (أسرع طريقة)
async function extractAndUploadZip(chatId, repo, zipBuffer, msgId) {
  try {
    const zip = new AdmZip(zipBuffer);
    const zipEntries = zip.getEntries();
    let tree = [];

    // الحصول على الـ Branch الأساسي
    const repoInfo = await axios.get(`https://api.github.com/repos/${ghUser}/${repo}`, { headers: ghHeaders });
    const branch = repoInfo.data.default_branch || "main";
    const refInfo = await axios.get(`https://api.github.com/repos/${ghUser}/${repo}/git/refs/heads/${branch}`, { headers: ghHeaders });
    const baseTreeSha = refInfo.data.object.sha;

    for (let entry of zipEntries) {
      if (!entry.isDirectory && !entry.entryName.includes('__MACOSX') && !entry.entryName.includes('.DS_Store')) {
        const content = entry.getData().toString('base64');
        // رفع الـ Blob (الملف المجرد)
        const blobRes = await axios.post(`https://api.github.com/repos/${ghUser}/${repo}/git/blobs`, { content: content, encoding: 'base64' }, { headers: ghHeaders });
        tree.push({ path: entry.entryName, mode: '100644', type: 'blob', sha: blobRes.data.sha });
      }
    }

    if (tree.length === 0) return bot.editMessageText(`❌ ملف الـ ZIP فارغ أو غير صالح.`, { chat_id: chatId, message_id: msgId });

    // إنشاء الشجرة الجديدة
    const treeRes = await axios.post(`https://api.github.com/repos/${ghUser}/${repo}/git/trees`, { base_tree: baseTreeSha, tree: tree }, { headers: ghHeaders });
    
    // إنشاء الكوميت
    const commitRes = await axios.post(`https://api.github.com/repos/${ghUser}/${repo}/git/commits`, { message: "📦 رفع مجلد عن طريق ملف ZIP", tree: treeRes.data.sha, parents: [baseTreeSha] }, { headers: ghHeaders });
    
    // تحديث المستودع
    await axios.patch(`https://api.github.com/repos/${ghUser}/${repo}/git/refs/heads/${branch}`, { sha: commitRes.data.sha }, { headers: ghHeaders });

    bot.editMessageText(`✅ **تم فك الـ ZIP ورفع ${tree.length} ملف بنجاح!** 🚀`, { chat_id: chatId, message_id: msgId, parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "🔙 رجوع", callback_data: `repo:${repo}` }]]} });
  } catch (e) {
    bot.editMessageText(`❌ فشل معالجة الـ ZIP.`, { chat_id: chatId, message_id: msgId });
  }
}

async function executeGitHubAction(chatId, repo, path, base64Content, commitMsg, msgId) {
  try {
    let sha = null;
    try {
      const checkRes = await axios.get(`https://api.github.com/repos/${ghUser}/${repo}/contents/${path}`, { headers: ghHeaders });
      sha = checkRes.data.sha;
    } catch (e) {} // إذا مو موجود بيعطي خطأ، منتجاهله ومنكمل لإنشاؤه

    const payload = { message: commitMsg, content: base64Content };
    if (sha) payload.sha = sha;

    await axios.put(`https://api.github.com/repos/${ghUser}/${repo}/contents/${path}`, payload, { headers: ghHeaders });
    const liveUrl = `https://${ghUser}.github.io/${repo}/`;
    
    bot.editMessageText(`✅ **تمت العملية!**\n📄 \`${path}\`\n🌐 [معاينة التغييرات](${liveUrl})`, { chat_id: chatId, message_id: msgId, parse_mode: "Markdown", disable_web_page_preview: true, reply_markup: { inline_keyboard: [[{ text: "🔙 رجوع", callback_data: `repo:${repo}` }]]} });
  } catch (e) {
    bot.editMessageText(`❌ فشل الرفع. تأكد من المسار.`, { chat_id: chatId, message_id: msgId });
  }
}

async function processDelete(chatId, repo, path, msgId) {
  try {
    const checkRes = await axios.get(`https://api.github.com/repos/${ghUser}/${repo}/contents/${path}`, { headers: ghHeaders });
    const data = checkRes.data;

    if (Array.isArray(data)) {
      bot.editMessageText(`⏳ عم امسح المجلد ومحتوياته...`, { chat_id: chatId, message_id: msgId });
      for (let item of data) await processDeleteRecursive(repo, item.path);
    } else {
      await axios.delete(`https://api.github.com/repos/${ghUser}/${repo}/contents/${path}`, { headers: ghHeaders, data: { message: `حذف ${path}`, sha: data.sha } });
    }
    bot.editMessageText(`✅ تم الحذف بنجاح! 🗑️`, { chat_id: chatId, message_id: msgId, reply_markup: { inline_keyboard: [[{ text: "🔙 رجوع", callback_data: `repo:${repo}` }]]} });
  } catch (e) {
    bot.editMessageText(`❌ الملف أو المجلد غير موجود.`, { chat_id: chatId, message_id: msgId });
  }
}

async function processDeleteRecursive(repo, path) {
  try {
    const res = await axios.get(`https://api.github.com/repos/${ghUser}/${repo}/contents/${path}`, { headers: ghHeaders });
    const data = res.data;
    if (Array.isArray(data)) {
      for (let item of data) await processDeleteRecursive(repo, item.path);
    } else {
      await axios.delete(`https://api.github.com/repos/${ghUser}/${repo}/contents/${path}`, { headers: ghHeaders, data: { message: `Delete ${path}`, sha: data.sha } });
    }
  } catch (e) {}
}

async function emptyRepository(chatId, repo, msgId) {
  try {
    const repoInfo = await axios.get(`https://api.github.com/repos/${ghUser}/${repo}`, { headers: ghHeaders });
    const branch = repoInfo.data.default_branch || "main";
    const refInfo = await axios.get(`https://api.github.com/repos/${ghUser}/${repo}/git/refs/heads/${branch}`, { headers: ghHeaders });
    const currentSha = refInfo.data.object.sha;
    
    const emptyTreeSha = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
    const commitRes = await axios.post(`https://api.github.com/repos/${ghUser}/${repo}/git/commits`, { message: "💣 فرمتة كاملة", tree: emptyTreeSha, parents: [currentSha] }, { headers: ghHeaders });
    
    await axios.patch(`https://api.github.com/repos/${ghUser}/${repo}/git/refs/heads/${branch}`, { sha: commitRes.data.sha }, { headers: ghHeaders });
    bot.editMessageText(`✅ **تم فرمتة المستودع بالكامل!** 💣`, { chat_id: chatId, message_id: msgId, parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "🔙 رجوع", callback_data: `repo:${repo}` }]]} });
  } catch (e) {
    bot.editMessageText(`❌ فشل التدمير.`, { chat_id: chatId, message_id: msgId });
  }
}
