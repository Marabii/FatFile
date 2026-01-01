import React, { useState, useEffect } from 'react';
import type { LogFormat } from '../../types';
import {
  VSCodeButton,
  VSCodeTextField,
  VSCodeCheckbox
} from '@vscode/webview-ui-toolkit/react';

interface ParsingPreviewPanelProps {
  logFormat: LogFormat;
  previewLines: string[][];
  onApply: (logFormat: LogFormat, pattern?: string, nbrColumns?: number) => void;
  onSkip: () => void;
}

// Regex patterns from the Rust backend
const LOG_FORMAT_PATTERNS: Record<Exclude<LogFormat, 'Other'>, { pattern: string; columns: number }> = {
  CommonEventFormat: {
    pattern: '^CEF:(\\d+)\\|([^|]+)\\|([^|]+)\\|([^|]+)\\|([^|]+)\\|([^|]+)\\|(\\d+)\\|(.*)$',
    columns: 8
  },
  W3CExtended: {
    pattern: '^(\\d{4}-\\d{2}-\\d{2})\\s(\\d{2}:\\d{2}:\\d{2})\\s(\\S+)\\s(\\S+)\\s(\\S+)',
    columns: 5
  },
  SyslogRFC5424: {
    pattern: '^<(\\d{1,3})>1\\s(\\S+)\\s(\\S+)\\s(\\S+)\\s(\\S+)\\s(\\S+)\\s(\\[(?:.+)\\]|-) (.*)$',
    columns: 8
  },
  NCSACombined: {
    pattern: '^(\\d{1,3}(?:\\.\\d{1,3}){3}) - - \\[(.*?)\\] "(.*?)" (\\d{3}) (\\d+|-)$',
    columns: 5
  },
  CommonLogFormat: {
    pattern: '^(\\S+) \\S+ (\\S+) \\[([\\w:/]+\\s[+\\-]\\d{4})\\] "(\\S+) (\\S+)\\s*(\\S+)?\\s*" (\\d{3}) (\\S+)',
    columns: 8
  },
  SyslogRFC3164: {
    pattern: '^<(\\d{1,3})>([A-Z][a-z]{2}\\s{1,2}\\d{1,2}\\s\\d{2}:\\d{2}:\\d{2})\\s(\\S+)\\s([^:]+):\\s(.*)$',
    columns: 5
  }
};

export const ParsingPreviewPanel: React.FC<ParsingPreviewPanelProps> = ({
  logFormat,
  previewLines,
  onApply,
  onSkip
}) => {
  console.log('[MODAL] ParsingPreviewPanel rendered with:', {
    logFormat,
    previewLinesLength: previewLines.length,
    previewLines: previewLines.slice(0, 2)
  });

  const [customPattern, setCustomPattern] = useState<string>('');
  const [customColumns, setCustomColumns] = useState<number>(0);
  const [useCustomPattern, setUseCustomPattern] = useState(false);
  const [parsedPreview, setParsedPreview] = useState<(string[] | null)[]>([]);

  const currentPattern = useCustomPattern && customPattern
    ? customPattern
    : logFormat !== 'Other' ? LOG_FORMAT_PATTERNS[logFormat].pattern : '';

  const currentColumns = useCustomPattern && customColumns > 0
    ? customColumns
    : logFormat !== 'Other' ? LOG_FORMAT_PATTERNS[logFormat].columns : 0;

  useEffect(() => {
    // Parse preview lines using the current pattern
    if (!currentPattern) {
      setParsedPreview(previewLines.map(() => null));
      return;
    }

    try {
      const regex = new RegExp(currentPattern);
      const parsed = previewLines.map(line => {
        const lineText = line[0];
        const match = regex.exec(lineText);
        if (match) {
          // Return captured groups (skip the full match at index 0)
          return match.slice(1);
        }
        return null;
      });
      setParsedPreview(parsed);
    } catch (err) {
      console.error('Invalid regex pattern:', err);
      setParsedPreview(previewLines.map(() => null));
    }
  }, [currentPattern, previewLines]);

  const handleApply = () => {
    if (useCustomPattern && customPattern && customColumns > 0) {
      onApply('Other', customPattern, customColumns);
    } else {
      onApply(logFormat);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-container">
        <div className="modal-header">
          <h2>Configure Log Parsing</h2>
          <p className="subtitle">
            Detected format: <strong>{logFormat}</strong>
          </p>
        </div>

        <div className="modal-content">
          <div className="preview-section">
            <h3>Preview (First {previewLines.length} lines)</h3>
            <div className="table-wrapper">
              <table className="preview-table">
                <thead>
                  <tr>
                    <th className="line-num-header">#</th>
                    {currentColumns > 0 ? (
                      Array.from({ length: currentColumns }, (_, i) => (
                        <th key={i}>Col {i + 1}</th>
                      ))
                    ) : (
                      <th>Raw Line</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {parsedPreview.map((parsedLine, idx) => (
                    <tr key={idx}>
                      <td className="line-num">{idx + 1}</td>
                      {parsedLine ? (
                        parsedLine.map((col, colIdx) => (
                          <td key={colIdx} className="parsed-cell">{col}</td>
                        ))
                      ) : (
                        <td className="unparsed-cell" colSpan={currentColumns || 1}>
                          {previewLines[idx][0]}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="config-section">
            <div className="checkbox-row">
              <VSCodeCheckbox
                checked={useCustomPattern}
                onChange={(e: any) => setUseCustomPattern(e.target.checked)}
              >
                Use custom pattern
              </VSCodeCheckbox>
            </div>

            {useCustomPattern && (
              <div className="custom-fields">
                <div className="field-group">
                  <label htmlFor="pattern-input">Regex Pattern:</label>
                  <VSCodeTextField
                    id="pattern-input"
                    value={customPattern}
                    onInput={(e: any) => setCustomPattern(e.target.value)}
                    placeholder="Enter regex pattern with capture groups"
                    style={{ width: '100%' }}
                  />
                </div>

                <div className="field-group">
                  <label htmlFor="columns-input">Number of Columns:</label>
                  <VSCodeTextField
                    id="columns-input"
                    value={customColumns > 0 ? customColumns.toString() : ''}
                    onInput={(e: any) => {
                      const val = e.target.value;
                      const num = parseInt(val);
                      setCustomColumns(isNaN(num) ? 0 : num);
                    }}
                    placeholder="Number of capture groups"
                    style={{ width: '200px' }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <VSCodeButton appearance="secondary" onClick={onSkip}>
            Skip Parsing
          </VSCodeButton>
          <VSCodeButton
            appearance="primary"
            onClick={handleApply}
            disabled={logFormat === 'Other' && (!customPattern || customColumns === 0)}
          >
            Apply Parsing
          </VSCodeButton>
        </div>
      </div>

      <style>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          padding: 20px;
        }

        .modal-container {
          background: var(--vscode-editor-background);
          border: 1px solid var(--vscode-panel-border);
          border-radius: 6px;
          width: 90%;
          max-width: 1200px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        }

        .modal-header {
          padding: 20px 24px;
          border-bottom: 1px solid var(--vscode-panel-border);
        }

        .modal-header h2 {
          margin: 0 0 8px 0;
          font-size: 18px;
          font-weight: 600;
          color: var(--vscode-editor-foreground);
        }

        .subtitle {
          margin: 0;
          font-size: 14px;
          color: var(--vscode-descriptionForeground);
        }

        .modal-content {
          flex: 1;
          overflow: auto;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .preview-section h3 {
          margin: 0 0 12px 0;
          font-size: 13px;
          font-weight: 600;
          text-transform: uppercase;
          color: var(--vscode-descriptionForeground);
          letter-spacing: 0.5px;
        }

        .table-wrapper {
          overflow: auto;
          border: 1px solid var(--vscode-panel-border);
          border-radius: 4px;
          max-height: 400px;
        }

        .preview-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
          font-family: var(--vscode-editor-font-family);
        }

        .preview-table th {
          background: var(--vscode-editorGroupHeader-tabsBackground);
          padding: 10px 12px;
          text-align: left;
          font-weight: 600;
          border-bottom: 2px solid var(--vscode-panel-border);
          position: sticky;
          top: 0;
          z-index: 1;
          color: var(--vscode-editor-foreground);
        }

        .preview-table td {
          padding: 8px 12px;
          border-bottom: 1px solid var(--vscode-panel-border);
          color: var(--vscode-editor-foreground);
        }

        .line-num-header,
        .line-num {
          color: var(--vscode-editorLineNumber-foreground);
          text-align: right;
          font-weight: 600;
          width: 50px;
          background: var(--vscode-editorGutter-background);
        }

        .parsed-cell {
          max-width: 250px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .unparsed-cell {
          font-style: italic;
          color: var(--vscode-descriptionForeground);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .config-section {
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 16px;
          background: var(--vscode-editorWidget-background);
          border: 1px solid var(--vscode-panel-border);
          border-radius: 4px;
        }

        .checkbox-row {
          display: flex;
          align-items: center;
        }

        .custom-fields {
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding-left: 32px;
          margin-top: 8px;
        }

        .field-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .field-group label {
          font-size: 13px;
          font-weight: 500;
          color: var(--vscode-editor-foreground);
        }

        .modal-footer {
          padding: 16px 24px;
          border-top: 1px solid var(--vscode-panel-border);
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          background: var(--vscode-editorWidget-background);
        }
      `}</style>
    </div>
  );
};
