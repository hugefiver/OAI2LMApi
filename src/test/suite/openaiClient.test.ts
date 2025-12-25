import * as assert from 'assert';
import { OpenAIClient, OpenAIConfig, ChatMessage, ToolCall, ToolDefinition, ToolChoice, ToolCallChunk, CompletedToolCall, ThinkTagStreamParser } from '../../openaiClient';

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

suite('CompletedToolCall Types Unit Tests', () => {

	test('CompletedToolCall should have correct structure', () => {
		const completedToolCall: CompletedToolCall = {
			id: 'call_abc123',
			name: 'get_weather',
			arguments: '{"location": "Tokyo"}'
		};

		assert.strictEqual(completedToolCall.id, 'call_abc123');
		assert.strictEqual(completedToolCall.name, 'get_weather');
		assert.strictEqual(completedToolCall.arguments, '{"location": "Tokyo"}');
	});

	test('Multiple CompletedToolCalls can be batched together', () => {
		// Simulating multiple tool calls returned in a single response
		const completedToolCalls: CompletedToolCall[] = [
			{
				id: 'call_abc123',
				name: 'get_weather',
				arguments: '{"location": "Tokyo"}'
			},
			{
				id: 'call_def456',
				name: 'get_time',
				arguments: '{"timezone": "Asia/Tokyo"}'
			},
			{
				id: 'call_ghi789',
				name: 'get_news',
				arguments: '{"topic": "technology", "country": "Japan"}'
			}
		];

		assert.strictEqual(completedToolCalls.length, 3);

		// Verify all tool calls have complete and parseable arguments
		for (const toolCall of completedToolCalls) {
			assert.ok(toolCall.id.startsWith('call_'));
			assert.ok(toolCall.name);
			const parsedArgs = JSON.parse(toolCall.arguments);
			assert.ok(typeof parsedArgs === 'object');
		}

		// Verify specific tool calls
		assert.strictEqual(completedToolCalls[0].name, 'get_weather');
		assert.strictEqual(completedToolCalls[1].name, 'get_time');
		assert.strictEqual(completedToolCalls[2].name, 'get_news');
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

suite('ThinkTagStreamParser Unit Tests', () => {
	
	test('Should route <think>...</think> to thinking and strip from visible text', () => {
		const textChunks: string[] = [];
		const thinkingChunks: string[] = [];

		const parser = new ThinkTagStreamParser({
			onText: (c) => textChunks.push(c),
			onThinking: (c) => thinkingChunks.push(c)
		});

		parser.ingest('<think>abc</think>hello');
		parser.flush();

		assert.strictEqual(thinkingChunks.join(''), 'abc');
		assert.strictEqual(textChunks.join(''), 'hello');
	});

	test('Should handle tags split across streamed chunks', () => {
		const textChunks: string[] = [];
		const thinkingChunks: string[] = [];

		const parser = new ThinkTagStreamParser({
			onText: (c) => textChunks.push(c),
			onThinking: (c) => thinkingChunks.push(c)
		});

		parser.ingest('<th');
		parser.ingest('ink>abc</th');
		parser.ingest('ink>hi');
		parser.flush();

		assert.strictEqual(thinkingChunks.join(''), 'abc');
		assert.strictEqual(textChunks.join(''), 'hi');
	});

	test('Should support multiple <think> blocks in one stream', () => {
		const textChunks: string[] = [];
		const thinkingChunks: string[] = [];

		const parser = new ThinkTagStreamParser({
			onText: (c) => textChunks.push(c),
			onThinking: (c) => thinkingChunks.push(c)
		});

		parser.ingest('a<think>b</think>c<think>d</think>e');
		parser.flush();

		assert.strictEqual(textChunks.join(''), 'ace');
		assert.strictEqual(thinkingChunks.join(''), 'bd');
	});

	test('Should be case-insensitive for <think> tags', () => {
		const textChunks: string[] = [];
		const thinkingChunks: string[] = [];

		const parser = new ThinkTagStreamParser({
			onText: (c) => textChunks.push(c),
			onThinking: (c) => thinkingChunks.push(c)
		});

		parser.ingest('<THINK>abc</THINK>hi');
		parser.flush();

		assert.strictEqual(thinkingChunks.join(''), 'abc');
		assert.strictEqual(textChunks.join(''), 'hi');
	});

	test('Should pass through content unchanged if no thinking handler is provided', () => {
		const textChunks: string[] = [];
		const input = '<think>abc</think>hello';

		const parser = new ThinkTagStreamParser({
			onText: (c) => textChunks.push(c)
		});

		parser.ingest(input);
		parser.flush();

		assert.strictEqual(textChunks.join(''), input);
	});
});

suite('OpenAIClient streamChatCompletion empty-stream and message tool_calls handling', () => {

	test('Should fall back to non-streaming when streaming returns no chunks and no content', async () => {
		const config: OpenAIConfig = {
			apiEndpoint: 'https://example.com/v1',
			apiKey: 'test-key'
		};

		const client = new OpenAIClient(config);
		let emitted = '';
		const calls: any[] = [];

		const emptyStream = async function* () {
			// no chunks
		};

		(client as any).client = {
			chat: {
				completions: {
					create: async (opts: any) => {
						calls.push(opts);
						if (opts.stream === true) {
							return emptyStream();
						}
						return { choices: [{ message: { content: 'hello' } }] };
					}
				}
			}
		};

		await client.streamChatCompletion(
			[{ role: 'user', content: 'x' }],
			'minimax-m2.1',
			{
				onChunk: (c) => {
					emitted += c;
				},
				maxTokens: 128
			}
		);

		assert.strictEqual(emitted, 'hello');
		assert.strictEqual(calls.length, 2);
		assert.strictEqual(calls[0].stream, true);
		assert.strictEqual(calls[1].stream, false);
	});

	test('Should capture tool_calls from choices[0].message during streaming', async () => {
		const config: OpenAIConfig = {
			apiEndpoint: 'https://example.com/v1',
			apiKey: 'test-key'
		};

		const client = new OpenAIClient(config);
		const toolCalls: CompletedToolCall[] = [];
		const calls: any[] = [];

		const streamWithMessageToolCalls = async function* () {
			yield {
				choices: [
					{
						delta: {},
						finish_reason: 'stop',
						message: {
							tool_calls: [
								{
									id: 'call_1',
									type: 'function',
									function: { name: 't', arguments: '{"a":1}' }
								}
							]
						}
					}
				]
			};
		};

		(client as any).client = {
			chat: {
				completions: {
					create: async (opts: any) => {
						calls.push(opts);
						return streamWithMessageToolCalls();
					}
				}
			}
		};

		await client.streamChatCompletion(
			[{ role: 'user', content: 'x' }],
			'minimax-m2.1',
			{
				onToolCallsComplete: (tcs) => toolCalls.push(...tcs),
				maxTokens: 128
			}
		);

		assert.strictEqual(calls.length, 1);
		assert.strictEqual(toolCalls.length, 1);
		assert.strictEqual(toolCalls[0].id, 'call_1');
		assert.strictEqual(toolCalls[0].name, 't');
		assert.strictEqual(toolCalls[0].arguments, '{"a":1}');
	});

	test('Should emit reasoning_content as thinking and not fall back to non-streaming', async () => {
		const config: OpenAIConfig = {
			apiEndpoint: 'https://example.com/v1',
			apiKey: 'test-key'
		};

		const client = new OpenAIClient(config);
		const thinking: string[] = [];
		const calls: any[] = [];

		const streamWithReasoningOnly = async function* () {
			yield {
				choices: [
					{
						delta: { reasoning_content: 'abc' },
						finish_reason: 'stop'
					}
				]
			};
		};

		(client as any).client = {
			chat: {
				completions: {
					create: async (opts: any) => {
						calls.push(opts);
						if (opts.stream === true) {
							return streamWithReasoningOnly();
						}
						throw new Error('Should not fall back to non-streaming');
					}
				}
			}
		};

		await client.streamChatCompletion(
			[{ role: 'user', content: 'x' }],
			'minimax-m2.1',
			{
				onThinkingChunk: (c) => thinking.push(c),
				maxTokens: 128
			}
		);

		assert.strictEqual(thinking.join(''), 'abc');
		assert.strictEqual(calls.length, 1);
		assert.strictEqual(calls[0].stream, true);
	});

	test('Should accept reasoning_content as string array', async () => {
		const config: OpenAIConfig = {
			apiEndpoint: 'https://example.com/v1',
			apiKey: 'test-key'
		};

		const client = new OpenAIClient(config);
		const thinking: string[] = [];
		const calls: any[] = [];

		const streamWithReasoningArray = async function* () {
			yield {
				choices: [
					{
						delta: { reasoning_content: ['a', 'b', 'c'] },
						finish_reason: 'stop'
					}
				]
			};
		};

		(client as any).client = {
			chat: {
				completions: {
					create: async (opts: any) => {
						calls.push(opts);
						return streamWithReasoningArray();
					}
				}
			}
		};

		await client.streamChatCompletion(
			[{ role: 'user', content: 'x' }],
			'minimax-m2.1',
			{
				onThinkingChunk: (c) => thinking.push(c),
				maxTokens: 128
			}
		);

		assert.strictEqual(thinking.join(''), 'abc');
		assert.strictEqual(calls.length, 1);
	});
});
