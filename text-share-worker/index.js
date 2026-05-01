const MAX_TEXT_LENGTH = 10000;
const SHARE_CODE_LENGTH = 6;
const ERROR_HIDE_MS = 5000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      return handleAPI(request, env, url);
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      return serveHTML();
    }

    if (url.pathname === '/style.css') {
      return serveCSS();
    }

    if (url.pathname === '/script.js') {
      return serveJS();
    }

    return new Response('Not Found', { status: 404 });
  }
};

async function handleAPI(request, env, url) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (url.pathname === '/api/submit' && request.method === 'POST') {
      return handleSubmit(request, env, corsHeaders);
    }

    if (url.pathname.startsWith('/api/retrieve/') && request.method === 'GET') {
      const code = url.pathname.split('/')[3];
      return handleRetrieve(code, env, corsHeaders);
    }

    if (url.pathname === '/api/health' && request.method === 'GET') {
      return jsonResponse({ status: 'ok' }, corsHeaders);
    }

    return jsonResponse({ error: 'Endpoint not found' }, corsHeaders, 404);
  } catch (error) {
    return jsonResponse({ error: 'Internal server error' }, corsHeaders, 500);
  }
}

async function handleSubmit(request, env, corsHeaders) {
  const body = await request.json().catch(() => ({}));
  const text = typeof body.text === 'string' ? body.text.trim() : '';

  if (!text) {
    return jsonResponse(
      { success: false, error: 'Text is required and cannot be empty' },
      corsHeaders,
      400
    );
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return jsonResponse(
      { success: false, error: 'Text is too long (max 10000 characters)' },
      corsHeaders,
      400
    );
  }

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  let code = '';

  for (let attempts = 0; attempts < 10; attempts += 1) {
    code = generateCode();
    const existing = await env.TEXT_STORAGE.get(`text:${code}`);
    if (!existing) {
      break;
    }
    code = '';
  }

  if (!code) {
    return jsonResponse(
      { success: false, error: 'Unable to generate unique code, please try again' },
      corsHeaders,
      500
    );
  }

  await env.TEXT_STORAGE.put(
    `text:${code}`,
    JSON.stringify({
      text,
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
    }),
    { expirationTtl: 24 * 60 * 60 }
  );

  return jsonResponse(
    {
      success: true,
      code,
      message: 'Text saved successfully',
      expiresAt: expiresAt.toISOString(),
    },
    corsHeaders
  );
}

async function handleRetrieve(code, env, corsHeaders) {
  if (!code || !new RegExp(`^\\d{${SHARE_CODE_LENGTH}}$`).test(code)) {
    return jsonResponse(
      { success: false, error: 'Invalid code format. Code must be 6 digits.' },
      corsHeaders,
      400
    );
  }

  const data = await env.TEXT_STORAGE.get(`text:${code}`);
  if (!data) {
    return jsonResponse(
      { success: false, error: 'Code not found or expired' },
      corsHeaders,
      404
    );
  }

  const parsed = JSON.parse(data);
  const expiresAt = new Date(parsed.expiresAt);
  if (Date.now() > expiresAt.getTime()) {
    await env.TEXT_STORAGE.delete(`text:${code}`);
    return jsonResponse(
      { success: false, error: 'Code has expired' },
      corsHeaders,
      404
    );
  }

  return jsonResponse(
    {
      success: true,
      text: parsed.text,
      createdAt: parsed.createdAt,
      expiresAt: parsed.expiresAt,
    },
    corsHeaders
  );
}

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function jsonResponse(payload, corsHeaders = {}, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function serveHTML() {
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#08111f">
  <title>Text Share</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <div class="bg bg-a"></div>
  <div class="bg bg-b"></div>
  <div class="grid"></div>

  <main class="shell">
    <section class="hero">
      <div class="eyebrow">Text Share · 24h self-destruct</div>
      <h1>把文本变成一个干净的分享卡片。</h1>
      <p class="hero-copy">发送一段文字，拿到 6 位分享码。对方输入后即可查看，24 小时后自动失效。</p>

      <div class="stats">
        <div class="stat">
          <span>保存时长</span>
          <strong>24 小时</strong>
        </div>
        <div class="stat">
          <span>分享码</span>
          <strong>6 位数字</strong>
        </div>
        <div class="stat">
          <span>支持设备</span>
          <strong>手机 / 电脑</strong>
        </div>
      </div>
    </section>

    <section class="workspace">
      <section class="card card-primary">
        <div class="card-head">
          <div>
            <p class="kicker">发送文本</p>
            <h2>创建一个可分享的文本</h2>
          </div>
          <span class="badge">Private by default</span>
        </div>

        <form id="sendForm" class="form">
          <label for="textInput">输入内容</label>
          <textarea
            id="textInput"
            placeholder="写下你要分享的内容，支持中文、英文、代码片段、链接..."
            rows="8"
            maxlength="10000"
            required
          ></textarea>
          <div class="form-row">
            <span class="count">0 / 10000</span>
            <button type="submit" class="btn btn-primary">生成分享码</button>
          </div>
        </form>

        <div id="sendResult" class="result hidden success">
          <div class="result-head">
            <div>
              <p class="label">分享成功</p>
              <h3>你的分享码已生成</h3>
            </div>
            <button id="copyCode" class="btn btn-secondary btn-sm" type="button">复制</button>
          </div>
          <div class="code-card">
            <span id="generatedCode" class="code-value"></span>
          </div>
          <p class="info" id="sendExpiresInfo">24 小时后自动删除</p>
        </div>
      </section>

      <section class="card card-surface">
        <div class="card-head">
          <div>
            <p class="kicker">获取文本</p>
            <h2>输入 6 位分享码查看内容</h2>
          </div>
          <span class="badge badge-soft">One-time access</span>
        </div>

        <form id="retrieveForm" class="form">
          <label for="codeInput">分享码</label>
          <input
            type="text"
            id="codeInput"
            placeholder="例如 123456"
            maxlength="6"
            inputmode="numeric"
            autocomplete="one-time-code"
            pattern="\\d{6}"
            required
          >
          <button type="submit" class="btn btn-primary">查看文本</button>
        </form>

        <div id="retrieveResult" class="result hidden success">
          <p class="label">获取成功</p>
          <div id="retrievedText" class="text-display"></div>
          <p class="info" id="expiresInfo"></p>
        </div>

        <div id="errorResult" class="result hidden error" role="status" aria-live="polite">
          <p id="errorMessage"></p>
        </div>
      </section>
    </section>

    <footer class="footer">
      <p>文本会在 24 小时后自动删除 · Text will be automatically deleted after 24 hours</p>
    </footer>
  </main>

  <script src="/script.js"></script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function serveCSS() {
  const css = `:root {
  color-scheme: dark;
  --bg: #08111f;
  --panel: rgba(14, 20, 37, 0.82);
  --panel-strong: rgba(10, 15, 28, 0.9);
  --stroke: rgba(148, 163, 184, 0.18);
  --text: #e2e8f0;
  --muted: #94a3b8;
  --accent: #7c3aed;
  --accent-2: #2563eb;
  --accent-3: #22c55e;
  --shadow: 0 28px 80px rgba(2, 6, 23, 0.46);
  --radius-xl: 28px;
  --radius-lg: 22px;
  --radius-md: 16px;
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  min-height: 100vh;
  color: var(--text);
  font-family: "Aptos", "Segoe UI Variable Text", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  background:
    radial-gradient(circle at top left, rgba(124, 58, 237, 0.28), transparent 36%),
    radial-gradient(circle at top right, rgba(56, 189, 248, 0.18), transparent 30%),
    linear-gradient(160deg, #050816 0%, #0b1220 44%, #111827 100%);
}
body::before {
  content: "";
  position: fixed;
  inset: 0;
  background-image:
    linear-gradient(rgba(148, 163, 184, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 163, 184, 0.05) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0.7), transparent 95%);
  pointer-events: none;
}
button, input, textarea { font: inherit; }
button { border: 0; }

.bg {
  position: fixed;
  border-radius: 999px;
  filter: blur(10px);
  pointer-events: none;
  opacity: 0.85;
  animation: float 12s ease-in-out infinite;
}
.bg-a {
  top: -10vw;
  right: -10vw;
  width: 34vw;
  aspect-ratio: 1;
  background: radial-gradient(circle, rgba(124, 58, 237, 0.3), transparent 68%);
}
.bg-b {
  left: -11vw;
  bottom: -14vw;
  width: 36vw;
  aspect-ratio: 1;
  background: radial-gradient(circle, rgba(34, 197, 94, 0.2), transparent 64%);
  animation-delay: -6s;
}
.grid {
  position: fixed;
  inset: 0;
  background: linear-gradient(to bottom, rgba(2, 6, 23, 0), rgba(2, 6, 23, 0.24));
  pointer-events: none;
}

.shell {
  position: relative;
  z-index: 1;
  width: min(1180px, calc(100% - 32px));
  margin: 0 auto;
  padding: 32px 0 36px;
}
.hero { padding: 28px 0; }
.eyebrow, .kicker, .label {
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-size: 0.72rem;
  font-weight: 700;
  color: #38bdf8;
}
.hero h1 {
  margin: 14px 0 12px;
  max-width: 11ch;
  font-size: clamp(2.2rem, 4.8vw, 4.8rem);
  line-height: 0.98;
  letter-spacing: -0.05em;
}
.hero-copy {
  margin: 0;
  max-width: 60ch;
  color: var(--muted);
  font-size: 1.05rem;
  line-height: 1.75;
}
.stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-top: 24px;
}
.stat, .card, .result {
  border: 1px solid var(--stroke);
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.82), rgba(7, 12, 22, 0.86));
  backdrop-filter: blur(20px);
  box-shadow: var(--shadow);
}
.stat {
  border-radius: 18px;
  padding: 16px 18px;
}
.stat span {
  display: block;
  margin-bottom: 8px;
  color: var(--muted);
  font-size: 0.84rem;
}
.stat strong { font-size: 1rem; }

.workspace {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
  align-items: start;
}
.card {
  position: relative;
  overflow: hidden;
  border-radius: var(--radius-xl);
  padding: 22px;
}
.card::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent 48%);
  pointer-events: none;
}
.card-primary {
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.94), rgba(7, 12, 22, 0.9));
}
.card-surface {
  background: linear-gradient(180deg, rgba(12, 18, 33, 0.92), rgba(7, 11, 20, 0.92));
}
.card-head {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 16px;
  margin-bottom: 20px;
}
.card h2 {
  margin: 6px 0 0;
  font-size: 1.28rem;
  line-height: 1.25;
  letter-spacing: -0.03em;
}
.badge {
  flex: none;
  border-radius: 999px;
  padding: 8px 12px;
  font-size: 0.76rem;
  font-weight: 700;
  color: #dbeafe;
  background: rgba(124, 58, 237, 0.16);
  border: 1px solid rgba(124, 58, 237, 0.28);
}
.badge-soft {
  color: #c7f9cc;
  background: rgba(34, 197, 94, 0.12);
  border-color: rgba(34, 197, 94, 0.24);
}

.form {
  display: grid;
  gap: 12px;
}
.form label {
  font-size: 0.88rem;
  color: var(--muted);
}
textarea, input[type="text"] {
  width: 100%;
  color: var(--text);
  background: rgba(15, 23, 42, 0.72);
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: var(--radius-md);
  outline: none;
  transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
}
textarea {
  min-height: 250px;
  resize: vertical;
  padding: 18px;
  line-height: 1.7;
}
input[type="text"] {
  padding: 16px 18px;
  letter-spacing: 0.06em;
}
textarea::placeholder, input[type="text"]::placeholder {
  color: rgba(148, 163, 184, 0.72);
}
textarea:focus, input[type="text"]:focus {
  border-color: rgba(56, 189, 248, 0.55);
  box-shadow: 0 0 0 4px rgba(56, 189, 248, 0.12);
  background: rgba(15, 23, 42, 0.94);
  transform: translateY(-1px);
}
.form-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}
.count {
  color: var(--muted);
  font-size: 0.88rem;
}
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 999px;
  padding: 14px 18px;
  font-weight: 800;
  cursor: pointer;
  transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease, opacity 160ms ease;
}
.btn:hover { transform: translateY(-1px); }
.btn:active { transform: translateY(0); }
.btn-primary {
  color: #fff;
  background: linear-gradient(135deg, var(--accent-2) 0%, var(--accent) 100%);
  box-shadow: 0 18px 32px rgba(37, 99, 235, 0.22);
}
.btn-secondary {
  color: var(--text);
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
}
.btn-secondary:hover { background: rgba(255, 255, 255, 0.12); }
.btn-sm { padding: 10px 14px; font-size: 0.9rem; }

.result {
  margin-top: 18px;
  border-radius: 22px;
  padding: 18px;
  animation: rise 220ms ease-out;
}
.hidden { display: none; }
.success {
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.88), rgba(9, 16, 30, 0.88));
}
.error {
  background: linear-gradient(180deg, rgba(127, 29, 29, 0.4), rgba(69, 10, 10, 0.38));
  border-color: rgba(251, 113, 133, 0.34);
}
.result-head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 14px;
}
.result h3 {
  margin: 0;
  font-size: 1.08rem;
}
.code-card {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 18px;
  padding: 22px;
  margin: 12px 0 14px;
  background:
    linear-gradient(135deg, rgba(56, 189, 248, 0.12), rgba(124, 58, 237, 0.18)),
    rgba(8, 15, 28, 0.86);
  border: 1px solid rgba(148, 163, 184, 0.18);
}
.code-value {
  font-size: clamp(2.2rem, 7vw, 3.6rem);
  letter-spacing: 0.22em;
  font-weight: 900;
  color: #f8fafc;
  text-shadow: 0 0 24px rgba(56, 189, 248, 0.18);
}
.text-display {
  white-space: pre-wrap;
  word-break: break-word;
  min-height: 180px;
  max-height: 380px;
  overflow: auto;
  padding: 18px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(148, 163, 184, 0.16);
  line-height: 1.7;
}
.info {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
  text-align: center;
}
.footer {
  color: var(--muted);
  text-align: center;
  padding: 24px 12px 0;
  font-size: 0.88rem;
}

@keyframes rise {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes float {
  0%, 100% { transform: translate3d(0, 0, 0); }
  50% { transform: translate3d(0, 22px, 0); }
}

@media (max-width: 960px) {
  .workspace { grid-template-columns: 1fr; }
  .stats { grid-template-columns: 1fr; }
}
@media (max-width: 720px) {
  .shell {
    width: min(100% - 20px, 1180px);
    padding: 16px 0 22px;
  }
  .hero { padding-top: 12px; }
  .hero h1 { max-width: none; }
  .card { padding: 18px; border-radius: 22px; }
  .card-head, .result-head, .form-row {
    flex-direction: column;
    align-items: stretch;
  }
  .btn { width: 100%; }
  .code-value { letter-spacing: 0.14em; }
  textarea { min-height: 220px; }
}
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}`;

  return new Response(css, {
    headers: { 'Content-Type': 'text/css' },
  });
}

function serveJS() {
  const js = `const sendForm = document.getElementById('sendForm');
const textInput = document.getElementById('textInput');
const charCount = document.querySelector('.count');
const sendResult = document.getElementById('sendResult');
const generatedCode = document.getElementById('generatedCode');
const copyCode = document.getElementById('copyCode');
const retrieveForm = document.getElementById('retrieveForm');
const codeInput = document.getElementById('codeInput');
const retrieveResult = document.getElementById('retrieveResult');
const retrievedText = document.getElementById('retrievedText');
const sendExpiresInfo = document.getElementById('sendExpiresInfo');
const expiresInfo = document.getElementById('expiresInfo');
const errorResult = document.getElementById('errorResult');
const errorMessage = document.getElementById('errorMessage');

const MAX_LENGTH = 10000;
const ERROR_HIDE_MS = 5000;

function setCharCount(value) {
  const length = value.length;
  charCount.textContent = length + ' / ' + MAX_LENGTH;
  charCount.style.color = length > 9000 ? '#fb7185' : length > 7000 ? '#fbbf24' : '';
}

function formatExpiresAt(expiresAt) {
  return new Date(expiresAt).toLocaleString('zh-CN');
}

function clearResults() {
  sendResult.classList.add('hidden');
  retrieveResult.classList.add('hidden');
  errorResult.classList.add('hidden');
}

function showError(message) {
  clearResults();
  errorMessage.textContent = message;
  errorResult.classList.remove('hidden');

  window.clearTimeout(showError.timer);
  showError.timer = window.setTimeout(() => {
    errorResult.classList.add('hidden');
  }, ERROR_HIDE_MS);
}

function showSendSuccess(code, expiresAt) {
  clearResults();
  generatedCode.textContent = code;
  sendExpiresInfo.textContent = '有效期至：' + formatExpiresAt(expiresAt);
  sendResult.classList.remove('hidden');
  textInput.value = '';
  setCharCount('');
}

function showRetrieveSuccess(text, expiresAt) {
  clearResults();
  retrievedText.textContent = text;
  expiresInfo.textContent = '有效期至：' + formatExpiresAt(expiresAt);
  retrieveResult.classList.remove('hidden');
  codeInput.value = '';
}

async function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const fallback = document.createElement('textarea');
  fallback.value = text;
  fallback.setAttribute('readonly', '');
  fallback.style.position = 'absolute';
  fallback.style.left = '-9999px';
  document.body.appendChild(fallback);
  fallback.select();
  document.execCommand('copy');
  document.body.removeChild(fallback);
}

function flashButton(button, label) {
  const original = button.textContent;
  button.textContent = label;
  button.disabled = true;
  window.setTimeout(() => {
    button.textContent = original;
    button.disabled = false;
  }, 1200);
}

textInput.addEventListener('input', (event) => {
  setCharCount(event.target.value);
});

codeInput.addEventListener('input', (event) => {
  event.target.value = event.target.value.replace(/[^0-9]/g, '').slice(0, 6);
});

sendForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = textInput.value.trim();

  if (!text) {
    showError('请先输入要分享的文本。');
    return;
  }

  try {
    const response = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    const result = await response.json();
    if (!result.success) {
      showError(result.error || '发送失败，请重试。');
      return;
    }

    showSendSuccess(result.code, result.expiresAt);
  } catch (error) {
    console.error(error);
    showError('网络异常，请检查连接后再试。');
  }
});

retrieveForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const code = codeInput.value.trim();

  if (!/^\\d{6}$/.test(code)) {
    showError('请输入 6 位数字分享码。');
    return;
  }

  try {
    const response = await fetch('/api/retrieve/' + code);
    const result = await response.json();

    if (!result.success) {
      showError(result.error || '获取失败，请检查分享码。');
      return;
    }

    showRetrieveSuccess(result.text, result.expiresAt);
  } catch (error) {
    console.error(error);
    showError('网络异常，请检查连接后再试。');
  }
});

copyCode.addEventListener('click', async () => {
  const code = generatedCode.textContent.trim();
  if (!code) {
    return;
  }

  try {
    await copyText(code);
    flashButton(copyCode, '已复制');
  } catch (error) {
    console.error(error);
    showError('复制失败，请手动选中分享码。');
  }
});

setCharCount(textInput.value);
clearResults();`;

  return new Response(js, {
    headers: { 'Content-Type': 'application/javascript' },
  });
}
