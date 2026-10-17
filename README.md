# 🇮🇳 Sarvam AI Voice Calling Studio & Telephony Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Sarvam AI](https://img.shields.io/badge/Sarvam%20AI-Sarvam--105B%20%2B%20Bulbul-blueviolet.svg)](https://sarvam.ai/)
[![Twilio Voice](https://img.shields.io/badge/Twilio-Voice%20API-red.svg)](https://www.twilio.com/)
[![Open Source](https://img.shields.io/badge/Open%20Source-%E2%99%A5-ff69b4.svg)](https://github.com/)

An open-source, full-stack conversational AI phone calling platform powered by **Sarvam AI** (`sarvam-105b-conversations` for LLM dialogue reasoning + **Bulbul v4 TTS** for expressive Indian voices) and **Twilio Voice**.

Equipped with a modern web UI dashboard for dialing, live conversation streaming, real-time per-turn latency tracking (LLM thinking time vs TTS audio generation), and persistent call transcript storage with audio replay.

---

## 🌟 Key Features

- **🌐 100% Open Source**: Free for anyone to use, modify, customize, and extend for their own projects or products.
- **🎙️ Indian Multilingual AI Persona**: Native support for Hindi, Hinglish, Punjabi, Tamil, Telugu, Bengali, Marathi, Gujarati, and Indian-accented English.
- **⏱️ Real-Time Latency Meter**: Interactive SVG speedometer and waterfall latency breakdown measuring:
  - Sarvam LLM chat response time (ms)
  - Bulbul TTS audio synthesis time (ms)
  - Overall roundtrip turn latency (ms)
- **💬 Live Conversation Stream & Voice Replay**: Watch conversations unfold live via WebSocket; listen back to any assistant reply with inline **"▶ Replay Voice"** buttons.
- **📜 Call History & Transcript Storage**: Automatically records all call turns, durations, timestamps, and average latencies in persistent storage (`data/transcripts.json`) with one-click `.txt` and `.json` export.
- **⚡ Twilio Trial Account Friendly**: Specially architected using Twilio `<Gather>` and `<Play>` primitives with background REST status polling. Works seamlessly on free Twilio trial accounts without paid upgrades or media stream limitations.
- **🛡️ Silence Recovery Loop**: Never cuts off mid-conversation. Includes an automated recovery loop that patiently checks in if the caller pauses, preventing premature hangups.
- **🎯 Scenario Presets**: Quick-select presets for Casual Catch-ups, Dinner Plans, Birthday Greetings, Personal Assistant check-ins, or fully customizable prompts.

---

## 🏗️ Architecture & How It Works

```
                        ┌────────────────────────────────────────────────────────┐
                        │             Sarvam Voice Studio (Node.js)              │
                        │                                                        │
┌──────────────┐        │   ┌────────────────────────────────────────────────┐   │        ┌──────────────┐
│  Recipient   │◄───────┼───┤ Twilio Voice Gateway (<Gather> + <Play>)       │◄──┼────────┤  Twilio REST │
│  Phone Call  ├───────►│   └──────────────────────┬─────────────────────────┘   │        └──────────────┘
└──────────────┘ Speech │                          │ Raw Speech Text             │
                        │                          ▼                             │
                        │   ┌────────────────────────────────────────────────┐   │        ┌──────────────┐
                        │   │ Sarvam AI Chat (sarvam-105b-conversations)     ├───┼───────►│  Sarvam AI   │
                        │   └──────────────────────┬─────────────────────────┘   │        │     Cloud    │
                        │                          │ Conversational Text Reply   │        │     APIs     │
                        │                          ▼                             │        └──────────────┘
                        │   ┌────────────────────────────────────────────────┐   │                ▲
                        │   │ Sarvam Bulbul TTS (shubh, simran, etc.)        ├───┼────────────────┘
                        │   └──────────────────────┬─────────────────────────┘   │
                        │                          │ WAV Audio Buffer + Latency  │
                        │                          ▼                             │
┌──────────────┐        │   ┌────────────────────────────────────────────────┐   │
│ Web Browser  │◄───────┼───┤ WebSocket Server (/dashboard-ws)               │   │
│ Studio UI    ├───────►│   │ Real-time Latency, Live Bubbles, Audio Replay  │   │
└──────────────┘        │   └────────────────────────────────────────────────┘   │
                        └────────────────────────────────────────────────────────┘
```

---

## 📋 Prerequisites

Before running this project, make sure you have:

1. **Node.js**: Version 18.0.0 or higher ([Download Node.js](https://nodejs.org/)).
2. **Sarvam AI API Key**: Get your API key from the [Sarvam AI Dashboard](https://dashboard.sarvam.ai/).
3. **Twilio Account**: Free trial or paid account from [Twilio Console](https://console.twilio.com/) with:
   - Account SID
   - Auth Token
   - A Twilio active phone number
   - Verified recipient phone number (if on Twilio trial)
4. **Public Tunnel**: [Cloudflare Tunnel (`cloudflared`)](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/) or [ngrok](https://ngrok.com/) to route Twilio webhooks to your local machine.

---

## 🚀 Step-by-Step Setup Guide

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/sarvam-voice-studio.git
cd sarvam-voice-studio
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Copy the example `.env.example` file to create your `.env`:

```bash
# On Linux/macOS
cp .env.example .env

# On Windows PowerShell
copy .env.example .env
```

Open `.env` and fill in your credentials:

```ini
PORT=3000

# Sarvam AI Credentials (https://dashboard.sarvam.ai)
SARVAM_API_KEY=your_sarvam_api_key_here
SARVAM_CHAT_MODEL=sarvam-105b-conversations
SARVAM_TTS_LANGUAGE=en-IN
SARVAM_TTS_SPEAKER=shubh

# Twilio Credentials (https://console.twilio.com)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_twilio_auth_token_here
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx

# Default Destination Phone Number (E.164 format with country code)
FRIEND_PHONE_NUMBER=+91xxxxxxxxxx

# Public Webhook URL (populated in Step 4)
PUBLIC_BASE_URL=https://your-tunnel-url.trycloudflare.com
```

> **Security Note:** Never commit your `.env` file to version control. It is already included in `.gitignore`.

---

### 4. Expose Local Port to the Internet

Twilio requires a public HTTPS URL to reach your local server webhooks.

#### Option A: Using Cloudflare Tunnel (Recommended - Free, No sign-up required)
```bash
cloudflared tunnel --url http://localhost:3000
```
Look for the output line containing:
```
https://your-generated-name.trycloudflare.com
```

#### Option B: Using ngrok
```bash
ngrok http 3000
```

Copy the generated HTTPS URL and paste it as `PUBLIC_BASE_URL` in your `.env`:
```ini
PUBLIC_BASE_URL=https://your-generated-name.trycloudflare.com
```

---

### 5. Start the Server

```bash
npm start
```

Or for development with automatic reload on changes:
```bash
npm run dev
```

Verify that the server is up by visiting:
[http://localhost:3000/health](http://localhost:3000/health)
*(Returns `{"ok":true,"provider":"Sarvam AI","model":"sarvam-105b-conversations"}`)*

---

### 6. Make a Phone Call! 📞

You can initiate outbound phone calls in two ways:

#### Option A: Through the Web Dashboard (Recommended)
1. Open your browser and navigate to **[http://localhost:3000](http://localhost:3000)**.
2. Enter the destination phone number (e.g. `+919465802410`).
3. Select your desired language (e.g., *English [en-IN]*, *Hindi [hi-IN]*, *Punjabi [pa-IN]*).
4. Select a Bulbul speaker voice (*Shubh*, *Simran*, *Ishita*, *Aditya*, *Priya*).
5. Choose a conversation preset or enter a custom prompt.
6. Click **📞 Dial Outbound Call**.
7. Watch the live conversation, turn-by-turn latency meter, and waveform in real time!

#### Option B: Through Terminal CLI
```bash
npm run call
```
Or pass a specific number directly:
```bash
npm run call -- +919465802410
```

---

## 🤖 Built-in Conversation Persona Rules

To ensure voice calls feel natural, friendly, and human, the AI agent follows these core rules:

1. **Conversational Tone**: Speaks in a natural, casual, and friendly tone with concise replies (1–2 sentences max).
2. **No Robot Monologues**: Never recites long lists or sounds like an automated IVR system.
3. **Multilingual Agility**: If the person speaks in Hindi, Hinglish, Punjabi, or English, the AI automatically replies in that language.
4. **Engaging Flow**: Keeps the conversation lively by asking a simple, relevant question back.

---

## 🎙️ Supported Languages & Bulbul Voices

| Language Code | Language Name |
| :--- | :--- |
| `en-IN` | English (India) |
| `hi-IN` | Hindi (हिन्दी) |
| `pa-IN` | Punjabi (ਪੰਜਾਬੀ) |
| `bn-IN` | Bengali (বাংলা) |
| `ta-IN` | Tamil (தமிழ்) |
| `te-IN` | Telugu (తెలుగు) |
| `mr-IN` | Marathi (मराठी) |
| `gu-IN` | Gujarati (ગુજરાતી) |
| `kn-IN` | Kannada (ಕನ್ನಡ) |
| `ml-IN` | Malayalam (മലയാളം) |
| `od-IN` | Odia (ଓଡ଼ିଆ) |

### Available Voices:
- `shubh` — Male, warm & natural (Default)
- `simran` — Female, clear & expressive
- `ishita` — Female, friendly & conversational
- `aditya` — Male, energetic & modern
- `priya` — Female, polite & professional

---

## 📁 Repository Structure

```
├── public/                 # Web Studio Frontend
│   ├── index.html          # Dashboard HTML UI
│   ├── style.css           # Modern dark-mode glassmorphic styling
│   └── app.js              # WebSocket client, latency meter & transcript UI
├── src/                    # Backend Core
│   ├── server.js           # Express API, Twilio webhooks, Sarvam AI audio bridge
│   ├── call.js             # Outbound CLI dialer script
│   ├── config.js           # Environment loader & configuration validation
│   └── audio.js            # Audio helper utilities
├── data/
│   └── transcripts.json    # Persistent JSON storage of past calls & turns
├── sarvam-chat.js          # Standalone test script for Sarvam Chat API
├── .env.example            # Environment template for new setups
├── package.json            # Project dependencies & scripts
├── LICENSE                 # MIT Open-Source License
└── README.md               # Documentation & setup guide
```

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

1. Fork the project repository.
2. Create your feature branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](./LICENSE) for more information.

---

## 💖 Acknowledgments

- [Sarvam AI](https://sarvam.ai/) for pioneering Indian LLM models and the Bulbul TTS engine.
- [Twilio](https://www.twilio.com/) for programmable voice APIs.
- Built with ❤️ for open-source AI developers.
