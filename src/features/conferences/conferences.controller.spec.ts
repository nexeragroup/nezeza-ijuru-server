import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { ConferencesController } from './conferences.controller';
import { ConferencesService } from './conferences.service';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { PERMISSIONS_KEY } from '../../common/decorators/permissions.decorator';

describe('ConferencesController', () => {
  let controller: ConferencesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConferencesController],
      providers: [ConferencesService],
    }).compile();

    controller = module.get<ConferencesController>(ConferencesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('keeps public reads published and protects managed reads and writes', () => {
    const prototype = ConferencesController.prototype as unknown as Record<
      string,
      object
    >;
    const routeMethods = Object.getOwnPropertyNames(prototype).filter(
      (methodName) => methodName !== 'constructor',
    );

    const routes = routeMethods.map((methodName) => ({
      methodName,
      method: Reflect.getMetadata(METHOD_METADATA, prototype[methodName]),
      path: Reflect.getMetadata(PATH_METADATA, prototype[methodName]),
    }));

    const getRoutes = routes.filter(
      ({ method }) => method === RequestMethod.GET,
    );
    const writeRoutes = routes.filter(
      ({ method }) => method !== RequestMethod.GET,
    );

    expect(getRoutes).not.toHaveLength(0);
    expect(
      getRoutes.filter(
        ({ methodName }) =>
          Reflect.getMetadata(IS_PUBLIC_KEY, prototype[methodName]) === true,
      ),
    ).toHaveLength(getRoutes.length - 1);
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, prototype.conferenceByID),
    ).toHaveLength(1);
    expect(new Set(getRoutes.map(({ path }) => path)).size).toBe(
      getRoutes.length,
    );
    expect(
      writeRoutes.every(
        ({ methodName }) =>
          Reflect.getMetadata(PERMISSIONS_KEY, prototype[methodName])?.length,
      ),
    ).toBe(true);
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, ConferencesController),
    ).toBeUndefined();
  });
});
