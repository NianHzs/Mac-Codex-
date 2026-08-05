export const chatAvatarPresets = ["crown", "nebula", "aurora", "coral"] as const;

export type ChatAvatar =
  | { kind: "preset"; id: typeof chatAvatarPresets[number] }
  | { kind: "image"; dataUri: string };

export const defaultChatAvatar: ChatAvatar = { kind: "preset", id: "crown" };

const imageDataUri = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i;
const maximumAvatarDataUriLength = 3 * 1024 * 1024;

export function normalizeChatAvatar(value: unknown): ChatAvatar {
  if (!value || typeof value !== "object") return defaultChatAvatar;
  const candidate = value as { kind?: unknown; id?: unknown; dataUri?: unknown };
  if (candidate.kind === "preset" && typeof candidate.id === "string" && chatAvatarPresets.includes(candidate.id as typeof chatAvatarPresets[number])) {
    return { kind: "preset", id: candidate.id as typeof chatAvatarPresets[number] };
  }
  if (candidate.kind === "image" && typeof candidate.dataUri === "string" && candidate.dataUri.length <= maximumAvatarDataUriLength && imageDataUri.test(candidate.dataUri)) {
    return { kind: "image", dataUri: candidate.dataUri };
  }
  return defaultChatAvatar;
}
