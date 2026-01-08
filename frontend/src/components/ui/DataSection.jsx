import React from 'react';
import { ContentSection } from '../layout';

/**
 * DataSection - Pattern wrapper around ContentSection for dashboard sections.
 *
 * @param {{ title: string, children: React.ReactNode }} props
 */
export function DataSection({ title, children }) {
  return (
    <ContentSection title={title}>
      {children}
    </ContentSection>
  );
}

export default DataSection;
