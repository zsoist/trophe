const SIGNUP_DESTINATION = '/login?mode=signup';

export function signupDestination(code: unknown): string {
  if (
    typeof code !== 'string' ||
    code.length === 0 ||
    code.length > 256
  ) {
    return SIGNUP_DESTINATION;
  }

  const params = new URLSearchParams({ mode: 'signup', code });
  return `/login?${params.toString()}`;
}
