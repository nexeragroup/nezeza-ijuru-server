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
} from '@nestjs/common';

import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from '../../common/decorators/roles.decorator';

import { ROLES } from '../../common/constants/roles.constant';

import { NewPermission, UpdatePermission } from './dto/permission.dto';

import { PermissionsEntity } from './entity/permissions.entity';

import { PermissionsService } from './permissions.service';

@ApiTags('Permissions')
@ApiBearerAuth('bearer')
@Controller('permissions')
@Roles(ROLES.DEVELOPER, ROLES.ADMIN)
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Post('new')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a permission',
  })
  createPermission(@Body() dto: NewPermission): Promise<PermissionsEntity> {
    return this.permissionsService.createPermission(dto);
  }

  @Post('bulk')
  @Roles(ROLES.DEVELOPER, ROLES.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create multiple permissions',
  })
  createBulkPermissions(
    @Body(new ParseArrayPipe({ items: NewPermission }))
    payload: NewPermission[],
  ): Promise<PermissionsEntity[]> {
    return this.permissionsService.createBulkPermissions(payload);
  }

  @Get('all')
  @ApiOperation({
    summary: 'List permissions',
  })
  findAllPermissions(): Promise<PermissionsEntity[]> {
    return this.permissionsService.findAllPermissions();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a permission',
  })
  findPermissionById(
    @Param('id', new ParseUUIDPipe({ version: '4' }))
    id: string,
  ): Promise<PermissionsEntity> {
    return this.permissionsService.findPermissionById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a permission' })
  updatePermissiondate(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body()
    dto: UpdatePermission,
  ): Promise<PermissionsEntity> {
    return this.permissionsService.updatePermission(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a permission',
  })
  async deletePermission(
    @Param('id', new ParseUUIDPipe({ version: '4' }))
    id: string,
  ): Promise<void> {
    await this.permissionsService.deletePermission(id);
  }
}
