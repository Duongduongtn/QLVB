import { createBrowserRouter, Navigate, useParams } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { LoginPage } from './pages/LoginPage'
import { CongVanDiPage } from './pages/CongVanDiPage'
import { SoanCongVanPage } from './pages/SoanCongVanPage'
import { CongVanDenPage } from './pages/CongVanDenPage'
import { VaoSoCongVanDenPage } from './pages/VaoSoCongVanDenPage'
import { TaoHoSoKyPage } from './pages/TaoHoSoKyPage'
import { ViecCuaToiPage } from './pages/ViecCuaToiPage'
import { DanhBaPage } from './pages/DanhBaPage'
import { MocChuKyPage } from './pages/MocChuKyPage'
import { TagPage } from './pages/TagPage'
import { TimKiemPage } from './pages/TimKiemPage'
import { CauHinhPage } from './pages/CauHinhPage'
import { BaoCaoPage } from './pages/BaoCaoPage'
import { AuditLogPage } from './pages/AuditLogPage'
import { ThungRacPage } from './pages/ThungRacPage'
import { DoiMatKhauPage } from './pages/DoiMatKhauPage'
import { PhienDangNhapPage } from './pages/PhienDangNhapPage'
import { TachNenPage } from './pages/TachNenPage'
import { BaoCaoTuyChinhPage } from './pages/BaoCaoTuyChinhPage'

// Link cũ /cong-van-di/:id → mở drawer trên list bằng ?cv=
function RedirectCv({ to }: { to: string }) {
  const { id } = useParams()
  return <Navigate to={`${to}?cv=${id ?? ''}`} replace />
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/cong-van-di" replace /> },
      { path: 'viec-cua-toi', element: <ViecCuaToiPage /> },
      { path: 'cong-van-di', element: <CongVanDiPage /> },
      { path: 'cong-van-di/soan', element: <SoanCongVanPage /> },
      { path: 'cong-van-di/:id', element: <RedirectCv to="/cong-van-di" /> },
      { path: 'cong-van-den', element: <CongVanDenPage /> },
      { path: 'cong-van-den/vao-so', element: <VaoSoCongVanDenPage /> },
      { path: 'cong-van-den/:id', element: <RedirectCv to="/cong-van-den" /> },
      { path: 'ho-so-ky/tao', element: <TaoHoSoKyPage /> },
      { path: 'danh-ba', element: <DanhBaPage /> },
      { path: 'moc-chu-ky/upload', element: <TachNenPage /> },
      { path: 'moc-chu-ky/:tab', element: <MocChuKyPage /> },
      { path: 'tag', element: <TagPage /> },
      { path: 'tim-kiem', element: <TimKiemPage /> },
      { path: 'cau-hinh', element: <CauHinhPage /> },
      { path: 'nguoi-dung', element: <Navigate to="/cau-hinh?tab=nguoi-dung" replace /> },
      { path: 'bao-cao', element: <BaoCaoPage /> },
      { path: 'bao-cao/tuy-chinh', element: <BaoCaoTuyChinhPage /> },
      { path: 'audit-log', element: <AuditLogPage /> },
      { path: 'thung-rac', element: <ThungRacPage /> },
      { path: 'doi-mat-khau', element: <DoiMatKhauPage /> },
      { path: 'phien-dang-nhap', element: <PhienDangNhapPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/cong-van-di" replace /> },
])
