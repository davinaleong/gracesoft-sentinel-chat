import * as dotenv from "dotenv";
dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const calendarConfig = {
  serviceAccountEmail: required("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
  privateKey: required("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"),
  calendarId: required("GOOGLE_CALENDAR_ID"),
};
