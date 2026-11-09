import { ApiRoutes } from '../../../app/core/api/api-routes';
import { successHandlers } from './handlers-from-snapshot';

/** The success path of every `readModel` operation, generated from the snapshot. */
export const readModelHandlers = successHandlers(ApiRoutes.readModel);
