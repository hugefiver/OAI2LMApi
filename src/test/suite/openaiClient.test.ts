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
	
	test('Should route <think>...</think> at the start to thinking and strip from visible text', () => {
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

	test('Should strip and DROP <think>...</think> at the start when configured', () => {
		const textChunks: string[] = [];
		const thinkingChunks: string[] = [];

		const parser = new ThinkTagStreamParser(
			{
				onText: (c) => textChunks.push(c),
				onThinking: (c) => thinkingChunks.push(c)
			},
			{
				thinkTagHandling: 'drop'
			}
		);

		parser.ingest('<think>abc</think>hello');
		parser.flush();

		assert.strictEqual(thinkingChunks.join(''), '');
		assert.strictEqual(textChunks.join(''), 'hello');
	});

	test('Should still emit <thinking>...</thinking> when <think> is configured to drop', () => {
		const textChunks: string[] = [];
		const thinkingChunks: string[] = [];

		const parser = new ThinkTagStreamParser(
			{
				onText: (c) => textChunks.push(c),
				onThinking: (c) => thinkingChunks.push(c)
			},
			{
				thinkTagHandling: 'drop'
			}
		);

		parser.ingest('<think>abc</think>\n<thinking>xyz</thinking>done');
		parser.flush();

		assert.strictEqual(thinkingChunks.join(''), 'xyz');
		assert.strictEqual(textChunks.join(''), '\ndone');
	});

	test('Should NOT match <think> tag after text has been emitted', () => {
		const textChunks: string[] = [];
		const thinkingChunks: string[] = [];

		const parser = new ThinkTagStreamParser({
			onText: (c) => textChunks.push(c),
			onThinking: (c) => thinkingChunks.push(c)
		});

		// <think> appears after "a", so it should NOT be treated as a thinking tag
		parser.ingest('a<think>b</think>c');
		parser.flush();

		// The entire string should be passed as text since <think> only matches at start
		assert.strictEqual(textChunks.join(''), 'a<think>b</think>c');
		assert.strictEqual(thinkingChunks.join(''), '');
	});

	test('Should handle <think> tags split across streamed chunks when at start', () => {
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

	test('Should NOT treat <think> as thinking tag when appearing mid-stream', () => {
		const textChunks: string[] = [];
		const thinkingChunks: string[] = [];

		const parser = new ThinkTagStreamParser({
			onText: (c) => textChunks.push(c),
			onThinking: (c) => thinkingChunks.push(c)
		});

		// First emit some text, then have a <think> tag
		parser.ingest('hello ');
		parser.ingest('<think>abc</think>world');
		parser.flush();

		// <think> should NOT be matched since text was already emitted
		assert.strictEqual(textChunks.join(''), 'hello <think>abc</think>world');
		assert.strictEqual(thinkingChunks.join(''), '');
	});

	test('Should only match <think> at start, not in the middle', () => {
		const textChunks: string[] = [];
		const thinkingChunks: string[] = [];

		const parser = new ThinkTagStreamParser({
			onText: (c) => textChunks.push(c),
			onThinking: (c) => thinkingChunks.push(c)
		});

		// First <think> is at start, should be matched. 
		// After visible text "c", subsequent <think> should NOT be matched.
		parser.ingest('<think>b</think>c<think>d</think>e');
		parser.flush();

		// First <think>b</think> is at start -> thinking
		// "c<think>d</think>e" is text (second <think> not matched because text already emitted)
		assert.strictEqual(thinkingChunks.join(''), 'b');
		assert.strictEqual(textChunks.join(''), 'c<think>d</think>e');
	});

	test('Should be case-insensitive for <think> tags at start', () => {
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

	test('Should route <thinking>...</thinking> to thinking handler when at line start', () => {
		const textChunks: string[] = [];
		const thinkingChunks: string[] = [];

		const parser = new ThinkTagStreamParser({
			onText: (c) => textChunks.push(c),
			onThinking: (c) => thinkingChunks.push(c)
		});

		parser.ingest('<thinking>reasoning here</thinking>response');
		parser.flush();

		assert.strictEqual(thinkingChunks.join(''), 'reasoning here');
		assert.strictEqual(textChunks.join(''), 'response');
	});

	test('Should match <thinking> tag only at line start, not mid-line', () => {
		const textChunks: string[] = [];
		const thinkingChunks: string[] = [];

		const parser = new ThinkTagStreamParser({
			onText: (c) => textChunks.push(c),
			onThinking: (c) => thinkingChunks.push(c)
		});

		// <thinking> appears mid-line (after "prefix text" without newline), should NOT be matched
		parser.ingest('prefix text<thinking>reasoning</thinking>suffix');
		parser.flush();

		// <thinking> not at line start, so entire string is text
		assert.strictEqual(thinkingChunks.join(''), '');
		assert.strictEqual(textChunks.join(''), 'prefix text<thinking>reasoning</thinking>suffix');
	});

	test('Should support multiple <thinking> blocks only at line start', () => {
		const textChunks: string[] = [];
		const thinkingChunks: string[] = [];

		const parser = new ThinkTagStreamParser({
			onText: (c) => textChunks.push(c),
			onThinking: (c) => thinkingChunks.push(c)
		});

		// Only <thinking> at position 0 or after newline should be matched
		parser.ingest('<thinking>b</thinking>c\n<thinking>d</thinking>e');
		parser.flush();

		assert.strictEqual(textChunks.join(''), 'c\ne');
		assert.strictEqual(thinkingChunks.join(''), 'bd');
	});

	test('Should handle <thinking> tags split across streamed chunks', () => {
		const textChunks: string[] = [];
		const thinkingChunks: string[] = [];

		const parser = new ThinkTagStreamParser({
			onText: (c) => textChunks.push(c),
			onThinking: (c) => thinkingChunks.push(c)
		});

		parser.ingest('<think');
		parser.ingest('ing>abc</think');
		parser.ingest('ing>hi');
		parser.flush();

		assert.strictEqual(thinkingChunks.join(''), 'abc');
		assert.strictEqual(textChunks.join(''), 'hi');
	});

	test('Should be case-insensitive for <thinking> tags', () => {
		const textChunks: string[] = [];
		const thinkingChunks: string[] = [];

		const parser = new ThinkTagStreamParser({
			onText: (c) => textChunks.push(c),
			onThinking: (c) => thinkingChunks.push(c)
		});

		parser.ingest('<THINKING>abc</THINKING>hi');
		parser.flush();

		assert.strictEqual(thinkingChunks.join(''), 'abc');
		assert.strictEqual(textChunks.join(''), 'hi');
	});

	test('Should handle <think> at start and <thinking> at line start in same stream', () => {
		const textChunks: string[] = [];
		const thinkingChunks: string[] = [];

		const parser = new ThinkTagStreamParser({
			onText: (c) => textChunks.push(c),
			onThinking: (c) => thinkingChunks.push(c)
		});

		// <think> at start is matched, then text "c", then <thinking> after newline is matched
		parser.ingest('<think>b</think>c\n<thinking>d</thinking>e');
		parser.flush();

		assert.strictEqual(thinkingChunks.join(''), 'bd');
		assert.strictEqual(textChunks.join(''), 'c\ne');
	});

	test('Should NOT match <think> after text but still match <thinking> at line start', () => {
		const textChunks: string[] = [];
		const thinkingChunks: string[] = [];

		const parser = new ThinkTagStreamParser({
			onText: (c) => textChunks.push(c),
			onThinking: (c) => thinkingChunks.push(c)
		});

		// "a" is text first, so <think> is NOT matched
		// <thinking> after newline should be matched
		parser.ingest('a<think>b</think>c\n<thinking>d</thinking>e');
		parser.flush();

		// <think> after "a" should NOT be matched -> passed as text
		// <thinking> after newline should be matched -> "d" goes to thinking
		assert.strictEqual(textChunks.join(''), 'a<think>b</think>c\ne');
		assert.strictEqual(thinkingChunks.join(''), 'd');
	});

	test('Should pass through <thinking> content unchanged if no thinking handler', () => {
		const textChunks: string[] = [];
		const input = '<thinking>abc</thinking>hello';

		const parser = new ThinkTagStreamParser({
			onText: (c) => textChunks.push(c)
		});

		parser.ingest(input);
		parser.flush();

		assert.strictEqual(textChunks.join(''), input);
	});

	test('Should NOT match <think> after notifyThinkingReceived is called', () => {
		const textChunks: string[] = [];
		const thinkingChunks: string[] = [];

		const parser = new ThinkTagStreamParser({
			onText: (c) => textChunks.push(c),
			onThinking: (c) => thinkingChunks.push(c)
		});

		// Simulate external thinking content received (e.g., reasoning_content field)
		parser.notifyThinkingReceived();

		// Now <think> at start should NOT be matched
		parser.ingest('<think>abc</think>hello');
		parser.flush();

		// <think> should be passed through as text since thinking was already received
		assert.strictEqual(textChunks.join(''), '<think>abc</think>hello');
		assert.strictEqual(thinkingChunks.join(''), '');
	});

	test('Should still match <thinking> at line start after notifyThinkingReceived', () => {
		const textChunks: string[] = [];
		const thinkingChunks: string[] = [];

		const parser = new ThinkTagStreamParser({
			onText: (c) => textChunks.push(c),
			onThinking: (c) => thinkingChunks.push(c)
		});

		// Simulate external thinking content received
		parser.notifyThinkingReceived();

		// <thinking> should still be matched at line start
		parser.ingest('<thinking>abc</thinking>hello');
		parser.flush();

		assert.strictEqual(thinkingChunks.join(''), 'abc');
		assert.strictEqual(textChunks.join(''), 'hello');
	});

	test('Should match <thinking> after newline in middle of text', () => {
		const textChunks: string[] = [];
		const thinkingChunks: string[] = [];

		const parser = new ThinkTagStreamParser({
			onText: (c) => textChunks.push(c),
			onThinking: (c) => thinkingChunks.push(c)
		});

		// <thinking> after newline should be matched
		parser.ingest('line1\n<thinking>reasoning</thinking>line2');
		parser.flush();

		assert.strictEqual(thinkingChunks.join(''), 'reasoning');
		assert.strictEqual(textChunks.join(''), 'line1\nline2');
	});

	test('Should NOT match <thinking> in middle of line', () => {
		const textChunks: string[] = [];
		const thinkingChunks: string[] = [];

		const parser = new ThinkTagStreamParser({
			onText: (c) => textChunks.push(c),
			onThinking: (c) => thinkingChunks.push(c)
		});

		// <thinking> not at line start, should NOT be matched
		parser.ingest('text <thinking>reasoning</thinking> more');
		parser.flush();

		assert.strictEqual(thinkingChunks.join(''), '');
		assert.strictEqual(textChunks.join(''), 'text <thinking>reasoning</thinking> more');
	});

	test('Should treat nested <thinking> as literal content (no nesting support)', () => {
		const textChunks: string[] = [];
		const thinkingChunks: string[] = [];

		const parser = new ThinkTagStreamParser({
			onText: (c) => textChunks.push(c),
			onThinking: (c) => thinkingChunks.push(c)
		});

		// Nested <thinking> is treated as literal text inside thinking content
		// First </thinking> closes the block
		parser.ingest('<thinking><thinking></thinking>');
		parser.flush();

		// Inner <thinking> becomes thinking content, nothing left as text
		assert.strictEqual(thinkingChunks.join(''), '<thinking>');
		assert.strictEqual(textChunks.join(''), '');
	});

	test('Should pass through unmatched closing tag as text', () => {
		const textChunks: string[] = [];
		const thinkingChunks: string[] = [];

		const parser = new ThinkTagStreamParser({
			onText: (c) => textChunks.push(c),
			onThinking: (c) => thinkingChunks.push(c)
		});

		// Extra </thinking> is passed through as text
		parser.ingest('<thinking></thinking></thinking>');
		parser.flush();

		// First pair matches, extra closing tag is text
		assert.strictEqual(thinkingChunks.join(''), '');
		assert.strictEqual(textChunks.join(''), '</thinking>');
	});

	test('Should handle deeply nested tags correctly', () => {
		const textChunks: string[] = [];
		const thinkingChunks: string[] = [];

		const parser = new ThinkTagStreamParser({
			onText: (c) => textChunks.push(c),
			onThinking: (c) => thinkingChunks.push(c)
		});

		// Multiple levels of nesting
		parser.ingest('<thinking>a<thinking>b</thinking>c</thinking>d');
		parser.flush();

		// First </thinking> closes the block, "a<thinking>b" is thinking
		// "c</thinking>d" is text (</thinking> doesn't match at line start)
		assert.strictEqual(thinkingChunks.join(''), 'a<thinking>b');
		assert.strictEqual(textChunks.join(''), 'c</thinking>d');
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

	test('Should suppress reasoning_content when suppressChainOfThought is enabled and not fall back', async () => {
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
				suppressChainOfThought: true,
				maxTokens: 128
			}
		);

		assert.strictEqual(thinking.join(''), '');
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

suite('Tool Call ID Validation Tests', () => {

	test('ChatMessage with empty tool_call_id should be handled gracefully', () => {
		// This test verifies that tool messages with empty/missing tool_call_id
		// don't cause issues when constructing ChatMessage objects
		const message: ChatMessage = {
			role: 'tool',
			content: '{"result": "success"}',
			tool_call_id: '' // Empty ID - should be handled by convertMessagesToOpenAIFormat
		};

		assert.strictEqual(message.role, 'tool');
		assert.strictEqual(message.content, '{"result": "success"}');
		assert.strictEqual(message.tool_call_id, '');
	});

	test('ChatMessage tool_call_id should not be undefined', () => {
		// Verify that tool messages should always have a defined tool_call_id
		const message: ChatMessage = {
			role: 'tool',
			content: '{"result": "success"}',
			tool_call_id: 'call_valid_123'
		};

		assert.strictEqual(message.tool_call_id, 'call_valid_123');
		assert.ok(message.tool_call_id.length > 0);
	});

	test('Multiple tool calls should have unique IDs', () => {
		const toolCalls: ToolCall[] = [
			{
				id: 'call_weather_1',
				type: 'function',
				function: {
					name: 'get_weather',
					arguments: '{"location": "Tokyo"}'
				}
			},
			{
				id: 'call_time_2',
				type: 'function',
				function: {
					name: 'get_time',
					arguments: '{"timezone": "Asia/Tokyo"}'
				}
			}
		];

		const ids = toolCalls.map(tc => tc.id);
		const uniqueIds = new Set(ids);
		
		// All IDs should be unique
		assert.strictEqual(ids.length, uniqueIds.size);
		// All IDs should be non-empty strings
		for (const id of ids) {
			assert.ok(typeof id === 'string' && id.length > 0, `Tool call ID should be non-empty string: ${id}`);
		}
	});

	test('convertMessagesToOpenAIFormat should generate fallback IDs for tool messages with empty tool_call_id', async () => {
		// This test verifies that the actual fix works by testing streamChatCompletion
		// with a tool message that has an empty tool_call_id
		const config: OpenAIConfig = {
			apiEndpoint: 'https://example.com/v1',
			apiKey: 'test-key'
		};

		const client = new OpenAIClient(config);
		let capturedMessages: any[] = [];

		// Mock the client to capture the messages being sent
		(client as any).client = {
			chat: {
				completions: {
					create: async (opts: any) => {
						capturedMessages = opts.messages;
						// Return a minimal stream that completes immediately
						return (async function* () {
							yield {
								choices: [{
									delta: { content: 'ok' },
									finish_reason: 'stop'
								}]
							};
						})();
					}
				}
			}
		};

		// Call streamChatCompletion with a tool message that has empty tool_call_id
		await client.streamChatCompletion(
			[
				{ role: 'user', content: 'What is the weather?' },
				{
					role: 'assistant',
					content: null,
					tool_calls: [{
						id: 'call_original_123',
						type: 'function',
						function: { name: 'get_weather', arguments: '{"location":"Tokyo"}' }
					}]
				},
				{
					role: 'tool',
					content: '{"temp": 25}',
					tool_call_id: '' // Empty ID - should be replaced with fallback
				}
			],
			'test-model',
			{ maxTokens: 100 }
		);

		// Verify the tool message got a fallback ID (not empty string)
		const toolMessage = capturedMessages.find((m: any) => m.role === 'tool');
		assert.ok(toolMessage, 'Tool message should be present');
		assert.ok(toolMessage.tool_call_id, 'Tool message should have a tool_call_id');
		assert.ok(toolMessage.tool_call_id.length > 0, 'Tool message tool_call_id should not be empty');
		assert.ok(toolMessage.tool_call_id.startsWith('call_fallback_'), 'Fallback ID should have expected prefix');
	});

	test('convertMessagesToOpenAIFormat should preserve valid tool_call_ids', async () => {
		const config: OpenAIConfig = {
			apiEndpoint: 'https://example.com/v1',
			apiKey: 'test-key'
		};

		const client = new OpenAIClient(config);
		let capturedMessages: any[] = [];

		(client as any).client = {
			chat: {
				completions: {
					create: async (opts: any) => {
						capturedMessages = opts.messages;
						return (async function* () {
							yield {
								choices: [{
									delta: { content: 'ok' },
									finish_reason: 'stop'
								}]
							};
						})();
					}
				}
			}
		};

		const validToolCallId = 'call_valid_abc123';
		await client.streamChatCompletion(
			[
				{ role: 'user', content: 'What is the weather?' },
				{
					role: 'tool',
					content: '{"temp": 25}',
					tool_call_id: validToolCallId
				}
			],
			'test-model',
			{ maxTokens: 100 }
		);

		const toolMessage = capturedMessages.find((m: any) => m.role === 'tool');
		assert.ok(toolMessage, 'Tool message should be present');
		assert.strictEqual(toolMessage.tool_call_id, validToolCallId, 'Valid tool_call_id should be preserved');
	});

	test('Multiple tool messages with empty IDs should get unique fallback IDs', async () => {
		const config: OpenAIConfig = {
			apiEndpoint: 'https://example.com/v1',
			apiKey: 'test-key'
		};

		const client = new OpenAIClient(config);
		let capturedMessages: any[] = [];

		(client as any).client = {
			chat: {
				completions: {
					create: async (opts: any) => {
						capturedMessages = opts.messages;
						return (async function* () {
							yield {
								choices: [{
									delta: { content: 'ok' },
									finish_reason: 'stop'
								}]
							};
						})();
					}
				}
			}
		};

		await client.streamChatCompletion(
			[
				{ role: 'user', content: 'What is the weather and time?' },
				{
					role: 'tool',
					content: '{"temp": 25}',
					tool_call_id: '' // First empty ID
				},
				{
					role: 'tool',
					content: '{"time": "12:00"}',
					tool_call_id: '' // Second empty ID
				}
			],
			'test-model',
			{ maxTokens: 100 }
		);

		const toolMessages = capturedMessages.filter((m: any) => m.role === 'tool');
		assert.strictEqual(toolMessages.length, 2, 'Should have two tool messages');
		
		// Both should have fallback IDs
		assert.ok(toolMessages[0].tool_call_id.startsWith('call_fallback_'), 'First tool message should have fallback ID');
		assert.ok(toolMessages[1].tool_call_id.startsWith('call_fallback_'), 'Second tool message should have fallback ID');
		
		// IDs should be unique
		assert.notStrictEqual(toolMessages[0].tool_call_id, toolMessages[1].tool_call_id, 'Fallback IDs should be unique');
	});
});
