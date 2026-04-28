import { DEFAULT_IMAGE_HEIGHT } from '@/constants';
import { logger } from '@/logger/logger';

type ImageData = {
  url: string;
  name: string;
};

const scrapeData = async (
  documentName: string,
  height = DEFAULT_IMAGE_HEIGHT,
  width?: number,
): Promise<{
  images: ImageData[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  manifest: any;
}> => {
  try {
    const manifestUrl = `https://digi.vatlib.it/iiif/${documentName}/manifest.json`;

    const manifest = await fetch(manifestUrl).then((res) => res.json());
    logger.info(`Fetched manifest from ${manifestUrl}`);

    const images = manifest.sequences[0].canvases.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (canvas: any, idx: number) => {
        const imageUrl =
          canvas.thumbnail['@id']
            .replace('thumb', 'iiif')
            .replace('.tif.jpg', '.jp2') +
          `/full/${height},${width || ''}/0/native.jpg`;
        const imageName = `[${idx + 1}]_${canvas.label.replace(/\s+/g, '_')}.jpg`;

        return {
          url: imageUrl,
          name: imageName,
        } satisfies ImageData;
      },
    );

    return { images, manifest };
  } catch (error) {
    logger.error(`Error fetching manifest for ${documentName}: ${error}`);
    return { images: [], manifest: null };
  }
};

export { scrapeData };
