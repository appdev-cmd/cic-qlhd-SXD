"use client";

import React from 'react';
import { SlidePanelProvider } from '@/contexts/SlidePanelContext';
import { SlidePanelContainer } from '@/components/ui/SlidePanel';
import { AutoTableTooltip } from '@/components/ui/AutoTableTooltip';

export const AppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <SlidePanelProvider>
      {children}
      <SlidePanelContainer />
      <AutoTableTooltip />
    </SlidePanelProvider>
  );
};

export default AppProviders;
