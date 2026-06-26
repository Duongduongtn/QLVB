import {
  Home,
  Send,
  Inbox,
  Contact,
  Stamp,
  Tag,
  Search,
  Settings,
  BarChart3,
  ScrollText,
  Trash2,
  type LucideIcon,
} from 'lucide-react'

export interface NavSub {
  label: string
  to: string
}

export interface NavEntry {
  label: string
  to: string
  icon: LucideIcon
  badge?: number
  subs?: NavSub[]
}

export interface NavGroup {
  title: string
  items: NavEntry[]
}

export const navGroups: NavGroup[] = [
  {
    title: 'Công việc',
    items: [
      { label: 'Việc của tôi', to: '/viec-cua-toi', icon: Home, badge: 7 },
      { label: 'Công văn đi', to: '/cong-van-di', icon: Send },
      { label: 'Công văn đến', to: '/cong-van-den', icon: Inbox, badge: 3 },
    ],
  },
  {
    title: 'Tra cứu',
    items: [
      { label: 'Tìm kiếm', to: '/tim-kiem', icon: Search },
      { label: 'Tag', to: '/tag', icon: Tag },
    ],
  },
  {
    title: 'Danh mục',
    items: [
      { label: 'Danh bạ', to: '/danh-ba', icon: Contact },
      {
        label: 'Mộc & Chữ ký',
        to: '/moc-chu-ky/moc',
        icon: Stamp,
        subs: [
          { label: 'Mộc', to: '/moc-chu-ky/moc' },
          { label: 'Chữ ký', to: '/moc-chu-ky/chu-ky' },
          { label: 'Hồ sơ ký', to: '/moc-chu-ky/ho-so-ky' },
        ],
      },
    ],
  },
  {
    title: 'Hệ thống',
    items: [
      { label: 'Báo cáo', to: '/bao-cao', icon: BarChart3 },
      { label: 'Cấu hình', to: '/cau-hinh', icon: Settings },
      { label: 'Audit log', to: '/audit-log', icon: ScrollText },
      { label: 'Thùng rác', to: '/thung-rac', icon: Trash2 },
    ],
  },
]
