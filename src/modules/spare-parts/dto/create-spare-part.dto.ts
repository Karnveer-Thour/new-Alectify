import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateSparePartDto {
  @ApiProperty()
  @IsOptional()
  @IsString()
  category: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  partNumber: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  description: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsUUID()
  projectId: string;

  @ApiProperty()
  @IsOptional()
  @IsUUID()
  preferredSupplierId: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  preferredSupplierName: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  system: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  room: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  rack: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  shelf: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  firmwareVersion: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  // @Min(1, { message: 'Value must be at least 1' })
  remainingQuantity: number;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  // @Min(1, { message: 'Value must be at least 1' })
  minimumQuantity: number;

  @ApiProperty()
  @IsOptional()
  @IsNumber()
  price: number;

  @ApiProperty()
  @IsOptional()
  @IsString()
  comments: string;
}
