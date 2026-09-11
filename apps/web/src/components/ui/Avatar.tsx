"use client";

import React from 'react';

interface AvatarProps {
    src?: string;
    alt?: string;
    className?: string;
    children?: React.ReactNode;
}

export const Avatar: React.FC<AvatarProps> = ({ className = '', children }) => {
    return (
        <div data-avatar="true" data-no-tooltip="true" className={`relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full avatar no-auto-tooltip ${className}`}>
            {children}
        </div>
    );
};

export const AvatarImage: React.FC<React.ImgHTMLAttributes<HTMLImageElement>> = ({ src, alt, className = '', ...props }) => {
    const [hasError, setHasError] = React.useState(false);
    if (!src || hasError) return null;
    return <img src={src} alt={alt} onError={() => setHasError(true)} className={`aspect-square h-full w-full object-cover ${className}`} {...props} />;
};

export const AvatarFallback: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => {
    return (
        <div className={`flex h-full w-full items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 ${className} absolute inset-0 -z-10`}>
            {children}
        </div>
    );
};
