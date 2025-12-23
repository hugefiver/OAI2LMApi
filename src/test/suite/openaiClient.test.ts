import * as assert from 'assert';
import { OpenAIClient, OpenAIConfig, ChatMessage, ToolCall, ToolDefinition, ToolChoice, ToolCallChunk } from '../../openaiClient';

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

	test('Should normalize API endpoint with trailing slashes', () => {
		const config: OpenAIConfig = {
			apiEndpoint: 'https://api.openai.com/v1///',
			apiKey: 'test-key'
		};

		// Should not throw and should handle trailing slashes
		const client = new OpenAIClient(config);
		assert.ok(client);
	});
});

suite('ChatMessage Types Unit Tests', () => {

	test('ChatMessage with tool_calls should have correct structure', () => {
		const toolCall: ToolCall = {
			id: 'call_123',
			type: 'function',
			function: {
				name: 'get_weather',
				arguments: '{"location": "Tokyo"}'
			}
		};

		const message: ChatMessage = {
			role: 'assistant',
			content: null,
			tool_calls: [toolCall]
		};

		assert.strictEqual(message.role, 'assistant');
		assert.strictEqual(message.content, null);
		assert.ok(message.tool_calls);
		assert.strictEqual(message.tool_calls.length, 1);
		assert.strictEqual(message.tool_calls[0].id, 'call_123');
		assert.strictEqual(message.tool_calls[0].type, 'function');
		assert.strictEqual(message.tool_calls[0].function.name, 'get_weather');
		assert.strictEqual(message.tool_calls[0].function.arguments, '{"location": "Tokyo"}');
	});

	test('ChatMessage tool result should have tool_call_id', () => {
		const message: ChatMessage = {
			role: 'tool',
			content: '{"temperature": 25, "unit": "celsius"}',
			tool_call_id: 'call_123'
		};

		assert.strictEqual(message.role, 'tool');
		assert.strictEqual(message.content, '{"temperature": 25, "unit": "celsius"}');
		assert.strictEqual(message.tool_call_id, 'call_123');
	});

	test('System message should have correct structure', () => {
		const message: ChatMessage = {
			role: 'system',
			content: 'You are a helpful assistant.'
		};

		assert.strictEqual(message.role, 'system');
		assert.strictEqual(message.content, 'You are a helpful assistant.');
	});

	test('User message should have correct structure', () => {
		const message: ChatMessage = {
			role: 'user',
			content: 'What is the weather in Tokyo?'
		};

		assert.strictEqual(message.role, 'user');
		assert.strictEqual(message.content, 'What is the weather in Tokyo?');
	});

	test('Assistant message without tool_calls should have correct structure', () => {
		const message: ChatMessage = {
			role: 'assistant',
			content: 'The weather in Tokyo is sunny with a temperature of 25°C.'
		};

		assert.strictEqual(message.role, 'assistant');
		assert.strictEqual(message.content, 'The weather in Tokyo is sunny with a temperature of 25°C.');
		assert.strictEqual(message.tool_calls, undefined);
	});
});

suite('ToolDefinition Types Unit Tests', () => {

	test('ToolDefinition should have correct structure', () => {
		const toolDef: ToolDefinition = {
			type: 'function',
			function: {
				name: 'get_weather',
				description: 'Get the current weather in a location',
				parameters: {
					type: 'object',
					properties: {
						location: {
							type: 'string',
							description: 'The city and country, e.g. Tokyo, Japan'
						}
					},
					required: ['location']
				}
			}
		};

		assert.strictEqual(toolDef.type, 'function');
		assert.strictEqual(toolDef.function.name, 'get_weather');
		assert.strictEqual(toolDef.function.description, 'Get the current weather in a location');
		assert.ok(toolDef.function.parameters);
	});

	test('ToolDefinition without description and parameters should be valid', () => {
		const toolDef: ToolDefinition = {
			type: 'function',
			function: {
				name: 'simple_tool'
			}
		};

		assert.strictEqual(toolDef.type, 'function');
		assert.strictEqual(toolDef.function.name, 'simple_tool');
		assert.strictEqual(toolDef.function.description, undefined);
		assert.strictEqual(toolDef.function.parameters, undefined);
	});
});

suite('ToolChoice Types Unit Tests', () => {

	test('ToolChoice "none" should be valid', () => {
		const choice: ToolChoice = 'none';
		assert.strictEqual(choice, 'none');
	});

	test('ToolChoice "auto" should be valid', () => {
		const choice: ToolChoice = 'auto';
		assert.strictEqual(choice, 'auto');
	});

	test('ToolChoice "required" should be valid', () => {
		const choice: ToolChoice = 'required';
		assert.strictEqual(choice, 'required');
	});

	test('ToolChoice with specific function should be valid', () => {
		const choice: ToolChoice = {
			type: 'function',
			function: { name: 'get_weather' }
		};

		assert.strictEqual(choice.type, 'function');
		assert.strictEqual(choice.function.name, 'get_weather');
	});
});

suite('ToolCallChunk Types Unit Tests', () => {

	test('ToolCallChunk should have correct structure', () => {
		const chunk: ToolCallChunk = {
			id: 'call_abc123',
			name: 'get_weather',
			arguments: '{"location":'
		};

		assert.strictEqual(chunk.id, 'call_abc123');
		assert.strictEqual(chunk.name, 'get_weather');
		assert.strictEqual(chunk.arguments, '{"location":');
	});

	test('ToolCallChunk can accumulate arguments', () => {
		// Simulating streaming behavior where arguments are built incrementally
		let chunk: ToolCallChunk = {
			id: 'call_abc123',
			name: 'get_weather',
			arguments: ''
		};

		// Simulate streaming chunks
		chunk.arguments += '{"location":';
		assert.strictEqual(chunk.arguments, '{"location":');

		chunk.arguments += ' "Tokyo"}';
		assert.strictEqual(chunk.arguments, '{"location": "Tokyo"}');

		// Verify we can parse complete arguments
		const parsedArgs = JSON.parse(chunk.arguments);
		assert.strictEqual(parsedArgs.location, 'Tokyo');
	});
});

suite('Tool Call Message Conversion Integration Tests', () => {

	test('Full tool call conversation flow should have valid types', () => {
		// Step 1: User asks a question
		const userMessage: ChatMessage = {
			role: 'user',
			content: 'What is the weather in Tokyo?'
		};

		// Step 2: Assistant makes a tool call
		const assistantWithToolCall: ChatMessage = {
			role: 'assistant',
			content: null,
			tool_calls: [{
				id: 'call_weather_123',
				type: 'function',
				function: {
					name: 'get_weather',
					arguments: '{"location": "Tokyo, Japan"}'
				}
			}]
		};

		// Step 3: Tool result is returned
		const toolResult: ChatMessage = {
			role: 'tool',
			content: '{"temperature": 25, "condition": "sunny", "humidity": 60}',
			tool_call_id: 'call_weather_123'
		};

		// Step 4: Assistant responds with final answer
		const assistantFinalResponse: ChatMessage = {
			role: 'assistant',
			content: 'The weather in Tokyo is sunny with a temperature of 25°C and 60% humidity.'
		};

		// Verify the conversation flow
		const conversation: ChatMessage[] = [
			userMessage,
			assistantWithToolCall,
			toolResult,
			assistantFinalResponse
		];

		assert.strictEqual(conversation.length, 4);
		assert.strictEqual(conversation[0].role, 'user');
		assert.strictEqual(conversation[1].role, 'assistant');
		assert.ok(conversation[1].tool_calls);
		assert.strictEqual(conversation[2].role, 'tool');
		assert.strictEqual(conversation[2].tool_call_id, 'call_weather_123');
		assert.strictEqual(conversation[3].role, 'assistant');
		assert.ok(conversation[3].content);
	});

	test('Multiple tool calls in single message should be valid', () => {
		const multiToolCallMessage: ChatMessage = {
			role: 'assistant',
			content: null,
			tool_calls: [
				{
					id: 'call_1',
					type: 'function',
					function: {
						name: 'get_weather',
						arguments: '{"location": "Tokyo"}'
					}
				},
				{
					id: 'call_2',
					type: 'function',
					function: {
						name: 'get_time',
						arguments: '{"timezone": "Asia/Tokyo"}'
					}
				}
			]
		};

		assert.strictEqual(multiToolCallMessage.tool_calls?.length, 2);
		assert.strictEqual(multiToolCallMessage.tool_calls[0].function.name, 'get_weather');
		assert.strictEqual(multiToolCallMessage.tool_calls[1].function.name, 'get_time');
	});

	test('Tool result with complex JSON content should be valid', () => {
		const complexResult: ChatMessage = {
			role: 'tool',
			content: JSON.stringify({
				success: true,
				data: {
					items: [
						{ id: 1, name: 'Item 1' },
						{ id: 2, name: 'Item 2' }
					],
					metadata: {
						total: 2,
						page: 1
					}
				}
			}),
			tool_call_id: 'call_complex_123'
		};

		// Verify content can be parsed back
		const parsed = JSON.parse(complexResult.content as string);
		assert.strictEqual(parsed.success, true);
		assert.strictEqual(parsed.data.items.length, 2);
		assert.strictEqual(parsed.data.metadata.total, 2);
	});
});
