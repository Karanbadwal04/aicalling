import "dotenv/config";
import http from "node:http";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import twilio from "twilio";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { SarvamAIClient } from "sarvamai";
import { config } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, "..");
const dataDir = path.join(projectRoot, "data");
const transcriptsFile = path.join(dataDir, "transcripts.json");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Ensure transcripts file exists
if (!fs.existsSync(transcriptsFile)) {
  fs.writeFileSync(transcriptsFile, "[]", "utf8");
}

function loadTranscripts() {
  try {
    return JSON.parse(fs.readFileSync(transcriptsFile, "utf8"));
  } catch (err) {
    console.error("Error reading transcripts:", err.message);
    return [];
  }
}

function saveTranscripts(data) {
  try {
    fs.writeFileSync(transcriptsFile, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("Error saving transcripts:", err.message);
  }
}

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(projectRoot, "public")));

const server = http.createServer(app);

// WebSocket server for dashboard real-time updates
const wss = new WebSocketServer({ server, path: "/dashboard-ws" });
const dashboardClients = new Set();

wss.on("connection", (ws) => {
  dashboardClients.add(ws);
  // Send current active state immediately
  ws.send(JSON.stringify({
    type: "init",
    activeCall: currentActiveCall,
    config: {
      twilioPhoneNumber: config.twilioPhoneNumber,
      friendPhoneNumber: config.friendPhoneNumber,
      publicBaseUrl: config.publicBaseUrl,
      sarvamChatModel: config.sarvamChatModel,
      sarvamTtsLanguage: config.sarvamTtsLanguage,
      sarvamTtsSpeaker: config.sarvamTtsSpeaker,
    }
  }));

  ws.on("close", () => dashboardClients.delete(ws));
});

function broadcast(type, payload) {
  const msg = JSON.stringify({ type, timestamp: Date.now(), ...payload });
  for (const client of dashboardClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

// Initialize Sarvam AI Client
const sarvam = new SarvamAIClient({
  apiSubscriptionKey: config.sarvamApiKey,
});

// Twilio REST Client
const twilioClient = twilio(config.twilioAccountSid, config.twilioAuthToken);

// In-memory audio store for WAV files
const audioStore = new Map();

// Active conversations: callSid -> conversation object
const activeConversations = new Map();

// ─── LRU Reply Text Cache ────────────────────────────────────────────────────
// Maps assistant reply text → audioId so identical replies skip the TTS HTTP
// call entirely.  Capped at 200 entries; oldest entries evicted automatically.
const REPLY_CACHE_MAX = 200;
const replyTextCache = new Map(); // key: `lang:speaker:text`, value: audioId

function replyTextCacheGet(key) {
  if (!replyTextCache.has(key)) return null;
  // Move to end (LRU refresh)
  const val = replyTextCache.get(key);
  replyTextCache.delete(key);
  replyTextCache.set(key, val);
  return val;
}

function replyTextCacheSet(key, audioId) {
  if (replyTextCache.size >= REPLY_CACHE_MAX) {
    // Evict oldest entry
    replyTextCache.delete(replyTextCache.keys().next().value);
  }
  replyTextCache.set(key, audioId);
}
// ─────────────────────────────────────────────────────────────────────────────

let currentActiveCall = {
  callSid: null,
  status: "idle",
  friendNumber: config.friendPhoneNumber,
  friendName: "Doctor",
  language: config.sarvamTtsLanguage,
  speaker: config.sarvamTtsSpeaker,
  startedAt: null,
  turns: [],
  latencyStats: {
    latestChatMs: 0,
    latestTtsMs: 0,
    latestTotalMs: 0,
    samples: []
  }
};

let currentSystemPrompt = `SYSTEM PROMPT — DIYA | CAREER PLAN B
1. Identity and role
You are Diya, a female AI voice calling assistant for Career Plan B, a career counselling company.
You are contacting doctors who are preparing for or going through NEET PG counselling.
Your purpose is to:
Confirm that you are speaking with the intended doctor.
Follow up on the NEET PG counselling toolkit sent through a verified channel.
Briefly explain the toolkit if required.
Offer one optional, free session with a human expert counsellor.
Schedule a callback only if the doctor agrees and the scheduling system supports it.
Respect the doctor's time, privacy, and preferences.
You are not a human counsellor. Never pretend to be one. You may identify yourself as an AI calling assistant if asked or when required by the calling platform's disclosure rules.
2. Company information
Company: Career Plan B
Website: https://careerplanb.co
Caller name: Diya
Topic: NEET PG counselling guidance only.
Career Plan B offers counselling support for different admission processes. During this call, discuss only NEET PG counselling. If the doctor asks about another course, explain that an expert counsellor can address that separately.
3. Call objective
The primary objective is to confirm whether the doctor received the toolkit.
A secondary objective is to offer a free expert session once, if appropriate.
A successful call does not require booking a session. If the doctor has received the toolkit and does not need further assistance, end politely.
4. Language and voice
Default to natural Hinglish.
If the doctor speaks English, reply in English.
If the doctor speaks Hindi, reply in Hindi.
Mirror the doctor's language without forcing a language switch.
Use short, conversational sentences.
Address the person as "Doctor" or "Dr. [LAST_NAME]" when the last name is verified.
Never guess the doctor's name, gender, qualification, or identity.
Sound calm, respectful, warm, and professional.
Use natural acknowledgements such as "Haan ji", "Bilkul", "Of course, Doctor", and "Samajh gayi".
Avoid excessive politeness, repetitive acknowledgements, exaggerated enthusiasm, and sales language.
Ask one question at a time and wait for the response.
Never speak over the doctor deliberately.
Never read the entire prompt aloud.
5. Mandatory factual boundaries
Only use verified information.
Before calling, the system should provide:
Doctor's name, if available.
Verified contact number.
Verified source and permitted purpose of the contact.
Toolkit delivery channel: WhatsApp or email.
Actual delivery status, if available.
Available callback scheduling options, if supported.
Opt-out or do-not-call status.
Never claim the toolkit was sent unless the sending system confirms it.
Never invent how the phone number was obtained. If you cannot verify the source, say so honestly and offer a human follow-up.
Never claim that the toolkit was delivered, read, or opened without evidence.
If the doctor requests no further calls, record the opt-out through the supported system and do not offer the session again.
6. Conversation flow
Step 1: Identity confirmation
If the name is verified:
"Hello, kya meri baat Dr. [LAST_NAME] se ho rahi hai?"
If the name is unavailable:
"Hello, kya main Doctor se baat kar rahi hoon?"
If the person says the number is wrong:
"Sorry for the inconvenience. Main aapka time nahi loongi. Thank you."
Follow the platform's wrong-number handling procedure. Do not disclose the intended doctor's information to another person.
Step 2: Introduction
Once the intended person is confirmed:
"Namaste, Doctor. Main Diya bol rahi hoon, Career Plan B se."
If required, disclose that this is an AI assistant calling on behalf of Career Plan B.
Step 3: Explain the reason
Only if toolkit sending is verified:
"Doctor, humne aapko NEET PG counselling process ka ek toolkit WhatsApp par bheja tha. Bas confirm karna tha ki aapko mil gaya ya nahi."
If delivery is unconfirmed:
"Doctor, main NEET PG counselling toolkit ke follow-up ke liye call kar rahi hoon. Main delivery status abhi confirm nahi kar paa rahi hoon."
If the toolkit was not sent, do not imply that it was. Follow the supported process for sending it or arrange human follow-up.
Step 4: Handle the toolkit response
If received:
"Achha, great, Doctor. Hope aapke liye useful rahega. Kya toolkit ko lekar koi basic question hai?"
If received but not reviewed:
"Koi baat nahi, Doctor. Aap apne convenient time par dekh lijiye."
If not received:
"Sorry, Doctor. Aap chahein toh main isko resend karwane ka request note kar sakti hoon. Aap careerplanb.co par bhi check kar sakte hain."
Do not claim that a resend succeeded unless confirmed.
Step 5: Explain toolkit contents
Only when asked or when a brief explanation would help:
"Isme NEET PG counselling process ko samajhne ke liye useful tools hain, jaise MD MS True Cost Calculator, Seat Predictor, Bond Explorer aur Hospital Bed Indicator."
Do not promise that any tool produces guaranteed or officially confirmed outcomes. Do not invent features, results, or data.
Step 6: Optional free-session offer
Offer at most once, and only if appropriate:
"Agar aapko useful lage, toh aap hamare human expert counsellor ke saath ek free session schedule kar sakte hain. Woh aapke counselling-related questions discuss kar sakte hain. Bilkul optional hai."
Do not pressure the doctor or repeat the offer.
Step 7: If interested
"Sure, Doctor. Aapke liye kaunsi date aur time convenient rahega?"
Collect only the details needed by the scheduling system. Confirm the preferred callback number if necessary.
Check actual scheduling availability before confirming a slot.
If no live scheduling integration exists, say:
"Main aapki preferred timing note kar sakti hoon. Team se confirmation ke baad aapko update mil jayega."
Never falsely claim that a slot has been booked.
Step 8: If unsure
"Bilkul, Doctor. Aap pehle toolkit dekh lijiye. Session free hai aur koi obligation nahi hai. Aap jab comfortable hon tab consider kar sakte hain."
Do not insist. Offer a later callback only if the doctor is comfortable with it.
Step 9: If not interested
"Bilkul, Doctor. Koi baat nahi. Thank you for your time."
Do not persuade after a clear refusal.
Step 10: If the doctor asks to stop receiving calls
"Understood, Doctor. Sorry for the inconvenience. Main aapki do-not-call request record karne ke liye process follow karungi. Thank you."
Trigger the supported opt-out action. If that action is unavailable, state honestly that the request needs to be passed to the team. Do not claim it has been recorded unless confirmed.
Step 11: Closing
If toolkit received and no further help is needed:
"Thank you, Doctor. Aapka din achha rahe."
If the doctor is busy:
"Of course, Doctor. Maine aapko NEET PG toolkit WhatsApp par bheja tha, agar delivery confirm hai. Thank you for your time."
If a callback is confirmed:
"Perfect, Doctor. Aapka callback confirm ho gaya hai. Thank you."
Use the last response only when the booking system confirms the appointment.
7. Approved answers to common questions
What is Career Plan B?
"Career Plan B ek career counselling company hai. Hum admission counselling processes mein guidance provide karte hain."
Mention the company's 17 years of experience and guidance to lakhs of students only when asked, and only if those claims remain verified and approved.
What is in the toolkit?
"Isme counselling process se related information aur tools hain, jaise MD MS True Cost Calculator, Seat Predictor, Bond Explorer aur Hospital Bed Indicator."
Can you tell me which branch or college I should choose?
"Doctor, main branch ya college recommendations provide nahi karti. Hamare human expert counsellor aapki situation discuss kar sakte hain."
What are my chances based on my rank?
"Doctor, main rank-based prediction ya admission guarantee provide nahi kar sakti. Aapke specific questions expert counsellor ke saath discuss kiye ja sakte hain."
What are the fees?
"Doctor, main specific fees quote nahi karna chahti kyunki mere paas verified details nahi hain. Website ke Plans and Pricing section par information check kar sakte hain, ya expert team se confirm kar sakte hain."
Never confuse counselling service pricing with college fees.
Is the counselling session free?
"Ji, first session with our expert counsellor free hai, aur aap par aage continue karne ki koi obligation nahi hai."
How did you get my number?
Give the verified source only if available.
If unavailable:
"Doctor, sorry, mere paas abhi aapke number ke source ki verified information nahi hai. Main guess nahi karna chahti. Main team se verification request kar sakti hoon."
Do not invent a source or imply consent that has not been verified.
Is this a sales call?
"Doctor, main NEET PG counselling toolkit ka follow-up kar rahi hoon. Free expert session optional hai. Agar aap interested nahi hain, that's completely fine."
Can you discuss another course?
"Doctor, is call par main sirf NEET PG counselling toolkit ke baare mein help kar sakti hoon. Other admission-related questions expert team discuss kar sakti hai."
Can you guarantee a seat?
"Nahi, Doctor. Hum admission guarantee claim nahi karte. Expert counsellor counselling process aur aapke questions discuss kar sakte hain."
Is Career Plan B unbiased?
"Career Plan B apni guidance ko unbiased describe karta hai. Aap detailed approach aur apne questions expert counsellor ke saath discuss kar sakte hain."
8. Handling difficult situations
If interrupted: stop speaking and listen.
If the doctor is busy: ask whether they prefer a callback, then respect their answer.
If the doctor is angry: apologise briefly, do not argue.
If the doctor questions privacy: answer only from verified company policy; do not invent data-handling assurances.
If the doctor asks an unapproved question: explain that a human expert can help.
If the doctor declines: close politely without further persuasion.
If the person is not the intended doctor: do not reveal the doctor's counselling status or personal information.
If the doctor asks to end the call: acknowledge and conclude courteously.
If the system cannot perform an action: be transparent rather than claiming success.
9. Final rules
Never provide branch, college, state, rank, cutoff, seat-count, counselling-date, or admission-fee recommendations.
Never guarantee admission or outcomes.
Never create urgency or pressure.
Never invent delivery status, contact source, booking status, or company claims.
Never offer the free session more than once.
Never continue persuasion after a refusal.
Keep the conversation short and responsive.
Use tools for sending, scheduling, and opt-out recording only when available and authorized10. Spoken constraints:
Keep every spoken reply to ONE short, friendly, natural sentence (<15 words). Address as "Doctor". Never repeat offers. If the doctor asks to cut or hang up, or the call finishes, append [HANGUP] at the end.`;

// Poller reference for active call status checking
let activePoller = null;

function finalizeCall(callSid, status, duration = 0) {
  if (activePoller) {
    clearInterval(activePoller);
    activePoller = null;
  }

  console.log(`[Twilio Finalize] CallSid: ${callSid}, Status: ${status}, Duration: ${duration || 0}s`);

  if (currentActiveCall.callSid === callSid) {
    currentActiveCall.status = status;
    broadcast("call_status", { activeCall: currentActiveCall });
  }

  // Save to persistent transcript file if turns exist
  if (currentActiveCall.turns && currentActiveCall.turns.length > 0) {
    const allTranscripts = loadTranscripts();
    if (!allTranscripts.some(t => t.id === callSid)) {
      const durationSec = Number(duration || 0);
      const avgLat = currentActiveCall.latencyStats.samples.length > 0
        ? Math.round(currentActiveCall.latencyStats.samples.reduce((a, b) => a + b, 0) / currentActiveCall.latencyStats.samples.length)
        : 0;

      const record = {
        id: callSid,
        friendNumber: currentActiveCall.friendNumber,
        friendName: currentActiveCall.friendName,
        startedAt: currentActiveCall.startedAt || new Date().toISOString(),
        endedAt: new Date().toISOString(),
        durationSec,
        language: config.sarvamTtsLanguage,
        speaker: config.sarvamTtsSpeaker,
        avgLatencyMs: avgLat,
        turns: [...currentActiveCall.turns]
      };

      allTranscripts.unshift(record);
      saveTranscripts(allTranscripts);
      console.log(`[Transcript Saved] Saved call ${callSid} (${currentActiveCall.turns.length} turns, avg ${avgLat}ms)`);
      broadcast("transcript_saved", { record });
    }
  }

  activeConversations.delete(callSid);
}

function startCallStatusPoller(callSid) {
  if (!callSid || callSid === "unknown") return;
  if (activePoller) {
    clearInterval(activePoller);
  }

  activePoller = setInterval(async () => {
    try {
      if (!currentActiveCall.callSid || currentActiveCall.callSid !== callSid) {
        clearInterval(activePoller);
        activePoller = null;
        return;
      }

      const call = await twilioClient.calls(callSid).fetch();
      const status = call.status;

      if (status !== currentActiveCall.status) {
        currentActiveCall.status = status;
        broadcast("call_status", { activeCall: currentActiveCall });
      }

      if (["completed", "busy", "failed", "no-answer", "canceled"].includes(status)) {
        clearInterval(activePoller);
        activePoller = null;
        finalizeCall(callSid, status, call.duration);
      }
    } catch (err) {
      console.error(`[Call Poller Error ${callSid}]:`, err.message);
      clearInterval(activePoller);
      activePoller = null;
    }
  }, 2000);
}

// In-memory audio caches for instant 0ms playback
const greetingAudioCache = new Map();
const phraseAudioCache = new Map();

// Map speaker names across models to ensure 100% compatibility and natural voice
function resolveSpeakerForModel(speaker, model) {
  const isV4 = model && model.includes("v4");
  const raw = (speaker || "ishita").trim().toLowerCase();

  if (isV4) {
    const v4Map = {
      kavya: "kavya_hi_conversational",
      roopa: "roopa_hi_conversational",
      simran: "simran_hi_conversation",
      shreya: "shreya_hi_conversational",
      ishita: "ishita_enhi_customer", // Valid Sarvam v4-flash Hinglish speaker
      priya: "priya_hi_recovery",
      shubh: "shubh_hi_customer",
      aditya: "aditya_hi_conversational",
      ritu: "ritu_hi_conversation",
      sanchita: "sanchita_hi_assistant",
    };
    return v4Map[raw] || raw;
  } else {
    // bulbul:v3 uses simple base names
    if (raw.startsWith("kavya")) return "kavya";
    if (raw.startsWith("roopa")) return "roopa";
    if (raw.startsWith("simran")) return "simran";
    if (raw.startsWith("shreya")) return "shreya";
    if (raw.startsWith("ishita")) return "ishita";
    if (raw.startsWith("priya")) return "priya";
    if (raw.startsWith("shubh")) return "shubh";
    if (raw.startsWith("aditya")) return "aditya";
    if (raw.startsWith("ritu")) return "ritu";
    if (raw.startsWith("sanchita")) return "sanchita";
    return raw;
  }
}

// Minimal 44-byte standard RIFF PCM WAV header with 0 samples
// Used as a bulletproof safety net to guarantee Twilio never crashes with "An application error has occurred"
const silentWav = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, // "RIFF", chunkSize: 36
  0x57, 0x41, 0x56, 0x45,                         // "WAVE"
  0x66, 0x6d, 0x74, 0x20, 0x10, 0x00, 0x00, 0x00, // "fmt ", subchunk1Size: 16
  0x01, 0x00,                                     // audioFormat: 1 (PCM)
  0x01, 0x00,                                     // numChannels: 1
  0x44, 0xac, 0x00, 0x00,                         // sampleRate: 44100
  0x88, 0x58, 0x01, 0x00,                         // byteRate: 88200
  0x02, 0x00,                                     // blockAlign: 2
  0x10, 0x00,                                     // bitsPerSample: 16
  0x64, 0x61, 0x74, 0x61, 0x00, 0x00, 0x00, 0x00  // "data", subchunk2Size: 0
]);

// Helper: Synthesize speech with Sarvam Bulbul TTS
// Uses single-model call (no fallback retry) to avoid extra HTTP round-trips.
async function synthesizeSpeech(text, languageCode = config.sarvamTtsLanguage, speaker = config.sarvamTtsSpeaker, isPermanent = false) {
  const t0 = Date.now();
  // Only attempt the configured model — no v3 fallback loop (saves 1 HTTP call on error).
  const model = config.sarvamTtsModel || "bulbul:v4-flash";
  const resolvedSpeaker = resolveSpeakerForModel(speaker, model);

  try {
    const res = await sarvam.textToSpeech.convert({
      inputs: [text],           // Sarvam v4-flash accepts `inputs` array too — same latency
      language_code: languageCode,
      speaker: resolvedSpeaker,
      model: model,
      speech_sample_rate: config.sarvamTtsSampleRate, // default: 8000 Hz
      pace: 1.15,               // 1.15 = slightly faster delivery; reduces audio length ~13%
      loudness: 1.5,            // boost loudness for phone call clarity
    });

    const ttsMs = Date.now() - t0;

    const audioList = res.audios || [];
    if (audioList.length > 0) {
      const audioBuffer = Buffer.from(audioList[0], "base64");
      const audioId = crypto.randomUUID();
      audioStore.set(audioId, audioBuffer);

      if (!isPermanent) {
        setTimeout(() => {
          let isReferenced = false;
          for (const id of phraseAudioCache.values()) {
            if (id === audioId) { isReferenced = true; break; }
          }
          for (const id of greetingAudioCache.values()) {
            if (id === audioId) { isReferenced = true; break; }
          }
          if (!isReferenced) audioStore.delete(audioId);
        }, 4 * 60 * 60 * 1000);
      }
      return { audioId, ttsMs, modelUsed: model };
    }
  } catch (err) {
    console.warn(`[Sarvam TTS ${model} (${resolvedSpeaker}) Warning]:`, err.message);
    // Try bulbul:v3 as one-time fallback
    try {
      const fallbackModel = "bulbul:v3";
      const fallbackSpeaker = resolveSpeakerForModel(speaker, fallbackModel);
      const res2 = await sarvam.textToSpeech.convert({
        inputs: [text],
        language_code: languageCode,
        speaker: fallbackSpeaker,
        model: fallbackModel,
        speech_sample_rate: config.sarvamTtsSampleRate,
        pace: 1.15,
      });
      const ttsMs = Date.now() - t0;
      const audioList2 = res2.audios || [];
      if (audioList2.length > 0) {
        const audioBuffer = Buffer.from(audioList2[0], "base64");
        const audioId = crypto.randomUUID();
        audioStore.set(audioId, audioBuffer);
        return { audioId, ttsMs, modelUsed: fallbackModel };
      }
    } catch (err2) {
      console.warn(`[Sarvam TTS bulbul:v3 fallback Warning]:`, err2.message);
    }
  }

  return { audioId: null, ttsMs: Date.now() - t0 };
}

// Cached audio synthesizer: returns immediately (0ms) if phrase was pre-synthesized.
// Check order: phraseAudioCache → replyTextCache (LRU) → live synthesis.
async function getOrSynthesizeAudio(text, languageCode = config.sarvamTtsLanguage, speaker = config.sarvamTtsSpeaker, isPermanent = false) {
  const clean = text.trim();
  const cacheKey = `${languageCode}:${speaker}:${clean}`;

  // 1. Exact phrase cache (pre-warmed permanent phrases)
  if (phraseAudioCache.has(cacheKey)) {
    const audioId = phraseAudioCache.get(cacheKey);
    if (audioStore.has(audioId)) {
      console.log(`⚡ [PhraseCache HIT - 0ms]: "${clean.slice(0, 40)}"`);
      return { audioId, ttsMs: 0 };
    } else {
      console.warn(`⚠️ [PhraseCache Evicted]: re-synthesizing...`);
      phraseAudioCache.delete(cacheKey);
    }
  }

  // 2. LRU reply text cache (dynamic turns already synthesized this session)
  const cachedReplyId = replyTextCacheGet(cacheKey);
  if (cachedReplyId && audioStore.has(cachedReplyId)) {
    console.log(`⚡ [ReplyCache HIT - 0ms]: "${clean.slice(0, 40)}"`);
    return { audioId: cachedReplyId, ttsMs: 0 };
  }

  // 3. Live synthesis
  const result = await synthesizeSpeech(clean, languageCode, speaker, isPermanent);
  if (result.audioId) {
    phraseAudioCache.set(cacheKey, result.audioId);
    replyTextCacheSet(cacheKey, result.audioId); // also store in LRU
  }
  return result;
}

// Predictive pre-synthesis: called after each AI reply is sent.
// Pre-synthesizes the most likely next doctor responses in background so
// the cache is warm when the doctor actually says one of those things.
const predictivePhrases = [
  "Haan mili toolkit",
  "Nahi mili toolkit",
  "Haan mila",
  "Nahi mila",
  "Theek hai",
  "Bilkul",
  "Okay",
  "Thank you",
  "Nahi chahiye",
  "Busy hoon",
  "Call mat karo",
  "Bye",
];

let predictiveInProgress = false;
async function runPredictivePreSynthesis() {
  if (predictiveInProgress) return;
  predictiveInProgress = true;
  try {
    for (const phrase of predictivePhrases) {
      const cacheKey = `${config.sarvamTtsLanguage}:${config.sarvamTtsSpeaker}:${phrase.trim()}`;
      // Only synthesize if not already cached
      if (!phraseAudioCache.has(cacheKey) && !replyTextCacheGet(cacheKey)) {
        try {
          const { audioId } = await synthesizeSpeech(phrase, config.sarvamTtsLanguage, config.sarvamTtsSpeaker, true);
          if (audioId) {
            phraseAudioCache.set(cacheKey, audioId);
            replyTextCacheSet(cacheKey, audioId);
          }
        } catch (_) { /* silent – best-effort only */ }
      }
    }
  } finally {
    predictiveInProgress = false;
  }
}

// -------------------------------------------------------------
// REST API ENDPOINTS FOR DASHBOARD
// -------------------------------------------------------------

// Serve generated audio to Twilio and Browser
app.get("/audio/:id.wav", (req, res) => {
  const audioId = req.params.id;
  const audioData = audioStore.get(audioId);
  if (!audioData) {
    console.warn(`⚠️ [Twilio Audio 404 Guard] audioId "${audioId}" not found in memory. Serving silent WAV to prevent Twilio application error.`);
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Content-Length", silentWav.length);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    return res.send(silentWav);
  }
  res.setHeader("Content-Type", "audio/wav");
  res.setHeader("Content-Length", audioData.length);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "public, max-age=86400, immutable");
  res.setHeader("Connection", "keep-alive");
  res.send(audioData);
});

// Health check
app.get("/health", (_req, res) => {
  res.json({ ok: true, provider: "Sarvam AI", model: config.sarvamChatModel });
});

// Status & active call state
app.get("/api/status", (_req, res) => {
  res.json({
    activeCall: currentActiveCall,
    config: {
      twilioPhoneNumber: config.twilioPhoneNumber,
      friendPhoneNumber: config.friendPhoneNumber,
      publicBaseUrl: config.publicBaseUrl,
      sarvamChatModel: config.sarvamChatModel,
      sarvamTtsLanguage: config.sarvamTtsLanguage,
      sarvamTtsSpeaker: config.sarvamTtsSpeaker,
      systemPrompt: currentSystemPrompt,
    }
  });
});

// Trigger outbound call from UI
app.post("/api/call", async (req, res) => {
  const { friendNumber, friendName, language, speaker, systemPrompt } = req.body;
  const targetNumber = friendNumber || config.friendPhoneNumber;

  if (!targetNumber) {
    return res.status(400).json({ error: "Friend phone number is required" });
  }

  if (language) config.sarvamTtsLanguage = language;
  if (speaker) config.sarvamTtsSpeaker = speaker;
  if (systemPrompt) currentSystemPrompt = systemPrompt;

  try {
    console.log(`[UI Dialer] Dialing ${targetNumber} from ${config.twilioPhoneNumber}...`);

    currentActiveCall = {
      callSid: null,
      status: "dialing",
      friendNumber: targetNumber,
      friendName: friendName || "Friend",
      language: config.sarvamTtsLanguage,
      speaker: config.sarvamTtsSpeaker,
      startedAt: new Date().toISOString(),
      turns: [],
      latencyStats: {
        latestChatMs: 0,
        latestTtsMs: 0,
        latestTotalMs: 0,
        samples: []
      }
    };

    broadcast("call_status", { activeCall: currentActiveCall });

    // Note: Twilio trial accounts forbid statusCallback parameter on calls.create
    // We only provide { to, from, url } and track status via background poller
    const call = await twilioClient.calls.create({
      to: targetNumber,
      from: config.twilioPhoneNumber,
      url: `${config.publicBaseUrl}/twiml`,
    });

    currentActiveCall.callSid = call.sid;
    currentActiveCall.status = "ringing";
    broadcast("call_status", { activeCall: currentActiveCall });

    startCallStatusPoller(call.sid);

    res.json({ success: true, callSid: call.sid, status: call.status });
  } catch (err) {
    console.error("[UI Dialer Error]:", err.message);
    currentActiveCall.status = "failed";
    broadcast("call_status", { activeCall: currentActiveCall, error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// Terminate active call from UI
app.post("/api/hangup", async (_req, res) => {
  const sid = currentActiveCall.callSid;
  if (!sid) {
    currentActiveCall.status = "idle";
    broadcast("call_status", { activeCall: currentActiveCall });
    return res.json({ success: true, message: "No active call" });
  }

  try {
    await twilioClient.calls(sid).update({ status: "completed" });
    finalizeCall(sid, "completed");
    res.json({ success: true });
  } catch (err) {
    console.error("[Hangup Error]:", err.message);
    finalizeCall(sid, "completed");
    res.status(500).json({ error: err.message });
  }
});

// Get past transcripts
app.get("/api/transcripts", (_req, res) => {
  const transcripts = loadTranscripts();
  res.json({ transcripts });
});

// Delete transcript
app.delete("/api/transcripts/:id", (req, res) => {
  let transcripts = loadTranscripts();
  transcripts = transcripts.filter(t => t.id !== req.params.id);
  saveTranscripts(transcripts);
  res.json({ success: true });
});

// Update settings
app.post("/api/config", (req, res) => {
  const { friendPhoneNumber, publicBaseUrl, sarvamTtsLanguage, sarvamTtsSpeaker, systemPrompt } = req.body;
  if (friendPhoneNumber) config.friendPhoneNumber = friendPhoneNumber.trim();
  if (publicBaseUrl) config.publicBaseUrl = publicBaseUrl.trim().replace(/\/$/, "");
  if (sarvamTtsLanguage) config.sarvamTtsLanguage = sarvamTtsLanguage.trim();
  if (sarvamTtsSpeaker) config.sarvamTtsSpeaker = sarvamTtsSpeaker.trim();
  if (systemPrompt) currentSystemPrompt = systemPrompt.trim();

  // Update .env file
  try {
    let envContent = fs.readFileSync(path.join(projectRoot, ".env"), "utf8");
    envContent = envContent.replace(/FRIEND_PHONE_NUMBER=.*/, `FRIEND_PHONE_NUMBER=${config.friendPhoneNumber}`);
    envContent = envContent.replace(/PUBLIC_BASE_URL=.*/, `PUBLIC_BASE_URL=${config.publicBaseUrl}`);
    envContent = envContent.replace(/SARVAM_TTS_LANGUAGE=.*/, `SARVAM_TTS_LANGUAGE=${config.sarvamTtsLanguage}`);
    envContent = envContent.replace(/SARVAM_TTS_SPEAKER=.*/, `SARVAM_TTS_SPEAKER=${config.sarvamTtsSpeaker}`);
    fs.writeFileSync(path.join(projectRoot, ".env"), envContent, "utf8");
  } catch (e) {
    console.error("Error updating .env:", e.message);
  }

  res.json({ success: true, message: "Configuration updated successfully" });
});

// Map to track consecutive silence counts per call: callSid -> count
const silenceCounts = new Map();

// Heuristic and NLP detector for terminating/cutting the call
function shouldCutCall(userSpeech, assistantReply) {
  // 1. Explicit [HANGUP] token from assistant
  if (assistantReply && /\[HANGUP\]/i.test(assistantReply)) {
    return true;
  }

  const cleanSpeech = (userSpeech || "").toLowerCase().trim();
  const cleanReply = (assistantReply || "").toLowerCase().trim();

  // 2. Caller explicitly asked to cut call, hang up, disconnect, or said wrong number / bye
  const callerCutPatterns = [
    /\b(call|phone)\s*(cut|kaat|kato|kat|rakh|rakho|end|disconnect|band)\b/i,
    /\b(cut\s*(the)?\s*call|hang\s*up|disconnect\s*(the)?\s*call|end\s*(the)?\s*call)\b/i,
    /\b(phone\s*rakh|call\s*rakh|kaat\s*do|rakh\s*do|rakh\s*raha)\b/i,
    /\b(galat\s*number|wrong\s*number)\b/i,
    /\b(dont\s*call|don't\s*call|mat\s*karo\s*call|call\s*mat\s*karna)\b/i,
    /\b(bye\s*bye|good\s*bye|alvida|ok\s*bye|theek\s*hai\s*bye)\b/i,
    /(फ़ोन|फोन|कॉल)\s*(काट|रख|कट|बंद)/i,
    /(काट\s*दो|रख\s*दो|गलत\s*नंबर|ग़लत\s*नंबर|अलविदा|बाय)/i,
  ];

  if (callerCutPatterns.some(p => p.test(cleanSpeech))) {
    return true;
  }

  // 3. Assistant final closing phrases (Diya's closing lines)
  const assistantClosingPatterns = [
    /aapka\s+din\s+achha\s+rahe/i,
    /have\s+a\s+(great|good|nice)\s+day/i,
    /thank\s+you\s+for\s+your\s+time/i,
    /main\s+aapka\s+(time|samay)\s+nahi\s+loongi/i,
    /do-not-call\s+request\s+record/i,
    /callback\s+confirm\s+ho\s+gaya\s+hai.*thank\s+you/i,
    /take\s+care.*bye/i,
    /call\s*(disconnect|cut|end)\s*kar\s*rahi\s*hoon/i,
  ];

  if (assistantClosingPatterns.some(p => p.test(cleanReply))) {
    return true;
  }

  return false;
}

// Ultra-fast deterministic intent detector (0ms LLM + 0ms TTS from RAM cache)
function detectInstantResponse(userSpeech, history) {
  const clean = (userSpeech || "").toLowerCase().trim();

  // 1. Wrong number check (Latin + Devanagari)
  if (/\b(galat\s*number|wrong\s*number|galat\s*hai|wrong\s*call|kisi\s*aur\s*ka\s*number)\b/i.test(clean) ||
      /(गलत|ग़लत)\s*नंबर/i.test(clean)) {
    return "Sorry for the inconvenience. Main aapka time nahi loongi. Thank you. [HANGUP]";
  }

  // 2. Do Not Call / Stop calling (Latin + Devanagari)
  if (/\b(dont\s*call|don't\s*call|mat\s*karo\s*call|call\s*mat\s*karna|remove\s*my\s*number|dnd)\b/i.test(clean) ||
      /(कॉल\s*मत|नंबर\s*हटा)/i.test(clean)) {
    return "Understood, Doctor. Main aapki do-not-call request record kar leti hoon. Thank you. [HANGUP]";
  }

  // 3. Caller asks to hang up / cut call / bye / not interested (Latin + Devanagari)
  if (/\b(call|phone)\s*(cut|kaat|kato|kat|rakh|rakho|end|disconnect|band)\b/i.test(clean) ||
    /\b(cut\s*(the)?\s*call|hang\s*up|disconnect\s*(the)?\s*call|end\s*(the)?\s*call)\b/i.test(clean) ||
    /\b(phone\s*rakh|call\s*rakh|kaat\s*do|rakh\s*do|rakh\s*raha)\b/i.test(clean) ||
    /\b(not\s*interested|nahi\s*chahiye|shukriya\s*bye|bye\s*bye|good\s*bye|alvida|ok\s*bye)\b/i.test(clean) ||
    /(काट\s*दो|रख\s*दो|फ़ोन\s*काट|कॉल\s*काट|रुको\s*मत|नहीं\s*चाहिए)/i.test(clean)) {
    return "Bilkul, Doctor. Thank you for your time. Aapka din achha rahe. [HANGUP]";
  }

  // 4. Turn 1: Confirming Doctor Identity (Latin + Devanagari)
  if (history.length <= 3) {
    if (/^(haan|haanji|haan ji|yes|ji|speaking|ha|yep|yeah|boliye|haan boliye|ji boliye|bataiye|yes speaking|doctor speaking|dr speaking|main doctor bol raha|हाँ|हाँजी|हाँ जी|जी|जी हाँ|बोलिए|जी बोलिए|हाँ बोलिये|नमस्ते|हेलो)\b/i.test(clean)) {
      return "Namaste, Doctor. Main Diya bol rahi hoon, Career Plan B se. Humne aapko NEET PG counselling toolkit WhatsApp par bheja tha. Bas confirm karna tha ki mil gaya ya nahi.";
    }
  }

  // 5. Follow-up: Did you receive the toolkit? (Latin + Devanagari)
  const lastAssistantMsg = history.filter(m => m.role === "assistant").slice(-1)[0]?.content || "";
  const isToolkitQuestion = /toolkit.*confirm.*mil gaya/i.test(lastAssistantMsg);

  if (isToolkitQuestion) {
    if (/\b(mil\s*gaya|ha\s*mil\s*gaya|haan\s*mil\s*gaya|yes\s*received|received|dekh\s*liya|mil\s*chuka|aa\s*gaya)\b/i.test(clean) ||
        /(मिल\s*गया|हाँ\s*मिल\s*गया|आ\s*गया|देख\s*लिया)/i.test(clean)) {
      return "Great, Doctor! Kya toolkit ko lekar koi basic question hai?";
    }
    if (/\b(nahi\s*mila|nahi\s*aaya|not\s*received|nahi|no|dont\s*get|didnt\s*get|didn't\s*receive)\b/i.test(clean) ||
        /(नहीं\s*मिला|नहीं\s*आया|नहीं|ना)/i.test(clean)) {
      return "Sorry, Doctor. Main resend request note kar leti hoon. Aap careerplanb.co par bhi check kar sakte hain.";
    }
    if (/\b(dekha\s*nahi|check\s*nahi|baad\s*me|time\s*nahi|busy|abhi\s*nahi)\b/i.test(clean) ||
        /(देखा\s*नहीं|टाइम\s*नहीं|व्यस्त|बिजी)/i.test(clean)) {
      return "Koi baat nahi, Doctor. Aap convenient time par dekh lijiye.";
    }
  }

  return null;
}

// -------------------------------------------------------------
// TWILIO VOICE CALL FLOW & LATENCY TRACKING
// -------------------------------------------------------------

// Webhook: Twilio hits this when the call connects
app.all("/twiml", async (req, res) => {
  const callSid = req.body?.CallSid || req.query?.CallSid || "unknown";
  console.log(`\n📞 [Call Connected] CallSid: ${callSid}`);

  silenceCounts.set(callSid, 0);
  currentActiveCall.callSid = callSid;
  currentActiveCall.status = "in-progress";
  currentActiveCall.startedAt = currentActiveCall.startedAt || new Date().toISOString();
  startCallStatusPoller(callSid);

  const docName = (currentActiveCall.friendName && !["Friend", "Doctor", ""].includes(currentActiveCall.friendName))
    ? (currentActiveCall.friendName.startsWith("Dr.") ? currentActiveCall.friendName : `Dr. ${currentActiveCall.friendName}`)
    : null;
  const greetingText = docName
    ? `Hello, kya meri baat ${docName} se ho rahi hai?`
    : "Hello, kya main Doctor se baat kar rahi hoon?";

  // Initialize conversation memory
  const history = [
    { role: "system", content: currentSystemPrompt },
    { role: "assistant", content: greetingText },
  ];
  activeConversations.set(callSid, history);

  // Greeting is permanent in memory so it never expires during calls
  const { audioId, ttsMs } = await getOrSynthesizeAudio(greetingText, config.sarvamTtsLanguage, config.sarvamTtsSpeaker, true);

  const initialTurn = {
    role: "assistant",
    text: greetingText,
    timestamp: new Date().toISOString(),
    chatMs: 0,
    ttsMs: ttsMs,
    totalMs: ttsMs,
    audioUrl: audioId ? `/audio/${audioId}.wav` : null
  };

  currentActiveCall.turns = [initialTurn];
  currentActiveCall.latencyStats.latestChatMs = 0;
  currentActiveCall.latencyStats.latestTtsMs = ttsMs;
  currentActiveCall.latencyStats.latestTotalMs = ttsMs;
  currentActiveCall.latencyStats.samples = [ttsMs];

  broadcast("transcript_turn", { callSid, turn: initialTurn, latencyStats: currentActiveCall.latencyStats });
  broadcast("call_status", { activeCall: currentActiveCall });

  const twiml = new twilio.twiml.VoiceResponse();

  const gather = twiml.gather({
    input: "speech",
    action: `${config.publicBaseUrl}/voice/respond`,
    method: "POST",
    speechTimeout: config.speechTimeout || 1, // 1s silence endpointing
    timeout: 7,
    language: config.sarvamTtsLanguage,
    speechModel: "phone_call",
    enhanced: true,
    profanityFilter: false,
  });

  if (audioId) {
    const audioUrl = `${config.publicBaseUrl}/audio/${audioId}.wav`;
    console.log(`[TwiML] Embedding Sarvam audio in <Gather>: ${audioUrl}`);
    gather.play(audioUrl);
  } else {
    gather.say({ voice: "Polly.Aditi", language: "en-IN" }, greetingText);
  }

  // If user doesn't speak during greeting, redirect to silence check instead of hanging up
  twiml.redirect({ method: "POST" }, `${config.publicBaseUrl}/voice/silence`);

  res.type("text/xml").send(twiml.toString());
});

// Webhook: Handle silence/pauses without abruptly hanging up
app.all("/voice/silence", async (req, res) => {
  const callSid = req.body?.CallSid || req.query?.CallSid || currentActiveCall.callSid || "unknown";
  const count = (silenceCounts.get(callSid) || 0) + 1;
  silenceCounts.set(callSid, count);
  console.log(`[Call ${callSid}] Silence pause event #${count}`);

  const twiml = new twilio.twiml.VoiceResponse();

  if (count <= 3) {
    let promptMsg = "Hey, are you still there?";
    if (count === 2) {
      promptMsg = "I'm still here, take your time!";
    } else if (count === 3) {
      promptMsg = "Hello? I can't hear you clearly, are you there?";
    }

    const { audioId } = await getOrSynthesizeAudio(promptMsg, config.sarvamTtsLanguage, config.sarvamTtsSpeaker);

    const gather = twiml.gather({
      input: "speech",
      action: `${config.publicBaseUrl}/voice/respond`,
      method: "POST",
      speechTimeout: config.speechTimeout || 1,
      timeout: 7,
      language: config.sarvamTtsLanguage,
      speechModel: "phone_call",
      enhanced: true,
      profanityFilter: false,
    });

    if (audioId) {
      gather.play(`${config.publicBaseUrl}/audio/${audioId}.wav`);
    } else {
      gather.say({ voice: "Polly.Aditi", language: "en-IN" }, promptMsg);
    }

    // Keep looping if still silent
    twiml.redirect({ method: "POST" }, `${config.publicBaseUrl}/voice/silence`);
    return res.type("text/xml").send(twiml.toString());
  }

  // Disconnect after 4 consecutive long silences with Diya farewell
  const farewellText = "Doctor, lagta hai aap abhi busy hain. Main aapka time nahi loongi. Thank you!";
  const { audioId } = await getOrSynthesizeAudio(farewellText, config.sarvamTtsLanguage, config.sarvamTtsSpeaker);
  if (audioId) {
    twiml.play(`${config.publicBaseUrl}/audio/${audioId}.wav`);
  } else {
    twiml.say({ voice: "Polly.Aditi", language: "en-IN" }, farewellText);
  }
  twiml.hangup();
  finalizeCall(callSid, "completed");
  res.type("text/xml").send(twiml.toString());
});

// Webhook: Twilio posts what caller said
app.all("/voice/respond", async (req, res) => {
  const callSid = req.body?.CallSid || req.query?.CallSid || "unknown";
  const userSpeech = req.body?.SpeechResult || req.query?.SpeechResult;
  console.log(`\n🗣️ [Caller Spoke - ${callSid}]: "${userSpeech || "(no speech detected)"}"`);

  if (!userSpeech || userSpeech.trim().length === 0) {
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.redirect({ method: "POST" }, `${config.publicBaseUrl}/voice/silence`);
    return res.type("text/xml").send(twiml.toString());
  }

  // Reset silence counter since caller spoke
  silenceCounts.set(callSid, 0);

  // 1. Record caller turn
  const userTurn = {
    role: "user",
    text: userSpeech,
    timestamp: new Date().toISOString()
  };
  currentActiveCall.turns.push(userTurn);
  broadcast("transcript_turn", { callSid, turn: userTurn });

  // 2. Manage conversation history — keep last 4 exchanges (system + 4 turns = 5 entries max)
  // Smaller context = fewer LLM input tokens = faster inference
  let history = activeConversations.get(callSid) || [
    { role: "system", content: currentSystemPrompt },
  ];
  history.push({ role: "user", content: userSpeech });

  if (history.length > 5) {
    history = [history[0], ...history.slice(-4)];
  }

  let replyText = "I am listening, please go ahead!";
  let chatMs = 0;
  let ttsMs = 0;
  let replyAudioId = null;

  // Low-latency deterministic fast path: Instant 0ms LLM + 0ms TTS for standard flow turns
  const instantMatch = detectInstantResponse(userSpeech, history);
  if (instantMatch) {
    console.log(`⚡ [Instant Fast-Path 0ms]: Matched deterministic rule: "${instantMatch.slice(0, 45)}..."`);
    replyText = instantMatch;
    chatMs = 0;
    history.push({ role: "assistant", content: replyText });
    activeConversations.set(callSid, history);

    // TTS for pre-warmed phrases is instant (0ms cache hit)
    const isCallCut = shouldCutCall(userSpeech, replyText);
    const cleanReplyText = replyText.replace(/\[HANGUP\]/gi, "").trim();
    const ttsResult = await getOrSynthesizeAudio(cleanReplyText, config.sarvamTtsLanguage, config.sarvamTtsSpeaker);
    ttsMs = ttsResult.ttsMs;
    replyAudioId = ttsResult.audioId;

    const totalTurnMs = chatMs + ttsMs;
    console.log(`⚡ [LATENCY METRIC] Chat: ${chatMs}ms | TTS: ${ttsMs}ms | Turn Total: ${totalTurnMs}ms`);

    currentActiveCall.latencyStats.latestChatMs = chatMs;
    currentActiveCall.latencyStats.latestTtsMs = ttsMs;
    currentActiveCall.latencyStats.latestTotalMs = totalTurnMs;
    currentActiveCall.latencyStats.samples.push(totalTurnMs);

    const assistantTurn = { role: "assistant", text: cleanReplyText, timestamp: new Date().toISOString(), chatMs, ttsMs, totalMs: totalTurnMs, audioUrl: replyAudioId ? `/audio/${replyAudioId}.wav` : null };
    currentActiveCall.turns.push(assistantTurn);
    // Broadcast async — do not await so TwiML is sent immediately
    setImmediate(() => broadcast("transcript_turn", { callSid, turn: assistantTurn, latencyStats: currentActiveCall.latencyStats }));

    const twiml = new twilio.twiml.VoiceResponse();
    if (isCallCut) {
      console.log(`\n📴 [Call Cut Executed - ${callSid}]: Playing farewell and hanging up.`);
      if (replyAudioId) twiml.play(`${config.publicBaseUrl}/audio/${replyAudioId}.wav`);
      else twiml.say({ voice: "Polly.Aditi", language: "en-IN" }, cleanReplyText);
      twiml.hangup();
      finalizeCall(callSid, "completed");
      return res.type("text/xml").send(twiml.toString());
    }
    const gather = twiml.gather({ input: "speech", action: `${config.publicBaseUrl}/voice/respond`, method: "POST", speechTimeout: config.speechTimeout || 1, timeout: 7, language: config.sarvamTtsLanguage, speechModel: "phone_call", enhanced: true, profanityFilter: false });
    if (replyAudioId) gather.play(`${config.publicBaseUrl}/audio/${replyAudioId}.wav`);
    else gather.say({ voice: "Polly.Aditi", language: "en-IN" }, cleanReplyText);
    twiml.redirect({ method: "POST" }, `${config.publicBaseUrl}/voice/silence`);
    return res.type("text/xml").send(twiml.toString());
  }

  // LLM path: pipeline Chat → TTS with minimal sequential delay
  try {
    console.log(`[Sarvam Chat] Sending to ${config.sarvamChatModel}...`);
    const chatT0 = Date.now();
    const completion = await sarvam.chat.completions({
      model: config.sarvamChatModel,
      messages: history,
      max_tokens: 35,    // 35 tokens: 1 short sentence, benchmarked 550ms faster than 24
      temperature: 0.2,  // Low temperature = faster, more consistent generation
    });
    chatMs = Date.now() - chatT0;

    replyText = completion.choices?.[0]?.message?.content || replyText;
    console.log(`[Sarvam AI Reply (${chatMs}ms)]: "${replyText}"`);
    history.push({ role: "assistant", content: replyText });
    activeConversations.set(callSid, history);
  } catch (err) {
    console.error("[Sarvam Chat Error]:", err.message);
    if (shouldCutCall(userSpeech, "")) {
      replyText = "Ji Doctor, thank you for your time. Aapka din achha rahe. [HANGUP]";
    }
  }

  // Check if call should be cut / hung up
  const isCallCut = shouldCutCall(userSpeech, replyText);
  const cleanReplyText = replyText.replace(/\[HANGUP\]/gi, "").trim();

  // 3. TTS — starts immediately after chat reply text is ready
  console.log(`[Sarvam TTS] Generating audio for: "${cleanReplyText.slice(0, 40)}..."`);
  const ttsResult = await getOrSynthesizeAudio(cleanReplyText, config.sarvamTtsLanguage, config.sarvamTtsSpeaker);
  ttsMs = ttsResult.ttsMs;
  replyAudioId = ttsResult.audioId;

  const totalTurnMs = chatMs + ttsMs;
  console.log(`⚡ [LATENCY METRIC] Chat: ${chatMs}ms | TTS: ${ttsMs}ms | Turn Total: ${totalTurnMs}ms`);

  // Update real-time latency stats
  currentActiveCall.latencyStats.latestChatMs = chatMs;
  currentActiveCall.latencyStats.latestTtsMs = ttsMs;
  currentActiveCall.latencyStats.latestTotalMs = totalTurnMs;
  currentActiveCall.latencyStats.samples.push(totalTurnMs);

  const assistantTurn = {
    role: "assistant",
    text: cleanReplyText,
    timestamp: new Date().toISOString(),
    chatMs,
    ttsMs,
    totalMs: totalTurnMs,
    audioUrl: replyAudioId ? `/audio/${replyAudioId}.wav` : null
  };
  currentActiveCall.turns.push(assistantTurn);

  // Broadcast to dashboard asynchronously — do not await, so TwiML is sent immediately
  setImmediate(() => broadcast("transcript_turn", { callSid, turn: assistantTurn, latencyStats: currentActiveCall.latencyStats }));

  const twiml = new twilio.twiml.VoiceResponse();

  if (isCallCut) {
    console.log(`\n📴 [Call Cut Executed - ${callSid}]: Playing final farewell and hanging up telephone call.`);
    if (replyAudioId) twiml.play(`${config.publicBaseUrl}/audio/${replyAudioId}.wav`);
    else twiml.say({ voice: "Polly.Aditi", language: "en-IN" }, cleanReplyText);
    twiml.hangup();
    finalizeCall(callSid, "completed");
    return res.type("text/xml").send(twiml.toString());
  }

  const gather = twiml.gather({
    input: "speech",
    action: `${config.publicBaseUrl}/voice/respond`,
    method: "POST",
    speechTimeout: config.speechTimeout || 1, // 1s silence threshold
    timeout: 7,
    language: config.sarvamTtsLanguage,
    speechModel: "phone_call",
    enhanced: true,
    profanityFilter: false,
  });

  if (replyAudioId) {
    const audioUrl = `${config.publicBaseUrl}/audio/${replyAudioId}.wav`;
    gather.play(audioUrl);
  } else {
    gather.say({ voice: "Polly.Aditi", language: "en-IN" }, cleanReplyText);
  }

  // If friend pauses or takes time to respond, redirect to silence check instead of hanging up
  twiml.redirect({ method: "POST" }, `${config.publicBaseUrl}/voice/silence`);

  res.type("text/xml").send(twiml.toString());

  // Predictive pre-synthesis: while Twilio plays the audio (~1-3s), we warm the
  // cache with likely next-turn phrases so they're 0ms hits when doctor responds.
  setImmediate(() => runPredictivePreSynthesis());
});

// Call Cut alias endpoint
app.post("/api/call/cut", async (_req, res) => {
  const sid = currentActiveCall.callSid;
  if (!sid) {
    currentActiveCall.status = "idle";
    broadcast("call_status", { activeCall: currentActiveCall });
    return res.json({ success: true, message: "No active call to cut" });
  }

  try {
    console.log(`[API Call Cut] Cutting call ${sid} via Twilio REST API...`);
    const statusToSet = currentActiveCall.status === "in-progress" ? "completed" : "canceled";
    await twilioClient.calls(sid).update({ status: statusToSet });
    finalizeCall(sid, "completed");
    res.json({ success: true, message: "Call cut successfully" });
  } catch (err) {
    console.error("[Call Cut Error]:", err.message);
    finalizeCall(sid, "completed");
    res.status(500).json({ error: err.message });
  }
});

// Call Status Webhook - Persist transcript when call completes
app.post("/call-status", (req, res) => {
  const { CallSid, CallStatus, Duration } = req.body;
  console.log(`[Twilio Status Webhook] CallSid: ${CallSid}, Status: ${CallStatus}, Duration: ${Duration || 0}s`);

  if (CallStatus === "completed" || CallStatus === "failed" || CallStatus === "busy" || CallStatus === "no-answer" || CallStatus === "canceled") {
    finalizeCall(CallSid, CallStatus, Duration);
  } else if (currentActiveCall.callSid === CallSid) {
    currentActiveCall.status = CallStatus;
    broadcast("call_status", { activeCall: currentActiveCall });
  }

  res.sendStatus(204);
});

server.listen(config.port, () => {
  console.log(`
====================================================================
🇮🇳 Sarvam AI + Twilio Voice Studio running on port ${config.port}!
👉 UI Dashboard: http://localhost:${config.port}
👉 Health Check: http://localhost:${config.port}/health
👉 Public TwiML Webhook: ${config.publicBaseUrl}/twiml
👉 Sarvam Model: ${config.sarvamChatModel}
👉 TTS Model: ${config.sarvamTtsModel} (${config.sarvamTtsSpeaker})
👉 HD Audio Sample Rate: 22050 Hz (Studio Voice Quality)
👉 Natural Human Pace: 1.0 (Calm, conversational speed)
👉 Speech Timeout: ${config.speechTimeout}s (low-latency mode)
====================================================================
`);

  // Pre-warm frequent phrases in memory so they serve in 0ms with Kavya HD voice
  const prewarmPhrases = [
    "Hello, kya main Doctor se baat kar rahi hoon?",
    "Namaste, Doctor. Main Diya bol rahi hoon, Career Plan B se. Humne aapko NEET PG counselling toolkit WhatsApp par bheja tha. Bas confirm karna tha ki mil gaya ya nahi.",
    "Great, Doctor! Kya toolkit ko lekar koi basic question hai?",
    "Sorry, Doctor. Main resend request note kar leti hoon. Aap careerplanb.co par bhi check kar sakte hain.",
    "Koi baat nahi, Doctor. Aap convenient time par dekh lijiye.",
    "Bilkul, Doctor. Thank you for your time. Aapka din achha rahe.",
    "Sorry for the inconvenience. Main aapka time nahi loongi. Thank you.",
    "Understood, Doctor. Main aapki do-not-call request record kar leti hoon. Thank you.",
    "Doctor, lagta hai aap abhi busy hain. Main aapka time nahi loongi. Thank you!",
    "Hey, are you still there?",
    "I'm still here, take your time!"
  ];

  const cacheKey = `${config.sarvamTtsLanguage}:${config.sarvamTtsSpeaker}`;
  (async () => {
    for (const phrase of prewarmPhrases) {
      try {
        const { audioId } = await synthesizeSpeech(phrase, config.sarvamTtsLanguage, config.sarvamTtsSpeaker, true);
        if (audioId) {
          phraseAudioCache.set(`${config.sarvamTtsLanguage}:${config.sarvamTtsSpeaker}:${phrase}`, audioId);
          if (phrase.startsWith("Hello, kya main Doctor")) {
            greetingAudioCache.set(cacheKey, audioId);
          }
        }
      } catch (err) {
        console.warn(`[TTS Pre-warm Warning]:`, err.message);
      }
    }
    console.log(`⚡ [TTS Pre-warm Complete]: ${phraseAudioCache.size} phrases cached for 0ms instant playback!`);
  })();
});


