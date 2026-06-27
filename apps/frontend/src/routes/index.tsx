import { createFileRoute, Link } from '@tanstack/react-router';
import { FileText, Send, Contact } from 'lucide-react';

import { PageHeader, SectionCard } from '~/components/ui';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'QLCV' }, { label: 'Trang chủ' }]}
        title="Trang chủ"
        subhead="Hệ thống Quản lý Công văn và Ký số · Thành Đạt"
      />
      <div
        className="grid"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}
      >
        <SectionCard title="Bắt đầu nhanh">
          <div className="flex flex-col" style={{ gap: 10 }}>
            <Link to="/cong-van-di" className="btn-secondary" style={{ justifyContent: 'flex-start' }}>
              <Send size={16} /> Sổ công văn đi
            </Link>
            <Link
              to="/cong-van-di/soan"
              className="btn-secondary"
              style={{ justifyContent: 'flex-start' }}
            >
              <FileText size={16} /> Soạn công văn mới
            </Link>
            <Link to="/danh-ba" className="btn-secondary" style={{ justifyContent: 'flex-start' }}>
              <Contact size={16} /> Danh bạ nơi nhận
            </Link>
          </div>
        </SectionCard>
      </div>
    </>
  );
}
