import * as vscode from 'vscode';

/**
 * Log levels for the extension.
 * - info: Important operational information for users (output channel)
 * - warn: Warnings that users should be aware of (output channel + console)
 * - error: Errors that affect functionality (output channel + console)
 * - debug: Detailed debug information (console only when debugging)
 */
export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

/**
 * Centralized logging module for OAI2LMApi extension.
 * 
 * - Coarse-grained operation logs are output to the extension's output channel
 *   for users to understand the runtime status.
 * - Debug-level logs are printed to the debug console (if enabled) for developers.
 */
class Logger {
    private outputChannel: vscode.OutputChannel | undefined;
    private readonly extensionName = 'OAI2LMApi';

    /**
     * Initialize the logger with an output channel.
     * This should be called during extension activation.
     */
    initialize(context: vscode.ExtensionContext): void {
        this.outputChannel = vscode.window.createOutputChannel(this.extensionName);
        context.subscriptions.push(this.outputChannel);
    }

    /**
     * Formats a log message with timestamp and optional prefix.
     */
    private formatMessage(level: LogLevel, message: string, prefix?: string): string {
        const timestamp = new Date().toISOString();
        const levelStr = level.toUpperCase().padEnd(5);
        const prefixStr = prefix ? `[${prefix}] ` : '';
        return `[${timestamp}] [${levelStr}] ${prefixStr}${message}`;
    }

    /**
     * Log an informational message.
     * These are coarse-grained operation logs shown to users via the output channel.
     * Falls back to console.log if output channel is not initialized.
     * 
     * @param message - The message to log
     * @param prefix - Optional prefix (e.g., 'OpenAI', 'Gemini')
     */
    info(message: string, prefix?: string): void {
        const formatted = this.formatMessage('info', message, prefix);
        if (this.outputChannel) {
            this.outputChannel.appendLine(formatted);
        } else {
            const prefixStr = prefix ? `[${prefix}] ` : '';
            console.log(`${this.extensionName}: ${prefixStr}${message}`);
        }
    }

    /**
     * Log a warning message.
     * Shown to users via output channel and also logged to console.
     * 
     * @param message - The message to log
     * @param prefix - Optional prefix (e.g., 'OpenAI', 'Gemini')
     */
    warn(message: string, prefix?: string): void {
        const formatted = this.formatMessage('warn', message, prefix);
        if (this.outputChannel) {
            this.outputChannel.appendLine(formatted);
        }
        console.warn(`${this.extensionName}: ${prefix ? `[${prefix}] ` : ''}${message}`);
    }

    /**
     * Log an error message.
     * Shown to users via output channel and also logged to console.
     * 
     * @param message - The message to log
     * @param error - Optional error object for additional context
     * @param prefix - Optional prefix (e.g., 'OpenAI', 'Gemini')
     */
    error(message: string, error?: unknown, prefix?: string): void {
        const formatted = this.formatMessage('error', message, prefix);
        if (this.outputChannel) {
            this.outputChannel.appendLine(formatted);
            if (error) {
                const errorDetails = this.formatError(error);
                this.outputChannel.appendLine(`  Details: ${errorDetails}`);
            }
        }
        console.error(`${this.extensionName}: ${prefix ? `[${prefix}] ` : ''}${message}`, error ?? '');
    }

    /**
     * Log a debug message.
     * These are fine-grained debug logs only printed to the debug console.
     * They help developers understand detailed internal behavior.
     * 
     * @param message - The message to log
     * @param data - Optional data object to include in the log
     * @param prefix - Optional prefix (e.g., 'OpenAI', 'Gemini')
     */
    debug(message: string, data?: Record<string, unknown>, prefix?: string): void {
        const prefixStr = prefix ? `[${prefix}] ` : '';
        if (data) {
            console.debug(`${this.extensionName}: ${prefixStr}${message}`, data);
        } else {
            console.debug(`${this.extensionName}: ${prefixStr}${message}`);
        }
    }

    /**
     * Format an error object to a string for logging.
     */
    private formatError(error: unknown): string {
        if (error instanceof Error) {
            return `${error.name}: ${error.message}`;
        }
        if (typeof error === 'object' && error !== null) {
            const e = error as Record<string, unknown>;
            const parts: string[] = [];
            if (e.status !== undefined) {
                parts.push(`status=${e.status}`);
            }
            if (e.code !== undefined) {
                parts.push(`code=${e.code}`);
            }
            if (e.message !== undefined) {
                parts.push(`message=${e.message}`);
            }
            if (parts.length > 0) {
                return parts.join(', ');
            }
        }
        return String(error);
    }

    /**
     * Show the output channel to the user.
     */
    show(): void {
        this.outputChannel?.show();
    }

    /**
     * Clear the output channel.
     */
    clear(): void {
        this.outputChannel?.clear();
    }
}

/**
 * Singleton logger instance for the extension.
 */
export const logger = new Logger();
