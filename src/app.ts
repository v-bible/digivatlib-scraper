import { buildApplication, buildCommand, numberParser } from '@stricli/core';
import { description, version } from '@/../package.json';
import { DEFAULT_IMAGE_HEIGHT, OUTPUT_BASE_DIR } from '@/constants';

const command = buildCommand({
  loader: async () => import('./impl'),
  parameters: {
    positional: {
      kind: 'array',
      parameter: {
        brief:
          'List of document names to scrape from Digivatlib (e.g., "Cicognara.VI.319", "Borg.ill.19")',
        parse: String,
      },
    },
    flags: {
      outDir: {
        kind: 'parsed',
        brief: `Output directory. Default to "${OUTPUT_BASE_DIR}/<document-name>"`,
        parse: String,
        optional: true,
      },
      height: {
        kind: 'parsed',
        brief: `Image height. Default to ${DEFAULT_IMAGE_HEIGHT} pixels`,
        parse: numberParser,
        optional: true,
      },
      width: {
        kind: 'parsed',
        brief: 'Image width',
        parse: numberParser,
        optional: true,
      },
      toPdf: {
        kind: 'boolean',
        brief: 'Convert downloaded images to a single PDF file',
        optional: true,
      },
    },
  },
  docs: {
    brief: description,
  },
});

export const app = buildApplication(command, {
  name: 'digivatlib-scraper',
  versionInfo: {
    currentVersion: version,
  },
});
