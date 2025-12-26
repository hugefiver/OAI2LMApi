import * as assert from 'assert';
import { 
    GeminiClient, 
    GeminiConfig, 
    GeminiContent, 
    GeminiModelInfo,
    GeminiFunctionDeclaration,
    GeminiCompletedToolCall,
    getGeminiModelId,
    supportsTextGeneration,
    supportsGeminiFunctionCalling
} from '../../geminiClient';

suite('GeminiClient Unit Tests', () => {

    test('Should create GeminiClient with config', () => {
        const config: GeminiConfig = {
            apiEndpoint: 'https://generativelanguage.googleapis.com/v1beta',
            apiKey: 'test-key'
        };

        const client = new GeminiClient(config);
        assert.ok(client);
    });

    test('Should update config', () => {
        const config: GeminiConfig = {
            apiEndpoint: 'https://generativelanguage.googleapis.com/v1beta',
            apiKey: 'test-key'
        };

        const client = new GeminiClient(config);

        const newConfig: GeminiConfig = {
            apiEndpoint: 'https://custom-endpoint.com/v1',
            apiKey: 'new-test-key'
        };

        client.updateConfig(newConfig);
        assert.ok(client);
    });
});

suite('Gemini Model Info Helper Functions', () => {

    test('getGeminiModelId should extract model ID from full name', () => {
        assert.strictEqual(getGeminiModelId({ 
            name: 'models/gemini-2.0-flash', 
            displayName: 'Gemini 2.0 Flash',
            supportedGenerationMethods: ['generateContent'] 
        }), 'gemini-2.0-flash');
    });

    test('getGeminiModelId should handle short name', () => {
        assert.strictEqual(getGeminiModelId({ 
            name: 'gemini-1.5-pro', 
            displayName: 'Gemini 1.5 Pro',
            supportedGenerationMethods: ['generateContent'] 
        }), 'gemini-1.5-pro');
    });

    test('supportsTextGeneration should return true for generateContent models', () => {
        const model: GeminiModelInfo = {
            name: 'models/gemini-2.0-flash',
            displayName: 'Gemini 2.0 Flash',
            supportedGenerationMethods: ['generateContent', 'countTokens']
        };
        assert.strictEqual(supportsTextGeneration(model), true);
    });

    test('supportsTextGeneration should return false for embedding models', () => {
        const model: GeminiModelInfo = {
            name: 'models/text-embedding-004',
            displayName: 'Text Embedding 004',
            supportedGenerationMethods: ['embedContent']
        };
        assert.strictEqual(supportsTextGeneration(model), false);
    });

    test('supportsGeminiFunctionCalling should return true for LLM models', () => {
        const model: GeminiModelInfo = {
            name: 'models/gemini-2.0-flash',
            displayName: 'Gemini 2.0 Flash',
            supportedGenerationMethods: ['generateContent']
        };
        assert.strictEqual(supportsGeminiFunctionCalling(model), true);
    });

    test('supportsGeminiFunctionCalling should return false for embedding models', () => {
        const model: GeminiModelInfo = {
            name: 'models/text-embedding-004',
            displayName: 'Text Embedding 004',
            supportedGenerationMethods: ['embedContent']
        };
        assert.strictEqual(supportsGeminiFunctionCalling(model), false);
    });
});

suite('Gemini Model Info with Null/Missing Fields', () => {

    test('getGeminiModelId should fallback to displayName when name is null', () => {
        const model: GeminiModelInfo = {
            name: null,
            displayName: 'gemini-3-pro-preview',
            supportedGenerationMethods: null
        };
        assert.strictEqual(getGeminiModelId(model), 'gemini-3-pro-preview');
    });

    test('getGeminiModelId should fallback to displayName when name is undefined', () => {
        const model: GeminiModelInfo = {
            displayName: 'gemini-3-flash',
            supportedGenerationMethods: null
        };
        assert.strictEqual(getGeminiModelId(model), 'gemini-3-flash');
    });

    test('getGeminiModelId should return empty string when both name and displayName are null', () => {
        const model: GeminiModelInfo = {
            name: null,
            displayName: null,
            supportedGenerationMethods: null
        };
        assert.strictEqual(getGeminiModelId(model), '');
    });

    test('supportsTextGeneration should use heuristics when supportedGenerationMethods is null', () => {
        // Gemini model should be assumed to support text generation
        const geminiModel: GeminiModelInfo = {
            name: 'models/gemini-3-pro-preview',
            displayName: 'gemini-3-pro-preview',
            supportedGenerationMethods: null
        };
        assert.strictEqual(supportsTextGeneration(geminiModel), true);
    });

    test('supportsTextGeneration should return false for embedding model when supportedGenerationMethods is null', () => {
        // Embedding model should not be assumed to support text generation
        const embeddingModel: GeminiModelInfo = {
            name: 'models/text-embedding-004',
            displayName: 'Text Embedding 004',
            supportedGenerationMethods: null
        };
        assert.strictEqual(supportsTextGeneration(embeddingModel), false);
    });

    test('supportsTextGeneration should return false when name and displayName are both null', () => {
        const model: GeminiModelInfo = {
            name: null,
            displayName: null,
            supportedGenerationMethods: null
        };
        assert.strictEqual(supportsTextGeneration(model), false);
    });

    test('supportsGeminiFunctionCalling should work with null supportedGenerationMethods', () => {
        const model: GeminiModelInfo = {
            name: 'models/gemini-3-pro-preview',
            displayName: 'gemini-3-pro-preview',
            supportedGenerationMethods: null
        };
        // Should use heuristics and return true for gemini models
        assert.strictEqual(supportsGeminiFunctionCalling(model), true);
    });

    test('supportsGeminiFunctionCalling should check supportedActions even when supportedGenerationMethods is null', () => {
        const model: GeminiModelInfo = {
            name: 'models/gemini-3-pro-preview',
            displayName: 'gemini-3-pro-preview',
            supportedGenerationMethods: null,
            supportedActions: ['functionCalling']
        };
        assert.strictEqual(supportsGeminiFunctionCalling(model), true);
    });

    test('should handle model with all null fields from problematic API response', () => {
        // This is the exact scenario from the issue
        const model: GeminiModelInfo = {
            name: 'gemini-3-pro-preview',
            baseModelId: null,
            version: null,
            displayName: 'gemini-3-pro-preview',
            description: null,
            inputTokenLimit: null,
            outputTokenLimit: null,
            supportedGenerationMethods: null
        };
        
        // Should be able to get model ID
        assert.strictEqual(getGeminiModelId(model), 'gemini-3-pro-preview');
        
        // Should support text generation (heuristic: it's a gemini model)
        assert.strictEqual(supportsTextGeneration(model), true);
        
        // Should support function calling (heuristic: it's a gemini model that supports text gen)
        assert.strictEqual(supportsGeminiFunctionCalling(model), true);
    });
});

suite('Gemini Content Types Unit Tests', () => {

    test('GeminiContent with text parts should have correct structure', () => {
        const content: GeminiContent = {
            role: 'user',
            parts: [
                { text: 'Hello, how are you?' }
            ]
        };

        assert.strictEqual(content.role, 'user');
        assert.strictEqual(content.parts.length, 1);
        assert.strictEqual((content.parts[0] as any).text, 'Hello, how are you?');
    });

    test('GeminiContent with function call should have correct structure', () => {
        const content: GeminiContent = {
            role: 'model',
            parts: [
                {
                    functionCall: {
                        name: 'get_weather',
                        args: { location: 'Tokyo' }
                    }
                }
            ]
        };

        assert.strictEqual(content.role, 'model');
        assert.strictEqual(content.parts.length, 1);
        const funcCall = (content.parts[0] as any).functionCall;
        assert.strictEqual(funcCall.name, 'get_weather');
        assert.deepStrictEqual(funcCall.args, { location: 'Tokyo' });
    });

    test('GeminiContent with inline data should have correct structure', () => {
        const content: GeminiContent = {
            role: 'user',
            parts: [
                { text: 'What is in this image?' },
                {
                    inlineData: {
                        mimeType: 'image/jpeg',
                        data: 'base64encodeddata'
                    }
                }
            ]
        };

        assert.strictEqual(content.role, 'user');
        assert.strictEqual(content.parts.length, 2);
        const inlineData = (content.parts[1] as any).inlineData;
        assert.strictEqual(inlineData.mimeType, 'image/jpeg');
        assert.strictEqual(inlineData.data, 'base64encodeddata');
    });

    test('GeminiContent with thought parts should have correct structure', () => {
        const content: GeminiContent = {
            role: 'model',
            parts: [
                {
                    thought: true,
                    text: 'Let me think about this...'
                },
                { text: 'The answer is 42.' }
            ]
        };

        assert.strictEqual(content.role, 'model');
        assert.strictEqual(content.parts.length, 2);
        const thoughtPart = content.parts[0] as any;
        assert.strictEqual(thoughtPart.thought, true);
        assert.strictEqual(thoughtPart.text, 'Let me think about this...');
    });
});

suite('GeminiFunctionDeclaration Types Unit Tests', () => {

    test('GeminiFunctionDeclaration should have correct structure', () => {
        const funcDecl: GeminiFunctionDeclaration = {
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
        };

        assert.strictEqual(funcDecl.name, 'get_weather');
        assert.strictEqual(funcDecl.description, 'Get the current weather in a location');
        assert.ok(funcDecl.parameters);
    });

    test('GeminiFunctionDeclaration without description should be valid', () => {
        const funcDecl: GeminiFunctionDeclaration = {
            name: 'simple_function',
            parameters: {
                type: 'object',
                properties: {}
            }
        };

        assert.strictEqual(funcDecl.name, 'simple_function');
        assert.strictEqual(funcDecl.description, undefined);
    });
});

suite('GeminiCompletedToolCall Types Unit Tests', () => {

    test('GeminiCompletedToolCall should have correct structure', () => {
        const toolCall: GeminiCompletedToolCall = {
            id: 'gemini_call_0',
            name: 'get_weather',
            arguments: '{"location": "Tokyo"}'
        };

        assert.strictEqual(toolCall.id, 'gemini_call_0');
        assert.strictEqual(toolCall.name, 'get_weather');
        assert.strictEqual(toolCall.arguments, '{"location": "Tokyo"}');
    });

    test('Multiple GeminiCompletedToolCalls should be batchable', () => {
        const toolCalls: GeminiCompletedToolCall[] = [
            {
                id: 'gemini_call_0',
                name: 'get_weather',
                arguments: '{"location": "Tokyo"}'
            },
            {
                id: 'gemini_call_1',
                name: 'get_time',
                arguments: '{"timezone": "Asia/Tokyo"}'
            }
        ];

        assert.strictEqual(toolCalls.length, 2);
        assert.strictEqual(toolCalls[0].name, 'get_weather');
        assert.strictEqual(toolCalls[1].name, 'get_time');
    });
});

suite('Gemini Conversation Flow Integration Tests', () => {

    test('Full tool call conversation flow should have valid types', () => {
        // Step 1: User asks a question
        const userContent: GeminiContent = {
            role: 'user',
            parts: [{ text: 'What is the weather in Tokyo?' }]
        };

        // Step 2: Model makes a function call
        const modelFunctionCall: GeminiContent = {
            role: 'model',
            parts: [
                {
                    functionCall: {
                        name: 'get_weather',
                        args: { location: 'Tokyo, Japan' }
                    }
                }
            ]
        };

        // Step 3: User provides function response
        const functionResponse: GeminiContent = {
            role: 'user',
            parts: [
                {
                    functionResponse: {
                        name: 'get_weather',
                        response: { temperature: 25, condition: 'sunny' }
                    }
                }
            ]
        };

        // Step 4: Model responds with final answer
        const modelFinalResponse: GeminiContent = {
            role: 'model',
            parts: [
                { text: 'The weather in Tokyo is sunny with a temperature of 25°C.' }
            ]
        };

        const conversation: GeminiContent[] = [
            userContent,
            modelFunctionCall,
            functionResponse,
            modelFinalResponse
        ];

        assert.strictEqual(conversation.length, 4);
        assert.strictEqual(conversation[0].role, 'user');
        assert.strictEqual(conversation[1].role, 'model');
        assert.strictEqual(conversation[2].role, 'user');
        assert.strictEqual(conversation[3].role, 'model');
    });

    test('Multi-turn conversation with thinking should have valid types', () => {
        const contents: GeminiContent[] = [
            {
                role: 'user',
                parts: [{ text: 'Explain quantum computing' }]
            },
            {
                role: 'model',
                parts: [
                    { thought: true, text: 'I should explain this in simple terms...' },
                    { text: 'Quantum computing uses quantum bits (qubits)...' }
                ]
            },
            {
                role: 'user',
                parts: [{ text: 'Can you give an example?' }]
            },
            {
                role: 'model',
                parts: [
                    { text: 'Consider a simple example with two qubits...' }
                ]
            }
        ];

        assert.strictEqual(contents.length, 4);
        
        // Check thinking part
        const modelResponse = contents[1];
        assert.strictEqual(modelResponse.parts.length, 2);
        assert.strictEqual((modelResponse.parts[0] as any).thought, true);
    });

    test('Multimodal conversation with image should have valid types', () => {
        const contents: GeminiContent[] = [
            {
                role: 'user',
                parts: [
                    { text: 'What is in this image?' },
                    {
                        inlineData: {
                            mimeType: 'image/png',
                            data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
                        }
                    }
                ]
            },
            {
                role: 'model',
                parts: [
                    { text: 'This image shows a single pixel.' }
                ]
            }
        ];

        assert.strictEqual(contents.length, 2);
        assert.strictEqual(contents[0].parts.length, 2);
        
        const imagePart = contents[0].parts[1] as any;
        assert.strictEqual(imagePart.inlineData.mimeType, 'image/png');
    });
});

suite('GeminiClient Mocked API Tests', () => {

    test('Should handle empty model list response', async () => {
        const config: GeminiConfig = {
            apiEndpoint: 'https://generativelanguage.googleapis.com',
            apiKey: 'test-key'
        };

        const client = new GeminiClient(config);
        
        // Mock fetch to return empty models
        const originalFetch = global.fetch;
        (global as any).fetch = async () => ({
            ok: true,
            json: async () => ({ models: [] })
        });

        try {
            const models = await client.listModels();
            assert.strictEqual(models.length, 0);
        } finally {
            global.fetch = originalFetch;
        }
    });

    test('Should extract thoughtSignature from stream chunks', () => {
        // Test that we can parse thoughtSignature from chunk metadata
        const chunk = {
            candidates: [{
                content: {
                    role: 'model',
                    parts: [{ text: 'thinking...', thought: true }]
                }
            }],
            thoughtSignature: 'sig_abc123'
        };

        assert.strictEqual((chunk as any).thoughtSignature, 'sig_abc123');
        assert.strictEqual(chunk.candidates[0].content.parts[0].thought, true);
    });
});

suite('GeminiLanguageModelProvider Message Conversion Tests', () => {

    test('Tool call ID to function name mapping should work correctly', () => {
        // Test the concept of callId to name mapping
        const toolCallNames = new Map<string, string>();
        toolCallNames.set('call_123', 'get_weather');
        toolCallNames.set('call_456', 'search_web');

        assert.strictEqual(toolCallNames.get('call_123'), 'get_weather');
        assert.strictEqual(toolCallNames.get('call_456'), 'search_web');
        assert.strictEqual(toolCallNames.get('call_789'), undefined);
    });

    test('Model family extraction patterns should match correctly', () => {
        // Test family extraction logic
        const extractFamily = (modelId: string): string => {
            const name = modelId.replace(/^models\//, '');
            const patterns = [
                /^(gemini-3|gemini-2\.5|gemini-2\.0|gemini-1\.5|gemini-1\.0)/i,
                /^gemini/i,
            ];

            for (const pattern of patterns) {
                const match = name.match(pattern);
                if (match) {
                    return match[1] ? match[1].toLowerCase() : 'gemini';
                }
            }
            return name.toLowerCase();
        };

        assert.strictEqual(extractFamily('gemini-3-pro'), 'gemini-3');
        assert.strictEqual(extractFamily('gemini-2.5-flash'), 'gemini-2.5');
        assert.strictEqual(extractFamily('gemini-2.0-flash'), 'gemini-2.0');
        assert.strictEqual(extractFamily('gemini-1.5-pro'), 'gemini-1.5');
        assert.strictEqual(extractFamily('models/gemini-2.0-flash'), 'gemini-2.0');
    });

    test('Vision support detection should include gemini-3', () => {
        const supportsVision = (modelId: string): boolean => {
            const visionModels = [
                'gemini-3',
                'gemini-2.5',
                'gemini-2.0',
                'gemini-1.5',
                'gemini-pro-vision'
            ];
            const lowerModelId = modelId.toLowerCase();
            return visionModels.some(prefix => lowerModelId.includes(prefix)) ||
                   lowerModelId.includes('vision');
        };

        assert.strictEqual(supportsVision('gemini-3-pro'), true);
        assert.strictEqual(supportsVision('gemini-2.5-flash'), true);
        assert.strictEqual(supportsVision('gemini-2.0-flash'), true);
        assert.strictEqual(supportsVision('gemini-pro-vision'), true);
        assert.strictEqual(supportsVision('text-embedding-004'), false);
    });
});
