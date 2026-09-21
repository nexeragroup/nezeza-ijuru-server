import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { LivestreamService } from './livestream.service';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { PERMISSIONS_KEY } from '../../common/decorators/permissions.decorator';

describe('MediaController', () => {
  let controller: MediaController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MediaController],
      providers: [
        { provide: MediaService, useValue: {} },
        { provide: LivestreamService, useValue: {} },
      ],
    }).compile();

    controller = module.get<MediaController>(MediaController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('keeps every GET public and requires permissions for writes', () => {
    const prototype = MediaController.prototype as unknown as Record<
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
      getRoutes.every(
        ({ methodName }) =>
          Reflect.getMetadata(IS_PUBLIC_KEY, prototype[methodName]) === true,
      ),
    ).toBe(true);
    expect(new Set(getRoutes.map(({ path }) => path)).size).toBe(
      getRoutes.length,
    );
    const publicWriteRoutes = writeRoutes.filter(
      ({ methodName }) =>
        Reflect.getMetadata(IS_PUBLIC_KEY, prototype[methodName]) === true,
    );
    const protectedWriteRoutes = writeRoutes.filter(
      ({ methodName }) =>
        Reflect.getMetadata(IS_PUBLIC_KEY, prototype[methodName]) !== true,
    );
    expect(publicWriteRoutes).toHaveLength(0);
    expect(
      protectedWriteRoutes.every(
        ({ methodName }) =>
          Reflect.getMetadata(PERMISSIONS_KEY, prototype[methodName])?.length,
      ),
    ).toBe(true);
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, MediaController),
    ).toBeUndefined();
  });
});
