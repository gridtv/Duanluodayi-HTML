const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3001;

const API_KEY = process.env.MIMO_API_KEY || 'tp-c4jhiy4eri239f98zkg95xt8lxfmxn5kirch92we6dic2rs7';
const API_BASE = 'https://token-plan-cn.xiaomimimo.com/v1';
const TEXT_MODEL = 'mimo-v2.5';
const VISION_MODEL = 'mimo-v2.5';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({
  dest: path.join(__dirname, 'uploads'),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const SYSTEM_PROMPT = `你是一位学贯中西的资深学者，集博学教授的渊博、跨界思想家的深邃、通透智者的从容、锐利评论家的精准于一身。你思维缜密，眼光独到，语言犀利又不失幽默。

你面对的是理性成熟的读者，不需要你迁就，需要你给真东西。

## 处理规则

### 文本/文件输入

不要做"概括总结"这种表面功夫。你要做的是：解码。

**开头**：直接抛出你对这段文字最独到的理解——不是复述内容，而是揭示内容背后隐藏的结构、情感或逻辑。要让读者觉得"原来如此"或"我怎么没想到"。

**展开**：层层深入，自由选择以下一个或多个角度——
- 表层在说什么，深层在说什么，更深层可能还在说什么
- 作者用了什么手法，为什么这样用，这样写好在哪里
- 放在更大的坐标系里（文学史、思想史、人类情感的普遍经验）这段文字处于什么位置
- 从专业角度拆解：结构、节奏、意象——哪些是真正的功力，哪些是花架子

**收尾**：一句话点睛。可以是精辟的点评，一个意想不到的类比，一个让人回味的追问，或一个让人沉默的判断。

### 图片输入

按以下两步处理：

**第一步·识图**：描述图片画面内容（主体、场景、构图、色彩），识别图中所有文字。

**第二步·解码**：
- 如果图中有完整文章或段落→按"文本/文件"规则深度分析文字内容，同时点评画面与文字的配合
- 如果图中只有简短文字（水印、标语、标题等）→重点解读图片本身的视觉语言、构图逻辑、传达的意味

## 输出要求

- 总字数500-800字
- 风格随机应变：根据内容特质，自然呈现博学、深邃、通透、犀利中的任何一种或多种
- 不分板块，不用标记符号，行文如一篇微型随笔——冷静、精确、有锋芒、有温度
- 用中文回答`;

async function callAPI(messages, model, retries = 2) {
  const url = `${API_BASE}/chat/completions`;
  const body = JSON.stringify({
    model: model || TEXT_MODEL,
    messages,
    max_tokens: 3072,
    temperature: 0.3,
 enable_thinking: false,
  });

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 120000);

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!resp.ok) {
        const errText = await resp.text();
        let errMsg;
        try { errMsg = JSON.parse(errText).error?.message; } catch { errMsg = errText; }
        throw new Error(`API ${resp.status}: ${errMsg || '未知错误'}`);
      }

      const data = await resp.json();
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('API 返回内容为空');
      return content;

    } catch (err) {
      console.error(`[API] 第${attempt + 1}次尝试失败:`, err.message);
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

async function extractText(filePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  try {
    switch (ext) {
      case '.txt': case '.md': case '.csv': case '.log':
      case '.json': case '.js': case '.py': case '.html':
      case '.css': case '.xml':
        return fs.readFileSync(filePath, 'utf-8');

      case '.docx': {
        const mammoth = require('mammoth');
        const result = await mammoth.extractRawText({ path: filePath });
        return result.value;
      }

      case '.pdf': {
        const pdfParse = require('pdf-parse');
        const buf = fs.readFileSync(filePath);
        const data = await pdfParse(buf);
        return data.text;
      }

      case '.xlsx': case '.xls': {
        const XLSX = require('xlsx');
        const wb = XLSX.readFile(filePath);
        let text = '';
        for (const name of wb.SheetNames) {
          text += `\n--- Sheet: ${name} ---\n`;
          text += XLSX.utils.sheet_to_csv(wb.Sheets[name]);
        }
        return text;
      }

      default:
        return `[不支持的文件格式: ${ext}，文件名: ${originalName}]`;
    }
  } catch (err) {
    console.error(`[Extract] 提取 ${originalName} 失败:`, err.message);
    return `[文件内容提取失败: ${err.message}]`;
  }
}

function cleanup(filePath) {
  try { fs.unlinkSync(filePath); } catch {}
}

app.post('/api/summarize', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: '请输入文本内容' });

    const result = await callAPI([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: '请对以下文本进行深度分析：\n\n' + text.trim() },
    ]);
    res.json({ success: true, result });
  } catch (err) {
    console.error('[summarize]', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/summarize-file', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请上传文件' });

    const { path: filePath, originalname } = req.file;
    const content = await extractText(filePath, originalname);

    if (!content || content.trim().length === 0) {
      cleanup(filePath);
      return res.status(400).json({ error: '文件内容为空或无法提取文本' });
    }

    const truncated = content.length > 30000
      ? content.substring(0, 30000) + '\n...(内容已截断)'
      : content;

    const result = await callAPI([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `请对以下文件内容进行深度分析（文件名：${originalname}）：\n\n${truncated}` },
    ]);

    cleanup(filePath);
    res.json({ success: true, result });
  } catch (err) {
    console.error('[summarize-file]', err);
    if (req.file) cleanup(req.file.path);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/summarize-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请上传图片' });

    const { path: filePath, mimetype } = req.file;
    const buf = fs.readFileSync(filePath);

    if (buf.length > 10 * 1024 * 1024) {
      cleanup(filePath);
      return res.status(400).json({ error: '图片文件过大，请压缩到10MB以内' });
    }

    const b64 = buf.toString('base64');

    const result = await callAPI([
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mimetype};base64,${b64}` } },
          { type: 'text', text: '请按系统提示中的"图片输入"规则处理此图片：先识图，再解码。' },
        ],
      },
    ], VISION_MODEL);

    cleanup(filePath);
    res.json({ success: true, result });
  } catch (err) {
    console.error('[summarize-image]', err);
    if (req.file) cleanup(req.file.path);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: '段落大意之凝聚', time: new Date().toISOString() });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ 段落大意之凝聚 - 服务启动: http://0.0.0.0:${PORT}`);
  console.log(`📄 支持格式: txt/docx/pdf/xlsx/csv/json/md`);
  console.log(`🖼️  图片识别: jpg/png/gif/webp`);
});
