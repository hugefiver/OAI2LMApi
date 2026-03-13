/**
 * Models.dev API client for runtime model metadata resolution.
 *
 * Fetches and caches model information from https://models.dev/api.json
 * to provide more accurate metadata than static pattern matching alone.
 *
 * This module acts as a library component with an enable/disable toggle.
 * It is disabled by default and must be explicitly enabled before use.
 *
 * Usage:
 *   modelsDevRegistry.enable();
 *   await modelsDevRegistry.initialize(storage);
 *   const metadata = modelsDevRegistry.resolve('gpt-4o', 'GPT-4o');
 */

import * as https from 'https';
import type { ModelMetadata } from '@oai2lmapi/model-metadata';
import { logger } from './logger';

// --- Constants ---

const MODELS_DEV_API_URL = 'https://models.dev/api.json';
const CACHE_KEY = 'oai2lmapi.modelsDevCache';
const KNOWN_MODELS_KEY = 'oai2lmapi.modelsDevKnownModels';

/** Cache TTL: 7 days in milliseconds. */
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// --- Types ---

/** Slim model info extracted from models.dev API response. */
interface ModelsDevModel {
    id: string;
    name: string;
    family?: string;
    tool_call?: boolean;
    inputModalities?: string[];
    contextLimit?: number;
    outputLimit?: number;
}

/** Provider entry with its models. */
interface ModelsDevProvider {
    id: string;
    models: Record<string, ModelsDevModel>;
}

/** Full processed data structure. */
type ModelsDevData = Record<string, ModelsDevProvider>;

/** Cache envelope with timestamp. */
interface ModelsDevCacheEnvelope {
    data: ModelsDevData;
    fetchedAt: number;
}

/** Processing stats for raw models.dev payload. */
interface ModelsDevProcessingStats {
    rawProviderCount: number;
    processedProviderCount: number;
    skippedProviderCount: number;
    rawModelCount: number;
    processedModelCount: number;
    skippedModelCount: number;
}

/** Abstract storage interface (matches vscode.Memento). */
export interface ModelsDevStorage {
    get<T>(key: string): T | undefined;
    update(key: string, value: unknown): Thenable<void>;
}

// --- Normalization ---

/**
 * Normalize a string for fuzzy matching.
 * Case-insensitive, strips common model-ID separators (- . _).
 */
function normalizeForMatching(s: string): string {
    return s.toLowerCase().replace(/[-._]/g, '');
}

/**
 * Parse a model ID that may have a provider prefix.
 * "openai/gpt-4o" → { provider: "openai", modelName: "gpt-4o" }
 * "gpt-4o"        → { provider: undefined, modelName: "gpt-4o" }
 */
function parseModelId(modelId: string): { provider: string | undefined; modelName: string } {
    const slashIndex = modelId.indexOf('/');
    if (slashIndex > 0 && slashIndex < modelId.length - 1) {
        return {
            provider: modelId.substring(0, slashIndex).toLowerCase(),
            modelName: modelId.substring(slashIndex + 1)
        };
    }
    return { provider: undefined, modelName: modelId };
}

/** Safely stringify values for output-channel logs. */
function toLogJson(value: unknown): string {
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

// --- Provider Priority ---

/**
 * Maps model-family keyword prefixes to their official provider IDs in models.dev.
 * Longer prefixes are checked first to avoid false matches (e.g. "gpt-4o" before "gpt").
 *
 * Sorted by descending length at module load time.
 */
const FAMILY_PROVIDER_ENTRIES: [string, string[]][] = Object.entries<string[]>({
    'chatgpt': ['openai'],
    'codex': ['openai'],
    'gpt': ['openai'],
    'o1': ['openai'],
    'o3': ['openai'],
    'o4': ['openai'],

    'claude': ['anthropic'],

    'gemini': ['google', 'google-vertex'],
    'gemma': ['google', 'google-vertex'],

    'qwen': ['alibaba'],
    'qwq': ['alibaba'],
    'qvq': ['alibaba'],

    'kimi': ['moonshotai'],
    'deepseek': ['deepseek'],

    'llama': ['llama', 'togetherai'],

    'mistral': ['mistral'],
    'mixtral': ['mistral'],
    'codestral': ['mistral'],
    'pixtral': ['mistral'],
    'devstral': ['mistral'],
    'magistral': ['mistral'],
    'ministral': ['mistral'],

    'grok': ['xai'],
    'nova': ['amazon-bedrock'],
    'command': ['cohere'],

    'glm': ['zhipuai', 'zai'],

    'phi': ['nvidia'],
    'nemotron': ['nvidia'],

    'seed': ['openrouter'],
    'doubao': ['openrouter'],

    'minimax': ['minimax'],
    'step': ['stepfun'],
    'mimo': ['xiaomi'],
}).sort((a, b) => b[0].length - a[0].length);

/**
 * Determine official provider IDs for a model name based on family keyword prefix.
 */
function getOfficialProviders(modelName: string): string[] {
    const lower = modelName.toLowerCase();
    for (const [family, providers] of FAMILY_PROVIDER_ENTRIES) {
        if (lower.startsWith(family)) {
            return providers;
        }
    }
    return [];
}

// --- Fetch Helper ---

function fetchJson<T>(url: string, depth = 0): Promise<T> {
    if (depth > 3) {
        return Promise.reject(new Error('Too many redirects'));
    }
    return new Promise((resolve, reject) => {
        const req = https.get(url, { timeout: 30000 }, (res) => {
            // Handle redirects
            if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
                res.resume();
                fetchJson<T>(res.headers.location, depth + 1).then(resolve, reject);
                return;
            }

            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }

            const chunks: Buffer[] = [];
            res.on('data', (chunk: Buffer) => chunks.push(chunk));
            res.on('end', () => {
                try {
                    const text = Buffer.concat(chunks).toString('utf-8');
                    resolve(JSON.parse(text) as T);
                } catch (e) {
                    reject(e);
                }
            });
            res.on('error', reject);
        });
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

// --- Registry ---

export class ModelsDevRegistry {
    private _enabled = false;
    private data: ModelsDevData | null = null;
    private knownModelIds: Set<string> = new Set();
    private storage: ModelsDevStorage | null = null;
    private fetching: Promise<void> | null = null;

    /** Debounce timer for batching onModelsLoaded calls across channels. */
    private batchTimer: ReturnType<typeof setTimeout> | null = null;
    /** Buffer collecting model IDs from multiple channels before processing. */
    private pendingModelIds: string[] = [];
    /** Debounce window (ms) for batching onModelsLoaded calls. */
    private static readonly batchDebounceMs = 200;

    /** Whether the registry is enabled. */
    get enabled(): boolean {
        return this._enabled;
    }

    /** Enable the registry. Must be called before initialize(). */
    enable(): void {
        this._enabled = true;
    }

    /** Disable the registry. resolve() returns undefined when disabled. */
    disable(): void {
        this._enabled = false;
    }

    /**
     * Initialize the registry: load cached data (7-day TTL).
     * Only fetches from API if cache is missing or expired.
     */
    async initialize(storage: ModelsDevStorage): Promise<void> {
        this.storage = storage;
        if (!this._enabled) {
            return;
        }

        // Load known model IDs
        const knownIds = storage.get<string[]>(KNOWN_MODELS_KEY);
        if (knownIds) {
            this.knownModelIds = new Set(knownIds);
        }

        // Load cached data and check TTL
        const cached = storage.get<ModelsDevCacheEnvelope>(CACHE_KEY);
        if (cached?.data) {
            const age = Date.now() - cached.fetchedAt;
            this.data = cached.data;
            const providerCount = Object.keys(cached.data).length;

            if (age < CACHE_TTL_MS) {
                const daysLeft = Math.ceil((CACHE_TTL_MS - age) / (24 * 60 * 60 * 1000));
                logger.info(
                    `Loaded models.dev cache (${providerCount} providers, fetched ${new Date(cached.fetchedAt).toISOString()}, expires in ~${daysLeft}d)`,
                    'ModelsDev'
                );
                return; // Cache is still valid
            }

            // Cache expired — use stale data but refresh in background
            logger.info(
                `models.dev cache expired (${providerCount} providers, fetched ${new Date(cached.fetchedAt).toISOString()}), refreshing in background...`,
                'ModelsDev'
            );
            this.fetchInBackground();
        } else {
            // No cache — fetch synchronously so data is ready for first model load
            logger.info('No models.dev cache found, fetching...', 'ModelsDev');
            await this.fetchAndCache();
        }
    }

    /**
     * Notify the registry that providers have loaded model IDs.
     *
     * Model IDs are buffered and processed after a short debounce window
     * so that multiple channels (OpenAI, Gemini, Claude) share a single
     * models.dev fetch instead of each triggering independent requests.
     */
    onModelsLoaded(modelIds: string[]): void {
        if (!this._enabled || !this.storage) {
            return;
        }

        // Buffer incoming IDs
        this.pendingModelIds.push(...modelIds);

        // Reset debounce timer
        if (this.batchTimer !== null) {
            clearTimeout(this.batchTimer);
        }

        this.batchTimer = setTimeout(() => {
            this.batchTimer = null;
            void this.processPendingModels();
        }, ModelsDevRegistry.batchDebounceMs);
    }

    /**
     * Process the buffered model IDs after the debounce window closes.
     * Triggers a single re-fetch if any previously unseen models are detected.
     */
    private async processPendingModels(): Promise<void> {
        if (!this.storage) {
            return;
        }

        // Drain the buffer
        const buffered = this.pendingModelIds;
        this.pendingModelIds = [];

        const newModels: string[] = [];
        for (const id of buffered) {
            if (!this.knownModelIds.has(id)) {
                newModels.push(id);
                this.knownModelIds.add(id);
            }
        }

        if (newModels.length > 0) {
            logger.info(
                `Detected ${newModels.length} new model(s): [${newModels.slice(0, 5).join(', ')}${newModels.length > 5 ? ', ...' : ''}], scheduling models.dev re-fetch`,
                'ModelsDev'
            );
            await this.storage.update(KNOWN_MODELS_KEY, [...this.knownModelIds]);
            this.fetchInBackground();
        }
    }

    /**
     * Force refresh: fetches latest data from models.dev API,
     * updates the cache, and resets known model tracking.
     * Intended for user-triggered manual refresh.
     */
    async refresh(): Promise<void> {
        if (!this._enabled || !this.storage) {
            logger.warn('Cannot refresh: registry not enabled or storage not set', 'ModelsDev');
            return;
        }

        logger.info('Manual refresh triggered, fetching latest models.dev data...', 'ModelsDev');

        // Clear known models so new data is fully ingested
        this.knownModelIds.clear();
        await this.storage.update(KNOWN_MODELS_KEY, []);

        await this.fetchAndCache();
    }

    /**
     * Resolve model metadata from models.dev data.
     *
     * Matching rules:
     *   - ID matches ID, Name matches Name (no cross-matching)
     *   - Priority: ID matching first, then Name matching
     *   - Provider search order: explicit > official family provider > openrouter
     *   - Normalization: case-insensitive, strips -._ separators
     *
     * @param modelId     Model ID (may include provider prefix "openai/gpt-4o")
     * @param displayName Optional display name for name-based matching
     * @returns ModelMetadata if found, undefined for caller to fall back to static patterns
     */
    resolve(modelId: string, displayName?: string): ModelMetadata | undefined {
        if (!this._enabled || !this.data) {
            return undefined;
        }

        const { provider: explicitProvider, modelName } = parseModelId(modelId);
        const officialProviders = getOfficialProviders(modelName);

        // Build deduplicated provider search order
        const searchProviders: string[] = [];
        if (explicitProvider) {
            searchProviders.push(explicitProvider);
        }
        for (const p of officialProviders) {
            if (!searchProviders.includes(p)) {
                searchProviders.push(p);
            }
        }
        if (!searchProviders.includes('openrouter')) {
            searchProviders.push('openrouter');
        }

        const providerPath = searchProviders.join(' -> ');

        // Phase 1: ID → ID matching across providers in priority order
        for (const provId of searchProviders) {
            const result = this.matchIdInProvider(provId, modelName);
            if (result) {
                const metadata = this.toMetadata(result);
                logger.info(
                    `Resolved "${modelId}" via ID@${provId} [${providerPath}] => ${toLogJson(metadata)}`,
                    'ModelsDev'
                );
                return metadata;
            }
        }

        // Phase 2: Name → Name matching across providers in priority order
        if (displayName) {
            for (const provId of searchProviders) {
                const result = this.matchNameInProvider(provId, displayName);
                if (result) {
                    const metadata = this.toMetadata(result);
                    logger.info(
                        `Resolved "${modelId}" via Name@${provId} [${providerPath}] => ${toLogJson(metadata)}`,
                        'ModelsDev'
                    );
                    return metadata;
                }
            }
        }

        logger.info(
            `No match for "${modelId}" in [${providerPath}]`,
            'ModelsDev'
        );

        return undefined;
    }

    // --- Search Helpers ---

    /**
     * Match by ID within a specific provider.
     * Pass 1: exact case-insensitive.  Pass 2: normalized (strip separators).
     */
    private matchIdInProvider(providerId: string, modelName: string): ModelsDevModel | undefined {
        const providerData = this.data?.[providerId];
        if (!providerData?.models) { return undefined; }

        const lowerInput = modelName.toLowerCase();
        const normalizedInput = normalizeForMatching(modelName);

        // Pass 1 — exact (case-insensitive)
        for (const model of Object.values(providerData.models)) {
            if (model.id.toLowerCase() === lowerInput) {
                return model;
            }
        }

        // Pass 2 — normalized
        for (const model of Object.values(providerData.models)) {
            if (normalizeForMatching(model.id) === normalizedInput) {
                return model;
            }
        }

        return undefined;
    }

    /**
     * Match by display name within a specific provider.
     * Pass 1: exact case-insensitive.  Pass 2: normalized (strip separators).
     */
    private matchNameInProvider(providerId: string, displayName: string): ModelsDevModel | undefined {
        const providerData = this.data?.[providerId];
        if (!providerData?.models) { return undefined; }

        const lowerInput = displayName.toLowerCase();
        const normalizedInput = normalizeForMatching(displayName);

        // Pass 1 — exact (case-insensitive)
        for (const model of Object.values(providerData.models)) {
            if (model.name && model.name.toLowerCase() === lowerInput) {
                return model;
            }
        }

        // Pass 2 — normalized
        for (const model of Object.values(providerData.models)) {
            if (model.name && normalizeForMatching(model.name) === normalizedInput) {
                return model;
            }
        }

        return undefined;
    }

    // --- Conversion ---

    /** Convert models.dev model info to ModelMetadata. */
    private toMetadata(model: ModelsDevModel): ModelMetadata {
        return {
            maxInputTokens: model.contextLimit ?? 8192,
            maxOutputTokens: model.outputLimit ?? 4096,
            supportsToolCalling: model.tool_call ?? false,
            supportsImageInput: (model.inputModalities ?? []).includes('image'),
            modelType: 'llm'
        };
    }

    // --- Fetching ---

    /** Start a background fetch (non-blocking, deduped). */
    private fetchInBackground(): void {
        if (this.fetching) { return; }
        this.fetching = this.fetchAndCache().finally(() => {
            this.fetching = null;
        });
    }

    /** Fetch models.dev API, process into slim format, and persist to cache. */
    private async fetchAndCache(): Promise<void> {
        if (!this.storage) { return; }

        try {
            logger.info('Fetching models.dev API data...', 'ModelsDev');

            const rawData = await fetchJson<Record<string, any>>(MODELS_DEV_API_URL);
            const rawProviderCount = Object.keys(rawData).length;
            logger.info(
                `Fetched models.dev payload with ${rawProviderCount} provider entries, processing...`,
                'ModelsDev'
            );

            const { data: slimData, stats } = this.processRawData(rawData);
            this.data = slimData;

            logger.info(
                `Processed models.dev payload: providers ${stats.processedProviderCount}/${stats.rawProviderCount}, models ${stats.processedModelCount}/${stats.rawModelCount}`,
                'ModelsDev'
            );
            if (stats.skippedProviderCount > 0 || stats.skippedModelCount > 0) {
                logger.info(
                    `Filtered invalid entries: ${stats.skippedProviderCount} provider(s), ${stats.skippedModelCount} model record(s)`,
                    'ModelsDev'
                );
            }
            if (stats.processedModelCount === 0) {
                logger.warn(
                    'Processed models.dev payload contains 0 models; runtime metadata resolution may be unavailable',
                    'ModelsDev'
                );
            }

            const providerCount = Object.keys(slimData).length;
            let modelCount = 0;
            for (const p of Object.values(slimData)) {
                modelCount += Object.keys(p.models).length;
            }

            const envelope: ModelsDevCacheEnvelope = {
                data: slimData,
                fetchedAt: Date.now()
            };
            await this.storage.update(CACHE_KEY, envelope);

            logger.info(
                `Cached models.dev data: ${providerCount} providers, ${modelCount} models`,
                'ModelsDev'
            );
        } catch (error) {
            if (this.data) {
                logger.warn(
                    'Failed to fetch models.dev data; continuing with stale cached data',
                    'ModelsDev'
                );
                logger.error('Fetch error details', error, 'ModelsDev');
            } else {
                logger.error('Failed to fetch models.dev data (no cached fallback available)', error, 'ModelsDev');
            }
        }
    }

    /**
     * Process raw API response into slim cached format.
     * Only retains fields needed for metadata resolution.
     */
    private processRawData(raw: Record<string, any>): {
        data: ModelsDevData;
        stats: ModelsDevProcessingStats;
    } {
        const result: ModelsDevData = {};
        const stats: ModelsDevProcessingStats = {
            rawProviderCount: Object.keys(raw).length,
            processedProviderCount: 0,
            skippedProviderCount: 0,
            rawModelCount: 0,
            processedModelCount: 0,
            skippedModelCount: 0,
        };

        for (const [providerId, providerRaw] of Object.entries(raw)) {
            if (!providerRaw || typeof providerRaw !== 'object' || !providerRaw.models) {
                stats.skippedProviderCount++;
                continue;
            }

            const providerModels = providerRaw.models as Record<string, any>;
            stats.rawModelCount += Object.keys(providerModels).length;

            const models: Record<string, ModelsDevModel> = {};
            for (const [modelId, modelRaw] of Object.entries(providerModels)) {
                if (!modelRaw || typeof modelRaw !== 'object') {
                    stats.skippedModelCount++;
                    continue;
                }

                models[modelId] = {
                    id: modelRaw.id ?? modelId,
                    name: modelRaw.name ?? '',
                    family: modelRaw.family,
                    tool_call: modelRaw.tool_call,
                    inputModalities: modelRaw.modalities?.input,
                    contextLimit: modelRaw.limit?.context,
                    outputLimit: modelRaw.limit?.output,
                };
                stats.processedModelCount++;
            }

            result[providerId] = {
                id: providerRaw.id ?? providerId,
                models
            };
            stats.processedProviderCount++;
        }

        return { data: result, stats };
    }
}

/** Singleton registry instance. */
export const modelsDevRegistry = new ModelsDevRegistry();
