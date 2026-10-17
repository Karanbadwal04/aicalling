import "dotenv/config";
import twilio from "twilio";
import { config } from "./config.js";

const destination = process.argv[2] || process.env.FRIEND_PHONE_NUMBER;

if (!destination || !/^\+[1-9]\d{7,14}$/.test(destination)) {
  console.error("Usage: npm run call -- +<country-code><phone-number>");
  console.error("Or define FRIEND_PHONE_NUMBER in .env");
  console.error("Example: npm run call -- +919465802410");
  process.exit(1);
}

if (!config.twilioAccountSid || !config.twilioAuthToken || !config.twilioPhoneNumber) {
  console.error("Error: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER must be set in .env");
  process.exit(1);
}

if (destination === config.twilioPhoneNumber) {
  console.error("Error: Destination must not be your Twilio caller ID.");
  process.exit(1);
}

const client = twilio(config.twilioAccountSid, config.twilioAuthToken);

try {
  console.log(`Dialing outbound call to ${destination} from ${config.twilioPhoneNumber}...`);
  const call = await client.calls.create({
    to: destination,
    from: config.twilioPhoneNumber,
    url: `${config.publicBaseUrl}/twiml`,
  });

  console.log("✅ Call created successfully!");
  console.log("Call SID:", call.sid);
  console.log("Initial Status:", call.status);
} catch (error) {
  console.error("❌ Call creation failed:", error.message);
  process.exitCode = 1;
}
