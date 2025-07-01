import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export class GeneratePdfFromHtmlDto {
  @ApiProperty()
  @IsNotEmpty()
  html: string;
}
