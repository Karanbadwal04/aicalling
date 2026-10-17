# 🇮🇳 Sarvam AI + Twilio Phone Calling Agent

An intelligent, multilingual conversational AI phone caller using **Sarvam AI** (`sarvam-105b-conversations` for reasoning and **Bulbul v4** for expressive Indian voices) integrated with **Twilio Voice**.

---

## 🌟 Capabilities

- **Indian Languages & Accents**: Fluent in Hindi, Hinglish, Punjabi, Tamil, Telugu, and Indian-accented English.
- **Natural Back-and-Forth Voice Conversation**: Plays Sarvam's Bulbul voices to the caller and transcribes what the caller says in real time.
- **Twilio Trial Account Friendly**: Uses standard Twilio voice primitives (`<Gather>` and `<Play>`) which work seamlessly on Twilio Trial accounts without being disconnected.

---

## 📁 Project Structure

```
againcall/
├── src/
│   ├── server.js      # Twilio webhooks, Sarvam Chat + TTS audio pipeline
│   ├── call.js        # Outbound dialer CLI script
│   └── config.js      # Environment variable loading & validation
├── sarvam-chat.js     # Standalone script to test Sarvam Chat completion
├── .env               # Your local credentials (never commit this)
├── .env.example       # Example configuration template
├── .gitignore
├── package.json
└── README.md
```

---

## 🚀 Quick Start Guide

### 1. Credentials in [.env](file:///e:/Html/againcall/.env)

Ensure your `.env` contains:

```ini
PORT=3000

# 1. Sarvam AI Credentials (https://dashboard.sarvam.ai)
SARVAM_API_KEY=sk_...
SARVAM_CHAT_MODEL=sarvam-105b-conversations
SARVAM_TTS_LANGUAGE=en-IN
SARVAM_TTS_SPEAKER=shubh

# 2. Twilio Credentials (https://console.twilio.com)
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+17372508034

# 3. Friend's Phone Number
FRIEND_PHONE_NUMBER=+919465802410

# 4. Public Webhook URL (from Cloudflare Tunnel or ngrok)
PUBLIC_BASE_URL=https://your-public-domain.trycloudflare.com
```

---

### 2. Start the Server

```bash
npm start
```

Verify the server is healthy:
[http://localhost:3000/health](http://localhost:3000/health) — returns `{"ok":true,"provider":"Sarvam AI"}`.

---

### 3. Expose Port 3000

Using Cloudflare Tunnel or ngrok:

```bash
cloudflared tunnel --url http://localhost:3000
```
*(or `ngrok http 3000`)*

Update `PUBLIC_BASE_URL` in `.env` with the generated HTTPS forwarding URL.

---

### 4. Make the Outbound Call 📞

Run the dialer command:

```bash
npm run call
```

*(Or specify a custom destination: `npm run call -- +919465802410`)*

---

## 🎙️ Supported Languages & Voices

Sarvam AI supports 11 Indian languages:
- **Languages**: `en-IN` (English), `hi-IN` (Hindi), `bn-IN` (Bengali), `ta-IN` (Tamil), `te-IN` (Telugu), `gu-IN` (Gujarati), `kn-IN` (Kannada), `ml-IN` (Malayalam), `mr-IN` (Marathi), `pa-IN` (Punjabi), `od-IN` (Odia).
- **Voices**: `shubh` (male default), `simran` (female), `ishita` (female), `aditya` (male), `priya` (female), and more.
