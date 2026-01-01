import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as vscode from 'vscode';
import { Command, Response } from './types';
import * as path from 'path';

export class BackendManager {
  private process: ChildProcessWithoutNullStreams | null = null;
  private buffer = '';
  private extensionPath: string;

  constructor(extensionPath: string) {
    this.extensionPath = extensionPath;
  }

  async start(
    onMessage: (response: Response) => void,
    onExit?: () => void
  ): Promise<void> {
    if (this.process) {
      return;
    }

    // Find the Rust backend binary
    const binaryPath = this.getBinaryPath();

    if (!binaryPath) {
      const error = 'Rust backend binary not found. Please compile it with: cd ../RustBackend && cargo build --release';
      vscode.window.showErrorMessage(`FatFile: ${error}`);
      throw new Error(error);
    }

    console.log(`FatFile: Using backend binary at ${binaryPath}`);

    this.process = spawn(binaryPath, [], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Handle stdout (responses)
    this.process.stdout.on('data', (data: Buffer) => {
      this.buffer += data.toString();
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          try {
            const response: Response = JSON.parse(line);
            onMessage(response);
          } catch (err) {
            console.error('Failed to parse backend response:', line, err);
          }
        }
      }
    });

    // Handle stderr (errors and info messages)
    this.process.stderr.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          try {
            const response: Response = JSON.parse(line);
            onMessage(response);
          } catch (err) {
            console.error('Backend stderr:', line);
          }
        }
      }
    });

    this.process.on('error', (err) => {
      console.error('Backend process error:', err);
      vscode.window.showErrorMessage(`Backend process error: ${err.message}`);
    });

    this.process.on('exit', (code, signal) => {
      console.log(`Backend process exited with code ${code}, signal ${signal}`);
      if (code !== 0 && code !== null) {
        vscode.window.showErrorMessage(`Backend process crashed with code ${code}`);
      }
      this.process = null;
      if (onExit) {
        onExit();
      }
    });

    // Keep the process alive
    this.process.stdin.on('error', (err) => {
      console.error('Backend stdin error:', err);
    });
  }

  private getBinaryPath(): string | null {
    const fs = require('fs');

    // Detect platform and architecture
    const platform = process.platform; // 'linux', 'darwin', 'win32', etc.
    const arch = process.arch; // 'x64', 'arm64', etc.

    // Construct platform-specific binary name
    let binaryName: string;
    if (platform === 'win32') {
      binaryName = `FatFile-${platform}-${arch}.exe`;
    } else {
      binaryName = `FatFile-${platform}-${arch}`;
    }

    // Check for platform-specific binary in the bin folder
    const platformBinaryPath = path.join(this.extensionPath, 'bin', binaryName);
    if (fs.existsSync(platformBinaryPath)) {
      return platformBinaryPath;
    }

    // Fallback: Try development build locations
    const possiblePaths = [
      path.join(this.extensionPath, '..', 'RustBackend', 'target', 'release', 'FatFile'),
      path.join(this.extensionPath, '..', 'RustBackend', 'target', 'debug', 'FatFile'),
      path.join(this.extensionPath, '..', 'target', 'release', 'FatFile'),
      path.join(this.extensionPath, '..', 'target', 'debug', 'FatFile'),
    ];

    for (const binaryPath of possiblePaths) {
      if (fs.existsSync(binaryPath)) {
        return binaryPath;
      }
    }

    return null;
  }

  sendCommand(command: Command): void {
    if (!this.process || !this.process.stdin.writable) {
      console.error('Backend process is not running or stdin not writable');
      throw new Error('Backend process is not running');
    }

    const commandStr = JSON.stringify(command);
    console.log('Sending command to backend:', commandStr);
    this.process.stdin.write(commandStr + '\n');
  }

  dispose(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}
