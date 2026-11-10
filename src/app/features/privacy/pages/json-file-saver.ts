import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

/**
 * Hands a JSON document to the browser as a file to save. The document is the person's own data:
 * it goes from memory to their disk, through an object URL revoked at once, and is never written
 * to any storage of this application nor logged. A class of its own so a test can replace it.
 */
@Injectable({ providedIn: 'root' })
export class JsonFileSaver {
  private readonly document = inject(DOCUMENT);

  save(fileName: string, body: unknown): void {
    const blob = new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = this.document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    this.document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
