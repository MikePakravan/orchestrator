import assert from "node:assert/strict";
import { test } from "node:test";

import { apiUrl, getApiBaseUrl } from "../src/api.ts";

test("getApiBaseUrl defaults to same-origin requests", () => {
  assert.equal(getApiBaseUrl({}), "");
});

test("getApiBaseUrl trims trailing slashes from configured API URL", () => {
  assert.equal(getApiBaseUrl({ VITE_API_BASE_URL: "http://127.0.0.1:8000///" }), "http://127.0.0.1:8000");
});

test("apiUrl builds a local API URL from configured base", () => {
  assert.equal(apiUrl("/api/tasks/start", "http://127.0.0.1:8000"), "http://127.0.0.1:8000/api/tasks/start");
});

test("apiUrl keeps safe same-origin default for local Vite proxy", () => {
  assert.equal(apiUrl("/api/health", ""), "/api/health");
});
