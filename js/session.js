let userId = null;
let verifier = async () => false;
export function configureSession(id, check) { userId = id; verifier = check; }
export function preferenceKey(key) {
  if (!userId) throw new Error('La cuenta no está disponible');
  return `${key}:${userId}`;
}
export async function requireLicense(fresh = false) { return verifier(fresh); }
export function clearSession() { userId = null; verifier = async () => false; }
