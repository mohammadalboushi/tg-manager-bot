const axios = require('axios');
const AdmZip = require('adm-zip');

const ghToken = process.env.GITHUB_TOKEN;
const ghUser = process.env.GITHUB_USERNAME;

const ghHeaders = {
  "Authorization": `token ${ghToken}`,
  "Accept": "application/vnd.github.v3+json",
  "User-Agent": "TG-Node-Bot"
};

let userState = { repo: null, action: null, time: 0, path: "" };
const uploadQueues = new Map();
let bot; // سيتم تمريره من الاندكس

// دالة لاستلام البوت من الاندكس
function initGithub(botInstance) {
  bot = botInstance;
}

async function processAlbumAsOneCommit(chatId, repo, queueData) {
  uploadQueues.delete(chatId);
  const items = queueData.items;
  if (!items || items.length === 0) return;

  try {
    if (queueData.statusMsgId) {
      await bot.editMessageText(`⏳ استلمت (${items.length}) ملفات. عم ادمجهم لأرفعهم بضربة وحدة...`, { chat_id: chatId, message_id: queueData.statusMsgId }).catch(()=>{});
    }

    const repoInfo = await axios.get(`https://api.github.com/repos/${ghUser}/${repo}`, { headers: ghHeaders });
    const branch = repoInfo.data.default_branch || "main";
    const refInfo = await axios.get(`https://api.github.com/repos/${ghUser}/${repo}/git/refs/heads/${branch}`, { headers: ghHeaders });
    const baseCommitSha = refInfo.data.object.sha;

    let tree = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (i % 3 === 0) {
         bot.editMessageText(`⏳ جاري تجهيز الملفات لغيتهوب (${i + 1}/${items.length})...`, { chat_id: chatId, message_id: queueData.statusMsgId }).catch(()=>{});
      }
      
      const fileUrl = await bot.getFileLink(item.fileId);
      const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
      const base64Content = Buffer.from(response.data).toString('base64');
      
      const blobRes = await axios.post(`https://api.github.com/repos/${ghUser}/${repo}/git/blobs`, { content: base64Content, encoding: 'base64' }, { headers: ghHeaders });
      tree.push({ path: item.finalPath, mode: '100644', type: 'blob', sha: blobRes.data.sha });
    }

    const treeRes = await axios.post(`https://api.github.com/repos/${ghUser}/${repo}/git/trees`, { base_tree: baseCommitSha, tree }, { headers: ghHeaders });
    const commitRes = await axios.post(`https://api.github.com/repos/${ghUser}/${repo}/git/commits`, { message: `📦 تحديث ${items.length} ملفات دفعة وحدة`, tree: treeRes.data.sha, parents: [baseCommitSha] }, { headers: ghHeaders });
    await axios.patch(`https://api.github.com/repos/${ghUser}/${repo}/git/refs/heads/${branch}`, { sha: commitRes.data.sha }, { headers: ghHeaders });

    bot.editMessageText(`✅ **تم تحديث واستبدال (${items.length}) ملفات بنجاح!** 🚀\n⏳ عم راقب غيتهوب لتخضرّ الإشارة...`, {
      chat_id: chatId, message_id: queueData.statusMsgId, parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "🔙 رجوع للمستودع", callback_data: `repo:${repo}` }]] }
    }).catch(()=>{});
    
    trackCommitStatus(chatId, repo, commitRes.data.sha, "تحديث دفعة ملفات");

  } catch (err) {
    bot.editMessageText(`❌ فشل رفع الدفعة: ${err.message}`, { chat_id: chatId, message_id: queueData.statusMsgId }).catch(()=>{});
  }
}

async function createNewRepository(chatId, repoName, msgId) {
  try {
    await axios.post(`https://api.github.com/user/repos`, { name: repoName, private: false, auto_init: false }, { headers: ghHeaders });
    const content = Buffer.from("This is a temporary file.").toString('base64');
    await axios.put(`https://api.github.com/repos/${ghUser}/${repoName}/contents/temp`, {
      message: "Initial commit", content, branch: "main"
    }, { headers: ghHeaders });

    await axios.post(`https://api.github.com/repos/${ghUser}/${repoName}/pages`, {
      source: { branch: "main", path: "/" }
    }, { headers: ghHeaders });

    bot.editMessageText(`✅ **تم إنشاء المستودع \`${repoName}\` وتفعيل Pages بنجاح!**\nرابط موقعك: https://${ghUser}.github.io/${repoName}/`, {
      chat_id: chatId, message_id: msgId, parse_mode: "Markdown", disable_web_page_preview: true,
      reply_markup: { inline_keyboard: [[{ text: "🔙 رجوع للقائمة", callback_data: `page:1` }]] }
    });
  } catch (e) {
    bot.editMessageText(`❌ فشل إنشاء المستودع: ${e.message}`, { chat_id: chatId, message_id: msgId });
  }
}

async function deleteFullRepository(chatId, repoName, msgId) {
  try {
    await axios.delete(`https://api.github.com/repos/${ghUser}/${repoName}`, { headers: ghHeaders });
    bot.editMessageText(`☠️ **تم تدمير المستودع \`${repoName}\` نهائياً!**`, {
      chat_id: chatId, message_id: msgId, parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "🔙 رجوع للقائمة", callback_data: `page:1` }]] }
    });
  } catch (e) {
    bot.editMessageText(`❌ فشل الحذف: ${e.message}`, { chat_id: chatId, message_id: msgId });
  }
}

async function sendReposMenu(chatId, page, messageId = null) {
  try {
    const res = await axios.get(`https://api.github.com/users/${ghUser}/repos?sort=updated&per_page=100`, { headers: ghHeaders });
    const repos = res.data;
    const itemsPerPage = 10;
    const totalPages = Math.ceil(repos.length / itemsPerPage);
    const start = (page - 1) * itemsPerPage;
    const currentRepos = repos.slice(start, start + itemsPerPage);

    const keyboard = [[{ text: "➕ إنشاء مستودع جديد", callback_data: `new_repo` }]];
    currentRepos.forEach(r => keyboard.push([{ text: `📁 ${r.name}`, callback_data: `repo:${r.name}` }]));
    
    let navButtons = [];
    if (page > 1) navButtons.push({ text: "◀️ السابق", callback_data: `page:${page - 1}` });
    if (totalPages > 0) navButtons.push({ text: `${page}/${totalPages}`, callback_data: "ignore" });
    if (page < totalPages) navButtons.push({ text: "التالي ▶️", callback_data: `page:${page + 1}` });
    if (navButtons.length > 0) keyboard.push(navButtons);

    const opts = { parse_mode: "Markdown", reply_markup: { inline_keyboard: keyboard } };
    if (messageId) bot.editMessageText("👇 **اختر المستودع للعمل عليه:**", { chat_id: chatId, message_id: messageId, ...opts });
    else bot.sendMessage(chatId, "👇 **اختر المستودع للعمل عليه:**", opts);
  } catch (e) {
    bot.sendMessage(chatId, "❌ تعذر جلب المستودعات.");
  }
}

async function sendRepoOptions(chatId, repoName, messageId) {
  const keyboard = [
    [{ text: "📤 رفع للمسار الرئيسي", callback_data: `act:upload:${repoName}` }, { text: "📂 رفع بداخل مجلد", callback_data: `act:upload_folder:${repoName}` }],
    [{ text: "📦 رفع وفك ZIP", callback_data: `act:zip:${repoName}` }, { text: "📄 إنشاء ملف", callback_data: `act:newfile:${repoName}` }],
    [{ text: "📁 إنشاء مجلد", callback_data: `act:newdir:${repoName}` }, { text: "🗑️ حذف ملف/مجلد", callback_data: `act:delete:${repoName}` }],
    [{ text: "💣 فرمتة المستودع", callback_data: `confirm_empty:${repoName}` }],
    [{ text: "🧨 حذف المستودع نهائياً", callback_data: `confirm_delete_repo:${repoName}` }],
    [{ text: "🔙 رجوع للقائمة", callback_data: `page:1` }]
  ];
  bot.editMessageText(`🛠️ **المستودع النشط:** \`${repoName}\``, {
    chat_id: chatId, message_id: messageId, parse_mode: "Markdown", reply_markup: { inline_keyboard: keyboard }
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
    const treeRes = await axios.post(`https://api.github.com/repos/${ghUser}/${repo}/git/trees`, { base_tree: baseCommitSha, tree }, { headers: ghHeaders });
    const commitRes = await axios.post(`https://api.github.com/repos/${ghUser}/${repo}/git/commits`, { message: "📦 رفع ZIP", tree: treeRes.data.sha, parents: [baseCommitSha] }, { headers: ghHeaders });
    await axios.patch(`https://api.github.com/repos/${ghUser}/${repo}/git/refs/heads/${branch}`, { sha: commitRes.data.sha }, { headers: ghHeaders });

    bot.editMessageText(`✅ **تم رفع وفك ${tree.length} ملف بنجاح!** 🚀\n⏳ عم راقب غيتهوب ليجهز الموقع...`, {
      chat_id: chatId, message_id: msgId, parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "🔙 رجوع للمستودع", callback_data: `repo:${repo}` }]] }
    });
    
    trackCommitStatus(chatId, repo, commitRes.data.sha, "رفع ملفات ZIP");
  } catch (e) {
    bot.editMessageText(`❌ خطأ بملف الـ ZIP: ${e.message}`, { chat_id: chatId, message_id: msgId });
  }
}

async function executeGitHubAction(chatId, repo, path, base64Content, msgId) {
  try {
    let sha = null;
    try {
      const checkRes = await axios.get(`https://api.github.com/repos/${ghUser}/${repo}/contents/${path}`, { headers: ghHeaders });
      sha = checkRes.data.sha;
    } catch (e) {}

    const payload = { message: "تحديث ملف", content: base64Content };
    if (sha) payload.sha = sha;

    const putRes = await axios.put(`https://api.github.com/repos/${ghUser}/${repo}/contents/${path}`, payload, { headers: ghHeaders });
    bot.editMessageText(`✅ **تم حفظ \`${path}\` بنجاح!**\n⏳ عم راقب غيتهوب ليجهز التعديل...`, {
      chat_id: chatId, message_id: msgId, parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "🔙 رجوع للمستودع", callback_data: `repo:${repo}` }]] }
    });
    
    if (putRes.data && putRes.data.commit) {
      trackCommitStatus(chatId, repo, putRes.data.commit.sha, `تحديث ${path}`);
    }
  } catch (e) {
    bot.editMessageText(`❌ خطأ: ${e.message}`, { chat_id: chatId, message_id: msgId });
  }
}

async function processDelete(chatId, repo, path, msgId) {
  try {
    const checkRes = await axios.get(`https://api.github.com/repos/${ghUser}/${repo}/contents/${path}`, { headers: ghHeaders });
    const data = checkRes.data;
    if (Array.isArray(data)) {
      for (let item of data) await deleteRecursive(repo, item.path);
    } else {
      await axios.delete(`https://api.github.com/repos/${ghUser}/${repo}/contents/${path}`, {
        headers: ghHeaders, data: { message: `حذف ${path}`, sha: data.sha }
      });
    }
    bot.editMessageText(`✅ تم الحذف بنجاح! 🗑️`, {
      chat_id: chatId, message_id: msgId, parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "🔙 رجوع للمستودع", callback_data: `repo:${repo}` }]] }
    });
  } catch (e) {
    bot.editMessageText(`❌ تعذر الحذف.`, { chat_id: chatId, message_id: msgId });
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
        headers: ghHeaders, data: { message: `Delete ${path}`, sha: data.sha }
      });
    }
  } catch (e) {}
}

async function emptyRepository(chatId, repo, msgId) {
  try {
    const contentsRes = await axios.get(`https://api.github.com/repos/${ghUser}/${repo}/contents`, { headers: ghHeaders });
    const files = contentsRes.data;
    if (!files || files.length === 0) return bot.editMessageText(`ℹ️ المستودع فارغ أساساً.`, { chat_id: chatId, message_id: msgId });

    for (let item of files) {
      if (item.type === "dir") await deleteRecursive(repo, item.path);
      else await axios.delete(`https://api.github.com/repos/${ghUser}/${repo}/contents/${item.path}`, {
        headers: ghHeaders, data: { message: `حذف`, sha: item.sha }
      });
    }
    bot.editMessageText(`💣 **تم فرمتة المستودع بالكامل!**`, {
      chat_id: chatId, message_id: msgId, parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "🔙 رجوع للمستودع", callback_data: `repo:${repo}` }]] }
    });
  } catch (e) {
    bot.editMessageText(`❌ فشلت الفرمتة.`, { chat_id: chatId, message_id: msgId });
  }
}

async function resetState(chatId) {
  userState = { repo: null, action: null, time: 0, path: "" };
  await sendReposMenu(chatId, 1);
}

async function handleCallback(query) {
  const chatId = query.message.chat.id;
  const msgId = query.message.message_id;
  const data = query.data;

  if (data === "new_repo") {
    userState.action = "new_repo";
    bot.sendMessage(chatId, "📌 **إنشاء مستودع جديد**\n\n👇 اعمل رد (Reply) واكتب اسم المستودع (بالانجليزي بدون مسافات):", { reply_markup: { force_reply: true } });
  }
  else if (data.startsWith("page:")) {
    await sendReposMenu(chatId, parseInt(data.split(":")[1]), msgId);
  } 
  else if (data.startsWith("repo:")) {
    userState.repo = data.split(":")[1];
    userState.action = null;
    await sendRepoOptions(chatId, userState.repo, msgId);
  } 
  else if (data.startsWith("confirm_empty:")) {
    const targetRepo = data.split(":")[1];
    bot.editMessageText(`⚠️ **تأكيد فرمتة المستودع:** \`${targetRepo}\`\n\nهل أنت متأكد؟ سيتم مسح جميع الملفات!`, {
      chat_id: chatId, message_id: msgId, parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [
        [{ text: "⚠️ نعم، احذف كل الملفات!", callback_data: `empty_repo:${targetRepo}` }],
        [{ text: "❌ تراجع", callback_data: `repo:${targetRepo}` }]
      ]}
    });
  }
  else if (data.startsWith("confirm_delete_repo:")) {
    const targetRepo = data.split(":")[1];
    bot.editMessageText(`🚨 **تدمير المستودع بالكامل:** \`${targetRepo}\``, {
      chat_id: chatId, message_id: msgId, parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [
        [{ text: "☠️ نعم، دمر المستودع نهائياً!", callback_data: `delete_repo:${targetRepo}` }],
        [{ text: "❌ تراجع", callback_data: `repo:${targetRepo}` }]
      ]}
    });
  }
  else if (data.startsWith("empty_repo:")) {
    const targetRepo = data.split(":")[1];
    bot.editMessageText(`⏳ جاري فرمتة المستودع...`, { chat_id: chatId, message_id: msgId });
    await emptyRepository(chatId, targetRepo, msgId);
  }
  else if (data.startsWith("delete_repo:")) {
    const targetRepo = data.split(":")[1];
    bot.editMessageText(`⏳ جاري حذف المستودع...`, { chat_id: chatId, message_id: msgId });
    await deleteFullRepository(chatId, targetRepo, msgId);
  }
  else if (data.startsWith("act:")) {
    const parts = data.split(":");
    const action = parts[1];
    const repo = parts[2];
    userState.repo = repo;
    userState.action = action;
    userState.time = Date.now();

    if (action === "upload") {
      userState.path = "";
      bot.sendMessage(chatId, `📌 **الرفع للمسار الرئيسي مفعل لـ:** \`${repo}\`\n\n👇 حدد أي عدد بدك ياه من الملفات وبعتهن دفعة وحدة!`, { parse_mode: "Markdown" });
    }
    else if (action === "upload_folder") {
      bot.sendMessage(chatId, `📌 **رفع بداخل مجلد** في: \`${repo}\`\n\n👇 اعمل رد (Reply) على هي الرسالة واكتب اسم المجلد اللي بدك ترفع عليه (مثلاً \`api\`):`, { parse_mode: "Markdown", reply_markup: { force_reply: true } });
    }
    else if (action === "zip") bot.sendMessage(chatId, `📌 **رفع وفك ZIP** 📦 لـ: \`${repo}\`\n\n👇 ابعت ملف الـ ZIP مباشرة.`, { parse_mode: "Markdown" });
    else if (action === "newfile") bot.sendMessage(chatId, `📌 **إنشاء ملف كود** في: \`${repo}\`\n\n👇 اعمل رد (Reply) واكتب:\nاسم_الملف.html\nالكود بالسطر الثاني`, { reply_markup: { force_reply: true } });
    else if (action === "newdir") bot.sendMessage(chatId, `📌 **إنشاء مجلد** في: \`${repo}\`\n\n👇 اعمل رد واكتب اسم المجلد.`, { reply_markup: { force_reply: true } });
    else if (action === "delete") bot.sendMessage(chatId, `📌 **حذف ملف/مجلد** من: \`${repo}\`\n\n👇 اعمل رد واكتب مسار الملف أو المجلد.`, { reply_markup: { force_reply: true } });
  }
}

async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const isReply = msg.reply_to_message;
  let fileObj = msg.document || msg.video || msg.audio;
  if (msg.photo) fileObj = msg.photo[msg.photo.length - 1];

  try {
    if (isReply && isReply.text && isReply.text.includes("إنشاء مستودع جديد") && msg.text) {
      const repoName = msg.text.trim().replace(/\s+/g, '-');
      const statusMsg = await bot.sendMessage(chatId, `⏳ جاري إنشاء المستودع \`${repoName}\` وتفعيل الموقع...`, { parse_mode: "Markdown" });
      await createNewRepository(chatId, repoName, statusMsg.message_id);
      return;
    }

    if (!userState.repo && !fileObj) return bot.sendMessage(chatId, "⚠️ اختار مستودع أولاً من القائمة.");
    const repo = userState.repo;

    if (fileObj && (userState.action === "zip" || (fileObj.file_name && fileObj.file_name.endsWith(".zip")))) {
      if (fileObj.file_size > 20971520) return bot.sendMessage(chatId, `❌ حجم الملف تجاوز 20 ميغا.`);
      const statusMsg = await bot.sendMessage(chatId, `⏳ جاري تحميل وفك الضغط...`);
      const fileUrl = await bot.getFileLink(fileObj.file_id);
      const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
      await extractAndUploadZip(chatId, repo, response.data, statusMsg.message_id);
      return;
    }

    if (fileObj) {
      if (fileObj.file_size > 20971520) return bot.sendMessage(chatId, `❌ الملف أكبر من 20 ميغا.`);
      
      let rawFileName = fileObj.file_name || `file_${Date.now()}`;
      rawFileName = rawFileName.replace(/\s*\(\d+\)/g, '');
      
      const customPath = (msg.caption || userState.path || "").trim();
      const finalPath = customPath ? `${customPath}/${rawFileName}` : rawFileName;

      if (!uploadQueues.has(chatId)) {
        uploadQueues.set(chatId, { items: [], timer: null, statusMsgId: null });
      }

      const queueData = uploadQueues.get(chatId);
      queueData.items.push({ fileId: fileObj.file_id, rawFileName, finalPath });

      if (queueData.timer) clearTimeout(queueData.timer);

      if (!queueData.statusMsgId) {
        bot.sendMessage(chatId, `⏳ عم استلم الملفات... رح استنى شوي لتكتمل الدفعة...`).then(msg => {
          queueData.statusMsgId = msg.message_id;
        });
      }

      queueData.timer = setTimeout(() => {
        processAlbumAsOneCommit(chatId, repo, queueData);
      }, 3500);

      return;
    }

    if (isReply && msg.text) {
      const parent = isReply.text || "";
      if (parent.includes("رفع بداخل مجلد")) {
        userState.path = msg.text.trim();
        bot.sendMessage(chatId, `✅ تم تعيين مسار الرفع إلى: \`${userState.path}\`\n👇 ابعت ملفاتك هلق (حتى كدفعة واحدة) ورح تنزل بقلبه مباشرة.`, { parse_mode: "Markdown" });
      }
      else if (parent.includes("إنشاء ملف كود")) {
        const lines = msg.text.split("\n");
        const path = lines[0].trim();
        const content = lines.slice(1).join("\n");
        const statusMsg = await bot.sendMessage(chatId, `⏳ جاري إنشاء \`${path}\`...`);
        await executeGitHubAction(chatId, repo, path, Buffer.from(content).toString('base64'), statusMsg.message_id);
      }
      else if (parent.includes("إنشاء مجلد")) {
        const path = `${msg.text.trim()}/.gitkeep`;
        const statusMsg = await bot.sendMessage(chatId, `⏳ جاري إنشاء المجلد...`);
        await executeGitHubAction(chatId, repo, path, Buffer.from("").toString('base64'), statusMsg.message_id);
      }
      else if (parent.includes("حذف ملف/مجلد")) {
        const path = msg.text.trim();
        const statusMsg = await bot.sendMessage(chatId, `⏳ جاري الحذف...`);
        await processDelete(chatId, repo, path, statusMsg.message_id);
      }
    }
  } catch (err) {
    bot.sendMessage(chatId, `❌ خطأ: ${err.message}`);
  }
}

// دالة مراقبة حالة النقطة البرتقالية على غيتهوب
async function trackCommitStatus(chatId, repo, sha, actionName) {
  const startTime = Date.now();
  const maxWait = 5 * 60 * 1000; // أقصى حد للمراقبة 5 دقايق
  const interval = 15 * 1000; // بيفحص كل 15 ثانية

  const timer = setInterval(async () => {
    try {
      if (Date.now() - startTime > maxWait) {
        clearInterval(timer);
        return;
      }
      
      const res = await axios.get(`https://api.github.com/repos/${ghUser}/${repo}/commits/${sha}/check-runs`, { headers: ghHeaders });
      const runs = res.data.check_runs;
      
      // إذا لسا ما بلش بناء نتجاهل الفحص ونستنى
      if (!runs || runs.length === 0) return; 

      // هل كل العمليات خلصت؟
      const allCompleted = runs.every(run => run.status === 'completed');
      
      if (allCompleted) {
        clearInterval(timer);
        const allSuccess = runs.every(run => run.conclusion === 'success' || run.conclusion === 'neutral' || run.conclusion === 'skipped');
        
        if (allSuccess) {
          bot.sendMessage(chatId, `🟢 **تحديث موقعك جاهز!**\nاكتمل (${actionName}) وصارت الإشارة خضراء. فيك تفوت ع الموقع هلأ.`, {parse_mode: "Markdown"});
        } else {
          bot.sendMessage(chatId, `🔴 **فشل في النشر!**\nعملية (${actionName}) عطت إشارة حمراء على غيتهوب.`, {parse_mode: "Markdown"});
        }
      }
    } catch (e) {
      // إذا صار خطأ بالاتصال منتجاهله ومنكمل فحص
    }
  }, interval);
}

// تصدير الدوال الأساسية للاندكس
module.exports = { initGithub, resetState, handleCallback, handleMessage };
