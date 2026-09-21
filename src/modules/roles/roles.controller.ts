import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseArrayPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ROLES } from '../../common/constants/roles.constant';
import { Roles } from '../../common/decorators/roles.decorator';
import { AssignPermissionsDto, NewRole, UpdateRole } from './dto/role.dto';
import { RolesEntity } from './entity/roles.entity';
import { RolesService } from './roles.service';

@ApiTags('Roles')
@ApiBearerAuth('bearer')
@Controller('roles')
@Roles(ROLES.DEVELOPER, ROLES.ADMIN)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post('new')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a role',
  })
  createRole(
    @Body()
    dto: NewRole,
  ): Promise<RolesEntity> {
    return this.rolesService.createRole(dto);
  }

  @Post('bulk')
  @Roles(ROLES.DEVELOPER, ROLES.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create multiple roles',
  })
  async createBulkRoles(
    @Body(new ParseArrayPipe({ items: NewRole }))
    payload: NewRole[],
  ): Promise<{
    success: true;
    message: string;
    count: number;
    data: RolesEntity[];
  }> {
    const roles = await this.rolesService.createBulkRoles(payload);
    return {
      success: true,
      message: `${roles.length} roles created successfully`,
      count: roles.length,
      data: roles,
    };
  }

  @Get('all')
  @ApiOperation({
    summary: 'List active roles',
  })
  findAllRoles(): Promise<RolesEntity[]> {
    return this.rolesService.findAllRoles();
  }

  @Get('all-with-deleted')
  @ApiOperation({
    summary: 'List roles including deleted roles',
  })
  findAllRolesWithDeleted(): Promise<RolesEntity[]> {
    return this.rolesService.findAllRolesWithDeleted();
  }

  @Get('by-name/:name')
  @ApiOperation({
    summary: 'Find a role by name',
  })
  findRoleByName(
    @Param('name')
    name: string,
  ): Promise<RolesEntity | null> {
    return this.rolesService.findRoleByName(name);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Find a role by ID',
  })
  findRoleById(
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,
  ): Promise<RolesEntity> {
    return this.rolesService.findRoleById(id);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Update a role',
  })
  updateRole(
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,

    @Body()
    dto: UpdateRole,
  ): Promise<RolesEntity> {
    return this.rolesService.updateRole(id, dto);
  }

  @Put(':id/permissions')
  @ApiOperation({
    summary: 'Assign permissions to a role',
  })
  assignPermissionsToRole(
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,

    @Body()
    dto: AssignPermissionsDto,
  ): Promise<RolesEntity> {
    return this.rolesService.assignPermissionsToRole(id, dto.permissionIds);
  }

  @Delete(':id/permissions')
  @ApiOperation({
    summary: 'Remove permissions from a role',
  })
  removePermissionsFromRole(
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,

    @Body()
    dto: AssignPermissionsDto,
  ): Promise<RolesEntity> {
    return this.rolesService.removePermissionsFromRole(id, dto.permissionIds);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Soft delete a role',
  })
  async softDeleteRole(
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,
  ): Promise<void> {
    await this.rolesService.softDeleteRole(id);
  }

  @Patch(':id/restore')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Restore a deleted role',
  })
  async restoreRole(
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,
  ): Promise<void> {
    await this.rolesService.restoreRole(id);
  }

  @Delete(':id/force')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Permanently delete a role',
  })
  async forceDeleteRole(
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,
  ): Promise<void> {
    await this.rolesService.forceDeleteRole(id);
  }
}
