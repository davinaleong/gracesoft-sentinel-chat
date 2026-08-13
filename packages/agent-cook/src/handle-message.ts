import type { AIProvider, ConversationState, NormalizedMessage, NormalizedResponse } from "@gracesoft-sentinel/core";
import { classifyDish } from "./dish-classifier.js";
import { isDietaryAdjustmentRequest } from "./dietary-adjustment.js";
import { formatRecipe, formatUnidentifiedDish } from "./formatter.js";
import { generateRecipe, type Recipe } from "./recipe-generator.js";

export interface CookHandleMessageInput {
  message: NormalizedMessage;
  state: ConversationState;
  aiProvider: AIProvider;
}

export interface CookHandleMessageResult {
  response: NormalizedResponse;
  state: ConversationState;
}

/** Shape agent-cook owns within `ConversationState.context`. */
export interface CookContext {
  awaitingPhoto?: boolean;
  lastRecipe?: Recipe;
  [key: string]: unknown;
}

const PROMPT_FOR_PHOTO =
  "Cook is ready! Send me a photo of any dish and I'll give you the dish name, " +
  "a full recipe with ingredients and steps, and nutritional info per serving.";

const AWAITING_PHOTO_REMINDER = "I'm waiting for a dish photo! Please send a food photo for me to analyse.";

const ANALYSIS_FAILED = "Sorry, I couldn't analyse that photo right now. Please try again in a moment.";

function withContext(state: ConversationState, context: CookContext): ConversationState {
  return { ...state, context, updatedAt: new Date().toISOString() };
}

async function handlePhoto(
  imageUrl: string,
  aiProvider: AIProvider,
  state: ConversationState
): Promise<CookHandleMessageResult> {
  try {
    const classification = await classifyDish(imageUrl, aiProvider);
    if (!classification.dishName) {
      return { response: { text: formatUnidentifiedDish(classification) }, state: withContext(state, {}) };
    }

    const recipe = await generateRecipe({ dishName: classification.dishName, aiProvider });
    if (!recipe) {
      return { response: { text: ANALYSIS_FAILED }, state: withContext(state, {}) };
    }
    return { response: { text: formatRecipe(recipe) }, state: withContext(state, { lastRecipe: recipe }) };
  } catch {
    return { response: { text: ANALYSIS_FAILED }, state: withContext(state, {}) };
  }
}

async function handleDietaryAdjustment(
  text: string,
  baseRecipe: Recipe,
  aiProvider: AIProvider,
  state: ConversationState
): Promise<CookHandleMessageResult> {
  try {
    const recipe = await generateRecipe({
      dishName: baseRecipe.dishName,
      aiProvider,
      dietaryAdjustment: text,
      baseRecipe,
    });
    if (!recipe) {
      return { response: { text: ANALYSIS_FAILED }, state: withContext(state, { lastRecipe: baseRecipe }) };
    }
    return { response: { text: formatRecipe(recipe) }, state: withContext(state, { lastRecipe: recipe }) };
  } catch {
    return { response: { text: ANALYSIS_FAILED }, state: withContext(state, { lastRecipe: baseRecipe }) };
  }
}

/**
 * Cook's entry point — accepts image or text input. A photo always wins
 * (a fresh dish photo takes priority over any lingering dietary-adjustment
 * or awaiting-photo state); otherwise text is checked for a dietary
 * adjustment against the last recipe, then falls back to prompting for a
 * photo.
 */
export async function handleMessage(input: CookHandleMessageInput): Promise<CookHandleMessageResult> {
  const { message, aiProvider, state } = input;
  const context = (state.context ?? {}) as CookContext;
  const image = message.media?.find((m) => m.type === "image" && m.url);

  if (image?.url) {
    return handlePhoto(image.url, aiProvider, state);
  }

  const text = message.text ?? "";

  if (context.lastRecipe && isDietaryAdjustmentRequest(text)) {
    return handleDietaryAdjustment(text, context.lastRecipe, aiProvider, state);
  }

  if (!context.awaitingPhoto) {
    return { response: { text: PROMPT_FOR_PHOTO }, state: withContext(state, { awaitingPhoto: true }) };
  }

  return { response: { text: AWAITING_PHOTO_REMINDER }, state: withContext(state, { awaitingPhoto: true }) };
}
