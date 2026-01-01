const MODE = import.meta.env.MODE;
const IS_DEV = import.meta.env.DEV;
const IS_PROD = import.meta.env.PROD;
const IS_TEST = MODE === 'test';

const APP_VERSION = import.meta.env.VITE_APP_VERSION;
const ENABLE_PERF_LOGGER = IS_DEV && import.meta.env.VITE_ENABLE_PERF_LOGGER !== 'false';

export { MODE, IS_DEV, IS_PROD, IS_TEST, APP_VERSION, ENABLE_PERF_LOGGER };

export const getEnv = () => ({
  MODE,
  IS_DEV,
  IS_PROD,
  IS_TEST,
  APP_VERSION,
  ENABLE_PERF_LOGGER,
});
