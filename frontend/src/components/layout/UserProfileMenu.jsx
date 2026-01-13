import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { getInitials } from '../../utils/formatters';

/**
 * UserProfileMenu - Bottom-left user profile in GlobalNavRail
 *
 * Simplified: Clicking directly opens Account Settings modal
 * No dropdown - direct action for better UX
 */
export const UserProfileMenu = React.memo(function UserProfileMenu({ expanded = false, onOpenSettings }) {
  const { user, isAuthenticated } = useAuth();
  const { canAccessPremium } = useSubscription();
  const navigate = useNavigate();

  // Show "Sign In" button for non-authenticated users
  if (!isAuthenticated || !user) {
    return (
      <button
        onClick={() => navigate('/login')}
        className={`
          group relative flex items-center w-full py-2
          hover:bg-white/5 transition-all duration-150 ease-out cursor-pointer
          border-l-[3px] border-l-transparent
          ${expanded ? 'pl-6 pr-4 gap-3' : 'justify-center px-0'}
        `}
        aria-label="Sign In"
      >
        <div className={`${expanded ? 'w-6 h-6 mr-3' : 'w-7 h-7'} rounded-full bg-slate-700 overflow-hidden flex items-center justify-center flex-shrink-0`}>
          <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
          </svg>
        </div>

        {expanded && (
          <span className="text-sm font-medium text-slate-400 group-hover:text-white transition-colors">
            Sign In
          </span>
        )}

        {/* Tooltip when collapsed */}
        {!expanded && (
          <div className="absolute left-full ml-2 z-50 hidden group-hover:block px-2 py-1.5 text-xs font-medium text-white bg-slate-800 rounded shadow-lg whitespace-nowrap">
            Sign In
          </div>
        )}
      </button>
    );
  }

  // Authenticated user - click to open settings modal directly
  return (
    <button
      onClick={() => onOpenSettings?.()}
      className={`
        group relative flex items-center w-full py-2
        hover:bg-white/5 transition-all duration-150 ease-out cursor-pointer
        border-l-[3px] border-l-transparent
        ${expanded ? 'pl-6 pr-4 gap-3' : 'justify-center px-0'}
      `}
      aria-label="Account Settings"
    >
      {/* Avatar */}
      <div className={`${expanded ? 'w-6 h-6 mr-3' : 'w-7 h-7'} rounded-full bg-slate-700 overflow-hidden ring-1 ring-slate-700 group-hover:ring-slate-500 transition-all flex-shrink-0`}>
        {user.photoURL ? (
          <img
            src={user.photoURL}
            alt={user.displayName || 'User avatar'}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white text-[10px] font-medium">
            {getInitials(user)}
          </div>
        )}
      </div>

      {/* Name + System Chip Plan Badge when expanded */}
      {expanded && (
        <div className="flex-1 min-w-0 flex flex-col justify-center text-left">
          {/* Name */}
          <div className="text-sm font-medium text-slate-200 group-hover:text-white truncate leading-tight transition-colors">
            {user.displayName || 'User'}
          </div>

          {/* System Chip Plan Badge */}
          <div className="flex items-center mt-1">
            {canAccessPremium ? (
              <span className="
                inline-flex items-center px-1.5 py-[1px]
                rounded-[4px]
                text-[9px] font-mono font-semibold tracking-wider uppercase
                bg-amber-500/10 text-amber-400 border border-amber-500/20
                group-hover:bg-amber-500/20 group-hover:border-amber-500/30
                transition-colors
              ">
                Premium
              </span>
            ) : (
              <span className="
                inline-flex items-center px-1.5 py-[1px]
                rounded-[4px]
                text-[9px] font-mono font-medium tracking-wider uppercase
                bg-slate-700/30 text-slate-500 border border-slate-600/30
              ">
                Free
              </span>
            )}
          </div>
        </div>
      )}

      {/* Settings gear on hover when expanded */}
      {expanded && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity pl-2">
          <Settings size={14} strokeWidth={1.75} className="text-slate-500" />
        </div>
      )}

      {/* Premium indicator when collapsed */}
      {!expanded && canAccessPremium && (
        <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-amber-400 rounded-full flex items-center justify-center">
          <svg className="w-2 h-2 text-slate-900" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </div>
      )}

      {/* Tooltip when collapsed */}
      {!expanded && (
        <div className="absolute left-full ml-2 z-50 hidden group-hover:block px-2 py-1.5 text-xs font-medium text-white bg-slate-800 rounded shadow-lg whitespace-nowrap">
          <div>{user.displayName || 'User'}</div>
          <div className="text-slate-400 text-[10px]">Account Settings</div>
        </div>
      )}
    </button>
  );
});

export default UserProfileMenu;
