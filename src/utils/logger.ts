import * as vscode from 'vscode';

/**
 * Structured logger wrapping a VS Code OutputChannel.
 *
 * Every message is prefixed with an ISO-8601 timestamp and
 * a level tag so that entries are easy to filter in the
 * "AI Agent Hub" output panel.
 */
export class Logger {
  private readonly channel: vscode.OutputChannel;

  constructor() {
    this.channel = vscode.window.createOutputChannel('AI Agent Hub');
  }

  info(message: string): void {
    this.log('INFO', message);
  }

  warn(message: string): void {
    this.log('WARN', message);
  }

  error(message: string): void {
    this.log('ERROR', message);
  }

  debug(message: string): void {
    this.log('DEBUG', message);
  }

  dispose(): void {
    this.channel.dispose();
  }

  private log(level: string, message: string): void {
    const timestamp = new Date().toISOString();
    this.channel.appendLine(`[${timestamp}] [${level}] ${message}`);
  }
}
