import { useState } from 'react';
import { X, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { deleteAccount } from '../api/client';
import { getInitials } from '../utils/formatters';

/**
 * AccountSettingsModal - Dark "Command Center" style modal
 *
 * Calm, professional layout with grid for Plan/Session
 */
export function AccountSettingsModal({ isOpen, onClose }) {
  const { user, logout } = useAuth();

  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  if (!isOpen || !user) return null;

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await logout();
      onClose();
      window.location.href = '/login';
    } catch (error) {
      console.error('Sign out failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    setLoading(true);
    setDeleteError(null);
    try {
      await deleteAccount();
      await logout();
      onClose();
      window.location.href = '/';
    } catch (error) {
      console.error('Failed to delete account:', error);
      setDeleteError(error.response?.data?.error || 'Failed to delete account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-SG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const accountId = user.uid ? `USR-${user.uid.substring(0, 4).toUpperCase()}-${user.uid.substring(4, 8).toUpperCase()}` : 'N/A';

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-2xl bg-[#0F172A] border border-slate-700 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-slideUp">

          {/* Fixed Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50 shrink-0">
            <h2 className="text-lg font-semibold text-white tracking-wide">Account Settings</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              <X size={20} strokeWidth={1.5} />
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="p-6 space-y-6 overflow-y-auto flex-1">

            {/* Section: Profile Identity */}
            <div className="flex flex-col sm:flex-row gap-6">
              {/* Avatar */}
              <div className="flex flex-col items-center sm:items-start">
                <div className="w-20 h-20 rounded-full bg-slate-800 ring-4 ring-slate-800 overflow-hidden shadow-lg">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || 'User'}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-white text-2xl font-medium">
                      {getInitials(user)}
                    </div>
                  )}
                </div>
              </div>

              {/* Info Grid */}
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Display Name</label>
                  <div className="px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-md text-sm text-white font-medium">
                    {user.displayName || 'User'}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Email</label>
                  <div className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-md text-sm text-slate-400 font-mono cursor-not-allowed truncate">
                    {user.email}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Member Since</label>
                  <div className="text-sm text-slate-400">
                    {formatDate(user.metadata?.creationTime)}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Account ID</label>
                  <div className="font-mono text-xs text-slate-500 select-all">
                    {accountId}
                  </div>
                </div>
              </div>
            </div>

            {/* Separator */}
            <div className="h-px bg-slate-800 w-full" />

            {/* Section: Subscription & Session Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Plan Card */}
              <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-4 flex flex-col justify-between min-h-[140px]">
                <div>
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Plan</h3>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-base font-bold text-white">Standard Access</span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase">
                      Active
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Full access enabled for all signed-in users
                  </p>
                </div>
              </div>

              {/* Session Card (Neutral, Calm) */}
              <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-4 flex flex-col justify-between min-h-[140px]">
                <div>
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Current Session</h3>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-sm font-medium text-slate-200">Active</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Logged in via Google
                  </p>
                </div>

                <button
                  onClick={handleSignOut}
                  disabled={loading}
                  className="mt-4 flex items-center gap-2 text-xs text-slate-400 hover:text-white font-medium transition-colors w-fit disabled:opacity-50"
                >
                  <LogOut size={14} />
                  Log Out
                </button>
              </div>
            </div>

            {/* Danger Zone (Minimized) */}
            {!showDeleteConfirm ? (
              <div className="pt-4 border-t border-slate-800 flex justify-between items-center">
                <p className="text-[11px] text-slate-600">
                  {accountId}
                </p>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-[11px] text-rose-900/60 hover:text-rose-500 font-medium transition-colors"
                >
                  Delete Account
                </button>
              </div>
            ) : (
              <div className="pt-4 border-t border-slate-800">
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <p className="text-xs text-red-300 mb-3">
                    This action cannot be undone. All your data will be permanently deleted.
                  </p>
                  {deleteError && (
                    <p className="text-xs text-red-400 mb-3">{deleteError}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={handleDeleteAccount}
                      disabled={loading}
                      className="px-4 py-2 text-xs text-white bg-red-600 rounded hover:bg-red-500 disabled:opacity-50 transition-colors"
                    >
                      {loading ? 'Deleting...' : 'Yes, Delete Forever'}
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      disabled={loading}
                      className="px-4 py-2 text-xs text-slate-400 border border-slate-600 rounded hover:bg-slate-800 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Fixed Footer */}
          <div className="px-6 py-4 bg-slate-900 border-t border-slate-800 flex justify-end shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AccountSettingsModal;
