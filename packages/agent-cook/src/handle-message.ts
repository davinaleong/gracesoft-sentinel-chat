import type { AIProvider, ConversationState, NormalizedMessage, NormalizedResponse } from "@gracesoft-sentinel/core";
import { classifyDish } from "./dish-classifier.js";
import { isDietaryAdjustmentRequest } from "./dietary-adjustment.js";
import { formatGroceryList, formatRecipe, formatUnidentifiedDish } from "./formatter.js";
import { generateGroceryList, isGroceryListRequest } from "./grocery-list.js";
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
  /** Recipes from this session, most recent last — the source material for a grocery list / meal plan. */
  recentRecipes?: Recipe[];
  [key: string]: unknown;
}

const MAX_RECENT_RECIPES = 7; // a week's worth

const PROMPT_FOR_PHOTO =
  "Cook is ready! Send me a photo of any dish and I'll give you the dish name, " +
  "a full recipe with ingredients and steps, and nutritional info per serving.";

const AWAITING_PHOTO_REMINDER = "I'm waiting for a dish photo! Please send a food photo for me to analyse.";

const ANALYSIS_FAILED = "Sorry, I couldn't analyse that photo right now. Please try again in a moment.";

const VOICE_NOTE_FAILED = "Sorry, I couldn't process that voice note. Please try typing instead, or send a dish photo.";

const GROCERY_LIST_FAILED = "Sorry, I couldn't put that grocery list together right now. Please try again in a moment.";

function withContext(state: ConversationState, context: CookContext): ConversationState {
  return { ...state, context, updatedAt: new Date().toISOString() };
}

function appendRecentRecipe(recentRecipes: Recipe[] | undefined, recipe: Recipe): Recipe[] {
  return [...(recentRecipes ?? []), recipe].slice(-MAX_RECENT_RECIPES);
}

/** A dietary-adjustment replaces the last entry (same dish, adjusted) rather than adding a second one. */
function replaceLastRecentRecipe(recentRecipes: Recipe[] | undefined, recipe: Recipe): Recipe[] {
  const withoutLast = recentRecipes && recentRecipes.length > 0 ? recentRecipes.slice(0, -1) : [];
  return [...withoutLast, recipe].slice(-MAX_RECENT_RECIPES);
}

/**
 * A voice note has no `text`, only `media` with an audio item — transcribed
 * here so a spoken dietary adjustment ("can you make it vegetarian?") flows
 * through the exact same text pipeline as a typed one. A photo always takes
 * priority over a voice note if a message somehow carried both.
 */
async function resolveVoiceNoteText(message: NormalizedMessage, aiProvider: AIProvider): Promise<string> {
  if (message.text) return message.text;
  const audio = message.media?.find((m) => m.type === "audio" && m.url);
  if (!audio?.url) return "";
  const transcription = await aiProvider.transcribeAudio({ audio: { url: audio.url } });
  return transcription.text;
}

async function handlePhoto(
  imageUrl: string,
  aiProvider: AIProvider,
  context: CookContext,
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
    return {
      response: { text: formatRecipe(recipe) },
      state: withContext(state, { lastRecipe: recipe, recentRecipes: appendRecentRecipe(context.recentRecipes, recipe) }),
    };
  } catch {
    return { response: { text: ANALYSIS_FAILED }, state: withContext(state, {}) };
  }
}

async function handleDietaryAdjustment(
  text: string,
  baseRecipe: Recipe,
  aiProvider: AIProvider,
  context: CookContext,
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
    return {
      response: { text: formatRecipe(recipe) },
      state: withContext(state, { lastRecipe: recipe, recentRecipes: replaceLastRecentRecipe(context.recentRecipes, recipe) }),
    };
  } catch {
    return { response: { text: ANALYSIS_FAILED }, state: withContext(state, { lastRecipe: baseRecipe }) };
  }
}

async function handleGroceryListRequest(
  recentRecipes: Recipe[],
  aiProvider: AIProvider,
  context: CookContext,
  state: ConversationState
): Promise<CookHandleMessageResult> {
  try {
    const items = await generateGroceryList(recentRecipes, aiProvider);
    if (!items) {
      return { response: { text: GROCERY_LIST_FAILED }, state: withContext(state, context) };
    }
    const dishNames = recentRecipes.map((r) => r.dishName);
    return { response: { text: formatGroceryList(items, dishNames) }, state: withContext(state, context) };
  } catch {
    return { response: { text: GROCERY_LIST_FAILED }, state: withContext(state, context) };
  }
}

/**
 * Cook's entry point — accepts image or text input. A photo always wins
 * (a fresh dish photo takes priority over any lingering dietary-adjustment
 * or awaiting-photo state); otherwise text is checked for a dietary
 * adjustment against the last recipe, then a grocery-list/meal-plan
 * request against this session's recent recipes, then falls back to
 * prompting for a photo.
 */
export async function handleMessage(input: CookHandleMessageInput): Promise<CookHandleMessageResult> {
  const { message, aiProvider, state } = input;
  const context = (state.context ?? {}) as CookContext;
  const image = message.media?.find((m) => m.type === "image" && m.url);

  if (image?.url) {
    return handlePhoto(image.url, aiProvider, context, state);
  }

  let text: string;
  try {
    text = await resolveVoiceNoteText(message, aiProvider);
  } catch (err) {
    console.error("[agent-cook] transcribeAudio failed:", err);
    return { response: { text: VOICE_NOTE_FAILED }, state };
  }

  if (context.lastRecipe && isDietaryAdjustmentRequest(text)) {
    return handleDietaryAdjustment(text, context.lastRecipe, aiProvider, context, state);
  }

  if (context.recentRecipes && context.recentRecipes.length > 0 && isGroceryListRequest(text)) {
    return handleGroceryListRequest(context.recentRecipes, aiProvider, context, state);
  }

  if (!context.awaitingPhoto) {
    return { response: { text: PROMPT_FOR_PHOTO }, state: withContext(state, { awaitingPhoto: true }) };
  }

  return { response: { text: AWAITING_PHOTO_REMINDER }, state: withContext(state, { awaitingPhoto: true }) };
}
