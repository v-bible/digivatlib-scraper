import type { LocalContext } from '@/context'
import { Buffer } from 'node:buffer'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { delay, retry } from 'es-toolkit'
import { PDFDocument } from 'pdf-lib'
import {
  DEFAULT_IGNORE_COMPLETED,
  DEFAULT_OVERWRITE,
  DEFAULT_TO_PDF,
  DELAY_BETWEEN_REQUESTS_MS,
  MAX_RETRY_ATTEMPTS,
  OUTPUT_BASE_DIR,
} from '@/constants'
import { scrapeData } from '@/lib/scraper'
import { logger } from '@/logger/logger'

type CommandFlags = {
  outDir?: string
  height?: number
  width?: number
  toPdf?: boolean
  ignoreCompleted?: boolean
  overwrite?: boolean
  fromFile?: string
}

type DocumentResult = {
  documentName: string
  errors: string[]
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export default async function (
  this: LocalContext,
  flags: CommandFlags,
  ...documentNames: string[]
): Promise<void> {
  const outDirFlag = flags.outDir ?? OUTPUT_BASE_DIR
  const toPdfFlag = flags.toPdf || DEFAULT_TO_PDF
  const ignoreCompletedFlag = flags.ignoreCompleted || DEFAULT_IGNORE_COMPLETED
  const overwriteFlag = flags.overwrite || DEFAULT_OVERWRITE
  const fromFileFlag = flags.fromFile

  let bookNames = documentNames

  if (fromFileFlag !== undefined) {
    try {
      const fileContent = await readFile(fromFileFlag, 'utf-8')
      const namesFromFile = fileContent
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
      bookNames = [...bookNames, ...namesFromFile]
    }
    catch (error) {
      logger.error(
        `Error reading from file ${fromFileFlag}: ${getErrorMessage(error)}`,
      )
      throw error
    }
  }

  if (bookNames.length === 0) {
    logger.error('No document names provided.')
    throw new Error('No document names provided.')
  }

  if (!existsSync(outDirFlag)) {
    await mkdir(outDirFlag, { recursive: true })
  }

  const processDocument = async (
    documentName: string,
  ): Promise<DocumentResult> => {
    const errors: string[] = []

    if (
      documentName.startsWith('http://')
      || documentName.startsWith('https://')
    ) {
      logger.warn(
        `Skipping ${documentName} because it appears to be a URL. Please provide only the document name.`,
      )
      errors.push('document-name: URL provided instead of document name')
      return { documentName, errors }
    }

    const documentOutputPath = `${outDirFlag}/${documentName}`
    const pdfPath = `${documentOutputPath}/${documentName}.pdf`

    await mkdir(documentOutputPath, { recursive: true })

    // Skip if PDF already exists
    if (ignoreCompletedFlag && toPdfFlag && existsSync(pdfPath)) {
      logger.info(`PDF already exists at ${pdfPath}, skipping document.`)
      return { documentName, errors }
    }

    let images: { url: string, name: string }[] = []
    try {
      const manifestPath = `${documentOutputPath}/manifest.json`
      const scraped = await scrapeData(documentName, flags.height, flags.width)
      images = scraped.images

      if (overwriteFlag || !existsSync(manifestPath)) {
        await writeFile(
          manifestPath,
          JSON.stringify(scraped.manifest, null, 2),
          'utf-8',
        )
        logger.info(`Saved manifest to ${manifestPath}`)
      }
    }
    catch (error) {
      errors.push(`manifest: ${getErrorMessage(error)}`)
      logger.error(
        `Error fetching manifest for ${documentName}: ${getErrorMessage(error)}`,
      )
      return { documentName, errors }
    }

    const currentFiles = await readdir(documentOutputPath)

    for (const [index, imageData] of images.entries()) {
      const fileExists = currentFiles.includes(imageData.name)
      if (fileExists && !overwriteFlag) {
        logger.info(
          `File ${imageData.name} already exists in ${documentOutputPath}, skipping download.`,
        )

        continue
      }

      logger.info(
        `Downloading image ${index + 1}/${images.length}: ${imageData.url}`,
      )

      try {
        const filename = imageData.name
        const filePath = `${documentOutputPath}/${filename}`

        const response = await retry(async () => {
          const response = await fetch(imageData.url)
          if (!response.ok) {
            await delay(DELAY_BETWEEN_REQUESTS_MS)
            throw new Error(response.statusText)
          }
          return response
        }, MAX_RETRY_ATTEMPTS)

        const arrayBuffer: ArrayBuffer = await response.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        await writeFile(filePath, buffer)
        logger.info(`Saved image to ${filePath}`)
      }
      catch (error) {
        errors.push(`image: ${getErrorMessage(error)}`)
        logger.error(
          // eslint-disable-next-line ts/restrict-template-expressions
          `Error downloading or saving image url ${imageData.url}: ${error}`,
        )

        return { documentName, errors }
      }
    }

    if (toPdfFlag) {
      logger.info('Converting images to PDF...')

      try {
        const pdfDoc = await PDFDocument.create()

        for (const [index, imageData] of images.entries()) {
          logger.info(`Adding image ${index + 1}/${images.length} to PDF`)

          const imageFilePath = `${documentOutputPath}/${imageData.name}`
          const imageBytes = await readFile(imageFilePath)

          let image
          if (imageData.name.toLowerCase().endsWith('.png')) {
            image = await pdfDoc.embedPng(imageBytes)
          }
          else {
            image = await pdfDoc.embedJpg(imageBytes)
          }

          const page = pdfDoc.addPage([image.width, image.height])
          page.drawImage(image, {
            x: 0,
            y: 0,
            width: image.width,
            height: image.height,
          })
        }

        const pdfBytes = await pdfDoc.save()
        const pdfPath = `${documentOutputPath}/${documentName}.pdf`
        await writeFile(pdfPath, pdfBytes)
        logger.info(`PDF saved to ${pdfPath}`)
      }
      catch (error) {
        errors.push(`pdf: ${getErrorMessage(error)}`)

        // eslint-disable-next-line ts/restrict-template-expressions
        logger.error(`Error saving PDF to ${pdfPath}: ${error}`)

        return { documentName, errors }
      }
    }

    return {
      documentName,
      documentName,
      errors,
    }
  }

  const results: DocumentResult[] = []
  for (const documentName of bookNames) {
    const result = await processDocument(documentName)
    results.push(result)
  }

  const failedDocuments = results.filter(result => result.errors.length > 0)

  const reportPath = `${outDirFlag}/crawl-report.json`
  await mkdir(outDirFlag, { recursive: true })
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        totalDocuments: results.length,
        failedDocuments: failedDocuments.length,
        documents: results,
      },
      null,
      2,
    ),
    'utf-8',
  )
  logger.info(`Crawl report saved to ${reportPath}`)

  if (failedDocuments.length > 0) {
    for (const failed of failedDocuments) {
      logger.error(
        `Failed ${failed.documentName}: ${failed.errors.join(' | ')}`,
      )
    }

    throw new Error(
      `Failed to process ${failedDocuments.length}/${bookNames.length} documents`,
    )
  }
}
