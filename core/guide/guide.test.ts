import test from "node:test";
import assert from "node:assert/strict";
import { isSafeHttpUrl } from "./guide";

test("isSafeHttpUrl allows http and https URLs", () => {
  assert.equal(isSafeHttpUrl("https://github.com/pallets/flask"), true);
  assert.equal(isSafeHttpUrl("http://example.com/guide/setup"), true);
  assert.equal(isSafeHttpUrl("https://docs.python.org/3/tutorial/"), true);
});

test("isSafeHttpUrl blocks javascript, data, file, and malformed URLs", () => {
  assert.equal(isSafeHttpUrl("javascript:alert(1)"), false);
  assert.equal(isSafeHttpUrl("data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="), false);
  assert.equal(isSafeHttpUrl("file:///etc/passwd"), false);
  assert.equal(isSafeHttpUrl("vbscript:msgbox"), false);
  assert.equal(isSafeHttpUrl("not-a-valid-url"), false);
  assert.equal(isSafeHttpUrl(""), false);
});
