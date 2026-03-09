require('dotenv').config();

const { MeetOpsClient } = require("./meetopsClient");
const { loadSkills } = require("./skillLoader");
const { createOpenClawAgent } = require("./openclawAgent");
const { TelegramListener } = require("./telegramListener");

function assertEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function main() {
  const botToken = assertEnv("TELEGRAM_BOT_TOKEN");
  console.log("[OpenClaw] Starting with backend URL:", process.env.BACKEND_API_URL || "http://localhost:5000");

  const meetopsClient = new MeetOpsClient({
    baseUrl: process.env.BACKEND_API_URL,
  });

  console.log("[OpenClaw] Loading skills...");
  const skills = loadSkills(undefined, { meetopsClient });
  console.log("[OpenClaw] Loaded skills:", Object.keys(skills).join(", "));
  
  console.log("[OpenClaw] Creating agent...");
  const agent = createOpenClawAgent({ skills, meetopsClient });

  const listener = new TelegramListener({
    botToken,
    agent,
  });

  console.log("[OpenClaw] Telegram listener started.");
  await listener.start();
}

main().catch((err) => {
  console.error("[OpenClaw] Failed to start:", err?.message || err);
  process.exit(1);
});
