import React from 'react';

/**
 * TerminalShell - The "Monitor" Frame
 * 
 * This component implements the "pro-grade containment" strategy.
 * It creates a distinct "Void" (outer space) vs "Terminal" (workspace) boundary.
 * 
 * Structure:
 * - Void: The dark, infinite background
 * - Chassis: The physical container of the terminal
 * - Screen: The actual content area
 */
export const TerminalShell = ({ children, className = '' }) => {
  return (
    <div className="min-h-screen bg-mono-void flex flex-col items-center justify-start p-0 lg:p-6 overflow-hidden">
      {/* The Terminal Chassis */}
      <div className="w-full max-w-[1600px] flex-1 flex flex-col relative bg-mono-canvas shadow-2xl overflow-hidden terminal-container border border-mono-edge/50 lg:rounded-sm">
        
        {/* HUD Elements - Decorative overlays that signal "Military/Industrial" */}
        
        {/* Top Left Bracket */}
        <div className="hidden lg:block absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-black/80 z-50 pointer-events-none" />
        
        {/* Top Right Bracket */}
        <div className="hidden lg:block absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-black/80 z-50 pointer-events-none" />
        
        {/* Bottom Left Bracket */}
        <div className="hidden lg:block absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-black/80 z-50 pointer-events-none" />
        
        {/* Bottom Right Bracket */}
        <div className="hidden lg:block absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-black/80 z-50 pointer-events-none" />

        {/* Status Line - Top */}
        <div className="hidden lg:flex absolute top-0 inset-x-0 h-8 items-center justify-between px-12 z-40 bg-white/50 backdrop-blur-sm border-b border-black/5">
          <div className="flex items-center gap-4">
            <span className="font-mono text-[10px] tracking-[0.2em] text-black/40">SYS.READY</span>
            <span className="font-mono text-[10px] tracking-[0.2em] text-black/40">ENCRYPTED_SHA256</span>
          </div>
          <div className="flex items-center gap-4">
             <div className="h-px w-24 bg-black/10" />
             <span className="font-mono text-[10px] tracking-[0.2em] text-emerald-600 animate-pulse">● SIGNAL_LIVE</span>
          </div>
        </div>

        {/* Main Content Area */}
        <div className={`flex-1 relative z-10 flex flex-col ${className}`}>
          {children}
        </div>
        
        {/* Grid Overlay (Subtle) */}
        <div className="absolute inset-0 pointer-events-none weapon-guide-lines opacity-[0.4] z-0 mix-blend-multiply" />
      </div>
    </div>
  );
};
