import apiContractJson from './apiContract.json';

export const apiContract = apiContractJson;

export function getContract(endpoint) {
  return apiContract.contracts?.[endpoint] || null;
}

export default apiContract;
