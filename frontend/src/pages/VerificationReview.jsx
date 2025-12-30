/**
 * VerificationReview Page
 *
 * Admin page for reviewing and resolving verification candidates.
 * Shows pending mismatches, allows approve/reject actions.
 */

import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../components/ui';
import {
  ConfidenceBadge,
  ConfidenceBadgeWithSources,
  VerificationStatusIndicator,
  VerificationSummaryCard,
} from '../components/verification';
import {
  VerificationProvider,
  useVerification,
  VerificationStatus,
  ReviewStatus,
  Resolution,
  EntityType,
  getStatusLabel,
} from '../context/VerificationContext';

/**
 * Filter bar for candidates
 */
function FilterBar() {
  const { filters, updateFilters } = useVerification();

  return (
    <div className="flex flex-wrap gap-3 mb-4">
      {/* Entity type filter */}
      <select
        value={filters.entity_type || ''}
        onChange={(e) => updateFilters({ entity_type: e.target.value || null })}
        className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#547792]/30"
      >
        <option value="">All Entity Types</option>
        <option value={EntityType.UNIT_COUNT}>Unit Count</option>
        <option value={EntityType.UPCOMING_LAUNCH}>Upcoming Launch</option>
        <option value={EntityType.GLS_TENDER}>GLS Tender</option>
        <option value={EntityType.PROJECT_LOCATION}>Project Location</option>
      </select>

      {/* Review status filter */}
      <select
        value={filters.review_status || ''}
        onChange={(e) => updateFilters({ review_status: e.target.value || null })}
        className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#547792]/30"
      >
        <option value="">All Review Status</option>
        <option value={ReviewStatus.OPEN}>Open</option>
        <option value={ReviewStatus.APPROVED}>Approved</option>
        <option value={ReviewStatus.REJECTED}>Rejected</option>
        <option value={ReviewStatus.AUTO_CONFIRMED}>Auto-confirmed</option>
      </select>

      {/* Verification status filter */}
      <select
        value={filters.verification_status || ''}
        onChange={(e) => updateFilters({ verification_status: e.target.value || null })}
        className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#547792]/30"
      >
        <option value="">All Verification Status</option>
        <option value={VerificationStatus.CONFIRMED}>Confirmed</option>
        <option value={VerificationStatus.MISMATCH}>Mismatch</option>
        <option value={VerificationStatus.PENDING}>Pending</option>
        <option value={VerificationStatus.UNVERIFIED}>Unverified</option>
      </select>
    </div>
  );
}

/**
 * Single candidate card
 */
function CandidateCard({ candidate, onApprove, onReject }) {
  const [expanded, setExpanded] = useState(false);
  const [resolution, setResolution] = useState(Resolution.KEEP_CURRENT);
  const [notes, setNotes] = useState('');
  const [processing, setProcessing] = useState(false);

  const handleApprove = async () => {
    setProcessing(true);
    await onApprove(candidate.id, resolution, notes);
    setProcessing(false);
  };

  const handleReject = async () => {
    setProcessing(true);
    await onReject(candidate.id, notes);
    setProcessing(false);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <VerificationStatusIndicator
            status={candidate.verification_status}
            size="small"
          />
          <div>
            <div className="font-medium text-[#213448]">
              {candidate.entity_key}
            </div>
            <div className="text-xs text-gray-500">
              {candidate.entity_type}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ConfidenceBadge
            score={candidate.confidence_score}
            size="small"
          />
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 py-4 border-t border-gray-100 space-y-4">
          {/* Values comparison */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="text-xs text-gray-500 mb-1">Current Value</div>
              <div className="font-mono text-sm text-[#213448]">
                {JSON.stringify(candidate.current_value, null, 2)}
              </div>
            </div>
            <div className="p-3 bg-emerald-50 rounded-lg">
              <div className="text-xs text-gray-500 mb-1">Verified Value</div>
              <div className="font-mono text-sm text-emerald-700">
                {JSON.stringify(candidate.verified_value, null, 2)}
              </div>
            </div>
          </div>

          {/* Sources */}
          {candidate.verified_sources && candidate.verified_sources.length > 0 && (
            <ConfidenceBadgeWithSources
              score={candidate.confidence_score}
              sources={candidate.verified_sources}
              showAllSources
            />
          )}

          {/* Field mismatches */}
          {candidate.field_mismatches && Object.keys(candidate.field_mismatches).length > 0 && (
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
              <div className="text-sm font-medium text-amber-800 mb-2">Field Mismatches</div>
              <div className="space-y-1">
                {Object.entries(candidate.field_mismatches).map(([field, mismatch]) => (
                  <div key={field} className="text-sm text-amber-700 flex items-center gap-2">
                    <span className="font-medium">{field}:</span>
                    <span className="text-gray-600">{mismatch.current}</span>
                    <span className="text-amber-500">\u2192</span>
                    <span className="text-emerald-600">{mismatch.verified}</span>
                    {mismatch.delta_pct && (
                      <span className="text-xs text-gray-500">
                        ({mismatch.delta_pct > 0 ? '+' : ''}{mismatch.delta_pct.toFixed(1)}%)
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          {candidate.review_status === ReviewStatus.OPEN && (
            <div className="pt-3 border-t border-gray-100 space-y-3">
              {/* Resolution selection */}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">
                  Resolution
                </label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name={`resolution-${candidate.id}`}
                      value={Resolution.KEEP_CURRENT}
                      checked={resolution === Resolution.KEEP_CURRENT}
                      onChange={(e) => setResolution(e.target.value)}
                      className="text-[#547792] focus:ring-[#547792]"
                    />
                    <span className="text-sm text-gray-700">Keep Current</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name={`resolution-${candidate.id}`}
                      value={Resolution.UPDATE_TO_VERIFIED}
                      checked={resolution === Resolution.UPDATE_TO_VERIFIED}
                      onChange={(e) => setResolution(e.target.value)}
                      className="text-[#547792] focus:ring-[#547792]"
                    />
                    <span className="text-sm text-gray-700">Update to Verified</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name={`resolution-${candidate.id}`}
                      value={Resolution.NEEDS_INVESTIGATION}
                      checked={resolution === Resolution.NEEDS_INVESTIGATION}
                      onChange={(e) => setResolution(e.target.value)}
                      className="text-[#547792] focus:ring-[#547792]"
                    />
                    <span className="text-sm text-gray-700">Needs Investigation</span>
                  </label>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">
                  Notes (optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any notes about this decision..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#547792]/30"
                  rows={2}
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleApprove}
                  disabled={processing}
                  className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {processing ? 'Processing...' : 'Approve'}
                </button>
                <button
                  onClick={handleReject}
                  disabled={processing}
                  className="px-4 py-2 text-sm font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {processing ? 'Processing...' : 'Reject'}
                </button>
              </div>
            </div>
          )}

          {/* Already resolved */}
          {candidate.review_status !== ReviewStatus.OPEN && (
            <div className="pt-3 border-t border-gray-100">
              <div className="text-sm text-gray-500">
                Status: <span className="font-medium text-gray-700">{candidate.review_status}</span>
                {candidate.resolution && (
                  <span className="ml-2">
                    \u2022 Resolution: <span className="font-medium">{candidate.resolution}</span>
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Candidates list
 */
function CandidatesList() {
  const {
    candidates,
    candidatesLoading,
    candidatesError,
    pagination,
    fetchCandidates,
    goToPage,
    approve,
    reject,
  } = useVerification();

  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates]);

  if (candidatesLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-white rounded-lg border border-gray-200 p-4 animate-pulse"
          >
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-gray-200 rounded-full" />
              <div className="flex-1">
                <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
                <div className="h-3 bg-gray-200 rounded w-1/4" />
              </div>
              <div className="h-6 w-16 bg-gray-200 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (candidatesError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        Error loading candidates: {candidatesError}
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center text-gray-500">
        No verification candidates found matching your filters.
      </div>
    );
  }

  const totalPages = Math.ceil(pagination.total / pagination.limit);
  const currentPage = Math.floor(pagination.offset / pagination.limit);

  return (
    <div className="space-y-4">
      {/* Candidates */}
      <div className="space-y-3">
        {candidates.map((candidate) => (
          <CandidateCard
            key={candidate.id}
            candidate={candidate}
            onApprove={approve}
            onReject={reject}
          />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <div className="text-sm text-gray-500">
            Showing {pagination.offset + 1}-{Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 0}
              className="px-3 py-1 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= totalPages - 1}
              className="px-3 py-1 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Summary sidebar
 */
function SummarySidebar() {
  const { summary, summaryLoading, fetchSummary, openCount, mismatchCount } = useVerification();

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  return (
    <div className="space-y-4">
      {/* Quick stats */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Review Queue</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center p-3 bg-amber-50 rounded-lg">
            <div className="text-2xl font-bold text-amber-700">{openCount}</div>
            <div className="text-xs text-amber-600">Open</div>
          </div>
          <div className="text-center p-3 bg-red-50 rounded-lg">
            <div className="text-2xl font-bold text-red-700">{mismatchCount}</div>
            <div className="text-xs text-red-600">Mismatches</div>
          </div>
        </div>
      </div>

      {/* Full summary */}
      {summary && (
        <VerificationSummaryCard
          confirmed={summary.by_status?.confirmed || 0}
          mismatch={summary.by_status?.mismatch || 0}
          pending={summary.by_status?.pending || 0}
          unverified={summary.by_status?.unverified || 0}
        />
      )}

      {/* Recent runs */}
      {summary?.recent_runs && summary.recent_runs.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Recent Runs</h3>
          <div className="space-y-2">
            {summary.recent_runs.slice(0, 3).map((run) => (
              <div
                key={run.run_id}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-gray-600">{run.entity_type}</span>
                <span className="text-gray-400 text-xs">
                  {new Date(run.completed_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Main content component
 */
function VerificationReviewContent() {
  return (
    <div className="h-full overflow-auto">
      <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
        <PageHeader
          title="Verification Review"
          subtitle="Review and resolve data verification candidates"
        />

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main content */}
          <div className="lg:col-span-3">
            <FilterBar />
            <CandidatesList />
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <SummarySidebar />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Page wrapper with context
 */
export default function VerificationReview() {
  return (
    <VerificationProvider>
      <VerificationReviewContent />
    </VerificationProvider>
  );
}
