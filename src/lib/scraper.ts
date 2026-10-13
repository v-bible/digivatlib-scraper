import { delay, retry } from 'es-toolkit'
import {
  DEFAULT_IMAGE_HEIGHT,
  DELAY_BETWEEN_REQUESTS_MS,
  MAX_RETRY_ATTEMPTS,
} from '@/constants'
import { logger } from '@/logger/logger'

type ImageData = {
  url: string
  name: string
}

async function scrapeData(
  documentName: string,
  height = DEFAULT_IMAGE_HEIGHT,
  width?: number,
): Promise<{
  images: ImageData[]
  manifest: any
}> {
  const manifestUrl = `https://digi.vatlib.it/iiif/${documentName}/manifest.json`

  const manifest = await retry(async () => {
    const response = await fetch(manifestUrl)
    if (!response.ok) {
      await delay(DELAY_BETWEEN_REQUESTS_MS)
      throw new Error(`HTTP ${response.status} ${response.statusText}`)
    }
    return response.json()
  }, MAX_RETRY_ATTEMPTS)

  logger.info(`Fetched manifest from ${manifestUrl}`)

  // IIIF size: "w,h" fits within the box (keeps aspect ratio), ",h" scales by height
  const size = width != null ? `!${width},${height}` : `,${height}`

  // @ts-expect-error - manifest type is unknown
  // eslint-disable-next-line ts/no-unsafe-assignment, ts/no-unsafe-call, ts/no-unsafe-member-access
  const images: ImageData[] = (manifest?.sequences?.[0]?.canvases ?? []).map(
    (canvas: any, idx: number) => {
      // eslint-disable-next-line ts/no-unsafe-call, ts/no-unsafe-member-access
      const imageUrl = `${canvas.thumbnail['@id']
        .replace('thumb', 'iiif')
        // eslint-disable-next-line ts/no-unsafe-member-access
        .replace('.tif.jpg', '.jp2')}/full/${size}/0/native.jpg`
      // eslint-disable-next-line ts/no-unsafe-member-access
      const imageName = `[${idx + 1}]_${String(canvas.label).replace(/\s+/g, '_')}.jpg`

      return { url: imageUrl, name: imageName } satisfies ImageData
    },
  )

  return { images, manifest }
}

export { scrapeData }
