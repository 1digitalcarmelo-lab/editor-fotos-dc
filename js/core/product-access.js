// Contrato de acceso de la Suite. No crea permisos ni modifica suscripciones.
const PRO_ACCESS_STATES = ['product_full', 'bundle_full', 'suite_full', 'trial_active'];

export function isProAccessState(state) {
  return PRO_ACCESS_STATES.includes(state);
}

export function canAccessProduct(access, { allowFree = false } = {}) {
  return access?.can_access === true &&
    (isProAccessState(access.access_state) || (allowFree && access.access_state === 'free_active'));
}

export async function getProductAccess(client, productSlug) {
  const params = { p_product_slug: productSlug };
  const result = await client.rpc('get_my_product_access_v2', params);
  // Compatibilidad solo si V2 no existe en el esquema. Errores de permiso,
  // red o servidor se devuelven tal cual, sin intentar otro camino de acceso.
  if (result.error?.code === 'PGRST202') {
    return client.rpc('get_my_product_access', params);
  }
  return result;
}

