import { randomBytes } from 'crypto';

/**
 * Generates a cryptographic nonce for Content Security Policy
 * headers in webview panels.
 *
 * @returns A 32-character hex string.
 */
export function getNonce(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Returns a CSS string that integrates with VS Code's theming
 * variables. Provides base layout, typography, form controls,
 * tab bar, badges, buttons, and utility classes used by both
 * the Hub panel and Setup panel webviews.
 */
export function getBaseStyles(): string {
  return /* css */ `
    :root {
      --container-padding: 16px;
      --border-radius: 4px;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: var(--container-padding);
      line-height: 1.5;
    }

    h1, h2, h3 {
      font-weight: 600;
      margin-bottom: 8px;
    }

    h1 { font-size: 1.4em; }
    h2 { font-size: 1.2em; }
    h3 { font-size: 1.05em; }

    /* Tab bar */
    .tab-bar {
      display: flex;
      gap: 2px;
      border-bottom: 1px solid var(--vscode-panel-border);
      margin-bottom: 16px;
      flex-wrap: wrap;
    }

    .tab-btn {
      padding: 8px 16px;
      background: transparent;
      color: var(--vscode-foreground);
      border: none;
      border-bottom: 2px solid transparent;
      cursor: pointer;
      font-size: var(--vscode-font-size);
      font-family: var(--vscode-font-family);
      opacity: 0.7;
      transition: opacity 0.15s, border-color 0.15s;
    }

    .tab-btn:hover {
      opacity: 1;
    }

    .tab-btn.active {
      opacity: 1;
      border-bottom-color: var(--vscode-focusBorder);
      color: var(--vscode-focusBorder);
    }

    /* Content area */
    .tab-content {
      display: none;
    }

    .tab-content.active {
      display: block;
    }

    /* Buttons */
    button, .btn {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      cursor: pointer;
      border-radius: var(--border-radius);
    }

    .btn-primary {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 6px 14px;
    }

    .btn-primary:hover {
      background-color: var(--vscode-button-hoverBackground);
    }

    .btn-secondary {
      background-color: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      padding: 6px 14px;
    }

    .btn-secondary:hover {
      background-color: var(--vscode-button-secondaryHoverBackground);
    }

    .btn-danger {
      background-color: var(--vscode-inputValidation-errorBackground, #5a1d1d);
      color: var(--vscode-errorForeground, #f48771);
      border: 1px solid var(--vscode-inputValidation-errorBorder, #be1100);
      padding: 6px 14px;
    }

    .btn-icon {
      background: transparent;
      border: none;
      color: var(--vscode-foreground);
      padding: 4px 6px;
      opacity: 0.7;
    }

    .btn-icon:hover {
      opacity: 1;
    }

    /* Item list */
    .item-list {
      list-style: none;
    }

    .item-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .item-row:last-child {
      border-bottom: none;
    }

    .item-name {
      font-weight: 600;
      min-width: 120px;
    }

    .item-desc {
      flex: 1;
      opacity: 0.8;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .item-actions {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
    }

    /* Badges */
    .badge {
      display: inline-block;
      padding: 1px 8px;
      border-radius: 10px;
      font-size: 0.8em;
      font-weight: 600;
      text-transform: uppercase;
    }

    .badge-builtin {
      background-color: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }

    .badge-user {
      background-color: var(--vscode-extensionButton-prominentBackground, #327e36);
      color: var(--vscode-extensionButton-prominentForeground, #fff);
    }

    .badge-high {
      background-color: var(--vscode-testing-iconPassed, #73c991);
      color: #000;
    }

    .badge-medium {
      background-color: var(--vscode-editorWarning-foreground, #cca700);
      color: #000;
    }

    .badge-low {
      background-color: var(--vscode-disabledForeground, #888);
      color: #000;
    }

    /* Toggle switch */
    .toggle {
      position: relative;
      width: 36px;
      height: 20px;
      flex-shrink: 0;
    }

    .toggle input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    .toggle-slider {
      position: absolute;
      inset: 0;
      background-color: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, #444);
      border-radius: 10px;
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .toggle-slider::before {
      content: '';
      position: absolute;
      width: 14px;
      height: 14px;
      left: 2px;
      top: 2px;
      background-color: var(--vscode-foreground);
      border-radius: 50%;
      transition: transform 0.2s;
    }

    .toggle input:checked + .toggle-slider {
      background-color: var(--vscode-focusBorder);
    }

    .toggle input:checked + .toggle-slider::before {
      transform: translateX(16px);
    }

    /* Forms */
    .form-group {
      margin-bottom: 12px;
    }

    .form-group label {
      display: block;
      margin-bottom: 4px;
      font-weight: 600;
    }

    input[type="text"],
    textarea,
    select {
      width: 100%;
      padding: 6px 8px;
      background-color: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, #444);
      border-radius: var(--border-radius);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }

    input[type="text"]:focus,
    textarea:focus,
    select:focus {
      outline: 1px solid var(--vscode-focusBorder);
    }

    textarea {
      min-height: 80px;
      resize: vertical;
    }

    select {
      cursor: pointer;
    }

    /* Form panel */
    .form-panel {
      background-color: var(--vscode-sideBar-background, var(--vscode-editor-background));
      border: 1px solid var(--vscode-panel-border);
      border-radius: var(--border-radius);
      padding: 16px;
      margin-bottom: 16px;
    }

    .form-actions {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }

    /* Error / info messages */
    .error-msg {
      color: var(--vscode-errorForeground, #f48771);
      font-size: 0.9em;
      margin-top: 4px;
    }

    .info-msg {
      color: var(--vscode-descriptionForeground);
      font-style: italic;
      padding: 12px;
    }

    /* Sync result */
    .sync-result {
      border: 1px solid var(--vscode-panel-border);
      border-radius: var(--border-radius);
      padding: 12px;
      margin-bottom: 12px;
    }

    .sync-timestamp {
      font-size: 0.9em;
      opacity: 0.7;
      margin-bottom: 8px;
    }

    .sync-agent {
      margin-bottom: 8px;
      padding: 8px;
      border-left: 3px solid var(--vscode-focusBorder);
    }

    .sync-files {
      font-size: 0.9em;
      opacity: 0.8;
    }

    .sync-errors {
      color: var(--vscode-errorForeground, #f48771);
      font-size: 0.9em;
    }

    /* Agent config card */
    .agent-card {
      border: 1px solid var(--vscode-panel-border);
      border-radius: var(--border-radius);
      padding: 12px;
      margin-bottom: 10px;
    }

    .agent-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
    }

    .agent-card-details {
      font-size: 0.9em;
      opacity: 0.8;
    }

    /* Empty state */
    .empty-state {
      text-align: center;
      padding: 32px 16px;
      opacity: 0.6;
    }

    /* Toolbar */
    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    /* Candidate card (setup panel) */
    .candidate-card {
      border: 1px solid var(--vscode-panel-border);
      border-radius: var(--border-radius);
      padding: 12px;
      margin-bottom: 10px;
    }

    .candidate-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .candidate-desc {
      font-size: 0.9em;
      opacity: 0.8;
      margin-top: 4px;
    }

    /* Config section */
    .config-section {
      border: 1px solid var(--vscode-panel-border);
      border-radius: var(--border-radius);
      padding: 12px;
      margin-top: 12px;
      margin-bottom: 12px;
    }

    .config-section h3 {
      margin-bottom: 12px;
    }

    .config-type-row {
      display: grid;
      grid-template-columns: 100px 1fr;
      gap: 8px;
      align-items: center;
      margin-bottom: 8px;
    }

    .config-type-row label {
      font-weight: 600;
      text-transform: capitalize;
    }

    .inline-fields {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
    }

    .inline-fields input[type="text"] {
      flex: 1;
      min-width: 120px;
    }

    .inline-fields select {
      width: auto;
      min-width: 100px;
    }
  `;
}

/**
 * Returns a JavaScript snippet that acquires the VS Code
 * webview API and sets up the base `postMessage` helper.
 * This script should be included in every webview panel.
 */
export function getBaseScriptSetup(): string {
  return /* js */ `
    const vscode = acquireVsCodeApi();

    function postMsg(type, data) {
      vscode.postMessage({ type, ...data });
    }
  `;
}
