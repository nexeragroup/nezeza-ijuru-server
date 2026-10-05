import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { MediaService } from './media.service';
import { StorageService } from '../../modules/storage/services/storage.service';
import { MediaEntity } from './entity/media.entity';
import { ConferencesEntity } from '../conferences/entity/conferences.entity';
import { MediaTargetType, MediaType } from '../../common/enums/media.enum';

describe('MediaService', () => {
  it('sets a featured conference image as the conference display image', async () => {
    const mediaRepository = {
      create: jest.fn((value: object) => ({ id: 'media-1', ...value })),
      save: jest.fn(async (value: object) => value),
      update: jest.fn(),
    };
    const conferencesRepository = {
      exists: jest.fn().mockResolvedValue(true),
      update: jest.fn(),
    };
    const manager = {
      getRepository: jest.fn((entity: unknown) =>
        entity === MediaEntity ? mediaRepository : conferencesRepository,
      ),
    };
    const rootMediaRepository = {
      manager: {
        transaction: jest.fn(async (work: (manager: typeof manager) => unknown) => work(manager)),
      },
    };
    const service = new MediaService(
      rootMediaRepository as never,
      conferencesRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService,
      {} as StorageService,
    );

    await service.createExternal({
      targetType: MediaTargetType.CONFERENCE,
      targetId: 'conference-1',
      mediaType: MediaType.IMAGE,
      title: 'Conference image',
      url: 'https://example.test/conference.jpg',
      isFeatured: true,
    });

    expect(conferencesRepository.update).toHaveBeenCalledWith(
      { id: 'conference-1' },
      { featuredMediaId: 'media-1' },
    );
    expect(manager.getRepository).toHaveBeenCalledWith(ConferencesEntity);
  });
});
