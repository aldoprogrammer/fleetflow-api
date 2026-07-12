import {

  Body,

  Controller,

  Get,

  HttpCode,

  HttpStatus,

  Param,

  ParseUUIDPipe,

  Post,

  Req,

  UseGuards,

} from '@nestjs/common';

import {

  ApiBadRequestResponse,

  ApiBearerAuth,

  ApiCreatedResponse,

  ApiForbiddenResponse,

  ApiHeader,

  ApiNotFoundResponse,

  ApiOkResponse,

  ApiOperation,

  ApiTags,

  ApiUnauthorizedResponse,

} from '@nestjs/swagger';

import { PERMISSIONS } from '@fleetflow/shared';

import type { Request } from 'express';

import {

  RequireAnyPermission,

  RequirePermissions,

} from '../auth/decorators/permissions.decorator';

import { HybridAuthGuard } from '../auth/guards/hybrid-auth.guard';

import { PermissionsGuard } from '../auth/guards/permissions.guard';

import { CreateOrderDto } from './dto/create-order.dto';

import { EstimateOrderPriceDto } from './dto/estimate-order-price.dto';

import { OrderResponseDto } from './dto/order-response.dto';

import { resolveOrderAccessContext } from './interfaces/order-access.interface';

import { OrdersService } from './orders.service';



@ApiTags('orders')

@Controller('orders')

@UseGuards(HybridAuthGuard, PermissionsGuard)

@ApiHeader({

  name: 'x-api-key',

  description: 'Merchant B2B API key (alternative to Bearer JWT)',

  required: false,

})

@ApiBearerAuth()

export class OrdersController {

  constructor(private readonly ordersService: OrdersService) {}



  @Post()

  @HttpCode(HttpStatus.CREATED)

  @RequirePermissions(PERMISSIONS.ORDERS_CREATE)

  @ApiOperation({

    summary: 'Create dispatch order',

    description:

      'Creates a priced order, validates merchant balance, writes DRAFT/PENDING states, and enqueues BullMQ dispatch matching.',

  })

  @ApiCreatedResponse({ type: OrderResponseDto })

  @ApiBadRequestResponse({ description: 'Validation or insufficient balance.' })

  @ApiUnauthorizedResponse({ description: 'Missing or invalid credentials.' })

  @ApiForbiddenResponse({ description: 'Insufficient permissions.' })

  async createOrder(

    @Req() request: Request,

    @Body() dto: CreateOrderDto,

  ): Promise<OrderResponseDto> {

    const access = resolveOrderAccessContext(request);

    return this.ordersService.createOrder(access, dto);

  }



  @Post('estimate')

  @HttpCode(HttpStatus.OK)

  @RequirePermissions(PERMISSIONS.ORDERS_CREATE)

  @ApiOperation({

    summary: 'Estimate dispatch price',

    description:

      'Returns distance-based fare quote using the same pricing engine as order creation.',

  })

  @ApiOkResponse({ description: 'Price quote in IDR.' })

  estimateOrderPrice(@Body() dto: EstimateOrderPriceDto) {

    return this.ordersService.estimateOrderPrice(dto);

  }



  @Get()

  @RequireAnyPermission(

    PERMISSIONS.ORDERS_READ_OWN,

    PERMISSIONS.ORDERS_READ_ASSIGNED,

    PERMISSIONS.ORDERS_READ_ALL,

  )

  @ApiOperation({

    summary: 'List orders',

    description: 'Role-scoped order monitor for merchants and operations teams.',

  })

  @ApiOkResponse({ type: [OrderResponseDto] })

  async listOrders(@Req() request: Request) {

    const access = resolveOrderAccessContext(request);

    return this.ordersService.listOrders(access);

  }



  @Post(':id/pickup')

  @HttpCode(HttpStatus.OK)

  @RequireAnyPermission(

    PERMISSIONS.ORDERS_READ_ASSIGNED,

    PERMISSIONS.ORDERS_READ_ALL,

    PERMISSIONS.FLEET_MANAGE,

  )

  @ApiOperation({ summary: 'Mark order picked up (ASSIGNED → PICKED_UP)' })

  @ApiOkResponse({ type: OrderResponseDto })

  async markPickedUp(

    @Req() request: Request,

    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,

  ): Promise<OrderResponseDto> {

    const access = resolveOrderAccessContext(request);

    return this.ordersService.markOrderPickedUp(access, id);

  }



  @Post(':id/deliver')

  @HttpCode(HttpStatus.OK)

  @RequireAnyPermission(

    PERMISSIONS.ORDERS_READ_ASSIGNED,

    PERMISSIONS.ORDERS_READ_ALL,

    PERMISSIONS.FLEET_MANAGE,

  )

  @ApiOperation({ summary: 'Mark order delivered (PICKED_UP → DELIVERED)' })

  @ApiOkResponse({ type: OrderResponseDto })

  async markDelivered(

    @Req() request: Request,

    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,

  ): Promise<OrderResponseDto> {

    const access = resolveOrderAccessContext(request);

    return this.ordersService.markOrderDelivered(access, id);

  }



  @Get(':id')

  @RequireAnyPermission(

    PERMISSIONS.ORDERS_READ_OWN,

    PERMISSIONS.ORDERS_READ_ASSIGNED,

    PERMISSIONS.ORDERS_READ_ALL,

  )

  @ApiOperation({

    summary: 'Get order by ID',

    description: 'Returns full order state with nested timeline entries (role-scoped).',

  })

  @ApiOkResponse({ type: OrderResponseDto })

  @ApiNotFoundResponse({ description: 'Order not found.' })

  @ApiUnauthorizedResponse({ description: 'Missing or invalid credentials.' })

  @ApiForbiddenResponse({ description: 'Insufficient permissions or scope.' })

  async getOrder(

    @Req() request: Request,

    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,

  ): Promise<OrderResponseDto> {

    const access = resolveOrderAccessContext(request);

    return this.ordersService.getOrderById(access, id);

  }

}


