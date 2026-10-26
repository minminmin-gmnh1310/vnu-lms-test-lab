# VNU LMS Test Lab 1.0.1

Bộ kiểm thử riêng cho **VNU LMS Player 0.8.2**, chạy trên máy ảo GitHub Actions.
Bạn không cần mở laptop suốt lượt chạy và không cần đưa tài khoản VNU vào máy ảo.

## Vì sao test nhanh được?

Hai cách rút thời gian trong lab:

- **304 ca Node/DOM/server:** dùng đồng hồ và dữ liệu mô phỏng; tình huống chờ nhiều phút được thử trong khoảng 8 giây ở môi trường xây dựng.
- **Trình duyệt thật:** nạp bốn tệp JavaScript gốc của tool, chạy với video WebM tự tạo dài 4 giây và bài mô phỏng chỉ yêu cầu **1.5 giây**. Video vẫn phát native ở 1x. Không tăng tốc thời gian hoặc sửa yêu cầu của LMS VNU.

Máy ảo không làm đồng hồ trên server trường chạy nhanh hơn. Muốn xác minh VNU lưu phút thật vẫn cần một lượt kiểm tra trên VNU theo thời gian thật.

## 1. Tạo kho GitHub riêng

1. Đăng nhập GitHub, chọn **New repository**.
2. Đặt tên `vnu-lms-test-lab`, chọn **Private**.
3. Tạo kho **rỗng**: chưa thêm README, .gitignore hoặc license ở trang tạo kho.
4. Sao chép URL HTTPS của repository mới.

Nếu dùng repo Private, lượt chạy và file kết quả dùng hạn mức GitHub Actions của tài khoản. Workflow giới hạn 10 phút/lượt và giữ kết quả 3 ngày. Không cần bật thanh toán vượt hạn mức để dùng bộ lab này.

## 2. Đưa gói này lên GitHub

Giải nén ZIP. Mở PowerShell **tại thư mục có `package.json`, `README.md`, `lab` và `.github`**. Thay URL bên dưới bằng URL repository mới của bạn:

```powershell
git init
git add .
git commit -m "Add isolated LMS test lab"
git branch -M main
git remote add origin https://github.com/TEN_GITHUB_CUA_BAN/vnu-lms-test-lab.git
git push -u origin main
```

Đăng nhập GitHub bằng luồng xác thực trên máy bạn nếu Git yêu cầu. Bộ lab không cần API key, token đặt trong mã hoặc tài khoản VNU.

Nếu chưa dùng Git: tại repo mới chọn **uploading an existing file**, kéo **nội dung đã giải nén**, không kéo riêng file ZIP. Nhớ có `.github/workflows/vnu-lab.yml` ở đúng gốc repo. Commit lên nhánh mặc định.

Kiểm tra ở trang repo: phải thấy `package.json` ngay ở gốc, không bị lồng dưới một thư mục `VNU-LMS-Test-Lab` nữa.

## 3. Chạy trên máy ảo

1. Mở tab **Actions** trong repo.
2. Chọn workflow **VNU LMS isolated tests**.
3. Bấm **Run workflow**, chọn nhánh `main`.
4. Chọn `suite = all`, `runner = ubuntu-latest`, rồi **Run workflow**.
5. Khi thấy lượt chạy đã được tạo/đang chạy, có thể đóng trình duyệt hoặc tắt laptop. Công việc chạy trên máy GitHub.

Các lựa chọn:

| Lựa chọn | Mục đích |
| --- | --- |
| `unit` | 295 ca của tool + 9 ca server mô phỏng; không tải trình duyệt |
| `browser` | Ba kịch bản trình duyệt thật, không chạy lại bộ unit |
| `all` | Chạy cả hai tầng; dùng cho lượt đầu |
| `ubuntu-latest` | Máy ảo Ubuntu, Chromium có desktop ảo để kiểm tra đổi tab |
| `windows-latest` | Máy ảo Windows, cùng bộ Chromium thử nghiệm; không phải binary Microsoft Edge |

Lần đầu cần tải dependencies và Chromium, nên thời gian toàn bộ workflow dài hơn khoảng 8 giây của bộ unit. Bộ lab không chờ đủ hàng giờ bài học thật.

**Không có Run workflow:** kiểm tra file `.github/workflows/vnu-lab.yml` đã ở nhánh mặc định và không bị lồng thêm thư mục. Nếu Actions bị khóa bởi chính sách tài khoản/tổ chức, gửi thông báo lỗi thay vì thay đổi các thiết lập bảo mật khác.

## 4. Lấy kết quả

Mở lượt chạy đã xong, ở phần **Artifacts** tải `VNU-LMS-test-results`.

| File | Đọc gì? |
| --- | --- |
| `unit-summary.json` | Tổng số ca Node, pass/fail và trạng thái thực thi |
| `unit.log` | Chi tiết ca nào thất bại |
| `browser-summary.json` | Kịch bản trình duyệt, lỗi setup hoặc lỗi test, OS/browser và hash mã gốc |
| `pipeline.png`, `controls.png`, `visibility.png` | Ảnh kết thúc/thất bại của trang mô phỏng |
| `videos/` | Video do Playwright ghi trong lúc chạy |
| `*-console.json`, `*-trace.zip` | Console và trace để phân tích lỗi |

Gửi lại ZIP kết quả, không chỉ ảnh dấu tích xanh. Nếu lỗi xảy ra trước khi có artifact, gửi tên bước bị đỏ và phần log lỗi của bước đó.

## Những gì lab kiểm tra

Kịch bản `pipeline`: bỏ mục tùy chọn và mục đã hoàn thành; qua bài đọc, video có tên khác mẫu, iframe khảo sát tự focus, video tiếp theo, tài liệu nhúng và bài đọc có chữ thay đổi. Tổng trạng thái hoàn thành đến từ **server mô phỏng độc lập**, không lấy bộ đếm của tiện ích làm trạng thái server.

Kịch bản `controls`: video native 1x; resize sang cửa sổ hẹp; Pause/Play bằng bàn phím; Dừng và Bắt đầu lại. Từng bước có kết quả riêng trong báo cáo.

Kịch bản `visibility`: tắt chế độ focus emulation mà Playwright tự bật trên cả hai trang, rồi đổi tab thật; bắt buộc quan sát `document.visibilityState` chuyển sang `hidden`, video dừng và phát tiếp khi quay lại. Không gán lại thuộc tính visibility, không tự phát sự kiện giả. Nếu không tạo được trạng thái ẩn, test vẫn thất bại và lưu trạng thái các trang; không bỏ qua hoặc tính là đạt.

Ba kịch bản chạy độc lập trong các profile riêng. `controls` và `visibility` dùng cùng dữ liệu video kiểm tra của server mô phỏng; trạng thái server được giữ trong một lượt lab.

Runtime JavaScript được giữ nguyên. Lab tạo bản sao manifest chỉ cho `http://127.0.0.1/*`; profile trình duyệt dùng tạm riêng và bị xóa sau test. Requests trang thử chỉ được phép tới đúng cổng loopback của server lab. Không truy cập `lms.vnu.edu.vn` và không dùng cookie/tài khoản cá nhân.

## Những gì chưa được chứng minh

- Server VNU lưu số phút, điều kiện hoàn thành hoặc nhịp cập nhật ra sao.
- Khả năng tương thích mọi cấu trúc môn, video nhúng, khóa bài hoặc bài cần nộp thật.
- Lỗi riêng của Microsoft Edge, Windows Snap, driver hoặc chế độ tiết kiệm năng lượng trên laptop.
- Cơ chế autoplay có âm thanh: video mẫu được muted để kiểm tra phát native ổn định.

### Trạng thái xác minh khi giao gói

- Đã chạy **304/304 ca Node/DOM/server** và kiểm tra cú pháp mã lab.
- Đã kiểm tra mô hình server và dữ liệu media, cấu trúc workflow, bản sao mã gốc.
- Kết quả GitHub Actions do người dùng gửi ngày 26/10/2026, với bản lab 1.0.0: **304/304** test logic đạt; `pipeline` đạt đủ 7/7, lượt ghé `[2,3,4,5,6,7]`, không nộp biểu mẫu; `controls` dừng ở bước chờ tab ẩn. Trace xác nhận đã gọi `bringToFront` trước khi timeout. Bản Playwright 1.64.1 cài trong lab có lệnh bật focus emulation mặc định; thiết lập test cũ chưa tắt nó.
- Bản 1.0.1 sửa thiết lập test nêu trên và tách `visibility` khỏi `controls`. Bốn tệp JavaScript gốc của tool không thay đổi.
- **Chưa chạy lại ba kịch bản Chromium của bản 1.0.1.** Cần đẩy bản cập nhật lên GitHub rồi chọn Run workflow mới, `suite=all`. Không dùng Re-run của lượt cũ vì lượt đó giữ commit cũ.

### Cập nhật repository đã tạo

Giải nén gói 1.0.1 và chép đè nội dung vào thư mục repo cũ (giữ thư mục `.git`). Mở PowerShell trong repo rồi chạy:

```powershell
git add lab/browser.cjs package.json package-lock.json README.md BAT-DAU.txt BUILD-VERIFICATION.json
git commit -m "Fix browser visibility test setup"
git push
```

Sau đó Actions -> VNU LMS isolated tests -> Run workflow, nhánh main, suite=all. Tải artifact mới để kiểm tra cả ba kết quả pipeline/controls/visibility.

## Nếu muốn chạy cục bộ

Không cần máy ảo cục bộ để chạy lab. Trong thư mục này, dùng Node.js 20+ (CI dùng Node 24):

```powershell
npm.cmd ci
npm.cmd test
npx.cmd playwright install chromium
npm.cmd run test:browser
```

Trên Linux cần desktop hoặc Xvfb; workflow đã chuẩn bị lệnh `xvfb-run`. Lượt chạy cục bộ vẫn cần giữ máy hoạt động đến khi xong.

## Tài liệu chính thức

- [Máy ảo GitHub-hosted runners](https://docs.github.com/en/actions/concepts/runners/github-hosted-runners)
- [Chạy workflow thủ công](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)
- [Hạn mức GitHub Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- [Kiểm thử tiện ích với Chromium của Playwright](https://playwright.dev/docs/chrome-extensions)

Playwright hiện hướng dẫn dùng Chromium đi kèm để side-load tiện ích; không mặc định các cờ side-load còn hoạt động trên Chrome/Edge bản người dùng.
