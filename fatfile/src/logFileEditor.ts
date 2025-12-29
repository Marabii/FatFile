import * as vscode from 'vscode';
import { BackendManager } from './backendManager';
import { Response, WebviewMessage } from './types';

export class LogFileEditorProvider implements vscode.CustomReadonlyEditorProvider {
  public static readonly viewType = 'fatfile.viewer';

  private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentContentChangeEvent<LogFileDocument>>();
  public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  async openCustomDocument(
    uri: vscode.Uri,
    openContext: vscode.CustomDocumentOpenContext,
    token: vscode.CancellationToken
  ): Promise<LogFileDocument> {
    return new LogFileDocument(uri);
  }

  async resolveCustomEditor(
    document: LogFileDocument,
    webviewPanel: vscode.WebviewPanel,
    token: vscode.CancellationToken
  ): Promise<void> {
    console.log('Resolving custom editor for:', document.uri.fsPath);

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);
    console.log('Webview HTML set');

    const backendManager = new BackendManager(this.context.extensionPath);

    // Start backend and handle responses
    try {
      await backendManager.start((response: Response) => {
        webviewPanel.webview.postMessage({
          type: 'response',
          data: response
        });
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start backend';
      vscode.window.showErrorMessage(`FatFile: ${errorMessage}`);
      webviewPanel.webview.postMessage({
        type: 'error',
        message: errorMessage
      });
      return;
    }

    // Handle messages from webview
    webviewPanel.webview.onDidReceiveMessage((message: WebviewMessage) => {
      console.log('Received message from webview:', message);
      try {
        switch (message.type) {
          case 'openFile':
            console.log('Opening file:', message.path);
            backendManager.sendCommand({
              OpenFile: {
                path: message.path,
                pattern: message.pattern,
                nbr_columns: message.nbr_columns
              }
            });
            break;

          case 'getChunk':
            backendManager.sendCommand({
              GetChunk: {
                start_line: message.start_line,
                end_line: message.end_line
              }
            });
            break;

          case 'search':
            backendManager.sendCommand({
              Search: {
                pattern: message.pattern
              }
            });
            break;
        }
      } catch (err) {
        webviewPanel.webview.postMessage({
          type: 'error',
          message: err instanceof Error ? err.message : 'Unknown error'
        });
      }
    });

    // Cleanup on dispose
    webviewPanel.onDidDispose(() => {
      backendManager.dispose();
    });

    // Wait a bit for webview to be ready, then initialize the file
    setTimeout(() => {
      webviewPanel.webview.postMessage({
        type: 'init',
        filePath: document.uri.fsPath
      });
    }, 100);
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js')
    );

    const nonce = getNonce();

    console.log('Script URI:', scriptUri.toString());

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource}; connect-src ${webview.cspSource} https:; img-src ${webview.cspSource} https: data:; font-src ${webview.cspSource};">
  <title>FatFile Viewer</title>
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    #root {
      width: 100%;
      height: 100%;
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    console.log('FatFile webview loading...');
    console.log('Script URI: ${scriptUri}');
  </script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
  <script nonce="${nonce}">
    console.log('FatFile webview script loaded');
  </script>
</body>
</html>`;
  }
}

class LogFileDocument implements vscode.CustomDocument {
  constructor(public readonly uri: vscode.Uri) {}

  dispose(): void {}
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
