// Gộp các file batch JSON (b01.json, b02.json, ...) thành questions.json và báo câu thiếu/trùng.
// Dùng: node scripts/merge.mjs <thư-mục-chứa-batch>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const dir = process.argv[2];
if (!dir) { console.error('usage: node scripts/merge.mjs <batch-dir>'); process.exit(1); }

const files = fs.readdirSync(dir).filter((f) => /^b\d+(_p\d+)?\.json$/.test(f)).sort();
const out = [];
const seen = new Map();
const problems = [];

for (const f of files) {
  const arr = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  for (const q of arr) {
    const key = `${q.section}#${q.number}`;
    for (const k of ['section', 'number', 'question', 'options', 'answer', 'question_vi', 'options_vi', 'explanation_vi']) {
      if (q[k] == null || q[k] === '') problems.push(`${f} ${key}: thiếu "${k}"`);
    }
    for (const a of String(q.answer).split(',')) {
      if (!q.options?.[a.trim()]) problems.push(`${f} ${key}: đáp án "${a}" không có trong options`);
    }
    if (seen.has(key)) {
      const prev = seen.get(key);
      const len = (x) => JSON.stringify(x).length;
      problems.push(`${f} ${key}: trùng (giữ bản dài hơn)`);
      if (len(q) > len(out[prev])) out[prev] = q;
      continue;
    }
    seen.set(key, out.length);
    out.push(q);
  }
}

// gắn hình minh hoạ (cắt từ bản scan) cho câu cần sơ đồ; bỏ phần mô tả sơ đồ dạng chữ
const FIGURES = {
  'Chapter 7 - Creating the Project Schedule and Budget#8': { image: 'img/ch7-q8.png', image_w: 672, image_h: 436 },
  'Chapter 7 - Creating the Project Schedule and Budget#9': { image: 'img/ch7-q9.png', image_w: 672, image_h: 441 },
};
for (const q of out) {
  const fig = FIGURES[`${q.section}#${q.number}`];
  if (!fig) continue;
  Object.assign(q, fig);
  for (const k of ['question', 'question_vi']) q[k] = q[k].replace(/\s*\[[^\]]*\]\s*/g, ' ').trim();
}

// áp các đáp án/giải thích đã được kiểm tra chéo (xem scripts/answer-review-log.json)
const corrFile = path.join(SCRIPT_DIR, 'corrections.json');
if (fs.existsSync(corrFile)) {
  const corr = JSON.parse(fs.readFileSync(corrFile, 'utf8'));
  for (const q of out) Object.assign(q, corr[`${q.section}#${q.number}`] || {});
}

// kiểm tra số thứ tự bị hổng trong từng phần
const bySec = new Map();
for (const q of out) {
  if (!bySec.has(q.section)) bySec.set(q.section, []);
  bySec.get(q.section).push(q.number);
}
for (const [sec, nums] of bySec) {
  const max = Math.max(...nums);
  const missing = [];
  for (let n = 1; n <= max; n++) if (!nums.includes(n)) missing.push(n);
  console.log(`${sec}: ${nums.length} câu (1..${max})${missing.length ? '  THIẾU: ' + missing.join(', ') : ''}`);
}
problems.forEach((p) => console.log('! ' + p));

fs.writeFileSync(path.join(SCRIPT_DIR, '..', 'questions.json'), JSON.stringify(out, null, 1));
console.log(`\nĐã ghi questions.json: ${out.length} câu`);
