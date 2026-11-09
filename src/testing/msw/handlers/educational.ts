import { ApiRoutes } from '../../../app/core/api/api-routes';
import { successHandlers } from './handlers-from-snapshot';

/** The success path of every `educational` operation, generated from the snapshot. */
export const educationalHandlers = successHandlers(ApiRoutes.educational);
