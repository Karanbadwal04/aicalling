import "dotenv/config";
import { SarvamAIClient } from "sarvamai";

const apiKey = process.env.SARVAM_API_KEY;

if (!apiKey) {
  console.error("Error: SARVAM_API_KEY is not set in .env");
  process.exit(1);
}

const client = new SarvamAIClient({ apiKey });

async function main() {
  const response = await client.chat.completions({
    model: "sarvam-105b-conversations",
    messages: [
      {
        role: "user",
        content: "Hello! Please introduce yourself in one short sentence.",
      },
    ],
  });

  const reply = response.choices?.[0]?.message?.content || JSON.stringify(response);
  console.log("Sarvam AI Reply:\n", reply);
}

main().catch((err) => {
  console.error("Error calling Sarvam AI:", err.message);
  process.exitCode = 1;
});
