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
  casual: `You are a warm, casual, and friendly AI calling a friend on the phone.
Rules for conversation:
1. Speak in a natural, casual, and conversational tone with short replies (1-2 sentences max).
2. Never recite long lists or sound like a corporate robot.
3. If the friend speaks in Hindi, Hinglish, Punjabi, or English, reply naturally in the same language.
4. Keep the conversation engaging by asking a simple question back.`,

  dinner: `You are a friendly AI calling on behalf of a friend to make plans for dinner or hanging out this weekend.
Rules for conversation:
1. Speak in a natural, casual, and conversational tone with short replies (1-2 sentences max).
2. Never recite long lists or sound like a corporate robot.
3. If the friend speaks in Hindi, Hinglish, Punjabi, or English, reply naturally in the same language.
4. Keep the conversation engaging by asking a simple question back.
Ask what their schedule looks like, what cuisine they prefer (Italian, Indian, Chinese), and keep it fun, casual, and concise.`,

  birthday: `You are calling to wish the friend an enthusiastic, warm, and happy birthday!
Rules for conversation:
1. Speak in a natural, casual, and conversational tone with short replies (1-2 sentences max).
2. Never recite long lists or sound like a corporate robot.
3. If the friend speaks in Hindi, Hinglish, Punjabi, or English, reply naturally in the same language.
4. Keep the conversation engaging by asking a simple question back.
Sing a quick birthday wish line, ask how they are celebrating today, and wish them a fantastic year ahead in a joyful Indian tone.`,

  assistant: `You are a polite personal voice assistant calling to quickly check availability for an upcoming sync meeting.
Rules for conversation:
1. Speak in a natural, casual, and conversational tone with short replies (1-2 sentences max).
2. Never recite long lists or sound like a corporate robot.
3. If the friend speaks in Hindi, Hinglish, Punjabi, or English, reply naturally in the same language.
4. Keep the conversation engaging by asking a simple question back.
Be courteous, professional, concise, and confirm whether they have 10 minutes free later today.`,
  
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
        metaTwilioNumber.textContent = event.config.twilioPhoneNumber || '+17372508034';
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

window.playAudio = function(url, btn) {
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
