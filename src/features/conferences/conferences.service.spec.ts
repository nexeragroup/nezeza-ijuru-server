import { jest } from '@jest/globals';
import { ConferencesService } from './conferences.service';
import { ConferencesEntity } from './entity/conferences.entity';
import { MediaEntity } from '../media/entity/media.entity';
import { MediaTargetType, MediaType } from '../../common/enums/media.enum';

describe('ConferencesService', () => {
  it('includes the selected conference image in published list responses', async () => {
    const conference = {
      id: 'conference-1',
      featuredMediaId: 'media-1',
    } as ConferencesEntity;
    const featuredMedia = {
      id: 'media-1',
      targetType: MediaTargetType.CONFERENCE,
      targetId: 'conference-1',
      mediaType: MediaType.IMAGE,
      url: 'https://example.test/conference.jpg',
    } as MediaEntity;
    const conferencesRepository = {
      find: jest.fn().mockResolvedValue([conference]),
    };
    const mediaRepository = {
      findBy: jest.fn().mockResolvedValue([featuredMedia]),
    };
    const service = new ConferencesService(
      conferencesRepository as never,
      {} as never,
      {} as never,
      mediaRepository as never,
    );

    const conferences = await service.findPublishedConferences();

    expect(conferences).toEqual([
      expect.objectContaining({ featuredMedia }),
    ]);
    expect(mediaRepository.findBy).toHaveBeenCalledTimes(1);
  });
});
