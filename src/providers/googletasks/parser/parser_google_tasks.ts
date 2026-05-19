import { DateTime } from 'luxon';
import { OFCEvent } from '../../../types';

export interface GoogleTaskLike {
  id: string;
  title?: string;
  notes?: string;
  status?: string;
  due?: string;
  completed?: string;
  deleted?: boolean;
  hidden?: boolean;
  selfLink?: string;
  webViewLink?: string;
  etag?: string;
}

type SingleEvent = Extract<OFCEvent, { type: 'single' }>;

export function fromGoogleTask(task: GoogleTaskLike): OFCEvent | null {
  if (!task.id || task.deleted || task.hidden || !task.due) {
    return null;
  }

  const date = DateTime.fromISO(task.due, { zone: 'utc' }).toISODate();
  if (!date) {
    return null;
  }

  return {
    type: 'single',
    title: task.title || 'Untitled task',
    allDay: true,
    date,
    endDate: null,
    completed: task.status === 'completed' ? task.completed || DateTime.now().toISO() : false,
    description: task.notes || undefined,
    url: task.webViewLink || undefined,
    uid: task.id,
    etag: task.etag
  };
}

export function toGoogleTaskPatch(event: SingleEvent): Partial<GoogleTaskLike> {
  const body: Partial<GoogleTaskLike> = {
    title: event.title,
    notes: event.description || undefined
  };

  body.due = DateTime.fromISO(event.date).toUTC().startOf('day').toISO() || undefined;

  if (event.completed !== undefined && event.completed !== null) {
    body.status = event.completed ? 'completed' : 'needsAction';
    if (event.completed) {
      body.completed =
        typeof event.completed === 'string' ? event.completed : DateTime.now().toUTC().toISO();
    } else {
      body.completed = undefined;
    }
  }

  return body;
}

export function toGoogleTaskInsert(event: SingleEvent): Partial<GoogleTaskLike> {
  return toGoogleTaskPatch({
    ...event,
    completed: event.completed ?? false
  });
}
