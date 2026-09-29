import { FILE_PREFIX } from './file';

/**
 * Google Drive's app data folder: a hidden folder only TimeBlock's Google
 * project can see, free, and reachable from both devices whenever they are
 * online. Each device keeps one file there. Talks to the REST API with plain
 * fetch, so the desktop and the phone share it.
 */
export { DRIVE_APPDATA_SCOPE } from '../google/scopes';

export interface DriveFileInfo {
  id: string;
  name: string;
  /** Drive's checksum of the content — unchanged files are not downloaded again. */
  md5Checksum?: string;
  modifiedTime?: string;
  appProperties?: Record<string, string>;
}

export interface DriveApi {
  /** TimeBlock's sync files in the app data folder. */
  list(): Promise<DriveFileInfo[]>;
  download(id: string): Promise<Uint8Array>;
  create(name: string, content: Uint8Array, appProperties: Record<string, string>): Promise<DriveFileInfo>;
  update(id: string, content: Uint8Array, appProperties: Record<string, string>): Promise<DriveFileInfo>;
}

export class DriveError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly reason: string | null = null,
  ) {
    super(message);
    this.name = 'DriveError';
  }
}

/** Drive refused because the Google sign-in did not include access to the app data folder. */
export function isDriveScopeError(error: unknown): boolean {
  if (!(error instanceof DriveError)) return false;
  return (
    error.status === 403 &&
    (error.reason === 'insufficientPermissions' || error.reason === 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' || /scope/i.test(error.message))
  );
}

const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FIELDS = 'id,name,md5Checksum,modifiedTime,appProperties';

/** A query string without URLSearchParams, whose React Native version is incomplete. */
const query = (params: Record<string, string | undefined>) =>
  Object.entries(params)
    .filter((e): e is [string, string] => e[1] !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

/**
 * @param accessToken a current OAuth access token with the drive.appdata scope
 * @param fetchImpl the platform's fetch (the phone passes expo's, which sends binary bodies)
 */
export function googleDrive(accessToken: () => Promise<string>, fetchImpl: typeof fetch = fetch): DriveApi {
  async function request(url: string, init: { method?: string; headers?: Record<string, string>; body?: BodyInit } = {}) {
    const res = await fetchImpl(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${await accessToken()}` } });
    if (res.ok) return res;
    const text = await res.text().catch(() => '');
    let message = `Google Drive answered ${res.status}`;
    let reason: string | null = null;
    try {
      const body = JSON.parse(text) as { error?: { message?: string; errors?: { reason?: string }[]; details?: { reason?: string }[] } };
      message = body.error?.message ?? message;
      reason = body.error?.errors?.[0]?.reason ?? body.error?.details?.[0]?.reason ?? null;
    } catch {
      // Not JSON; keep the status line.
    }
    throw new DriveError(res.status, message, reason);
  }

  async function setProperties(file: DriveFileInfo, appProperties: Record<string, string>): Promise<DriveFileInfo> {
    const same = Object.entries(appProperties).every(([k, v]) => file.appProperties?.[k] === v);
    if (same) return file;
    const res = await request(`${API}/${encodeURIComponent(file.id)}?${query({ fields: FIELDS })}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appProperties }),
    });
    return (await res.json()) as DriveFileInfo;
  }

  const drive: DriveApi = {
    async list() {
      const files: DriveFileInfo[] = [];
      let pageToken: string | undefined;
      do {
        const res = await request(
          `${API}?${query({
            spaces: 'appDataFolder',
            q: `name contains '${FILE_PREFIX}' and trashed = false`,
            fields: `nextPageToken,files(${FIELDS})`,
            pageSize: '100',
            pageToken,
          })}`,
        );
        const body = (await res.json()) as { files?: DriveFileInfo[]; nextPageToken?: string };
        files.push(...(body.files ?? []).filter((f) => f.name.startsWith(FILE_PREFIX)));
        pageToken = body.nextPageToken;
      } while (pageToken);
      return files;
    },

    async download(id) {
      const res = await request(`${API}/${encodeURIComponent(id)}?alt=media`);
      return new Uint8Array(await res.arrayBuffer());
    },

    async create(name, content, appProperties) {
      const res = await request(`${API}?${query({ fields: FIELDS })}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, parents: ['appDataFolder'], mimeType: 'application/gzip', appProperties }),
      });
      const created = (await res.json()) as DriveFileInfo;
      return drive.update(created.id, content, appProperties);
    },

    async update(id, content, appProperties) {
      const res = await request(`${UPLOAD}/${encodeURIComponent(id)}?${query({ uploadType: 'media', fields: FIELDS })}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/gzip' },
        body: content as unknown as BodyInit,
      });
      return setProperties((await res.json()) as DriveFileInfo, appProperties);
    },
  };
  return drive;
}
