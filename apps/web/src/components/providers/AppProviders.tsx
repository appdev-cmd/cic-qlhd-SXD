"use client";

import React from 'react';
import { SlidePanelProvider } from '@/contexts/SlidePanelContext';
import { SlidePanelContainer } from '@/components/ui/SlidePanel';

export const AppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <SlidePanelProvider>
      {children}
      <SlidePanelContainer />
    </SlidePanelProvider>
  );
};

export default AppProviders;
