import assert from "node:assert";
import { it } from "node:test";
import { defaultChatAvatar, normalizeChatAvatar } from "./private-chat-avatar.ts";

it("keeps a supported preset avatar and falls back to the platform default", () => {
  assert.deepEqual(normalizeChatAvatar({ kind: "preset", id: "nebula" }), { kind: "preset", id: "nebula" });
  assert.deepEqual(normalizeChatAvatar({ kind: "preset", id: "unknown" }), defaultChatAvatar);
});

it("accepts a small image data URI and rejects unsupported custom input", () => {
  assert.deepEqual(normalizeChatAvatar({ kind: "image", dataUri: "data:image/png;base64,aGVsbG8=" }), { kind: "image", dataUri: "data:image/png;base64,aGVsbG8=" });
  assert.deepEqual(normalizeChatAvatar({ kind: "image", dataUri: "https://example.test/avatar.png" }), defaultChatAvatar);
});
