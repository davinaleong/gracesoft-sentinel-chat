import * as dotenv from "dotenv";
dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const cookConfig = {
  openaiApiKey: required("OPENAI_API_KEY"),
};
