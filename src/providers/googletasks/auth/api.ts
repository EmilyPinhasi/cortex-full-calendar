import { GoogleAccount } from '../../../types/settings';
import { GoogleApiError, makeAuthenticatedRequest } from '../../google/auth/request';
import { GoogleTaskLike } from '../parser/parser_google_tasks';

const TASK_LISTS_URL = 'https://tasks.googleapis.com/tasks/v1/users/@me/lists';

export interface GoogleTaskListEntry {
  id: string;
  title: string;
  updated?: string;
}

interface GoogleTaskListsResponse {
  items?: unknown[];
  nextPageToken?: string;
}

interface GoogleTasksResponse {
  items?: GoogleTaskLike[];
  nextPageToken?: string;
}

export async function fetchGoogleTaskLists(
  account: GoogleAccount
): Promise<GoogleTaskListEntry[]> {
  if (!account.accessToken) {
    throw new GoogleApiError('Account is missing an access token.');
  }

  const lists: GoogleTaskListEntry[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(TASK_LISTS_URL);
    if (pageToken) {
      url.searchParams.set('pageToken', pageToken);
    }

    const data = await makeAuthenticatedRequest<GoogleTaskListsResponse>(
      account.accessToken,
      url.toString()
    );

    if (Array.isArray(data.items)) {
      for (const item of data.items) {
        if (item && typeof item === 'object' && 'id' in item && 'title' in item) {
          lists.push(item as GoogleTaskListEntry);
        }
      }
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return lists;
}

export async function fetchGoogleTasks(
  token: string,
  taskListId: string,
  range?: { start: Date; end: Date }
): Promise<GoogleTaskLike[]> {
  const tasks: GoogleTaskLike[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(
      `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks`
    );
    url.searchParams.set('maxResults', '100');
    url.searchParams.set('showCompleted', 'true');
    url.searchParams.set('showDeleted', 'false');
    url.searchParams.set('showHidden', 'false');
    url.searchParams.set('showAssigned', 'true');
    if (range) {
      url.searchParams.set('dueMin', range.start.toISOString());
      url.searchParams.set('dueMax', range.end.toISOString());
    }
    if (pageToken) {
      url.searchParams.set('pageToken', pageToken);
    }

    const data = await makeAuthenticatedRequest<GoogleTasksResponse>(token, url.toString());
    if (Array.isArray(data.items)) {
      tasks.push(...data.items);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return tasks;
}
