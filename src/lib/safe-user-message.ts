import { isNotFoundError } from "next/dist/client/components/not-found";
import { isRedirectError } from "next/dist/client/components/redirect";

const technicalPatterns = [
  /NEXT_REDIRECT/i,
  /NEXT_NOT_FOUND/i,
  /PrismaClient/i,
  /\bP20\d{2}\b/i,
  /\bSQL\b/i,
  /stack trace/i,
  /server-side exception/i,
  /digest/i,
  /Command failed/i,
  /pg_dump/i,
  /docker/i,
  /container/i,
  /\/app\//i,
  /node_modules/i,
  /DATABASE_URL/i,
  /NEXTAUTH_SECRET/i,
  /VAPID_PRIVATE_KEY/i
];

const allowedFeedbackMessages = new Set([
  "Ảnh tối đa 5MB.",
  "Bàn này hiện không hoạt động.",
  "Chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP.",
  "Chỉ hỗ trợ ảnh JPG, PNG, WEBP. Ảnh tối đa 5MB.",
  "Chỉ nhà hàng đã xóa mới có thể khôi phục.",
  "Chưa thể gửi yêu cầu đăng ký.",
  "Chưa thể từ chối yêu cầu đăng ký.",
  "Chưa thể xác nhận yêu cầu đăng ký.",
  "Dữ liệu không hợp lệ.",
  "Dữ liệu bị trùng. Vui lòng kiểm tra mã đường dẫn hoặc email chủ quán.",
  "Đã cấp ưu đãi sử dụng.",
  "Đã cập nhật họ tên chủ quán.",
  "Đã cập nhật dung lượng ước tính.",
  "Đã đổi gói nhà hàng.",
  "Đã đổi mật khẩu quản trị nền tảng.",
  "Đã ghi nhận xác nhận quyền lợi gói dịch vụ.",
  "Đã gửi yêu cầu thành công. Chúng tôi sẽ xác nhận sau khi kiểm tra thanh toán.",
  "Đã khôi phục nhà hàng. Trạng thái hiện là Chưa hoạt động.",
  "Đã kích hoạt gói dịch vụ.",
  "Đã khóa nhà hàng.",
  "Đã lưu bảng giá dịch vụ.",
  "Đã lưu cài đặt.",
  "Đã lưu chính sách lưu trữ.",
  "Đã lưu nhân viên.",
  "Đã mở lại nhà hàng.",
  "Đã đặt lại mật khẩu chủ quán.",
  "Đã tiếp nhận yêu cầu dọn dữ liệu tạm.",
  "Đã tiếp nhận yêu cầu sao lưu.",
  "Đã từ chối yêu cầu đăng ký.",
  "Đã xác nhận thanh toán và kích hoạt gói dịch vụ.",
  "Đã xóa mềm nhà hàng. Dữ liệu lịch sử vẫn được giữ.",
  "Đã xóa tài khoản nhân viên.",
  "Đã xóa vĩnh viễn nhà hàng không có lịch sử nghiệp vụ.",
  "Email chủ quán đã tồn tại trong hệ thống.",
  "Email chủ quán đang là tài khoản quản trị nền tảng. Vui lòng dùng email riêng cho nhà hàng.",
  "Gói dịch vụ hiện tại đã trùng với thông tin vừa nhập.",
  "Hệ thống lưu trữ chưa được cập nhật cấu trúc mới. Vui lòng cập nhật hệ thống rồi thử lại.",
  "Không tìm thấy chủ quán.",
  "Không tìm thấy dữ liệu cần cập nhật.",
  "Không tìm thấy kỳ giá.",
  "Không tìm thấy nhà hàng.",
  "Không tìm thấy tài khoản chủ quán của nhà hàng.",
  "Không thể cập nhật nhà hàng. Vui lòng kiểm tra dữ liệu.",
  "Không thể tạo nhà hàng. Vui lòng kiểm tra dữ liệu.",
  "Không thể xóa vĩnh viễn vì nhà hàng có lịch sử gọi món, thanh toán hoặc yêu cầu khách. Hãy giữ bản ghi đã xóa để bảo toàn chứng từ.",
  "Kỳ giá này hiện chưa mở bán.",
  "Logo chỉ hỗ trợ JPG, PNG, WEBP. Ảnh tối đa 5MB.",
  "Mã đường dẫn chỉ được chứa chữ thường, số và dấu gạch ngang.",
  "Mã đường dẫn xác nhận không đúng.",
  "Mã đường dẫn này đã được sử dụng. Vui lòng chọn mã khác.",
  "Mã QR này không còn hiệu lực. Vui lòng quét mã QR mới tại bàn.",
  "Mật khẩu hiện tại không đúng.",
  "Mật khẩu phải có ít nhất 8 ký tự.",
  "Ngày hết hạn phải sau ngày bắt đầu.",
  "Nhà hàng đã được xóa trước đó.",
  "Nhà hàng đã xóa. Hãy khôi phục trước khi chỉnh sửa.",
  "Nhà hàng đã xóa. Hãy khôi phục trước khi đổi trạng thái.",
  "Nhà hàng hiện tạm ngừng hoạt động.",
  "Nhà hàng không hợp lệ.",
  "Phải xóa mềm nhà hàng trước khi xóa vĩnh viễn.",
  "Tài khoản quản trị nền tảng không hợp lệ.",
  "Tên chủ quán là bắt buộc.",
  "Tên nhà hàng là bắt buộc.",
  "Thời hạn đăng ký không hợp lệ.",
  "Vui lòng xác nhận đã kiểm tra thanh toán trước khi kích hoạt hợp đồng trả phí.",
  "Vui lòng xác nhận trước khi lưu thay đổi gói.",
  "Vui lòng nhập mã đường dẫn để xác nhận khôi phục.",
  "Vui lòng nhập mã đường dẫn để xác nhận xóa.",
  "Vui lòng nhập mã đường dẫn để xác nhận xóa vĩnh viễn.",
  "Yêu cầu đăng ký không hợp lệ."
]);

export function rethrowNextNavigation(error: unknown): void {
  if (isRedirectError(error) || isNotFoundError(error)) {
    throw error;
  }
}

export function sanitizeFeedbackMessage(
  value: string | undefined,
  fallback: string
) {
  const message = value?.trim();
  if (!message) return undefined;

  if (technicalPatterns.some((pattern) => pattern.test(message))) {
    return fallback;
  }

  if (!allowedFeedbackMessages.has(message)) {
    return fallback;
  }

  return message;
}

export function safeErrorMessage(error: unknown, fallback: string) {
  rethrowNextNavigation(error);

  if (!(error instanceof Error)) {
    return fallback;
  }

  const message = error.message.trim();
  if (!message || technicalPatterns.some((pattern) => pattern.test(message))) {
    return fallback;
  }

  return allowedFeedbackMessages.has(message) ? message : fallback;
}

export function publicApiError(fallback: string) {
  return { ok: false as const, error: fallback };
}
