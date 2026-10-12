(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const LETTERS = ['A', 'B', 'C', 'D', 'E'];
  const KEYS = { hist: 'thuy-quiz-history-v1', theme: 'thuy-quiz-theme', prefs: 'thuy-quiz-prefs-v1', session: 'thuy-quiz-session-v1' };
  const THEME_BG = { dark: '#0a0e1a', light: '#eef2f9' }; // keep in sync with --bg in style.css

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  };

  // Vietnamese names for the book's sections (English kept as subtitle).
  const SECTION_META = {
    'Assessment Test': { tag: 'Tổng hợp', vi: 'Đề đánh giá tổng hợp' },
    'Chapter 1 - What Is a Project?': { tag: 'Chương 1', vi: 'Dự án là gì?' },
    'Chapter 2 - Creating the Project Charter and Preliminary Scope Statement': { tag: 'Chương 2', vi: 'Điều lệ dự án & phạm vi sơ bộ' },
    'Chapter 3 - Developing the Project Scope Statement': { tag: 'Chương 3', vi: 'Xây dựng tuyên bố phạm vi' },
    'Chapter 4 - Creating the WBS and Communicating the Plan': { tag: 'Chương 4', vi: 'Lập WBS & kế hoạch truyền thông' },
    'Chapter 5 - Risk Planning': { tag: 'Chương 5', vi: 'Lập kế hoạch rủi ro' },
    'Chapter 6 - Resource Planning': { tag: 'Chương 6', vi: 'Lập kế hoạch nguồn lực' },
    'Chapter 7 - Creating the Project Schedule and Budget': { tag: 'Chương 7', vi: 'Lập tiến độ & ngân sách' },
    'Chapter 8 - Developing the Project Team': { tag: 'Chương 8', vi: 'Phát triển đội dự án' },
    'Chapter 9 - Measuring and Controlling Project Performance': { tag: 'Chương 9', vi: 'Đo lường & kiểm soát hiệu suất' },
    'Chapter 10 - Monitoring and Controlling Change': { tag: 'Chương 10', vi: 'Giám sát & kiểm soát thay đổi' },
    'Chapter 11 - Controlling Work Results and Closing Out the Project': { tag: 'Chương 11', vi: 'Kiểm soát kết quả & kết thúc dự án' },
    'Chapter 12 - Applying Professional Responsibility': { tag: 'Chương 12', vi: 'Trách nhiệm nghề nghiệp' },
  };
  const meta = (s) => SECTION_META[s] || { tag: 'Phần', vi: s };
  const enTitle = (s) => s.replace(/^Chapter \d+ - /, '');

  let ALL = [];
  let BY_ID = new Map();
  let history = store.get(KEYS.hist, {});
  let prefs = Object.assign({ mode: 'practice', count: 0, shuffle: false, viAlways: false }, store.get(KEYS.prefs, {}));
  let S = null;           // current session (quiz or review)
  let lastRun = null;     // {ids, title, mode} of the last run, for "Làm lại"
  let lastResult = null;  // {qs, picks, title} of the last finished run, for the result page and reviews
  let view = 'home';

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (name, cls = 'i') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const answers = (q) => String(q.answer).split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
  const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
  const isCorrect = (q, pick) => sameSet(pick, answers(q));
  const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const nf = new Intl.NumberFormat('vi-VN');
  const pctFmt = new Intl.NumberFormat('vi-VN', { style: 'percent', maximumFractionDigits: 0 });
  const announce = (msg) => { const el = $('#liveStatus'); el.textContent = ''; requestAnimationFrame(() => { el.textContent = msg; }); };

  /* ================= views + browser history ================= */
  // Each view is a history entry, so the phone's Back button returns to the previous screen instead of leaving the site.
  const HASH = { home: '', quiz: '#lam-bai', result: '#ket-qua' };
  const nav = {
    push(v, extra = {}) { window.history.pushState({ view: v, ...extra }, '', location.pathname + HASH[v]); },
    replace(v, extra = {}) { window.history.replaceState({ view: v, ...extra }, '', location.pathname + HASH[v]); },
    // go back one entry if we created it, otherwise run the fallback in place
    back(fallback) {
      const st = window.history.state;
      if (st && st.view && st.view !== 'home' && st.pushed) window.history.back();
      else fallback();
    },
  };

  function show(id, { focus = true } = {}) {
    view = id;
    ['home', 'quiz', 'result'].forEach((v) => $('#' + v).classList.toggle('hidden', v !== id));
    // while answering, the header turns into the quiz bar (back · title · progress)
    document.body.classList.toggle('in-quiz', id === 'quiz');
    document.documentElement.classList.toggle('quiz-open', id === 'quiz');
    $('#quizHead').classList.toggle('hidden', id !== 'quiz');
    closeSheet({ silent: true });
    window.scrollTo({ top: 0 });
    if (focus) {
      const target = { home: '#homeTitle', quiz: '#qcard', result: '#scoreTitle' }[id];
      $(target).focus({ preventScroll: true });
    }
  }

  let ignorePop = false; // set when closeSheet() itself steps back over the sheet's history entry
  window.addEventListener('popstate', (e) => {
    if (ignorePop) { ignorePop = false; return; }
    const st = e.state || { view: 'home' };
    if ($('#aside').classList.contains('open') && !st.sheet) { closeSheet({ silent: true }); if (st.view === 'quiz') return; }
    if (st.view === 'quiz' && S) { show('quiz'); render(); return; }
    if (st.view === 'result' && lastResult) { S = null; show('result'); return; }
    S = null; renderHome(); show('home');
  });

  /* ================= question list: side column on desktop, bottom sheet on mobile ================= */
  const mqMobile = window.matchMedia('(max-width: 1023px)');
  const isMobile = () => mqMobile.matches;
  const bgEls = () => [$('.topbar'), $('.quiz-main'), $('.foot')];
  function openSheet() {
    const aside = $('#aside');
    aside.classList.add('open');
    aside.setAttribute('role', 'dialog');
    aside.setAttribute('aria-modal', 'true');
    aside.setAttribute('aria-labelledby', 'asideTitle');
    $('#sheetBackdrop').hidden = false;
    document.body.classList.add('sheet-open');
    bgEls().forEach((el) => { el.inert = true; });
    $('#mapBtn').setAttribute('aria-expanded', 'true');
    window.history.pushState({ view: 'quiz', sheet: true, pushed: true }, '', location.href);
    // visibility flips on the next frame (see .quiz-aside.open), focus after it
    requestAnimationFrame(() => {
      const cur = $('#qmap .cur');
      if (cur) { cur.scrollIntoView({ block: 'nearest' }); cur.focus({ preventScroll: true }); }
    });
  }
  function closeSheet({ silent = false, restoreFocus = false } = {}) {
    const aside = $('#aside');
    if (!aside.classList.contains('open')) return;
    aside.classList.remove('open');
    ['role', 'aria-modal', 'aria-labelledby'].forEach((a) => aside.removeAttribute(a));
    $('#sheetBackdrop').hidden = true;
    document.body.classList.remove('sheet-open');
    bgEls().forEach((el) => { el.inert = false; });
    $('#mapBtn').setAttribute('aria-expanded', 'false');
    // drop the history entry the sheet added (unless we got here from the Back button itself)
    if (!silent && window.history.state && window.history.state.sheet) { ignorePop = true; window.history.back(); }
    if (restoreFocus) $('#mapBtn').focus({ preventScroll: true });
  }
  const onMqChange = () => closeSheet();
  if (mqMobile.addEventListener) mqMobile.addEventListener('change', onMqChange); else mqMobile.addListener(onMqChange);

  /* ================= theme ================= */
  const syncThemeColor = (t) => { const m = $('meta[name="theme-color"]'); if (m) m.content = THEME_BG[t] || THEME_BG.dark; };
  syncThemeColor(document.documentElement.dataset.theme);
  $('#themeBtn').onclick = () => {
    const t = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = t;
    store.set(KEYS.theme, t);
    syncThemeColor(t);
  };

  /* ================= settings ================= */
  function applyPrefsToForm() {
    const m = document.querySelector(`input[name="mode"][value="${prefs.mode}"]`);
    if (m) m.checked = true;
    const c = document.querySelector(`input[name="count"][value="${prefs.count}"]`);
    if (c) c.checked = true;
    $('#shuffleChk').checked = prefs.shuffle;
    $('#viAlwaysChk').checked = prefs.viAlways;
  }
  document.querySelector('.settings').addEventListener('change', () => {
    prefs = {
      mode: document.querySelector('input[name="mode"]:checked').value,
      count: +document.querySelector('input[name="count"]:checked').value,
      shuffle: $('#shuffleChk').checked,
      viAlways: $('#viAlwaysChk').checked,
    };
    store.set(KEYS.prefs, prefs);
  });

  /* ================= home ================= */
  const sections = () => [...new Set(ALL.map((q) => q.section))];
  const wrongList = () => ALL.filter((q) => history[q.id] && history[q.id].last === false);

  function progressOf(qs) {
    let ok = 0, bad = 0;
    qs.forEach((q) => { const h = history[q.id]; if (h) (h.last ? ok++ : bad++); });
    return { ok, bad, done: ok + bad, total: qs.length };
  }

  function meterHtml(p) {
    const w = (n) => (p.total ? (n / p.total) * 100 : 0);
    return `<div class="meter" role="img" aria-label="Đã làm ${p.done}/${p.total}, đúng ${p.ok}, sai ${p.bad}">
      <i class="m-ok" style="width:${w(p.ok)}%"></i><i class="m-bad" style="width:${w(p.bad)}%"></i></div>
      <div class="scard-meta"><span>Đã làm ${nf.format(p.done)}/${nf.format(p.total)}</span><span>${p.done ? `Đúng ${pctFmt.format(p.ok / p.done)}` : 'Chưa làm'}</span></div>`;
  }

  function renderHome() {
    if (!ALL.length) return;
    const all = progressOf(ALL);
    $('#stats').innerHTML = [
      ['', 'layers', nf.format(ALL.length), 'Tổng số câu'],
      ['', 'target', nf.format(all.done), 'Đã làm'],
      ['ok', 'check', nf.format(all.ok), 'Đang đúng'],
      ['bad', 'flag', nf.format(all.bad), 'Cần ôn lại'],
    ].map(([c, ic, n, l]) => `<div class="stat ${c}">${icon(ic)}<b>${n}</b><span>${l}</span></div>`).join('');

    const wrong = wrongList();
    const cards = [
      `<button type="button" class="scard" data-start="__all">
        <div class="scard-top"><span class="tag">${icon('layers')}Toàn bộ</span><span class="scard-count">${nf.format(ALL.length)} câu</span></div>
        <h3>Tất cả câu hỏi</h3><p class="en">Đề tổng hợp và 12 chương</p>
        <div class="scard-foot">${meterHtml(all)}</div></button>`,
      `<button type="button" class="scard" data-start="__wrong" ${wrong.length ? '' : 'disabled'}>
        <div class="scard-top"><span class="tag bad">${icon('flag')}Ôn câu sai</span><span class="scard-count">${nf.format(wrong.length)} câu</span></div>
        <h3>Luyện lại các câu đang sai</h3>
        <p class="en">${wrong.length ? 'Lấy từ kết quả lần làm gần nhất của mỗi câu' : 'Chưa có câu sai nào, cứ làm bài trước đã'}</p></button>`,
      ...sections().map((s) => {
        const qs = ALL.filter((q) => q.section === s);
        const m = meta(s);
        return `<button type="button" class="scard" data-start="${esc(s)}">
          <div class="scard-top"><span class="tag ${s === 'Assessment Test' ? 'accent' : ''}">${esc(m.tag)}</span><span class="scard-count">${nf.format(qs.length)} câu</span></div>
          <h3>${esc(m.vi)}</h3><p class="en" lang="en" translate="no">${esc(enTitle(s))}</p>
          <div class="scard-foot">${meterHtml(progressOf(qs))}</div></button>`;
      }),
    ];
    $('#sectionGrid').innerHTML = cards.join('');
    renderResume();
  }

  const unfinished = () => {
    const s = store.get(KEYS.session, null);
    return s && Array.isArray(s.ids) && s.ids.length && Array.isArray(s.picks) && !s.submitted ? s : null;
  };

  function renderResume() {
    const saved = unfinished();
    const box = $('#resumeBox');
    if (!saved) { box.innerHTML = ''; return; }
    const answered = saved.picks.filter((p) => p.length).length;
    box.innerHTML = `<div class="resume" role="region" aria-label="Bài đang làm dở">
      <p>Bạn đang làm dở <b>${esc(saved.title)}</b> (${saved.mode === 'exam' ? 'thi thử' : 'luyện tập'}): đã trả lời ${answered}/${saved.ids.length} câu.</p>
      <div class="actions">
        <button type="button" class="btn btn-primary btn-sm" id="resumeBtn">${icon('play')}Làm tiếp</button>
        <button type="button" class="btn btn-ghost btn-sm" id="discardBtn">Bỏ bài này</button>
      </div></div>`;
    $('#resumeBtn').onclick = () => resumeSession(saved);
    $('#discardBtn').onclick = () => { if (!confirm('Bỏ bài đang làm dở? Các câu đã chọn trong bài này sẽ không được lưu tiếp.')) return; store.del(KEYS.session); renderResume(); };
  }

  $('#sectionGrid').addEventListener('click', (e) => {
    const card = e.target.closest('.scard');
    if (!card || card.disabled) return;
    const saved = unfinished();
    if (saved && saved.picks.some((p) => p.length)
      && !confirm(`Bạn đang làm dở "${saved.title}" (đã trả lời ${saved.picks.filter((p) => p.length).length}/${saved.ids.length} câu). Bắt đầu bài mới sẽ bỏ bài đó. Tiếp tục?`)) return;
    const key = card.dataset.start;
    let qs, title;
    if (key === '__all') { qs = ALL; title = 'Tất cả câu hỏi'; }
    else if (key === '__wrong') { qs = wrongList(); title = 'Ôn câu sai'; }
    else { qs = ALL.filter((q) => q.section === key); title = `${meta(key).tag} · ${meta(key).vi}`; }
    if (prefs.shuffle) qs = shuffle(qs);
    if (prefs.count && prefs.count < qs.length) qs = qs.slice(0, prefs.count);
    if (!qs.length) return;
    startSession(qs, prefs.mode, { title });
  });

  /* ---------- search ---------- */
  const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
  let searchTimer = 0;
  $('#searchBox').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(e.target.value), 120);
  });
  function runSearch(raw) {
    const term = norm(raw.trim());
    const box = $('#searchResults');
    if (term.length < 2) { box.innerHTML = ''; $('#searchInfo').textContent = ''; return; }
    const hits = ALL.filter((q) => norm([q.question, q.question_vi, ...Object.values(q.options || {}), ...Object.values(q.options_vi || {})].join(' ')).includes(term));
    $('#searchInfo').textContent = hits.length ? `Tìm thấy ${nf.format(hits.length)} câu${hits.length > 30 ? ' (hiển thị 30 câu đầu)' : ''}.` : 'Không tìm thấy câu nào. Thử từ khoá ngắn hơn hoặc bằng tiếng Anh.';
    box.innerHTML = hits.slice(0, 30).map((q) => `
      <details class="sr">
        <summary><span><span class="sr-meta">${esc(meta(q.section).tag)} · Câu ${q.number}</span><span class="sr-q" lang="en">${esc(q.question)}</span></span></summary>
        ${explainHtml(q, { withOptsVi: true })}
      </details>`).join('');
  }

  $('#resetBtn').onclick = () => {
    if (!confirm('Xoá toàn bộ lịch sử làm bài trên trình duyệt này? Thao tác này không hoàn tác được.')) return;
    history = {}; store.set(KEYS.hist, history); store.del(KEYS.session); renderHome();
  };

  /* ================= session ================= */
  function startSession(qs, mode, opts = {}) {
    S = {
      ids: qs.map((q) => q.id), qs, mode, i: opts.i || 0, title: opts.title || 'Bài làm',
      picks: opts.picks || qs.map(() => []),
      locked: opts.locked || qs.map(() => !!opts.review),
      showVi: qs.map(() => false),
      review: !!opts.review,
      submitted: !!opts.review,
    };
    if (!S.review) lastRun = { ids: S.ids.slice(), title: S.title, mode };
    if (opts.replace) nav.replace('quiz', { pushed: true }); else nav.push('quiz', { pushed: true, review: S.review });
    $('#qmap').innerHTML = ''; // rebuilt for the new session
    render();
    show('quiz');
    saveSession();
  }

  function resumeSession(saved) {
    const qs = saved.ids.map((id) => BY_ID.get(id)).filter(Boolean);
    if (qs.length !== saved.ids.length || saved.picks.length !== qs.length) { store.del(KEYS.session); renderResume(); return; }
    startSession(qs, saved.mode, { title: saved.title, picks: saved.picks, locked: saved.locked, i: Math.min(saved.i || 0, qs.length - 1) });
  }

  function saveSession() {
    if (!S || S.review) return;
    store.set(KEYS.session, { ids: S.ids, mode: S.mode, i: S.i, title: S.title, picks: S.picks, locked: S.locked, submitted: S.submitted });
  }

  function record(q, ok) {
    history = store.get(KEYS.hist, {}); // merge onto the latest copy (another tab may have written)
    const h = history[q.id] || { tries: 0, right: 0 };
    h.tries++; if (ok) h.right++; h.last = ok;
    history[q.id] = h; store.set(KEYS.hist, history);
  }

  const revealed = (i) => S.locked[i] && (S.mode === 'practice' || S.submitted);

  function explainHtml(q, { withOptsVi = false } = {}) {
    const ans = answers(q);
    const ansLines = ans.map((a) => `<div><b>${a}.</b> <span lang="en">${esc(q.options[a])}</span>${q.options_vi && q.options_vi[a] ? `<div class="muted">${esc(q.options_vi[a])}</div>` : ''}</div>`).join('');
    const optsVi = withOptsVi ? `<div class="vi-opts">${LETTERS.filter((l) => q.options_vi && q.options_vi[l]).map((l) => `<div><b>${l}.</b> ${esc(q.options_vi[l])}</div>`).join('')}</div>` : '';
    return `<div class="explain">
      <div class="explain-block ans"><h3>${icon('check')}Đáp án đúng: ${ans.join(', ')}</h3>${ansLines}</div>
      <div class="explain-block"><h3>${icon('lang')}Dịch đề</h3><p>${esc(q.question_vi)}</p>${optsVi}</div>
      <div class="explain-block"><h3>${icon('bulb')}Giải thích</h3><p>${esc(q.explanation_vi)}</p></div>
      ${q.note_vi ? `<div class="explain-block note"><h3>${icon('alert')}Lưu ý</h3><p>${esc(q.note_vi)}</p></div>` : ''}
    </div>`;
  }

  // Remember what had keyboard focus inside the quiz so a re-render can put it back.
  function focusSnapshot() {
    const ae = document.activeElement;
    if (!ae || ae === document.body) return null;
    if (ae.closest('#qcard .opt')) return { opt: ae.dataset.l };
    if (ae.closest('#qcard') && ae.id) return { id: ae.id };
    if (ae.closest('#qmap')) return { map: true };
    return null;
  }
  function restoreFocus(snap) {
    if (!snap) return;
    let el = null;
    if (snap.opt) el = $(`#qcard .opt[data-l="${snap.opt}"]:not(:disabled)`) || $('#qcard .verdict');
    else if (snap.id) el = document.getElementById(snap.id) || $('#qcard .verdict') || $('#nextBtn');
    else if (snap.map) el = $('#qmap .cur');
    if (el) el.focus({ preventScroll: true });
  }

  function render() {
    const snap = focusSnapshot();
    const { qs, i } = S;
    const q = qs[i];
    const pick = S.picks[i];
    const ans = answers(q);
    const multi = ans.length > 1;
    const rev = revealed(i);
    const viOn = prefs.viAlways || S.showVi[i] || rev;

    const opts = LETTERS.filter((l) => q.options && q.options[l] != null).map((l) => {
      let cls = 'opt', mark = '';
      if (rev) {
        if (ans.includes(l)) { cls += ' correct'; mark = icon('check', 'i mark'); }
        else if (pick.includes(l)) { cls += ' wrong'; mark = icon('x', 'i mark'); }
        else cls += ' dim';
      } else if (pick.includes(l)) cls += ' picked';
      const vi = viOn && q.options_vi && q.options_vi[l] ? `<span class="vi">${esc(q.options_vi[l])}</span>` : '';
      return `<button type="button" class="${cls}" data-l="${l}" ${rev ? 'disabled' : ''} aria-pressed="${pick.includes(l)}">
        <span class="key">${l}</span><span class="body"><span lang="en">${esc(q.options[l])}</span>${vi}</span>${mark}</button>`;
    }).join('');

    let after = '';
    if (rev) {
      const ok = isCorrect(q, pick);
      const verdict = !pick.length
        ? `<div class="verdict none" tabindex="-1">${icon('alert')}<span>Bạn chưa trả lời câu này</span></div>`
        : ok ? `<div class="verdict ok" tabindex="-1">${icon('check')}<span>Chính xác!</span></div>`
          : `<div class="verdict bad" tabindex="-1">${icon('x')}<span>Chưa đúng<small>Bạn chọn ${pick.join(', ')} — đáp án đúng là ${ans.join(', ')}</small></span></div>`;
      after = `<div class="reveal">${verdict}${explainHtml(q)}</div>`;
    } else {
      const viBtn = prefs.viAlways ? '' : `<button type="button" class="btn btn-ghost btn-sm" id="viBtn" aria-expanded="${S.showVi[i]}">${icon('lang')}${S.showVi[i] ? 'Ẩn bản dịch' : 'Xem bản dịch đề'}</button>`;
      after = `
        ${multi ? `<p class="multi-hint">${icon('alert')}Câu này có ${ans.length} đáp án đúng — chọn đủ rồi bấm Kiểm tra.</p>` : ''}
        <div class="qtools">
          ${multi && S.mode === 'practice' ? `<button type="button" class="btn btn-primary btn-sm" id="checkBtn" ${pick.length ? '' : 'disabled'}>${icon('check')}Kiểm tra</button>` : ''}
          ${viBtn}
        </div>`;
    }

    const m = meta(q.section);
    $('#qcard').innerHTML = `
      <div class="qmeta"><span class="tag">${esc(m.tag)}</span><span class="muted small">Câu ${q.number} trong sách</span></div>
      <p class="qtext" lang="en">${esc(q.question)}</p>
      ${viOn && !rev ? `<p class="qvi">${esc(q.question_vi)}</p>` : ''}
      ${q.image ? `<img class="qfig" src="${esc(q.image)}" alt="${esc(q.image_alt || `Sơ đồ mạng dùng cho câu ${q.number}`)}" width="${q.image_w || 420}" height="${q.image_h || 280}">` : ''}
      <div class="opts" role="group" aria-label="Các phương án">${opts}</div>
      ${after}`;

    // header + nav
    $('#quizTitle').textContent = S.review ? `Xem lại · ${S.title}` : S.title;
    $('#progressBar').style.transform = `scaleX(${(i + 1) / qs.length})`;
    $('#progress').setAttribute('aria-valuemax', qs.length);
    $('#progress').setAttribute('aria-valuenow', i + 1);
    $('#progressText').textContent = `Câu ${i + 1}/${qs.length}`;
    $('#prevBtn').disabled = i === 0;
    const last = i === qs.length - 1;
    const answered = S.picks.filter((p) => p.length).length;
    let nextLabel = 'Câu sau';
    if (last) nextLabel = S.review ? 'Về kết quả' : S.mode === 'exam' && !S.submitted ? `Nộp bài (${answered}/${qs.length})` : 'Xem kết quả';
    $('#nextBtn').innerHTML = `<span>${nextLabel}</span>${icon(last ? 'send' : 'right')}`;
    $('#submitBtn').classList.toggle('hidden', !(S.mode === 'exam' && !S.submitted));
    renderAside();
    restoreFocus(snap);
  }

  // The map is built once per session; later renders only update each button's state.
  function renderAside() {
    const map = $('#qmap');
    if (map.children.length !== S.qs.length) {
      map.innerHTML = S.qs.map((_, i) => `<button type="button" data-i="${i}">${i + 1}</button>`).join('');
    }
    let ok = 0, bad = 0, done = 0;
    S.qs.forEach((q, i) => {
      let c = '';
      if (S.picks[i].length) done++;
      if (revealed(i) && S.picks[i].length) { if (isCorrect(q, S.picks[i])) { c = 'ok'; ok++; } else { c = 'bad'; bad++; } }
      else if (S.picks[i].length) c = 'done';
      const state = c === 'ok' ? 'đúng' : c === 'bad' ? 'sai' : c === 'done' ? 'đã chọn' : 'chưa làm';
      const b = map.children[i];
      const cls = `${c}${i === S.i ? ' cur' : ''}`;
      if (b.className !== cls) b.className = cls;
      b.setAttribute('aria-label', `Câu ${i + 1}, ${state}`);
      if (i === S.i) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
    const showScore = S.mode === 'practice' || S.submitted;
    $('#tally').innerHTML = showScore
      ? `<div class="t-ok"><b>${ok}</b><span>Đúng</span></div><div class="t-bad"><b>${bad}</b><span>Sai</span></div><div><b>${S.qs.length - done}</b><span>Chưa làm</span></div>`
      : `<div><b>${done}</b><span>Đã chọn</span></div><div><b>${S.qs.length - done}</b><span>Chưa làm</span></div><div><b>${S.qs.length}</b><span>Tổng</span></div>`;
  }

  function choose(l) {
    const i = S.i, q = S.qs[i];
    if (revealed(i) || !q.options[l]) return;
    const multi = answers(q).length > 1;
    S.picks[i] = multi ? (S.picks[i].includes(l) ? S.picks[i].filter((x) => x !== l) : [...S.picks[i], l].sort()) : [l];
    if (S.mode === 'practice' && !multi) lock(i);
    saveSession();
    render();
  }

  function lock(i) {
    S.locked[i] = true;
    const ok = isCorrect(S.qs[i], S.picks[i]);
    record(S.qs[i], ok);
    announce(ok ? 'Chính xác!' : `Chưa đúng. Đáp án đúng là ${answers(S.qs[i]).join(', ')}.`);
  }

  $('#qcard').addEventListener('click', (e) => {
    const o = e.target.closest('.opt');
    if (o) return choose(o.dataset.l);
    const b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'viBtn') { S.showVi[S.i] = !S.showVi[S.i]; render(); }
    if (b.id === 'checkBtn') { lock(S.i); saveSession(); render(); }
  });

  function go(d) {
    const j = S.i + d;
    if (j < 0) return;
    if (j >= S.qs.length) return finish();
    S.i = j; saveSession(); render();
    if (window.scrollY > 0) window.scrollTo({ top: 0 });
  }

  function finish() {
    if (S.review) { nav.back(() => { S = null; nav.replace('result'); show('result'); }); return; }
    if (S.mode === 'exam' && !S.submitted) {
      const blank = S.picks.filter((p) => !p.length).length;
      if (blank && !confirm(`Còn ${blank} câu chưa trả lời. Bạn vẫn muốn nộp bài?`)) return;
      S.submitted = true;
      // only answered questions go into the history; blanks stay "not done"
      S.qs.forEach((q, i) => { S.locked[i] = true; if (S.picks[i].length) record(q, isCorrect(q, S.picks[i])); });
    }
    store.del(KEYS.session);
    lastResult = { qs: S.qs, picks: S.picks, title: S.title };
    S = null;
    renderResult();
    nav.replace('result', { pushed: true });
    show('result');
  }

  function renderResult() {
    const R = lastResult;
    const total = R.qs.length;
    const right = R.qs.filter((q, i) => isCorrect(q, R.picks[i])).length;
    const blank = R.picks.filter((p) => !p.length).length;
    const wrong = total - right - blank;
    const ratio = total ? right / total : 0;
    $('#scoreTitle').textContent = `${right}/${total} câu đúng`;
    $('#scoreSub').textContent = ratio >= 0.8 ? 'Rất tốt! Bạn nắm chắc phần này.' : ratio >= 0.6 ? 'Khá ổn. Xem lại các câu sai để chắc hơn nhé.' : 'Cần ôn thêm. Hãy đọc kỹ giải thích của các câu sai rồi làm lại.';
    $('#resultTally').innerHTML = `<span class="tag ok">${right} đúng</span><span class="tag bad">${wrong} sai</span>${blank ? `<span class="tag plain">${blank} bỏ trống</span>` : ''}`;
    $('#ringText').textContent = pctFmt.format(ratio);
    const ring = $('#ring');
    ring.classList.toggle('good', ratio >= 0.8);
    ring.classList.toggle('low', ratio < 0.5);
    const C = 2 * Math.PI * 52;
    $('#ringFg').style.strokeDashoffset = String(C);
    requestAnimationFrame(() => requestAnimationFrame(() => { $('#ringFg').style.strokeDashoffset = String(C * (1 - ratio)); }));
    $('#reviewWrongBtn').disabled = right === total;
    $('#resultMap').innerHTML = R.qs.map((q, i) => {
      const c = !R.picks[i].length ? '' : isCorrect(q, R.picks[i]) ? 'ok' : 'bad';
      const state = c === 'ok' ? 'đúng' : c === 'bad' ? 'sai' : 'bỏ trống';
      return `<button type="button" data-i="${i}" class="${c}" aria-label="Xem lại câu ${i + 1}, ${state}">${i + 1}</button>`;
    }).join('');
  }

  function review(onlyWrong, startAt = 0) {
    const R = lastResult;
    if (!R) return;
    const idx = R.qs.map((_, i) => i).filter((i) => !onlyWrong || !isCorrect(R.qs[i], R.picks[i]));
    if (!idx.length) return;
    startSession(idx.map((i) => R.qs[i]), 'practice', {
      review: true, title: R.title,
      picks: idx.map((i) => R.picks[i]),
      i: Math.max(0, idx.indexOf(startAt)),
    });
  }

  $('#qmap').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    S.i = +b.dataset.i; saveSession(); render();
    if (isMobile()) closeSheet({ restoreFocus: true });
    window.scrollTo({ top: 0 });
  });
  $('#resultMap').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    review(false, +b.dataset.i);
  });
  $('#mapBtn').onclick = () => ($('#aside').classList.contains('open') ? closeSheet({ restoreFocus: true }) : openSheet());
  $('#sheetClose').onclick = () => closeSheet({ restoreFocus: true });
  $('#sheetBackdrop').onclick = () => closeSheet({ restoreFocus: true });
  $('#prevBtn').onclick = () => go(-1);
  $('#nextBtn').onclick = () => go(1);
  $('#submitBtn').onclick = () => finish();

  const goHome = () => { S = null; nav.replace('home'); renderHome(); show('home'); };
  // progress is auto-saved, so leaving a quiz is safe; it can be resumed from the home page
  const leave = () => nav.back(() => (S && S.review && lastResult ? (S = null, nav.replace('result'), show('result')) : goHome()));
  $('#backBtn').onclick = leave;
  $('#homeBtn').onclick = () => nav.back(goHome);
  $('#homeLink').onclick = (e) => { e.preventDefault(); if (view === 'home') return; nav.back(goHome); };
  $('#reviewWrongBtn').onclick = () => review(true);
  $('#reviewAllBtn').onclick = () => review(false);
  $('#retryBtn').onclick = () => {
    if (!lastRun) return goHome();
    let qs = lastRun.ids.map((id) => BY_ID.get(id)).filter(Boolean);
    if (prefs.shuffle) qs = shuffle(qs);
    startSession(qs, lastRun.mode, { title: lastRun.title, replace: true });
  };

  document.addEventListener('keydown', (e) => {
    if (view !== 'quiz' || !S || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape' && $('#aside').classList.contains('open')) { closeSheet({ restoreFocus: true }); return; }
    if ($('#aside').classList.contains('open')) return;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    const k = e.key.toUpperCase();
    if (LETTERS.includes(k)) choose(k);
    else if (/^[1-5]$/.test(k)) choose(LETTERS[+k - 1]);
    // the arrow keys never end the run — finishing / submitting needs the button
    else if (e.key === 'ArrowRight') { if (S.i < S.qs.length - 1) go(1); }
    else if (e.key === 'ArrowLeft') go(-1);
    else if (k === 'T' && !prefs.viAlways) { S.showVi[S.i] = !S.showVi[S.i]; render(); }
  });

  // keep history / theme in sync with other tabs
  window.addEventListener('storage', (e) => {
    if (e.key === KEYS.hist || e.key === null) { history = store.get(KEYS.hist, {}); if (view === 'home') renderHome(); }
    if (e.key === KEYS.session && view === 'home') renderResume();
  });

  /* ================= boot ================= */
  applyPrefsToForm();
  nav.replace('home');
  $('#sectionGrid').innerHTML = '<p class="muted">Đang tải câu hỏi…</p>';
  fetch('questions.json')
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((data) => {
      ALL = data.map((q) => ({ ...q, id: q.id || `${q.section}#${q.number}` }));
      BY_ID = new Map(ALL.map((q) => [q.id, q]));
      renderHome();
    })
    .catch(() => {
      $('#sectionGrid').innerHTML = '<div class="panel">Không tải được dữ liệu câu hỏi. Kiểm tra kết nối mạng rồi tải lại trang (F5).</div>';
    });
})();
