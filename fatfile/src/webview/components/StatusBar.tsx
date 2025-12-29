import React from 'react';

interface StatusBarProps {
  fileName: string;
  lineCount: number;
  searchResultCount: number;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  fileName,
  lineCount,
  searchResultCount
}) => {
  return (
    <div className="flex items-center justify-between px-4 py-2 text-xs border-t"
         style={{ borderColor: 'var(--vscode-panel-border)', backgroundColor: 'var(--vscode-statusBar-background)', color: 'var(--vscode-statusBar-foreground)' }}>
      <div className="flex items-center gap-4">
        <span className="font-semibold">{fileName}</span>
        <span className="opacity-70">{lineCount.toLocaleString()} lines</span>
      </div>

      {searchResultCount > 0 && (
        <div className="flex items-center gap-2">
          <span className="opacity-70">{searchResultCount.toLocaleString()} matches</span>
        </div>
      )}
    </div>
  );
};
