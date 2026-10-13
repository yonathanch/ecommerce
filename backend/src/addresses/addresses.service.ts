import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto'

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string) {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    })
  }

  async findOne(userId: string, id: string) {
    const address = await this.prisma.address.findFirst({ where: { id, userId } })
    if (!address) throw new NotFoundException('Address not found')
    return address
  }

  async create(userId: string, dto: CreateAddressDto) {
    const count = await this.prisma.address.count({ where: { userId } })
    // The first address is always the default one.
    const isDefault = dto.isDefault ?? count === 0

    return this.prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } })
      }
      return tx.address.create({
        data: { ...dto, userId, isDefault },
      })
    })
  }

  async update(userId: string, id: string, dto: UpdateAddressDto) {
    await this.findOne(userId, id)

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault === true) {
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } })
      }
      return tx.address.update({ where: { id }, data: dto })
    })
  }

  async remove(userId: string, id: string) {
    const address = await this.findOne(userId, id)
    await this.prisma.address.delete({ where: { id } })

    // Keep exactly one default address: promote the most recent remaining one.
    if (address.isDefault) {
      const next = await this.prisma.address.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      })
      if (next) {
        await this.prisma.address.update({ where: { id: next.id }, data: { isDefault: true } })
      }
    }
    return { deleted: true, id }
  }

  async setDefault(userId: string, id: string) {
    await this.findOne(userId, id)
    return this.prisma.$transaction(async (tx) => {
      await tx.address.updateMany({ where: { userId }, data: { isDefault: false } })
      return tx.address.update({ where: { id }, data: { isDefault: true } })
    })
  }
}
