import {toast as notification} from 'sonner';
import {browserLocale} from './config';
import {translate} from './translate';

export const toast = {
  success: (message: string) => notification.success(translate(browserLocale(), message)),
  error: (message: string) => notification.error(translate(browserLocale(), message)),
};
