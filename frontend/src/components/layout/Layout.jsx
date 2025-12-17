import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { cn } from '../../lib/utils';

export function Layout({ children }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false); // Mobile sidebar state

  return (
    // 1. OUTER SHELL: Dark background to match Sidebar (Deep Ocean Theme)
    <div className="flex h-screen w-full bg-slate-900 overflow-hidden">
      
      {/* Mobile Overlay - Shows when sidebar is open on mobile */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      
      {/* 2. SIDEBAR: Hidden on mobile, overlay when open */}
      <div className={`
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        fixed lg:relative inset-y-0 left-0 z-50 transition-transform duration-300 ease-in-out
      `}>
        <Sidebar
          collapsed={sidebarCollapsed}
          onCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          onClose={() => setSidebarOpen(false)}
        />
      </div>
      
      {/* Mobile Menu Button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-slate-800 text-white rounded-lg shadow-lg hover:bg-slate-700 transition-colors"
        aria-label="Toggle menu"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* 3. MAIN CONTENT WRAPPER: Fill entire space */}
      <main
        className={cn(
          "flex-1 flex flex-col transition-all duration-300 ease-in-out",
          // Background Color for the content area - fills entire space
          "bg-slate-50",
          "overflow-hidden relative" 
        )}
      >
        {/* 4. SCROLLABLE AREA: Inner container handles the scrolling */}
        {/* Added extra top padding (pt-10) to ensure Text never touches the top edge */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 pt-10 scroll-smooth">
          <div className="max-w-[1600px] mx-auto w-full pb-20">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
