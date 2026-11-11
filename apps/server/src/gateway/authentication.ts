import type { GatewayAuthBinding, GatewayRouteDraft } from '@keydesk/contracts';

export function authenticationBindings(route: GatewayRouteDraft): GatewayAuthBinding[] {
  if (route.adapter === 'generic' && route.authBindings) return route.authBindings;
  const anthropic = route.adapter === 'anthropic';
  return [
    {
      credentialId: route.credentialId,
      location: 'header',
      name: anthropic
        ? 'x-api-key'
        : route.adapter === 'generic'
          ? (route.authHeader ?? 'authorization')
          : 'authorization',
      ...(anthropic || (route.adapter === 'generic' && route.authScheme === 'raw')
        ? {}
        : { prefix: 'Bearer' }),
    },
  ];
}

export function routeCredentialIds(route: GatewayRouteDraft): string[] {
  return [
    ...new Set([
      route.credentialId,
      ...authenticationBindings(route).map((binding) => binding.credentialId),
    ]),
  ];
}
