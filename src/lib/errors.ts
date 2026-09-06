export function errorMessage(error: unknown): string {
  const details = error as { message?: unknown; code?: unknown } | null;
  const message =
    error instanceof Error ? error.message : String(details?.message || error);
  const normalized = message.toLowerCase();
  const code = typeof details?.code === "string" ? details.code : "";

  if (normalized.includes("error sending confirmation email"))
    return "Chưa gửi được email xác nhận. Dịch vụ email đang gặp sự cố; vui lòng thử lại sau hoặc liên hệ quản trị viên.";
  if (
    normalized.includes("error sending recovery email") ||
    normalized.includes("error sending password recovery email")
  )
    return "Chưa gửi được email đặt lại mật khẩu. Dịch vụ email đang gặp sự cố; vui lòng thử lại sau hoặc liên hệ quản trị viên.";
  if (code === "email_address_not_authorized")
    return "Dịch vụ email chưa hỗ trợ gửi tới địa chỉ này. Vui lòng liên hệ quản trị viên.";
  if (code === "invalid_credentials" || normalized.includes("invalid login"))
    return "Email hoặc mật khẩu chưa đúng.";
  if (
    code === "email_not_confirmed" ||
    normalized.includes("email not confirmed")
  )
    return "Bạn hãy xác nhận email trước khi đăng nhập.";
  if (
    code === "over_email_send_rate_limit" ||
    code === "over_request_rate_limit" ||
    normalized.includes("rate limit")
  )
    return "Bạn thao tác quá nhanh. Hãy thử lại sau ít phút.";
  if (
    normalized.includes("failed to fetch") ||
    normalized.includes("fetch failed")
  )
    return "Không thể kết nối. Hãy kiểm tra mạng và thử lại.";
  if (
    code === "user_already_exists" ||
    normalized.includes("already registered")
  )
    return "Email này đã đăng ký. Hãy đăng nhập.";
  return message;
}
