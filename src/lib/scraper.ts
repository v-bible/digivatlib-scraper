import { logger } from '@/logger/logger';

type ImageData = {
  url: string;
  name: string;
};

const scrapeData = async (
  url: string,
  height = 720,
  width?: number,
): Promise<ImageData[]> => {
  const manifestUrl = url.replace('/view/', '/iiif/').concat('/manifest.json');

  const manifest = await fetch(manifestUrl).then((res) => res.json());
  logger.info(`Fetched manifest from ${manifestUrl}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const images = manifest.sequences[0].canvases.map((canvas: any) => {
    const imageUrl =
      canvas.thumbnail['@id']
        .replace('thumb', 'iiif')
        .replace('.tif.jpg', '.jp2') +
      `/full/${height},${width || ''}/0/native.jpg`;
    const imageName = canvas.label.replace(/\s+/g, '_') + '.jpg';

    return {
      url: imageUrl,
      name: imageName,
    } satisfies ImageData;
  });

  return images;
};

export { scrapeData };
