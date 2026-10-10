import {WorkspaceShell} from '@/components/workspace-shell';
import {currentUser} from '@/lib/auth';
import {redirect} from 'next/navigation';
export default async function Layout({children}:{children:React.ReactNode}){if(!await currentUser())redirect('/login');return <WorkspaceShell>{children}</WorkspaceShell>}
