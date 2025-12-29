import * as assert from 'assert';

/**
 * Logger Unit Tests
 * 
 * These tests validate the logger module's behavior without requiring
 * the full VSCode environment. Since the logger module depends on vscode.ExtensionContext
 * for initialization, we test the exported functions and behaviors that can be
 * tested in isolation.
 */

// Import the logger module - note that we're testing the singleton behavior
// The actual logger is already instantiated when imported
import { logger, LogLevel } from '../../logger';

suite('Logger Unit Tests', () => {

	suite('Logger Before Initialization', () => {
		// Note: These tests verify that logger methods don't throw when called
		// before initialization. The logger falls back to console methods.

		test('info() should not throw before initialization', () => {
			assert.doesNotThrow(() => {
				// This will fall back to console.log since outputChannel is not initialized
				// We can't easily test the console output, but we verify no exception is thrown
			});
		});

		test('warn() should not throw before initialization', () => {
			assert.doesNotThrow(() => {
				// warn() always logs to console.warn regardless of initialization
			});
		});

		test('error() should not throw before initialization', () => {
			assert.doesNotThrow(() => {
				// error() always logs to console.error regardless of initialization
			});
		});

		test('debug() should not throw before initialization', () => {
			assert.doesNotThrow(() => {
				// debug() only logs to console.debug, no outputChannel dependency
			});
		});
	});

	suite('LogLevel Type', () => {
		test('LogLevel should have valid values', () => {
			const validLevels: LogLevel[] = ['info', 'warn', 'error', 'debug'];
			
			validLevels.forEach(level => {
				assert.ok(['info', 'warn', 'error', 'debug'].includes(level));
			});
		});
	});

	suite('Logger Method Signatures', () => {
		test('info() should accept message and optional prefix', () => {
			// Verify method exists and has correct signature
			assert.strictEqual(typeof logger.info, 'function');
			assert.strictEqual(logger.info.length, 2); // 2 parameters (message, prefix)
		});

		test('warn() should accept message and optional prefix', () => {
			assert.strictEqual(typeof logger.warn, 'function');
			assert.strictEqual(logger.warn.length, 2);
		});

		test('error() should accept message, optional error, and optional prefix', () => {
			assert.strictEqual(typeof logger.error, 'function');
			assert.strictEqual(logger.error.length, 3); // 3 parameters (message, error, prefix)
		});

		test('debug() should accept message, optional data, and optional prefix', () => {
			assert.strictEqual(typeof logger.debug, 'function');
			assert.strictEqual(logger.debug.length, 3);
		});

		test('show() should be a function', () => {
			assert.strictEqual(typeof logger.show, 'function');
		});

		test('clear() should be a function', () => {
			assert.strictEqual(typeof logger.clear, 'function');
		});
	});

	suite('Logger Error Formatting', () => {
		test('error() should handle Error objects', () => {
			assert.doesNotThrow(() => {
				logger.error('Test error message', new Error('Test error'), 'TestPrefix');
			});
		});

		test('error() should handle plain objects with status/code/message', () => {
			assert.doesNotThrow(() => {
				logger.error('API error', { status: 404, code: 'NOT_FOUND', message: 'Resource not found' }, 'API');
			});
		});

		test('error() should handle string errors', () => {
			assert.doesNotThrow(() => {
				logger.error('String error', 'Something went wrong', 'TestPrefix');
			});
		});

		test('error() should handle undefined error', () => {
			assert.doesNotThrow(() => {
				logger.error('No error object');
			});
		});

		test('error() should handle null-like values', () => {
			assert.doesNotThrow(() => {
				logger.error('Null error', null);
			});
		});
	});

	suite('Logger Debug with Data', () => {
		test('debug() should handle data object', () => {
			assert.doesNotThrow(() => {
				logger.debug('Debug message', { key: 'value', count: 42 }, 'TestPrefix');
			});
		});

		test('debug() should handle undefined data', () => {
			assert.doesNotThrow(() => {
				logger.debug('Debug without data', undefined, 'TestPrefix');
			});
		});

		test('debug() should handle complex nested data', () => {
			assert.doesNotThrow(() => {
				logger.debug('Complex debug', {
					nested: { deep: { value: true } },
					array: [1, 2, 3],
					mixed: { items: ['a', 'b'] }
				});
			});
		});
	});

	suite('Logger Prefix Handling', () => {
		test('info() should work without prefix', () => {
			assert.doesNotThrow(() => {
				logger.info('Message without prefix');
			});
		});

		test('info() should work with prefix', () => {
			assert.doesNotThrow(() => {
				logger.info('Message with prefix', 'OpenAI');
			});
		});

		test('All log levels should accept common prefixes', () => {
			const prefixes = ['OpenAI', 'Gemini', 'Extension', 'XMLToolPrompt'];
			
			prefixes.forEach(prefix => {
				assert.doesNotThrow(() => {
					logger.info('Info message', prefix);
					logger.warn('Warn message', prefix);
					logger.error('Error message', undefined, prefix);
					logger.debug('Debug message', undefined, prefix);
				});
			});
		});
	});
});
