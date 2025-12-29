import * as vscode from 'vscode';
import { LogFileEditorProvider } from './logFileEditor';

export function activate(context: vscode.ExtensionContext) {
	console.log('FatFile extension is now active!');

	// Register custom editor provider
	const provider = new LogFileEditorProvider(context);
	const providerDisposable = vscode.window.registerCustomEditorProvider(
		LogFileEditorProvider.viewType,
		provider,
		{
			webviewOptions: {
				retainContextWhenHidden: true,
			},
		}
	);

	// Register command to open with FatFile viewer
	const commandDisposable = vscode.commands.registerCommand('fatfile.openWithViewer', async () => {
		const uris = await vscode.window.showOpenDialog({
			canSelectMany: false,
			filters: {
				'Log Files': ['log', 'txt']
			}
		});

		if (uris && uris.length > 0) {
			await vscode.commands.executeCommand('vscode.openWith', uris[0], LogFileEditorProvider.viewType);
		}
	});

	context.subscriptions.push(providerDisposable, commandDisposable);
}

export function deactivate() {}
