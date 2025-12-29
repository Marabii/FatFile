module.exports = {
  content: [
    "./src/webview/**/*.{ts,tsx,js,jsx}"
  ],
  theme: {
    extend: {
      colors: {
        'vscode-bg': 'var(--vscode-editor-background)',
        'vscode-fg': 'var(--vscode-editor-foreground)',
        'vscode-border': 'var(--vscode-panel-border)',
        'vscode-input-bg': 'var(--vscode-input-background)',
        'vscode-input-fg': 'var(--vscode-input-foreground)',
        'vscode-input-border': 'var(--vscode-input-border)',
        'vscode-button-bg': 'var(--vscode-button-background)',
        'vscode-button-hover': 'var(--vscode-button-hoverBackground)',
        'vscode-button-fg': 'var(--vscode-button-foreground)',
        'vscode-list-hover': 'var(--vscode-list-hoverBackground)',
        'vscode-list-active': 'var(--vscode-list-activeSelectionBackground)',
      }
    }
  },
  plugins: []
};
