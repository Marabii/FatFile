import React from 'react';

interface LoadingSpinnerProps {
  message?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ message = 'Loading...' }) => {
  return (
    <div className="flex flex-col items-center justify-center gap-4 animate-fade-in">
      <div className="w-12 h-12 border-4 border-vscode-input-border border-t-vscode-button-bg rounded-full animate-spin" />
      <div className="text-sm opacity-70">{message}</div>
    </div>
  );
};
