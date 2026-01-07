import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { getInitials } from '../../utils/formatters';

/**
 * UserProfileMenu - Bottom-left user profile in GlobalNavRail
 *
 * Shows:
 * - User avatar (or initials if no avatar)
 * - Email on hover/expanded mode
 * - Opens Account Settings modal on click (for authenticated users)
 * - Shows "Sign In" button for non-authenticated users
 *
 * Color Palette:
 * - Deep Navy: #213448
 * - Ocean Blue: #547792
 * - Sky Blue: #94B4C1
 * - Sand/Cream: #EAE0CF
 */
export const UserProfileMenu = React.memo(function UserProfileMenu({ expanded = false, onOpenSettings }) {
  const { user, isAuthenticated, logout } = useAuth();
  const { isPremium } = useSubscription();
  const navigate = useNavigate();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Show "Sign In" button for non-authenticated users
  if (!isAuthenticated || !user) {
    return (
      <button
        onClick={() => navigate('/login')}
        className={`
          group relative flex items-center
          ${expanded ? 'gap-3 px-3 py-3 rounded-none w-full' : 'flex-col justify-center w-full aspect-square rounded-none'}
          text-brand-sky/60 hover:bg-brand-blue/30 hover:text-brand-sand transition-none
        `}
        aria-label="Sign In"
      >
        <svg className="w-5 h-5 group-hover:scale-105 transition-transform flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
        </svg>

        {/* Label when expanded */}
        {expanded && (
          <span className="text-sm font-medium">Sign In</span>
        )}

        {/* Tooltip - only when collapsed */}
        {!expanded && (
          <div className="
            absolute left-full ml-4 px-3 py-2
            bg-brand-navy text-brand-sand text-sm font-medium
            rounded-none weapon-shadow
            opacity-0 invisible group-hover:opacity-100 group-hover:visible
            pointer-events-none transition-none
            whitespace-nowrap z-50 border border-brand-sky/30
          ">
            Sign In
            <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1.5 w-3 h-3 bg-brand-navy rotate-45 border-l border-b border-brand-sky/30" />
          </div>
        )}
      </button>
    );
  }

  const handleSignOut = async () => {
    setShowDropdown(false);
    try {
      await logout();
      navigate('/login');
    } catch (err) {
      console.error('Sign out failed:', err);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className={`
          group relative flex items-center
          ${expanded ? 'gap-3 px-3 py-3 rounded-none w-full' : 'flex-col justify-center w-full aspect-square rounded-none'}
          text-brand-sky/60 hover:bg-brand-blue/30 hover:text-brand-sand transition-none
        `}
        aria-label="User menu"
      >
        {/* Avatar */}
        <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-brand-blue/30 group-hover:ring-brand-sand/50 transition-none">
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt={user.displayName || 'User avatar'}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-full h-full bg-brand-blue flex items-center justify-center text-brand-sand text-sm font-medium">
              {getInitials(user)}
            </div>
          )}
        </div>

        {/* Name/Email when expanded */}
        {expanded && (
          <div className="flex-1 min-w-0 text-left">
            <div className="text-sm font-medium text-brand-sand truncate">
              {user.displayName || 'User'}
            </div>
            <div className="text-xs text-brand-sky truncate">
              {user.email}
            </div>
          </div>
        )}

        {/* Premium badge when collapsed */}
        {!expanded && isPremium && (
          <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-brand-sand rounded-full flex items-center justify-center">
            <svg className="w-2 h-2 text-brand-navy" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          </div>
        )}

        {/* Tooltip when collapsed */}
        {!expanded && (
          <div className="
            absolute left-full ml-4 px-3 py-2
            bg-brand-navy text-brand-sand text-sm
            rounded-none weapon-shadow
            opacity-0 invisible group-hover:opacity-100 group-hover:visible
            pointer-events-none transition-none
            whitespace-nowrap z-50 border border-brand-sky/30
          ">
            <div className="font-medium">{user.displayName || 'User'}</div>
            <div className="text-xs text-brand-sky">{user.email}</div>
            <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1.5 w-3 h-3 bg-brand-navy rotate-45 border-l border-b border-brand-sky/30" />
          </div>
        )}
      </button>

      {/* Dropdown Menu */}
      {showDropdown && (
        <div className="absolute left-0 bottom-full mb-2 w-56 bg-white rounded-none weapon-shadow border border-brand-sky/30 py-1 z-50">
          {/* User info header */}
          <div className="px-4 py-3 border-b border-brand-sky/20">
            <div className="font-medium text-brand-navy truncate">
              {user.displayName || 'User'}
            </div>
            <div className="text-sm text-brand-blue truncate">
              {user.email}
            </div>
          </div>

          {/* Account Settings */}
          <button
            onClick={() => {
              setShowDropdown(false);
              onOpenSettings?.();
            }}
            className="w-full px-4 py-2.5 text-left text-sm text-brand-navy hover:bg-brand-sand/50 flex items-center gap-3 transition-none"
          >
            <svg className="w-4 h-4 text-brand-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Account Settings
          </button>

          {/* Subscription status */}
          <div className="px-4 py-2 border-t border-brand-sky/20">
            <div className="text-xs text-brand-blue mb-1">Plan</div>
            <div className={`text-sm font-medium ${isPremium ? 'text-brand-navy' : 'text-brand-sky'}`}>
              {isPremium ? 'Premium' : 'Free'}
            </div>
          </div>

          {/* Sign Out */}
          <button
            onClick={handleSignOut}
            className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-3 border-t border-brand-sky/20 transition-none"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
});

export default UserProfileMenu;
