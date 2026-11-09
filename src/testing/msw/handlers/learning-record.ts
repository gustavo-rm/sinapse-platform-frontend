import { ApiRoutes } from '../../../app/core/api/api-routes';
import { successHandlers } from './handlers-from-snapshot';

/** The success path of every `learningRecord` operation, generated from the snapshot. */
export const learningRecordHandlers = successHandlers(ApiRoutes.learningRecord);
