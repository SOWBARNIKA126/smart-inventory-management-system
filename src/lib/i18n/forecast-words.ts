import type {Locale} from './config';

// These comparison words occur only in generated forecast explanation slots.
export const forecastWords: Record<Locale, Record<string, string>> = {
  en: {above: 'above', below: 'below', higher: 'higher', lower: 'lower'},
  hi: {above: 'अधिक', below: 'कम', higher: 'अधिक', lower: 'कम'},
  ta: {above: 'அதிகம்', below: 'குறைவு', higher: 'அதிகம்', lower: 'குறைவு'},
  te: {above: 'ఎక్కువ', below: 'తక్కువ', higher: 'ఎక్కువ', lower: 'తక్కువ'},
  kn: {above: 'ಹೆಚ್ಚು', below: 'ಕಡಿಮೆ', higher: 'ಹೆಚ್ಚು', lower: 'ಕಡಿಮೆ'},
  ml: {above: 'കൂടുതൽ', below: 'കുറവ്', higher: 'കൂടുതൽ', lower: 'കുറവ്'},
  mr: {above: 'जास्त', below: 'कमी', higher: 'जास्त', lower: 'कमी'},
  bn: {above: 'বেশি', below: 'কম', higher: 'বেশি', lower: 'কম'},
  gu: {above: 'વધુ', below: 'ઓછું', higher: 'વધુ', lower: 'ઓછું'},
};
