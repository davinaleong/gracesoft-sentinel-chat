import * as dotenv from "dotenv";
dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  port: parseInt(process.env.PORT ?? "3001", 10),
  botToken: required("TELEGRAM_BOT_TOKEN"),
  webhookSecret: required("TELEGRAM_WEBHOOK_SECRET"),
};
