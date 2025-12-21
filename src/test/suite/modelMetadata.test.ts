import * as assert from 'assert';
import { getModelMetadata, isLLMModel, supportsToolCalling, DEFAULT_MODEL_METADATA } from '../../modelMetadata';

suite('ModelMetadata Unit Tests', () => {

	test('Should return metadata for known model', () => {
		const metadata = getModelMetadata('gpt-4');
		assert.strictEqual(metadata.maxInputTokens, 8192);
		assert.strictEqual(metadata.supportsToolCalling, true);
		assert.strictEqual(metadata.modelType, 'llm');
	});

	test('Should return metadata for GPT-4o', () => {
		const metadata = getModelMetadata('gpt-4o');
		assert.strictEqual(metadata.maxInputTokens, 128000);
		assert.strictEqual(metadata.maxOutputTokens, 16384);
		assert.strictEqual(metadata.supportsToolCalling, true);
		assert.strictEqual(metadata.supportsImageInput, true);
		assert.strictEqual(metadata.modelType, 'llm');
	});

	test('Should return metadata for Claude models', () => {
		const metadata = getModelMetadata('claude-3.5-sonnet');
		assert.strictEqual(metadata.maxInputTokens, 200000);
		assert.strictEqual(metadata.supportsToolCalling, true);
		assert.strictEqual(metadata.supportsImageInput, true);
		assert.strictEqual(metadata.modelType, 'llm');
	});

	test('Should match normalized model IDs', () => {
		// Model ID with provider prefix
		const metadata1 = getModelMetadata('openai/gpt-4o');
		assert.strictEqual(metadata1.modelType, 'llm');
		
		// Model ID with suffix
		const metadata2 = getModelMetadata('gpt-4o-latest');
		assert.strictEqual(metadata2.modelType, 'llm');
	});

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
		assert.strictEqual(isLLMModel('flux-1.1-pro'), false);
	});

	test('Should identify LLM models correctly', () => {
		assert.strictEqual(isLLMModel('gpt-4'), true);
		assert.strictEqual(isLLMModel('gpt-4o'), true);
		assert.strictEqual(isLLMModel('claude-3-opus'), true);
		assert.strictEqual(isLLMModel('llama-3.1-70b'), true);
		assert.strictEqual(isLLMModel('mistral-large'), true);
		assert.strictEqual(isLLMModel('qwen-2.5-72b'), true);
		assert.strictEqual(isLLMModel('deepseek-v3'), true);
	});

	test('Should check tool calling support correctly', () => {
		assert.strictEqual(supportsToolCalling('gpt-4o'), true);
		assert.strictEqual(supportsToolCalling('claude-3.5-sonnet'), true);
		assert.strictEqual(supportsToolCalling('llama-3.1-70b'), true);
		
		// Models without tool calling
		assert.strictEqual(supportsToolCalling('o1-preview'), false);
		assert.strictEqual(supportsToolCalling('claude-2'), false);
		assert.strictEqual(supportsToolCalling('llama-2-70b'), false);
	});

	test('Should return default metadata for unknown models', () => {
		const metadata = getModelMetadata('unknown-model-xyz');
		assert.deepStrictEqual(metadata, DEFAULT_MODEL_METADATA);
	});
});
