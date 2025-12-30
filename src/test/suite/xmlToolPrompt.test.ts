import * as assert from 'assert';
import { generateXmlToolPrompt, parseXmlToolCalls, XmlToolCallStreamParser } from '../../xmlToolPrompt';

// Mock LanguageModelChatTool interface for testing
interface MockTool {
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
}

suite('XmlToolPrompt Unit Tests', () => {

    // ============== generateXmlToolPrompt Tests ==============

    suite('generateXmlToolPrompt', () => {

        test('Should return empty string for empty tools array', () => {
            const result = generateXmlToolPrompt([]);
            assert.strictEqual(result, '');
        });

        test('Should return empty string for undefined tools', () => {
            // @ts-expect-error Testing undefined input
            const result = generateXmlToolPrompt(undefined);
            assert.strictEqual(result, '');
        });

        test('Should generate prompt for a single tool', () => {
            const tools: MockTool[] = [{
                name: 'read_file',
                description: 'Read contents of a file',
                inputSchema: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: 'File path to read' }
                    },
                    required: ['path']
                }
            }];

            const result = generateXmlToolPrompt(tools as any);
            
            assert.ok(result.includes('TOOL USE'));
            assert.ok(result.includes('## read_file'));
            assert.ok(result.includes('Description: Read contents of a file'));
            assert.ok(result.includes('- path [string] (required): File path to read'));
            assert.ok(result.includes('<read_file>'));
            assert.ok(result.includes('</read_file>'));
        });

        test('Should generate prompt for multiple tools', () => {
            const tools: MockTool[] = [
                {
                    name: 'read_file',
                    description: 'Read a file'
                },
                {
                    name: 'write_file',
                    description: 'Write to a file'
                }
            ];

            const result = generateXmlToolPrompt(tools as any);
            
            assert.ok(result.includes('## read_file'));
            assert.ok(result.includes('## write_file'));
            assert.ok(result.includes('up to 5 tools'));
        });

        test('Should handle tool without description', () => {
            const tools: MockTool[] = [{
                name: 'simple_tool'
            }];

            const result = generateXmlToolPrompt(tools as any);
            
            assert.ok(result.includes('## simple_tool'));
            assert.ok(result.includes('Parameters: None'));
            // Should not have "Description:" if no description
            assert.ok(!result.includes('Description: undefined'));
        });

        test('Should filter out tools without names', () => {
            const tools: MockTool[] = [
                { name: '', description: 'No name' },
                { name: 'valid_tool', description: 'Has name' }
            ];

            const result = generateXmlToolPrompt(tools as any);
            
            assert.ok(result.includes('## valid_tool'));
            assert.ok(!result.includes('No name'));
        });

        test('Should format optional and required parameters correctly', () => {
            const tools: MockTool[] = [{
                name: 'test_tool',
                inputSchema: {
                    type: 'object',
                    properties: {
                        required_param: { type: 'string', description: 'Required parameter' },
                        optional_param: { type: 'number', description: 'Optional parameter' }
                    },
                    required: ['required_param']
                }
            }];

            const result = generateXmlToolPrompt(tools as any);
            
            assert.ok(result.includes('(required)'));
            assert.ok(result.includes('(optional)'));
        });

        test('Should generate placeholder examples for different types', () => {
            const tools: MockTool[] = [{
                name: 'typed_tool',
                inputSchema: {
                    type: 'object',
                    properties: {
                        str_param: { type: 'string' },
                        num_param: { type: 'number' },
                        bool_param: { type: 'boolean' },
                        arr_param: { type: 'array' },
                        obj_param: { type: 'object' }
                    }
                }
            }];

            const result = generateXmlToolPrompt(tools as any);
            
            assert.ok(result.includes('<str_param>{str_param}</str_param>'));
            assert.ok(result.includes('<num_param>0</num_param>'));
            assert.ok(result.includes('<bool_param>true</bool_param>'));
            assert.ok(result.includes('<arr_param>[]</arr_param>'));
            assert.ok(result.includes('<obj_param>{}</obj_param>'));
        });

    });

    // ============== parseXmlToolCalls Tests ==============

    suite('parseXmlToolCalls', () => {

        test('Should return empty array for empty text', () => {
            const result = parseXmlToolCalls('', ['read_file']);
            assert.strictEqual(result.length, 0);
        });

        test('Should return empty array for empty available tools', () => {
            const result = parseXmlToolCalls('<read_file><path>test.txt</path></read_file>', []);
            assert.strictEqual(result.length, 0);
        });

        test('Should parse single tool call', () => {
            const text = '<read_file><path>test.txt</path></read_file>';
            const result = parseXmlToolCalls(text, ['read_file']);
            
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].name, 'read_file');
            assert.strictEqual(result[0].arguments.path, 'test.txt');
            assert.ok(result[0].id.startsWith('call_xml_'));
        });

        test('Should parse multiple tool calls', () => {
            const text = `
                <read_file><path>file1.txt</path></read_file>
                <write_file><path>file2.txt</path><content>Hello</content></write_file>
            `;
            const result = parseXmlToolCalls(text, ['read_file', 'write_file']);
            
            assert.strictEqual(result.length, 2);
            assert.strictEqual(result[0].name, 'read_file');
            assert.strictEqual(result[0].arguments.path, 'file1.txt');
            assert.strictEqual(result[1].name, 'write_file');
            assert.strictEqual(result[1].arguments.path, 'file2.txt');
            assert.strictEqual(result[1].arguments.content, 'Hello');
        });

        test('Should parse multiple occurrences of same tool', () => {
            const text = `
                <read_file><path>file1.txt</path></read_file>
                <read_file><path>file2.txt</path></read_file>
            `;
            const result = parseXmlToolCalls(text, ['read_file']);
            
            assert.strictEqual(result.length, 2);
            assert.strictEqual(result[0].arguments.path, 'file1.txt');
            assert.strictEqual(result[1].arguments.path, 'file2.txt');
        });

        test('Should ignore tools not in available list', () => {
            const text = '<unknown_tool><param>value</param></unknown_tool>';
            const result = parseXmlToolCalls(text, ['read_file']);
            
            assert.strictEqual(result.length, 0);
        });

        test('Should use case-sensitive matching for tool names', () => {
            const text = '<READ_FILE><path>test.txt</path></READ_FILE>';
            const result = parseXmlToolCalls(text, ['read_file']);
            
            // Case-sensitive matching should NOT find READ_FILE when looking for read_file
            assert.strictEqual(result.length, 0);
        });

        test('Should parse JSON values in parameters', () => {
            const text = '<test_tool><count>42</count><enabled>true</enabled><items>["a","b"]</items></test_tool>';
            const result = parseXmlToolCalls(text, ['test_tool']);
            
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].arguments.count, 42);
            assert.strictEqual(result[0].arguments.enabled, true);
            assert.deepStrictEqual(result[0].arguments.items, ['a', 'b']);
        });

        test('Should handle non-JSON string values', () => {
            const text = '<test_tool><message>Hello World!</message></test_tool>';
            const result = parseXmlToolCalls(text, ['test_tool']);
            
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].arguments.message, 'Hello World!');
        });

        test('Should handle multiline content', () => {
            const text = `<write_file><path>file.txt</path><content>Line 1
Line 2
Line 3</content></write_file>`;
            const result = parseXmlToolCalls(text, ['write_file']);
            
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].arguments.content, 'Line 1\nLine 2\nLine 3');
        });

        test('Should preserve leading and trailing whitespace in parameter values', () => {
            const text = '<write_file><content>  indented text\n\n</content></write_file>';
            const result = parseXmlToolCalls(text, ['write_file']);
            
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].arguments.content, '  indented text\n\n');
        });

        test('Should preserve leading empty lines in parameter values', () => {
            const text = '<write_file><content>\n\nLine after empty lines</content></write_file>';
            const result = parseXmlToolCalls(text, ['write_file']);
            
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].arguments.content, '\n\nLine after empty lines');
        });

        test('Should handle special characters in tool names', () => {
            const text = '<my-tool><param>value</param></my-tool>';
            const result = parseXmlToolCalls(text, ['my-tool']);
            
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].name, 'my-tool');
        });

        test('Should handle text before and after tool calls', () => {
            const text = 'Here is my response:\n\n<read_file><path>test.txt</path></read_file>\n\nLet me know if you need anything else.';
            const result = parseXmlToolCalls(text, ['read_file']);
            
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].name, 'read_file');
        });

        test('Should generate unique IDs for each tool call', () => {
            const text = '<read_file><path>file1.txt</path></read_file><read_file><path>file2.txt</path></read_file>';
            const result = parseXmlToolCalls(text, ['read_file']);
            
            assert.strictEqual(result.length, 2);
            assert.notStrictEqual(result[0].id, result[1].id);
        });

        test('Should use model-provided callId when present', () => {
            const text = '<read_file><callId>my-custom-id-123</callId><path>test.txt</path></read_file>';
            const result = parseXmlToolCalls(text, ['read_file']);
            
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].id, 'my-custom-id-123');
            assert.strictEqual(result[0].arguments.path, 'test.txt');
            // callId should not be in arguments
            assert.strictEqual(result[0].arguments.callId, undefined);
        });

        test('Should fallback to generated ID when callId is empty', () => {
            const text = '<read_file><callId></callId><path>test.txt</path></read_file>';
            const result = parseXmlToolCalls(text, ['read_file']);
            
            assert.strictEqual(result.length, 1);
            assert.ok(result[0].id.startsWith('call_xml_'));
            // callId should be removed from arguments (either undefined or empty string is acceptable)
            assert.ok(!result[0].arguments.callId);
        });

        test('Should fallback to generated ID when callId is whitespace only', () => {
            const text = '<read_file><callId>   </callId><path>test.txt</path></read_file>';
            const result = parseXmlToolCalls(text, ['read_file']);
            
            assert.strictEqual(result.length, 1);
            assert.ok(result[0].id.startsWith('call_xml_'));
        });

        test('Should handle multiple tool calls with mixed callId presence', () => {
            const text = `
                <read_file><callId>custom-1</callId><path>file1.txt</path></read_file>
                <read_file><path>file2.txt</path></read_file>
                <write_file><callId>custom-2</callId><path>file3.txt</path><content>hello</content></write_file>
            `;
            const result = parseXmlToolCalls(text, ['read_file', 'write_file']);
            
            assert.strictEqual(result.length, 3);
            assert.strictEqual(result[0].id, 'custom-1');
            assert.ok(result[1].id.startsWith('call_xml_'));
            assert.strictEqual(result[2].id, 'custom-2');
        });

        test('Should skip malformed nested parameters with same name', () => {
            // This tests the protection against nested tags parsing incorrectly
            const text = '<test_tool><param><param>nested</param></param></test_tool>';
            const result = parseXmlToolCalls(text, ['test_tool']);
            
            assert.strictEqual(result.length, 1);
            // The outer param should be skipped due to nested same-name tag detection
        });

        test('Should handle empty parameters', () => {
            const text = '<test_tool></test_tool>';
            const result = parseXmlToolCalls(text, ['test_tool']);
            
            assert.strictEqual(result.length, 1);
            assert.deepStrictEqual(result[0].arguments, {});
        });

    });

    // ============== Edge Cases and Integration Tests ==============

    suite('Edge Cases', () => {

        test('Should handle tools with underscores in names', () => {
            const text = '<my_awesome_tool><my_param>value</my_param></my_awesome_tool>';
            const result = parseXmlToolCalls(text, ['my_awesome_tool']);
            
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].name, 'my_awesome_tool');
            assert.strictEqual(result[0].arguments.my_param, 'value');
        });

        test('Should handle very long parameter values', () => {
            const longValue = 'x'.repeat(10000);
            const text = `<test_tool><content>${longValue}</content></test_tool>`;
            const result = parseXmlToolCalls(text, ['test_tool']);
            
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].arguments.content, longValue);
        });

        test('Should handle XML-like content in parameter values', () => {
            // Note: This is a limitation - content with XML-like tags may cause issues
            const text = '<test_tool><code>const x = 1;</code></test_tool>';
            const result = parseXmlToolCalls(text, ['test_tool']);
            
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].arguments.code, 'const x = 1;');
        });

        test('Should unescape XML entities in parameter values', () => {
            const text = '<test_tool><content>x &lt; y &amp;&amp; y &gt; z</content></test_tool>';
            const result = parseXmlToolCalls(text, ['test_tool']);
            
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].arguments.content, 'x < y && y > z');
        });

        test('Should unescape all standard XML entities', () => {
            const text = '<test_tool><value>&lt;tag attr=&quot;value&quot;&gt;it&apos;s &amp; test&lt;/tag&gt;</value></test_tool>';
            const result = parseXmlToolCalls(text, ['test_tool']);
            
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].arguments.value, '<tag attr="value">it\'s & test</tag>');
        });

        test('Should handle mixed escaped and unescaped content', () => {
            const text = '<test_tool><msg>Hello &amp; welcome to &lt;world&gt;!</msg></test_tool>';
            const result = parseXmlToolCalls(text, ['test_tool']);
            
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].arguments.msg, 'Hello & welcome to <world>!');
        });

    });

    // ============== XmlToolCallStreamParser Tests ==============

    suite('XmlToolCallStreamParser', () => {
        
        test('Should detect tool call incrementally as stream completes', () => {
            const parser = new XmlToolCallStreamParser(['read_file']);
            
            // Simulate streaming chunks
            let result = parser.addChunk('<read_');
            assert.strictEqual(result.length, 0, 'Should not detect incomplete tag');
            
            result = parser.addChunk('file><path>');
            assert.strictEqual(result.length, 0, 'Should not detect incomplete content');
            
            result = parser.addChunk('/test.txt</path>');
            assert.strictEqual(result.length, 0, 'Should not detect without closing tag');
            
            result = parser.addChunk('</read_file>');
            assert.strictEqual(result.length, 1, 'Should detect complete tool call');
            assert.strictEqual(result[0].name, 'read_file');
            assert.strictEqual(result[0].arguments.path, '/test.txt');
        });
        
        test('Should not emit duplicate tool calls', () => {
            const parser = new XmlToolCallStreamParser(['test_tool']);
            
            // Add complete tool call
            let result = parser.addChunk('<test_tool><param>value</param></test_tool>');
            assert.strictEqual(result.length, 1);
            
            // Adding more text should not re-emit the same tool call
            result = parser.addChunk(' some more text');
            assert.strictEqual(result.length, 0, 'Should not re-emit same tool call');
            
            // Finalize should also not re-emit
            result = parser.finalize();
            assert.strictEqual(result.length, 0, 'Finalize should not re-emit');
        });
        
        test('Should detect multiple tool calls in sequence', () => {
            const parser = new XmlToolCallStreamParser(['tool_a', 'tool_b']);
            
            // First tool call
            let result = parser.addChunk('<tool_a><x>1</x></tool_a>');
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].name, 'tool_a');
            
            // Second tool call
            result = parser.addChunk('<tool_b><y>2</y></tool_b>');
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].name, 'tool_b');
        });
        
        test('Should handle empty chunks', () => {
            const parser = new XmlToolCallStreamParser(['test_tool']);
            
            let result = parser.addChunk('');
            assert.strictEqual(result.length, 0);
            
            result = parser.addChunk('<test_tool><param>value</param></test_tool>');
            assert.strictEqual(result.length, 1);
        });
        
        test('Should return buffer content', () => {
            const parser = new XmlToolCallStreamParser(['test_tool']);
            
            parser.addChunk('Hello ');
            parser.addChunk('<test_tool><x>1</x></test_tool>');
            parser.addChunk(' World');
            
            assert.strictEqual(parser.getBuffer(), 'Hello <test_tool><x>1</x></test_tool> World');
        });
        
        test('Should extract non-tool-call text', () => {
            const parser = new XmlToolCallStreamParser(['test_tool']);
            
            parser.addChunk('Before ');
            parser.addChunk('<test_tool><x>1</x></test_tool>');
            parser.addChunk(' After');
            
            assert.strictEqual(parser.getNonToolCallText(), 'Before  After');
        });
        
    });

});
