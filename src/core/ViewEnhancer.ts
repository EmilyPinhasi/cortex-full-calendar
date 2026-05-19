/**
 * @file ViewEnhancer.ts
 * @brief Orchestrates presentation-layer logic for the calendar view.
 *
 * @description
 * This class acts as the single intermediary between the EventCache and the
 * CalendarView. It applies presentation filters and configuration before the
 * data is rendered.
 *
 * This decouples complex business logic from the view, making the view a "dumb"
 * renderer and centralizing the transformation logic for consistency and testability.
 *
 * @license See LICENSE.md
 */

import { activeDocument } from 'obsidian';
import { EventInput, EventSourceInput } from '@fullcalendar/core';
import { FullCalendarSettings } from '../types/settings';
import { OFCEventSource } from './EventCache';
import { CachedEvent } from './cache/types';
import { toEventInput } from './interop';

function getCalendarColors(color: string | null | undefined): {
  color: string;
  textColor: string;
} {
  const doc = activeDocument ?? document;
  let textVar = getComputedStyle(doc.body).getPropertyValue('--text-on-accent');
  if (color) {
    const m = color.slice(1).match(color.length === 7 ? /(\S{2})/g : /(\S{1})/g);
    if (m) {
      const r = parseInt(m[0], 16);
      const g = parseInt(m[1], 16);
      const b = parseInt(m[2], 16);
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      if (brightness > 150) {
        textVar = 'black';
      }
    }
  }

  return {
    color: color || getComputedStyle(doc.body).getPropertyValue('--interactive-accent'),
    textColor: textVar
  };
}

export class ViewEnhancer {
  private settings: FullCalendarSettings;

  constructor(settings: FullCalendarSettings) {
    this.settings = settings;
  }

  /**
   * Updates the enhancer and its modules with the latest plugin settings.
   * @param newSettings The latest plugin settings.
   */
  public updateSettings(newSettings: FullCalendarSettings): void {
    this.settings = newSettings;
  }

  /**
   * The main enhancement pipeline.
   * Takes raw sources from the cache and returns the final, filtered, and
   * configured data package for the calendar view to render.
   *
   * @param allSources The complete, unfiltered list of sources from EventCache.
   * @returns An object containing the final event sources and calendar configuration.
   */
  public getEnhancedData(allSources: OFCEventSource[]): {
    sources: EventSourceInput[];
    config: Partial<FullCalendarSettings>;
  } {
    const filtered = this.getFilteredSources(allSources);
    const sources: EventSourceInput[] = filtered.map(({ events, editable, color, id, type }) => {
      const fcEvents = events
        .map((e: CachedEvent) =>
          toEventInput(e.id, e.event, this.settings, { defaultTask: type !== 'google' })
        )
        .filter((e): e is EventInput => !!e);
      return {
        id,
        events: fcEvents,
        editable,
        ...getCalendarColors(color)
      };
    });
    return { sources, config: this.settings };
  }

  /**
   * Gets only the filtered sources.
   * This is used by UI components that need the raw, filtered OFCEventSource objects,
   * such as the timeline resource builder.
   *
   * @param allSources The complete, unfiltered list of sources from EventCache.
   * @returns A filtered array of OFCEventSource objects.
   */
  public getFilteredSources(allSources: OFCEventSource[]): OFCEventSource[] {
    const hidden = new Set((this.settings.hiddenCalendarIds ?? []).map(String));
    return allSources.filter(source => !hidden.has(String(source.id)));
  }
}
