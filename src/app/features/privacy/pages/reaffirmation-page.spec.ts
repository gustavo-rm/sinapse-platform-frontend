import { HttpResponse, http } from 'msw';

import { problemResponse } from '../../../../testing/msw/problems';
import { useMswServer } from '../../../../testing/msw/server';
import {
  type RecordedRequest,
  bodyOf,
  openApp,
  realTerms,
  stateBody,
  stateServer,
} from '../../../../testing/privacy';
import { ApiRoutes } from '../../../core/api/api-routes';

const server = useMswServer();
const OWED = stateBody({ requiresMajorityReaffirmation: true });

describe('the reaffirmation, /reafirmar-consentimento', () => {
  beforeEach(() => {
    server.use(http.get(ApiRoutes.identity.terms, () => HttpResponse.json(realTerms())));
  });

  it('says what is asked, shows the essential wording in full, and invents no deadline (K-K)', async () => {
    server.use(stateServer(OWED).handler);
    const { root, text } = await openApp('/reafirmar-consentimento');
    expect(root().querySelectorAll('h1')).toHaveLength(1);
    expect(text()).toContain('reafirmado em seu próprio nome');
    expect(text()).toContain('a conta continua funcionando normalmente');
    expect(text()).toContain('Texto do processamento de dados de aprendizagem.');
    expect(text()).not.toMatch(/\d+\s*dias|prazo|até \d/);
  });

  it('sends an empty body — the session identifies the holder — and lets the chain route', async () => {
    const writes: RecordedRequest[] = [];
    const state = stateServer(OWED);
    server.use(
      state.handler,
      http.post(ApiRoutes.identity.consentReaffirmation, async ({ request }) => {
        writes.push({ method: 'POST', path: '', body: await bodyOf(request) });
        state.set(stateBody());
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { click, router } = await openApp('/reafirmar-consentimento');
    await click('Reafirmar em meu nome');
    await vi.waitFor(() => expect(router.url).toBe('/hoje'));
    expect(writes.map((write) => write.body)).toEqual([{}]);
  });

  it('reads 409 as refused: re-reads the state and says so', async () => {
    const state = stateServer(OWED);
    server.use(state.handler);
    server.use(
      http.post(ApiRoutes.identity.consentReaffirmation, () =>
        problemResponse('urn:sinapse:problem:conflict'),
      ),
    );
    const { click, root, router } = await openApp('/reafirmar-consentimento');
    const calls = state.calls();
    await click('Reafirmar em meu nome');
    await vi.waitFor(() => expect(root().textContent).toContain('A reafirmação não foi aceita'));
    expect(state.calls()).toBe(calls + 1);
    expect(router.url).toBe('/reafirmar-consentimento');
  });

  it('shows the error state on a server failure', async () => {
    server.use(stateServer(OWED).handler);
    server.use(
      http.post(ApiRoutes.identity.consentReaffirmation, () =>
        problemResponse('urn:sinapse:problem:internal-error'),
      ),
    );
    const { click, root } = await openApp('/reafirmar-consentimento');
    await click('Reafirmar em meu nome');
    await vi.waitFor(() => expect(root().querySelector('sn-error-state')).not.toBeNull());
  });

  it('does not hold the person: "Agora não" opens the application for this session (ADR 0004)', async () => {
    server.use(stateServer(OWED).handler);
    const { click, router, harness } = await openApp('/reafirmar-consentimento');
    await click('Agora não');
    await vi.waitFor(() => expect(router.url).toBe('/hoje'));
    await harness.navigateByUrl('/agenda');
    expect(router.url).toBe('/agenda');
    // And it can be found again from the account area while it is owed.
    await harness.navigateByUrl('/conta');
    expect(
      (harness.fixture.nativeElement as HTMLElement).querySelector(
        'a[href="/reafirmar-consentimento"]',
      ),
    ).not.toBeNull();
    await harness.navigateByUrl('/reafirmar-consentimento');
    expect(router.url).toBe('/reafirmar-consentimento');
  });

  it('asks again in the next session', async () => {
    server.use(stateServer(OWED).handler);
    const { click, router, store, harness } = await openApp('/reafirmar-consentimento');
    await click('Agora não');
    await vi.waitFor(() => expect(router.url).toBe('/hoje'));
    store.begin();
    await harness.navigateByUrl('/agenda');
    expect(router.url).toBe('/reafirmar-consentimento');
  });
});
