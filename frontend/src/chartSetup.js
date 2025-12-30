/**
 * Centralized Chart.js Registration
 *
 * This file registers all Chart.js components ONCE at app startup.
 * Previously, each chart component registered its own subset of components,
 * leading to ~260 lines of boilerplate spread across 14 chart files.
 *
 * USAGE:
 * Import this file once in App.jsx (or main entry point):
 *   import './chartSetup';
 *
 * Then remove ChartJS.register() calls from individual chart components.
 *
 * BENEFITS:
 * - Faster module parsing (removed from each chart)
 * - Single source of truth for registered components
 * - Easier to add new controllers/elements
 *
 * NOTE: Custom per-chart plugins (like waterfallConnectorPlugin) are still
 * registered in their respective chart files since they're specific to that chart.
 */

import {
  Chart as ChartJS,
  // Scales
  CategoryScale,
  LinearScale,
  // Controllers
  BarController,
  LineController,
  BubbleController,
  // Elements
  BarElement,
  LineElement,
  PointElement,
  // Plugins
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

// Annotation plugin for beads chart string ranges
import annotationPlugin from 'chartjs-plugin-annotation';

// Register all components globally
ChartJS.register(
  // Scales
  CategoryScale,
  LinearScale,
  // Controllers
  BarController,
  LineController,
  BubbleController,
  // Elements
  BarElement,
  LineElement,
  PointElement,
  // Plugins
  Title,
  Tooltip,
  Legend,
  Filler,
  annotationPlugin
);

/**
 * Register a custom plugin at runtime.
 * Use this for chart-specific plugins that are only needed by one chart.
 */
export function registerPlugin(plugin) {
  ChartJS.register(plugin);
}

// Export ChartJS for components that need direct access
export { ChartJS };
