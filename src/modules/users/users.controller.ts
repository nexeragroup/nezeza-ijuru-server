import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ROLES } from '../../common/constants/roles.constant';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/types/auth-request.interface';
import { AssignRolesDto } from '../roles/dto/role.dto';
import { UpdateProfile } from './dto/profile.dto';
import { toUserResponse, UserResponse } from './dto/public-user.dto';
import { ListUsersQuery, NewUser, UpdateUser } from './dto/user.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth('bearer')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /*
   * ----------------------------------------------------------------
   * Administrative user management
   * ----------------------------------------------------------------
   */

  @Post('new')
  @Roles(ROLES.DEVELOPER, ROLES.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a user',
  })
  async createUser(
    @Body()
    dto: NewUser,
  ): Promise<UserResponse> {
    return toUserResponse(await this.usersService.createUser(dto));
  }

  @Get('all')
  @Roles(ROLES.DEVELOPER, ROLES.ADMIN)
  @ApiOperation({
    summary: 'List users',
  })
  async findAllUsers(
    @Query()
    query: ListUsersQuery,
  ): Promise<UserResponse[]> {
    const users = await this.usersService.findAllUsers(query);

    return users.map(toUserResponse);
  }

  @Get('user/:id')
  @Roles(ROLES.DEVELOPER, ROLES.ADMIN)
  @ApiOperation({
    summary: 'Find a user by ID',
  })
  async findUserById(
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,
  ): Promise<UserResponse> {
    return toUserResponse(await this.usersService.findUserById(id));
  }

  @Put('update/:id')
  @Roles(ROLES.DEVELOPER, ROLES.ADMIN)
  @ApiOperation({
    summary: 'Update a user',
  })
  async updateUser(
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,

    @Body()
    dto: UpdateUser,
  ): Promise<UserResponse> {
    return toUserResponse(await this.usersService.updateUser(id, dto));
  }

  @Delete(':id')
  @Roles(ROLES.DEVELOPER, ROLES.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a user',
  })
  async deleteUser(
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,
  ): Promise<void> {
    await this.usersService.deleteUser(id);
  }

  /*
   * ----------------------------------------------------------------
   * Role management
   * ----------------------------------------------------------------
   */

  @Put(':id/roles')
  @Roles(ROLES.DEVELOPER, ROLES.ADMIN)
  @ApiOperation({
    summary: 'Assign roles to a user',
  })
  async assignRolesToUser(
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,

    @Body()
    dto: AssignRolesDto,
  ): Promise<UserResponse> {
    return toUserResponse(
      await this.usersService.assignRolesToUser(id, dto.roleIds),
    );
  }

  @Delete(':id/roles')
  @Roles(ROLES.DEVELOPER, ROLES.ADMIN)
  @ApiOperation({
    summary: 'Remove roles from a user',
  })
  async removeRolesFromUser(
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,

    @Body()
    dto: AssignRolesDto,
  ): Promise<UserResponse> {
    return toUserResponse(
      await this.usersService.removeRolesFromUser(id, dto.roleIds),
    );
  }

  /*
   * ----------------------------------------------------------------
   * Account state
   * ----------------------------------------------------------------
   */

  @Put(':id/activate')
  @Roles(ROLES.DEVELOPER, ROLES.ADMIN)
  @ApiOperation({
    summary: 'Activate a user',
  })
  async activateUser(
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,
  ): Promise<UserResponse> {
    return toUserResponse(await this.usersService.activateUser(id));
  }

  @Put(':id/unlock')
  @Roles(ROLES.DEVELOPER, ROLES.ADMIN)
  @ApiOperation({
    summary: 'Unlock a user',
  })
  async unlockUser(
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,
  ): Promise<UserResponse> {
    return toUserResponse(await this.usersService.unlockUser(id));
  }

  @Put(':id/lock')
  @Roles(ROLES.DEVELOPER, ROLES.ADMIN)
  @ApiOperation({
    summary: 'Lock a user',
  })
  async lockUser(
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,
  ): Promise<UserResponse> {
    return toUserResponse(await this.usersService.lockUser(id));
  }

  @Put(':id/suspend')
  @Roles(ROLES.DEVELOPER, ROLES.ADMIN)
  @ApiOperation({
    summary: 'Suspend a user',
  })
  async suspendUser(
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,
  ): Promise<UserResponse> {
    return toUserResponse(await this.usersService.suspendUser(id));
  }

  /*
   * ----------------------------------------------------------------
   * Current authenticated user
   * ----------------------------------------------------------------
   */

  @Get('me')
  @ApiOperation({
    summary: 'Get current user profile',
  })
  async getCurrentUser(
    @CurrentUser()
    user: AuthenticatedUser,
  ): Promise<UserResponse> {
    return toUserResponse(await this.usersService.findUserById(user.sub));
  }

  @Patch('me')
  @ApiOperation({
    summary: 'Update current user profile',
  })
  async updateCurrentUser(
    @CurrentUser()
    user: AuthenticatedUser,

    @Body()
    dto: UpdateProfile,
  ): Promise<UserResponse> {
    return toUserResponse(await this.usersService.updateProfile(user.sub, dto));
  }
}
