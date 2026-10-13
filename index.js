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
  <meta name="theme-color" content="#080f1d">
  <title>Text Share</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <main class="app-shell">
    <header class="topbar" aria-label="Text Share">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">&gt;_</span>
        <div>
          <p>Text Share</p>
          <strong>无需登录 · 24 小时临时分享</strong>
        </div>
      </div>
      <div class="status-pill">
        <span aria-hidden="true"></span>
        ● 在线 · 24 小时自动过期
      </div>
    </header>

    <section class="summary" aria-label="服务说明">
      <div>
        <p class="eyebrow">TEXT SHARE / INSTANT TRANSFER</p>
        <h1>快速传文本，<em>跨设备即取</em></h1>
      </div>
      <p class="summary-copy">
        无需注册，通过 6 位数字分享码传递代码片段、临时笔记与链接。内容将在 24 小时后自动过期。
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

    <section class="workspace" aria-label="文本分享工具">
      <article class="panel panel-compose">
        <div class="panel-head">
          <div>
            <p class="kicker">发送文本</p>
            <h2>粘贴文本并生成分享码</h2>
          </div>
          <span class="panel-tag">STEP 01</span>
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
            <h2>输入分享码查看文本</h2>
          </div>
          <span class="panel-tag panel-tag-soft">STEP 02</span>
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
          <div class="notice-head">
            <p class="label">获取成功</p>
            <button id="copyRetrievedText" class="button button-ghost" type="button">复制文本</button>
          </div>
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
  const css = `:root{
color-scheme:dark;--page:#080f1d;--surface:#111c2d;--surface-muted:#0d1726;
--ink:#e7eef9;--muted:#91a3bb;--line:#25354b;--blue:#329bff;
--blue-dark:#1979e6;--green:#30efbf;--red:#f87182;--amber:#f4c96b;
--radius:12px;--shadow:0 18px 50px rgba(0,0,0,.22);
}
*{box-sizing:border-box}
html{min-height:100%;background:var(--page)}
body{margin:0;min-height:100vh;color:var(--ink);
font-family:Inter,"Segoe UI","Microsoft YaHei",Arial,sans-serif;
background:radial-gradient(ellipse 70% 37% at 16% -10%,rgba(29,183,169,.13),transparent 75%),radial-gradient(ellipse 50% 55% at 100% 0%,rgba(28,99,230,.12),transparent 74%),var(--page)}
button,input,textarea{font:inherit}
button{border:0}
.app-shell{width:min(1440px,calc(100% - 64px));margin:auto;padding:23px 0 28px}
.topbar{display:flex;justify-content:space-between;align-items:center;gap:18px;padding:0 0 22px;border-bottom:1px solid var(--line)}
.brand{display:inline-flex;align-items:center;gap:14px}
.brand-mark{display:grid;place-items:center;width:43px;height:43px;color:var(--green);font:bold 25px/1 Consolas,monospace;text-shadow:0 0 16px rgba(48,239,191,.35)}
.brand p,.brand strong,.eyebrow,.kicker,.label,.notice p,.footer{margin:0}
.brand p{font-weight:800;font-size:1.22rem;color:var(--ink)}
.brand strong{display:block;color:var(--muted);font-size:.78rem;font-weight:500;margin-top:4px}
.status-pill{color:var(--green);background:#102e31;border:1px solid #1e4847;border-radius:999px;padding:10px 15px;font-size:.79rem;font-weight:700;white-space:nowrap}
.status-pill span{display:none}
.summary{display:flex;justify-content:space-between;align-items:center;gap:38px;padding:38px 0 30px}
.summary>div{flex:1}
.eyebrow,.kicker,.label{color:var(--green);font-size:.76rem;letter-spacing:.08em;font-weight:800}
.summary h1{font-size:clamp(2.1rem,3.8vw,3.7rem);line-height:1.18;letter-spacing:-.035em;margin:11px 0 0}
.summary h1 em{font-style:normal;color:#78cfff}
.summary-copy{max-width:400px;line-height:1.85;color:var(--muted);font-size:.94rem;margin:0}
.metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:0 0 24px}
.metrics div{border:1px solid var(--line);border-radius:var(--radius);background:rgba(16,29,48,.8);padding:17px 22px;min-height:86px}
.metrics span{display:block;color:var(--muted);font-size:.78rem}
.metrics strong{display:block;color:#78cfff;font-size:1.08rem;margin-top:7px}
.metrics div:first-child strong{color:var(--green)}
.workspace{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px;align-items:stretch}
.panel{border:1px solid var(--line);border-radius:var(--radius);background:linear-gradient(150deg,#132236 0%,#0f1a2b 100%);box-shadow:var(--shadow);padding:24px;min-width:0}
.panel-compose{border-top:2px solid var(--green)}
.panel-retrieve{border-top:2px solid var(--blue)}
.panel-head{display:flex;align-items:start;justify-content:space-between;gap:12px;margin-bottom:22px}
.panel h2{margin:7px 0 0;font-size:1.18rem;line-height:1.45}
.panel-retrieve .kicker{color:#69b9ff}
.panel-tag{font-family:Consolas,monospace;font-size:.75rem;color:var(--green);background:rgba(48,239,191,.08);border:1px solid rgba(48,239,191,.21);border-radius:6px;padding:8px 10px;white-space:nowrap}
.panel-tag-soft{color:#69b9ff;background:rgba(50,155,255,.09);border-color:rgba(50,155,255,.23)}
.form{display:grid;gap:14px}
.form label{font-size:.84rem;color:#b5c5d8;font-weight:650}
textarea,input[type="text"]{display:block;width:100%;color:var(--ink);background:#081321;border:1px solid #304158;border-radius:9px;outline:0;transition:border-color .16s,box-shadow .16s}
textarea{min-height:320px;padding:19px;line-height:1.72;resize:vertical;font-size:.91rem;font-family:"Cascadia Code",Consolas,"Microsoft YaHei",monospace}
input[type="text"]{height:72px;padding:0 20px;text-align:center;letter-spacing:.34em;font-size:1.8rem;font-family:Consolas,monospace;font-weight:800}
textarea::placeholder,input::placeholder{color:#596d86}
textarea:focus{border-color:var(--green);box-shadow:0 0 0 3px rgba(48,239,191,.09)}
input:focus{border-color:var(--blue);box-shadow:0 0 0 3px rgba(50,155,255,.1)}
.form-footer{display:flex;align-items:center;justify-content:space-between;gap:14px}
.counter{font: .8rem Consolas,monospace;color:var(--muted)}
.button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:0 21px;border-radius:8px;font-weight:800;cursor:pointer;transition:transform .15s,filter .15s,box-shadow .15s}
.button:hover{filter:brightness(1.12);transform:translateY(-1px)}
.button:active{transform:translateY(0)}
.button:disabled{opacity:.68;cursor:wait}
.button-primary{color:#041b23;background:linear-gradient(90deg,#24ddb1,#51f5c4);box-shadow:0 5px 23px rgba(25,217,174,.14)}
.panel-retrieve .button-primary{background:linear-gradient(90deg,#1687f5,#36b0ff);color:#fff;box-shadow:0 5px 23px rgba(27,137,244,.17);width:100%}
.button-ghost{min-height:38px;color:var(--green);background:#112d31;border:1px solid #28675c}
.panel-retrieve .button-ghost{color:#85caff;background:#11233b;border-color:#285986}
.notice{border:1px solid #24534d;border-radius:10px;margin-top:20px;padding:18px;background:linear-gradient(135deg,rgba(9,50,46,.55),rgba(8,22,36,.78))}
.notice-success{border-color:#22554f}
.panel-retrieve .notice-success{border-color:#245077;background:linear-gradient(135deg,#112840,#0d1d30)}
.notice-error{color:#fec7cf;background:#451d2a;border-color:#8b3547}
.hidden{display:none!important}
.notice-head{display:flex;justify-content:space-between;align-items:center;gap:12px}
.notice h3{font-size:1rem;margin:5px 0 0}
.share-code{display:grid;place-items:center;min-height:96px;margin:19px 0 10px;padding:12px 6px;color:var(--green);background:#071c20;border:1px solid #1d5850;border-radius:10px;font:900 clamp(2rem,4.2vw,3.1rem)/1.2 Consolas,monospace;letter-spacing:.23em;text-indent:.23em;text-shadow:0 0 19px rgba(48,239,191,.3)}
.notice-meta{font-size:.78rem;color:var(--muted);line-height:1.7}
.text-output{min-height:220px;max-height:420px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;background:#081321;border:1px solid #304158;border-radius:8px;padding:18px;margin:15px 0 12px;color:#d9e8fa;line-height:1.7;font: .88rem/1.7 "Cascadia Code",Consolas,"Microsoft YaHei",monospace}
.footer{display:flex;justify-content:space-between;gap:12px;border-top:1px solid var(--line);padding-top:24px;margin-top:28px;color:var(--muted);font-size:.78rem}
@media(max-width:900px){.summary{align-items:start;flex-direction:column;gap:14px}.summary-copy{max-width:750px}.workspace{grid-template-columns:1fr}.metrics{gap:9px}}
@media(max-width:600px){.app-shell{width:calc(100% - 28px);padding-top:16px}.summary{padding:28px 0 20px}.summary h1{font-size:2.1rem}.metrics{grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.metrics div{padding:12px 8px;min-height:72px}.metrics strong{font-size:.91rem}.metrics span{font-size:.7rem}.panel{padding:17px}.panel-head{align-items:center}.panel h2{font-size:1rem}.panel-tag{font-size:.65rem;padding:6px}.topbar{padding-bottom:14px}.status-pill{font-size:.68rem;padding:8px}.brand strong{font-size:.7rem}.brand p{font-size:1.05rem}textarea{min-height:230px}.form-footer{align-items:stretch;flex-direction:column}.button{width:100%}.notice-head{align-items:start}.footer{flex-direction:column}.share-code{font-size:2rem;letter-spacing:.12em}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{transition-duration:.01ms!important}}
`;
  return new Response(css, {headers: {'Content-Type': 'text/css; charset=utf-8'}});
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
const copyRetrievedText = document.getElementById('copyRetrievedText');
const sendExpiresInfo = document.getElementById('sendExpiresInfo');
const expiresInfo = document.getElementById('expiresInfo');
const errorResult = document.getElementById('errorResult');
const errorMessage = document.getElementById('errorMessage');
const sendButton = document.getElementById('sendButton');
const retrieveButton = document.getElementById('retrieveButton');

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

copyRetrievedText.addEventListener('click', async () => {
  const text = retrievedText.textContent;
  if (!text) {
    return;
  }

  try {
    await copyText(text);
    flashButton(copyRetrievedText, '已复制');
  } catch (error) {
    console.error(error);
    showError('复制文本失败，请检查浏览器剪贴板权限后重试。');
  }
});

setCharCount(textInput.value);
clearResults();
`;

  return new Response(js, {
    headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
  });
}
