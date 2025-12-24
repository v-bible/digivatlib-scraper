import { buildApplication, buildCommand, numberParser } from '@stricli/core';
import { description, version } from '@/../package.json';

const command = buildCommand({
  loader: async () => import('./impl'),
  parameters: {
    positional: {
      kind: 'tuple',
      parameters: [
        {
          brief:
            'Document URL. Example: https://digi.vatlib.it/view/MSS_Vat.gr.1209',
          parse: String,
        },
      ],
    },
    flags: {
      outDir: {
        kind: 'parsed',
        brief: 'Output directory. Default to "./images/<document-id>"',
        parse: String,
        optional: true,
      },
      height: {
        kind: 'parsed',
        brief: 'Image height',
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
