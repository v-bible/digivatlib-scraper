import { mkdir, readFile, writeFile } from 'fs/promises';
import { PDFDocument } from 'pdf-lib';
import type { LocalContext } from '@/context.js';
import { scrapeData } from '@/lib/scraper.js';
import { logger } from '@/logger/logger.js';

interface CommandFlags {
  outDir?: string;
  height?: number;
  width?: number;
  toPdf?: boolean;
}

export default async function (
  this: LocalContext,
  flags: CommandFlags,
  documentUrl: string,
): Promise<void> {
  const documentName = documentUrl.split('/').pop() || 'document';

  const outDir = flags.outDir || `./output/${documentName}`;

  const images = await scrapeData(documentUrl, flags.height, flags.width);

  for (const [index, imageData] of images.entries()) {
    logger.info(
      `Downloading image ${index + 1}/${images.length}: ${imageData.url}`,
    );

    const response = await fetch(imageData.url);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const filename = imageData.name;
    await mkdir(outDir, { recursive: true });
    const filePath = `${outDir}/${filename}`;
    await writeFile(filePath, buffer);
    logger.info(`Saved image to ${filePath}`);
  }

  if (flags.toPdf) {
    logger.info('Converting images to PDF...');

    const pdfDoc = await PDFDocument.create();

    for (const [index, imageData] of images.entries()) {
      logger.info(`Adding image ${index + 1}/${images.length} to PDF`);

      const imageFilePath = `${outDir}/${imageData.name}`;
      const imageBytes = await readFile(imageFilePath);

      let image;
      if (imageData.name.toLowerCase().endsWith('.png')) {
        image = await pdfDoc.embedPng(imageBytes);
      } else {
        image = await pdfDoc.embedJpg(imageBytes);
      }

      const page = pdfDoc.addPage([image.width, image.height]);
      page.drawImage(image, {
        x: 0,
        y: 0,
        width: image.width,
        height: image.height,
      });
    }

    const pdfBytes = await pdfDoc.save();
    const pdfPath = `${outDir}/${documentName}.pdf`;
    await writeFile(pdfPath, pdfBytes);
    logger.info(`PDF saved to ${pdfPath}`);
  }
}
