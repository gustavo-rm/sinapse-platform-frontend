import { ApiRoutes } from '../../../app/core/api/api-routes';
import { successHandlers } from './handlers-from-snapshot';

/** The success path of every `curriculum` operation, generated from the snapshot. */
export const curriculumHandlers = successHandlers(ApiRoutes.curriculum);
