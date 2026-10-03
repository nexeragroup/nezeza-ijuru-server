import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { ConferencesController } from './conferences/conferences.controller';
import { EventsController } from './events/events.controller';
import { MediaController } from './media/media.controller';
import { ProgramsController } from './programs/programs.controller';
import { SessionsController } from './sessions/sessions.controller';
import { PermissionsController } from '../modules/permissions/permissions.controller';
import { RolesController } from '../modules/roles/roles.controller';

describe('bulk creation routes', () => {
  const routes = [
    [ProgramsController, 'createBulkPrograms', 'bulk'],
    [ConferencesController, 'createBulkConferences', 'bulk'],
    [EventsController, 'createBulkEvents', 'bulk'],
    [SessionsController, 'createBulkSessions', 'bulk'],
    [MediaController, 'createBulkExternal', 'external/bulk'],
    [RolesController, 'createBulkRoles', 'bulk'],
    [PermissionsController, 'createBulkPermissions', 'bulk'],
  ] as const;

  it.each(routes)('%s requires authorization for %s', (controller, methodName, path) => {
    const prototype = controller.prototype as object;
    const method = (prototype as Record<string, object>)[methodName];

    expect(Reflect.getMetadata(METHOD_METADATA, method)).toBeDefined();
    expect(Reflect.getMetadata(PATH_METADATA, method)).toBe(path);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, method)).not.toBe(true);
  });
});
