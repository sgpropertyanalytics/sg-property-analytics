import { useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  LineChart,
  BarChart3,
  Building2,
  MapPin,
  Building,
  Wallet,
  ChevronRight,
  LogOut,
  TrendingUp,
  SlidersHorizontal,
  Filter
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { FilterBar } from '../dashboard/FilterBar';

// Navigation config
// Only Macro Overview scrolls to a section on Dashboard
// All other items navigate to separate pages
const NAVIGATION = [
  // Only this one scrolls to a section on /dashboard
  { name: 'Macro Overview', icon: LayoutDashboard, id: 'overview-macro', type: 'scroll' },
  // Power BI-style dashboard with dynamic filtering
  { name: 'Dynamic Filtering', icon: Filter, path: '/macro-overview', type: 'route', badge: 'NEW' },
  // All others navigate to separate pages
  { name: 'Price/PSF Analysis', icon: LineChart, path: '/price-analysis', type: 'route' },
  { name: 'Volume/Liquidity Analysis', icon: BarChart3, path: '/volume-analysis', type: 'route' },
  { name: 'New Sale vs Resale', icon: TrendingUp, path: '/sale-type', type: 'route' },
  { name: 'Analyze by Projects', icon: Building, path: '/projects', type: 'route' },
  { name: 'Analyze by Districts', icon: MapPin, path: '/districts', type: 'route' },
  { name: 'Budget Comparison', icon: Wallet, path: '/budget', type: 'route' }
];

export function Sidebar({ collapsed, onCollapse, onClose }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeSection, setActiveSection] = useState(null);

  // Track scroll position to update active menu item (only on Dashboard page)
  useEffect(() => {
    // Only track scroll on dashboard page
    if (location.pathname !== '/dashboard') {
      // Clear active section when not on dashboard
      setActiveSection(null);
      return;
    }

    const handleScroll = () => {
      // Only check scroll-to-section items
      const scrollItems = NAVIGATION.filter(item => item.type === 'scroll');
      const sections = scrollItems.map(item => {
        const element = document.getElementById(item.id);
        if (element) {
          const rect = element.getBoundingClientRect();
          return { id: item.id, top: rect.top, bottom: rect.bottom };
        }
        return null;
      }).filter(Boolean);

      // Find the section currently in view
      const currentSection = sections.find(section => 
        section.top <= 200 && section.bottom >= 200
      ) || sections.find(section => section.top > 0 && section.top < 300);

      if (currentSection) {
        setActiveSection(currentSection.id);
      }
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Check on mount

    return () => window.removeEventListener('scroll', handleScroll);
  }, [location.pathname]);

  const handleNavClick = (item) => {
    if (item.type === 'scroll') {
      // Scroll to section on Dashboard
      if (location.pathname !== '/dashboard') {
        // Navigate to dashboard first, then scroll
        navigate('/dashboard');
        setTimeout(() => {
          const element = document.getElementById(item.id);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setActiveSection(item.id);
          }
        }, 100);
      } else {
        // Already on dashboard, just scroll
        const element = document.getElementById(item.id);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
          setActiveSection(item.id);
        }
      }
    } else if (item.type === 'route') {
      // Navigate to separate page
      navigate(item.path);
      setActiveSection(null); // Clear active section when navigating away
    }
    
    // Close sidebar on mobile after navigation
    if (onClose) {
      onClose();
    }
  };

  return (
    <aside className={cn(
      // Deep Ocean: Dark sidebar surface
      'relative h-full bg-slate-900 border-r border-slate-800 transition-all duration-300 z-50 flex flex-col font-sans',
      collapsed ? 'w-20' : 'w-72'
    )}>
      
      {/* --- LOGO SECTION --- */}
      <div className="flex items-center gap-3 px-6 py-8 shrink-0 border-b border-slate-800/50">
        {/* Logo Box */}
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sky-500 text-white shadow-lg shadow-sky-500/20">
          <Building2 className="w-6 h-6" />
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-lg font-bold text-white tracking-tight leading-none">SG Property</span>
            <span className="text-xs text-slate-400 font-medium mt-1">Analytics</span>
          </div>
        )}
      </div>

      {/* --- MAIN MENU + GLOBAL FILTERS --- */}
      <div 
        className="flex-1 px-4 py-2"
      >
        {!collapsed && (
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 px-2">
            Main Menu
          </p>
        )}
        
        <div className="space-y-1">
          {NAVIGATION.map((item) => {
            // For scroll items: check if section is active
            // For route items: check if current path matches
            const isActive = item.type === 'scroll' 
              ? activeSection === item.id
              : location.pathname === item.path;

            return (
              <button
                key={item.name}
                onClick={() => handleNavClick(item)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all duration-200 group relative',
                  // ACTIVE STATE: White bg, shadow, dark text
                  isActive
                    ? 'bg-white text-slate-900 shadow-[0_2px_10px_-2px_rgba(0,0,0,0.05)]' 
                    : 'text-slate-500 hover:text-slate-100 hover:bg-slate-800/70',
                  collapsed && 'justify-center px-2'
                )}
              >
                <item.icon className={cn(
                  "w-5 h-5 flex-shrink-0 transition-colors",
                  isActive ? "text-slate-900" : "text-slate-400 group-hover:text-slate-200"
                )} />

                {!collapsed && (
                  <span className="flex items-center gap-2">
                    {item.name}
                    {item.badge && (
                      <span className="px-1.5 py-0.5 text-[10px] font-bold bg-sky-500 text-white rounded">
                        {item.badge}
                      </span>
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Main Filter heading */}
        {!collapsed && (
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mt-6 mb-3 px-2">
            <SlidersHorizontal className="w-4 h-4 text-slate-500" />
            <span>Main Filter</span>
          </div>
        )}
        {/* Global filter panel (was on each page; now lives in sidebar) */}
        <div className="mb-4">
          <FilterBar isSticky={false} variant="sidebar" />
        </div>
      </div>

      {/* --- USER ACCOUNT (Bottom) --- */}
      <div className="p-4 mt-auto border-t border-slate-800">
        <button className={cn(
          "w-full flex items-center gap-3 p-3 rounded-2xl transition-all group",
          // OLD (High Contrast): "bg-white border border-slate-200 shadow-sm"
          // NEW (Integrated): Dark slate background with a subtle border
          "bg-slate-800/50 border border-slate-700/50 hover:bg-slate-800 hover:border-slate-600 hover:shadow-lg hover:shadow-black/20",
          collapsed && "justify-center p-2"
        )}>
           {/* Avatar Circle */}
           <div className={cn(
             "w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shadow-inner transition-colors",
             // Use your brand Blue instead of Orange to match the theme
             "bg-sky-500 text-white group-hover:bg-sky-400" 
           )}>
             SG
           </div>

           {/* Text Info */}
           {!collapsed && (
             <div className="flex-1 text-left">
               <p className="text-sm font-bold text-slate-100 group-hover:text-white transition-colors">
                 SG Property
               </p>
               <p className="text-xs text-slate-400 group-hover:text-slate-300 transition-colors">
                 Administrator
               </p>
             </div>
           )}
           
           {/* Logout Icon */}
           {!collapsed && (
             <LogOut className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
           )}
        </button>
      </div>

      {/* --- COLLAPSE/EXPAND TOGGLE --- */}
      {!collapsed ? (
        <button 
          onClick={onCollapse}
          className="absolute -right-3 top-10 w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform text-slate-400 hover:text-slate-600 z-10"
          aria-label="Collapse sidebar"
        >
          <ChevronRight className="w-3 h-3 rotate-180" />
        </button>
      ) : (
        <button 
          onClick={onCollapse}
          className="absolute -right-3 top-10 w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform text-slate-400 hover:text-slate-600 z-10"
          aria-label="Expand sidebar"
        >
          <ChevronRight className="w-3 h-3" />
        </button>
      )}
    </aside>
  );
}
