import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { AddressesService } from './addresses.service'
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto'

@Controller('addresses')
@UseGuards(JwtAuthGuard)
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Get()
  findAll(@Request() req: { user: { id: string } }) {
    return this.addressesService.findAll(req.user.id)
  }

  @Get(':id')
  findOne(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.addressesService.findOne(req.user.id, id)
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Request() req: { user: { id: string } }, @Body() dto: CreateAddressDto) {
    return this.addressesService.create(req.user.id, dto)
  }

  @Put(':id')
  update(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addressesService.update(req.user.id, id, dto)
  }

  @Post(':id/default')
  @HttpCode(HttpStatus.OK)
  setDefault(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.addressesService.setDefault(req.user.id, id)
  }

  @Delete(':id')
  remove(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.addressesService.remove(req.user.id, id)
  }
}
