import { SNAPSHOT } from '../../../testing/contract';
import { ApiRoutes, DevProbeRoutes, ROUTE_TEMPLATES, routeTemplateOf } from './api-routes';

describe('ApiRoutes', () => {
  const snapshotPaths = Object.keys(SNAPSHOT.paths);

  it('holds every path of the vendored snapshot (no route the backend has is missing here)', () => {
    const missing = snapshotPaths.filter((path) => !ROUTE_TEMPLATES.includes(path));
    expect(missing).toEqual([]);
  });

  it('holds no path the snapshot does not have (no invented route)', () => {
    const invented = ROUTE_TEMPLATES.filter((path) => !snapshotPaths.includes(path));
    expect(invented).toEqual([]);
  });

  it('keeps the development-only probe routes out of ApiRoutes and out of the snapshot', () => {
    for (const probe of Object.values(DevProbeRoutes)) {
      expect(snapshotPaths).not.toContain(probe);
      expect(ROUTE_TEMPLATES).not.toContain(probe);
    }
  });

  it('lists each path once', () => {
    expect(new Set(ROUTE_TEMPLATES).size).toBe(ROUTE_TEMPLATES.length);
    expect(ROUTE_TEMPLATES).toHaveLength(51);
  });

  it('holds relative paths only', () => {
    for (const path of ROUTE_TEMPLATES) {
      expect(path).toMatch(/^\/[a-z]/);
      expect(path).not.toMatch(/^[a-z]+:|^\/\//i);
    }
  });

  it('expands path parameters, percent-encoding each as one segment', () => {
    const plan = ApiRoutes.planning.studyPlan;
    expect(plan({ planId: 'abc' })).toBe(plan.template.replace('{planId}', 'abc'));
    const panel = ApiRoutes.readModel.studentPanel;
    expect(panel({ classroomId: 'c1', accountId: 'a/1' })).toBe(
      panel.template.replace('{classroomId}', 'c1').replace('{accountId}', 'a%2F1'),
    );
  });

  it('refuses a missing path parameter instead of calling a wrong path', () => {
    expect(() => ApiRoutes.planning.goal({ goalId: '' })).toThrowError(/goalId/);
  });

  it('names the template of a concrete path, so a log never carries a path parameter', () => {
    const preview = ApiRoutes.educational.invitePreview;
    expect(routeTemplateOf(preview({ code: 'SECRET-CODE' }))).toBe(preview.template);
    expect(routeTemplateOf(`${ApiRoutes.readModel.myAgenda}?from=a&to=b`)).toBe(
      ApiRoutes.readModel.myAgenda,
    );
    expect(routeTemplateOf(ApiRoutes.identity.currentSession)).toBe(
      ApiRoutes.identity.currentSession,
    );
    expect(routeTemplateOf(ApiRoutes.identity.session({ sessionId: '123' }))).toBe(
      ApiRoutes.identity.session.template,
    );
    expect(routeTemplateOf(ApiRoutes.planning.currentStudyPlan)).toBe(
      ApiRoutes.planning.currentStudyPlan,
    );
    expect(routeTemplateOf('/elsewhere')).toBeNull();
  });
});
