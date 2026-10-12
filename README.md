# Ôn thi Quản lý dự án CNTT

Web ôn thi trắc nghiệm Quản lý dự án (PMP / PMBOK Guide 3rd ed.). Đề giữ nguyên tiếng Anh; mỗi câu có đáp án đúng, bản dịch tiếng Việt và giải thích.

- 305 câu: Assessment Test (65 câu) + Review Questions chương 1–12 (mỗi chương 20 câu), chép từ `CNTT.pdf`.
- Chế độ **Luyện tập** (xem đáp án ngay) và **Thi thử** (nộp bài mới chấm), xáo trộn câu, chọn số câu, ôn lại câu sai.
- Lịch sử làm bài và bài đang làm dở được lưu trong trình duyệt (localStorage), tải lại trang vẫn làm tiếp được.
- Web tĩnh thuần HTML/CSS/JS, không cần build.

## Chạy thử trên máy

```bash
npx http-server@14.1.1 -p 5178 -c-1
```

Mở http://localhost:5178. (Cần chạy qua server vì trang tải `questions.json` bằng `fetch`, mở trực tiếp file `index.html` sẽ không chạy.)

## Deploy lên Vercel

Cách 1, dùng CLI (tại thư mục này):

```bash
npx vercel@latest --prod
```

Vercel tự nhận đây là web tĩnh. Bỏ qua mọi câu hỏi về framework/build (chọn "Other", build command để trống, output directory là `.`).

Cách 2: đẩy thư mục lên một repo GitHub, rồi vào vercel.com → **Add New Project** → chọn repo → Deploy.

`.vercelignore` đã loại các file PDF, `scripts/` và `.claude/` khỏi bản deploy.

> Đề bài trích từ sách có bản quyền (PMP Study Guide — Kim Heldman, Wiley). Chỉ nên dùng cho học tập cá nhân/lớp học. Nếu deploy, nên bật **Vercel Authentication** hoặc **Password Protection** (Project → Settings → Deployment Protection) thay vì để công khai.

## Cấu trúc

| File | Vai trò |
|---|---|
| `index.html`, `style.css`, `app.js` | Giao diện (glassmorphism, font Be Vietnam Pro) |
| `questions.json` | Dữ liệu câu hỏi: `section`, `number`, `question`, `options`, `answer`, `question_vi`, `options_vi`, `explanation_vi`, tuỳ chọn `note_vi`, `image` |
| `img/` | Sơ đồ mạng cắt từ bản scan (Chương 7, câu 8–9) |
| `scripts/merge.mjs` | Gộp các file batch JSON thành `questions.json`, báo câu thiếu/trùng, áp `corrections.json` |
| `scripts/corrections.json` | Đáp án/giải thích đã sửa sau vòng kiểm tra chéo |
| `scripts/answer-review-log.json` | Nhật ký các câu bị đổi đáp án và lý do |
| `scripts/data-review-log.json` | Nhật ký các bản dịch/giải thích đã sửa sau khi đối chiếu với bản scan |

## Về độ chính xác của đáp án

Bản scan không có đáp án. Đáp án do AI xác định theo PMBOK 3rd ed. và cách ra đề của sách, sau đó qua 3 vòng kiểm tra:

1. **Kiểm tra chéo đáp án:** 2 người giải độc lập (không xem đáp án) cho cả 305 câu; câu nào lệch thì một trọng tài xét lại. Kết quả: sửa 7 đáp án và 2 lời giải thích. 3 câu còn tranh cãi được gắn mục "Lưu ý" trên giao diện.
2. **Đối chiếu với bản scan:** đủ 305/305 câu được so từng chữ với ảnh scan, mỗi lỗi được một người thứ hai xác nhận lại. Không có lỗi chép đề tiếng Anh nào. Đã sửa 23 bản dịch thiếu ý và 12 lời giải thích chưa chuẩn.
3. **Dò mâu thuẫn giữa các câu:** tìm chỗ hai lời giải thích dạy ngược nhau (ví dụ thứ tự Contract Closure/Close Project, Monte Carlo, công thức EAC). Đã viết lại 18 lời giải thích cho thống nhất.

Câu Chương 7 số 1 có lỗi ngay trong đề gốc (hỏi Activity Duration Estimating nhưng đáp án là công cụ của Activity Resource Estimating); lời giải thích đã ghi rõ điều này. Nếu thầy/cô có đáp án chính thức, hãy đối chiếu và sửa trong `questions.json` (và `scripts/corrections.json` nếu muốn giữ khi chạy lại `merge.mjs`).
