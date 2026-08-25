import type { AIProvider, ConversationState, NormalizedMessage, NormalizedResponse, RecipeSourceProvider } from "@gracesoft-sentinel/core";
import { classifyDish } from "./dish-classifier.js";
import { isDietaryAdjustmentRequest } from "./dietary-adjustment.js";
import { formatGroceryList, formatPersonalRecipe, formatRecipe, formatRecipeList, formatUnidentifiedDish } from "./formatter.js";
import { generateGroceryList, isGroceryListRequest } from "./grocery-list.js";
import { findPersonalRecipe, isPersonalRecipeRequest } from "./personal-recipe.js";
import { generateRecipe, type Recipe } from "./recipe-generator.js";
import { isRecipeListRequest } from "./recipe-list.js";
import { extractRecipeSearchDishName } from "./recipe-search.js";

export interface CookHandleMessageInput {
  message: NormalizedMessage;
  state: ConversationState;
  aiProvider: AIProvider;
  /**
   * Opt-in "Mother's Day Edition" (Milestone 11) capability: retrieves a
   * personal recipe (e.g. from a Google Drive folder via
   * `provider-drive-google`) instead of generating one from scratch.
   * Deployments that don't configure one simply never take this path.
   */
  recipeSourceProvider?: RecipeSourceProvider;
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

const PERSONAL_RECIPE_NOT_FOUND =
  "I couldn't find a matching recipe in your saved recipes. Try describing it differently, or send me a dish photo instead.";

const PERSONAL_RECIPE_LOOKUP_FAILED = "Sorry, I couldn't search your saved recipes right now. Please try again in a moment.";

const RECIPE_LIST_FAILED = "Sorry, I couldn't list your saved recipes right now. Please try again in a moment.";

const RECIPE_SEARCH_FAILED = "Sorry, I couldn't come up with a recipe for that right now. Please try again in a moment.";

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

/** "Mother's Day Edition" (Milestone 11) — RAG lookup against a personal recipe source, not AI generation. */
async function handlePersonalRecipeRequest(
  text: string,
  recipeSourceProvider: RecipeSourceProvider,
  state: ConversationState
): Promise<CookHandleMessageResult> {
  try {
    const match = await findPersonalRecipe(text, recipeSourceProvider);
    if (!match) {
      return { response: { text: PERSONAL_RECIPE_NOT_FOUND }, state: withContext(state, {}) };
    }
    return { response: { text: formatPersonalRecipe(match) }, state: withContext(state, {}) };
  } catch {
    return { response: { text: PERSONAL_RECIPE_LOOKUP_FAILED }, state: withContext(state, {}) };
  }
}

/** "How many recipes do I have"/"list my recipes" — enumeration, not a similarity search against one query. */
async function handleRecipeListRequest(recipeSourceProvider: RecipeSourceProvider, state: ConversationState): Promise<CookHandleMessageResult> {
  try {
    const recipes = await recipeSourceProvider.listRecipes!();
    return { response: { text: formatRecipeList(recipes.map((r) => r.title)) }, state: withContext(state, {}) };
  } catch {
    return { response: { text: RECIPE_LIST_FAILED }, state: withContext(state, {}) };
  }
}

/**
 * "Free" recipe search — no personal source involved, no possessive word
 * in the request ("recipe for chicken noodle soup", not "my recipe for..."):
 * generates a generic, home-style recipe from scratch for the named dish,
 * the same way `handlePhoto` does from a classified dish name, just
 * skipping the photo/classification step entirely.
 */
async function handleRecipeSearchRequest(
  dishName: string,
  aiProvider: AIProvider,
  context: CookContext,
  state: ConversationState
): Promise<CookHandleMessageResult> {
  try {
    const recipe = await generateRecipe({ dishName, aiProvider, homeStyle: true });
    if (!recipe) {
      return { response: { text: RECIPE_SEARCH_FAILED }, state: withContext(state, {}) };
    }
    return {
      response: { text: formatRecipe(recipe) },
      state: withContext(state, { lastRecipe: recipe, recentRecipes: appendRecentRecipe(context.recentRecipes, recipe) }),
    };
  } catch {
    return { response: { text: RECIPE_SEARCH_FAILED }, state: withContext(state, {}) };
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
 * adjustment against the last recipe, then a recipe-list/count request,
 * then a specific personal-recipe request (possessive phrasing, e.g. "my
 * mom's recipe for..."), then a free recipe search by dish name (no
 * possessive, e.g. "recipe for chicken noodle soup" — generates a generic
 * home-style recipe from scratch, no personal source or photo involved),
 * then a grocery-list/meal-plan request against this session's recent
 * recipes, then falls back to prompting for a photo.
 */
export async function handleMessage(input: CookHandleMessageInput): Promise<CookHandleMessageResult> {
  const { message, aiProvider, state, recipeSourceProvider } = input;
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

  if (recipeSourceProvider?.listRecipes && isRecipeListRequest(text)) {
    return handleRecipeListRequest(recipeSourceProvider, state);
  }

  if (recipeSourceProvider && isPersonalRecipeRequest(text)) {
    return handlePersonalRecipeRequest(text, recipeSourceProvider, state);
  }

  const searchDishName = extractRecipeSearchDishName(text);
  if (searchDishName) {
    return handleRecipeSearchRequest(searchDishName, aiProvider, context, state);
  }

  if (context.recentRecipes && context.recentRecipes.length > 0 && isGroceryListRequest(text)) {
    return handleGroceryListRequest(context.recentRecipes, aiProvider, context, state);
  }

  if (!context.awaitingPhoto) {
    return { response: { text: PROMPT_FOR_PHOTO }, state: withContext(state, { awaitingPhoto: true }) };
  }

  return { response: { text: AWAITING_PHOTO_REMINDER }, state: withContext(state, { awaitingPhoto: true }) };
}
