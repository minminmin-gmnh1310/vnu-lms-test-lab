// Only markup sent by the user is treated as observed. The surrounding tabs,
// incomplete status text and media behavior are a test fixture, not live LMS.
const header = `<tr>
  <td class="text-center bold" style="width:40%">Tên</td>
  <td class="text-center bold">Điều kiện hoàn thành</td>
  <td class="text-center bold">Điểm số</td><td class="text-center bold">Hệ số</td>
  <td class="text-center bold">Tổng thời gian truy cập (phút)</td>
  <td class="text-center bold">Tổng số lượt xem</td><td class="text-center bold">Trạng thái</td>
</tr>`;
const completed = `<tr>
  <td><div style="float:left;"></div><!----><div class="content-status-box ico-img-status-3"></div>
    <div><!---->Video: Giới thiệu chung về học phần<!----><span class="content-required">&nbsp;</span></div></td>
  <td class="text-center"><!----><div><!----><!----><div><!----><div><!----><!----><span>
    Phải học tối thiểu&nbsp;5&nbsp;(phút)</span></div></div></div></td>
  <td class="text-center"><!----><!----><div><span>---</span></div></td>
  <td class="text-center"><!----><!----><div><span>---</span></div></td>
  <td class="text-center"><!----><div><!----><!----><span>28.4</span></div><!----></td>
  <td class="text-center"><!----><div><span>7</span></div></td>
  <td><!----><div><!----><div class="boundary-passed"><span>Đã hoàn thành</span></div><!----></div></td>
</tr>`;
const observedLink = `<a href="javascript:void(0)" class="finished">Video: Giới thiệu chung về học phần<!----><span class="content-required">&nbsp;</span><!---->
  <!----><!----><span></span></a>`;
const firstTitle = 'Video: Giới thiệu về cấu trúc học phần, chuẩn đầu ra, mục đích, về trọng số kiểm tra, đánh giá';
const secondTitle = 'Video: Giới thiệu về đối tượng nghiên cứu, phương pháp nghiên cứu và cách để học tập học phần này';
const row = (title, minutes = 0, status = 'Chưa hoàn thành', required = 5) => `<tr>
  <td>${title}<span class="content-required">&nbsp;</span></td>
  <td><span>Phải học tối thiểu&nbsp;${required}&nbsp;(phút)</span></td>
  <td>---</td><td>---</td><td>${minutes}</td><td>1</td><td><span>${status}</span></td></tr>`;
const table = (rows = row(firstTitle) + row(secondTitle)) => `<table id="progress-table">${header}${completed}<tr><td colspan="7">Bài 1</td></tr>${rows}</table>`;
const course = '/learn/lop-hoc/chi-tiet/7b351ce5-e2d3-4096-ae6d-09153c609a86';
module.exports = {header, completed, observedLink, firstTitle, secondTitle, row, table, course};
