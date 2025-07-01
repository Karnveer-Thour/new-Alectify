import * as puppeteer from 'puppeteer';
import { Injectable } from '@nestjs/common';
import { GeneratePdfFromHtmlDto } from './dto/generate-pdf.dto';

@Injectable()
export class GeneratePdfService {
  async generatePdfFromHtml(payload: GeneratePdfFromHtmlDto): Promise<Buffer> {
    try {
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();
      await page.setContent(payload.html, { waitUntil: 'networkidle0' });

      const pdfUint8Array = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '1cm', bottom: '1cm', left: '1cm', right: '1cm' },
      });

      await browser.close();
      // convert uint8Array to Node.js Buffer
      return Buffer.from(pdfUint8Array);
    } catch (error) {
      throw error;
    }
  }
}
