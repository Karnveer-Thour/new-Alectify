import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GeneratePdfService } from './generate-pdf.service';

@Module({
  imports: [],
  providers: [GeneratePdfService],
  exports: [GeneratePdfService],
})
export class GeneratePdfModule {}
