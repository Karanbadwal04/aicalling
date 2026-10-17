import "dotenv/config";

const required = [
  "SARVAM_API_KEY",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PHONE_NUMBER",
  "PUBLIC_BASE_URL",
];

const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.warn(`[Config Warning] Missing environment variables in .env: ${missing.join(", ")}`);
}

export const config = {
  port: Number(process.env.PORT || 3000),
  sarvamApiKey: process.env.SARVAM_API_KEY || "",
  sarvamChatModel: process.env.SARVAM_CHAT_MODEL || "sarvam-105b-conversations",
  sarvamTtsLanguage: process.env.SARVAM_TTS_LANGUAGE || "en-IN",
  sarvamTtsSpeaker: process.env.SARVAM_TTS_SPEAKER || "shubh",
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || "",
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || "",
  twilioApiKeySid: process.env.TWILIO_API_KEY_SID || "",
  twilioApiKeySecret: process.env.TWILIO_API_KEY_SECRET || "",
  twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER || "",
  friendPhoneNumber: process.env.FRIEND_PHONE_NUMBER || "",
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/$/, ""),
  maxCallSeconds: Number(process.env.MAX_CALL_SECONDS || 180),
  maxDailyCalls: Number(process.env.MAX_DAILY_CALLS || 5),
  validateSignature: process.env.VALIDATE_TWILIO_SIGNATURE === "true",
};
