import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ role: 'Guest' }));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: Record<string, unknown> & { href: string; children?: unknown }) =>
    createElement('a', { href, ...props }, children as never),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/recipes',
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('@/lib/auth', () => ({
  useSession: () => ({ user: { role: mocks.role } }),
}));

import { Navbar } from './Navbar';

function renderNavbar(role: string) {
  mocks.role = role;
  return renderToStaticMarkup(createElement(Navbar));
}

describe('Navbar recipe dashboard link', () => {
  it.each(['Author', 'Admin'])('shows the dashboard link for %s', (role) => {
    expect(renderNavbar(role)).toContain('Tổng quan');
  });

  it('hides the dashboard link for Guest', () => {
    expect(renderNavbar('Guest')).not.toContain('Tổng quan');
  });
});
