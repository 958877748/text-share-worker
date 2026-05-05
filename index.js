const MAX_TEXT_LENGTH = 10000;
const SHARE_CODE_LENGTH = 6;

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
  },
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

    if (url.pathname === '/api/ip' && request.method === 'GET') {
      return handleIPInfo(request, corsHeaders);
    }

    return jsonResponse({ error: 'Endpoint not found' }, corsHeaders, 404);
  } catch (error) {
    console.error('API error', error);
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

async function handleIPInfo(request, corsHeaders) {
  const forwardedFor = request.headers.get('X-Forwarded-For') || '';
  const visitorIP =
    request.headers.get('CF-Connecting-IP') ||
    forwardedFor.split(',')[0].trim();

  if (!visitorIP) {
    return jsonResponse(
      { success: false, error: 'Unable to identify visitor IP' },
      corsHeaders,
      400
    );
  }

  const response = await fetch(
    `http://ip-api.com/json/${encodeURIComponent(visitorIP)}?lang=zh-CN`,
    {
      headers: {
        Accept: 'application/json',
      },
    }
  );

  if (!response.ok) {
    return jsonResponse(
      { success: false, error: 'Unable to query IP information' },
      corsHeaders,
      502
    );
  }

  const data = await response.json();
  if (data.status !== 'success') {
    return jsonResponse(
      { success: false, error: data.message || 'Unable to query IP information' },
      corsHeaders,
      502
    );
  }

  return jsonResponse(
    {
      success: true,
      ip: data.query || visitorIP,
      country: data.country || '',
      region: data.regionName || '',
      city: data.city || '',
      isp: data.isp || '',
      org: data.org || '',
      timezone: data.timezone || '',
    },
    corsHeaders
  );
}

function generateCode() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(100000 + (values[0] % 900000));
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
  <meta name="theme-color" content="#f6f7fb">
  <title>Text Share</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <main class="app-shell">
    <header class="topbar" aria-label="Text Share">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">TS</span>
        <div>
          <p>Text Share</p>
          <strong>24 小时临时文本分享</strong>
        </div>
      </div>
      <div class="status-pill">
        <span aria-hidden="true"></span>
        KV 存储已启用
      </div>
    </header>

    <section class="summary" aria-label="服务说明">
      <div>
        <p class="eyebrow">快速、临时、跨设备</p>
        <h1>把一段文字变成 6 位分享码。</h1>
      </div>
      <p class="summary-copy">
        在电脑上创建，在手机上输入分享码查看。文本会写入 Cloudflare KV，并在 24 小时后自动过期。
      </p>
    </section>

    <section class="metrics" aria-label="规则">
      <div>
        <span>有效期</span>
        <strong>24 小时</strong>
      </div>
      <div>
        <span>分享码</span>
        <strong>6 位数字</strong>
      </div>
      <div>
        <span>最大长度</span>
        <strong>10000 字符</strong>
      </div>
    </section>

    <section class="ip-card" aria-label="当前访问 IP 信息">
      <div class="ip-card-head">
        <div>
          <p class="kicker">当前访问的 IP 信息</p>
          <h2 id="ipAddress">正在查询...</h2>
        </div>
        <span id="ipStatus" class="panel-tag panel-tag-soft">ip-api.com</span>
      </div>
      <dl class="ip-grid">
        <div>
          <dt>位置</dt>
          <dd id="ipLocation">--</dd>
        </div>
        <div>
          <dt>运营商</dt>
          <dd id="ipIsp">--</dd>
        </div>
        <div>
          <dt>组织</dt>
          <dd id="ipOrg">--</dd>
        </div>
        <div>
          <dt>时区</dt>
          <dd id="ipTimezone">--</dd>
        </div>
      </dl>
    </section>

    <section class="workspace" aria-label="文本分享工具">
      <article class="panel panel-compose">
        <div class="panel-head">
          <div>
            <p class="kicker">发送文本</p>
            <h2>创建分享码</h2>
          </div>
          <span class="panel-tag">自动过期</span>
        </div>

        <form id="sendForm" class="form">
          <label for="textInput">要分享的内容</label>
          <textarea
            id="textInput"
            placeholder="粘贴文字、链接、代码片段或临时说明..."
            rows="10"
            maxlength="10000"
            required
          ></textarea>
          <div class="form-footer">
            <span id="charCount" class="counter">0 / 10000</span>
            <button id="sendButton" type="submit" class="button button-primary">生成分享码</button>
          </div>
        </form>

        <section id="sendResult" class="notice notice-success hidden" aria-live="polite">
          <div class="notice-head">
            <div>
              <p class="label">分享成功</p>
              <h3>把这个分享码发给对方</h3>
            </div>
            <button id="copyCode" class="button button-ghost" type="button">复制</button>
          </div>
          <div id="generatedCode" class="share-code" aria-label="生成的分享码"></div>
          <p id="sendExpiresInfo" class="notice-meta"></p>
        </section>
      </article>

      <article class="panel panel-retrieve">
        <div class="panel-head">
          <div>
            <p class="kicker">获取文本</p>
            <h2>输入分享码查看内容</h2>
          </div>
          <span class="panel-tag panel-tag-soft">手机可用</span>
        </div>

        <form id="retrieveForm" class="form">
          <label for="codeInput">6 位分享码</label>
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
          <button id="retrieveButton" type="submit" class="button button-primary">查看文本</button>
        </form>

        <section id="retrieveResult" class="notice notice-success hidden" aria-live="polite">
          <p class="label">获取成功</p>
          <div id="retrievedText" class="text-output"></div>
          <p id="expiresInfo" class="notice-meta"></p>
        </section>

        <section id="errorResult" class="notice notice-error hidden" role="status" aria-live="polite">
          <p id="errorMessage"></p>
        </section>
      </article>
    </section>

    <footer class="footer">
      <span>Text Share</span>
      <span>文本将在 24 小时后自动删除</span>
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
  color-scheme: light;
  --page: #f6f7fb;
  --surface: #ffffff;
  --surface-muted: #eef2f7;
  --ink: #172033;
  --muted: #647084;
  --line: #d8dfeb;
  --blue: #1f66e5;
  --blue-dark: #174db2;
  --green: #138a5b;
  --red: #c7363f;
  --amber: #936214;
  --shadow: 0 18px 48px rgba(23, 32, 51, 0.12);
  --radius: 8px;
}

* {
  box-sizing: border-box;
}

html {
  min-height: 100%;
  background: var(--page);
}

body {
  margin: 0;
  min-height: 100vh;
  color: var(--ink);
  font-family: "Segoe UI", "Microsoft YaHei", Arial, sans-serif;
  background:
    linear-gradient(180deg, rgba(31, 102, 229, 0.08), transparent 260px),
    var(--page);
}

button,
input,
textarea {
  font: inherit;
}

button {
  border: 0;
}

.app-shell {
  width: min(1160px, calc(100% - 32px));
  margin: 0 auto;
  padding: 24px 0 32px;
}

.topbar,
.summary,
.metrics,
.ip-card,
.workspace,
.footer {
  position: relative;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 56px;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 12px;
}

.brand-mark {
  display: inline-grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: var(--radius);
  color: #ffffff;
  background: #172033;
  font-weight: 800;
}

.brand p,
.brand strong,
.eyebrow,
.kicker,
.label,
.notice p,
.footer {
  margin: 0;
}

.brand p {
  color: var(--muted);
  font-size: 0.82rem;
}

.brand strong {
  display: block;
  margin-top: 2px;
  font-size: 0.98rem;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--muted);
  background: rgba(255, 255, 255, 0.72);
  font-size: 0.88rem;
  white-space: nowrap;
}

.status-pill span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--green);
}

.summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 460px);
  gap: 24px;
  align-items: end;
  padding: 42px 0 24px;
}

.eyebrow,
.kicker,
.label {
  color: var(--blue);
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0;
}

.summary h1 {
  max-width: 680px;
  margin: 10px 0 0;
  font-size: clamp(2.1rem, 5vw, 4.6rem);
  line-height: 1.06;
  letter-spacing: 0;
}

.summary-copy {
  margin: 0;
  color: var(--muted);
  font-size: 1rem;
  line-height: 1.75;
}

.metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 4px 0 18px;
}

.metrics div {
  min-height: 88px;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: rgba(255, 255, 255, 0.72);
}

.metrics span {
  display: block;
  color: var(--muted);
  font-size: 0.86rem;
}

.metrics strong {
  display: block;
  margin-top: 8px;
  font-size: 1.08rem;
}

.ip-card {
  margin: 0 0 18px;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: rgba(255, 255, 255, 0.8);
}

.ip-card-head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.ip-card h2 {
  margin: 6px 0 0;
  font-size: 1.45rem;
  line-height: 1.2;
}

.ip-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
}

.ip-grid div {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: #fbfcff;
}

.ip-grid dt {
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 700;
}

.ip-grid dd {
  margin: 6px 0 0;
  font-weight: 800;
  overflow-wrap: anywhere;
}

.workspace {
  display: grid;
  grid-template-columns: minmax(0, 1.12fr) minmax(340px, 0.88fr);
  gap: 18px;
  align-items: start;
}

.panel {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow);
}

.panel-compose,
.panel-retrieve {
  padding: 22px;
}

.panel-head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 18px;
}

.panel h2 {
  margin: 6px 0 0;
  font-size: 1.28rem;
  line-height: 1.25;
}

.panel-tag {
  flex: none;
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  color: var(--blue-dark);
  background: #e8f0ff;
  font-size: 0.78rem;
  font-weight: 700;
  white-space: nowrap;
}

.panel-tag-soft {
  color: var(--green);
  background: #e8f6ef;
}

.form {
  display: grid;
  gap: 12px;
}

.form label {
  color: var(--muted);
  font-size: 0.9rem;
  font-weight: 700;
}

textarea,
input[type="text"] {
  width: 100%;
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: #fbfcff;
  outline: none;
  transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
}

textarea {
  min-height: 300px;
  padding: 16px;
  resize: vertical;
  line-height: 1.65;
}

input[type="text"] {
  min-height: 54px;
  padding: 0 16px;
  font-size: 1.08rem;
  letter-spacing: 0.08em;
}

textarea::placeholder,
input[type="text"]::placeholder {
  color: #98a3b5;
}

textarea:focus,
input[type="text"]:focus {
  border-color: var(--blue);
  background: #ffffff;
  box-shadow: 0 0 0 4px rgba(31, 102, 229, 0.12);
}

.form-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.counter {
  color: var(--muted);
  font-size: 0.9rem;
}

.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 46px;
  padding: 0 18px;
  border-radius: var(--radius);
  font-weight: 800;
  cursor: pointer;
  transition: transform 140ms ease, background 140ms ease, box-shadow 140ms ease, opacity 140ms ease;
}

.button:hover {
  transform: translateY(-1px);
}

.button:active {
  transform: translateY(0);
}

.button:disabled {
  cursor: wait;
  opacity: 0.72;
}

.button-primary {
  color: #ffffff;
  background: var(--blue);
  box-shadow: 0 10px 22px rgba(31, 102, 229, 0.22);
}

.button-primary:hover {
  background: var(--blue-dark);
}

.button-ghost {
  min-height: 38px;
  color: var(--ink);
  background: var(--surface-muted);
}

.notice {
  margin-top: 16px;
  padding: 16px;
  border-radius: var(--radius);
  border: 1px solid var(--line);
}

.hidden {
  display: none;
}

.notice-success {
  background: #f7fbf9;
  border-color: #bedfce;
}

.notice-error {
  color: #7a1820;
  background: #fff1f2;
  border-color: #f2b5bb;
}

.notice-head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 12px;
}

.notice h3 {
  margin: 4px 0 0;
  font-size: 1.05rem;
}

.share-code {
  display: grid;
  place-items: center;
  min-height: 116px;
  margin: 14px 0 10px;
  border: 1px dashed #9ab3dc;
  border-radius: var(--radius);
  color: #0e2b5f;
  background: #edf4ff;
  font-size: clamp(2.2rem, 8vw, 3.8rem);
  font-weight: 900;
  letter-spacing: 0.18em;
  text-indent: 0.18em;
}

.notice-meta {
  color: var(--muted);
  font-size: 0.88rem;
}

.text-output {
  min-height: 220px;
  max-height: 420px;
  overflow: auto;
  margin: 10px 0;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: #ffffff;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.7;
}

.footer {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 0 0;
  color: var(--muted);
  font-size: 0.88rem;
}

@media (max-width: 900px) {
  .summary,
  .workspace {
    grid-template-columns: 1fr;
  }

  .summary {
    align-items: start;
  }
}

@media (max-width: 680px) {
  .app-shell {
    width: min(100% - 20px, 1160px);
    padding: 14px 0 22px;
  }

  .topbar,
  .summary,
  .panel-head,
  .notice-head,
  .form-footer,
  .footer {
    flex-direction: column;
    align-items: stretch;
  }

  .summary {
    display: block;
    padding: 26px 0 18px;
  }

  .summary-copy {
    margin-top: 14px;
  }

  .metrics {
    grid-template-columns: 1fr;
  }

  .ip-card-head {
    flex-direction: column;
    align-items: stretch;
  }

  .ip-grid {
    grid-template-columns: 1fr;
  }

  .panel-compose,
  .panel-retrieve {
    padding: 16px;
  }

  textarea {
    min-height: 240px;
  }

  .button {
    width: 100%;
  }

  .status-pill {
    justify-content: center;
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
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
const charCount = document.getElementById('charCount');
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
const sendButton = document.getElementById('sendButton');
const retrieveButton = document.getElementById('retrieveButton');
const ipAddress = document.getElementById('ipAddress');
const ipStatus = document.getElementById('ipStatus');
const ipLocation = document.getElementById('ipLocation');
const ipIsp = document.getElementById('ipIsp');
const ipOrg = document.getElementById('ipOrg');
const ipTimezone = document.getElementById('ipTimezone');

const MAX_LENGTH = 10000;
const ERROR_HIDE_MS = 5000;

function setCharCount(value) {
  const length = value.length;
  charCount.textContent = length + ' / ' + MAX_LENGTH;
  charCount.style.color = length > 9000 ? '#c7363f' : length > 7000 ? '#936214' : '';
}

function formatExpiresAt(expiresAt) {
  return new Date(expiresAt).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
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

function setButtonLoading(button, isLoading, loadingLabel) {
  if (!button.dataset.defaultLabel) {
    button.dataset.defaultLabel = button.textContent;
  }
  button.disabled = isLoading;
  button.textContent = isLoading ? loadingLabel : button.dataset.defaultLabel;
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

async function loadIPInfo() {
  try {
    const response = await fetch('/api/ip');
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'IP query failed');
    }

    const location = [result.country, result.region, result.city].filter(Boolean).join(' / ');
    ipAddress.textContent = result.ip || '--';
    ipLocation.textContent = location || '--';
    ipIsp.textContent = result.isp || '--';
    ipOrg.textContent = result.org || '--';
    ipTimezone.textContent = result.timezone || '--';
    ipStatus.textContent = '已更新';
  } catch (error) {
    console.error(error);
    ipAddress.textContent = '查询失败';
    ipLocation.textContent = '--';
    ipIsp.textContent = '--';
    ipOrg.textContent = '--';
    ipTimezone.textContent = '--';
    ipStatus.textContent = '不可用';
  }
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

  setButtonLoading(sendButton, true, '生成中...');

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
  } finally {
    setButtonLoading(sendButton, false);
  }
});

retrieveForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const code = codeInput.value.trim();

  if (!/^\\d{6}$/.test(code)) {
    showError('请输入 6 位数字分享码。');
    return;
  }

  setButtonLoading(retrieveButton, true, '查询中...');

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
  } finally {
    setButtonLoading(retrieveButton, false);
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
clearResults();
loadIPInfo();`;

  return new Response(js, {
    headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
  });
}
