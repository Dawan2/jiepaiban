import { Link } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { MainNav } from '../components/MainNav';

export function NotFoundPage() {
  return (
    <AppLayout title="页面不存在" nav={<MainNav />}>
      <p className="empty">该地址没有对应页面。</p>
      <Link to="/" className="btn btn--primary">
        回到项目列表
      </Link>
    </AppLayout>
  );
}
