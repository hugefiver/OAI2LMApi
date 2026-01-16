const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_MODEL_METADATA,
  getModelMetadata,
  getModelMetadataFromPatterns,
  isLLMModel,
  mergeMetadata,
  supportsToolCalling
} = require('../dist/index.js');

test('matches provider-prefixed model IDs', () => {
  const metadata = getModelMetadata('openai/gpt-4o');
  assert.equal(metadata.maxInputTokens, 128000);
  assert.equal(metadata.supportsToolCalling, true);
});

test('supports ESM import in consumers', async () => {
  const esmModule = await import('@oai2lmapi/model-metadata');
  const getMetadata = esmModule.getModelMetadata ?? esmModule.default?.getModelMetadata;
  assert.equal(typeof getMetadata, 'function');
  const metadata = getMetadata('gpt-4o');
  assert.equal(metadata.maxInputTokens, 128000);
});

test('classifies non-LLM embedding models', () => {
  const metadata = getModelMetadata('text-embedding-3-large');
  assert.equal(metadata.modelType, 'embedding');
  assert.equal(isLLMModel('text-embedding-3-large'), false);
});

test('matches subpattern variants', () => {
  const metadata = getModelMetadata('gpt-4o-mini');
  assert.equal(metadata.maxInputTokens, 128000);
  assert.equal(metadata.supportsImageInput, true);
});

test('normalizes common suffixes', () => {
  const metadata = getModelMetadata('gpt-4o-latest');
  assert.equal(metadata.maxInputTokens, 128000);
  assert.equal(metadata.supportsToolCalling, true);
});

test('classifies image and audio models as non-LLM', () => {
  const imageMetadata = getModelMetadata('dall-e-3');
  assert.equal(imageMetadata.modelType, 'image');
  assert.equal(isLLMModel('dall-e-3'), false);

  const audioMetadata = getModelMetadata('whisper-1');
  assert.equal(audioMetadata.modelType, 'audio');
  assert.equal(isLLMModel('whisper-1'), false);
});

test('mergeMetadata preserves pattern defaults', () => {
  const patternMetadata = getModelMetadataFromPatterns('gpt-4o');
  const merged = mergeMetadata({ maxOutputTokens: 9999 }, patternMetadata);
  assert.equal(merged.maxInputTokens, patternMetadata.maxInputTokens);
  assert.equal(merged.maxOutputTokens, 9999);
  assert.equal(merged.supportsToolCalling, patternMetadata.supportsToolCalling);
  assert.equal(merged.supportsImageInput, patternMetadata.supportsImageInput);
  assert.equal(merged.modelType, patternMetadata.modelType);
});

test('supportsToolCalling returns false for unknown models', () => {
  assert.equal(supportsToolCalling('unknown-model'), DEFAULT_MODEL_METADATA.supportsToolCalling);
});

test('supportsToolCalling respects model capabilities', () => {
  assert.equal(supportsToolCalling('gpt-4o'), true);
  assert.equal(supportsToolCalling('text-embedding-3-large'), false);
});
