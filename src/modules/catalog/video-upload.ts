import { Upload } from 'tus-js-client';
import type { UploadTicket } from './types';

/**
 * Téléversement direct navigateur → fournisseur vidéo (protocole TUS, reprenable) :
 * le fichier ne transite jamais par l'API. Avec le pilote factice, `upload` est nul
 * et il n'y a rien à envoyer.
 */
export function uploadVideo(
  file: File,
  ticket: UploadTicket,
  onProgress: (percent: number) => void,
): { promise: Promise<void>; abort: () => void } {
  if (!ticket.upload) {
    onProgress(100);
    return { promise: Promise.resolve(), abort: () => undefined };
  }
  const { endpoint, headers } = ticket.upload;
  let upload: Upload | null = null;
  const promise = new Promise<void>((resolve, reject) => {
    upload = new Upload(file, {
      endpoint,
      headers,
      retryDelays: [0, 3000, 10000, 30000],
      chunkSize: 50 * 1024 * 1024,
      metadata: { filetype: file.type, title: file.name },
      onProgress: (sent, total) => onProgress(total ? Math.round((sent / total) * 100) : 0),
      onError: (error) => reject(error),
      onSuccess: () => resolve(),
    });
    upload.start();
  });
  return { promise, abort: () => void upload?.abort(true) };
}

/** 125 → « 2 min 05 » */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m ? `${m} min ${String(s).padStart(2, '0')}` : `${s} s`;
}
