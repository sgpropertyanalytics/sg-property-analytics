import * as React from 'react';

export interface FrostSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
}

export interface FrostProgressBarProps {
  visible?: boolean;
}

export interface FrostOverlayProps {
  visible?: boolean;
  showSpinner?: boolean;
  showProgress?: boolean;
  isRefreshing?: boolean;
  height?: number;
  children?: React.ReactNode;
}

export interface FrostRefreshOverlayProps {
  visible?: boolean;
  height?: number;
  children?: React.ReactNode;
}

export const FrostSpinner: React.FC<FrostSpinnerProps>;
export const FrostProgressBar: React.FC<FrostProgressBarProps>;
export const FrostOverlay: React.FC<FrostOverlayProps>;
export const FrostRefreshOverlay: React.FC<FrostRefreshOverlayProps>;
