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

let currentActiveCall = {
  callSid: null,
  status: "idle",
  friendNumber: config.friendPhoneNumber,
  friendName: "Friend",
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

let currentSystemPrompt = `You are a warm, casual, and friendly AI calling a friend on the phone.
Rules for conversation:
1. Speak in a natural, casual, and conversational tone with short replies (1-2 sentences max).
2. Never recite long lists or sound like a corporate robot.
3. If the friend speaks in Hindi, Hinglish, Punjabi, or English, reply naturally in the same language.
4. Keep the conversation engaging by asking a simple question back.`;

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

// Helper: Synthesize speech with Sarvam Bulbul TTS and cache audio buffer
async function synthesizeSpeech(text, languageCode = config.sarvamTtsLanguage, speaker = config.sarvamTtsSpeaker) {
  const t0 = Date.now();
  try {
    const res = await sarvam.textToSpeech.convert({
      inputs: [text],
      target_language_code: languageCode,
      speaker: speaker,
    });

    const ttsMs = Date.now() - t0;

    if (res.audios && res.audios.length > 0) {
      const audioBuffer = Buffer.from(res.audios[0], "base64");
      const audioId = crypto.randomUUID();
      audioStore.set(audioId, audioBuffer);

      // Keep audio cached for 30 minutes
      setTimeout(() => audioStore.delete(audioId), 30 * 60 * 1000);
      return { audioId, ttsMs };
    }
  } catch (err) {
    console.error("[Sarvam TTS Error]:", err.message);
  }
  return { audioId: null, ttsMs: Date.now() - t0 };
}

// -------------------------------------------------------------
// REST API ENDPOINTS FOR DASHBOARD
// -------------------------------------------------------------

// Serve generated audio to Twilio and Browser
app.get("/audio/:id.wav", (req, res) => {
  const audioId = req.params.id;
  const audioData = audioStore.get(audioId);
  if (!audioData) {
    return res.status(404).send("Audio expired or not found");
  }
  res.setHeader("Content-Type", "audio/wav");
  res.setHeader("Content-Length", audioData.length);
  res.setHeader("Accept-Ranges", "bytes");
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

  const greetingText = "Hey! How are you doing today?";
  
  // Initialize conversation memory
  const history = [
    { role: "system", content: currentSystemPrompt },
    { role: "assistant", content: greetingText },
  ];
  activeConversations.set(callSid, history);

  console.log(`[Sarvam AI] Synthesizing greeting: "${greetingText}"...`);
  const { audioId, ttsMs } = await synthesizeSpeech(greetingText, config.sarvamTtsLanguage, config.sarvamTtsSpeaker);

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
    speechTimeout: "auto",
    timeout: 10,
    language: config.sarvamTtsLanguage,
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

    const { audioId } = await synthesizeSpeech(promptMsg, config.sarvamTtsLanguage, config.sarvamTtsSpeaker);

    const gather = twiml.gather({
      input: "speech",
      action: `${config.publicBaseUrl}/voice/respond`,
      method: "POST",
      speechTimeout: "auto",
      timeout: 10,
      language: config.sarvamTtsLanguage,
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

  // Only disconnect after 4 consecutive long silences (>45s of total silence)
  const farewellText = "Looks like you might be away. I'll catch you later, take care!";
  const { audioId } = await synthesizeSpeech(farewellText, config.sarvamTtsLanguage, config.sarvamTtsSpeaker);
  if (audioId) {
    twiml.play(`${config.publicBaseUrl}/audio/${audioId}.wav`);
  } else {
    twiml.say({ voice: "Polly.Aditi", language: "en-IN" }, farewellText);
  }
  twiml.hangup();
  res.type("text/xml").send(twiml.toString());
});

// Webhook: Twilio posts what your friend said
app.all("/voice/respond", async (req, res) => {
  const callSid = req.body?.CallSid || req.query?.CallSid || "unknown";
  const userSpeech = req.body?.SpeechResult || req.query?.SpeechResult;
  console.log(`\n🗣️ [Friend Spoke - ${callSid}]: "${userSpeech || "(no speech detected)"}"`);

  if (!userSpeech || userSpeech.trim().length === 0) {
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.redirect({ method: "POST" }, `${config.publicBaseUrl}/voice/silence`);
    return res.type("text/xml").send(twiml.toString());
  }

  // Reset silence counter since friend spoke
  silenceCounts.set(callSid, 0);

  // 1. Record friend turn
  const userTurn = {
    role: "user",
    text: userSpeech,
    timestamp: new Date().toISOString()
  };
  currentActiveCall.turns.push(userTurn);
  broadcast("transcript_turn", { callSid, turn: userTurn });

  // 2. Measure Sarvam Chat Completion Latency
  let history = activeConversations.get(callSid) || [
    { role: "system", content: currentSystemPrompt },
  ];
  history.push({ role: "user", content: userSpeech });

  let replyText = "I am listening, please go ahead!";
  let chatMs = 0;
  try {
    console.log(`[Sarvam Chat] Sending message to ${config.sarvamChatModel}...`);
    const chatT0 = Date.now();
    const completion = await sarvam.chat.completions({
      model: config.sarvamChatModel,
      messages: history,
    });
    chatMs = Date.now() - chatT0;

    replyText = completion.choices?.[0]?.message?.content || replyText;
    console.log(`[Sarvam AI Reply (${chatMs}ms)]: "${replyText}"`);
    history.push({ role: "assistant", content: replyText });
    activeConversations.set(callSid, history);
  } catch (err) {
    console.error("[Sarvam Chat Error]:", err.message);
  }

  // 3. Measure Sarvam Bulbul TTS Latency
  console.log(`[Sarvam TTS] Generating audio for reply...`);
  const { audioId: replyAudioId, ttsMs } = await synthesizeSpeech(replyText, config.sarvamTtsLanguage, config.sarvamTtsSpeaker);

  const totalTurnMs = chatMs + ttsMs;
  console.log(`⚡ [LATENCY METRIC] Chat: ${chatMs}ms | TTS: ${ttsMs}ms | Turn Total: ${totalTurnMs}ms`);

  // Update real-time latency stats
  currentActiveCall.latencyStats.latestChatMs = chatMs;
  currentActiveCall.latencyStats.latestTtsMs = ttsMs;
  currentActiveCall.latencyStats.latestTotalMs = totalTurnMs;
  currentActiveCall.latencyStats.samples.push(totalTurnMs);

  const assistantTurn = {
    role: "assistant",
    text: replyText,
    timestamp: new Date().toISOString(),
    chatMs,
    ttsMs,
    totalMs: totalTurnMs,
    audioUrl: replyAudioId ? `/audio/${replyAudioId}.wav` : null
  };
  currentActiveCall.turns.push(assistantTurn);

  broadcast("transcript_turn", {
    callSid,
    turn: assistantTurn,
    latencyStats: currentActiveCall.latencyStats
  });

  const twiml = new twilio.twiml.VoiceResponse();

  const gather = twiml.gather({
    input: "speech",
    action: `${config.publicBaseUrl}/voice/respond`,
    method: "POST",
    speechTimeout: "auto",
    timeout: 10,
    language: config.sarvamTtsLanguage,
  });

  if (replyAudioId) {
    const audioUrl = `${config.publicBaseUrl}/audio/${replyAudioId}.wav`;
    gather.play(audioUrl);
  } else {
    gather.say({ voice: "Polly.Aditi", language: "en-IN" }, replyText);
  }

  // If friend pauses or takes time to respond, redirect to silence check instead of hanging up
  twiml.redirect({ method: "POST" }, `${config.publicBaseUrl}/voice/silence`);

  res.type("text/xml").send(twiml.toString());
});

// Call Status Webhook - Persist transcript when call completes
app.post("/call-status", (req, res) => {
  const { CallSid, CallStatus, Duration } = req.body;
  console.log(`[Twilio Status Webhook] CallSid: ${CallSid}, Status: ${CallStatus}, Duration: ${Duration || 0}s`);

  if (CallStatus === "completed" || CallStatus === "failed" || CallStatus === "busy" || CallStatus === "no-answer") {
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
👉 Voice Language: ${config.sarvamTtsLanguage} (${config.sarvamTtsSpeaker})
====================================================================
`);
});
