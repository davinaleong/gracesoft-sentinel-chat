import type { AiClient } from "@sentinel/ai-provider";

/** Structured result returned by the dish-analysis AI call */
export interface DishAnalysis {
  dishName: string | null;
  servings: number;
  ingredients: string[];
  steps: string[];
  nutrition: {
    calories: number;
    protein: string;
    carbohydrates: string;
    fat: string;
    fiber: string;
  };
  note?: string;
}

const SYSTEM_PROMPT = `You are a culinary AI assistant. When given a food photo, respond with JSON only (no markdown, no extra text):
{
  "dishName": "string or null if not food",
  "servings": number,
  "ingredients": ["ingredient with approximate quantity", ...],
  "steps": ["concise step", ...],
  "nutrition": {
    "calories": number,
    "protein": "e.g. 15g",
    "carbohydrates": "e.g. 30g",
    "fat": "e.g. 10g",
    "fiber": "e.g. 5g"
  },
  "note": "optional: set this if the image is not food or the dish cannot be identified"
}
Keep steps concise (max 8 steps). Nutrition values are approximate per serving.`;

/**
 * Analyses a dish photo URL and returns structured data.
 * All AI interaction is self-contained here — prompts, message construction,
 * and response parsing stay within this module.
 */
export async function analyzeDish(
  imageUrl: string,
  client: AiClient
): Promise<DishAnalysis> {
  const raw = await client.chat(
    [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageUrl, detail: "low" } },
          { type: "text", text: "Identify this dish and provide recipe + nutritional info." },
        ],
      },
    ],
    { maxTokens: 1200, jsonOutput: true }
  );

  return JSON.parse(raw) as DishAnalysis;
}
