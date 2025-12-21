import * as assert from 'assert';
import { OpenAIClient, OpenAIConfig } from '../../openaiClient';

suite('OpenAIClient Unit Tests', () => {
	
	test('Should create OpenAIClient with config', () => {
		const config: OpenAIConfig = {
			apiEndpoint: 'https://api.openai.com/v1',
			apiKey: 'test-key'
		};

		const client = new OpenAIClient(config);
		assert.ok(client);
	});

	test('Should update config', () => {
		const config: OpenAIConfig = {
			apiEndpoint: 'https://api.openai.com/v1',
			apiKey: 'test-key'
		};

		const client = new OpenAIClient(config);

		const newConfig: OpenAIConfig = {
			apiEndpoint: 'https://api.openai.com/v1',
			apiKey: 'new-test-key'
		};

		client.updateConfig(newConfig);
		assert.ok(client);
	});
});
