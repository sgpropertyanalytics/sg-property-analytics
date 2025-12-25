import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { deleteAccount, createPortalSession } from '../api/client';

/**
 * AccountSettingsModal - Single-view modal for user account management
 *
 * Sections:
 * - Profile section (avatar + name + email)
 * - Email (read-only)
 * - Member since date
 * - Billing & Plan (current plan, subscription management)
 * - Delete Account (danger zone)
 *
 * Color Palette:
 * - Deep Navy: #213448
 * - Ocean Blue: #547792
 * - Sky Blue: #94B4C1
 * - Sand/Cream: #EAE0CF
 */
export function AccountSettingsModal({ isOpen, onClose, onShowPricing }) {
  const { user, logout } = useAuth();
  const { subscription, isPremium, daysUntilExpiry } = useSubscription();

  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  if (!isOpen || !user) return null;

  const handleManageBilling = async () => {
    setLoading(true);
    try {
      const response = await createPortalSession(window.location.href);
      if (response.data.portal_url) {
        window.location.href = response.data.portal_url;
      }
    } catch (error) {
      console.error('Failed to create portal session:', error);
      alert('Unable to open billing portal. Please try again.');
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

  const handleUpgrade = () => {
    onClose();
    onShowPricing?.();
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-SG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Get initials for avatar fallback
  const getInitials = () => {
    if (user.displayName) {
      return user.displayName
        .split(' ')
        .map(n => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
    }
    return user.email?.charAt(0).toUpperCase() || '?';
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#94B4C1]/30">
            <h2 className="text-xl font-bold text-[#213448]">Account Settings</h2>
            <button
              onClick={onClose}
              className="p-2 text-[#547792] hover:text-[#213448] hover:bg-[#EAE0CF]/50 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-6 max-h-[70vh] overflow-y-auto">
            <div className="space-y-6">
              {/* Profile Section */}
              <div>
                <h3 className="text-sm font-medium text-[#547792] mb-3">Profile</h3>
                <div className="flex items-center gap-4 p-4 bg-[#EAE0CF]/30 rounded-lg">
                  {/* Avatar */}
                  <div className="w-16 h-16 rounded-full overflow-hidden ring-2 ring-[#94B4C1]/30 flex-shrink-0">
                    {user.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt={user.displayName || 'User'}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full bg-[#547792] flex items-center justify-center text-[#EAE0CF] text-xl font-medium">
                        {getInitials()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-[#213448] truncate">
                      {user.displayName || 'User'}
                    </div>
                    <div className="text-sm text-[#547792] truncate">{user.email}</div>
                    {isPremium && (
                      <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 bg-[#213448] text-[#EAE0CF] text-xs rounded-full">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        Premium
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Email Field (read-only) */}
              <div>
                <label className="block text-sm font-medium text-[#547792] mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={user.email}
                  disabled
                  className="w-full px-4 py-2.5 bg-[#EAE0CF]/20 border border-[#94B4C1]/30 rounded-lg text-[#213448] cursor-not-allowed"
                />
                <p className="mt-1 text-xs text-[#94B4C1]">
                  Email cannot be changed for Google OAuth accounts
                </p>
              </div>

              {/* Member Since */}
              <div>
                <label className="block text-sm font-medium text-[#547792] mb-2">
                  Member Since
                </label>
                <div className="text-[#213448]">
                  {formatDate(user.metadata?.creationTime)}
                </div>
              </div>

              {/* Billing & Plan Section */}
              <div className="pt-4 border-t border-[#94B4C1]/30">
                <h3 className="text-sm font-medium text-[#547792] mb-3">Billing & Plan</h3>

                {/* Current Plan */}
                <div className={`p-4 rounded-lg border ${isPremium ? 'bg-[#213448]/5 border-[#213448]/20' : 'bg-[#EAE0CF]/30 border-[#94B4C1]/30'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className={`text-lg font-bold ${isPremium ? 'text-[#213448]' : 'text-[#547792]'}`}>
                        {isPremium ? 'Premium' : 'Free'}
                      </div>
                      {isPremium && subscription?.ends_at && (
                        <div className="text-sm text-[#547792]">
                          {daysUntilExpiry > 0
                            ? `Renews on ${formatDate(subscription.ends_at)}`
                            : 'Expires soon'
                          }
                        </div>
                      )}
                      {!isPremium && (
                        <div className="text-sm text-[#94B4C1]">
                          Limited access to transaction data
                        </div>
                      )}
                    </div>
                    {isPremium && (
                      <div className="flex items-center justify-center w-10 h-10 bg-[#EAE0CF] rounded-full">
                        <svg className="w-5 h-5 text-[#213448]" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      </div>
                    )}
                  </div>
                </div>

                {/* Subscription Status - only for premium */}
                {isPremium && (
                  <div className="mt-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-[#547792]">Status:</span>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Active
                      </span>
                    </div>
                  </div>
                )}

                {/* Manage Subscription Button - for premium users */}
                {isPremium && (
                  <button
                    onClick={handleManageBilling}
                    disabled={loading}
                    className="w-full mt-4 px-4 py-3 bg-[#213448] text-white rounded-lg font-medium hover:bg-[#547792] disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      'Loading...'
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                        </svg>
                        Manage Subscription & Billing
                      </>
                    )}
                  </button>
                )}

                {/* Upgrade CTA for free users */}
                {!isPremium && (
                  <button
                    onClick={handleUpgrade}
                    className="w-full mt-4 px-4 py-3 bg-[#213448] text-white rounded-lg font-medium hover:bg-[#547792] transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    Upgrade to Premium
                  </button>
                )}

                {/* Payment info note */}
                <div className="flex items-start gap-2 p-3 mt-4 bg-[#EAE0CF]/30 rounded-lg">
                  <svg className="w-5 h-5 text-[#547792] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <p className="text-xs text-[#547792]">
                    Payment processing and subscription management is handled securely by Stripe.
                    We never store your payment details.
                  </p>
                </div>
              </div>

              {/* Danger Zone */}
              <div className="pt-4 border-t border-[#94B4C1]/30">
                <h3 className="text-sm font-medium text-red-600 mb-3">Danger Zone</h3>
                {!showDeleteConfirm ? (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    Delete Account
                  </button>
                ) : (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-700 mb-3">
                      Are you sure? This action cannot be undone. All your data will be permanently deleted.
                    </p>
                    {deleteError && (
                      <p className="text-sm text-red-600 mb-3">{deleteError}</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={handleDeleteAccount}
                        disabled={loading}
                        className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                      >
                        {loading ? 'Deleting...' : 'Yes, Delete My Account'}
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        disabled={loading}
                        className="px-4 py-2 text-sm text-[#547792] border border-[#94B4C1] rounded-lg hover:bg-[#EAE0CF]/50 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AccountSettingsModal;
