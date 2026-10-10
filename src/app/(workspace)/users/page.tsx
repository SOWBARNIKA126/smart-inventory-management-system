'use client';
import {TableScroll} from '@/components/shared';
import {useI18n} from '@/components/language-provider';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, ShieldCheck } from 'lucide-react';
import { toast } from '@/lib/i18n/toast';
import { useResource } from '@/hooks/use-resource';
import {api} from '@/lib/client';
import { PageHeading, Panel, Status, Loading, ErrorState, Empty } from '@/components/shared';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Pager } from '@/components/operations/shared';
type User = {
    id: string;
    name: string;
    email: string;
    role: 'ADMIN' | 'MANAGER' | 'STAFF';
    isActive: boolean;
    createdAt: string;
};
const schema = z.object({ name: z.string().min(2), email: z.string().email(), role: z.enum(['ADMIN', 'MANAGER', 'STAFF']), password: z.string().max(72).refine(v => v === '' || v.length >= 10, 'Use at least 10 characters'), isActive: z.boolean() });
type Form = z.infer<typeof schema>;
export default function Users() {
    const {t, date} = useI18n(); const [page, setPage] = useState(1); const [search, setSearch] = useState(''); const [open, setOpen] = useState(false); const [selected, setSelected] = useState<User | null>(null); const { data, loading, error, refresh } = useResource<{
    items: User[];
    total: number;
}>(`users?q=${encodeURIComponent(search)}&page=${page}&pageSize=15`); const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) }); function edit(user: User | null) { setSelected(user); reset({ name: user?.name || '', email: user?.email || '', role: user?.role || 'STAFF', password: '', isActive: user?.isActive ?? true }); setOpen(true); } return <><PageHeading title={t("Team members")} description={t("Manage access and responsibilities across your store.")}><button className="button button-primary" onClick={() => edit(null)}><Plus size={16}/>{t("Add user")}</button></PageHeading><div className="insight-card"><h3><ShieldCheck size={17}/>{t("The right access for each role")}</h3><p>{t("Admins manage everything. Managers handle daily operations, forecasts, and reports. Staff can view products and inventory, process orders, and receive or issue stock.")}</p></div><div className="toolbar"><input className="input" placeholder={t("Search by name or email…")} aria-label={t("Search users")} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}/></div>{loading ? <Loading /> : error ? <ErrorState error={error} retry={refresh}/> : <Panel title={t("Your team")} description={t("{0} team members", [data?.total || 0])}><TableScroll className="table-wrap"><table className="data-table"><thead><tr><th>{t("NAME")}</th><th>{t("EMAIL")}</th><th>{t("ROLE")}</th><th>{t("STATUS")}</th><th>{t("ADDED")}</th><th>{t("ACTIONS")}</th></tr></thead><tbody>{data?.items.map(user => <tr key={user.id}><td><strong>{user.name}</strong></td><td>{user.email}</td><td><Status value={user.role}/></td><td><Status value={user.isActive ? 'ACTIVE' : 'DISCONTINUED'}/></td><td>{date(user.createdAt)}</td><td><button className="button button-secondary button-small" onClick={() => edit(user)}><Pencil size={13}/>{t("Edit")}</button></td></tr>)}</tbody></table>{!data?.items.length && <Empty />}</TableScroll><Pager page={page} total={data?.total || 0} pageSize={15} onChange={setPage}/></Panel>}<Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>{selected ? t('Edit team member') : t('Add a team member')}</DialogTitle><DialogDescription>{t("Role changes and disabling users revoke their existing sessions.")}</DialogDescription></DialogHeader><form onSubmit={handleSubmit(async (values) => { if (!selected && !values.password) {
    setError('password', { message: 'A password is required' });
    return;
} try {
    await api(`users${selected ? `/${selected.id}` : ''}`, { method: selected ? 'PATCH' : 'POST', body: JSON.stringify({ ...values, password: values.password || undefined }) });
    toast.success(selected ? 'User updated' : 'User added');
    setOpen(false);
    refresh();
}
catch (e) {
    toast.error((e as Error).message);
} })}><div className="form-grid">{(['name', 'email', 'password'] as const).map(key => <label className="field" key={key}>{key === 'password' && selected ? t('New password (optional)') : t(key.charAt(0).toUpperCase() + key.slice(1))}<input className="input" type={key === 'password' ? 'password' : key === 'email' ? 'email' : 'text'} autoComplete={key === 'password' ? 'new-password' : 'off'} {...register(key)} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `user-${key}-error` : undefined}/>{errors[key] && <span id={`user-${key}-error`} className="field-error" role="alert">{t(errors[key]?.message)}</span>}</label>)}<label className="field">{t("Role")}<select className="select" {...register('role')}>{['STAFF', 'MANAGER', 'ADMIN'].map(role => <option key={role} value={role}>{t(role)}</option>)}</select></label><label className="checkbox-label"><input type="checkbox" {...register('isActive')}/>{t("Active account")}</label></div><div className="dialog-footer"><button className="button button-secondary" type="button" onClick={() => setOpen(false)}>{t("Cancel")}</button><button className="button button-primary" disabled={isSubmitting}>{isSubmitting ? t('Saving…') : t('Save user')}</button></div></form></DialogContent></Dialog></>; }
