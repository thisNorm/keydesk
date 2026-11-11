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

export function replaceQueryAuthentication(url: URL, auth: URLSearchParams): void {
  const reserved = new Set(Array.from(auth.keys(), (name) => name.toLowerCase()));
  // Decode names for matching, but keep the caller's other query fields verbatim.
  const fields = url.search
    ? url.search
        .slice(1)
        .split('&')
        .filter((field) => {
          const equals = field.indexOf('=');
          const rawName = equals < 0 ? field : field.slice(0, equals);
          const name = new URLSearchParams('?' + rawName).keys().next().value;
          return name === undefined || !reserved.has(name.toLowerCase());
        })
    : [];
  fields.push(auth.toString());
  url.search = '?' + fields.join('&');
}
