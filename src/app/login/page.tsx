'use client';
import { useI18n, LanguageSelector } from '@/components/language-provider';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight, Boxes, Eye, EyeOff, Loader2, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';
import { api } from '@/lib/client';
import { useSession } from '@/components/session-provider';
const schema = z.object({ email: z.string().email('Enter a valid email address'), password: z.string().min(1, 'Enter your password'), rememberMe: z.boolean() });
type Form = z.infer<typeof schema>;
export default function Login() {
    const { t } = useI18n();
    const router = useRouter();
    const { refresh } = useSession();
    const [visible, setVisible] = useState(false);
    const [error, setError] = useState('');
    const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '', rememberMe: false } });
    return <main className="login-page"><section className="login-story"><div className="brand"><span className="brand-mark"><Boxes size={28}/></span><span>{t("stockwise")}<span className="brand-caption">{t("SMART INVENTORY")}</span></span></div><div className="login-story-content"><div className="eyebrow"><Sparkles size={16}/>{t(" A smarter way to run your store")}</div><h1>{t("Know your stock.")}<br /><span>{t("Stay a season ahead.")}</span></h1><p>{t("From your first sale of the day to your next big season. Keep inventory, orders, and demand planning in one place.")}</p><div className="login-feature"><TrendingUp size={24}/><div><strong>{t("Decisions grounded in your sales")}</strong><span>{t("Discover patterns. Anticipate demand. Order with confidence.")}</span></div></div></div><div className="login-story-footer">{t("Made for the rhythm of Indian retail.")}</div></section><section className="login-form-section"><div className="login-form"><div className="login-language"><LanguageSelector id="login-language"/></div><span className="eyebrow muted">{t("YOUR STORE STARTS HERE")}</span><h2>{t("Welcome back")}</h2><p className="muted">{t("Sign in to your inventory workspace.")}</p><form onSubmit={handleSubmit(async (values) => {
            setError('');
            try {
                await api('auth/login', { method: 'POST', body: JSON.stringify(values) });
                await refresh();
                router.replace('/dashboard');
                router.refresh();
            }
            catch (e) {
                setError((e as Error).message);
            }
        })}><label className="field">{t("Email address")}<input className="input" type="email" autoComplete="username" aria-invalid={!!errors.email} aria-describedby={errors.email ? 'login-email-error' : undefined} placeholder={t("you@store.com")} {...register('email')}/>{errors.email && <span id="login-email-error" className="field-error" role="alert">{t(errors.email.message)}</span>}</label><label className="field">{t("Password")}<div className="password-field"><input className="input" type={visible ? 'text' : 'password'} autoComplete="current-password" aria-invalid={!!errors.password} aria-describedby={errors.password ? 'login-password-error' : undefined} placeholder={t("Enter your password")} {...register('password')}/><button type="button" aria-label={t(visible ? 'Hide password' : 'Show password')} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div>{errors.password && <span id="login-password-error" className="field-error" role="alert">{t(errors.password.message)}</span>}</label><label className="checkbox-label"><input type="checkbox" {...register('rememberMe')}/>{t("Remember me for 30 days")}</label>{error && <p className="form-error" role="alert">{t(error)}</p>}<button className="button button-primary login-submit" aria-label={t("Sign in")} aria-busy={isSubmitting} disabled={isSubmitting}>{isSubmitting ? <Loader2 className="animate-spin" size={18}/> : <>{t("Sign in ")}<ArrowRight size={18}/></>}</button></form><p className="login-help">{t("Need access? Contact your store administrator.")}</p><div className="login-secure"><ShieldCheck size={16}/>{t("Secure access for your team")}</div></div><div className="login-copyright">© {new Date().getFullYear()}{t(" Stockwise")}</div></section></main>;
}
