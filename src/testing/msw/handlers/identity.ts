import { ApiRoutes } from '../../../app/core/api/api-routes';
import { successHandlers } from './handlers-from-snapshot';

/** The success path of every `identity` operation, generated from the snapshot. */
export const identityHandlers = successHandlers(ApiRoutes.identity);
