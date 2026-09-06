import test from "node:test";
import assert from "node:assert/strict";
import { errorMessage } from "../src/lib/errors";

test("confirmation delivery errors are distinguished from wrong credentials", () => {
  const error = Object.assign(new Error("Error sending confirmation email"), {
    code: "unexpected_failure",
  });
  assert.match(errorMessage(error), /Chưa gửi được email xác nhận/);
  assert.doesNotMatch(errorMessage(error), /mật khẩu chưa đúng/);
  assert.equal(
    errorMessage({
      code: "invalid_credentials",
      message: "Invalid login credentials",
    }),
    "Email hoặc mật khẩu chưa đúng.",
  );
});

test("recovery, unconfirmed email and rate limits have actionable messages", () => {
  assert.match(
    errorMessage(new Error("Error sending recovery email")),
    /email đặt lại mật khẩu/,
  );
  assert.match(
    errorMessage({
      code: "email_not_confirmed",
      message: "Email not confirmed",
    }),
    /xác nhận email trước/,
  );
  assert.match(
    errorMessage({
      code: "over_email_send_rate_limit",
      message: "Too many emails",
    }),
    /thử lại sau/i,
  );
  assert.match(
    errorMessage({
      code: "email_address_not_authorized",
      message: "Email address not authorized",
    }),
    /địa chỉ này/,
  );
});

test("non-auth validation errors keep their original useful detail", () => {
  assert.equal(
    errorMessage(new Error("Hãy nhập tên mục tiêu.")),
    "Hãy nhập tên mục tiêu.",
  );
  assert.match(errorMessage(new TypeError("Failed to fetch")), /kiểm tra mạng/);
});
