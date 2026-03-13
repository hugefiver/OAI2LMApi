import * as assert from 'assert';
import {
	getModelMetadata,
	getModelMetadataFromPatterns,
	isLLMModel,
	mergeMetadata,
	supportsToolCalling,
	DEFAULT_MODEL_METADATA
} from '../../modelMetadata';
import { mergeMetadata as sharedMergeMetadata } from '@oai2lmapi/model-metadata';
import { modelsDevRegistry } from '../../modelsDevClient';

suite('ModelMetadata Unit Tests', () => {

	// Disable modelsDevRegistry so tests use only static pattern matching
	// (the extension activation in other test suites may have enabled it)
	let wasEnabled: boolean;
	suiteSetup(() => {
		wasEnabled = (modelsDevRegistry as any)._enabled;
		modelsDevRegistry.disable();
	});
	suiteTeardown(() => {
		if (wasEnabled) {
			modelsDevRegistry.enable();
		}
	});

	// ============== Basic Model Matching Tests ==============

	test('Should return metadata for GPT-4o', () => {
		const metadata = getModelMetadata('gpt-4o');
		assert.strictEqual(metadata.maxInputTokens, 128000);
		assert.strictEqual(metadata.maxOutputTokens, 16384);
		assert.strictEqual(metadata.supportsToolCalling, true);
		assert.strictEqual(metadata.supportsImageInput, true);
		assert.strictEqual(metadata.modelType, 'llm');
	});

	test('Should return metadata for GPT-4o-mini (sub-pattern)', () => {
		const metadata = getModelMetadata('gpt-4o-mini');
		assert.strictEqual(metadata.maxInputTokens, 128000);
		assert.strictEqual(metadata.supportsToolCalling, true);
		assert.strictEqual(metadata.modelType, 'llm');
	});

	test('Should return metadata for Claude 3.5 models', () => {
		const metadata = getModelMetadata('claude-3.5-sonnet');
		assert.strictEqual(metadata.maxInputTokens, 200000);
		assert.strictEqual(metadata.supportsToolCalling, true);
		assert.strictEqual(metadata.supportsImageInput, true);
		assert.strictEqual(metadata.modelType, 'llm');
	});

	test('Should return metadata for Claude 3.7 Sonnet', () => {
		const metadata = getModelMetadata('claude-3.7-sonnet');
		assert.strictEqual(metadata.maxInputTokens, 200000);
		assert.strictEqual(metadata.maxOutputTokens, 64000);
		assert.strictEqual(metadata.supportsToolCalling, true);
		assert.strictEqual(metadata.supportsImageInput, true);
		assert.strictEqual(metadata.modelType, 'llm');
	});

	// ============== Hierarchical Matching Tests ==============

	test('Should match Qwen3 family correctly', () => {
		// Base Qwen3 pattern
		const qwen3Base = getModelMetadata('qwen3-8b');
		assert.strictEqual(qwen3Base.maxInputTokens, 131072);
		assert.strictEqual(qwen3Base.supportsToolCalling, true);
		assert.strictEqual(qwen3Base.modelType, 'llm');

		// Qwen3-coder sub-pattern
		const qwen3Coder = getModelMetadata('qwen3-coder-480b');
		assert.strictEqual(qwen3Coder.maxInputTokens, 262144);
		assert.strictEqual(qwen3Coder.maxOutputTokens, 65536);
		assert.strictEqual(qwen3Coder.supportsToolCalling, true);

		// Qwen3-VL sub-pattern (vision)
		const qwen3VL = getModelMetadata('qwen3-vl-32b');
		assert.strictEqual(qwen3VL.supportsImageInput, true);
		assert.strictEqual(qwen3VL.supportsToolCalling, true);
	});

	test('Should match DeepSeek family correctly', () => {
		const deepseekV3 = getModelMetadata('deepseek-v3.2');
		assert.strictEqual(deepseekV3.maxInputTokens, 163840);
		assert.strictEqual(deepseekV3.maxOutputTokens, 65536);
		assert.strictEqual(deepseekV3.supportsToolCalling, true);

		const deepseekR1 = getModelMetadata('deepseek-r1-0528');
		assert.strictEqual(deepseekR1.maxInputTokens, 163840);
		assert.strictEqual(deepseekR1.supportsToolCalling, true);
	});

	test('Should match Mistral family correctly', () => {
		const mistralLarge = getModelMetadata('mistral-large');
		assert.strictEqual(mistralLarge.maxInputTokens, 262144);
		assert.strictEqual(mistralLarge.supportsToolCalling, true);

		const devstral = getModelMetadata('devstral-2512');
		assert.strictEqual(devstral.maxInputTokens, 262144);
		assert.strictEqual(devstral.supportsToolCalling, true);
	});

	// ============== Provider Prefix Matching Tests ==============

	test('Should match model IDs with provider prefix', () => {
		// OpenAI prefix
		const gpt4o = getModelMetadata('openai/gpt-4o');
		assert.strictEqual(gpt4o.maxInputTokens, 128000);
		assert.strictEqual(gpt4o.modelType, 'llm');

		// Anthropic prefix
		const claude = getModelMetadata('anthropic/claude-3.5-sonnet');
		assert.strictEqual(claude.maxInputTokens, 200000);
		assert.strictEqual(claude.modelType, 'llm');

		// Qwen prefix
		const qwen = getModelMetadata('qwen/qwen3-coder-480b');
		assert.strictEqual(qwen.maxInputTokens, 262144);
		assert.strictEqual(qwen.supportsToolCalling, true);

		// DeepSeek prefix
		const deepseek = getModelMetadata('deepseek/deepseek-v3.2');
		assert.strictEqual(deepseek.maxInputTokens, 163840);
	});

	// ============== Normalized ID Matching Tests ==============

	test('Should match normalized model IDs with common suffixes', () => {
		// Model ID with suffix
		const metadata1 = getModelMetadata('gpt-4o-latest');
		assert.strictEqual(metadata1.modelType, 'llm');

		// Model ID with :free suffix
		const metadata2 = getModelMetadata('qwen/qwen3-8b:free');
		assert.strictEqual(metadata2.modelType, 'llm');
		assert.strictEqual(metadata2.supportsToolCalling, true);

		// Model ID with -instruct suffix
		const metadata3 = getModelMetadata('qwen3-8b-instruct');
		assert.strictEqual(metadata3.modelType, 'llm');
	});

	// ============== Non-LLM Model Detection Tests ==============

	test('Should identify embedding models as non-LLM', () => {
		assert.strictEqual(isLLMModel('text-embedding-ada-002'), false);
		assert.strictEqual(isLLMModel('text-embedding-3-small'), false);
		assert.strictEqual(isLLMModel('embed-english-v3.0'), false);
	});

	test('Should identify rerank models as non-LLM', () => {
		assert.strictEqual(isLLMModel('rerank-english-v3.0'), false);
		assert.strictEqual(isLLMModel('rerank-multilingual-v3.0'), false);
	});

	test('Should identify image models as non-LLM', () => {
		assert.strictEqual(isLLMModel('dall-e-3'), false);
		assert.strictEqual(isLLMModel('stable-diffusion'), false);
	});

	test('Should identify audio models as non-LLM', () => {
		assert.strictEqual(isLLMModel('whisper-1'), false);
		assert.strictEqual(isLLMModel('tts-1'), false);
	});

	test('Should detect non-LLM models by pattern', () => {
		// Embedding patterns
		assert.strictEqual(isLLMModel('bge-large-en-v1.5'), false);
		assert.strictEqual(isLLMModel('nomic-embed-text'), false);
		assert.strictEqual(isLLMModel('jina-embeddings-v2'), false);

		// Rerank patterns
		assert.strictEqual(isLLMModel('jina-reranker-v2'), false);

		// Image patterns
		assert.strictEqual(isLLMModel('sdxl-turbo'), false);
		assert.strictEqual(isLLMModel('flux-1-pro'), false);
	});

	// ============== LLM Model Identification Tests ==============

	test('Should identify LLM models correctly', () => {
		assert.strictEqual(isLLMModel('gpt-4o'), true);
		assert.strictEqual(isLLMModel('gpt-5-mini'), true);
		assert.strictEqual(isLLMModel('claude-3-opus'), true);
		assert.strictEqual(isLLMModel('llama-4-maverick'), true);
		assert.strictEqual(isLLMModel('mistral-large'), true);
		assert.strictEqual(isLLMModel('qwen3-coder'), true);
		assert.strictEqual(isLLMModel('deepseek-v3.2'), true);
		assert.strictEqual(isLLMModel('gemini-2.5-pro'), true);
	});

	// ============== Tool Calling Support Tests ==============

	test('Should check tool calling support correctly', () => {
		assert.strictEqual(supportsToolCalling('gpt-4o'), true);
		assert.strictEqual(supportsToolCalling('claude-3.5-sonnet'), true);
		assert.strictEqual(supportsToolCalling('qwen3-coder-480b'), true);
		assert.strictEqual(supportsToolCalling('deepseek-v3.2'), true);
		assert.strictEqual(supportsToolCalling('gemini-2.5-flash'), true);
		assert.strictEqual(supportsToolCalling('llama-4-maverick'), true);
		assert.strictEqual(supportsToolCalling('grok-4'), true);
	});

	test('Should return false for models without tool calling', () => {
		// Models without tool calling
		assert.strictEqual(supportsToolCalling('deepseek-prover'), false);  // Prover doesn't support tools
		assert.strictEqual(supportsToolCalling('morph-v1'), false);  // Morph doesn't support tools
	});

	// ============== Vision/Image Input Tests ==============

	test('Should detect vision/image input support', () => {
		// Models with vision support
		const gpt4o = getModelMetadata('gpt-4o');
		assert.strictEqual(gpt4o.supportsImageInput, true);

		const claude = getModelMetadata('claude-3.5-sonnet');
		assert.strictEqual(claude.supportsImageInput, true);

		const qwen3VL = getModelMetadata('qwen3-vl-32b');
		assert.strictEqual(qwen3VL.supportsImageInput, true);

		const gemini = getModelMetadata('gemini-2.5-pro');
		assert.strictEqual(gemini.supportsImageInput, true);

		// Models without vision
		const qwen3Text = getModelMetadata('qwen3-coder-480b');
		assert.strictEqual(qwen3Text.supportsImageInput, false);

		const deepseek = getModelMetadata('deepseek-v3.2');
		assert.strictEqual(deepseek.supportsImageInput, false);
	});

	// ============== Default Metadata Tests ==============

	test('Should re-export mergeMetadata from shared package', () => {
		assert.strictEqual(mergeMetadata, sharedMergeMetadata);
		const patternMetadata = getModelMetadataFromPatterns('gpt-4o');
		const merged = mergeMetadata({ maxOutputTokens: 9999 }, patternMetadata);
		assert.strictEqual(merged.maxOutputTokens, 9999);
	});

	test('Should return default metadata for unknown models', () => {
		const metadata = getModelMetadata('unknown-model-xyz');
		assert.deepStrictEqual(metadata, DEFAULT_MODEL_METADATA);
	});

	test('Should use conservative defaults', () => {
		assert.strictEqual(DEFAULT_MODEL_METADATA.maxInputTokens, 8192);
		assert.strictEqual(DEFAULT_MODEL_METADATA.maxOutputTokens, 4096);
		assert.strictEqual(DEFAULT_MODEL_METADATA.supportsToolCalling, false);
		assert.strictEqual(DEFAULT_MODEL_METADATA.supportsImageInput, false);
		assert.strictEqual(DEFAULT_MODEL_METADATA.modelType, 'llm');
	});

	// ============== New Model Family Tests ==============

	test('Should match OpenAI o3/o4 reasoning models', () => {
		const o3Mini = getModelMetadata('o3-mini');
		assert.strictEqual(o3Mini.maxInputTokens, 200000);
		assert.strictEqual(o3Mini.supportsToolCalling, true);

		const o4Mini = getModelMetadata('o4-mini');
		assert.strictEqual(o4Mini.maxInputTokens, 200000);
		assert.strictEqual(o4Mini.supportsToolCalling, true);
	});

	test('Should match Gemini 2.5 family', () => {
		const geminiPro = getModelMetadata('gemini-2.5-pro');
		assert.strictEqual(geminiPro.maxInputTokens, 1048576);
		assert.strictEqual(geminiPro.supportsToolCalling, true);
		assert.strictEqual(geminiPro.supportsImageInput, true);

		const geminiFlash = getModelMetadata('gemini-2.5-flash');
		assert.strictEqual(geminiFlash.maxInputTokens, 1048576);
		assert.strictEqual(geminiFlash.supportsToolCalling, true);
	});

	test('Should match Grok family', () => {
		const grok4 = getModelMetadata('grok-4');
		assert.strictEqual(grok4.maxInputTokens, 256000);
		assert.strictEqual(grok4.supportsToolCalling, true);
		assert.strictEqual(grok4.supportsImageInput, true);

		const grok4Fast = getModelMetadata('grok-4-fast');
		assert.strictEqual(grok4Fast.maxInputTokens, 2000000);
		assert.strictEqual(grok4Fast.supportsToolCalling, true);
	});

	test('Should match Kimi/Moonshot models', () => {
		const kimiK2 = getModelMetadata('kimi-k2');
		assert.strictEqual(kimiK2.maxInputTokens, 262144);
		assert.strictEqual(kimiK2.maxOutputTokens, 262144);
		assert.strictEqual(kimiK2.supportsToolCalling, true);
	});

	test('Should match GLM models', () => {
		const glm46 = getModelMetadata('glm-4.6');
		assert.strictEqual(glm46.maxInputTokens, 204800);
		assert.strictEqual(glm46.supportsToolCalling, true);

		const glm46v = getModelMetadata('glm-4.6v');
		assert.strictEqual(glm46v.supportsImageInput, true);
	});
});
