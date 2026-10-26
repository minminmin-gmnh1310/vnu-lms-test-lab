# VNU LMS Test Lab 1.0.5

Bộ kiểm thử riêng cho **VNU LMS Player 0.8.5**, chạy trên máy ảo GitHub Actions.
Bạn không cần mở laptop suốt lượt chạy và không cần đưa tài khoản VNU vào máy ảo.

## Vì sao test nhanh được?

Hai cách rút thời gian trong lab:

- **389 ca Node/DOM/server và thiết lập trình duyệt:** gồm 369 ca của tool, 11 ca server, 3 ca thiết lập bằng process giả và 6 ca DOM/replay của trang lab. Các ca này không chạy trình duyệt. Tình huống chờ nhiều phút được thử nhanh bằng đồng hồ và dữ liệu mô phỏng.
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
| `unit` | 369 ca của tool + 11 ca server + 3 ca thiết lập + 6 ca DOM/replay lab; không tải trình duyệt |
| `browser` | Bốn kịch bản trình duyệt thật, không chạy lại bộ unit |
| `all` | Chạy cả hai tầng; dùng cho lượt đầu |
| `ubuntu-latest` | Máy ảo Ubuntu, Chromium có desktop ảo để kiểm tra đổi tab |
| `windows-latest` | Máy ảo Windows, cùng bộ Chromium thử nghiệm; không phải binary Microsoft Edge |

Lần đầu cần tải dependencies và Chromium, nên thời gian toàn bộ workflow dài hơn khoảng 31 giây đo được của bộ Node ở môi trường xây dựng. Bộ lab không chờ đủ hàng giờ bài học thật.

**Không có Run workflow:** kiểm tra file `.github/workflows/vnu-lab.yml` đã ở nhánh mặc định và không bị lồng thêm thư mục. Nếu Actions bị khóa bởi chính sách tài khoản/tổ chức, gửi thông báo lỗi thay vì thay đổi các thiết lập bảo mật khác.

## 4. Lấy kết quả

Mở lượt chạy đã xong, ở phần **Artifacts** tải `VNU-LMS-test-results`.

| File | Đọc gì? |
| --- | --- |
| `unit-summary.json` | Tổng số ca Node, pass/fail và trạng thái thực thi |
| `unit.log` | Chi tiết ca nào thất bại |
| `browser-summary.json` | Kịch bản trình duyệt, lỗi setup hoặc lỗi test, OS/browser và hash mã gốc |
| `pipeline.png`, `controls.png`, `visibility.png` | Ảnh kết thúc/thất bại của trang mô phỏng |
| `videos/` | Video của pipeline/controls; visibility dùng nhật ký và trace không ghi hình |
| `visibility-browser.log` | Chẩn đoán khởi động trình duyệt riêng cho visibility |
| `*-console.json`, `*-trace.zip` | Console và trace để phân tích lỗi |

Gửi lại ZIP kết quả, không chỉ ảnh dấu tích xanh. Nếu lỗi xảy ra trước khi có artifact, gửi tên bước bị đỏ và phần log lỗi của bước đó.

## Những gì lab kiểm tra

Kịch bản `pipeline`: mở menu con bốn cấp được dựng khi bấm mũi tên, ưu tiên nhánh Bài 2 / 2.2 / 2.2.1, kiểm tra đủ bảy mũi tên, gồm cả nhánh 1.1 Mục cũ ở lượt đối chiếu cuối và không bấm nhầm tên thư mục; nhận một lá native thiếu href; bỏ mục tùy chọn và mục đã hoàn thành; qua bài đọc, video có tên khác mẫu, iframe khảo sát tự focus, video tiếp theo, tài liệu nhúng và bài đọc có chữ thay đổi. Khảo sát bị khóa cho tới khi video phía sau hoàn thành: tool phải đọc danh sách điều kiện, phát video, rồi quay lại khảo sát. Lượt mở dự kiến là `[2,3,4,5,4,6,7]`; browser test bắt buộc thấy chuỗi gate 4 -> bài trước 5 -> quay lại 4, cho phép mở lại cùng bài khi đọc lại tiến trình; server tự chặn cấp phút cho mục bị khóa, không tin trạng thái do tiện ích gửi. Tổng trạng thái hoàn thành đến từ **server mô phỏng độc lập**, không lấy bộ đếm của tiện ích làm trạng thái server.

Kịch bản `deep-tree`: cùng luồng pipeline, thêm 12 wrapper lồng nhau; nhánh 4 và 8 tải con trễ 1.2 giây. Kiểm tra đủ 19 lần mở nhánh, 7/7 hoàn thành, quay lại bài bị chặn và không còn tồn.

Kịch bản `controls`: video native 1x; resize sang cửa sổ hẹp; Pause/Play bằng bàn phím; Dừng và Bắt đầu lại. Từng bước có kết quả riêng trong báo cáo.

Kịch bản `visibility`: khởi động một Chromium mới với profile lab riêng và kết nối bằng `connectOverCDP({noDefaults:true})` ngay từ phiên đầu tiên, để Playwright không bật focus emulation. Chỉ dùng default context của trình duyệt đó. Kiểm tra hai trang thuộc cùng một cửa sổ bằng windowId, rồi đổi tab thật; bắt buộc quan sát `document.visibilityState` chuyển sang `hidden`, video dừng và phát tiếp khi quay lại. Không gán lại thuộc tính visibility, không tự phát sự kiện giả. Nếu không tạo được trạng thái ẩn, test vẫn thất bại và lưu trạng thái các trang; không bỏ qua hoặc tính là đạt. Tắt ghi video và ảnh trace định kỳ riêng kịch bản này để giảm tác động của công cụ quan sát. Vẫn giữ DOM/network trace, sự kiện visibility và ảnh sau khi kiểm tra kết thúc.

Lý do không dùng cách tắt từ phiên CDP mới của bản 1.0.1: Chromium giữ capture handle theo từng EmulationHandler. Lệnh false trên phiên mới không thu hồi handle của phiên Playwright đã gửi true trước đó. Bằng chứng lần chạy: trang mất focus nhưng vẫn visible, không phát sự kiện visibilitychange. Tùy chọn noDefaults ngăn lệnh true ngay từ đầu. Không sửa Playwright hoặc mã runtime của tiện ích.

Bốn kịch bản chạy độc lập trong các profile riêng. `controls` và `visibility` dùng cùng dữ liệu video kiểm tra của server mô phỏng; trạng thái server được giữ trong một lượt lab.

Runtime JavaScript được giữ nguyên. Lab tạo bản sao manifest chỉ cho `http://127.0.0.1/*`; profile trình duyệt dùng tạm riêng và bị xóa sau test. Requests trang thử chỉ được phép tới đúng cổng loopback của server lab. Không truy cập `lms.vnu.edu.vn` và không dùng cookie/tài khoản cá nhân.

## Những gì chưa được chứng minh

- Server VNU lưu số phút, điều kiện hoàn thành hoặc nhịp cập nhật ra sao.
- Khả năng tương thích mọi cấu trúc môn, video nhúng, khóa bài hoặc bài cần nộp thật.
- Lỗi riêng của Microsoft Edge, Windows Snap, driver hoặc chế độ tiết kiệm năng lượng trên laptop.
- Cơ chế autoplay có âm thanh: video mẫu được muted để kiểm tra phát native ổn định.

### Trạng thái xác minh khi giao gói

- Đã chạy **389/389 ca Node/DOM/server/replay** và kiểm tra cú pháp. Bộ này bao gồm 369 ca player và 20 ca lab.
- Lượt GitHub 1.0.4/runtime 0.8.4 do người dùng gửi: 364/364 Node qua; controls và visibility qua. Pipeline đủ 7/7 nhưng còn một mục không khớp vì lab thiếu nhánh 1.1 Mục cũ. Trace xác nhận [2,3,4,5,4,6,7], không phải lỗi bỏ qua khảo sát.
- Lab 1.0.5 sửa cây dữ liệu, thêm kiểm tra mọi mục bắt buộc khớp report và replay toàn bộ app/runtime/model. Replay tái hiện bố cục sai cũ vẫn báo còn tồn; bố cục đúng hoàn thành không còn tồn.
- Player 0.8.5 sửa khóa nhánh trùng tên, phục hồi tải/DOM và matching một-một; test mới tới 64 tầng, 512 nhánh và cây nhiều seed.
- **Chưa chạy Chromium cho bản 1.0.5.** Bốn kịch bản mới/cập nhật cần lượt CI mới. Node replay không thay thế Chromium, Edge/Windows hoặc server VNU thật.

### Cập nhật repository

Giải nén gói 1.0.5, chép đè vào repo cũ và giữ `.git`. Mở PowerShell trong repo:

```powershell
git add vnu-lms-player lab package.json package-lock.json README.md BAT-DAU.txt BUILD-VERIFICATION.json
git commit -m "Fix lab section consistency and harden deep menu recovery"
git push
```

Actions -> VNU LMS isolated tests -> Run workflow mới -> main -> suite=all. Không Re-run lượt cũ. Tải artifact mới; browser-summary phải có pipeline, deep-tree, controls, visibility. Nếu lỗi, báo cáo mới giữ status/pending/menuState, menuEvents, lessonOpens và summary server cả khi assertion thất bại.

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
- [Playwright connectOverCDP noDefaults](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp-option-no-defaults)
- [Chromium EmulationHandler: SetFocusEmulationEnabled](https://chromium.googlesource.com/chromium/src/+/139.0.7258.66/content/browser/devtools/protocol/emulation_handler.cc)

Playwright hiện hướng dẫn dùng Chromium đi kèm để side-load tiện ích; không mặc định các cờ side-load còn hoạt động trên Chrome/Edge bản người dùng.
