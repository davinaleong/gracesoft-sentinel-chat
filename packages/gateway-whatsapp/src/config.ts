import * as dotenv from "dotenv";
dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  port: parseInt(process.env.PORT ?? "3000", 10),
  phoneNumberId: required("WHATSAPP_PHONE_NUMBER_ID"),
  accessToken: required("WHATSAPP_ACCESS_TOKEN"),
  appSecret: required("WHATSAPP_APP_SECRET"),
  webhookVerifyToken: required("WHATSAPP_WEBHOOK_VERIFY_TOKEN"),
};
