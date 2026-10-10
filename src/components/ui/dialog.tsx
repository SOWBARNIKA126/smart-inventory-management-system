'use client';
import * as React from 'react';
import * as Primitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useI18n } from '@/components/language-provider';
import { cn } from '@/lib/utils';
export const Dialog = Primitive.Root;
export const DialogTrigger = Primitive.Trigger;
export const DialogClose = Primitive.Close;
export const DialogContent = React.forwardRef<React.ElementRef<typeof Primitive.Content>, React.ComponentPropsWithoutRef<typeof Primitive.Content>>(({ className, children, onOpenAutoFocus, onCloseAutoFocus, ...props }, ref) => {
    const { t } = useI18n();
    const opener = React.useRef<HTMLElement | null>(null);
    return <Primitive.Portal><Primitive.Overlay className="dialog-overlay"/><Primitive.Content ref={ref} className={cn('dialog-content', className)} {...props}
        onOpenAutoFocus={event => {
            opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            onOpenAutoFocus?.(event);
        }}
        onCloseAutoFocus={event => {
            onCloseAutoFocus?.(event);
            // Controlled dialogs are also opened by buttons outside DialogTrigger.
            if (!event.defaultPrevented && opener.current?.isConnected) {
                event.preventDefault();
                opener.current.focus();
            }
        }}
    >{children}<Primitive.Close className="dialog-close" aria-label={t("Close dialog")}><X size={20}/></Primitive.Close></Primitive.Content></Primitive.Portal>;
});
DialogContent.displayName = 'DialogContent';
export const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('dialog-header', className)} {...props}/>;
export const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('dialog-footer', className)} {...props}/>;
export const DialogTitle = React.forwardRef<React.ElementRef<typeof Primitive.Title>, React.ComponentPropsWithoutRef<typeof Primitive.Title>>(({ className, ...props }, ref) => <Primitive.Title ref={ref} className={cn('dialog-title', className)} {...props}/>);
DialogTitle.displayName = 'DialogTitle';
export const DialogDescription = React.forwardRef<React.ElementRef<typeof Primitive.Description>, React.ComponentPropsWithoutRef<typeof Primitive.Description>>(({ className, ...props }, ref) => <Primitive.Description ref={ref} className={cn('muted', className)} {...props}/>);
DialogDescription.displayName = 'DialogDescription';
