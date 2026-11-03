import type { Metadata } from 'next';
import { RequireRole } from '@/components/RequireRole';
import { DashboardOverview } from './DashboardOverview';

export const metadata: Metadata = { title: 'Tổng quan quản lý', robots: { index: false, follow: false } };

export default function DashboardPage() {
  return <RequireRole allow={['Author', 'Admin']}><DashboardOverview /></RequireRole>;
}
