/* ============================================================
   TrueGuard AI — app.js
   Handles: live highlight, photo upload, analyze, result render
   ============================================================ */

// ===================== LIVE HIGHLIGHT ENGINE =====================

const SIGNALS = [
  {
    type: 'urgency',
    label: 'ШҰҒЫЛ',
    cls: 'chip-urgency',
    hlClass: 'hl-urgency',
    patterns: [/срочно/gi, /тез\b/gi, /қазір/gi, /шұғыл/gi, /дереу/gi, /жылдам/gi, /немедленно/gi, /сейчас/gi]
  },
  {
    type: 'secrecy',
    label: 'ҚҰПИЯ',
    cls: 'chip-secrecy',
    hlClass: 'hl-secrecy',
    patterns: [/ешкімге айтпа/gi, /құпия/gi, /никому/gi, /не говори/gi, /тайно/gi, /жасырын/gi]
  },
  {
    type: 'money',
    label: 'АҚША',
    cls: 'chip-money',
    hlClass: 'hl-money',
    patterns: [/ақша/gi, /kaspi/gi, /аудар/gi, /IBAN/gi, /карта/gi, /деньги/gi, /перевод/gi, /счёт/gi, /тенге/gi, /сом\b/gi]
  },
  {
    type: 'code',
    label: 'КОД',
    cls: 'chip-code',
    hlClass: 'hl-code',
    patterns: [/ссылка/gi, /\bкод\b/gi, /\bSMS\b/gi, /\bOTP\b/gi, /сілтеме/gi, /\bкод\b/gi, /пароль/gi, /PIN/gi]
  }
];

const chatText      = document.getElementById('chatText');
const highlightLayer = document.getElementById('highlightLayer');
const chipsContainer = document.getElementById('chipsContainer');

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function applyHighlights(text) {
  let html = escapeHtml(text);
  // We mark positions by replacing with unique tokens then wrapping
  // Use a simpler approach: apply each pattern with mark tags
  SIGNALS.forEach(sig => {
    sig.patterns.forEach(pat => {
      html = html.replace(pat, (match) => `<mark class="${sig.hlClass}">${match}</mark>`);
    });
  });
  return html;
}

function detectSignals(text) {
  const found = new Set();
  SIGNALS.forEach(sig => {
    for (const pat of sig.patterns) {
      if (pat.test(text)) {
        found.add(sig.type);
        break;
      }
      // reset lastIndex for global regex
      pat.lastIndex = 0;
    }
  });
  return found;
}

function updateLiveHighlight() {
  const text = chatText.value;

  // Mirror to highlight layer
  highlightLayer.innerHTML = applyHighlights(text) + '<br/>';

  // Update chip signals
  const found = detectSignals(text);
  if (found.size === 0) {
    chipsContainer.innerHTML = '<span class="chip-empty">Сигнал жоқ</span>';
  } else {
    let html = '';
    SIGNALS.forEach(sig => {
      if (found.has(sig.type)) {
        html += `<span class="chip ${sig.cls}">${sig.label}</span>`;
      }
    });
    chipsContainer.innerHTML = html;
  }

  // Sync scroll
  highlightLayer.scrollTop = chatText.scrollTop;
}

chatText.addEventListener('input', updateLiveHighlight);
chatText.addEventListener('scroll', () => {
  highlightLayer.scrollTop = chatText.scrollTop;
});

// ===================== PHOTO UPLOAD =====================

const dropZone     = document.getElementById('dropZone');
const photoInput   = document.getElementById('photoInput');
const dropContent  = document.getElementById('dropContent');
const dropPreview  = document.getElementById('dropPreview');
const previewImg   = document.getElementById('previewImg');
const removePhotoBtn = document.getElementById('removePhotoBtn');

let photoFile = null;

function showPreview(file) {
  photoFile = file;
  const url = URL.createObjectURL(file);
  previewImg.src = url;
  dropContent.style.display = 'none';
  dropPreview.style.display = 'block';
  setStep(2);
}

function clearPhoto() {
  photoFile = null;
  photoInput.value = '';
  previewImg.src = '';
  dropContent.style.display = 'block';
  dropPreview.style.display = 'none';
  setStep(1);
}

photoInput.addEventListener('change', (e) => {
  if (e.target.files[0]) showPreview(e.target.files[0]);
});

removePhotoBtn.addEventListener('click', clearPhoto);

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('image/')) showPreview(f);
});

// ===================== STEP INDICATOR =====================

function setStep(n) {
  [1, 2, 3].forEach(i => {
    const el = document.getElementById('step' + i);
    if (el) el.classList.toggle('active', i <= n);
  });
}

chatText.addEventListener('input', () => {
  if (chatText.value.trim()) setStep(photoFile ? 2 : 1);
});

// ===================== RESULT STATE MANAGEMENT =====================

const states = ['resultEmpty', 'resultLoading', 'resultError', 'resultMain'];

function showState(id) {
  states.forEach(s => {
    const el = document.getElementById(s);
    if (el) el.style.display = (s === id) ? (s === 'resultMain' ? 'flex' : 'flex') : 'none';
  });
  document.getElementById('stopOverlay').style.display = 'none';
}

// Fix: resultMain should be flex column
document.getElementById('resultMain').style.flexDirection = 'column';

// ===================== ANALYZE =====================

const analyzeBtn  = document.getElementById('analyzeBtn');
const btnText     = analyzeBtn.querySelector('.btn-text');
const btnLoader   = document.getElementById('btnLoader');
const btnIcon     = analyzeBtn.querySelector('.btn-icon');
const statusPill  = document.getElementById('statusPill');

analyzeBtn.addEventListener('click', doAnalyze);

async function doAnalyze() {
  const text = chatText.value.trim();
  if (!text && !photoFile) {
    chatText.focus();
    chatText.style.borderColor = 'var(--red)';
    setTimeout(() => chatText.style.borderColor = '', 1500);
    return;
  }

  setStep(3);
  setLoading(true);
  showState('resultLoading');
  statusPill.textContent = '● Анализдеу...';
  statusPill.style.color = 'var(--amber)';

  const fd = new FormData();

// ✅ бекенд күтетіні
fd.append('username', '');   // сенде UI-да ондай input жоқ, сондықтан бос
fd.append('bio', '');        // бос

// ✅ негізгі мәтін
fd.append('chat_text', text || '');

// ✅ фото (міндетті емес)
if (photoFile) fd.append('photo', photoFile);

  try {
    const resp = await fetch('/analyze', { method: 'POST', body: fd });
    const contentType = resp.headers.get('content-type') || '';

    if (!contentType.includes('application/json')) {
      const raw = await resp.text();
      throw new Error(`Сервер JSON қайтармады: ${raw.slice(0, 200)}`);
    }

    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || JSON.stringify(data));

    renderResult(data);

  } catch (err) {
    console.error(err);
    showState('resultError');
    document.getElementById('errorMsg').textContent = err.message || 'Белгісіз қате';
    statusPill.textContent = '● Қате';
    statusPill.style.color = 'var(--red)';
  } finally {
    setLoading(false);
  }
}

function setLoading(on) {
  analyzeBtn.disabled = on;
  btnText.style.display = on ? 'none' : 'inline';
  btnIcon.style.display = on ? 'none' : 'inline';
  btnLoader.style.display = on ? 'inline-block' : 'none';
}

// ===================== RENDER RESULT =====================

let currentSafeReply = '';
let isHigh = false;

function renderResult(data) {
  const {
    risk_score = 0,
    risk_level = 'LOW',
    scam_type = '',
    manipulation_score = 0,
    vulnerability_score = 0,
    reasons = [],
    safety_coach = '',
    safe_reply = '',
    from_cache = false
  } = data;

  isHigh = risk_level === 'HIGH';
  currentSafeReply = safe_reply;

  showState('resultMain');

  // Status pill
  statusPill.textContent = '● Дайын';
  statusPill.style.color = 'var(--green-600)';

  // Risk ring
  const circumference = 314; // 2π * 50
  const offset = circumference - (risk_score / 100) * circumference;
  const ringFill = document.getElementById('ringFill');
  ringFill.style.strokeDashoffset = offset;
  ringFill.style.stroke = riskColor(risk_level);

  // Animate score counter
  animateNumber(document.getElementById('ringScore'), 0, risk_score, 1000);

  // Badge
  const badge = document.getElementById('riskBadge');
  badge.textContent = riskLabel(risk_level);
  badge.className = 'risk-badge ' + risk_level.toLowerCase();

  // Type
  document.getElementById('riskType').textContent = scam_type || '';

  // Mini meters
  animateBar('manipFill', manipulation_score);
  animateBar('vulnFill', vulnerability_score);
  animateNumber(document.getElementById('manipVal'), 0, manipulation_score, 900);
  animateNumber(document.getElementById('vulnVal'), 0, vulnerability_score, 900);

  // Evidence
  const eList = document.getElementById('evidenceList');
  eList.innerHTML = '';
  if (reasons.length === 0) {
    eList.innerHTML = '<li>Ерекше белгілер анықталмады</li>';
  } else {
    reasons.forEach(r => {
      const li = document.createElement('li');
      li.textContent = r;
      eList.appendChild(li);
    });
  }

  // Coach
  document.getElementById('coachText').textContent = safety_coach || 'Абай болыңыз.';

  // Reply tabs
  setActiveTab('polite');
  renderReplyTabs(safe_reply);

  // Cache notice
  const cacheEl = document.getElementById('cacheNotice');
  cacheEl.style.display = from_cache ? 'block' : 'none';

  // STOP overlay for HIGH
  if (isHigh) {
    document.getElementById('stopOverlay').style.display = 'flex';
    document.getElementById('copyBtn').disabled = true;
    document.getElementById('replyLocked').style.display = 'block';
    setupStopGate();
  } else {
    document.getElementById('stopOverlay').style.display = 'none';
    document.getElementById('copyBtn').disabled = false;
    document.getElementById('replyLocked').style.display = 'none';
  }
}

// ===================== STOP GATE =====================

function setupStopGate() {
  const confirm  = document.getElementById('stopConfirm');
  const proceedBtn = document.getElementById('stopProceedBtn');

  // Reset
  confirm.checked = false;
  proceedBtn.disabled = true;

  confirm.onchange = () => {
    proceedBtn.disabled = !confirm.checked;
  };

  proceedBtn.onclick = () => {
    if (!confirm.checked) return;
    document.getElementById('stopOverlay').style.display = 'none';
    document.getElementById('copyBtn').disabled = false;
    document.getElementById('replyLocked').style.display = 'none';
  };
}

// ===================== REPLY TABS =====================

const tabVariants = {
  polite: (base) => base,
  short:  (base) => shortenReply(base),
  strict: (base) => strictifyReply(base)
};

let currentTab = 'polite';

function shortenReply(text) {
  // Take first sentence or first 100 chars
  const first = text.split(/[.!?]/)[0];
  return (first || text).trim().slice(0, 120) + '.';
}

function strictifyReply(text) {
  const strictIntro = 'Мен бұл сұраныстан бас тартамын. ';
  const stripped = text.replace(/^(Сәлем|Рахмет|Жарайды)[^.]*\.\s*/i, '');
  return strictIntro + (stripped || text);
}

function renderReplyTabs(base) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.tab;
      document.getElementById('replyBox').textContent = tabVariants[currentTab](base);
    };
  });

  document.getElementById('replyBox').textContent = tabVariants[currentTab](base);
}

function setActiveTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
}

// ===================== COPY BUTTON =====================

document.getElementById('copyBtn').addEventListener('click', () => {
  const text = document.getElementById('replyBox').textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copyBtn');
    const span = document.getElementById('copyBtnText');
    span.textContent = '✓ Көшірілді!';
    btn.style.background = 'var(--green-700)';
    setTimeout(() => {
      span.textContent = '📋 Көшіру';
      btn.style.background = '';
    }, 2000);
  });
});

// ===================== HELPERS =====================

function riskColor(level) {
  return level === 'HIGH' ? '#ef4444' : level === 'MEDIUM' ? '#fbbf24' : '#34d399';
}

function riskLabel(level) {
  return level === 'HIGH' ? '🔴 ЖОҒАРЫ ҚАУІП' : level === 'MEDIUM' ? '🟡 ОРТАША ҚАУІП' : '🟢 ҚАУІП ТӨМ';
}

function animateNumber(el, from, to, duration) {
  if (!el) return;
  const start = performance.now();
  function step(now) {
    const p = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (to - from) * eased);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function animateBar(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  setTimeout(() => { el.style.width = val + '%'; }, 100);
}