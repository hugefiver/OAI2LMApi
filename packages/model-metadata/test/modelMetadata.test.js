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

test('classifies non-LLM embedding models', () => {
  const metadata = getModelMetadata('text-embedding-3-large');
  assert.equal(metadata.modelType, 'embedding');
  assert.equal(isLLMModel('text-embedding-3-large'), false);
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
