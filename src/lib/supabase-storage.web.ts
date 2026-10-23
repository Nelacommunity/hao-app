// Browsers use window.localStorage; during server rendering there is no storage.
export const authStorage = typeof window === 'undefined' ? undefined : window.localStorage;
