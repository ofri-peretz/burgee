/** One segment of a cell's text: a `code` span where the data used backticks, text otherwise. */
import { type ReactNode } from 'react';

import { type Segment } from './capability-view';

export function inlineSegment(segment: Segment): ReactNode {
  return segment.code ? (
    <code key={segment.key} className="text-[0.9em]">
      {segment.text}
    </code>
  ) : (
    <span key={segment.key}>{segment.text}</span>
  );
}
