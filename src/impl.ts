import { mkdir, readFile, writeFile } from 'fs/promises';
import { PDFDocument } from 'pdf-lib';
import { OUTPUT_BASE_DIR } from '@/constants';
import type { LocalContext } from '@/context';
import { scrapeData } from '@/lib/scraper';
import { logger } from '@/logger/logger';

interface CommandFlags {
  outDir?: string;
  height?: number;
  width?: number;
  toPdf?: boolean;
}

export default async function (
  this: LocalContext,
  flags: CommandFlags,
  ...documentNames: string[]
): Promise<void> {
  const processDocument = async (documentName: string): Promise<void> => {
    if (
      documentName.startsWith('http://') ||
      documentName.startsWith('https://')
    ) {
      logger.warn(
        `Skipping ${documentName} because it appears to be a URL. Please provide only the document name.`,
      );
      return;
    }

    const outDir = `${flags.outDir || OUTPUT_BASE_DIR}/${documentName}`;

    const { images, manifest } = await scrapeData(
      documentName,
      flags.height,
      flags.width,
    );

    await mkdir(outDir, { recursive: true });
    console.log('outDir', outDir);

    await writeFile(
      `${outDir}/manifest.json`,
      JSON.stringify(manifest, null, 2),
    );
    logger.info(`Saved manifest to ${outDir}/manifest.json`);

    for (const [index, imageData] of images.entries()) {
      logger.info(
        `Downloading image ${index + 1}/${images.length}: ${imageData.url}`,
      );

      const response = await fetch(imageData.url);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const filename = imageData.name;
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
  };

  const results = await Promise.allSettled(
    documentNames.map((documentName) => processDocument(documentName)),
  );

  const failedDocuments = results
    .map((result, index) => ({ result, documentName: documentNames[index] }))
    .filter(({ result }) => result.status === 'rejected');

  if (failedDocuments.length > 0) {
    for (const { result, documentName } of failedDocuments) {
      logger.error(
        `Failed to process ${documentName}: ${(result as PromiseRejectedResult).reason}`,
      );
    }

    throw new Error(
      `Failed to process ${failedDocuments.length}/${documentNames.length} documents`,
    );
  }
}
