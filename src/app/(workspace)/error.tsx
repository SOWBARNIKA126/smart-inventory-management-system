'use client';
import { useI18n } from '@/components/language-provider';
import { ErrorState } from '@/components/shared';
export default function Error({ reset }: {
    error: Error;
    reset: () => void;
}) {
    useI18n();
    return <ErrorState error="An unexpected problem occurred. Please try again." retry={reset}/>;
}
