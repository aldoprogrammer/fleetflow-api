import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create dispatch order',
    description:
      'Persists a new delivery dispatch order and enqueues a background match-driver job.',
  })
  @ApiCreatedResponse({
    description: 'Dispatch order created and driver matching job enqueued.',
    type: OrderResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Validation failed for one or more request fields.',
  })
  async createOrder(@Body() dto: CreateOrderDto): Promise<OrderResponseDto> {
    return this.ordersService.createOrder(dto);
  }
}
