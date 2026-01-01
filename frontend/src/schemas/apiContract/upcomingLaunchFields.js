/**
 * Upcoming Launches Field Helpers
 *
 * Constants and accessors for /api/upcoming-launches/all responses.
 * Canonical field names are sourced from generated backend contracts.
 */

import { getContract } from '../../generated/apiContract';
import { IS_DEV, IS_TEST } from '../../config/env';

const upcomingAllContract = getContract('upcoming-launches/all');
const upcomingAllFields = upcomingAllContract?.response_schema?.data_fields || {};

const resolveField = (fieldName) => {
  if (!upcomingAllFields[fieldName]) {
    if (IS_TEST) {
      throw new Error(`[API CONTRACT] Missing upcoming launches field: ${fieldName}`);
    }
    if (IS_DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[API CONTRACT] Missing upcoming launches field: ${fieldName}`);
    }
  }
  return fieldName;
};

export const UpcomingLaunchesField = {
  COUNT: resolveField('count'),
  SUMMARY: resolveField('summary'),
  META: resolveField('meta'),
  DATA: resolveField('data'),
};

export const getUpcomingLaunchesField = (data, field) => {
  if (!data) return undefined;

  if (data[field] !== undefined) {
    return data[field];
  }

  return data[field];
};
