// ===================================================================
// SARVAM VOICE STUDIO - CLIENT APPLICATION LOGIC
// ===================================================================

const state = {
  activeCall: null,
  callTimerInterval: null,
  callSeconds: 0,
  ws: null,
  transcripts: [],
  selectedHistoryId: null,
};

// Preset prompts
const PROMPT_PRESETS = {
  diya: `SYSTEM PROMPT — DIYA | CAREER PLAN B
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
Use tools for sending, scheduling, and opt-out recording only when available and authorized.
Do not abruptly abandon a conversation, but always respect a request to end the call.
The doctor's time and informed choice are more important than booking a session.`,
  custom: ``
};

// DOM Elements
const wsStatusPill = document.getElementById('wsStatusPill');
const wsStatusText = document.getElementById('wsStatusText');
const callStatusBadge = document.getElementById('callStatusBadge');
const liveTurnIndicator = document.getElementById('liveTurnIndicator');
const liveTurnText = document.getElementById('liveTurnText');
const dialerForm = document.getElementById('dialerForm');
const startCallBtn = document.getElementById('startCallBtn');
const hangupCallBtn = document.getElementById('hangupCallBtn');
const inputFriendNumber = document.getElementById('inputFriendNumber');
const selectLanguage = document.getElementById('selectLanguage');
const selectSpeaker = document.getElementById('selectSpeaker');
const selectPromptPreset = document.getElementById('selectPromptPreset');
const customPromptGroup = document.getElementById('customPromptGroup');
const inputCustomPrompt = document.getElementById('inputCustomPrompt');
const metaCallSid = document.getElementById('metaCallSid');
const metaTwilioNumber = document.getElementById('metaTwilioNumber');
const callDurationTimer = document.getElementById('callDurationTimer');
const transcriptContainer = document.getElementById('transcriptContainer');
const emptyTranscriptState = document.getElementById('emptyTranscriptState');
const audioWaveBar = document.getElementById('audioWaveBar');
const waveSpeakerLabel = document.getElementById('waveSpeakerLabel');

// Latency DOM Elements
const gaugePath = document.getElementById('gaugePath');
const currentLatencyNumber = document.getElementById('currentLatencyNumber');
const latencyRatingText = document.getElementById('latencyRatingText');
const breakdownChatMs = document.getElementById('breakdownChatMs');
const breakdownTtsMs = document.getElementById('breakdownTtsMs');
const breakdownTotalMs = document.getElementById('breakdownTotalMs');
const barChat = document.getElementById('barChat');
const barTts = document.getElementById('barTts');
const avgLatencyStat = document.getElementById('avgLatencyStat');
const turnCountStat = document.getElementById('turnCountStat');
const subsecondBadge = document.getElementById('subsecondBadge');

// History & Tabs DOM
const tabStudioBtn = document.getElementById('tabStudioBtn');
const tabHistoryBtn = document.getElementById('tabHistoryBtn');
const tabAnalyticsBtn = document.getElementById('tabAnalyticsBtn');
const studioView = document.getElementById('studioView');
const historyView = document.getElementById('historyView');
const analyticsView = document.getElementById('analyticsView');
const historyCallsList = document.getElementById('historyCallsList');
const detailContent = document.getElementById('detailContent');
const detailCallTitle = document.getElementById('detailCallTitle');
const detailCallSubtitle = document.getElementById('detailCallSubtitle');
const detailActions = document.getElementById('detailActions');
const transcriptCountBadge = document.getElementById('transcriptCountBadge');
const refreshHistoryBtn = document.getElementById('refreshHistoryBtn');
const downloadTranscriptBtn = document.getElementById('downloadTranscriptBtn');
const deleteTranscriptBtn = document.getElementById('deleteTranscriptBtn');
const clearChatBtn = document.getElementById('clearChatBtn');
const exportChatBtn = document.getElementById('exportChatBtn');

// Settings Modal
const settingsModal = document.getElementById('settingsModal');
const openSettingsBtn = document.getElementById('openSettingsBtn');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
const settingsForm = document.getElementById('settingsForm');
const settingPublicUrl = document.getElementById('settingPublicUrl');
const settingFriendNumber = document.getElementById('settingFriendNumber');
const settingTwilioFrom = document.getElementById('settingTwilioFrom');
const settingSystemPrompt = document.getElementById('settingSystemPrompt');

// ===================================================================
// WEBSOCKET REAL-TIME SYNC
// ===================================================================

function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/dashboard-ws`;

  state.ws = new WebSocket(wsUrl);

  state.ws.onopen = () => {
    wsStatusPill.className = 'status-pill online';
    wsStatusText.textContent = 'Live Socket Connected';
  };

  state.ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleServerEvent(data);
    } catch (e) {
      console.error('WS Parse Error:', e);
    }
  };

  state.ws.onclose = () => {
    wsStatusPill.className = 'status-pill';
    wsStatusText.textContent = 'Reconnecting...';
    setTimeout(initWebSocket, 2000);
  };

  state.ws.onerror = () => {
    state.ws.close();
  };
}

function handleServerEvent(event) {
  switch (event.type) {
    case 'init':
      if (event.config) {
        metaTwilioNumber.textContent = event.config.twilioPhoneNumber || '+17372212163';
        if (event.config.friendPhoneNumber) {
          inputFriendNumber.value = event.config.friendPhoneNumber;
        }
        if (event.config.sarvamTtsLanguage) {
          selectLanguage.value = event.config.sarvamTtsLanguage;
        }
        if (event.config.sarvamTtsSpeaker) {
          selectSpeaker.value = event.config.sarvamTtsSpeaker;
        }
      }
      if (event.activeCall && event.activeCall.status !== 'idle' && event.activeCall.status !== 'completed') {
        updateCallState(event.activeCall);
      }
      break;

    case 'call_status':
      if (event.activeCall) {
        updateCallState(event.activeCall);
      }
      break;

    case 'transcript_turn':
      renderTurn(event.turn);
      if (event.latencyStats) {
        updateLatencyMeter(event.latencyStats);
      }
      break;

    case 'transcript_saved':
      fetchTranscripts();
      break;
  }
}

// ===================================================================
// CALL LIFECYCLE & STATE MANAGEMENT
// ===================================================================

function updateCallState(call) {
  state.activeCall = call;
  const status = (call.status || 'idle').toLowerCase();

  callStatusBadge.textContent = status.toUpperCase();
  callStatusBadge.className = `badge-status ${status}`;

  if (call.callSid) {
    metaCallSid.textContent = `${call.callSid.slice(0, 8)}...${call.callSid.slice(-4)}`;
  }

  if (status === 'dialing' || status === 'ringing' || status === 'in-progress') {
    startCallBtn.style.display = 'none';
    hangupCallBtn.style.display = 'flex';
    liveTurnIndicator.classList.add('active');

    if (status === 'ringing') {
      liveTurnText.textContent = 'Ringing destination phone...';
      audioWaveBar.classList.remove('speaking');
    } else if (status === 'in-progress') {
      liveTurnText.textContent = 'Call active • Live conversation';
      startCallTimer();
    }
  } else {
    startCallBtn.style.display = 'flex';
    hangupCallBtn.style.display = 'none';
    liveTurnIndicator.classList.remove('active');
    liveTurnText.textContent = status === 'completed' ? 'Call finished' : 'Ready for call';
    audioWaveBar.classList.remove('speaking');
    stopCallTimer();
  }
}

function startCallTimer() {
  if (state.callTimerInterval) return;
  state.callSeconds = 0;
  state.callTimerInterval = setInterval(() => {
    state.callSeconds++;
    const mins = String(Math.floor(state.callSeconds / 60)).padStart(2, '0');
    const secs = String(state.callSeconds % 60).padStart(2, '0');
    callDurationTimer.textContent = `${mins}:${secs}`;
  }, 1000);
}

function stopCallTimer() {
  if (state.callTimerInterval) {
    clearInterval(state.callTimerInterval);
    state.callTimerInterval = null;
  }
}

// ===================================================================
// REAL-TIME TRANSCRIPT RENDERING
// ===================================================================

function renderTurn(turn) {
  if (emptyTranscriptState) {
    emptyTranscriptState.style.display = 'none';
  }

  const isAssistant = turn.role === 'assistant';
  const turnEl = document.createElement('div');
  turnEl.className = `chat-turn ${turn.role}`;

  const timeStr = turn.timestamp ? new Date(turn.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';

  let footerHtml = `<span class="turn-time">${timeStr}</span>`;
  if (isAssistant && turn.totalMs > 0) {
    footerHtml += `<span class="latency-pill">⚡ ${turn.totalMs}ms</span>`;
  }
  if (isAssistant && turn.audioUrl) {
    footerHtml += `
      <button class="btn-play-audio" onclick="playAudio('${turn.audioUrl}', this)">
        <span>▶</span> Replay Voice
      </button>
    `;
  }

  turnEl.innerHTML = `
    <div class="turn-avatar">${isAssistant ? 'AI' : 'You'}</div>
    <div class="turn-bubble">
      <div class="turn-text">${escapeHtml(turn.text)}</div>
      <div class="turn-footer">${footerHtml}</div>
    </div>
  `;

  transcriptContainer.appendChild(turnEl);
  transcriptContainer.scrollTop = transcriptContainer.scrollHeight;

  // Animate wave bar
  audioWaveBar.classList.add('speaking');
  waveSpeakerLabel.textContent = isAssistant ? 'Sarvam AI Speaking...' : 'Friend Speaking...';
  setTimeout(() => {
    audioWaveBar.classList.remove('speaking');
    waveSpeakerLabel.textContent = 'Voice Activity';
  }, 3500);
}

window.playAudio = function (url, btn) {
  const audio = new Audio(url);
  const oldText = btn.innerHTML;
  btn.innerHTML = '<span>🔊</span> Playing...';
  audio.play().catch(e => console.error('Audio play error:', e));
  audio.onended = () => {
    btn.innerHTML = oldText;
  };
};

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===================================================================
// LATENCY SPEEDOMETER & WATERFALL METER
// ===================================================================

function updateLatencyMeter(stats) {
  const total = stats.latestTotalMs || 0;
  const chat = stats.latestChatMs || 0;
  const tts = stats.latestTtsMs || 0;

  // Number animation
  currentLatencyNumber.textContent = total;
  breakdownChatMs.textContent = `${chat} ms`;
  breakdownTtsMs.textContent = `${tts} ms`;
  breakdownTotalMs.textContent = `${total} ms`;

  // Waterfall bars (% relative to max 1500ms)
  const maxScale = 1500;
  barChat.style.width = `${Math.min(100, (chat / maxScale) * 100)}%`;
  barTts.style.width = `${Math.min(100, (tts / maxScale) * 100)}%`;

  // Speedometer Gauge Path (Circumference ~ 251.2)
  const totalCircumference = 251.2;
  const percentage = Math.min(1, Math.max(0, total / 2000));
  const offset = totalCircumference * (1 - percentage);
  gaugePath.style.strokeDashoffset = offset;

  // Color rating
  if (total <= 800) {
    gaugePath.style.stroke = '#10b981'; // Emerald
    latencyRatingText.textContent = '⚡ Ultra-Low Latency (Sub-Second)';
    latencyRatingText.style.color = '#34d399';
    subsecondBadge.textContent = '⚡ Sub-Second Achieved!';
    subsecondBadge.style.color = '#34d399';
  } else if (total <= 1200) {
    gaugePath.style.stroke = '#06b6d4'; // Cyan
    latencyRatingText.textContent = '🚀 Fast Telephonic Response';
    latencyRatingText.style.color = '#38bdf8';
    subsecondBadge.textContent = 'Fast (~1s)';
    subsecondBadge.style.color = '#38bdf8';
  } else {
    gaugePath.style.stroke = '#f59e0b'; // Amber
    latencyRatingText.textContent = 'Normal Voice Response';
    latencyRatingText.style.color = '#fbbf24';
  }

  // Session Averages
  if (stats.samples && stats.samples.length > 0) {
    const avg = Math.round(stats.samples.reduce((a, b) => a + b, 0) / stats.samples.length);
    avgLatencyStat.textContent = `${avg} ms`;
    turnCountStat.textContent = stats.samples.length;
  }
}

// ===================================================================
// HISTORY & TRANSCRIPT VIEWER
// ===================================================================

async function fetchTranscripts() {
  try {
    const res = await fetch('/api/transcripts');
    const data = await res.json();
    state.transcripts = data.transcripts || [];
    transcriptCountBadge.textContent = state.transcripts.length;
    renderHistoryList();
    renderAnalytics(state.transcripts);
  } catch (err) {
    console.error('Error fetching transcripts:', err);
  }
}

function renderHistoryList() {
  historyCallsList.innerHTML = '';
  if (state.transcripts.length === 0) {
    historyCallsList.innerHTML = `
      <div class="empty-state" style="padding: 30px 10px;">
        <p>No call transcripts saved yet. Dial a call to record history.</p>
      </div>
    `;
    return;
  }

  state.transcripts.forEach((call, index) => {
    const item = document.createElement('div');
    item.className = `history-item ${state.selectedHistoryId === call.id ? 'active' : ''}`;
    item.onclick = () => selectHistoryCall(call.id);

    const dateStr = new Date(call.startedAt).toLocaleString([], {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const mins = Math.floor(call.durationSec / 60);
    const secs = call.durationSec % 60;
    const durStr = `${mins}m ${secs}s`;

    item.innerHTML = `
      <div class="history-item-header">
        <span class="history-phone">${escapeHtml(call.friendNumber)}</span>
        <span class="history-duration">${durStr}</span>
      </div>
      <div class="history-meta">
        <span>${dateStr}</span>
        <span class="font-mono text-emerald">⚡ ${call.avgLatencyMs || 700}ms avg</span>
      </div>
    `;

    historyCallsList.appendChild(item);
  });
}

function selectHistoryCall(id) {
  state.selectedHistoryId = id;
  renderHistoryList();

  const call = state.transcripts.find(t => t.id === id);
  if (!call) return;

  detailCallTitle.textContent = `Call: ${call.friendNumber}`;
  const dateStr = new Date(call.startedAt).toLocaleString();
  detailCallSubtitle.textContent = `${dateStr} • Duration: ${call.durationSec}s • Avg Latency: ${call.avgLatencyMs}ms`;
  detailActions.style.display = 'flex';

  detailContent.innerHTML = '';
  const turnsWrap = document.createElement('div');
  turnsWrap.className = 'transcript-scroll-area';

  call.turns.forEach(turn => {
    const isAssistant = turn.role === 'assistant';
    const turnEl = document.createElement('div');
    turnEl.className = `chat-turn ${turn.role}`;

    const timeStr = turn.timestamp ? new Date(turn.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
    let footer = `<span class="turn-time">${timeStr}</span>`;
    if (isAssistant && turn.totalMs > 0) {
      footer += `<span class="latency-pill">⚡ ${turn.totalMs}ms</span>`;
    }
    if (isAssistant && turn.audioUrl) {
      footer += `
        <button class="btn-play-audio" onclick="playAudio('${turn.audioUrl}', this)">
          <span>▶</span> Replay Voice
        </button>
      `;
    }

    turnEl.innerHTML = `
      <div class="turn-avatar">${isAssistant ? 'AI' : 'You'}</div>
      <div class="turn-bubble">
        <div class="turn-text">${escapeHtml(turn.text)}</div>
        <div class="turn-footer">${footer}</div>
      </div>
    `;
    turnsWrap.appendChild(turnEl);
  });

  detailContent.appendChild(turnsWrap);
}

function renderAnalytics(transcripts) {
  if (!transcripts || transcripts.length === 0) return;

  let allLatencies = [];
  let allChat = [];
  let allTts = [];

  transcripts.forEach(c => {
    c.turns.forEach(t => {
      if (t.role === 'assistant') {
        if (t.totalMs) allLatencies.push(t.totalMs);
        if (t.chatMs) allChat.push(t.chatMs);
        if (t.ttsMs) allTts.push(t.ttsMs);
      }
    });
  });

  if (allLatencies.length > 0) {
    const min = Math.min(...allLatencies);
    document.getElementById('benchFastestTurn').textContent = `${min} ms`;
  }
  if (allChat.length > 0) {
    const avgChat = Math.round(allChat.reduce((a, b) => a + b, 0) / allChat.length);
    document.getElementById('benchAvgChat').textContent = `${avgChat} ms`;
  }
  if (allTts.length > 0) {
    const avgTts = Math.round(allTts.reduce((a, b) => a + b, 0) / allTts.length);
    document.getElementById('benchAvgTts').textContent = `${avgTts} ms`;
  }
}

// ===================================================================
// EVENT LISTENERS & ACTIONS
// ===================================================================

// Dial Outbound Call
dialerForm.onsubmit = async (e) => {
  e.preventDefault();
  const friendNumber = inputFriendNumber.value.trim();
  const language = selectLanguage.value;
  const speaker = selectSpeaker.value;
  const presetKey = selectPromptPreset.value;
  const customPrompt = presetKey === 'custom' ? inputCustomPrompt.value : PROMPT_PRESETS[presetKey];

  startCallBtn.disabled = true;
  startCallBtn.innerHTML = '<span>⏳</span> Dialing...';

  try {
    const res = await fetch('/api/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        friendNumber,
        language,
        speaker,
        systemPrompt: customPrompt
      })
    });

    const data = await res.json();
    if (!res.ok) {
      alert(`Dial failed: ${data.error || 'Server error'}`);
    }
  } catch (err) {
    alert(`Dial error: ${err.message}`);
  } finally {
    startCallBtn.disabled = false;
    startCallBtn.innerHTML = '<span class="btn-icon">📞</span><span class="btn-text">Dial Outbound Call</span>';
  }
};

// Hang up
hangupCallBtn.onclick = async () => {
  hangupCallBtn.disabled = true;
  hangupCallBtn.innerHTML = '<span>⏳</span> Ending...';
  try {
    await fetch('/api/hangup', { method: 'POST' });
  } catch (err) {
    console.error('Hangup error:', err);
  } finally {
    hangupCallBtn.disabled = false;
    hangupCallBtn.innerHTML = '<span class="btn-icon">🔴</span><span class="btn-text">Hang Up Call</span>';
  }
};

// Prompt Presets selector
selectPromptPreset.onchange = () => {
  if (selectPromptPreset.value === 'custom') {
    customPromptGroup.style.display = 'block';
  } else {
    customPromptGroup.style.display = 'none';
  }
};

// Navigation Tabs
[tabStudioBtn, tabHistoryBtn, tabAnalyticsBtn].forEach(btn => {
  btn.onclick = () => {
    [tabStudioBtn, tabHistoryBtn, tabAnalyticsBtn].forEach(b => b.classList.remove('active'));
    [studioView, historyView, analyticsView].forEach(v => v.classList.remove('active'));

    btn.classList.add('active');
    const targetId = btn.getAttribute('data-target');
    document.getElementById(targetId).classList.add('active');

    if (targetId === 'historyView') {
      fetchTranscripts();
    }
  };
});

// Clear Chat View
clearChatBtn.onclick = () => {
  transcriptContainer.innerHTML = '';
  transcriptContainer.appendChild(emptyTranscriptState);
  emptyTranscriptState.style.display = 'block';
};

// Export TXT
exportChatBtn.onclick = () => {
  const turns = transcriptContainer.querySelectorAll('.chat-turn');
  if (turns.length === 0) {
    alert('No messages in transcript to export.');
    return;
  }
  let txt = '=== SARVAM VOICE CALL TRANSCRIPT ===\n\n';
  turns.forEach(t => {
    const isUser = t.classList.contains('user');
    const text = t.querySelector('.turn-text')?.textContent || '';
    const time = t.querySelector('.turn-time')?.textContent || '';
    txt += `[${time}] ${isUser ? 'Friend' : 'Sarvam AI'}: ${text}\n`;
  });

  const blob = new Blob([txt], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `sarvam-call-transcript-${Date.now()}.txt`;
  a.click();
};

// Export Selected Call JSON
downloadTranscriptBtn.onclick = () => {
  const call = state.transcripts.find(t => t.id === state.selectedHistoryId);
  if (!call) return;
  const blob = new Blob([JSON.stringify(call, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `sarvam-transcript-${call.id}.json`;
  a.click();
};

// Delete Selected Call
deleteTranscriptBtn.onclick = async () => {
  if (!state.selectedHistoryId) return;
  if (!confirm('Are you sure you want to delete this recorded call?')) return;

  try {
    await fetch(`/api/transcripts/${state.selectedHistoryId}`, { method: 'DELETE' });
    state.selectedHistoryId = null;
    detailActions.style.display = 'none';
    detailCallTitle.textContent = 'Call Details';
    detailCallSubtitle.textContent = 'Select a call from the left to view transcript';
    detailContent.innerHTML = '<div class="empty-state"><p>Call deleted.</p></div>';
    fetchTranscripts();
  } catch (err) {
    alert('Error deleting transcript');
  }
};

refreshHistoryBtn.onclick = fetchTranscripts;

// Settings Modal
openSettingsBtn.onclick = async () => {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (data.config) {
      settingPublicUrl.value = data.config.publicBaseUrl || '';
      settingFriendNumber.value = data.config.friendPhoneNumber || '';
      settingTwilioFrom.value = data.config.twilioPhoneNumber || '';
      settingSystemPrompt.value = data.config.systemPrompt || '';
    }
    settingsModal.style.display = 'flex';
  } catch (e) {
    alert('Error loading settings');
  }
};

closeSettingsBtn.onclick = () => settingsModal.style.display = 'none';
cancelSettingsBtn.onclick = () => settingsModal.style.display = 'none';

settingsForm.onsubmit = async (e) => {
  e.preventDefault();
  try {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicBaseUrl: settingPublicUrl.value.trim(),
        friendPhoneNumber: settingFriendNumber.value.trim(),
        systemPrompt: settingSystemPrompt.value.trim(),
      })
    });
    settingsModal.style.display = 'none';
    alert('Settings saved successfully!');
  } catch (err) {
    alert('Error saving settings');
  }
};

// Startup
window.onload = () => {
  initWebSocket();
  fetchTranscripts();
};
