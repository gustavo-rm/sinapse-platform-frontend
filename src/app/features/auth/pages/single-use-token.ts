import type { ActivatedRoute, Router } from '@angular/router';

/**
 * The query parameter that carries a single-use token in a link of this client:
 * `/verificar-email?token=<token>` (FE-5) and `/redefinir-senha?token=<token>` (FE-6). These paths
 * and this parameter are the CONTRACT the backend needs to build the links of its e-mails
 * (`docs/ai/CONTEXT.md`).
 */
export const TOKEN_PARAM = 'token';

/**
 * Takes the single-use token of a link out of the URL, the one way both token screens do it
 * (FE-5's verification, FE-6's password reset).
 *
 * The URL is REPLACED at once, before anything is done with the token — a navigation with
 * `replaceUrl` and no query — so the credential is not left in the address bar nor in the history
 * entry, whatever happens next. Returns the token trimmed, `''` when the parameter was there but
 * empty, and `null` when there was none (the URL is then left alone).
 *
 * The caller keeps the value in memory only: never in a form control, a message, the title, a log
 * or any storage (`core/session/no-leak.spec.ts`).
 */
export async function takeTokenFromUrl(
  router: Router,
  route: ActivatedRoute,
): Promise<string | null> {
  const fromLink = route.snapshot.queryParamMap.get(TOKEN_PARAM);
  if (fromLink === null) {
    return null;
  }
  await router.navigate([], { relativeTo: route, queryParams: {}, replaceUrl: true });
  return fromLink.trim();
}
