import { ApiRoutes } from '../../../app/core/api/api-routes';
import { successHandlers } from './handlers-from-snapshot';

/** The success path of every `dataRights` operation, generated from the snapshot. */
export const dataRightsHandlers = successHandlers(ApiRoutes.dataRights);
