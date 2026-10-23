// SQLite-backed localStorage keeps the session on device across app restarts.
import 'expo-sqlite/localStorage/install';

export const authStorage = globalThis.localStorage;
