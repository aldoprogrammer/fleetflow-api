import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { PERMISSIONS } from '@fleetflow/shared';
import { Observable } from 'rxjs';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  MarkAllReadResponseDto,
  NotificationResponseDto,
  UnreadCountResponseDto,
} from './dto/notification-response.dto';
import { NotificationRealtimeService } from './notification-realtime.service';
import { NotificationsService } from './notifications.service';

function toDto(row: {
  id: string;
  type: NotificationResponseDto['type'];
  title: string;
  body: string;
  orderId: string | null;
  readAt: Date | null;
  createdAt: Date;
}): NotificationResponseDto {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    orderId: row.orderId,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    isRead: row.readAt != null,
  };
}

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSIONS.NOTIFICATIONS_READ)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly realtime: NotificationRealtimeService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List notifications for the authenticated driver' })
  @ApiQuery({ name: 'unreadOnly', required: false, type: Boolean })
  @ApiOkResponse({ type: NotificationResponseDto, isArray: true })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('unreadOnly') unreadOnly?: string,
  ): Promise<NotificationResponseDto[]> {
    const rows = await this.notificationsService.listForUser(user.id, {
      unreadOnly: unreadOnly === 'true' || unreadOnly === '1',
    });
    return rows.map(toDto);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Unread notification count' })
  @ApiOkResponse({ type: UnreadCountResponseDto })
  async unreadCount(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UnreadCountResponseDto> {
    return {
      count: await this.notificationsService.unreadCount(user.id),
    };
  }

  @Sse('stream')
  @ApiOperation({
    summary:
      'Realtime SSE stream (Redis pub/sub). Keep Authorization bearer token.',
  })
  stream(@CurrentUser() user: AuthenticatedUser): Observable<MessageEvent> {
    return this.realtime.streamForUser(user.id);
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark one notification as read' })
  @ApiOkResponse({ type: NotificationResponseDto })
  async markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<NotificationResponseDto> {
    const row = await this.notificationsService.markRead(user.id, id);
    return toDto(row);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiOkResponse({ type: MarkAllReadResponseDto })
  async markAllRead(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MarkAllReadResponseDto> {
    return this.notificationsService.markAllRead(user.id);
  }
}
