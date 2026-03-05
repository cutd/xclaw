export type ErrorSeverity = 'info' | 'warning' | 'error' | 'fatal';

export class XClawError extends Error {
  public readonly code: string;
  public readonly severity: ErrorSeverity;
  public readonly suggestion: string;
  public readonly docLink?: string;
  public readonly context?: Record<string, unknown>;

  constructor(params: {
    code: string;
    message: string;
    severity: ErrorSeverity;
    suggestion: string;
    docLink?: string;
    context?: Record<string, unknown>;
  }) {
    super(params.message);
    this.name = 'XClawError';
    this.code = params.code;
    this.severity = params.severity;
    this.suggestion = params.suggestion;
    this.docLink = params.docLink;
    this.context = params.context;
  }

  toUserFriendly(): string {
    let output = `[${this.severity.toUpperCase()}] ${this.message} (${this.code})`;
    output += `\n  建议: ${this.suggestion}`;
    if (this.docLink) {
      output += `\n  文档: ${this.docLink}`;
    }
    return output;
  }
}
