/**
 * Bodies and a small rendering harness for the consent, reaffirmation, suspended and verification
 * screens (FE-5). The bodies have the shapes observed against `sinapse-platform@46b5b3c` under the
 * `local` profile (`docs/ai/STATE.md`), with ids of this file's own.
 */
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { HttpResponse, type JsonBodyType, http } from 'msw';

import { appConfig } from '../app/app.config';
import { ApiRoutes } from '../app/core/api/api-routes';
import type { ConsentPurpose } from '../app/core/api/contract/enums';
import { NETWORK_RETRY_DELAYS_MS } from '../app/core/api/interceptors/network-retry.interceptor';
import { SessionStore } from '../app/core/session/session-store';
import { problemResponse } from './msw/problems';

// A mapped type: `Record<…, string>` is reserved to the label catalogues (R5).
// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
export const WORDING_ID: { readonly [P in ConsentPurpose]: string } = {
  LEARNING_DATA_PROCESSING: '2ce84157-43f9-458b-8339-ff0ccc44466e',
  INSTITUTION_SHARING: 'da38f2af-7697-43b2-bd9d-105ea733bfd2',
  ACADEMIC_RESEARCH: 'a0f3248f-22b9-4253-8260-0bc75240338f',
};

/** `GET /api/v1/terms` as the `local` profile answers it: the three `dev-0` placeholders. */
export function placeholderTerms(): JsonBodyType {
  return (['ACADEMIC_RESEARCH', 'INSTITUTION_SHARING', 'LEARNING_DATA_PROCESSING'] as const).map(
    (purpose, index) => ({
      id: WORDING_ID[purpose],
      purpose,
      version: 'dev-0',
      body: 'Development placeholder. Not a consent term.',
      publishedAt: `2026-11-10T21:11:54.${295 - index}Z`,
    }),
  );
}

/** A real-looking set of wordings: a version per purpose, and a superseded one for research. */
export function realTerms(): JsonBodyType {
  return [
    {
      id: 'research-v2',
      purpose: 'ACADEMIC_RESEARCH',
      version: '2026.2',
      body: 'Texto da pesquisa, versão 2.\nSegundo parágrafo.',
      publishedAt: '2026-10-01T12:00:00Z',
    },
    {
      id: 'research-v1',
      purpose: 'ACADEMIC_RESEARCH',
      version: '2026.1',
      body: 'Texto da pesquisa, versão 1.',
      publishedAt: '2026-08-01T12:00:00Z',
    },
    {
      id: 'ldp-v1',
      purpose: 'LEARNING_DATA_PROCESSING',
      version: '2026.1',
      body: 'Texto do processamento de dados de aprendizagem.',
      publishedAt: '2026-08-01T12:00:00Z',
    },
    {
      id: 'sharing-v1',
      purpose: 'INSTITUTION_SHARING',
      version: '2026.1',
      body: 'Texto do compartilhamento com a turma.',
      publishedAt: '2026-08-01T12:00:00Z',
    },
  ];
}

/** A consent record of `GET /api/v1/consents`. */
export function consentRecord(
  purpose: ConsentPurpose,
  revoked = false,
  termsVersion = 'dev-0',
): JsonBodyType {
  return {
    id: `${purpose}-${revoked ? 'revoked' : 'live'}`,
    purpose,
    grantedBy: 'SELF',
    termsVersionId: WORDING_ID[purpose],
    termsVersion,
    grantedAt: '2026-11-10T21:12:36.132080Z',
    ...(revoked ? { revokedAt: '2026-11-10T21:12:42.814907Z' } : {}),
  };
}

/** `GET /api/v1/me/state`, ACTIVE and set up unless overridden. */
export function stateBody(overrides: Record<string, unknown> = {}): JsonBodyType {
  return {
    accountStatus: 'ACTIVE',
    timeZone: 'America/Sao_Paulo',
    pendingConsents: [],
    requiresMajorityReaffirmation: false,
    setupComplete: true,
    ...overrides,
  };
}

/** The open erasure request observed in FE-5: a 7-day window. */
export function openErasureRequest(): JsonBodyType {
  return {
    id: '6d665966-3f41-46fb-8f78-0b5f8a68450d',
    status: 'REQUESTED',
    requestedAt: '2026-11-10T21:12:55.197417Z',
    effectiveAt: '2026-11-17T21:12:55.197417Z',
  };
}

/** A mutable `/me/state` answer: `set` changes what the next read returns; `unauthenticated` ends it. */
export function stateServer(initial: JsonBodyType) {
  let body: JsonBodyType | null = initial;
  let calls = 0;
  const handler = http.get(ApiRoutes.readModel.myState, () => {
    calls++;
    return body === null
      ? problemResponse('urn:sinapse:problem:unauthenticated')
      : HttpResponse.json(body);
  });
  return {
    handler,
    set: (next: JsonBodyType) => (body = next),
    unauthenticated: () => (body = null),
    calls: () => calls,
  };
}

/** Records every request a handler answered: method, path, and the JSON body if any. */
export interface RecordedRequest {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
}

export async function bodyOf(request: Request): Promise<unknown> {
  const text = await request.text();
  return text === '' ? undefined : (JSON.parse(text) as unknown);
}

/** Opens `url` in the whole application, with MSW answering. */
export async function openApp(url: string, providers: unknown[] = []) {
  TestBed.configureTestingModule({
    providers: [
      ...appConfig.providers,
      { provide: NETWORK_RETRY_DELAYS_MS, useValue: [1, 1] },
      ...(providers as never[]),
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  await harness.fixture.whenStable();
  const root = () => harness.fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
  };
  const buttonNamed = (name: string | RegExp) =>
    [...root().querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      typeof name === 'string'
        ? button.textContent?.trim() === name
        : name.test(button.textContent?.trim() ?? ''),
    );
  const click = async (name: string | RegExp) => {
    const button = buttonNamed(name);
    if (button === undefined) {
      throw new Error(`No button named ${String(name)} in: ${root().textContent}`);
    }
    button.click();
    await settle();
  };
  const text = () => (root().textContent ?? '').replace(/\s+/g, ' ');
  return {
    harness,
    root,
    settle,
    buttonNamed,
    click,
    text,
    router: TestBed.inject(Router),
    store: TestBed.inject(SessionStore),
  };
}
