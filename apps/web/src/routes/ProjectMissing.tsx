import { Link } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { MainNav } from '../components/MainNav';

export function ProjectMissing({ id }: { id: string }) {
  return (
    <AppLayout title="项目不存在" nav={<MainNav />}>
      <p className="empty">
        找不到项目 <code>{id}</code>。
      </p>
      <Link to="/" className="btn btn--primary">
        回到项目列表
      </Link>
    </AppLayout>
  );
}
