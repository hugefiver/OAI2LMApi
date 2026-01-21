/**
 * Model discovery: fetch models from OpenAI-compatible /models endpoint
 */

/**
 * Partial metadata extracted from API response
 */
export interface PartialModelMetadata {
  maxInputTokens?: number;
  maxOutputTokens?: number;
  supportsToolCalling?: boolean;
  supportsImageInput?: boolean;
}

/**
 * Discovered model from API
 */
export interface DiscoveredModel {
  id: string;
  name?: string;
  object: string;
  created?: number;
  owned_by?: string;
  metadata?: PartialModelMetadata;
}

/**
 * Response from /models endpoint
 */
interface ModelsListResponse {
  object: string;
  data: Array<{
    id: string;
    object: string;
    created?: number;
    owned_by?: string;
    // Extended fields that some APIs return
    name?: string;
    context_length?: number;
    max_tokens?: number;
    max_input_tokens?: number;
    max_output_tokens?: number;
    function_call?: boolean;
    supports_function_calling?: boolean;
    supports_tools?: boolean;
    vision?: boolean;
    supports_vision?: boolean;
    modalities?: string[];
  }>;
}

/**
 * Fetch models from the OpenAI-compatible /models endpoint
 */
export async function discoverModels(
  baseURL: string,
  apiKey: string,
  headers?: Record<string, string>,
): Promise<DiscoveredModel[]> {
  const url = `${baseURL}/models`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...headers,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch models from ${url}: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as ModelsListResponse;
  const models = data.data || [];

  // Convert and enrich models
  return models.map((model) => ({
    id: model.id,
    name: model.name,
    object: model.object,
    created: model.created,
    owned_by: model.owned_by,
    metadata: extractMetadataFromModel(model),
  }));
}

/**
 * Extract metadata from model object returned by API
 */
function extractMetadataFromModel(
  model: ModelsListResponse["data"][0],
): PartialModelMetadata {
  const metadata: PartialModelMetadata = {};

  // Try to extract context/token limits from various API response formats
  // OpenAI format
  if (model.context_length) {
    metadata.maxInputTokens = model.context_length;
  }
  if (model.max_tokens) {
    metadata.maxOutputTokens = model.max_tokens;
  }

  // Anthropic/OpenRouter format
  if (model.max_input_tokens) {
    metadata.maxInputTokens = model.max_input_tokens;
  }
  if (model.max_output_tokens) {
    metadata.maxOutputTokens = model.max_output_tokens;
  }

  // Function calling support
  if (typeof model.function_call === "boolean") {
    metadata.supportsToolCalling = model.function_call;
  } else if (typeof model.supports_function_calling === "boolean") {
    metadata.supportsToolCalling = model.supports_function_calling;
  } else if (typeof model.supports_tools === "boolean") {
    metadata.supportsToolCalling = model.supports_tools;
  }

  // Vision support
  if (typeof model.vision === "boolean") {
    metadata.supportsImageInput = model.vision;
  } else if (typeof model.supports_vision === "boolean") {
    metadata.supportsImageInput = model.supports_vision;
  } else if (model.modalities?.includes("vision")) {
    metadata.supportsImageInput = true;
  } else if (model.modalities?.includes("image")) {
    metadata.supportsImageInput = true;
  }

  return metadata;
}
