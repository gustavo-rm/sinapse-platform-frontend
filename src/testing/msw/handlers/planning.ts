import { ApiRoutes } from '../../../app/core/api/api-routes';
import { successHandlers } from './handlers-from-snapshot';

/** The success path of every `planning` operation, generated from the snapshot. */
export const planningHandlers = successHandlers(ApiRoutes.planning);
