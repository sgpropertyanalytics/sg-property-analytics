/**
 * UnitPsfInput - Manual PSF value entry for downside protection analysis
 *
 * Features:
 * - Numeric input with validation (300-10000 PSF range)
 * - Debounced onChange (500ms)
 * - Clear button
 * - Currency formatting
 */

import { useState, useEffect, useCallback } from 'react';

// PSF validation range
const PSF_MIN = 300;
const PSF_MAX = 10000;
const DEBOUNCE_MS = 500;

export function UnitPsfInput({
  value,
  onChange,
  disabled = false,
  placeholder = 'Enter your unit PSF',
  label = 'Your Unit PSF',
  showLabel = true,
  compact = false
}) {
  const [localValue, setLocalValue] = useState(value ? String(value) : '');
  const [error, setError] = useState(null);

  // Sync local value when external value changes
  useEffect(() => {
    if (value !== undefined && value !== null) {
      setLocalValue(String(value));
    } else {
      setLocalValue('');
    }
  }, [value]);

  // Debounced onChange
  const debouncedOnChange = useCallback(
    debounce((val) => {
      if (onChange) {
        onChange(val);
      }
    }, DEBOUNCE_MS),
    [onChange]
  );

  const handleChange = (e) => {
    const raw = e.target.value;

    // Allow empty input
    if (raw === '') {
      setLocalValue('');
      setError(null);
      debouncedOnChange(null);
      return;
    }

    // Only allow numbers
    const cleaned = raw.replace(/[^0-9]/g, '');
    if (cleaned !== raw) {
      return; // Ignore non-numeric input
    }

    const num = parseInt(cleaned, 10);
    setLocalValue(cleaned);

    // Validate range
    if (num < PSF_MIN) {
      setError(`Minimum PSF is $${PSF_MIN}`);
    } else if (num > PSF_MAX) {
      setError(`Maximum PSF is $${PSF_MAX.toLocaleString()}`);
    } else {
      setError(null);
      debouncedOnChange(num);
    }
  };

  const handleClear = () => {
    setLocalValue('');
    setError(null);
    if (onChange) {
      onChange(null);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      // Trigger onChange immediately on Enter
      const num = parseInt(localValue, 10);
      if (!isNaN(num) && num >= PSF_MIN && num <= PSF_MAX) {
        if (onChange) {
          onChange(num);
        }
      }
    }
  };

  return (
    <div className={compact ? '' : 'space-y-1'}>
      {showLabel && !compact && (
        <label className="block text-sm font-medium text-[#213448]">
          {label}
        </label>
      )}

      <div className="relative">
        {/* Dollar sign prefix */}
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#547792] pointer-events-none">
          $
        </span>

        <input
          type="text"
          inputMode="numeric"
          value={localValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          className={`
            w-full pl-7 pr-10 py-2 rounded-lg border
            text-[#213448] placeholder:text-[#94B4C1]
            focus:outline-none focus:ring-2 focus:ring-[#547792]/30 focus:border-[#547792]
            disabled:bg-[#EAE0CF]/50 disabled:cursor-not-allowed
            ${error ? 'border-red-300 bg-red-50' : 'border-[#94B4C1]/50 bg-white'}
            ${compact ? 'text-sm py-1.5' : ''}
          `}
        />

        {/* PSF suffix */}
        <span className="absolute right-10 top-1/2 -translate-y-1/2 text-xs text-[#94B4C1] pointer-events-none">
          psf
        </span>

        {/* Clear button */}
        {localValue && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#94B4C1] hover:text-[#547792] transition-colors"
            title="Clear"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Error message */}
      {error && (
        <p className="text-xs text-red-500 mt-1">{error}</p>
      )}

      {/* Helper text */}
      {!error && !compact && (
        <p className="text-xs text-[#94B4C1]">
          Enter the PSF you paid or are considering (${PSF_MIN.toLocaleString()} - ${PSF_MAX.toLocaleString()})
        </p>
      )}
    </div>
  );
}

// Simple debounce utility
function debounce(fn, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

export default UnitPsfInput;
