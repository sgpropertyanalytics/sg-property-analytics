/**
 * Chart.js Registration Singleton
 *
 * Centralizes Chart.js component registration to ensure each component
 * is registered exactly once, regardless of how many chart components
 * import this module.
 *
 * Usage:
 *   import { ensureChartJSRegistered } from '../../lib/chartjs-registry';
 *   ensureChartJSRegistered(); // Call at module top-level
 */

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  BarController,
  LineElement,
  LineController,
  PointElement,
  Tooltip,
  Legend,
  Filler,
  Title,
  ArcElement,
} from 'chart.js';

let registered = false;

/**
 * Ensures Chart.js components are registered exactly once.
 * Safe to call multiple times - subsequent calls are no-ops.
 */
export function ensureChartJSRegistered() {
  if (registered) return;

  ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    BarController,
    LineElement,
    LineController,
    PointElement,
    Tooltip,
    Legend,
    Filler,
    Title,
    ArcElement
  );

  registered = true;
}

// Auto-register on first import (singleton pattern)
ensureChartJSRegistered();

export default ensureChartJSRegistered;
