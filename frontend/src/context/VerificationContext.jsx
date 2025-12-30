/**
 * VerificationContext - State management for data verification system
 *
 * Provides:
 * - Verification candidates list with filtering
 * - Summary statistics
 * - Approve/reject actions
 * - Run trigger and status tracking
 */
import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import {
  getVerificationCandidates,
  getVerificationSummary,
  approveVerificationCandidate,
  rejectVerificationCandidate,
  triggerVerificationRun,
  getVerificationRunStatus,
} from '../api/client';

const VerificationContext = createContext(null);

/**
 * Verification status constants
 */
export const VerificationStatus = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  MISMATCH: 'mismatch',
  UNVERIFIED: 'unverified',
};

/**
 * Review status constants
 */
export const ReviewStatus = {
  OPEN: 'open',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  AUTO_CONFIRMED: 'auto_confirmed',
};

/**
 * Resolution options
 */
export const Resolution = {
  KEEP_CURRENT: 'keep_current',
  UPDATE_TO_VERIFIED: 'update_to_verified',
  NEEDS_INVESTIGATION: 'needs_investigation',
};

/**
 * Entity types for verification
 */
export const EntityType = {
  UNIT_COUNT: 'unit_count',
  UPCOMING_LAUNCH: 'upcoming_launch',
  GLS_TENDER: 'gls_tender',
  PROJECT_LOCATION: 'project_location',
};

/**
 * Get display label for verification status
 */
export const getStatusLabel = (status) => {
  const labels = {
    [VerificationStatus.PENDING]: 'Pending',
    [VerificationStatus.CONFIRMED]: 'Confirmed',
    [VerificationStatus.MISMATCH]: 'Mismatch',
    [VerificationStatus.UNVERIFIED]: 'Unverified',
  };
  return labels[status] || status;
};

/**
 * Get display label for confidence score
 */
export const getConfidenceLabel = (score) => {
  if (score >= 0.9) return 'High';
  if (score >= 0.7) return 'Medium';
  if (score >= 0.5) return 'Low';
  return 'Very Low';
};

/**
 * Get color variant for confidence score
 */
export const getConfidenceColor = (score) => {
  if (score >= 0.9) return 'success';
  if (score >= 0.7) return 'warning';
  if (score >= 0.5) return 'caution';
  return 'danger';
};

export function VerificationProvider({ children }) {
  // Candidates state
  const [candidates, setCandidates] = useState([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [candidatesError, setCandidatesError] = useState(null);
  const [pagination, setPagination] = useState({ total: 0, limit: 50, offset: 0 });

  // Summary state
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Active run state
  const [activeRun, setActiveRun] = useState(null);
  const [runLoading, setRunLoading] = useState(false);

  // Filters state
  const [filters, setFilters] = useState({
    entity_type: null,
    review_status: ReviewStatus.OPEN,
    verification_status: null,
  });

  /**
   * Fetch verification candidates
   */
  const fetchCandidates = useCallback(async (params = {}) => {
    setCandidatesLoading(true);
    setCandidatesError(null);
    try {
      const queryParams = {
        ...filters,
        ...params,
        limit: pagination.limit,
        offset: params.offset ?? pagination.offset,
      };
      // Remove null/undefined values
      Object.keys(queryParams).forEach(key => {
        if (queryParams[key] === null || queryParams[key] === undefined) {
          delete queryParams[key];
        }
      });

      const response = await getVerificationCandidates(queryParams);
      const data = response.data;
      setCandidates(data.candidates || []);
      setPagination(prev => ({
        ...prev,
        total: data.total || 0,
        offset: params.offset ?? prev.offset,
      }));
    } catch (err) {
      setCandidatesError(err.message || 'Failed to fetch candidates');
      setCandidates([]);
    } finally {
      setCandidatesLoading(false);
    }
  }, [filters, pagination.limit, pagination.offset]);

  /**
   * Fetch verification summary
   */
  const fetchSummary = useCallback(async (params = {}) => {
    setSummaryLoading(true);
    try {
      const response = await getVerificationSummary(params);
      setSummary(response.data);
    } catch (err) {
      console.error('Failed to fetch verification summary:', err);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  /**
   * Approve a candidate
   */
  const approve = useCallback(async (id, resolution, notes = '') => {
    try {
      await approveVerificationCandidate(id, { resolution, notes });
      // Refresh the list
      await fetchCandidates();
      await fetchSummary();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, [fetchCandidates, fetchSummary]);

  /**
   * Reject a candidate
   */
  const reject = useCallback(async (id, notes = '') => {
    try {
      await rejectVerificationCandidate(id, { notes });
      // Refresh the list
      await fetchCandidates();
      await fetchSummary();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, [fetchCandidates, fetchSummary]);

  /**
   * Start a verification run
   */
  const startRun = useCallback(async (entityType, projectNames = null, sources = null) => {
    setRunLoading(true);
    try {
      const data = { entity_type: entityType };
      if (projectNames) data.project_names = projectNames;
      if (sources) data.sources = sources;

      const response = await triggerVerificationRun(data);
      setActiveRun(response.data);
      return { success: true, runId: response.data.run_id };
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      setRunLoading(false);
    }
  }, []);

  /**
   * Check run status
   */
  const checkRunStatus = useCallback(async (runId) => {
    try {
      const response = await getVerificationRunStatus(runId);
      setActiveRun(response.data);
      return response.data;
    } catch (err) {
      console.error('Failed to check run status:', err);
      return null;
    }
  }, []);

  /**
   * Update filters
   */
  const updateFilters = useCallback((newFilters) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
    setPagination(prev => ({ ...prev, offset: 0 })); // Reset to first page
  }, []);

  /**
   * Go to specific page
   */
  const goToPage = useCallback((page) => {
    const offset = page * pagination.limit;
    setPagination(prev => ({ ...prev, offset }));
    fetchCandidates({ offset });
  }, [pagination.limit, fetchCandidates]);

  // Compute derived values
  const openCount = useMemo(() => {
    return summary?.by_review_status?.open || 0;
  }, [summary]);

  const mismatchCount = useMemo(() => {
    return summary?.by_status?.mismatch || 0;
  }, [summary]);

  const value = useMemo(() => ({
    // Candidates
    candidates,
    candidatesLoading,
    candidatesError,
    pagination,
    fetchCandidates,
    goToPage,

    // Summary
    summary,
    summaryLoading,
    fetchSummary,
    openCount,
    mismatchCount,

    // Actions
    approve,
    reject,

    // Runs
    activeRun,
    runLoading,
    startRun,
    checkRunStatus,

    // Filters
    filters,
    updateFilters,
  }), [
    candidates, candidatesLoading, candidatesError, pagination, fetchCandidates, goToPage,
    summary, summaryLoading, fetchSummary, openCount, mismatchCount,
    approve, reject,
    activeRun, runLoading, startRun, checkRunStatus,
    filters, updateFilters,
  ]);

  return (
    <VerificationContext.Provider value={value}>
      {children}
    </VerificationContext.Provider>
  );
}

/**
 * Hook to access verification context
 */
export function useVerification() {
  const context = useContext(VerificationContext);
  if (!context) {
    throw new Error('useVerification must be used within a VerificationProvider');
  }
  return context;
}

export default VerificationContext;
