import { Injectable, BadRequestException } from '@nestjs/common';
import * as yauzl from 'yauzl';
import * as fs from 'fs/promises';
import * as path from 'path';
import { XMLParser } from 'fast-xml-parser';

export interface EpubMetadata {
  title: string;
  author?: string;
  language?: string;
}

export interface EpubSpineItem {
  idref: string;
  href: string;
}

export interface EpubChapter {
  spineIndex: number;
  title?: string;
  href: string;
}

export interface ParsedEpub {
  metadata: EpubMetadata;
  chapters: EpubChapter[];
  coverPath?: string;
}

@Injectable()
export class EpubParserService {
  private xmlParser: XMLParser;

  constructor() {
    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
    });
  }

  async parseEpub(epubPath: string, extractDir: string): Promise<ParsedEpub> {
    // Extract EPUB
    await this.extractEpub(epubPath, extractDir);

    // Find OPF file
    const opfPath = await this.findOpfFile(extractDir);

    // Parse OPF
    const opfContent = await fs.readFile(opfPath, 'utf-8');
    const opfData = this.xmlParser.parse(opfContent);

    // Extract metadata
    const metadata = this.extractMetadata(opfData);

    // Extract spine (chapter order)
    const chapters = this.extractChapters(opfData, extractDir, opfPath);

    // Extract cover (if exists)
    const coverPath = await this.extractCover(opfData, extractDir, opfPath);

    return {
      metadata,
      chapters,
      coverPath,
    };
  }

  private async extractEpub(epubPath: string, extractDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      yauzl.open(epubPath, { lazyEntries: true }, (err, zipfile) => {
        if (err) {
          reject(new BadRequestException('Invalid EPUB file format'));
          return;
        }

        zipfile.readEntry();
        zipfile.on('entry', (entry) => {
          if (/\/$/.test(entry.fileName)) {
            // Directory entry
            zipfile.readEntry();
          } else {
            // File entry
            zipfile.openReadStream(entry, (err, readStream) => {
              if (err) {
                reject(err);
                return;
              }

              const filePath = path.join(extractDir, entry.fileName);
              const dir = path.dirname(filePath);

              fs.mkdir(dir, { recursive: true })
                .then(() => {
                  const writeStream = require('fs').createWriteStream(filePath);
                  readStream.pipe(writeStream);
                  writeStream.on('close', () => {
                    zipfile.readEntry();
                  });
                })
                .catch(reject);
            });
          }
        });

        zipfile.on('end', () => {
          resolve();
        });

        zipfile.on('error', reject);
      });
    });
  }

  private async findOpfFile(extractDir: string): Promise<string> {
    // Read META-INF/container.xml
    const containerPath = path.join(extractDir, 'META-INF', 'container.xml');

    try {
      const containerContent = await fs.readFile(containerPath, 'utf-8');
      const containerData = this.xmlParser.parse(containerContent);

      // Extract OPF path
      const rootfile =
        containerData.container?.rootfiles?.rootfile?.['@_full-path'] ||
        containerData.container?.rootfiles?.rootfile?.['@_full-path'];

      if (!rootfile) {
        throw new BadRequestException('OPF file not found in EPUB');
      }

      return path.join(extractDir, rootfile);
    } catch (error) {
      throw new BadRequestException('Invalid EPUB container structure');
    }
  }

  private extractMetadata(opfData: any): EpubMetadata {
    const metadata = opfData.package?.metadata || {};

    return {
      title: this.getText(metadata['dc:title']) || 'Untitled',
      author: this.getText(metadata['dc:creator']),
      language: this.getText(metadata['dc:language']),
    };
  }

  private extractChapters(opfData: any, extractDir: string, opfPath: string): EpubChapter[] {
    const manifest = opfData.package?.manifest?.item || [];
    const spine = opfData.package?.spine?.itemref || [];

    // Create manifest map
    const manifestMap: Record<string, any> = {};
    if (Array.isArray(manifest)) {
      manifest.forEach((item: any) => {
        manifestMap[item['@_id']] = item;
      });
    } else {
      manifestMap[manifest['@_id']] = manifest;
    }

    // Get OPF directory (base path for relative hrefs)
    const opfDir = path.dirname(opfPath);

    // Extract chapters from spine
    const chapters: EpubChapter[] = [];
    const spineItems = Array.isArray(spine) ? spine : [spine];

    spineItems.forEach((item: any, index: number) => {
      const idref = item['@_idref'];
      const manifestItem = manifestMap[idref];

      if (manifestItem) {
        const href = manifestItem['@_href'];
        let finalHref: string;
        
        // Resolve href relative to OPF directory
        // href is relative to OPF file location
        const resolvedHref = path.resolve(opfDir, href);
        // Make it relative to extractDir for storage
        const relativeHref = path.relative(extractDir, resolvedHref);
        
        // Validate that the resolved path is within extractDir
        if (relativeHref.startsWith('..')) {
          console.warn(`[EpubParser] Chapter href resolves outside extractDir: ${href} -> ${resolvedHref} (relative: ${relativeHref})`);
          // Try alternative: resolve from extractDir directly
          // Remove leading slash if present
          const normalizedHref = href.startsWith('/') ? href.substring(1) : href;
          // Try to resolve from extractDir
          const altResolved = path.resolve(extractDir, normalizedHref);
          const altRelative = path.relative(extractDir, altResolved);
          if (altRelative.startsWith('..')) {
            // Last resort: use normalized href as-is
            finalHref = normalizedHref;
            console.warn(`[EpubParser] Using normalized href: ${finalHref}`);
          } else {
            finalHref = altRelative;
          }
        } else {
          finalHref = relativeHref;
        }

        chapters.push({
          spineIndex: index,
          title: manifestItem['@_id'] || `Chapter ${index + 1}`,
          href: finalHref,
        });
      }
    });

    return chapters;
  }

  private async extractCover(opfData: any, extractDir: string, opfPath: string): Promise<string | undefined> {
    const manifest = opfData.package?.manifest?.item || [];
    const metadata = opfData.package?.metadata || {};

    // Look for cover in metadata
    let coverId: string | undefined;
    
    if (metadata.meta) {
      const metaArray = Array.isArray(metadata.meta) ? metadata.meta : [metadata.meta];
      const coverMeta = metaArray.find(
        (m: any) => m['@_name'] === 'cover' || m['@_property'] === 'cover-image',
      );
      coverId = coverMeta?.['@_content'];
    }

    if (!coverId) {
      return undefined;
    }

    const items = Array.isArray(manifest) ? manifest : [manifest];
    const coverItem = items.find((item: any) => item['@_id'] === coverId);

    if (coverItem) {
      const coverHref = coverItem['@_href'];
      // Get OPF directory (base path for relative hrefs)
      const opfDir = path.dirname(opfPath);
      // Resolve cover href relative to OPF directory
      const resolvedCoverPath = path.resolve(opfDir, coverHref);
      return resolvedCoverPath;
    }

    return undefined;
  }

  private getText(value: any): string | undefined {
    if (typeof value === 'string') {
      return value;
    }
    if (value?.['#text']) {
      return value['#text'];
    }
    if (Array.isArray(value) && value.length > 0) {
      return this.getText(value[0]);
    }
    return undefined;
  }
}
