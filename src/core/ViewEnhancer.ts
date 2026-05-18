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

import { FullCalendarSettings } from '../types/settings';
import { OFCEventSource } from './EventCache';
import { EventSourceInput } from '@fullcalendar/core';

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
    const sources = this.getFilteredSources(allSources);
    const config = this.settings;
    return { sources, config };
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
