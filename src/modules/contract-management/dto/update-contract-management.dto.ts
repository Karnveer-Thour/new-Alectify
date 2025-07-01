import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateContractManagementDto {
  @ApiProperty()
  @IsOptional()
  @IsString()
  description: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  contractNumber: string;

  @ApiProperty()
  @IsOptional()
  @IsNumber()
  contractAmount: number;

  @ApiProperty()
  @IsOptional()
  @IsString()
  comments: string;

  @ApiProperty()
  @IsOptional()
  @IsBoolean()
  isRecurring: boolean;
}
